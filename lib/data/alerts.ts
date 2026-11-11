import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { ALERTS } from "@/config/alerts";
import { SERIES } from "@/config/series";
import { STATUS_SERVICES } from "@/config/tech";
import { VN_BAND, VN_CENTRAL_RATE } from "@/config/vietnam";
import { fmtNumber, fmtSigned } from "@/lib/format";
import { getDict, intlLocale, type Locale } from "@/lib/i18n";
import type { Impact, ServiceStatus } from "@/lib/sources/cloudstatus";
import type { Outcome } from "@/lib/sources/polymarket";
import type { Regime } from "@/lib/signals/risk-regime";
import type { ChangeData } from "./changes";
import { getPoints } from "./series";
import { goldPremiumHistory, hanoiDay } from "./vietnam";

// Telegram alerts (TODO P1, BR-26, LLDD 03): what the worker sends to the
// phone. Two kinds:
//  - events, read from the change log (lib/data/changes.ts) after a cursor:
//    the risk regime flipping, a US release coming out off its forecast;
//  - conditions, evaluated on every run: Vietcombank near the State Bank's
//    ceiling, the SJC premium moving hard, a Polymarket market swinging,
//    an incident on a watched status page. A condition is sent when it
//    starts and not again until it has ended (crossed back past its "off"
//    line, or the incident closed).
// lib/sources/telegram.ts does the sending and keeps AlertState in `kv`.

export const ALERTS_STATE_KEY = "alerts:state";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Logged events older than this are not sent: the worker or Telegram was down, and the overview strip has them. */
const EVENT_MAX_AGE = 12 * HOUR;
/** Item lists (Polymarket, status pages) fetched longer ago than this can neither start nor end a condition. */
const ITEMS_FRESH = 2 * HOUR;
/** Vietcombank's rate is fetched hourly; older than this it says nothing about today. */
const VCB_FRESH = 3 * DAY;
/** A condition not evaluated for this long (its market left the list, a service is no longer watched) is forgotten. */
const FORGET_AFTER = 3 * DAY;
/** Telegram's limit is 4,096 characters a message; keep clear of it. */
const MAX_MESSAGE = 3800;

export interface AlertState {
  /** Highest `changes.id` already looked at. */
  cursor: number;
  /** Conditions in force, keyed, with the last time a run saw them on (or in between the lines). */
  active: Record<string, number>;
}

/** One condition as one run sees it: on (past the "on" line), off (back past the "off" line) or in between. */
export interface Check {
  key: string;
  state: "on" | "hold" | "off";
  /** The line sent when the condition starts (HTML). */
  html?: string;
}

/**
 * The checks of one kind of condition. `exhaustive`: every condition of this kind that is in force is listed, so an
 * active key under `prefix` that is missing has ended (a closed incident). Otherwise a missing key is just unknown.
 */
export interface CheckGroup {
  prefix: string;
  exhaustive: boolean;
  checks: Check[];
}

export function parseAlertState(value: string | null | undefined): AlertState | null {
  try {
    const v = JSON.parse(value ?? "") as Partial<AlertState>;
    if (!v || typeof v.cursor !== "number") return null;
    return { cursor: v.cursor, active: v.active && typeof v.active === "object" ? v.active : {} };
  } catch {
    return null;
  }
}

/** Escape text for Telegram's HTML mode. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const link = (url: string | null, text: string) => (url ? `<a href="${esc(url)}">${esc(text)}</a>` : esc(text));
const bold = (s: string) => `<b>${esc(s)}</b>`;

// ---------------------------------------------------------------- conditions

/** Vietcombank's USD sell rate within ALERTS.vcbCeilingPct of the top of the State Bank's band. */
export function vcbCheck(db: DatabaseSync, now: number, lang: Locale): CheckGroup | null {
  const central = getPoints(db, VN_CENTRAL_RATE).at(-1);
  const vcb = getPoints(db, SERIES.vcbUsd.id, now - VCB_FRESH).at(-1);
  if (!central || !vcb) return null;
  const ceiling = Math.round(central.value * (1 + VN_BAND));
  const pct = ((ceiling - vcb.value) / ceiling) * 100;
  const { on, off } = ALERTS.vcbCeilingPct;
  const state = pct < on ? "on" : pct >= off ? "off" : "hold";
  const v = fmtNumber(vcb.value, lang, 0);
  const c = fmtNumber(ceiling, lang, 0);
  const p = fmtNumber(pct, lang, 1);
  const html =
    lang === "vi"
      ? `${bold("Tỷ giá")}: Vietcombank bán ra ${v} ₫, cách trần biên độ ${p}% (trần ${c} ₫, dưới ${fmtNumber(on, lang, 0)}%)`
      : `${bold("Dollar")}: Vietcombank sells at ${v} ₫, ${p}% below the State Bank's ceiling (${c} ₫; alert under ${fmtNumber(on, lang, 0)}%)`;
  return { prefix: "vcb:", exhaustive: false, checks: [{ key: "vcb:ceiling", state, html }] };
}

