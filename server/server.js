import "dotenv/config";
import express from "express";
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
  sendDonationThankYouEmail,
  checkEmailConfig,
  sendTestEmail,
} from "./lib/mailer.js";
import { sendWhatsAppDocument } from "./lib/whatsapp.js";
import { parseEventEndDate, sortPastEventsDescending } from "./lib/eventDates.js";

const app = express();

app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const slugify = (text) =>
  text
    ?.toString()
    .toLowerCase() 
    .trim()
    .replace(/\s+/g, "-")
    .replace(/_/g, "-")
    .replace(/[^\w-]+/g, "");

const DATA_ROOT = process.env.DATA_ROOT || path.join(process.cwd(), "server/data");

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

const BASE_DIR = path.join(DATA_ROOT, "events");

if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });

app.use("/eventflyer", express.static(path.join(DATA_ROOT, "eventflyer")));
app.use("/api/pastevents", pastEventsRouter);
app.use("/api/pastmedia", express.static(path.join(DATA_ROOT, "pastmedia")));

const MEMBERS_DIR = path.join(DATA_ROOT, "members");
if (!fs.existsSync(MEMBERS_DIR)) fs.mkdirSync(MEMBERS_DIR, { recursive: true });

const MEMBERS_FILE = path.join(MEMBERS_DIR, "members.json");
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 8080}`;
const UPCOMING_EVENTS_DIR = path.join(DATA_ROOT, "upcomingevents");
if (!fs.existsSync(UPCOMING_EVENTS_DIR)) fs.mkdirSync(UPCOMING_EVENTS_DIR, { recursive: true });

const UPCOMING_EVENTS_FILE = path.join(UPCOMING_EVENTS_DIR, "upcomingEvents.json");

/* -----------------------------
   🧼 HELPERS
------------------------------ */

const year = (text) => {
  const match = text?.match(/\d{4}/);
  return match ? match[0] : "unknown";
};

const readFile = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content || "[]");
  } catch (err) {
    console.error("JSON ERROR:", filePath, err);
    return [];
  }
};

const writeFile = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

/* -----------------------------
   🗄️  AUTO-ARCHIVE EXPIRED EVENTS
   Moves any upcoming event whose date has passed into Past Events.
------------------------------ */
function archiveExpiredUpcomingEvents() {
  try {
    if (!fs.existsSync(UPCOMING_EVENTS_FILE)) return;

    const events = readFile(UPCOMING_EVENTS_FILE);
    if (!Array.isArray(events) || events.length === 0) return;

    const now = new Date();
    const stillUpcoming = [];
    const expired = [];

    for (const event of events) {
      const endDate = parseEventEndDate(event.date);
      if (endDate && endDate.getTime() < now.getTime()) {
        expired.push(event);
      } else {
        stillUpcoming.push(event);
      }
    }

    if (expired.length === 0) return;

    const pastDir = path.join(DATA_ROOT, "pastevents");
    if (!fs.existsSync(pastDir)) fs.mkdirSync(pastDir, { recursive: true });
    const pastFile = path.join(pastDir, "pastEventsData.json");
    const pastEvents = readFile(pastFile);

    const pastMediaDir = path.join(DATA_ROOT, "pastmedia");

    for (const event of expired) {
      const eventId = slugify(event.title);
      const eventYear = event.eventYear || year(event.date);
      const regFile = path.join(BASE_DIR, `${eventId}-${eventYear}.json`);
      const registrations = readFile(regFile);
      const attendeesCount = registrations.reduce(
        (sum, r) => sum + 1 + (Number(r.adults) || 0) + (Number(r.children) || 0),
        0
      );

      const existingIndex = pastEvents.findIndex(
        (p) => p.title === event.title && p.date === event.date
      );
      let media = existingIndex !== -1 ? pastEvents[existingIndex].media || [] : [];

      // Carry the flyer image across into the past-media library so it
      // still renders on the Past Events page. This also picks up a flyer
      // that was added *after* the event was first archived (e.g. the
      // event was re-added to Upcoming with a photo and has now expired
      // again) - it updates the existing past record rather than
      // silently discarding the new photo.
      if (event.flyerImage) {
        const srcPath = path.join(FLYER_DIR, event.flyerImage);
        const destName = `archived-${eventId}-${event.flyerImage}`;
        const alreadyHasThisImage = media.some((m) => m.src === destName);

        if (!alreadyHasThisImage && fs.existsSync(srcPath)) {
          if (!fs.existsSync(pastMediaDir)) fs.mkdirSync(pastMediaDir, { recursive: true });
          try {
            fs.copyFileSync(srcPath, path.join(pastMediaDir, destName));
            media = [...media, { type: "image", src: destName }];
          } catch (copyErr) {
            console.error("Archive media copy failed:", copyErr);
          }
        }
      }

      if (existingIndex !== -1) {
        pastEvents[existingIndex] = {
          ...pastEvents[existingIndex],
          media,
          description: pastEvents[existingIndex].description || event.description || "",
          attendeesCount: Math.max(pastEvents[existingIndex].attendeesCount || 0, attendeesCount),
        };
        console.log(`📦 Updated already-archived event "${event.title}" (${event.date}) with new photo`);
        continue;
      }

      pastEvents.push({
        title: event.title,
        date: event.date,
        description: event.description || "",
        highlights: "",
        media,
        attendeesCount,
        archivedAt: new Date().toISOString(),
      });

      console.log(`📦 Auto-archived expired event "${event.title}" (${event.date}) to Past Events`);
    }

    writeFile(UPCOMING_EVENTS_FILE, stillUpcoming);
    writeFile(pastFile, pastEvents);
  } catch (err) {
    console.error("ARCHIVE EVENTS ERROR:", err);
  }
}

/* -----------------------------
   🪪 BACKFILL MEMBERSHIP NUMBERS + QR CODES
   Assigns a membership number/QR to any member record created before
   this feature existed (e.g. manually seeded members.json entries).
------------------------------ */
async function backfillMembershipNumbers() {
  try {
    const data = readFile(MEMBERS_FILE);
    if (!Array.isArray(data) || data.length === 0) return;

    const missing = data.filter((m) => !m.membershipNumber);
    if (missing.length === 0) return;

    // Assign numbers in the order members actually joined
    missing.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

    for (const member of missing) {
      const registeredAt = member.createdAt ? new Date(member.createdAt) : new Date();
      member.membershipNumber = getNextMembershipNumber(data, registeredAt);
      member.qrCode = await generateQrDataUrl(member.membershipNumber);
      console.log(`🪪 Backfilled membership number ${member.membershipNumber} for ${member.name}`);
    }

    writeFile(MEMBERS_FILE, data);
  } catch (err) {
    console.error("BACKFILL MEMBERSHIP ERROR:", err);
  }
}

app.get("/ping", (req, res) => {
  res.send("pong");
});

app.get("/api/debug-events-path", (req, res) => {
  const root = DATA_ROOT;
  const info = {
    cwd: process.cwd(),
    dirname: __dirname,
    dataRoot: root,
    exists: fs.existsSync(root),
    structure: {
      events: {
        path: path.join(root, "events"),
        files: fs.existsSync(path.join(root, "events"))
          ? fs.readdirSync(path.join(root, "events")).slice(0, 5)
          : [],
      },
      members: { path: path.join(root, "members") },
      upcomingEvents: { file: path.join(root, "upcomingevents", "upcomingEvents.json") },
      flyers: { path: path.join(root, "eventflyer") },
    },
  };
  res.json(info);
});

app.get("/api/debug-upcoming-events-file", (req, res) => {
  try {
    const filePath = UPCOMING_EVENTS_FILE;
    const exists = fs.existsSync(filePath);
    const raw = exists ? fs.readFileSync(filePath, "utf-8") : null;
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; }
    catch (e) { parsed = { error: "Invalid JSON", raw }; }
    res.json({ filePath, exists, raw, parsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/debug-volume", (req, res) => {
  const file = path.join(process.env.DATA_ROOT, "test.txt");
  fs.writeFileSync(file, "hello " + Date.now());
  res.json({ wrote: file, exists: fs.existsSync(file), files: fs.readdirSync(process.env.DATA_ROOT) });
});

app.get("/api/debug-events/:file", (req, res) => {
  const fileName = req.params.file;
  const filePath = path.join(BASE_DIR, `${fileName}.json`);
  console.log("DEBUG FILE PATH:", filePath);
  if (!fs.existsSync(filePath)) return res.json({ exists: false, filePath });
  const raw = fs.readFileSync(filePath, "utf-8");
  res.json({ exists: true, filePath, raw, parsed: JSON.parse(raw || "[]") });
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

  if (fs.existsSync(UPCOMING_EVENTS_FILE)) {
    const events = JSON.parse(fs.readFileSync(UPCOMING_EVENTS_FILE, "utf-8") || "[]");
    const match = events.find(
      (e) => e.title?.toLowerCase() === eventName.toLowerCase()
    );
    if (match?.eventYear) {
      eventYear = match.eventYear.toString();
    }
  }

  const eventId = slugify(eventName);
  const fileName = `${eventId}-${eventYear}.json`;
  const filePath = path.join(BASE_DIR, fileName);

  console.log("REGISTRATION FILE:", filePath);

  const data = readFile(filePath);

  const exists = data.some(
    (r) => r.email?.toLowerCase() === email.toLowerCase()
  );
  if (exists) {
    return res.status(409).json({ message: "Already registered" });
  }

  let capacity = 0;
  let memberFee = 0;
  let nonMemberFee = 0;

  if (fs.existsSync(UPCOMING_EVENTS_FILE)) {
    const events = JSON.parse(fs.readFileSync(UPCOMING_EVENTS_FILE, "utf-8") || "[]");
    const eventMeta = events.find(
      (e) => e.title?.toLowerCase() === eventName.toLowerCase()
    );
    capacity = Number(eventMeta?.capacity || 0);
    memberFee = Number(eventMeta?.memberFee || 0);
    nonMemberFee = Number(eventMeta?.nonMemberFee || 0);
  }

// ✅ Correct
const used = data.reduce(
  (sum, r) => sum + 1 + (Number(r.adults) || 0) + (Number(r.children) || 0),
  0
);

  const requested = (Number(adults) || 0) + (Number(children) || 0);

  if (capacity > 0 && used + requested > capacity) {
    return res.status(400).json({ message: "Not enough spots available" });
  }

  const newRegistration = {
    eventName,
    eventYear,
    name,
    email,
    phone,
    adults,
    children,
    comments,
    registrationNumber: getNextRegistrationNumber(data),
    createdAt: new Date().toISOString(),
  };
  data.push(newRegistration);

  // ── Check if the registrant is already a Kutumb member ──────────────────
  // (used for the on-screen confirmation popup / admin records, and to
  // work out which fee applies - event registration is open to anyone,
  // member or not, and the confirmation EMAIL never includes the
  // membership card, only a text mention of the number if applicable)
  const members = readFile(MEMBERS_FILE);
  const matchedMember = members.find(
    (m) => m.email?.trim().toLowerCase() === email.trim().toLowerCase()
  );

  if (matchedMember?.membershipNumber) {
    // Record the membership match against this event registration too,
    // so admin exports/CSVs show it without cross-referencing members.json
    newRegistration.isMember = true;
    newRegistration.membershipNumber = matchedMember.membershipNumber;
  }

  const applicableFee = matchedMember?.membershipNumber ? memberFee : nonMemberFee;
  newRegistration.fee = applicableFee;

  writeFile(filePath, data);

  // ── Attach the event's flyer image to the confirmation email, if any ────
  let flyerBuffer = null;
  let flyerFilename = null;
  if (fs.existsSync(UPCOMING_EVENTS_FILE)) {
    const events = JSON.parse(fs.readFileSync(UPCOMING_EVENTS_FILE, "utf-8") || "[]");
    const eventMeta = events.find((e) => e.title?.toLowerCase() === eventName.toLowerCase());
    if (eventMeta?.flyerImage) {
      const flyerPath = path.join(FLYER_DIR, eventMeta.flyerImage);
      if (fs.existsSync(flyerPath)) {
        flyerBuffer = fs.readFileSync(flyerPath);
        flyerFilename = eventMeta.flyerImage;
      }
    }
  }

  // ── Send a simple success confirmation email (text mention of membership
  // number if applicable - no card, no QR, no PDF) ────────────────────────
  sendEventConfirmationEmail({
    to: email,
    name,
    eventName,
    eventDate,
    membershipNumber: matchedMember?.membershipNumber || null,
    flyerBuffer,
    flyerFilename,
  }).catch((err) => console.error("Event email error:", err));

  res.status(201).json({
    message: "Registration successful",
    registrationNumber: newRegistration.registrationNumber,
    isMember: !!matchedMember,
    membershipNumber: matchedMember?.membershipNumber || null,
    qrCode: matchedMember?.qrCode || null,
    fee: applicableFee,
    adults: Number(adults) || 0,
    children: Number(children) || 0,
    name,
    email,
    phone,
    eventName,
    eventDate,
  });
});

/* -----------------------------
   ✅ REGISTER MEMBER
------------------------------ */
app.post("/api/members", async (req, res) => {
  try {
    const { name, email, phone, address, interests } = req.body;

    // Name, email and phone are compulsory
    if (!name?.trim() || !email?.trim() || !phone?.trim()) {
      return res.status(400).json({ message: "Name, email and phone are required" });
    }

    const data = readFile(MEMBERS_FILE);

    // Unique on the (name + email) combination - no duplicate membership allowed
    const normalizedName = name.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();
    const duplicate = data.some(
      (m) =>
        m.name?.trim().toLowerCase() === normalizedName &&
        m.email?.trim().toLowerCase() === normalizedEmail
    );
    if (duplicate) {
      return res.status(409).json({ message: "This name and email combination is already a registered member" });
    }

    const membershipNumber = getNextMembershipNumber(data);
    const qrDataUrl = await generateQrDataUrl(membershipNumber);
    const qrPngBuffer = await generateQrPngBuffer(membershipNumber);

    const newMember = {
      name,
      email,
      phone,
      address,
      interests,
      membershipNumber,
      qrCode: qrDataUrl,
      createdAt: new Date().toISOString(),
    };

    data.push(newMember);
    writeFile(MEMBERS_FILE, data);

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
    console.error("POST /members error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* -----------------------------
   🪪 MEMBERSHIP CARD PDF (download / WhatsApp source)
------------------------------ */
app.get("/api/members/:membershipNumber/card.pdf", async (req, res) => {
  try {
    const { membershipNumber } = req.params;
    const data = readFile(MEMBERS_FILE);
    const member = data.find((m) => m.membershipNumber === membershipNumber);
    if (!member) return res.status(404).json({ message: "Member not found" });

    const qrPngBuffer = await generateQrPngBuffer(member.membershipNumber);
    const pdfBuffer = await buildCardPdf({
      title: "Kutumb Membership Card",
      membershipNumber: member.membershipNumber,
      name: member.name,
      email: member.email,
      phone: member.phone,
      qrPngBuffer,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="kutumb-membership-${member.membershipNumber}.pdf"`
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
app.post("/api/members/send-whatsapp", async (req, res) => {
  try {
    const { membershipNumber, whatsappNumber } = req.body;
    if (!membershipNumber || !whatsappNumber) {
      return res.status(400).json({ message: "Membership number and WhatsApp number are required" });
    }

    const data = readFile(MEMBERS_FILE);
    const member = data.find((m) => m.membershipNumber === membershipNumber);
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
   📊 GET ALL EVENT FILES (ADMIN)
------------------------------ */
app.get("/api/event-files", (req, res) => {
  try {
    const eventsDir = path.join(DATA_ROOT, "events");
    if (!fs.existsSync(eventsDir)) return res.json([]);

    const files = fs.readdirSync(eventsDir);
    const list = files
      .filter((file) => file.endsWith(".json"))
      .map((file) => {
        const name = file.replace(".json", "");
        const parts = name.replace(/_/g, "-").split("-");
        const yr = parts.pop();
        const eventName = parts.join(" ").replace(/\b\w/g, (c) => c.toUpperCase());
        return { label: `${eventName} ${yr}`, value: name };
      });

    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

/* -----------------------------
   ✅ UPDATE EVENT REGISTRATION
------------------------------ */
app.post("/api/events/update", (req, res) => {
  try {
    const { eventName, eventYear, email, updatedData } = req.body;
    if (!eventName || !eventYear || !email) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const eventId = slugify(eventName);
    const fileName = `${eventId}-${eventYear}.json`;
    const filePath = path.join(BASE_DIR, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Event file not found" });
    }

    const data = readFile(filePath);
    const updated = data.map((entry) => {
      if (entry.email?.toLowerCase() === email.toLowerCase()) {
        return { ...entry, ...updatedData, updatedAt: new Date().toISOString() };
      }
      return entry;
    });

    writeFile(filePath, updated);
    res.json({ message: "Event registration updated successfully" });
  } catch (err) {
    console.error("EVENT UPDATE ERROR:", err);
    res.status(500).json({ message: "Update failed" });
  }
});

/* -----------------------------
   ✅ DELETE EVENT REGISTRATIONS
------------------------------ */
app.post("/api/events/delete", (req, res) => {
  try {
    const { eventName, eventYear, emails } = req.body;
    if (!eventName || !eventYear || !emails?.length) {
      return res.status(400).json({ message: "Missing data" });
    }

    const eventId = slugify(eventName);
    const fileName = `${eventId}-${eventYear}.json`;
    const filePath = path.join(BASE_DIR, fileName);

    console.log("DELETE FILE:", fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Event file not found", fileName });
    }

    const data = readFile(filePath) || [];
    const filtered = data.filter(
      (row) => !emails.some((e) => e.toLowerCase() === row.email?.toLowerCase())
    );

    fs.writeFileSync(filePath, JSON.stringify(filtered, null, 2));
    res.json({ message: "Deleted successfully", fileName });
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});

/* -----------------------------
   📊 GET SINGLE EVENT FILE (by filename)
------------------------------ */
app.get("/api/events/:file", (req, res) => {
  try {
    const fileName = req.params.file;
    const filePath = path.join(DATA_ROOT, "events", `${fileName}.json`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "File not found" });
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw) return res.json([]);

    const data = JSON.parse(raw);
    res.json(Array.isArray(data) ? data : [data]);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

/* -----------------------------
   📊 GET SINGLE EVENT (by name + year)
------------------------------ */
app.get("/api/events/:eventName/:eventYear", (req, res) => {
  const { eventName, eventYear } = req.params;
  const fileName = `${slugify(eventName)}-${eventYear}.json`;
  const filePath = path.join(BASE_DIR, fileName);
  const data = readFile(filePath);
  res.json(data);
});

/* -----------------------------
   🔎 LOOK UP A MEMBER BY NAME + EMAIL
   Used to live-populate the membership number field on the event
   registration and donation forms as the person types.
------------------------------ */
app.get("/api/members/lookup", (req, res) => {
  try {
    const name = (req.query.name || "").toString().trim().toLowerCase();
    const email = (req.query.email || "").toString().trim().toLowerCase();

    if (!email) return res.json({ found: false });

    const members = readFile(MEMBERS_FILE);
    const match = members.find((m) => m.email?.trim().toLowerCase() === email);

    if (!match?.membershipNumber) return res.json({ found: false });

    res.json({
      found: true,
      membershipNumber: match.membershipNumber,
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
app.get("/api/members", (req, res) => {
  try {
    const data = readFile(MEMBERS_FILE);
    res.json(data);
  } catch (err) {
    console.error("GET /members error:", err);
    res.status(500).json([]);
  }
});

/* -----------------------------
   ✅ DELETE MEMBER
------------------------------ */
app.post("/api/members/delete", (req, res) => {
  try {
    const { emails } = req.body;
    if (!emails || !Array.isArray(emails) || !emails.length) {
      return res.status(400).json({ message: "No emails provided" });
    }

    const data = readFile(MEMBERS_FILE);
    const filtered = data.filter(
      (m) => !emails.some((e) => e.toLowerCase() === m.email?.toLowerCase())
    );

    writeFile(MEMBERS_FILE, filtered);
    res.json({ message: "Members deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Delete failed" });
  }
});

/* -----------------------------
   ✅ UPDATE MEMBER
------------------------------ */
app.post("/api/members/update", (req, res) => {
  try {
    const { email, updatedData } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    if (typeof updatedData.interests === "string") {
      updatedData.interests = updatedData.interests
        .split(",")
        .map((i) => i.trim())
        .filter(Boolean);
    }

    const data = readFile(MEMBERS_FILE);
    const updated = data.map((m) => {
      if (m.email?.toLowerCase() === email.toLowerCase()) {
        return { ...m, ...updatedData, updatedAt: new Date().toISOString() };
      }
      return m;
    });

    writeFile(MEMBERS_FILE, updated);
    res.json({ message: "Member updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Update failed" });
  }
});

/* -----------------------------
   ✅ UPCOMING EVENTS
------------------------------ */
app.get("/api/upcoming-events", (req, res) => {
  try {
    archiveExpiredUpcomingEvents();

    const debug = req.query.debug === "true";

    const events = fs.existsSync(UPCOMING_EVENTS_FILE)
      ? JSON.parse(fs.readFileSync(UPCOMING_EVENTS_FILE, "utf-8") || "[]")
      : [];

    const enriched = events.map((event) => {
      const eventId = slugify(event.title);
      const eventYear =
        event.eventYear || (event.date ? String(year(event.date)) : "unknown");

      const fileName = `${eventId}-${eventYear}.json`;
      const registrationFile = path.join(BASE_DIR, fileName);
      const exists = fs.existsSync(registrationFile);
      const registrations = exists ? readFile(registrationFile) : [];

      // ✅ Correct — 1 for registrant + additional adults + children
      const totalRegistered = registrations.reduce((sum, r) => {
        return sum + 1 + (Number(r.adults) || 0) + (Number(r.children) || 0);
      }, 0);


      const capacity = Number(event.capacity || 0);
      const availableSpots = Math.max(capacity - totalRegistered, 0);

      return {
        ...event,
        capacity,
        memberFee: Number(event.memberFee) || 0,
        nonMemberFee: Number(event.nonMemberFee) || 0,
        registrationsCount: totalRegistered,
        availableSpots,
        ...(debug && {
          _debug: {
            fileName,
            filePath: registrationFile,
            fileExists: exists,
            registrationsCount: registrations.length,
          },
        }),
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error("UPCOMING EVENTS ERROR:", err);
    res.status(500).json([]);
  }
});

/* -----------------------------
   ✅ UPCOMING EVENTS UPDATE
------------------------------ */
app.post("/api/upcoming-events/update", (req, res) => {
  const newEvent = req.body;
  let data = [];

  if (fs.existsSync(UPCOMING_EVENTS_FILE)) {
    data = JSON.parse(fs.readFileSync(UPCOMING_EVENTS_FILE, "utf-8") || "[]");
  }

  const index = data.findIndex((e) => e.title === newEvent.title);

  if (index !== -1) {
    data[index] = {
      ...data[index],
      ...newEvent,
      flyerImage: newEvent.flyerImage || data[index].flyerImage,
      updatedAt: new Date().toISOString(),
    };
  } else {
    data.push({
      ...newEvent,
      published: newEvent.published ?? true,
      createdAt: new Date().toISOString(),
    });
  }

  fs.writeFileSync(UPCOMING_EVENTS_FILE, JSON.stringify(data, null, 2));
  res.json({ message: index !== -1 ? "Event updated" : "Event added" });
});

/* -----------------------------
   ✅ DELETE AN UPCOMING EVENT
------------------------------ */
app.post("/api/upcoming-events/delete", (req, res) => {
  const { title } = req.body;
  let data = JSON.parse(fs.readFileSync(UPCOMING_EVENTS_FILE, "utf-8") || "[]");
  const updated = data.filter((event) => event.title !== title);
  fs.writeFileSync(UPCOMING_EVENTS_FILE, JSON.stringify(updated, null, 2));
  res.json({ message: "Event deleted successfully" });
});

/* -----------------------------
   📁 FLYER STORAGE
------------------------------ */
const FLYER_DIR = path.join(DATA_ROOT, "eventflyer");
if (!fs.existsSync(FLYER_DIR)) fs.mkdirSync(FLYER_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, FLYER_DIR),
  filename: (req, file, cb) => {
    console.log("Uploading:", file.originalname);
    const safeName = Date.now() + "-" + file.originalname.replace(/\s+/g, "-");
    cb(null, safeName);
  },
});

const upload = multer({ storage });

/* -----------------------------
   ✅ FLYER UPLOAD + LINK
------------------------------ */
app.post("/api/upload-flyer", upload.single("flyer"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const fileName = req.file.filename;
    const { event } = req.body;
    if (!event) return res.status(400).json({ message: "Event data missing" });

    const parsedEvent = JSON.parse(event);
    let data = [];

    if (fs.existsSync(UPCOMING_EVENTS_FILE)) {
      data = JSON.parse(fs.readFileSync(UPCOMING_EVENTS_FILE, "utf-8") || "[]");
    }

    let updated = false;
    data = data.map((e) => {
      const normalize = (t) => t?.trim();
      const match =
        normalize(e.title) === normalize(parsedEvent.title) &&
        String(e.eventYear) === String(parsedEvent.eventYear);

      if (match) {
        updated = true;
        return { ...e, flyerImage: fileName };
      }
      return e;
    });

    fs.writeFileSync(UPCOMING_EVENTS_FILE, JSON.stringify(data, null, 2));
    return res.json({
      message: updated ? "Flyer linked successfully" : "Upload done but event not matched",
      fileName,
      updated,
    });
  } catch (err) {
    console.error("UPLOAD FLYER ERROR:", err);
    res.status(500).json({ message: "Upload failed" });
  }
});

/* -----------------------------
   ✅ DELETE FLYER
------------------------------ */
app.post("/api/delete-flyer", (req, res) => {
  try {
    const { title, fileName } = req.body;
    if (!title || !fileName) return res.status(400).json({ message: "Missing data" });

    const filePath = path.join(FLYER_DIR, fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    let data = [];
    if (fs.existsSync(UPCOMING_EVENTS_FILE)) {
      data = JSON.parse(fs.readFileSync(UPCOMING_EVENTS_FILE, "utf-8") || "[]");
    }

    data = data.map((event) => {
      if (event.title === title) return { ...event, flyerImage: "" };
      return event;
    });

    fs.writeFileSync(UPCOMING_EVENTS_FILE, JSON.stringify(data, null, 2));
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
app.get("/api/team", (req, res) => {
  try {
    const filePath = path.join(DATA_ROOT, "team", "profile.json");
    if (!fs.existsSync(filePath)) return res.status(404).json([]);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    res.json(data);
  } catch (err) {
    console.error("TEAM API ERROR:", err);
    res.status(500).json([]);
  }
});

/* -----------------------------
   🔌 KUTUMB ACTIVITIES
------------------------------ */

app.use("/activity-images", express.static(path.join(DATA_ROOT, "activities")));

app.get("/api/activities", (req, res) => {
  try {
    const filePath = path.join(DATA_ROOT, "activities", "activities.json");
    if (!fs.existsSync(filePath)) return res.status(404).json([]);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    res.json(data);
  } catch (err) {
    console.error("ACTIVITIES API ERROR:", err);
    res.status(500).json([]);
  }
});

/* -----------------------------
   🔌 KUTUMB ACTIVITIES REGISTRATION
------------------------------ */

app.post("/api/activity-register", (req, res) => {
  try {
    const data = req.body;
    if (!data.activityTitle || !data.email) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const activityDir = path.join(DATA_ROOT, "activities");
    if (!fs.existsSync(activityDir)) fs.mkdirSync(activityDir, { recursive: true });

    const slugifiedTitle = data.activityTitle
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]+/g, "");

    const filePath = path.join(activityDir, `${slugifiedTitle}-registration.json`);
    const existing = fs.existsSync(filePath)
      ? JSON.parse(fs.readFileSync(filePath, "utf-8"))
      : [];

    const duplicate = existing.some(
      (r) => r.email?.toLowerCase() === data.email.toLowerCase()
    );
    if (duplicate) {
      return res.status(409).json({ message: "You are already registered for this activity." });
    }

    existing.push({ ...data, createdAt: new Date().toISOString() });
    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
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

app.post("/api/email/test-send", async (req, res) => {
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
const DONATIONS_DIR = path.join(DATA_ROOT, "donations");
if (!fs.existsSync(DONATIONS_DIR)) fs.mkdirSync(DONATIONS_DIR, { recursive: true });
const DONATIONS_FILE = path.join(DONATIONS_DIR, "donations.json");

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
    const members = readFile(MEMBERS_FILE);
    const matchedMember = members.find(
      (m) => m.email?.trim().toLowerCase() === email.trim().toLowerCase()
    );

    const donations = readFile(DONATIONS_FILE);
    const donation = {
      name,
      email,
      membershipNumber: matchedMember?.membershipNumber || null,
      amount: Number(amount),
      bankTransferred: !!bankTransferred,
      transactionNumber: bankTransferred ? transactionNumber : null,
      createdAt: new Date().toISOString(),
    };
    donations.push(donation);
    writeFile(DONATIONS_FILE, donations);

    sendDonationThankYouEmail({
      to: email,
      name,
      amount: donation.amount,
      membershipNumber: donation.membershipNumber,
      bankTransferred: donation.bankTransferred,
      transactionNumber: donation.transactionNumber,
    }).catch((err) => console.error("Donation email error:", err));

    res.status(201).json({ message: "Thank you for your donation", donation });
  } catch (err) {
    console.error("DONATION ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/donations", (req, res) => {
  try {
    res.json(readFile(DONATIONS_FILE));
  } catch (err) {
    console.error("GET DONATIONS ERROR:", err);
    res.status(500).json([]);
  }
});

/* -----------------------------
   ✅ MANUAL ARCHIVE TRIGGER (admin)
------------------------------ */
app.post("/api/upcoming-events/archive-now", (req, res) => {
  archiveExpiredUpcomingEvents();
  res.json({ message: "Archive check complete" });
});

/* -----------------------------
   📸 PAST EVENTS - ADMIN MANAGEMENT
   (update text fields, upload/delete media for a past event)
------------------------------ */
const PAST_EVENTS_DIR = path.join(DATA_ROOT, "pastevents");
if (!fs.existsSync(PAST_EVENTS_DIR)) fs.mkdirSync(PAST_EVENTS_DIR, { recursive: true });
const PAST_EVENTS_FILE = path.join(PAST_EVENTS_DIR, "pastEventsData.json");

const PAST_MEDIA_DIR = path.join(DATA_ROOT, "pastmedia");
if (!fs.existsSync(PAST_MEDIA_DIR)) fs.mkdirSync(PAST_MEDIA_DIR, { recursive: true });

const pastMediaStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PAST_MEDIA_DIR),
  filename: (req, file, cb) => {
    const safeName = Date.now() + "-" + file.originalname.replace(/\s+/g, "-");
    cb(null, safeName);
  },
});
const uploadPastMedia = multer({ storage: pastMediaStorage });

function readPastEvents() {
  return fs.existsSync(PAST_EVENTS_FILE)
    ? JSON.parse(fs.readFileSync(PAST_EVENTS_FILE, "utf-8") || "[]")
    : [];
}
function writePastEvents(data) {
  fs.writeFileSync(PAST_EVENTS_FILE, JSON.stringify(data, null, 2));
}

// Update a past event's description/highlights (matched by title + date)
app.post("/api/pastevents/update", (req, res) => {
  try {
    const { title, date, description, highlights } = req.body;
    if (!title || !date) return res.status(400).json({ message: "title and date are required" });

    const data = readPastEvents();
    const idx = data.findIndex((e) => e.title === title && e.date === date);
    if (idx === -1) return res.status(404).json({ message: "Past event not found" });

    if (description !== undefined) data[idx].description = description;
    if (highlights !== undefined) data[idx].highlights = highlights;

    writePastEvents(data);
    res.json({ message: "Past event updated", event: data[idx] });
  } catch (err) {
    console.error("PAST EVENT UPDATE ERROR:", err);
    res.status(500).json({ message: "Update failed" });
  }
});

// Upload a new photo/video and attach it to a past event (matched by title + date)
app.post("/api/pastevents/upload-media", uploadPastMedia.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const { title, date } = req.body;
    if (!title || !date) return res.status(400).json({ message: "title and date are required" });

    const data = readPastEvents();
    const idx = data.findIndex((e) => e.title === title && e.date === date);
    if (idx === -1) return res.status(404).json({ message: "Past event not found" });

    const mediaItem = {
      type: req.file.mimetype.startsWith("video") ? "video" : "image",
      src: req.file.filename,
    };
    data[idx].media = [...(data[idx].media || []), mediaItem];

    writePastEvents(data);
    res.json({ message: "Media uploaded", media: mediaItem, event: data[idx] });
  } catch (err) {
    console.error("PAST EVENT MEDIA UPLOAD ERROR:", err);
    res.status(500).json({ message: "Upload failed" });
  }
});

// Remove a specific media item from a past event (matched by title + date + src)
app.post("/api/pastevents/delete-media", (req, res) => {
  try {
    const { title, date, src } = req.body;
    if (!title || !date || !src) {
      return res.status(400).json({ message: "title, date and src are required" });
    }

    const data = readPastEvents();
    const idx = data.findIndex((e) => e.title === title && e.date === date);
    if (idx === -1) return res.status(404).json({ message: "Past event not found" });

    data[idx].media = (data[idx].media || []).filter((m) => m.src !== src);
    writePastEvents(data);

    const filePath = path.join(PAST_MEDIA_DIR, src);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (unlinkErr) {
        console.error("Could not delete media file:", unlinkErr);
      }
    }

    res.json({ message: "Media removed", event: data[idx] });
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

  // Assign membership numbers/QR codes to any pre-existing member records
  // that don't have one yet (e.g. manually seeded members.json entries).
  backfillMembershipNumbers().catch((err) =>
    console.error("Startup membership backfill failed:", err)
  );

  // Move any already-expired events into Past Events on startup,
  // then re-check once an hour as a background safety net (the
  // /api/upcoming-events endpoint also triggers this on every read).
  archiveExpiredUpcomingEvents();
  setInterval(archiveExpiredUpcomingEvents, 60 * 60 * 1000);
});
