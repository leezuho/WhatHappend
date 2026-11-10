"use client";

import { useSyncExternalStore } from "react";
import clsx from "clsx";

interface Exchange {
  code: string;
  city: string;
  tz: string;
  /** Trading sessions in local "HH:MM" pairs, Mon–Fri. Holidays are ignored. Empty = clock only. */
  sessions: [string, string][];
}

// Ordered west to east by UTC offset. The order holds year-round: DST shifts
// never make two of these zones swap places.
const EXCHANGES: Exchange[] = [
  // US West Coast has no major exchange; it is here for the time.
  { code: "LA", city: "Los Angeles", tz: "America/Los_Angeles", sessions: [] },
  { code: "NY", city: "New York · NYSE", tz: "America/New_York", sessions: [["09:30", "16:00"]] },
  { code: "LDN", city: "London · LSE", tz: "Europe/London", sessions: [["08:00", "16:30"]] },
  { code: "HCM", city: "Ho Chi Minh City · HOSE", tz: "Asia/Ho_Chi_Minh", sessions: [["09:00", "11:30"], ["13:00", "14:45"]] },
  { code: "SHA", city: "Shanghai · SSE", tz: "Asia/Shanghai", sessions: [["09:30", "11:30"], ["13:00", "15:00"]] },
  // Seoul and Tokyo share UTC+9 and neither observes DST; Seoul goes first as the western one.
  // KRX has no lunch break.
  { code: "SEL", city: "Seoul · KRX", tz: "Asia/Seoul", sessions: [["09:00", "15:30"]] },
  { code: "TYO", city: "Tokyo · TSE", tz: "Asia/Tokyo", sessions: [["09:00", "11:30"], ["12:30", "15:30"]] },
  // Melbourne shares Sydney's time zone, so the ASX session applies as-is.
  { code: "MEL", city: "Melbourne · ASX", tz: "Australia/Melbourne", sessions: [["10:00", "16:00"]] },
];

type State = "open" | "break" | "closed";

function localParts(now: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { weekday: get("weekday"), hhmm: `${get("hour")}:${get("minute")}` };
}

function stateOf(ex: Exchange, now: Date): { state: State | null; hhmm: string } {
  const { weekday, hhmm } = localParts(now, ex.tz);
  if (!ex.sessions.length) return { state: null, hhmm };
  if (weekday === "Sat" || weekday === "Sun") return { state: "closed", hhmm };
  if (ex.sessions.some(([a, b]) => hhmm >= a && hhmm < b)) return { state: "open", hhmm };
  const first = ex.sessions[0][0];
  const last = ex.sessions[ex.sessions.length - 1][1];
  return { state: hhmm > first && hhmm < last ? "break" : "closed", hhmm };
}

// A 30-second clock as an external store; the server snapshot is null so the
// prerendered shell shows placeholders instead of guessing the viewer's time.
const TICK = 30_000;
function subscribeClock(onTick: () => void) {
  const id = setInterval(onTick, TICK);
  return () => clearInterval(id);
}
const readClock = () => Math.floor(Date.now() / TICK) * TICK;

export function MarketClocks({ labels }: { labels: { open: string; closed: string; break: string } }) {
  const tick = useSyncExternalStore<number | null>(subscribeClock, readClock, () => null);
  const now = tick === null ? null : new Date(tick);

  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {EXCHANGES.map((ex) => {
        const s = now ? stateOf(ex, now) : null;
        const state = s?.state ? labels[s.state] : null;
        return (
          <li key={ex.code} className="flex items-center gap-1" title={state ? `${ex.city}: ${state}` : ex.city}>
            {ex.sessions.length > 0 && (
              <span
                aria-hidden
                className={clsx(
                  "inline-block size-2 rounded-full",
                  s?.state === "open" ? "bg-good" : s?.state === "break" ? "bg-warning" : "bg-axis",
                )}
              />
            )}
            <span className="font-medium text-ink-2">{ex.code}</span>
            <span className="tabular text-muted">{s?.hhmm ?? "--:--"}</span>
            <span className="sr-only">{state ?? ""}</span>
          </li>
        );
      })}
    </ul>
  );
}
