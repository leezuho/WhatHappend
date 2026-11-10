import type { Bi } from "@/lib/i18n";

// The Vietnam page's IMF table (app/[lang]/vietnam): World Economic Outlook
// indicators already stored by lib/sources/imf.ts as imf:<ind>:VNM, shown a few
// years back and ahead so the forecast reads next to the record.

export interface OutlookDef {
  /** IMF DataMapper indicator (IMF_INDICATORS in config/countries.ts). */
  ind: string;
  name: Bi;
  digits: number;
  /** Show a + sign on positive values (growth and balances). */
  signed?: true;
}

export const VN_OUTLOOK: OutlookDef[] = [
  { ind: "NGDP_RPCH", name: { en: "GDP growth", vi: "Tăng trưởng GDP" }, digits: 1, signed: true },
  { ind: "PCPIPCH", name: { en: "Inflation (average)", vi: "Lạm phát (bình quân)" }, digits: 1 },
  { ind: "LUR", name: { en: "Unemployment", vi: "Thất nghiệp" }, digits: 1 },
  { ind: "GGXWDG_NGDP", name: { en: "Government debt, % GDP", vi: "Nợ công, % GDP" }, digits: 0 },
  { ind: "GGXCNL_NGDP", name: { en: "Budget balance, % GDP", vi: "Cân đối ngân sách, % GDP" }, digits: 1, signed: true },
  { ind: "BCA_NGDPD", name: { en: "Current account, % GDP", vi: "Vãng lai, % GDP" }, digits: 1, signed: true },
];

/** Years shown: this many before the current one, and after it (IMF forecasts). */
export const OUTLOOK_BACK = 5;
export const OUTLOOK_AHEAD = 2;

// Hazards the Vietnam page lists (from the map's events): quakes, floods, fires and
// the like inside the box around Vietnam; storms from further out, since a typhoon
// in the Philippine Sea can reach the coast within days.

export interface Box {
  lat: [number, number];
  lng: [number, number];
}

export const VN_HAZARD_BOX: Box = { lat: [5, 25], lng: [100, 118] };
export const VN_STORM_BOX: Box = { lat: [0, 30], lng: [100, 135] };

/** Distances are given to the nearest of these. */
export const VN_CITIES: { name: Bi; lat: number; lng: number }[] = [
  { name: { en: "Hanoi", vi: "Hà Nội" }, lat: 21.03, lng: 105.85 },
  { name: { en: "Da Nang", vi: "Đà Nẵng" }, lat: 16.05, lng: 108.2 },
  { name: { en: "Ho Chi Minh City", vi: "TP.HCM" }, lat: 10.78, lng: 106.7 },
];

// Vietnam's market calendar, computed rather than fetched.

/** VN30 index futures expire on the third Thursday of each month (HNX; moved to the trading day before when that is a holiday). */
export const VN30F_WEEKDAY = 4;
/** The Statistics Office publishes the month's economic data on the 6th of the next month (Decree 62/2024). */
export const GSO_RELEASE_DAY = 6;
