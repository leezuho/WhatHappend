import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { replaceItems } from "./store";
import type { Source } from "./types";

// WHO Disease Outbreak News (the old RSS feed is gone). The API defaults to
// oldest-first, so $orderby is required; $select keeps the payload tiny.

const Resp = z.object({
  value: z.array(
    z.object({
      Title: z.string().nullish(),
      OverrideTitle: z.string().nullish(),
      UseOverrideTitle: z.boolean().nullish(),
      PublicationDateAndTime: z.string(),
      UrlName: z.string(),
      DonId: z.string().nullish(),
    }),
  ),
});

const URL =
  "https://www.who.int/api/news/diseaseoutbreaknews?$select=Title,OverrideTitle,UseOverrideTitle,PublicationDateAndTime,UrlName,DonId&$orderby=PublicationDateAndTime%20desc&$top=8";

export const who: Source = {
  id: "who",
  ...SOURCE_META.who,
  async run({ db }) {
    const r = await fetchJson(URL, Resp, { timeoutMs: 30_000 });
    return replaceItems(
      db,
      "who",
      r.value.map((d) => ({
        id: d.DonId || d.UrlName,
        title: ((d.UseOverrideTitle && d.OverrideTitle) || d.Title || d.UrlName).trim(),
        url: `https://www.who.int/emergencies/disease-outbreak-news/item/${d.UrlName}`,
        ts: Date.parse(d.PublicationDateAndTime) || null,
      })),
    );
  },
};
