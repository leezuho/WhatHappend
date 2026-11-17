import YahooFinance from "yahoo-finance2";
import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { FUNDS_13F, type Fund13FDef } from "@/config/funds";
import { fetchJson, fetchText, htmlText } from "./http";
import { replaceItems } from "./store";
import type { Source } from "./types";

// What a fund bought and sold, from the 13F holdings report it files with the SEC within 45 days of each quarter's
// end: the latest report against the one before. data.sec.gov answers any client, but the filing archive on
// www.sec.gov refuses a User-Agent that names no contact, so the source runs only with SEC_USER_AGENT set.
//
// Only the rows shown get a ticker (OpenFIGI, keyless: 10 CUSIPs a request, 25 requests a minute) and today's price
// (Yahoo); both are best effort, a row without them still shows the issuer. A stock split between two reports reads
// as a huge buy (NVIDIA's 10-for-1 in June 2024 made every holder look like it bought 9 times its stake), so a shown
// row whose implied price moved by a split-like ratio is checked against Yahoo's split events and adjusted.

const DAY = 24 * 3600_000;
const ARCHIVE = "https://www.sec.gov/Archives/edgar/data";
/** Rows kept per side before tickers and splits are checked; a split can move a row out, so more than are shown. */
const CANDIDATES = 25;
/** Rows stored per side, and largest holdings stored. */
const SHOWN = 15;
const TOP = 10;
/** Split ratios checked, forward and reverse. */
const SPLIT_RATIOS = [2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 30, 40, 50];

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const Submissions = z.object({
  name: z.string(),
  filings: z.object({
    recent: z.object({
      accessionNumber: z.array(z.string()),
      form: z.array(z.string()),
      filingDate: z.array(z.string()),
      reportDate: z.array(z.string()),
    }),
  }),
});

const FilingIndex = z.object({ directory: z.object({ item: z.array(z.object({ name: z.string(), size: z.union([z.string(), z.number()]).nullish() })) }) });

const Figi = z.array(
  z.object({
    data: z.array(z.object({ ticker: z.string().nullish(), exchCode: z.string().nullish() })).nullish(),
    warning: z.string().nullish(),
    error: z.string().nullish(),
  }),
);

export interface Report13F {
  accession: string;
  filed: string;
  /** Quarter end, YYYY-MM-DD. */
  period: string;
}

/** One line of the holdings table, summed over the fund's sub-managers. */
export interface Position {
  cusip: string;
  name: string;
  cls: string;
  putCall: "Put" | "Call" | null;
  /** US dollars at the quarter's end. */
  value: number;
  shares: number;
}

export type MoveKind = "new" | "add" | "trim" | "exit" | "hold";

export interface Move {
  cusip: string;
  name: string;
  cls: string;
  putCall: "Put" | "Call" | null;
  ticker: string | null;
  shares: number;
  /** Last quarter's shares, in this quarter's terms when a split came between. */
  prevShares: number;
  value: number;
  prevValue: number;
  /** Quarter-end price implied by value ÷ shares; last quarter's for a position sold out. */
  price: number;
  /** Shares bought (+) or sold (−) valued at `price`. */
  flow: number;
  kind: MoveKind;
  /** Share of the reported book: this quarter's, last quarter's for a position sold out. */
  weight: number;
  /** Split applied to last quarter's shares (10 = 10-for-1), when Yahoo shows one between the two reports. */
  split: number | null;
  /** Latest price (Yahoo). */
  last: number | null;
  /** Price change from the quarter's end to `last`, split-adjusted, as a fraction; null for a position sold out. */
  sinceEnd: number | null;
}

/** Stored per fund (kind `fund13f`, id = `Fund13FDef.id`). */
export interface Fund13F {
  fund: string;
  /** Filer name as the SEC has it. */
  filer: string;
  period: string;
  prevPeriod: string;
  filed: string;
  accession: string;
  /** Filing index page on sec.gov. */
  url: string;
  total: number;
  prevTotal: number;
  positions: number;
  prevPositions: number;
  counts: Record<Exclude<MoveKind, "hold">, number>;
  /** Dollars bought and sold across every position (shares changed × quarter-end price). */
  bought: number;
  sold: number;
  buys: Move[];
  sells: Move[];
  top: Move[];
  /** When the `last` prices were read. */
  pricedAt: number | null;
}

