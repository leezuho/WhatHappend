import type { Bi } from "@/lib/i18n";
import { FX_SYMBOLS } from "@/config/countries";
import { MARKET_EXTRA_SYMBOLS, WORLD_INDEX_SYMBOLS } from "@/config/markets";
import { US_CPI_PARTS } from "@/config/macro";
import { TECH_FX, TECH_SYMBOLS } from "@/config/tech";

// Every number the dashboard shows, with its bilingual name, formatting,
// "is up good?" polarity and alert thresholds. Series ids are '<source>:<code>'.

export type Polarity = "up-good" | "up-bad" | "neutral";

/** Release frequency of a low-frequency series: tiles then show the period ("Sep 2026") and a longer sparkline. */
export type Freq = "w" | "m" | "q" | "y";

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
  /** "$T": value in $ millions shown as trillions (FRED). "$B": value in $ billions, shown as B or T. */
  unit: "" | "%" | "pp" | "bp" | "$" | "₫" | "K" | "$T" | "$B";
  digits: number;
  polarity: Polarity;
  /** How to express the daily change: percent of price, or absolute (for yields/spreads). */
  delta: "pct" | "abs";
  /** Absolute changes of a "%" series read in basis points (yields) unless this says percentage points (shares). */
  deltaUnit?: "pp";
  threshold?: Threshold;
  /** A market price: its charts are drawn in the trend color (up green, down red over the window shown). */
  price?: true;
  /** Weekly/monthly/quarterly/annual series; daily and intraday ones leave it out. */
  freq?: Freq;
  /**
   * Stored as a level but read as a change: "yoy" = % change from the same period a year earlier
   * (CPI index → inflation), "diff" = change from the previous reading (payroll level → jobs added).
   */
  transform?: "yoy" | "diff";
  /** Multiply displayed values by this (PAYEMS is in thousands; the "K" unit expects a raw count). */
  scale?: number;
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
    price: true,
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
    price: true,
    explain: { en: "Tech-heavy index; most sensitive to interest rates and the AI cycle.", vi: "Chỉ số nặng về công nghệ; nhạy nhất với lãi suất và chu kỳ AI." },
  }),
  sox: s({
    id: "yahoo:^SOX",
    name: { en: "Philadelphia Semiconductor (SOX)", vi: "Chỉ số bán dẫn Philadelphia (SOX)" },
    short: "SOX",
    unit: "",
    digits: 0,
    polarity: "up-good",
    delta: "pct",
    price: true,
    explain: {
      en: "The 30 largest chip companies listed in the US: the closest market read on AI hardware demand and the electronics cycle.",
      vi: "30 công ty chip lớn nhất niêm yết ở Mỹ: thước đo thị trường sát nhất cho nhu cầu phần cứng AI và chu kỳ điện tử.",
    },
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
    price: true,
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
    price: true,
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
    price: true,
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
    price: true,
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
    price: true,
    explain: { en: "24/7 market; often the first to move on global liquidity shifts.", vi: "Giao dịch 24/7; thường phản ứng đầu tiên khi thanh khoản toàn cầu đổi chiều." },
  }),
  eth: s({
    id: "yahoo:ETH-USD",
    name: { en: "Ether", vi: "Ether (ETH)" },
    short: "ETH",
    unit: "$",
    digits: 0,
    polarity: "up-good",
    delta: "pct",
    price: true,
    explain: { en: "Second-largest crypto asset; the base layer most DeFi and stablecoins run on.", vi: "Tài sản crypto lớn thứ hai; nền tảng chạy phần lớn DeFi và stablecoin." },
  }),
  sol: s({
    id: "yahoo:SOL-USD",
    name: { en: "Solana", vi: "Solana (SOL)" },
    short: "SOL",
    unit: "$",
    digits: 2,
    polarity: "up-good",
    delta: "pct",
    price: true,
    explain: { en: "High-speed chain; a gauge of retail and speculative appetite beyond BTC and ETH.", vi: "Chuỗi tốc độ cao; thước đo khẩu vị đầu cơ của nhỏ lẻ ngoài BTC và ETH." },
  }),
  vnindex: s({
    id: "vn:VNINDEX",
    name: { en: "VN-Index", vi: "VN-Index" },
    short: "VN-Index",
    unit: "",
    digits: 2,
    polarity: "up-good",
    delta: "pct",
    price: true,
    explain: { en: "Ho Chi Minh City Stock Exchange benchmark.", vi: "Chỉ số chuẩn của Sở Giao dịch Chứng khoán TP.HCM." },
  }),
  vn30: s({
    id: "vn:VN30",
    name: { en: "VN30", vi: "VN30" },
    short: "VN30",
    unit: "",
    digits: 2,
    polarity: "up-good",
    delta: "pct",
    price: true,
    explain: { en: "The 30 largest, most traded HOSE stocks; the index VN30 futures settle on.", vi: "30 cổ phiếu lớn và thanh khoản nhất HOSE; chỉ số cơ sở của hợp đồng tương lai VN30." },
  }),
  hnx: s({
    id: "vn:HNX",
    name: { en: "HNX-Index", vi: "HNX-Index" },
    short: "HNX",
    unit: "",
    digits: 2,
    polarity: "up-good",
    delta: "pct",
    price: true,
    explain: { en: "Hanoi Stock Exchange: smaller companies, many banks, builders and securities firms.", vi: "Sở Giao dịch Chứng khoán Hà Nội: doanh nghiệp nhỏ hơn, nhiều ngân hàng, xây dựng và chứng khoán." },
  }),
  upcom: s({
    id: "vn:UPCOM",
    name: { en: "UPCoM-Index", vi: "UPCoM-Index" },
    short: "UPCoM",
    unit: "",
    digits: 2,
    polarity: "up-good",
    delta: "pct",
    price: true,
    explain: { en: "Unlisted public companies traded on HNX's UPCoM board, often state firms before a listing.", vi: "Công ty đại chúng chưa niêm yết giao dịch trên sàn UPCoM của HNX, nhiều doanh nghiệp nhà nước trước khi lên sàn." },
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
    freq: "w",
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
    freq: "w",
    name: { en: "Initial jobless claims", vi: "Đơn xin trợ cấp thất nghiệp lần đầu" },
    short: "Claims",
    unit: "K",
    digits: 0,
    polarity: "up-bad",
    delta: "pct",
    threshold: { dir: "above", warn: 260_000, crit: 300_000 },
    explain: { en: "Weekly, the earliest hard read on layoffs.", vi: "Ra hàng tuần, dữ liệu cứng sớm nhất về sa thải." },
  }),
  sahm: s({ id: "fred:SAHMREALTIME", name: { en: "Sahm rule indicator", vi: "Chỉ báo quy tắc Sahm" }, short: "Sahm", unit: "pp", digits: 2, polarity: "up-bad", delta: "abs", threshold: { dir: "above", warn: 0.3, crit: 0.5 }, freq: "m", explain: { en: "≥ 0.5 has signalled the start of every US recession.", vi: "≥ 0,5 đã báo hiệu sự bắt đầu của mọi cuộc suy thoái ở Mỹ." } }),
  gdpnow: s({ id: "fred:GDPNOW", name: { en: "Atlanta Fed GDPNow", vi: "GDPNow (Fed Atlanta)" }, short: "GDPNow", unit: "%", digits: 1, polarity: "up-good", delta: "abs", explain: { en: "Real-time nowcast of this quarter's US GDP growth (annualized).", vi: "Ước tính tức thời tăng trưởng GDP quý này của Mỹ (quy năm)." } }),
  walcl: s({ id: "fred:WALCL", name: { en: "Fed balance sheet", vi: "Bảng cân đối kế toán Fed" }, short: "Fed BS", unit: "$T", digits: 2, polarity: "neutral", delta: "pct", freq: "w", explain: { en: "Growing = adding liquidity (QE); shrinking = draining it (QT).", vi: "Tăng = bơm thanh khoản (QE); giảm = rút thanh khoản (QT)." } }),
  breakeven: s({ id: "fred:T5YIFR", name: { en: "5y5y inflation expectation", vi: "Kỳ vọng lạm phát 5y5y" }, short: "5y5y", unit: "%", digits: 2, polarity: "neutral", delta: "abs", explain: { en: "Market's long-run inflation expectation; the Fed watches it closely.", vi: "Kỳ vọng lạm phát dài hạn của thị trường; Fed theo dõi sát." } }),
  cpi: s({
    id: "fred:CPIAUCSL",
    name: { en: "US CPI inflation (y/y)", vi: "Lạm phát CPI Mỹ (so cùng kỳ)" },
    short: "CPI",
    unit: "%",
    digits: 1,
    polarity: "up-bad",
    delta: "abs",
    deltaUnit: "pp",
    freq: "m",
    transform: "yoy",
    threshold: { dir: "above", warn: 3, crit: 4 },
    explain: { en: "Consumer prices vs a year earlier (stored as the index level).", vi: "Giá tiêu dùng so với cùng kỳ năm trước (lưu dạng chỉ số)." },
  }),
  fedfunds: s({ id: "fred:FEDFUNDS", name: { en: "Fed funds rate", vi: "Lãi suất Fed" }, short: "Fed funds", unit: "%", digits: 2, polarity: "neutral", delta: "abs", freq: "m", explain: { en: "The policy rate everything else is priced off.", vi: "Lãi suất điều hành, gốc định giá mọi tài sản." } }),
  epu: s({ id: "fred:USEPUINDXD", name: { en: "Economic policy uncertainty", vi: "Bất định chính sách kinh tế" }, short: "EPU", unit: "", digits: 0, polarity: "up-bad", delta: "pct", explain: { en: "Newspaper-based index of policy uncertainty.", vi: "Chỉ số bất định chính sách dựa trên báo chí." } }),
  gpr: s({ id: "gpr:GPRD", name: { en: "Geopolitical risk index", vi: "Chỉ số rủi ro địa chính trị" }, short: "GPR", unit: "", digits: 0, polarity: "up-bad", delta: "pct", threshold: { dir: "above", warn: 150, crit: 250 }, explain: { en: "Share of news articles about war, terrorism and geopolitical tension (100 = 1985–2019 average).", vi: "Tỷ lệ bài báo về chiến tranh, khủng bố và căng thẳng địa chính trị (100 = trung bình 1985–2019)." } }),
  gscpi: s({ id: "nyfed:GSCPI", name: { en: "Global supply chain pressure", vi: "Áp lực chuỗi cung ứng toàn cầu" }, short: "GSCPI", unit: "", digits: 2, polarity: "up-bad", delta: "abs", threshold: { dir: "above", warn: 1, crit: 2 }, freq: "m", explain: { en: "Standard deviations from normal; 2021 peak was above 4.", vi: "Độ lệch chuẩn so với bình thường; đỉnh 2021 trên 4." } }),

  // World macro (the macro page's top row)
  worldGdp: s({
    id: "imf:NGDP_RPCH:WEOWORLD",
    name: { en: "World GDP growth (IMF)", vi: "Tăng trưởng GDP thế giới (IMF)" },
    short: "World GDP",
    unit: "%",
    digits: 1,
    polarity: "up-good",
    delta: "abs",
    deltaUnit: "pp",
    freq: "y",
    threshold: { dir: "below", warn: 2.5, crit: 2 },
    explain: {
      en: "IMF estimate of real world growth this year (PPP-weighted). Around 3% is a normal year; below 2.5% is often treated as a global recession.",
      vi: "Ước tính của IMF về tăng trưởng thực của thế giới năm nay (gia quyền theo PPP). Khoảng 3% là năm bình thường; dưới 2,5% thường được coi là suy thoái toàn cầu.",
    },
  }),
  worldCpi: s({
    id: "imf:PCPIPCH:WEOWORLD",
    name: { en: "World inflation (IMF)", vi: "Lạm phát thế giới (IMF)" },
    short: "World CPI",
    unit: "%",
    digits: 1,
    polarity: "up-bad",
    delta: "abs",
    deltaUnit: "pp",
    freq: "y",
    threshold: { dir: "above", warn: 5, crit: 7 },
    explain: {
      en: "IMF estimate of average consumer-price inflation this year. It ran about 3.5% before 2020 and peaked near 9% in 2022.",
      vi: "Ước tính của IMF về lạm phát giá tiêu dùng bình quân năm nay. Trước 2020 khoảng 3,5%, đỉnh gần 9% năm 2022.",
    },
  }),
  usdBroad: s({
    id: "fred:DTWEXBGS",
    name: { en: "Broad dollar index", vi: "Chỉ số USD rổ rộng" },
    short: "USD broad",
    unit: "",
    digits: 1,
    polarity: "up-bad",
    delta: "pct",
    explain: {
      en: "The dollar against 26 trading partners (Fed). A rising dollar tightens credit for the rest of the world, emerging markets first.",
      vi: "USD so với 26 đối tác thương mại (Fed). USD tăng làm tín dụng của phần còn lại của thế giới thắt lại, thị trường mới nổi chịu trước.",
    },
  }),
  commodities: s({
    id: "fred:PALLFNFINDEXM",
    name: { en: "IMF commodity price index", vi: "Chỉ số giá hàng hoá IMF" },
    short: "Commodities",
    unit: "",
    digits: 0,
    polarity: "neutral",
    delta: "pct",
    freq: "m",
    explain: {
      en: "Energy, metals and food prices in one index (2016 = 100). Rising = cost pressure on inflation; falling = weaker world demand.",
      vi: "Giá năng lượng, kim loại và lương thực gộp thành một chỉ số (2016 = 100). Tăng = áp lực lên lạm phát; giảm = cầu thế giới yếu đi.",
    },
  }),
  globalLiq: s({
    id: "calc:GLOBAL_LIQ",
    name: { en: "Global central-bank liquidity", vi: "Thanh khoản NHTW toàn cầu" },
    short: "CB liquidity",
    unit: "$T",
    digits: 1,
    polarity: "up-good",
    delta: "pct",
    freq: "w",
    explain: {
      en: "Fed + ECB + Bank of Japan balance sheets, in dollars. Growing = central banks adding money to the system; shrinking = draining it.",
      vi: "Tổng bảng cân đối của Fed, ECB và Ngân hàng Trung ương Nhật, quy ra USD. Tăng = NHTW bơm tiền vào hệ thống; giảm = rút tiền ra.",
    },
  }),
  recProb: s({
    id: "calc:RECPROB_US",
    name: { en: "US recession probability (12 months)", vi: "Xác suất suy thoái Mỹ (12 tháng tới)" },
    short: "Rec. prob.",
    unit: "%",
    digits: 0,
    polarity: "up-bad",
    delta: "abs",
    deltaUnit: "pp",
    freq: "m",
    threshold: { dir: "above", warn: 30, crit: 50 },
    explain: {
      en: "NY Fed yield-curve model on the 10-year minus 3-month spread. Above 30% came before every US recession since the 1960s, though it also stayed high through 2023–24 with no recession.",
      vi: "Mô hình đường cong lợi suất của Fed New York, tính từ chênh lệch 10 năm trừ 3 tháng. Mức trên 30% đã xuất hiện trước mọi cuộc suy thoái Mỹ từ thập niên 1960, nhưng cũng từng ở mức cao suốt 2023–24 mà không có suy thoái.",
    },
  }),
  gepu: s({
    id: "fred:GEPUCURRENT",
    name: { en: "Global policy uncertainty", vi: "Bất định chính sách toàn cầu" },
    short: "Global EPU",
    unit: "",
    digits: 0,
    polarity: "up-bad",
    delta: "pct",
    freq: "m",
    explain: {
      en: "GDP-weighted index of newspaper coverage of economic-policy uncertainty in 21 countries (100 = 1997–2015 average).",
      vi: "Chỉ số tần suất báo chí nói về bất định chính sách kinh tế ở 21 nước, gia quyền theo GDP (100 = trung bình 1997–2015).",
    },
  }),

  // Crypto (observation-only series: one point per day, today's overwritten on every run)
  cryptoMcap: s({
    id: "cg:total_mcap",
    name: { en: "Total crypto market cap", vi: "Vốn hóa toàn thị trường crypto" },
    short: "Crypto cap",
    unit: "$B",
    digits: 0,
    polarity: "up-good",
    delta: "pct",
    price: true,
    explain: { en: "Value of all listed crypto assets (CoinGecko).", vi: "Tổng giá trị mọi tài sản crypto đang niêm yết (CoinGecko)." },
  }),
  btcDom: s({
    id: "cg:btc_dominance",
    name: { en: "Bitcoin dominance", vi: "Tỷ trọng Bitcoin (BTC.D)" },
    short: "BTC.D",
    unit: "%",
    digits: 1,
    polarity: "neutral",
    delta: "abs",
    deltaUnit: "pp",
    explain: { en: "BTC's share of total crypto value. Falling while prices rise = money rotating into altcoins.", vi: "Phần của BTC trong tổng vốn hóa crypto. Giảm trong khi giá tăng = tiền đang xoay sang altcoin." },
  }),
  fng: s({
    id: "fng:crypto",
    name: { en: "Crypto Fear & Greed", vi: "Chỉ số Sợ hãi & Tham lam (crypto)" },
    short: "F&G",
    unit: "",
    digits: 0,
    polarity: "neutral",
    delta: "abs",
    explain: { en: "0 = extreme fear, 100 = extreme greed (alternative.me). Extremes have often marked turning points.", vi: "0 = cực kỳ sợ hãi, 100 = cực kỳ tham lam (alternative.me). Vùng cực đoan thường trùng các điểm đảo chiều." },
  }),
  dvol: s({
    id: "deribit:DVOL-BTC",
    name: { en: "Bitcoin implied volatility (DVOL)", vi: "Biến động kỳ vọng Bitcoin (DVOL)" },
    short: "DVOL",
    unit: "",
    digits: 1,
    polarity: "up-bad",
    delta: "pct",
    explain: { en: "Deribit's 30-day implied volatility of BTC options: the VIX of bitcoin.", vi: "Biến động kỳ vọng 30 ngày từ quyền chọn BTC trên Deribit: \"VIX\" của bitcoin." },
  }),
  stables: s({
    id: "llama:stablecoins",
    name: { en: "Stablecoin supply", vi: "Tổng cung stablecoin" },
    short: "Stables",
    unit: "$B",
    digits: 0,
    polarity: "up-good",
    delta: "pct",
    explain: { en: "Dollars parked on-chain (DefiLlama). Growing supply = fresh liquidity ready to buy crypto.", vi: "Lượng đô la nằm sẵn trên chuỗi (DefiLlama). Cung tăng = thanh khoản mới sẵn sàng mua crypto." },
  }),
  usdtvnd: s({
    id: "binance:USDTVND",
    name: { en: "USDT/VND (Binance P2P)", vi: "USDT/VND (Binance P2P)" },
    short: "USDT/VND",
    unit: "₫",
    digits: 0,
    polarity: "neutral",
    delta: "pct",
    price: true,
    explain: {
      en: "Price Vietnamese users pay for a dollar stablecoin. The gap over the bank rate shows crypto demand and capital-flow pressure.",
      vi: "Giá người Việt trả để mua một đồng đô la stablecoin. Chênh lệch so với giá ngân hàng cho thấy nhu cầu crypto và áp lực dòng vốn.",
    },
  }),
  // World macro page, US detail of each theme panel (MACRO_US below)
  wei: s({
    id: "fred:WEI",
    name: { en: "Weekly Economic Index (NY Fed)", vi: "Chỉ số kinh tế tuần (Fed New York)" },
    short: "WEI",
    unit: "%",
    digits: 2,
    polarity: "up-good",
    delta: "abs",
    deltaUnit: "pp",
    freq: "w",
    threshold: { dir: "below", warn: 1, crit: 0 },
    explain: {
      en: "Ten weekly indicators (jobless claims, fuel sales, rail traffic, tax withholding…) scaled to GDP growth vs a year earlier: the fastest read on the US economy.",
      vi: "Mười chỉ số tuần (đơn trợ cấp thất nghiệp, doanh số nhiên liệu, vận tải đường sắt, thuế khấu trừ…) quy về tăng trưởng GDP so cùng kỳ: cách đọc nhanh nhất nền kinh tế Mỹ.",
    },
  }),
  cfnai: s({
    id: "fred:CFNAI",
    name: { en: "Chicago Fed National Activity Index", vi: "Chỉ số hoạt động kinh tế (Fed Chicago)" },
    short: "CFNAI",
    unit: "",
    digits: 2,
    polarity: "up-good",
    delta: "abs",
    freq: "m",
    threshold: { dir: "below", warn: -0.35, crit: -0.7 },
    explain: {
      en: "85 monthly indicators in one number. 0 = growing at trend; a 3-month average below −0.7 has marked the start of recessions.",
      vi: "85 chỉ số tháng gộp làm một. 0 = tăng trưởng đúng xu hướng; trung bình 3 tháng dưới −0,7 thường đánh dấu lúc suy thoái bắt đầu.",
    },
  }),
  indpro: s({
    id: "fred:INDPRO",
    name: { en: "US industrial production (y/y)", vi: "Sản xuất công nghiệp Mỹ (so cùng kỳ)" },
    short: "Ind. prod.",
    unit: "%",
    digits: 1,
    polarity: "up-good",
    delta: "abs",
    deltaUnit: "pp",
    freq: "m",
    transform: "yoy",
    threshold: { dir: "below", warn: 0, crit: -3 },
    explain: {
      en: "Output of factories, mines and utilities vs a year earlier. Below zero = industry is shrinking.",
      vi: "Sản lượng nhà máy, khai khoáng và điện nước so với cùng kỳ. Dưới 0 = công nghiệp đang co lại.",
    },
  }),
  retail: s({
    id: "fred:RSAFS",
    name: { en: "US retail sales (y/y)", vi: "Doanh số bán lẻ Mỹ (so cùng kỳ)" },
    short: "Retail",
    unit: "%",
    digits: 1,
    polarity: "up-good",
    delta: "abs",
    deltaUnit: "pp",
    freq: "m",
    transform: "yoy",
    threshold: { dir: "below", warn: 2, crit: 0 },
    explain: {
      en: "Shop and restaurant sales vs a year earlier, in dollars (not adjusted for prices): growth below CPI inflation means people are buying less.",
      vi: "Doanh số cửa hàng và nhà hàng so với cùng kỳ, tính bằng tiền (chưa trừ giá): tăng chậm hơn CPI nghĩa là người dân đang mua ít đi.",
    },
  }),
  coreCpi: s({
    id: "fred:CPILFESL",
    name: { en: "US core CPI (y/y)", vi: "CPI lõi Mỹ (so cùng kỳ)" },
    short: "Core CPI",
    unit: "%",
    digits: 1,
    polarity: "up-bad",
    delta: "abs",
    deltaUnit: "pp",
    freq: "m",
    transform: "yoy",
    threshold: { dir: "above", warn: 3, crit: 4 },
    explain: {
      en: "Consumer prices without food and energy: the sticky part central banks worry about.",
      vi: "Giá tiêu dùng trừ lương thực và năng lượng: phần lạm phát dai dẳng mà NHTW lo ngại.",
    },
  }),
  corePce: s({
    id: "fred:PCEPILFE",
    name: { en: "US core PCE (y/y)", vi: "PCE lõi Mỹ (so cùng kỳ)" },
    short: "Core PCE",
    unit: "%",
    digits: 1,
    polarity: "up-bad",
    delta: "abs",
    deltaUnit: "pp",
    freq: "m",
    transform: "yoy",
    threshold: { dir: "above", warn: 2.75, crit: 3.5 },
    explain: {
      en: "The Fed's preferred inflation gauge; its 2% target is set in PCE terms.",
      vi: "Thước đo lạm phát Fed ưa dùng; mục tiêu 2% của Fed tính theo PCE.",
    },
  }),
  food: s({
    id: "fred:PFOODINDEXM",
    name: { en: "IMF food price index", vi: "Chỉ số giá lương thực IMF" },
    short: "Food",
    unit: "",
    digits: 0,
    polarity: "up-bad",
    delta: "pct",
    freq: "m",
    explain: {
      en: "World prices of grains, oils, meat, seafood and sugar (2016 = 100). Food is a big share of spending in emerging economies.",
      vi: "Giá thế giới của ngũ cốc, dầu ăn, thịt, thuỷ sản và đường (2016 = 100). Lương thực chiếm phần lớn chi tiêu ở các nước mới nổi.",
    },
  }),
  netLiq: s({
    id: "calc:NETLIQ_US",
    name: { en: "US net liquidity (Fed − RRP − TGA)", vi: "Thanh khoản ròng Mỹ (Fed − RRP − TGA)" },
    short: "Net liq.",
    unit: "$B",
    digits: 0,
    polarity: "up-good",
    delta: "pct",
    freq: "w",
    explain: {
      en: "Fed balance sheet minus cash parked at the Fed's reverse repo and in the Treasury's account: the dollars actually left in markets. Risk assets have tracked it closely since 2020.",
      vi: "Bảng cân đối Fed trừ tiền gửi qua kênh reverse repo và tài khoản Kho bạc tại Fed: lượng USD thực sự còn trong thị trường. Tài sản rủi ro bám khá sát chỉ số này từ 2020.",
    },
  }),
  softwareJobs: s({
    id: "fred:IHLIDXUSTPSOFTDEVE",
    name: { en: "US software developer job postings (Indeed)", vi: "Tin tuyển lập trình viên ở Mỹ (Indeed)" },
    short: "Dev jobs",
    unit: "",
    digits: 1,
    polarity: "up-good",
    delta: "pct",
    explain: {
      en: "Indeed's index of software development postings, 1 Feb 2020 = 100 (7-day average). It peaked near 230 in 2022 and has sat below its pre-pandemic level since 2023, well under postings overall (FRED IHLIDXUS).",
      vi: "Chỉ số tin tuyển dụng phát triển phần mềm của Indeed, 1/2/2020 = 100 (bình quân 7 ngày). Đỉnh gần 230 năm 2022 và nằm dưới mức trước dịch từ 2023, thấp hơn hẳn tin tuyển dụng nói chung (FRED IHLIDXUS).",
    },
  }),
  chipOutput: s({
    id: "fred:IPG3344S",
    name: { en: "US semiconductor output (y/y)", vi: "Sản lượng bán dẫn Mỹ (so cùng kỳ)" },
    short: "Chip output",
    unit: "%",
    digits: 1,
    polarity: "up-good",
    delta: "abs",
    deltaUnit: "pp",
    freq: "m",
    transform: "yoy",
    explain: {
      en: "Federal Reserve industrial production index for semiconductors and electronic components, against a year earlier: the physical side of the chip cycle in the US.",
      vi: "Chỉ số sản xuất công nghiệp của Fed cho bán dẫn và linh kiện điện tử, so với cùng kỳ năm trước: phần sản xuất thật của chu kỳ chip ở Mỹ.",
    },
  }),
  hnHiring: s({
    id: "hn:WHOISHIRING",
    name: { en: "Hacker News “Who is hiring?” posts", vi: "Tin tuyển trên Hacker News “Who is hiring?”" },
    short: "HN hiring",
    unit: "",
    digits: 0,
    polarity: "up-good",
    delta: "pct",
    freq: "m",
    explain: {
      en: "Job posts in the monthly Hacker News thread, mostly startups and small tech firms. The current month keeps growing for a few weeks after the thread opens on the first weekday.",
      vi: "Số tin tuyển trong chủ đề hằng tháng trên Hacker News, phần lớn là startup và công ty công nghệ nhỏ. Tháng hiện tại còn tăng vài tuần sau khi chủ đề mở vào ngày làm việc đầu tháng.",
    },
  }),
  fedPriced: s({
    id: "calc:FEDPRICED_US",
    name: { en: "Fed priced, next 12 months", vi: "Fed được định giá 12 tháng tới" },
    short: "Fed priced",
    unit: "bp",
    digits: 0,
    polarity: "neutral",
    delta: "abs",
    explain: {
      en: "The 1-year Treasury yield minus the effective fed funds rate, in basis points: roughly how far the market expects the Fed's rate to average below (negative) or above today's over the next 12 months. −50 bp is about two 25 bp cuts' worth on average; cuts spread through the year mean a lower end point. Treasury bills trade slightly off the expected policy rate, so read the direction and the change, not the exact count.",
      vi: "Lợi suất trái phiếu Kho bạc 1 năm trừ lãi suất Fed hiệu dụng, tính bằng điểm cơ bản: thị trường kỳ vọng lãi suất của Fed trong 12 tháng tới, tính bình quân, thấp hơn (âm) hay cao hơn hôm nay bao nhiêu. −50 bp tương đương khoảng hai lần cắt 25 bp tính bình quân; nếu cắt rải trong năm thì mức cuối kỳ còn thấp hơn. Tín phiếu Kho bạc thường lệch nhẹ so với lãi suất điều hành kỳ vọng, nên nên đọc chiều và mức thay đổi hơn là con số chính xác.",
    },
  }),
  nfci: s({
    id: "fred:NFCI",
    name: { en: "US financial conditions (NFCI)", vi: "Điều kiện tài chính Mỹ (NFCI)" },
    short: "NFCI",
    unit: "",
    digits: 2,
    polarity: "up-bad",
    delta: "abs",
    freq: "w",
    threshold: { dir: "above", warn: 0, crit: 0.5 },
    explain: {
      en: "Chicago Fed index of 105 measures of money markets, debt, equity and banking. 0 = average; above 0 = tighter than usual, below = looser.",
      vi: "Chỉ số của Fed Chicago gộp 105 thước đo thị trường tiền tệ, nợ, cổ phiếu và ngân hàng. 0 = trung bình; trên 0 = thắt hơn bình thường, dưới 0 = nới hơn.",
    },
  }),
  realYield: s({
    id: "fred:DFII10",
    name: { en: "US 10-year real yield (TIPS)", vi: "Lợi suất thực 10 năm Mỹ (TIPS)" },
    short: "Real 10Y",
    unit: "%",
    digits: 2,
    polarity: "neutral",
    delta: "abs",
    threshold: { dir: "above", warn: 2, crit: 2.5 },
    explain: {
      en: "The 10-year yield after expected inflation. Above 2% has been rare since 2008 and weighs on gold, tech stocks and housing.",
      vi: "Lợi suất 10 năm sau khi trừ lạm phát kỳ vọng. Trên 2% là hiếm kể từ 2008 và gây sức ép lên vàng, cổ phiếu công nghệ và nhà đất.",
    },
  }),
  payrolls: s({
    id: "fred:PAYEMS",
    name: { en: "US nonfarm payrolls (monthly change)", vi: "Việc làm phi nông nghiệp Mỹ (tăng trong tháng)" },
    short: "Payrolls",
    unit: "K",
    digits: 0,
    polarity: "up-good",
    delta: "abs",
    freq: "m",
    transform: "diff",
    scale: 1000,
    threshold: { dir: "below", warn: 50_000, crit: 0 },
    explain: {
      en: "Jobs added in the month (first Friday). Around 100K a month keeps unemployment steady; below zero, the economy is shedding jobs.",
      vi: "Số việc làm tăng thêm trong tháng (công bố thứ Sáu đầu tháng). Khoảng 100 nghìn mỗi tháng giữ thất nghiệp ổn định; dưới 0 là kinh tế đang cắt việc làm.",
    },
  }),
  unrate: s({
    id: "fred:UNRATE",
    name: { en: "US unemployment rate", vi: "Tỷ lệ thất nghiệp Mỹ" },
    short: "Unemp.",
    unit: "%",
    digits: 1,
    polarity: "up-bad",
    delta: "abs",
    deltaUnit: "pp",
    freq: "m",
    explain: {
      en: "Share of the labour force looking for work. The rise from its low matters more than the level (see the Sahm rule).",
      vi: "Tỷ lệ người trong lực lượng lao động đang tìm việc. Mức tăng so với đáy quan trọng hơn bản thân con số (xem quy tắc Sahm).",
    },
  }),
  umcsent: s({
    id: "fred:UMCSENT",
    name: { en: "Consumer sentiment (UMich)", vi: "Niềm tin tiêu dùng (ĐH Michigan)" },
    short: "UMich",
    unit: "",
    digits: 1,
    polarity: "up-good",
    delta: "abs",
    freq: "m",
    explain: {
      en: "Survey of how US households feel about their finances and the economy (1966 = 100). Its record low, 50, came in June 2022.",
      vi: "Khảo sát cảm nhận của hộ gia đình Mỹ về tài chính và nền kinh tế (1966 = 100). Đáy kỷ lục 50 điểm vào tháng 6/2022.",
    },
  }),
  usDebt: s({
    id: "fred:GFDEGDQ188S",
    name: { en: "US federal debt (% of GDP)", vi: "Nợ liên bang Mỹ (% GDP)" },
    short: "US debt",
    unit: "%",
    digits: 0,
    polarity: "up-bad",
    delta: "abs",
    deltaUnit: "pp",
    freq: "q",
    explain: {
      en: "Total public debt of the federal government as a share of GDP. It was about 60% before 2008.",
      vi: "Tổng nợ công của chính phủ liên bang so với GDP. Trước 2008 khoảng 60%.",
    },
  }),
  interest: s({
    id: "fred:A091RC1Q027SBEA",
    name: { en: "US federal interest payments (annualized)", vi: "Chi trả lãi của chính phủ Mỹ (quy năm)" },
    short: "Interest",
    unit: "$B",
    digits: 0,
    polarity: "up-bad",
    delta: "pct",
    freq: "q",
    explain: {
      en: "What Washington pays a year in interest on its debt. Since 2024 it has been larger than the defence budget.",
      vi: "Số tiền lãi chính phủ Mỹ trả mỗi năm cho khoản nợ của mình. Từ 2024 đã lớn hơn ngân sách quốc phòng.",
    },
  }),
  ig: s({
    id: "fred:BAMLC0A0CM",
    name: { en: "Investment-grade credit spread", vi: "Chênh lệch tín dụng hạng đầu tư" },
    short: "IG OAS",
    unit: "%",
    digits: 2,
    polarity: "up-bad",
    delta: "abs",
    threshold: { dir: "above", warn: 1.5, crit: 2 },
    explain: {
      en: "Extra yield safe US companies pay over Treasuries. It peaked near 4% in 2020 and above 6% in 2008.",
      vi: "Phần lợi suất các doanh nghiệp Mỹ an toàn trả thêm so với trái phiếu chính phủ. Đỉnh gần 4% năm 2020 và trên 6% năm 2008.",
    },
  }),
  emSpread: s({
    id: "fred:BAMLEMCBPIOAS",
    name: { en: "Emerging-market corporate spread", vi: "Chênh lệch tín dụng DN thị trường mới nổi" },
    short: "EM OAS",
    unit: "%",
    digits: 2,
    polarity: "up-bad",
    delta: "abs",
    threshold: { dir: "above", warn: 3.5, crit: 5 },
    explain: {
      en: "Extra yield emerging-market companies pay on dollar bonds. Widens when the dollar and US rates squeeze them.",
      vi: "Phần lợi suất doanh nghiệp ở các nước mới nổi trả thêm trên trái phiếu bằng USD. Giãn ra khi USD và lãi suất Mỹ gây sức ép.",
    },
  }),
  chauvet: s({
    id: "fred:RECPROUSM156N",
    name: { en: "Recession probability (Chauvet–Piger)", vi: "Xác suất suy thoái (Chauvet–Piger)" },
    short: "Chauvet–Piger",
    unit: "%",
    digits: 1,
    polarity: "up-bad",
    delta: "abs",
    deltaUnit: "pp",
    freq: "m",
    threshold: { dir: "above", warn: 20, crit: 50 },
    explain: {
      en: "Probability that the US is in recession now, from payrolls, industrial production, income and sales. Published with a two-month lag.",
      vi: "Xác suất Mỹ đang ở trong suy thoái, tính từ việc làm, sản xuất công nghiệp, thu nhập và doanh số. Công bố trễ hai tháng.",
    },
  }),
  t10y3m: s({
    id: "fred:T10Y3M",
    name: { en: "Yield curve 10Y − 3M", vi: "Đường cong lợi suất 10 năm − 3 tháng" },
    short: "10Y−3M",
    unit: "pp",
    digits: 2,
    polarity: "neutral",
    delta: "abs",
    threshold: { dir: "below", warn: 0, crit: -0.5 },
    explain: {
      en: "The spread the NY Fed recession model uses. Inverted (below zero) for months before each recession since 1968.",
      vi: "Chênh lệch mà mô hình suy thoái của Fed New York dùng. Đảo ngược (dưới 0) nhiều tháng trước mỗi cuộc suy thoái từ 1968.",
    },
  }),

  // Vietnam page (VIETNAM_MARKETS, VIETNAM_ECONOMY below)
  vcbUsd: s({
    id: "vcb:USD:sell",
    name: { en: "USD at Vietcombank (sell)", vi: "USD tại Vietcombank (bán ra)" },
    short: "VCB USD",
    unit: "₫",
    digits: 0,
    polarity: "up-bad",
    delta: "pct",
    explain: {
      en: "What a bank charges for a dollar, kept within the State Bank's band around its central rate. The gap to the market rate shows dollar scarcity at home.",
      vi: "Giá ngân hàng bán một đô la, nằm trong biên độ quanh tỷ giá trung tâm của NHNN. Chênh lệch với giá thị trường cho thấy USD trong nước khan hay dư.",
    },
  }),
  sjcGold: s({
    id: "goldvn:SJL1L10:sell",
    name: { en: "SJC gold bar, sell (million ₫/tael)", vi: "Vàng miếng SJC, bán ra (triệu ₫/lượng)" },
    short: "SJC",
    unit: "",
    digits: 1,
    scale: 1e-6,
    polarity: "neutral",
    delta: "pct",
    price: true,
    explain: {
      en: "Domestic gold bars, sold well above the world price because imports are controlled; the premium widens when people hoard.",
      vi: "Vàng miếng trong nước, bán cao hơn giá thế giới vì nhập khẩu bị kiểm soát; chênh lệch nới rộng khi người dân tích trữ.",
    },
  }),
  vnGdp: s({
    id: "wb:GDP:VNM",
    name: { en: "Vietnam GDP growth (y/y)", vi: "Tăng trưởng GDP Việt Nam (so cùng kỳ)" },
    short: "VN GDP",
    unit: "%",
    digits: 1,
    polarity: "up-good",
    delta: "abs",
    deltaUnit: "pp",
    freq: "q",
    // Same rule as the macro scorecard: below 0 contracts, 1.5 pp under the 2015–19 average (about 6.8%) is weak.
    threshold: { dir: "below", warn: 5.3, crit: 0 },
    explain: {
      en: "Real GDP vs the same quarter a year earlier (World Bank, from the General Statistics Office; about a quarter behind the official release).",
      vi: "GDP thực so với cùng quý năm trước (World Bank, theo số của Tổng cục Thống kê; chậm khoảng một quý so với số công bố chính thức).",
    },
  }),
  vnCpi: s({
    id: "imf:CPI_M:VNM",
    name: { en: "Vietnam CPI inflation (y/y)", vi: "Lạm phát CPI Việt Nam (so cùng kỳ)" },
    short: "VN CPI",
    unit: "%",
    digits: 1,
    polarity: "up-bad",
    delta: "abs",
    deltaUnit: "pp",
    freq: "m",
    threshold: { dir: "above", warn: 4.5, crit: 6 },
    explain: {
      en: "Consumer prices vs a year earlier (IMF, from the General Statistics Office). The National Assembly's target is about 4.5%.",
      vi: "Giá tiêu dùng so với cùng kỳ năm trước (IMF, theo số của Tổng cục Thống kê). Mục tiêu Quốc hội đặt ra khoảng 4,5%.",
    },
  }),
  vnIbOn: s({
    id: "sbv:IB_ON",
    name: { en: "Interbank overnight rate (VND)", vi: "Lãi suất liên ngân hàng qua đêm (VND)" },
    short: "VN O/N",
    unit: "%",
    digits: 2,
    polarity: "neutral",
    delta: "abs",
    threshold: { dir: "above", warn: 6, crit: 10 },
    explain: {
      en: "Average rate banks charge each other overnight in dong, published daily by the State Bank: the system's liquidity gauge. It jumped above 10% in the squeezes of late 2022 and 2024.",
      vi: "Lãi suất bình quân các ngân hàng cho nhau vay qua đêm bằng VND, NHNN công bố hằng ngày: thước đo thanh khoản của hệ thống. Từng vọt lên trên 10% trong các đợt căng thẳng cuối 2022 và 2024.",
    },
  }),
  vnRefi: s({
    id: "sbv:REFI",
    name: { en: "SBV refinancing rate", vi: "Lãi suất tái cấp vốn NHNN" },
    short: "SBV",
    unit: "%",
    digits: 2,
    polarity: "neutral",
    delta: "abs",
    explain: {
      en: "The State Bank's policy rate: what it charges banks for refinancing loans. Declared by hand from the SBV's decisions (BIS publishes no Vietnamese rate).",
      vi: "Lãi suất điều hành của NHNN: mức NHNN cho ngân hàng vay tái cấp vốn. Khai báo tay theo quyết định của NHNN (BIS không công bố lãi suất của Việt Nam).",
    },
  }),
} as const satisfies Record<string, SeriesDef>;

