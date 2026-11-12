import type { Bi } from "@/lib/i18n";
import type { SeriesKey } from "@/config/series";

// The world-macro page's catalog. Per-country series are stored as
// '<source>:<indicator>:<area>' (e.g. oecd:CLI:USA, imf:LUR:JPN), so the page
// is driven by indicator × country instead of one SERIES entry per cell.

/** OECD indicators fetched by lib/sources/oecd.ts; BCI/CCI are business and consumer confidence (100 = long-run average). */
export type OecdCode = "CLI" | "CPI" | "UNE" | "GDP" | "IRLT" | "BCI" | "CCI";

/** BIS country series fetched next to the policy rates: real effective exchange rate (monthly) and credit-to-GDP gap (quarterly). */
export type BisCode = "REER" | "GAP";

export const oecdId = (code: OecdCode, area: string) => `oecd:${code}:${area}`;
export const imfId = (indicator: string, area: string) => `imf:${indicator}:${area}`;
/** Monthly CPI inflation from the IMF CPI dataset (lib/sources/imfcpi.ts), under the country's DataMapper code. */
export const imfCpiId = (area: string) => `imf:CPI_M:${area}`;
export const bisId = (code: BisCode, area: string) => `bis:${code}:${area}`;

/** Columns of the economies scorecard, in reading order: growth, prices, jobs, money, markets, outlook, balance sheets. */
export type ScoreCol = "gdp" | "cpi" | "unemp" | "policy" | "real" | "y10" | "fx" | "cli" | "debt" | "ca";

export interface ScoreColDef {
  key: ScoreCol;
  name: Bi;
  /** Column header tooltip: what the number is and how it is judged. */
  hint: Bi;
  digits: number;
  /** Show a + sign on positive values (changes and balances). */
  signed?: true;
}

export const SCORE_COLS: ScoreColDef[] = [
  {
    key: "gdp",
    name: { en: "GDP y/y", vi: "GDP so cùng kỳ" },
    hint: {
      en: "Real GDP growth vs a year earlier, latest quarter (OECD; World Bank for Vietnam); IMF estimate for this year where there is none. Red = contracting; amber = 1.5 pp below the country's 2015–19 average.",
      vi: "Tăng trưởng GDP thực so cùng kỳ, quý gần nhất (OECD; Việt Nam lấy từ World Bank); nước không có số quý thì dùng ước tính năm nay của IMF. Đỏ = co lại; vàng = thấp hơn trung bình 2015–19 của chính nước đó 1,5 điểm %.",
    },
    digits: 1,
    signed: true,
  },
  {
    key: "cpi",
    name: { en: "CPI y/y", vi: "CPI so cùng kỳ" },
    hint: {
      en: "Consumer price inflation vs a year earlier, latest month (OECD or IMF, whichever is newer). Green = within 1 pp of the central bank's target; amber = 1–3 pp above it or deflation; red = more than 3 pp above.",
      vi: "Lạm phát giá tiêu dùng so cùng kỳ, tháng gần nhất (OECD hoặc IMF, lấy nguồn có số mới hơn). Xanh = cách mục tiêu của NHTW không quá 1 điểm %; vàng = cao hơn mục tiêu 1–3 điểm % hoặc giảm phát; đỏ = cao hơn trên 3 điểm %.",
    },
    digits: 1,
  },
  {
    key: "unemp",
    name: { en: "Unemployment", vi: "Thất nghiệp" },
    hint: {
      en: "Unemployment rate, latest month (OECD; Brazil from IBGE, a 3-month average ending that month, aged 14+; India from MoSPI's monthly survey, aged 15+; IMF yearly where missing). Amber/red = 0.5/1 pp above its 12-month low, the Sahm-rule logic applied to every country; Brazil's and India's rates are not seasonally adjusted, so they are compared with the same month a year earlier.",
      vi: "Tỷ lệ thất nghiệp tháng gần nhất (OECD; Brazil lấy từ IBGE, bình quân 3 tháng kết thúc ở tháng đó, từ 14 tuổi; Ấn Độ lấy từ khảo sát tháng của MoSPI, từ 15 tuổi; thiếu thì dùng số năm của IMF). Vàng/đỏ = cao hơn mức thấp nhất 12 tháng 0,5/1 điểm %, tức logic quy tắc Sahm áp cho mọi nước; số của Brazil và Ấn Độ chưa điều chỉnh mùa vụ nên so với cùng tháng năm trước.",
    },
    digits: 1,
  },
  {
    key: "policy",
    name: { en: "Policy rate", vi: "LS điều hành" },
    hint: {
      en: "Central bank policy rate (BIS). Euro members share the ECB's. Vietnam: the State Bank's refinancing rate.",
      vi: "Lãi suất điều hành của NHTW (BIS). Các nước dùng euro chung lãi suất ECB. Việt Nam: lãi suất tái cấp vốn của NHNN.",
    },
    digits: 2,
  },
  {
    key: "real",
    name: { en: "Real rate", vi: "LS thực" },
    hint: {
      en: "Policy rate minus CPI inflation. Positive = money is tight (restrictive); negative = still loose.",
      vi: "Lãi suất điều hành trừ lạm phát CPI. Dương = tiền đang đắt (thắt chặt); âm = vẫn còn nới lỏng.",
    },
    digits: 1,
    signed: true,
  },
  {
    key: "y10",
    name: { en: "10Y yield", vi: "Lợi suất 10N" },
    hint: {
      en: "10-year government bond yield: monthly average (OECD); daily for the US (FRED) and Indonesia (CNBC), whose OECD series has stopped.",
      vi: "Lợi suất trái phiếu chính phủ 10 năm: bình quân tháng (OECD); Mỹ (FRED) và Indonesia (CNBC, vì số OECD đã dừng) là số ngày.",
    },
    digits: 2,
  },
  {
    key: "fx",
    name: { en: "FX vs $ YTD", vi: "Tỷ giá so $ từ đầu năm" },
    hint: {
      en: "Change of the currency against the dollar since 31 Dec (positive = stronger). US row: the dollar index (DXY). Amber/red = lost 5/10%.",
      vi: "Thay đổi của đồng nội tệ so với USD từ 31/12 (dương = mạnh lên). Hàng Mỹ: chỉ số USD (DXY). Vàng/đỏ = mất giá 5/10%.",
    },
    digits: 1,
    signed: true,
  },
  {
    key: "cli",
    name: { en: "Leading ind.", vi: "Chỉ báo sớm" },
    hint: {
      en: "OECD composite leading indicator (100 = trend growth) and its direction over 3 months. Amber = below trend and still falling.",
      vi: "Chỉ báo sớm tổng hợp của OECD (100 = tăng trưởng đúng xu hướng) và hướng đi trong 3 tháng. Vàng = dưới xu hướng và còn đang giảm.",
    },
    digits: 1,
  },
  {
    key: "debt",
    name: { en: "Gov. debt", vi: "Nợ công" },
    hint: {
      en: "General government gross debt, % of GDP, IMF estimate for this year. Amber above 90%, red above 120%.",
      vi: "Nợ gộp của chính phủ, % GDP, ước tính năm nay của IMF. Vàng khi trên 90%, đỏ khi trên 120%.",
    },
    digits: 0,
  },
  {
    key: "ca",
    name: { en: "Current acct.", vi: "Vãng lai" },
    hint: {
      en: "Current-account balance, % of GDP, IMF estimate for this year. Deficits beyond 3% (amber) or 5% (red) rely on foreign money every year.",
      vi: "Cán cân vãng lai, % GDP, ước tính năm nay của IMF. Thâm hụt quá 3% (vàng) hoặc 5% (đỏ) nghĩa là năm nào cũng cần tiền từ nước ngoài.",
    },
    digits: 1,
    signed: true,
  },
];

