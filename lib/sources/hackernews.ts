import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { replaceItems } from "./store";
import type { Source } from "./types";

// Hacker News front page via Algolia (one call instead of 30 Firebase calls).

const Resp = z.object({
  hits: z.array(
    z.object({
      objectID: z.string(),
      title: z.string().nullish(),
      url: z.string().nullish(),
      points: z.number().nullish(),
      num_comments: z.number().nullish(),
      created_at_i: z.number(),
    }),
  ),
});

export const hackernews: Source = {
  id: "hackernews",
  ...SOURCE_META.hackernews,
  async run({ db }) {
    const r = await fetchJson("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30", Resp);
    const top = r.hits
      .filter((h) => h.title)
      .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
      .slice(0, 15);
    return replaceItems(
      db,
      "hn",
      top.map((h) => {
        const hnUrl = `https://news.ycombinator.com/item?id=${h.objectID}`;
        return {
          id: h.objectID,
          title: h.title!,
          url: h.url || hnUrl,
          ts: h.created_at_i * 1000,
          data: { points: h.points ?? 0, comments: h.num_comments ?? 0, hnUrl },
        };
      }),
    );
  },
};
