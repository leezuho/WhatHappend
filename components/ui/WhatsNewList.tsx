"use client";

import { useState, useSyncExternalStore } from "react";
import clsx from "clsx";
import type { Locale } from "@/lib/i18n";
import { fmtDateTime, fmtRelative } from "@/lib/format";

// The "What's new since last time" list: the server sends the change log of the
// last two weeks, this keeps only what came after the reader's previous visit.
// Visits live in localStorage (a per-reader convenience, nothing the worker
// needs). A visit ends after 30 minutes away: reloads and the page's own
// refreshes keep the same "since", and a tab left open overnight rolls it
// forward when it is looked at again.

export type Tone = "up" | "down" | "warn" | "crit" | "heat" | "cool" | "neutral";

export interface NewsEntry {
  id: number;
  at: number;
  text: string;
  tone: Tone;
  href?: string | null;
}

const TONE: Record<Tone, string> = {
  up: "bg-up",
  down: "bg-down",
  warn: "bg-warning",
  crit: "bg-critical",
  heat: "bg-serious",
  cool: "bg-s1",
  neutral: "bg-muted",
};

const KEY = "wh:visit";
const GAP = 30 * 60_000;
const DAY = 86_400_000;
const SHOWN = 6;

interface Visit {
  /** Start of the window shown: the end of the previous visit. */
  prev: number;
  /** Last time this visit was seen active. */
  last: number;
}

interface Baseline {
  since: number;
  first: boolean;
}

function read(): Visit | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Visit> | null;
    return v && typeof v.prev === "number" && typeof v.last === "number" ? { prev: v.prev, last: v.last } : null;
  } catch {
    return null;
  }
}

function write(v: Visit) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // Private window or blocked storage: the list still works for this page view.
  }
}

/** A new visit starts after GAP away; until then the window keeps its start. */
function visit(now: number): Baseline {
  const v = read();
  if (!v) {
    write({ prev: now - DAY, last: now });
    return { since: now - DAY, first: true };
  }
  const prev = now - v.last > GAP ? v.last : v.prev;
  write({ prev, last: now });
  return { since: prev, first: false };
}

let cache: Baseline | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function onVisibility() {
  if (document.visibilityState === "hidden") {
    if (cache) write({ prev: cache.since, last: Date.now() });
    return;
  }
  const v = read();
  if (v && Date.now() - v.last > GAP) {
    cache = visit(Date.now());
    notify();
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (listeners.size === 1) document.addEventListener("visibilitychange", onVisibility);
  return () => {
    listeners.delete(cb);
    if (!listeners.size) document.removeEventListener("visibilitychange", onVisibility);
  };
}

function getBaseline(): Baseline {
  cache ??= visit(Date.now());
  return cache;
}

function markSeen() {
  const now = Date.now();
  cache = { since: now, first: false };
  write({ prev: now, last: now });
  notify();
}

export function WhatsNewList({
  entries,
  now,
  lang,
  labels,
}: {
  entries: NewsEntry[];
  /** Server time of the render, for "3 hours ago" (the page refreshes every minute). */
  now: number;
  lang: Locale;
  labels: { since: string; firstVisit: string; nothing: string; seen: string; more: string; less: string; rules: string };
}) {
  const base = useSyncExternalStore(subscribe, getBaseline, () => null);
  const [open, setOpen] = useState(false);
  if (!base) return <div className="h-5" aria-hidden />;

  const fresh = entries.filter((e) => e.at > base.since);
  const sinceText = fmtDateTime(base.since, lang);
  const heading = base.first ? labels.firstVisit : labels.since.replace("{time}", sinceText);
  if (!fresh.length) {
    return (
      <p className="text-xs text-muted" title={labels.rules}>
        {labels.nothing.replace("{time}", sinceText)}
      </p>
    );
  }
  const shown = open ? fresh : fresh.slice(0, SHOWN);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium text-ink-2" title={labels.rules}>
          {heading} · <span className="tabular">{fresh.length}</span>
        </p>
        <button type="button" onClick={markSeen} className="shrink-0 rounded-md px-2 py-0.5 text-[11px] text-ink-2 hover:bg-surface-2 hover:text-ink">
          {labels.seen}
        </button>
      </div>
      <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((e) => {
          const body = (
            <>
              <span aria-hidden className={clsx("mt-1.5 inline-block size-1.5 shrink-0 rounded-full", TONE[e.tone])} />
              <span className="min-w-0 text-xs leading-snug text-ink">
                {e.text} <span className="whitespace-nowrap text-[10px] text-muted">· {fmtRelative(e.at, now, lang)}</span>
              </span>
            </>
          );
          return (
            <li key={e.id}>
              {e.href ? (
                <a href={e.href} target="_blank" rel="noreferrer" className="flex gap-2 hover:underline">
                  {body}
                </a>
              ) : (
                <div className="flex gap-2">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {fresh.length > SHOWN && (
        <button type="button" onClick={() => setOpen(!open)} className="self-start text-[11px] text-ink-2 hover:text-ink hover:underline">
          {open ? labels.less : labels.more.replace("{n}", String(fresh.length - SHOWN))}
        </button>
      )}
    </div>
  );
}