export type SeriesKey = keyof typeof SERIES;

/** Market tiles of the Vietnam page: stocks, the dollar at three prices (market, bank, crypto), gold. */
export const VIETNAM_MARKETS: SeriesKey[] = ["vnindex", "vn30", "hnx", "upcom", "usdvnd", "vcbUsd", "usdtvnd", "sjcGold"];

/** Economy tiles of the Vietnam page: growth, prices, policy rate. */
export const VIETNAM_ECONOMY: SeriesKey[] = ["vnGdp", "vnCpi", "vnRefi", "vnIbOn"];

/** The 12 tiles, in reading order: equities, rates, dollar, fear, commodities, crypto, Vietnam. */
export const VITAL_SIGNS: SeriesKey[] = ["spx", "ndx", "us10y", "curve", "dxy", "vix", "brent", "gold", "copper", "btc", "vnindex", "usdvnd"];

/** Tiles of the crypto page, in reading order: majors, market size, sentiment and liquidity, Vietnam. */
export const CRYPTO_SIGNS: SeriesKey[] = ["btc", "eth", "sol", "cryptoMcap", "btcDom", "dvol", "stables", "usdtvnd"];

/** Daily BTC perpetual history the binance source keeps as series (Binance only serves the last 30 days of open interest and ratios). */
export const BTC_HISTORY = { oi: "binance:OI:BTC", lsr: "binance:LSR:BTC", funding: "binance:FUNDAPR:BTC" } as const;

