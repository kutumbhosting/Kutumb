import { Router } from "express";
import { requireSuperAdmin } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";
import { failover } from "../db/pool.js";
import * as dbsync from "../db/dbsync.js";

// Database failover status and manual copies. Super Admin only.
const router = Router();
router.use(requireSuperAdmin);

router.get("/status", (req, res) => {
  res.json({ failover: failover.status(), busy: dbsync.isBusy(), last: dbsync.last });
});

// POST /api/db-failover/sync?source=1&target=0  — merge database `source` into `target` (0 = DATABASE_URL, 1 = first standby, …).
// Runs in the background; read the outcome from GET /status.
router.post("/sync", async (req, res) => {
  const source = Number(req.query.source);
  const target = Number(req.query.target);
  const n = failover.urls.length;
  const ok = (v) => Number.isInteger(v) && v >= 0 && v < n;
  if (!ok(source) || !ok(target) || source === target) {
    return res.status(400).json({ message: `Pick two different database numbers between 0 and ${n - 1}.` });
  }
  if (dbsync.isBusy()) return res.status(409).json({ message: "A database copy is already running." });
  dbsync.mergeNow(source, target).catch((err) => console.error("Manual database copy failed:", err.message));
  await logAudit(req.admin, "database.sync", null, { source, target }).catch(() => {});
  res.status(202).json({ message: `Copying database ${source} into ${target} in the background.` });
});

// POST /api/db-failover/switch?to=0 — make a database the active one (e.g. move back to the main one after a manual copy).
router.post("/switch", async (req, res) => {
  const to = Number(req.query.to);
  if (!Number.isInteger(to) || to < 0 || to >= failover.urls.length) {
    return res.status(400).json({ message: `Pick a database number between 0 and ${failover.urls.length - 1}.` });
  }
  failover.setActive(to, `admin ${req.admin?.email || ""}`.trim());
  await logAudit(req.admin, "database.switch", null, { to }).catch(() => {});
  res.json({ failover: failover.status() });
});

export default router;
