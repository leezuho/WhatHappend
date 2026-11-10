import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "@/lib/db";
import { SERIES } from "@/config/series";
import { CRYPTO_OUTLETS } from "@/config/feeds";
import { fmtDelta, fmtValue } from "@/lib/format";
import { recentHeadlines } from "@/lib/ai/brief";
import { pickTopCoins } from "@/lib/sources/coingecko";
import { halvingInfo } from "@/lib/sources/mempool";
import { annualizeFunding, median } from "@/lib/sources/binance";
import { stablecoinPoints } from "@/lib/sources/defillama";
import { pnjQuotes } from "@/lib/sources/sjc";

const coin = (id: string, name: string, price: number, ch7d = 5) => ({
  id,
  symbol: id.slice(0, 3),
  name,
  current_price: price,
  price_change_percentage_7d_in_currency: ch7d,
  sparkline_in_7d: { price: Array.from({ length: 168 }, (_, i) => price + i) },
});

test("pickTopCoins: drops dollar stablecoins, dollar-pegged tokens and wrapped/staked copies, thins the sparkline", () => {
  const rows = pickTopCoins([
    coin("bitcoin", "Bitcoin", 76_000),
    coin("tether", "Tether", 1.0003, 0.01),
    coin("figure-heloc", "Figure Heloc", 1.04, 0.7),
    coin("staked-ether", "Lido Staked Ether", 2_240),
    coin("wrapped-bitcoin", "Wrapped Bitcoin", 76_010),
    coin("weth", "WETH", 2_241),
    coin("tether-gold", "Tether Gold", 4_000, 0.5),
    coin("ethena", "Ethena", 1.01, -12),
  ]);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["bitcoin", "tether-gold", "ethena"],
    "a $1 coin that moved 12% in a week is not a stablecoin",
  );
  assert.ok(rows[0].spark.length <= 43 && rows[0].spark.at(-1) === 76_000 + 167, "keeps the latest point");
});

test("halvingInfo: counts down to the next multiple of 210,000 blocks", () => {
  const now = Date.UTC(2026, 10, 3);
  const h = halvingInfo(974_358, now, 600_000);
  assert.equal(h.height, 1_050_000);
  assert.equal(h.blocksLeft, 75_642);
  assert.equal(h.subsidy, 3.125);
  assert.equal(h.nextSubsidy, 1.5625);
  assert.equal(new Date(h.eta).getUTCFullYear(), 2028);
  assert.equal(halvingInfo(974_358, now, 5).eta, h.eta, "an implausible block time falls back to 10 minutes");
});

test("binance helpers: median of ads, funding as a simple annual rate", () => {
  assert.equal(median([26_070, 25_989, 26_040]), 26_040);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
  assert.ok(Math.abs(annualizeFunding(0.0001) - 10.95) < 1e-9, "0.01% every 8h ≈ 10.95% a year");
});

test("stablecoinPoints: sums every peg in $ billions and keeps ~14 months", () => {
  const now = Date.UTC(2026, 10, 3);
  const pts = stablecoinPoints(
    [
      { date: String(Date.UTC(2020, 0, 1) / 1000), totalCirculatingUSD: { peggedUSD: 5e9 } },
      { date: String(Date.UTC(2026, 10, 2) / 1000), totalCirculatingUSD: { peggedUSD: 296e9, peggedEUR: 1e9 } },
    ],
    now,
  );
  assert.deepEqual(pts, [{ ts: Date.UTC(2026, 10, 2), value: 297 }]);
});

test("pnjQuotes: rows we don't show may have no price; rows we show must", () => {
  const data = [
    { masp: "SJC", tensp: "Vàng miếng SJC 999.9", giaban: 14_060, giamua: 13_760 },
    { masp: "N24K", tensp: "Nhẫn Trơn PNJ 999.9", giaban: 13_890, giamua: 13_490 },
    { masp: "RAW_9999", tensp: "Vàng nguyên liệu", giaban: "", giamua: 12_750 },
  ];
  assert.deepEqual(
    pnjQuotes(data).map((q) => [q.code, q.sell]),
    [
      ["SJL1L10", 140_600_000],
      ["PNJ24K", 138_900_000],
    ],
  );
  assert.throws(() => pnjQuotes([{ masp: "SJC", tensp: "SJC", giaban: "", giamua: 13_760 }]), /PNJ SJC/);
});

test("format: market caps in $ billions, dominance changes in percentage points", () => {
  assert.equal(fmtValue(SERIES.cryptoMcap, 2590.6, "en"), "$2.59T");
  assert.equal(fmtValue(SERIES.stables, 297.1, "en"), "$297B");
  assert.equal(fmtValue(SERIES.cryptoMcap, 2590.6, "vi"), "$2,59 NT", "nghìn tỷ, like the compact numbers in the tables");
  const tile = { value: 59.4, change: 0.25, changePct: null, ts: 0, spark: [] };
  assert.equal(fmtDelta(SERIES.btcDom, tile, "en"), "+0.25 pp");
  assert.equal(fmtDelta(SERIES.us10y, { ...tile, change: 0.05 }, "en"), "+5 bp", "yields still read in basis points");
});

test("recentHeadlines: crypto-only outlets stay out of the world list and come back on request", () => {
  const db = openDb(":memory:");
  const now = Date.now();
  const add = db.prepare(
    "INSERT INTO articles (id, url, source, lang, title, title_key, published_at, fetched_at) VALUES (?, ?, ?, 'en', ?, ?, ?, ?)",
  );
  add.run("a", "https://bbc/a", "BBC", "World story", "world story", now - 60_000, now);
  add.run("b", "https://cd/b", CRYPTO_OUTLETS[0], "Bitcoin story", "bitcoin story", now - 30_000, now);
  assert.deepEqual(
    recentHeadlines(db, now).map((h) => h.source),
    ["BBC"],
  );
  assert.deepEqual(
    recentHeadlines(db, now, 10, "crypto").map((h) => h.source),
    [CRYPTO_OUTLETS[0]],
  );
  db.close();
});
