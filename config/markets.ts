import type { Bi } from "@/lib/i18n";

// The overview's world-markets table: each tracked economy's main stock index
// (config/countries.ts), plus Hong Kong and Taiwan, grouped by region.

export type MarketRegion = "americas" | "europe" | "asia";

export interface WorldIndex {
  /** Series id: `yahoo:<symbol>`, or the VN-Index the vnindex source writes. */
  id: string;
  name: string;
  country: Bi;
  region: MarketRegion;
}

export const MARKET_REGIONS: MarketRegion[] = ["americas", "europe", "asia"];

export const WORLD_INDICES: WorldIndex[] = [
  { id: "yahoo:^GSPC", name: "S&P 500", country: { en: "US", vi: "Mỹ" }, region: "americas" },
  { id: "yahoo:^IXIC", name: "Nasdaq", country: { en: "US", vi: "Mỹ" }, region: "americas" },
  { id: "yahoo:^RUT", name: "Russell 2000", country: { en: "US small caps", vi: "Mỹ, vốn hoá nhỏ" }, region: "americas" },
  { id: "yahoo:^GSPTSE", name: "S&P/TSX", country: { en: "Canada", vi: "Canada" }, region: "americas" },
  { id: "yahoo:^BVSP", name: "Bovespa", country: { en: "Brazil", vi: "Brazil" }, region: "americas" },
  { id: "yahoo:^MXX", name: "IPC", country: { en: "Mexico", vi: "Mexico" }, region: "americas" },
  { id: "yahoo:^STOXX50E", name: "Euro Stoxx 50", country: { en: "Euro area", vi: "Khu vực euro" }, region: "europe" },
  { id: "yahoo:^GDAXI", name: "DAX", country: { en: "Germany", vi: "Đức" }, region: "europe" },
  { id: "yahoo:^FCHI", name: "CAC 40", country: { en: "France", vi: "Pháp" }, region: "europe" },
  { id: "yahoo:FTSEMIB.MI", name: "FTSE MIB", country: { en: "Italy", vi: "Ý" }, region: "europe" },
  { id: "yahoo:^FTSE", name: "FTSE 100", country: { en: "UK", vi: "Anh" }, region: "europe" },
  { id: "yahoo:^N225", name: "Nikkei 225", country: { en: "Japan", vi: "Nhật Bản" }, region: "asia" },
  { id: "yahoo:^KS11", name: "KOSPI", country: { en: "South Korea", vi: "Hàn Quốc" }, region: "asia" },
  { id: "yahoo:^TWII", name: "TAIEX", country: { en: "Taiwan", vi: "Đài Loan" }, region: "asia" },
  { id: "yahoo:000001.SS", name: "Shanghai Composite", country: { en: "China", vi: "Trung Quốc" }, region: "asia" },
  { id: "yahoo:^HSI", name: "Hang Seng", country: { en: "Hong Kong", vi: "Hồng Kông" }, region: "asia" },
  { id: "yahoo:^NSEI", name: "Nifty 50", country: { en: "India", vi: "Ấn Độ" }, region: "asia" },
  { id: "yahoo:^AXJO", name: "ASX 200", country: { en: "Australia", vi: "Úc" }, region: "asia" },
  { id: "yahoo:^JKSE", name: "JCI", country: { en: "Indonesia", vi: "Indonesia" }, region: "asia" },
  { id: "vn:VNINDEX", name: "VN-Index", country: { en: "Vietnam", vi: "Việt Nam" }, region: "asia" },
];

/** Yahoo symbols the table needs (YAHOO_SYMBOLS drops the ones SERIES already tracks). */
export const WORLD_INDEX_SYMBOLS = WORLD_INDICES.flatMap((i) => (i.id.startsWith("yahoo:") ? [i.id.slice("yahoo:".length)] : []));

// The overview's commodities table: energy and food are the main inflation channels
// for emerging markets (Vietnam included), metals the industrial cycle. Rice and
// coffee because Vietnam is a top exporter of both. Front-month futures on Yahoo.

export type CommodityGroup = "energy" | "metals" | "agri";

