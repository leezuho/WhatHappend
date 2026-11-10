import clsx from "clsx";
import { TECH_GROUPS, TW_REVENUE } from "@/config/tech";
import { TECH_JOBS, TECH_SIGNS } from "@/config/series";
import { getDict, intlLocale, pick, type Locale } from "@/lib/i18n";
import { fmtCompact, fmtDate, fmtDateTime, fmtNumber, fmtPct, fmtPeriod } from "@/lib/format";
import { getInsightNotes, getItems, getTechNews, getTiles, getWatchlist, requestNow } from "@/lib/queries";
import { getAllPostings, getPackages, getTechNote, getTechStocks, type TechStockRow } from "@/lib/queries-tech";
import { splitStatus } from "@/lib/data/tech";
import type { Impact, ServiceStatus, StatusIncident } from "@/lib/sources/cloudstatus";
import type { AiModel } from "@/lib/sources/openrouter";
import type { HfModel, HfPaper } from "@/lib/sources/huggingface";
import type { KevEntry, KevVendors } from "@/lib/sources/kev";
import type { TwRevenue } from "@/lib/sources/twse";
import type { EolRow } from "@/lib/sources/eol";
import type { AiValue } from "@/lib/sources/arena";
import type { LobstersItem } from "@/lib/sources/lobsters";
import type { SpaceWeather } from "@/lib/sources/spaceweather";
import type { ComputeSummary } from "@/lib/sources/epoch";
import { QuadrantScatter } from "@/components/charts/QuadrantScatter";
import { Sparkline } from "@/components/charts/Sparkline";
import { BarList } from "@/components/charts/BarList";
import { Treemap } from "@/components/charts/Treemap";
import { EmptyState } from "@/components/ui/Panel";
import { Tabs } from "@/components/ui/Tabs";
import { DetailTile } from "./MarketPanels";
import { Pct } from "./CryptoPanels";
import { NewsGrid } from "./NewsGrid";
import { WeeklyNote } from "./WeeklyNote";
import { HnList, type HnItem } from "./WorldPanels";

// ---------------------------------------------------------------- helpers

const CURRENCY_PREFIX: Record<string, string> = { USD: "$", KRW: "₩", HKD: "HK$" };

/** A share price in its own currency: no decimals for won and dong. */
function fmtStockPrice(v: number, currency: string | null, lang: Locale): string {
  const n = fmtNumber(v, lang, currency === "KRW" || currency === "VND" ? 0 : 2);
  if (currency === "VND") return `${n} ₫`;
  return `${currency ? (CURRENCY_PREFIX[currency] ?? "") : ""}${n}`;
}

const usd = (v: number | null, lang: Locale) => (v === null ? "—" : `$${fmtCompact(v, lang)}`);

/** US$ per million tokens: up to 3 decimals below $1 (cheap models cost fractions of a cent per thousand). */
function fmtTokenPrice(v: number | null, lang: Locale): string {
  if (v === null) return "—";
  return `$${new Intl.NumberFormat(intlLocale(lang), { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 3 : 2 }).format(v)}`;
}

/** Context window as 128K / 1M tokens. */
function fmtTokens(n: number | null, lang: Locale): string {
  if (!n) return "—";
  if (n < 1e6) return `${Math.round(n / 1000)}K`;
  const m = Math.round(n / 1e5) / 10;
  return `${Number.isInteger(m) ? m : fmtNumber(m, lang, 1)}M`;
}

const LEVEL_DOT: Record<Impact, string> = {
  none: "bg-good",
  maintenance: "bg-s1",
  unknown: "bg-warning",
  minor: "bg-warning",
  major: "bg-serious",
  critical: "bg-critical",
};

const SEVERITY: Record<Impact, number> = { none: 0, maintenance: 1, unknown: 2, minor: 3, major: 4, critical: 5 };

function Dot({ level }: { level: Impact | null }) {
  return <span aria-hidden className={clsx("inline-block size-2 shrink-0 rounded-full", level ? LEVEL_DOT[level] : "bg-muted")} />;
}

// ---------------------------------------------------------------- tech stocks

