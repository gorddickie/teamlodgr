-- TeamLodgr Initial Schema
-- Migration: 001_initial.sql
-- Created: 2026-05-18

-- ============================================================
-- group_bookings
-- Records a group hotel search/booking that has been shared
-- ============================================================
CREATE TABLE IF NOT EXISTS group_bookings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  hotel_name    TEXT NOT NULL,
  hotel_url     TEXT,
  city          TEXT NOT NULL,
  checkin       DATE NOT NULL,
  checkout      DATE NOT NULL,
  rooms_needed  INTEGER NOT NULL CHECK (rooms_needed >= 1),
  share_token   TEXT NOT NULL UNIQUE,
  affiliate_code TEXT,
  organizer_email TEXT,
  organizer_name  TEXT
);

-- Index for share link lookups
CREATE INDEX IF NOT EXISTS idx_group_bookings_share_token ON group_bookings (share_token);

-- ============================================================
-- team_members
-- Each person who has been added to or joined a group booking
-- ============================================================
CREATE TABLE IF NOT EXISTS team_members (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          UUID NOT NULL REFERENCES group_bookings (id) ON DELETE CASCADE,
  email               TEXT,
  name                TEXT,
  notified_at         TIMESTAMPTZ,
  booked_at           TIMESTAMPTZ,
  browser_push_token  TEXT
);

-- Index for looking up members of a booking
CREATE INDEX IF NOT EXISTS idx_team_members_booking_id ON team_members (booking_id);

-- ============================================================
-- booking_alerts
-- Alerts sent to team members about availability changes
-- ============================================================
CREATE TYPE alert_type AS ENUM ('low_inventory', 'price_change', 'sold_out');

CREATE TABLE IF NOT EXISTS booking_alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES group_bookings (id) ON DELETE CASCADE,
  alert_type  alert_type NOT NULL,
  message     TEXT NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying alerts by booking
CREATE INDEX IF NOT EXISTS idx_booking_alerts_booking_id ON booking_alerts (booking_id);

-- ============================================================
-- Row Level Security
-- Enable RLS on all tables (tighten per-table policies as needed)
-- ============================================================
ALTER TABLE group_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_alerts ENABLE ROW LEVEL SECURITY;

-- Allow public read access to group_bookings via share_token
-- (used by the share.html page to display booking info)
CREATE POLICY "Public read via share token"
  ON group_bookings FOR SELECT
  USING (true);

-- Allow service role full access (server-side operations)
-- (service_role bypasses RLS by default in Supabase)

-- Allow public insert for new bookings (organizer creates a booking)
CREATE POLICY "Anyone can create a group booking"
  ON group_bookings FOR INSERT
  WITH CHECK (true);

-- Allow public read on team_members for a booking
CREATE POLICY "Public read team members"
  ON team_members FOR SELECT
  USING (true);

-- Allow public insert for team member signups
CREATE POLICY "Anyone can join a booking"
  ON team_members FOR INSERT
  WITH CHECK (true);

-- Allow public read on booking alerts
CREATE POLICY "Public read booking alerts"
  ON booking_alerts FOR SELECT
  USING (true);
