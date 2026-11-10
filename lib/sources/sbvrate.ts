import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { VN_CENTRAL_RATE } from "@/config/vietnam";
import { fetchJson } from "./http";
import { upsertSeries } from "./store";
import type { Source } from "./types";

// The State Bank's daily central USD/VND rate. sbv.gov.vn rejects Node behind
// an F5 firewall, so this reads the copy Techcombank publishes on its rates
// page (AEM JSON, one file per date). Banks may trade within ±5% of it; the
// band is computed from the central rate, since the floor and ceiling in old
// files are sometimes wrong. History is filled one day per request, a batch per run.

const Resp = z.object({
  otherRate: z.object({
    data: z.array(z.object({ central: z.union([z.string(), z.number()]) })),
  }),
});

const DAY = 24 * 3600_000;
const BACKFILL_DAYS = 400;
const PER_RUN = 120;
const CURSOR_KEY = "sbvrate:backfilled-to";

const url = (date?: string) =>
  `https://techcombank.com/content/techcombank/web/vn/vi/cong-cu-tien-ich/ty-gia/_jcr_content.exchange-rates${date ? `.${date}` : ""}.integration.json`;

/** Hanoi date of `ts` as YYYY-MM-DD. */
const hanoiDate = (ts: number) => new Date(ts + 7 * 3600_000).toISOString().slice(0, 10);

/** The central rate in a response; null on days without one (weekends, holidays). A value outside 15k–40k fails the run. */
export function centralOf(r: z.infer<typeof Resp>): number | null {
  const raw = r.otherRate.data[0]?.central;
  if (raw === undefined) return null;
  const v = Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(v) || v < 15_000 || v > 40_000) throw new Error(`implausible central rate ${raw}`);
  return v;
}

export const sbvrate: Source = {
  id: "sbvrate",
  ...SOURCE_META.sbvrate,
  async run({ db, log }) {
    const now = Date.now();
    const point = (date: string, v: number) => ({ ts: Date.parse(`${date}T00:00:00Z`), value: v });
    // Today: a failure here fails the run (the panel then shows the error).
    const today = hanoiDate(now);
    const cur = centralOf(await fetchJson(url(), Resp));
    let written = cur === null ? 0 : upsertSeries(db, VN_CENTRAL_RATE, "sbvrate", [point(today, cur)]);

    // History, walking back from where the last run stopped.
    const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(CURSOR_KEY) as { value: string } | undefined;
    let day = row ? Date.parse(`${row.value}T00:00:00Z`) : Date.parse(`${today}T00:00:00Z`);
    const stop = Date.parse(`${today}T00:00:00Z`) - BACKFILL_DAYS * DAY;
    const pts: { ts: number; value: number }[] = [];
    // Yesterday and the day before always, in case today's file was read before the bank updated it.
    for (const back of [1, 2]) {
      const date = hanoiDate(now - back * DAY);
      const v = centralOf(await fetchJson(url(date), Resp));
      if (v !== null) pts.push(point(date, v));
    }
    let n = 0;
    try {
      while (day > stop && n < PER_RUN) {
        day -= DAY;
        n++;
        const date = new Date(day).toISOString().slice(0, 10);
        const v = centralOf(await fetchJson(url(date), Resp));
        if (v !== null) pts.push(point(date, v));
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch (err) {
      // Keep what was read; the next run resumes from the last day done.
      log(`backfill stopped at ${new Date(day).toISOString().slice(0, 10)}: ${err instanceof Error ? err.message : err}`);
      day += DAY;
    }
    db.prepare("INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(
      CURSOR_KEY,
      new Date(day).toISOString().slice(0, 10),
      now,
    );
    written += upsertSeries(db, VN_CENTRAL_RATE, "sbvrate", pts);
    return written;
  },
};
