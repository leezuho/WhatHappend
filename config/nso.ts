import type { Bi } from "@/lib/i18n";

// Vietnam's monthly figures, read by AI from the General Statistics Office's
// monthly socio-economic report (lib/sources/nso.ts, LLDD 02 §7.6). The office
// (Cục Thống kê, nso.gov.vn) has no API: the report is prose, out on the 3rd to
// 6th of the next month. The model only points at numbers; the source keeps one
// only if it appears word for word in the report, inside the sentence the
// model quotes, within the range below.

/**
 * What the number covers, checked against the quoted sentence:
 * "month" = the report's month alone (the quote names it, "tháng Mười");
 * "ytd" = from January to the report's month; "quarter" = only in the reports
 * that close a quarter (March, June, September, December).
 */
export type NsoScope = "month" | "ytd" | "quarter";

export interface NsoField {
  /** Series id part: `nso:<key>`. */
  key: string;
  label: Bi;
  /** "%" = percent or percent change; "$B" = billions of US dollars. */
  unit: "%" | "$B";
  scope: NsoScope;
  /** For the model: what to return, in English. */
  ask: string;
  /** For the model: how the report words it, in Vietnamese ("<tháng>" = the report's month). */
  hint: string;
  /** Plausible range of the signed value; outside it the value is dropped. A field with min < 0 can be negative. */
  min: number;
  max: number;
  /**
   * Words the sentence must contain up to the end of the quote (from the start of the report's sentence, so a short
   * quote is read with its subject), so a number of another measure in the same month is not taken.
   */
  must: RegExp[];
  /** What must follow the number before the next number: "so với cùng kỳ" for a change on a year earlier. */
  after?: RegExp;
}

