// Merge one database into another by hand (nothing is deleted in the target).
//
//   node server/db/sync-standby.js --from 0 --to 1   # main -> first standby (also (re)creates its tables)
//   node server/db/sync-standby.js --from 1 --to 0   # standby -> main
//
// Numbers: 0 = DATABASE_URL, 1 = first DATABASE_STANDBY_URLS address, 2 = second, …
// Same .env as the app. Run it once after adding a standby so it starts out as a full copy.
import "dotenv/config";
import { failover, pool } from "./pool.js";
import { merge } from "./dbsync.js";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : NaN;
};
const from = arg("from");
const to = arg("to");
const n = failover.urls.length;
const ok = (v) => Number.isInteger(v) && v >= 0 && v < n;
if (!ok(from) || !ok(to) || from === to) {
  console.error(`Pick two different database numbers between 0 and ${n - 1} (${n} configured).`);
  process.exit(2);
}
console.log(`Merging database ${from} -> ${to} ...`);
const r = await merge(from, to);
console.log(r);
await pool.end();
process.exit(r.ok ? 0 : 1);
