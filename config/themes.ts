import type { Bi } from "@/lib/i18n";
import type { SeriesDef, SeriesKey } from "@/config/series";
import { VN_FOREIGN, VN_GB10Y } from "@/config/vietnam";

// The overview's "Dominant themes" (TODO P1, LLDD 04 §3, LLDD 05 §3d): the few
// stories that drive markets right now, each tied to the numbers that tell
// whether it is heating up or cooling, the headlines and prediction markets
// about it, and the channel through which it reaches Vietnam. Hand-picked and
// meant to be edited as the world changes: add, drop or reorder entries here.
// The panel keeps this order, so each theme stays where the reader expects it.

export type ThemeId = "energy" | "fed" | "ai" | "vnCapital";

export interface ThemeGauge {
  /** A SERIES key, or the definition of a series no tile shows. */
  series: SeriesKey | SeriesDef;
  /** +1: a rise heats the theme up; −1: a fall does. */
  sign: 1 | -1;
  /** Short name for the card (the series name is the tooltip). */
  label: Bi;
  /**
   * Read a daily flow as its sum over this many sessions (foreign net buying), judged by how that sum compares
   * with its own history, instead of by its change over a month.
   */
  sumSessions?: number;
}

/** Readings computed in lib/data/themes.ts that are not a plain series. */
export type ThemeFactId = "fxCeiling" | "tsmcRevenue" | "hormuz";

export interface ThemeNews {
  /** Matched against the English title (the original or the AI translation). */
  en: RegExp;
  /** Matched against a Vietnamese original that has no English translation yet (AI off or behind). */
  vi?: RegExp;
  /** Keep only articles the AI tagged with one of these regions. */
  regions?: string[];
  /** Also read the tech desk's outlets (the crypto desk's never count). */
  tech?: boolean;
}

export interface ThemeDef {
  id: ThemeId;
  name: Bi;
  /** What "heating up" means for this theme: the status chip's tooltip. */
  heat: Bi;
  /** Their moves over about a month set the status; at least two should have a long history. */
  gauges: ThemeGauge[];
  facts?: ThemeFactId[];
  /** How the theme reaches Vietnam; its readings are shown but do not set the status. */
  vietnam?: { text: Bi; gauges: ThemeGauge[]; facts?: ThemeFactId[] };
  news: ThemeNews;
  /** Polymarket events whose title matches. */
  markets?: RegExp;
}

const priceDef = (id: string, name: Bi, short: string, explain: Bi, unit: SeriesDef["unit"] = "", digits = 2): SeriesDef => ({
  id,
  name,
  short,
  unit,
  digits,
  polarity: "neutral",
  delta: "pct",
  price: true,
  explain,
});

const TTF = priceDef(
  "yahoo:TTF=F",
  { en: "European gas (TTF)", vi: "Khí châu Âu (TTF)" },
  "TTF",
  { en: "Europe's benchmark natural-gas price, €/MWh.", vi: "Giá khí đốt chuẩn của châu Âu, €/MWh." },
);

const US_CPI_ENERGY: SeriesDef = {
  id: "fred:CPIENGSL",
  name: { en: "US energy CPI (y/y)", vi: "CPI năng lượng Mỹ (so cùng kỳ)" },
  short: "CPI energy",
  unit: "%",
  digits: 1,
  polarity: "up-bad",
  delta: "abs",
  deltaUnit: "pp",
  freq: "m",
  transform: "yoy",
  explain: { en: "What US households pay for fuel and power, vs a year earlier.", vi: "Giá xăng, điện, khí hộ gia đình Mỹ trả, so với một năm trước." },
};

/** Petrolimex E10 RON 95-III, zone 1 (most of the country), VND per litre; one point a day from 2026-11-10. */
const RON95: SeriesDef = {
  id: "petrolimex:85176bf8a6dd45d597c6980f7a674316:z1",
  name: { en: "Petrol RON 95 (Petrolimex)", vi: "Xăng RON 95 (Petrolimex)" },
  short: "RON 95",
  unit: "₫",
  digits: 0,
  polarity: "up-bad",
  delta: "pct",
  explain: { en: "Retail price per litre, set at the weekly adjustment.", vi: "Giá bán lẻ mỗi lít, đổi theo kỳ điều hành hằng tuần." },
};

const NVDA = priceDef("yahoo:NVDA", { en: "Nvidia", vi: "Nvidia" }, "NVDA", { en: "The AI chip leader's share price, $.", vi: "Giá cổ phiếu hãng chip AI dẫn đầu, $." }, "$");
const TSM = priceDef("yahoo:TSM", { en: "TSMC (ADR)", vi: "TSMC (ADR)" }, "TSM", { en: "The chipmaker that builds most AI processors, $ per ADR.", vi: "Hãng đúc chip làm phần lớn chip AI, $ mỗi ADR." }, "$");
const FPT = priceDef("yahoo:FPT.VN", { en: "FPT", vi: "FPT" }, "FPT", { en: "Vietnam's largest IT services group, ₫.", vi: "Tập đoàn dịch vụ CNTT lớn nhất Việt Nam, ₫." }, "₫", 0);

