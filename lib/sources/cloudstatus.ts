import Parser from "rss-parser";
import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { STATUS_SERVICES, type StatusService } from "@/config/tech";
import { fetchBuffer, fetchJson, fetchText } from "./http";
import { replaceItems } from "./store";
import type { Source } from "./types";

// Status of the clouds and developer/AI services most of the internet leans on
// (config/tech.ts). Each provider publishes in its own format; all of them are
// reduced to one level plus the incidents still open. A provider that cannot be
// read is stored as such (no level), never shown as "operational".

export type Impact = "none" | "maintenance" | "unknown" | "minor" | "major" | "critical";

export interface StatusIncident {
  title: string;
  impact: Impact;
  /** Provider's stage, e.g. "investigating", "monitoring". */
  status: string | null;
  since: number | null;
  /** Region or locations, when the provider gives them. */
  where: string | null;
  url: string | null;
}

export interface ServiceStatus {
  /** Null when the provider could not be read this run. */
  level: Impact | null;
  /** The provider's own one-line summary (Statuspage hosts only). */
  description: string | null;
  incidents: StatusIncident[];
  error?: string;
}

const RANK: Record<Impact, number> = { none: 0, maintenance: 1, unknown: 2, minor: 3, major: 4, critical: 5 };
const MAX_INCIDENTS = 5;

/** The most severe of several impacts ("none" for an empty list). */
export function worstImpact(impacts: Impact[]): Impact {
  return impacts.reduce<Impact>((a, b) => (RANK[b] > RANK[a] ? b : a), "none");
}

function asImpact(s: string | null | undefined): Impact {
  return s && s in RANK ? (s as Impact) : "unknown";
}

const time = (s: string | null | undefined) => (s ? Date.parse(s) || null : null);

// ---------------------------------------------------------------- Atlassian Statuspage

const SpIncident = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  impact: z.string().nullish(),
  created_at: z.string(),
  started_at: z.string().nullish(),
  shortlink: z.string().nullish(),
});
const SpStatus = z.object({ status: z.object({ indicator: z.string(), description: z.string() }) });
const SpIncidents = z.object({ incidents: z.array(SpIncident) });
const SpSummary = SpStatus.extend({ incidents: z.array(SpIncident) });

export function statuspageStatus(
  status: z.infer<typeof SpStatus>["status"],
  incidents: z.infer<typeof SpIncident>[],
  page: string,
): ServiceStatus {
  const open = incidents.map((i) => ({
    title: i.name,
    impact: asImpact(i.impact),
    status: i.status,
    since: time(i.started_at ?? i.created_at),
    where: null,
    url: i.shortlink || `${page}/incidents/${i.id}`,
  }));
  // The page-wide indicator can still read "operational" while an incident is open (GitHub does this): take the worse.
  return { level: worstImpact([asImpact(status.indicator), ...open.map((i) => i.impact)]), description: status.description, incidents: open.slice(0, MAX_INCIDENTS) };
}

async function readStatuspage(s: StatusService): Promise<ServiceStatus> {
  if (s.kind === "statuspage-summary") {
    const r = await fetchJson(`${s.page}/api/v2/summary.json`, SpSummary);
    return statuspageStatus(r.status, r.incidents, s.page);
  }
  // Two small calls instead of summary.json: Cloudflare's summary lists every PoP and weighs ~200 KB.
  const [st, inc] = await Promise.all([fetchJson(`${s.page}/api/v2/status.json`, SpStatus), fetchJson(`${s.page}/api/v2/incidents/unresolved.json`, SpIncidents)]);
  return statuspageStatus(st.status, inc.incidents, s.page);
}

// ---------------------------------------------------------------- AWS Health Dashboard

const AwsEvents = z.array(
  z.object({
    date: z.union([z.string(), z.number()]),
    region_name: z.string().nullish(),
    status: z.union([z.string(), z.number()]),
    service_name: z.string(),
    summary: z.string(),
  }),
);

/** AWS serves this feed as UTF-16 (big-endian, with a byte-order mark); plain UTF-8 is accepted too. */
export function decodeUtf16(buf: Buffer): string {
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const body = Buffer.from(buf.subarray(2, buf.length - (buf.length % 2)));
    return body.swap16().toString("utf16le");
  }
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le");
  return buf.toString("utf8");
}

/** AWS event status: 1 informational, 2 degraded, 3 disrupted; 0 (resolved) is dropped. */
const AWS_IMPACT: Record<string, Impact> = { "1": "none", "2": "minor", "3": "major" };

