import { SOURCE_META } from "@/config/sources";
import { US_RELEASES } from "@/config/calendar";
import { fetchText } from "./http";
import { hashId, replaceItems } from "./store";
import type { Source } from "./types";

// Scheduled dates of the main US releases (CPI, jobs, GDP, PCE, retail sales,
// PPI, JOLTS) from FRED's release calendar: a keyless HTML page per release id
// and date range, about two months ahead. ForexFactory covers only the current
// week; this fills the weeks after it. Times on the page are US Central.

const DAY = 24 * 3600_000;
const AHEAD_DAYS = 75;

/** Offset of America/Chicago from UTC at `utcMidday` of a date, in hours (−6 in winter, −5 in summer). */
function chicagoOffset(utcMidday: number): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", timeZoneName: "shortOffset" }).formatToParts(utcMidday).find((p) => p.type === "timeZoneName")?.value ?? "GMT-6";
  const m = /GMT([+-]\d+)/.exec(name);
  return m ? Number(m[1]) : -6;
}

/**
 * Release times on a FRED calendar page: a bold "Tuesday November 10, 2026" row, then "7:30 am" rows
 * linking to the release. Returns UTC timestamps.
 */
export function parseFredCalendar(html: string): number[] {
  const out: number[] = [];
  let date: number | null = null;
  for (const row of html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
    const text = row[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const d = /^(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) (\w+ \d{1,2}, \d{4})/.exec(text);
    if (d) {
      const ts = Date.parse(`${d[1]} 00:00 UTC`);
      date = Number.isFinite(ts) ? ts : null;
      continue;
    }
    const t = /^(\d{1,2}):(\d{2}) (am|pm)\b/.exec(text);
    if (t && date !== null && /\/release\?rid=\d+/.test(row[0])) {
      const h = (Number(t[1]) % 12) + (t[3] === "pm" ? 12 : 0);
      out.push(date + (h - chicagoOffset(date + 12 * 3600_000)) * 3600_000 + Number(t[2]) * 60_000);
    }
  }
  return out;
}

export const releases: Source = {
  id: "releases",
  ...SOURCE_META.releases,
  async run({ db, log }) {
    const now = Date.now();
    const from = new Date(now - DAY).toISOString().slice(0, 10);
    const to = new Date(now + AHEAD_DAYS * DAY).toISOString().slice(0, 10);
    const rows: { id: string; title: string; ts: number; data: { rid: number } }[] = [];
    const failed: string[] = [];
    for (const r of US_RELEASES) {
      try {
        const html = await fetchText(`https://fred.stlouisfed.org/releases/calendar?rid=${r.rid}&vs=${from}&ve=${to}`, { timeoutMs: 30_000 });
        for (const ts of parseFredCalendar(html)) rows.push({ id: hashId(`${r.rid}:${ts}`), title: r.name.en, ts, data: { rid: r.rid } });
      } catch (err) {
        failed.push(`${r.rid}: ${err instanceof Error ? err.message : err}`);
      }
      await new Promise((res) => setTimeout(res, 300));
    }
    if (failed.length === US_RELEASES.length) throw new Error(failed.join(" | "));
    if (failed.length) log(failed.join(" | "));
    if (!rows.length) throw new Error("no scheduled releases found; FRED's calendar page may have changed");
    rows.sort((a, b) => a.ts - b.ts);
    return replaceItems(db, "us_releases", rows);
  },
};
