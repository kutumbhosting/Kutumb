import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAdmin } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();
router.use(requireAdmin);

// Every attendee, from BOTH the Stripe-ticketing system (kutumb_attendees)
// and the main Event Registration table's individual attendees
// (kutumb_registration_attendees), normalized into one shape so the
// Check-in page can show/scan either kind side by side. `id` is prefixed
// per source so the two tables' own numeric ids can never collide.
router.get("/:eventId/attendees", async (req, res) => {
  const { rows: ticketed } = await pool.query(
    `SELECT a.id, a.name, a.email, a.qr_token, a.checked_in_at, tt.name AS ticket_type_name
     FROM kutumb_attendees a
     JOIN kutumb_order_items oi ON oi.id = a.order_item_id
     JOIN kutumb_ticket_types tt ON tt.id = oi.ticket_type_id
     WHERE a.event_id = $1
     ORDER BY a.name`,
    [req.params.eventId]
  );

  // Registration attendees are keyed by event_name (not the ticketing
  // system's slug), so match case-insensitively against every event whose
  // slugified title equals :eventId.
  const { rows: regAttendees } = await pool.query(
    `SELECT ra.id, ra.name, ra.category, ra.qr_token, ra.checked_in_at, ra.checked_in_by,
            r.email, r.registration_number, r.payment_status, r.registration_status
     FROM kutumb_registration_attendees ra
     JOIN kutumb_event_registrations r ON r.id = ra.registration_id
     WHERE lower(replace(regexp_replace(r.event_name, '[^a-zA-Z0-9\\s-]', '', 'g'), ' ', '-')) = lower($1)
     ORDER BY ra.name`,
    [req.params.eventId]
  );

  const merged = [
    ...ticketed.map((a) => ({
      id: `tkt:${a.id}`,
      name: a.name,
      email: a.email,
      ticket_type_name: a.ticket_type_name,
      checked_in_at: a.checked_in_at,
      source: "ticket",
    })),
    ...regAttendees.map((a) => ({
      id: `reg:${a.id}`,
      name: a.name,
      email: a.email,
      ticket_type_name:
        a.category === "primary_adult" ? "Registrant"
        : a.category === "adult" ? "Additional Adult"
        : a.category === "child_under5" ? "Child (Under 5)"
        : "Child (5+)",
      checked_in_at: a.checked_in_at,
      checked_in_by: a.checked_in_by,
      registrationNumber: a.registration_number,
      paymentStatus: a.payment_status,
      registrationStatus: a.registration_status,
      source: "registration",
    })),
  ];

  res.json(merged);
});

async function findByToken(qrToken) {
  const { rows: reg } = await pool.query(
    `SELECT ra.*, r.registration_number, r.payment_status, r.registration_status, r.event_name, r.event_year
     FROM kutumb_registration_attendees ra
     JOIN kutumb_event_registrations r ON r.id = ra.registration_id
     WHERE ra.qr_token = $1`,
    [qrToken]
  );
  if (reg[0]) return { source: "registration", row: reg[0] };

  const { rows: tkt } = await pool.query("SELECT * FROM kutumb_attendees WHERE qr_token = $1", [qrToken]);
  if (tkt[0]) return { source: "ticket", row: tkt[0] };

  return null;
}

// Scan a QR token (from either source). `override: true` lets an
// authorised admin deliberately re-check-in someone already checked in
// (e.g. correcting an accidental duplicate scan) instead of silently
// blocking every re-scan.
router.post("/scan", async (req, res) => {
  const { qrToken, override } = req.body;
  if (!qrToken) return res.status(400).json({ message: "qrToken is required" });

  const found = await findByToken(qrToken);
  if (!found) return res.status(404).json({ message: "No ticket/attendee found for this QR code" });
  const { source, row } = found;

  if (row.checked_in_at && !override) {
    return res.status(409).json({
      message: `Already checked in at ${new Date(row.checked_in_at).toLocaleTimeString()}`,
      attendee: row,
      source,
      canOverride: true,
    });
  }

  if (source === "registration") {
    const { rows: updated } = await pool.query(
      "UPDATE kutumb_registration_attendees SET checked_in_at = now(), checked_in_by = $1 WHERE id = $2 RETURNING *",
      [req.admin?.email || null, row.id]
    );
    await logAudit(req.admin, "checkin.scan", row.event_name, {
      attendeeId: row.id, registrationNumber: row.registration_number, override: !!override,
    });
    return res.json({
      message: "Checked in",
      attendee: { ...updated[0], registration_number: row.registration_number, payment_status: row.payment_status, registration_status: row.registration_status },
      source,
    });
  }

  const { rows: updated } = await pool.query(
    "UPDATE kutumb_attendees SET checked_in_at = now() WHERE id = $1 RETURNING *",
    [row.id]
  );
  await logAudit(req.admin, "checkin.scan", row.event_id, { attendeeId: row.id, override: !!override });
  res.json({ message: "Checked in", attendee: updated[0], source });
});

// Manual check-in from the attendee list, id is "tkt:<id>" or "reg:<id>".
router.post("/manual/:attendeeId", async (req, res) => {
  const raw = req.params.attendeeId;
  const [prefix, idStr] = raw.includes(":") ? raw.split(":") : ["tkt", raw];
  const id = Number(idStr);

  if (prefix === "reg") {
    const { rows } = await pool.query(
      "UPDATE kutumb_registration_attendees SET checked_in_at = now(), checked_in_by = $1 WHERE id = $2 RETURNING *",
      [req.admin?.email || null, id]
    );
    if (!rows[0]) return res.status(404).json({ message: "Attendee not found" });
    await logAudit(req.admin, "checkin.manual", rows[0].event_name, { attendeeId: id });
    return res.json({ message: "Checked in", attendee: rows[0] });
  }

  const { rows } = await pool.query(
    "UPDATE kutumb_attendees SET checked_in_at = now() WHERE id = $1 RETURNING *",
    [id]
  );
  if (!rows[0]) return res.status(404).json({ message: "Attendee not found" });
  await logAudit(req.admin, "checkin.manual", rows[0].event_id, { attendeeId: id });
  res.json({ message: "Checked in", attendee: rows[0] });
});

export default router;
