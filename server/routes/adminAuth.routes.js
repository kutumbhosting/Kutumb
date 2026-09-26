import { Router } from "express";
import { pool } from "../db/pool.js";
import { comparePassword, signAdminToken, signCheckinCodeToken, requireAdmin, requireAdminOrCheckinSession, ADMIN_COOKIE_NAME } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";
import { redeemCheckinCode } from "../lib/checkinCodes.js";

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 12 * 60 * 60 * 1000, // 12h, matches the JWT's own expiry
};

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password are required" });

    const { rows } = await pool.query("SELECT * FROM kutumb_admin_users WHERE email = $1", [email.trim().toLowerCase()]);
    const admin = rows[0];
    if (!admin) return res.status(401).json({ message: "Invalid email or password" });

    const ok = await comparePassword(password, admin.password_hash);
    if (!ok) return res.status(401).json({ message: "Invalid email or password" });

    const safeAdmin = { id: admin.id, email: admin.email, name: admin.name, role: admin.role };
    const token = signAdminToken(safeAdmin);
    res.cookie(ADMIN_COOKIE_NAME, token, COOKIE_OPTIONS);
    await logAudit(safeAdmin, "admin.login", null, null);
    // Token is also returned in the body for any non-browser API usage —
    // the browser itself relies on the cookie, not this value.
    res.json({ token, admin: safeAdmin });
  } catch (err) {
    console.error("ADMIN LOGIN ERROR:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

// Log in to the check-in scanner with a temporary code instead of an
// email/password — this is the check-in page's PRIMARY login option (the
// password form is offered as a fallback). The resulting session only ever
// satisfies requireAdminOrCheckinSession (i.e. the check-in routes), never
// a plain requireAdmin — see server/lib/auth.js.
router.post("/login-code", async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ message: "A check-in code is required" });

    const result = await redeemCheckinCode(code);
    if (!result) return res.status(401).json({ message: "That code wasn't recognised" });
    if (result.expired) return res.status(401).json({ message: "That code has expired" });

    const { row } = result;
    const safeAdmin = {
      email: "info@kutumb.org.au",
      name: `Check-in code — ${row.event_name}`,
      role: "checkin",
      scope: "checkin_code",
      checkinEventName: row.event_name,
      checkinEventYear: row.event_year,
    };
    const token = signCheckinCodeToken({ eventName: row.event_name, eventYear: row.event_year, code: row.code, expiresAt: row.expires_at });
    res.cookie(ADMIN_COOKIE_NAME, token, { ...COOKIE_OPTIONS, maxAge: Math.max(0, new Date(row.expires_at).getTime() - Date.now()) });
    await logAudit(safeAdmin, "checkin.code_login", row.event_name, null);
    res.json({ token, admin: safeAdmin });
  } catch (err) {
    console.error("CHECKIN CODE LOGIN ERROR:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie(ADMIN_COOKIE_NAME, { ...COOKIE_OPTIONS, maxAge: undefined });
  res.json({ message: "Logged out" });
});

router.get("/me", requireAdminOrCheckinSession, async (req, res) => {
  // A check-in-code session has no row in kutumb_admin_users — its identity
  // lives entirely in the (short-lived, narrowly-scoped) token itself.
  if (req.admin.scope === "checkin_code") {
    return res.json({
      email: req.admin.email,
      name: req.admin.name,
      role: req.admin.role,
      scope: req.admin.scope,
      checkinEventName: req.admin.checkinEventName,
      checkinEventYear: req.admin.checkinEventYear,
    });
  }
  const { rows } = await pool.query("SELECT id, email, name, role, created_at FROM kutumb_admin_users WHERE id = $1", [req.admin.id]);
  if (!rows[0]) return res.status(404).json({ message: "Admin not found" });
  res.json(rows[0]);
});

export default router;
