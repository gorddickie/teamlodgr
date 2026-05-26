-- Add providers JSONB column to store per-provider booking URLs with dates
ALTER TABLE group_bookings ADD COLUMN IF NOT EXISTS providers JSONB;