export function awsStatus(events: z.infer<typeof AwsEvents>, page: string): ServiceStatus {
  const open = events
    .filter((e) => String(e.status) !== "0")
    .map((e) => ({
      title: `${e.service_name}: ${e.summary}`,
      impact: AWS_IMPACT[String(e.status)] ?? "unknown",
      status: null,
      since: Number(e.date) * 1000 || null,
      where: e.region_name ?? null,
      url: page,
    }))
    .sort((a, b) => RANK[b.impact] - RANK[a.impact] || (b.since ?? 0) - (a.since ?? 0));
  return { level: worstImpact(open.map((i) => i.impact)), description: null, incidents: open.slice(0, MAX_INCIDENTS) };
}

async function readAws(s: StatusService): Promise<ServiceStatus> {
  const text = decodeUtf16(await fetchBuffer("https://health.aws.amazon.com/public/currentevents", { timeoutMs: 30_000 })).trim();
  const parsed = AwsEvents.safeParse(text ? JSON.parse(text) : []);
  if (!parsed.success) throw new Error(`Unexpected response shape from AWS: ${parsed.error.issues[0]?.message}`);
  return awsStatus(parsed.data, s.page);
}

// ---------------------------------------------------------------- Google Cloud

const GcpIncidents = z.array(
  z.object({
    id: z.string(),
    begin: z.string(),
    end: z.string().nullish(),
    external_desc: z.string(),
    status_impact: z.string().nullish(),
    uri: z.string().nullish(),
    currently_affected_locations: z.array(z.object({ title: z.string() })).nullish(),
  }),
);

const GCP_IMPACT: Record<string, Impact> = { SERVICE_INFORMATION: "none", SERVICE_DISRUPTION: "minor", SERVICE_OUTAGE: "major" };

/** Incidents without an end time are the open ones (the feed also keeps recently closed ones). */
export function gcpStatus(incidents: z.infer<typeof GcpIncidents>, page: string): ServiceStatus {
  const open = incidents
    .filter((i) => !i.end)
    .map((i) => ({
      title: i.external_desc.trim(),
      impact: GCP_IMPACT[i.status_impact ?? ""] ?? "unknown",
      status: null,
      since: time(i.begin),
      where: (i.currently_affected_locations ?? []).map((l) => l.title).slice(0, 3).join(", ") || null,
      url: i.uri ? `${page}/${i.uri}` : page,
    }));
  return { level: worstImpact(open.map((i) => i.impact)), description: null, incidents: open.slice(0, MAX_INCIDENTS) };
}

async function readGcp(s: StatusService): Promise<ServiceStatus> {
  return gcpStatus(await fetchJson("https://status.cloud.google.com/incidents.json", GcpIncidents, { timeoutMs: 30_000 }), s.page);
}

// ---------------------------------------------------------------- Azure

const parser = new Parser();

/** Azure's RSS feed only carries items while an issue is open; it gives no severity. */
async function readAzure(s: StatusService): Promise<ServiceStatus> {
  const feed = await parser.parseString(await fetchText("https://azure.status.microsoft/en-us/status/feed/"));
  const open = feed.items.flatMap((it) =>
    it.title
      ? [{ title: it.title.trim(), impact: "unknown" as const, status: null, since: time(it.isoDate ?? it.pubDate), where: null, url: it.link || s.page }]
      : [],
  );
  return { level: worstImpact(open.map((i) => i.impact)), description: null, incidents: open.slice(0, MAX_INCIDENTS) };
}

// ----------------------------------------------------------------

const READERS: Record<StatusService["kind"], (s: StatusService) => Promise<ServiceStatus>> = {
  statuspage: readStatuspage,
  "statuspage-summary": readStatuspage,
  aws: readAws,
  gcp: readGcp,
  azure: readAzure,
};

export const cloudstatus: Source = {
  id: "cloudstatus",
  ...SOURCE_META.cloudstatus,
  async run({ db, log }) {
    const results = await Promise.allSettled(STATUS_SERVICES.map((s) => READERS[s.kind](s)));
    const failed: string[] = [];
    const rows = STATUS_SERVICES.map((s, i) => {
      const r = results[i];
      let data: ServiceStatus;
      if (r.status === "fulfilled") data = r.value;
      else {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        failed.push(`${s.name}: ${msg}`);
        data = { level: null, description: null, incidents: [], error: msg };
      }
      return { id: s.key, title: s.name, url: s.page, ts: Date.now(), data };
    });
    if (failed.length) log(`${failed.length}/${STATUS_SERVICES.length} status pages failed: ${failed.join(" | ")}`);
    if (failed.length === STATUS_SERVICES.length) throw new Error("all status pages failed");
    return replaceItems(db, "status", rows);
  },
};
