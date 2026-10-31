import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { replaceItems } from "./store";
import type { Source } from "./types";

// Most-read Wikipedia articles yesterday (UTC) in English and Vietnamese: a
// cheap proxy for what the world is paying attention to. Wikimedia requires a
// User-Agent (our http helper always sends one).

const Resp = z.object({
  items: z.array(z.object({ articles: z.array(z.object({ article: z.string(), views: z.number(), rank: z.number() })) })),
});

const SKIP_EXACT = new Set(["Main_Page", "Trang_Chính", "-"]);
const SKIP_PREFIX = [
  "Special:", "Wikipedia:", "Portal:", "File:", "Help:", "Template:", "Category:", "User:", "Talk:",
  "Đặc_biệt:", "Tập_tin:", "Thể_loại:", "Bản_mẫu:", "Thành_viên:", "Cổng_thông_tin:", "Wikipedia_tiếng_Việt:",
];
const TOP = 15;
const DAY = 24 * 3600_000;

function datePath(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function topArticles(project: "en" | "vi") {
  let lastErr: unknown;
  for (const daysBack of [1, 2]) {
    try {
      const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${project}.wikipedia/all-access/${datePath(Date.now() - daysBack * DAY)}`;
      return (await fetchJson(url, Resp)).items[0]?.articles ?? [];
    } catch (err) {
      // Yesterday's ranking can lag a few hours; fall back one day on 404.
      lastErr = err;
      if (!(err instanceof Error && err.message.startsWith("HTTP 404"))) throw err;
    }
  }
  throw lastErr;
}

export const wikipedia: Source = {
  id: "wikipedia",
  ...SOURCE_META.wikipedia,
  async run({ db }) {
    let written = 0;
    for (const project of ["en", "vi"] as const) {
      const keep = (await topArticles(project))
        .filter((a) => !SKIP_EXACT.has(a.article) && !a.article.startsWith(".") && !SKIP_PREFIX.some((p) => a.article.startsWith(p)))
        .slice(0, TOP);
      written += replaceItems(
        db,
        `wiki_${project}`,
        keep.map((a) => ({
          id: a.article,
          title: a.article.replace(/_/g, " "),
          url: `https://${project}.wikipedia.org/wiki/${encodeURIComponent(a.article)}`,
          data: { views: a.views },
        })),
      );
    }
    return written;
  },
};
