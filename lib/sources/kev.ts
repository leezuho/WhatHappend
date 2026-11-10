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
    const rows = recentKev(r.vulnerabilities, Date.now()).slice(0, MAX_ROWS);
    return replaceItems(
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
