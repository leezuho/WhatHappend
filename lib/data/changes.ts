import type { DatabaseSync } from "node:sqlite";
import { SERIES, type SeriesKey } from "@/config/series";
import { KEV_WATCH } from "@/config/tech";
import type { CalendarData } from "@/lib/sources/calendar";
import type { Regime } from "@/lib/signals/risk-regime";
import { alertOf, findNotables } from "@/lib/signals/notable";
import { regimeFromDb } from "./regime";
import { tileOf } from "./series";
import { themeStates, type ThemeStatus } from "./themes";

// The change log behind the overview's "What's new since last time" strip
// (TODO P1, LLDD 04 §3, LLDD 03): every 15 minutes the worker reads the state
// of a few things a reader would want to hear about, compares it with the
// state it saved last time and logs what is new, with the time it noticed.
// The web only reads the log and filters it by the reader's last visit, kept
// in the browser. A later alert channel (Telegram) can read the same log.

export const CHANGES_STATE_KEY = "changes:state";
/** The regime's score, one point per day as the worker saw it (the badge recomputes history with today's data). */
export const REGIME_SCORE_ID = "calc:REGIME_SCORE";
export const CHANGES_KEEP_DAYS = 30;

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** The same thing logged again within this window is dropped: values hovering at a line would log on every run. */
const REPEAT_WINDOW: Record<ChangeKind, number> = {
  regime: DAY,
  theme: DAY,
  threshold: 3 * DAY,
  move: 20 * HOUR,
  release: CHANGES_KEEP_DAYS * DAY,
  kev: CHANGES_KEEP_DAYS * DAY,
};

export type ChangeKind = "regime" | "theme" | "threshold" | "move" | "release" | "kev";

export type ChangeData =
  | { kind: "regime"; from: Regime; to: Regime; score: number | null }
  | { kind: "theme"; id: string; from: ThemeStatus; to: ThemeStatus; heat: number | null }
  | { kind: "threshold"; key: SeriesKey; level: "warn" | "crit"; value: number; ts: number }
  | { kind: "move"; key: SeriesKey; horizon: "day" | "week"; z: number; change: number | null }
  | {
      kind: "release";
      id: string;
      event: string;
      country: string;
      actual: string;
      forecast: string | null;
      surprise: number | null;
      /** Better for the economy than forecast (more jobs, less inflation); null without a forecast. */
      better: boolean | null;
      ts: number;
    }
  | { kind: "kev"; id: string; vendor: string; product: string; title: string; url: string | null; ransomware: boolean };

export interface Change {
  /** De-duplication key within its kind: "brent:warn", "ai:cooling", "nvda:day:-", a CVE id. */
  key: string;
  data: ChangeData;
}

/** What one run sees, keyed so that "new" is a set difference. */
export interface Observed {
  regime: { regime: Regime; score: number | null };
  themes: Record<string, { status: ThemeStatus; heat: number | null }>;
  alerts: Record<string, { level: "warn" | "crit"; value: number; ts: number }>;
  /** "key:day:+" / "key:week:-" → the move. */
  moves: Record<string, { key: SeriesKey; horizon: "day" | "week"; z: number; change: number | null }>;
  releases: Record<string, Extract<ChangeData, { kind: "release" }>>;
  kev: Record<string, Extract<ChangeData, { kind: "kev" }>>;
}

/** The part of a run kept for the next one. */
export interface WatchState {
  regime: Regime;
  themes: Record<string, ThemeStatus>;
  alerts: Record<string, "warn" | "crit">;
  moves: string[];
  releases: string[];
  kev: string[];
}

export function stateOf(o: Observed): WatchState {
  return {
    regime: o.regime.regime,
    themes: Object.fromEntries(Object.entries(o.themes).map(([id, t]) => [id, t.status])),
    alerts: Object.fromEntries(Object.entries(o.alerts).map(([k, a]) => [k, a.level])),
    moves: Object.keys(o.moves),
    releases: Object.keys(o.releases),
    kev: Object.keys(o.kev),
  };
}

export function parseState(value: string | null | undefined): WatchState | null {
  try {
    const v = JSON.parse(value ?? "") as Partial<WatchState>;
    if (!v || typeof v.regime !== "string") return null;
    return { regime: v.regime, themes: v.themes ?? {}, alerts: v.alerts ?? {}, moves: v.moves ?? [], releases: v.releases ?? [], kev: v.kev ?? [] };
  } catch {
    return null;
  }
}

const isKevWatched = (vendor: string) => KEV_WATCH.some((w) => vendor.toLowerCase().startsWith(w.toLowerCase()));

