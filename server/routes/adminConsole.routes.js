import { Router } from "express";
import pg from "pg";
import { pool } from "../db/pool.js";
import { buildPoolConfig } from "../db/pool.js";
import { readEnvFile, setEnvVar } from "../lib/envFile.js";
import { requireAdmin, requireSuperAdmin, hashPassword } from "../lib/auth.js";
import { getAllSettingsForAdmin, setSetting, deleteSetting, SETTINGS_SCHEMA } from "../lib/settings.js";
import { logAudit } from "../lib/audit.js";
import { importMembersDropIn } from "../lib/importMembersDropIn.js";

const router = Router();
router.use(requireAdmin);

/* -------- Settings (Stripe keys etc.) -------- */
router.get("/settings", async (req, res) => {
  res.json(await getAllSettingsForAdmin());
});

router.put("/settings/:key", async (req, res) => {
  const def = SETTINGS_SCHEMA.find((s) => s.key === req.params.key);
  if (!def) return res.status(400).json({ message: "Unknown setting key" });
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ message: "value is required" });
  await setSetting(def.key, value, def.secret);
  await logAudit(req.admin, "settings.update", def.key, { secret: def.secret });
  res.json({ message: "Saved" });
});

router.delete("/settings/:key", async (req, res) => {
  const def = SETTINGS_SCHEMA.find((s) => s.key === req.params.key);
  if (!def) return res.status(400).json({ message: "Unknown setting key" });
  await deleteSetting(def.key);
  await logAudit(req.admin, "settings.clear", def.key, null);
  res.json({ message: "Cleared" });
});

/* -------- Database connection (superadmin only) --------
   DATABASE_URL itself has to live in .env (the app needs it before it can
   connect to anything, including a settings table), so this isn't stored
   alongside the other encrypted settings in Postgres — instead these
   endpoints read/test/update the .env file directly on disk. */

function maskConnectionString(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const userInfo = url.username ? `${url.username}:${"•".repeat(8)}@` : "";
    return `${url.protocol}//${userInfo}${url.host}${url.pathname}`;
  } catch {
    return "•••• (set, but not a valid URL)";
  }
}

router.get("/database", requireSuperAdmin, async (req, res) => {
  const current = maskConnectionString(process.env.DATABASE_URL);
  let connected = false;
  try {
    await pool.query("SELECT 1");
    connected = true;
  } catch {
    connected = false;
  }
  res.json({ current, connected });
});

// Tests a candidate connection string against a throwaway pool (never the
// live one) before anything is saved, so a typo can't take the app down.
router.post("/database/test", requireSuperAdmin, async (req, res) => {
  const { connectionString } = req.body;
  if (!connectionString?.trim()) return res.status(400).json({ message: "connectionString is required" });

  const testPool = new pg.Pool({ ...buildPoolConfig(connectionString.trim()), max: 1, connectionTimeoutMillis: 8000 });
  try {
    await testPool.query("SELECT 1");
    res.json({ ok: true, message: "Connected successfully" });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  } finally {
    await testPool.end().catch(() => {});
  }
});

// Only writes to .env after a successful test — this does NOT hot-swap the
// live connection pool (that risks tearing the app out from under itself
// mid-request), so a restart is required for it to take effect. That's a
// deliberate, safer trade-off for something this central.
router.put("/database", requireSuperAdmin, async (req, res) => {
  const { connectionString } = req.body;
  if (!connectionString?.trim()) return res.status(400).json({ message: "connectionString is required" });
  const trimmed = connectionString.trim();

  const testPool = new pg.Pool({ ...buildPoolConfig(trimmed), max: 1, connectionTimeoutMillis: 8000 });
  try {
    await testPool.query("SELECT 1");
  } catch (err) {
    await testPool.end().catch(() => {});
    return res.status(400).json({ message: `Could not connect with this string: ${err.message}` });
  }
  await testPool.end().catch(() => {});

  try {
    setEnvVar("DATABASE_URL", trimmed);
  } catch (err) {
    return res.status(500).json({ message: `Connected fine, but couldn't save to .env: ${err.message}` });
  }

  await logAudit(req.admin, "database.update", null, { host: maskConnectionString(trimmed) });
  res.json({
    message: "Saved to .env. Restart the server (stop app.cmd and run it again) for this to take effect.",
    requiresRestart: true,
  });
});

/* -------- Members drop-in import (manual trigger, no restart needed) --------
   Same logic that runs automatically on server startup, exposed here so an
   admin can pick up a freshly-dropped server/data/members/members.json
   immediately instead of waiting for the next restart. */
router.post("/import-members", async (req, res) => {
  try {
    const result = await importMembersDropIn();
    await logAudit(req.admin, "members.dropin_import", null, result);
    res.json(result);
  } catch (err) {
    console.error("MANUAL MEMBERS IMPORT ERROR:", err);
    res.status(500).json({ message: "Import failed" });
  }
});

/* -------- Admin users (superadmin only) -------- */
router.get("/admin-users", requireSuperAdmin, async (req, res) => {
  const { rows } = await pool.query("SELECT id, email, name, role, created_at FROM kutumb_admin_users ORDER BY id");
  res.json(rows);
});

router.post("/admin-users", requireSuperAdmin, async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ message: "name, email, password required" });
  const hash = await hashPassword(password);
  const { rows } = await pool.query(
    "INSERT INTO kutumb_admin_users (email, password_hash, name, role) VALUES ($1,$2,$3,$4) RETURNING id, email, name, role",
    [email.trim().toLowerCase(), hash, name.trim(), role === "superadmin" ? "superadmin" : "admin"]
  );
  await logAudit(req.admin, "admin_user.create", rows[0].email, null);
  res.status(201).json(rows[0]);
});

router.put("/admin-users/:id", requireSuperAdmin, async (req, res) => {
  const { name, role, password } = req.body;
  if (password) {
    const hash = await hashPassword(password);
    await pool.query("UPDATE kutumb_admin_users SET password_hash = $1 WHERE id = $2", [hash, req.params.id]);
  }
  const { rows } = await pool.query(
    "UPDATE kutumb_admin_users SET name = COALESCE($1,name), role = COALESCE($2,role) WHERE id = $3 RETURNING id, email, name, role",
    [name, role, req.params.id]
  );
  await logAudit(req.admin, "admin_user.update", rows[0]?.email, null);
  res.json(rows[0]);
});

router.delete("/admin-users/:id", requireSuperAdmin, async (req, res) => {
  if (Number(req.params.id) === req.admin.id) {
    return res.status(400).json({ message: "You can't delete your own logged-in account" });
  }
  const { rows } = await pool.query("SELECT email FROM kutumb_admin_users WHERE id = $1", [req.params.id]);
  await pool.query("DELETE FROM kutumb_admin_users WHERE id = $1", [req.params.id]);
  await logAudit(req.admin, "admin_user.delete", rows[0]?.email, null);
  res.json({ message: "Admin user deleted" });
});

/* -------- Audit log -------- */
router.get("/audit-log", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM kutumb_audit_log ORDER BY id DESC LIMIT 300");
  res.json(rows);
});

export default router;
