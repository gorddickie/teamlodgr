// api/booking.js — create or fetch a group booking (uses service role key)
const SUPABASE_URL = 'https://ehgaopxzfcfrqpupctts.supabase.co';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return res.status(500).json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' });

  const { share_token, hotel_name, hotel_url, city, checkin, checkout, rooms_needed, affiliate_code, providers } = req.body;
  if (!share_token) return res.status(400).json({ error: 'Missing share_token' });

  const headers = {
    'Content-Type': 'application/json',
    apikey: key,
    Authorization: `Bearer ${key}`,
    Prefer: 'return=representation,resolution=merge-duplicates',
  };

  const r = await fetch(`${SUPABASE_URL}/rest/v1/group_bookings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ share_token, hotel_name, hotel_url, city, checkin, checkout, rooms_needed, affiliate_code, providers }),
  });

  const data = await r.json();
  if (!r.ok) return res.status(500).json({ error: data?.message || JSON.stringify(data) });

  const booking = Array.isArray(data) ? data[0] : data;
  return res.status(200).json({ id: booking.id });
};
