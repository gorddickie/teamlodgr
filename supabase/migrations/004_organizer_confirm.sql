-- Migration 004: Add organizer confirmation flow fields to bookings table
-- Adds: confirm_token, confirmed_at, organizer_name, organizer_email, tournament_name, hotel_photo

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS confirm_token    TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS confirmed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS organizer_name   TEXT,
  ADD COLUMN IF NOT EXISTS organizer_email  TEXT,
  ADD COLUMN IF NOT EXISTS tournament_name  TEXT,
  ADD COLUMN IF NOT EXISTS hotel_photo      TEXT;

-- Index for fast confirm_token lookup
CREATE INDEX IF NOT EXISTS bookings_confirm_token_idx ON bookings (confirm_token);
