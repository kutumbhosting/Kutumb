import fs from "fs";
import path from "path";

const DATA_ROOT = process.env.DATA_ROOT || "/app/server/data";

// -----------------------------
// CONFIG: define all seed sources
// -----------------------------
const SEEDS = [
  {
    name: "upcomingEvents",
    source: "server/data/upcomingevents/upcomingEvents.json",
    target: "upcomingevents/upcomingEvents.json",
  },
  {
    name: "members",
    source: "server/data/members/members.json",
    target: "members/members.json",
  },
];

// -----------------------------
// helper: ensure JSON valid
// -----------------------------
function validateJSON(file, raw) {
  try {
    JSON.parse(raw);
    return true;
  } catch (err) {
    console.error(`❌ Invalid JSON in ${file}`);
    return false;
  }
}

// -----------------------------
// run seeding
// -----------------------------
for (const item of SEEDS) {
  const SOURCE_FILE = path.join(process.cwd(), item.source);
  const TARGET_FILE = path.join(DATA_ROOT, item.target);

  const TARGET_DIR = path.dirname(TARGET_FILE);

  fs.mkdirSync(TARGET_DIR, { recursive: true });

  // -----------------------------
  // skip if already seeded
  // -----------------------------
  if (fs.existsSync(TARGET_FILE)) {
    const existing = fs.readFileSync(TARGET_FILE, "utf-8");

    if (existing && existing.trim() !== "" && existing !== "[]") {
      console.log(`✅ ${item.name} already seeded → skipping`);
      continue;
    }
  }

  // -----------------------------
  // check source file
  // -----------------------------
  if (!fs.existsSync(SOURCE_FILE)) {
    console.error(`❌ Missing source: ${SOURCE_FILE}`);
    continue;
  }

  const raw = fs.readFileSync(SOURCE_FILE, "utf-8");

  if (!validateJSON(SOURCE_FILE, raw)) {
    continue;
  }

  // -----------------------------
  // write to volume
  // -----------------------------
  fs.writeFileSync(TARGET_FILE, raw, "utf-8");

  console.log(`🚀 Seeded: ${item.name}`);
}

console.log("🎉 Volume seeding complete");