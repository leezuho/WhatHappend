import { getDict, type Locale } from "@/lib/i18n";
import { getWorkerHealth } from "@/lib/queries";
import { fmtDateTime } from "@/lib/format";

/** Names shown before "+N": enough to recognise, short enough for one line on a laptop. */
const LIST_MAX = 4;

function list(items: string[]): string {
  return items.length > LIST_MAX ? `${items.slice(0, LIST_MAX).join(", ")} +${items.length - LIST_MAX}` : items.join(", ");
}

// A strip under the top bar when the worker is down or runs code older than
// this web build (lib/worker-info.ts). Panels only say "Stale" one by one; this
// names the cause once, on every page.
export async function WorkerNotice({ lang }: { lang: Locale }) {
  const h = await getWorkerHealth();
  if (h.state === "ok") return null;
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
    <div role="status" className="border-t border-line bg-warning/10">
      <p className="mx-auto flex max-w-[1600px] items-start gap-2 px-4 py-1.5 text-xs text-ink-2" title={tip || undefined}>
        <span aria-hidden className="mt-1 inline-block size-1.5 shrink-0 rounded-full bg-warning" />
        <span className="min-w-0">{parts.filter(Boolean).join(" ")}</span>
      </p>
    </div>
  );
}
