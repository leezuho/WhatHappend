import clsx from "clsx";
import { getDict, pick, type Locale } from "@/lib/i18n";
import { fmtDate, fmtNumber, fmtPct, fmtSigned } from "@/lib/format";
import { getCot, type CotRow } from "@/lib/queries";
import { Sparkline } from "@/components/charts/Sparkline";
import { EmptyState } from "@/components/ui/Panel";

// The overview's futures positioning (TODO P2, LLDD 04 §3 Hàng 3c): where
// speculators sit in each market, ranked against their own last three years.

type Dict = ReturnType<typeof getDict>["cot"];

/** Contracts as "21.7K" / "3.03M" (signed when `signed`). */
function contracts(v: number, lang: Locale, signed = false): string {
  const big = Math.abs(v) >= 1e6;
  const n = big ? v / 1e6 : v / 1e3;
  const digits = big ? 2 : 1;
  const unit = big ? "M" : "K";
  return signed ? fmtSigned(n, lang, digits, unit) : `${fmtNumber(n, lang, digits)}${unit}`;
}

/** 0–100 track with the week's position as a dot, amber in the top or bottom 10%; those ends of the track are tinted. */
function RankBar({ rank, extreme, label }: { rank: number; extreme: CotRow["extreme"]; label: string }) {
  return (
    <div className="relative h-1.5 w-20 rounded-full bg-surface-2" role="img" aria-label={label}>
      <span aria-hidden className="absolute inset-y-0 left-0 w-[10%] rounded-l-full bg-line" />
      <span aria-hidden className="absolute inset-y-0 right-0 w-[10%] rounded-r-full bg-line" />
      <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-line" />
      <span
        aria-hidden
        className={clsx("absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full", extreme ? "bg-warning" : "bg-ink-2")}
        style={{ left: `${rank}%` }}
      />
    </div>
  );
}

function CotTable({ title, rows, t, lang }: { title: string; rows: CotRow[]; t: Dict; lang: Locale }) {
  const th = "px-1.5 py-1 font-normal";
  return (
    <div className="scroll-thin -mx-1 min-w-0 overflow-x-auto px-1">
      <table className="tabular w-full border-separate border-spacing-y-0.5 text-xs">
        <thead className="text-muted">
          <tr className="text-right whitespace-nowrap">
            <th className={clsx(th, "pl-0 text-left font-semibold text-ink-2")}>{title}</th>
            <th className={clsx(th, "w-14")} title={t.netHint}>
              {t.net}
            </th>
            <th className={clsx(th, "w-14")} title={t.pctOiHint}>
              {t.pctOi}
            </th>
            <th className={clsx(th, "hidden w-14 sm:table-cell")} title={t.weekHint}>
              {t.week}
            </th>
            <th className={clsx(th, "w-28 pl-3 text-left")} title={t.rankHint}>
              {t.rank}
            </th>
            <th className={clsx(th, "hidden w-24 pl-3 text-left md:table-cell")} title={t.historyHint}>
              {t.history}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="max-w-0 py-1 pr-2 text-left align-top">
                <span className="block truncate font-medium text-ink">{pick(r.name, lang)}</span>
                <span className="block truncate text-[11px] leading-snug text-muted" title={t.groupHints[r.group]}>
                  {t.groups[r.group]}
                </span>
              </td>
              <td className="px-1.5 py-1 text-right font-medium text-ink">{r.net === null ? "—" : contracts(r.net, lang, true)}</td>
              <td className="px-1.5 py-1 text-right text-ink-2">{r.netPct === null ? "—" : fmtPct(r.netPct, lang, 1)}</td>
              <td className="hidden px-1.5 py-1 text-right text-ink-2 sm:table-cell">{r.weekChange === null ? "—" : contracts(r.weekChange, lang, true)}</td>
              <td className="py-1 pl-3 text-left">
                {r.rank === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <RankBar rank={r.rank} extreme={r.extreme} label={`${pick(r.name, lang)}: ${fmtNumber(r.rank, lang, 0)}/100`} />
                      <span className="w-6 text-right text-ink-2">{fmtNumber(r.rank, lang, 0)}</span>
                    </div>
                    {r.extreme && (
                      <span className="text-[10px] whitespace-nowrap text-ink-2" title={t.extremeHint}>
                        {r.extreme === "high" ? t.high : t.low}
                      </span>
                    )}
                  </div>
                )}
              </td>
              <td className="hidden py-0.5 pl-3 md:table-cell">
                {r.history.length > 1 && <Sparkline points={r.history} width={96} height={24} label={`${pick(r.name, lang)}, ${t.history}`} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function CotBody({ lang }: { lang: Locale }) {
  const t = getDict(lang).cot;
  const rows = await getCot();
  if (!rows.some((r) => r.net !== null)) return <EmptyState lang={lang} />;
  const asOf = Math.max(...rows.map((r) => r.asOf ?? 0));
  const names = (side: "high" | "low") =>
    rows
      .filter((r) => r.extreme === side)
      .map((r) => pick(r.name, lang))
      .join(", ");
  const high = names("high");
  const low = names("low");
  const summary = [high && t.summaryHigh.replace("{list}", high), low && t.summaryLow.replace("{list}", low)].filter(Boolean).join(" ") || t.summaryNone;
  const date = fmtDate(asOf, lang, lang === "vi" ? { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-2">{summary}</p>
      <div className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-2">
        <CotTable title={t.commodity} rows={rows.filter((r) => r.section === "commodity")} t={t} lang={lang} />
        <CotTable title={t.financial} rows={rows.filter((r) => r.section === "financial")} t={t} lang={lang} />
      </div>
      <p className="text-[10px] leading-snug text-muted">{t.note.replace("{date}", date)}</p>
    </div>
  );
}
