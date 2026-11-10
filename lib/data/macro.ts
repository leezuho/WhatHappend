import type { DatabaseSync } from "node:sqlite";
import { MACRO_COUNTRIES, policyRateId, type Country } from "@/config/countries";
import { imfCpiId, imfId, oecdId, type ScoreCol } from "@/config/macro";
import { SERIES, type Freq } from "@/config/series";
import { freshest, getPoints } from "@/lib/data/series";
import { pick, type Locale } from "@/lib/i18n";
import type { Point } from "@/lib/sources/store";
import {
  averageOfYears,
  clockTrail,
  cliStatus,
  cpiStatus,
  currencyChange,
  currencyStatus,
  currentAccountStatus,
  cyclePhase,
  debtStatus,
  gdpStatus,
  unemploymentRise,
  unemploymentStatus,
  type ClockPoint,
  type CyclePhase,
  type Status,
} from "@/lib/signals/macro";

// The world-macro scorecard and business-cycle clock as plain SQLite reads, shared by the web
// (lib/queries-macro.ts, behind connection()) and the worker (lib/ai/macronote.ts).

const DAY = 24 * 3600_000;

export interface ScoreCell {
  value: number | null;
  /** Period start of the reading; null for daily data, which needs no period label. */
  ts: number | null;
  freq: Freq | null;
  status: Status;
  /** IMF annual estimate standing in for a missing monthly or quarterly number. */
  est?: true;
  /** Leading indicator: direction over 3 months. */
  trend?: "up" | "down";
  /** FX column of the US row: the dollar index instead of a currency. */
  dxy?: true;
}

export interface ScoreRow {
  short: string;
  name: string;
  group: Country["group"];
  cells: Record<ScoreCol, ScoreCell>;
}

export const EMPTY: ScoreCell = { value: null, ts: null, freq: null, status: null };

/** Monthly CPI inflation candidates: OECD's and the IMF CPI dataset's; readers take whichever runs later. */
export const cpiIds = (c: Country) => [c.oecd && oecdId("CPI", c.oecd), imfCpiId(c.imf)];

export function lastPoint(db: DatabaseSync, id: string, now: number): Point | null {
  return (db.prepare("SELECT ts, value FROM observations WHERE series_id = ? AND ts <= ? ORDER BY ts DESC LIMIT 1").get(id, now) as Point | undefined) ?? null;
}

function liveQuote(db: DatabaseSync, id: string): number | null {
  return (db.prepare("SELECT price FROM quotes WHERE series_id = ?").get(id) as { price: number } | undefined)?.price ?? null;
}

/** An IMF annual reading for this year, as a fallback cell. */
export function imfCell(db: DatabaseSync, indicator: string, c: Country, year: number, judge: (v: number) => Status): ScoreCell {
  const ts = Date.UTC(year, 0, 1);
  const row = db.prepare("SELECT value FROM observations WHERE series_id = ? AND ts = ?").get(imfId(indicator, c.imf), ts) as { value: number } | undefined;
  return row ? { value: row.value, ts, freq: "y", status: judge(row.value), est: true } : EMPTY;
}