/** US spot bitcoin ETF daily net flows, $M (etfflows source): the total and the largest funds by name. */
export const BTC_ETF = { total: "etf:BTC:TOTAL", prefix: "etf:BTC:", funds: ["IBIT", "FBTC", "GBTC", "ARKB", "BITB"] } as const;

/** Every series the crypto page owns (its tiles plus the Fear & Greed card). */
export const CRYPTO_KEYS: SeriesKey[] = [...CRYPTO_SIGNS, "fng"];

/** Hiring and output tiles of the technology page. */
export const TECH_JOBS: SeriesKey[] = ["softwareJobs", "chipOutput", "hnHiring"];

/** Index tiles of the technology page: the broad tech market and the chip cycle. */
export const TECH_SIGNS: SeriesKey[] = ["ndx", "sox"];

/** Top row of the world-macro page: growth, prices, dollar, liquidity, supply chains, recession risk, uncertainty. */
export const WORLD_PULSE: SeriesKey[] = ["worldGdp", "worldCpi", "commodities", "gscpi", "usdBroad", "globalLiq", "recProb", "gepu"];

/** US tiles of the macro page's theme panels: the country whose data is deepest and moves the world. */
export const MACRO_US = {
  growth: ["gdpnow", "wei", "cfnai", "indpro", "retail"],
  inflation: ["cpi", "coreCpi", "corePce", "breakeven", "food"],
  money: ["fedfunds", "fedPriced", "netLiq", "nfci", "realYield"],
  jobs: ["payrolls", "unrate", "claims", "umcsent"],
  debt: ["usDebt", "interest", "ig", "hy", "emSpread"],
} as const satisfies Record<string, readonly SeriesKey[]>;

