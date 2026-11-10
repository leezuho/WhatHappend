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
