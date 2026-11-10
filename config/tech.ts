// Technology page (BR-23): the stocks it tracks and the status pages it polls.

export type TechGroup = "us" | "chips" | "asia" | "vietnam";

export interface TechStock {
  symbol: string;
  name: string;
  group: TechGroup;
}

/** Table order: US platforms, then the chip supply chain, then Asia and Vietnam. */
export const TECH_GROUPS: TechGroup[] = ["us", "chips", "asia", "vietnam"];

export const TECH_STOCKS: TechStock[] = [
  { symbol: "NVDA", name: "Nvidia", group: "us" },
  { symbol: "AAPL", name: "Apple", group: "us" },
  { symbol: "MSFT", name: "Microsoft", group: "us" },
  { symbol: "GOOGL", name: "Alphabet", group: "us" },
  { symbol: "AMZN", name: "Amazon", group: "us" },
  { symbol: "META", name: "Meta", group: "us" },
  { symbol: "TSLA", name: "Tesla", group: "us" },
  { symbol: "ORCL", name: "Oracle", group: "us" },
  { symbol: "TSM", name: "TSMC", group: "chips" },
  { symbol: "AVGO", name: "Broadcom", group: "chips" },
  { symbol: "AMD", name: "AMD", group: "chips" },
  { symbol: "ASML", name: "ASML", group: "chips" },
  { symbol: "MU", name: "Micron", group: "chips" },
  { symbol: "ARM", name: "Arm", group: "chips" },
  { symbol: "005930.KS", name: "Samsung Electronics", group: "asia" },
  { symbol: "000660.KS", name: "SK hynix", group: "asia" },
  { symbol: "0700.HK", name: "Tencent", group: "asia" },
  { symbol: "9988.HK", name: "Alibaba", group: "asia" },
  { symbol: "FPT.VN", name: "FPT", group: "vietnam" },
  { symbol: "CMG.VN", name: "CMC", group: "vietnam" },
];

export const TECH_SYMBOLS = TECH_STOCKS.map((s) => s.symbol);

/**
 * Local currency per US dollar, as Yahoo symbols, for market caps quoted outside the US. KRW and VND are
 * already pulled for the macro page; HKD is only needed here.
 */
export const TECH_FX: Record<string, string> = { KRW: "KRW=X", HKD: "HKD=X", VND: "USDVND=X" };

export type StatusKind = "statuspage" | "statuspage-summary" | "aws" | "gcp" | "azure";

export interface StatusService {
  key: string;
  name: string;
  /** Public status page, linked from the tile. */
  page: string;
  /**
   * How to read it. "statuspage": Atlassian Statuspage, two small calls (status.json + incidents/unresolved.json).
   * "statuspage-summary": a Statuspage-compatible host that only serves summary.json (OpenAI).
   */
  kind: StatusKind;
}

/** Clouds first (most of the internet sits on them), then the developer and AI services. */
export const STATUS_SERVICES: StatusService[] = [
  { key: "aws", name: "AWS", page: "https://health.aws.amazon.com/health/status", kind: "aws" },
  { key: "gcp", name: "Google Cloud", page: "https://status.cloud.google.com", kind: "gcp" },
  { key: "azure", name: "Azure", page: "https://azure.status.microsoft/en-us/status", kind: "azure" },
  { key: "cloudflare", name: "Cloudflare", page: "https://www.cloudflarestatus.com", kind: "statuspage" },
  { key: "github", name: "GitHub", page: "https://www.githubstatus.com", kind: "statuspage" },
  { key: "vercel", name: "Vercel", page: "https://www.vercel-status.com", kind: "statuspage" },
  { key: "openai", name: "OpenAI", page: "https://status.openai.com", kind: "statuspage-summary" },
  { key: "claude", name: "Claude", page: "https://status.claude.com", kind: "statuspage" },
];
