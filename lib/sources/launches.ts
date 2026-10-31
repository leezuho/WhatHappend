import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { replaceItems } from "./store";
import type { Source } from "./types";

// Upcoming orbital launches from The Space Devs Launch Library 2. The free tier
// allows 15 requests per hour, hence the 3-hour interval.

const Name = z.object({ name: z.string().nullish() }).passthrough().nullish();
const Launch = z.object({
  id: z.string(),
  name: z.string(),
  net: z.string(),
  net_precision: Name,
  status: z.object({ name: z.string().nullish(), abbrev: z.string().nullish() }).nullish(),
  launch_service_provider: Name,
  rocket: z.object({ configuration: z.object({ full_name: z.string().nullish() }).passthrough().nullish() }).passthrough().nullish(),
  mission: z.object({ name: z.string().nullish(), orbit: Name }).passthrough().nullish(),
  pad: z
    .object({
      name: z.string().nullish(),
      location: z.object({ name: z.string().nullish(), country_code: z.string().nullish() }).passthrough().nullish(),
      country: z.object({ alpha_2_code: z.string().nullish() }).passthrough().nullish(),
    })
    .passthrough()
    .nullish(),
  image: z.union([z.object({ image_url: z.string().nullish(), thumbnail_url: z.string().nullish() }).passthrough(), z.string()]).nullish(),
  webcast_live: z.boolean().nullish(),
});
const Resp = z.object({ results: z.array(Launch) });

const DONE = new Set(["Success", "In Flight", "Failure", "Partial Failure"]);

export const launches: Source = {
  id: "launches",
  ...SOURCE_META.launches,
  async run({ db }) {
    const r = await fetchJson("https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=12", Resp, { timeoutMs: 30_000 });
    const keep = r.results.filter((l) => !DONE.has(l.status?.abbrev ?? "")).slice(0, 8);
    return replaceItems(
      db,
      "launch",
      keep.map((l) => ({
        id: l.id,
        title: l.name,
        url: null,
        ts: Date.parse(l.net) || null,
        data: {
          provider: l.launch_service_provider?.name ?? null,
          rocket: l.rocket?.configuration?.full_name ?? null,
          mission: l.mission?.name ?? null,
          orbit: l.mission?.orbit?.name ?? null,
          pad: l.pad?.location?.name ?? null,
          country: l.pad?.country?.alpha_2_code ?? l.pad?.location?.country_code ?? null,
          status: l.status?.abbrev ?? null,
          precision: l.net_precision?.name ?? null,
          image: typeof l.image === "string" ? l.image : (l.image?.thumbnail_url ?? l.image?.image_url ?? null),
          webcast: l.webcast_live ?? false,
        },
      })),
    );
  },
};
