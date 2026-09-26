// Temporary check-in login codes — see the kutumb_checkin_codes table
// comment in server/db/schema.sql for the overall design.

import { pool } from "../db/pool.js";
import { parseEventEndDate } from "./eventDates.js";

// Deliberately excludes visually-ambiguous characters (0/O, 1/I/L) since
// these are read off a phone screen or an email by a volunteer at the door,
// often re-typed by hand.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomCode(length = 6) {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

/** End-of-event-day, falling back to "23:59 tonight" if the date string can't be parsed. */
function computeExpiry(eventDateText) {
  const parsed = parseEventEndDate(eventDateText);
  if (parsed) return parsed;
  const fallback = new Date();
  fallback.setHours(23, 59, 59, 999);
  return fallback;
}

/**
 * Generates 5 fresh temporary login codes for one event, replacing any
 * still-active codes already issued for that same event (so re-clicking the
 * button doesn't silently pile up old codes alongside new ones — the
 * previous batch simply stops working the moment a new batch is generated).
 */
export async function generateCheckinCodes({ eventName, eventYear, eventDateText, createdBy }) {
  const expiresAt = computeExpiry(eventDateText);

  await pool.query(
    `DELETE FROM kutumb_checkin_codes WHERE event_name = $1 AND COALESCE(event_year, '') = COALESCE($2, '')`,
    [eventName, eventYear || null]
  );

  const codes = [];
  for (let i = 0; i < 5; i++) {
    // Retry on the (very rare) chance of a collision with an existing code
    // for a different event, since `code` is UNIQUE across the whole table.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      try {
        await pool.query(
          `INSERT INTO kutumb_checkin_codes (code, event_name, event_year, event_date_text, expires_at, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [code, eventName, eventYear || null, eventDateText || null, expiresAt, createdBy || null]
        );
        codes.push(code);
        break;
      } catch (err) {
        if (err.code === "23505" /* unique_violation */ && attempt < 4) continue; // try another code
        throw err;
      }
    }
  }

  return { codes, expiresAt };
}

/**
 * Looks up a code. Returns:
 *   - null                       — no such code (never existed, or already cleaned up)
 *   - { expired: true }          — existed but is past its expiry (deleted as a side effect)
 *   - { row }                    — valid, still-active code (last_used_at is bumped)
 */
export async function redeemCheckinCode(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return null;

  const { rows } = await pool.query("SELECT * FROM kutumb_checkin_codes WHERE code = $1", [normalized]);
  const row = rows[0];
  if (!row) return null;

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await pool.query("DELETE FROM kutumb_checkin_codes WHERE id = $1", [row.id]);
    return { expired: true };
  }

  await pool.query("UPDATE kutumb_checkin_codes SET last_used_at = now() WHERE id = $1", [row.id]);
  return { row };
}

/** Deletes every code whose expiry has already passed. Safe to call often. */
export async function cleanupExpiredCheckinCodes() {
  const { rowCount } = await pool.query("DELETE FROM kutumb_checkin_codes WHERE expires_at < now()");
  return rowCount;
}
