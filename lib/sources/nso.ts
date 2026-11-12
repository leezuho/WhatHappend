import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { NSO_FIELDS, NSO_SINCE, VI_MONTHS, nsoId, type NsoField } from "@/config/nso";
import { callsLeft } from "@/lib/ai/budget";
import { NSO_REPORTS_KEY, readReports, ymKey, type ReportRecords } from "@/lib/data/nso";
import { aiStatus } from "@/lib/ai/config";
import { generateJson } from "@/lib/ai/provider";
import { fetchJson, htmlText, viNumber } from "./http";
import { upsertSeries } from "./store";
import { DAY, HOUR, MINUTE, type Source } from "./types";

// Vietnam's monthly figures from the General Statistics Office (Cục Thống kê),
// read by AI (BR-22, LLDD 02 §7.6, LLDD 05 §3e). The office has no API; its
// monthly socio-economic report is a WordPress post on nso.gov.vn, out on the
// 3rd to 6th of the next month. The fast model points at each figure (config/nso.ts)
// with the clause it comes from; a figure is kept only if that clause is in the
// report word for word, contains the number, names the measure and (for a
// monthly figure) the month, and the value is in range. Reports are read back
// to NSO_SINCE, a few per run, so the panel has a history.

const API = "https://www.nso.gov.vn/wp-json/wp/v2/posts";
/** "Công nghiệp": every monthly report is filed under it (with others), which keeps the listing short. */
const CATEGORY = 84;
const PENDING_KEY = "nso:pending";
/** Reports read per run; the rest wait for the next run (10 minutes later while any are left). */
const PER_RUN = 3;
/** A report that fails this many times is left alone (logged), so one odd report does not block the others. */
const MAX_ATTEMPTS = 3;
const MAX_CHARS = 60_000;
/** Exports − imports may differ from the stated balance by rounding (two decimals each). */
const BALANCE_TOLERANCE = 0.05;

const ListItem = z.object({ id: z.number(), date: z.string(), link: z.string(), title: z.object({ rendered: z.string() }) });
const Post = z.object({ id: z.number(), content: z.object({ rendered: z.string() }) });

const Out = z.object({
  values: z.array(z.object({ key: z.string(), raw: z.string().nullable(), neg: z.boolean(), quote: z.string().nullable() })),
});
export type NsoPick = z.infer<typeof Out>["values"][number];

export interface ReportRef {
  id: number;
  link: string;
  title: string;
  year: number;
  /** 1–12. */
  month: number;
  /** Publication date, YYYY-MM-DD (Vietnam time, as WordPress gives it). */
  published: string;
}


/** Text as compared: composed Unicode, no soft hyphens, single spaces. */
export function normText(s: string): string {
  return s.normalize("NFC").replace(/­/g, "").replace(/\s+/g, " ").trim();
}

/** The reports capitalise month names ("tháng Mười", "tháng Mười Một"/"Mười một"); "8 tháng năm 2026" is not May. */
const monthName = (i: number) => VI_MONTHS[i].replace(/ (\p{L})/u, (_, c: string) => `\\s+[${c}${c.toLowerCase()}]`);
const MONTH_IN_TITLE = new RegExp(`tháng (${VI_MONTHS.map((_, i) => i).sort((a, b) => VI_MONTHS[b].length - VI_MONTHS[a].length).map(monthName).join("|")})(?![\\p{L}])`, "u");
const QUARTERS: Record<string, number> = { I: 3, II: 6, III: 9, IV: 12 };

