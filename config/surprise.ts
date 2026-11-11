import type { Bi } from "@/lib/i18n";

// The US releases behind the home-made economic surprise indices (TODO P2,
// lib/data/surprise.ts): each release's first print against the forecasters'
// consensus, as listed on Nasdaq's economic calendar (lib/sources/surprise.ts).
// Two indices in the manner of Citi's: growth (activity, jobs, surveys,
// housing) and inflation (prices, wages, expectations).

export type SurpriseGroup = "growth" | "inflation";

/**
 * How the figure is printed, which picks the row when one name is listed twice on a day
 * (Housing Starts as "1.221M" and as "-5.2%"): a percent, a count with a K/M/B suffix, or a plain index.
 */
export type SurpriseKind = "pct" | "count" | "index";

export interface SurpriseDef {
  /** Series id part: `surprise:<key>:actual` / `:cons`. */
  key: string;
  /** Nasdaq's event name for country "United States", matched case-insensitively ("PCE price index" comes in two casings). */
  name: string;
  label: Bi;
  group: SurpriseGroup;
  kind: SurpriseKind;
  /** Display unit of a count: "189K", "1.36M". */
  unit?: "K" | "M";
  /** Decimals when printed. */
  digits: number;
  /** +1: above consensus means a stronger economy (growth) or hotter prices (inflation); −1 for unemployment and jobless claims. */
  sign: 1 | -1;
  /**
   * Weight of one release. A release that comes weekly counts a quarter, one that comes twice a month
   * (a flash and a final, a preliminary and a revised) half, so no indicator dominates by frequency;
   * regional surveys count half of the national ones.
   */
  weight: number;
  /**
   * Listed twice the same day with the same kind and no tag: the change on the month and on the year
   * (CPI "0.3%" and "2.6%"). The month's row is the one with the smaller consensus in absolute value.
   */
  pair?: true;
}

const g = (d: Omit<SurpriseDef, "group">): SurpriseDef => ({ ...d, group: "growth" });
const i = (d: Omit<SurpriseDef, "group">): SurpriseDef => ({ ...d, group: "inflation" });

