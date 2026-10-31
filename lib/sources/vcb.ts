import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { fetchJson } from "./http";
import { replaceItems, upsertSeries } from "./store";
import type { Source } from "./types";

// Vietcombank board rates (cash buy / transfer buy / sell), VND per unit.

const Resp = z.object({
  UpdatedDate: z.string().nullish(),
  Data: z.array(z.object({ currencyCode: z.string(), currencyName: z.string().nullish(), cash: z.string(), transfer: z.string(), sell: z.string() })),
});

const WANTED = ["USD", "EUR", "JPY", "CNY", "GBP", "KRW", "SGD", "THB", "AUD"];

const num = (s: string) => {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const vcb: Source = {
  id: "vcb",
  ...SOURCE_META.vcb,
  async run({ db }) {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(Date.now());
    const r = await fetchJson(`https://www.vietcombank.com.vn/api/exchangerates?date=${date}`, Resp);
    const rows = WANTED.flatMap((code) => {
      const x = r.Data.find((d) => d.currencyCode.trim() === code);
      return x ? [{ code, cash: num(x.cash), transfer: num(x.transfer), sell: num(x.sell) }] : [];
    });
    if (!rows.length) throw new Error("no currencies in Vietcombank response");
    const now = Date.now();
    let written = replaceItems(db, "vcb", rows.map((x) => ({ id: x.code, title: x.code, ts: now, data: x })));
    const usd = rows.find((x) => x.code === "USD");
    if (usd?.sell) written += upsertSeries(db, "vcb:USD:sell", "vcb", [{ ts: Date.parse(`${date}T00:00:00Z`), value: usd.sell }]);
    return written;
  },
};