/** "Báo cáo tình hình kinh tế – xã hội tháng Mười và 10 tháng năm 2026" → 2026-10; "… quý IV và năm 2025" → 2025-12. null for any other post. */
export function reportMonth(rawTitle: string): { year: number; month: number } | null {
  const t = normText(htmlText(rawTitle));
  if (!/^báo cáo tình hình kinh tế\s*[–-]\s*xã hội(?![\p{L}])/iu.test(t)) return null;
  const year = [...t.matchAll(/năm (\d{4})/g)].pop()?.[1];
  if (!year) return null;
  const q = /quý ([IV]+)(?![\p{L}])/iu.exec(t);
  if (q && QUARTERS[q[1].toUpperCase()]) return { year: Number(year), month: QUARTERS[q[1].toUpperCase()] };
  const m = MONTH_IN_TITLE.exec(t);
  if (!m) return null;
  const month = VI_MONTHS.findIndex((n) => n.toLowerCase() === m[1].replace(/\s+/g, " ").toLowerCase()) + 1;
  return month ? { year: Number(year), month } : null;
}

/**
 * "tháng Mười", "tháng 10" or "tháng 10/2026" for October 2026, but not "tháng Mười Một", "mười tháng" (ten months) nor
 * "tháng 10/2025" (CPI is also compared with "tháng 12/2025", the previous December).
 */
export function monthPattern(year: number, month: number): RegExp {
  const notLonger = month === 10 ? "(?!\\s+[MmHh](?:ột|ai)(?![\\p{L}]))" : "";
  return new RegExp(`[Tt]háng\\s+(?:${monthName(month - 1)}${notLonger}(?![\\p{L}])|0?${month}(?:/${year})?(?![\\d/]))`, "u");
}

const NO_MONTH = "sentence does not name the month";
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const DIRECTION = /(tăng|giảm|xuất siêu|nhập siêu)/giu;

/** Where the report's sentence holding position `at` starts: after the last ". " before it. */
function sentenceStart(text: string, at: number): number {
  const dot = text.lastIndexOf(". ", at - 1);
  return dot < 0 ? 0 : dot + 2;
}

/**
 * Check one figure the model pointed at against the report's text (normalized). The quote must be in the text and hold
 * the number; the sentence up to the quote's end must name the measure (and, for a monthly figure, the month); the
 * words after the number must say what it is compared with. Returns the signed value, or why it is rejected
 * (`reason: null` = the model gave nothing, which is not an error).
 */
export function checkPick(f: NsoField, p: NsoPick, text: string, period: { year: number; month: number }, anyMonth = false): { value: number } | { reason: string | null } {
  const { year, month } = period;
  if (p.raw === null || !p.raw.trim()) return { reason: null };
  if (f.scope === "quarter" && month % 3 !== 0) return { reason: "quarter figure in a month report" };
  const raw = normText(p.raw).replace(/\s*%$/, "").replace(/^[-−+]/, "");
  if (!/^\d{1,3}(?:\.\d{3})*(?:,\d+)?$|^\d+(?:,\d+)?$/.test(raw)) return { reason: `not a number as printed: "${p.raw}"` };
  const quote = p.quote ? normText(p.quote) : "";
  if (!quote) return { reason: "no quote" };
  const qAt = text.indexOf(quote);
  if (qAt < 0) return { reason: "quote not in the report" };
  const hit = new RegExp(`(?<![\\d.,])${escapeRe(raw)}(?!\\d|[.,]\\d)`).exec(quote);
  if (!hit) return { reason: `quote does not contain ${raw}` };
  const numAt = qAt + hit.index;
  const numEnd = numAt + raw.length;
  const from = sentenceStart(text, qAt);
  const context = text.slice(from, qAt + quote.length);
  const missingWord = f.must.find((re) => !re.test(context));
  if (missingWord) return { reason: `sentence does not mention ${missingWord.source}` };
  if (f.scope === "month" && !anyMonth && !monthPattern(year, month).test(context)) return { reason: NO_MONTH };
  if (f.after) {
    // The comparison is named right after the number ("tăng 5,09% so với cùng kỳ năm trước"), or before it in the
    // same clause ("So với cùng kỳ năm trước, CPI tháng Mười Hai tăng 3,48%"); "up to the next or previous number" keeps
    // it from borrowing the comparison of a neighbouring figure.
    const tail = text.slice(numEnd, numEnd + 120).split(/\d/)[0];
    const head = text.slice(from, numAt).split(/\d/).pop() ?? "";
    if (!f.after.test(tail) && !f.after.test(head)) return { reason: `not compared with ${f.after.source}` };
  }

  let value = viNumber(raw);
  if (!Number.isFinite(value)) return { reason: `unreadable number "${raw}"` };
  if (f.min < 0) {
    // The nearest direction word before the number settles the sign; the model's flag only when there is none.
    const before = [...text.slice(Math.max(from, numAt - 80), numAt).matchAll(DIRECTION)].pop()?.[1].toLowerCase();
    const neg = before ? before === "giảm" || before === "nhập siêu" : p.neg;
    if (before && neg !== p.neg) return { reason: `sign: the text says "${before}"` };
    if (neg) value = -value;
  }
  if (value < f.min || value > f.max) return { reason: `${value} outside ${f.min}…${f.max}` };
  return { value };
}

