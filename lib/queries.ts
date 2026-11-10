import { cache } from "react";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { sourceMeta, type SourceId } from "@/config/sources";
import type { SourceStatusRow } from "@/lib/sources/types";
import type { GoldQuote } from "@/lib/sources/sjc";
import type { CoinRow, CryptoGlobal, TrendingCoin } from "@/lib/sources/coingecko";
import type { BtcNetwork } from "@/lib/sources/mempool";
import type { P2pQuote, PerpRow } from "@/lib/sources/binance";
import { getDict, pick, type Locale } from "@/lib/i18n";
import { SERIES, type SeriesDef, type SeriesKey } from "@/config/series";
import { COUNTRIES, policyRateId } from "@/config/countries";
import { FOMC_MEETINGS } from "@/config/fomc";
import { BANKS, CB_MEETINGS, LPR_DAY } from "@/config/central-banks";
import { CRYPTO_OUTLETS, DESK_OUTLETS, TECH_OUTLETS } from "@/config/feeds";
import { getPoints, getTile, getWatchlistKeys, tileOf, type TileData } from "@/lib/data/series";
import type { Point } from "@/lib/sources/store";
import { computeRegime, type RegimeResult } from "@/lib/signals/risk-regime";
import { FORCE_KEY, type StoredBrief } from "@/lib/ai/brief-shared";
import { INSIGHT_MAX_AGE, type StoredInsight } from "@/lib/ai/insights-shared";
import { findNotables, type Reason } from "@/lib/signals/notable";
import { AI_ENV_HINT, aiStatus, isAiConfigured } from "@/lib/ai/config";

// Read side for the UI. SQLite reads are synchronous, which Cache Components
// would otherwise freeze into the build-time shell; connection() makes every
// read happen per request.

export interface PanelStatus {
  lastOk: number | null;
  stale: boolean;
  failing: { source: string; error: string | null }[];
  missingKey: string[];
}

export async function getPanelStatus(ids: SourceId[]): Promise<PanelStatus> {
  await connection();
  const db = getDb();
  const now = Date.now();
  const rows = db
    .prepare(`SELECT * FROM source_status WHERE source IN (${ids.map(() => "?").join(",")})`)
    .all(...ids) as unknown as SourceStatusRow[];
  const byId = new Map(rows.map((r) => [r.source, r]));

  const ai = aiStatus();
  const missingKey = ids.flatMap((id) => {
    const meta = sourceMeta(id);
    const env = (meta.requiresEnv ?? []).filter((k) => !process.env[k]);
    return meta.needsAi && !ai.ok ? [...env, AI_ENV_HINT] : env;
  });
  let lastOk: number | null = null;
  let stale = false;
  const failing: PanelStatus["failing"] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;
    if (r.last_ok && (!lastOk || r.last_ok > lastOk)) lastOk = r.last_ok;
    if (!r.ok) failing.push({ source: id, error: r.error });
    if (!r.last_ok || now - r.last_ok > 3 * sourceMeta(id).intervalMs) stale = true;
  }
  return { lastOk, stale: stale || failing.length > 0, failing, missingKey: [...new Set(missingKey)] };
}

// ---------------------------------------------------------------- map

export interface MapEvent {
  id: string;
  group: "quake" | "hazard" | "news";
  title: string;
  lat: number;
  lng: number;
  severity: number | null;
  level: string | null;
  url: string | null;
  ts: number;
}

const HAZARD_TYPES = new Set(["cyclone", "flood", "drought", "volcano", "wildfire", "storm", "tsunami", "landslide", "heat"]);

export async function getMapEvents(lang: Locale): Promise<MapEvent[]> {
  await connection();
  const rows = getDb()
    .prepare("SELECT id, type, title, title_vi, lat, lng, severity, level, url, ts FROM events WHERE ts >= ? ORDER BY ts DESC LIMIT 600")
    .all(Date.now() - 14 * 24 * 3600_000) as unknown as {
    id: string;
    type: string;
    title: string;
    title_vi: string | null;
    lat: number;
    lng: number;
    severity: number | null;
    level: string | null;
    url: string | null;
    ts: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    group: r.type === "earthquake" ? "quake" : HAZARD_TYPES.has(r.type) ? "hazard" : "news",
    title: lang === "vi" && r.title_vi ? r.title_vi : r.title,
    lat: r.lat,
    lng: r.lng,
    severity: r.severity,
    level: r.level,
    url: r.url,
    ts: r.ts,
  }));
}

