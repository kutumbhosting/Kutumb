import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import cors from "cors";
import multer from "multer";
import { fileURLToPath } from "url";
import fileManagerRoutes from "./routes/filemanager.js";
import pastEventsRouter from "./routes/pastEventsRoute.js";
import { getNextMembershipNumber } from "./lib/counters.js";
import { getNextRegistrationNumber } from "./lib/registrationNumber.js";
import { generateQrDataUrl, generateQrPngBuffer, buildCardPdf } from "./lib/membershipCard.js";
import {
  sendMembershipConfirmationEmail,
  sendEventConfirmationEmail,
  sendEventPaymentConfirmationEmail,
  sendDonationThankYouEmail,
  checkEmailConfig,
  sendTestEmail,
} from "./lib/mailer.js";
import { sendWhatsAppDocument } from "./lib/whatsapp.js";
import { parseEventEndDate, sortPastEventsDescending } from "./lib/eventDates.js";
import { requireAdmin } from "./lib/auth.js";
import { pool } from "./db/pool.js";
import adminAuthRoutes from "./routes/adminAuth.routes.js";
import adminConsoleRoutes from "./routes/adminConsole.routes.js";
import dbTablesRoutes from "./routes/dbTables.routes.js";
import ticketingRoutes, { stripeWebhookHandler } from "./routes/ticketing.routes.js";
import checkinRoutes from "./routes/checkin.routes.js";
import mediaRoutes from "./routes/media.routes.js";
import { slugify } from "./lib/slugify.js";
import { DATA_ROOT } from "./lib/dataRoot.js";
import { importMembersDropIn } from "./lib/importMembersDropIn.js";

const app = express();

app.use(cors());

