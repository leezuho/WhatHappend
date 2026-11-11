import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { policyCountries, type PolicyAgency } from "@/config/geopolitics";
import { fetchJson, fetchText, htmlText } from "./http";
import { replaceItems, type ItemRow } from "./store";
import type { Source } from "./types";

// What Washington did on sanctions, export controls and tariffs, newest first:
// - OFAC's "Recent Actions" page (HTML, no feed): same-day, and its titles name
//   the programme ("Iran-related Designations"). The Federal Register's copies of
//   OFAC notices all read "Notice of OFAC Sanctions Action", so they are skipped.
// - The Federal Register API (no key) for the Commerce Department's export
//   controls (BIS), the Trade Representative (Section 301 cases) and presidential
//   documents on tariffs and sanctions. Its full texts sit behind a bot wall, so
//   only titles are read.

const OFAC_PAGES = ["https://ofac.treasury.gov/recent-actions", "https://ofac.treasury.gov/recent-actions?page=1"];
const FR = "https://www.federalregister.gov/api/v1/documents.json";
const WINDOW_DAYS = 60;
const KEEP = 40;
const DAY = 86_400_000;

export interface PolicyData {
  agency: PolicyAgency;
  /** Codes from POLICY_COUNTRIES named in the title. */
  countries: string[];
  /** OFAC's categories ("Sanctions List Updates", "General Licenses") or the Federal Register's type ("Rule", "Proclamation"). */
  tags: string[];
}

export interface OfacAction {
  slug: string;
  title: string;
  ts: number;
  tags: string[];
}

/**
 * The list on OFAC's Recent Actions page: one `views-row` per action, whose first link is
 * `/recent-actions/YYYYMMDD[_n]` with the title, followed by links to its categories.
 */
export function parseOfacActions(html: string): OfacAction[] {
  return html
    .split(/class="[^"]*\bviews-row\b[^"]*"/)
    .slice(1)
    .flatMap((block) => {
      const m = /href="\/recent-actions\/((\d{4})(\d{2})(\d{2})(?:_\d+)?)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
      if (!m) return [];
      const tags = [...block.matchAll(/href="\/recent-actions\/([a-z][a-z0-9-]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((t) => htmlText(t[2]));
      return [{ slug: m[1], title: htmlText(m[5]), ts: Date.UTC(Number(m[2]), Number(m[3]) - 1, Number(m[4])), tags }];
    });
}

const FrResp = z.object({
  results: z
    .array(
      z.object({
        document_number: z.string(),
        title: z.string(),
        type: z.string(),
        subtype: z.string().nullable().optional(),
        publication_date: z.string(),
        html_url: z.string(),
        agencies: z.array(z.object({ slug: z.string().nullable().optional() })),
      }),
    )
    .optional()
    .default([]),
});

type FrDoc = z.infer<typeof FrResp>["results"][number];

/** Routine paperwork of BIS and USTR that says nothing about policy. */
const AGENCY_NOISE = /information collection|paperwork reduction|renewing|temporary denial|denial of export privileges|meeting|sunshine act|privacy act|advisory committee|performance review board|notorious markets/i;
/** Presidential documents worth listing: the rest are proclamations of days and months, and orders on other matters. */
const PRESIDENTIAL_KEEP = /tariff|dut(y|ies)\b|\bimports?\b|\bexports?\b|sanction|\btrade\b|reciprocal|embargo|section 232|critical minerals/i;
/** The yearly renewal of each sanctions emergency changes nothing. */
const PRESIDENTIAL_ROUTINE = /^continuation of the national emergency/i;

/** Which of our agencies a Federal Register document belongs to, or null to skip it. */
export function frAgency(doc: Pick<FrDoc, "title" | "type" | "agencies">): PolicyAgency | null {
  if (doc.type === "Presidential Document") return PRESIDENTIAL_KEEP.test(doc.title) && !PRESIDENTIAL_ROUTINE.test(doc.title) ? "wh" : null;
  if (AGENCY_NOISE.test(doc.title)) return null;
  const slugs = doc.agencies.map((a) => a.slug);
  if (slugs.includes("industry-and-security-bureau")) return "bis";
  if (slugs.includes("trade-representative-office-of-united-states")) return "ustr";
  return null;
}

function frUrl(since: string, extra: [string, string][]): string {
  const p = new URLSearchParams([
    ["per_page", "100"],
    ["order", "newest"],
    ["conditions[publication_date][gte]", since],
    ...extra,
    ...["document_number", "title", "type", "subtype", "publication_date", "html_url", "agencies"].map((f): [string, string] => ["fields[]", f]),
  ]);
  return `${FR}?${p}`;
}

export const uspolicy: Source = {
  id: "uspolicy",
  ...SOURCE_META.uspolicy,
  async run({ db, log }) {
    const since = Date.now() - WINDOW_DAYS * DAY;
    const sinceDate = new Date(since).toISOString().slice(0, 10);

    const ofac = (await Promise.all(OFAC_PAGES.map((u) => fetchText(u, { timeoutMs: 30_000 })))).flatMap(parseOfacActions);
    if (!ofac.length) throw new Error("no actions found on OFAC's Recent Actions page (layout changed?)");

    const [agencyDocs, presidential] = await Promise.all([
      fetchJson(frUrl(sinceDate, [["conditions[agencies][]", "industry-and-security-bureau"], ["conditions[agencies][]", "trade-representative-office-of-united-states"]]), FrResp),
      fetchJson(frUrl(sinceDate, [["conditions[type][]", "PRESDOCU"]]), FrResp),
    ]);

    const rows: (ItemRow & { ts: number })[] = [
      ...ofac
        .filter((a) => a.ts >= since)
        .map((a) => ({
          id: `ofac:${a.slug}`,
          title: a.title,
          url: `https://ofac.treasury.gov/recent-actions/${a.slug}`,
          ts: a.ts,
          data: { agency: "ofac", countries: policyCountries(a.title), tags: a.tags } satisfies PolicyData,
        })),
      ...[...agencyDocs.results, ...presidential.results].flatMap((d) => {
        const agency = frAgency(d);
        if (!agency) return [];
        const ts = Date.parse(`${d.publication_date}T00:00:00Z`);
        if (!Number.isFinite(ts)) return [];
        const tags = [d.subtype || d.type];
        return [{ id: `fr:${d.document_number}`, title: d.title, url: d.html_url, ts, data: { agency, countries: policyCountries(d.title), tags } satisfies PolicyData }];
      }),
    ];
    // Same day: OFAC first (it acts that day; the Federal Register publishes what was decided earlier).
    const order: Record<PolicyAgency, number> = { ofac: 0, wh: 1, ustr: 2, bis: 3 };
    const unique = [...new Map(rows.map((r) => [r.id, r])).values()];
    unique.sort((a, b) => b.ts - a.ts || order[(a.data as PolicyData).agency] - order[(b.data as PolicyData).agency]);
    log(`${ofac.length} OFAC actions, ${agencyDocs.results.length + presidential.results.length} Federal Register documents`);
    return replaceItems(db, "us_policy", unique.slice(0, KEEP));
  },
};
