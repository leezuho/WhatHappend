import { brief } from "@/lib/ai/brief";
import { insights } from "@/lib/ai/insights";
import { macronote } from "@/lib/ai/macronote";
import { technote } from "@/lib/ai/technote";
import { translate } from "@/lib/ai/translate";
import { airquality } from "./airquality";
import { binance } from "./binance";
import { etfflows } from "./etfflows";
import { bis } from "./bis";
import { calendar } from "./calendar";
import { releases } from "./releases";
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
import { ibge } from "./ibge";
import { imf } from "./imf";
import { imfcpi } from "./imfcpi";
import { kalshi } from "./kalshi";
import { kev } from "./kev";
import { twse } from "./twse";
import { hnhiring } from "./hnhiring";
import { eol } from "./eol";
import { arena } from "./arena";
import { lobsters } from "./lobsters";
import { spaceweather } from "./spaceweather";
import { pkgtrends } from "./pkgtrends";
import { epoch } from "./epoch";
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
import { vnstocks } from "./vnstocks";
import { vnflows } from "./vnflows";
import { sbvrate } from "./sbvrate";
import { petrolimex } from "./petrolimex";
import { ibrate } from "./ibrate";
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
  ibge,
  gpr,
  gscpi,
  // news & AI
  rss,
  translate,
  brief,
  insights,
  macronote,
  technote,
  // map
  usgs,
  gdacs,
  eonet,
  gdelt,
  // trending, calendar, prediction
  wikipedia,
  hackernews,
  calendar,
  releases,
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
  vnstocks,
  vnflows,
  sbvrate,
  petrolimex,
  ibrate,
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
  etfflows,
  // technology
  cloudstatus,
  openrouter,
  huggingface,
  kev,
  twse,
  hnhiring,
  eol,
  arena,
  lobsters,
  spaceweather,
  pkgtrends,
  epoch,
];