export const NSO_FIELDS: NsoField[] = [
  {
    key: "EXPORTS",
    label: { en: "Goods exports", vi: "Xuất khẩu hàng hoá" },
    unit: "$B",
    scope: "month",
    ask: "Merchandise exports in the report's month, billion USD.",
    hint: "Kim ngạch xuất khẩu hàng hóa tháng <tháng> đạt X tỷ USD",
    min: 10,
    max: 200,
    must: [/xuất khẩu/i],
  },
  {
    key: "EXPORTS_YOY",
    label: { en: "Exports, y/y", vi: "Xuất khẩu, so cùng kỳ" },
    unit: "%",
    scope: "month",
    ask: "Percent change of the month's merchandise exports against the same month a year earlier (negative when it fell).",
    hint: "Xuất khẩu hàng hóa tháng <tháng> … tăng/giảm X% so với cùng kỳ năm trước",
    min: -60,
    max: 150,
    must: [/xuất khẩu/i],
    after: /cùng kỳ/i,
  },
  {
    key: "IMPORTS",
    label: { en: "Goods imports", vi: "Nhập khẩu hàng hoá" },
    unit: "$B",
    scope: "month",
    ask: "Merchandise imports in the report's month, billion USD.",
    hint: "Kim ngạch nhập khẩu hàng hóa tháng <tháng> đạt X tỷ USD",
    min: 10,
    max: 200,
    must: [/nhập khẩu/i],
  },
  {
    key: "TRADE_BAL",
    label: { en: "Trade balance", vi: "Cán cân thương mại" },
    unit: "$B",
    scope: "month",
    ask: "Merchandise trade balance of the report's month, billion USD: positive for a surplus (xuất siêu), negative for a deficit (nhập siêu).",
    hint: "cán cân thương mại hàng hóa tháng <tháng> xuất siêu / nhập siêu X tỷ USD",
    min: -40,
    max: 40,
    must: [/xuất siêu|nhập siêu/i],
  },
  {
    key: "EXPORTS_US_YTD",
    label: { en: "Exports to the US, year to date", vi: "Xuất khẩu sang Mỹ, từ đầu năm" },
    unit: "$B",
    scope: "ytd",
    ask: "Merchandise exports to the United States from January to the report's month, billion USD.",
    hint: "Hoa Kỳ là thị trường xuất khẩu lớn nhất của Việt Nam với kim ngạch đạt X tỷ USD",
    min: 5,
    max: 400,
    must: [/Hoa Kỳ|Mỹ/, /xuất khẩu/i],
  },
  {
    key: "IIP_YOY",
    label: { en: "Industrial production, y/y", vi: "Sản xuất công nghiệp (IIP), so cùng kỳ" },
    unit: "%",
    scope: "month",
    ask: "Percent change of the index of industrial production (IIP) of the report's month against the same month a year earlier. Null when the report gives only the quarter or the year to date.",
    hint: "Chỉ số sản xuất công nghiệp (IIP) tháng <tháng> ước tăng … so với tháng trước và tăng X% so với cùng kỳ năm trước",
    min: -40,
    max: 60,
    must: [/IIP|sản xuất công nghiệp/i],
    after: /cùng kỳ/i,
  },
  {
    key: "RETAIL_YOY",
    label: { en: "Retail sales, y/y", vi: "Bán lẻ, so cùng kỳ" },
    unit: "%",
    scope: "month",
    ask: "Percent change of retail sales of goods and consumer services at current prices in the report's month against the same month a year earlier. Null when the report gives only the quarter or the year to date.",
    hint: "Tổng mức bán lẻ hàng hóa và doanh thu dịch vụ tiêu dùng theo giá hiện hành tháng <tháng> … tăng X% so với cùng kỳ năm trước",
    min: -40,
    max: 60,
    must: [/bán lẻ/i],
    after: /cùng kỳ/i,
  },
  {
    key: "CPI_YOY",
    label: { en: "CPI inflation, y/y", vi: "Lạm phát CPI, so cùng kỳ" },
    unit: "%",
    scope: "month",
    ask: "Percent change of the consumer price index (CPI) of the report's month against the same month a year earlier.",
    hint: "Chỉ số giá tiêu dùng (CPI) tháng <tháng> tăng … so với tháng trước; … và tăng X% so với cùng kỳ năm trước",
    min: -5,
    max: 25,
    must: [/CPI|giá tiêu dùng/i],
    after: /cùng kỳ/i,
  },
  {
    key: "CPI_MOM",
    label: { en: "CPI, m/m", vi: "CPI, so tháng trước" },
    unit: "%",
    scope: "month",
    ask: "Percent change of the CPI of the report's month against the previous month.",
    hint: "Chỉ số giá tiêu dùng (CPI) tháng <tháng> tăng/giảm X% so với tháng trước",
    min: -5,
    max: 5,
    must: [/CPI|giá tiêu dùng/i],
    after: /tháng trước/i,
  },
  {
    key: "FDI_DISB_YTD",
    label: { en: "FDI disbursed, year to date", vi: "FDI giải ngân, từ đầu năm" },
    unit: "$B",
    scope: "ytd",
    ask: "Foreign direct investment disbursed (realised) in Vietnam from January to the report's month, billion USD.",
    hint: "Vốn đầu tư trực tiếp nước ngoài thực hiện tại Việt Nam <n> tháng năm … ước đạt X tỷ USD",
    min: 0.5,
    max: 80,
    must: [/thực hiện/i, /nước ngoài|FDI/i],
  },
  {
    key: "FDI_DISB_YTD_YOY",
    label: { en: "FDI disbursed, y/y", vi: "FDI giải ngân, so cùng kỳ" },
    unit: "%",
    scope: "ytd",
    ask: "Percent change of FDI disbursed from January to the report's month against the same period a year earlier.",
    hint: "Vốn đầu tư trực tiếp nước ngoài thực hiện … ước đạt … tỷ USD, tăng X% so với cùng kỳ năm trước",
    min: -60,
    max: 150,
    must: [/thực hiện/i, /nước ngoài|FDI/i],
    // A December report covers the whole year: "so với năm trước".
    after: /cùng kỳ|so với năm trước/i,
  },
  {
    key: "FDI_REG_YTD",
    label: { en: "FDI registered, year to date", vi: "FDI đăng ký, từ đầu năm" },
    unit: "$B",
    scope: "ytd",
    ask: "Total foreign investment registered in Vietnam from January (new, adjusted and share purchases together), billion USD.",
    hint: "Tổng vốn đầu tư nước ngoài đăng ký vào Việt Nam tính đến ngày … đạt X tỷ USD",
    min: 0.5,
    max: 150,
    must: [/đăng ký/i, /nước ngoài|FDI/i],
  },
  {
    key: "CREDIT_YTD",
    label: { en: "Credit growth, year to date", vi: "Tăng trưởng tín dụng, từ đầu năm" },
    unit: "%",
    scope: "quarter",
    ask: "Credit growth of the economy since the end of the previous year, percent (not deposits or capital mobilisation). Only quarter-closing reports give it; null otherwise.",
    hint: "tăng trưởng tín dụng của nền kinh tế đạt X%",
    min: -10,
    max: 40,
    must: [/tín dụng/i],
  },
  {
    key: "GDP_YOY",
    label: { en: "GDP growth, y/y (quarter)", vi: "Tăng trưởng GDP quý, so cùng kỳ" },
    unit: "%",
    scope: "quarter",
    ask: "Real GDP growth of the quarter that ends with the report's month, against the same quarter a year earlier, percent (the quarter alone, not the year to date). Only quarter-closing reports give it; null otherwise.",
    hint: "Tổng sản phẩm trong nước (GDP) quý <quý>/<năm> ước tính tăng X% so với cùng kỳ năm trước",
    min: -20,
    max: 25,
    must: [/GDP|tổng sản phẩm/i, /quý/i],
    after: /cùng kỳ/i,
  },
];

export const nsoId = (key: string) => `nso:${key}`;

/** Reports read back to this month (the history the panel draws). */
export const NSO_SINCE = { year: 2025, month: 1 };

/** Vietnamese month names as the report's titles and sentences spell them ("tháng Mười Một"). */
export const VI_MONTHS = ["Một", "Hai", "Ba", "Tư", "Năm", "Sáu", "Bảy", "Tám", "Chín", "Mười", "Mười Một", "Mười Hai"];