/** Vietnam's 10-year government bond yield (lib/sources/ibrate.ts); history from 2026-10-15 only, so shown, never a gauge. */
const VN_10Y: SeriesDef = {
  id: VN_GB10Y,
  name: { en: "Vietnam 10-year government bond yield", vi: "Lợi suất trái phiếu chính phủ 10 năm" },
  short: "VN10Y",
  unit: "%",
  digits: 2,
  polarity: "neutral",
  delta: "abs",
  explain: {
    en: "Yield on Vietnam's 10-year government bond on the secondary market: what long-term borrowing costs in dong.",
    vi: "Lợi suất trái phiếu chính phủ kỳ hạn 10 năm trên thị trường thứ cấp: chi phí vay dài hạn bằng VND.",
  },
};

const FOREIGN_NET: SeriesDef = {
  id: VN_FOREIGN.net,
  name: { en: "Foreign net buying, 20 sessions (HOSE)", vi: "Khối ngoại mua ròng 20 phiên (HOSE)" },
  short: "Foreign net",
  unit: "₫",
  digits: 0,
  polarity: "up-good",
  delta: "abs",
  explain: { en: "Foreign investors' buying minus selling on HOSE over the last 20 sessions.", vi: "Giá trị khối ngoại mua trừ bán trên HOSE trong 20 phiên gần nhất." },
};

