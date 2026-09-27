# What's in this zip

Only the files that changed, in their original folder paths — copy each one
over the matching file in your Kutumb-main project (overwrite), then commit
and deploy as usual. No other files were touched.

## 1. Activity images now fix themselves on every deploy
- `server/db/migrate.js` — now also runs `fix-activity-images.sql` on every
  startup (it already runs `node server/db/migrate.js` in your Dockerfile
  and `app.cmd`). The SQL is guarded by `WHERE image1 IS NULL`, so it's a
  no-op once applied and safe to run forever after.
- `server/db/fix-activity-images.sql` — unchanged, included for completeness
  since migrate.js now reads it directly.

You no longer need to run this by hand — your next deploy fixes it.

## 2. New "How did you hear about this event?" field
Dropdown with: Kutumb WhatsApp communication, Kutumb Yoga Group, Kutumb
Facebook, Kutumb Instagram, Other (with a required detail box when "Other"
is picked).

- `server/db/schema.sql` — adds `heard_about_source` and `heard_about_other`
  columns to `kutumb_event_registrations` (idempotent `ADD COLUMN IF NOT
  EXISTS`, applied automatically next deploy via migrate.js).
- `server/server.js` — `/api/events` (registration submit) validates and
  saves the new fields; `/api/all-registrations` (admin) returns them.
- `server/routes/registrationExtras.routes.js` — Excel export now includes
  "Heard About" and "Heard About (Other)" columns.
- `src/pages/events/UpcomingEvents.tsx` — the dropdown + conditional "Other"
  text box on the public registration form, placed above "Additional
  Comments".
- `src/pages/Events.tsx` — form state, client-side validation (must pick an
  option; must fill in details if "Other"), and form reset after submit.
- `src/pages/admin/EventRegistration.tsx` — new "Heard About" column in the
  admin registrations table, included in the search box.

## Deploying
Nothing extra to run — `node server/db/migrate.js` (already wired into your
Dockerfile `CMD` and `app.cmd`) applies the new columns and the image fix
automatically the next time you deploy or restart.
