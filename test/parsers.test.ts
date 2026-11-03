import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { parseCsv } from "@/lib/sources/http";
import { unzipFirst } from "@/lib/sources/gdelt";
import { absoluteUrl, normalizeUrl, pickImage, titleKey } from "@/lib/sources/rss";

test("parseCsv: quoted commas, escaped quotes, CRLF, blank lines", () => {
  const csv = 'a,b\r\n"x, y","he said ""hi"""\n\n1,\n2,3';
  assert.deepEqual(parseCsv(csv), [
    ["a", "b"],
    ["x, y", 'he said "hi"'],
    ["1", ""],
    ["2", "3"],
  ]);
});

test("parseCsv: quoted field spanning lines", () => {
  assert.deepEqual(parseCsv('k,v\n"line 1\nline 2",x\n'), [
    ["k", "v"],
    ["line 1\nline 2", "x"],
  ]);
});

/** A one-entry ZIP laid out the way GDELT's exports are (CRC is not checked by unzipFirst). */
function zipOf(content: Buffer, method: 0 | 8, opts: { extra?: number; comment?: string } = {}): Buffer {
  const data = method === 8 ? deflateRawSync(content) : content;
  const name = Buffer.from("20261031.export.CSV");
  const extra = Buffer.alloc(opts.extra ?? 0);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(extra.length, 28);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const comment = Buffer.from(opts.comment ?? "");
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + name.length, 12);
  eocd.writeUInt32LE(local.length + name.length + extra.length + data.length, 16);
  eocd.writeUInt16LE(comment.length, 20);
  return Buffer.concat([local, name, extra, data, central, name, eocd, comment]);
}

test("unzipFirst: stored and deflated entries, extra field, archive comment", () => {
  const tsv = Buffer.from("1\t2\t3\n".repeat(500));
  assert.deepEqual(unzipFirst(zipOf(tsv, 0)), tsv);
  assert.deepEqual(unzipFirst(zipOf(tsv, 8)), tsv);
  assert.deepEqual(unzipFirst(zipOf(tsv, 8, { extra: 12, comment: "gdelt" })), tsv);
});

test("unzipFirst: rejects data that is not a zip", () => {
  assert.throws(() => unzipFirst(Buffer.from("<html>rate limited</html>".padEnd(200, " "))), /not a zip/);
});

test("normalizeUrl: drops tracking params and the fragment, keeps the rest", () => {
  assert.equal(normalizeUrl(" https://news.example/a?id=5&utm_source=rss&ref=home#top "), "https://news.example/a?id=5");
  assert.equal(normalizeUrl("not a url "), "not a url");
});

test("titleKey: matches the same story across outlets and languages' diacritics", () => {
  assert.equal(titleKey("Đà Nẵng: Bão số 5 đổ bộ!"), "da nang bao so 5 do bo");
  assert.equal(titleKey("Fed holds rates — again"), titleKey("FED HOLDS RATES: again!"));
  assert.ok(titleKey("word ".repeat(40)).length <= 80);
});

test("absoluteUrl: resolves feed-relative links, rejects non-web schemes", () => {
  assert.equal(absoluteUrl("/den-luot-lisk/", "https://coin68.com/rss/tin-moi-nhat.rss"), "https://coin68.com/den-luot-lisk/");
  assert.equal(absoluteUrl(" https://a.example/x ", "https://b.example/feed"), "https://a.example/x");
  assert.equal(absoluteUrl("javascript:alert(1)", "https://b.example/feed"), null);
  assert.equal(absoluteUrl("", "https://b.example/feed"), null);
  assert.equal(absoluteUrl(undefined, "https://b.example/feed"), null);
});

test("pickImage: widest media wins, relative paths resolve, http upgrades, non-images skipped", () => {
  const base = "https://news.example/rss";
  const m = (url: string, width?: number, medium?: string) => ({ $: { url, width: width === undefined ? undefined : String(width), medium } });
  // The Guardian: same photo at 140 / 460 / 700 px.
  assert.equal(pickImage({ media: [m("https://i.example/p?w=140", 140), m("https://i.example/p?w=700", 700), m("https://i.example/p?w=460", 460)] }, base), "https://i.example/p?w=700");
  assert.equal(pickImage({ media: [m("/images/og.png", 1200)] }, "https://coin68.com/rss/x.rss"), "https://coin68.com/images/og.png");
  assert.equal(pickImage({ thumbs: [m("http://cdn.example/t.jpg")] }, base), "https://cdn.example/t.jpg");
  assert.equal(pickImage({ media: [m("https://v.example/clip.mp4", 1920, "video")], enclosure: { url: "https://i.example/e.jpg", type: "image/jpeg" } }, base), "https://i.example/e.jpg");
  assert.equal(pickImage({ enclosure: { url: "https://a.example/pod.mp3", type: "audio/mpeg" } }, base), null);
  assert.equal(pickImage({}, base), null);
});
