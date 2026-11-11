import clsx from "clsx";
import { getDict, pick, type Locale } from "@/lib/i18n";
import { fmtDate, fmtNumber, fmtPct, fmtPeriod } from "@/lib/format";
import { getChokepoints, getGprCountries, getUsPolicy } from "@/lib/queries-geo";
import { binOf } from "@/lib/data/geopolitics";
import { GPR_BINS, POLICY_AGENCIES, POLICY_COUNTRIES } from "@/config/geopolitics";
import type { Item } from "@/lib/queries";
import type { PolicyData } from "@/lib/sources/uspolicy";
import { Sparkline } from "@/components/charts/Sparkline";
import { EmptyState } from "@/components/ui/Panel";
import { Tabs } from "@/components/ui/Tabs";

// The overview's geopolitical row (LLDD 04 §3 Hàng 1b): ships through the sea
// chokepoints, geopolitical risk by country, and Washington's sanctions and
// trade actions.

/** "8/11" in Vietnamese, "8 Nov" in English (a bare 11/8 reads as August there). Dates are UTC days. */
function dayLabel(ts: number, lang: Locale): string {
  return fmtDate(ts, lang, lang === "vi" ? { day: "numeric", month: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" });
}

// ---------------------------------------------------------------- chokepoints

export async function ChokepointsBody({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const t = d.geo;
  const rows = await getChokepoints();
  if (!rows.some((r) => r.avg7 !== null)) return <EmptyState lang={lang} />;
  const asOf = Math.max(...rows.map((r) => r.asOf ?? 0));
  const th = "px-1.5 py-1 font-normal";
  return (
    <div className="flex flex-col gap-2">
      <div className="scroll-thin -mx-1 overflow-x-auto px-1">
        <table className="tabular w-full border-separate border-spacing-y-0.5 text-xs">
          <thead className="text-muted">
            <tr className="text-right whitespace-nowrap">
              <th className={clsx(th, "pl-0 text-left")}>{t.chokepoint}</th>
              <th className={clsx(th, "w-14")} title={t.shipsHint}>
                {t.ships}
              </th>
              <th className={clsx(th, "w-16")} title={t.vsYearHint}>
                {t.vsYear}
              </th>
              <th className={clsx(th, "hidden w-14 sm:table-cell")}>{t.tankers}</th>
              <th className={clsx(th, "hidden w-24 pl-3 text-left md:table-cell")} title={t.historyHint}>
                {t.history}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="max-w-0 py-1 pr-2 text-left align-top">
                  <span className="block truncate font-medium text-ink">{pick(r.name, lang)}</span>
                  <span className="line-clamp-2 text-[11px] leading-snug text-muted">{pick(r.note, lang)}</span>
                </td>
                <td className="px-1.5 py-1 text-right font-medium text-ink">{r.avg7 === null ? "—" : fmtNumber(r.avg7, lang, 0)}</td>
                <td className="px-1.5 py-1 text-right">
                  {r.vsYear === null ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span className="text-ink-2">{fmtPct(r.vsYear, lang, 0)}</span>
                  )}
                  {r.disrupted && (
                    <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] whitespace-nowrap text-ink-2" title={t.disruptedHint}>
                      <span aria-hidden className="inline-block size-1.5 rounded-full bg-critical" />
                      {t.disrupted}
                    </span>
                  )}
                </td>
                <td className="hidden px-1.5 py-1 text-right text-ink-2 sm:table-cell">{r.tankers7 === null ? "—" : fmtNumber(r.tankers7, lang, 0)}</td>
                <td className="hidden py-0.5 pl-3 md:table-cell">
                  {r.weekly.length > 1 && <Sparkline points={r.weekly} width={96} height={24} label={`${pick(r.name, lang)}, ${t.history}`} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted">{t.chokeNote.replace("{date}", dayLabel(asOf, lang))}</p>
    </div>
  );
}

// ---------------------------------------------------------------- risk by country

/** Heatmap classes: tokens in app/globals.css, one per GPR_BINS class. */
const SEQ = ["var(--seq-0)", "var(--seq-1)", "var(--seq-2)", "var(--seq-3)", "var(--seq-4)", "var(--seq-5)"];

export async function GprCountriesBody({ lang }: { lang: Locale }) {
  const t = getDict(lang).geo;
  const { months, rows } = await getGprCountries(24);
  if (!rows.some((r) => r.recent !== null)) return <EmptyState lang={lang} />;
  // Below sm only the last 12 months fit; the first 12 columns hide.
  const half = months.length - 12;
  const monthLabel = (ts: number) => fmtPeriod(ts, "m", lang, true);
  const legend = [`< ${GPR_BINS[0]}`, ...GPR_BINS.slice(0, -1).map((e, i) => `${e}–${GPR_BINS[i + 1]}`), `≥ ${GPR_BINS[GPR_BINS.length - 1]}`];
  return (
    <div className="flex flex-col gap-2">
      <table className="tabular w-full table-fixed border-separate border-spacing-[2px] text-[11px]">
        <thead className="text-muted">
          <tr>
            <th className="w-[86px]" />
            {months.map((m, i) => {
              const d = new Date(m);
              // Label each January with its year; the last month names the value column instead.
              return (
                <th key={m} className={clsx("overflow-visible text-left font-normal whitespace-nowrap", i < half && "hidden sm:table-cell")}>
                  {d.getUTCMonth() === 0 && i < months.length - 2 ? String(d.getUTCFullYear()) : ""}
                </th>
              );
            })}
            <th className="w-12 text-right font-normal whitespace-nowrap" title={t.gprLatest}>
              {monthLabel(months[months.length - 1])}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const name = pick(r.name, lang);
            const last = [...r.cells].reverse().find((v) => v !== null) ?? null;
            return (
              <tr key={r.iso}>
                <th scope="row" className={clsx("truncate pr-1 text-left font-normal", r.iso === "VNM" ? "font-semibold text-ink" : "text-ink-2")}>
                  {name}
                </th>
                {r.cells.map((v, i) => (
                  <td key={months[i]} className={clsx("p-0", i < half && "hidden sm:table-cell")}>
                    <span
                      className="block h-4 rounded-[2px]"
                      style={{ background: v === null ? "transparent" : SEQ[binOf(v, GPR_BINS)], outline: v === null ? "1px dashed var(--grid)" : undefined, outlineOffset: -1 }}
                      title={t.gprCell
                        .replace("{country}", name)
                        .replace("{month}", monthLabel(months[i]))
                        .replace("{value}", v === null ? t.gprNoData : fmtNumber(v, lang, 0))}
                    />
                  </td>
                ))}
                <td className="text-right text-ink">{last === null ? "—" : fmtNumber(last, lang, 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-2">
        <span className="flex items-center gap-1">
          {legend.map((l, i) => (
            <span key={l} className="flex items-center gap-1 pr-1.5">
              <span aria-hidden className="inline-block h-2.5 w-3.5 rounded-[2px]" style={{ background: SEQ[i] }} />
              <span className="tabular">{l}</span>
            </span>
          ))}
        </span>
        <span className="text-muted">{t.gprLegend}</span>
      </div>
      <p className="text-[11px] leading-snug text-muted">{t.gprNote}</p>
    </div>
  );
}

// ---------------------------------------------------------------- US actions

function PolicyList({ items, lang }: { items: Item<PolicyData>[]; lang: Locale }) {
  const t = getDict(lang).geo;
  if (!items.length) return <EmptyState lang={lang} />;
  const country = new Map(POLICY_COUNTRIES.map((c) => [c.code, pick(c.name, lang)]));
  return (
    <ul className="scroll-thin flex max-h-[520px] flex-col overflow-auto pr-1">
      {items.map((it) => {
        const ag = POLICY_AGENCIES[it.data.agency];
        const vn = it.data.countries.includes("VN");
        return (
          <li key={it.id} className={clsx("flex gap-2 border-t border-line py-1.5 text-xs first:border-t-0", vn && "-mx-1 rounded bg-surface-2 px-1")}>
            <span className="tabular w-11 shrink-0 text-muted">{it.ts ? dayLabel(it.ts, lang) : ""}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-1.5">
                <span className="mt-px shrink-0 rounded bg-surface-2 px-1 text-[10px] text-ink-2" title={pick(ag.name, lang)}>
                  {pick(ag.short, lang)}
                </span>
                <a href={it.url ?? undefined} target="_blank" rel="noreferrer" className="line-clamp-3 text-ink hover:underline" title={it.title}>
                  {it.title}
                </a>
              </div>
              {it.data.countries.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {it.data.countries.map((c) => (
                    <span key={c} className={clsx("rounded px-1 text-[10px]", c === "VN" ? "bg-accent font-semibold text-on-accent" : "text-muted")}>
                      {c === "VN" ? t.vnTag : country.get(c)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export async function UsPolicyBody({ lang }: { lang: Locale }) {
  const t = getDict(lang).geo;
  const items = await getUsPolicy(lang);
  if (!items.length) return <EmptyState lang={lang} />;
  const tabs = [
    { key: "all", label: t.all, content: <PolicyList items={items} lang={lang} /> },
    { key: "sanctions", label: t.sanctions, content: <PolicyList items={items.filter((i) => i.data.agency === "ofac")} lang={lang} /> },
    { key: "trade", label: t.trade, content: <PolicyList items={items.filter((i) => i.data.agency !== "ofac")} lang={lang} /> },
  ];
  return (
    <div className="flex flex-col gap-2">
      <Tabs tabs={tabs} />
      <p className="text-[11px] leading-snug text-muted">{t.policyNote}</p>
    </div>
  );
}
