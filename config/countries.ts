import type { Bi } from "@/lib/i18n";

// Economies tracked by the overview's inflation-vs-policy-rate panel and the
// world-macro page. Codes per data provider; null where it publishes nothing.

export interface Country {
  /** IMF DataMapper code (annual WEO data, with forecasts). */
  imf: string;
  /** BIS WS_CBPOL area of the policy rate. Euro members share the ECB's (XM). */
  bis: string | null;
  /** BIS area of the country's own series (effective exchange rate, credit gap): euro members have theirs, the euro area is XM. */
  bisArea: string | null;
  /** OECD REF_AREA for the monthly and quarterly series. */
  oecd: string | null;
  /** Policy-rate series where BIS publishes none (Vietnam: the State Bank's refinancing rate, lib/sources/sbv.ts). */
  rate?: string;
  /** Daily 10-year government bond yield, used when newer than OECD's monthly average (US: FRED; Indonesia: CNBC). */
  y10?: string;
  /** Quarterly real GDP growth where OECD has none (Vietnam: World Bank Global Economic Monitor). */
  gdp?: string;
  /** Yahoo FX pair; `perUsd` = quoted as local currency per dollar (JPY=X) rather than dollars per unit (EURUSD=X). */
  fx: { symbol: string; perUsd: boolean } | null;
  /** Central-bank inflation target (midpoint of a band), for judging CPI. */
  cpiTarget: number;
  group: "dm" | "em";
  name: Bi;
  short: string;
  /** Shown in the overview's inflation-vs-policy-rate panel. */
  overview?: true;
  /** A row on the world-macro page. */
  macro?: true;
}

const EUR = { symbol: "EURUSD=X", perUsd: false };

/** Series written by lib/sources/sbv.ts. */
export const SBV_REFI = "sbv:REFI";

export const COUNTRIES: Country[] = [
  { imf: "USA", bis: "US", bisArea: "US", oecd: "USA", y10: "fred:DGS10", fx: null, cpiTarget: 2, group: "dm", short: "US", name: { en: "United States", vi: "Mỹ" }, overview: true, macro: true },
  { imf: "EURO", bis: "XM", bisArea: "XM", oecd: "EA20", fx: EUR, cpiTarget: 2, group: "dm", short: "EA", name: { en: "Euro area", vi: "Khu vực euro" }, overview: true, macro: true },
  { imf: "DEU", bis: "XM", bisArea: "DE", oecd: "DEU", fx: EUR, cpiTarget: 2, group: "dm", short: "DE", name: { en: "Germany", vi: "Đức" }, macro: true },
  { imf: "FRA", bis: "XM", bisArea: "FR", oecd: "FRA", fx: EUR, cpiTarget: 2, group: "dm", short: "FR", name: { en: "France", vi: "Pháp" }, macro: true },
  { imf: "ITA", bis: "XM", bisArea: "IT", oecd: "ITA", fx: EUR, cpiTarget: 2, group: "dm", short: "IT", name: { en: "Italy", vi: "Ý" }, macro: true },
  { imf: "GBR", bis: "GB", bisArea: "GB", oecd: "GBR", fx: { symbol: "GBPUSD=X", perUsd: false }, cpiTarget: 2, group: "dm", short: "UK", name: { en: "United Kingdom", vi: "Anh" }, overview: true, macro: true },
  { imf: "JPN", bis: "JP", bisArea: "JP", oecd: "JPN", fx: { symbol: "JPY=X", perUsd: true }, cpiTarget: 2, group: "dm", short: "JP", name: { en: "Japan", vi: "Nhật Bản" }, overview: true, macro: true },
  { imf: "CAN", bis: "CA", bisArea: "CA", oecd: "CAN", fx: { symbol: "CAD=X", perUsd: true }, cpiTarget: 2, group: "dm", short: "CA", name: { en: "Canada", vi: "Canada" }, macro: true },
  { imf: "AUS", bis: "AU", bisArea: "AU", oecd: "AUS", fx: { symbol: "AUDUSD=X", perUsd: false }, cpiTarget: 2.5, group: "dm", short: "AU", name: { en: "Australia", vi: "Úc" }, macro: true },
  { imf: "KOR", bis: "KR", bisArea: "KR", oecd: "KOR", fx: { symbol: "KRW=X", perUsd: true }, cpiTarget: 2, group: "dm", short: "KR", name: { en: "South Korea", vi: "Hàn Quốc" }, overview: true, macro: true },
  { imf: "CHN", bis: "CN", bisArea: "CN", oecd: "CHN", fx: { symbol: "CNY=X", perUsd: true }, cpiTarget: 2, group: "em", short: "CN", name: { en: "China", vi: "Trung Quốc" }, overview: true, macro: true },
  { imf: "IND", bis: "IN", bisArea: "IN", oecd: "IND", fx: { symbol: "INR=X", perUsd: true }, cpiTarget: 4, group: "em", short: "IN", name: { en: "India", vi: "Ấn Độ" }, overview: true, macro: true },
  { imf: "IDN", bis: "ID", bisArea: "ID", oecd: "IDN", y10: "cnbc:ID10Y-ID", fx: { symbol: "IDR=X", perUsd: true }, cpiTarget: 2.5, group: "em", short: "ID", name: { en: "Indonesia", vi: "Indonesia" }, macro: true },
  { imf: "BRA", bis: "BR", bisArea: "BR", oecd: "BRA", fx: { symbol: "BRL=X", perUsd: true }, cpiTarget: 3, group: "em", short: "BR", name: { en: "Brazil", vi: "Brazil" }, overview: true, macro: true },
  { imf: "MEX", bis: "MX", bisArea: "MX", oecd: "MEX", fx: { symbol: "MXN=X", perUsd: true }, cpiTarget: 3, group: "em", short: "MX", name: { en: "Mexico", vi: "Mexico" }, macro: true },
  { imf: "VNM", bis: null, bisArea: null, oecd: null, rate: SBV_REFI, gdp: "wb:GDP:VNM", fx: { symbol: "USDVND=X", perUsd: true }, cpiTarget: 4.5, group: "em", short: "VN", name: { en: "Vietnam", vi: "Việt Nam" }, overview: true, macro: true },
];

