# Database failover (main Neon + standby database)

Kutumb can run with a **main** database and one or more **standby** databases
(for example a second free Neon account). If the main one is out of quota
(Neon "compute time quota exceeded", "too many connections", suspended
project) or unreachable, the app moves to the standby **by itself** and keeps
serving, then moves back and merges the data when the main one recovers.

With no standby configured nothing changes — it behaves like a plain connection pool.

## One-time setup

**Easiest — from the Admin Console:** Admin → API Keys → **Database** →
*Backup database (automatic failover)*. Paste the second database's connection
string, **Test connection**, then **Add as backup database**. It works straight
away (no restart) and the main database is copied into it in the background.
The same section lists your backups, shows when the app is running on one,
and has **Copy main → backup now** and **Remove** buttons.

**Or by hand:**

1. Create a second Neon project/account. Copy its connection string.
2. Add to `.env` (and your host's environment variables):

   ```
   DATABASE_URL=postgresql://…main…
   DATABASE_STANDBY_URLS=postgresql://…standby…
   ```
   More than one standby: separate with commas or new lines.
3. Fill the standby once (creates its tables and copies everything):

   ```
   node server/db/sync-standby.js --from 0 --to 1
   ```
   Numbers: `0` = `DATABASE_URL`, `1` = first standby, `2` = second …
4. Restart. The log shows `🛟 Database failover on: 2 databases, active #0`.

Note: the Admin Console saves to the `.env` file. If your host (Render, Fly …)
supplies settings as its own environment variables, also set
`DATABASE_STANDBY_URLS` there so the backup survives a redeploy.

`node server/db/migrate.js` (run on every deploy) also keeps the standbys on the same table layout.

## What happens, and when

| Situation | What the app does |
|---|---|
| Normal | Uses database 0. **Once a day** (`DB_STANDBY_SYNC_HOURS`) copies main → standby so the standby is warm (admin logins, settings, members, events, media). |
| Main fails / out of quota | Next new connection goes to the standby, logs `DATABASE FAILOVER`. It tries once to copy main → standby (usually impossible when out of quota). The standby carries on with its last copy. |
| On the standby | Every `DB_FAILBACK_MINUTES` (30) it checks whether the main works again. When it does: standby → main merge, switch back, second quick merge for rows written meanwhile. |
| App restarts while on a standby | It remembers (file `db-active.json` in the data folder) and starts on the standby, so it never jumps back to older data. Or set `DATABASE_ACTIVE_INDEX=1`. |

Failover happens only when a connection is being opened, never mid-query, so a
payment or registration write is never silently repeated.

**Copies are merges.** Rows are inserted/updated by primary key; nothing is
deleted. A row that would break another unique/foreign-key rule is skipped and
counted. Large files (flyers, videos, statement uploads) are only transferred
for rows the target doesn't have yet. ID counters are advanced so new records
never collide.

**Honest limits:** anything written to the main database *after the last
copy* and *before* it failed is not on the standby until the main recovers and
you merge `--from 0 --to 1` (or fail-back brings the standby's newer data
across). If both databases changed the same row, the copy direction decides who wins.

## Settings (all optional)

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_STANDBY_URLS` | – | Standby connection strings |
| `DATABASE_ACTIVE_INDEX` | auto | Start on this database (0 = main) |
| `DB_STANDBY_SYNC_HOURS` | 24 | Warm copy main → standby; `0` = never |
| `DB_FAILBACK_MINUTES` | 30 | Main-recovered check while on a standby; `0` = never |
| `DB_SYNC_SKIP_TABLES` | – | Comma list of tables to leave out of copies |
| `DB_POOL_MAX` | 10 | Connections per database |

## Checking and manual control

- `GET /api/health` – always fast, never touches the database (safe for uptime monitors).
- `GET /api/health?deep=1` – also runs `SELECT 1`; shows which database is active.
- Super Admin only: `GET /api/db-failover/status`, `POST /api/db-failover/sync?source=1&target=0`,
  `POST /api/db-failover/switch?to=0`.
- Command line: `node server/db/sync-standby.js --from 1 --to 0`.

Tip: the standby costs compute hours too, but only for a few minutes a day
while the warm copy runs. Neon's free plan includes a monthly compute
allowance per account, which is exactly why a second account helps.
