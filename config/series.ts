import type { Bi } from "@/lib/i18n";

// Every number the dashboard shows, with its bilingual name, formatting,
// "is up good?" polarity and alert thresholds. Series ids are '<source>:<code>'.

export type Polarity = "up-good" | "up-bad" | "neutral";

export interface Threshold {
  /** Which direction is dangerous. */
  dir: "above" | "below";
  warn: number;
  crit?: number;
}

export interface SeriesDef {
  id: string;
  name: Bi;
  short: string;
  unit: "" | "%" | "pp" | "$" | "₫" | "K" | "$T";
  digits: number;
  polarity: Polarity;
  /** How to express the daily change: percent of price, or absolute (for yields/spreads). */
  delta: "pct" | "abs";
  threshold?: Threshold;
  explain: Bi;
}

const s = (d: SeriesDef) => d;

export const SERIES = {
  spx: s({
    id: "yahoo:^GSPC",
    name: { en: "S&P 500", vi: "S&P 500" },
    short: "S&P 500",
    unit: "",
    digits: 0,
    polarity: "up-good",
    delta: "pct",
    explain: { en: "500 largest US companies: the world's risk appetite in one number.", vi: "500 công ty lớn nhất Mỹ: khẩu vị rủi ro của thế giới gói trong một con số." },
  }),
  ndx: s({
    id: "yahoo:^IXIC",
    name: { en: "Nasdaq Composite", vi: "Nasdaq Composite" },
    short: "Nasdaq",
    unit: "",
    digits: 0,
    polarity: "up-good",
    delta: "pct",
    explain: { en: "Tech-heavy index; most sensitive to interest rates and the AI cycle.", vi: "Chỉ số nặng về công nghệ; nhạy nhất với lãi suất và chu kỳ AI." },
  }),
  us10y: s({
    id: "yahoo:^TNX",
    name: { en: "US 10-year yield", vi: "Lợi suất Mỹ 10 năm" },
    short: "US10Y",
    unit: "%",
    digits: 2,
    polarity: "neutral",
    delta: "abs",
    threshold: { dir: "above", warn: 4.75, crit: 5.25 },
    explain: { en: "The world's benchmark price of money; mortgages and valuations key off it.", vi: "Giá tiền chuẩn của thế giới; lãi vay mua nhà và định giá tài sản đều bám theo." },
  }),
  curve: s({
    id: "fred:T10Y2Y",
    name: { en: "2s10s curve (10Y − 2Y)", vi: "Đường cong 2s10s (10Y − 2Y)" },
    short: "2s10s",
    unit: "pp",
    digits: 2,
    polarity: "neutral",
    delta: "abs",
    threshold: { dir: "below", warn: 0, crit: -0.5 },
    explain: { en: "Below zero (inverted) has preceded every US recession since the 1970s.", vi: "Âm (đảo ngược) đã xuất hiện trước mọi cuộc suy thoái của Mỹ từ thập niên 1970." },
  }),
  dxy: s({
    id: "yahoo:DX-Y.NYB",
    name: { en: "US dollar index", vi: "Chỉ số USD (DXY)" },
    short: "DXY",
    unit: "",
    digits: 2,
    polarity: "neutral",
    delta: "pct",
    threshold: { dir: "above", warn: 107, crit: 110 },
    explain: { en: "A strong dollar tightens global liquidity and squeezes emerging markets.", vi: "USD mạnh làm thắt thanh khoản toàn cầu và gây áp lực lên thị trường mới nổi." },
  }),
  vix: s({
    id: "yahoo:^VIX",
    name: { en: "VIX (fear gauge)", vi: "VIX (chỉ số sợ hãi)" },
    short: "VIX",
    unit: "",
    digits: 2,
    polarity: "up-bad",
    delta: "pct",
    threshold: { dir: "above", warn: 25, crit: 35 },
    explain: { en: "Expected 30-day S&P 500 volatility. Above 25 = nervous, above 35 = panic.", vi: "Biến động kỳ vọng 30 ngày của S&P 500. Trên 25 = lo lắng, trên 35 = hoảng loạn." },
  }),
  brent: s({
    id: "yahoo:BZ=F",
    name: { en: "Brent crude", vi: "Dầu Brent" },
    short: "Brent",
    unit: "$",
    digits: 2,
    polarity: "neutral",
    delta: "pct",
    threshold: { dir: "above", warn: 95, crit: 110 },
    explain: { en: "Feeds straight into inflation; spikes on Middle East and Hormuz risk.", vi: "Tác động thẳng vào lạm phát; tăng vọt khi Trung Đông hay eo Hormuz căng thẳng." },
  }),
  gold: s({
    id: "yahoo:GC=F",
    name: { en: "Gold", vi: "Vàng" },
    short: "Gold",
    unit: "$",
    digits: 0,
    polarity: "neutral",
    delta: "pct",
    explain: { en: "Safe haven and central-bank reserve asset; rises on fear and a weak dollar.", vi: "Tài sản trú ẩn và dự trữ của NHTW; tăng khi sợ hãi và USD yếu." },
  }),
  copper: s({
    id: "yahoo:HG=F",
    name: { en: "Copper", vi: "Đồng" },
    short: "Copper",
    unit: "$",
    digits: 3,
    polarity: "up-good",
    delta: "pct",
    explain: { en: "\"Dr. Copper\": industrial demand, a read on global (and Chinese) growth.", vi: "\"Tiến sĩ Đồng\": nhu cầu công nghiệp, thước đo tăng trưởng toàn cầu và Trung Quốc." },
  }),
  btc: s({
    id: "yahoo:BTC-USD",
    name: { en: "Bitcoin", vi: "Bitcoin" },
    short: "BTC",
    unit: "$",
    digits: 0,
    polarity: "up-good",
    delta: "pct",
    explain: { en: "24/7 market; often the first to move on global liquidity shifts.", vi: "Giao dịch 24/7; thường phản ứng đầu tiên khi thanh khoản toàn cầu đổi chiều." },
  }),
  vnindex: s({
    id: "vn:VNINDEX",
    name: { en: "VN-Index", vi: "VN-Index" },
    short: "VN-Index",
    unit: "",
    digits: 2,
    polarity: "up-good",
    delta: "pct",
    explain: { en: "Ho Chi Minh City Stock Exchange benchmark.", vi: "Chỉ số chuẩn của Sở Giao dịch Chứng khoán TP.HCM." },
  }),
  usdvnd: s({
    id: "yahoo:USDVND=X",
    name: { en: "USD/VND", vi: "USD/VND" },
    short: "USD/VND",
    unit: "₫",
    digits: 0,
    polarity: "up-bad",
    delta: "pct",
    explain: { en: "Dong weakness raises import costs and pressures the State Bank.", vi: "VND yếu làm tăng chi phí nhập khẩu và gây áp lực lên NHNN." },
  }),

  // Context tier (not tiles)
  us2y: s({ id: "fred:DGS2", name: { en: "US 2-year yield", vi: "Lợi suất Mỹ 2 năm" }, short: "US2Y", unit: "%", digits: 2, polarity: "neutral", delta: "abs", explain: { en: "Tracks where markets expect the Fed to set rates.", vi: "Phản ánh kỳ vọng của thị trường về lãi suất Fed." } }),
  hy: s({
    id: "fred:BAMLH0A0HYM2",
    name: { en: "High-yield credit spread", vi: "Chênh lệch tín dụng lợi suất cao" },
    short: "HY OAS",
    unit: "%",
    digits: 2,
    polarity: "up-bad",
    delta: "abs",
    threshold: { dir: "above", warn: 5, crit: 7 },
    explain: { en: "Extra yield junk borrowers pay. Widens before equity sell-offs.", vi: "Phần lợi suất cộng thêm doanh nghiệp rủi ro phải trả. Thường giãn ra trước khi cổ phiếu bị bán tháo." },
  }),
  fsi: s({
    id: "fred:STLFSI4",
    name: { en: "St. Louis Fed financial stress", vi: "Chỉ số căng thẳng tài chính St. Louis Fed" },
    short: "STLFSI",
    unit: "",
    digits: 2,
    polarity: "up-bad",
    delta: "abs",
    threshold: { dir: "above", warn: 0, crit: 1.5 },
    explain: { en: "0 = average stress. Above 0 = tighter than normal.", vi: "0 = mức trung bình. Trên 0 = căng hơn bình thường." },
  }),
  move: s({ id: "yahoo:^MOVE", name: { en: "MOVE (bond volatility)", vi: "MOVE (biến động trái phiếu)" }, short: "MOVE", unit: "", digits: 1, polarity: "up-bad", delta: "pct", threshold: { dir: "above", warn: 120, crit: 150 }, explain: { en: "The VIX of the Treasury market.", vi: "\"VIX\" của thị trường trái phiếu Mỹ." } }),
  claims: s({
    id: "fred:ICSA",
    name: { en: "Initial jobless claims", vi: "Đơn xin trợ cấp thất nghiệp lần đầu" },
    short: "Claims",
    unit: "K",
    digits: 0,
    polarity: "up-bad",
    delta: "pct",
    threshold: { dir: "above", warn: 260_000, crit: 300_000 },
    explain: { en: "Weekly, the earliest hard read on layoffs.", vi: "Ra hàng tuần, dữ liệu cứng sớm nhất về sa thải." },
  }),
  sahm: s({ id: "fred:SAHMREALTIME", name: { en: "Sahm rule indicator", vi: "Chỉ báo quy tắc Sahm" }, short: "Sahm", unit: "pp", digits: 2, polarity: "up-bad", delta: "abs", threshold: { dir: "above", warn: 0.3, crit: 0.5 }, explain: { en: "≥ 0.5 has signalled the start of every US recession.", vi: "≥ 0,5 đã báo hiệu sự bắt đầu của mọi cuộc suy thoái ở Mỹ." } }),
  gdpnow: s({ id: "fred:GDPNOW", name: { en: "Atlanta Fed GDPNow", vi: "GDPNow (Fed Atlanta)" }, short: "GDPNow", unit: "%", digits: 1, polarity: "up-good", delta: "abs", explain: { en: "Real-time nowcast of this quarter's US GDP growth (annualized).", vi: "Ước tính tức thời tăng trưởng GDP quý này của Mỹ (quy năm)." } }),
  walcl: s({ id: "fred:WALCL", name: { en: "Fed balance sheet", vi: "Bảng cân đối kế toán Fed" }, short: "Fed BS", unit: "$T", digits: 2, polarity: "neutral", delta: "pct", explain: { en: "Growing = adding liquidity (QE); shrinking = draining it (QT).", vi: "Tăng = bơm thanh khoản (QE); giảm = rút thanh khoản (QT)." } }),
  breakeven: s({ id: "fred:T5YIFR", name: { en: "5y5y inflation expectation", vi: "Kỳ vọng lạm phát 5y5y" }, short: "5y5y", unit: "%", digits: 2, polarity: "neutral", delta: "abs", explain: { en: "Market's long-run inflation expectation; the Fed watches it closely.", vi: "Kỳ vọng lạm phát dài hạn của thị trường; Fed theo dõi sát." } }),
  cpi: s({ id: "fred:CPIAUCSL", name: { en: "US CPI", vi: "CPI Mỹ" }, short: "CPI", unit: "", digits: 1, polarity: "neutral", delta: "pct", explain: { en: "Consumer price index level (we show year-over-year).", vi: "Chỉ số giá tiêu dùng (hiển thị so với cùng kỳ)." } }),
  fedfunds: s({ id: "fred:FEDFUNDS", name: { en: "Fed funds rate", vi: "Lãi suất Fed" }, short: "Fed funds", unit: "%", digits: 2, polarity: "neutral", delta: "abs", explain: { en: "The policy rate everything else is priced off.", vi: "Lãi suất điều hành, gốc định giá mọi tài sản." } }),
  epu: s({ id: "fred:USEPUINDXD", name: { en: "Economic policy uncertainty", vi: "Bất định chính sách kinh tế" }, short: "EPU", unit: "", digits: 0, polarity: "up-bad", delta: "pct", explain: { en: "Newspaper-based index of policy uncertainty.", vi: "Chỉ số bất định chính sách dựa trên báo chí." } }),
  gpr: s({ id: "gpr:GPRD", name: { en: "Geopolitical risk index", vi: "Chỉ số rủi ro địa chính trị" }, short: "GPR", unit: "", digits: 0, polarity: "up-bad", delta: "pct", threshold: { dir: "above", warn: 150, crit: 250 }, explain: { en: "Share of news articles about war, terrorism and geopolitical tension (100 = 1985–2019 average).", vi: "Tỷ lệ bài báo về chiến tranh, khủng bố và căng thẳng địa chính trị (100 = trung bình 1985–2019)." } }),
  gscpi: s({ id: "nyfed:GSCPI", name: { en: "Global supply chain pressure", vi: "Áp lực chuỗi cung ứng toàn cầu" }, short: "GSCPI", unit: "", digits: 2, polarity: "up-bad", delta: "abs", threshold: { dir: "above", warn: 1, crit: 2 }, explain: { en: "Standard deviations from normal; 2021 peak was above 4.", vi: "Độ lệch chuẩn so với bình thường; đỉnh 2021 trên 4." } }),
} as const satisfies Record<string, SeriesDef>;