/**
 * Rows of the world-macro page, in display order (advanced economies first). Vietnam is in no OECD or BIS dataflow,
 * so its row comes from the IMF (monthly CPI, yearly unemployment), the State Bank (config/policy-rates.ts) and the World Bank instead.
 */
export const MACRO_COUNTRIES = COUNTRIES.filter((c) => c.macro);

/** Series id of a country's policy rate: BIS where it publishes one, else the country's own source; null when there is none. */
export function policyRateId(c: Country): string | null {
  return c.bis ? `bis:${c.bis}` : (c.rate ?? null);
}

/** CNBC symbols behind the countries' daily 10-year yields (`cnbc:<symbol>`). */
export const CNBC_SYMBOLS = MACRO_COUNTRIES.flatMap((c) => (c.y10?.startsWith("cnbc:") ? [c.y10.slice("cnbc:".length)] : []));

/** ISO3 codes whose quarterly GDP growth comes from the World Bank (`wb:GDP:<iso3>`). */
export const WB_GDP_AREAS = MACRO_COUNTRIES.flatMap((c) => (c.gdp?.startsWith("wb:GDP:") ? [c.gdp.slice("wb:GDP:".length)] : []));

/** IMF World Economic Outlook indicators: inflation, real GDP growth, unemployment, government debt and balance, current account (all % or % of GDP). */
export const IMF_INDICATORS = ["PCPIPCH", "NGDP_RPCH", "LUR", "GGXWDG_NGDP", "GGXCNL_NGDP", "BCA_NGDPD"] as const;

/** IMF aggregates stored next to the countries: the world, advanced, and emerging & developing economies. */
export const IMF_GROUPS = ["WEOWORLD", "ADVEC", "OEMDC"] as const;

/** Yahoo FX pairs the macro page needs (YAHOO_SYMBOLS drops the ones SERIES already tracks, like USDVND=X). */
export const FX_SYMBOLS = [...new Set(MACRO_COUNTRIES.flatMap((c) => (c.fx ? [c.fx.symbol] : [])))];
