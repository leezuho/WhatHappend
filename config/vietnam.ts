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

/**
 * Weekdays HOSE and HNX do not trade, as YYYY-MM-DD. The government sets the holidays
 * each year (bridge and make-up days included), so they are declared rather than computed.
 * Add the next year once HOSE publishes it, usually in December; a year missing here
 * means expiries are not moved for its holidays.
 * - 2026: HOSE notice 2294/TB-SGDHCM (9 Dec 2025) and its Independence Day notice.
 * - 2027: Ministry of Home Affairs notice 11483/TB-BNV (9 Oct 2026) for Tết and 2 September,
 *   the Labour Code for the rest (1 May falls on a Saturday, so Monday 3 May is off).
 *   HOSE's own 2027 notice was not out on 2026-11-10.
 */
export const VN_MARKET_HOLIDAYS: string[] = [
  // 2026
  "2026-01-01",
  "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20",
  "2026-04-27",
  "2026-04-30", "2026-05-01",
  "2026-08-31", "2026-09-01", "2026-09-02",
  // 2027
  "2027-01-01",
  "2027-02-04", "2027-02-05", "2027-02-08", "2027-02-09", "2027-02-10",
  "2027-04-16",
  "2027-04-30", "2027-05-03",
  "2027-09-02", "2027-09-03",
];
/** The Statistics Office publishes the month's economic data on the 6th of the next month (Decree 62/2024). */
export const GSO_RELEASE_DAY = 6;

// Indices besides the VN-Index (lib/sources/vnstocks.ts): series id, SSI iBoard
// index id (live level), VNDirect code (daily history).

export interface VnIndexDef {
  id: string;
  ssi: string;
  vnd: string;
}

export const VN_INDICES: VnIndexDef[] = [
  { id: "vn:VN30", ssi: "VN30", vnd: "VN30" },
  { id: "vn:HNX", ssi: "HNXIndex", vnd: "HNX" },
  { id: "vn:UPCOM", ssi: "HNXUpcomIndex", vnd: "UPCOM" },
];

/** Foreign investors' daily trading on HOSE (lib/sources/vnflows.ts, VNDirect), VND. */
export const VN_FOREIGN = { net: "vnd:FOREIGN_NET:VNINDEX", buy: "vnd:FOREIGN_BUY:VNINDEX", sell: "vnd:FOREIGN_SELL:VNINDEX" } as const;

/** The State Bank's daily central USD/VND rate (lib/sources/sbvrate.ts); banks trade within ±VN_BAND of it. */
export const VN_CENTRAL_RATE = "sbv:CENTRAL";
export const VN_BAND = 0.05;

/** Average interbank VND rates by tenor (lib/sources/ibrate.ts), % a year. */
export const VN_INTERBANK = { on: "sbv:IB_ON", w1: "sbv:IB_1W", w2: "sbv:IB_2W", m1: "sbv:IB_1M" } as const;

/** Vietnam's 10-year government bond yield on the secondary market, from the same recap (hnx.vn's own curve is out of Node's reach). */
export const VN_GB10Y = "vn:GB10Y";
