// News feeds read by the `rss` source. `region` is preset only when the feed is
// single-region; everything else is tagged by the AI enrichment pass.
// Crypto feeds (`crypto: true`) feed the crypto page only: they would otherwise
// flood the world news list and the daily brief.

export interface Feed {
  name: string;
  url: string;
  lang: "en" | "vi";
  region?: string;
  /** Crypto-only outlet: shown on the crypto page, kept out of world news and the brief. */
  crypto?: boolean;
  /** Host rejects non-browser user agents. */
  browserUA?: boolean;
  /** Where relative image paths resolve when it is not the feed's own host. */
  imageBase?: string;
}

export const FEEDS: Feed[] = [
  { name: "BBC", url: "https://feeds.bbci.co.uk/news/world/rss.xml", lang: "en" },
  { name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", lang: "en" },
  { name: "The Guardian", url: "https://www.theguardian.com/world/rss", lang: "en" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", lang: "en" },
  { name: "DW", url: "https://rss.dw.com/xml/rss-en-all", lang: "en" },
  { name: "France 24", url: "https://www.france24.com/en/rss", lang: "en" },
  { name: "NPR", url: "https://feeds.npr.org/1004/rss.xml", lang: "en" },
  { name: "CNBC", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362", lang: "en" },
  { name: "CNBC Economy", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258", lang: "en" },
  { name: "SCMP", url: "https://www.scmp.com/rss/3/feed/", lang: "en", region: "asia" },
  { name: "VnExpress", url: "https://vnexpress.net/rss/the-gioi.rss", lang: "vi" },
  { name: "VnExpress", url: "https://vnexpress.net/rss/kinh-doanh.rss", lang: "vi", region: "vietnam" },
  { name: "VnExpress", url: "https://vnexpress.net/rss/thoi-su.rss", lang: "vi", region: "vietnam" },
  // Crypto
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss", lang: "en", crypto: true },
  { name: "Cointelegraph", url: "https://cointelegraph.com/rss", lang: "en", crypto: true },
  { name: "The Block", url: "https://www.theblock.co/rss.xml", lang: "en", crypto: true },
  { name: "Decrypt", url: "https://decrypt.co/feed", lang: "en", crypto: true },
  { name: "Coin68", url: "https://coin68.com/rss/tin-moi-nhat.rss", lang: "vi", crypto: true, imageBase: "https://cdn.coin68.com/" },
];

/** Outlet names of the crypto-only feeds (`articles.source`). */
export const CRYPTO_OUTLETS = [...new Set(FEEDS.filter((f) => f.crypto).map((f) => f.name))];
