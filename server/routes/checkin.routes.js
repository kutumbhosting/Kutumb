import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAdmin } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();
router.use(requireAdmin);

router.get("/:eventId/attendees", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.id, a.name, a.email, a.qr_token, a.checked_in_at, tt.name AS ticket_type_name
     FROM kutumb_attendees a
     JOIN kutumb_order_items oi ON oi.id = a.order_item_id
     JOIN kutumb_ticket_types tt ON tt.id = oi.ticket_type_id
     WHERE a.event_id = $1
     ORDER BY a.name`,
    [req.params.eventId]
  );
  res.json(rows);
});

router.post("/scan", async (req, res) => {
  const { qrToken } = req.body;
  if (!qrToken) return res.status(400).json({ message: "qrToken is required" });

  const { rows } = await pool.query("SELECT * FROM kutumb_attendees WHERE qr_token = $1", [qrToken]);
  const attendee = rows[0];
  if (!attendee) return res.status(404).json({ message: "No ticket found for this QR code" });
  if (attendee.checked_in_at) {
    return res.status(409).json({ message: `Already checked in at ${new Date(attendee.checked_in_at).toLocaleTimeString()}`, attendee });
  }

  const { rows: updated } = await pool.query(
    "UPDATE kutumb_attendees SET checked_in_at = now() WHERE id = $1 RETURNING *",
    [attendee.id]
  );
  await logAudit(req.admin, "checkin.scan", attendee.event_id, { attendeeId: attendee.id });
  res.json({ message: "Checked in", attendee: updated[0] });
});

router.post("/manual/:attendeeId", async (req, res) => {
  const { rows } = await pool.query(
    "UPDATE kutumb_attendees SET checked_in_at = now() WHERE id = $1 RETURNING *",
    [req.params.attendeeId]
  );
  if (!rows[0]) return res.status(404).json({ message: "Attendee not found" });
  await logAudit(req.admin, "checkin.manual", rows[0].event_id, { attendeeId: rows[0].id });
  res.json({ message: "Checked in", attendee: rows[0] });
});

export default router;