/** The latest two original 13F-HR reports, newest first (amendments are not read). */
export function latestReports(recent: z.infer<typeof Submissions>["filings"]["recent"]): Report13F[] {
  const byPeriod = new Map<string, Report13F>();
  recent.form.forEach((form, i) => {
    const period = recent.reportDate[i];
    if (form !== "13F-HR" || !period) return;
    const prev = byPeriod.get(period);
    if (!prev || recent.filingDate[i] > prev.filed) byPeriod.set(period, { accession: recent.accessionNumber[i], filed: recent.filingDate[i], period });
  });
  return [...byPeriod.values()].sort((a, b) => b.period.localeCompare(a.period)).slice(0, 2);
}

/** The holdings table among a filing's documents: the XML that is not the cover page. */
export function infoTableName(names: string[]): string | null {
  const xml = names.filter((n) => /\.xml$/i.test(n) && n.toLowerCase() !== "primary_doc.xml");
  return xml.find((n) => /info|table|holding/i.test(n)) ?? xml[0] ?? null;
}

const tag = (block: string, name: string) => block.match(new RegExp(`<(?:\\w+:)?${name}>([^<]*)</(?:\\w+:)?${name}>`))?.[1].trim() ?? null;

/**
 * The holdings table, summed per CUSIP and option side; principal amounts (bonds) are left out of the positions but
 * counted in `total`. `valueScale` is 1000 for reports filed before 2023, which gave values in thousands.
 */
export function parseInfoTable(xml: string, valueScale = 1): { positions: Map<string, Position>; total: number } {
  const positions = new Map<string, Position>();
  let total = 0;
  for (const m of xml.matchAll(/<(?:\w+:)?infoTable>([\s\S]*?)<\/(?:\w+:)?infoTable>/g)) {
    const b = m[1];
    const cusip = tag(b, "cusip")?.toUpperCase();
    const value = Number(tag(b, "value")) * valueScale;
    const shares = Number(tag(b, "sshPrnamt"));
    if (!cusip || !Number.isFinite(value) || !Number.isFinite(shares)) throw new Error(`unreadable 13F row: ${b.replace(/\s+/g, " ").slice(0, 160)}`);
    total += value;
    if (tag(b, "sshPrnamtType") !== "SH") continue;
    const pc = tag(b, "putCall")?.toLowerCase();
    const putCall = pc === "put" ? "Put" : pc === "call" ? "Call" : null;
    const key = putCall ? `${cusip}:${putCall}` : cusip;
    const p = positions.get(key);
    if (p) {
      p.value += value;
      p.shares += shares;
    } else positions.set(key, { cusip, name: htmlText(tag(b, "nameOfIssuer") ?? cusip), cls: htmlText(tag(b, "titleOfClass") ?? ""), putCall, value, shares });
  }
  return { positions, total };
}

function kindOf(shares: number, prevShares: number): MoveKind {
  if (!prevShares) return "new";
  if (!shares) return "exit";
  return shares > prevShares ? "add" : shares < prevShares ? "trim" : "hold";
}

/** Shares changed valued at the quarter-end price; `flow` and `kind` recomputed for split-adjusted last-quarter shares. */
function settle(m: Omit<Move, "flow" | "kind">): Move {
  return { ...m, kind: kindOf(m.shares, m.prevShares), flow: (m.shares - m.prevShares) * m.price };
}

/** Every position in either report, with what changed between them. */
export function diffHoldings(cur: Map<string, Position>, prev: Map<string, Position>, total: number, prevTotal: number): Move[] {
  const out: Move[] = [];
  for (const key of new Set([...cur.keys(), ...prev.keys()])) {
    const c = cur.get(key);
    const p = prev.get(key);
    const base = (c ?? p)!;
    const shares = c?.shares ?? 0;
    const prevShares = p?.shares ?? 0;
    const price = shares ? c!.value / shares : prevShares ? p!.value / prevShares : 0;
    out.push(
      settle({
        cusip: base.cusip,
        name: base.name,
        cls: base.cls,
        putCall: base.putCall,
        ticker: null,
        shares,
        prevShares,
        value: c?.value ?? 0,
        prevValue: p?.value ?? 0,
        price,
        weight: c ? c.value / total : (p?.value ?? 0) / prevTotal,
        split: null,
        last: null,
        sinceEnd: null,
      }),
    );
  }
  return out;
}

