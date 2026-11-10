import clsx from "clsx";
import { VIETNAM_ECONOMY, VIETNAM_MARKETS, type SeriesKey } from "@/config/series";
import { getDict, type Locale } from "@/lib/i18n";
import { fmtAxisPct, fmtDate, fmtNumber, fmtPct, fmtSigned } from "@/lib/format";
import { getInsightNotes, getTiles, getVietnam, getWatchlist, getWorldMarkets } from "@/lib/queries";
import { getVietnamOutlook, getVnHazards, getVnRates } from "@/lib/queries-vietnam";
import { EmptyState } from "@/components/ui/Panel";
import { BarList } from "@/components/charts/BarList";
import { LineChart } from "@/components/charts/LineChart";
import { GoldTable, VcbTable, VnBreadth, VnNewsList } from "./ContentPanels";
import { DetailTile } from "./MarketPanels";

// Panels of the Vietnam page (app/[lang]/vietnam): markets, the economy with the
// IMF's outlook, gold, bank rates and news. Comparison with other economies
// lives on the macro page, where Vietnam is the last row.

async function Tiles({ keys, lang, className }: { keys: SeriesKey[]; lang: Locale; className: string }) {
  const [watch, notes, tiles] = await Promise.all([getWatchlist(), getInsightNotes(lang), getTiles(keys)]);
  if (tiles.every((t) => !t.data)) return null;
  return (
    <div className={className}>
      {tiles.map((t) => (
        <DetailTile key={t.key} tile={t} lang={lang} watched={watch.includes(t.key)} note={notes[t.key]} />
      ))}
    </div>
  );
}

export async function VnMarkets({ lang }: { lang: Locale }) {
  const [tiles, v] = await Promise.all([Tiles({ keys: VIETNAM_MARKETS, lang, className: "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" }), getVietnam(lang, 0)]);
  if (!tiles) return <EmptyState lang={lang} />;
  return (
    <div className="flex flex-col gap-2">
      {tiles}
      <VnBreadth v={v} lang={lang} />
    </div>
  );
}

