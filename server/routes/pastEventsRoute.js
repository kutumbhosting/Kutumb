import express from "express";
import path from "path";
import fs from "fs";
import { sortPastEventsDescending } from "../lib/eventDates.js";

const router = express.Router();

function getPastEventsFile() {
  const dataRoot = process.env.DATA_ROOT || path.join(process.cwd(), "server/data");
  return path.join(dataRoot, "pastevents", "pastEventsData.json");
}

// GET /api/pastevents - always reads fresh from disk and returns
// events sorted with the most recent event date first.
router.get("/", (req, res) => {
  try {
    const file = getPastEventsFile();
    const events = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf-8") || "[]")
      : [];
    res.json(sortPastEventsDescending(Array.isArray(events) ? events : []));
  } catch (err) {
    console.error("PAST EVENTS ERROR:", err);
    res.status(500).json([]);
  }
});

export default router;
