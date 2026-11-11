import { cookies } from "next/headers";
import { getDict, type Locale } from "@/lib/i18n";
import { getWorkerHealth } from "@/lib/queries";
import { fmtDateTime } from "@/lib/format";
import type { WorkerHealth } from "@/lib/worker-info";
import { DismissibleStrip } from "./DismissibleStrip";

/** Names shown before "+N": enough to recognise, short enough for one line on a laptop. */
const LIST_MAX = 4;
const COOKIE = "wh_worker_notice";

function list(items: string[]): string {
  return items.length > LIST_MAX ? `${items.slice(0, LIST_MAX).join(", ")} +${items.length - LIST_MAX}` : items.join(", ");
}

/**
 * What a closed notice is remembered by: the worker it is about, not the details.
 * Closing an "old code" notice keeps it closed while the same worker runs (more
 * saved files do not reopen it); a restart or the worker going down shows it again.
 */
function dismissKey(h: Exclude<WorkerHealth, { state: "ok" }>): string {
  return h.state === "down" ? `down:${h.lastSeen ?? 0}` : `outdated:${h.startedAt ?? "legacy"}`;
}

// A strip under the top bar when the worker is down or runs code older than
// this web build (lib/worker-info.ts). Panels only say "Stale" one by one; this
// names the cause once, on every page.
export async function WorkerNotice({ lang }: { lang: Locale }) {
  const h = await getWorkerHealth();
  if (h.state === "ok") return null;
  const key = dismissKey(h);
  if ((await cookies()).get(COOKIE)?.value === key) return null;
  const t = getDict(lang).worker;
  const parts =
    h.state === "down"
      ? [t.down, h.lastSeen ? t.lastSeen.replace("{time}", fmtDateTime(h.lastSeen, lang)) : null, t.fixDown]
      : [
          t.outdated,
          h.startedAt ? t.startedAt.replace("{time}", fmtDateTime(h.startedAt, lang)) : t.legacy,
          h.unknown.length ? t.unknown.replace("{list}", list(h.unknown)) : null,
          h.changed.length ? t.changed.replace("{list}", list(h.changed)) : null,
          t.fixOutdated,
        ];
  const tip = h.state === "outdated" ? [...h.unknown, ...h.changed].join("\n") : undefined;
  return (
    <DismissibleStrip key={key} name={COOKIE} value={key} label={t.dismiss}>
      <p className="flex min-w-0 items-start gap-2" title={tip || undefined}>
        <span aria-hidden className="mt-1 inline-block size-1.5 shrink-0 rounded-full bg-warning" />
        <span className="min-w-0">{parts.filter(Boolean).join(" ")}</span>
      </p>
    </DismissibleStrip>
  );
}
