import type { Bi } from "@/lib/i18n";

// Major economies for the inflation-vs-policy-rate panel. `bis` is the BIS
// WS_CBPOL area code (null where BIS publishes no policy rate, e.g. Vietnam).

export interface Country {
  imf: string;
  bis: string | null;
  name: Bi;
  short: string;
}

export const COUNTRIES: Country[] = [
  { imf: "USA", bis: "US", short: "US", name: { en: "United States", vi: "Mỹ" } },
  { imf: "EURO", bis: "XM", short: "EA", name: { en: "Euro area", vi: "Khu vực euro" } },
  { imf: "JPN", bis: "JP", short: "JP", name: { en: "Japan", vi: "Nhật Bản" } },
  { imf: "GBR", bis: "GB", short: "UK", name: { en: "United Kingdom", vi: "Anh" } },
  { imf: "CHN", bis: "CN", short: "CN", name: { en: "China", vi: "Trung Quốc" } },
  { imf: "IND", bis: "IN", short: "IN", name: { en: "India", vi: "Ấn Độ" } },
  { imf: "BRA", bis: "BR", short: "BR", name: { en: "Brazil", vi: "Brazil" } },
  { imf: "KOR", bis: "KR", short: "KR", name: { en: "South Korea", vi: "Hàn Quốc" } },
  { imf: "VNM", bis: null, short: "VN", name: { en: "Vietnam", vi: "Việt Nam" } },
];

export const IMF_INDICATORS = ["PCPIPCH", "NGDP_RPCH"] as const;
