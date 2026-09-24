// server/lib/registrationScheduler.js
//
// Automatic registration emails, checked every 15 minutes and acted on once
// the configured hour (default 10:00 Sydney time) has passed each day:
//
//   • Payment reminder — on the reminder days (default Mon & Thu), to every
//     registration still awaiting payment (paid events only), while the event
//     is more than 6 days away. Not sent to anyone who registered < 24h ago.
//   • Final reminder — 6 days before the event, to those still unpaid,
//     saying when the registration will be cancelled.
//   • Auto-cancel — 5 days before the event, registrations still unpaid are
//     cancelled (spots released) and the registrant is emailed. Just before
//     cancelling, every stored bank credit is reconciled once more so a
//     transfer that has already arrived is never missed. NOT auto-cancelled
//     (listed for an admin instead):
//       – part-payments (some money received),
//       – people who said they paid by bank transfer that isn't matched yet
//         (unless the setting to cancel those too is on),
//       – anyone who never got the final reminder (e.g. registered in the
//         last 6 days, or email was down) — nobody is cancelled unwarned.
//   • Welcome — the day before the event, to every CONFIRMED registration
//     (paid and free events alike), with their QR tickets attached again.
//
// Every email is recorded in kutumb_registration_notifications only once it
// has actually been sent, so nothing goes twice and a mail outage is simply
// retried on the next check. A Postgres advisory lock stops two servers
// sharing the database (e.g. a test and the live site) doubling up.

import { pool } from "../db/pool.js";
import { getSetting, setSetting } from "./settings.js";
import { parseEventStartDate } from "./eventDates.js";
import { getConfiguredPublicBaseUrl } from "./publicUrl.js";
import {
  sendPaymentReminderEmail,
  sendRegistrationCancelledEmail,
  sendEventWelcomeEmail,
  sendAdminAlertEmail,
} from "./mailer.js";
import { buildTicketsPdfForRegistration } from "./tickets.js";
import { reconcileOpenEvents } from "./bankLedger.js";

export const CANCELLED_MESSAGE =
  "This registration was cancelled because payment wasn't received in time. " +
  "If you think this is a mistake, please contact Kutumb; if spots are still available you're welcome to register again.";

const TZ = "Australia/Sydney";
const DAY_MS = 86_400_000;
const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const LOCK_KEY = "kutumb_registration_scheduler";

let timer = null;
let lastRun = null;

/* ── Sydney calendar helpers ─────────────────────────────────────────── */

function sydneyParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    hour: Number(parts.hour),
    weekday: WEEKDAYS[String(parts.weekday).slice(0, 3).toLowerCase()],
  };
}
const dayNumber = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
const keyOf = ({ y, m, d }) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
function fromDayNumber(n) {
  const dt = new Date(n * DAY_MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}
function prettyDay(n) {
  const { y, m, d } = fromDayNumber(n);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

/* ── Settings ────────────────────────────────────────────────────────── */

async function loadConfig() {
  const num = async (key, def, min, max) => {
    const raw = await getSetting(key);
    if (raw === null || raw === undefined || String(raw).trim() === "") return def;
    const n = Number(raw);
    return Number.isInteger(n) && n >= min && n <= max ? n : def;
  };
  const flag = async (key) => ((await getSetting(key)) ?? "true") !== "false";
  const remindersOn = await flag("reg_reminders_enabled");
  const cancelOn = await flag("reg_autocancel_enabled");
  const welcomeOn = await flag("reg_welcome_enabled");
  const daysRaw = (await getSetting("reg_reminder_days")) || "mon,thu";
  const reminderDays = new Set(
    daysRaw.split(/[\s,;]+/).map((d) => WEEKDAYS[d.slice(0, 3).toLowerCase()]).filter((d) => d !== undefined)
  );
  const finalDays = await num("reg_final_days_before", 6, 2, 60);
  let cancelDays = await num("reg_cancel_days_before", 5, 1, 59);
  if (cancelDays >= finalDays) cancelDays = finalDays - 1;
  return {
    enabled: remindersOn || cancelOn || welcomeOn,
    remindersOn,
    cancelOn,
    welcomeOn,
    reminderDays,
    hour: await num("reg_email_hour", 10, 0, 23),
    finalDays,
    cancelDays,
    cancelClaimed: (await getSetting("reg_cancel_claimed_transfers")) === "true",
  };
}

/* ── Data ────────────────────────────────────────────────────────────── */

const MONTH_ONLY = /^[A-Za-z]+\s*,?\s*\d{4}$/;

async function upcomingEvents(todayN) {
  const { rows } = await pool.query("SELECT * FROM kutumb_upcoming_events");
  const out = [];
  const skipped = [];
  for (const e of rows) {
    const text = String(e.date_text || "").trim();
    const start = MONTH_ONLY.test(text) ? null : parseEventStartDate(text);
    if (!start) {
      skipped.push({ title: e.title, reason: `date "${text || "(none)"}" has no specific day` });
      continue;
    }
    const eventN = dayNumber(start.getFullYear(), start.getMonth() + 1, start.getDate());
    const daysUntil = eventN - todayN;
    if (daysUntil < 0) continue;
    out.push({ ...e, eventN, daysUntil, eventYear: String(start.getFullYear()) });
  }
  return { events: out, skipped };
}

async function alreadySent(registrationId, kind, periodKey = "") {
  const { rows } = await pool.query(
    "SELECT 1 FROM kutumb_registration_notifications WHERE registration_id = $1 AND kind = $2 AND period_key = $3",
    [registrationId, kind, periodKey]
  );
  return rows.length > 0;
}
async function sentAt(registrationId, kind, periodKey = null) {
  const { rows } = await pool.query(
    `SELECT sent_at FROM kutumb_registration_notifications
      WHERE registration_id = $1 AND kind = $2 AND ($3::text IS NULL OR period_key = $3)
      ORDER BY sent_at LIMIT 1`,
    [registrationId, kind, periodKey]
  );
  return rows[0]?.sent_at ? new Date(rows[0].sent_at) : null;
}
async function markSent(registrationId, kind, periodKey = "", at = new Date()) {
  await pool.query(
    `INSERT INTO kutumb_registration_notifications (registration_id, kind, period_key, sent_at)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [registrationId, kind, periodKey, at]
  );
}

function regSummary(r, e, extra = {}) {
  return {
    id: r.id,
    event: `${e.title}`,
    registrationNumber: r.registration_number,
    name: r.name,
    email: r.email,
    amountDue: Math.max((Number(r.fee) || 0) - (Number(r.payment_amount) || 0), 0),
    ...extra,
  };
}

/* ── The run ─────────────────────────────────────────────────────────── */

/**
 * @param {{ dryRun?: boolean, now?: Date, force?: boolean }} opts
 *   dryRun: work out what WOULD happen, send/change nothing.
 *   force:  ignore the "not before hour X" rule (admin "Run now").
 */
export async function runRegistrationEmails({ dryRun = false, now = new Date(), force = false } = {}) {
  const cfg = await loadConfig();
  const syd = sydneyParts(now);
  const todayN = dayNumber(syd.y, syd.m, syd.d);
  const todayKey = keyOf(syd);
  const result = {
    at: now.toISOString(),
    sydneyDate: todayKey,
    dryRun,
    reminders: [],
    finals: [],
    cancelled: [],
    welcomes: [],
    needsReview: [],
    failed: [],
    skippedEvents: [],
    note: null,
  };

  if (!cfg.enabled && !dryRun) {
    result.note = "All automatic registration emails are switched off.";
    return result;
  }
  if (!force && syd.hour < cfg.hour) {
    result.note = `Waiting until ${cfg.hour}:00 Sydney time.`;
    return result;
  }

  // One server at a time (session lock on a dedicated connection).
  const lockClient = await pool.connect();
  let locked = false;
  try {
    const { rows } = await lockClient.query("SELECT pg_try_advisory_lock(hashtext($1)) AS ok", [LOCK_KEY]);
    locked = rows[0].ok;
    if (!locked) {
      result.note = "Another server is running the registration emails right now.";
      return result;
    }

    const baseUrl = await getConfiguredPublicBaseUrl();
    const { events, skipped } = await upcomingEvents(todayN);
    result.skippedEvents = skipped;

    const cancelCandidates = [];

    for (const e of events) {
      const { rows: regs } = await pool.query(
        `SELECT * FROM kutumb_event_registrations
          WHERE lower(event_name) = lower($1) AND event_year = $2 AND registration_status <> 'cancelled'
          ORDER BY created_at`,
        [e.title, e.eventYear]
      );
      // Master switch AND the event's own tick.
      const evReminders = cfg.remindersOn && e.auto_reminders !== false;
      const evCancel = cfg.cancelOn && e.auto_cancel === true;
      const evWelcome = cfg.welcomeOn && e.auto_welcome !== false;
      if (!evReminders && !evCancel && !evWelcome) continue;
      const eventDate = e.date_text;
      const finalDayN = e.eventN - cfg.finalDays;
      const cancelDayN = e.eventN - cfg.cancelDays;

      for (const r of regs) {
        const fee = Number(r.fee) || 0;
        const paid = Number(r.payment_amount) || 0;
        const amountDue = Math.max(fee - paid, 0);
        const pending = r.registration_status === "pending_payment" && fee > 0 && r.payment_status !== "Paid" && amountDue > 0;
        const created = new Date(r.created_at);
        const createdN = (() => {
          const p = sydneyParts(created);
          return dayNumber(p.y, p.m, p.d);
        })();
        const claimed = !!r.bank_transferred && !r.payment_match_confidence && paid === 0;
        const partial = paid > 0 && paid < fee;
        const payUrl = baseUrl && r.pay_token ? `${baseUrl}/pay/${r.pay_token}` : null;
        const common = {
          to: r.email,
          name: r.name,
          eventName: e.title,
          eventDate,
          eventTime: e.time_text,
          location: e.location,
          registrationNumber: r.registration_number,
        };

        // ── Welcome (confirmed, day before; same-morning catch-up) ──
        if (r.registration_status === "confirmed" && (e.daysUntil === 1 || (e.daysUntil === 0 && syd.hour < 14))) {
          if (evWelcome && !(await alreadySent(r.id, "welcome"))) {
            const item = regSummary(r, e);
            if (dryRun) result.welcomes.push(item);
            else {
              let pdf = null;
              try {
                pdf = await buildTicketsPdfForRegistration(r, eventDate);
              } catch (err) {
                console.error(`Welcome tickets PDF failed for ${r.id}:`, err.message);
              }
              const sent = await sendEventWelcomeEmail({
                ...common,
                peopleCount: 1 + (Number(r.adults) || 0) + (Number(r.children) || 0),
                ticketsPdfBuffer: pdf,
                when: e.daysUntil === 0 ? "today" : "tomorrow",
              });
              if (sent.sent) {
                await markSent(r.id, "welcome", "", now);
                result.welcomes.push(item);
              } else result.failed.push({ ...item, kind: "welcome", error: sent.error });
            }
          }
          continue;
        }

        if (!pending) continue;
        if (!evReminders && !evCancel) continue;

        // ── Regular reminder (event more than finalDays away) ──
        if (e.daysUntil > cfg.finalDays) {
          if (evReminders && cfg.reminderDays.has(syd.weekday) && now - created >= DAY_MS && !(await alreadySent(r.id, "payment_reminder", todayKey))) {
            const item = regSummary(r, e, claimed ? { note: "said they paid by transfer" } : {});
            if (dryRun) result.reminders.push(item);
            else {
              const sent = await sendPaymentReminderEmail({ ...common, amountDue, payUrl, claimedTransfer: claimed });
              if (sent.sent) {
                await markSent(r.id, "payment_reminder", todayKey, now);
                result.reminders.push(item);
              } else result.failed.push({ ...item, kind: "payment_reminder", error: sent.error });
            }
          }
          continue;
        }

        // Registered after the final-reminder date: never auto-cancelled.
        // Flag for an admin once the cancellation date is reached (and
        // they've had a day to pay), rather than the moment they register.
        if (createdN >= finalDayN) {
          if (evCancel && e.daysUntil <= cfg.cancelDays && now - created >= DAY_MS && !(await alreadySent(r.id, "flagged_review"))) {
            result.needsReview.push(regSummary(r, e, { reason: "registered in the final week and still unpaid — not cancelled" }));
          }
          continue;
        }

        // The final reminder carries the cancellation date only when this
        // event auto-cancels. If auto-cancel is switched on after a plain
        // final reminder went out, a second one WITH the date is sent first
        // — nobody is cancelled without being told when.
        const finalKey = evCancel ? "with-cancel" : "";
        const finalAt = evCancel
          ? await sentAt(r.id, "final_reminder", "with-cancel")
          : await sentAt(r.id, "final_reminder");

        // ── Final reminder ──
        if (!finalAt) {
          if (e.daysUntil >= 1) {
            const item = regSummary(r, e, claimed ? { note: "said they paid by transfer" } : {});
            if (dryRun) result.finals.push(item);
            else {
              const sent = await sendPaymentReminderEmail({
                ...common,
                amountDue,
                payUrl,
                final: true,
                // If the final reminder is going out late, cancellation moves
                // to the next day so everyone gets at least a day's notice.
                cancelOn: evCancel ? prettyDay(Math.max(cancelDayN, todayN + 1)) : null,
                claimedTransfer: claimed,
              });
              if (sent.sent) {
                await markSent(r.id, "final_reminder", finalKey, now);
                result.finals.push(item);
              } else result.failed.push({ ...item, kind: "final_reminder", error: sent.error });
            }
          }
          continue;
        }

        // ── Auto-cancel ──
        if (evCancel && e.daysUntil <= cfg.cancelDays && e.daysUntil >= 1 && now - finalAt >= 20 * 3_600_000) {
          if (partial || (claimed && !cfg.cancelClaimed)) {
            if (!(await alreadySent(r.id, "flagged_review"))) {
              result.needsReview.push(
                regSummary(r, e, {
                  reason: partial
                    ? `part-paid ($${paid.toFixed(2)} of $${fee.toFixed(2)}) — not cancelled`
                    : "said they paid by bank transfer, not matched yet — not cancelled",
                })
              );
            }
            continue;
          }
          cancelCandidates.push({ r, e, common, item: regSummary(r, e) });
        }
      }
    }

    // ── Cancel (after one last reconciliation of stored bank credits) ──
    if (cancelCandidates.length) {
      if (dryRun) {
        result.cancelled.push(...cancelCandidates.map((c) => c.item));
      } else {
        try {
          await reconcileOpenEvents({ sourceLabel: "Before auto-cancelling unpaid registrations", admin: { name: "Registration scheduler" } });
        } catch (err) {
          console.error("Pre-cancel reconciliation failed:", err.message);
        }
        for (const c of cancelCandidates) {
          const { rows } = await pool.query(
            `UPDATE kutumb_event_registrations
                SET registration_status = 'cancelled', cancelled_at = now(),
                    cancel_reason = 'Payment not received by the cancellation date (automatic)'
              WHERE id = $1 AND registration_status = 'pending_payment' AND payment_status <> 'Paid'
                AND COALESCE(payment_amount, 0) = 0
              RETURNING id`,
            [c.r.id]
          );
          if (!rows.length) continue; // paid (or changed) in the meantime
          await markSent(c.r.id, "cancelled", "", now);
          result.cancelled.push(c.item);
          const sent = await sendRegistrationCancelledEmail({
            ...c.common,
            registerUrl: baseUrl ? `${baseUrl}/events` : null,
          });
          if (!sent.sent) result.failed.push({ ...c.item, kind: "cancelled", error: sent.error });
        }
      }
    }

    // ── Tell the admin mailbox about cancellations and anything to review ──
    if (!dryRun && (result.cancelled.length || result.needsReview.length)) {
      const lines = [];
      if (result.cancelled.length) {
        lines.push("Cancelled (payment not received):");
        for (const c of result.cancelled) lines.push(`  • ${c.event} — ${c.registrationNumber || ""} ${c.name} <${c.email}> ($${c.amountDue.toFixed(2)} due)`);
        lines.push("");
      }
      if (result.needsReview.length) {
        lines.push("Please review (NOT cancelled automatically):");
        for (const c of result.needsReview) lines.push(`  • ${c.event} — ${c.registrationNumber || ""} ${c.name} <${c.email}>: ${c.reason}`);
      }
      const alert = await sendAdminAlertEmail({ subject: "Registration payments — automatic actions", message: lines.join("\n") }).catch(
        (err) => ({ sent: false, error: err.message })
      );
      // Only stop re-flagging once the admin has actually been told.
      if (alert?.sent) for (const c of result.needsReview) await markSent(c.id, "flagged_review", "", now);
    }

    return result;
  } finally {
    if (locked) await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_KEY]).catch(() => {});
    lockClient.release();
    if (!dryRun) {
      lastRun = result;
      const didSomething =
        result.reminders.length || result.finals.length || result.cancelled.length || result.welcomes.length || result.failed.length;
      if (didSomething) await setSetting("reg_emails_last_run", JSON.stringify(result), false).catch(() => {});
    }
  }
}

/** Upcoming events (incl. ones the scheduler has to skip) with their ticks and counts. */
export async function listEventsForEmails(now = new Date()) {
  const syd = sydneyParts(now);
  const todayN = dayNumber(syd.y, syd.m, syd.d);
  const { rows } = await pool.query("SELECT * FROM kutumb_upcoming_events ORDER BY id");
  const out = [];
  for (const e of rows) {
    const text = String(e.date_text || "").trim();
    const start = MONTH_ONLY.test(text) ? null : parseEventStartDate(text);
    const eventN = start ? dayNumber(start.getFullYear(), start.getMonth() + 1, start.getDate()) : null;
    if (eventN !== null && eventN < todayN) continue; // already happened
    const eventYear = start ? String(start.getFullYear()) : String(text.match(/\d{4}/)?.[0] || "");
    const { rows: counts } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE registration_status = 'pending_payment' AND fee > 0 AND payment_status <> 'Paid')::int AS unpaid,
         COUNT(*) FILTER (WHERE registration_status = 'confirmed')::int AS confirmed,
         COUNT(*) FILTER (WHERE registration_status = 'cancelled')::int AS cancelled
       FROM kutumb_event_registrations WHERE lower(event_name) = lower($1) AND event_year = $2`,
      [e.title, eventYear]
    );
    out.push({
      id: e.id,
      title: e.title,
      dateText: e.date_text,
      daysUntil: eventN === null ? null : eventN - todayN,
      schedulable: eventN !== null,
      paidEvent: Number(e.member_fee) > 0 || Number(e.non_member_fee) > 0,
      autoReminders: e.auto_reminders !== false,
      autoCancel: e.auto_cancel === true,
      autoWelcome: e.auto_welcome !== false,
      ...counts[0],
    });
  }
  return out.sort((a, b) => (a.daysUntil ?? 1e9) - (b.daysUntil ?? 1e9));
}

export async function getSchedulerStatus() {
  let lastActivity = null;
  try {
    const raw = await getSetting("reg_emails_last_run");
    lastActivity = raw ? JSON.parse(raw) : null;
  } catch {
    /* ignore */
  }
  const { rows } = await pool.query(
    `SELECT kind, COUNT(*)::int AS n FROM kutumb_registration_notifications
      WHERE sent_at > now() - interval '30 days' GROUP BY kind`
  );
  return {
    lastCheck: lastRun ? { at: lastRun.at, note: lastRun.note } : null,
    lastActivity,
    last30Days: Object.fromEntries(rows.map((r) => [r.kind, r.n])),
    config: await loadConfig().then((c) => ({ ...c, reminderDays: [...c.reminderDays] })),
  };
}

export function startRegistrationScheduler() {
  if (timer) clearInterval(timer);
  const tick = () =>
    runRegistrationEmails().catch((err) => console.error("Registration email scheduler error:", err.message));
  timer = setInterval(tick, 15 * 60_000);
  timer.unref?.();
  setTimeout(tick, 60_000).unref?.();
  console.log("⏰ Registration emails: reminders, auto-cancel and day-before welcome checked every 15 min");
}
