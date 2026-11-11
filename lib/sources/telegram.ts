import { z } from "zod";
import { SOURCE_META } from "@/config/sources";
import { ALERTS_STATE_KEY, parseAlertState, planAlerts } from "@/lib/data/alerts";
import type { Source } from "./types";

// Telegram alerts (TODO P1, BR-26, lib/data/alerts.ts): every few minutes,
// send what started since the last run to one chat through a bot. Off until
// TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set in .env.local. The state is
// saved only after every message went out, so a failed send is retried on the
// next run instead of being lost.

const Reply = z.object({ ok: z.boolean(), description: z.string().optional() });

/** POST one HTML message. Errors never carry the bot token (it is part of the URL), since they end up in the UI. */
export async function sendTelegram(token: string, chatId: string, html: string): Promise<void> {
  const hide = (s: string) => s.split(token).join("<token>");
  let res: Response;
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new Error(hide(`Telegram unreachable: ${err instanceof Error ? err.message : String(err)}`));
  }
  const body = Reply.safeParse(await res.json().catch(() => null));
  if (!res.ok || !body.success || !body.data.ok) {
    throw new Error(hide(`Telegram HTTP ${res.status}: ${body.success ? (body.data.description ?? "not ok") : "unexpected response"}`));
  }
}

export const telegram: Source = {
  id: "telegram",
  ...SOURCE_META.telegram,
  async run({ db, log }) {
    const token = process.env.TELEGRAM_BOT_TOKEN!;
    const chatId = process.env.TELEGRAM_CHAT_ID!;
    const now = Date.now();
    const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(ALERTS_STATE_KEY) as { value: string | null } | undefined;
    const prev = parseAlertState(row?.value);
    const { messages, next, lines } = planAlerts(db, prev, now);
    for (const m of messages) await sendTelegram(token, chatId, m);
    db.prepare("INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(
      ALERTS_STATE_KEY,
      JSON.stringify(next),
      now,
    );
    log(prev ? `${lines} alerts in ${messages.length} messages` : `first run: "alerts on" sent with ${lines} conditions in force`);
    return lines;
  },
};
