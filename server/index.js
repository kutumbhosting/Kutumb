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
const BASE_DIR = path.join(process.cwd(), "server/data/events");

// ensure folder exists
if (!fs.existsSync(BASE_DIR)) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
}

const MEMBERS_DIR = path.join(process.cwd(), "server/data/members");

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

// create safe filename from event name
const getFileName = (eventName) => {
  return (
    eventName
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "") + ".json"
  );
};

// read JSON file safely
const readFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "[]");
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content || "[]");
  } catch (err) {
    console.error("JSON ERROR:", filePath, err);
    fs.writeFileSync(filePath, "[]");
    return [];
  }
};

// write JSON file
const writeFile = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

/* -----------------------------
   ✅ REGISTER EVENT
------------------------------*/
app.post("/api/events", (req, res) => {
  const { event, name, email, phone, adults, children, comments } = req.body;

  if (!event || !email) {
    return res.status(400).json({ message: "Missing event or email" });
  }

  const fileName = getFileName(event);
  const filePath = path.join(BASE_DIR, fileName);

  const data = readFile(filePath);

  // prevent duplicate registration
  const exists = data.some(
    (r) => r.email?.toLowerCase() === email.toLowerCase()
  );

  if (exists) {
    return res.status(409).json({
      message: "Already registered for this event",
    });
  }

  data.push({
    name,
    email,
    phone,
    adults,
    children,
    comments,
    eventName: event,
    createdAt: new Date().toISOString(),
  });

  writeFile(filePath, data);

  res.status(201).json({ message: "Registration successful" });
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

      //const eventName = file.replace(".json", "").replace(/-/g, " ");
      const cleanName = file.replace(".json", "");
      const parts = cleanName.split("_");

      const year = parts.pop();        // 2026
      const name = parts.join(" ");    // Guru Purnima Celebration

      data.forEach((entry) => {
        allData.push({
          ...entry,
          eventName: name,
          eventYear: Number(year),
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
  const fileName = getFileName(req.params.eventName);
  const filePath = path.join(BASE_DIR, fileName);

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
   🚀 START SERVER
------------------------------*/

const PORT = process.env.PORT;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on", PORT);
});
