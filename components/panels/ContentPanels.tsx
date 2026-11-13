import { Suspense } from "react";
import clsx from "clsx";
import type { SeriesKey } from "@/config/series";
import { getDict, pick, type Locale } from "@/lib/i18n";
import { fmtDate, fmtDateTime, fmtNumber, fmtPct, fmtValue } from "@/lib/format";
import { getLatestBrief, getMapEvents, getNews, getTiles, getVietnam, requestNow, type VietnamData } from "@/lib/queries";
import { getForeignFlows } from "@/lib/queries-vietnam";
import { EmptyState, PanelSkeleton } from "@/components/ui/Panel";
import { Tabs } from "@/components/ui/Tabs";
import { Thumb } from "@/components/ui/Thumb";
import { MapView } from "./MapView";
import { NewsList } from "./NewsList";
import { BriefRefresh } from "./BriefRefresh";

// ---------------------------------------------------------------- brief

/** Bullets shown before "Show more"; the brief has 5–6, a full wall of text above the fold. */
const BRIEF_SHOWN = 3;

export async function BriefBody({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const { view, hasKey, requestedAt } = await getLatestBrief(lang);
  if (!view) {
    return (
      <div className="flex flex-col items-start gap-3 py-4 text-sm text-ink-2">
        <p>{hasKey ? d.brief.empty : d.brief.needsKey}</p>
        {hasKey && <BriefRefresh label={d.brief.regenerate} requestedLabel={d.brief.requested} pending={requestedAt !== null} />}
      </div>
    );
  }
  const b = view.brief;
  const bullet = (x: (typeof b.bullets)[number], i: number) => (
    <li key={i} className="flex items-start gap-3 text-sm leading-snug">
      <div className="min-w-0 flex-1">
        <span className="font-semibold text-ink">{x.title}.</span> <span className="text-ink-2">{x.body}</span>
        {x.sources.length > 0 && (
          <span className="ml-1 inline-flex flex-wrap gap-1 align-baseline">
            {x.sources.map((s, j) => (
              <a key={j} href={s.url} target="_blank" rel="noreferrer" title={s.title} className="rounded bg-surface-2 px-1 text-[10px] text-ink-2 hover:text-ink">
                {s.source}
              </a>
            ))}
          </span>
        )}
      </div>
      <Thumb src={x.sources.map((s) => view.images[s.url]).find(Boolean)} className="mt-0.5 h-14 w-20" />
    </li>
  );
  const rest = b.bullets.slice(BRIEF_SHOWN);
  return (
    <article className="flex flex-1 flex-col gap-3">
      <p className="font-display text-base font-semibold leading-snug text-ink">{b.headline}</p>
      <ol className="flex flex-col gap-3">{b.bullets.slice(0, BRIEF_SHOWN).map(bullet)}</ol>
      {rest.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-xs [&::-webkit-details-marker]:hidden font-medium text-ink-2 hover:text-ink">
            <span className="group-open:hidden">{d.brief.more.replace("{n}", String(rest.length))} ▾</span>
            <span className="hidden group-open:inline">{d.brief.less} ▴</span>
          </summary>
          <ol className="mt-3 flex flex-col gap-3">{rest.map((x, i) => bullet(x, i + BRIEF_SHOWN))}</ol>
        </details>
      )}
      {b.watch.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-semibold text-ink-2">{d.brief.watch}</h3>
          <ul className="list-disc pl-4 text-xs text-ink-2">
            {b.watch.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2 text-[11px] text-muted">
        <span>
          {d.brief.basedOn.replace("{n}", String(b.headlineCount))} · {fmtDateTime(view.createdAt, lang)} · {b.model}
        </span>
        {hasKey && <BriefRefresh label={d.brief.regenerate} requestedLabel={d.brief.requested} pending={requestedAt !== null} />}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- news

/**
 * The overview's one news panel: the AI brief first, the latest headlines a tab away. They used to be two panels, and
 * the brief's stories came back in the headline list further down the page.
 */
export function NewsTabs({ lang }: { lang: Locale }) {
  const t = getDict(lang).news;
  return (
    <Tabs
      fill
      tabs={[
        {
          key: "brief",
          label: t.tabBrief,
          content: (
            <Suspense fallback={<PanelSkeleton />}>
              <BriefBody lang={lang} />
            </Suspense>
          ),
        },
        {
          key: "latest",
          label: t.tabLatest,
          content: (
            <div className="scroll-thin max-h-[560px] overflow-auto pr-1">
              <Suspense fallback={<PanelSkeleton />}>
                <NewsBody lang={lang} />
              </Suspense>
            </div>
          ),
        },
      ]}
    />
  );
}

export async function NewsBody({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const items = await getNews(lang);
  if (!items.length) return <EmptyState lang={lang} />;
  return <NewsList items={items} now={await requestNow()} labels={d.news} locale={lang} />;
}

// ---------------------------------------------------------------- map

export async function MapBody({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const events = await getMapEvents(lang);
  if (!events.length) return <EmptyState lang={lang} />;
  return (
    <MapView
      events={events}
      locale={lang}
      labels={{
        groups: { quake: d.map.quake, hazard: d.map.hazard, news: d.map.news },
        alert: d.map.alert,
        list: d.map.list,
        map: d.map.map,
        alerts: d.map.alerts,
        alertsHint: d.map.alertsHint,
        world: d.map.world,
        globe: d.map.globe,
        flat: d.map.flat,
        fade: d.map.fade,
        pulse: d.map.pulse,
        levels: d.map.levels,
      }}
    />
  );
}

// ---------------------------------------------------------------- Vietnam
// The overview's corner composes these blocks; the Vietnam page (VietnamPanels) shows them as panels of their own.

const mil = (n: number | null, lang: Locale) => (n === null ? "—" : fmtNumber(n / 1_000_000, lang, 1));

export function VnBreadth({ v, lang }: { v: VietnamData; lang: Locale }) {
  const d = getDict(lang);
  if (!v.breadth) return null;
  return (
    <p className="text-xs text-ink-2">
      {d.vn.breadth}: <span className="text-up">▲ {v.breadth.advances ?? "—"}</span> · <span className="text-down">▼ {v.breadth.declines ?? "—"}</span> ·{" "}
      <span className="text-muted">
        {v.breadth.unchanged ?? "—"} {d.vn.unchanged}
      </span>
      {typeof v.breadth.totalValue === "number" && v.breadth.totalValue > 0 && (
        <>
          {" · "}
          {d.vn.value}: <span className="tabular text-ink">{d.vn.valueFmt.replace("{v}", fmtNumber(v.breadth.totalValue / 1e9, lang, 0))}</span>
        </>
      )}
    </p>
  );
}

export function GoldTable({ v, lang, title = true }: { v: VietnamData; lang: Locale; title?: boolean }) {
  const d = getDict(lang);
  const goldProducts: Record<string, string> = d.vn.goldProducts;
  const sjc = v.gold.find((g) => g.code === "SJL1L10");
  const premium = sjc?.sell && v.worldGoldVnd ? sjc.sell - v.worldGoldVnd : null;
  return (
    <div className="flex flex-col gap-2">
      {title && <h3 className="text-xs font-semibold text-ink-2">{d.vn.gold}</h3>}
      <table className="tabular w-full text-xs">
        <thead className="text-muted">
          <tr>
            <th className="py-1 text-left font-normal" />
            <th className="py-1 text-right font-normal">{d.vn.buy}</th>
            <th className="py-1 text-right font-normal">{d.vn.sell}</th>
          </tr>
        </thead>
        <tbody>
          {v.gold.map((g) => (
            <tr key={g.code} className="border-t border-line">
              <td className="py-1 text-ink-2">{goldProducts[g.code] ?? g.name}</td>
              <td className="py-1 text-right text-ink">{mil(g.buy, lang)}</td>
              <td className="py-1 text-right font-medium text-ink">
                {mil(g.sell, lang)}
                {g.changeSell ? (
                  <span className={clsx("ml-1 text-[10px]", g.changeSell > 0 ? "text-up" : "text-down")}>
                    {g.changeSell > 0 ? "▲" : "▼"}
                    {fmtNumber(Math.abs(g.changeSell) / 1_000_000, lang, 1)}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
          {v.worldGoldVnd && (
            <tr className="border-t border-line">
              <td className="py-1 text-ink-2">{d.vn.worldGold}</td>
              <td />
              <td className="py-1 text-right text-ink">{mil(v.worldGoldVnd, lang)}</td>
            </tr>
          )}
        </tbody>
      </table>
      {premium !== null && v.worldGoldVnd && (
        <p className="text-xs text-ink-2">
          {d.vn.premium}: <span className="font-semibold text-ink">{mil(premium, lang)}</span> ({fmtPct((premium / v.worldGoldVnd) * 100, lang, 1)})
        </p>
      )}
      <p className="text-[10px] text-muted">
        {d.vn.goldUnit} · {v.gold[0]?.source}
      </p>
    </div>
  );
}

export function VcbTable({ v, lang, title = true }: { v: VietnamData; lang: Locale; title?: boolean }) {
  const d = getDict(lang);
  return (
    <div className="flex flex-col gap-2">
      {title && <h3 className="text-xs font-semibold text-ink-2">{d.vn.vcb}</h3>}
      <table className="tabular w-full text-xs">
        <thead className="text-muted">
          <tr>
            <th className="py-1 text-left font-normal" />
            <th className="py-1 text-right font-normal">{d.vn.transfer}</th>
            <th className="py-1 text-right font-normal">{d.vn.sell}</th>
          </tr>
        </thead>
        <tbody>
          {v.vcb.map((x) => (
            <tr key={x.code} className="border-t border-line">
              <td className="py-1 text-ink-2">{x.code}</td>
              <td className="py-1 text-right text-ink">{x.transfer === null ? "—" : fmtNumber(x.transfer, lang, x.transfer < 1000 ? 2 : 0)}</td>
              <td className="py-1 text-right font-medium text-ink">{x.sell === null ? "—" : fmtNumber(x.sell, lang, x.sell < 1000 ? 2 : 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function VnNewsList({ v, lang, title = true }: { v: VietnamData; lang: Locale; title?: boolean }) {
  const d = getDict(lang);
  return (
    <div className="flex flex-col gap-1">
      {title && <h3 className="text-xs font-semibold text-ink-2">{d.vn.news}</h3>}
      <ul className="flex flex-col">
        {v.news.map((n) => (
          <li key={n.id} className="border-t border-line py-1.5 first:border-t-0">
            <a href={n.url} target="_blank" rel="noreferrer" className="text-xs leading-snug text-ink hover:underline">
              {n.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

const VN_INDICES: SeriesKey[] = ["vnindex", "vn30", "hnx", "upcom"];

/**
 * The four Vietnamese indices with today's breadth and foreign flow. VN-Index and USD/VND already have their tiles in
 * Vital signs (and the dollar its row in the Vietcombank table), so the corner adds what the overview shows nowhere else.
 */
async function VnIndices({ v, lang }: { v: VietnamData; lang: Locale }) {
  const d = getDict(lang);
  const [tiles, flows] = await Promise.all([getTiles(VN_INDICES), getForeignFlows()]);
  const today = flows?.rows[flows.rows.length - 1];
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-ink-2">{d.vn.indices}</h3>
      <table className="tabular w-full text-xs">
        <tbody>
          {tiles.map(({ key, def, data }) => (
            <tr key={key} className="border-t border-line first:border-t-0">
              <td className="py-1 text-ink-2">{pick(def.name, lang)}</td>
              <td className="py-1 text-right font-medium text-ink">{data ? fmtValue(def, data.value, lang) : "—"}</td>
              <td
                className={clsx(
                  "w-16 py-1 text-right",
                  !data?.changePct ? "text-muted" : data.changePct > 0 ? "text-up" : "text-down",
                )}
              >
                {data?.changePct == null ? "—" : `${data.changePct > 0 ? "▲" : data.changePct < 0 ? "▼" : ""}${fmtPct(data.changePct, lang)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <VnBreadth v={v} lang={lang} />
      {today && (
        <p className="text-xs text-ink-2">
          {d.vn.foreignToday
            .replace("{day}", fmtDate(today.ts, lang, { day: "numeric", month: "numeric", timeZone: "UTC" }))
            .replace("{dir}", today.net >= 0 ? d.vn.foreignBuy : d.vn.foreignSell)
            .split("{v}")
            .flatMap((part, i) =>
              i
                ? [
                    <span key={i} className={clsx("tabular font-medium", today.net >= 0 ? "text-up" : "text-down")}>
                      {d.vn.valueFmt.replace("{v}", fmtNumber(Math.abs(today.net) / 1e9, lang, 0))}
                    </span>,
                    part,
                  ]
                : [part],
            )}
        </p>
      )}
    </div>
  );
}

export async function VietnamBody({ lang }: { lang: Locale }) {
  const v = await getVietnam(lang);
  if (!v.vnindex && !v.gold.length && !v.vcb.length) return <EmptyState lang={lang} />;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
      <VnIndices v={v} lang={lang} />
      <GoldTable v={v} lang={lang} />
      <VcbTable v={v} lang={lang} />
      <VnNewsList v={v} lang={lang} />
    </div>
  );
}
