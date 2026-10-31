import clsx from "clsx";
import type { SeriesDef } from "@/config/series";
import { pick, type Locale } from "@/lib/i18n";
import { fmtDelta, fmtValue } from "@/lib/format";
import type { TileData } from "@/lib/data/series";
import { alertOf } from "@/lib/signals/notable";
import { Sparkline } from "./Sparkline";

const ALERT_TEXT = {
  warn: { en: "Watch", vi: "Lưu ý" },
  crit: { en: "Danger", vi: "Nguy hiểm" },
};

export function KpiTile({ def, data, locale }: { def: SeriesDef; data: TileData | null; locale: Locale }) {
  const name = pick(def.name, locale);
  if (!data) {
    return (
      <div className="flex min-h-[104px] flex-col justify-between rounded-lg bg-surface-2/60 p-3">
        <span className="text-xs text-ink-2">{name}</span>
        <span className="text-lg font-semibold text-muted">—</span>
      </div>
    );
  }
  const alert = alertOf(def, data.value);
  const delta = fmtDelta(def, data, locale);
  const dir = (def.delta === "abs" ? data.change : data.changePct) ?? 0;
  const good = def.polarity === "neutral" ? null : (dir > 0) === (def.polarity === "up-good");
  return (
    <div
      className={clsx(
        "@container relative flex min-h-[104px] flex-col justify-between gap-1 rounded-lg p-3",
        alert ? "bg-surface-2 ring-1 ring-inset" : "bg-surface-2/60",
        alert === "crit" ? "ring-critical" : alert === "warn" ? "ring-warning" : "",
      )}
      title={pick(def.explain, locale)}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-ink-2">{name}</span>
        {alert && (
          <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-ink-2">
            <span aria-hidden className={clsx("inline-block size-2 rounded-full", alert === "crit" ? "bg-critical" : "bg-warning")} />
            {pick(ALERT_TEXT[alert], locale)}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 @[200px]:flex-row @[200px]:items-end @[200px]:justify-between @[200px]:gap-2">
        <div className="min-w-0">
          <div className="text-xl font-semibold whitespace-nowrap text-ink">{fmtValue(def, data.value, locale)}</div>
          {delta && (
            <div
              className={clsx(
                "tabular text-xs font-medium",
                dir === 0 || good === null ? "text-ink-2" : good ? "text-up" : "text-down",
              )}
            >
              <span className="whitespace-nowrap">
                {dir > 0 ? "▲" : dir < 0 ? "▼" : ""} {delta}
              </span>
            </div>
          )}
        </div>
        <Sparkline points={data.spark} width={96} height={30} label={`${name} 30d`} />
      </div>
    </div>
  );
}