export async function VnEconomy({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const [tiles, rates, outlook] = await Promise.all([
    Tiles({ keys: VIETNAM_ECONOMY, lang, className: "grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3" }),
    getTiles(["vnRefi", "vnCpi"]),
    getVietnamOutlook(lang),
  ]);
  const hasOutlook = outlook.rows.some((r) => r.values.some((v) => v !== null));
  if (!tiles && !hasOutlook) return <EmptyState lang={lang} />;
  const [refi, cpi] = rates.map((t) => t.data);
  const real = refi && cpi ? refi.value - cpi.value : null;
  const cell = (v: number | null, digits: number, signed: boolean) =>
    v === null ? "—" : signed ? fmtSigned(v, lang, digits, "%") : `${fmtNumber(v, lang, digits)}%`;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_3fr]">
      <div className="flex flex-col gap-2">
        {tiles}
        {real !== null && (
          <p className="text-xs text-ink-2" title={d.vn.realRateHint}>
            {d.vn.realRate}: <span className="font-semibold text-ink">{fmtSigned(real, lang, 1, "%")}</span>{" "}
            <span className="text-muted">({real >= 0 ? d.vn.tight : d.vn.loose})</span>
          </p>
        )}
      </div>
      {hasOutlook && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-ink-2">{d.vn.outlookTitle}</p>
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="tabular w-full min-w-[560px] text-xs">
              <thead>
                <tr className="text-muted">
                  <th scope="col" className="sticky left-0 z-[1] bg-surface py-1 pr-2 text-left font-normal" />
                  {outlook.years.map((y) => (
                    <th
                      key={y}
                      scope="col"
                      className={clsx("px-1.5 py-1 text-right font-normal", y === outlook.thisYear && "text-ink-2", y > outlook.thisYear && "italic")}
                    >
                      {y}
                      {y === outlook.thisYear && <span className="block text-[10px] not-italic">{d.vn.estimate}</span>}
                      {y > outlook.thisYear && <span className="block text-[10px]">{d.vn.forecast}</span>}
                    </th>
                  ))}
                  <th scope="col" className="border-l border-line py-1 pl-2 text-right font-normal">
                    {d.vn.emAvg.replace("{year}", String(outlook.thisYear))}
                  </th>
                </tr>
              </thead>
              <tbody>
                {outlook.rows.map((r) => (
                  <tr key={r.ind} className="border-t border-line">
                    <th scope="row" className="sticky left-0 z-[1] bg-surface py-1.5 pr-2 text-left font-normal whitespace-nowrap text-ink-2">
                      {r.name}
                    </th>
                    {r.values.map((v, i) => {
                      const y = outlook.years[i];
                      return (
                        <td
                          key={y}
                          className={clsx(
                            "px-1.5 py-1.5 text-right whitespace-nowrap",
                            y === outlook.thisYear ? "bg-surface-2 font-medium text-ink" : y > outlook.thisYear ? "text-muted italic" : "text-ink",
                          )}
                        >
                          {cell(v, r.digits, r.signed)}
                        </td>
                      );
                    })}
                    <td className="border-l border-line py-1.5 pl-2 text-right whitespace-nowrap text-ink-2">{cell(r.em, r.digits, r.signed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted">{d.vn.outlookNote}</p>
        </div>
      )}
    </div>
  );
}

export async function VnGold({ lang }: { lang: Locale }) {
  const v = await getVietnam(lang, 0);
  return v.gold.length ? <GoldTable v={v} lang={lang} title={false} /> : <EmptyState lang={lang} />;
}

export async function VnBank({ lang }: { lang: Locale }) {
  const v = await getVietnam(lang, 0);
  return v.vcb.length ? <VcbTable v={v} lang={lang} title={false} /> : <EmptyState lang={lang} />;
}

export async function VnNews({ lang }: { lang: Locale }) {
  const v = await getVietnam(lang, 15);
  return v.news.length ? <VnNewsList v={v} lang={lang} title={false} /> : <EmptyState lang={lang} />;
}

// ---------------------------------------------------------------- inflation vs the refinancing rate

export async function VnRates({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const rows = await getVnRates();
  if (!rows.some((r) => r.cpi !== null)) return <EmptyState lang={lang} />;
  return (
    <div className="flex flex-col gap-2">
      <LineChart
        data={rows}
        xKey="ts"
        xFormat="month"
        series={[
          { key: "cpi", label: d.vn.ratesCpi, color: "var(--s1)" },
          { key: "refi", label: d.vn.ratesRefi, color: "var(--s2)", step: true },
        ]}
        yDigits={1}
        ySuffix="%"
        height={200}
        locale={lang}
        tableLabels={{ table: d.common.showTable, chart: d.common.showChart }}
      />
      <p className="text-[11px] text-muted">{d.vn.ratesNote}</p>
    </div>
  );
}

// ---------------------------------------------------------------- VN-Index against the region

export async function VnRegion({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const rows = (await getWorldMarkets(lang)).filter((r) => r.region === "asia" && r.chYtd !== null).sort((a, b) => b.chYtd! - a.chYtd!);
  if (!rows.length) return <EmptyState lang={lang} />;
  const rank = rows.findIndex((r) => r.id === "vn:VNINDEX") + 1;
  return (
    <div className="flex flex-col gap-2">
      {rank > 0 && (
        <p className="text-xs text-ink-2">
          {d.vn.regionRank.replace("{rank}", String(rank)).replace("{n}", String(rows.length))}
        </p>
      )}
      <BarList
        rows={rows.map((r) => ({
          key: r.id,
          label: r.country,
          value: r.chYtd,
          text: fmtPct(r.chYtd!, lang, 1),
          hint: `${r.name} (${r.country}): ${fmtPct(r.chYtd!, lang, 1)}`,
          highlight: r.id === "vn:VNINDEX",
        }))}
        color="highlight"
        tick={(v) => fmtAxisPct(v, lang)}
        label={d.panels.vnRegion.title}
      />
      <p className="text-[10px] leading-snug text-muted">{d.vn.regionNote}</p>
    </div>
  );
}

// ---------------------------------------------------------------- hazards near Vietnam

export async function VnHazards({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const items = await getVnHazards(lang);
  const types = d.vn.hazardTypes as Record<string, string>;
  return (
    <div className="flex flex-col gap-2">
      {items.length ? (
        <ul className="flex flex-col">
          {items.map((h) => {
            const mag =
              h.severity === null ? null : h.type === "earthquake" ? `M${fmtNumber(h.severity, lang, 1)}` : h.type === "storm" && h.id.startsWith("eonet:") ? `${fmtNumber(h.severity, lang, 0)} kt` : null;
            return (
              <li key={h.id} className="flex items-baseline gap-2 border-t border-line py-1.5 text-xs first:border-t-0">
                <span className="shrink-0 rounded bg-surface-2 px-1 text-[10px] text-ink-2">{types[h.type] ?? h.type}</span>
                <span className="min-w-0 flex-1">
                  {h.url ? (
                    <a href={h.url} target="_blank" rel="noreferrer" className="text-ink hover:underline">
                      {h.title}
                    </a>
                  ) : (
                    <span className="text-ink">{h.title}</span>
                  )}
                  {(h.level === "red" || h.level === "orange") && (
                    <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] text-ink-2">
                      <span aria-hidden className={clsx("inline-block size-1.5 rounded-full", h.level === "red" ? "bg-critical" : "bg-serious")} />
                      {d.map.levels[h.level]}
                    </span>
                  )}
                  <span className="block text-[11px] text-muted">
                    {[mag, d.vn.hazardKm.replace("{km}", fmtNumber(Math.round(h.km / 10) * 10, lang, 0)).replace("{city}", h.city), fmtDate(h.ts, lang)].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-4 text-center text-xs text-ink-2">{d.vn.hazardsEmpty}</p>
      )}
      <p className="text-[10px] leading-snug text-muted">{d.vn.hazardsNote}</p>
    </div>
  );
}
