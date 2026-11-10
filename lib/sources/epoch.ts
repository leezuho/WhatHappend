import { SOURCE_META } from "@/config/sources";
import { fetchText, parseCsv } from "./http";
import { replaceItems } from "./store";
import type { Source } from "./types";

// Training compute of notable AI models from Epoch AI's public dataset (one
// CSV, about 2 MB, keyless): the largest training runs, and how fast the
// frontier grows. "Frontier" here is Epoch's usual cut: a model that was in
// the top 10 by training compute among all models released up to its date.

const URL = "https://epoch.ai/data/notable_ai_models.csv";
const YEAR = 365.25 * 24 * 3600_000;
const TOP = 12;
/** The growth fit starts here: deep learning's large-scale era. */
const FIT_FROM = Date.UTC(2018, 0, 1);

export interface ComputeModel {
  model: string;
  org: string;
  /** Publication date, ms UTC. */
  date: number;
  /** Training compute, FLOP. */
  flop: number;
  domain: string | null;
}

export interface ComputeSummary {
  top: ComputeModel[];
  /** Frontier training compute multiplies by this much per year (log-linear fit since FIT_FROM). */
  growthPerYear: number | null;
  frontierCount: number;
  /** Models in the file with a compute figure. */
  withCompute: number;
}

/** Rows of the CSV with a model name, a parsable date and a positive compute figure. */
export function computeModels(rows: string[][]): ComputeModel[] {
  const head = rows[0] ?? [];
  const col = (name: string) => head.indexOf(name);
  const [m, o, d, f, dom] = [col("Model"), col("Organization"), col("Publication date"), col("Training compute (FLOP)"), col("Domain")];
  if ([m, d, f].some((i) => i < 0)) throw new Error(`unexpected header: ${head.slice(0, 10).join(",")}`);
  return rows.slice(1).flatMap((r) => {
    const flop = Number(r[f]);
    const date = Date.parse(`${r[d]}T00:00:00Z`);
    if (!r[m] || !Number.isFinite(flop) || flop <= 0 || !Number.isFinite(date)) return [];
    return [{ model: r[m].trim(), org: (r[o] ?? "").split(",")[0].trim(), date, flop, domain: r[dom]?.split(",")[0].trim() || null }];
  });
}

/** Models that were in the top 10 by compute among everything released up to their date. */
export function frontier(models: ComputeModel[], topN = 10): ComputeModel[] {
  const sorted = [...models].sort((a, b) => a.date - b.date);
  const best: number[] = [];
  const out: ComputeModel[] = [];
  for (const x of sorted) {
    if (best.length < topN || x.flop > best[best.length - 1]) out.push(x);
    best.push(x.flop);
    best.sort((a, b) => b - a);
    best.length = Math.min(best.length, topN);
  }
  return out;
}

/** Growth factor per year of log10(compute) against time, least squares; null with fewer than 5 points. */
export function growthPerYear(points: { date: number; flop: number }[]): number | null {
  if (points.length < 5) return null;
  const xs = points.map((p) => p.date / YEAR);
  const ys = points.map((p) => Math.log10(p.flop));
  const mx = xs.reduce((a, v) => a + v, 0) / xs.length;
  const my = ys.reduce((a, v) => a + v, 0) / ys.length;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  return 10 ** slope;
}

export const epoch: Source = {
  id: "epoch",
  ...SOURCE_META.epoch,
  async run({ db }) {
    const models = computeModels(parseCsv(await fetchText(URL, { timeoutMs: 60_000 })));
    if (models.length < 100) throw new Error(`only ${models.length} models with a compute figure`);
    const front = frontier(models).filter((x) => x.date >= FIT_FROM);
    const summary: ComputeSummary = {
      top: [...models].sort((a, b) => b.flop - a.flop).slice(0, TOP),
      growthPerYear: growthPerYear(front),
      frontierCount: front.length,
      withCompute: models.length,
    };
    return replaceItems(db, "ai_compute", [{ id: "summary", title: "Epoch AI notable models", ts: Date.now(), data: summary }]);
  },
};
