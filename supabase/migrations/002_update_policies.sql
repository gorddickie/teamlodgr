-- Allow public update on group_bookings share_token (needed for token corrections)
-- In production, tighten this to service_role only
CREATE POLICY "Anyone can update group booking"
  ON group_bookings FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow public update on team_members booked_at
CREATE POLICY "Anyone can update team member"
  ON team_members FOR UPDATE
  USING (true)
  WITH CHECK (true);
