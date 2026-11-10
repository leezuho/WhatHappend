import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { replaceItems } from "./store";
import type { Source } from "./types";

// What the AI research community is reading: Hugging Face's Daily Papers (a
// curated arXiv list with upvotes) and its trending models. No key.

const DAY = 24 * 3600_000;
const PAPER_DAYS = 3;
const MAX_PAPERS = 20;
const MAX_MODELS = 12;

const Papers = z.array(
  z.object({
    numComments: z.number().nullish(),
    paper: z.object({
      id: z.string(),
      title: z.string(),
      upvotes: z.number().nullish(),
      submittedOnDailyAt: z.string().nullish(),
      publishedAt: z.string().nullish(),
      githubRepo: z.string().nullish(),
      organization: z.object({ fullname: z.string().nullish(), name: z.string().nullish() }).nullish(),
      authors: z.array(z.object({ name: z.string() })).nullish(),
    }),
  }),
);

const Models = z.array(
  z.object({
    id: z.string(),
    likes: z.number().nullish(),
    downloads: z.number().nullish(),
    trendingScore: z.number().nullish(),
    pipeline_tag: z.string().nullish(),
    createdAt: z.string().nullish(),
  }),
);

export interface HfPaper {
  /** Original (English) title, kept for the tooltip when the list shows the Vietnamese one. */
  en: string;
  upvotes: number;
  comments: number;
  org: string | null;
  authors: string | null;
  github: string | null;
}

export interface HfModel {
  likes: number;
  downloads: number;
  task: string | null;
}

/** Papers featured in the last few days, most upvoted first. */
export function topPapers(rows: z.infer<typeof Papers>, now: number, days = PAPER_DAYS) {
  return rows
    .map((r) => ({ ...r.paper, comments: r.numComments ?? 0, day: Date.parse(r.paper.submittedOnDailyAt ?? r.paper.publishedAt ?? "") || 0 }))
    .filter((p) => now - p.day <= days * DAY)
    .sort((a, b) => (b.upvotes ?? 0) - (a.upvotes ?? 0) || b.day - a.day);
}

/**
 * Re-uploads of another model (quantized GGUF/AWQ/MLX copies, ComfyUI packagings, "uncensored"/"abliterated"
 * fine-tunes) crowd the trending list without being news; the original model is what matters.
 */
const REPACKAGE = /gguf|awq|gptq|exl2|mlx|comfy|uncensored|abliterat|heretic/i;

export function trendingModels(rows: z.infer<typeof Models>) {
  return rows.filter((m) => !REPACKAGE.test(m.id)).sort((a, b) => (b.trendingScore ?? 0) - (a.trendingScore ?? 0));
}

function authorsLine(authors: { name: string }[] | null | undefined): string | null {
  if (!authors?.length) return null;
  return authors.length > 1 ? `${authors[0].name} +${authors.length - 1}` : authors[0].name;
}

export const huggingface: Source = {
  id: "huggingface",
  ...SOURCE_META.huggingface,
  async run({ db }) {
    const [papers, models] = await Promise.all([
      fetchJson("https://huggingface.co/api/daily_papers?limit=100", Papers),
      fetchJson("https://huggingface.co/api/models?sort=trendingScore&limit=50", Models),
    ]);
    const now = Date.now();
    const top = topPapers(papers, now).slice(0, MAX_PAPERS);
    const trend = trendingModels(models).slice(0, MAX_MODELS);
    if (!top.length && !trend.length) throw new Error("Hugging Face returned no papers or models");
    let n = 0;
    if (top.length)
      n += replaceItems(
        db,
        "hf_papers",
        top.map((p) => ({
          id: p.id,
          title: p.title.replace(/\s+/g, " ").trim(),
          url: `https://huggingface.co/papers/${p.id}`,
          ts: p.day || null,
          data: {
            en: p.title.replace(/\s+/g, " ").trim(),
            upvotes: p.upvotes ?? 0,
            comments: p.comments,
            org: p.organization?.fullname || p.organization?.name || null,
            authors: authorsLine(p.authors),
            github: p.githubRepo || null,
          } satisfies HfPaper,
        })),
      );
    if (trend.length)
      n += replaceItems(
        db,
        "hf_models",
        trend.map((m) => ({
          id: m.id,
          title: m.id,
          url: `https://huggingface.co/${m.id}`,
          ts: Date.parse(m.createdAt ?? "") || null,
          data: { likes: m.likes ?? 0, downloads: m.downloads ?? 0, task: m.pipeline_tag ?? null } satisfies HfModel,
        })),
      );
    return n;
  },
};
