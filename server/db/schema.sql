-- Kutumb event-management add-on modules (PostgreSQL / Neon)
-- Safe to run multiple times. Every table is prefixed "kutumb_" so this can
-- safely share a Neon database/project with any other app without ever
-- colliding on a table name (e.g. a generic "users" or "orders" table).
--
-- This is intentionally separate from the existing JSON-file event system —
-- existing events/registrations keep working exactly as before. These
-- tables only come into play for an event that has ticketing explicitly
-- turned on (real payments, ticket tiers, waitlist, QR check-in), plus the
-- admin login/roles and settings/audit-log system.

CREATE TABLE IF NOT EXISTS kutumb_admin_users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin', -- 'superadmin' | 'admin'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kutumb_audit_log (
  id SERIAL PRIMARY KEY,
  admin_user_id INTEGER REFERENCES kutumb_admin_users(id) ON DELETE SET NULL,
  admin_email TEXT,
  action TEXT NOT NULL,        -- e.g. 'event.update', 'member.delete'
  entity TEXT,                 -- e.g. 'diwali-2026'
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kutumb_audit_created ON kutumb_audit_log(created_at);

-- Replaces server/data/eventflyer/ and server/data/pastmedia/ as files on
-- disk. Actual image/video bytes live here now; kutumb_upcoming_events.
-- flyer_image and kutumb_past_event_media.src still store just the
-- filename, which is now a lookup key into this table (served via
-- GET /api/media/:filename) instead of a static-file path.
CREATE TABLE IF NOT EXISTS kutumb_media_files (
  id SERIAL PRIMARY KEY,
  filename TEXT UNIQUE NOT NULL,
  mimetype TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Key/value platform configuration (Stripe keys, etc). Secret values are
-- AES-256-GCM encrypted at rest using ENCRYPTION_KEY from .env.
CREATE TABLE IF NOT EXISTS kutumb_platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  is_secret BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ticket tiers for a given event. `event_id` is just the event's existing
-- slug/file id from the JSON event system (e.g. "diwali-and-multi-cultural-
-- event-2026") — there's no foreign key to a Postgres events table because
-- events themselves still live in the JSON files, unchanged.
CREATE TABLE IF NOT EXISTS kutumb_ticket_types (
  id SERIAL PRIMARY KEY,
  event_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'AUD',
  quantity_total INTEGER NOT NULL DEFAULT 0, -- 0 = unlimited
  quantity_sold INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kutumb_ticket_types_event ON kutumb_ticket_types(event_id);

CREATE TABLE IF NOT EXISTS kutumb_orders (
  id SERIAL PRIMARY KEY,
  event_id TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  buyer_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | refunded | cancelled
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'AUD',
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kutumb_orders_event ON kutumb_orders(event_id);
CREATE INDEX IF NOT EXISTS idx_kutumb_orders_status ON kutumb_orders(status);

CREATE TABLE IF NOT EXISTS kutumb_order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES kutumb_orders(id) ON DELETE CASCADE,
  ticket_type_id INTEGER NOT NULL REFERENCES kutumb_ticket_types(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0
);

-- One row per ticket (not per order — an order for 3 tickets makes 3 rows),
-- each with its own scannable QR token for check-in.
CREATE TABLE IF NOT EXISTS kutumb_attendees (
  id SERIAL PRIMARY KEY,
  order_item_id INTEGER NOT NULL REFERENCES kutumb_order_items(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  name TEXT,
  email TEXT,
  qr_token TEXT UNIQUE NOT NULL,
  checked_in_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_kutumb_attendees_event ON kutumb_attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_kutumb_attendees_qr ON kutumb_attendees(qr_token);

-- People who tried to register/buy after an event/ticket-type sold out.
CREATE TABLE IF NOT EXISTS kutumb_waitlist (
  id SERIAL PRIMARY KEY,
  event_id TEXT NOT NULL,
  ticket_type_id INTEGER REFERENCES kutumb_ticket_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  requested_qty INTEGER NOT NULL DEFAULT 1,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kutumb_waitlist_event ON kutumb_waitlist(event_id);

-- ============================================================
-- Full data-layer migration: every JSON file's data now lives here.
-- Binary media (flyer images, past-event photos/videos, team photos) still
-- lives on disk under server/data/<folder> — only structured JSON *data*
-- moved into Postgres. Every table below fully replaces one JSON file.
-- ============================================================

CREATE TABLE IF NOT EXISTS kutumb_members (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  interests TEXT[] DEFAULT '{}',
  membership_number TEXT UNIQUE,
  qr_code TEXT, -- base64 data URL, generated at signup
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kutumb_members_email ON kutumb_members(lower(email));

-- Replaces the per-event JSON registration files (server/data/events/*.json).
-- One row per attendee registration; event identity is just the plain
-- event_name + event_year text pair, exactly like the old filenames were.
CREATE TABLE IF NOT EXISTS kutumb_event_registrations (
  id SERIAL PRIMARY KEY,
  event_name TEXT NOT NULL,
  event_year TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  adults INTEGER NOT NULL DEFAULT 0,
  children INTEGER NOT NULL DEFAULT 0,
  comments TEXT,
  registration_number TEXT,
  is_member BOOLEAN NOT NULL DEFAULT FALSE,
  membership_number TEXT,
  fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  per_person_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  bank_transferred BOOLEAN NOT NULL DEFAULT FALSE,
  transaction_number TEXT,
  payment_status TEXT NOT NULL DEFAULT 'N/A',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kutumb_evreg_event ON kutumb_event_registrations(event_name, event_year);
CREATE UNIQUE INDEX IF NOT EXISTS uq_kutumb_evreg_email_per_event ON kutumb_event_registrations(event_name, event_year, lower(email));

-- Replaces server/data/upcomingevents/upcomingEvents.json
CREATE TABLE IF NOT EXISTS kutumb_upcoming_events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  date_text TEXT,
  time_text TEXT,
  location TEXT,
  capacity INTEGER NOT NULL DEFAULT 0,
  member_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  non_member_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  flyer_image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Replaces server/data/pastevents/pastEventsData.json
CREATE TABLE IF NOT EXISTS kutumb_past_events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  date_text TEXT,
  description TEXT,
  highlights TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS kutumb_past_event_media (
  id SERIAL PRIMARY KEY,
  past_event_id INTEGER NOT NULL REFERENCES kutumb_past_events(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'image' | 'video'
  src TEXT NOT NULL,  -- filename — looked up in kutumb_media_files
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_kutumb_pastmedia_event ON kutumb_past_event_media(past_event_id);

-- Replaces server/data/donations/donations.json
CREATE TABLE IF NOT EXISTS kutumb_donations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  membership_number TEXT,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  bank_transferred BOOLEAN NOT NULL DEFAULT FALSE,
  transaction_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Replaces server/data/activities/activities.json (the activity catalogue
-- itself — images referenced here still live on disk under
-- server/data/activities/*.jpeg).
CREATE TABLE IF NOT EXISTS kutumb_activities (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  image1 TEXT,
  image2 TEXT,
  description TEXT,
  schedule TEXT,
  participation_options TEXT[] DEFAULT '{}',
  online_yoga TEXT[] DEFAULT '{}',
  in_person_yoga TEXT[] DEFAULT '{}',
  benefits TEXT[] DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Replaces the ad-hoc per-activity "<slug>-registration.json" files that
-- POST /api/activity-register used to create on disk.
CREATE TABLE IF NOT EXISTS kutumb_activity_registrations (
  id SERIAL PRIMARY KEY,
  activity_title TEXT NOT NULL,
  name TEXT,
  email TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}', -- everything else the form submitted
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_kutumb_actreg_email_per_activity ON kutumb_activity_registrations(activity_title, lower(email));

-- Replaces server/data/team/profile.json
CREATE TABLE IF NOT EXISTS kutumb_team_profiles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  email TEXT,
  bio TEXT,
  image TEXT, -- filename under server/data/team
  sort_order INTEGER NOT NULL DEFAULT 0
);
