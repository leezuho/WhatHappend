import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { replaceItems } from "./store";
import type { Source } from "./types";

// VnExpress "Xem nhiều": its most-read articles of the last 24 hours, the list
// behind vnexpress.net/tin-xem-nhieu. VnExpress is the most-read Vietnamese news
// site, so this is what Vietnamese readers actually open. Undocumented endpoint
// of the site's own gateway (type=1 is the last 24 hours; type=2 is a list frozen
// in 2021), so a change of shape fails the run.

const ENDPOINT =
  "https://gw.vnexpress.net/mv?site_id=1000000&category_id=1000000&type=1&limit=20&data_select=article_id,title,share_url,publish_time,article_category";

const Resp = z.object({
  data: z.record(
    z.string(),
    z.object({
      data: z.array(
        z.object({
          article_id: z.number(),
          title: z.string().min(1),
          share_url: z.string().startsWith("https://"),
          publish_time: z.number(),
          article_category: z.object({ cate_name: z.string() }).nullish(),
        }),
      ),
    }),
  ),
});

export interface VnExpressItem {
  category: string | null;
}

export const vnexpress: Source = {
  id: "vnexpress",
  ...SOURCE_META.vnexpress,
  async run({ db }) {
    const list = (await fetchJson(ENDPOINT, Resp)).data["1000000"]?.data ?? [];
    if (!list.length) throw new Error("VnExpress most-read list is empty");
    return replaceItems(
      db,
      "vne_top",
      list.slice(0, 15).map((a) => ({
        id: String(a.article_id),
        title: a.title,
        url: a.share_url,
        ts: a.publish_time * 1000,
        data: { category: a.article_category?.cate_name ?? null } satisfies VnExpressItem,
      })),
    );
  },
};
