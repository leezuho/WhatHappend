"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import type { NewsItem } from "@/lib/queries";
import { Thumb } from "@/components/ui/Thumb";

interface Labels {
  all: string;
  alsoIn: string;
  regions: Record<string, string>;
  topics: Record<string, string>;
  untagged: string;
  regionGroup: string;
  topicGroup: string;
}

function ago(ts: number, now: number, locale: string) {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "narrow" });
  const m = Math.round((ts - now) / 60_000);
  if (Math.abs(m) < 60) return rtf.format(m, "minute");
  const h = Math.round(m / 60);
  if (Math.abs(h) < 24) return rtf.format(h, "hour");
  return rtf.format(Math.round(h / 24), "day");
}

export function NewsList({ items, now, labels, locale }: { items: NewsItem[]; now: number; labels: Labels; locale: "vi" | "en" }) {
  const [region, setRegion] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const loc = locale === "vi" ? "vi-VN" : "en-US";

  const regions = useMemo(() => countBy(items, (i) => i.region), [items]);
  const topics = useMemo(() => countBy(items.filter((i) => !region || i.region === region), (i) => i.topic), [items, region]);
  const filtered = items.filter((i) => (!region || i.region === region) && (!topic || i.topic === topic)).slice(0, 40);
  const featured = pickFeatured(filtered);
  const shown = filtered.filter((i) => !featured.includes(i));
  const tagged = items.some((i) => i.topic);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label={labels.regionGroup}>
        <Chip active={!region} onClick={() => (setRegion(null), setTopic(null))}>
          {labels.all}
        </Chip>
        {regions.map(([r, n]) => (
          <Chip key={r} active={region === r} onClick={() => (setRegion(r === region ? null : r), setTopic(null))}>
            {labels.regions[r] ?? r} <span className="text-muted">{n}</span>
          </Chip>
        ))}
      </div>
      {tagged ? (
        <div className="flex flex-wrap gap-1" role="group" aria-label={labels.topicGroup}>
          {topics.map(([t, n]) => (
            <Chip key={t} small active={topic === t} onClick={() => setTopic(t === topic ? null : t)}>
              {labels.topics[t] ?? t} <span className="text-muted">{n}</span>
            </Chip>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted">{labels.untagged}</p>
      )}
      {featured.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-3">
          {featured.map((n) => (
            <li key={n.id} className="min-w-0">
              <a href={n.url} target="_blank" rel="noreferrer" className="group flex flex-col gap-1.5">
                <Thumb src={n.image} className="aspect-video w-full" />
                <span className="line-clamp-3 text-sm leading-snug font-medium text-ink group-hover:underline">{n.title}</span>
              </a>
              <Meta n={n} now={now} loc={loc} labels={labels} />
            </li>
          ))}
        </ul>
      )}
      <ul className="scroll-thin max-h-[520px] overflow-auto pr-1">
        {shown.map((n) => (
          <li key={n.id} className="flex items-start gap-3 border-t border-line py-2 first:border-t-0">
            <div className="min-w-0 flex-1">
              <a href={n.url} target="_blank" rel="noreferrer" className="text-sm leading-snug text-ink hover:underline">
                {n.title}
              </a>
              <Meta n={n} now={now} loc={loc} labels={labels} />
            </div>
            <Thumb src={n.image} className="h-12 w-[72px]" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Meta({ n, now, loc, labels }: { n: NewsItem; now: number; loc: string; labels: Labels }) {
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
      <span className="font-medium text-ink-2">{n.source}</span>
      <span className="tabular">{ago(n.publishedAt, now, loc)}</span>
      {n.topic && <span>{labels.topics[n.topic] ?? n.topic}</span>}
      {n.alsoIn.length > 0 && (
        <span>
          {labels.alsoIn}: {n.alsoIn.join(", ")}
        </span>
      )}
    </div>
  );
}

/**
 * Up to three stories with a photo for the card row: the most widely carried first (more outlets =
 * bigger story), newest breaking ties. Only from the first 15 so the cards stay fresh.
 */
function pickFeatured(items: NewsItem[], n = 3): NewsItem[] {
  return items
    .slice(0, 15)
    .filter((i) => i.image?.startsWith("https://"))
    .sort((a, b) => b.alsoIn.length - a.alsoIn.length || b.publishedAt - a.publishedAt)
    .slice(0, n);
}

function countBy(items: NewsItem[], key: (i: NewsItem) => string | null): [string, number][] {
  const m = new Map<string, number>();
  for (const i of items) {
    const k = key(i);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function Chip({ active, onClick, children, small }: { active: boolean; onClick: () => void; children: React.ReactNode; small?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        "rounded-full border px-2.5",
        small ? "py-0 text-[11px]" : "py-0.5 text-xs",
        active ? "border-accent bg-accent text-on-accent" : "border-line text-ink-2 hover:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}
