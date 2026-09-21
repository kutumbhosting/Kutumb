import { pool } from "../db/pool.js";
import { getAttendeesForRegistration } from "./attendees.js";
import { generateQrPngBuffer, buildEventTicketsPdf } from "./membershipCard.js";
import { sendEventTicketsEmail } from "./mailer.js";

/**
 * Sends the QR ticket email for a registration — one ticket per attendee
 * (the registrant, each additional adult, each child) — but only once,
 * and only for a registration that's actually confirmed.
 *
 * Called from every place a registration can become "confirmed": free at
 * signup, card/Square/PayPal payment, a fully-covering coupon, or an
 * admin's bank-transfer verification. Those are independent code paths
 * (webhooks, return-page polls, admin edits can all race or overlap), so
 * this claims the send atomically — `tickets_sent_at IS NULL` in the WHERE
 * clause means only the first caller to reach this for a given
 * registration ever gets a non-empty result back, and every other/later
 * caller is a safe no-op. Safe to call speculatively; it only actually
 * emails anyone the first time.
 */
export async function sendEventTickets(registrationId) {
  try {
    const { rows: claimed } = await pool.query(
      `UPDATE kutumb_event_registrations
       SET tickets_sent_at = now()
       WHERE id = $1 AND registration_status = 'confirmed' AND tickets_sent_at IS NULL
       RETURNING *`,
      [registrationId]
    );
    const registration = claimed[0];
    if (!registration) return; // not confirmed yet, or tickets already sent

    const attendeeRows = await getAttendeesForRegistration(registrationId);
    if (attendeeRows.length === 0) {
      console.error(`No attendees found for registration ${registrationId} — skipping ticket email`);
      return;
    }

    const attendees = await Promise.all(
      attendeeRows.map(async (a) => ({
        name: a.name,
        category: a.category,
        qrPngBuffer: await generateQrPngBuffer(a.qr_token),
      }))
    );

    const ticketsPdfBuffer = await buildEventTicketsPdf({
      eventName: registration.event_name,
      eventDate: null,
      registrationNumber: registration.registration_number,
      attendees,
    });

    await sendEventTicketsEmail({
      to: registration.email,
      name: registration.name,
      eventName: registration.event_name,
      registrationNumber: registration.registration_number,
      attendees,
      ticketsPdfBuffer,
    });
  } catch (err) {
    // Best-effort, same as every other confirmation email in this app —
    // a ticket-email failure must never break the payment/registration
    // flow that triggered it. tickets_sent_at is left set (the claim
    // already landed) so a transient failure doesn't cause a retry loop;
    // an admin can always be asked to trigger a manual resend if needed.
    console.error(`Failed to send tickets for registration ${registrationId}:`, err);
  }
}