/** Timestamp a field's value is stored at: the first of the report's month, or of the quarter for GDP. */
export function fieldTs(f: NsoField, year: number, month: number): number {
  return f.key === "GDP_YOY" ? Date.UTC(year, month - 3, 1) : Date.UTC(year, month - 1, 1);
}

/**
 * Every pick checked. Exports, imports and the balance must add up, or all three are dropped. Imports may come from a
 * sentence that does not repeat the month ("Nhập khẩu hàng hóa đạt 57,36 tỷ USD", right after the month's exports):
 * then exports − imports = balance, both named for the month, is what ties it to the month.
 */
export function checkReport(picks: NsoPick[], text: string, period: { year: number; month: number }) {
  const values: Record<string, number> = {};
  const dropped: Record<string, string> = {};
  const missing: string[] = [];
  for (const f of NSO_FIELDS) {
    const p = picks.find((x) => x.key === f.key);
    if (!p) {
      missing.push(f.key);
      continue;
    }
    const r = checkPick(f, p, text, period);
    if ("value" in r) values[f.key] = r.value;
    else if (r.reason === null) missing.push(f.key);
    else dropped[f.key] = r.reason;
  }
  const imports = NSO_FIELDS.find((f) => f.key === "IMPORTS")!;
  const importsPick = picks.find((x) => x.key === "IMPORTS");
  if (dropped.IMPORTS === NO_MONTH && importsPick && values.EXPORTS !== undefined && values.TRADE_BAL !== undefined) {
    const r = checkPick(imports, importsPick, text, period, true);
    if ("value" in r && Math.abs(values.EXPORTS - r.value - values.TRADE_BAL) <= BALANCE_TOLERANCE) {
      values.IMPORTS = r.value;
      delete dropped.IMPORTS;
    }
  }
  const { EXPORTS: x, IMPORTS: m, TRADE_BAL: b } = values;
  const derived: string[] = [];
  if (x !== undefined && m !== undefined && b !== undefined && Math.abs(x - m - b) > BALANCE_TOLERANCE) {
    for (const k of ["EXPORTS", "IMPORTS", "TRADE_BAL"]) {
      delete values[k];
      dropped[k] = `exports − imports = ${(x - m).toFixed(2)}, balance ${b}`;
    }
  } else if (x !== undefined && m !== undefined && b === undefined) {
    // January's report gives the balance once, for the month and the year to date alike, without naming the month.
    values.TRADE_BAL = Math.round((x - m) * 100) / 100;
    derived.push("TRADE_BAL");
    delete dropped.TRADE_BAL;
  }
  return { values, dropped, missing: missing.filter((k) => values[k] === undefined), derived };
}

