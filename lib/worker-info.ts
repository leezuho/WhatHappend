// What the running worker says about itself, and the web's verdict on it.
// The worker loads its sources and code once at start (no watch mode outside
// `dev:all`), so a worker started before a change keeps running the old code:
// new sources are never scheduled and fixes have no effect. The worker records
// its source list and the files it imported in `kv`, and on every tick notes any
// of those files edited since it started; the web compares the list with the
// SOURCE_META it was built with and shows a warning strip.

export const WORKER_INFO_KEY = "worker:info";
export const WORKER_LOCK_KEY = "worker:lock";

/** The worker refreshes its lock every 20 s; two minutes of silence means it is gone. */
export const WORKER_DOWN_MS = 2 * 60_000;

export interface WorkerInfo {
  pid: number;
  /** When the process started; code edited after this was not loaded. */
  startedAt: number;
  /** Source ids the worker schedules. */
  sources: string[];
  /** Number of code files the worker watches for edits. */
  files: number;
  /** Code files (repo-relative) edited since the worker started, newest first. */
  changed: string[];
  /** Newest edit time among `changed`. */
  changedAt: number | null;
}

export type WorkerHealth =
  | { state: "ok"; startedAt: number }
  | { state: "down"; lastSeen: number | null }
  /** `info` is null for a worker started before it reported itself, i.e. older code by definition. */
  | { state: "outdated"; startedAt: number | null; unknown: string[]; changed: string[] };

export function parseWorkerInfo(value: string | null | undefined): WorkerInfo | null {
  try {
    const v = JSON.parse(value ?? "") as Partial<WorkerInfo>;
    if (typeof v.pid !== "number" || typeof v.startedAt !== "number" || !Array.isArray(v.sources)) return null;
    return {
      pid: v.pid,
      startedAt: v.startedAt,
      sources: v.sources.filter((s): s is string => typeof s === "string"),
      files: typeof v.files === "number" ? v.files : 0,
      changed: Array.isArray(v.changed) ? v.changed.filter((s): s is string => typeof s === "string") : [],
      changedAt: typeof v.changedAt === "number" ? v.changedAt : null,
    };
  } catch {
    return null;
  }
}

function lockPid(value: string | null): number | null {
  try {
    const v = JSON.parse(value ?? "") as { pid?: unknown };
    return typeof v.pid === "number" ? v.pid : null;
  } catch {
    return null;
  }
}

/**
 * Judge the worker from its lock heartbeat and its self-report.
 * `known` is the web's SOURCE_META ids; `lastRun` the newest source_status.last_run,
 * shown when the worker is down and its lock row is already gone.
 */
export function workerHealth(
  lock: { value: string | null; updated_at: number } | undefined,
  infoValue: string | null | undefined,
  known: readonly string[],
  lastRun: number | null,
  now: number,
): WorkerHealth {
  if (!lock || now - lock.updated_at > WORKER_DOWN_MS) {
    return { state: "down", lastSeen: Math.max(lock?.updated_at ?? 0, lastRun ?? 0) || null };
  }
  const info = parseWorkerInfo(infoValue);
  // A report left by an earlier worker says nothing about the one holding the lock now.
  if (!info || info.pid !== lockPid(lock.value)) return { state: "outdated", startedAt: null, unknown: [], changed: [] };
  const have = new Set(info.sources);
  const unknown = known.filter((id) => !have.has(id));
  if (unknown.length || info.changed.length) return { state: "outdated", startedAt: info.startedAt, unknown, changed: info.changed };
  return { state: "ok", startedAt: info.startedAt };
}
