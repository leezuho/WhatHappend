import clsx from "clsx";
import { CRYPTO_SIGNS, SERIES } from "@/config/series";
import { getDict, pick, type Locale } from "@/lib/i18n";
import { fmtCompact, fmtDate, fmtNumber, fmtPct, fmtSigned } from "@/lib/format";
import { getBtcLeverage, getCrypto, getEtfFlows, getCryptoNews, getInsightNotes, getItems, getRatio, getTiles, getWatchlist, requestNow, type FearGreed, type PolyEvent } from "@/lib/queries";
import type { ChainRow } from "@/lib/sources/defillama";
import { TileDetail } from "@/components/charts/TileDetail";
import { LineChart } from "@/components/charts/LineChart";
import { Treemap } from "@/components/charts/Treemap";
import { Sparkline } from "@/components/charts/Sparkline";
import { ColumnBars } from "@/components/charts/ColumnBars";
import { EmptyState } from "@/components/ui/Panel";
import { DetailTile } from "./MarketPanels";
import { NewsGrid } from "./NewsGrid";
import { Meter, PolyEvents } from "./WorldPanels";

// ---------------------------------------------------------------- helpers

/** Coin prices span $100k to fractions of a cent: keep ~4 significant digits below $1. */
function fmtPrice(v: number, lang: Locale): string {
  const digits = v >= 1000 ? 0 : v >= 1 ? 2 : v >= 0.01 ? 4 : 6;
  return `$${fmtNumber(v, lang, digits)}`;
}

const usd = (v: number | null, lang: Locale) => (v === null ? "—" : `$${fmtCompact(v, lang)}`);

/** Signed percent in the market's up/down colors. */
export function Pct({ v, lang, digits = 1 }: { v: number | null; lang: Locale; digits?: number }) {
  if (v === null) return <span className="text-muted">—</span>;
  return <span className={clsx(v > 0 ? "text-up" : v < 0 ? "text-down" : "text-ink-2")}>{fmtPct(v, lang, digits)}</span>;
}

// ---------------------------------------------------------------- vital signs + fear & greed

export async function CryptoVitals({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const [watch, notes, tiles, c] = await Promise.all([getWatchlist(), getInsightNotes(lang), getTiles(CRYPTO_SIGNS), getCrypto(lang)]);
  if (tiles.every((t) => !t.data) && !c.fng) return <EmptyState lang={lang} />;
  const g = c.global;
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((t) => (
            <DetailTile key={t.key} tile={t} lang={lang} watched={watch.includes(t.key)} note={notes[t.key]} />
          ))}
        </div>
        {g && (
          <p className="tabular text-[11px] text-muted">
            {d.crypto.volume24h} {usd(g.volumeUsd, lang)} · {d.crypto.dominance} BTC {g.dominance.btc === null ? "—" : `${fmtNumber(g.dominance.btc, lang, 1)}%`} · ETH{" "}
            {g.dominance.eth === null ? "—" : `${fmtNumber(g.dominance.eth, lang, 1)}%`} · CoinGecko
          </p>
        )}
      </div>
      {c.fng && (
        <TileDetail
          seriesKey="fng"
          name={pick(SERIES.fng.name, lang)}
          explain={pick(SERIES.fng.explain, lang)}
          note={notes.fng}
          unit=""
          digits={0}
          watched={watch.includes("fng")}
          locale={lang}
          labels={{ ...d.detail, close: d.common.close, table: d.common.showTable, chart: d.common.showChart }}
        >
          <FearGreedCard fng={c.fng} lang={lang} />
        </TileDetail>
      )}
    </div>
  );
}

