import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { MACRO_COUNTRIES, policyRateId, type Country } from "@/config/countries";
import { bisId, imfId, oecdId, WORLD_MAP, type OecdCode } from "@/config/macro";
import { freshest, getPoints } from "@/lib/data/series";
import {
  cpiIds,
  uneIds,
  uneRise,
  cycleRows,
  EMPTY,
  growthInflation,
  imfCell,
  lastPoint,
  scorecardRows,
  usCpiParts,
  type ClockRow,
  type CpiPartsView,
  type GrowthInflationPoint,
  type ScoreCell,
  type ScoreRow,
} from "@/lib/data/macro";
import { surpriseView, type SurpriseView } from "@/lib/data/surprise";
import { aiStatus } from "@/lib/ai/config";
import { MACRO_NOTE_KEY, type NoteView, type StoredMacroNote } from "@/lib/ai/macronote-shared";
import { pick, type Locale } from "@/lib/i18n";
import type { Point } from "@/lib/sources/store";
import {
  budgetStatus,
  creditGapStatus,
  cpiStatus,
  debtStatus,
  deviationFromAverage,
  difference,
  monthlyLast,
  unemploymentStatus,
  type Status,
} from "@/lib/signals/macro";

export type { ClockRow, GrowthInflationPoint, ScoreCell, ScoreRow } from "@/lib/data/macro";
export type { ScoredRelease, SurpriseLine, SurpriseView } from "@/lib/data/surprise";

/** US data against the consensus forecast: the home-made growth and inflation surprise indices (lib/data/surprise.ts). */
export async function getSurprise(): Promise<SurpriseView> {
  await connection();
  return surpriseView(getDb());
}

// Read side of the world-macro page (app/[lang]/macro). Same rules as
// lib/queries.ts: synchronous SQLite reads behind connection(). The scorecard
// and cycle clock themselves live in lib/data/macro.ts, which the worker shares.

const DAY = 24 * 3600_000;

export async function getScorecard(lang: Locale): Promise<ScoreRow[]> {
  await connection();
  return scorecardRows(getDb(), lang, Date.now());
}

export async function getCycleClock(lang: Locale): Promise<ClockRow[]> {
  await connection();
  return cycleRows(getDb(), lang, Date.now());
}

export async function getUsCpiParts(lang: Locale): Promise<CpiPartsView> {
  await connection();
  return usCpiParts(getDb(), lang);
}

export async function getGrowthInflation(lang: Locale): Promise<GrowthInflationPoint[]> {
  await connection();
  return growthInflation(getDb(), lang, Date.now());
}


// ---------------------------------------------------------------- theme panels

export interface CountryLine {
  short: string;
  name: string;
  points: Point[];
  /** Second line on the same axis (the real rate under the policy rate). */
  points2?: Point[];
  /** Per-country reference level: the central bank's inflation target. */
  refValue?: number;
  status?: Status;
}

/**
 * One monthly series per country for the small multiples, from `months` ago: OECD's, except CPI (OECD's or the IMF's)
 * and unemployment (OECD's or the statistics office's, `Country.une`), whichever runs later. Countries with no data are left out.
 */
export async function getOecdLines(code: OecdCode, lang: Locale, months = 24): Promise<CountryLine[]> {
  await connection();
  const db = getDb();
  const now = Date.now();
  const since = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() - months, 1);
  return MACRO_COUNTRIES.flatMap((c) => {
    const id = code === "CPI" ? freshest(db, cpiIds(c), now)?.id : code === "UNE" ? freshest(db, uneIds(c), now)?.id : c.oecd && oecdId(code, c.oecd);
    if (!id) return [];
    // node:sqlite rows have a null prototype, which React will not hand to a client component.
    const points = getPoints(db, id, since).flatMap((p) => (p.ts <= now ? [{ ts: p.ts, value: p.value }] : []));
    const last = points[points.length - 1];
    if (!last) return [];
    const line: CountryLine = {
      short: c.short,
      name: pick(c.name, lang),
      points,
    };
    if (code === "CPI")
      return [
        {
          ...line,
          refValue: c.cpiTarget,
          status: cpiStatus(last.value, c.cpiTarget),
        },
      ];
    if (code === "UNE")
      return [
        {
          ...line,
          status: unemploymentStatus(uneRise(c, id, getPoints(db, id, now - 450 * DAY).filter((p) => p.ts <= now))),
        },
      ];
    return [line];
  });
}

/**
 * Policy rate (month-end; BIS, or the country's own source) and real rate (policy − that month's CPI inflation, OECD or
 * IMF) per central bank: the euro members share one row, the euro area's.
 */
export async function getPolicyLines(lang: Locale, months = 36): Promise<CountryLine[]> {
  await connection();
  const db = getDb();
  const now = Date.now();
  const since = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() - months, 1);
  const seen = new Set<string>();
  return MACRO_COUNTRIES.flatMap((c) => {
    const rateId = policyRateId(c);
    if (!rateId || seen.has(rateId)) return [];
    seen.add(rateId);
    const policy = monthlyLast(getPoints(db, rateId, since));
    if (!policy.length) return [];
    const cpiId = freshest(db, cpiIds(c), now)?.id;
    const cpi = cpiId ? getPoints(db, cpiId, since) : [];
    return [
      {
        short: c.short,
        name: pick(c.name, lang),
        points: policy,
        points2: difference(policy, cpi),
      },
    ];
  });
}

export interface ReerRow {
  short: string;
  name: string;
  /** % above (+) or below (−) the decade's average: dearer or cheaper than usual for foreigners. */
  deviation: number;
  ts: number;
}