export async function TechMarkets({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const t = d.tech;
  const [watch, notes, tiles, rows] = await Promise.all([getWatchlist(), getInsightNotes(lang), getTiles(TECH_SIGNS), getTechStocks()]);
  if (tiles.every((x) => !x.data) && rows.every((r) => r.price === null)) return <EmptyState lang={lang} />;

  const us = rows.filter((r) => r.group === "us");
  const usCap = us.reduce((a, r) => a + (r.capUsd ?? 0), 0);
  const usUp = us.filter((r) => (r.ch1d ?? 0) > 0).length;
  const th = "py-1.5 font-normal";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((x) => (
          <DetailTile key={x.key} tile={x} lang={lang} watched={watch.includes(x.key)} note={notes[x.key]} />
        ))}
      </div>
      {usCap > 0 && (
        <p className="tabular text-xs text-ink-2">
          {t.bigTech
            .replaceAll("{n}", String(us.length))
            .replace("{cap}", usd(usCap, lang))
            .replace("{up}", String(usUp))}
        </p>
      )}
      <Tabs
        tabs={[
          {
            key: "table",
            label: t.tableTab,
            content: (
            <div className="scroll-thin -mx-1 overflow-x-auto px-1">
              <table className="tabular w-full text-xs">
                <thead className="text-muted">
                  <tr className="text-right">
                    <th className={clsx(th, "text-left")}>{t.company}</th>
                    <th className={th}>{t.price}</th>
                    <th className={th}>{t.d1}</th>
                    <th className={clsx(th, "hidden sm:table-cell")}>{t.m1}</th>
                    <th className={clsx(th, "hidden md:table-cell")}>{t.ytd}</th>
                    <th className={clsx(th, "hidden md:table-cell")}>{t.mcap}</th>
                    <th className={clsx(th, "hidden pl-3 text-left sm:table-cell")}>{t.year}</th>
                  </tr>
                </thead>
                {TECH_GROUPS.map((g) => {
                  const group = rows.filter((r) => r.group === g);
                  return (
                    <tbody key={g}>
                      <tr>
                        <th colSpan={7} scope="rowgroup" className="pt-3 pb-1 text-left text-[11px] font-semibold text-ink-2">
                          {t.groups[g]}
                        </th>
                      </tr>
                      {group.map((r) => (
                        <StockRow key={r.symbol} r={r} lang={lang} yearLabel={t.year} />
                      ))}
                    </tbody>
                  );
                })}
              </table>
            </div>
            ),
          },
          {
            key: "map",
            label: t.mapTab,
            content: (
              <div className="flex flex-col gap-2">
                <Treemap
                  items={rows.map((r) => ({
                    key: r.symbol,
                    label: r.name,
                    size: r.capUsd,
                    change: r.ch1d,
                    changeText: r.ch1d === null ? "—" : fmtPct(r.ch1d, lang, 1),
                    hint: `${r.name} (${r.symbol}): ${usd(r.capUsd, lang)} · ${t.d1} ${r.ch1d === null ? "—" : fmtPct(r.ch1d, lang, 1)} · ${t.ytd} ${r.chYtd === null ? "—" : fmtPct(r.chYtd, lang, 1)}`,
                    href: `https://finance.yahoo.com/quote/${encodeURIComponent(r.symbol)}`,
                  }))}
                  aspect={2.2}
                  steps={[0.5, 1.5, 3]}
                  tick={(v) => fmtPct(v, lang, 0)}
                  label={t.mapLabel}
                />
                <p className="text-[10px] leading-snug text-muted">{t.mapNote}</p>
              </div>
            ),
          },
        ]}
      />
      <p className="text-[10px] leading-snug text-muted">{t.capNote} · Yahoo Finance</p>
    </div>
  );
}

