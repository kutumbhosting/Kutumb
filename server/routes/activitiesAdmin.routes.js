// server/routes/activitiesAdmin.routes.js
//
// Admin Console → Activities tab: list / add / modify / delete activities and
// upload or remove their photos & videos. Media bytes go into Postgres
// (kutumb_media_files, served by GET /api/media/:filename) exactly like
// flyers and past-event media. The activity's `media` column holds
// [{ type: "image" | "video", src: <filename> }].
//
// The public GET /api/activities (server.js) reads the same table, so
// whatever is saved here shows up on the public Activities page.

import { Router } from "express";
import multer from "multer";
import { pool } from "../db/pool.js";
import { requireAdmin } from "../lib/auth.js";

const router = Router();
router.use(requireAdmin);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const toList = (v) =>
  (Array.isArray(v) ? v : String(v ?? "").split("\n"))
    .map((s) => String(s).trim())
    .filter(Boolean);

const toRow = (a) => ({
  id: a.id,
  title: a.title,
  description: a.description || "",
  schedule: a.schedule || "",
  location: a.location || "",
  participationOptions: a.participation_options || [],
  onlineYoga: a.online_yoga || [],
  inPersonYoga: a.in_person_yoga || [],
  benefits: a.benefits || [],
  sortOrder: a.sort_order,
  // image1/image2 columns (seeded or older images, served from /activity-images
  // or /api/media). `slot` tells the delete endpoint which column to clear.
  legacyImages: [
    a.image1 ? { slot: "image1", src: a.image1 } : null,
    a.image2 ? { slot: "image2", src: a.image2 } : null,
  ].filter(Boolean),
  media: Array.isArray(a.media) ? a.media : [],
});

// List all activities
router.get("/", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM kutumb_activities ORDER BY sort_order, id");
    res.json(rows.map(toRow));
  } catch (err) {
    console.error("ACTIVITIES ADMIN LIST ERROR:", err);
    res.status(500).json({ message: "Could not load activities" });
  }
});