/** Real effective exchange rates (BIS, broad basket) against their 10-year averages, dearest first. */
export async function getReer(lang: Locale): Promise<ReerRow[]> {
  await connection();
  const db = getDb();
  const since = Date.now() - 10 * 365 * DAY;
  return MACRO_COUNTRIES.flatMap((c) => {
    if (!c.bisArea) return [];
    const pts = getPoints(db, bisId("REER", c.bisArea), since);
    const dev = deviationFromAverage(pts);
    return dev === null
      ? []
      : [
          {
            short: c.short,
            name: pick(c.name, lang),
            deviation: dev,
            ts: pts[pts.length - 1].ts,
          },
        ];
  }).sort((a, b) => b.deviation - a.deviation);
}

export interface ConfidenceCell {
  value: number;
  ts: number;
  /** Change over 3 months. */
  change: number | null;
}

export interface ConfidenceRow {
  short: string;
  name: string;
  consumer: ConfidenceCell | null;
  business: ConfidenceCell | null;
}

/** OECD consumer (CCI) and business (BCI) confidence, latest month and its 3-month change. */
export async function getConfidence(lang: Locale): Promise<ConfidenceRow[]> {
  await connection();
  const db = getDb();
  const since = Date.now() - 200 * DAY;
  const cell = (id: string): ConfidenceCell | null => {
    const pts = getPoints(db, id, since);
    const last = pts[pts.length - 1];
    if (!last) return null;
    const back = pts.length > 3 ? pts[pts.length - 4] : null;
    return {
      value: last.value,
      ts: last.ts,
      change: back ? last.value - back.value : null,
    };
  };
  return MACRO_COUNTRIES.flatMap((c) => {
    if (!c.oecd) return [];
    const row = {
      short: c.short,
      name: pick(c.name, lang),
      consumer: cell(oecdId("CCI", c.oecd)),
      business: cell(oecdId("BCI", c.oecd)),
    };
    return row.consumer || row.business ? [row] : [];
  });
}

export interface DebtRow {
  short: string;
  name: string;
  group: Country["group"];
  /** IMF, this year. */
  debt: ScoreCell;
  /** Change of the debt ratio since 2019, in pp. */
  debtSince2019: number | null;
  /** IMF, this year: general government net lending/borrowing, % of GDP. */
  balance: ScoreCell;
  /** BIS, latest quarter. */
  creditGap: ScoreCell;
}

/** Public debt, budget balance and private credit gap per economy. */
export async function getDebtTable(lang: Locale): Promise<{ year: number; rows: DebtRow[] }> {
  await connection();
  const db = getDb();
  const now = Date.now();
  const year = new Date(now).getUTCFullYear();
  const rows = MACRO_COUNTRIES.map((c): DebtRow => {
    const debt = imfCell(db, "GGXWDG_NGDP", c, year, debtStatus);
    const before = db.prepare("SELECT value FROM observations WHERE series_id = ? AND ts = ?").get(imfId("GGXWDG_NGDP", c.imf), Date.UTC(2019, 0, 1)) as
      { value: number } | undefined;
    const gap = c.bisArea ? lastPoint(db, bisId("GAP", c.bisArea), now) : null;
    return {
      short: c.short,
      name: pick(c.name, lang),
      group: c.group,
      debt,
      debtSince2019: debt.value !== null && before ? debt.value - before.value : null,
      balance: imfCell(db, "GGXCNL_NGDP", c, year, budgetStatus),
      creditGap: gap
        ? {
            value: gap.value,
            ts: gap.ts,
            freq: "q",
            status: creditGapStatus(gap.value),
          }
        : EMPTY,
    };
  });
  return { year, rows };
}

// ---------------------------------------------------------------- weekly AI note

export type MacroNoteView = NoteView;

/** The latest weekly macro note (lib/ai/macronote.ts) in the page's language, and whether an AI key is set. */
export async function getMacroNote(lang: Locale): Promise<{ note: MacroNoteView | null; hasKey: boolean }> {
  await connection();
  const row = getDb().prepare("SELECT value FROM kv WHERE key = ?").get(MACRO_NOTE_KEY) as { value: string | null } | undefined;
  const stored = row?.value ? (JSON.parse(row.value) as StoredMacroNote) : null;
  return {
    note: stored ? { text: stored[lang], week: stored.week, createdAt: stored.createdAt, model: stored.model } : null,
    hasKey: aiStatus().ok,
  };
}

// ---------------------------------------------------------------- world map

export interface WorldMapMetric {
  ind: string;
  name: string;
  kind: "diverging" | "sequential";
  thresholds: number[];
  signed: boolean;
  /** IMF DataMapper code → this year's value, every economy the IMF covers (aggregates included; the map ignores them). */
  values: Record<string, number>;
}

/** This year's IMF growth and inflation for every economy, for the choropleth. */
export async function getWorldMap(lang: Locale): Promise<{ year: number; metrics: WorldMapMetric[] }> {
  await connection();
  const db = getDb();
  const year = new Date().getUTCFullYear();
  const stmt = db.prepare("SELECT series_id, value FROM observations WHERE series_id LIKE ? ESCAPE '\\' AND ts = ?");
  const metrics = WORLD_MAP.map((m) => {
    const prefix = imfId(m.ind, "");
    const rows = stmt.all(`${prefix.replace(/_/g, "\\_")}%`, Date.UTC(year, 0, 1)) as { series_id: string; value: number }[];
    return {
      ind: m.ind,
      name: pick(m.name, lang),
      kind: m.kind,
      thresholds: m.thresholds,
      signed: m.signed === true,
      values: Object.fromEntries(rows.map((r) => [r.series_id.slice(prefix.length), r.value])),
    };
  });
  return { year, metrics };
}

