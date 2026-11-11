import type { DatabaseSync } from "node:sqlite";
import { REGIME_IDS, SERIES } from "@/config/series";
import { WORLD_INDICES } from "@/config/markets";
import { computeRegime, mergeDaily, WINDOW_YEARS, type RegimeResult } from "@/lib/signals/risk-regime";
import { getPoints } from "./series";

// The risk regime's inputs as stored, for the top-bar badge and the worker's AI
// prompts alike (no Next imports here).

const DAY = 86_400_000;

export function regimeFromDb(db: DatabaseSync, now = Date.now()): RegimeResult {
  // A ten-year window plus room for the 200-session average and the 21-session change in front of it.
  const since = now - (WINDOW_YEARS * 365.25 + 400) * DAY;
  const p = (id: string, from = since) => getPoints(db, id, from);
  return computeRegime(
    {
      vix: mergeDaily(p(REGIME_IDS.vixHistory), p(SERIES.vix.id)),
      credit: p(REGIME_IDS.credit),
      dxy: p(SERIES.dxy.id),
      curve: p(SERIES.curve.id),
      fsi: p(SERIES.fsi.id),
      spx: mergeDaily(p(REGIME_IDS.spxHistory), p(SERIES.spx.id)),
      hy: p(SERIES.hy.id, now - 200 * DAY),
      markets: WORLD_INDICES.map((ix) => p(ix.id, now - 200 * DAY)),
    },
    now,
  );
}
