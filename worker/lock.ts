import { hostname } from "node:os";
import type { DatabaseSync } from "node:sqlite";
import { tx } from "@/lib/db";

// One scheduler per database: a second worker would run every source twice and
// compete for SQLite's write lock. The holder keeps a heartbeat row in `kv`; a
// newcomer takes over only when that heartbeat is stale or, on the same machine,
// when the holding process no longer exists.

const KEY = "worker:lock";

export interface LockHolder {
  pid: number;
  host: string;
}

const me: LockHolder = { pid: process.pid, host: hostname() };
const myValue = JSON.stringify(me);

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists but belongs to another user.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function parseHolder(value: string | null): LockHolder | null {
  try {
    const v = JSON.parse(value ?? "") as Partial<LockHolder>;
    return typeof v.pid === "number" && typeof v.host === "string" ? { pid: v.pid, host: v.host } : null;
  } catch {
    return null;
  }
}

export function acquireWorkerLock(db: DatabaseSync, staleMs: number): { ok: true } | { ok: false; holder: LockHolder } {
  return tx(db, () => {
    const row = db.prepare("SELECT value, updated_at FROM kv WHERE key = ?").get(KEY) as { value: string | null; updated_at: number } | undefined;
    const holder = row ? parseHolder(row.value) : null;
    if (row && holder && Date.now() - row.updated_at < staleMs) {
      // Same pid on the same host means a crashed predecessor whose pid we inherited.
      const gone = holder.host === me.host && (holder.pid === me.pid || !isAlive(holder.pid));
      if (!gone) return { ok: false, holder };
    }
    db.prepare("INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)").run(KEY, myValue, Date.now());
    return { ok: true };
  });
}

/** Refresh the heartbeat. False when another worker has taken the lock over. */
export function refreshWorkerLock(db: DatabaseSync): boolean {
  const res = db.prepare("UPDATE kv SET updated_at = ? WHERE key = ? AND value = ?").run(Date.now(), KEY, myValue);
  return Number(res.changes) > 0;
}

export function releaseWorkerLock(db: DatabaseSync): void {
  db.prepare("DELETE FROM kv WHERE key = ? AND value = ?").run(KEY, myValue);
}
