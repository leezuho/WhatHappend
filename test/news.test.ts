import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "@/lib/db";
import { sameTitleUrls, topStories } from "@/lib/data/news";

const H = 3_600_000;
const NOW = Date.UTC(2026, 10, 16, 7);

const story = (id: string, hoursAgo: number, outlets: number, extra: { topic?: string; related?: string[] } = {}) => ({
  id,
  url: `https://x.test/${id}`,
  source: "BBC",
  title: id,
  image: null,
  publishedAt: NOW - hoursAgo * H,
  topic: extra.topic ?? "politics",
  alsoIn: Array.from({ length: outlets - 1 }, (_, i) => `Outlet ${i}`),
  related: (extra.related ?? []).map((u) => ({ title: u, source: "AP", url: u })),
});

test("topStories: most widely carried first, newest breaking ties, only from `since`, sports out", () => {
  const items = [
    story("fresh-single", 1, 1),
    story("wide", 5, 4),
    story("tie-new", 2, 2),
    story("tie-old", 6, 2),
    story("match", 3, 6, { topic: "sports" }),
    story("too-old", 30, 9),
  ];
  assert.deepEqual(
    topStories(items, NOW - 24 * H, 4).map((s) => s.id),
    ["wide", "tie-new", "tie-old", "fresh-single"],
  );
  assert.deepEqual(
    topStories(items, NOW - 24 * H, 2).map((s) => s.id),
    ["wide", "tie-new"],
  );
});

test("topStories: a story the brief cites is left out, by its own URL or a folded headline's", () => {
  const items = [story("cited", 1, 5), story("folded", 1, 4, { related: ["https://x.test/old-cited"] }), story("new", 1, 2)];
  const cited = new Set(["https://x.test/cited", "https://x.test/old-cited"]);
  assert.deepEqual(
    topStories(items, NOW - 24 * H, 5, cited).map((s) => s.id),
    ["new"],
  );
});

test("sameTitleUrls: the cited URLs plus every copy of the same headline", () => {
  const db = openDb(":memory:");
  const ins = db.prepare("INSERT INTO articles (id, url, source, lang, title, title_key, published_at, fetched_at) VALUES (?, ?, ?, 'en', ?, ?, ?, ?)");
  ins.run("1", "https://a.test/1", "CNBC", "Nvidia board weighs CEO", "nvidia board weighs ceo", NOW, NOW);
  ins.run("2", "https://b.test/2", "Yahoo", "Nvidia board weighs CEO", "nvidia board weighs ceo", NOW, NOW);
  ins.run("3", "https://c.test/3", "BBC", "UK economy grows", "uk economy grows", NOW, NOW);
  assert.deepEqual(sameTitleUrls(db, ["https://a.test/1"]).sort(), ["https://a.test/1", "https://b.test/2"]);
  assert.deepEqual(sameTitleUrls(db, ["https://gone.test/x"]), ["https://gone.test/x"]);
  assert.deepEqual(sameTitleUrls(db, []), []);
});