export const SURPRISE_DEFS: SurpriseDef[] = [
  // Jobs
  g({ key: "nfp", name: "Nonfarm Payrolls", label: { en: "Nonfarm payrolls", vi: "Việc làm phi nông nghiệp" }, kind: "count", unit: "K", digits: 0, sign: 1, weight: 1 }),
  g({ key: "unrate", name: "Unemployment Rate", label: { en: "Unemployment rate", vi: "Tỷ lệ thất nghiệp" }, kind: "pct", digits: 1, sign: -1, weight: 1 }),
  g({ key: "claims", name: "Initial Jobless Claims", label: { en: "Initial jobless claims", vi: "Đơn xin trợ cấp thất nghiệp lần đầu" }, kind: "count", unit: "K", digits: 0, sign: -1, weight: 0.25 }),
  g({ key: "contclaims", name: "Continuing Jobless Claims", label: { en: "Continuing jobless claims", vi: "Đơn trợ cấp thất nghiệp tiếp tục" }, kind: "count", unit: "K", digits: 0, sign: -1, weight: 0.25 }),
  g({ key: "adp", name: "ADP Nonfarm Employment Change", label: { en: "ADP private payrolls", vi: "Việc làm khu vực tư nhân (ADP)" }, kind: "count", unit: "K", digits: 0, sign: 1, weight: 1 }),
  g({ key: "jolts", name: "JOLTS Job Openings", label: { en: "Job openings (JOLTS)", vi: "Việc làm trống (JOLTS)" }, kind: "count", unit: "M", digits: 2, sign: 1, weight: 1 }),
  // Spending, output
  g({ key: "retail", name: "Retail Sales", label: { en: "Retail sales m/m", vi: "Bán lẻ so với tháng trước" }, kind: "pct", digits: 1, sign: 1, weight: 1 }),
  g({ key: "retailctrl", name: "Retail Control", label: { en: "Retail sales, control group", vi: "Bán lẻ nhóm lõi" }, kind: "pct", digits: 1, sign: 1, weight: 1 }),
  g({ key: "spending", name: "Personal Spending", label: { en: "Personal spending m/m", vi: "Chi tiêu cá nhân so với tháng trước" }, kind: "pct", digits: 1, sign: 1, weight: 1 }),
  g({ key: "indprod", name: "Industrial Production", label: { en: "Industrial production m/m", vi: "Sản xuất công nghiệp so với tháng trước" }, kind: "pct", digits: 1, sign: 1, weight: 1 }),
  g({ key: "durables", name: "Durable Goods Orders", label: { en: "Durable goods orders m/m", vi: "Đơn hàng lâu bền so với tháng trước" }, kind: "pct", digits: 1, sign: 1, weight: 0.5 }),
  g({ key: "coredurables", name: "Core Durable Goods Orders", label: { en: "Core durable goods orders m/m", vi: "Đơn hàng lâu bền lõi so với tháng trước" }, kind: "pct", digits: 1, sign: 1, weight: 1 }),
  g({ key: "gdp", name: "GDP", label: { en: "GDP q/q, annualized", vi: "GDP so với quý trước, quy năm" }, kind: "pct", digits: 1, sign: 1, weight: 1 }),
  // Surveys
  g({ key: "ismmfg", name: "ISM Manufacturing PMI", label: { en: "ISM manufacturing", vi: "ISM sản xuất" }, kind: "index", digits: 1, sign: 1, weight: 1 }),
  g({ key: "ismsvc", name: "ISM Non-Manufacturing PMI", label: { en: "ISM services", vi: "ISM dịch vụ" }, kind: "index", digits: 1, sign: 1, weight: 1 }),
  g({ key: "spmfg", name: "S&P Global Manufacturing PMI", label: { en: "S&P Global manufacturing PMI", vi: "PMI sản xuất S&P Global" }, kind: "index", digits: 1, sign: 1, weight: 0.5 }),
  g({ key: "spsvc", name: "S&P Global Services PMI", label: { en: "S&P Global services PMI", vi: "PMI dịch vụ S&P Global" }, kind: "index", digits: 1, sign: 1, weight: 0.5 }),
  g({ key: "empire", name: "NY Empire State Manufacturing Index", label: { en: "Empire State manufacturing", vi: "Sản xuất bang New York (Empire State)" }, kind: "index", digits: 1, sign: 1, weight: 0.5 }),
  g({ key: "philly", name: "Philadelphia Fed Manufacturing Index", label: { en: "Philadelphia Fed manufacturing", vi: "Sản xuất vùng Philadelphia" }, kind: "index", digits: 1, sign: 1, weight: 0.5 }),
  g({ key: "chicago", name: "Chicago PMI", label: { en: "Chicago PMI", vi: "PMI Chicago" }, kind: "index", digits: 1, sign: 1, weight: 0.5 }),
  g({ key: "umich", name: "Michigan Consumer Sentiment", label: { en: "Michigan consumer sentiment", vi: "Niềm tin tiêu dùng Michigan" }, kind: "index", digits: 1, sign: 1, weight: 0.5 }),
  g({ key: "cbconf", name: "CB Consumer Confidence", label: { en: "Conference Board consumer confidence", vi: "Niềm tin tiêu dùng Conference Board" }, kind: "index", digits: 1, sign: 1, weight: 1 }),
  // Housing
  g({ key: "starts", name: "Housing Starts", label: { en: "Housing starts", vi: "Nhà khởi công" }, kind: "count", unit: "M", digits: 2, sign: 1, weight: 1 }),
  g({ key: "permits", name: "Building Permits", label: { en: "Building permits", vi: "Giấy phép xây dựng" }, kind: "count", unit: "M", digits: 2, sign: 1, weight: 0.5 }),
  g({ key: "newhomes", name: "New Home Sales", label: { en: "New home sales", vi: "Doanh số nhà mới" }, kind: "count", unit: "K", digits: 0, sign: 1, weight: 1 }),
  g({ key: "existing", name: "Existing Home Sales", label: { en: "Existing home sales", vi: "Doanh số nhà cũ" }, kind: "count", unit: "M", digits: 2, sign: 1, weight: 1 }),
  g({ key: "pending", name: "Pending Home Sales", label: { en: "Pending home sales m/m", vi: "Hợp đồng mua nhà chờ hoàn tất" }, kind: "pct", digits: 1, sign: 1, weight: 0.5 }),

  // Prices
  i({ key: "cpi", name: "CPI", label: { en: "CPI m/m", vi: "CPI so với tháng trước" }, kind: "pct", digits: 1, sign: 1, weight: 1, pair: true }),
  i({ key: "corecpi", name: "Core CPI", label: { en: "Core CPI m/m", vi: "CPI lõi so với tháng trước" }, kind: "pct", digits: 1, sign: 1, weight: 1, pair: true }),
  i({ key: "ppi", name: "PPI", label: { en: "PPI m/m", vi: "PPI so với tháng trước" }, kind: "pct", digits: 1, sign: 1, weight: 0.5, pair: true }),
  i({ key: "coreppi", name: "Core PPI", label: { en: "Core PPI m/m", vi: "PPI lõi so với tháng trước" }, kind: "pct", digits: 1, sign: 1, weight: 0.5, pair: true }),
  // Largely known from CPI and PPI by the time it comes out: half weight for the headline.
  i({ key: "pce", name: "PCE price index", label: { en: "PCE prices m/m", vi: "Giá PCE so với tháng trước" }, kind: "pct", digits: 1, sign: 1, weight: 0.5, pair: true }),
  i({ key: "corepce", name: "Core PCE Price Index", label: { en: "Core PCE prices m/m", vi: "Giá PCE lõi so với tháng trước" }, kind: "pct", digits: 1, sign: 1, weight: 1, pair: true }),
  i({ key: "ismmfgprices", name: "ISM Manufacturing Prices", label: { en: "ISM manufacturing prices paid", vi: "Giá đầu vào ISM sản xuất" }, kind: "index", digits: 1, sign: 1, weight: 0.5 }),
  i({ key: "ismsvcprices", name: "ISM Non-Manufacturing Prices", label: { en: "ISM services prices paid", vi: "Giá đầu vào ISM dịch vụ" }, kind: "index", digits: 1, sign: 1, weight: 0.5 }),
  // Wages
  i({ key: "ahe", name: "Average Hourly Earnings", label: { en: "Average hourly earnings m/m", vi: "Lương theo giờ so với tháng trước" }, kind: "pct", digits: 1, sign: 1, weight: 1 }),
  i({ key: "eci", name: "Employment Cost Index", label: { en: "Employment cost index q/q", vi: "Chi phí lao động so với quý trước" }, kind: "pct", digits: 1, sign: 1, weight: 1 }),
  // Expectations
  i({ key: "umichinfl", name: "Michigan 1-Year Inflation Expectations", label: { en: "Michigan 1-year inflation expectations", vi: "Kỳ vọng lạm phát 1 năm (Michigan)" }, kind: "pct", digits: 1, sign: 1, weight: 0.5 }),
];

export const surpriseId = (key: string, field: "actual" | "cons") => `surprise:${key}:${field}`;

/** First day of the history read on the first run: two years for each indicator's typical surprise, then the index. */
export const SURPRISE_SINCE = "2023-01-02";
/** Releases in the index: the last three months, each weighing half as much every month it ages. */
export const SURPRISE_WINDOW_DAYS = 90;
export const SURPRISE_HALF_LIFE_DAYS = 30;
/** Releases needed before an indicator's typical surprise is trusted; fewer and it stays out of the index. */
export const SURPRISE_MIN_RELEASES = 8;
/** One release moves the index at most this many typical surprises. */
export const SURPRISE_CLIP = 3;
/** Within this of zero the index reads "in line with forecasts". */
export const SURPRISE_NEUTRAL = 10;
