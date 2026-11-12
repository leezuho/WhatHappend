import { SOURCE_META } from "@/config/sources";
import { VN_GB10Y, VN_INTERBANK } from "@/config/vietnam";
import { fetchText, htmlText, viNumber } from "./http";
import { upsertSeries, type Point } from "./store";
import type { Source } from "./types";

// Vietnam's average interbank VND rates (overnight, 1 week, 2 weeks, 1 month)
// and the 10-year government bond yield.
// The State Bank publishes them daily, but sbv.gov.vn rejects Node; its
// newspaper, Thời báo Ngân hàng, repeats them in a daily recap ("Điểm lại
// thông tin kinh tế ngày D/M") in one fixed sentence, which is parsed here.
// The recap appears the next morning and not every day. A recap whose
// sentence no longer matches fails the run rather than storing nothing quietly.

const TAG = "https://thoibaonganhang.vn/tag/diem-lai-thong-tin-kinh-te-5241.tag";
const DONE_KEY = "ibrate:done";
const DAY = 24 * 3600_000;

// "… liên ngân hàng ngày 09/11, lãi suất …" until early November 2026, then "… liên ngân hàng: Ngày 11/11, lãi suất …".
const RATE = /Thị trường tiền tệ liên ngân hàng:?\s*[Nn]gày (\d{1,2})\/(\d{1,2}).{0,400}?bình quân liên ngân hàng VND.{0,300}?qua đêm ([\d,]+)\s*%;?\s*1 tuần ([\d,]+)\s*%;?\s*2 tuần ([\d,]+)\s*%;?\s*(?:và\s*)?1 tháng ([\d,]+)\s*%/;

/** The government bond yields sentence of the same recap: "Lợi suất TPCP trên thị trường thứ cấp … chốt phiên ở mức: 3 năm 3,72%; … 10 năm 4,47%; …". */
const BOND = /Lợi suất (?:TPCP|trái phiếu chính phủ) trên thị trường thứ cấp.{0,300}?chốt phiên[^:]{0,20}:.{0,120}?10 năm ([\d,]+)\s*%/;

export interface InterbankDay {
  ts: number;
  on: number;
  w1: number;
  w2: number;
  m1: number;
  /** 10-year government bond yield on the secondary market, same session; null when the recap leaves it out. */
  y10: number | null;
}

/**
 * The VND rates in a recap's text. The sentence gives day and month only: the year is the one that
 * puts the date in the past, within the year before `now`. Null when the sentence is not there.
 */
export function parseRecap(text: string, now = Date.now()): InterbankDay | null {
  const m = RATE.exec(text);
  if (!m) return null;
  const [day, month] = [Number(m[1]), Number(m[2])];
  const y = new Date(now).getUTCFullYear();
  let ts = Date.UTC(y, month - 1, day);
  if (ts > now + DAY) ts = Date.UTC(y - 1, month - 1, day);
  const [on, w1, w2, m1] = m.slice(3, 7).map(viNumber);
  if ([on, w1, w2, m1].some((v) => !Number.isFinite(v) || v < 0 || v > 30)) throw new Error(`implausible interbank rates ${m.slice(3, 7).join(" ")}`);
  const b = BOND.exec(text);
  const y10 = b ? viNumber(b[1]) : null;
  if (y10 !== null && !(y10 > 0 && y10 < 20)) throw new Error(`implausible 10-year yield ${b![1]}`);
  return { ts, on, w1, w2, m1, y10 };
}

/** Recap article links on the tag page, newest first. */
export function recapLinks(html: string): string[] {
  return [...new Set([...html.matchAll(/href="(https:\/\/thoibaonganhang\.vn\/diem-lai-thong-tin-kinh-te-ngay-[^"]+\.html)"/g)].map((m) => m[1]))];
}

export const ibrate: Source = {
  id: "ibrate",
  ...SOURCE_META.ibrate,
  async run({ db, log }) {
    const links = recapLinks(await fetchText(TAG, { timeoutMs: 20_000 }));
    if (!links.length) throw new Error("no recap links on the tag page");
    const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(DONE_KEY) as { value: string } | undefined;
    const done = new Set<string>(row ? JSON.parse(row.value) : []);
    const todo = links.filter((l) => !done.has(l));
    const days: InterbankDay[] = [];
    let unparsed = 0;
    for (const url of todo) {
      const text = htmlText(await fetchText(url, { timeoutMs: 15_000 }));
      const d = parseRecap(text);
      // Weekly recaps share the tag but not the sentence: skipped, and not counted as a failure unless every one fails.
      if (d) days.push(d);
      else unparsed++;
      done.add(url);
    }
    if (todo.length && !days.length) throw new Error(`none of ${todo.length} new recaps has the interbank sentence`);
    if (unparsed) log(`${unparsed} recap(s) without the interbank sentence`);
    db.prepare("INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(
      DONE_KEY,
      JSON.stringify([...done].slice(-60)),
      Date.now(),
    );
    const pts = (f: (d: InterbankDay) => number): Point[] => days.map((d) => ({ ts: d.ts, value: f(d) }));
    return (
      upsertSeries(db, VN_GB10Y, "ibrate", days.flatMap((d) => (d.y10 === null ? [] : [{ ts: d.ts, value: d.y10 }]))) +
      upsertSeries(db, VN_INTERBANK.on, "ibrate", pts((d) => d.on)) +
      upsertSeries(db, VN_INTERBANK.w1, "ibrate", pts((d) => d.w1)) +
      upsertSeries(db, VN_INTERBANK.w2, "ibrate", pts((d) => d.w2)) +
      upsertSeries(db, VN_INTERBANK.m1, "ibrate", pts((d) => d.m1))
    );
  },
};
