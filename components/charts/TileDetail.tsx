"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { LineChart } from "./LineChart";
import { trendColor } from "./Sparkline";

interface Props {
  seriesKey: string;
  name: string;
  explain: string;
  /** AI note on why the reading stands out right now. */
  note?: string;
  unit: string;
  digits: number;
  watched: boolean;
  /** Market price: the history line takes the trend color of the range shown. */
  price?: boolean;
  locale: "vi" | "en";
  labels: { pin: string; unpin: string; open: string; loading: string; close: string; table: string; chart: string; note: string; ranges: Record<string, string> };
  children: ReactNode;
}

const RANGES = ["90", "365", "730", "1825"];

/** Makes a KPI tile clickable: opens a dialog with the series history and a pin toggle. */
export function TileDetail({ seriesKey, name, explain, note, unit, digits, watched, price, locale, labels, children }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState("730");
  const [points, setPoints] = useState<{ ts: number; value: number }[] | null>(null);
  const [pinned, setPinned] = useState(watched);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/series/${encodeURIComponent(seriesKey)}?days=${days}`)
      .then((r) => r.json())
      .then((j: { points?: { ts: number; value: number }[] }) => !cancelled && setPoints(j.points ?? []))
      .catch(() => !cancelled && setPoints([]));
    return () => {
      cancelled = true;
    };
  }, [open, days, seriesKey]);

  const scale = unit === "K" ? 1e-3 : unit === "$T" ? 1e-6 : 1;
  const color = (price && points && trendColor(points.map((p) => p.value))) || "var(--s1)";
  const suffix = unit === "K" ? "K" : unit === "$T" ? "T" : unit === "$B" ? (locale === "vi" ? " tỷ $" : "B") : unit === "%" ? "%" : unit === "bp" ? " bp" : "";

  return (
    <>
      <button
        type="button"
        className="block w-full cursor-pointer rounded-lg text-left transition-shadow hover:shadow-lift focus-visible:outline-2 focus-visible:outline-s1"
        aria-label={`${name}: ${labels.open}`}
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        {children}
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        className="m-auto w-[min(720px,calc(100vw-32px))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-lift backdrop:bg-black/40 backdrop:backdrop-blur-[2px]"
      >
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold">{name}</h2>
              <p className="text-xs text-ink-2">{explain}</p>
            </div>
            <button type="button" onClick={() => dialog.current?.close()} className="rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-ink">
              {labels.close} ✕
            </button>
          </div>
          {note && (
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <h3 className="mb-0.5 text-[11px] font-semibold text-ink-2">{labels.note}</h3>
              <p className="text-sm leading-snug text-ink">{note}</p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1" role="group">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={days === r}
                  onClick={() => setDays(r)}
                  className={clsx("rounded-md border px-2 py-0.5 text-xs", days === r ? "border-accent bg-accent text-on-accent" : "border-line text-ink-2 hover:bg-surface-2")}
                >
                  {labels.ranges[r]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={async () => {
                const on = !pinned;
                setPinned(on);
                await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: seriesKey, on }) });
                router.refresh();
              }}
              className="ml-auto rounded-md border border-line px-2 py-0.5 text-xs text-ink-2 hover:bg-surface-2"
            >
              {pinned ? `★ ${labels.unpin}` : `☆ ${labels.pin}`}
            </button>
          </div>
          {open && points === null ? (
            <p className="py-16 text-center text-xs text-muted">{labels.loading}</p>
          ) : points && points.length > 1 ? (
            <div>
              <LineChart
                data={points.map((p) => ({ ts: p.ts, v: p.value * scale }))}
                xKey="ts"
                xFormat={Number(days) > 400 ? "month" : "day"}
                series={[{ key: "v", label: name, color }]}
                area
                yDigits={Math.min(digits, 2)}
                ySuffix={suffix}
                height={280}
                locale={locale}
                tableLabels={{ table: labels.table, chart: labels.chart }}
              />
            </div>
          ) : (
            <p className="py-16 text-center text-xs text-muted">—</p>
          )}
        </div>
      </dialog>
    </>
  );
}
