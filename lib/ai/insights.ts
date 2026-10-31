import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { tx } from "@/lib/db";
import { fmtDelta, fmtValue } from "@/lib/format";
import { findNotables, type Notable, type Reason } from "@/lib/signals/notable";
import type { Source } from "@/lib/sources/types";
import { generateJson } from "./provider";
import { recentHeadlines } from "./brief";
import type { StoredInsight } from "./insights-shared";

// Plain-language notes for the indicators that stand out (lib/signals/notable.ts).
// Every half hour the worker checks which ones are notable; a note is (re)written
// when an indicator becomes notable for a new reason or its note is 12 hours old.
// One model call covers all of them, with the last day's headlines as context.

const REFRESH_MS = 12 * 3600_000;
const MAX_HEADLINES = 60;

const Out = z.object({
  items: z.array(z.object({ key: z.string(), en: z.string(), vi: z.string(), refs: z.array(z.number()) })),
});

const SYSTEM = `You explain market and economic indicators to a non-expert reader of a personal world dashboard. The reader lives in Vietnam, follows the news, but has no finance training.

For each indicator you are given (it was flagged because it crossed a warning level, made an unusually large move, or hit a 1-year high or low), write 2 or 3 short sentences:
1. What the current reading means, in everyday words. Avoid jargon; if a term is unavoidable, explain it in a few words.
2. Why it is moving, but only if one or more of the numbered headlines clearly supports it. List those headline numbers in refs. If no headline clearly explains it, do not suggest a cause and leave refs empty. The headlines are from the last 24 hours, so they can only explain a reading whose asOf date is within the last few days; weekly and monthly data (an older asOf) predates them and must not be linked to them.
3. Optionally, what it usually affects for ordinary people (fuel and living costs, loan rates, savings, jobs, Vietnam), stated as a general tendency, not a forecast.

Use only the numbers you are given; never invent figures, dates or events. No investment advice and no predictions. Keep each note under 60 words.

Write "en" in English and "vi" in natural Vietnamese (standard Vietnamese names, e.g. Mỹ, Trung Quốc; "lợi suất", "lạm phát", "lãi suất"). Return every key exactly once.`;

function basisOf(reasons: Reason[]): string {
  return reasons
    .map((r) => r.kind)
    .sort()
    .join("+");
}

/**
 * Rewrite when the indicator gains a reason its note does not cover. A reason
 * that only lapses (a big move fading intraday, crit easing to warn) waits for
 * the 12-hour refresh: a z-score hovering at the threshold would otherwise flip
 * the basis, and pay for a rewrite, on every run.
 */
export function needsNote(reasons: Reason[], existing: { basis: string; created_at: number } | undefined, now: number): boolean {
  if (!existing || now - existing.created_at > REFRESH_MS) return true;
  const covered = new Set(existing.basis.split("+"));
  // A note written past the danger level already covers the milder watch level.
  if (covered.has("crit")) covered.add("warn");
  return reasons.some((r) => !covered.has(r.kind));
}

function describe(n: Notable, r: Reason): string {
  const t = n.def.threshold;
  const side = t?.dir === "below" ? "below" : "above";
  switch (r.kind) {
    case "crit":
      return `${side} its danger level (${t?.crit})`;
    case "warn":
      return `${side} its watch level (${t?.warn})`;
    case "high":
      return "highest reading in a year";
    case "low":
      return "lowest reading in a year";
    case "move":
      return `latest change is ${Math.abs(r.z).toFixed(1)}x its typical size (${r.z > 0 ? "up" : "down"})`;
  }
}

/** Like the tile delta, but yields and spreads in percentage points rather than basis points. */
function plainChange(n: Notable): string | null {
  const { def, data } = n;
  if (def.delta === "abs" && (def.unit === "%" || def.unit === "pp")) {
    return data.change === null ? null : `${data.change > 0 ? "+" : ""}${data.change.toFixed(2)} percentage points`;
  }
  return fmtDelta(def, data, "en");
}

export const insights: Source = {
  id: "insights",
  ...SOURCE_META.insights,
  async run({ db, log }) {
    const now = Date.now();
    const notables = findNotables(db, now);
    const existing = new Map(
      (db.prepare("SELECT key, basis, created_at FROM insights").all() as unknown as { key: string; basis: string; created_at: number }[]).map((r) => [r.key, r]),
    );
    const todo = notables.filter((n) => needsNote(n.reasons, existing.get(n.key), now));
    if (!todo.length) return 0;

    const headlines = recentHeadlines(db, now, MAX_HEADLINES);
    const input = {
      indicators: todo.map((n) => ({
        key: n.key,
        name: n.def.name.en,
        about: n.def.explain.en,
        value: fmtValue(n.def, n.data.value, "en"),
        asOf: new Date(n.data.ts).toISOString().slice(0, 10),
        latestChange: plainChange(n),
        flaggedBecause: n.reasons.map((r) => describe(n, r)),
        oneYearRange: n.range && { low: fmtValue(n.def, n.range.low, "en"), high: fmtValue(n.def, n.range.high, "en") },
      })),
      headlines: headlines.map((h, i) => ({ n: i + 1, source: h.source, title: h.title })),
    };

    const res = await generateJson({ tier: "brief", system: SYSTEM, user: JSON.stringify(input), schema: Out });
    if (!res.data) throw new Error(`insights not produced by ${res.model} (stop_reason=${res.stopReason})`);

    const byKey = new Map(todo.map((n) => [n.key as string, n]));
    const upsert = db.prepare("INSERT OR REPLACE INTO insights (key, basis, content, created_at) VALUES (?, ?, ?, ?)");
    let written = 0;
    tx(db, () => {
      for (const item of res.data!.items) {
        const n = byKey.get(item.key);
        if (!n) continue;
        const content: StoredInsight = {
          en: item.en,
          vi: item.vi,
          // One chip per outlet, at most two.
          sources: [...new Map(item.refs.map((i) => headlines[i - 1]).filter(Boolean).map((h) => [h.source, h])).values()]
            .slice(0, 2)
            .map((h) => ({ title: h.title, url: h.url, source: h.source })),
          model: res.model,
        };
        upsert.run(n.key, basisOf(n.reasons), JSON.stringify(content), now);
        written++;
      }
    });
    log(`${written}/${todo.length} notes by ${res.model} (${res.usage?.input ?? "?"} in / ${res.usage?.output ?? "?"} out tokens)`);
    return written;
  },
};