/** The SJC bar's premium over world gold moved by ALERTS.sjcPremiumDay since the previous day with a price. */
export function sjcCheck(db: DatabaseSync, now: number, lang: Locale): CheckGroup | null {
  const rows = goldPremiumHistory(db, 15, now).filter((r) => r.premium !== null);
  const cur = rows.at(-1);
  const prev = rows.at(-2);
  // Only today's premium is news; on a day without a price the condition stays as it was.
  if (!cur || !prev || cur.ts !== hanoiDay(now)) return null;
  const d = cur.premium! - prev.premium!;
  const { on, off } = ALERTS.sjcPremiumDay;
  const mag = Math.abs(d);
  const dir = d >= 0 ? "up" : "down";
  const day = new Intl.DateTimeFormat(intlLocale(lang), { day: "numeric", month: "numeric", timeZone: "UTC" }).format(prev.ts);
  const n = (x: number) => fmtNumber(x, lang, 1);
  const html =
    lang === "vi"
      ? `${bold("Vàng SJC")}: chênh lệch so với giá thế giới ${d >= 0 ? "tăng" : "giảm"} ${n(mag)} triệu ₫/lượng so với ngày ${day}, từ ${n(prev.premium!)} ${d >= 0 ? "lên" : "xuống"} ${n(cur.premium!)} triệu (SJC bán ${n(cur.sjc)}, thế giới quy đổi ${n(cur.world!)})`
      :`${bold("SJC gold")}: premium over world gold ${d >= 0 ? "up" : "down"} ${n(mag)} million ₫/tael since ${day}, ${n(prev.premium!)} → ${n(cur.premium!)} million (SJC sells at ${n(cur.sjc)}, world gold ${n(cur.world!)})`;
  return {
    prefix: "sjc:",
    exhaustive: false,
    checks: [
      { key: `sjc:${dir}`, state: mag >= on ? "on" : mag < off ? "off" : "hold", html },
      { key: `sjc:${dir === "up" ? "down" : "up"}`, state: "off" },
    ],
  };
}

/** A geopolitics or economy market on Polymarket with an outcome that moved ALERTS.polymarketDay in 24 hours. */
export function polymarketCheck(db: DatabaseSync, now: number, lang: Locale): CheckGroup | null {
  const rows = db.prepare("SELECT id, title, title_vi, url, data, fetched_at FROM items WHERE kind = 'polymarket'").all() as {
    id: string;
    title: string;
    title_vi: string | null;
    url: string | null;
    data: string | null;
    fetched_at: number;
  }[];
  if (!rows.length || now - Math.max(...rows.map((r) => r.fetched_at)) > ITEMS_FRESH) return null;
  const { on, off } = ALERTS.polymarketDay;
  const moved = (o: Outcome, line: number) => o.change24h !== null && Math.abs(o.change24h) >= line;
  const checks = rows.map((r): Check => {
    const outcomes = (JSON.parse(r.data ?? "{}") as { outcomes?: Outcome[] }).outcomes ?? [];
    const big = outcomes.filter((o) => moved(o, on));
    const state = big.length ? "on" : outcomes.some((o) => moved(o, off)) ? "hold" : "off";
    const title = (lang === "vi" && r.title_vi) || r.title;
    const parts = big.map((o) => {
      const label = o.label === "Yes" && lang === "vi" ? "Có" : o.label;
      const pts = fmtSigned(o.change24h! * 100, lang, 0);
      return `${esc(label)} ${fmtNumber(o.prob * 100, lang, 0)}% (${pts} ${lang === "vi" ? "điểm trong 24 giờ" : "points in 24h"})`;
    });
    return { key: `pm:${r.id}`, state, html: `${bold("Polymarket")}: ${link(r.url, title)}: ${parts.join("; ")}` };
  });
  return { prefix: "pm:", exhaustive: false, checks };
}

const IMPACT_RANK: Record<Impact, number> = { none: 0, maintenance: 1, unknown: 2, minor: 3, major: 4, critical: 5 };

