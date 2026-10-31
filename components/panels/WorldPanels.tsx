import clsx from "clsx";
import { getDict, intlLocale, type Locale } from "@/lib/i18n";
import { fmtCompact, fmtDate, fmtNumber, fmtSigned, fmtTime } from "@/lib/format";
import { getCalendar, getEnv, getItems, requestNow } from "@/lib/queries";
import { Sparkline } from "@/components/charts/Sparkline";
import { EmptyState } from "@/components/ui/Panel";
import { Tabs } from "@/components/ui/Tabs";

const TZ = "Asia/Ho_Chi_Minh";

function dayKey(ts: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(ts);
}

// ---------------------------------------------------------------- calendar

export async function CalendarBody({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const entries = await getCalendar(lang);
  const now = await requestNow();
  if (!entries.length) return <EmptyState lang={lang} message={d.calendar.empty} />;
  const today = dayKey(now);
  const tomorrow = dayKey(now + 24 * 3600_000);
  const groups = new Map<string, typeof entries>();
  for (const e of entries) {
    const k = dayKey(e.ts);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const kindLabel = { econ: d.calendar.econ, fomc: d.calendar.fomc, launch: d.calendar.launch };
  return (
    <div className="scroll-thin flex max-h-[560px] flex-col gap-3 overflow-auto pr-1">
      {[...groups.entries()].map(([day, list]) => (
        <section key={day}>
          <h3 className="sticky top-0 bg-surface pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
            {day === today ? d.calendar.today : day === tomorrow ? d.calendar.tomorrow : fmtDate(list[0].ts, lang, { weekday: "short", day: "numeric", month: "short" })}
          </h3>
          <ul>
            {list.map((e, i) => (
              <li key={i} className="flex gap-2 border-t border-line py-1.5 text-xs">
                <span className="tabular w-10 shrink-0 text-muted">{e.allDay ? "" : fmtTime(e.ts, lang)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-1.5">
                    <span className="mt-px shrink-0 rounded bg-surface-2 px-1 text-[10px] text-ink-2">{kindLabel[e.kind]}</span>
                    <span className="text-ink">{e.title}</span>
                    {e.impact === "High" && (
                      <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-ink-2" title={d.calendar.high}>
                        <span aria-hidden className="inline-block size-1.5 rounded-full bg-critical" />
                        {d.calendar.high}
                      </span>
                    )}
                  </div>
                  {e.detail && <div className="mt-0.5 text-[11px] text-muted">{e.detail}</div>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- trending

export async function TrendingBody({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const [wikiEn, wikiVi, hn] = await Promise.all([
    getItems<{ views: number }>("wiki_en", lang, 12),
    getItems<{ views: number }>("wiki_vi", lang, 12),
    getItems<{ points: number; comments: number; hnUrl: string }>("hn", lang, 12),
  ]);
  if (!wikiEn.length && !hn.length) return <EmptyState lang={lang} />;
  const wiki = (items: typeof wikiEn) => (
    <ol className="flex flex-col">
      {items.map((it, i) => (
        <li key={it.id} className="flex items-baseline gap-2 border-t border-line py-1.5 text-xs first:border-t-0">
          <span className="tabular w-4 shrink-0 text-right text-muted">{i + 1}</span>
          <a href={it.url ?? undefined} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-ink hover:underline">
            {it.title}
          </a>
          <span className="tabular shrink-0 text-muted">
            {fmtCompact(it.data.views, lang)} {d.trending.views}
          </span>
        </li>
      ))}
    </ol>
  );
  const tabs = [
    { key: "en", label: d.trending.wikiEn, content: wiki(wikiEn) },
    {
      key: "hn",
      label: d.trending.hn,
      content: (
        <ol className="flex flex-col">
          {hn.map((it, i) => (
            <li key={it.id} className="flex gap-2 border-t border-line py-1.5 text-xs first:border-t-0">
              <span className="tabular w-4 shrink-0 text-right text-muted">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <a href={it.url ?? undefined} target="_blank" rel="noreferrer" className="text-ink hover:underline">
                  {it.title}
                </a>
                <div className="text-[11px] text-muted">
                  {it.data.points} {d.trending.points} ·{" "}
                  <a href={it.data.hnUrl} target="_blank" rel="noreferrer" className="hover:underline">
                    {it.data.comments} {d.trending.comments}
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ol>
      ),
    },
    { key: "vi", label: d.trending.wikiVi, content: wiki(wikiVi) },
  ];
  // vi.wikipedia's top list is often gamed by bots, so it is never the default tab.
  return <Tabs tabs={tabs} />;
}

// ---------------------------------------------------------------- prediction markets

function Meter({ p }: { p: number }) {
  // Same-ramp track: the unfilled part is a lighter step of the fill hue.
  return (
    <span className="relative block h-1.5 w-full overflow-hidden rounded-full" style={{ background: "color-mix(in oklab, var(--s1) 18%, transparent)" }}>
      <span className="absolute inset-y-0 left-0 rounded-full bg-s1" style={{ width: `${Math.max(0, Math.min(1, p)) * 100}%` }} />
    </span>
  );
}

export async function PredictionBody({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const [fed, poly] = await Promise.all([
    getItems<{ prob: number | null; strike: number | null; eventTitle: string }>("kalshi_fed", lang, 40),
    getItems<{ tag: string; volume24hr: number; outcomes: { label: string; prob: number; change24h: number | null }[] }>("polymarket", lang, 12),
  ]);
  if (!fed.length && !poly.length) return <EmptyState lang={lang} />;
  const pct = (p: number) => `${fmtNumber(p * 100, lang, 0)}%`;
  // Show the informative part of the ladder: strikes where the odds are not already ~0 or ~1.
  const ladder = fed.filter((f) => f.data.prob !== null && f.data.prob > 0.02 && f.data.prob < 0.98);
  return (
    <div className="scroll-thin flex max-h-[560px] flex-col gap-4 overflow-auto pr-1">
      {fed.length > 0 && fed[0].ts && (
        <section>
          <h3 className="text-xs font-semibold text-ink">{d.prediction.fed.replace("{date}", fmtDate(fed[0].ts, lang, { day: "numeric", month: "short", year: "numeric" }))}</h3>
          <p className="mb-1.5 text-[11px] text-muted">{d.prediction.fedNote}</p>
          <ul className="flex flex-col gap-1">
            {(ladder.length ? ladder : fed.slice(0, 6)).map((f) => (
              <li key={f.id} className="grid grid-cols-[88px_1fr_40px] items-center gap-2 text-xs">
                <span className="text-ink-2">{f.title}</span>
                <Meter p={f.data.prob ?? 0} />
                <span className="tabular text-right font-medium text-ink">{f.data.prob === null ? "—" : pct(f.data.prob)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-ink">{d.prediction.markets}</h3>
        {poly.map((ev) => (
          <article key={ev.id} className="border-t border-line pt-2">
            <a href={ev.url ?? undefined} target="_blank" rel="noreferrer" className="text-xs font-medium text-ink hover:underline">
              {ev.title}
            </a>
            <div className="mb-1 text-[10px] text-muted">
              {ev.data.tag === "geopolitics" ? d.prediction.geopolitics : d.prediction.economy} · {d.prediction.volume} ${fmtCompact(ev.data.volume24hr, lang)}
              {ev.ts ? ` · ${d.prediction.ends} ${fmtDate(ev.ts, lang)}` : ""}
            </div>
            <ul className="flex flex-col gap-1">
              {ev.data.outcomes.map((o) => (
                <li key={o.label} className="grid grid-cols-[minmax(0,1fr)_72px_64px] items-center gap-2 text-[11px]">
                  <span className="truncate text-ink-2" title={o.label}>
                    {o.label}
                  </span>
                  <Meter p={o.prob} />
                  <span className="tabular text-right">
                    <span className="font-medium text-ink">{pct(o.prob)}</span>
                    {o.change24h ? (
                      <span className={clsx("ml-1", o.change24h > 0 ? "text-up" : "text-down")}>{fmtSigned(o.change24h * 100, lang, 0)}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- planet & health

type AqiLevel = "good" | "moderate" | "usg" | "unhealthy" | "veryUnhealthy" | "hazardous";

function aqiLevel(aqi: number): AqiLevel {
  if (aqi <= 50) return "good";
  if (aqi <= 100) return "moderate";
  if (aqi <= 150) return "usg";
  if (aqi <= 200) return "unhealthy";
  if (aqi <= 300) return "veryUnhealthy";
  return "hazardous";
}

const AQI_DOT: Record<AqiLevel, string> = {
  good: "bg-good",
  moderate: "bg-warning",
  usg: "bg-serious",
  unhealthy: "bg-critical",
  veryUnhealthy: "bg-critical",
  hazardous: "bg-critical",
};

export async function EnvBody({ lang }: { lang: Locale }) {
  const d = getDict(lang);
  const env = await getEnv(lang);
  if (!env.co2 && !env.temp && !env.air.length) return <EmptyState lang={lang} />;
  const air = [...env.air].sort((a, b) => (b.data.aqi ?? 0) - (a.data.aqi ?? 0));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {env.co2 && (
          <div className="rounded-lg bg-surface-2/60 p-3">
            <div className="text-xs text-ink-2">{d.env.co2}</div>
            <div className="text-xl font-semibold text-ink">
              {fmtNumber(env.co2.value, lang, 1)} <span className="text-xs font-normal text-muted">ppm</span>
            </div>
            {env.co2.yearAgo !== null && (
              <div className="tabular text-[11px] text-down">
                ▲ {fmtSigned(env.co2.value - env.co2.yearAgo, lang, 1)} {d.env.co2Delta}
              </div>
            )}
            <Sparkline points={env.co2.spark} width={140} height={28} label="CO2" />
          </div>
        )}
        {env.temp && (
          <div className="rounded-lg bg-surface-2/60 p-3">
            <div className="text-xs text-ink-2">{d.env.temp}</div>
            <div className="text-xl font-semibold text-ink">{fmtSigned(env.temp.value, lang, 2)} °C</div>
            <div className="text-[11px] text-muted">
              {fmtDate(env.temp.ts, lang, { month: "short", year: "numeric", timeZone: "UTC" })} ·{" "}
              {d.env.tempNote.replace("{avg}", env.temp.avg12 === null ? "—" : `${fmtSigned(env.temp.avg12, lang, 2)} °C`)}
            </div>
            <Sparkline points={env.temp.spark} width={140} height={28} label="GISTEMP" />
          </div>
        )}
      </div>

      {air.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-semibold text-ink-2">{d.env.air}</h3>
          <ul className="grid grid-cols-2 gap-x-4">
            {air.map((c) => {
              const lvl = c.data.aqi === null ? null : aqiLevel(c.data.aqi);
              return (
                <li key={c.id} className="flex items-center gap-2 border-t border-line py-1 text-xs" title={lvl ? d.env.aqi[lvl] : undefined}>
                  <span className="min-w-0 flex-1 truncate text-ink-2">{c.title}</span>
                  {lvl && <span aria-hidden className={clsx("inline-block size-2 shrink-0 rounded-full", AQI_DOT[lvl])} />}
                  <span className="tabular w-8 text-right font-medium text-ink">{c.data.aqi ?? "—"}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-[10px] text-muted">
            {(["good", "moderate", "usg", "unhealthy"] as AqiLevel[]).map((l) => (
              <span key={l} className="mr-2 inline-flex items-center gap-1">
                <span aria-hidden className={clsx("inline-block size-1.5 rounded-full", AQI_DOT[l])} />
                {d.env.aqi[l]}
              </span>
            ))}
          </p>
        </section>
      )}

      {env.outbreaks.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-semibold text-ink-2">{d.env.outbreaks}</h3>
          <ul>
            {env.outbreaks.map((o) => (
              <li key={o.id} className="flex items-baseline gap-2 border-t border-line py-1 text-xs">
                <a href={o.url ?? undefined} target="_blank" rel="noreferrer" className="min-w-0 flex-1 text-ink hover:underline">
                  {o.title}
                </a>
                {o.ts && <span className="tabular shrink-0 text-muted">{new Intl.DateTimeFormat(intlLocale(lang), { day: "numeric", month: "short" }).format(o.ts)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