function scoreRow(db: DatabaseSync, c: Country, lang: Locale, now: number): ScoreRow {
  const year = new Date(now).getUTCFullYear();

  // Growth: latest quarter (OECD, or the World Bank where OECD has none), judged against the country's own 2015–19 average.
  const normal = averageOfYears(getPoints(db, imfId("NGDP_RPCH", c.imf)), 2015, 2019);
  const gdpQ = freshest(db, [c.oecd && oecdId("GDP", c.oecd), c.gdp], now)?.last;
  const gdp: ScoreCell = gdpQ
    ? {
        value: gdpQ.value,
        ts: gdpQ.ts,
        freq: "q",
        status: gdpStatus(gdpQ.value, normal),
      }
    : imfCell(db, "NGDP_RPCH", c, year, (v) => gdpStatus(v, normal));

  const cpiM = freshest(db, cpiIds(c), now)?.last;
  const cpi: ScoreCell = cpiM
    ? {
        value: cpiM.value,
        ts: cpiM.ts,
        freq: "m",
        status: cpiStatus(cpiM.value, c.cpiTarget),
      }
    : imfCell(db, "PCPIPCH", c, year, (v) => cpiStatus(v, c.cpiTarget));

  const unePts = c.oecd ? getPoints(db, oecdId("UNE", c.oecd), now - 450 * DAY) : [];
  const uneLast = unePts[unePts.length - 1];
  const unemp: ScoreCell = uneLast
    ? {
        value: uneLast.value,
        ts: uneLast.ts,
        freq: "m",
        status: unemploymentStatus(unemploymentRise(unePts)),
      }
    : imfCell(db, "LUR", c, year, () => null);

  const rateId = policyRateId(c);
  const rate = rateId ? lastPoint(db, rateId, now) : null;
  const policy: ScoreCell = rate ? { value: rate.value, ts: null, freq: null, status: null } : EMPTY;
  const real: ScoreCell =
    rate && cpi.value !== null
      ? {
          value: rate.value - cpi.value,
          ts: cpi.ts,
          freq: cpi.freq,
          status: null,
          est: cpi.est,
        }
      : EMPTY;

  // OECD monthly averages, or a daily yield where the country has a newer one (FRED for the US, CNBC for Indonesia).
  // A daily reading needs no period label unless it is more than a week old.
  const y10Pick = freshest(db, [c.y10, c.oecd && oecdId("IRLT", c.oecd)], now);
  const y10Daily = y10Pick !== null && y10Pick.id === c.y10;
  const y10Stale = y10Daily && now - y10Pick.last.ts > 7 * DAY;
  const y10: ScoreCell = y10Pick
    ? {
        value: y10Pick.last.value,
        ts: y10Daily && !y10Stale ? null : y10Pick.last.ts,
        freq: y10Daily ? (y10Stale ? "w" : null) : "m",
        status: null,
      }
    : EMPTY;

  const yearEnd = Date.UTC(year - 1, 11, 31);
  let fx: ScoreCell = EMPTY;
  if (c.fx) {
    const id = `yahoo:${c.fx.symbol}`;
    const change = currencyChange(getPoints(db, id, yearEnd - 20 * DAY), c.fx.perUsd, yearEnd, liveQuote(db, id) ?? undefined);
    if (change !== null)
      fx = {
        value: change,
        ts: null,
        freq: null,
        status: currencyStatus(change),
      };
  } else {
    // The dollar's own move, read as an index level (up = stronger dollar).
    const change = currencyChange(getPoints(db, SERIES.dxy.id, yearEnd - 20 * DAY), false, yearEnd, liveQuote(db, SERIES.dxy.id) ?? undefined);
    if (change !== null) fx = { value: change, ts: null, freq: null, status: null, dxy: true };
  }

  let cli: ScoreCell = EMPTY;
  if (c.oecd) {
    const last = clockTrail(getPoints(db, oecdId("CLI", c.oecd), now - 200 * DAY), 1).at(-1);
    if (last)
      cli = {
        value: last.gap + 100,
        ts: last.ts,
        freq: "m",
        status: cliStatus(last.gap, last.momentum),
        trend: last.momentum >= 0 ? "up" : "down",
      };
  }

  return {
    short: c.short,
    name: pick(c.name, lang),
    group: c.group,
    cells: {
      gdp,
      cpi,
      unemp,
      policy,
      real,
      y10,
      fx,
      cli,
      debt: imfCell(db, "GGXWDG_NGDP", c, year, debtStatus),
      ca: imfCell(db, "BCA_NGDPD", c, year, currentAccountStatus),
    },
  };
}

/** One scorecard row per macro-page economy. */
export function scorecardRows(db: DatabaseSync, lang: Locale, now: number): ScoreRow[] {
  return MACRO_COUNTRIES.map((c) => scoreRow(db, c, lang, now));
}

export interface ClockRow {
  short: string;
  name: string;
  phase: CyclePhase;
  /** Last 7 months, oldest first; the last point is "now". */
  trail: ClockPoint[];
}

/** Each economy's position on the business-cycle clock (countries without an OECD leading indicator are left out). */
export function cycleRows(db: DatabaseSync, lang: Locale, now: number): ClockRow[] {
  const since = now - 400 * DAY;
  return MACRO_COUNTRIES.flatMap((c) => {
    if (!c.oecd) return [];
    const trail = clockTrail(getPoints(db, oecdId("CLI", c.oecd), since), 7, 3);
    const last = trail[trail.length - 1];
    return last
      ? [
          {
            short: c.short,
            name: pick(c.name, lang),
            phase: cyclePhase(last.gap, last.momentum),
            trail,
          },
        ]
      : [];
  });
}