function FearGreedCard({ fng, lang }: { fng: FearGreed; lang: Locale }) {
  const d = getDict(lang);
  const levels: Record<string, string> = d.crypto.fngLevels;
  const past: [string, number | null][] = [
    [d.crypto.yesterday, fng.yesterday],
    [d.crypto.weekAgo, fng.weekAgo],
    [d.crypto.monthAgo, fng.monthAgo],
  ];
  return (
    <span className="flex h-full flex-col gap-2 rounded-lg bg-surface-2/60 p-3">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-ink-2">{d.crypto.fng}</span>
        <span className="text-[10px] text-muted">alternative.me · {fmtDate(fng.ts, lang, { day: "numeric", month: "short", timeZone: "UTC" })}</span>
      </span>
      <span className="flex items-baseline gap-2">
        <span className="tabular text-3xl font-semibold text-ink">{fmtNumber(fng.value, lang, 0)}</span>
        <span className="text-sm font-medium text-ink">{levels[fng.label] ?? fng.label}</span>
      </span>
      <span className="flex flex-col gap-0.5">
        <Meter p={fng.value / 100} />
        <span className="tabular flex justify-between text-[10px] text-muted">
          <span>0 · {levels["Extreme Fear"]}</span>
          <span>{levels["Extreme Greed"]} · 100</span>
        </span>
      </span>
      <span className="grid grid-cols-3 gap-1">
        {past.map(([label, v]) => (
          <span key={label} className="flex flex-col">
            <span className="text-[10px] text-muted">{label}</span>
            <span className="tabular text-xs font-medium text-ink">{v === null ? "—" : fmtNumber(v, lang, 0)}</span>
          </span>
        ))}
      </span>
      <Sparkline points={fng.spark} width={270} height={34} label={`${d.crypto.fng}, 90d`} />
      <span className="text-[10px] leading-snug text-muted">{d.crypto.fngNote}</span>
    </span>
  );
}

// ---------------------------------------------------------------- top coins