export const NSO_SYSTEM = `You read the monthly socio-economic report of Vietnam's General Statistics Office (Cục Thống kê) and point at the figures asked for. The report is in Vietnamese; numbers use Vietnamese notation: comma for decimals, dot for thousands ("64,67", "1.010,55").

Return one entry per field asked, with:
- key: the field's key.
- raw: the number exactly as printed, digits and separators only, without sign, % or unit (e.g. "51,4"); null when the report does not give this figure for the period asked.
- neg: true when the figure is a fall ("giảm") or a deficit ("nhập siêu"), else false.
- quote: a span of the report copied character for character, from the start of the clause that names the measure and its period through raw and what it is compared with (under 400 characters; e.g. "Xuất khẩu hàng hóa tháng Mười đạt 64,67 tỷ USD, tăng 8,7% so với tháng trước và tăng 51,4% so với cùng kỳ năm trước" for the change on a year earlier); null when raw is null.

Take each figure for exactly the period asked: the report's month alone, the year to date, or the quarter. Never put another month's, the quarter's or the year-to-date figure in its place, never a sub-component (a sector, a region, a product group), never compute, convert or round. When a figure is not there, return null.`;

export function nsoUserPrompt(ref: ReportRef, text: string): string {
  const monthName = `tháng ${VI_MONTHS[ref.month - 1]} năm ${ref.year}`;
  const quarterEnd = ref.month % 3 === 0;
  const fields = NSO_FIELDS.filter((f) => f.scope !== "quarter" || quarterEnd).map((f) => ({
    key: f.key,
    period: f.scope === "month" ? `the month: ${monthName}` : f.scope === "ytd" ? `January to ${monthName}` : `the quarter ending ${monthName}`,
    ask: f.ask,
    wording: f.hint.replace("<tháng>", VI_MONTHS[ref.month - 1]),
  }));
  return JSON.stringify({ report: ref.title, month: `${ref.year}-${String(ref.month).padStart(2, "0")} (${monthName})`, fields, text });
}