export const THEMES: ThemeDef[] = [
  {
    id: "energy",
    name: { en: "Gulf energy", vi: "Năng lượng vùng Vịnh" },
    heat: {
      en: "Heating up: oil, gas and inflation expectations rising faster than usual for a month.",
      vi: "Nóng lên: dầu, khí và kỳ vọng lạm phát tăng nhanh hơn bình thường trong một tháng.",
    },
    gauges: [
      { series: "brent", sign: 1, label: { en: "Brent crude", vi: "Dầu Brent" } },
      { series: TTF, sign: 1, label: { en: "EU gas (TTF)", vi: "Khí châu Âu (TTF)" } },
      { series: US_CPI_ENERGY, sign: 1, label: { en: "US energy CPI y/y", vi: "CPI năng lượng Mỹ" } },
      { series: "breakeven", sign: 1, label: { en: "5y5y inflation exp.", vi: "Kỳ vọng lạm phát 5y5y" } },
    ],
    // Ships through Hormuz (IMF PortWatch): shown, not a gauge, since a near-shut strait barely moves month to month.
    facts: ["hormuz"],
    vietnam: {
      text: {
        en: "Pump prices follow world prices at the weekly adjustment, and energy is Vietnam's main imported inflation.",
        vi: "Giá xăng trong nước theo giá thế giới ở kỳ điều hành hằng tuần; năng lượng là kênh lạm phát nhập khẩu chính.",
      },
      gauges: [
        { series: RON95, sign: 1, label: { en: "RON 95 petrol", vi: "Xăng RON 95" } },
        { series: "vnCpi", sign: 1, label: { en: "Vietnam CPI y/y", vi: "CPI Việt Nam" } },
      ],
    },
    news: {
      // Iran only with the war, its talks or the blockade: a plot or hack blamed on Iran is not an energy story.
      en: /\b(oil|crude|brent|wti|opec\+?|lng|natural gas|gas prices?|hormuz|persian gulf|red sea|tankers?|refiner(y|ies)|petrol|gasoline|diesel|fuel prices?|energy (prices?|crisis|shock|supply|security))\b|\biran(ian)?\b.*\b(war|ceasefire|blockade|talks|truce|peace|deal|diplomacy|sanctions)\b|\b(war|ceasefire|blockade|talks|truce|peace|deal|diplomacy|sanctions) (with|on|against|in|over) iran\b/i,
      vi: /(dầu|xăng|khí đốt|LNG|OPEC|Hormuz|Iran|năng lượng)/i,
    },
    markets: /\b(iran(ian)?|hormuz|oil|crude|opec|blockade|saudi)\b/i,
  },
  {
    id: "fed",
    name: { en: "US inflation and the Fed", vi: "Lạm phát Mỹ và Fed" },
    heat: {
      en: "Heating up: inflation, the rate hikes markets price in, real yields and the dollar rising faster than usual.",
      vi: "Nóng lên: lạm phát, mức tăng lãi suất thị trường định giá, lợi suất thực và đồng đô la tăng nhanh hơn bình thường.",
    },
    gauges: [
      { series: "coreCpi", sign: 1, label: { en: "US core CPI y/y", vi: "CPI lõi Mỹ" } },
      { series: "fedPriced", sign: 1, label: { en: "Fed priced, 12 mo", vi: "Fed định giá 12 tháng" } },
      { series: "realYield", sign: 1, label: { en: "10Y real yield", vi: "Lợi suất thực 10 năm" } },
      { series: "dxy", sign: 1, label: { en: "Dollar index", vi: "Chỉ số USD" } },
    ],
    // USD/VND and its distance to the ceiling belong to the "Foreign money and the dong" card; shown once.
    vietnam: {
      text: {
        en: "Higher US rates and a strong dollar make it harder for the State Bank to cut: dong rates stay up (the exchange rate is in \"Foreign money and the dong\").",
        vi: "Lãi suất Mỹ cao và đô la mạnh khiến NHNN khó hạ lãi suất, lãi suất VND khó giảm (tỷ giá xem ở thẻ \"Vốn ngoại và tỷ giá\").",
      },
      gauges: [
        { series: "vnIbOn", sign: 1, label: { en: "VND overnight", vi: "Liên ngân hàng qua đêm" } },
        { series: VN_10Y, sign: 1, label: { en: "VN 10Y bond", vi: "Trái phiếu CP 10 năm" } },
      ],
    },
    news: {
      en: /\b(fed|federal reserve|powell|fomc|inflation|cpi|pce|interest rates?|rate (hike|cut|rise)s?|treasur(y|ies)|bond yields?|payrolls|jobs report)\b/i,
      vi: /(Fed|Cục Dự trữ Liên bang|lạm phát Mỹ|lãi suất Mỹ|Powell)/i,
      regions: ["americas", "global"],
    },
    markets: /\b(fed|fomc|powell|rate (hike|cut)s?|inflation|cpi|recession)\b/i,
  },
  {
    id: "ai",
    name: { en: "AI and chip cycle", vi: "Chu kỳ AI và bán dẫn" },
    heat: {
      en: "Heating up: chip stocks rising faster than usual for a month (the boom gathering pace); cooling: falling.",
      vi: "Nóng lên: cổ phiếu bán dẫn tăng nhanh hơn bình thường trong một tháng (cơn sốt tăng tốc); hạ nhiệt: giảm.",
    },
    gauges: [
      { series: "sox", sign: 1, label: { en: "Chip stocks (SOX)", vi: "Bán dẫn (SOX)" } },
      { series: NVDA, sign: 1, label: { en: "Nvidia", vi: "Nvidia" } },
      { series: TSM, sign: 1, label: { en: "TSMC (ADR)", vi: "TSMC (ADR)" } },
    ],
    facts: ["tsmcRevenue"],
    vietnam: {
      text: {
        en: "Vietnam assembles and exports electronics and chip parts (Samsung, Intel, Amkor), and FPT sells software and AI services.",
        vi: "Việt Nam lắp ráp, xuất khẩu điện tử và linh kiện bán dẫn (Samsung, Intel, Amkor); FPT bán dịch vụ phần mềm và AI.",
      },
      gauges: [{ series: FPT, sign: 1, label: { en: "FPT", vi: "FPT" } }],
    },
    news: {
      en: /\b(ai|artificial intelligence|nvidia|chips?|chipmakers?|semiconductors?|tsmc|openai|anthropic|data cent(er|re)s?|gpus?|hbm|micron|asml|broadcom|jensen huang)\b/i,
      vi: /(\bAI\b|trí tuệ nhân tạo|Nvidia|chip|bán dẫn|TSMC|OpenAI)/i,
      tech: true,
    },
    markets: /\b(nvidia|openai|anthropic|ai|chips?|largest company)\b/i,
  },
  {
    id: "vnCapital",
    name: { en: "Foreign money and the dong", vi: "Vốn ngoại và tỷ giá" },
    heat: {
      en: "Heating up: more pressure on Vietnam: foreign investors selling more than usual, the dong weakening, stocks falling.",
      vi: "Nóng lên: áp lực lên Việt Nam tăng: khối ngoại bán ròng nhiều hơn bình thường, tiền đồng yếu đi, cổ phiếu giảm.",
    },
    gauges: [
      { series: FOREIGN_NET, sign: -1, sumSessions: 20, label: { en: "Foreign net, 20 sessions", vi: "Khối ngoại ròng 20 phiên" } },
      { series: "usdvnd", sign: 1, label: { en: "USD/VND", vi: "USD/VND" } },
      { series: "vnindex", sign: -1, label: { en: "VN-Index", vi: "VN-Index" } },
    ],
    facts: ["fxCeiling"],
    news: {
      en: /\b(vn-?index|ftse|msci|foreign (investors?|capital|inflows?|outflows?|selling|buying)|net (selling|buying|sold|bought)|exchange rates?|usd|state bank|fdi|stocks?|securities|upgrade)\b/i,
      vi: /(khối ngoại|nhà đầu tư nước ngoài|tỷ giá|USD|VN-Index|FTSE|MSCI|nâng hạng|FDI|chứng khoán|Ngân hàng Nhà nước)/i,
      regions: ["vietnam"],
    },
  },
];