export interface Commodity {
  /** `yahoo:<futures symbol>`. */
  id: string;
  name: Bi;
  unit: Bi;
  group: CommodityGroup;
}

export const COMMODITY_GROUPS: CommodityGroup[] = ["energy", "metals", "agri"];

export const COMMODITIES: Commodity[] = [
  { id: "yahoo:BZ=F", name: { en: "Brent crude", vi: "Dầu Brent" }, unit: { en: "$/bbl", vi: "$/thùng" }, group: "energy" },
  { id: "yahoo:CL=F", name: { en: "WTI crude", vi: "Dầu WTI" }, unit: { en: "$/bbl", vi: "$/thùng" }, group: "energy" },
  { id: "yahoo:NG=F", name: { en: "US gas (Henry Hub)", vi: "Khí Mỹ (Henry Hub)" }, unit: { en: "$/MMBtu", vi: "$/MMBtu" }, group: "energy" },
  { id: "yahoo:TTF=F", name: { en: "European gas (TTF)", vi: "Khí châu Âu (TTF)" }, unit: { en: "€/MWh", vi: "€/MWh" }, group: "energy" },
  { id: "yahoo:GC=F", name: { en: "Gold", vi: "Vàng" }, unit: { en: "$/oz", vi: "$/ounce" }, group: "metals" },
  { id: "yahoo:SI=F", name: { en: "Silver", vi: "Bạc" }, unit: { en: "$/oz", vi: "$/ounce" }, group: "metals" },
  { id: "yahoo:HG=F", name: { en: "Copper", vi: "Đồng" }, unit: { en: "$/lb", vi: "$/pound" }, group: "metals" },
  { id: "yahoo:ZW=F", name: { en: "Wheat", vi: "Lúa mì" }, unit: { en: "¢/bu", vi: "¢/giạ" }, group: "agri" },
  { id: "yahoo:ZC=F", name: { en: "Corn", vi: "Ngô" }, unit: { en: "¢/bu", vi: "¢/giạ" }, group: "agri" },
  { id: "yahoo:ZR=F", name: { en: "Rough rice", vi: "Lúa gạo" }, unit: { en: "$/cwt", vi: "$/cwt" }, group: "agri" },
  { id: "yahoo:KC=F", name: { en: "Coffee (arabica)", vi: "Cà phê arabica" }, unit: { en: "¢/lb", vi: "¢/pound" }, group: "agri" },
];

// The overview's "what is winning this year" chart: one proxy per asset class.
// ETFs where there is no clean index on Yahoo; their price excludes dividends and coupons.

export interface AssetClass {
  id: string;
  name: Bi;
}

export const ASSET_CLASSES: AssetClass[] = [
  { id: "yahoo:^GSPC", name: { en: "US stocks (S&P 500)", vi: "Cổ phiếu Mỹ (S&P 500)" } },
  { id: "yahoo:ACWI", name: { en: "World stocks (ACWI)", vi: "Cổ phiếu thế giới (ACWI)" } },
  { id: "yahoo:EEM", name: { en: "Emerging stocks (EEM)", vi: "Cổ phiếu mới nổi (EEM)" } },
  { id: "vn:VNINDEX", name: { en: "VN-Index", vi: "VN-Index" } },
  { id: "yahoo:IEF", name: { en: "US Treasuries 7–10Y", vi: "Trái phiếu Mỹ 7–10 năm" } },
  { id: "yahoo:GC=F", name: { en: "Gold", vi: "Vàng" } },
  { id: "yahoo:BZ=F", name: { en: "Brent crude", vi: "Dầu Brent" } },
  { id: "yahoo:HG=F", name: { en: "Copper", vi: "Đồng" } },
  { id: "yahoo:DX-Y.NYB", name: { en: "US dollar (DXY)", vi: "Đô la Mỹ (DXY)" } },
  { id: "yahoo:BTC-USD", name: { en: "Bitcoin", vi: "Bitcoin" } },
];

/** Yahoo symbols the commodities table and the asset-class chart need. */
export const MARKET_EXTRA_SYMBOLS = [...COMMODITIES, ...ASSET_CLASSES].flatMap((i) => (i.id.startsWith("yahoo:") ? [i.id.slice("yahoo:".length)] : []));
