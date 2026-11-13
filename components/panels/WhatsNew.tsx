import { SERIES, type SeriesDef } from "@/config/series";
import { THEMES } from "@/config/themes";
import { getDict, pick, type Dict, type Locale } from "@/lib/i18n";
import { fmtDelta, fmtNumber, fmtPct, fmtValue } from "@/lib/format";
import { getChanges, getHighlights } from "@/lib/queries";
import type { ChangeData, ChangeRow } from "@/lib/data/changes";
import type { Regime } from "@/lib/signals/risk-regime";
import { WhatsNewList, type NewsEntry, type Tone } from "@/components/ui/WhatsNewList";

// The overview's "What's new since last time" strip (TODO P1, LLDD 04 §3): the
// worker's change log (lib/data/changes.ts) as sentences in the reader's
// language; the client part keeps what came after the reader's last visit.

const ORDER: Record<ChangeData["kind"], number> = { regime: 0, theme: 1, threshold: 2, release: 3, move: 4, kev: 5 };

function regimeLabel(r: Regime, t: Dict["regime"]): string {
  return r === "risk-on" ? t.riskOn : r === "risk-off" ? t.riskOff : r === "neutral" ? t.neutral : t.unknown;
}

function moveChange(def: SeriesDef, change: number | null, lang: Locale): string {
  if (change === null) return "—";
  if (def.delta === "pct") return fmtPct(change, lang, 1);
  return fmtDelta(def, { value: 0, change, changePct: null, ts: 0, spark: [] }, lang) ?? "—";
}

/** One logged change as a sentence, or null when what it refers to is no longer configured. */
export function describeChange(c: ChangeData, lang: Locale): { text: string; tone: Tone; href?: string } | null {
  const d = getDict(lang);
  const t = d.whatsNew;
  switch (c.kind) {
    case "regime":
      return {
        text: t.regime.replace("{from}", regimeLabel(c.from, d.regime)).replace("{to}", regimeLabel(c.to, d.regime)),
        tone: c.to === "risk-off" ? "down" : c.to === "risk-on" ? "up" : "neutral",
      };
    case "theme": {
      const theme = THEMES.find((x) => x.id === c.id);
      if (!theme) return null;
      return {
        text: t.theme.replace("{name}", pick(theme.name, lang)).replace("{from}", d.themes.status[c.from]).replace("{to}", d.themes.status[c.to]),
        tone: c.to === "heating" ? "heat" : c.to === "cooling" ? "cool" : "neutral",
      };
    }
    case "threshold": {
      const def = SERIES[c.key];
      const line = def?.threshold?.[c.level];
      if (!def || line === undefined) return null;
      return {
        text: (def.threshold!.dir === "above" ? t.above : t.below)
          .replace("{name}", pick(def.name, lang))
          .replace("{level}", t.levels[c.level])
          .replace("{line}", fmtValue(def, line, lang))
          .replace("{value}", fmtValue(def, c.value, lang)),
        tone: c.level,
      };
    }
    case "move": {
      const def = SERIES[c.key];
      if (!def) return null;
      const up = c.z > 0;
      const key = c.horizon === "day" ? (up ? "dayUp" : "dayDown") : up ? "weekUp" : "weekDown";
      const good = def.polarity === "neutral" ? null : up === (def.polarity === "up-good");
      return {
        text: t[key].replace("{name}", pick(def.name, lang)).replace("{change}", moveChange(def, c.change, lang)).replace("{z}", fmtNumber(Math.abs(c.z), lang, 1)),
        tone: good === null ? "neutral" : good ? "up" : "down",
      };
    }
    case "release": {
      const base = (c.forecast ? t.release : t.releaseNoForecast)
        .replace("{event}", c.event)
        .replace("{country}", c.country)
        .replace("{actual}", c.actual)
        .replace("{forecast}", c.forecast ?? "");
      return {
        text: c.better === null ? base : `${base} · ${c.better ? t.better : t.worse}`,
        tone: c.better === null ? "neutral" : c.better ? "up" : "down",
      };
    }
    case "kev":
      return {
        text: `${t.kev.replace("{vendor}", c.vendor).replace("{product}", c.product).replace("{id}", c.id)}${c.ransomware ? ` · ${t.ransomware}` : ""}`,
        tone: c.ransomware ? "crit" : "heat",
        href: c.url ?? `https://nvd.nist.gov/vuln/detail/${c.id}`,
      };
  }
}

/** Most important kinds first, a danger level before a watch level, then newest first. */
export function orderChanges(rows: ChangeRow[]): ChangeRow[] {
  const rank = (r: ChangeRow) => ORDER[r.data.kind] + (r.data.kind === "threshold" && r.data.level === "warn" ? 0.5 : 0);
  return [...rows].sort((a, b) => rank(a) - rank(b) || b.at - a.at);
}

/**
 * Drops indicator signals (a level crossed, an unusual move) of the indicators that still stand out: the vital-signs
 * panel shows them with the same reasons and the AI's line, so the strip keeps only what the page shows nowhere else
 * (regime and theme changes, releases, vulnerabilities, and signals that have faded since).
 */
export function withoutShown(rows: ChangeRow[], shown: ReadonlySet<string>): ChangeRow[] {
  return rows.filter((r) => !((r.data.kind === "threshold" || r.data.kind === "move") && shown.has(r.data.key)));
}

export async function WhatsNewBody({ lang }: { lang: Locale }) {
  const t = getDict(lang).whatsNew;
  const [{ rows: logged, now }, { items }] = await Promise.all([getChanges(), getHighlights(lang)]);
  const shown = new Set<string>(items.map((i) => i.key));
  const rows = orderChanges(withoutShown(logged, shown));
  const entries: NewsEntry[] = rows.flatMap((r) => {
    const c = describeChange(r.data, lang);
    return c ? [{ id: r.id, at: r.at, ...c }] : [];
  });
  return (
    <WhatsNewList
      entries={entries}
      now={now}
      lang={lang}
      labels={{ since: t.since, firstVisit: t.firstVisit, nothing: t.nothing, seen: t.seen, more: t.more, less: t.less, rules: t.rules }}
      aside={shown.size ? { text: t.standingOut.replace("{n}", String(shown.size)), href: "#vitals" } : undefined}
    />
  );
}