export async function TopCoinsBody({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const t = d.crypto;
  const { top } = await getCrypto(lang);
  if (!top.length) return <EmptyState lang={lang} />;
  const th = "py-1.5 font-normal";
  return (
    <div className="scroll-thin -mx-1 overflow-x-auto px-1">
      <table className="tabular w-full text-xs">
        <thead className="text-muted">
          <tr className="text-right">
            <th className={clsx(th, "w-6 text-right")}>#</th>
            <th className={clsx(th, "pl-2 text-left")}>{t.coin}</th>
            <th className={th}>{t.price}</th>
            <th className={clsx(th, "hidden sm:table-cell")}>{t.h1}</th>
            <th className={th}>{t.h24}</th>
            <th className={th}>{t.d7}</th>
            <th className={clsx(th, "hidden md:table-cell")}>{t.mcap}</th>
            <th className={clsx(th, "hidden lg:table-cell")}>{t.fromAth}</th>
            <th className={clsx(th, "hidden pl-3 text-left sm:table-cell")}>{t.last7d}</th>
          </tr>
        </thead>
        <tbody>
          {top.map((c) => (
            <tr key={c.id} className="border-t border-line text-right">
              <td className="py-1.5 text-muted">{c.rank ?? ""}</td>
              <td className="py-1.5 pl-2 text-left">
                <a href={`https://www.coingecko.com/en/coins/${c.id}`} target="_blank" rel="noreferrer" className="hover:underline">
                  <span className="font-medium text-ink">{c.symbol}</span> <span className="hidden text-ink-2 sm:inline">{c.name}</span>
                </a>
              </td>
              <td className="py-1.5 font-medium text-ink">{fmtPrice(c.price, lang)}</td>
              <td className="hidden py-1.5 sm:table-cell">
                <Pct v={c.ch1h} lang={lang} />
              </td>
              <td className="py-1.5">
                <Pct v={c.ch24h} lang={lang} />
              </td>
              <td className="py-1.5">
                <Pct v={c.ch7d} lang={lang} />
              </td>
              <td className="hidden py-1.5 text-ink-2 md:table-cell">{usd(c.marketCap, lang)}</td>
              <td className="hidden py-1.5 text-ink-2 lg:table-cell">{c.fromAth === null ? "—" : fmtPct(c.fromAth, lang, 0)}</td>
              <td className="hidden py-0.5 pl-3 sm:table-cell">
                <Sparkline points={c.spark.map((value, ts) => ({ ts, value }))} width={88} height={22} trend={c.ch7d} label={`${c.symbol}, ${t.last7d}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- market map

export async function CoinMapBody({ lang }: { lang: Locale }) {
  const t = getDict(lang).crypto;
  const { top } = await getCrypto(lang);
  if (!top.length) return <EmptyState lang={lang} />;
  const total = top.reduce((a, c) => a + (c.marketCap ?? 0), 0);
  return (
    <div className="flex flex-col gap-2">
      <Treemap
        items={top.map((c) => ({
          key: c.id,
          label: c.symbol,
          size: c.marketCap,
          change: c.ch24h,
          changeText: c.ch24h === null ? "—" : fmtPct(c.ch24h, lang, 1),
          hint: `${c.name}: ${usd(c.marketCap, lang)}${total && c.marketCap ? ` (${fmtNumber((c.marketCap / total) * 100, lang, 1)}%)` : ""} · 24h ${c.ch24h === null ? "—" : fmtPct(c.ch24h, lang, 1)} · 7d ${c.ch7d === null ? "—" : fmtPct(c.ch7d, lang, 1)}`,
          href: `https://www.coingecko.com/en/coins/${c.id}`,
        }))}
        aspect={2}
        steps={[1, 3, 6]}
        tick={(v) => fmtPct(v, lang, 0)}
        label={t.mapLabel}
      />
      <p className="text-[10px] leading-snug text-muted">{t.mapNote}</p>
    </div>
  );
}

// ---------------------------------------------------------------- ETH priced in bitcoin

export async function EthBtcBody({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const t = d.crypto;
  const pts = await getRatio(SERIES.eth.id, SERIES.btc.id);
  const last = pts.at(-1);
  if (!last || pts.length < 2) return <EmptyState lang={lang} />;
  const first = pts[0];
  const vals = pts.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const ch = (last.value / first.value - 1) * 100;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-ink-2">
        <span className="tabular text-base font-semibold text-ink">{fmtNumber(last.value, lang, 4)}</span> BTC{" "}
        <span className="ml-1">
          <Pct v={ch} lang={lang} /> {t.ethBtcYear}
        </span>
        <span className="text-muted">
          {" "}
          · {t.ethBtcRange.replace("{lo}", fmtNumber(lo, lang, 4)).replace("{hi}", fmtNumber(hi, lang, 4))}
        </span>
      </p>
      <LineChart
        data={pts.map((p) => ({ ts: p.ts, v: p.value }))}
        xKey="ts"
        xFormat="month"
        series={[{ key: "v", label: "ETH/BTC", color: "var(--s1)" }]}
        area
        yDigits={4}
        height={280}
        locale={lang}
        tableLabels={{ table: d.common.showTable, chart: d.common.showChart }}
      />
      <p className="text-[11px] text-muted">{t.ethBtcNote}</p>
    </div>
  );
}

// ---------------------------------------------------------------- leverage & local demand

export async function DerivsBody({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const t = d.crypto;
  const { perps, p2p } = await getCrypto(lang);
  if (!perps.length && !p2p) return <EmptyState lang={lang} />;
  return (
    <div className="flex flex-col gap-4">
      <section>
        {perps.length ? (
          <table className="tabular w-full text-xs">
            <thead className="text-muted">
              <tr className="text-right">
                <th className="py-1 text-left font-normal" />
                <th className="py-1 font-normal">{t.funding}</th>
                <th className="py-1 font-normal">{t.fundingApr}</th>
                <th className="py-1 font-normal">{t.oi}</th>
                <th className="py-1 font-normal">{t.oiChange}</th>
              </tr>
            </thead>
            <tbody>
              {perps.map((p) => (
                <tr key={p.symbol} className="border-t border-line text-right">
                  <td className="py-1.5 text-left font-medium text-ink">{p.symbol}</td>
                  <td className="py-1.5 text-ink">{fmtSigned(p.funding * 100, lang, 4, "%")}</td>
                  <td className="py-1.5 text-ink-2">{fmtSigned(p.fundingApr, lang, 1, "%")}</td>
                  <td className="py-1.5 text-ink">{usd(p.oiUsd, lang)}</td>
                  <td className="py-1.5">
                    <Pct v={p.oiChange24h} lang={lang} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-muted">
            {t.funding}: {t.unavailable}
          </p>
        )}
        <p className="mt-1.5 text-[10px] leading-snug text-muted">{t.fundingNote} · Binance USDⓈ-M</p>
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-xs font-semibold text-ink-2">{t.p2p}</h3>
        {p2p ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              {[
                [t.p2pBuy, p2p.buy],
                [t.p2pSell, p2p.sell],
              ].map(([label, v]) => (
                <div key={label} className="rounded-lg bg-surface-2/60 px-3 py-2">
                  <div className="text-[11px] text-ink-2">{label}</div>
                  <div className="tabular text-lg font-semibold text-ink">{fmtNumber(v as number, lang, 0)} ₫</div>
                </div>
              ))}
            </div>
            <p className="tabular text-xs text-ink-2">
              {t.bankRate}: <span className="text-ink">{p2p.bankSell === null ? "—" : `${fmtNumber(p2p.bankSell, lang, 0)} ₫`}</span>
              {p2p.premium !== null && (
                <>
                  {" "}
                  · {t.p2pPremium}: <span className="font-semibold text-ink">{fmtPct(p2p.premium, lang, 2)}</span>
                </>
              )}
            </p>
            <p className="text-[10px] text-muted">{t.p2pNote}</p>
          </>
        ) : (
          <p className="text-xs text-muted">{t.unavailable}</p>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Bitcoin network

export async function NetworkBody({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const t = d.crypto;
  const { network: n } = await getCrypto(lang);
  if (!n) return <EmptyState lang={lang} />;
  const epochDone = 1 - n.halving.blocksLeft / 210_000;
  const eh = n.hashrate / 1e18;
  const hrChange = n.hashrate30d ? (n.hashrate / n.hashrate30d - 1) * 100 : null;
  const fees: [string, number][] = [
    [t.feeFast, n.fees.fast],
    [t.feeHalfHour, n.fees.halfHour],
    [t.feeHour, n.fees.hour],
    [t.feeEconomy, n.fees.economy],
  ];
  return (
    <div className="flex flex-col gap-3 text-xs">
      <section className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-semibold text-ink-2">{t.halving}</h3>
          <span className="tabular text-muted">
            {t.height} {fmtNumber(n.tip, lang, 0)}
          </span>
        </div>
        <div className="tabular text-lg font-semibold text-ink">{fmtDate(n.halving.eta, lang, { day: "numeric", month: "short", year: "numeric" })}</div>
        <Meter p={epochDone} />
        <div className="tabular flex justify-between text-[11px] text-muted">
          <span>{t.blocksLeft.replace("{n}", fmtNumber(n.halving.blocksLeft, lang, 0))}</span>
          <span>{t.subsidy.replace("{now}", fmtNumber(n.halving.subsidy, lang, 3)).replace("{next}", fmtNumber(n.halving.nextSubsidy, lang, 3))}</span>
        </div>
      </section>

      <section>
        <h3 className="mb-1 font-semibold text-ink-2">{t.fees}</h3>
        <div className="grid grid-cols-4 gap-1">
          {fees.map(([label, v]) => (
            <div key={label} className="rounded-md bg-surface-2/60 px-2 py-1.5">
              <div className="truncate text-[10px] text-muted">{label}</div>
              <div className="tabular text-sm font-semibold text-ink">{fmtNumber(v, lang, v < 10 ? 1 : 0)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div>
          <h3 className="font-semibold text-ink-2">{t.difficulty}</h3>
          <div className="tabular text-sm font-semibold text-ink">{fmtPct(n.difficulty.change, lang, 2)}</div>
          <div className="tabular text-[11px] text-muted">
            {t.difficultyEta.replace("{progress}", `${fmtNumber(n.difficulty.progress, lang, 0)}%`).replace("{date}", fmtDate(n.difficulty.eta, lang))}
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-ink-2">{t.hashrate}</h3>
          <div className="tabular text-sm font-semibold text-ink">{fmtNumber(eh, lang, 0)} EH/s</div>
          {hrChange !== null && (
            <div className="tabular text-[11px] text-muted">
              {fmtPct(hrChange, lang, 1)} {t.hashrate30d}
            </div>
          )}
        </div>
      </section>
      <p className="text-[10px] text-muted">mempool.space</p>
    </div>
  );
}

// ---------------------------------------------------------------- trending

export async function TrendingCoinsBody({ lang }: { lang: Locale }) {
  const t = getDict(lang).crypto;
  const { trending } = await getCrypto(lang);
  if (!trending.length) return <EmptyState lang={lang} />;
  return (
    <ol className="flex flex-col">
      {trending.map((c, i) => (
        <li key={c.id} className="flex items-baseline gap-2 border-t border-line py-1.5 text-xs first:border-t-0">
          <span className="tabular w-4 shrink-0 text-right text-muted">{i + 1}</span>
          <a href={`https://www.coingecko.com/en/coins/${c.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
            <span className="font-medium text-ink">{c.symbol}</span> <span className="text-ink-2">{c.name}</span>
          </a>
          {c.rank !== null && <span className="tabular shrink-0 rounded bg-surface-2 px-1 text-[10px] text-ink-2">{t.rank.replace("{n}", String(c.rank))}</span>}
          <span className="tabular w-20 shrink-0 text-right text-ink">{c.price === null ? "—" : fmtPrice(c.price, lang)}</span>
          <span className="tabular w-14 shrink-0 text-right">
            <Pct v={c.ch24h} lang={lang} />
          </span>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- odds

export async function CryptoOddsBody({ lang }: { lang: Locale }) {
  const t = getDict(lang).crypto;
  const events = await getItems<PolyEvent>("polymarket_crypto", lang, 8);
  if (!events.length) return <EmptyState lang={lang} message={t.noOdds} />;
  return (
    <div className="scroll-thin flex max-h-[420px] flex-col gap-3 overflow-auto pr-1">
      <PolyEvents events={events} lang={lang} />
    </div>
  );
}

// ---------------------------------------------------------------- leverage: open interest against price

export async function LeverageBody({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const t = d.crypto;
  const lev = await getBtcLeverage();
  if (!lev) return <EmptyState lang={lang} />;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-ink-2">
        {t.levTitle}
        {lev.oiChange !== null && lev.priceChange !== null && (
          <span className="text-muted">
            {" · "}
            {t.levChange.replace("{oi}", fmtPct(lev.oiChange, lang, 1)).replace("{price}", fmtPct(lev.priceChange, lang, 1))}
          </span>
        )}
      </p>
      <LineChart
        data={lev.rows}
        xKey="ts"
        xFormat="day"
        series={[
          { key: "price", label: t.levPrice, color: "var(--s1)" },
          { key: "oi", label: t.levOi, color: "var(--s2)" },
        ]}
        yDigits={0}
        refY={100}
        height={180}
        locale={lang}
        tableLabels={{ table: d.common.showTable, chart: d.common.showChart }}
      />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {lev.lsr && (
          <div title={t.lsrHint}>
            <dt className="text-muted">{t.lsr}</dt>
            <dd className="tabular text-ink">
              <span className="font-semibold">{fmtNumber(lev.lsr.last, lang, 2)}</span>{" "}
              <span className="text-muted">{t.avgOf.replace("{v}", fmtNumber(lev.lsr.avg, lang, 2))}</span>
            </dd>
          </div>
        )}
        {lev.funding && (
          <div title={t.fundingHint}>
            <dt className="text-muted">{t.fundingYear}</dt>
            <dd className="tabular text-ink">
              <span className="font-semibold">{fmtNumber(lev.funding.last, lang, 1)}%</span>{" "}
              <span className="text-muted">{t.avgOf.replace("{v}", `${fmtNumber(lev.funding.avg, lang, 1)}%`)}</span>
            </dd>
          </div>
        )}
      </dl>
      <p className="text-[10px] leading-snug text-muted">{t.levNote}</p>
    </div>
  );
}

// ---------------------------------------------------------------- spot bitcoin ETF flows

export async function EtfFlowsBody({ lang }: { lang: Locale }) {
  const t = getDict(lang).crypto;
  const f = await getEtfFlows();
  if (!f) return <EmptyState lang={lang} />;
  // "−$367M" / "−367 triệu USD": the sign goes before the currency sign.
  const m = (v: number) => {
    const sign = v > 0 ? "+" : v < 0 ? "−" : "";
    return sign + t.musd.replace("{v}", fmtNumber(Math.abs(v), lang, 0));
  };
  const day = (ts: number) => fmtDate(ts, lang, { day: "numeric", month: "numeric", timeZone: "UTC" });
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink">
        {t.etfDay.replace("{day}", day(f.latest.ts))}{" "}
        <span className={clsx("tabular font-semibold", f.latest.total > 0 ? "text-up" : f.latest.total < 0 ? "text-down" : "text-ink")}>{m(f.latest.total)}</span>
      </p>
      {f.latest.funds.length > 0 && (
        <p className="tabular text-xs text-ink-2">
          {f.latest.funds.map((x, i) => (
            <span key={x.fund}>
              {i > 0 && " · "}
              {x.fund} <span className={clsx(x.value > 0 ? "text-up" : x.value < 0 ? "text-down" : "text-muted")}>{fmtSigned(x.value, lang, 0)}</span>
            </span>
          ))}
        </p>
      )}
      <p className="text-xs text-ink-2">{t.etfSums.replace("{s5}", m(f.sum5)).replace("{n}", String(f.rows.length)).replace("{all}", m(f.sumAll))}</p>
      <ColumnBars
        rows={f.rows.map((r) => ({ key: String(r.ts), value: r.total, title: `${day(r.ts)}: ${m(r.total)}` }))}
        tick={(v) => fmtNumber(v, lang, 0)}
        first={day(f.rows[0].ts)}
        last={day(f.latest.ts)}
        label={t.etfChart}
      />
      <p className="text-[10px] leading-snug text-muted">{t.etfNote}</p>
    </div>
  );
}

// ---------------------------------------------------------------- chains: TVL and fees

export async function ChainsBody({ lang }: { lang: Locale }) {
  const t = getDict(lang).crypto;
  const rows = (await getItems<ChainRow>("llama_chains", lang, 12)).map((i) => i.data);
  if (!rows.length) return <EmptyState lang={lang} />;
  return (
    <div className="flex flex-col gap-2">
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="tabular w-full min-w-[440px] text-xs">
          <thead className="text-muted">
            <tr>
              <th className="py-1 text-left font-normal" />
              <th className="py-1 text-right font-normal">TVL</th>
              <th className="py-1 text-right font-normal">7d</th>
              <th className="py-1 text-right font-normal">30d</th>
              <th className="py-1 text-right font-normal">{t.fees30d}</th>
              <th className="py-1 text-right font-normal" title={t.feesWowHint}>
                {t.feesWow}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.name} className="border-t border-line">
                <td className="py-1 text-ink">
                  {c.name}
                  {c.symbol && <span className="ml-1 text-[10px] text-muted">{c.symbol}</span>}
                </td>
                <td className="py-1 text-right font-medium text-ink">{usd(c.tvl, lang)}</td>
                <td className="py-1 text-right">
                  <Pct v={c.ch7d} lang={lang} />
                </td>
                <td className="py-1 text-right">
                  <Pct v={c.ch30d} lang={lang} />
                </td>
                <td className="py-1 text-right text-ink">{usd(c.fees30d, lang)}</td>
                <td className="py-1 text-right">
                  <Pct v={c.feesCh7d} lang={lang} digits={0} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] leading-snug text-muted">{t.chainsNote}</p>
    </div>
  );
}

// ---------------------------------------------------------------- news

export async function CryptoNewsBody({ lang }: { lang: Locale }) {
  const [items, now] = await Promise.all([getCryptoNews(lang, 30), requestNow()]);
  if (!items.length) return <EmptyState lang={lang} />;
  return <NewsGrid items={items} now={now} lang={lang} />;
}
