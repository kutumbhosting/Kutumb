import "dotenv/config";
import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn(
    "⚠️  DATABASE_URL is not set — the new admin login, payments, ticketing, " +
    "and check-in modules won't work until you add a Neon connection string " +
    "to .env. The rest of the Kutumb site is unaffected."
  );
}

// node-postgres re-parses `connectionString` and lets any SSL mode embedded
// in it (e.g. ?sslmode=require) overwrite an explicit `ssl` option we also
// pass, which can crash the driver. Strip it out and set SSL explicitly.
export function stripSslParams(connectionString) {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    url.searchParams.delete("ssl");
    return url.toString();
  } catch {
    return connectionString;
  }
}

export function buildPoolConfig(rawUrl) {
  const connectionString = rawUrl ? stripSslParams(rawUrl) : rawUrl;
  const isLocal = connectionString?.includes("localhost") || connectionString?.includes("127.0.0.1");
  return { connectionString, ssl: isLocal ? false : { rejectUnauthorized: false } };
}

/* ───────────────────────────────────────────────────────────────────────
   Database failover (main Neon database + optional standby databases)

   DATABASE_URL            main database                      → number 0
   DATABASE_STANDBY_URLS   extra connection strings (comma or newline
                           separated, e.g. a second Neon account) → 1, 2, …
   DATABASE_ACTIVE_INDEX   which one to start on (default 0)

   New connections use the active database. When it can't be reached or is
   out of quota (Neon's "compute time quota exceeded" / "too many
   connections" / suspended project), the next one is tried and becomes the
   active one. Failover happens ONLY while a connection is being opened,
   never in the middle of a query, so a write is never silently repeated.
   The copying of data between databases lives in db/dbsync.js.

   With no DATABASE_STANDBY_URLS this behaves exactly like a plain pg Pool.
   ─────────────────────────────────────────────────────────────────────── */

const DATA_DIR = process.env.DATA_ROOT || path.join(process.cwd(), "server/data");
const MARKER_FILE = path.join(DATA_DIR, "db-active.json");
const BAD_FOR_MS = 10 * 60_000;
const POOL_MAX = Number(process.env.DB_POOL_MAX) || 10;

function parseUrls() {
  const main = process.env.DATABASE_URL;
  const extra = (process.env.DATABASE_STANDBY_URLS || "")
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return main ? [main, ...extra] : extra;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "(invalid url)";
  }
}

function initialActive(count) {
  const fromEnv = process.env.DATABASE_ACTIVE_INDEX;
  if (fromEnv !== undefined && fromEnv !== "") {
    const n = Number(fromEnv);
    return Number.isInteger(n) && n >= 0 && n < count ? n : 0;
  }
  // No explicit choice: remember where the last run ended up, so a restart
  // while on a standby does not jump back to a main database whose data is
  // older (the fail-back merge in dbsync.js brings it up to date first).
  try {
    const n = JSON.parse(fs.readFileSync(MARKER_FILE, "utf8")).active;
    if (Number.isInteger(n) && n > 0 && n < count) return n;
  } catch { /* no marker yet */ }
  return 0;
}

const urls = parseUrls();

export const failover = {
  urls,
  active: initialActive(urls.length),
  badUntil: new Map(),
  events: new EventEmitter(),
  get enabled() {
    return urls.length > 1;
  },
  status() {
    return {
      active: this.active,
      count: urls.length,
      hosts: urls.map(hostOf),
      markedUnusable: [...this.badUntil.entries()]
        .filter(([, t]) => t > Date.now())
        .map(([i, t]) => ({ index: i, retryAt: new Date(t).toISOString() })),
    };
  },
  /** Make `i` the active database (used by fail-back and by the admin tools). */
  setActive(i, reason = "manual") {
    if (!Number.isInteger(i) || i < 0 || i >= urls.length || i === this.active) return;
    const prev = this.active;
    this.active = i;
    this.badUntil.delete(i);
    rememberActive(i);
    console.error(`DATABASE SWITCH (${reason}): now using database ${i} (${hostOf(urls[i])}), was ${prev}.`);
    this.events.emit("switch", prev, i, reason);
  },
};

function rememberActive(i) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(MARKER_FILE, JSON.stringify({ active: i, at: new Date().toISOString() }));
  } catch { /* best effort only */ }
}

const pools = new Map();

/** The raw pg Pool for database number `i` (created on first use). */
export function getPoolByIndex(i) {
  if (!urls[i]) throw new Error(`No database number ${i} is configured`);
  let p = pools.get(i);
  if (!p) {
    p = new Pool({
      ...buildPoolConfig(urls[i]),
      max: POOL_MAX,
      connectionTimeoutMillis: 20_000,
      keepAlive: true,
    });
    // Neon closes idle connections when the compute sleeps. Without a
    // listener, that "error" event on an idle client would crash Node.
    p.on("error", (err) => console.warn(`Database ${i} idle connection dropped: ${err.message}`));
    pools.set(i, p);
  }
  return p;
}

/** True when a connect failure just means this pool is busy, not that the database is down. */
function isPoolSaturated(p, err) {
  return /timeout exceeded when trying to connect/i.test(err?.message || "") && p.totalCount >= POOL_MAX;
}

async function connectClient() {
  const n = Math.max(urls.length, 1);
  const start = failover.active;
  let last;
  for (let step = 0; step < n; step++) {
    const i = (start + step) % n;
    if (step && (failover.badUntil.get(i) || 0) > Date.now()) continue;
    const p = getPoolByIndex(i);
    try {
      const client = await p.connect();
      if (i !== failover.active) {
        const prev = failover.active;
        failover.active = i;
        rememberActive(i);
        console.error(
          `DATABASE FAILOVER: now using database ${i} (${hostOf(urls[i])}). ` +
          `Set DATABASE_ACTIVE_INDEX=${i} so a restart keeps it.`
        );
        failover.events.emit("failover", prev, i);
      }
      client.kutumbDbIndex = i;
      return client;
    } catch (err) {
      if (isPoolSaturated(p, err)) throw err;
      last = err;
      if (n > 1) {
        failover.badUntil.set(i, Date.now() + BAD_FOR_MS);
        console.warn(`Database ${i} (${hostOf(urls[i])}) not usable: ${String(err.message).slice(0, 160)}`);
      }
    }
  }
  throw last;
}

// An error with a 5-character SQLSTATE came from Postgres itself and leaves
// the connection healthy; anything else (reset, terminated…) means the
// socket is bad and must be discarded rather than returned to the pool.
const isSqlError = (e) => /^[0-9A-Z]{5}$/.test(e?.code || "");

/**
 * Drop-in replacement for the old `new Pool(...)`: same `query`, `connect`
 * and `end`, plus failover when a new connection can't be opened.
 */
export const pool = {
  async query(text, params) {
    const client = await connectClient();
    let broken;
    try {
      return await client.query(text, params);
    } catch (err) {
      if (!isSqlError(err)) broken = err;
      throw err;
    } finally {
      client.release(broken);
    }
  },
  async connect() {
    return connectClient();
  },
  async end() {
    await Promise.all([...pools.values()].map((p) => p.end().catch(() => {})));
    pools.clear();
  },
  on() { return this; },
};

export async function query(text, params) {
  return pool.query(text, params);
}
