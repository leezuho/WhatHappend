import type { ReactNode } from "react";
import clsx from "clsx";
import { VIETNAM_ECONOMY, VIETNAM_MARKETS, type SeriesKey } from "@/config/series";
import { getDict, pick, type Locale } from "@/lib/i18n";
import { fmtAxisPct, fmtCompact, fmtDate, fmtDateTime, fmtNumber, fmtPct, fmtRelative, fmtSigned } from "@/lib/format";
import { getInsightNotes, getItems, getTiles, getVietnam, getVietnamNews, getWatchlist, getWorldMarkets, requestNow } from "@/lib/queries";
import type { Vn30Stock } from "@/lib/sources/vnstocks";
import type { FuelPrice } from "@/lib/sources/petrolimex";
import type { GtrendsItem } from "@/lib/sources/gtrends";
import type { VnExpressItem } from "@/lib/sources/vnexpress";
import { getCentralBand, getDollarHistory, getForeignFlows, getGoldPremium, getVietnamOutlook, getVnHazards, getVnRates } from "@/lib/queries-vietnam";
import { EmptyState } from "@/components/ui/Panel";
import { BarList } from "@/components/charts/BarList";
import { ColumnBars } from "@/components/charts/ColumnBars";
import { Treemap } from "@/components/charts/Treemap";
import { LineChart } from "@/components/charts/LineChart";
import { GoldTable, VcbTable, VnBreadth } from "./ContentPanels";
import { NewsList } from "./NewsList";
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
  const [tiles, v] = await Promise.all([Tiles({ keys: VIETNAM_MARKETS, lang, className: "grid grid-cols-2 gap-2 sm:grid-cols-4" }), getVietnam(lang, 0)]);
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
    Tiles({ keys: VIETNAM_ECONOMY, lang, className: "grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2" }),
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

/** Today's prices beside how far the SJC bar has sat above world gold, day by day. */
export async function VnGold({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const [v, history] = await Promise.all([getVietnam(lang, 0), getGoldPremium()]);
  if (!v.gold.length) return <EmptyState lang={lang} />;
  const rows = history.filter((r) => r.premium !== null);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <GoldTable v={v} lang={lang} title={false} />
      {rows.length > 1 && (
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-xs text-ink-2">{d.vn.premiumTitle}</p>
          <LineChart
            data={rows}
            xKey="ts"
            xFormat="day"
            series={[{ key: "premium", label: d.vn.premiumSeries, color: "var(--s4)" }]}
            area
            yDigits={1}
            height={170}
            locale={lang}
            tableLabels={{ table: d.common.showTable, chart: d.common.showChart }}
          />
          <p className="text-[10px] leading-snug text-muted">{d.vn.historyNote}</p>
        </div>
      )}
    </div>
  );
}

/** The dollar at the interbank market, at the bank and on crypto P2P; Vietcombank's full table beside it. */
export async function VnBank({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const [v, rows, band] = await Promise.all([getVietnam(lang, 0), getDollarHistory(), getCentralBand()]);
  if (!v.vcb.length && !rows.length) return <EmptyState lang={lang} />;
  const both = rows.filter((r) => r.vcb !== null && r.p2p !== null).at(-1);
  const gap = both ? both.p2p! - both.vcb! : null;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {rows.length > 1 && (
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-xs text-ink-2">{d.vn.dollarTitle}</p>
          <LineChart
            data={rows}
            xKey="ts"
            xFormat="day"
            series={[
              { key: "market", label: d.vn.dollarMarket, color: "var(--s1)" },
              { key: "vcb", label: d.vn.dollarVcb, color: "var(--s3)" },
              { key: "p2p", label: d.vn.dollarP2p, color: "var(--s2)" },
              ...(rows.some((r) => r.ceiling !== null) ? [{ key: "ceiling", label: d.vn.dollarCeiling, color: "var(--muted)", dashed: true }] : []),
            ]}
            yDigits={0}
            height={170}
            locale={lang}
            tableLabels={{ table: d.common.showTable, chart: d.common.showChart }}
          />
          {band && (
            <p className="text-xs text-ink-2" title={d.vn.bandHint}>
              {d.vn.band.replace("{c}", fmtNumber(band.central, lang, 0)).replace("{lo}", fmtNumber(band.floor, lang, 0)).replace("{hi}", fmtNumber(band.ceiling, lang, 0))}
              {band.vcb !== null && (
                <>
                  {" · "}
                  {d.vn.toCeiling
                    .replace("{v}", fmtNumber(band.ceiling - band.vcb, lang, 0))
                    .replace("{pct}", fmtNumber(((band.ceiling - band.vcb) / band.ceiling) * 100, lang, 1))}
                </>
              )}
            </p>
          )}
          {gap !== null && both && (
            <p className="text-xs text-ink-2" title={d.vn.p2pHint}>
              {d.vn.p2pGap.replace("{v}", fmtSigned(gap, lang, 0)).replace("{pct}", fmtPct((gap / both.vcb!) * 100, lang, 2))}
            </p>
          )}
          <p className="text-[10px] leading-snug text-muted">{d.vn.historyNote}</p>
        </div>
      )}
      {v.vcb.length > 0 && <VcbTable v={v} lang={lang} title={false} />}
    </div>
  );
}

