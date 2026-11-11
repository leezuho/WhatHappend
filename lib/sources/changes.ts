import { SOURCE_META } from "@/config/sources";
import { CHANGES_STATE_KEY, diffState, logChanges, observe, parseState, REGIME_SCORE_ID, stateOf } from "@/lib/data/changes";
import { dayTs, upsertSeries } from "./store";
import type { Source } from "./types";

// The change log for the overview's "What's new since last time" strip
// (lib/data/changes.ts). Reads only the database: every run compares what it
// sees with the state saved by the previous run and logs the difference. The
// first run only saves the state, so a fresh database does not log everything
// it already holds as "new".

const TZ = "Asia/Ho_Chi_Minh";

export const changes: Source = {
  id: "changes",
  ...SOURCE_META.changes,
  async run({ db, log }) {
    const now = Date.now();
    const cur = observe(db, now);
    // The regime's score as seen today (Vietnam date), one point a day: its history as it was known at the time.
    if (cur.regime.score !== null) {
      const day = dayTs(new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now));
      upsertSeries(db, REGIME_SCORE_ID, "changes", [{ ts: day, value: Math.round(cur.regime.score * 1000) / 1000 }]);
    }
    const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(CHANGES_STATE_KEY) as { value: string | null } | undefined;
    const prev = parseState(row?.value);
    const found = prev ? diffState(prev, cur) : [];
    const written = prev ? logChanges(db, found, now) : 0;
    db.prepare("INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(
      CHANGES_STATE_KEY,
      JSON.stringify(stateOf(cur)),
      now,
    );
    log(prev ? `${written} new (${found.length - written} repeats skipped)` : "first run: state saved, nothing logged");
    return written;
  },
};