// Stripe webhook needs the RAW body to verify its signature, so it must be
// registered before express.json() parses the body for every other route.
app.post("/api/ticketing/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);

app.use(express.json());
app.use(cookieParser());

/* -----------------------------
   🎟️  New event-management modules (admin login, Stripe ticketing,
   QR check-in) — Postgres-backed, entirely additive to the JSON site below.
------------------------------ */
app.use("/api/admin-auth", adminAuthRoutes);
app.use("/api/admin-console", adminConsoleRoutes);
app.use("/api/db-tables", dbTablesRoutes);
app.use("/api/ticketing", ticketingRoutes);
app.use("/api/checkin", checkinRoutes);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



// ── Seed a fresh/empty DATA_ROOT (e.g. a brand-new persistent volume) ──────
// SEED_DATA_DIR is the server/data folder as baked into this build/image -
// always the same regardless of what DATA_ROOT is pointed at. If DATA_ROOT
// has been redirected somewhere else (a mounted persistent volume) and it
// hasn't been seeded yet, copy the bundled starting content into it once.
//
// Seeding is decided by an explicit marker file (.kutumb-seeded), NOT by
// "is the directory empty" - freshly formatted cloud block volumes often
// auto-create a `lost+found` directory, which made a naive emptiness check
// think the volume already had data and skip seeding entirely, leaving the
// app with nothing. The marker file sidesteps that completely.
const SEED_DATA_DIR = path.join(__dirname, "data");
const SEED_MARKER_FILE = path.join(DATA_ROOT, ".kutumb-seeded");
(function seedDataIfNeeded() {
  try {
    if (path.resolve(DATA_ROOT) === path.resolve(SEED_DATA_DIR)) return; // not redirected - nothing to seed
    if (!fs.existsSync(SEED_DATA_DIR)) return; // no bundled seed available
    if (fs.existsSync(SEED_MARKER_FILE)) return; // already seeded previously - never overwrite

    console.log(`🌱 DATA_ROOT (${DATA_ROOT}) has not been seeded yet - copying bundled starting data...`);
    fs.mkdirSync(DATA_ROOT, { recursive: true });
    fs.cpSync(SEED_DATA_DIR, DATA_ROOT, { recursive: true });
    fs.writeFileSync(SEED_MARKER_FILE, new Date().toISOString());
    console.log("✅ Seed data copied to persistent storage.");
  } catch (err) {
    console.error("SEED DATA ERROR:", err);
  }
})();

// Flyer images and past-event photos/videos now live in Postgres
// (kutumb_media_files), served dynamically instead of as static files.
app.use("/api/media", mediaRoutes);
app.use("/api/pastevents", pastEventsRouter);

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 8080}`;

/* -----------------------------
   🧼 HELPERS
------------------------------ */

const year = (text) => {
  const match = text?.match(/\d{4}/);
  return match ? match[0] : "unknown";
};

/* -----------------------------
   🗄️  AUTO-ARCHIVE EXPIRED EVENTS
   Moves any upcoming event whose date has passed into Past Events.
------------------------------ */
async function archiveExpiredUpcomingEvents() {
  try {
    const { rows: events } = await pool.query("SELECT * FROM kutumb_upcoming_events");
    if (events.length === 0) return;

    const now = new Date();
    const expired = events.filter((event) => {
      const endDate = parseEventEndDate(event.date_text);
      return endDate && endDate.getTime() < now.getTime();
    });
    if (expired.length === 0) return;

    for (const event of expired) {
      const eventId = slugify(event.title);
      const eventYear = event.date_text ? String(year(event.date_text)) : "unknown";

      const { rows: regRows } = await pool.query(
        "SELECT adults, children FROM kutumb_event_registrations WHERE lower(event_name) = lower($1) AND event_year = $2",
        [event.title, eventYear]
      );
      const attendeesCount = regRows.reduce((sum, r) => sum + 1 + (Number(r.adults) || 0) + (Number(r.children) || 0), 0);

      const { rows: existingPast } = await pool.query(
        "SELECT * FROM kutumb_past_events WHERE title = $1 AND date_text = $2",
        [event.title, event.date_text]
      );

      let pastEventId;
      if (existingPast.length > 0) {
        pastEventId = existingPast[0].id;
        await pool.query(
          "UPDATE kutumb_past_events SET description = COALESCE(NULLIF(description, ''), $1) WHERE id = $2",
          [event.description || "", pastEventId]
        );
      } else {
        const { rows: inserted } = await pool.query(
          "INSERT INTO kutumb_past_events (title, date_text, description, highlights) VALUES ($1,$2,$3,'') RETURNING id",
          [event.title, event.date_text, event.description || ""]
        );
        pastEventId = inserted[0].id;
      }

      // Carry the flyer image across into the past-media library so it
      // still renders on the Past Events page — this is now a database row
      // copy (duplicate the bytes under a new filename) rather than a
      // filesystem copy, since both live in kutumb_media_files.
      if (event.flyer_image) {
        const destName = `archived-${eventId}-${event.flyer_image}`;
        const { rows: existingMedia } = await pool.query(
          "SELECT id FROM kutumb_past_event_media WHERE past_event_id = $1 AND src = $2",
          [pastEventId, destName]
        );

        if (existingMedia.length === 0) {
          const { rows: srcFile } = await pool.query(
            "SELECT mimetype, size_bytes, data FROM kutumb_media_files WHERE filename = $1",
            [event.flyer_image]
          );
          if (srcFile.length > 0) {
            try {
              await pool.query(
                `INSERT INTO kutumb_media_files (filename, mimetype, size_bytes, data)
                 VALUES ($1,$2,$3,$4) ON CONFLICT (filename) DO NOTHING`,
                [destName, srcFile[0].mimetype, srcFile[0].size_bytes, srcFile[0].data]
              );
              await pool.query(
                "INSERT INTO kutumb_past_event_media (past_event_id, type, src, sort_order) VALUES ($1,'image',$2,999)",
                [pastEventId, destName]
              );
            } catch (copyErr) {
              console.error("Archive media copy failed:", copyErr);
            }
          }
        }
      }

      await pool.query("DELETE FROM kutumb_upcoming_events WHERE id = $1", [event.id]);
      console.log(`📦 Auto-archived expired event "${event.title}" (${event.date_text}) to Past Events`);
    }
  } catch (err) {
    console.error("ARCHIVE EVENTS ERROR:", err);
  }
}

app.get("/ping", (req, res) => {
  res.send("pong");
});

/* -----------------------------
   ✅ REGISTER EVENT
------------------------------ */
app.post("/api/events", async (req, res) => {
  const { eventName, eventDate, name, email, phone, adults, children, comments } = req.body;

  if (!eventName || !name || !email || !phone) {
    return res.status(400).json({ message: "Name, email and phone are required" });
  }

  let eventYear = year(eventDate);

  const { rows: eventMetaRows } = await pool.query(
    "SELECT * FROM kutumb_upcoming_events WHERE lower(title) = lower($1)",
    [eventName]
  );
  const eventMeta = eventMetaRows[0] || null;

  const client = await pool.connect();
  let lockError = null;
  let newRegistration = null;
  let applicableFee = 0;
  let perPersonFee = 0;
  let matchedMember = null;

  try {
    await client.query("BEGIN");
    // Serializes the whole read-check-write cycle per event, exactly like
    // the old file lock did — two people registering for the very last
    // spot at nearly the same moment can no longer both read "1 spot left"
    // before either write lands and both get in. Everything below runs
    // inside one transaction, keyed to this specific event by name+year.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [`kutumb_event_reg_${eventName.toLowerCase()}_${eventYear}`]
    );

    const existsCheck = await client.query(
      "SELECT id FROM kutumb_event_registrations WHERE event_name = $1 AND event_year = $2 AND lower(email) = lower($3)",
      [eventName, eventYear, email]
    );
    if (existsCheck.rows.length > 0) {
      lockError = { status: 409, message: "Already registered" };
    } else {
      const capacity = Number(eventMeta?.capacity || 0);
      const memberFee = Number(eventMeta?.member_fee || 0);
      const nonMemberFee = Number(eventMeta?.non_member_fee || 0);

      const { rows: existingRegs } = await client.query(
        "SELECT adults, children, registration_number FROM kutumb_event_registrations WHERE event_name = $1 AND event_year = $2",
        [eventName, eventYear]
      );
      const used = existingRegs.reduce((sum, r) => sum + 1 + (Number(r.adults) || 0) + (Number(r.children) || 0), 0);
      const requested = (Number(adults) || 0) + (Number(children) || 0);

      if (capacity > 0 && used + requested > capacity) {
        lockError = { status: 400, message: "Not enough spots available" };
      } else {
        const { rows: memberRows } = await client.query(
          "SELECT * FROM kutumb_members WHERE lower(email) = lower($1)",
          [email]
        );
        matchedMember = memberRows[0] || null;

        const registrationNumber = getNextRegistrationNumber(
          existingRegs.map((r) => ({ registrationNumber: r.registration_number }))
        );
        perPersonFee = matchedMember?.membership_number ? memberFee : nonMemberFee;
        const totalAttendees = 1 + (Number(adults) || 0) + (Number(children) || 0);
        applicableFee = perPersonFee * totalAttendees;

        const { rows: inserted } = await client.query(
          `INSERT INTO kutumb_event_registrations
             (event_name, event_year, name, email, phone, adults, children, comments, registration_number,
              is_member, membership_number, fee, per_person_fee, bank_transferred, transaction_number, payment_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,FALSE,NULL,$14) RETURNING *`,
          [
            eventName, eventYear, name, email, phone, Number(adults) || 0, Number(children) || 0, comments || null,
            registrationNumber, !!matchedMember?.membership_number, matchedMember?.membership_number || null,
            applicableFee, perPersonFee, applicableFee > 0 ? "Pending" : "N/A",
          ]
        );
        newRegistration = inserted[0];
      }
    }

    if (lockError) {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("EVENT REGISTRATION ERROR:", err);
    client.release();
    return res.status(500).json({ message: "Registration failed" });
  } finally {
    client.release();
  }

  if (lockError) {
    return res.status(lockError.status).json({ message: lockError.message });
  }

  // ── Attach the event's flyer image to the confirmation email, if any ────
  let flyerBuffer = null;
  let flyerFilename = null;
  if (eventMeta?.flyer_image) {
    const { rows: flyerRows } = await pool.query("SELECT data FROM kutumb_media_files WHERE filename = $1", [eventMeta.flyer_image]);
    if (flyerRows.length > 0) {
      flyerBuffer = flyerRows[0].data;
      flyerFilename = eventMeta.flyer_image;
    }
  }

  // ── Send a simple success confirmation email (text mention of membership
  // number if applicable - no card, no QR, no PDF) ────────────────────────
  sendEventConfirmationEmail({
    to: email,
    name,
    eventName,
    eventDate,
    registrationNumber: newRegistration.registration_number,
    fee: applicableFee,
    membershipNumber: matchedMember?.membership_number || null,
    flyerBuffer,
    flyerFilename,
  }).catch((err) => console.error("Event email error:", err));

  res.status(201).json({
    message: "Registration successful",
    registrationNumber: newRegistration.registration_number,
    isMember: !!matchedMember,
    membershipNumber: matchedMember?.membership_number || null,
    qrCode: matchedMember?.qr_code || null,
    fee: applicableFee,
    perPersonFee,
    adults: Number(adults) || 0,
    children: Number(children) || 0,
    name,
    email,
    phone,
    eventName,
    eventDate,
    eventYear,
  });
});

/* -----------------------------
   ✅ REGISTER MEMBER
------------------------------ */
app.post("/api/members", async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, email, phone, address, interests } = req.body;

    // Name, email and phone are compulsory
    if (!name?.trim() || !email?.trim() || !phone?.trim()) {
      client.release();
      return res.status(400).json({ message: "Name, email and phone are required" });
    }

    const normalizedName = name.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();

    await client.query("BEGIN");
    // Serializes membership-number generation across concurrent signups so
    // two people signing up at the same instant can never be handed the
    // same number (the equivalent problem to the event-capacity race, just
    // for a generated sequence instead of a headcount).
    await client.query("SELECT pg_advisory_xact_lock(hashtext('kutumb_members_seq'))");

    const dupCheck = await client.query(
      "SELECT id FROM kutumb_members WHERE lower(name) = $1 AND lower(email) = $2",
      [normalizedName, normalizedEmail]
    );
    if (dupCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      client.release();
      return res.status(409).json({ message: "This name and email combination is already a registered member" });
    }

    const { rows: existingRows } = await client.query("SELECT membership_number FROM kutumb_members");
    const existingForCounter = existingRows.map((r) => ({ membershipNumber: r.membership_number }));
    const membershipNumber = getNextMembershipNumber(existingForCounter);

    const qrDataUrl = await generateQrDataUrl(membershipNumber);
    const qrPngBuffer = await generateQrPngBuffer(membershipNumber);

    await client.query(
      `INSERT INTO kutumb_members (name, email, phone, address, interests, membership_number, qr_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [name, email, phone, address || null, interests || [], membershipNumber, qrDataUrl]
    );
    await client.query("COMMIT");

    // Build the same PDF card shown in the popup / download button, so the
    // email carries the actual membership card, not just the QR code.
    const cardPdfBuffer = await buildCardPdf({
      title: "Kutumb Membership Card",
      membershipNumber,
      name,
      email,
      phone,
      qrPngBuffer,
    });

    // Send confirmation email - failures are logged but never block registration
    sendMembershipConfirmationEmail({
      to: email,
      name,
      membershipNumber,
      qrPngBuffer,
      cardPdfBuffer,
    }).catch((err) => console.error("Membership email error:", err));

    res.status(201).json({
      message: "Member registered",
      membershipNumber,
      qrCode: qrDataUrl,
      name,
      email,
      phone,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("POST /members error:", err);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
});