/** Same list as the overview's world news (photo cards, topic chips, thumbnails), filtered to Vietnam. */
export async function VnNews({ lang }: { lang: Locale }) {
  const [items, now] = await Promise.all([getVietnamNews(lang), requestNow()]);
  if (!items.length) return <EmptyState lang={lang} />;
  return <NewsList items={items} now={now} labels={getDict(lang).news} locale={lang} />;
}

// ---------------------------------------------------------------- what Vietnam searches and reads

const ROW = "flex gap-2 border-t border-line py-1.5 text-xs first:border-t-0";
const RANK = "tabular w-4 shrink-0 text-right text-muted";

function TrendColumn({ title, note, empty, children }: { title: string; note: string; empty: boolean; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-1">
      <h3 className="text-[11px] font-semibold text-ink-2">{title}</h3>
      {empty ? null : <ol className="flex flex-col">{children}</ol>}
      <p className="mt-auto pt-1 text-[11px] text-muted">{note}</p>
    </section>
  );
}

/**
 * Three views of Vietnamese attention side by side: what people search (Google
 * Trends), what they open on the most-read news site (VnExpress), and the pages
 * that jumped on Vietnamese Wikipedia (lib/sources/wikipedia.ts filters out the
 * bot traffic that tops its raw ranking).
 */
