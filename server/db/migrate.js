// Run with: node server/db/migrate.js
// Creates all new tables (idempotent) and bootstraps the first admin login
// from ADMIN_EMAIL / ADMIN_PASSWORD in .env if one doesn't exist yet.
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import { pool } from "./pool.js";
import { importAllMedia } from "./importMedia.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL is missing. Set it in .env (your Neon connection string) and re-run.");
    process.exit(1);
  }

  console.log("🔌 Connecting to database...");
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");

  console.log("🏗️  Applying schema (creating tables if they don't exist)...");
  await pool.query(sql);
  console.log("✅ Schema is up to date.");

  // One-time seed of the data that used to live in the JSON files. Several
  // of those tables (past events, upcoming events, donations, activities,
  // team profiles) have no natural unique key to safely re-run an INSERT
  // against, and migrate.js runs on every `app.cmd` launch — so we only
  // execute seed.sql the very first time (when those tables are all still
  // empty), never again after that.
  const seedPath = path.join(__dirname, "seed.sql");
  if (fs.existsSync(seedPath)) {
    const { rows: countRows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM kutumb_past_events) +
        (SELECT COUNT(*) FROM kutumb_upcoming_events) +
        (SELECT COUNT(*) FROM kutumb_donations) +
        (SELECT COUNT(*) FROM kutumb_activities) +
        (SELECT COUNT(*) FROM kutumb_team_profiles) AS total
    `);
    if (Number(countRows[0].total) === 0) {
      console.log("🌱 First run detected — importing the original JSON data into Postgres...");
      const seedSql = fs.readFileSync(seedPath, "utf-8");
      await pool.query(seedSql);
      console.log("✅ Seed data imported (members, events, activities, donations, team, etc.).");
    } else {
      console.log("🌱 Data already present — skipping seed import (this is normal on every run after the first).");
    }
  }

  // Import any flyer/past-event media files still sitting on disk into the
  // database. Naturally idempotent (checked per filename), so this is safe
  // to run on every launch — it only ever imports genuinely new files.
  await importAllMedia();

  const adminEmail = (process.env.ADMIN_EMAIL || "admin@kutumb.org.au").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMe123!";

  const existing = await pool.query("SELECT id FROM kutumb_admin_users WHERE email = $1", [adminEmail]);
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash(adminPassword, 10);
    await pool.query(
      "INSERT INTO kutumb_admin_users (email, password_hash, name, role) VALUES ($1, $2, $3, 'superadmin')",
      [adminEmail, hash, "Super Admin"]
    );
    console.log(`👑 Created admin login: ${adminEmail} (password from ADMIN_PASSWORD in .env)`);
    console.log("   ⚠️  Log in and change this password before going live.");
  } else {
    console.log(`👑 Admin login already exists (${adminEmail}) — leaving it as is.`);
  }

  console.log("🎉 Migration complete. You can now run: npm start");
  await pool.end();
}

run().catch((err) => {
  console.error("❌ Migration failed:", err.message);
  if (err.detail) console.error("   Detail:", err.detail);
  if (err.hint) console.error("   Hint:", err.hint);
  if (err.code) console.error("   Postgres error code:", err.code);
  process.exit(1);
});