function StockRow({ r, lang, yearLabel }: { r: TechStockRow; lang: Locale; yearLabel: string }) {
  return (
    <tr className="border-t border-line text-right">
      <td className="py-1.5 text-left">
        <a href={`https://finance.yahoo.com/quote/${encodeURIComponent(r.symbol)}`} target="_blank" rel="noreferrer" className="hover:underline">
          <span className="font-medium text-ink">{r.name}</span> <span className="text-muted">{r.symbol.replace(/\.(KS|HK|VN)$/, "")}</span>
        </a>
      </td>
      <td className="py-1.5 font-medium text-ink">{r.price === null ? "—" : fmtStockPrice(r.price, r.currency, lang)}</td>
      <td className="py-1.5">
        <Pct v={r.ch1d} lang={lang} />
      </td>
      <td className="hidden py-1.5 sm:table-cell">
        <Pct v={r.ch1m} lang={lang} />
      </td>
      <td className="hidden py-1.5 md:table-cell">
        <Pct v={r.chYtd} lang={lang} />
      </td>
      <td className="hidden py-1.5 text-ink-2 md:table-cell">{usd(r.capUsd, lang)}</td>
      <td className="hidden py-0.5 pl-3 sm:table-cell">
        {r.spark.length > 1 && <Sparkline points={r.spark} width={88} height={22} trend label={`${r.name}, ${yearLabel}`} />}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------- status board

export async function StatusBoard({ lang }: { lang: Locale }) {
  const t = getDict(lang).tech;
  const [services, now] = await Promise.all([getItems<ServiceStatus>("status", lang), requestNow()]);
  if (!services.length) return <EmptyState lang={lang} />;
  const split = services.map((s) => ({ s, ...splitStatus(s.data, now) }));
  const bad = split.filter((x) => x.level && SEVERITY[x.level] >= SEVERITY.unknown).length;
  const bySeverity = (a: StatusIncident, b: StatusIncident) => SEVERITY[b.impact] - SEVERITY[a.impact] || (b.since ?? 0) - (a.since ?? 0);
  const incidents = split.flatMap((x) => x.current.map((i) => ({ ...i, service: x.s.title }))).sort(bySeverity);
  const long = split.flatMap((x) => x.long.map((i) => ({ ...i, service: x.s.title }))).sort(bySeverity);
  const shown = incidents.slice(0, 6);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-2">
        {bad ? t.statusSummary.replace("{bad}", String(bad)).replace("{n}", String(services.length)) : t.statusAllOk.replace("{n}", String(services.length))}
        {long.length > 0 && <span className="text-muted"> · {t.longSummary.replace("{n}", String(long.length))}</span>}
      </p>
      <ul className="grid grid-cols-2 gap-1.5">
        {split.map(({ s, level, long: own }) => (
          <li key={s.id}>
            <a
              href={s.url ?? undefined}
              target="_blank"
              rel="noreferrer"
              title={s.data.error ?? s.data.description ?? undefined}
              className="flex flex-col gap-0.5 rounded-lg bg-surface-2/60 px-2.5 py-1.5 hover:bg-surface-2"
            >
              <span className="flex items-center gap-1.5">
                <Dot level={level} />
                <span className="truncate text-xs font-medium text-ink">{s.title}</span>
              </span>
              <span className={clsx("truncate text-[11px]", level && level !== "none" ? "text-ink" : "text-muted")}>
                {level ? t.levels[level] : t.unreadable}
                {own.length > 0 && <span className="text-muted"> · {t.longCount.replace("{n}", String(own.length))}</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>
      {shown.length > 0 && (
        <ul className="flex flex-col">
          {shown.map((i, k) => (
            <IncidentRow key={k} i={i} lang={lang} now={now} />
          ))}
          {incidents.length > shown.length && <li className="pt-1 text-[11px] text-muted">{t.moreIncidents.replace("{n}", String(incidents.length - shown.length))}</li>}
        </ul>
      )}
      {long.length > 0 && (
        <details className="group text-xs">
          <summary className="cursor-pointer text-[11px] font-semibold text-ink-2 select-none hover:text-ink">{t.longTitle.replace("{n}", String(long.length))}</summary>
          <ul className="mt-1 flex flex-col opacity-80">
            {long.map((i, k) => (
              <IncidentRow key={k} i={i} lang={lang} now={now} />
            ))}
          </ul>
        </details>
      )}
      <p className="text-[10px] leading-snug text-muted">{t.statusNote}</p>
    </div>
  );
}

function IncidentRow({ i, lang, now }: { i: StatusIncident & { service: string }; lang: Locale; now: number }) {
  const t = getDict(lang).tech;
  const sameYear = i.since && new Date(i.since).getUTCFullYear() === new Date(now).getUTCFullYear();
  const since = i.since ? t.since.replace("{date}", fmtDate(i.since, lang, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" })) : null;
  return (
    <li className="flex gap-2 border-t border-line py-1.5 text-xs first:border-t-0">
      <span className="mt-1">
        <Dot level={i.impact} />
      </span>
      <div className="min-w-0 flex-1">
        <a href={i.url ?? undefined} target="_blank" rel="noreferrer" className="text-ink hover:underline">
          <span className="font-medium">{i.service}</span> · {i.title}
        </a>
        <div className="text-[11px] text-muted">{[i.where, i.status, since].filter(Boolean).join(" · ")}</div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- new AI models

export async function NewModels({ lang }: { lang: Locale }) {
  const t = getDict(lang).tech;
  const models = await getItems<AiModel>("ai_models", lang, 80);
  if (!models.length) return <EmptyState lang={lang} />;
  const open = models.filter((m) => m.data.open).length;
  const th = "py-1.5 font-normal";
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-ink-2">{t.modelsSummary.replace("{n}", String(models.length)).replace("{open}", String(open))}</p>
      <div className="scroll-thin -mx-1 max-h-[420px] overflow-auto px-1">
        <table className="tabular w-full text-xs">
          <thead className="sticky top-0 bg-surface text-muted">
            <tr className="text-right">
              <th className={clsx(th, "text-left")}>{t.model}</th>
              <th className={clsx(th, "hidden sm:table-cell")}>{t.listed}</th>
              <th className={th}>{t.priceIn}</th>
              <th className={th}>{t.priceOut}</th>
              <th className={clsx(th, "hidden sm:table-cell")}>{t.context}</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => {
              const free = m.data.priceIn === 0 && m.data.priceOut === 0;
              return (
                <tr key={m.id} className="border-t border-line text-right">
                  <td className="py-1.5 text-left">
                    <a href={m.url ?? undefined} target="_blank" rel="noreferrer" className="hover:underline" title={m.data.inputs.join(", ")}>
                      <span className="font-medium text-ink">{m.data.name}</span> <span className="text-muted">{m.data.provider}</span>
                    </a>
                    {m.data.open && (
                      <span title={t.openWeightsTitle} className="ml-1.5 rounded bg-surface-2 px-1 text-[10px] text-ink-2">
                        {t.openWeights}
                      </span>
                    )}
                  </td>
                  <td className="hidden py-1.5 text-ink-2 sm:table-cell">{fmtDate(m.data.created, lang)}</td>
                  {free ? (
                    <td colSpan={2} className="py-1.5 text-ink-2">
                      {t.free}
                    </td>
                  ) : (
                    <>
                      <td className="py-1.5 text-ink">{fmtTokenPrice(m.data.priceIn, lang)}</td>
                      <td className="py-1.5 text-ink">{fmtTokenPrice(m.data.priceOut, lang)}</td>
                    </>
                  )}
                  <td className="hidden py-1.5 text-ink-2 sm:table-cell">{fmtTokens(m.data.context, lang)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] leading-snug text-muted">{t.modelsNote} · OpenRouter</p>
    </div>
  );
}

// ---------------------------------------------------------------- AI research

export async function AiResearch({ lang }: { lang: Locale }) {
  const t = getDict(lang).tech;
  const [papers, models] = await Promise.all([getItems<HfPaper>("hf_papers", lang, 20), getItems<HfModel>("hf_models", lang, 12)]);
  if (!papers.length && !models.length) return <EmptyState lang={lang} />;
  const list = "scroll-thin flex max-h-[420px] flex-col overflow-auto pr-1";
  return (
    <Tabs
      tabs={[
        {
          key: "papers",
          label: t.papers,
          content: (
            <div className="flex flex-col gap-2">
              <ol className={list}>
                {papers.map((p, i) => (
                  <li key={p.id} className="flex gap-2 border-t border-line py-1.5 text-xs first:border-t-0">
                    <span className="tabular w-4 shrink-0 text-right text-muted">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <a href={p.url ?? undefined} target="_blank" rel="noreferrer" title={p.title !== p.data.en ? p.data.en : undefined} className="text-ink hover:underline">
                        {p.title}
                      </a>
                      <div className="text-[11px] text-muted">
                        <span className="tabular">
                          {fmtNumber(p.data.upvotes, lang, 0)} {t.upvotes}
                        </span>
                        {(p.data.org || p.data.authors) && ` · ${p.data.org ?? p.data.authors}`}
                        {p.data.github && (
                          <>
                            {" · "}
                            <a href={p.data.github} target="_blank" rel="noreferrer" className="hover:underline">
                              GitHub
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="text-[10px] leading-snug text-muted">{t.papersNote}</p>
            </div>
          ),
        },
        {
          key: "models",
          label: t.trendingModels,
          content: (
            <div className="flex flex-col gap-2">
              <ol className={list}>
                {models.map((m, i) => (
                  <li key={m.id} className="flex gap-2 border-t border-line py-1.5 text-xs first:border-t-0">
                    <span className="tabular w-4 shrink-0 text-right text-muted">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <a href={m.url ?? undefined} target="_blank" rel="noreferrer" className="break-all text-ink hover:underline">
                        {m.title}
                      </a>
                      <div className="tabular text-[11px] text-muted">
                        {[m.data.task, `${fmtCompact(m.data.likes, lang)} ${t.likes}`, `${fmtCompact(m.data.downloads, lang)} ${t.downloads}`].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="text-[10px] leading-snug text-muted">{t.modelsTrendNote}</p>
            </div>
          ),
        },
      ]}
    />
  );
}

// ---------------------------------------------------------------- exploited vulnerabilities

/** "SonicWall SonicOS SSLVPN Use of …" → "Use of …": the vendor and product are already on the line above. */
function flawName(title: string, vendor: string, product: string): string {
  for (const prefix of [`${vendor} ${product} `, `${vendor} `]) if (title.startsWith(prefix)) return title.slice(prefix.length);
  return title;
}

export async function ExploitedVulns({ lang }: { lang: Locale }) {
  const t = getDict(lang).tech;
  const rows = await getItems<KevEntry>("kev", lang, 60);
  if (!rows.length) return <EmptyState lang={lang} message={t.noKev} />;
  const ransomware = rows.filter((r) => r.data.ransomware).length;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-ink-2">{t.kevSummary.replace("{n}", String(rows.length)).replace("{r}", String(ransomware))}</p>
      <ul className="scroll-thin grid max-h-[420px] grid-cols-1 gap-x-6 overflow-auto pr-1 md:grid-cols-2">
        {rows.map((r) => (
          <li key={r.id} className="flex gap-3 border-t border-line py-1.5 text-xs">
            <span className="tabular w-16 shrink-0 whitespace-nowrap text-muted">{r.ts ? fmtDate(r.ts, lang) : ""}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="font-medium text-ink">
                  {r.data.vendor} {r.data.product}
                </span>
                {r.data.ransomware && <span className="rounded bg-critical/15 px-1 text-[10px] font-medium text-critical">{t.ransomware}</span>}
              </div>
              <div className="text-[11px] text-ink-2" title={r.data.desc ?? undefined}>
                {flawName(r.title, r.data.vendor, r.data.product)}
              </div>
              <div className="tabular text-[11px] text-muted">
                <a href={r.url ?? undefined} target="_blank" rel="noreferrer" className="hover:underline">
                  {r.id}
                </a>
                {r.data.due && ` · ${t.due.replace("{date}", fmtDate(r.data.due, lang))}`}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[10px] leading-snug text-muted">{t.kevNote}</p>
    </div>
  );
}

// ---------------------------------------------------------------- exploited flaws by vendor

export async function KevVendorsBody({ lang }: { lang: Locale }) {
  const t = getDict(lang).tech;
  const windows = (await getItems<KevVendors>("kev_vendors", lang)).map((w) => w.data).filter((w) => w.rows.length);
  if (!windows.length) return <EmptyState lang={lang} message={t.noKev} />;
  const pane = (w: KevVendors) => {
    const top3 = w.rows.slice(0, 3).reduce((a, r) => a + r.n, 0);
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-ink-2">
          {t.kevVendorsSummary
            .replace("{total}", String(w.total))
            .replace("{days}", String(w.days))
            .replace("{share}", fmtNumber(w.total ? (top3 / w.total) * 100 : 0, lang, 0))}
        </p>
        <BarList
          rows={w.rows.map((r) => ({
            key: r.vendor,
            label: r.vendor,
            value: r.n,
            text: String(r.n),
            hint: t.kevVendorHint.replace("{vendor}", r.vendor).replace("{n}", String(r.n)).replace("{r}", String(r.ransomware)),
          }))}
          color="single"
          label={t.kevVendorsLabel.replace("{days}", String(w.days))}
        />
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-2">
      {windows.length > 1 ? (
        <Tabs tabs={windows.map((w) => ({ key: String(w.days), label: w.days === 365 ? t.kevYear : t.kevWindow.replace("{days}", String(w.days)), content: pane(w) }))} />
      ) : (
        pane(windows[0])
      )}
      <p className="text-[10px] leading-snug text-muted">{t.kevVendorsNote}</p>
    </div>
  );
}

// ---------------------------------------------------------------- Hacker News, news

export async function TechHn({ lang }: { lang: Locale }) {
  const [items, lob] = await Promise.all([getItems<HnItem["data"]>("hn", lang, 15), getItems<LobstersItem>("lobsters", lang, 15)]);
  if (!items.length && !lob.length) return <EmptyState lang={lang} />;
  // Lobsters in the Hacker News list's shape: score as points, its discussion page as the comments link.
  const lobsters: HnItem[] = lob.map((l) => ({ ...l, data: { points: l.data.score, comments: l.data.comments, hnUrl: l.data.discussion } }));
  // The list adds no height of its own: it fills what the stock table beside it leaves, and scrolls.
  return (
    <div className="relative min-h-[320px] flex-1">
      <div className="scroll-thin absolute inset-0 overflow-auto pr-1">
        <Tabs
          tabs={[
            { key: "hn", label: "Hacker News", content: <HnList items={items} lang={lang} /> },
            { key: "lobsters", label: "Lobsters", content: <HnList items={lobsters} lang={lang} /> },
          ]}
        />
      </div>
    </div>
  );
}

export async function TechNewsBody({ lang }: { lang: Locale }) {
  const [items, now] = await Promise.all([getTechNews(lang, 30), requestNow()]);
  if (!items.length) return <EmptyState lang={lang} />;
  return <NewsGrid items={items} now={now} lang={lang} />;
}

// ---------------------------------------------------------------- Taiwan's AI hardware chain, monthly sales

export async function TwRevenueBody({ lang }: { lang: Locale }) {
  const t = getDict(lang).tech;
  const rows = (await getItems<TwRevenue>("tw_revenue", lang, 20)).map((i) => i.data);
  if (!rows.length) return <EmptyState lang={lang} />;
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const month = Math.max(...rows.map((r) => r.month));
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-ink-2">{t.twMonth.replace("{m}", fmtPeriod(month, "m", lang))}</p>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="tabular w-full min-w-[420px] text-xs">
          <thead className="text-muted">
            <tr>
              <th className="py-1 text-left font-normal" />
              <th className="py-1 text-right font-normal">{t.twRevenue}</th>
              <th className="py-1 text-right font-normal">{t.twMom}</th>
              <th className="py-1 text-right font-normal">{t.twYoy}</th>
              <th className="py-1 text-right font-normal">{t.twYtd}</th>
            </tr>
          </thead>
          <tbody>
            {TW_REVENUE.flatMap((c) => {
              const r = byCode.get(c.code);
              return r
                ? [
                    <tr key={c.code} className="border-t border-line">
                      <td className="py-1">
                        <span className="text-ink">{c.name}</span> <span className="text-[10px] text-muted">{pick(c.role, lang)}</span>
                        {r.month < month && <span className="ml-1 text-[10px] text-muted">({fmtPeriod(r.month, "m", lang, true)})</span>}
                      </td>
                      <td className="py-1 text-right font-medium text-ink">{fmtNumber(r.revenue, lang, r.revenue < 100 ? 1 : 0)}</td>
                      <td className="py-1 text-right">
                        <Pct v={r.mom} lang={lang} />
                      </td>
                      <td className="py-1 text-right">
                        <Pct v={r.yoy} lang={lang} />
                      </td>
                      <td className="py-1 text-right">
                        <Pct v={r.ytdYoy} lang={lang} />
                      </td>
                    </tr>,
                  ]
                : [];
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] leading-snug text-muted">{t.twNote}</p>
    </div>
  );
}

// ---------------------------------------------------------------- hiring

export async function TechJobsBody({ lang }: { lang: Locale }) {
  const t = getDict(lang).tech;
  const [watch, notes, tiles, overall] = await Promise.all([getWatchlist(), getInsightNotes(lang), getTiles(TECH_JOBS), getAllPostings()]);
  if (tiles.every((x) => !x.data)) return <EmptyState lang={lang} />;
  const dev = tiles.find((x) => x.key === "softwareJobs")?.data?.value ?? null;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {tiles.map((x) => (
          <DetailTile key={x.key} tile={x} lang={lang} watched={watch.includes(x.key)} note={notes[x.key]} />
        ))}
      </div>
      {dev !== null && overall !== null && (
        <p className="text-xs text-ink-2">{t.devVsAll.replace("{dev}", fmtNumber(dev, lang, 1)).replace("{all}", fmtNumber(overall, lang, 1))}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- versions and end of life

const DAY = 24 * 3600_000;

export async function EolBody({ lang }: { lang: Locale }) {
  const t = getDict(lang).tech;
  const [rows, now] = await Promise.all([getItems<EolRow>("eol", lang, 20), requestNow()]);
  if (!rows.length) return <EmptyState lang={lang} />;
  const d = (ts: number) => fmtDate(ts, lang, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return (
    <div className="flex flex-col gap-2">
      <table className="tabular w-full text-xs">
        <thead className="text-muted">
          <tr>
            <th className="py-1 text-left font-normal" />
            <th className="py-1 text-left font-normal">{t.eolLatest}</th>
            <th className="py-1 text-right font-normal">{t.eolNext}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ data: r }) => {
            const days = r.nextEol ? Math.ceil((r.nextEol.date - now) / DAY) : null;
            return (
              <tr key={r.name} className="border-t border-line align-top">
                <td className="py-1.5 font-medium text-ink">{r.name}</td>
                <td className="py-1.5 text-ink-2">
                  {r.latest ?? r.cycle}
                  {r.latestDate !== null && <span className="block text-[10px] text-muted">{d(r.latestDate)}</span>}
                </td>
                <td className="py-1.5 text-right">
                  {r.nextEol && days !== null ? (
                    <>
                      <span className={clsx(days <= 30 ? "font-semibold text-down" : days <= 180 ? "text-ink" : "text-ink-2")}>
                        {r.name} {r.nextEol.cycle}: {d(r.nextEol.date)}
                      </span>
                      <span className="block text-[10px] text-muted">{t.eolIn.replace("{n}", fmtNumber(days, lang, 0))}</span>
                    </>
                  ) : (
                    <span className="text-muted">{t.eolNone}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[10px] leading-snug text-muted">{t.eolNote}</p>
    </div>
  );
}

// ---------------------------------------------------------------- weekly AI note

export async function TechNoteBody({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const { note, hasKey } = await getTechNote(lang);
  if (!note) return <p className="py-2 text-sm text-ink-2">{hasKey ? d.tech.noteEmpty : d.macro.noteNeedsKey}</p>;
  return <WeeklyNote note={note} lang={lang} caveat={d.tech.noteCaveat} />;
}

// ---------------------------------------------------------------- AI models: quality against price

const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/** The best-rated models on LMArena that OpenRouter sells, by blended price (log scale) and rating. */
export async function AiValueBody({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const t = d.tech;
  const rows = (await getItems<AiValue>("ai_value", lang, 45)).map((i) => i.data);
  if (rows.length < 5) return <EmptyState lang={lang} />;
  const usd = (v: number) => `$${fmtNumber(v, lang, v < 1 ? 2 : v < 10 ? 1 : 0)}`;
  const best = rows
    .filter((r) => r.rating >= median(rows.map((x) => x.rating)))
    .sort((a, b) => a.blended - b.blended)
    .slice(0, 3);
  return (
    <div className="flex flex-col gap-2">
      {best.length > 0 && <p className="text-xs text-ink-2">{t.valueBest.replace("{list}", best.map((r) => `${r.name} (${usd(r.blended)})`).join(", "))}</p>}
      <QuadrantScatter
        points={rows.map((r) => ({
          key: r.id,
          label: r.name,
          name: `${r.name} · ${r.org}`,
          x: r.blended,
          y: r.rating,
          group: r.open ? 1 : 0,
          notes: [t.valueRank.replace("{rank}", String(r.rank)), t.valuePrices.replace("{in}", usd(r.priceIn)).replace("{out}", usd(r.priceOut))],
        }))}
        split={{ x: median(rows.map((r) => r.blended)), y: median(rows.map((r) => r.rating)) }}
        quadrants={{ tl: t.valueTl, tr: t.valueTr, bl: t.valueBl, br: t.valueBr }}
        danger="br"
        x={{ label: t.valueX, suffix: "", prefix: "$", digits: 2, log: true }}
        y={{ label: t.valueY, suffix: "", digits: 0 }}
        groups={[t.valueClosed, t.valueOpen]}
        locale={lang}
        height={380}
        tableLabels={{ table: d.common.showTable, chart: d.common.showChart, name: t.valueModel }}
      />
      <p className="text-[10px] leading-snug text-muted">{t.valueNote.replace("{date}", rows[0].date ?? "—")}</p>
    </div>
  );
}

// ---------------------------------------------------------------- space: geomagnetic storms, launches

const KP_BAR = (kp: number) => (kp >= 7 ? "bg-critical" : kp >= 5 ? "bg-warning" : "bg-s1");

export async function SpaceBody({ lang }: { lang: Locale }) {
  const t = getDict(lang).tech;
  const [sw, launches, now] = await Promise.all([
    getItems<SpaceWeather>("spaceweather", lang, 1),
    getItems<{ provider: string; rocket: string; pad: string; status: string }>("launch", lang, 6),
    requestNow(),
  ]);
  const w = sw[0]?.data;
  if (!w && !launches.length) return <EmptyState lang={lang} />;
  const past = w?.kp.filter((p) => p.kind !== "predicted") ?? [];
  const ahead = w?.kp.filter((p) => p.kind === "predicted" && p.ts >= now - 3 * 3600_000) ?? [];
  const cur = past[past.length - 1];
  const peak = ahead.reduce<(typeof ahead)[number] | null>((a, p) => (!a || p.kp > a.kp ? p : a), null);
  const level = (kp: number) => (kp >= 5 ? `G${Math.min(5, Math.floor(kp) - 4)}` : kp >= 4 ? t.kpActive : t.kpQuiet);
  const bars = w ? w.kp.filter((p) => p.ts >= now - 4 * 24 * 3600_000) : [];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {w && (
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-sm text-ink">
            {cur && t.kpNow.replace("{kp}", fmtNumber(cur.kp, lang, 1)).replace("{level}", level(cur.kp))}
            {peak && <span className="text-ink-2"> · {t.kpPeak.replace("{kp}", fmtNumber(peak.kp, lang, 1)).replace("{level}", level(peak.kp))}</span>}
          </p>
          <div className="relative flex h-28 items-end gap-px" role="img" aria-label={t.kpChart}>
            {[5, 7].map((k) => (
              <span key={k} aria-hidden className="absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${(k / 9) * 100}%` }} />
            ))}
            {bars.map((p) => (
              <span
                key={p.ts}
                title={`${fmtDateTime(p.ts, lang)}: Kp ${fmtNumber(p.kp, lang, 2)}${p.kind === "predicted" ? ` (${t.kpForecast})` : ""}`}
                className={clsx("min-w-0 flex-1 rounded-t-sm", KP_BAR(p.kp), p.kind === "predicted" && "opacity-40")}
                style={{ height: `${Math.max(2, (p.kp / 9) * 100)}%` }}
              />
            ))}
          </div>
          <p className="text-[10px] leading-snug text-muted">{t.kpNote}</p>
        </div>
      )}
      {launches.length > 0 && (
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-xs font-semibold text-ink-2">{t.launches}</h3>
          <ul className="flex flex-col">
            {launches.map((l) => (
              <li key={l.id} className="border-t border-line py-1.5 text-xs first:border-t-0">
                <span className="text-ink">{l.title}</span>
                <span className="block text-[11px] text-muted">
                  {[l.ts ? fmtDateTime(l.ts, lang) : null, l.data.provider, l.data.pad?.split(",").slice(-1)[0]?.trim(), l.data.status].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- package downloads

export async function PackagesBody({ lang }: { lang: Locale }) {
  const t = getDict(lang).tech;
  const rows = (await getPackages()).filter((r) => r.week !== null);
  if (!rows.length) return <EmptyState lang={lang} />;
  const groups = (["web", "aiJs", "aiPy"] as const).map((g) => ({ g, rows: rows.filter((r) => r.group === g) })).filter((x) => x.rows.length);
  return (
    <div className="flex flex-col gap-2">
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="tabular w-full min-w-[440px] text-xs">
          <thead className="text-muted">
            <tr>
              <th className="py-1 text-left font-normal" />
              <th className="py-1 text-right font-normal">{t.pkgWeek}</th>
              <th className="py-1 text-right font-normal">{t.pkg4}</th>
              <th className="py-1 text-right font-normal">{t.pkg12}</th>
              <th className="w-24 py-1 font-normal" />
            </tr>
          </thead>
          {groups.map(({ g, rows: list }) => (
            <tbody key={g}>
              <tr>
                <th colSpan={5} className="pt-2 pb-1 text-left text-[11px] font-semibold text-ink-2">
                  {t.pkgGroups[g]}
                </th>
              </tr>
              {list.map((r) => (
                <tr key={`${r.registry}:${r.name}`} className="border-t border-line">
                  <td className="py-1 font-medium text-ink">{r.name}</td>
                  <td className="py-1 text-right text-ink">{fmtCompact(r.week!, lang)}</td>
                  <td className="py-1 text-right">
                    <Pct v={r.ch4} lang={lang} />
                  </td>
                  <td className="py-1 text-right">
                    <Pct v={r.ch12} lang={lang} />
                  </td>
                  <td className="py-1 pl-2">{r.spark.length > 1 && <Sparkline points={r.spark} width={88} height={22} label={`${r.name}, ${t.pkgSpark}`} />}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="text-[10px] leading-snug text-muted">{t.pkgNote}</p>
    </div>
  );
}

// ---------------------------------------------------------------- training compute of the largest models

const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };

/** 9.4e26 → "9,4 × 10²⁶". */
function sci(v: number, lang: Locale): string {
  const exp = Math.floor(Math.log10(v));
  return `${fmtNumber(v / 10 ** exp, lang, 1)} × 10${String(exp).replace(/./g, (c) => SUP[c] ?? c)}`;
}

export async function ComputeBody({ lang }: { lang: Locale }) {
  const t = getDict(lang).tech;
  const s = (await getItems<ComputeSummary>("ai_compute", lang, 1))[0]?.data;
  if (!s?.top.length) return <EmptyState lang={lang} />;
  const max = s.top[0].flop;
  return (
    <div className="flex flex-col gap-2">
      {s.growthPerYear !== null && (
        <p className="text-sm text-ink">
          {t.computeGrowth.replace("{x}", fmtNumber(s.growthPerYear, lang, 1)).replace("{n}", String(s.frontierCount))}
        </p>
      )}
      <ul className="flex flex-col">
        {s.top.map((m) => (
          <li key={m.model} className="border-t border-line py-1 text-xs first:border-t-0" title={`${m.model} · ${m.org} · ${m.domain ?? ""}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate">
                <span className="text-ink">{m.model}</span> <span className="text-[10px] text-muted">{m.org} · {fmtPeriod(m.date, "m", lang, true)}</span>
              </span>
              <span className="tabular shrink-0 text-ink-2">{sci(m.flop, lang)}</span>
            </div>
            <span aria-hidden className="mt-0.5 block h-1 rounded-full bg-s1" style={{ width: `${Math.max(1, Math.round((m.flop / max) * 1000) / 10)}%` }} />
          </li>
        ))}
      </ul>
      <p className="text-[10px] leading-snug text-muted">{t.computeNote.replace("{n}", String(s.withCompute))}</p>
    </div>
  );
}
