import { brief } from "@/lib/ai/brief";
import { insights } from "@/lib/ai/insights";
import { translate } from "@/lib/ai/translate";
import { airquality } from "./airquality";
import { bis } from "./bis";
import { calendar } from "./calendar";
import { co2 } from "./co2";
import { eonet } from "./eonet";
import { fred } from "./fred";
import { gdacs } from "./gdacs";
import { gdelt } from "./gdelt";
import { gistemp } from "./gistemp";
import { gold } from "./gold";
import { gpr } from "./gpr";
import { gscpi } from "./gscpi";
import { hackernews } from "./hackernews";
import { imf } from "./imf";
import { kalshi } from "./kalshi";
import { launches } from "./launches";
import { polymarket } from "./polymarket";
import { rss } from "./rss";
import type { Source } from "./types";
import { usgs } from "./usgs";
import { vcb } from "./vcb";
import { vnindex } from "./vnindex";
import { who } from "./who";
import { wikipedia } from "./wikipedia";
import { yahoo } from "./yahoo";

// Registry: adding a source = one file + one line here (+ its entry in config/sources.ts).
export const sources: Source[] = [
  // markets & macro
  yahoo,
  fred,
  imf,
  bis,
  gpr,
  gscpi,
  // news & AI
  rss,
  translate,
  brief,
  insights,
  // map
  usgs,
  gdacs,
  eonet,
  gdelt,
  // trending, calendar, prediction
  wikipedia,
  hackernews,
  calendar,
  launches,
  polymarket,
  kalshi,
  // planet & health
  co2,
  gistemp,
  airquality,
  who,
  // Vietnam
  vnindex,
  gold,
  vcb,
];
