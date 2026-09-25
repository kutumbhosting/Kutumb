// server/routes/manuals.routes.js
//
// User manuals (PDF) for the Admin Console → "Manuals" tab.
//
// The PDFs live in <DATA_ROOT>/manuals (server/data/manuals by default), so
// they can be replaced from Admin → Data Management → File Management
// (folder "manuals") without a code change. Any extra PDF dropped into that
// folder is listed too.
//
// server/data is only copied to a redirected DATA_ROOT (a persistent volume)
// the very first time the server starts, so a volume seeded before this
// feature existed wouldn't have the manuals. ensureBundledManuals() copies
// any MISSING bundled manual into DATA_ROOT/manuals at startup — it never
// overwrites a file already there (e.g. one an admin has replaced).

import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DATA_ROOT } from "../lib/dataRoot.js";
import { requireAdmin } from "../lib/auth.js";

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_DIR = path.join(__dirname, "../data/manuals");
const MANUALS_DIR = path.join(DATA_ROOT, "manuals");

/** Known manuals, in display order. id is what the URL uses. */
const KNOWN = [
  {
    id: "admin-console",
    file: "Kutumb-Admin-Console-Manual.pdf",
    title: "Admin Console User Manual",
    description:
      "For administrators and volunteers: logging in and roles, members, bank, events, registrations, coupons, " +
      "QR check-in, payments, automatic reminders and cancellation, settings and troubleshooting.",
    audience: "Admins",
  },
  {
    id: "membership-booking",
    file: "Kutumb-Membership-and-Event-Booking-Guide.pdf",
    title: "Membership & Event Booking Guide",
    description:
      "For members and guests: joining Kutumb for free, registering for events, paying by card, coupon " +
      "(full or part) or bank transfer, tickets, reminders and FAQs. Suitable to share with the community.",
    audience: "Members & guests",
  },
];

export function ensureBundledManuals() {
  try {
    if (!fs.existsSync(BUNDLED_DIR)) return;
    fs.mkdirSync(MANUALS_DIR, { recursive: true });
    if (path.resolve(BUNDLED_DIR) === path.resolve(MANUALS_DIR)) return;
    for (const name of fs.readdirSync(BUNDLED_DIR)) {
      const dest = path.join(MANUALS_DIR, name);
      if (!fs.existsSync(dest)) fs.copyFileSync(path.join(BUNDLED_DIR, name), dest);
    }
  } catch (err) {
    console.error("MANUALS SEED ERROR:", err.message);
  }
}

const isPdf = (name) => /\.pdf$/i.test(name);
const slug = (name) => name.replace(/\.pdf$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Every manual currently available: known ones first, then any extra PDFs. */
function listManuals() {
  const files = fs.existsSync(MANUALS_DIR) ? fs.readdirSync(MANUALS_DIR).filter(isPdf) : [];
  const out = [];
  for (const k of KNOWN) {
    if (files.includes(k.file)) out.push({ ...k });
  }
  for (const f of files) {
    if (KNOWN.some((k) => k.file === f)) continue;
    out.push({ id: slug(f), file: f, title: f.replace(/\.pdf$/i, "").replace(/[-_]+/g, " "), description: "", audience: "" });
  }
  return out.map((m) => {
    const st = fs.statSync(path.join(MANUALS_DIR, m.file));
    return { ...m, sizeBytes: st.size, updatedAt: st.mtime.toISOString(), url: `/api/manuals/${m.id}` };
  });
}

router.get("/", requireAdmin, (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(listManuals());
  } catch (err) {
    console.error("MANUALS LIST ERROR:", err);
    res.status(500).json({ message: "Could not list manuals" });
  }
});

// GET /api/manuals/:id            → opens in the browser (inline)
// GET /api/manuals/:id?download=1 → downloads the PDF
router.get("/:id", requireAdmin, (req, res) => {
  const manual = listManuals().find((m) => m.id === req.params.id);
  if (!manual) return res.status(404).json({ message: "Manual not found" });
  const full = path.resolve(MANUALS_DIR, manual.file);
  if (!full.startsWith(path.resolve(MANUALS_DIR) + path.sep)) return res.status(400).json({ message: "Bad path" });
  const disposition = req.query.download ? "attachment" : "inline";
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `${disposition}; filename="${manual.file.replace(/"/g, "")}"`,
    "Cache-Control": "private, no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  res.sendFile(full);
});

export default router;
