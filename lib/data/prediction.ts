// Which prediction-market odds are worth showing (TODO P3): a price of 97% or
// more, or 3% or less, says little ("ceasefire holds through today: 99.75%"),
// so those outcomes are hidden, an event left with none is dropped, and the
// rest is ordered by how much its odds moved in 24 hours. Shared by the
// prediction panels and the dominant themes (lib/data/themes.ts).

/** An outcome shown as this many percent or more, or 100 − this or less, is treated as settled. */
export const SETTLED_PCT = 97;

export interface PolyOutcome {
  label: string;
  prob: number;
  change24h: number | null;
}

/** Outcomes still in play: shown (rounded to a whole percent, as the panels print them) strictly between 3% and 97%. */
export function openOutcomes<O extends PolyOutcome>(outcomes: O[]): O[] {
  return outcomes.filter((o) => {
    const pct = Math.round(o.prob * 100);
    return pct < SETTLED_PCT && pct > 100 - SETTLED_PCT;
  });
}

/** The largest 24-hour move among an event's outcomes, in probability points (0–1). */
export function oddsMove(outcomes: PolyOutcome[]): number {
  return Math.max(0, ...outcomes.map((o) => Math.abs(o.change24h ?? 0)));
}

/** Events with their settled outcomes removed, empty ones dropped, biggest 24-hour move first (then volume). */
export function informativeEvents<E extends { data: { volume24hr: number; outcomes: PolyOutcome[] } }>(events: E[]): E[] {
  return events
    .map((e) => ({ ...e, data: { ...e.data, outcomes: openOutcomes(e.data.outcomes) } }))
    .filter((e) => e.data.outcomes.length > 0)
    .map((e) => ({ e, move: oddsMove(e.data.outcomes) }))
    .sort((a, b) => b.move - a.move || b.e.data.volume24hr - a.e.data.volume24hr)
    .map((x) => x.e);
}