/** Yahoo symbols to pull quotes + history for: every Yahoo series, the macro page's currency pairs, the overview's world indices, commodities and asset classes, the tech page's stocks. */
export const YAHOO_SYMBOLS = [
  ...new Set([
    ...Object.values(SERIES)
      .map((d) => d.id)
      .filter((id) => id.startsWith("yahoo:"))
      .map((id) => id.slice("yahoo:".length)),
    ...FX_SYMBOLS,
    ...WORLD_INDEX_SYMBOLS,
    ...MARKET_EXTRA_SYMBOLS,
    ...TECH_SYMBOLS,
    ...Object.values(TECH_FX),
  ]),
];

/**
 * FRED inputs of the derived series (lib/signals/macro.ts): ECB and BoJ balance sheets, their exchange rates,
 * the 10Y−3M spread, the reverse repo and Treasury account that net liquidity subtracts, and the daily
 * effective fed funds rate the 1-year yield is read against (Fed path priced).
 */
export const FRED_CALC_CODES = ["ECBASSETSW", "JPNASSETS", "DEXUSEU", "DEXJPUS", "T10Y3M", "RRPONTSYD", "WTREGEN", "DFF"];

/**
 * Long-history inputs of the risk regime (LLDD 06) that no tile shows: the VIX and S&P 500 closes back ten
 * years (Yahoo keeps about one), and Moody's Baa spread as the credit gauge, because FRED serves ICE BofA's
 * high-yield spread for the last three years only.
 */
export const REGIME_IDS = { vixHistory: "fred:VIXCLS", spxHistory: "fred:SP500", credit: "fred:BAA10Y" } as const;

/** FRED codes kept for ten years rather than three: the regime measures each gauge against a decade. */
export const FRED_LONG_CODES = ["VIXCLS", "SP500", "BAA10Y", "T10Y2Y", "STLFSI4"];

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
  ...FRED_CALC_CODES,
  ...FRED_LONG_CODES,
  // all-industry postings, the yardstick for software postings (tech page)
  "IHLIDXUS",
  // US CPI by group (macro page, inflation panel)
  ...US_CPI_PARTS.map((p) => p.code),
];
