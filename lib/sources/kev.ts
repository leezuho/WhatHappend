import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { dayTs, replaceItems } from "./store";
import type { Source } from "./types";

// CISA's Known Exploited Vulnerabilities catalog: flaws attackers are using in
// the wild right now, each with the date US federal agencies must patch by.
// No key; the whole catalog (~1.8 MB) is one file, updated a few times a week.

const DAY = 24 * 3600_000;
const WINDOW_DAYS = 30;
const MAX_ROWS = 60;

const Vuln = z.object({
  cveID: z.string(),
  vendorProject: z.string(),
  product: z.string(),
  vulnerabilityName: z.string(),
  dateAdded: z.string(),
  shortDescription: z.string().nullish(),
  dueDate: z.string().nullish(),
  knownRansomwareCampaignUse: z.string().nullish(),
});
const Resp = z.object({ catalogVersion: z.string(), vulnerabilities: z.array(Vuln) });

export interface KevEntry {
  vendor: string;
  product: string;
  /** Patch deadline for US federal agencies (ms epoch, UTC midnight). */
  due: number | null;
  /** Known to be used in ransomware campaigns. */
  ransomware: boolean;
  desc: string | null;
}

/** Flaws added per vendor over a window: which products attackers are going after. */
export interface KevVendors {
  days: number;
  /** Every flaw added in the window, not only the vendors listed. */
  total: number;
  /** Vendors with the most flaws added, most first (ties by name); `ransomware` of them known to be used by ransomware. */
  rows: { vendor: string; n: number; ransomware: number }[];
}

/** Windows the vendor counts are kept for, in days. */
export const KEV_VENDOR_WINDOWS = [90, 365] as const;

export function kevByVendor(vulns: z.infer<typeof Vuln>[], now: number, days: number, top = 12): KevVendors {
  const recent = recentKev(vulns, now, days);
  const by = new Map<string, { n: number; ransomware: number }>();
  for (const v of recent) {
    const e = by.get(v.vendorProject) ?? { n: 0, ransomware: 0 };
    e.n++;
    if (v.knownRansomwareCampaignUse === "Known") e.ransomware++;
    by.set(v.vendorProject, e);
  }
  const rows = [...by.entries()]
    .map(([vendor, e]) => ({ vendor, ...e }))
    .sort((a, b) => b.n - a.n || a.vendor.localeCompare(b.vendor, "en"))
    .slice(0, top);
  return { days, total: recent.length, rows };
}

/** Entries added in the last `days`, newest first (same day: higher CVE number first). */
export function recentKev(vulns: z.infer<typeof Vuln>[], now: number, days = WINDOW_DAYS) {
  return vulns
    .map((v) => ({ ...v, added: dayTs(`${v.dateAdded}T00:00:00Z`) }))
    .filter((v) => Number.isFinite(v.added) && now - v.added <= days * DAY)
    .sort((a, b) => b.added - a.added || b.cveID.localeCompare(a.cveID, "en", { numeric: true }));
}

export const kev: Source = {
  id: "kev",
  ...SOURCE_META.kev,
  async run({ db }) {
    const r = await fetchJson("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json", Resp, { timeoutMs: 40_000 });
    if (!r.vulnerabilities.length) throw new Error("KEV catalog is empty");
    const now = Date.now();
    const rows = recentKev(r.vulnerabilities, now).slice(0, MAX_ROWS);
    const vendors = replaceItems(
      db,
      "kev_vendors",
      KEV_VENDOR_WINDOWS.map((days) => ({ id: String(days), title: `${days}d`, ts: now, data: kevByVendor(r.vulnerabilities, now, days) })),
    );
    return vendors + replaceItems(
      db,
      "kev",
      rows.map((v) => ({
        id: v.cveID,
        title: v.vulnerabilityName,
        url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
        ts: v.added,
        data: {
          vendor: v.vendorProject,
          product: v.product,
          due: v.dueDate ? dayTs(`${v.dueDate}T00:00:00Z`) : null,
          ransomware: v.knownRansomwareCampaignUse === "Known",
          desc: v.shortDescription ?? null,
        } satisfies KevEntry,
      })),
    );
  },
};
