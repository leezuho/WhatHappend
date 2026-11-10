import { cache } from "react";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { techStockRows, type TechStockRow } from "@/lib/data/tech";

export type { TechStockRow } from "@/lib/data/tech";

// Read side of the technology page (app/[lang]/tech) beyond the generic
// getItems() and getTechNews() in lib/queries.ts. Same rules: synchronous
// SQLite reads behind connection().

/** The stock table, once per request. */
export const getTechStocks = cache(async (): Promise<TechStockRow[]> => {
  await connection();
  return techStockRows(getDb());
});
