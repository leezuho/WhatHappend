import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson, fetchText } from "./http";
import { replaceItems } from "./store";
import type { Source } from "./types";

// Bitcoin network state from mempool.space: block height (and the halving it
// counts down to), fee rates, the next difficulty adjustment and hashrate.

const BASE = "https://mempool.space/api";
const HALVING_INTERVAL = 210_000;
const TEN_MIN = 600_000;

const Difficulty = z.object({
  progressPercent: z.number(),
  difficultyChange: z.number(),
  estimatedRetargetDate: z.number(),
  remainingBlocks: z.number(),
  timeAvg: z.number(),
});
const Fees = z.object({ fastestFee: z.number(), halfHourFee: z.number(), hourFee: z.number(), economyFee: z.number() });
const Hashrate = z.object({
  hashrates: z.array(z.object({ timestamp: z.number(), avgHashrate: z.number() })),
  currentHashrate: z.number(),
});

export interface Halving {
  /** Height of the next halving block. */
  height: number;
  blocksLeft: number;
  eta: number;
  /** Block subsidy now and after the halving, in BTC. */
  subsidy: number;
  nextSubsidy: number;
}

/** Next halving from the tip height, timed at the recent average block interval (10 minutes if that looks off). */
export function halvingInfo(tip: number, now: number, avgBlockMs = TEN_MIN): Halving {
  const epoch = Math.floor(tip / HALVING_INTERVAL);
  const height = (epoch + 1) * HALVING_INTERVAL;
  const blocksLeft = height - tip;
  const interval = avgBlockMs > TEN_MIN / 2 && avgBlockMs < TEN_MIN * 2 ? avgBlockMs : TEN_MIN;
  return { height, blocksLeft, eta: now + blocksLeft * interval, subsidy: 50 / 2 ** epoch, nextSubsidy: 50 / 2 ** (epoch + 1) };
}

export interface BtcNetwork {
  tip: number;
  halving: Halving;
  fees: { fast: number; halfHour: number; hour: number; economy: number };
  difficulty: { progress: number; change: number; eta: number; blocksLeft: number };
  /** Hashes per second: now and about 30 days ago. */
  hashrate: number;
  hashrate30d: number | null;
}

export const mempool: Source = {
  id: "mempool",
  ...SOURCE_META.mempool,
  async run({ db }) {
    const tip = Number((await fetchText(`${BASE}/blocks/tip/height`)).trim());
    if (!Number.isInteger(tip) || tip <= 0) throw new Error("bad tip height from mempool.space");
    const [diff, fees, hr] = await Promise.all([
      fetchJson(`${BASE}/v1/difficulty-adjustment`, Difficulty),
      fetchJson(`${BASE}/v1/fees/recommended`, Fees),
      fetchJson(`${BASE}/v1/mining/hashrate/1m`, Hashrate),
    ]);
    const now = Date.now();
    const data: BtcNetwork = {
      tip,
      halving: halvingInfo(tip, now, diff.timeAvg),
      fees: { fast: fees.fastestFee, halfHour: fees.halfHourFee, hour: fees.hourFee, economy: fees.economyFee },
      difficulty: { progress: diff.progressPercent, change: diff.difficultyChange, eta: diff.estimatedRetargetDate, blocksLeft: diff.remainingBlocks },
      hashrate: hr.currentHashrate,
      hashrate30d: hr.hashrates[0]?.avgHashrate ?? null,
    };
    return replaceItems(db, "btc_network", [{ id: "btc", title: "Bitcoin", ts: now, data }]);
  },
};
