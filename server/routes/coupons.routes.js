import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAdmin } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";
import { generateCouponCode, buildCouponQrDataUrl, findValidCoupon } from "../lib/coupons.js";

const router = Router();

/* ============================================================
   ADMIN: generate / list / void coupons for an event
   ============================================================ */
router.get("/admin", requireAdmin, async (req, res) => {
  const { eventName, eventYear } = req.query;
  if (!eventName || !eventYear) return res.status(400).json({ message: "eventName and eventYear are required" });
  const { rows } = await pool.query(
    "SELECT * FROM kutumb_event_coupons WHERE event_name = $1 AND event_year = $2 ORDER BY created_at DESC",
    [eventName, eventYear]
  );
  res.json(rows);
});

router.post("/admin", requireAdmin, async (req, res) => {
  try {
    const { eventName, eventYear, amount, recipientName, recipientEmail, notes, validFrom, validUntil, count } = req.body;
    if (!eventName?.trim() || !eventYear?.trim()) {
      return res.status(400).json({ message: "eventName and eventYear are required" });
    }
    if (!(Number(amount) > 0)) {
      return res.status(400).json({ message: "Coupon amount must be greater than 0" });
    }

    const howMany = Math.min(Math.max(Number(count) || 1, 1), 100);
    const created = [];
    for (let i = 0; i < howMany; i++) {
      // Retry on the (extremely unlikely) chance of a code collision.
      let coupon = null;
      for (let attempt = 0; attempt < 5 && !coupon; attempt++) {
        const code = generateCouponCode();
        try {
          const qrCode = await buildCouponQrDataUrl(code);
          const { rows } = await pool.query(
            `INSERT INTO kutumb_event_coupons
               (code, event_name, event_year, amount, qr_code, recipient_name, recipient_email, notes, valid_from, valid_until, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            [
              code, eventName.trim(), eventYear.trim(), Number(amount), qrCode,
              recipientName?.trim() || null, recipientEmail?.trim() || null, notes?.trim() || null,
              validFrom || null, validUntil || null, req.admin?.email || null,
            ]
          );
          coupon = rows[0];
        } catch (err) {
          if (err.code !== "23505") throw err; // unique code collision — retry
        }
      }
      if (coupon) created.push(coupon);
    }

    await logAudit(req.admin, "coupon.create", `${eventName} ${eventYear}`, { count: created.length, amount });
    res.status(201).json(created);
  } catch (err) {
    console.error("COUPON CREATE ERROR:", err);
    res.status(500).json({ message: "Failed to generate coupon(s)" });
  }
});

router.post("/admin/:id/void", requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    "UPDATE kutumb_event_coupons SET status = 'void' WHERE id = $1 AND status = 'active' RETURNING *",
    [req.params.id]
  );
  if (!rows[0]) return res.status(400).json({ message: "Only an active, unused coupon can be voided" });
  await logAudit(req.admin, "coupon.void", `${rows[0].event_name} ${rows[0].event_year}`, { id: req.params.id });
  res.json(rows[0]);
});

/* ============================================================
   PUBLIC: preview a coupon's value before applying it at checkout
   (does not redeem it — redemption happens atomically alongside the
   payment update, in server.js's /api/events/apply-coupon).
   ============================================================ */
router.get("/check", async (req, res) => {
  const { code, eventName, eventYear } = req.query;
  const result = await findValidCoupon(code, eventName, eventYear);
  if (!result.ok) return res.status(400).json({ ok: false, message: result.message });
  res.json({ ok: true, amount: Number(result.coupon.amount) });
});

export default router;
