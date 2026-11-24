// Run standalone with: node server/db/importMedia.js
// Also called automatically from migrate.js on first run.
// Imports server/data/eventflyer/ and server/data/pastmedia/ files into the
// kutumb_media_files table. Idempotent — skips files already imported
// (matched by filename).
import "dotenv/config";
import fs from "fs";
import path from "path";
import { pool } from "./pool.js";

const MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

function guessMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

async function importDir(dirPath, label) {
  if (!fs.existsSync(dirPath)) {
    console.log(`   (no ${label} directory found — nothing to import)`);
    return { imported: 0, skipped: 0 };
  }

  const files = fs.readdirSync(dirPath).filter((f) => fs.statSync(path.join(dirPath, f)).isFile());
  let imported = 0;
  let skipped = 0;

  for (const filename of files) {
    const { rows } = await pool.query("SELECT id FROM kutumb_media_files WHERE filename = $1", [filename]);
    if (rows.length > 0) {
      skipped++;
      continue;
    }

    const filePath = path.join(dirPath, filename);
    const buffer = fs.readFileSync(filePath);
    const mimetype = guessMimeType(filename);

    await pool.query(
      "INSERT INTO kutumb_media_files (filename, mimetype, size_bytes, data) VALUES ($1,$2,$3,$4)",
      [filename, mimetype, buffer.length, buffer]
    );
    imported++;
    console.log(`   ✅ ${filename} (${(buffer.length / 1024).toFixed(0)} KB, ${mimetype})`);
  }

  return { imported, skipped };
}

// Callable from migrate.js (doesn't manage the pool's lifecycle itself).
export async function importAllMedia() {
  console.log("📦 Importing event flyers into the database...");
  const flyerDir = path.join(process.cwd(), "server", "data", "eventflyer");
  const flyerResult = await importDir(flyerDir, "eventflyer");

  console.log("📦 Importing past-event media into the database...");
  const pastMediaDir = path.join(process.cwd(), "server", "data", "pastmedia");
  const pastResult = await importDir(pastMediaDir, "pastmedia");

  const totalImported = flyerResult.imported + pastResult.imported;
  const totalSkipped = flyerResult.skipped + pastResult.skipped;
  console.log(`🎉 Media import done. ${totalImported} file(s) imported, ${totalSkipped} already present.`);
  return { totalImported, totalSkipped };
}

// Only run standalone (and close the pool) when executed directly, not when imported.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  importAllMedia()
    .then(() => pool.end())
    .catch((err) => {
      console.error("❌ Media import failed:", err.message);
      process.exit(1);
    });
}
