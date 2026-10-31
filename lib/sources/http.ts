import type { z } from "zod";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) WhatHappendDashboard/0.1";

export interface FetchOpts {
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  /** Some hosts reject non-browser user agents; send a plain browser UA instead. */
  browserUA?: boolean;
}

async function request(url: string, opts: FetchOpts = {}): Promise<Response> {
  const headers: Record<string, string> = {
    "User-Agent": opts.browserUA
      ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
      : UA,
    Accept: "*/*",
    ...opts.headers,
  };
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        body: opts.body,
        headers,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
      });
      if (res.status >= 500 || res.status === 429) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (err instanceof Error && err.message.startsWith("HTTP 4")) throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchText(url: string, opts?: FetchOpts): Promise<string> {
  return (await request(url, opts)).text();
}

export async function fetchBuffer(url: string, opts?: FetchOpts): Promise<Buffer> {
  return Buffer.from(await (await request(url, opts)).arrayBuffer());
}

/** Fetch JSON and validate it; a schema mismatch fails the run loudly instead of storing junk. */
export async function fetchJson<S extends z.ZodType>(url: string, schema: S, opts?: FetchOpts): Promise<z.infer<S>> {
  const res = await request(url, { ...opts, headers: { Accept: "application/json", ...opts?.headers } });
  const json: unknown = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Unexpected response shape from ${new URL(url).host}: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return parsed.data;
}

/** Minimal RFC-4180-ish CSV parser (quoted fields, commas, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}
