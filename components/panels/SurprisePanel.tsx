import clsx from "clsx";
import { getDict, pick, type Locale } from "@/lib/i18n";
import { fmtDate, fmtSigned } from "@/lib/format";
import { figureText } from "@/lib/data/surprise";
import { getSurprise, type ScoredRelease, type SurpriseLine } from "@/lib/queries-macro";
import { LineChart } from "@/components/charts/LineChart";
import { EmptyState } from "@/components/ui/Panel";
import { SURPRISE_DEFS, SURPRISE_NEUTRAL, type SurpriseGroup } from "@/config/surprise";

// The macro page's US economic surprise indices (TODO P2, LLDD 04 §3b Hàng 10b):
// is US data coming in above or below what forecasters expected, for growth and for inflation.

type Dict = ReturnType<typeof getDict>["surprise"];

/** Good news for the economy: stronger than forecast for growth, cooler for inflation. Same colors as the calendar's results. */
const isGood = (group: SurpriseGroup, v: number) => (group === "growth" ? v > 0 : v < 0);

function Reading({ group, line, t, lang }: { group: SurpriseGroup; line: SurpriseLine; t: Dict; lang: Locale }) {
  const v = line.value;
  const quiet = v === null || Math.abs(v) < SURPRISE_NEUTRAL;
  const reading = quiet ? t.inLine : group === "growth" ? (v > 0 ? t.growthAbove : t.growthBelow) : v > 0 ? t.inflationAbove : t.inflationBelow;
  const drivers = line.drivers.slice(0, 2);
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs font-medium text-ink-2" title={group === "growth" ? t.growthHint : t.inflationHint}>
        {group === "growth" ? t.growth : t.inflation}
      </span>
      <span className={clsx("tabular text-2xl leading-tight font-semibold", v === null ? "text-muted" : quiet ? "text-ink" : isGood(group, v) ? "text-up" : "text-down")}>
        {v === null ? "—" : fmtSigned(Math.round(v), lang, 0)}
      </span>
      <span className="text-xs text-ink-2">{reading}</span>
      {line.monthAgo !== null && <span className="tabular text-[11px] text-muted">{t.monthAgo.replace("{v}", fmtSigned(Math.round(line.monthAgo), lang, 0))}</span>}
      {drivers.length > 0 && (
        <span className="text-[11px] leading-snug text-muted" title={t.driversHint}>
          {t.drivers}:{" "}
          {drivers.map((d, k) => (
            <span key={`${d.def.key}-${d.ts}`}>
              {k > 0 && ", "}
              {pick(d.def.label, lang)} <span className={clsx("tabular", isGood(group, d.pull) ? "text-up" : "text-down")}>{fmtSigned(Math.round(d.pull), lang, 0)}</span>
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

function RecentTable({ rows, t, lang }: { rows: ScoredRelease[]; t: Dict; lang: Locale }) {
  const th = "px-1.5 py-1 font-normal";
  return (
    <div className="scroll-thin -mx-1 min-w-0 overflow-x-auto px-1">
      <table className="tabular w-full border-separate border-spacing-y-0.5 text-xs">
        <caption className="pb-1 text-left text-xs font-semibold text-ink-2">{t.recent}</caption>
        <thead className="text-muted">
          <tr className="text-right whitespace-nowrap">
            <th className={clsx(th, "w-12 pl-0 text-left")}>{t.date}</th>
            <th className={clsx(th, "text-left")}>{t.release}</th>
            <th className={clsx(th, "w-14")}>{t.actual}</th>
            <th className={clsx(th, "hidden w-14 sm:table-cell")}>{t.consensus}</th>
            <th className={clsx(th, "w-14 pr-0")} title={t.zHint}>
              {t.z}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.def.key}-${r.ts}`}>
              <td className="py-0.5 pr-1.5 text-left whitespace-nowrap text-muted">{fmtDate(r.ts, lang, { day: "numeric", month: "numeric", timeZone: "America/New_York" })}</td>
              <td className="max-w-0 px-1.5 py-0.5 text-left">
                <span className="block truncate text-ink" title={pick(r.def.label, lang)}>
                  {pick(r.def.label, lang)}
                </span>
              </td>
              <td className="px-1.5 py-0.5 text-right font-medium whitespace-nowrap text-ink">{figureText(r.def, r.actual, lang)}</td>
              <td className="hidden px-1.5 py-0.5 text-right whitespace-nowrap text-ink-2 sm:table-cell">{figureText(r.def, r.cons, lang)}</td>
              <td className={clsx("py-0.5 pr-0 pl-1.5 text-right whitespace-nowrap", r.z === 0 ? "text-ink-2" : isGood(r.def.group, r.z!) ? "text-up" : "text-down")}>
                {fmtSigned(r.z!, lang, 1, "σ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function SurpriseBody({ lang }: { lang: Locale }) {
  const dict = getDict(lang);
  const t = dict.surprise;
  const v = await getSurprise();
  if (v.asOf === null || (v.growth.value === null && v.inflation.value === null)) return <EmptyState lang={lang} />;
  // One row per week with both indices, rounded: the chart's table view reads them as whole points.
  const at = new Map<number, { ts: number; growth: number | null; inflation: number | null }>();
  for (const [key, line] of [["growth", v.growth], ["inflation", v.inflation]] as const) {
    for (const p of line.history) {
      const row = at.get(p.ts) ?? { ts: p.ts, growth: null, inflation: null };
      row[key] = Math.round(p.value);
      at.set(p.ts, row);
    }
  }
  const data = [...at.values()].sort((a, b) => a.ts - b.ts);
  const date = fmtDate(v.asOf, lang, { day: "numeric", month: lang === "vi" ? "numeric" : "short", year: "numeric", timeZone: "America/New_York" });
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-3 lg:col-span-7">
          <div className="grid grid-cols-2 gap-4">
            <Reading group="growth" line={v.growth} t={t} lang={lang} />
            <Reading group="inflation" line={v.inflation} t={t} lang={lang} />
          </div>
          <LineChart
            data={data}
            xKey="ts"
            xFormat="month"
            series={[
              { key: "growth", label: t.growth, color: "var(--s1)" },
              { key: "inflation", label: t.inflation, color: "var(--s2)" },
            ]}
            yDigits={0}
            refY={0}
            height={200}
            locale={lang}
            tableLabels={{ table: dict.common.showTable, chart: dict.common.showChart }}
          />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <RecentTable rows={v.recent} t={t} lang={lang} />
        </div>
      </div>
      <p className="text-[10px] leading-snug text-muted">{t.note.replace("{count}", String(SURPRISE_DEFS.length)).replace("{date}", date)}</p>
    </div>
  );
}