/* -----------------------------
   🪪 MEMBERSHIP CARD PDF (download / WhatsApp source)
------------------------------ */
app.get("/api/members/:membershipNumber/card.pdf", async (req, res) => {
  try {
    const { membershipNumber } = req.params;
    const { rows } = await pool.query("SELECT * FROM kutumb_members WHERE membership_number = $1", [membershipNumber]);
    const member = rows[0];
    if (!member) return res.status(404).json({ message: "Member not found" });

    const qrPngBuffer = await generateQrPngBuffer(member.membership_number);
    const pdfBuffer = await buildCardPdf({
      title: "Kutumb Membership Card",
      membershipNumber: member.membership_number,
      name: member.name,
      email: member.email,
      phone: member.phone,
      qrPngBuffer,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="kutumb-membership-${member.membership_number}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (err) {
    console.error("CARD PDF ERROR:", err);
    res.status(500).json({ message: "Failed to generate card" });
  }
});

/* -----------------------------
   📲 SEND MEMBERSHIP CARD VIA WHATSAPP
------------------------------ */
app.post("/api/members/send-whatsapp", requireAdmin, async (req, res) => {
  try {
    const { membershipNumber, whatsappNumber } = req.body;
    if (!membershipNumber || !whatsappNumber) {
      return res.status(400).json({ message: "Membership number and WhatsApp number are required" });
    }

    const { rows } = await pool.query("SELECT * FROM kutumb_members WHERE membership_number = $1", [membershipNumber]);
    const member = rows[0];
    if (!member) return res.status(404).json({ message: "Member not found" });

    const pdfUrl = `${PUBLIC_BASE_URL}/api/members/${membershipNumber}/card.pdf`;

    const result = await sendWhatsAppDocument({
      to: whatsappNumber,
      pdfUrl,
      filename: `kutumb-membership-${membershipNumber}.pdf`,
      caption: `Kutumb Membership Card - ${member.name} (${membershipNumber})`,
    });

    if (!result.sent) {
      return res.status(502).json({ message: result.error || "WhatsApp send failed" });
    }

    res.json({ message: "Card sent via WhatsApp" });
  } catch (err) {
    console.error("SEND WHATSAPP ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* -----------------------------
   📊 GET ALL REGISTRATIONS (ADMIN) — one flat list across every event,
   replacing the old two-step "list files, then fetch each" dance now that
   there are no files to list.
------------------------------ */
app.get("/api/all-registrations", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM kutumb_event_registrations ORDER BY created_at DESC");
    res.json(
      rows.map((r) => ({
        eventName: r.event_name,
        eventYear: r.event_year,
        name: r.name,
        email: r.email,
        phone: r.phone,
        adults: r.adults,
        children: r.children,
        comments: r.comments,
        registrationNumber: r.registration_number,
        isMember: r.is_member,
        membershipNumber: r.membership_number,
        fee: Number(r.fee),
        perPersonFee: Number(r.per_person_fee),
        bankTransferred: r.bank_transferred,
        transactionNumber: r.transaction_number,
        paymentStatus: r.payment_status,
        createdAt: r.created_at,
      }))
    );
  } catch (err) {
    console.error("ALL REGISTRATIONS ERROR:", err);
    res.status(500).json([]);
  }
});

/* -----------------------------
   💳 RECORD PAYMENT FOR AN EVENT REGISTRATION
   Public/self-service on purpose: this is called straight from the
   registration success dialog on the public Events page, by whoever just
   registered — they aren't logged in as an admin. It's scoped safely by
   requiring an exact match on eventName + eventYear + email, and only ever
   flips the record to "Paid" when a transaction number is actually supplied.
------------------------------ */
app.post("/api/events/record-payment", async (req, res) => {
  try {
    const { eventName, eventYear, email, bankTransferred, transactionNumber } = req.body;
    if (!eventName || !eventYear || !email) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    if (bankTransferred && !transactionNumber?.trim()) {
      return res.status(400).json({ message: "Transaction number is required when bank transfer is marked as done" });
    }

    const { rows } = await pool.query(
      `UPDATE kutumb_event_registrations
       SET bank_transferred = $1, transaction_number = $2, payment_status = $3
       WHERE event_name = $4 AND event_year = $5 AND lower(email) = lower($6)
       RETURNING *`,
      [!!bankTransferred, bankTransferred ? transactionNumber : null, bankTransferred ? "Paid" : "Pending", eventName, eventYear, email]
    );

    if (rows.length === 0) return res.status(404).json({ message: "Registration not found" });
    const updatedEntry = rows[0];

    // Only send a "payment confirmed" email once they've actually marked
    // the bank transfer as done - marking "no, not yet" has nothing to confirm.
    if (updatedEntry.bank_transferred) {
      sendEventPaymentConfirmationEmail({
        to: updatedEntry.email,
        name: updatedEntry.name,
        eventName: updatedEntry.event_name,
        eventDate: req.body.eventDate || null,
        registrationNumber: updatedEntry.registration_number,
        fee: Number(updatedEntry.fee),
        transactionNumber: updatedEntry.transaction_number,
      }).catch((err) => console.error("Payment confirmation email error:", err));
    }

    res.json({ message: "Payment details recorded" });
  } catch (err) {
    console.error("RECORD PAYMENT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/events/update", requireAdmin, async (req, res) => {
  try {
    const { eventName, eventYear, email, updatedData } = req.body;
    if (!eventName || !eventYear || !email) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // A "Paid" status must always be backed by a transaction number — the
    // same rule the public registration-success dialog enforces when the
    // registrant records their own bank transfer. This stops the admin
    // console from marking something Paid with nothing to show for it.
    const txnProvided = updatedData?.transactionNumber !== undefined;
    const trimmedTxn = txnProvided ? String(updatedData.transactionNumber || "").trim() : "";
    if (updatedData?.paymentStatus === "Paid" && !trimmedTxn) {
      return res.status(400).json({ message: "A transaction number is required to mark this registration as Paid" });
    }

    const { rows } = await pool.query(
      `UPDATE kutumb_event_registrations SET
         name = COALESCE($1, name),
         phone = COALESCE($2, phone),
         adults = COALESCE($3, adults),
         children = COALESCE($4, children),
         comments = COALESCE($5, comments),
         fee = COALESCE($6, fee),
         payment_status = COALESCE($7, payment_status),
         transaction_number = CASE WHEN $8 THEN NULLIF($9, '') ELSE transaction_number END,
         bank_transferred = CASE WHEN $8 THEN ($9 <> '') ELSE bank_transferred END
       WHERE event_name = $10 AND event_year = $11 AND lower(email) = lower($12)
       RETURNING *`,
      [
        updatedData?.name, updatedData?.phone,
        updatedData?.adults !== undefined ? Number(updatedData.adults) : null,
        updatedData?.children !== undefined ? Number(updatedData.children) : null,
        updatedData?.comments, updatedData?.fee !== undefined ? Number(updatedData.fee) : null,
        updatedData?.paymentStatus,
        txnProvided, trimmedTxn,
        eventName, eventYear, email,
      ]
    );

    if (rows.length === 0) return res.status(404).json({ message: "Registration not found" });
    res.json({ message: "Event registration updated successfully" });
  } catch (err) {
    console.error("EVENT UPDATE ERROR:", err);
    res.status(500).json({ message: "Update failed" });
  }
});

/* -----------------------------
   ✅ DELETE EVENT REGISTRATIONS
------------------------------ */
app.post("/api/events/delete", requireAdmin, async (req, res) => {
  try {
    const { eventName, eventYear, emails } = req.body;
    if (!eventName || !eventYear || !emails?.length) {
      return res.status(400).json({ message: "Missing data" });
    }

    await pool.query(
      "DELETE FROM kutumb_event_registrations WHERE event_name = $1 AND event_year = $2 AND lower(email) = ANY($3)",
      [eventName, eventYear, emails.map((e) => e.toLowerCase())]
    );
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});

/* -----------------------------
   📊 GET SINGLE EVENT (by name + year)
------------------------------ */
app.get("/api/events/:eventName/:eventYear", requireAdmin, async (req, res) => {
  const { eventName, eventYear } = req.params;
  const { rows } = await pool.query(
    "SELECT * FROM kutumb_event_registrations WHERE event_name = $1 AND event_year = $2 ORDER BY created_at",
    [eventName, eventYear]
  );
  res.json(rows);
});

/* -----------------------------
   🔎 LOOK UP A MEMBER BY NAME + EMAIL
   Used to live-populate the membership number field on the event
   registration and donation forms as the person types.
------------------------------ */
app.get("/api/members/lookup", async (req, res) => {
  try {
    const email = (req.query.email || "").toString().trim().toLowerCase();
    if (!email) return res.json({ found: false });

    const { rows } = await pool.query("SELECT * FROM kutumb_members WHERE lower(email) = $1", [email]);
    const match = rows[0];
    if (!match?.membership_number) return res.json({ found: false });

    res.json({
      found: true,
      membershipNumber: match.membership_number,
      name: match.name,
    });
  } catch (err) {
    console.error("MEMBER LOOKUP ERROR:", err);
    res.status(500).json({ found: false });
  }
});

/* -----------------------------
   👥 GET ALL MEMBERS
------------------------------ */
app.get("/api/members", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM kutumb_members ORDER BY created_at DESC");
    res.json(
      rows.map((m) => ({
        name: m.name,
        email: m.email,
        phone: m.phone,
        address: m.address,
        interests: m.interests || [],
        membershipNumber: m.membership_number,
        qrCode: m.qr_code,
        createdAt: m.created_at,
      }))
    );
  } catch (err) {
    console.error("GET /members error:", err);
    res.status(500).json([]);
  }
});

/* -----------------------------
   ✅ DELETE MEMBER
------------------------------ */
app.post("/api/members/delete", requireAdmin, async (req, res) => {
  try {
    const { emails } = req.body;
    if (!emails || !Array.isArray(emails) || !emails.length) {
      return res.status(400).json({ message: "No emails provided" });
    }

    await pool.query("DELETE FROM kutumb_members WHERE lower(email) = ANY($1)", [emails.map((e) => e.toLowerCase())]);
    res.json({ message: "Members deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Delete failed" });
  }
});

/* -----------------------------
   ✅ UPDATE MEMBER
------------------------------ */
app.post("/api/members/update", requireAdmin, async (req, res) => {
  try {
    const { email, updatedData } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    let interests = updatedData?.interests;
    if (typeof interests === "string") {
      interests = interests.split(",").map((i) => i.trim()).filter(Boolean);
    }

    // A new email address may have been supplied — trim/normalize it and,
    // if it's actually different from the current one, make sure it's not
    // already used by a *different* member before writing it.
    const newEmail = updatedData?.email?.trim();
    if (newEmail) {
      const dupCheck = await pool.query(
        "SELECT id FROM kutumb_members WHERE lower(email) = lower($1) AND lower(email) <> lower($2)",
        [newEmail, email]
      );
      if (dupCheck.rows.length > 0) {
        return res.status(409).json({ message: "That email address is already used by another member" });
      }
    }

    const { rows } = await pool.query(
      `UPDATE kutumb_members SET
         name = COALESCE($1, name),
         email = COALESCE(NULLIF($2, ''), email),
         phone = COALESCE($3, phone),
         address = COALESCE($4, address),
         interests = COALESCE($5, interests)
       WHERE lower(email) = lower($6)
       RETURNING *`,
      [updatedData?.name, newEmail || null, updatedData?.phone, updatedData?.address, interests || null, email]
    );

    if (rows.length === 0) return res.status(404).json({ message: "Member not found" });
    res.json({ message: "Member updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Update failed" });
  }
});

/* -----------------------------
   ✅ UPCOMING EVENTS
------------------------------ */
app.get("/api/upcoming-events", async (req, res) => {
  try {
    await archiveExpiredUpcomingEvents();

    const debug = req.query.debug === "true";

    const { rows: events } = await pool.query("SELECT * FROM kutumb_upcoming_events ORDER BY id");

    const enriched = await Promise.all(
      events.map(async (event) => {
        const eventYear = event.date_text ? String(year(event.date_text)) : "unknown";
        const { rows: regRows } = await pool.query(
          "SELECT adults, children FROM kutumb_event_registrations WHERE lower(event_name) = lower($1) AND event_year = $2",
          [event.title, eventYear]
        );
        const totalRegistered = regRows.reduce((sum, r) => sum + 1 + (Number(r.adults) || 0) + (Number(r.children) || 0), 0);
        const capacity = Number(event.capacity || 0);
        const availableSpots = Math.max(capacity - totalRegistered, 0);

        return {
          title: event.title,
          date: event.date_text,
          time: event.time_text,
          location: event.location,
          capacity,
          memberFee: Number(event.member_fee) || 0,
          nonMemberFee: Number(event.non_member_fee) || 0,
          description: event.description,
          isActive: event.is_active,
          published: event.published,
          flyerImage: event.flyer_image || "",
          createdAt: event.created_at,
          updatedAt: event.updated_at,
          registrationsCount: totalRegistered,
          availableSpots,
          ...(debug && { _debug: { eventYear, registrationsFound: regRows.length } }),
        };
      })
    );

    res.json(enriched);
  } catch (err) {
    console.error("UPCOMING EVENTS ERROR:", err);
    res.status(500).json([]);
  }
});

/* -----------------------------
   ✅ UPCOMING EVENTS UPDATE (upsert by title)
------------------------------ */
app.post("/api/upcoming-events/update", requireAdmin, async (req, res) => {
  try {
    const e = req.body;
    if (!e?.title?.trim()) return res.status(400).json({ message: "Title is required" });

    const existing = await pool.query("SELECT id, flyer_image FROM kutumb_upcoming_events WHERE title = $1", [e.title]);

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE kutumb_upcoming_events SET
           date_text = COALESCE($1, date_text), time_text = COALESCE($2, time_text),
           location = COALESCE($3, location), capacity = COALESCE($4, capacity),
           member_fee = COALESCE($5, member_fee), non_member_fee = COALESCE($6, non_member_fee),
           description = COALESCE($7, description), is_active = COALESCE($8, is_active),
           published = COALESCE($9, published), flyer_image = COALESCE($10, flyer_image),
           updated_at = now()
         WHERE title = $11`,
        [
          e.date, e.time, e.location, e.capacity !== undefined ? Number(e.capacity) : null,
          e.memberFee !== undefined ? Number(e.memberFee) : null, e.nonMemberFee !== undefined ? Number(e.nonMemberFee) : null,
          e.description, e.isActive, e.published, e.flyerImage || existing.rows[0].flyer_image, e.title,
        ]
      );
      res.json({ message: "Event updated" });
    } else {
      await pool.query(
        `INSERT INTO kutumb_upcoming_events (title, date_text, time_text, location, capacity, member_fee, non_member_fee, description, is_active, published, flyer_image)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          e.title, e.date || null, e.time || null, e.location || null, Number(e.capacity) || 0,
          Number(e.memberFee) || 0, Number(e.nonMemberFee) || 0, e.description || null,
          !!e.isActive, e.published ?? true, e.flyerImage || null,
        ]
      );
      res.json({ message: "Event added" });
    }
  } catch (err) {
    console.error("UPCOMING EVENTS UPDATE ERROR:", err);
    res.status(500).json({ message: "Update failed" });
  }
});

/* -----------------------------
   ✅ DELETE AN UPCOMING EVENT
------------------------------ */
app.post("/api/upcoming-events/delete", requireAdmin, async (req, res) => {
  try {
    const { title } = req.body;
    await pool.query("DELETE FROM kutumb_upcoming_events WHERE title = $1", [title]);
    res.json({ message: "Event deleted successfully" });
  } catch (err) {
    console.error("DELETE UPCOMING EVENT ERROR:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});

/* -----------------------------
   📁 FLYER STORAGE — image bytes go straight into Postgres
   (kutumb_media_files) via memory storage, never touching disk.
------------------------------ */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

/* -----------------------------
   ✅ FLYER UPLOAD + LINK
------------------------------ */
app.post("/api/upload-flyer", requireAdmin, upload.single("flyer"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const fileName = Date.now() + "-" + req.file.originalname.replace(/\s+/g, "-");
    const { event } = req.body;
    if (!event) return res.status(400).json({ message: "Event data missing" });

    await pool.query(
      "INSERT INTO kutumb_media_files (filename, mimetype, size_bytes, data) VALUES ($1,$2,$3,$4)",
      [fileName, req.file.mimetype, req.file.size, req.file.buffer]
    );

    const parsedEvent = JSON.parse(event);
    const { rows } = await pool.query(
      "UPDATE kutumb_upcoming_events SET flyer_image = $1, updated_at = now() WHERE title = $2 RETURNING id",
      [fileName, parsedEvent.title?.trim()]
    );

    res.json({
      message: rows.length > 0 ? "Flyer linked successfully" : "Upload done but event not matched",
      fileName,
      updated: rows.length > 0,
    });
  } catch (err) {
    console.error("UPLOAD FLYER ERROR:", err);
    res.status(500).json({ message: "Upload failed" });
  }
});

/* -----------------------------
   ✅ DELETE FLYER
------------------------------ */
app.post("/api/delete-flyer", requireAdmin, async (req, res) => {
  try {
    const { title, fileName } = req.body;
    if (!title || !fileName) return res.status(400).json({ message: "Missing data" });

    await pool.query("DELETE FROM kutumb_media_files WHERE filename = $1", [fileName]);
    await pool.query("UPDATE kutumb_upcoming_events SET flyer_image = '', updated_at = now() WHERE title = $1", [title]);
    return res.json({ message: "Flyer deleted successfully" });
  } catch (err) {
    console.error("DELETE FLYER ERROR:", err);
    return res.status(500).json({ message: "Delete failed" });
  }
});

/* -----------------------------
   🔌 EXECUTIVE TEAM
------------------------------ */

// ✅ serve images
app.use("/team-images", express.static(path.join(DATA_ROOT, "team")));

// ✅ TEAM API
app.get("/api/team", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM kutumb_team_profiles ORDER BY sort_order, id");
    res.json(rows.map((t) => ({ name: t.name, role: t.role, phone: t.phone, email: t.email, bio: t.bio, image: t.image })));
  } catch (err) {
    console.error("TEAM API ERROR:", err);
    res.status(500).json([]);
  }
});

/* -----------------------------
   🔌 KUTUMB ACTIVITIES
------------------------------ */

app.use("/activity-images", express.static(path.join(DATA_ROOT, "activities")));

app.get("/api/activities", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM kutumb_activities ORDER BY sort_order, id");
    res.json(
      rows.map((a) => ({
        title: a.title,
        image1: a.image1,
        image2: a.image2,
        description: a.description,
        schedule: a.schedule,
        participationOptions: a.participation_options || [],
        onlineYoga: a.online_yoga || [],
        inPersonYoga: a.in_person_yoga || [],
        benefits: a.benefits || [],
      }))
    );
  } catch (err) {
    console.error("ACTIVITIES API ERROR:", err);
    res.status(500).json([]);
  }
});

/* -----------------------------
   🔌 KUTUMB ACTIVITIES REGISTRATION
------------------------------ */

app.post("/api/activity-register", async (req, res) => {
  try {
    const data = req.body;
    if (!data.activityTitle || !data.email) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const { name, email, activityTitle, ...rest } = data;
    try {
      await pool.query(
        "INSERT INTO kutumb_activity_registrations (activity_title, name, email, details) VALUES ($1,$2,$3,$4)",
        [activityTitle, name || null, email, JSON.stringify(rest)]
      );
    } catch (err) {
      if (err.code === "23505") {
        // unique constraint on (activity_title, lower(email))
        return res.status(409).json({ message: "You are already registered for this activity." });
      }
      throw err;
    }

    res.status(201).json({ message: "Registration successful!" });
  } catch (err) {
    console.error("ACTIVITY REGISTER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* -----------------------------
   🔌 FILE MANAGER ROUTES
------------------------------ */
app.use("/api", fileManagerRoutes);

app.get("/api/email/status", async (req, res) => {
  const status = await checkEmailConfig();
  res.json(status);
});

app.post("/api/email/test-send", requireAdmin, async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ message: "'to' email address is required" });

  const result = await sendTestEmail(to);
  if (!result.sent) {
    return res.status(502).json({ message: result.error || "Failed to send test email" });
  }
  res.json({ message: `Test email sent to ${to}` });
});

app.get("/api/whatsapp/status", (req, res) => {
  const configured = !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
  const publicUrlOk = !!process.env.PUBLIC_BASE_URL && !process.env.PUBLIC_BASE_URL.includes("localhost");

  res.json({
    configured,
    senderNumber: process.env.WHATSAPP_SENDER_NUMBER || null,
    publicBaseUrl: PUBLIC_BASE_URL,
    publicBaseUrlIsPublic: publicUrlOk,
    readyToSend: configured && publicUrlOk,
    notes: [
      !configured && "WHATSAPP_PHONE_NUMBER_ID and/or WHATSAPP_ACCESS_TOKEN missing from .env",
      !publicUrlOk &&
        "PUBLIC_BASE_URL must be a real public https URL (not localhost) so Meta can fetch the card PDF",
    ].filter(Boolean),
  });
});

/* -----------------------------
   💛 DONATIONS
------------------------------ */

app.post("/api/donations", async (req, res) => {
  try {
    const { name, email, amount, bankTransferred, transactionNumber } = req.body;

    if (!name?.trim() || !email?.trim() || !amount) {
      return res.status(400).json({ message: "Name, email and amount are required" });
    }
    if (bankTransferred && !transactionNumber?.trim()) {
      return res.status(400).json({ message: "Transaction number is required when bank transfer is marked as done" });
    }

    // Look up membership number, same as the event registration form
    const { rows: memberRows } = await pool.query("SELECT membership_number FROM kutumb_members WHERE lower(email) = lower($1)", [email]);
    const matchedMember = memberRows[0] || null;

    const { rows } = await pool.query(
      `INSERT INTO kutumb_donations (name, email, membership_number, amount, bank_transferred, transaction_number)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, email, matchedMember?.membership_number || null, Number(amount), !!bankTransferred, bankTransferred ? transactionNumber : null]
    );
    const donation = rows[0];

    sendDonationThankYouEmail({
      to: email,
      name,
      amount: Number(donation.amount),
      membershipNumber: donation.membership_number,
      bankTransferred: donation.bank_transferred,
      transactionNumber: donation.transaction_number,
    }).catch((err) => console.error("Donation email error:", err));

    res.status(201).json({ message: "Thank you for your donation", donation });
  } catch (err) {
    console.error("DONATION ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/donations", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM kutumb_donations ORDER BY created_at DESC");
    res.json(
      rows.map((d) => ({
        name: d.name,
        email: d.email,
        membershipNumber: d.membership_number,
        amount: Number(d.amount),
        bankTransferred: d.bank_transferred,
        transactionNumber: d.transaction_number,
        createdAt: d.created_at,
      }))
    );
  } catch (err) {
    console.error("GET DONATIONS ERROR:", err);
    res.status(500).json([]);
  }
});

/* -----------------------------
   ✅ MANUAL ARCHIVE TRIGGER (admin)
------------------------------ */
app.post("/api/upcoming-events/archive-now", requireAdmin, async (req, res) => {
  try {
    await archiveExpiredUpcomingEvents();
    res.json({ message: "Archive check complete" });
  } catch (err) {
    console.error("MANUAL ARCHIVE ERROR:", err);
    res.status(500).json({ message: "Archive check failed" });
  }
});

/* -----------------------------
   📸 PAST EVENTS - ADMIN MANAGEMENT
   (update text fields, upload/delete media for a past event — photo/video
   bytes go straight into Postgres via memory storage, same as flyers)
------------------------------ */
const uploadPastMedia = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Update a past event's description/highlights (matched by title + date)
app.post("/api/pastevents/update", requireAdmin, async (req, res) => {
  try {
    const { title, date, description, highlights } = req.body;
    if (!title || !date) return res.status(400).json({ message: "title and date are required" });

    const { rows } = await pool.query(
      `UPDATE kutumb_past_events SET
         description = COALESCE($1, description),
         highlights = COALESCE($2, highlights)
       WHERE title = $3 AND date_text = $4
       RETURNING *`,
      [description, highlights, title, date]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Past event not found" });
    res.json({ message: "Past event updated", event: rows[0] });
  } catch (err) {
    console.error("PAST EVENT UPDATE ERROR:", err);
    res.status(500).json({ message: "Update failed" });
  }
});

// Upload a new photo/video and attach it to a past event (matched by title + date)
app.post("/api/pastevents/upload-media", requireAdmin, uploadPastMedia.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const { title, date } = req.body;
    if (!title || !date) return res.status(400).json({ message: "title and date are required" });

    const { rows: eventRows } = await pool.query("SELECT id FROM kutumb_past_events WHERE title = $1 AND date_text = $2", [title, date]);
    if (eventRows.length === 0) return res.status(404).json({ message: "Past event not found" });

    const filename = Date.now() + "-" + req.file.originalname.replace(/\s+/g, "-");
    await pool.query(
      "INSERT INTO kutumb_media_files (filename, mimetype, size_bytes, data) VALUES ($1,$2,$3,$4)",
      [filename, req.file.mimetype, req.file.size, req.file.buffer]
    );

    const mediaItem = {
      type: req.file.mimetype.startsWith("video") ? "video" : "image",
      src: filename,
    };
    const { rows: countRows } = await pool.query("SELECT COUNT(*) FROM kutumb_past_event_media WHERE past_event_id = $1", [eventRows[0].id]);
    await pool.query(
      "INSERT INTO kutumb_past_event_media (past_event_id, type, src, sort_order) VALUES ($1,$2,$3,$4)",
      [eventRows[0].id, mediaItem.type, mediaItem.src, Number(countRows[0].count)]
    );

    res.json({ message: "Media uploaded", media: mediaItem });
  } catch (err) {
    console.error("PAST EVENT MEDIA UPLOAD ERROR:", err);
    res.status(500).json({ message: "Upload failed" });
  }
});

// Remove a specific media item from a past event (matched by title + date + src)
app.post("/api/pastevents/delete-media", requireAdmin, async (req, res) => {
  try {
    const { title, date, src } = req.body;
    if (!title || !date || !src) {
      return res.status(400).json({ message: "title, date and src are required" });
    }

    const { rows: eventRows } = await pool.query("SELECT id FROM kutumb_past_events WHERE title = $1 AND date_text = $2", [title, date]);
    if (eventRows.length === 0) return res.status(404).json({ message: "Past event not found" });

    await pool.query("DELETE FROM kutumb_past_event_media WHERE past_event_id = $1 AND src = $2", [eventRows[0].id, src]);
    await pool.query("DELETE FROM kutumb_media_files WHERE filename = $1", [src]);

    res.json({ message: "Media removed" });
  } catch (err) {
    console.error("PAST EVENT MEDIA DELETE ERROR:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});

/* ----------------------------- 
🚀 START SERVER + FRONTEND 
------------------------------*/
app.use(express.static(path.join(__dirname, "../dist")));

// -----------------------------
// 🚀 React Router fallback
// -----------------------------
app.use((req, res, next) => {
  if (
    req.method === "GET" &&
    !req.path.startsWith("/api") &&   // 🔥 CRITICAL FIX
    req.accepts("html")
  ) {
    res.sendFile(path.join(__dirname, "../dist/index.html"));
  } else {
    next();
  }
});

//app.get(/.*/, (req, res) => {
  //res.sendFile(path.join(__dirname, "../dist/index.html"));
//});

// -----------------------------
// 🚀 Start server
// -----------------------------
const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on", PORT);

  checkEmailConfig().then((status) => {
    if (!status.configured) {
      console.warn("⚠️  Email is NOT configured - set SMTP_HOST (and SMTP_USER/SMTP_PASS) in .env");
    } else if (status.verified) {
      console.log(`✅ Email configured and verified (sending from ${status.from})`);
    } else {
      console.warn(`⚠️  Email is configured but the connection failed: ${status.error}`);
      console.warn("    Double-check SMTP_HOST/PORT/USER/PASS in .env - see EMAIL-SETUP.md");
    }
  });

  if (process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN) {
    console.log(`✅ WhatsApp configured (sender ${process.env.WHATSAPP_SENDER_NUMBER || "unknown"})`);
    if (!process.env.PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL.includes("localhost")) {
      console.warn(
        "⚠️  PUBLIC_BASE_URL is not set to a public address - WhatsApp document sends will fail " +
        "because Meta's servers cannot download the card PDF from localhost."
      );
    }
  } else {
    console.warn("⚠️  WhatsApp is NOT configured - set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in .env");
  }

  // Move any already-expired events into Past Events on startup,
  // then re-check once an hour as a background safety net (the
  // /api/upcoming-events endpoint also triggers this on every read).
  archiveExpiredUpcomingEvents().catch((err) =>
    console.error("Startup archive check failed:", err)
  );
  setInterval(() => {
    archiveExpiredUpcomingEvents().catch((err) => console.error("Hourly archive check failed:", err));
  }, 60 * 60 * 1000);

  // Pick up a dropped-in server/data/members/members.json on startup, if
  // one's been placed there since the last run (see importMembersDropIn.js
  // for the exact behavior — additive only, then removes the folder).
  importMembersDropIn()
    .then((result) => {
      if (result.found) {
        console.log(`📥 Members drop-in: ${result.imported} imported, ${result.skipped} skipped (already existed)`);
      }
    })
    .catch((err) => console.error("Startup members drop-in check failed:", err));
});
