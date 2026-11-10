import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { replaceItems } from "./store";
import type { Source } from "./types";

// Lobsters' front page (lobste.rs/hottest.json, keyless): a smaller, more
// technical crowd than Hacker News, shown beside it on the tech page.

const Resp = z.array(
  z.object({
    short_id: z.string(),
    title: z.string(),
    url: z.string().nullish(),
    score: z.number(),
    comment_count: z.number(),
    tags: z.array(z.string()),
    comments_url: z.string(),
    created_at: z.string(),
  }),
);

export interface LobstersItem {
  score: number;
  comments: number;
  tags: string[];
  discussion: string;
}

export const lobsters: Source = {
  id: "lobsters",
  ...SOURCE_META.lobsters,
  async run({ db }) {
    const rows = await fetchJson("https://lobste.rs/hottest.json", Resp);
    if (!rows.length) throw new Error("Lobsters returned no stories");
    return replaceItems(
      db,
      "lobsters",
      rows.slice(0, 20).map((r) => ({
        id: r.short_id,
        title: r.title,
        // Text posts have no link of their own: the discussion is the story.
        url: r.url || r.comments_url,
        ts: Date.parse(r.created_at),
        data: { score: r.score, comments: r.comment_count, tags: r.tags, discussion: r.comments_url } satisfies LobstersItem,
      })),
    );
  },
};