/** Rows of the recession-signals panel: indicators that ran ahead of past US recessions, each with its own threshold in SERIES. */
export const RECESSION_SIGNALS = ["recProb", "chauvet", "sahm", "t10y3m", "curve", "claims", "cfnai"] as const satisfies readonly SeriesKey[];

/** Indicators of the world map (IMF, this year, every economy). Bins: values below thresholds[0] fall in the first class. */
export interface MapMetric {
  /** IMF DataMapper indicator; lib/sources/imf.ts keeps these for every economy, not only ours. */
  ind: "NGDP_RPCH" | "PCPIPCH";
  name: Bi;
  /** Diverging around zero (two hues, gray middle class) or one-hue sequential. */
  kind: "diverging" | "sequential";
  thresholds: number[];
  signed?: true;
}

export const WORLD_MAP: MapMetric[] = [
  // 3 classes a side of a gray "about zero" class: shrinking, flat, slow (Europe, Japan), normal, fast (most of emerging Asia).
  { ind: "NGDP_RPCH", name: { en: "GDP growth", vi: "Tăng trưởng GDP" }, kind: "diverging", thresholds: [-5, -2.5, -0.5, 0.5, 2.5, 5], signed: true },
  // Skewed: most economies sit at 2–5%, a few run far above 20%.
  { ind: "PCPIPCH", name: { en: "Inflation", vi: "Lạm phát" }, kind: "sequential", thresholds: [2, 3, 5, 10, 20] },
];


/**
 * US CPI by group (FRED, BLS seasonally adjusted indexes), drawn as y/y lines in the
 * macro page's inflation panel: where sticky inflation sits. Services less rent of
 * shelter is the Fed's "supercore", the part most tied to wages.
 */
export interface CpiPart {
  key: "energy" | "food" | "goods" | "shelter" | "services";
  code: string;
  name: Bi;
}

export const US_CPI_PARTS: CpiPart[] = [
  { key: "energy", code: "CPIENGSL", name: { en: "Energy", vi: "Năng lượng" } },
  { key: "food", code: "CPIUFDSL", name: { en: "Food", vi: "Thực phẩm" } },
  { key: "goods", code: "CUSR0000SACL1E", name: { en: "Core goods", vi: "Hàng hoá lõi" } },
  { key: "shelter", code: "CUSR0000SAH1", name: { en: "Shelter", vi: "Nhà ở" } },
  { key: "services", code: "CUSR0000SASL2RS", name: { en: "Services ex shelter", vi: "Dịch vụ trừ nhà ở" } },
];
