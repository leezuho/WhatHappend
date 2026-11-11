import type { Bi } from "@/lib/i18n";

// Futures positioning from the CFTC's weekly Commitments of Traders (TODO P2
// "Định giá và vị thế", LLDD 02 §2.12). Free of fetcher imports so the web can read it.

/** Which yearly CFTC file the market is in: disaggregated (commodities) or Traders in Financial Futures. */
export type CotReport = "disagg" | "fin";

/**
 * Trader group whose net position the row shows:
 * - mm: managed money (CTAs and hedge funds) in the commodity report;
 * - lf: leveraged funds (hedge funds, prop traders) in the financial report;
 * - am: asset managers (pension, insurance and mutual funds) in the financial report.
 */
export type CotGroup = "mm" | "lf" | "am";

export interface CotMarket {
  key: string;
  /** `CFTC_Contract_Market_Code` (futures only). */
  code: string;
  report: CotReport;
  group: CotGroup;
  section: "commodity" | "financial";
  name: Bi;
}

/** Column prefix of each group in the CFTC files: `<prefix>_Positions_Long_All` / `_Short_All`. */
export const COT_COLUMNS: Record<CotGroup, string> = { mm: "M_Money", lf: "Lev_Money", am: "Asset_Mgr" };

/**
 * Speculators in each market: managed money for commodities, leveraged funds for financial futures. The 10-year
 * Treasury is the exception: leveraged funds' short there is mostly the cash–futures basis trade, the mirror of
 * asset managers' long, so the asset managers' side is the one that reads as a view on rates.
 */
export const COT_MARKETS: CotMarket[] = [
  { key: "WTI", code: "067651", report: "disagg", group: "mm", section: "commodity", name: { en: "WTI crude oil", vi: "Dầu WTI" } },
  { key: "NG", code: "023651", report: "disagg", group: "mm", section: "commodity", name: { en: "Natural gas (Henry Hub)", vi: "Khí tự nhiên (Henry Hub)" } },
  { key: "GOLD", code: "088691", report: "disagg", group: "mm", section: "commodity", name: { en: "Gold", vi: "Vàng" } },
  { key: "SILVER", code: "084691", report: "disagg", group: "mm", section: "commodity", name: { en: "Silver", vi: "Bạc" } },
  { key: "COPPER", code: "085692", report: "disagg", group: "mm", section: "commodity", name: { en: "Copper", vi: "Đồng" } },
  { key: "SPX", code: "13874A", report: "fin", group: "lf", section: "financial", name: { en: "S&P 500 (E-mini)", vi: "S&P 500 (E-mini)" } },
  { key: "UST10", code: "043602", report: "fin", group: "am", section: "financial", name: { en: "10-year Treasury note", vi: "Trái phiếu Mỹ 10 năm" } },
  { key: "DXY", code: "098662", report: "fin", group: "lf", section: "financial", name: { en: "US dollar index", vi: "Chỉ số USD" } },
  { key: "EUR", code: "099741", report: "fin", group: "lf", section: "financial", name: { en: "Euro", vi: "Euro" } },
  { key: "JPY", code: "097741", report: "fin", group: "lf", section: "financial", name: { en: "Japanese yen", vi: "Yên Nhật" } },
  { key: "BTC", code: "133741", report: "fin", group: "lf", section: "financial", name: { en: "Bitcoin (CME)", vi: "Bitcoin (CME)" } },
];

/** Net position (long − short, contracts) and open interest, one point per report date (Tuesday, 00:00 UTC). */
export const cotId = (key: string, part: "net" | "oi") => `cot:${key}:${part}`;

/** Weeks the percentile ranks against: three years. */
export const COT_WEEKS = 156;
/** Fewer weeks than this stored and no percentile is shown. */
export const COT_MIN_WEEKS = 52;
/**
 * At or beyond these percentiles the position is at an end of its 3-year range. Said as "near the high/low", not
 * "crowded long/short": a group can be at its 3-year high while still net short (leveraged funds in CME bitcoin).
 */
export const COT_EXTREME = { high: 90, low: 10 } as const;
