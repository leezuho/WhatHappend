import { brief } from "@/lib/ai/brief";
import { insights } from "@/lib/ai/insights";
import { macronote } from "@/lib/ai/macronote";
import { translate } from "@/lib/ai/translate";
import { airquality } from "./airquality";
import { binance } from "./binance";
import { bis } from "./bis";
import { calendar } from "./calendar";
import { cloudstatus } from "./cloudstatus";
import { cnbc } from "./cnbc";
import { co2 } from "./co2";
import { coingecko } from "./coingecko";
import { defillama } from "./defillama";
import { deribit } from "./deribit";
import { eonet } from "./eonet";
import { fng } from "./fng";
import { fred } from "./fred";
import { gdacs } from "./gdacs";
import { gdelt } from "./gdelt";
import { gistemp } from "./gistemp";
import { gpr } from "./gpr";
import { gscpi } from "./gscpi";
import { hackernews } from "./hackernews";
import { huggingface } from "./huggingface";
import { imf } from "./imf";
import { imfcpi } from "./imfcpi";
import { kalshi } from "./kalshi";
import { kev } from "./kev";
import { launches } from "./launches";
import { mempool } from "./mempool";
import { oecd } from "./oecd";
import { openrouter } from "./openrouter";
import { polymarket } from "./polymarket";
import { rss } from "./rss";
import { sbv } from "./sbv";
import { sjc } from "./sjc";
import type { Source } from "./types";
import { usgs } from "./usgs";
import { vcb } from "./vcb";
import { vnindex } from "./vnindex";
import { who } from "./who";
import { wikipedia } from "./wikipedia";
import { worldbank } from "./worldbank";
import { yahoo } from "./yahoo";

// Registry: adding a source = one file + one line here (+ its entry in config/sources.ts).
export const sources: Source[] = [
  // markets & macro
  yahoo,
  fred,
  imf,
  bis,
  oecd,
  imfcpi,
  worldbank,
  cnbc,
  gpr,
  gscpi,
  // news & AI
  rss,
  translate,
  brief,
  insights,
  macronote,
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
  sjc,
  vcb,
  sbv,
  // crypto
  coingecko,
  fng,
  deribit,
  defillama,
  mempool,
  binance,
  // technology
  cloudstatus,
  openrouter,
  huggingface,
  kev,
];