/** A price ratio within 3% of a whole split (2-for-1 … 50-for-1) or reverse split: worth asking Yahoo about. */
export function splitLike(ratio: number): boolean {
  return Number.isFinite(ratio) && ratio > 0 && SPLIT_RATIOS.some((k) => Math.abs(ratio / k - 1) < 0.03 || Math.abs(ratio * k - 1) < 0.03);
}

/** Last quarter's shares restated after a split (`factor` new shares per old one). */
export function withSplit(m: Move, factor: number): Move {
  return settle({ ...m, prevShares: m.prevShares * factor, split: factor });
}

/** Product of the splits dated after `from` and up to `to` (ms epoch). */
export function splitFactor(splits: { date: Date; numerator: number; denominator: number }[], from: number, to: number): number {
  return splits.filter((s) => s.date.getTime() > from && s.date.getTime() <= to && s.denominator > 0).reduce((f, s) => f * (s.numerator / s.denominator), 1);
}

/** OpenFIGI's ticker in Yahoo's spelling ("BRK/B" → "BRK-B"). */
const yahooSymbol = (ticker: string) => ticker.replace(/\//g, "-");

async function tickersFor(cusips: string[], log: (msg: string) => void): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < cusips.length; i += 10) {
    const batch = cusips.slice(i, i + 10);
    try {
      const res = await fetchJson("https://api.openfigi.com/v3/mapping", Figi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch.map((c) => ({ idType: "ID_CUSIP", idValue: c, exchCode: "US" }))),
      });
      res.forEach((r, j) => {
        const t = r.data?.find((d) => d.ticker)?.ticker;
        if (t) out.set(batch[j], yahooSymbol(t));
      });
    } catch (e) {
      log(`OpenFIGI: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

async function quotesFor(symbols: string[], log: (msg: string) => void): Promise<Map<string, number>> {
  if (!symbols.length) return new Map();
  try {
    const qs = await yf.quote(symbols, { return: "array" });
    return new Map(qs.flatMap((q) => (typeof q.regularMarketPrice === "number" ? [[q.symbol, q.regularMarketPrice] as const] : [])));
  } catch (e) {
    log(`Yahoo quotes: ${e instanceof Error ? e.message : String(e)}`);
    return new Map();
  }
}

async function splitsFor(symbol: string, from: number, log: (msg: string) => void) {
  try {
    const c = await yf.chart(symbol, { period1: new Date(from), interval: "1d", events: "split" });
    return c.events?.splits ?? [];
  } catch (e) {
    log(`Yahoo splits ${symbol}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

const secHeaders = () => ({ "User-Agent": process.env.SEC_USER_AGENT ?? "" });
const quarterEnd = (period: string) => Date.parse(`${period}T21:00:00Z`);

async function readReport(cik: number, r: Report13F): Promise<{ positions: Map<string, Position>; total: number }> {
  const dir = `${ARCHIVE}/${cik}/${r.accession.replace(/-/g, "")}`;
  const index = await fetchJson(`${dir}/index.json`, FilingIndex, { headers: secHeaders() });
  const name = infoTableName(index.directory.item.map((i) => i.name));
  if (!name) throw new Error(`no holdings table in ${r.accession}`);
  const xml = await fetchText(`${dir}/${name}`, { headers: secHeaders(), timeoutMs: 60_000 });
  const parsed = parseInfoTable(xml, r.filed < "2023-01-03" ? 1000 : 1);
  if (!parsed.positions.size) throw new Error(`empty holdings table in ${r.accession}`);
  return parsed;
}

async function fundMoves(def: Fund13FDef, log: (msg: string) => void): Promise<Fund13F> {
  const cik10 = String(def.cik).padStart(10, "0");
  const sub = await fetchJson(`https://data.sec.gov/submissions/CIK${cik10}.json`, Submissions, { headers: secHeaders() });
  const [latest, previous] = latestReports(sub.filings.recent);
  if (!latest || !previous) throw new Error(`${def.id}: fewer than two 13F-HR reports among the recent filings`);
  const [cur, prev] = await Promise.all([readReport(def.cik, latest), readReport(def.cik, previous)]);
  const moves = diffHoldings(cur.positions, prev.positions, cur.total, prev.total);

  // Tickers, splits and prices only for the rows that can be shown.
  const byFlow = [...moves].sort((a, b) => b.flow - a.flow);
  const pool = [
    ...new Set([
      ...byFlow.filter((m) => m.flow > 0).slice(0, CANDIDATES),
      ...byFlow.filter((m) => m.flow < 0).slice(-CANDIDATES),
      ...moves.filter((m) => m.shares > 0).sort((a, b) => b.value - a.value).slice(0, TOP),
    ]),
  ];
  const tickers = await tickersFor([...new Set(pool.map((m) => m.cusip))], log);
  const symbols = [...new Set(pool.flatMap((m) => tickers.get(m.cusip) ?? []))];
  const quotes = await quotesFor(symbols, log);
  const pricedAt = quotes.size ? Date.now() : null;
  const prevEnd = quarterEnd(previous.period);
  const curEnd = quarterEnd(latest.period);
  const splitCache = new Map<string, ReturnType<typeof splitsFor>>();
  const enriched = await Promise.all(
    pool.map(async (m0) => {
      const ticker = tickers.get(m0.cusip) ?? null;
      let m: Move = { ...m0, ticker };
      if (!ticker) return m;
      // A position sold out has no price at this quarter's end to measure from.
      const last = quotes.get(ticker) ?? null;
      const held = m.shares > 0 && m.price > 0;
      const prevPrice = m.prevShares ? m.prevValue / m.prevShares : 0;
      const askBetween = held && m.prevShares > 0 && splitLike(prevPrice / m.price);
      const askSince = held && last !== null && splitLike(m.price / last);
      let since = 1;
      if (askBetween || askSince) {
        let pending = splitCache.get(ticker);
        if (!pending) splitCache.set(ticker, (pending = splitsFor(ticker, prevEnd - DAY, log)));
        const splits = await pending;
        if (splits) {
          const between = splitFactor(splits, prevEnd, curEnd);
          if (askBetween && between !== 1) m = withSplit(m, between);
          since = splitFactor(splits, curEnd, Date.now());
        }
      }
      return { ...m, last, sinceEnd: held && last !== null ? (last * since) / m.price - 1 : null };
    }),
  );
  const split = enriched.filter((m) => m.split);
  if (split.length) log(`split-adjusted: ${split.map((m) => `${m.ticker} ×${m.split}`).join(", ")}`);
  const sorted = enriched.sort((a, b) => b.flow - a.flow);

  const counts = { new: 0, add: 0, trim: 0, exit: 0 };
  let bought = 0;
  let sold = 0;
  const adjusted = new Map(enriched.map((m) => [`${m.cusip}:${m.putCall}`, m]));
  for (const m0 of moves) {
    const m = adjusted.get(`${m0.cusip}:${m0.putCall}`) ?? m0;
    if (m.kind !== "hold") counts[m.kind]++;
    if (m.flow > 0) bought += m.flow;
    else sold -= m.flow;
  }
  const dir = `${ARCHIVE}/${def.cik}/${latest.accession.replace(/-/g, "")}`;
  return {
    fund: def.id,
    filer: sub.name,
    period: latest.period,
    prevPeriod: previous.period,
    filed: latest.filed,
    accession: latest.accession,
    url: `${dir}/${latest.accession}-index.htm`,
    total: cur.total,
    prevTotal: prev.total,
    positions: cur.positions.size,
    prevPositions: prev.positions.size,
    counts,
    bought,
    sold,
    buys: sorted.filter((m) => m.flow > 0).slice(0, SHOWN),
    sells: sorted.filter((m) => m.flow < 0).reverse().slice(0, SHOWN),
    top: enriched.filter((m) => m.shares > 0).sort((a, b) => b.value - a.value).slice(0, TOP),
    pricedAt,
  };
}

export const sec13f: Source = {
  id: "sec13f",
  ...SOURCE_META.sec13f,
  async run({ db, log }) {
    const rows = [];
    for (const def of FUNDS_13F) {
      const d = await fundMoves(def, log);
      const tickered = [...d.buys, ...d.sells, ...d.top].filter((m) => m.ticker).length;
      log(
        `${def.id}: ${d.period} (filed ${d.filed}) against ${d.prevPeriod}, ${d.positions} positions, ` +
          `${d.counts.new} new, ${d.counts.exit} sold out; ${tickered}/${d.buys.length + d.sells.length + d.top.length} shown rows with a ticker`,
      );
      rows.push({ id: def.id, title: d.filer, url: d.url, ts: Date.parse(`${d.filed}T00:00:00Z`), data: d });
    }
    return replaceItems(db, "fund13f", rows);
  },
};
