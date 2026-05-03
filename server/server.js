import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";
import multer from "multer";
import { fileURLToPath } from "url";
import fileManagerRoutes from "./routes/filemanager.js";
import pastEventsRouter from "./routes/pastEventsRoute.js";

const app = express();

app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const slugify = (text) =>
  text
    ?.toString()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/_/g, "-")
    .replace(/[^\w-]+/g, "");

const DATA_ROOT = process.env.DATA_ROOT || path.join(process.cwd(), "server/data");
const BASE_DIR = path.join(DATA_ROOT, "events");

if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });

app.use("/eventflyer", express.static(path.join(DATA_ROOT, "eventflyer")));
app.use("/pastevents", express.static(path.join(DATA_ROOT, pastEventsRouter)));
app.use("/pastmedia", express.static(path.join(DATA_ROOT, "pastmedia")));

const MEMBERS_DIR = path.join(DATA_ROOT, "members");
if (!fs.existsSync(MEMBERS_DIR)) fs.mkdirSync(MEMBERS_DIR, { recursive: true });

const MEMBERS_FILE = path.join(MEMBERS_DIR, "members.json");
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
   ✅ DEBUG
------------------------------ */

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
app.post("/api/events", (req, res) => {
  const { eventName, eventDate, name, email, phone, adults, children, comments } = req.body;

  if (!eventName || !email) {
    return res.status(400).json({ message: "Missing event or email" });
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

  if (fs.existsSync(UPCOMING_EVENTS_FILE)) {
    const events = JSON.parse(fs.readFileSync(UPCOMING_EVENTS_FILE, "utf-8") || "[]");
    const eventMeta = events.find(
      (e) => e.title?.toLowerCase() === eventName.toLowerCase()
    );
    capacity = Number(eventMeta?.capacity || 0);
  }

  const used = data.reduce(
    (sum, r) => sum + (Number(r.adults) || 0) + (Number(r.children) || 0),
    0
  );

  const requested = (Number(adults) || 0) + (Number(children) || 0);

  if (capacity > 0 && used + requested > capacity) {
    return res.status(400).json({ message: "Not enough spots available" });
  }

  data.push({
    eventName,
    eventYear,
    name,
    email,
    phone,
    adults,
    children,
    comments,
    createdAt: new Date().toISOString(),
  });

  writeFile(filePath, data);
  res.status(201).json({ message: "Registration successful" });
});

/* -----------------------------
   ✅ REGISTER MEMBER
------------------------------ */
app.post("/api/members", (req, res) => {
  try {
    const { name, email, phone, address, interests } = req.body;
    if (!name || !email) return res.status(400).json({ message: "Missing required fields" });

    const data = readFile(MEMBERS_FILE);
    const exists = data.some((m) => m.email?.toLowerCase() === email.toLowerCase());
    if (exists) return res.status(409).json({ message: "Member already exists" });

    data.push({ name, email, phone, address, interests, createdAt: new Date().toISOString() });
    writeFile(MEMBERS_FILE, data);
    res.status(201).json({ message: "Member registered" });
  } catch (err) {
    console.error("POST /members error:", err);
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

      const totalRegistered = registrations.reduce((sum, r) => {
        return sum + (Number(r.adults) || 0) + (Number(r.children) || 0);
      }, 0);

      const capacity = Number(event.capacity || 0);
      const availableSpots = Math.max(capacity - totalRegistered, 0);

      return {
        ...event,
        capacity,
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
   🔌 FILE MANAGER ROUTES
------------------------------ */
app.use("/api", fileManagerRoutes);

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
});
