import type { DatabaseSync } from "node:sqlite";
import { SERIES, type SeriesDef, type SeriesKey } from "@/config/series";
import { THEMES, type ThemeDef, type ThemeFactId, type ThemeGauge, type ThemeId, type ThemeNews } from "@/config/themes";
import { CRYPTO_OUTLETS, TECH_OUTLETS } from "@/config/feeds";
import type { Bi } from "@/lib/i18n";
import { fmtNumber, fmtPeriod, fmtSigned } from "@/lib/format";
import type { Point } from "@/lib/sources/store";
import { clusterStories, type Story } from "./news";
import { getDetailPoints, getTile } from "./series";
import { centralBand } from "./vietnam";

// The "Dominant themes" panel's numbers (config/themes.ts), shared by the web
// (lib/queries.ts) and the worker (the themes AI note and the weekly macro
// note), so no Next imports here. Status = the mean, over a theme's gauges, of
// each gauge's move over about a month divided by the usual size of such a
// move in its own history, signed so that positive = heating up.

const DAY = 86_400_000;
/** History the usual size of a move is measured over: about two years of moves. */
const HISTORY_DAYS = 760;
const MONTH_DAYS = 30;
/** Readings per "about a month" for low-frequency series. */
const STEPS = { w: 4, m: 1, q: 1, y: 1 } as const;
/** Fewer earlier moves than this and the gauge is shown without a z. */
const MIN_MOVES = 12;
const MAX_Z = 3;
/** A daily gauge whose newest point is older than this does not count toward the status. */
const MAX_DAILY_AGE_DAYS = 10;
/** Mean heat at or beyond which a theme is heating up (or, negative, cooling). */
export const HEAT_ON = 0.5;
const NEWS_DAYS = 7;
const LATEST_WINDOW = 2 * DAY;
const LATEST_N = 3;
/** Headlines per theme handed to the AI note. */
const PROMPT_HEADLINES = 8;
const MAX_MARKETS = 2;
/** Prediction-market snapshots older than this are not shown (the source is often blocked). */
const MARKET_MAX_AGE = 3 * DAY;
/** A leading outcome this likely (or a lone "Yes" this unlikely) is treated as settled and not shown. */
const SETTLED = 0.97;

export type ThemeStatus = "heating" | "cooling" | "steady" | "unknown";

export interface GaugeReading {
  def: SeriesDef;
  /** The SERIES key when the gauge is a tile, for the detail drawer. */
  key?: SeriesKey;
  sign: 1 | -1;
  /** The latest reading (for a flow, its sum over `sumSessions`). */
  value: number;
  ts: number;
  /** Change over about a month in the tile's units (% for prices, absolute otherwise); null without an earlier point. */
  change: number | null;
  /** Date of the reading the change is measured from. */
  from: number | null;
  /** Heat-signed z (positive = heating the theme up), clamped to ±3; null when the history is too short or the data late. */
  heat: number | null;
  sumSessions?: number;
  spark: Point[];
}

export interface ThemeFact {
  id: ThemeFactId;
  text: Bi;
  ts: number;
}

export interface ThemeArticle {
  url: string;
  source: string;
  lang: string;
  title: string;
  titleEn: string | null;
  titleVi: string | null;
  publishedAt: number;
  /** Other outlets that ran the same story. */
  alsoIn: number;
}

export interface ThemeMarket {
  title: string;
  titleVi: string | null;
  url: string | null;
  /** The leading outcome ("Yes" for a yes/no market). */
  label: string;
  prob: number;
  change24h: number | null;
  fetchedAt: number;
}

export interface ThemeState {
  def: ThemeDef;
  heat: number | null;
  status: ThemeStatus;
  gauges: GaugeReading[];
  facts: ThemeFact[];
  vietnam: { gauges: GaugeReading[]; facts: ThemeFact[] } | null;
  news: { day: number; week: number; latest: ThemeArticle[]; forPrompt: ThemeArticle[] };
  markets: ThemeMarket[];
}

const clamp = (z: number) => Math.max(-MAX_Z, Math.min(MAX_Z, z));

function stdev(xs: number[]): number {
  const mean = xs.reduce((a, x) => a + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length);
}

/** Each point's change from the last point at least `days` earlier, oldest first. */
function changesOver(points: Point[], days: number, diff: (a: number, b: number) => number): { ts: number; from: number; v: number }[] {
  const out: { ts: number; from: number; v: number }[] = [];
  let j = 0;
  for (let i = 0; i < points.length; i++) {
    const cutoff = points[i].ts - days * DAY;
    while (j + 1 < i && points[j + 1].ts <= cutoff) j++;
    if (points[j].ts <= cutoff) out.push({ ts: points[i].ts, from: points[j].ts, v: diff(points[j].value, points[i].value) });
  }
  return out;
}

