import clsx from "clsx";
import { VIETNAM_ECONOMY, VIETNAM_MARKETS, type SeriesKey } from "@/config/series";
import { getDict, type Locale } from "@/lib/i18n";
import { fmtNumber, fmtSigned } from "@/lib/format";
import { getInsightNotes, getTiles, getVietnam, getWatchlist } from "@/lib/queries";
import { getVietnamOutlook } from "@/lib/queries-vietnam";
import { EmptyState } from "@/components/ui/Panel";
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
