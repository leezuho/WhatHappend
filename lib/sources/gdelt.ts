import { inflateRawSync } from "node:zlib";
import { SOURCE_META } from "@/config/sources";
import { fetchBuffer, fetchText } from "./http";
import { upsertEvents } from "./store";
import type { Source } from "./types";

// Conflict and protest hotspots from the GDELT 2.0 events export (a new zipped
// TSV every 15 minutes). The DOC API rate-limits us to nothing and the GEO API
// is gone, so we read the raw export, keep protest/assault/fight/mass-violence
// events, and bucket them on a 1° grid weighted by media mentions.

const ROOTS: Record<string, { en: string; vi: string }> = {
  "14": { en: "Protest", vi: "Biểu tình" },
  "18": { en: "Assault", vi: "Tấn công" },
  "19": { en: "Fighting", vi: "Giao tranh" },
  "20": { en: "Mass violence", vi: "Bạo lực quy mô lớn" },
};
const COL = { root: 28, mentions: 31, place: 52, lat: 56, lng: 57, url: 60 };
const TOP = 60;
const KEEP_MS = 24 * 3600_000;

/** Extract the first file of a ZIP archive (stored or deflated) without a dependency. */
export function unzipFirst(zip: Buffer): Buffer {
  // End of central directory: signature 0x06054b50, searched from the end (comment ≤ 64 KB).
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65_535); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip (no end-of-central-directory record)");
  const cdOffset = zip.readUInt32LE(eocd + 16);
  if (zip.readUInt32LE(cdOffset) !== 0x02014b50) throw new Error("zip central directory not found");
  const method = zip.readUInt16LE(cdOffset + 10);
  const compressedSize = zip.readUInt32LE(cdOffset + 20);
  const localOffset = zip.readUInt32LE(cdOffset + 42);
  if (zip.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("zip local header not found");
  const nameLen = zip.readUInt16LE(localOffset + 26);
  const extraLen = zip.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLen + extraLen;
  const data = zip.subarray(start, start + compressedSize);
  if (method === 0) return Buffer.from(data);
  if (method === 8) return inflateRawSync(data);
  throw new Error(`unsupported zip compression method ${method}`);
}

interface Bucket {
  mentions: number;
  top: number;
  place: string;
  root: string;
  url: string;
  lat: number;
  lng: number;
}

export const gdelt: Source = {
  id: "gdelt",
  ...SOURCE_META.gdelt,
  async run({ db }) {
    const index = await fetchText("http://data.gdeltproject.org/gdeltv2/lastupdate.txt");
    const exportUrl = index
      .split("\n")
      .map((l) => l.trim().split(/\s+/)[2])
      .find((u) => u?.endsWith(".export.CSV.zip"));
    if (!exportUrl) throw new Error("no export URL in lastupdate.txt");

    const tsv = unzipFirst(await fetchBuffer(exportUrl, { timeoutMs: 60_000 })).toString("utf8");
    const buckets = new Map<string, Bucket>();
    for (const line of tsv.split("\n")) {
      const c = line.split("\t");
      if (c.length < 61 || !ROOTS[c[COL.root]]) continue;
      const lat = Number(c[COL.lat]);
      const lng = Number(c[COL.lng]);
      if (!c[COL.lat] || !c[COL.lng] || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      const mentions = Number(c[COL.mentions]) || 1;
      const key = `${Math.round(lat)}:${Math.round(lng)}`;
      const b = buckets.get(key);
      if (!b) {
        buckets.set(key, { mentions, top: mentions, place: c[COL.place], root: c[COL.root], url: c[COL.url].trim(), lat, lng });
      } else {
        b.mentions += mentions;
        if (mentions > b.top) Object.assign(b, { top: mentions, place: c[COL.place], root: c[COL.root], url: c[COL.url].trim(), lat, lng });
      }
    }

    const now = Date.now();
    const top = [...buckets.entries()].sort((a, b) => b[1].mentions - a[1].mentions).slice(0, TOP);
    const written = upsertEvents(
      db,
      "gdelt",
      top.map(([key, b]) => {
        const label = ROOTS[b.root];
        const place = b.place || "Unknown";
        return {
          id: `gdelt:${key}`,
          type: b.root === "14" ? "protest" : "conflict",
          title: `${label.en} — ${place}`,
          titleVi: `${label.vi} — ${place}`,
          lat: b.lat,
          lng: b.lng,
          severity: b.mentions,
          level: null,
          url: b.url || null,
          ts: now,
        };
      }),
    );
    db.prepare("DELETE FROM events WHERE source = 'gdelt' AND ts < ?").run(now - KEEP_MS);
    return written;
  },
};
