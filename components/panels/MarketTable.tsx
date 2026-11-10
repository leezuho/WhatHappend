import clsx from "clsx";
import { getDict, type Locale } from "@/lib/i18n";
import { fmtNumber, fmtPct } from "@/lib/format";
import type { MarketRow } from "@/lib/data/markets";
import { Sparkline } from "@/components/charts/Sparkline";

// One table shape for the overview's world indices and commodities: level, session,
// week, month and year-to-date change shaded by size, and a year sparkline.

/** Shading steps per column, in %: a day's move and a year's are on different scales. */
const HEAT_STEPS = { d1: [0.5, 1.5, 3], w1: [1, 3, 6], m1: [2, 5, 10], ytd: [5, 15, 30] } as const;
const HEAT_UP = ["", "bg-up/10", "bg-up/20", "bg-up/35"];
const HEAT_DOWN = ["", "bg-down/10", "bg-down/20", "bg-down/35"];

function HeatCell({ v, steps, lang, className }: { v: number | null; steps: readonly number[]; lang: Locale; className?: string }) {
  if (v === null) return <td className={clsx("px-1.5 py-1 text-right text-muted", className)}>—</td>;
  const step = steps.filter((x) => Math.abs(v) >= x).length;
  return <td className={clsx("rounded-sm px-1.5 py-1 text-right text-ink", v > 0 ? HEAT_UP[step] : v < 0 ? HEAT_DOWN[step] : "", className)}>{fmtPct(v, lang, 1)}</td>;
}

export interface MarketTableRow extends MarketRow {
  name: string;
  /** Muted text after the name: the country, or the price unit. */
  sub: string;
}

export interface MarketTableGroup {
  key: string;
  label: string;
  rows: MarketTableRow[];
}

/** Yahoo's quote page for a `yahoo:` series; nothing for other sources. */
function quoteHref(id: string): string | null {
  return id.startsWith("yahoo:") ? `https://finance.yahoo.com/quote/${encodeURIComponent(id.slice("yahoo:".length))}` : null;
}

export function MarketTable({ groups, nameHead, priceHead, lang }: { groups: MarketTableGroup[]; nameHead: string; priceHead: string; lang: Locale }) {
  const t = getDict(lang).markets;
  const th = "px-1.5 py-1 font-normal";
  return (
    <div className="scroll-thin -mx-1 overflow-x-auto px-1">
      <table className="tabular w-full border-separate border-spacing-y-0.5 text-xs">
        <thead className="text-muted">
          <tr className="text-right">
            <th className={clsx(th, "pl-0 text-left")}>{nameHead}</th>
            <th className={clsx(th, "hidden w-18 sm:table-cell")}>{priceHead}</th>
            <th className={clsx(th, "w-16")}>{t.d1}</th>
            <th className={clsx(th, "hidden w-16 sm:table-cell")}>{t.w1}</th>
            <th className={clsx(th, "hidden w-16 sm:table-cell")}>{t.m1}</th>
            <th className={clsx(th, "w-18")}>{t.ytd}</th>
            <th className={clsx(th, "hidden w-24 pl-3 text-left md:table-cell")}>{t.year}</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.key}>
            <tr>
              <th colSpan={7} scope="rowgroup" className="pt-2 pb-0.5 text-left text-[11px] font-semibold text-ink-2">
                {g.label}
              </th>
            </tr>
            {g.rows.map((r) => {
              const href = quoteHref(r.id);
              return (
                <tr key={r.id}>
                  <td className="max-w-0 py-1 pr-2 text-left">
                    <span className="block truncate" title={`${r.name} · ${r.sub}`}>
                      {href ? (
                        <a href={href} target="_blank" rel="noreferrer" className="font-medium text-ink hover:underline">
                          {r.name}
                        </a>
                      ) : (
                        <span className="font-medium text-ink">{r.name}</span>
                      )}{" "}
                      <span className="text-muted">{r.sub}</span>
                    </span>
                  </td>
                  <td className="hidden px-1.5 py-1 text-right text-ink-2 sm:table-cell">{r.price === null ? "—" : fmtNumber(r.price, lang, r.price >= 1000 ? 0 : 2)}</td>
                  <HeatCell v={r.ch1d} steps={HEAT_STEPS.d1} lang={lang} />
                  <HeatCell v={r.ch1w} steps={HEAT_STEPS.w1} lang={lang} className="hidden sm:table-cell" />
                  <HeatCell v={r.ch1m} steps={HEAT_STEPS.m1} lang={lang} className="hidden sm:table-cell" />
                  <HeatCell v={r.chYtd} steps={HEAT_STEPS.ytd} lang={lang} />
                  <td className="hidden py-0.5 pl-3 md:table-cell">
                    {r.spark.length > 1 && <Sparkline points={r.spark} width={72} height={20} trend label={`${r.name}, ${t.year}`} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/** "{up} of {n} up · best … · worst …" over the rows that have a session change. */
export function MoveSummary({ rows, template, lang }: { rows: { name: string; ch1d: number | null }[]; template: string; lang: Locale }) {
  const moved = rows.filter((r) => r.ch1d !== null).sort((a, b) => b.ch1d! - a.ch1d!);
  if (moved.length < 2) return null;
  const name = (r: (typeof moved)[number]) => `${r.name} ${fmtPct(r.ch1d!, lang, 1)}`;
  return (
    <p className="tabular text-xs text-ink-2">
      {template
        .replace("{up}", String(moved.filter((r) => r.ch1d! > 0).length))
        .replace("{n}", String(moved.length))
        .replace("{best}", name(moved[0]))
        .replace("{worst}", name(moved[moved.length - 1]))}
    </p>
  );
}
