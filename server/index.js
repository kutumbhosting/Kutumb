import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

/* -----------------------------
   📂 BASE DIRECTORY
------------------------------*/
const BASE_DIR = path.join(process.cwd(), "server", "data", "events");

// ensure folder exists
if (!fs.existsSync(BASE_DIR)) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
}

const MEMBERS_DIR = path.join(process.cwd(), "server", "data", "members");

if (!fs.existsSync(MEMBERS_DIR)) {
  fs.mkdirSync(MEMBERS_DIR, { recursive: true });
}

const MEMBERS_FILE = path.join(MEMBERS_DIR, "members.json");

if (!fs.existsSync(MEMBERS_FILE)) {
  fs.writeFileSync(MEMBERS_FILE, "[]");
}

/* -----------------------------
   🧼 HELPERS
------------------------------*/
const getEventFilePath = (event) => {
  const parts = event.split("\n").map(s => s.trim());

  const title = (parts[0] || event)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  // 🔥 extract year from entire event string
  const yearMatch = event.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? yearMatch[0] : "unknown";

  const fileName = `${title}-${year}.json`;

  return path.join(BASE_DIR, fileName);
};

// read JSON file safely
const readFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content || "[]");
  } catch (err) {
    console.error("JSON ERROR:", filePath, err);
    return [];
  }
};

// write JSON file
const writeFile = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

const parseEvent = (event) => {
  const parts = event.split("\n").map(s => s.trim());

  const title = parts[0] || "";
  const date = parts[1] || "";

  const yearMatch = date.match(/\d{4}/);
  const year = yearMatch ? yearMatch[0] : "";

  return {
    eventName: title,
    eventYear: year,
  };
};

/* -----------------------------
   ✅ REGISTER EVENT
------------------------------*/
app.post("/api/events", (req, res) => {
  const { eventName, eventDate, name, email, phone, adults, children, comments } = req.body;

  if (!eventName || !email) {
    return res.status(400).json({ message: "Missing event or email" });
  }

  // ✅ Create safe event ID
  const eventId = eventName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  // ✅ Extract year from date
  const yearMatch = eventDate?.match(/\d{4}/);
  const year = yearMatch ? yearMatch[0] : "unknown";

  // ✅ File path
  const fileName = `${eventId}-${year}.json`;
  const filePath = path.join(BASE_DIR, fileName);

  let data = readFile(filePath);
  if (!data) data = [];

  const exists = data.some(
    (r) => r.email?.toLowerCase() === email.toLowerCase()
  );

  if (exists) {
    return res.status(409).json({ message: "Already registered" });
  }

  data.push({
    eventName,
    eventYear: year, // ✅ ADD THIS
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
------------------------------*/

app.post("/api/members", (req, res) => {
  try {
    const { name, email, phone, address, interests } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const data = readFile(MEMBERS_FILE);

    const exists = data.some(
      (m) => m.email?.toLowerCase() === email.toLowerCase()
    );

    if (exists) {
      return res.status(409).json({
        message: "Member already exists",
      });
    }

    data.push({
      name,
      email,
      phone,
      address,
      interests,
      createdAt: new Date().toISOString(),
    });

    writeFile(MEMBERS_FILE, data);

    res.status(201).json({ message: "Member registered" });

  } catch (err) {
    console.error("POST /members error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


/* -----------------------------
   📊 GET ALL EVENTS (ADMIN)
------------------------------*/
app.get("/api/events", (req, res) => {
  try {
    const files = fs.readdirSync(BASE_DIR);

    const allData = [];

    files.forEach((file) => {
      const filePath = path.join(BASE_DIR, file);
      const data = readFile(filePath);

      if (!data) return;

      data.forEach((entry) => {
        // ✅ fallback safety (IMPORTANT)
        let year = entry.eventYear;

        if (!year && entry.eventDate) {
          const match = entry.eventDate.match(/\d{4}/);
          year = match ? match[0] : "unknown";
        }

        allData.push({
          ...entry,
          eventName: entry.eventName,
          eventYear: year,
        });
      });
    });

    res.json(allData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load events" });
  }
});

/* -----------------------------
   📊 GET SINGLE EVENT
------------------------------*/
app.get("/api/events/:eventName", (req, res) => {
  const filePath = getEventFilePath(req.params.eventName);
  const data = readFile(filePath);
  res.json(data);
});

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
   ✅ DELETE MEMBER AND EVENT
------------------------------*/

app.post("/api/members/delete", (req, res) => {
  try {
    const { emails } = req.body;

    if (!emails || !Array.isArray(emails) || !emails.length) {
      return res.status(400).json({ message: "No emails provided" });
    }

    const data = readFile(MEMBERS_FILE);

    const filtered = data.filter((m) => !emails.some(e => e.toLowerCase() === m.email?.toLowerCase()));

    writeFile(MEMBERS_FILE, filtered);

    res.json({ message: "Members deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Delete failed" });
  }
});

app.post("/api/events/delete", (req, res) => {
  try {
    const { eventName, eventYear, emails } = req.body;

    if (!eventName || !eventYear || !emails?.length) {
      return res.status(400).json({ message: "Missing data" });
    }

    // ✅ Build filename SAME as POST logic
    const eventId = eventName
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    const fileName = `${eventId}-${eventYear}.json`;
    const filePath = path.join(BASE_DIR, fileName);

    // ✅ Debug (VERY useful)
    console.log("DELETE FILE:", fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        message: "Event file not found",
        fileName,
      });
    }

    const data = readFile(filePath) || [];

    const filtered = data.filter(
      (row) =>
        !emails.some(
          (e) => e.toLowerCase() === row.email?.toLowerCase()
        )
    );

    fs.writeFileSync(filePath, JSON.stringify(filtered, null, 2));

    res.json({
      message: "Deleted successfully",
      fileName,
    });

  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});

/* -----------------------------
   ✅ UPDATE MEMBER 
------------------------------*/

app.post("/api/members/update", (req, res) => {
  try {
    const { email, updatedData } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email required" });
    }

    // ✅ normalize interests before saving
    if (typeof updatedData.interests === "string") {
      updatedData.interests = updatedData.interests
        .split(",")
        .map(i => i.trim())
        .filter(Boolean);
    }

    const data = readFile(MEMBERS_FILE);

    const updated = data.map((m) => {
      if (m.email?.toLowerCase() === email.toLowerCase()) {
        return {
          ...m,
          ...updatedData,
          updatedAt: new Date().toISOString(),
        };
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
   🚀 START SERVER + FRONTEND
------------------------------*/
import { fileURLToPath } from "url";
// fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------------
// 🚀 IMPORTANT: correct dist path for Docker
// -----------------------------
const DIST_PATH = path.join(process.cwd(), "dist");

// Serve React build
app.use(express.static(DIST_PATH));

// React Router fallback
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(DIST_PATH, "index.html"));
});

// Start server
const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on", PORT);
});
