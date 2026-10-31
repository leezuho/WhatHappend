// Shared between the worker (writes briefs) and the web server (reads them),
// kept free of SDK imports so the web bundle stays lean.

export const FORCE_KEY = "brief:force";

export interface StoredBrief {
  headline: string;
  bullets: { title: string; body: string; sources: { title: string; url: string; source: string }[] }[];
  watch: string[];
  model: string;
  headlineCount: number;
}
