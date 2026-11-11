import type { Impact } from "@/lib/sources/cloudstatus";
import type { Locale } from "@/lib/i18n";

// Telegram alerts sent by the worker (TODO P1, BR-26, lib/data/alerts.ts).
// Each condition is sent once when it starts and again only after it has
// ended: a value has to cross back past its "off" line first, so a rate
// hovering at the line does not ping the phone on every run.

export const ALERTS = {
  /** Language of the messages. */
  lang: "vi" as Locale,
  /** Vietcombank's USD sell rate this close to the top of the State Bank's band, in % of the ceiling. */
  vcbCeilingPct: { on: 2, off: 2.5 },
  /**
   * SJC bar premium over world gold, change from the previous day with a price, million ₫ per lượng.
   * Day-to-day moves ran up to 2.4 in the first half of 11/2026 (mostly world gold moving under a sticky SJC price).
   */
  sjcPremiumDay: { on: 3, off: 1.5 },
  /** A Polymarket outcome's probability moved this much in 24 hours (0.15 = 15 points). Crypto price ladders excluded. */
  polymarketDay: { on: 0.15, off: 0.1 },
  /** Status pages (STATUS_SERVICES keys in config/tech.ts) of the services in use; trim to the ones you rely on. */
  statusServices: ["aws", "gcp", "azure", "cloudflare", "github", "vercel", "openai", "claude"],
  /**
   * Lowest incident impact sent. Incidents with no severity (Azure's feed gives none) are sent too: Azure only
   * lists broad issues there.
   */
  statusMinImpact: "major" as Impact,
};
