import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { imfId } from "@/config/macro";
import { OUTLOOK_AHEAD, OUTLOOK_BACK, VN_OUTLOOK } from "@/config/vietnam";
import { pick, type Locale } from "@/lib/i18n";
import { vnMonthly, type VnMonthly } from "@/lib/data/nso";
import { centralBand, dollarHistory, foreignFlows, goldPremiumHistory, type ForeignFlows, vnHazards, vnRatesHistory, type DollarRow, type GoldPremiumRow, type VnHazard, type VnRatesRow } from "@/lib/data/vietnam";

// Read side of the Vietnam page (app/[lang]/vietnam) beyond getVietnam() in
// lib/queries.ts. Same rules: synchronous SQLite reads behind connection().

export interface OutlookRow {
  ind: string;
  name: string;
  digits: number;
  signed: boolean;
  /** One per year of `years`; null where the IMF has no number. */
  values: (number | null)[];
  /** Emerging and developing economies (IMF group OEMDC), this year. */
  em: number | null;
}

/** Vietnam's IMF yearly numbers around this year (later years are forecasts), next to the emerging-market average. */
export async function getVietnamOutlook(lang: Locale): Promise<{ years: number[]; thisYear: number; rows: OutlookRow[] }> {
  await connection();
  const db = getDb();
  const thisYear = new Date().getUTCFullYear();
  const years = Array.from({ length: OUTLOOK_BACK + OUTLOOK_AHEAD + 1 }, (_, i) => thisYear - OUTLOOK_BACK + i);
  const at = db.prepare("SELECT value FROM observations WHERE series_id = ? AND ts = ?");
  const value = (id: string, year: number) => (at.get(id, Date.UTC(year, 0, 1)) as { value: number } | undefined)?.value ?? null;
  const rows = VN_OUTLOOK.map((o) => ({
    ind: o.ind,
    name: pick(o.name, lang),
    digits: o.digits,
    signed: o.signed === true,
    values: years.map((y) => value(imfId(o.ind, "VNM"), y)),
    em: value(imfId(o.ind, "OEMDC"), thisYear),
  }));
  return { years, thisYear, rows };
}

export type { VnHazard, VnRatesRow } from "@/lib/data/vietnam";

/** Monthly CPI inflation next to the refinancing rate, for the chart under the economy tiles. */
export async function getVnRates(): Promise<VnRatesRow[]> {
  await connection();
  return vnRatesHistory(getDb());
}

/** Storms, quakes, floods and fires of the last two weeks near Vietnam, nearest first. */
export async function getVnHazards(lang: Locale): Promise<VnHazard[]> {
  await connection();
  return vnHazards(getDb(), lang);
}

export async function getGoldPremium(): Promise<GoldPremiumRow[]> {
  await connection();
  return goldPremiumHistory(getDb());
}

export async function getDollarHistory(): Promise<DollarRow[]> {
  await connection();
  return dollarHistory(getDb());
}

export async function getForeignFlows(): Promise<ForeignFlows | null> {
  await connection();
  return foreignFlows(getDb());
}

export async function getCentralBand(): Promise<ReturnType<typeof centralBand>> {
  await connection();
  return centralBand(getDb());
}

/** Vietnam's monthly figures read from the statistics office's report (lib/sources/nso.ts). */
export async function getVnMonthly(): Promise<VnMonthly> {
  await connection();
  return vnMonthly(getDb());
}