/** Open incidents at or above ALERTS.statusMinImpact on the watched status pages, one group per readable page. */
export function statusChecks(db: DatabaseSync, now: number, lang: Locale): CheckGroup[] {
  const rows = db.prepare("SELECT id, title, data, fetched_at FROM items WHERE kind = 'status'").all() as {
    id: string;
    title: string;
    data: string | null;
    fetched_at: number;
  }[];
  const min = IMPACT_RANK[ALERTS.statusMinImpact];
  const levels = getDict(lang).tech.levels;
  const groups: CheckGroup[] = [];
  for (const key of ALERTS.statusServices) {
    const row = rows.find((r) => r.id === key);
    if (!row || now - row.fetched_at > ITEMS_FRESH) continue;
    const s = JSON.parse(row.data ?? "{}") as ServiceStatus;
    // A page that could not be read this run says nothing about whether its incidents ended.
    if (!s.level) continue;
    const name = STATUS_SERVICES.find((x) => x.key === key)?.name ?? row.title;
    const checks = (s.incidents ?? [])
      .filter((i) => i.impact === "unknown" || IMPACT_RANK[i.impact] >= min)
      .map((i): Check => {
        const id = createHash("sha1").update(`${i.title}|${i.where ?? ""}`).digest("hex").slice(0, 12);
        const where = i.where ? ` (${esc(i.where)})` : "";
        const level = i.impact === "unknown" ? "" : `, ${esc(levels[i.impact].toLowerCase())}`;
        return {
          key: `status:${key}:${id}`,
          state: "on",
          html: `${bold(lang === "vi" ? `Sự cố ${name}` : `${name} incident`)}: ${link(i.url, i.title)}${where}${level}`,
        };
      });
    groups.push({ prefix: `status:${key}:`, exhaustive: true, checks });
  }
  return groups;
}

export function conditionGroups(db: DatabaseSync, now: number, lang: Locale): CheckGroup[] {
  return [vcbCheck(db, now, lang), sjcCheck(db, now, lang), polymarketCheck(db, now, lang), ...statusChecks(db, now, lang)].filter(
    (g): g is CheckGroup => g !== null,
  );
}

/** Which conditions just started, and what is in force after this run. */
export function stepConditions(prev: Record<string, number>, groups: CheckGroup[], now: number): { fired: Check[]; active: Record<string, number> } {
  const active = { ...prev };
  const fired: Check[] = [];
  for (const g of groups) {
    const seen = new Set<string>();
    for (const c of g.checks) {
      seen.add(c.key);
      if (c.state === "on") {
        if (!(c.key in active)) fired.push(c);
        active[c.key] = now;
      } else if (c.state === "hold") {
        if (c.key in active) active[c.key] = now;
      } else delete active[c.key];
    }
    if (g.exhaustive) for (const k of Object.keys(active)) if (k.startsWith(g.prefix) && !seen.has(k)) delete active[k];
  }
  for (const [k, at] of Object.entries(active)) if (now - at > FORGET_AFTER) delete active[k];
  return { fired, active };
}

// ---------------------------------------------------------------- events from the change log

function regimeLabel(r: Regime, lang: Locale): string {
  const t = getDict(lang).regime;
  return r === "risk-on" ? t.riskOn : r === "risk-off" ? t.riskOff : r === "neutral" ? t.neutral : t.unknown;
}

/** One logged change as an alert line, or null when it is not sent (a release that came in as forecast). */
export function eventLine(c: ChangeData, lang: Locale): string | null {
  const t = getDict(lang).whatsNew;
  if (c.kind === "regime") {
    const score = c.score === null ? "" : ` (${lang === "vi" ? "điểm" : "score"} ${fmtSigned(c.score, lang, 2)})`;
    return `${bold(lang === "vi" ? "Rủi ro" : "Risk")}: ${esc(t.regime.replace("{from}", regimeLabel(c.from, lang)).replace("{to}", regimeLabel(c.to, lang)))}${score}`;
  }
  if (c.kind === "release") {
    if (c.forecast === null || c.surprise === null || c.surprise === 0) return null;
    const text = t.release.replace("{event}", c.event).replace("{country}", c.country).replace("{actual}", c.actual).replace("{forecast}", c.forecast);
    const verdict = c.better === null ? "" : ` · ${c.better ? t.better : t.worse}`;
    return `${bold(lang === "vi" ? "Số liệu" : "Data")}: ${esc(text + verdict)}`;
  }
  return null;
}

