# Kutumb — Database Migration (JSON → Neon Postgres)

## What changed

Every piece of structured data that used to live in a JSON file on disk now
lives in a Neon Postgres database instead. **There are no more JSON data
files in this package, and flyer/past-event media (images and videos) is
also fully served from Postgres** (`kutumb_media_files`) — the *running
app* never reads `server/data/eventflyer/` or `server/data/pastmedia/`
again once migrated; all serving, uploads, deletes, and archiving go
through the database exclusively (verified — see below). Those two folders
still exist in this package, but purely as **one-time seed source data**
for `migrate.js` to import on a fresh database, the same role
`server/db/seed.sql` plays for the JSON data — not as live storage. Team
and activity photos remain on disk as plain files (out of scope for this
migration).

| Used to be | Now lives in Postgres table |
|---|---|
| `server/data/members/members.json` | `kutumb_members` |
| `server/data/events/*.json` (one file per event) | `kutumb_event_registrations` |
| `server/data/upcomingevents/upcomingEvents.json` | `kutumb_upcoming_events` |
| `server/data/pastevents/pastEventsData.json` | `kutumb_past_events` + `kutumb_past_event_media` |
| `server/data/donations/donations.json` | `kutumb_donations` |
| `server/data/activities/activities.json` | `kutumb_activities` |
| per-activity `<slug>-registration.json` files | `kutumb_activity_registrations` |
| `server/data/team/profile.json` | `kutumb_team_profiles` |
| `server/data/eventflyer/*` (flyer images) | `kutumb_media_files` |
| `server/data/pastmedia/*` (past-event photos & videos) | `kutumb_media_files` |

Plus the modules added earlier (admin login/roles, Stripe ticketing, QR
check-in, encrypted settings, audit log) already lived in Postgres — they're
unaffected and use the same database.

## Media storage (flyers, past-event photos & videos)

These are stored as `bytea` in `kutumb_media_files` and served dynamically
from `GET /api/media/:filename` (with HTTP Range support, so video
scrubbing/seeking still works properly) instead of via `express.static`.
Upload endpoints (`/api/upload-flyer`, `/api/pastevents/upload-media`) now
use in-memory multer storage and insert straight into Postgres — nothing
touches disk anymore for these.

**Worth knowing:** this was a deliberate choice to include videos, made with
the trade-off explicit — Neon's free tier caps storage at 500MB total, and
the current media (29 files, mostly past-event photos plus 7 videos)
already uses about **59MB** of that. Each new event's video uploads will
keep eating into that budget faster than photos do. If storage becomes a
concern later, the videos specifically are the easiest thing to move back
to file storage (or an object store like Cloudflare R2/S3) without
touching anything else — only `kutumb_media_files` and the routes that
read/write it would need to change.

## Every table supports full add/update/delete

This wasn't just a read-only export — every admin action that used to
rewrite a JSON file now does a real `INSERT`/`UPDATE`/`DELETE` against
Postgres, and everything is `requireAdmin`-protected the same way as
before:

- **Members** — register, edit, delete (`/api/members*`)
- **Event registrations** — register, edit, delete, record payment (`/api/events*`, `/api/all-registrations`)
- **Upcoming events** — create/edit (upsert by title), delete, flyer upload/delete (`/api/upcoming-events*`, `/api/upload-flyer`, `/api/delete-flyer`)
- **Past events** — edit description/highlights, upload/delete media (`/api/pastevents*`)
- **Donations** — record, list (`/api/donations`)
- **Activities & registrations** — list, register (`/api/activities`, `/api/activity-register`)
- **Team profiles** — list (`/api/team`) — add a simple admin CRUD screen for this later if you want to edit the executive team from the UI instead of SQL; right now it's seeded from the original data and reads live from Postgres.

## What got safer in the process

- **No more overbooking risk.** Event registration capacity checks used to
  read-then-write a JSON file with no locking — two people registering for
  the last spot at nearly the same moment could both get in. It's now a
  single Postgres transaction with an advisory lock (event checkout for
  paid ticket tiers uses row-level `FOR UPDATE` locks, which is even
  stronger). I wrote an automated test proving the old bug is fixed:
  5 simultaneous registration attempts against a capacity-1 event now
  correctly produce exactly 1 success and 4 rejections.
- **No more silent data loss on a bad deploy/crash.** JSON files being
  half-written mid-crash could corrupt or lose data with no transaction
  safety. Postgres transactions mean a failure rolls back cleanly instead.
- **Membership numbers and registration numbers can no longer collide**
  under concurrent signups — both now use `pg_advisory_xact_lock` to
  serialize number generation.

## Setup

1. `app.cmd` now runs `node server/db/migrate.js` automatically on every
   launch. The **first** time it runs (against a fresh, empty database), it
   both creates every table **and** imports all of the original data —
   generated at build time into `server/db/seed.sql` from what was in the
   JSON files, so nothing was lost in the move. This import step only ever
   runs once; re-running `migrate.js` (which happens every time you launch
   the app) checks first and skips it if data is already present, so it's
   completely safe to run repeatedly.
2. You need `DATABASE_URL` set in `.env` to your Neon connection string —
   see `.env.example`. Nothing else changed about setup beyond that.

## Verified before shipping

I ran this against a real local Postgres instance before packaging (not
just syntax-checked): applied the schema, imported the seed data, confirmed
row counts matched the original JSON exactly (162 members, 14 event
registrations, 3 upcoming events, 8 past events with 26 media items, 1
donation, 4 activities, 9 team profiles), re-ran the migration to confirm
zero duplicates, then exercised the live server end-to-end — registering a
new attendee, rejecting a duplicate registration, admin login setting a
real session cookie, a protected route correctly requiring it, and a full
ticket purchase → QR check-in → duplicate-scan-rejected flow.

For the media migration specifically, I additionally verified: all 29
files imported and confirmed **byte-for-byte identical** to the originals
via checksum, idempotent re-import (skips already-present files), a real
flyer upload through the admin API landing correctly in the database, a
delete correctly removing it (and the URL correctly 404ing afterward), a
Range request against a video correctly returning `206 Partial Content`
with accurate `Content-Range` headers, and the auto-archive job correctly
duplicating a flyer into past-event media as a database row copy (tested
with a temporary expired event, cleaned up afterward).