// ---------------------------------------------------------------- news

export interface NewsItem {
  id: string;
  url: string;
  source: string;
  title: string;
  region: string | null;
  topic: string | null;
  image: string | null;
  publishedAt: number;
  /** Other outlets carrying the same story. */
  alsoIn: string[];
}

interface ArticleRow {
  id: string;
  url: string;
  source: string;
  title: string;
  title_en: string | null;
  title_vi: string | null;
  lang: string;
  region: string | null;
  topic: string | null;
  image: string | null;
  published_at: number;
  title_key: string;
}

/** Last 3 days of articles matching `where`, newest first, one per story. */
function readNews(lang: Locale, where: string, params: (string | number)[], limit: number): NewsItem[] {
  const rows = getDb()
    .prepare(
      `SELECT id, url, source, title, title_en, title_vi, lang, region, topic, image, published_at, title_key
       FROM articles WHERE published_at >= ? AND (${where}) ORDER BY published_at DESC LIMIT ?`,
    )
    .all(Date.now() - 3 * 24 * 3600_000, ...params, limit * 4) as unknown as ArticleRow[];
  return collapseStories(rows, lang).slice(0, limit);
}

const marks = (names: string[]) => names.map(() => "?").join(",");

/** World news: everything except the desk outlets (crypto, tech), which have their own pages. */
export async function getNews(lang: Locale, limit = 120): Promise<NewsItem[]> {
  await connection();
  return readNews(lang, `source NOT IN (${marks(DESK_OUTLETS)})`, DESK_OUTLETS, limit);
}

/** Crypto outlets plus crypto stories the AI found in general outlets. */
export async function getCryptoNews(lang: Locale, limit = 40): Promise<NewsItem[]> {
  await connection();
  return readNews(lang, `source IN (${marks(CRYPTO_OUTLETS)}) OR topic = 'crypto'`, CRYPTO_OUTLETS, limit);
}

/** Tech outlets plus tech stories the AI found in general outlets (not the crypto desk's). */
export async function getTechNews(lang: Locale, limit = 40): Promise<NewsItem[]> {
  await connection();
  return readNews(
    lang,
    `source IN (${marks(TECH_OUTLETS)}) OR (topic = 'tech' AND source NOT IN (${marks(CRYPTO_OUTLETS)}))`,
    [...TECH_OUTLETS, ...CRYPTO_OUTLETS],
    limit,
  );
}

