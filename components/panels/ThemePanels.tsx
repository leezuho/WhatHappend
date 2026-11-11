import clsx from "clsx";
import { getDict, pick, type Dict, type Locale } from "@/lib/i18n";
import { fmtDate, fmtDateTime, fmtDelta, fmtNumber, fmtPct, fmtPeriod, fmtRelative, fmtSigned, fmtTime, fmtValue } from "@/lib/format";
import { getThemes } from "@/lib/queries";
import type { GaugeReading, ThemeArticle, ThemeFact, ThemeMarket, ThemeState, ThemeStatus } from "@/lib/data/themes";
import type { ThemeGauge } from "@/config/themes";
import { Sparkline } from "@/components/charts/Sparkline";
import { EmptyState } from "@/components/ui/Panel";

// The overview's "Dominant themes" (config/themes.ts, LLDD 04 §3): one card per
// theme with its status, the AI note, the gauges behind the status, how it
// reaches Vietnam, the prediction-market odds and the latest headlines.

type T = Dict["themes"];

const STATUS_DOT: Record<ThemeStatus, string> = {
  heating: "bg-serious",
  cooling: "bg-s1",
  steady: "bg-muted",
  unknown: "bg-surface-2 ring-1 ring-line",
};

function gaugeValue(g: GaugeReading, lang: Locale, d: Dict): string {
  if (g.def.unit === "₫" && Math.abs(g.value) >= 1e9) {
    const text = d.vn.valueFmt.replace("{v}", fmtNumber(Math.abs(g.value) / 1e9, lang, 0));
    return `${g.value < 0 ? "−" : g.value > 0 ? "+" : ""}${text}`;
  }
  return fmtValue(g.def, g.value, lang);
}

/** The month's change as the tile would print it: % for prices, bp or pp for rates. */
function gaugeChange(g: GaugeReading, lang: Locale): string | null {
  if (g.change === null) return null;
  if (g.def.delta === "pct") return fmtPct(g.change, lang, 1);
  return fmtDelta(g.def, { value: g.value, change: g.change, changePct: null, ts: g.ts, spark: [] }, lang);
}

function GaugeRow({ g, label, lang, d }: { g: GaugeReading; label: string; lang: Locale; d: Dict }) {
  const t = d.themes;
  const change = gaugeChange(g, lang);
  // Which way the move pushes the theme: the arrow is colored by that, not by "up is good".
  const push = g.sumSessions ? (g.heat ?? 0) : (g.change ?? 0) * g.sign;
  const asOf = g.def.freq ? fmtPeriod(g.ts, g.def.freq, lang, true) : null;
  const tip = [
    pick(g.def.name, lang),
    pick(g.def.explain, lang),
    g.heat === null
      ? t.notCounted
      : t.sinceTip
          .replace("{date}", g.from === null ? "—" : g.def.freq ? fmtPeriod(g.from, g.def.freq, lang) : fmtDate(g.from, lang))
          .replace("{heat}", fmtNumber(Math.abs(g.heat), lang, 1))
          .replace("{dir}", g.heat > 0 ? t.toHeat : t.toCool),
  ].join("\n");
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto_4.25rem_3rem] items-center gap-x-2 text-xs" title={tip}>
      <span className="truncate text-ink-2">
        {label}
        {asOf && <span className="text-muted"> · {asOf}</span>}
      </span>
      <span className="tabular text-right font-medium whitespace-nowrap text-ink">{gaugeValue(g, lang, d)}</span>
      <span className={clsx("tabular text-right text-[11px] whitespace-nowrap", g.heat === null ? "text-muted" : "text-ink-2")}>
        {change !== null && (
          <>
            <span aria-hidden className={clsx(push > 0 ? "text-serious" : push < 0 ? "text-s1" : "text-muted")}>
              {g.change! > 0 ? "▲" : g.change! < 0 ? "▼" : "•"}
            </span>{" "}
            {change}
          </>
        )}
      </span>
      <Sparkline points={g.spark} width={48} height={16} label={label} />
    </li>
  );
}

function Gauges({ gauges, defs, lang, d }: { gauges: GaugeReading[]; defs: ThemeGauge[]; lang: Locale; d: Dict }) {
  const labelOf = (g: GaugeReading) => {
    const def = defs.find((x) => (typeof x.series === "string" ? x.series === g.key : x.series.id === g.def.id));
    return def ? pick(def.label, lang) : pick(g.def.name, lang);
  };
  return (
    <ul className="flex flex-col gap-1">
      {gauges.map((g) => (
        <GaugeRow key={g.def.id} g={g} label={labelOf(g)} lang={lang} d={d} />
      ))}
    </ul>
  );
}

function Facts({ facts, lang }: { facts: ThemeFact[]; lang: Locale }) {
  if (!facts.length) return null;
  return (
    <ul className="flex flex-col gap-0.5">
      {facts.map((f) => (
        <li key={f.id} className="text-[11px] leading-snug text-ink-2">
          {pick(f.text, lang)}
        </li>
      ))}
    </ul>
  );
}