/** Changes logged after `cursor` and within EVENT_MAX_AGE, as alert lines, with the new cursor. */
export function pendingEvents(db: DatabaseSync, cursor: number, now: number, lang: Locale): { lines: string[]; cursor: number } {
  const rows = db.prepare("SELECT id, at, data FROM changes WHERE id > ? ORDER BY id").all(cursor) as { id: number; at: number; data: string }[];
  const lines = rows.flatMap((r) => {
    if (now - r.at > EVENT_MAX_AGE) return [];
    const line = eventLine(JSON.parse(r.data) as ChangeData, lang);
    return line ? [line] : [];
  });
  return { lines, cursor: rows.length ? rows[rows.length - 1].id : cursor };
}

function maxChangeId(db: DatabaseSync): number {
  return (db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM changes").get() as { id: number }).id;
}

// ---------------------------------------------------------------- messages

/** Join lines into messages under Telegram's size limit. */
export function packMessages(header: string, lines: string[]): string[] {
  const out: string[] = [];
  let cur = header;
  for (const line of lines) {
    const next = `${cur}\n• ${line}`;
    if (next.length > MAX_MESSAGE && cur !== header) {
      out.push(cur);
      cur = `${header}\n• ${line}`;
    } else cur = next;
  }
  if (cur !== header) out.push(cur);
  return out;
}

function rulesText(lang: Locale): string {
  const a = ALERTS;
  const n = (x: number, d = 0) => fmtNumber(x, lang, d);
  const services = a.statusServices.map((k) => STATUS_SERVICES.find((s) => s.key === k)?.name ?? k).join(", ");
  const level = getDict(lang).tech.levels[a.statusMinImpact].toLowerCase();
  return lang === "vi"
    ? [
        "Sẽ báo khi:",
        "• trạng thái rủi ro đổi;",
        "• số liệu Mỹ vừa công bố lệch dự báo;",
        `• Vietcombank bán ra cách trần biên độ dưới ${n(a.vcbCeilingPct.on)}%;`,
        `• chênh lệch vàng SJC so với thế giới đổi từ ${n(a.sjcPremiumDay.on)} triệu ₫/lượng trong một ngày;`,
        `• một kèo Polymarket đổi từ ${n(a.polymarketDay.on * 100)} điểm % trong 24 giờ;`,
        `• ${services} báo sự cố từ mức "${level}" trở lên.`,
        "Mỗi điều kiện chỉ báo một lần cho tới khi nó hết.",
      ].join("\n")
    : [
        "Alerts are sent when:",
        "• the risk regime changes;",
        "• a US release comes out off its forecast;",
        `• Vietcombank's dollar sells within ${n(a.vcbCeilingPct.on)}% of the State Bank's ceiling;`,
        `• the SJC gold premium moves ${n(a.sjcPremiumDay.on)} million ₫/tael or more in a day;`,
        `• a Polymarket market moves ${n(a.polymarketDay.on * 100)} points or more in 24 hours;`,
        `• ${services} report an incident at "${level}" or worse.`,
        "Each condition is sent once until it ends.",
      ].join("\n");
}

/**
 * What to send this run and the state to keep. The first run (no state yet) sends a "switched on" message with the
 * rules and the conditions already in force, and skips the change log logged before it.
 */
export function planAlerts(
  db: DatabaseSync,
  prev: AlertState | null,
  now: number,
  lang: Locale = ALERTS.lang,
): { messages: string[]; next: AlertState; lines: number } {
  const groups = conditionGroups(db, now, lang);
  const header = bold("WhatHappend");
  if (!prev) {
    const { fired, active } = stepConditions({}, groups, now);
    const lines = fired.map((c) => c.html!);
    const intro = `${header}\n${lang === "vi" ? "Đã bật cảnh báo Telegram." : "Telegram alerts are on."}\n\n${esc(rulesText(lang))}`;
    const none = lang === "vi" ? "Hiện chưa có điều kiện nào." : "Nothing in force right now.";
    const inForce = lang === "vi" ? "Đang có:" : "In force now:";
    const one = lines.length ? `${intro}\n\n${inForce}\n${lines.map((l) => `• ${l}`).join("\n")}` : `${intro}\n\n${none}`;
    return {
      messages: one.length <= MAX_MESSAGE ? [one] : [intro, ...packMessages(`${header}\n${inForce}`, lines)],
      next: { cursor: maxChangeId(db), active },
      lines: lines.length,
    };
  }
  const events = pendingEvents(db, prev.cursor, now, lang);
  const { fired, active } = stepConditions(prev.active, groups, now);
  const lines = [...events.lines, ...fired.map((c) => c.html!)];
  return { messages: packMessages(header, lines), next: { cursor: events.cursor, active }, lines: lines.length };
}
