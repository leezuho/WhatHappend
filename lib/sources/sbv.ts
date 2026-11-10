import { SOURCE_META } from "@/config/sources";
import { SBV_REFI } from "@/config/countries";
import { SBV_CHECKED, SBV_RECHECK_DAYS, SBV_REFI_STEPS, type RateStep } from "@/config/policy-rates";
import { dayTs, upsertSeries, type Point } from "./store";
import { DAY, type Source } from "./types";

// State Bank of Vietnam refinancing rate. BIS publishes no policy rate for
// Vietnam and the SBV website turns automated clients away, so the decisions
// are declared in config/policy-rates.ts; this source only writes them as a
// daily series (like BIS's) so the pages read every policy rate the same way.
// It fails once the declaration has gone unchecked for too long, so a missed
// decision shows up as a source error instead of a silently wrong number.

/** Rate steps → one point per day from the first step to `until` (UTC midnight). */
export function expandSteps(steps: RateStep[], until: number): Point[] {
  const sorted = steps.map((s) => ({ ts: Date.parse(`${s.from}T00:00:00Z`), rate: s.rate })).sort((a, b) => a.ts - b.ts);
  if (sorted.some((s) => !Number.isFinite(s.ts))) throw new Error("bad date in policy-rate steps");
  const points: Point[] = [];
  for (const [i, s] of sorted.entries()) {
    const end = Math.min(sorted[i + 1]?.ts ?? Infinity, until + DAY);
    for (let ts = s.ts; ts < end; ts += DAY) points.push({ ts, value: s.rate });
  }
  return points;
}

export const sbv: Source = {
  id: "sbv",
  ...SOURCE_META.sbv,
  async run({ db, log }) {
    const now = Date.now();
    const age = Math.floor((now - Date.parse(`${SBV_CHECKED}T00:00:00Z`)) / DAY);
    if (!(age <= SBV_RECHECK_DAYS))
      throw new Error(`SBV refinancing rate last checked ${SBV_CHECKED} (${age} days ago): confirm it on sbv.gov.vn and update config/policy-rates.ts`);
    const last = SBV_REFI_STEPS[SBV_REFI_STEPS.length - 1];
    log(`refinancing ${last.rate}% since ${last.from} (${last.decision}), checked ${SBV_CHECKED}`);
    return upsertSeries(db, SBV_REFI, "sbv", expandSteps(SBV_REFI_STEPS, dayTs(now)));
  },
};
