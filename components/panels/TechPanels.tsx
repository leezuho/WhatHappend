import clsx from "clsx";
import { TECH_GROUPS } from "@/config/tech";
import { TECH_SIGNS } from "@/config/series";
import { getDict, intlLocale, type Locale } from "@/lib/i18n";
import { fmtCompact, fmtDate, fmtNumber } from "@/lib/format";
import { getInsightNotes, getItems, getTechNews, getTiles, getWatchlist, requestNow } from "@/lib/queries";
import { getTechStocks, type TechStockRow } from "@/lib/queries-tech";
import type { Impact, ServiceStatus, StatusIncident } from "@/lib/sources/cloudstatus";
import type { AiModel } from "@/lib/sources/openrouter";
import type { HfModel, HfPaper } from "@/lib/sources/huggingface";
import type { KevEntry } from "@/lib/sources/kev";
import { Sparkline } from "@/components/charts/Sparkline";
import { EmptyState } from "@/components/ui/Panel";
import { Tabs } from "@/components/ui/Tabs";
import { DetailTile } from "./MarketPanels";
import { Pct } from "./CryptoPanels";
import { NewsGrid } from "./NewsGrid";
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
  const bad = services.filter((s) => s.data.level && SEVERITY[s.data.level] >= SEVERITY.unknown).length;
  const incidents = services
    .flatMap((s) => s.data.incidents.map((i) => ({ ...i, service: s.title })))
    .sort((a, b) => SEVERITY[b.impact] - SEVERITY[a.impact] || (b.since ?? 0) - (a.since ?? 0));
  const shown = incidents.slice(0, 6);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-2">{bad ? t.statusSummary.replace("{bad}", String(bad)).replace("{n}", String(services.length)) : t.statusAllOk.replace("{n}", String(services.length))}</p>
      <ul className="grid grid-cols-2 gap-1.5">
        {services.map((s) => (
          <li key={s.id}>
            <a
              href={s.url ?? undefined}
              target="_blank"
              rel="noreferrer"
              title={s.data.error ?? s.data.description ?? undefined}
              className="flex flex-col gap-0.5 rounded-lg bg-surface-2/60 px-2.5 py-1.5 hover:bg-surface-2"
            >
              <span className="flex items-center gap-1.5">
                <Dot level={s.data.level} />
                <span className="truncate text-xs font-medium text-ink">{s.title}</span>
              </span>
              <span className={clsx("truncate text-[11px]", s.data.level && s.data.level !== "none" ? "text-ink" : "text-muted")}>
                {s.data.level ? t.levels[s.data.level] : t.unreadable}
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

// ---------------------------------------------------------------- Hacker News, news

export async function TechHn({ lang }: { lang: Locale }) {
  const items: HnItem[] = await getItems("hn", lang, 15);
  if (!items.length) return <EmptyState lang={lang} />;
  // The list adds no height of its own: it fills what the stock table beside it leaves, and scrolls.
  return (
    <div className="relative min-h-[320px] flex-1">
      <div className="scroll-thin absolute inset-0 overflow-auto pr-1">
        <HnList items={items} lang={lang} />
      </div>
    </div>
  );
}

export async function TechNewsBody({ lang }: { lang: Locale }) {
  const [items, now] = await Promise.all([getTechNews(lang, 30), requestNow()]);
  if (!items.length) return <EmptyState lang={lang} />;
  return <NewsGrid items={items} now={now} lang={lang} />;
}