// Add a new activity
router.post("/", async (req, res) => {
  try {
    const { title, description, schedule, location, participationOptions, onlineYoga, inPersonYoga, benefits, sortOrder } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ message: "Title is required" });

    const { rows: max } = await pool.query("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM kutumb_activities");
    const order = Number.isInteger(Number(sortOrder)) && String(sortOrder ?? "").trim() !== "" ? Number(sortOrder) : max[0].next;
    const { rows } = await pool.query(
      `INSERT INTO kutumb_activities (title, description, schedule, location, participation_options, online_yoga, in_person_yoga, benefits, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [String(title).trim(), description || "", schedule || "", location || null,
       toList(participationOptions), toList(onlineYoga), toList(inPersonYoga), toList(benefits), order]
    );
    res.status(201).json(toRow(rows[0]));
  } catch (err) {
    console.error("ACTIVITIES ADMIN CREATE ERROR:", err);
    res.status(500).json({ message: "Could not add activity" });
  }
});

// Modify an existing activity (text fields only; media has its own endpoints)
router.put("/:id", async (req, res) => {
  try {
    const { title, description, schedule, location, participationOptions, onlineYoga, inPersonYoga, benefits, sortOrder } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ message: "Title is required" });
    const hasOrder = String(sortOrder ?? "").trim() !== "" && Number.isInteger(Number(sortOrder));

    const { rows } = await pool.query(
      `UPDATE kutumb_activities SET title=$1, description=$2, schedule=$3, location=$4,
         participation_options=$5, online_yoga=$6, in_person_yoga=$7, benefits=$8,
         sort_order = COALESCE($9, sort_order)
       WHERE id=$10 RETURNING *`,
      [String(title).trim(), description || "", schedule || "", location || null,
       toList(participationOptions), toList(onlineYoga), toList(inPersonYoga), toList(benefits),
       hasOrder ? Number(sortOrder) : null, Number(req.params.id)]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Activity not found" });
    res.json(toRow(rows[0]));
  } catch (err) {
    console.error("ACTIVITIES ADMIN UPDATE ERROR:", err);
    res.status(500).json({ message: "Could not update activity" });
  }
});

// Delete the selected activities (and their uploaded media files)
router.post("/delete", async (req, res) => {
  try {
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger);
    if (ids.length === 0) return res.status(400).json({ message: "No activities selected" });

    const { rows } = await pool.query("DELETE FROM kutumb_activities WHERE id = ANY($1::int[]) RETURNING media", [ids]);
    const files = rows.flatMap((r) => (Array.isArray(r.media) ? r.media : []).map((m) => m.src)).filter(Boolean);
    if (files.length) await pool.query("DELETE FROM kutumb_media_files WHERE filename = ANY($1::text[])", [files]);

    res.json({ message: "Deleted", deleted: rows.length });
  } catch (err) {
    console.error("ACTIVITIES ADMIN DELETE ERROR:", err);
    res.status(500).json({ message: "Could not delete activities" });
  }
});

// Upload one or more photos/videos from the admin's computer
router.post("/:id/media", upload.array("files", 20), async (req, res) => {
  try {
    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ message: "No file uploaded" });
    const bad = files.find((f) => !/^(image|video)\//.test(f.mimetype));
    if (bad) return res.status(400).json({ message: `"${bad.originalname}" is not an image or video` });

    const { rows } = await pool.query("SELECT media FROM kutumb_activities WHERE id=$1", [Number(req.params.id)]);
    if (rows.length === 0) return res.status(404).json({ message: "Activity not found" });

    const media = Array.isArray(rows[0].media) ? [...rows[0].media] : [];
    for (const f of files) {
      const filename = `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${f.originalname.replace(/[^\w.\-]+/g, "-")}`;
      await pool.query(
        "INSERT INTO kutumb_media_files (filename, mimetype, size_bytes, data) VALUES ($1,$2,$3,$4)",
        [filename, f.mimetype, f.size, f.buffer]
      );
      media.push({ type: f.mimetype.startsWith("video") ? "video" : "image", src: filename });
    }
    const { rows: out } = await pool.query("UPDATE kutumb_activities SET media=$1 WHERE id=$2 RETURNING *", [JSON.stringify(media), Number(req.params.id)]);
    res.json(toRow(out[0]));
  } catch (err) {
    console.error("ACTIVITIES ADMIN MEDIA UPLOAD ERROR:", err);
    res.status(500).json({ message: "Upload failed" });
  }
});

// Remove one uploaded photo/video
router.post("/:id/media/delete", async (req, res) => {
  try {
    const { src } = req.body;
    if (!src) return res.status(400).json({ message: "src is required" });
    const { rows } = await pool.query("SELECT media FROM kutumb_activities WHERE id=$1", [Number(req.params.id)]);
    if (rows.length === 0) return res.status(404).json({ message: "Activity not found" });

    const media = (Array.isArray(rows[0].media) ? rows[0].media : []).filter((m) => m.src !== src);
    const { rows: out } = await pool.query("UPDATE kutumb_activities SET media=$1 WHERE id=$2 RETURNING *", [JSON.stringify(media), Number(req.params.id)]);
    await pool.query("DELETE FROM kutumb_media_files WHERE filename=$1", [src]);
    res.json(toRow(out[0]));
  } catch (err) {
    console.error("ACTIVITIES ADMIN MEDIA DELETE ERROR:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});

// Remove one of the original image1 / image2 images
router.post("/:id/legacy-image/delete", async (req, res) => {
  try {
    const { slot } = req.body;
    if (slot !== "image1" && slot !== "image2") return res.status(400).json({ message: "Invalid image slot" });
    const { rows } = await pool.query(`UPDATE kutumb_activities SET ${slot} = NULL WHERE id=$1 RETURNING *`, [Number(req.params.id)]);
    if (rows.length === 0) return res.status(404).json({ message: "Activity not found" });
    res.json(toRow(rows[0]));
  } catch (err) {
    console.error("ACTIVITIES ADMIN LEGACY IMAGE DELETE ERROR:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});

export default router;
