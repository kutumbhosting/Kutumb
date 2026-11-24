// server/db/dbsync.js
//
// Moving data between the main database (DATABASE_URL = number 0) and the
// standby databases (DATABASE_STANDBY_URLS = numbers 1, 2, …).
//
//   1. WARM COPY  (main → every standby): once every DB_STANDBY_SYNC_HOURS
//      (default 24; 0 = off) while the main database is the active one, so a
//      standby already holds the admin logins, settings, members, events and
//      media when it is needed. It is a MERGE, cheap when little changed.
//   2. FAILOVER   (pool.js): the app moves from A to B. We try once to copy
//      A → B. A database that is out of quota usually cannot be read, in
//      which case B simply carries on with the data it already has.
//   3. FAIL-BACK  (loop below): while a standby is in use, the main database
//      is tried every DB_FAILBACK_MINUTES (default 30; 0 = off). When it
//      accepts connections again, the standby is merged into it, the app
//      switches back, and a second quick pass catches rows written meanwhile.
//
// A copy is a MERGE: rows are inserted or updated by primary key, nothing is
// ever deleted. A row that would break another unique/foreign-key rule is
// skipped and counted. Big binary columns (flyers, videos, statement files)
// are only transferred for rows the target does not have yet.
//
// DB_SYNC_SKIP_TABLES=name1,name2 leaves tables out (e.g. kutumb_media_files).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { failover, getPoolByIndex } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const q = (ident) => `"${String(ident).replace(/"/g, '""')}"`;

export const last = { at: null, results: [] };
let busy = false;

function skipSet() {
  return new Set((process.env.DB_SYNC_SKIP_TABLES || "").split(",").map((s) => s.trim()).filter(Boolean));
}

/** Creates any missing tables/columns in database `i` (schema.sql is idempotent). */
export async function ensureSchema(i) {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await getPoolByIndex(i).query(sql);
}

