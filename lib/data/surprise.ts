import type { DatabaseSync } from "node:sqlite";
import { SURPRISE_CLIP, SURPRISE_DEFS, SURPRISE_HALF_LIFE_DAYS, SURPRISE_MIN_RELEASES, SURPRISE_WINDOW_DAYS, surpriseId, type SurpriseDef, type SurpriseGroup } from "@/config/surprise";
import { fmtNumber } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { Point } from "@/lib/sources/store";
import { getPoints } from "./series";

// Home-made US economic surprise indices in the manner of Citi's (config/surprise.ts):
// each release's actual minus the consensus, divided by the indicator's typical
// surprise, signed so that + is a stronger economy (growth) or hotter prices
// (inflation); the index is the weighted mean over the last three months, recent
// releases weighing more, × 100. 0 = data in line with forecasts, +100 = one
// typical surprise above them on average. Plain SQL, no Next imports.

const DAY = 86_400_000;

export interface ScoredRelease {
  def: SurpriseDef;
  ts: number;
  actual: number;
  cons: number;
  /** Signed, clipped surprise in typical surprises; null while the indicator has too few releases to know what is typical. */
  z: number | null;
}

/** A release's figure as the calendar prints it: "0.3%", "165K", "1.36M", "54.5". */
export function figureText(def: SurpriseDef, v: number, lang: Locale): string {
  if (def.kind === "pct") return `${fmtNumber(v, lang, def.digits)}%`;
  if (def.kind === "count") return `${fmtNumber(v / (def.unit === "M" ? 1e6 : 1e3), lang, def.digits)}${def.unit ?? ""}`;
  return fmtNumber(v, lang, def.digits);
}

/** Root mean square of past surprises: the size of a typical miss, around zero rather than around a bias. */
export function typicalSurprise(diffs: number[]): number | null {
  if (diffs.length < SURPRISE_MIN_RELEASES) return null;
  const rms = Math.sqrt(diffs.reduce((s, d) => s + d * d, 0) / diffs.length);
  return rms > 0 ? rms : null;
}

/** Score every stored release of `defs`: `byKey` holds each indicator's actual and consensus by release time. */
export function scoreReleases(byKey: Map<string, { actual: Point[]; cons: Point[] }>, defs: SurpriseDef[] = SURPRISE_DEFS): ScoredRelease[] {
  const out: ScoredRelease[] = [];
  for (const def of defs) {
    const s = byKey.get(def.key);
    if (!s) continue;
    const consAt = new Map(s.cons.map((p) => [p.ts, p.value]));
    const rows = s.actual.flatMap((p) => {
      const c = consAt.get(p.ts);
      return c === undefined ? [] : [{ ts: p.ts, actual: p.value, cons: c }];
    });
    const sigma = typicalSurprise(rows.map((r) => r.actual - r.cons));
    for (const r of rows) {
      const z = sigma === null ? null : Math.max(-SURPRISE_CLIP, Math.min(SURPRISE_CLIP, (def.sign * (r.actual - r.cons)) / sigma));
      out.push({ def, ...r, z });
    }
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/** Weight of a release in the index at `at`: the indicator's weight, halving every SURPRISE_HALF_LIFE_DAYS; 0 outside the window. */
export function releaseWeight(r: ScoredRelease, at: number): number {
  const age = at - r.ts;
  if (age < 0 || age >= SURPRISE_WINDOW_DAYS * DAY || r.z === null) return 0;
  return r.def.weight * 0.5 ** (age / (SURPRISE_HALF_LIFE_DAYS * DAY));
}

/** The group's index at `at`; null when no scored release falls in the window. */
export function surpriseIndex(releases: ScoredRelease[], group: SurpriseGroup, at: number): number | null {
  let sw = 0;
  let swz = 0;
  for (const r of releases) {
    if (r.def.group !== group) continue;
    const w = releaseWeight(r, at);
    if (!w) continue;
    sw += w;
    swz += w * r.z!;
  }
  return sw ? (swz / sw) * 100 : null;
}

export interface SurpriseLine {
  value: number | null;
  /** The index a month earlier. */
  monthAgo: number | null;
  /** Weekly, from three months after the first release (a full window). */
  history: Point[];
  /** Releases in the current window with their share of the index (points; they add up to it), the largest pull first. */
  drivers: (ScoredRelease & { pull: number })[];
}

export interface SurpriseView {
  /** Latest release stored. */
  asOf: number | null;
  growth: SurpriseLine;
  inflation: SurpriseLine;
  /** Latest scored releases, newest first. */
  recent: ScoredRelease[];
}

function line(releases: ScoredRelease[], group: SurpriseGroup, now: number): SurpriseLine {
  const mine = releases.filter((r) => r.def.group === group && r.z !== null);
  const history: Point[] = [];
  if (mine.length) {
    // Weekly points ending today, so the last point is the current reading.
    const start = mine[0].ts + SURPRISE_WINDOW_DAYS * DAY;
    for (let t = now; t >= start; t -= 7 * DAY) {
      const v = surpriseIndex(mine, group, t);
      if (v !== null) history.push({ ts: t, value: v });
    }
    history.reverse();
  }
  const total = mine.reduce((s, r) => s + releaseWeight(r, now), 0);
  const drivers = mine
    .map((r) => ({ ...r, pull: total ? ((releaseWeight(r, now) * r.z!) / total) * 100 : 0 }))
    .filter((r) => r.pull !== 0)
    .sort((a, b) => Math.abs(b.pull) - Math.abs(a.pull));
  return { value: surpriseIndex(mine, group, now), monthAgo: surpriseIndex(mine, group, now - 30 * DAY), history, drivers };
}

export function surpriseView(db: DatabaseSync, now = Date.now(), recentCount = 12): SurpriseView {
  const byKey = new Map(SURPRISE_DEFS.map((d) => [d.key, { actual: getPoints(db, surpriseId(d.key, "actual")), cons: getPoints(db, surpriseId(d.key, "cons")) }]));
  const releases = scoreReleases(byKey).filter((r) => r.ts <= now);
  return {
    asOf: releases.length ? releases[releases.length - 1].ts : null,
    growth: line(releases, "growth", now),
    inflation: line(releases, "inflation", now),
    recent: releases
      .filter((r) => r.z !== null)
      .slice(-recentCount)
      .reverse(),
  };
}
