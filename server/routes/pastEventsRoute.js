// server/data/pastevents/pastEventsRoute.js
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pastEventsFile = path.join(__dirname, "../data/pastevents/pastEventsData.json");
const pastEvents = fs.existsSync(pastEventsFile)
  ? JSON.parse(fs.readFileSync(pastEventsFile, "utf-8"))
  : [];

// GET http://localhost:5000/pastevents
router.get("/", (req, res) => {
  res.json(pastEvents);
});

// Serve past media files
// GET http://localhost:5000/pastmedia/<filename>
router.use("/pastmedia", express.static(path.join(__dirname, "../pastmedia")));

export default router;