function collapseStories(rows: ArticleRow[], lang: Locale): NewsItem[] {
  // Collapse the same story across outlets (newest copy wins).
  const seen = new Map<string, NewsItem>();
  for (const r of rows) {
    const existing = seen.get(r.title_key);
    if (existing) {
      if (r.source !== existing.source && !existing.alsoIn.includes(r.source)) existing.alsoIn.push(r.source);
      existing.image ??= r.image;
      continue;
    }
    const translated = lang === "vi" ? r.title_vi : r.title_en;
    seen.set(r.title_key, {
      id: r.id,
      url: r.url,
      source: r.source,
      title: translated ?? r.title,
      region: r.region,
      topic: r.topic,
      image: r.image,
      publishedAt: r.published_at,
      alsoIn: [],
    });
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------- markets & macro

export interface Tile {
  key: SeriesKey;
  def: SeriesDef;
  data: TileData | null;
}

export async function getTiles(keys: SeriesKey[]): Promise<Tile[]> {
  await connection();
  const db = getDb();
  return keys.map((key) => ({ key, def: SERIES[key], data: tileOf(db, key) }));
}

export const CURVE_TENORS = [
  ["1M", "DGS1MO"],
  ["3M", "DGS3MO"],
  ["6M", "DGS6MO"],
  ["1Y", "DGS1"],
  ["2Y", "DGS2"],
  ["3Y", "DGS3"],
  ["5Y", "DGS5"],
  ["7Y", "DGS7"],
  ["10Y", "DGS10"],
  ["20Y", "DGS20"],
  ["30Y", "DGS30"],
] as const;

export interface CurveData {
  rows: { tenor: string; now: number | null; m1: number | null; y1: number | null }[];
  asOf: { now: number | null; m1: number | null; y1: number | null };
}

export async function getYieldCurve(): Promise<CurveData> {
  await connection();
  const db = getDb();
  const at = db.prepare("SELECT ts, value FROM observations WHERE series_id = ? AND ts <= ? ORDER BY ts DESC LIMIT 1");
  const latest = db.prepare("SELECT MAX(ts) AS ts FROM observations WHERE series_id = 'fred:DGS10'").get() as { ts: number | null };
  const now = latest.ts;
  if (!now) return { rows: [], asOf: { now: null, m1: null, y1: null } };
  const m1 = now - 30 * 24 * 3600_000;
  const y1 = now - 365 * 24 * 3600_000;
  const asOf = { now, m1: null as number | null, y1: null as number | null };
  const rows = CURVE_TENORS.map(([tenor, code]) => {
    const get = (ts: number) => at.get(`fred:${code}`, ts) as { ts: number; value: number } | undefined;
    const a = get(now);
    const b = get(m1);
    const c = get(y1);
    if (b) asOf.m1 = Math.max(asOf.m1 ?? 0, b.ts);
    if (c) asOf.y1 = Math.max(asOf.y1 ?? 0, c.ts);
    return { tenor, now: a?.value ?? null, m1: b?.value ?? null, y1: c?.value ?? null };
  });
  return { rows, asOf };
}

export interface CountryMacro {
  short: string;
  name: string;
  inflation: number | null;
  growth: number | null;
  rate: number | null;
  rateTs: number | null;
}

export async function getCountryMacro(lang: Locale): Promise<{ year: number; rows: CountryMacro[] }> {
  await connection();
  const db = getDb();
  const year = new Date().getUTCFullYear();
  const yearTs = Date.UTC(year, 0, 1);
  const val = db.prepare("SELECT value FROM observations WHERE series_id = ? AND ts = ?");
  const last = db.prepare("SELECT ts, value FROM observations WHERE series_id = ? ORDER BY ts DESC LIMIT 1");
  const rows = COUNTRIES.filter((c) => c.overview).map((c) => {
    const rateId = policyRateId(c);
    const rate = rateId ? (last.get(rateId) as { ts: number; value: number } | undefined) : undefined;
    return {
      short: c.short,
      name: pick(c.name, lang),
      inflation: (val.get(`imf:PCPIPCH:${c.imf}`, yearTs) as { value: number } | undefined)?.value ?? null,
      growth: (val.get(`imf:NGDP_RPCH:${c.imf}`, yearTs) as { value: number } | undefined)?.value ?? null,
      rate: rate?.value ?? null,
      rateTs: rate?.ts ?? null,
    };
  });
  return { year, rows };
}

/** Last year of daily points for small-multiple charts. */
export async function getHistory(ids: string[], days = 365): Promise<Record<string, Point[]>> {
  await connection();
  const db = getDb();
  const since = Date.now() - days * 24 * 3600_000;
  return Object.fromEntries(ids.map((id) => [id, getPoints(db, id, since)]));
}

export async function getRegime(): Promise<RegimeResult> {
  await connection();
  const db = getDb();
  const since = Date.now() - 400 * 24 * 3600_000;
  return computeRegime({
    vix: getPoints(db, SERIES.vix.id, since),
    hy: getPoints(db, SERIES.hy.id, since),
    dxy: getPoints(db, SERIES.dxy.id, since),
    curve: getPoints(db, SERIES.curve.id, since),
    fsi: getPoints(db, SERIES.fsi.id, since),
  });
}

export interface TickerItem {
  label: string;
  price: number;
  changePct: number | null;
  digits: number;
}

export async function getTicker(): Promise<TickerItem[]> {
  await connection();
  const db = getDb();
  const quotes = db.prepare("SELECT series_id, price, change_pct FROM quotes").all() as unknown as { series_id: string; price: number; change_pct: number | null }[];
  const byId = new Map(quotes.map((q) => [q.series_id, q]));
  return Object.values(SERIES).flatMap((def: SeriesDef) => {
    const q = byId.get(def.id);
    // Market caps in $ billions read badly as bare ticker numbers.
    return q && def.unit !== "$B" ? [{ label: def.short, price: q.price, changePct: q.change_pct, digits: def.digits }] : [];
  });
}

// ---------------------------------------------------------------- brief

export interface BriefView {
  date: string;
  createdAt: number;
  brief: StoredBrief;
  /** Article photo by source URL, for the bullets' thumbnails. */
  images: Record<string, string>;
}

export async function getLatestBrief(lang: Locale): Promise<{ view: BriefView | null; hasKey: boolean; requestedAt: number | null }> {
  await connection();
  const db = getDb();
  const row = db.prepare("SELECT date, content, created_at FROM briefs WHERE lang = ? ORDER BY created_at DESC LIMIT 1").get(lang) as
    | { date: string; content: string; created_at: number }
    | undefined;
  const req = db.prepare("SELECT updated_at FROM kv WHERE key = ?").get(FORCE_KEY) as { updated_at: number } | undefined;
  const requestedAt = req && (!row || req.updated_at > row.created_at) ? req.updated_at : null;
  const brief = row ? (JSON.parse(row.content) as StoredBrief) : null;
  return {
    view: brief && row ? { date: row.date, createdAt: row.created_at, brief, images: articleImages(db, brief.bullets.flatMap((b) => b.sources.map((s) => s.url))) } : null,
    hasKey: isAiConfigured(),
    requestedAt,
  };
}

/** Photo of each cited article, by URL (brief sources are copied from `articles.url`). */
function articleImages(db: ReturnType<typeof getDb>, urls: string[]): Record<string, string> {
  if (!urls.length) return {};
  const rows = db
    .prepare(`SELECT url, image FROM articles WHERE image IS NOT NULL AND url IN (${urls.map(() => "?").join(",")})`)
    .all(...urls) as unknown as { url: string; image: string }[];
  return Object.fromEntries(rows.map((r) => [r.url, r.image]));
}

// ---------------------------------------------------------------- what stands out

export interface InsightNote {
  text: string;
  sources: StoredInsight["sources"];
  model: string;
  createdAt: number;
}

export interface Highlight {
  key: SeriesKey;
  def: SeriesDef;
  data: TileData;
  reasons: Reason[];
  note: InsightNote | null;
}

/** Notable indicators with their AI notes; computed once per request, shared by every panel. */
const notablesWithNotes = cache(async () => {
  await connection();
  const db = getDb();
  const notables = findNotables(db);
  const rows = db.prepare("SELECT key, content, created_at FROM insights WHERE created_at >= ?").all(Date.now() - INSIGHT_MAX_AGE) as unknown as {
    key: string;
    content: string;
    created_at: number;
  }[];
  const notes = new Map(rows.map((r) => [r.key, { content: JSON.parse(r.content) as StoredInsight, createdAt: r.created_at }]));
  return notables.map((n) => ({ ...n, stored: notes.get(n.key) ?? null }));
});

export async function getHighlights(lang: Locale): Promise<{ items: Highlight[]; hasKey: boolean }> {
  const items = (await notablesWithNotes()).map(({ key, def, data, reasons, stored }) => ({
    key,
    def,
    data,
    reasons,
    note: stored && { text: stored.content[lang], sources: stored.content.sources, model: stored.content.model, createdAt: stored.createdAt },
  }));
  return { items, hasKey: isAiConfigured() };
}

/** AI notes by series key, for the tile detail dialogs. */
export async function getInsightNotes(lang: Locale): Promise<Partial<Record<SeriesKey, string>>> {
  return Object.fromEntries((await notablesWithNotes()).flatMap((n) => (n.stored ? [[n.key, n.stored.content[lang]]] : [])));
}

// ---------------------------------------------------------------- Vietnam

export interface VietnamData {
  vnindex: TileData | null;
  usdvnd: TileData | null;
  breadth: { advances: number | null; declines: number | null; unchanged: number | null } | null;
  gold: GoldQuote[];
  goldTs: number | null;
  worldGoldVnd: number | null;
  vcb: { code: string; cash: number | null; transfer: number | null; sell: number | null }[];
  news: NewsItem[];
}

/** 1 lượng (tael) = 37.5 g; 1 troy ounce = 31.1034768 g. */
const OZ_PER_LUONG = 37.5 / 31.1034768;

export async function getVietnam(lang: Locale, newsLimit = 6): Promise<VietnamData> {
  await connection();
  const db = getDb();
  const items = (kind: string) =>
    db.prepare("SELECT id, title, ts, data FROM items WHERE kind = ? ORDER BY rank").all(kind) as unknown as { id: string; title: string; ts: number | null; data: string | null }[];
  const goldRows = items("gold_vn");
  const usdvnd = getTile(db, SERIES.usdvnd);
  const xau = getTile(db, SERIES.gold);
  const breadth = items("vn_breadth")[0];
  const news = readNews(lang, "source = 'VnExpress' AND region = 'vietnam'", [], newsLimit);
  return {
    vnindex: getTile(db, SERIES.vnindex),
    usdvnd,
    breadth: breadth?.data ? JSON.parse(breadth.data) : null,
    gold: goldRows.map((r) => JSON.parse(r.data ?? "{}") as GoldQuote),
    goldTs: goldRows[0]?.ts ?? null,
    worldGoldVnd: xau && usdvnd ? xau.value * usdvnd.value * OZ_PER_LUONG : null,
    vcb: items("vcb").map((r) => JSON.parse(r.data ?? "{}")),
    news,
  };
}

// ---------------------------------------------------------------- snapshot lists (items)

export interface Item<D = Record<string, unknown>> {
  id: string;
  title: string;
  url: string | null;
  ts: number | null;
  data: D;
}

export async function getItems<D = Record<string, unknown>>(kind: string, lang: Locale, limit = 50): Promise<Item<D>[]> {
  await connection();
  const rows = getDb()
    .prepare("SELECT id, title, title_vi, url, ts, data FROM items WHERE kind = ? ORDER BY rank LIMIT ?")
    .all(kind, limit) as unknown as { id: string; title: string; title_vi: string | null; url: string | null; ts: number | null; data: string | null }[];
  return rows.map((r) => ({
    id: r.id,
    title: lang === "vi" && r.title_vi ? r.title_vi : r.title,
    url: r.url,
    ts: r.ts,
    data: (r.data ? JSON.parse(r.data) : {}) as D,
  }));
}

// ---------------------------------------------------------------- calendar

/** "16–17 Dec" / "16–17 thg 12" for a meeting's days. */
function fmtDayRange(start: string, end: string, lang: Locale): string {
  const f = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(lang === "vi" ? "vi-VN" : "en-GB", { timeZone: "UTC", ...opts }).format(Date.parse(`${iso}T00:00:00Z`));
  return start.slice(0, 7) === end.slice(0, 7)
    ? `${Number(start.slice(8))}–${f(end, { day: "numeric", month: "short" })}`
    : `${f(start, { day: "numeric", month: "short" })} – ${f(end, { day: "numeric", month: "short" })}`;
}

export interface CalendarEntry {
  kind: "econ" | "fomc" | "cb" | "launch";
  ts: number;
  title: string;
  detail: string | null;
  impact?: string;
  allDay?: boolean;
  url?: string | null;
}

/** The PBoC's loan-prime-rate fixings from this month on: the 20th at 9:15 Beijing, moved off weekends (holidays are not modelled). */
function lprFixings(now: number, until: number): number[] {
  const out: number[] = [];
  const d0 = new Date(now);
  for (let i = 0; ; i++) {
    const day = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + i, LPR_DAY, 1, 15));
    if (day.getTime() > until) return out;
    while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1);
    out.push(day.getTime());
  }
}

