import { cache } from "react";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { packageRows, techStockRows, type PackageRow, type TechStockRow } from "@/lib/data/tech";
import { aiStatus } from "@/lib/ai/config";
import { TECH_NOTE_KEY, type StoredTechNote } from "@/lib/ai/technote-shared";
import type { NoteView } from "@/lib/ai/macronote-shared";
import type { Locale } from "@/lib/i18n";


export type { TechStockRow } from "@/lib/data/tech";

// Read side of the technology page (app/[lang]/tech) beyond the generic
// getItems() and getTechNews() in lib/queries.ts. Same rules: synchronous
// SQLite reads behind connection().

/** The stock table, once per request. */
export const getTechStocks = cache(async (): Promise<TechStockRow[]> => {
  await connection();
  return techStockRows(getDb());
});

/** Latest value of Indeed's all-industry postings index (FRED IHLIDXUS), the yardstick for the software postings tile. */
export async function getAllPostings(): Promise<number | null> {
  await connection();
  const row = getDb().prepare("SELECT value FROM observations WHERE series_id = 'fred:IHLIDXUS' ORDER BY ts DESC LIMIT 1").get() as { value: number } | undefined;
  return row?.value ?? null;
}

/** The latest weekly tech note (lib/ai/technote.ts) in the page's language, and whether an AI key is set. */
export async function getTechNote(lang: Locale): Promise<{ note: NoteView | null; hasKey: boolean }> {
  await connection();
  const row = getDb().prepare("SELECT value FROM kv WHERE key = ?").get(TECH_NOTE_KEY) as { value: string | null } | undefined;
  const stored = row?.value ? (JSON.parse(row.value) as StoredTechNote) : null;
  return {
    note: stored ? { text: stored[lang], week: stored.week, createdAt: stored.createdAt, model: stored.model } : null,
    hasKey: aiStatus().ok,
  };
}

export async function getPackages(): Promise<PackageRow[]> {
  await connection();
  return packageRows(getDb());
}