async function listTables(client) {
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name LIKE 'kutumb\\_%'`
  );
  return rows.map((r) => r.table_name);
}

/** Tables sorted so parents come before the tables that reference them. */
async function sortByDependency(client, tables) {
  const { rows } = await client.query(
    `SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
       FROM pg_constraint c WHERE c.contype = 'f'`
  );
  const set = new Set(tables);
  const deps = new Map(tables.map((t) => [t, new Set()]));
  for (const { child, parent } of rows) {
    const c = child.replace(/"/g, "");
    const p = parent.replace(/"/g, "");
    if (set.has(c) && set.has(p) && c !== p) deps.get(c).add(p);
  }
  const out = [];
  const done = new Set();
  const visit = (t, stack = new Set()) => {
    if (done.has(t) || stack.has(t)) return;
    stack.add(t);
    for (const d of deps.get(t)) visit(d, stack);
    done.add(t);
    out.push(t);
  };
  tables.forEach((t) => visit(t));
  return out;
}

async function describeTable(client, table) {
  const { rows: cols } = await client.query(
    `SELECT a.attname AS name, a.attgenerated <> '' AS generated, a.attidentity AS identity,
            format_type(a.atttypid, a.atttypmod) AS type
       FROM pg_attribute a
      WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attnum`,
    [q(table)]
  );
  const { rows: pk } = await client.query(
    `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type
       FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
      WHERE i.indrelid = $1::regclass AND i.indisprimary`,
    [q(table)]
  );
  return { cols, pk };
}

/** Streams `selectSql` from src as JSON rows in batches (server-side cursor, so memory stays small). */
async function* streamRows(src, selectSql, params, batch) {
  await src.query("BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ");
  try {
    await src.query(`DECLARE kc NO SCROLL CURSOR FOR ${selectSql}`, params);
    for (;;) {
      const { rows } = await src.query(`FETCH ${batch} FROM kc`);
      if (!rows.length) break;
      yield rows.map((r) => r.r);
    }
    await src.query("CLOSE kc");
  } finally {
    await src.query("ROLLBACK").catch(() => {});
  }
}

async function upsertBatch(dst, table, cols, pkCols, updateCols, hasIdentity, rows, out, updateOnly = false) {
  const colList = cols.map(q).join(", ");
  let sql;
  if (updateOnly) {
    // Rows that already exist: refresh their ordinary columns (an INSERT without the NOT NULL binary column would be rejected).
    if (!updateCols.length) return;
    sql =
      `UPDATE ${q(table)} AS t SET ${updateCols.map((c) => `${q(c)} = x.${q(c)}`).join(", ")} ` +
      `FROM json_populate_recordset(NULL::${q(table)}, $1::json) AS x ` +
      `WHERE ${pkCols.map((c) => `t.${q(c)} = x.${q(c)}`).join(" AND ")}`;
  } else {
    const conflict = updateCols.length
      ? `ON CONFLICT (${pkCols.map(q).join(", ")}) DO UPDATE SET ${updateCols.map((c) => `${q(c)} = EXCLUDED.${q(c)}`).join(", ")}`
      : `ON CONFLICT (${pkCols.map(q).join(", ")}) DO NOTHING`;
    sql =
      `INSERT INTO ${q(table)} (${colList}) ${hasIdentity ? "OVERRIDING SYSTEM VALUE " : ""}` +
      `SELECT ${colList} FROM json_populate_recordset(NULL::${q(table)}, $1::json) ${conflict}`;
  }

  const run = async (batchRows) => {
    await dst.query("SAVEPOINT b");
    try {
      await dst.query(sql, [JSON.stringify(batchRows)]);
      await dst.query("RELEASE SAVEPOINT b");
      return true;
    } catch (err) {
      await dst.query("ROLLBACK TO SAVEPOINT b");
      await dst.query("RELEASE SAVEPOINT b");
      if (!["23505", "23503", "23502", "23514"].includes(err.code)) throw err;
      return false;
    }
  };

  if (await run(rows)) {
    out.rows += rows.length;
    return;
  }
  // Something in the batch breaks another rule: go row by row, skip only the clashing ones.
  for (const r of rows) {
    if (await run([r])) out.rows += 1;
    else out.skippedRows += 1;
  }
}

async function copyTable(src, dst, table, out) {
  const { cols: dstCols, pk } = await describeTable(dst, table);
  const { cols: srcCols } = await describeTable(src, table);
  if (!pk.length) {
    out.tablesWithoutPk.push(table);
    return;
  }
  const srcNames = new Set(srcCols.map((c) => c.name));
  const usable = dstCols.filter((c) => !c.generated && srcNames.has(c.name));
  const pkCols = pk.map((c) => c.name);
  const hasIdentity = usable.some((c) => c.identity === "a");
  const blobCols = usable.filter((c) => c.type === "bytea").map((c) => c.name);
  const lightCols = usable.filter((c) => c.type !== "bytea").map((c) => c.name);

  await dst.query("BEGIN");
  try {
    // Pass A — tables holding big binary data: copy whole rows the target is missing.
    if (blobCols.length && pk.length === 1) {
      const { rows: have } = await dst.query(`SELECT ${q(pkCols[0])} AS k FROM ${q(table)}`);
      const keys = have.map((r) => r.k);
      const sel =
        `SELECT row_to_json(t) AS r FROM ${q(table)} t WHERE NOT (${q(pkCols[0])} = ANY ($1::${pk[0].type}[]))`;
      for await (const rows of streamRows(src, sel, [keys], 2)) {
        await upsertBatch(dst, table, usable.map((c) => c.name), pkCols, [], hasIdentity, rows, out);
        out.blobRows += rows.length;
      }
    }
    // Pass B — every row, without the binary columns (or everything, for ordinary tables).
    const passCols = blobCols.length ? lightCols : usable.map((c) => c.name);
    const updateCols = passCols.filter((c) => !pkCols.includes(c));
    const colSql = passCols.map(q).join(", ");
    const sel = `SELECT row_to_json(x) AS r FROM (SELECT ${colSql} FROM ${q(table)}) x`;
    // (for tables with binary columns, rows only in the source were handled in pass A)
    for await (const rows of streamRows(src, sel, [], 500)) {
      await upsertBatch(dst, table, passCols, pkCols, updateCols, hasIdentity, rows, out, blobCols.length > 0);
    }
    await dst.query("COMMIT");
  } catch (err) {
    await dst.query("ROLLBACK").catch(() => {});
    throw err;
  }

  // Keep SERIAL counters ahead of the copied ids so the next INSERT does not collide.
  for (const c of usable) {
    const { rows: seq } = await dst.query("SELECT pg_get_serial_sequence($1, $2) AS s", [q(table), c.name]);
    const s = seq[0]?.s;
    if (!s) continue;
    const { rows: mx } = await dst.query(`SELECT MAX(${q(c.name)}) AS m FROM ${q(table)}`);
    if (mx[0].m == null) continue;
    await dst.query(`SELECT setval($1, GREATEST($2::bigint, (SELECT last_value FROM ${s})))`, [s, mx[0].m]);
  }
}

/** Copy every row of database `srcI` into database `dstI` (insert/update by primary key; nothing is deleted). */
export async function merge(srcI, dstI) {
  if (srcI === dstI) throw new Error("source and target are the same database");
  const t0 = Date.now();
  const out = {
    from: srcI, to: dstI, ok: false, rows: 0, blobRows: 0, skippedRows: 0,
    tables: 0, tablesWithoutPk: [], at: new Date().toISOString(),
  };
  let src;
  let dst;
  try {
    await ensureSchema(dstI); // the target always gets its tables, even if the source can't be read
    src = await getPoolByIndex(srcI).connect();
    dst = await getPoolByIndex(dstI).connect();
    const skip = skipSet();
    const [srcTables, dstTables] = await Promise.all([listTables(src), listTables(dst)]);
    const inDst = new Set(dstTables);
    const wanted = srcTables.filter((t) => inDst.has(t) && !skip.has(t));
    for (const table of await sortByDependency(dst, wanted)) {
      await copyTable(src, dst, table, out);
      out.tables += 1;
    }
    out.ok = true;
  } catch (err) {
    out.error = `${err.name}: ${String(err.message).slice(0, 300)}`;
    console.warn(`Database copy ${srcI} -> ${dstI} failed: ${out.error}`);
  } finally {
    src?.release(!out.ok ? true : undefined);
    dst?.release(!out.ok ? true : undefined);
  }
  out.seconds = Math.round((Date.now() - t0) / 100) / 10;
  last.at = new Date().toISOString();
  last.results = [...last.results.slice(-9), out];
  console.log("Database copy finished:", JSON.stringify(out));
  return out;
}

/** Runs `fn` unless another copy is already running. */
async function exclusive(fn) {
  if (busy) return null;
  busy = true;
  try {
    return await fn();
  } finally {
    busy = false;
  }
}
export const isBusy = () => busy;

export async function isReachable(i) {
  try {
    await getPoolByIndex(i).query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

/** Manual / admin-triggered copy. Returns null if one is already running. */
export function mergeNow(srcI, dstI) {
  return exclusive(() => merge(srcI, dstI));
}

/** Failover happened (old → new): copy old into new if the old one can still be read. */
async function onFailover(oldI, newI) {
  await exclusive(async () => {
    const r = await merge(oldI, newI);
    if (!r.ok) {
      console.warn(
        `Could not copy database ${oldI} into ${newI} (the old one is probably out of quota). ` +
        `Database ${newI} carries on with the data it already has.`
      );
    }
  });
}

/** If a standby is in use and the main database works again: merge the standby into it, switch back, merge once more. */
export async function failbackOnce() {
  const cur = failover.active;
  if (cur === 0 || busy || !(await isReachable(0))) return null;
  return exclusive(async () => {
    console.warn(`Main database is reachable again: copying database ${cur} into it`);
    const a = await merge(cur, 0);
    if (!a.ok) return a;
    failover.setActive(0, "fail-back");
    const b = await merge(cur, 0); // rows written while the first copy ran
    console.error("DATABASE FAIL-BACK: back on the main database (0).");
    return { first: a, second: b };
  });
}

/** Main → every standby, only while the main database is the active one. */
export async function warmStandbys() {
  if (!failover.enabled || failover.active !== 0 || busy) return null;
  return exclusive(async () => {
    const results = [];
    for (let i = 1; i < failover.urls.length; i++) results.push(await merge(0, i));
    return results;
  });
}

let started = false;
/** Starts the failover hooks and the (slow) background loops. Safe to call once at boot. */
export function startDbSync() {
  if (started || !failover.enabled) return;
  started = true;

  failover.events.on("failover", (oldI, newI) => {
    onFailover(oldI, newI).catch((err) => console.error("Failover copy error:", err.message));
  });

  // Fail-back checks cost nothing while the main database is active (they only run on a standby).
  const failbackMin = Number(process.env.DB_FAILBACK_MINUTES ?? 30);
  if (failbackMin > 0) {
    const t = setInterval(() => {
      if (failover.active !== 0) failbackOnce().catch((err) => console.error("Fail-back check failed:", err.message));
    }, failbackMin * 60_000);
    t.unref?.();
  }

  // Keeping a standby warm wakes both databases for a few minutes, so it is
  // deliberately infrequent: once a day by default.
  const warmHours = Number(process.env.DB_STANDBY_SYNC_HOURS ?? 24);
  if (warmHours > 0) {
    const tick = () => warmStandbys().catch((err) => console.error("Standby sync failed:", err.message));
    const t = setInterval(tick, warmHours * 3_600_000);
    t.unref?.();
    setTimeout(tick, 15 * 60_000).unref?.();
  }
  console.log(
    `🛟 Database failover on: ${failover.urls.length} databases, active #${failover.active}; ` +
    `standby sync every ${warmHours || "never"} h, fail-back check every ${failbackMin || "never"} min`
  );
}
