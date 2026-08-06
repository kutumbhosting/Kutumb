import { Router } from "express";
import { pool } from "../db/pool.js";
import { comparePassword, signAdminToken, requireAdmin, ADMIN_COOKIE_NAME } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";

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

router.post("/logout", (req, res) => {
  res.clearCookie(ADMIN_COOKIE_NAME, { ...COOKIE_OPTIONS, maxAge: undefined });
  res.json({ message: "Logged out" });
});

router.get("/me", requireAdmin, async (req, res) => {
  const { rows } = await pool.query("SELECT id, email, name, role, created_at FROM kutumb_admin_users WHERE id = $1", [req.admin.id]);
  if (!rows[0]) return res.status(404).json({ message: "Admin not found" });
  res.json(rows[0]);
});

export default router;
