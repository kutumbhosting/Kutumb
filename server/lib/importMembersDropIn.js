// Lets an admin drop a members.json file into server/data/members/ (the
// same shape the site originally used, back before the JSON-to-Postgres
// migration) to bulk-add members without using the UI one at a time.
//
// On each check: if server/data/members/members.json exists, every entry
// whose email isn't already a member gets inserted (existing emails are
// silently skipped, not overwritten — this is additive-only, never
// destructive to what's already in the database). The folder is then
// deleted, so it can't be re-imported by accident and so a stale copy
// doesn't linger and confuse anyone later.
import fs from "fs";
import path from "path";
import { pool } from "../db/pool.js";
import { DATA_ROOT } from "./dataRoot.js";
import { getNextMembershipNumber } from "./counters.js";
import { generateQrDataUrl } from "./membershipCard.js";

export async function importMembersDropIn() {
  const membersDir = path.join(DATA_ROOT, "members");
  const filePath = path.join(membersDir, "members.json");

  if (!fs.existsSync(filePath)) {
    return { found: false, imported: 0, skipped: 0 };
  }

  let entries;
  try {
    entries = JSON.parse(fs.readFileSync(filePath, "utf-8") || "[]");
  } catch (err) {
    console.error("IMPORT MEMBERS DROP-IN: invalid JSON in members.json —", err.message);
    return { found: true, imported: 0, skipped: 0, error: "Invalid JSON in members.json" };
  }

  if (!Array.isArray(entries)) {
    return { found: true, imported: 0, skipped: 0, error: "members.json must contain an array" };
  }

  let imported = 0;
  let skipped = 0;

  for (const entry of entries) {
    const email = entry.email?.trim();
    const name = entry.name?.trim();
    if (!email || !name) {
      skipped++;
      continue;
    }

    const { rows: existing } = await pool.query("SELECT id FROM kutumb_members WHERE lower(email) = lower($1)", [email]);
    if (existing.length > 0) {
      skipped++;
      continue;
    }

    // Reuse the provided membership number only if it's not already taken;
    // otherwise assign the next available one, same as a normal signup.
    let membershipNumber = entry.membershipNumber;
    if (membershipNumber) {
      const { rows: taken } = await pool.query("SELECT id FROM kutumb_members WHERE membership_number = $1", [membershipNumber]);
      if (taken.length > 0) membershipNumber = null;
    }
    if (!membershipNumber) {
      const { rows: allMembers } = await pool.query("SELECT membership_number FROM kutumb_members");
      membershipNumber = getNextMembershipNumber(allMembers.map((r) => ({ membershipNumber: r.membership_number })));
    }

    const qrCode = entry.qrCode || (await generateQrDataUrl(membershipNumber));

    await pool.query(
      `INSERT INTO kutumb_members (name, email, phone, address, interests, membership_number, qr_code, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8, now()))`,
      [name, email, entry.phone || null, entry.address || null, entry.interests || [], membershipNumber, qrCode, entry.createdAt || null]
    );
    imported++;
  }

  // Clean up regardless of outcome (short of a parse error, handled above)
  // so a folder that's already been processed can't be picked up twice.
  try {
    fs.rmSync(membersDir, { recursive: true, force: true });
  } catch (err) {
    console.error("IMPORT MEMBERS DROP-IN: couldn't remove members folder —", err.message);
  }

  return { found: true, imported, skipped };
}
