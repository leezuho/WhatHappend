import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { replaceItems } from "./store";
import type { Source } from "./types";

// Most-read Wikipedia articles yesterday (UTC) in English and Vietnamese: a
// cheap proxy for what the world is paying attention to. Wikimedia requires a
// User-Agent (our http helper always sends one).
//
// vi.wikipedia is small enough that its raw top list is mostly pages read at the
// same high level every day: automated traffic Wikimedia does not flag (often on
// adult topics, ~15k "views" a day from phones) and evergreen pages. What people
// turn to on a given day shows as a jump, so for vi only pages read SPIKE times
// their usual level are kept. The usual level comes from the top lists of a few
// earlier days rather than per-article calls, which Wikimedia rate-limits fast.

const Resp = z.object({
  items: z.array(z.object({ articles: z.array(z.object({ article: z.string(), views: z.number(), rank: z.number() })) })),
});

export interface Article {
  article: string;
  views: number;
}

const SKIP_EXACT = new Set(["Main_Page", "Trang_Chính", "-"]);
const SKIP_PREFIX = [
  "Special:", "Wikipedia:", "Portal:", "File:", "Help:", "Template:", "Category:", "User:", "Talk:",
  "Đặc_biệt:", "Tập_tin:", "Thể_loại:", "Bản_mẫu:", "Thành_viên:", "Cổng_thông_tin:", "Wikipedia_tiếng_Việt:",
];
const TOP = 15;
const DAY = 24 * 3600_000;
/** Earlier days the usual level is read from, counted back from the day ranked. Day -1 is skipped: a story that broke then is still news. */
const BASELINE_DAYS = [2, 4, 7];
const SPIKE = 4;
const SPIKE_ONLY: Record<Project, boolean> = { en: false, vi: true };

type Project = "en" | "vi";

function datePath(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
}

function topUrl(project: Project, ts: number): string {
  return `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${project}.wikipedia/all-access/${datePath(ts)}`;
}

/** The latest ranked day: yesterday, or the day before while yesterday's ranking is still being computed. */
async function latestTop(project: Project): Promise<{ day: number; articles: Article[] }> {
  let lastErr: unknown;
  for (const daysBack of [1, 2]) {
    const day = Date.now() - daysBack * DAY;
    try {
      return { day, articles: (await fetchJson(topUrl(project, day), Resp)).items[0]?.articles ?? [] };
    } catch (err) {
      lastErr = err;
      if (!(err instanceof Error && err.message.startsWith("HTTP 404"))) throw err;
    }
  }
  throw lastErr;
}

function isArticle(name: string): boolean {
  return !SKIP_EXACT.has(name) && !name.startsWith(".") && !SKIP_PREFIX.some((p) => name.startsWith(p));
}

/**
 * Keep the articles read at least `spike` times their usual level, in the order given.
 * The usual level is the median over `earlier` top lists; a page missing from one was
 * read less than that list's last entry, so the last entry stands in as an upper bound.
 */
export function spikesOnly(today: Article[], earlier: Article[][], spike: number): Article[] {
  const days = earlier.filter((list) => list.length).map((list) => ({
    views: new Map(list.map((a) => [a.article, a.views])),
    floor: Math.min(...list.map((a) => a.views)),
  }));
  if (!days.length) throw new Error("No earlier top list to compare against");
  return today.filter((a) => {
    const usual = days.map((d) => d.views.get(a.article) ?? d.floor).sort((x, y) => x - y);
    const mid = usual.length >> 1;
    const median = usual.length % 2 ? usual[mid] : (usual[mid - 1] + usual[mid]) / 2;
    return a.views >= spike * Math.max(median, 1);
  });
}

export const wikipedia: Source = {
  id: "wikipedia",
  ...SOURCE_META.wikipedia,
  async run({ db }) {
    let written = 0;
    for (const project of ["en", "vi"] as const) {
      const { day, articles } = await latestTop(project);
      let keep = articles.filter((a) => isArticle(a.article));
      if (SPIKE_ONLY[project]) {
        // Wikimedia skips the odd day (vi had no ranking for 2026-11-06); spikesOnly needs at least one.
        const earlier = await Promise.all(
          BASELINE_DAYS.map((n) =>
            fetchJson(topUrl(project, day - n * DAY), Resp).then(
              (r) => r.items[0]?.articles ?? [],
              (err: unknown) => {
                if (err instanceof Error && err.message.startsWith("HTTP 404")) return [];
                throw err;
              },
            ),
          ),
        );
        keep = spikesOnly(keep, earlier, SPIKE);
      }
      written += replaceItems(
        db,
        `wiki_${project}`,
        keep.slice(0, TOP).map((a) => ({
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