export async function VnTrending({ lang }: { lang: Locale }) {
  const t = getDict(lang).trending;
  const [google, vne, wiki, now] = await Promise.all([
    getItems<GtrendsItem>("gtrends_vn", lang, 12),
    getItems<VnExpressItem>("vne_top", lang, 12),
    getItems<{ views: number }>("wiki_vi", lang, 12),
    requestNow(),
  ]);
  if (!google.length && !vne.length && !wiki.length) return <EmptyState lang={lang} />;
  return (
    <div className="grid gap-x-6 gap-y-4 md:grid-cols-3">
      <TrendColumn title={t.vnGoogle} note={t.vnGoogleNote} empty={!google.length}>
        {google.map((it, i) => {
          const news = it.data.news[0];
          return (
            <li key={it.id} className={ROW}>
              <span className={RANK}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <a href={it.url ?? undefined} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-ink hover:underline">
                    {it.title}
                  </a>
                  <span className="tabular shrink-0 text-muted">
                    {fmtNumber(it.data.traffic, lang, 0)}+ {t.searches}
                  </span>
                </div>
                {news && (
                  <div className="truncate text-[11px] text-muted" title={news.title}>
                    {news.title}
                    {news.source ? ` · ${news.source}` : ""}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </TrendColumn>
      <TrendColumn title={t.vnVne} note={t.vnVneNote} empty={!vne.length}>
        {vne.map((it, i) => (
          <li key={it.id} className={ROW}>
            <span className={RANK}>{i + 1}</span>
            <div className="min-w-0 flex-1">
              <a href={it.url ?? undefined} target="_blank" rel="noreferrer" className="line-clamp-2 text-ink hover:underline">
                {it.title}
              </a>
              <div className="text-[11px] text-muted">
                {[it.data.category, it.ts ? fmtRelative(it.ts, now, lang) : null].filter(Boolean).join(" · ")}
              </div>
            </div>
          </li>
        ))}
      </TrendColumn>
      <TrendColumn title={t.vnWiki} note={t.vnWikiNote} empty={!wiki.length}>
        {wiki.map((it, i) => (
          <li key={it.id} className={clsx(ROW, "items-baseline")}>
            <span className={RANK}>{i + 1}</span>
            <a href={it.url ?? undefined} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-ink hover:underline">
              {it.title}
            </a>
            <span className="tabular shrink-0 text-muted">
              {fmtCompact(it.data.views, lang)} {t.views}
            </span>
          </li>
        ))}
      </TrendColumn>
    </div>
  );
}

// ---------------------------------------------------------------- VN30 map, foreign investors

/** "478 tỷ ₫" / "₫478 bn" from VND. */
const bn = (v: number, lang: Locale, signed = false) => {
  const n = v / 1e9;
  const text = getDict(lang).vn.valueFmt.replace("{v}", fmtNumber(Math.abs(n), lang, 0));
  return signed ? `${n > 0 ? "+" : n < 0 ? "−" : "±"}${text}` : text;
};

export async function Vn30Map({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const stocks = (await getItems<Vn30Stock>("vn30", lang, 30)).map((i) => i.data);
  if (!stocks.length) return <EmptyState lang={lang} />;
  const total = stocks.reduce((a, s) => a + (s.mcap ?? 0), 0);
  const flows = stocks.filter((s) => s.foreignNet !== null && s.foreignNet !== 0).sort((a, b) => b.foreignNet! - a.foreignNet!);
  const top = flows.filter((s) => s.foreignNet! > 0).slice(0, 5);
  const bottom = flows.filter((s) => s.foreignNet! < 0).slice(-5).reverse();
  const list = (title: string, rows: Vn30Stock[]) => (
    <div className="flex flex-col gap-1">
      <h3 className="text-[11px] font-semibold text-ink-2">{title}</h3>
      <ul className="flex flex-col">
        {rows.map((s) => (
          <li key={s.symbol} className="flex items-baseline justify-between gap-2 border-t border-line py-1 text-xs first:border-t-0" title={pick(s.name, lang)}>
            <span className="font-medium text-ink">{s.symbol}</span>
            <span className={clsx("tabular", s.foreignNet! > 0 ? "text-up" : "text-down")}>{bn(s.foreignNet!, lang, true)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-2">
        <Treemap
          items={stocks.map((s) => ({
            key: s.symbol,
            label: s.symbol,
            size: s.mcap,
            change: s.changePct,
            changeText: s.changePct === null ? "—" : fmtPct(s.changePct, lang, 1),
            hint: `${s.symbol} · ${pick(s.name, lang)}: ${fmtNumber(s.price, lang, 0)} ₫ · ${s.changePct === null ? "—" : fmtPct(s.changePct, lang, 2)}${s.mcap && total ? ` · ${bn(s.mcap, lang)} (${fmtNumber((s.mcap / total) * 100, lang, 1)}%)` : ""}`,
          }))}
          aspect={2.2}
          steps={[1, 3, 5]}
          tick={(v) => fmtPct(v, lang, 0)}
          label={d.vn.vn30Map}
        />
        <p className="text-[10px] leading-snug text-muted">{d.vn.vn30Note}</p>
      </div>
      {(top.length > 0 || bottom.length > 0) && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-ink-2">{d.vn.vn30Foreign}</p>
          {top.length > 0 && list(d.vn.vn30TopBuy, top)}
          {bottom.length > 0 && list(d.vn.vn30TopSell, bottom)}
        </div>
      )}
    </div>
  );
}

export async function VnForeign({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const f = await getForeignFlows();
  if (!f) return <EmptyState lang={lang} />;
  const today = f.rows[f.rows.length - 1];
  const day = (ts: number) => fmtDate(ts, lang, { day: "numeric", month: "numeric", timeZone: "UTC" });
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink">
        {d.vn.foreignToday
          .replace("{day}", day(today.ts))
          .replace("{dir}", today.net >= 0 ? d.vn.foreignBuy : d.vn.foreignSell)
          .split("{v}")
          .flatMap((part, i) => (i ? [<span key={i} className={clsx("tabular font-semibold", today.net >= 0 ? "text-up" : "text-down")}>{bn(today.net, lang)}</span>, part] : [part]))}
      </p>
      {today.buy !== null && today.sell !== null && (
        <p className="text-xs text-muted">{d.vn.foreignBuySell.replace("{b}", bn(today.buy, lang)).replace("{s}", bn(today.sell, lang))}</p>
      )}
      <p className="text-xs text-ink-2">
        {d.vn.foreignSums.replace("{s5}", bn(f.sum5, lang, true)).replace("{s20}", bn(f.sum20, lang, true)).replace("{ytd}", bn(f.ytd, lang, true))}
      </p>
      <p className="mt-1 text-xs text-ink-2">{d.vn.foreignChart}</p>
      <ColumnBars
        rows={f.rows.map((r) => ({ key: String(r.ts), value: r.net, title: `${day(r.ts)}: ${bn(r.net, lang, true)}` }))}
        tick={(v) => fmtNumber(v / 1e9, lang, 0)}
        first={day(f.rows[0].ts)}
        last={day(today.ts)}
        label={d.vn.foreignChart}
      />
      <p className="text-[10px] leading-snug text-muted">{d.vn.foreignNote}</p>
    </div>
  );
}

// ---------------------------------------------------------------- fuel prices

export async function VnFuel({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const rows = (await getItems<FuelPrice>("fuel_vn", lang, 10)).map((i) => i.data);
  if (!rows.length) return <EmptyState lang={lang} />;
  const modified = Math.max(...rows.map((r) => r.modified));
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-ink-2">{d.vn.fuelAdjusted.replace("{t}", fmtDateTime(modified, lang))}</p>
      <table className="tabular w-full text-xs">
        <thead className="text-muted">
          <tr>
            <th className="py-1 text-left font-normal" />
            <th className="py-1 text-right font-normal">{d.vn.fuelZone1}</th>
            <th className="py-1 text-right font-normal">{d.vn.fuelZone2}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line">
              <td className="py-1 text-ink-2">{pick(r.name, lang)}</td>
              <td className="py-1 text-right font-medium text-ink">
                {fmtNumber(r.zone1, lang, 0)}
                {r.change ? (
                  <span className={clsx("ml-1 text-[10px]", r.change > 0 ? "text-down" : "text-up")}>
                    {r.change > 0 ? "▲" : "▼"}
                    {fmtNumber(Math.abs(r.change), lang, 0)}
                  </span>
                ) : null}
              </td>
              <td className="py-1 text-right text-ink-2">{r.zone2 === null ? "—" : fmtNumber(r.zone2, lang, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] leading-snug text-muted">{d.vn.fuelNote}</p>
    </div>
  );
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
