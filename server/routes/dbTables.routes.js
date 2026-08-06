import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireSuperAdmin } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();
router.use(requireSuperAdmin);

// Deliberately excludes three tables from this generic editor, each for a
// specific safety reason rather than an oversight:
//  - kutumb_admin_users: has its own dedicated UI (Admin Users tab), and a
//    generic editor would let someone paste a plaintext password into
//    password_hash, silently creating a broken/insecure login.
//  - kutumb_platform_settings: has its own dedicated UI (Settings tab);
//    secret values are AES-encrypted here, so a generic editor would only
//    ever show useless ciphertext, and editing it directly could corrupt
//    a Stripe key in a way that's hard to diagnose.
//  - kutumb_media_files: stores large binary blobs (bytea, up to ~10MB per
//    row for videos) — genuinely impractical to render/edit as a table
//    cell, and one fat-fingered edit would corrupt an image/video with no
//    easy way to notice. Already has proper upload/delete flows elsewhere.
const EXCLUDED_TABLES = ["kutumb_admin_users", "kutumb_platform_settings", "kutumb_media_files"];

// Every one of our tables uses a simple `id SERIAL PRIMARY KEY` except
// this one, which is intentionally keyed by name.
const PRIMARY_KEY_OVERRIDES = {
  kutumb_platform_settings: "key",
};

async function getAllowedTables() {
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name LIKE 'kutumb_%'
     ORDER BY table_name`
  );
  return rows.map((r) => r.table_name).filter((t) => !EXCLUDED_TABLES.includes(t));
}

async function assertAllowedTable(tableName) {
  const allowed = await getAllowedTables();
  if (!allowed.includes(tableName)) {
    const err = new Error("Unknown or restricted table");
    err.statusCode = 400;
    throw err;
  }
  return allowed;
}

async function getColumns(tableName) {
  const { rows } = await pool.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName]
  );
  return rows;
}

function getPrimaryKeyColumn(tableName) {
  return PRIMARY_KEY_OVERRIDES[tableName] || "id";
}

router.get("/tables", async (req, res) => {
  res.json(await getAllowedTables());
});

router.get("/tables/:table", async (req, res) => {
  try {
    await assertAllowedTable(req.params.table);
    const columns = await getColumns(req.params.table);
    const pk = getPrimaryKeyColumn(req.params.table);

    // Capped at 500 rows — this is an admin data-browser, not a reporting
    // tool; anything needing more than that needs a real query, not this UI.
    const { rows } = await pool.query(
      `SELECT * FROM "${req.params.table}" ORDER BY "${pk}" DESC LIMIT 500`
    );

    res.json({ columns, rows, primaryKey: pk, truncated: rows.length === 500 });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
});

router.post("/tables/:table", async (req, res) => {
  try {
    await assertAllowedTable(req.params.table);
    const columns = await getColumns(req.params.table);
    const columnNames = columns.map((c) => c.column_name);

    const entries = Object.entries(req.body).filter(
      ([key, value]) => columnNames.includes(key) && value !== "" && value !== undefined
    );
    if (entries.length === 0) return res.status(400).json({ message: "No valid column values provided" });

    const cols = entries.map(([key]) => `"${key}"`).join(", ");
    const placeholders = entries.map((_, i) => `$${i + 1}`).join(", ");
    const values = entries.map(([, value]) => value);

    const { rows } = await pool.query(
      `INSERT INTO "${req.params.table}" (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    await logAudit(req.admin, "db_table.insert", req.params.table, { row: rows[0] });
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(err.statusCode || 400).json({ message: err.message });
  }
});

router.put("/tables/:table/:pkValue", async (req, res) => {
  try {
    await assertAllowedTable(req.params.table);
    const columns = await getColumns(req.params.table);
    const columnNames = columns.map((c) => c.column_name);
    const pk = getPrimaryKeyColumn(req.params.table);

    const entries = Object.entries(req.body).filter(
      ([key, value]) => columnNames.includes(key) && key !== pk && value !== undefined
    );
    if (entries.length === 0) return res.status(400).json({ message: "No valid column values provided" });

    const setClause = entries.map(([key], i) => `"${key}" = $${i + 1}`).join(", ");
    const values = entries.map(([, value]) => value);
    values.push(req.params.pkValue);

    const { rows } = await pool.query(
      `UPDATE "${req.params.table}" SET ${setClause} WHERE "${pk}" = $${values.length} RETURNING *`,
      values
    );
    if (rows.length === 0) return res.status(404).json({ message: "Row not found" });

    await logAudit(req.admin, "db_table.update", req.params.table, { pk: req.params.pkValue });
    res.json(rows[0]);
  } catch (err) {
    res.status(err.statusCode || 400).json({ message: err.message });
  }
});

router.delete("/tables/:table/:pkValue", async (req, res) => {
  try {
    await assertAllowedTable(req.params.table);
    const pk = getPrimaryKeyColumn(req.params.table);

    const { rows } = await pool.query(
      `DELETE FROM "${req.params.table}" WHERE "${pk}" = $1 RETURNING *`,
      [req.params.pkValue]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Row not found" });

    await logAudit(req.admin, "db_table.delete", req.params.table, { pk: req.params.pkValue });
    res.json({ message: "Row deleted" });
  } catch (err) {
    res.status(err.statusCode || 400).json({ message: err.message });
  }
});

export default router;
