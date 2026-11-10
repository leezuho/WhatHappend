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

// Taiwan's monthly revenue reports (TWSE OpenAPI, around the 10th): the AI
// hardware chain's sales a month after the fact, long before quarterly results.

export interface TwCompany {
  code: string;
  name: string;
  role: { en: string; vi: string };
}

export const TW_REVENUE: TwCompany[] = [
  { code: "2330", name: "TSMC", role: { en: "chip foundry", vi: "đúc chip" } },
  { code: "2317", name: "Hon Hai (Foxconn)", role: { en: "AI servers, assembly", vi: "máy chủ AI, lắp ráp" } },
  { code: "2382", name: "Quanta", role: { en: "AI servers", vi: "máy chủ AI" } },
  { code: "3231", name: "Wistron", role: { en: "AI servers", vi: "máy chủ AI" } },
  { code: "2454", name: "MediaTek", role: { en: "chip design", vi: "thiết kế chip" } },
  { code: "3711", name: "ASE", role: { en: "chip packaging", vi: "đóng gói chip" } },
  { code: "2308", name: "Delta Electronics", role: { en: "data-centre power", vi: "nguồn điện trung tâm dữ liệu" } },
];

export const twRevenueId = (code: string) => `twse:REV:${code}`;

/** Monthly count of job posts (top-level comments) in Hacker News' "Ask HN: Who is hiring?" thread. */
export const HN_HIRING_ID = "hn:WHOISHIRING";

// Release lines and end-of-life dates (endoflife.date) of the tools this
// dashboard and most web teams run on. TypeScript has no endoflife.date page
// and no EOL policy; its latest release comes from npm.

export const EOL_PRODUCTS: { slug: string; name: string }[] = [
  { slug: "nodejs", name: "Node.js" },
  { slug: "nextjs", name: "Next.js" },
  { slug: "react", name: "React" },
  { slug: "python", name: "Python" },
  { slug: "postgresql", name: "PostgreSQL" },
  { slug: "kubernetes", name: "Kubernetes" },
];

/**
 * LMArena organisation → OpenRouter id prefixes, for joining arena ratings with prices
 * (lib/sources/arena.ts). Organisations not listed match their own name.
 */
export const ARENA_ORGS: Record<string, string[]> = {
  alibaba: ["qwen"],
  zai: ["z-ai"],
  xai: ["x-ai"],
  moonshot: ["moonshotai"],
  bytedance: ["bytedance-seed", "bytedance"],
  meta: ["meta", "meta-llama"],
  stepfun: ["stepfun-ai", "stepfun"],
  mistral: ["mistralai"],
};

// Weekly downloads of the main web frameworks and AI SDKs (lib/sources/pkgtrends.ts).

export interface PackageDef {
  registry: "npm" | "pypi";
  name: string;
  group: "web" | "aiJs" | "aiPy";
}

export const PACKAGES: PackageDef[] = [
  { registry: "npm", name: "react", group: "web" },
  { registry: "npm", name: "next", group: "web" },
  { registry: "npm", name: "vue", group: "web" },
  { registry: "npm", name: "svelte", group: "web" },
  { registry: "npm", name: "@angular/core", group: "web" },
  { registry: "npm", name: "openai", group: "aiJs" },
  { registry: "npm", name: "@anthropic-ai/sdk", group: "aiJs" },
  { registry: "npm", name: "ai", group: "aiJs" },
  { registry: "npm", name: "langchain", group: "aiJs" },
  { registry: "pypi", name: "torch", group: "aiPy" },
  { registry: "pypi", name: "transformers", group: "aiPy" },
  { registry: "pypi", name: "openai", group: "aiPy" },
  { registry: "pypi", name: "anthropic", group: "aiPy" },
  { registry: "pypi", name: "langchain", group: "aiPy" },
];

export const pkgId = (p: Pick<PackageDef, "registry" | "name">) => `pkg:${p.registry}:${p.name}`;