function kvSet(db: DatabaseSync, key: string, value: string, now: number) {
  db.prepare("INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(key, value, now);
}

function pendingCount(db: DatabaseSync): number {
  const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(PENDING_KEY) as { value: string | null } | undefined;
  return Number(row?.value ?? 1);
}

/** Reports still to read, newest first: never read, or failed fewer than MAX_ATTEMPTS times. */
export function pendingReports(refs: ReportRef[], records: ReportRecords): ReportRef[] {
  return refs.filter((r) => {
    const rec = records[ymKey(r.year, r.month)];
    return !rec || (rec.id !== r.id ? true : rec.error !== undefined && (rec.attempts ?? 1) < MAX_ATTEMPTS);
  });
}

async function listReports(): Promise<ReportRef[]> {
  const after = `${NSO_SINCE.year}-${String(NSO_SINCE.month).padStart(2, "0")}-01T00:00:00`;
  const byMonth = new Map<string, ReportRef>();
  for (let page = 1; page <= 5; page++) {
    const url = `${API}?categories=${CATEGORY}&per_page=100&page=${page}&after=${after}&_fields=id,date,link,title`;
    const items = await fetchJson(url, z.array(ListItem), { timeoutMs: 30_000 });
    for (const it of items) {
      const ym = reportMonth(it.title.rendered);
      if (!ym || ym.year * 12 + ym.month < NSO_SINCE.year * 12 + NSO_SINCE.month) continue;
      // Published within ~10 weeks after the month ends; anything else is a misread title.
      const pub = Date.parse(`${it.date.slice(0, 10)}T00:00:00Z`);
      const lag = pub - Date.UTC(ym.year, ym.month, 1);
      if (!(lag >= -2 * DAY && lag <= 70 * DAY)) continue;
      const ref: ReportRef = { id: it.id, link: it.link, title: normText(htmlText(it.title.rendered)), ...ym, published: it.date.slice(0, 10) };
      const prev = byMonth.get(ymKey(ym.year, ym.month));
      if (!prev || ref.published > prev.published) byMonth.set(ymKey(ym.year, ym.month), ref);
    }
    if (items.length < 100) break;
  }
  return [...byMonth.values()].sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
}

export const nso: Source = {
  id: "nso",
  ...SOURCE_META.nso,
  isDue(now, status, db) {
    if (!status) return true;
    if (!status.ok) return now - status.last_run >= HOUR;
    return now - status.last_run >= (pendingCount(db) > 0 ? 10 * MINUTE : SOURCE_META.nso.intervalMs);
  },
  async run({ db, log }) {
    const ai = aiStatus();
    if (!ai.ok) throw new Error(`AI not configured: ${ai.reason}`);
    const now = Date.now();
    const refs = await listReports();
    if (!refs.length) throw new Error("no monthly report found on nso.gov.vn (listing or titles changed)");
    const newest = refs[0];
    // The report for month M is out by the 6th of M+1, so the newest is never older than about 70 days.
    if (now - Date.UTC(newest.year, newest.month, 1) > 70 * DAY) throw new Error(`newest report found is for ${ymKey(newest.year, newest.month)}`);

    const records = readReports(db);
    const pending = pendingReports(refs, records);
    let written = 0;
    let failed = 0;
    let done = 0;
    for (const ref of pending.slice(0, PER_RUN)) {
      if (callsLeft(db, ai.config, "fast", now) < 1) {
        log("no fast-model calls left today; the rest waits");
        break;
      }
      const key = ymKey(ref.year, ref.month);
      const prev = records[key]?.id === ref.id ? records[key] : undefined;
      try {
        const post = await fetchJson(`${API}/${ref.id}?_fields=id,content`, Post, { timeoutMs: 30_000 });
        const text = normText(htmlText(post.content.rendered)).slice(0, MAX_CHARS);
        if (text.length < 2000) throw new Error(`report ${ref.id} has only ${text.length} characters`);
        const res = await generateJson({ tier: "fast", system: NSO_SYSTEM, user: nsoUserPrompt(ref, text), schema: Out, maxTokens: 8192, db });
        if (!res.data) throw new Error(`no figures from ${res.model} (stop_reason=${res.stopReason})`);
        const { values, dropped, missing, derived } = checkReport(res.data.values, text, ref);
        const kept = Object.keys(values);
        if (kept.length < 4) throw new Error(`only ${kept.length} figures passed the checks (${Object.entries(dropped).map(([k, r]) => `${k}: ${r}`).join("; ") || "none given"})`);
        for (const f of NSO_FIELDS) {
          if (values[f.key] !== undefined) written += upsertSeries(db, nsoId(f.key), "nso", [{ ts: fieldTs(f, ref.year, ref.month), value: values[f.key] }]);
        }
        records[key] = { id: ref.id, link: ref.link, title: ref.title, published: ref.published, model: res.model, at: now, kept, missing, dropped, ...(derived.length ? { derived } : {}) };
        done++;
        log(
          `${key}: ${kept.length} figures by ${res.model} (${text.length} chars, ${res.usage?.input ?? "?"} in / ${res.usage?.output ?? "?"} out tokens)` +
            (Object.keys(dropped).length ? `; dropped ${Object.entries(dropped).map(([k, r]) => `${k} (${r})`).join(", ")}` : ""),
        );
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        records[key] = { id: ref.id, link: ref.link, title: ref.title, published: ref.published, at: now, kept: [], missing: [], dropped: {}, attempts: (prev?.attempts ?? 0) + 1, error: msg };
        log(`${key}: ${msg}`);
      }
      kvSet(db, NSO_REPORTS_KEY, JSON.stringify(records), now);
    }
    const left = pendingReports(refs, records).length;
    kvSet(db, PENDING_KEY, String(left), now);
    if (left) log(`${left} reports left to read`);
    if (failed && !done) throw new Error(`${failed} report(s) failed; see the log`);
    return written;
  },
};
