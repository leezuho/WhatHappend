import { Suspense, type ReactNode } from "react";
import clsx from "clsx";
import type { SourceId } from "@/config/sources";
import type { Locale } from "@/lib/i18n";
import { getDict } from "@/lib/i18n";
import { getPanelStatus } from "@/lib/queries";
import { fmtDateTime, fmtTime } from "@/lib/format";

interface PanelProps {
  title: string;
  subtitle?: string;
  sources: SourceId[];
  lang: Locale;
  className?: string;
  children: ReactNode;
  /** Extra controls rendered in the header, before the status. */
  actions?: ReactNode;
  /** Anchor for links from other panels; the scroll margin keeps the title below the sticky top bar. */
  id?: string;
}

// Static frame (title, subtitle) is part of the prerendered shell; the status
// line and the body stream in per request behind their own Suspense.
export function Panel({ title, subtitle, sources, lang, className, children, actions, id }: PanelProps) {
  return (
    <section id={id} className={clsx("flex min-w-0 scroll-mt-32 flex-col rounded-xl border border-line bg-surface shadow-card", className)}>
      <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <div className="min-w-0">
          <h2 className="font-display text-[15px] leading-snug font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <Suspense fallback={null}>
            <PanelStatusLine sources={sources} lang={lang} />
          </Suspense>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
        <Suspense fallback={<PanelSkeleton />}>{children}</Suspense>
      </div>
    </section>
  );
}

async function PanelStatusLine({ sources, lang }: { sources: SourceId[]; lang: Locale }) {
  const status = await getPanelStatus(sources);
  const t = getDict(lang).common;
  if (status.missingKey.length && !status.lastOk) {
    return (
      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-2" title={status.missingKey.join(", ")}>
        {t.needsKey}
      </span>
    );
  }
  if (!status.lastOk) return null;
  const tip = status.failing.map((f) => `${f.source}: ${f.error ?? "?"}`).join("\n") || `${t.updated} ${fmtDateTime(status.lastOk, lang)}`;
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted" title={tip}>
      {status.stale ? (
        <span className="flex items-center gap-1 rounded-full bg-surface-2 px-1.5 py-0.5 text-ink-2">
          <span aria-hidden className="inline-block size-1.5 rounded-full bg-warning" />
          {status.failing.length ? t.sourceError : t.stale}
        </span>
      ) : (
        <span aria-hidden className="inline-block size-1.5 rounded-full bg-good" />
      )}
      <span className="tabular">
        {t.updated} {fmtTime(status.lastOk, lang)}
      </span>
    </span>
  );
}

export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 py-1" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-surface-2" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ lang, message }: { lang: Locale; message?: string }) {
  return <p className="py-6 text-center text-xs text-muted">{message ?? getDict(lang).common.noData}</p>;
}