const DEFAULT_KINDS: CalendarEntry["kind"][] = ["econ", "fomc", "launch"];

/** Upcoming entries of the given kinds over `days`; the overview leaves out other central banks, the macro page leaves out launches. */
export async function getCalendar(lang: Locale, days = 21, kinds: CalendarEntry["kind"][] = DEFAULT_KINDS): Promise<CalendarEntry[]> {
  await connection();
  const now = Date.now();
  const until = now + days * 24 * 3600_000;
  const econ = await getItems<{ country: string; impact: string; forecast: string | null; previous: string | null }>("calendar", lang);
  const launches = await getItems<{ provider: string; rocket: string; pad: string; status: string; precision: string | null }>("launch", lang);
  const t = getDict(lang).calendar;
  const entries: CalendarEntry[] = [
    ...econ.flatMap((e) =>
      e.ts && e.ts >= now - 3 * 3600_000
        ? [{
            kind: "econ" as const,
            ts: e.ts,
            title: `${e.data.country} · ${e.title}`,
            impact: e.data.impact,
            detail: [e.data.forecast && `${t.forecast} ${e.data.forecast}`, e.data.previous && `${t.previous} ${e.data.previous}`].filter(Boolean).join(" · ") || null,
          }]
        : [],
    ),
    ...FOMC_MEETINGS.map((m) => ({
      kind: "fomc" as const,
      ts: Date.parse(`${m.end}T18:00:00Z`), // decision at 2pm New York on the last day
      title: t.fomcTitle.replace("{days}", `${m.start.slice(8)}–${m.end.slice(8)}`),
      detail: m.sep ? t.fomcSep : null,
      allDay: true,
    })),
    ...CB_MEETINGS.map((m) => ({
      kind: "cb" as const,
      ts: Date.parse(`${m.end}T12:00:00Z`),
      title: t.cbTitle.replace("{bank}", pick(BANKS[m.bank].name, lang)),
      detail: m.start !== m.end ? `${fmtDayRange(m.start, m.end, lang)}` : null,
      allDay: true,
    })),
    ...lprFixings(now, until).map((ts) => ({ kind: "cb" as const, ts, title: t.lpr, detail: null })),
    ...launches.flatMap((l) =>
      l.ts
        ? [{
            kind: "launch" as const,
            ts: l.ts,
            title: l.title,
            detail: [l.data.provider, l.data.pad?.split(",").slice(-1)[0]?.trim(), l.data.status].filter(Boolean).join(" · "),
          }]
        : [],
    ),
  ];
  // The next Fed meeting always shows, even beyond the window: it is the event markets plan around.
  const nextFomc = entries.find((e) => e.kind === "fomc" && e.ts >= now);
  return entries
    .filter((e) => kinds.includes(e.kind) && ((e.ts >= now - 3 * 3600_000 && e.ts <= until) || e === nextFomc))
    .sort((a, b) => a.ts - b.ts);
}

