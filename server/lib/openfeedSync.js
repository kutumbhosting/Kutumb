// server/lib/openfeedSync.js
//
// Pulls new NAB credits from openfeed into the bank ledger and reconciles
// them against every event with unpaid registrations — on demand ("Sync
// from Bank" / "Sync now") and automatically every 4 hours (openfeed
// refreshes banking data about every 4 hours, so more often gains nothing).

import { pool } from "../db/pool.js";
import { getSetting, setSetting } from "./settings.js";
import { fetchCredits } from "./openfeedClient.js";
import { storeCredits, reconcileOpenEvents } from "./bankLedger.js";

const LOCK = "kutumb_openfeed_sync";
let timer = null;

export async function syncOpenfeed({ admin = null, days } = {}) {
  const client = await pool.connect();
  let locked = false;
  try {
    locked = (await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS ok", [LOCK])).rows[0].ok;
    if (!locked) return { skipped: true, message: "A bank sync is already running." };

    const { credits, oldest } = await fetchCredits({ days });
    const newCredits = await storeCredits(credits, "openfeed");
    const result = await reconcileOpenEvents({
      sourceLabel: `NAB via openfeed (${oldest} onwards)`,
      admin: admin || { name: "openfeed auto-sync" },
    });
    const summary = {
      at: new Date().toISOString(),
      creditsRead: credits.length,
      newCredits,
      events: result.events,
      unmatched: result.unmatched.length,
      message: `${credits.length} credit(s) read from NAB since ${oldest} (${newCredits} new). ${result.message}`,
    };
    await setSetting("openfeed_last_sync", JSON.stringify(summary), false);
    return summary;
  } catch (err) {
    await setSetting(
      "openfeed_last_sync",
      JSON.stringify({ at: new Date().toISOString(), error: err.message }),
      false
    ).catch(() => {});
    throw err;
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK]).catch(() => {});
    client.release();
  }
}

export function startOpenfeedAutoSync() {
  if (timer) clearInterval(timer);
  const tick = async () => {
    try {
      if ((await getSetting("openfeed_auto_sync")) === "false") return;
      if (!(await getSetting("openfeed_refresh_token")) || !(await getSetting("openfeed_grant_id"))) return;
      const r = await syncOpenfeed();
      if (!r.skipped) console.log("🏦 openfeed auto-sync:", r.message);
    } catch (err) {
      console.error("openfeed auto-sync failed:", err.message);
    }
  };
  timer = setInterval(tick, 4 * 3_600_000);
  timer.unref?.();
  setTimeout(tick, 2 * 60_000).unref?.();
}
