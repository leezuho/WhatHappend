import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { tx } from "@/lib/db";

// Write helpers shared by every source. All of them are idempotent upserts so a
// source can safely re-run over overlapping windows.

export interface Point {
  ts: number;
  value: number;
}

export function upsertSeries(db: DatabaseSync, seriesId: string, source: string, points: Point[]): number {
  const insert = db.prepare(
    "INSERT INTO observations (series_id, ts, value) VALUES (?, ?, ?) ON CONFLICT(series_id, ts) DO UPDATE SET value = excluded.value",
  );
  const touch = db.prepare(
    "INSERT INTO series (id, source, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at",
  );
  return tx(db, () => {
    let n = 0;
    for (const p of points) {
      if (!Number.isFinite(p.value) || !Number.isFinite(p.ts)) continue;
      insert.run(seriesId, p.ts, p.value);
      n++;
    }
    touch.run(seriesId, source, Date.now());
    return n;
  });
}

export interface QuoteRow {
  seriesId: string;
  price: number;
  change?: number | null;
  changePct?: number | null;
  marketState?: string | null;
  ts: number;
}

export function upsertQuotes(db: DatabaseSync, quotes: QuoteRow[]): number {
  const stmt = db.prepare(
    `INSERT INTO quotes (series_id, price, change, change_pct, market_state, ts) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(series_id) DO UPDATE SET price = excluded.price, change = excluded.change,
       change_pct = excluded.change_pct, market_state = excluded.market_state, ts = excluded.ts`,
  );
  return tx(db, () => {
    for (const q of quotes) stmt.run(q.seriesId, q.price, q.change ?? null, q.changePct ?? null, q.marketState ?? null, q.ts);
    return quotes.length;
  });
}

export interface ItemRow {
  id: string;
  title: string;
  titleVi?: string | null;
  url?: string | null;
  ts?: number | null;
  data?: unknown;
}

/**
 * Replace the whole snapshot list of one kind (trending, markets, calendars...). A row that brings no translation
 * of its own keeps the one the AI pass stored for it, as long as its title has not changed, so a re-run does not
 * send the same titles to translation again.
 */
export function replaceItems(db: DatabaseSync, kind: string, items: ItemRow[]): number {
  const keepVi = db.prepare("SELECT id, title, title_vi FROM items WHERE kind = ? AND title_vi IS NOT NULL");
  const del = db.prepare("DELETE FROM items WHERE kind = ?");
  const ins = db.prepare(
    "INSERT OR REPLACE INTO items (kind, id, rank, title, title_vi, url, ts, data, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const now = Date.now();
  return tx(db, () => {
    const known = new Map((keepVi.all(kind) as { id: string; title: string; title_vi: string }[]).map((r) => [r.id, r]));
    del.run(kind);
    items.forEach((it, i) => {
      const old = known.get(it.id);
      const vi = it.titleVi !== undefined ? it.titleVi : old && old.title === it.title ? old.title_vi : null;
      ins.run(kind, it.id, i, it.title, vi, it.url ?? null, it.ts ?? null, it.data === undefined ? null : JSON.stringify(it.data), now);
    });
    return items.length;
  });
}

export interface EventRow {
  id: string;
  type: string;
  title: string;
  lat: number;
  lng: number;
  severity?: number | null;
  level?: string | null;
  url?: string | null;
  ts: number;
}

/** Replace a source's events (feeds return their full current window each time). */
export function replaceEvents(db: DatabaseSync, source: string, events: EventRow[]): number {
  const keepVi = db.prepare("SELECT id, title_vi FROM events WHERE source = ? AND title_vi IS NOT NULL");
  const known = new Map((keepVi.all(source) as { id: string; title_vi: string }[]).map((r) => [r.id, r.title_vi]));
  const del = db.prepare("DELETE FROM events WHERE source = ?");
  const ins = db.prepare(
    "INSERT OR REPLACE INTO events (id, source, type, title, title_vi, lat, lng, severity, level, url, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  return tx(db, () => {
    del.run(source);
    for (const e of events) {
      if (!Number.isFinite(e.lat) || !Number.isFinite(e.lng)) continue;
      ins.run(e.id, source, e.type, e.title, known.get(e.id) ?? null, e.lat, e.lng, e.severity ?? null, e.level ?? null, e.url ?? null, e.ts);
    }
    return events.length;
  });
}

export function hashId(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 16);
}

/** Midnight UTC for a date-ish input, so daily series line up across sources. */
export function dayTs(date: string | number | Date): number {
  const d = new Date(date);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Insert-or-update events one by one (for sources that accumulate rather than replace). */
export function upsertEvents(db: DatabaseSync, source: string, events: (EventRow & { titleVi?: string | null })[]): number {
  const stmt = db.prepare(
    `INSERT INTO events (id, source, type, title, title_vi, lat, lng, severity, level, url, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET type = excluded.type, title = excluded.title, title_vi = excluded.title_vi, lat = excluded.lat,
       lng = excluded.lng, severity = excluded.severity, level = excluded.level, url = excluded.url, ts = excluded.ts`,
  );
  return tx(db, () => {
    let n = 0;
    for (const e of events) {
      if (!Number.isFinite(e.lat) || !Number.isFinite(e.lng)) continue;
      stmt.run(e.id, source, e.type, e.title, e.titleVi ?? null, e.lat, e.lng, e.severity ?? null, e.level ?? null, e.url ?? null, e.ts);
      n++;
    }
    return n;
  });
}