// ---------------------------------------------------------------- planet & health

export interface EnvData {
  co2: { value: number; ts: number; yearAgo: number | null; spark: Point[] } | null;
  temp: { value: number; ts: number; avg12: number | null; spark: Point[] } | null;
  air: Item<{ aqi: number | null; pm25: number | null; pm10: number | null }>[];
  outbreaks: Item[];
}

export async function getEnv(lang: Locale): Promise<EnvData> {
  await connection();
  const db = getDb();
  const co2 = getPoints(db, "noaa:co2", Date.now() - 400 * 24 * 3600_000);
  const lastCo2 = co2[co2.length - 1];
  const yearAgo = lastCo2 ? co2.filter((p) => p.ts <= lastCo2.ts - 365 * 24 * 3600_000).pop() : undefined;
  const temp = getPoints(db, "giss:global", Date.now() - 6 * 365 * 24 * 3600_000);
  const lastTemp = temp[temp.length - 1];
  const last12 = temp.slice(-12);
  return {
    co2: lastCo2 ? { value: lastCo2.value, ts: lastCo2.ts, yearAgo: yearAgo?.value ?? null, spark: co2.filter((_, i) => i % 7 === 0 || i === co2.length - 1) } : null,
    temp: lastTemp ? { value: lastTemp.value, ts: lastTemp.ts, avg12: last12.length === 12 ? last12.reduce((a, p) => a + p.value, 0) / 12 : null, spark: temp } : null,
    air: await getItems("airquality", lang),
    outbreaks: await getItems("who", lang, 5),
  };
}