export type SeriesKey = keyof typeof SERIES;

/** CPI is stored as an index level but read as year-over-year inflation. */
export const CPI_YOY: SeriesDef = {
  ...SERIES.cpi,
  name: { en: "US CPI inflation (y/y)", vi: "Lạm phát CPI Mỹ (so cùng kỳ)" },
  unit: "%",
  delta: "abs",
  threshold: { dir: "above", warn: 3, crit: 4 },
};

/** The definition a key is displayed with (CPI as y/y inflation). */
export function defOf(key: SeriesKey): SeriesDef {
  return key === "cpi" ? CPI_YOY : SERIES[key];
}

/** The 12 tiles, in reading order: equities, rates, dollar, fear, commodities, crypto, Vietnam. */
export const VITAL_SIGNS: SeriesKey[] = ["spx", "ndx", "us10y", "curve", "dxy", "vix", "brent", "gold", "copper", "btc", "vnindex", "usdvnd"];

/** Yahoo symbols to pull quotes + history for. */
export const YAHOO_SYMBOLS = Object.values(SERIES)
  .map((d) => d.id)
  .filter((id) => id.startsWith("yahoo:"))
  .map((id) => id.slice("yahoo:".length));

/** FRED series codes to pull. */
export const FRED_CODES = [
  ...Object.values(SERIES)
    .map((d) => d.id)
    .filter((id) => id.startsWith("fred:"))
    .map((id) => id.slice("fred:".length)),
  // yield curve maturities
  "DGS1MO",
  "DGS3MO",
  "DGS6MO",
  "DGS1",
  "DGS3",
  "DGS5",
  "DGS7",
  "DGS10",
  "DGS20",
  "DGS30",
];
