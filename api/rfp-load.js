// api/rfp-load.js — Load RFP details by hotel token (for bid.html) or rfp_id (for dashboard)

const SUPABASE_URL = 'https://ehgaopxzfcfrqpupctts.supabase.co';

async function supabaseGet(path) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase GET ${path} → ${res.status}: ${text}`);
  return JSON.parse(text);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token, rfp_id, email } = req.query;

  try {
    // === Hotel view: load by token (bid.html) ===
    if (token) {
      const hotels = await supabaseGet(`/rfp_hotels?token=eq.${encodeURIComponent(token)}&select=*`);
      if (!hotels || hotels.length === 0) return res.status(404).json({ error: 'Invalid token' });
      const rfpHotel = hotels[0];

      const rfps = await supabaseGet(`/rfps?id=eq.${rfpHotel.rfp_id}&select=*`);
      const rfp = rfps[0];
      if (!rfp) return res.status(404).json({ error: 'RFP not found' });

      const bids = await supabaseGet(`/rfp_bids?rfp_hotel_id=eq.${rfpHotel.id}&select=*&order=created_at.desc&limit=1`);
      const bid = bids[0] || null;

      const messages = await supabaseGet(`/rfp_messages?rfp_hotel_id=eq.${rfpHotel.id}&select=*&order=created_at.asc`);

      return res.status(200).json({ rfp, rfp_hotel: rfpHotel, bid, messages });
    }

    // === Organizer view: load all hotels for an RFP (rfp-dashboard.html) ===
    if (rfp_id) {
      const rfps = await supabaseGet(`/rfps?id=eq.${encodeURIComponent(rfp_id)}&select=*`);
      const rfp = rfps[0];
      if (!rfp) return res.status(404).json({ error: 'RFP not found' });

      // Basic auth: organizer email must match
      if (email && rfp.organizer_email.toLowerCase() !== email.toLowerCase()) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const hotels = await supabaseGet(`/rfp_hotels?rfp_id=eq.${rfp_id}&select=*&order=created_at.asc`);

      // For each hotel, load bid + messages
      const enriched = await Promise.all(hotels.map(async (h) => {
        const bids = await supabaseGet(`/rfp_bids?rfp_hotel_id=eq.${h.id}&select=*&order=created_at.desc&limit=1`);
        const messages = await supabaseGet(`/rfp_messages?rfp_hotel_id=eq.${h.id}&select=*&order=created_at.asc`);
        return { ...h, bid: bids[0] || null, messages };
      }));

      return res.status(200).json({ rfp, hotels: enriched });
    }

    return res.status(400).json({ error: 'Must provide token or rfp_id' });
  } catch (e) {
    console.error('rfp-load error:', e);
    return res.status(500).json({ error: e.message });
  }
}