// ---------------------------------------------------------------- crypto

export interface FearGreed {
  value: number;
  label: string;
  ts: number;
  yesterday: number | null;
  weekAgo: number | null;
  monthAgo: number | null;
  spark: Point[];
}

export interface CryptoP2p extends P2pQuote {
  ts: number;
  /** Vietcombank's USD selling rate, and how far the P2P buy price sits above it (%). */
  bankSell: number | null;
  premium: number | null;
}

export interface PolyEvent {
  tag: string;
  volume24hr: number;
  outcomes: { label: string; prob: number; change24h: number | null }[];
}

export interface CryptoData {
  global: CryptoGlobal | null;
  top: CoinRow[];
  topTs: number | null;
  trending: TrendingCoin[];
  fng: FearGreed | null;
  network: BtcNetwork | null;
  perps: PerpRow[];
  perpsTs: number | null;
  p2p: CryptoP2p | null;
}

/** Everything the crypto page reads, once per request (several panels share it). */
export const getCrypto = cache(async (lang: Locale): Promise<CryptoData> => {
  await connection();
  const db = getDb();
  const one = <D,>(kind: string) => {
    const r = db.prepare("SELECT ts, data FROM items WHERE kind = ? ORDER BY rank LIMIT 1").get(kind) as { ts: number | null; data: string | null } | undefined;
    return r?.data ? { ts: r.ts ?? 0, data: JSON.parse(r.data) as D } : null;
  };
  const [top, trending, perps, vcb] = await Promise.all([
    getItems<CoinRow>("crypto_top", lang, 20),
    getItems<TrendingCoin>("crypto_trending", lang, 10),
    getItems<PerpRow>("crypto_perps", lang, 10),
    getItems<{ sell: number | null }>("vcb", lang),
  ]);

  const fngPts = getPoints(db, SERIES.fng.id, Date.now() - 400 * 24 * 3600_000);
  const fngLast = fngPts[fngPts.length - 1];
  const fngLabel = one<{ label: string }>("crypto_fng");
  const ago = (days: number) => (fngLast ? (fngPts.filter((p) => p.ts <= fngLast.ts - days * 24 * 3600_000).pop()?.value ?? null) : null);

  const p2p = one<P2pQuote>("usdt_p2p");
  const bankSell = vcb.find((r) => r.id === "USD")?.data.sell ?? null;

  return {
    global: one<CryptoGlobal>("crypto_global")?.data ?? null,
    top: top.map((t) => t.data),
    topTs: top[0]?.ts ?? null,
    trending: trending.map((t) => t.data),
    fng: fngLast
      ? { value: fngLast.value, label: fngLabel?.data.label ?? "", ts: fngLast.ts, yesterday: ago(1), weekAgo: ago(7), monthAgo: ago(30), spark: fngPts.slice(-90) }
      : null,
    network: one<BtcNetwork>("btc_network")?.data ?? null,
    perps: perps.map((p) => p.data),
    perpsTs: perps[0]?.ts ?? null,
    p2p: p2p && {
      ...p2p.data,
      ts: p2p.ts,
      bankSell,
      premium: bankSell ? (p2p.data.buy / bankSell - 1) * 100 : null,
    },
  };
});

// ---------------------------------------------------------------- watchlist

export async function getWatchlist(): Promise<SeriesKey[]> {
  await connection();
  return getWatchlistKeys(getDb()).filter((k): k is SeriesKey => k in SERIES);
}

/** Request time for "x minutes ago" labels; per request, never prerendered. */
export async function requestNow(): Promise<number> {
  await connection();
  return Date.now();
}
