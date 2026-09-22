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
  // Case-insensitive, like every other event-name lookup in this codebase
  // (see e.g. the registration queries in server.js) — a coupon created
  // while one string casing/spacing was selected must still be found when
  // the event is later selected with a slightly different one, or it just
  // silently stops showing up (looking exactly like it was deleted, when
  // it's actually still sitting untouched in the database).
  const { rows } = await pool.query(
    "SELECT * FROM kutumb_event_coupons WHERE lower(event_name) = lower($1) AND lower(event_year) = lower($2) ORDER BY created_at DESC",
    [eventName.trim(), eventYear.trim()]
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
   ADMIN: edit a coupon's details. The amount can only be changed while
   the coupon is still 'active' — once it's been redeemed, that amount is
   already what actually reduced someone's real payment, so changing it
   afterwards would just make the coupon record disagree with the
   registration it was applied to. Recipient name/email, notes and expiry
   are just bookkeeping, so those stay editable regardless of status.
   ============================================================ */
router.put("/admin/:id", requireAdmin, async (req, res) => {
  try {
    const { amount, recipientName, recipientEmail, notes, validFrom, validUntil } = req.body;

    const { rows: existingRows } = await pool.query("SELECT * FROM kutumb_event_coupons WHERE id = $1", [req.params.id]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ message: "Coupon not found" });

    let nextAmount = existing.amount;
    if (amount !== undefined) {
      if (existing.status !== "active") {
        return res.status(400).json({ message: "Only an active, unused coupon's amount can be changed" });
      }
      if (!(Number(amount) > 0)) return res.status(400).json({ message: "Coupon amount must be greater than 0" });
      nextAmount = Number(amount);
    }

    const { rows } = await pool.query(
      `UPDATE kutumb_event_coupons SET
         amount = $1,
         recipient_name = $2,
         recipient_email = $3,
         notes = $4,
         valid_from = $5,
         valid_until = $6
       WHERE id = $7 RETURNING *`,
      [
        nextAmount,
        recipientName?.trim() || null,
        recipientEmail?.trim() || null,
        notes?.trim() || null,
        validFrom || null,
        validUntil || null,
        req.params.id,
      ]
    );
    await logAudit(req.admin, "coupon.update", `${rows[0].event_name} ${rows[0].event_year}`, { id: req.params.id });
    res.json(rows[0]);
  } catch (err) {
    console.error("COUPON UPDATE ERROR:", err);
    res.status(500).json({ message: "Failed to update coupon" });
  }
});

/* ============================================================
   ADMIN: permanently delete a coupon record. Unlike void (which just
   marks an active coupon unusable and keeps it around as a record), this
   actually removes the row — for cleaning up mistakes, duplicates, or
   test coupons rather than for everyday "this one's no longer valid" use
   (void is the right tool for that, and doesn't erase the history).
   Nothing else in the schema references a coupon by id, so this is a
   plain, safe delete with no cascading effects on registrations or
   payments — a registration that redeemed a deleted coupon keeps its
   already-applied discount; only the coupon record itself disappears.
   ============================================================ */
router.delete("/admin/:id", requireAdmin, async (req, res) => {
  const { rows } = await pool.query("DELETE FROM kutumb_event_coupons WHERE id = $1 RETURNING *", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: "Coupon not found" });
  await logAudit(req.admin, "coupon.delete", `${rows[0].event_name} ${rows[0].event_year}`, { id: req.params.id, code: rows[0].code });
  res.json({ deleted: true });
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