function Markets({ markets, lang, t }: { markets: ThemeMarket[]; lang: Locale; t: T }) {
  if (!markets.length) return null;
  return (
    <div className="flex flex-col gap-1 border-t border-line pt-2">
      <p className="text-[11px] font-semibold text-ink-2">{t.odds}</p>
      {markets.map((m) => {
        const title = (lang === "vi" ? m.titleVi : null) ?? m.title;
        const label = m.label === "Yes" ? t.yes : m.label;
        return (
          <a
            key={m.title}
            href={m.url ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2 text-[11px] hover:underline"
            title={`Polymarket · ${fmtTime(m.fetchedAt, lang)}`}
          >
            <span className="truncate text-ink-2">
              {title} <span className="text-muted">· {label}</span>
            </span>
            <span className="tabular font-medium whitespace-nowrap text-ink">
              {fmtNumber(m.prob * 100, lang, 0)}%
              {m.change24h !== null && Math.round(m.change24h * 100) !== 0 && (
                <span className="font-normal text-muted"> {fmtSigned(m.change24h * 100, lang, 0)}</span>
              )}
            </span>
          </a>
        );
      })}
    </div>
  );
}

function News({ news, lang, t, now }: { news: ThemeState["news"]; lang: Locale; t: T; now: number }) {
  const title = (a: ThemeArticle) => (lang === "vi" ? a.titleVi : a.titleEn) ?? a.title;
  return (
    <div className="mt-auto flex flex-col gap-1.5 border-t border-line pt-2">
      <p className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="font-semibold text-ink-2">{t.news}</span>
        <span className="tabular text-muted">{t.newsCount.replace("{day}", String(news.day)).replace("{week}", String(news.week))}</span>
      </p>
      {news.latest.length ? (
        <ul className="flex flex-col gap-1.5">
          {news.latest.map((a) => (
            <li key={a.url} className="flex flex-col">
              <a href={a.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-xs leading-snug text-ink hover:underline">
                {title(a)}
              </a>
              <span className="text-[10px] text-muted">
                {a.source} · {fmtRelative(a.publishedAt, now, lang)}
                {a.alsoIn > 0 && ` · ${t.more.replace("{n}", String(a.alsoIn))}`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted">{t.noNews}</p>
      )}
    </div>
  );
}

function ThemeCard({ s, note, lang, now }: { s: ThemeState; note: string | null; lang: Locale; now: number }) {
  const d = getDict(lang);
  const t = d.themes;
  const heatTip = t.heatTip.replace("{means}", pick(s.def.heat, lang)).replace("{heat}", s.heat === null ? "—" : fmtSigned(s.heat, lang, 2));
  return (
    <li className="flex min-w-0 flex-col gap-2.5 rounded-lg bg-surface-2/60 p-3">
      <header className="flex items-start justify-between gap-2">
        <h3 className="text-sm leading-snug font-semibold text-ink">{pick(s.def.name, lang)}</h3>
        <span title={heatTip} className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-ink">
          <span aria-hidden className={clsx("inline-block size-1.5 rounded-full", STATUS_DOT[s.status])} />
          {t.status[s.status]}
          {s.heat !== null && <span className="tabular font-normal text-muted">{fmtSigned(s.heat, lang, 1)}</span>}
        </span>
      </header>
      {note && <p className="text-xs leading-relaxed text-ink-2">{note}</p>}
      <Gauges gauges={s.gauges} defs={s.def.gauges} lang={lang} d={d} />
      <Facts facts={s.facts} lang={lang} />
      {s.vietnam && s.def.vietnam && (
        <div className="flex flex-col gap-1 border-t border-line pt-2">
          <p className="text-[11px] leading-snug text-muted">
            <span className="font-semibold text-ink-2">{t.vietnam}:</span> {pick(s.def.vietnam.text, lang)}
          </p>
          <Gauges gauges={s.vietnam.gauges} defs={s.def.vietnam.gauges} lang={lang} d={d} />
          <Facts facts={s.vietnam.facts} lang={lang} />
        </div>
      )}
      <Markets markets={s.markets} lang={lang} t={t} />
      <News news={s.news} lang={lang} t={t} now={now} />
    </li>
  );
}

export async function ThemesBody({ lang }: { lang: Locale }) {
  const t = getDict(lang).themes;
  const { themes, notes, hasKey, now } = await getThemes();
  if (themes.every((s) => !s.gauges.length)) return <EmptyState lang={lang} />;
  return (
    <div className="flex flex-col gap-2">
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {themes.map((s) => (
          <ThemeCard key={s.def.id} s={s} note={notes?.notes[s.def.id]?.[lang] ?? null} lang={lang} now={now} />
        ))}
      </ul>
      <p className="text-[11px] text-muted">
        {t.rules}
        {!hasKey ? ` ${t.needsKey}` : notes ? ` · ${t.aiAt.replace("{time}", fmtDateTime(notes.createdAt, lang)).replace("{model}", notes.model)}` : ""}
      </p>
    </div>
  );
}