export function observe(db: DatabaseSync, now = Date.now()): Observed {
  const r = regimeFromDb(db, now);
  const themes = Object.fromEntries(themeStates(db, now).map((t) => [t.def.id, { status: t.status, heat: t.heat }]));

  const alerts: Observed["alerts"] = {};
  for (const key of Object.keys(SERIES) as SeriesKey[]) {
    const tile = tileOf(db, key, now);
    const level = tile ? alertOf(SERIES[key], tile.value) : null;
    if (tile && level) alerts[key] = { level, value: tile.value, ts: tile.ts };
  }

  const moves: Observed["moves"] = {};
  for (const n of findNotables(db, now)) {
    for (const reason of n.reasons) {
      if (reason.kind !== "move" && reason.kind !== "week") continue;
      const horizon = reason.kind === "move" ? "day" : "week";
      const change = reason.kind === "week" ? reason.change : n.def.delta === "abs" ? n.data.change : n.data.changePct;
      moves[`${n.key}:${horizon}:${reason.z > 0 ? "+" : "-"}`] = { key: n.key, horizon, z: reason.z, change };
    }
  }

  const releases: Observed["releases"] = {};
  const cal = db.prepare("SELECT id, title, ts, data FROM items WHERE kind = 'calendar' AND ts BETWEEN ? AND ?").all(now - 2 * DAY, now) as {
    id: string;
    title: string;
    ts: number;
    data: string | null;
  }[];
  for (const row of cal) {
    const d = JSON.parse(row.data ?? "{}") as CalendarData;
    if (!d.actual) continue;
    const surprise = d.surprise ?? null;
    releases[row.id] = {
      kind: "release",
      id: row.id,
      event: row.title,
      country: d.country,
      actual: d.actual,
      forecast: d.forecast ?? null,
      surprise,
      better: surprise ? (surprise > 0) === (d.polarity === "up-good") : null,
      ts: row.ts,
    };
  }

  const kev: Observed["kev"] = {};
  const vulns = db.prepare("SELECT id, title, url, data FROM items WHERE kind = 'kev' AND ts >= ?").all(now - 14 * DAY) as {
    id: string;
    title: string;
    url: string | null;
    data: string | null;
  }[];
  for (const row of vulns) {
    const d = JSON.parse(row.data ?? "{}") as { vendor?: string; product?: string; ransomware?: boolean };
    if (!d.vendor || !isKevWatched(d.vendor)) continue;
    kev[row.id] = { kind: "kev", id: row.id, vendor: d.vendor, product: d.product ?? "", title: row.title, url: row.url, ransomware: !!d.ransomware };
  }

  return { regime: { regime: r.regime, score: r.score }, themes, alerts, moves, releases, kev };
}

/** What is new in `cur` since `prev`. Lapses (back below a line, a move fading) are not news. */
export function diffState(prev: WatchState, cur: Observed): Change[] {
  const out: Change[] = [];
  const { regime, score } = cur.regime;
  if (regime !== prev.regime && regime !== "unknown" && prev.regime !== "unknown") {
    out.push({ key: regime, data: { kind: "regime", from: prev.regime, to: regime, score } });
  }
  for (const [id, t] of Object.entries(cur.themes)) {
    const was = prev.themes[id];
    if (was && was !== t.status && was !== "unknown" && t.status !== "unknown") {
      out.push({ key: `${id}:${t.status}`, data: { kind: "theme", id, from: was, to: t.status, heat: t.heat } });
    }
  }
  for (const [key, a] of Object.entries(cur.alerts)) {
    const was = prev.alerts[key];
    if (!was || (was === "warn" && a.level === "crit")) {
      out.push({ key: `${key}:${a.level}`, data: { kind: "threshold", key: key as SeriesKey, level: a.level, value: a.value, ts: a.ts } });
    }
  }
  const before = new Set(prev.moves);
  for (const [sig, m] of Object.entries(cur.moves)) if (!before.has(sig)) out.push({ key: sig, data: { kind: "move", ...m } });
  const released = new Set(prev.releases);
  for (const [id, r] of Object.entries(cur.releases)) if (!released.has(id)) out.push({ key: id, data: r });
  const known = new Set(prev.kev);
  for (const [id, k] of Object.entries(cur.kev)) if (!known.has(id)) out.push({ key: id, data: k });
  return out;
}

/** Log `changes` not already logged within their kind's repeat window; returns how many were written. */
export function logChanges(db: DatabaseSync, changes: Change[], now: number): number {
  const seen = db.prepare("SELECT 1 FROM changes WHERE kind = ? AND key = ? AND at >= ? LIMIT 1");
  const ins = db.prepare("INSERT INTO changes (at, kind, key, data) VALUES (?, ?, ?, ?)");
  let n = 0;
  for (const c of changes) {
    if (seen.get(c.data.kind, c.key, now - REPEAT_WINDOW[c.data.kind])) continue;
    ins.run(now, c.data.kind, c.key, JSON.stringify(c.data));
    n++;
  }
  db.prepare("DELETE FROM changes WHERE at < ?").run(now - CHANGES_KEEP_DAYS * DAY);
  return n;
}

export interface ChangeRow {
  id: number;
  at: number;
  data: ChangeData;
}

/** Logged changes since `since`, newest first. */
export function readChanges(db: DatabaseSync, since: number, limit = 300): ChangeRow[] {
  return (db.prepare("SELECT id, at, data FROM changes WHERE at >= ? ORDER BY at DESC, id DESC LIMIT ?").all(since, limit) as { id: number; at: number; data: string }[]).map(
    (r) => ({ id: r.id, at: r.at, data: JSON.parse(r.data) as ChangeData }),
  );
}
