import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

// One SQLite file shared by the worker (writer) and the Next.js server (reader).
// WAL lets both processes work at once.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS series (
  id         TEXT PRIMARY KEY,          -- 'yahoo:^GSPC', 'fred:DGS10', ...
  source     TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS observations (
  series_id TEXT NOT NULL,
  ts        INTEGER NOT NULL,           -- ms epoch (daily points: 00:00 UTC)
  value     REAL NOT NULL,
  PRIMARY KEY (series_id, ts)
) WITHOUT ROWID;

-- Latest live snapshot for instruments that trade intraday.
CREATE TABLE IF NOT EXISTS quotes (
  series_id    TEXT PRIMARY KEY,
  price        REAL NOT NULL,
  change       REAL,
  change_pct   REAL,
  market_state TEXT,
  ts           INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS articles (
  id           TEXT PRIMARY KEY,        -- hash of normalized url
  url          TEXT NOT NULL,
  source       TEXT NOT NULL,           -- 'BBC', 'VnExpress', ...
  lang         TEXT NOT NULL,           -- language of the original title
  region       TEXT,
  topic        TEXT,
  title        TEXT NOT NULL,
  title_en     TEXT,
  title_vi     TEXT,
  title_key    TEXT NOT NULL,           -- normalized title, for cross-source dedupe
  summary      TEXT,
  image        TEXT,
  published_at INTEGER NOT NULL,
  fetched_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS articles_published ON articles (published_at DESC);
CREATE INDEX IF NOT EXISTS articles_title_key ON articles (title_key);

-- Geolocated things for the map: quakes, disasters, news hotspots.
CREATE TABLE IF NOT EXISTS events (
  id       TEXT PRIMARY KEY,            -- 'usgs:us7000abcd'
  source   TEXT NOT NULL,
  type     TEXT NOT NULL,               -- 'earthquake', 'cyclone', 'wildfire', 'conflict', ...
  title    TEXT NOT NULL,
  title_vi TEXT,
  lat      REAL NOT NULL,
  lng      REAL NOT NULL,
  severity REAL,                        -- source-specific magnitude (e.g. Richter)
  level    TEXT,                        -- 'green' | 'orange' | 'red' when the source has one
  url      TEXT,
  ts       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_ts ON events (ts DESC);

-- Snapshot lists replaced wholesale on each run: trending, prediction markets,
-- calendars, launches, outbreak notices...
CREATE TABLE IF NOT EXISTS items (
  kind       TEXT NOT NULL,
  id         TEXT NOT NULL,
  rank       INTEGER NOT NULL,
  title      TEXT NOT NULL,
  title_vi   TEXT,
  url        TEXT,
  ts         INTEGER,
  data       TEXT,                      -- JSON blob, shape depends on kind
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (kind, id)
);

CREATE TABLE IF NOT EXISTS briefs (
  date       TEXT NOT NULL,             -- YYYY-MM-DD in Asia/Ho_Chi_Minh
  lang       TEXT NOT NULL,
  content    TEXT NOT NULL,             -- JSON: { headline, bullets: [{title, body}] }
  created_at INTEGER NOT NULL,
  PRIMARY KEY (date, lang)
);

-- Plain-language AI notes for indicators that stand out (lib/signals/notable.ts).
CREATE TABLE IF NOT EXISTS insights (
  key        TEXT PRIMARY KEY,          -- SERIES key, e.g. 'brent'
  basis      TEXT NOT NULL,             -- reasons it was written for, e.g. 'crit+move'
  content    TEXT NOT NULL,             -- JSON: { en, vi, sources: [{title, url, source}], model }
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS source_status (
  source   TEXT PRIMARY KEY,
  ok       INTEGER NOT NULL,
  error    TEXT,
  count    INTEGER,
  last_run INTEGER NOT NULL,
  last_ok  INTEGER
);

CREATE TABLE IF NOT EXISTS fetch_log (
  id          INTEGER PRIMARY KEY,
  source      TEXT NOT NULL,
  ok          INTEGER NOT NULL,
  count       INTEGER,
  error       TEXT,
  duration_ms INTEGER,
  at          INTEGER NOT NULL
);

-- Small flags shared between the web server and the worker (e.g. "regenerate brief").
CREATE TABLE IF NOT EXISTS kv (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS watchlist (
  series_id  TEXT PRIMARY KEY,
  added_at   INTEGER NOT NULL
);
`;

const globalForDb = globalThis as unknown as { __whDb?: DatabaseSync };

/** Open a database (created if missing) with the pragmas and schema applied. Tests pass ":memory:". */
export function openDb(file: string): DatabaseSync {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;");
  db.exec(SCHEMA);
  return db;
}

/** The process-wide connection (cached on globalThis so it survives Next dev HMR). */
export function getDb(): DatabaseSync {
  if (globalForDb.__whDb) return globalForDb.__whDb;
  const db = openDb(process.env.DB_PATH || path.join(process.cwd(), "data", "whathappend.db"));
  globalForDb.__whDb = db;
  return db;
}

export function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
