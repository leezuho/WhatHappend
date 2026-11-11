import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { chokepointRows, gprHeatmap, type ChokepointRow, type GprRow } from "@/lib/data/geopolitics";
import { getItems, type Item } from "@/lib/queries";
import type { Locale } from "@/lib/i18n";
import type { PolicyData } from "@/lib/sources/uspolicy";

// Read side of the overview's geopolitical row (config/geopolitics.ts). Same
// rules as lib/queries.ts: synchronous SQLite reads behind connection().

export async function getChokepoints(): Promise<ChokepointRow[]> {
  await connection();
  return chokepointRows(getDb());
}

export async function getGprCountries(months = 24): Promise<{ months: number[]; rows: GprRow[] }> {
  await connection();
  return gprHeatmap(getDb(), months);
}

export async function getUsPolicy(lang: Locale): Promise<Item<PolicyData>[]> {
  return getItems<PolicyData>("us_policy", lang, 40);
}