/** Sum of each run of `n` consecutive points, stamped at its last one. */
function rollingSums(points: Point[], n: number): Point[] {
  const out: Point[] = [];
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    sum += points[i].value;
    if (i >= n) sum -= points[i - n].value;
    if (i >= n - 1) out.push({ ts: points[i].ts, value: sum });
  }
  return out;
}

/** About `n` evenly spaced points of a series, the last one always kept. */
function thin(points: Point[], n: number): Point[] {
  if (points.length <= n) return points;
  const step = points.length / n;
  const out: Point[] = [];
  for (let i = 0; i < n - 1; i++) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

export function defOf(g: ThemeGauge): { def: SeriesDef; key?: SeriesKey } {
  return typeof g.series === "string" ? { def: SERIES[g.series], key: g.series } : { def: g.series };
}

export function readGauge(db: DatabaseSync, g: ThemeGauge, now: number): GaugeReading | null {
  const { def, key } = defOf(g);
  let points = getDetailPoints(db, def, HISTORY_DAYS + MONTH_DAYS + 10, now);
  // A live quote newer than the last close is today's reading: it replaces a close stamped the same UTC day.
  if (!def.freq && !def.transform && !def.scale && !g.sumSessions) {
    const tile = getTile(db, def, now);
    const last = points[points.length - 1];
    if (tile && (!last || tile.ts > last.ts)) {
      const sameDay = last && Math.floor(last.ts / DAY) === Math.floor(tile.ts / DAY);
      points = [...(sameDay ? points.slice(0, -1) : points), { ts: tile.ts, value: tile.value }];
    }
  }
  if (!points.length) return null;
  const base = { def, key, sign: g.sign, sumSessions: g.sumSessions };

  if (g.sumSessions) {
    const sums = rollingSums(points, g.sumSessions);
    const cur = sums[sums.length - 1];
    if (!cur) return null;
    const sd = stdev(sums.map((p) => p.value));
    const mean = sums.reduce((a, p) => a + p.value, 0) / sums.length;
    const late = now - cur.ts > MAX_DAILY_AGE_DAYS * DAY;
    const heat = sums.length >= MIN_MOVES && sd > 0 && !late ? g.sign * clamp((cur.value - mean) / sd) : null;
    return { ...base, value: cur.value, ts: cur.ts, change: null, from: null, heat, spark: thin(sums.slice(-90), 45) };
  }

  const last = points[points.length - 1];
  const diff = (a: number, b: number) => (def.delta === "abs" ? b - a : a ? (b / a - 1) * 100 : 0);
  const steps = def.freq ? STEPS[def.freq] : 0;
  const moves = def.freq
    ? points.slice(steps).map((p, i) => ({ ts: p.ts, from: points[i].ts, v: diff(points[i].value, p.value) }))
    : changesOver(points, MONTH_DAYS, diff);
  const cur = moves.length && moves[moves.length - 1].ts === last.ts ? moves[moves.length - 1] : null;
  const sd = moves.length >= MIN_MOVES ? stdev(moves.map((m) => m.v)) : 0;
  const late = !def.freq && now - last.ts > MAX_DAILY_AGE_DAYS * DAY;
  const heat = cur && sd > 0 && !late ? g.sign * clamp(cur.v / sd) : null;
  const spark = def.freq ? points.slice(-13) : thin(points.filter((p) => p.ts >= now - 90 * DAY), 45);
  return { ...base, value: last.value, ts: last.ts, change: cur?.v ?? null, from: cur?.from ?? null, heat, spark };
}

export function statusOf(heat: number | null): ThemeStatus {
  if (heat === null) return "unknown";
  return heat >= HEAT_ON ? "heating" : heat <= -HEAT_ON ? "cooling" : "steady";
}

/** Mean heat of the gauges that have one; null with fewer than two (one number is not a theme). */
export function themeHeat(gauges: (GaugeReading | null)[]): number | null {
  const hs = gauges.flatMap((g) => (g && g.heat !== null ? [g.heat] : []));
  return hs.length >= 2 ? hs.reduce((a, h) => a + h, 0) / hs.length : null;
}

// ---------------------------------------------------------------- facts

const both = (f: (lang: "en" | "vi") => string): Bi => ({ en: f("en"), vi: f("vi") });

function readFact(db: DatabaseSync, id: ThemeFactId): ThemeFact | null {
  switch (id) {
    case "fxCeiling": {
      const b = centralBand(db);
      if (!b || b.vcb === null) return null;
      const gap = b.ceiling - b.vcb;
      const pct = (gap / b.ceiling) * 100;
      return {
        id,
        ts: b.ts,
        text: both((l) =>
          l === "vi"
            ? `Vietcombank bán ra ${fmtNumber(b.vcb!, l, 0)} ₫, cách trần biên độ ${fmtNumber(gap, l, 0)} ₫ (${fmtNumber(pct, l, 1)}%)`
            : `Vietcombank sells at ${fmtNumber(b.vcb!, l, 0)} ₫, ${fmtNumber(gap, l, 0)} ₫ (${fmtNumber(pct, l, 1)}%) below the band's ceiling`,
        ),
      };
    }
    case "tsmcRevenue": {
      const row = db.prepare("SELECT data FROM items WHERE kind = 'tw_revenue' AND id = '2330'").get() as { data: string | null } | undefined;
      const d = row?.data ? (JSON.parse(row.data) as { month?: number; yoy?: number; ytdYoy?: number }) : null;
      if (!d || typeof d.month !== "number" || typeof d.yoy !== "number") return null;
      const ytd = typeof d.ytdYoy === "number" ? d.ytdYoy : null;
      return {
        id,
        ts: d.month,
        text: both((l) =>
          l === "vi"
            ? `Doanh thu TSMC ${fmtPeriod(d.month!, "m", l)}: ${fmtSigned(d.yoy!, l, 1, "%")} so cùng kỳ${ytd === null ? "" : `, từ đầu năm ${fmtSigned(ytd, l, 1, "%")}`}`
            : `TSMC revenue, ${fmtPeriod(d.month!, "m", l)}: ${fmtSigned(d.yoy!, l, 1, "%")} y/y${ytd === null ? "" : `, year to date ${fmtSigned(ytd, l, 1, "%")}`}`,
        ),
      };
    }
  }
}

// ---------------------------------------------------------------- news

interface ArticleRow {
  id: string;
  url: string;
  source: string;
  lang: string;
  region: string | null;
  topic: string | null;
  title: string;
  title_en: string | null;
  title_vi: string | null;
  title_key: string;
  published_at: number;
}

/** Whether an article belongs to a theme: its English title (or untranslated Vietnamese one) matches, from an outlet and region the theme reads. */
export function matchesNews(news: ThemeNews, a: Pick<ArticleRow, "source" | "lang" | "region" | "topic" | "title" | "title_en">): boolean {
  if (a.topic === "sports" || CRYPTO_OUTLETS.includes(a.source)) return false;
  if (!news.tech && TECH_OUTLETS.includes(a.source)) return false;
  if (news.regions && (!a.region || !news.regions.includes(a.region))) return false;
  const en = a.title_en ?? (a.lang === "en" ? a.title : null);
  if (en !== null) return news.en.test(en);
  return a.lang === "vi" && !!news.vi?.test(a.title);
}

function themeNews(rows: ArticleRow[], news: ThemeNews, now: number): ThemeState["news"] {
  // Rows come newest first; one per title key.
  const seen = new Set<string>();
  const hits = rows.filter((r) => {
    if (seen.has(r.title_key) || !matchesNews(news, r)) return false;
    seen.add(r.title_key);
    return true;
  });
  const recent = hits.filter((r) => r.published_at >= now - LATEST_WINDOW);
  // Same story in other words: cluster on the English titles, the newest headline of each story leads.
  const stories = clusterStories(
    recent.map((r) => ({ id: r.id, url: r.url, source: r.source, title: r.title_en ?? r.title, image: null, alsoIn: [], related: [], row: r }) as Story & { row: ArticleRow }),
    "en",
  );
  const toArticle = (s: Story & { row: ArticleRow }): ThemeArticle => ({
    url: s.row.url,
    source: s.row.source,
    lang: s.row.lang,
    title: s.row.title,
    titleEn: s.row.title_en ?? (s.row.lang === "en" ? s.row.title : null),
    titleVi: s.row.title_vi ?? (s.row.lang === "vi" ? s.row.title : null),
    publishedAt: s.row.published_at,
    alsoIn: s.related.length,
  });
  return {
    day: hits.filter((r) => r.published_at >= now - DAY).length,
    week: hits.length,
    latest: stories.slice(0, LATEST_N).map(toArticle),
    // The most covered stories first for the AI note, so it sees what mattered rather than what came last.
    forPrompt: [...stories]
      .sort((a, b) => b.related.length - a.related.length || b.row.published_at - a.row.published_at)
      .slice(0, PROMPT_HEADLINES)
      .map(toArticle),
  };
}

// ---------------------------------------------------------------- prediction markets

interface MarketRow {
  title: string;
  title_vi: string | null;
  url: string | null;
  data: string | null;
  fetched_at: number;
}

function themeMarkets(rows: MarketRow[], re: RegExp | undefined, now: number): ThemeMarket[] {
  if (!re) return [];
  return rows
    .filter((r) => re.test(r.title) && now - r.fetched_at <= MARKET_MAX_AGE)
    .flatMap((r) => {
      const d = r.data ? (JSON.parse(r.data) as { volume24hr?: number; outcomes?: { label: string; prob: number; change24h: number | null }[] }) : {};
      const top = d.outcomes?.[0];
      // A near-certain market says nothing ("ceasefire holds through today: 99%"), nor does a long shot.
      const settled = top && (top.prob >= SETTLED || (d.outcomes!.length === 1 && top.prob <= 1 - SETTLED));
      return top && !settled ? [{ m: { title: r.title, titleVi: r.title_vi, url: r.url, label: top.label, prob: top.prob, change24h: top.change24h, fetchedAt: r.fetched_at }, vol: d.volume24hr ?? 0 }] : [];
    })
    .sort((a, b) => b.vol - a.vol)
    .slice(0, MAX_MARKETS)
    .map((x) => x.m);
}

// ---------------------------------------------------------------- all themes

export function themeStates(db: DatabaseSync, now = Date.now(), themes: ThemeDef[] = THEMES): ThemeState[] {
  const articles = db
    .prepare(
      `SELECT id, url, source, lang, region, topic, title, title_en, title_vi, title_key, published_at
       FROM articles WHERE published_at >= ? AND published_at <= ? ORDER BY published_at DESC`,
    )
    .all(now - NEWS_DAYS * DAY, now) as unknown as ArticleRow[];
  const markets = db.prepare("SELECT title, title_vi, url, data, fetched_at FROM items WHERE kind = 'polymarket'").all() as unknown as MarketRow[];
  return themes.map((def) => {
    const gauges = def.gauges.map((g) => readGauge(db, g, now));
    const heat = themeHeat(gauges);
    const facts = (ids: ThemeFactId[] | undefined) => (ids ?? []).flatMap((id) => readFact(db, id) ?? []);
    return {
      def,
      heat,
      status: statusOf(heat),
      gauges: gauges.filter((g): g is GaugeReading => g !== null),
      facts: facts(def.facts),
      vietnam: def.vietnam
        ? { gauges: def.vietnam.gauges.flatMap((g) => readGauge(db, g, now) ?? []), facts: facts(def.vietnam.facts) }
        : null,
      news: themeNews(articles, def.news, now),
      markets: themeMarkets(markets, def.markets, now),
    };
  });
}

// ---------------------------------------------------------------- for the AI

const isoDay = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/** A gauge as compact English: "Brent crude: $88.12 (2026-11-10), 1-month −12.3%, z −1.8". */
export function gaugeText(g: GaugeReading): string {
  const { def } = g;
  const value =
    def.unit === "₫" && Math.abs(g.value) >= 1e9
      ? `${round(g.value / 1e9, 0).toLocaleString("en-US")} billion VND`
      : `${def.unit === "$" ? "$" : ""}${round(g.value, def.digits).toLocaleString("en-US")}${def.unit === "%" ? "%" : def.unit === "bp" ? " bp" : def.unit === "₫" ? " VND" : ""}`;
  const asOf = def.freq ? fmtPeriod(g.ts, def.freq, "en", true) : isoDay(g.ts);
  let change = "";
  if (g.change !== null) {
    const abs = def.delta === "abs";
    const unit = !abs ? "%" : def.deltaUnit === "pp" || def.unit === "pp" ? " pp" : def.unit === "%" ? " pp" : def.unit === "bp" ? " bp" : "";
    const span = def.freq ? `since ${fmtPeriod(g.from!, def.freq, "en", true)}` : "over 1 month";
    change = `, ${span} ${g.change > 0 ? "+" : ""}${round(g.change, abs ? 2 : 1)}${unit}`;
  }
  return `${def.name.en}: ${value} (${asOf})${change}${g.heat === null ? "" : `, heat ${round(g.heat, 1)}`}`;
}

/** One theme as the AI notes read it: status, gauges, Vietnam channel, facts, odds and its headlines. */
export function themeForPrompt(t: ThemeState, headlines = true) {
  return {
    id: t.def.id as ThemeId,
    name: t.def.name.en,
    status: t.status,
    heat: t.heat === null ? null : round(t.heat, 2),
    heatMeans: t.def.heat.en,
    gauges: t.gauges.map(gaugeText),
    facts: t.facts.map((f) => f.text.en),
    vietnam: t.vietnam && {
      channel: t.def.vietnam!.text.en,
      readings: [...t.vietnam.gauges.map(gaugeText), ...t.vietnam.facts.map((f) => f.text.en)],
    },
    predictionMarkets: t.markets.map((m) => `${m.title} ${m.label}: ${Math.round(m.prob * 100)}%${m.change24h === null ? "" : ` (24h ${m.change24h > 0 ? "+" : ""}${Math.round(m.change24h * 100)} pts)`}`),
    newsCount: { last24h: t.news.day, last7d: t.news.week },
    ...(headlines ? { headlines: t.news.forPrompt.map((a) => `${a.source}: ${a.titleEn ?? a.title}`) } : {}),
  };
}
