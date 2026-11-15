// api/rfp-status-update.js — Update the bid_status of an rfp_hotel row

const SUPABASE_URL = 'https://ehgaopxzfcfrqpupctts.supabase.co';

async function supabasePatch(path, body) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Supabase PATCH ${path} → ${res.status}: ${t}`);
  }
}

const ALLOWED_STATUSES = ['pending', 'declined', 'removed'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { rfp_hotel_id, status } = req.body;

  if (!rfp_hotel_id || !status) {
    return res.status(400).json({ error: 'rfp_hotel_id and status are required' });
  }
  if (!ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}` });
  }

  try {
    await supabasePatch(`/rfp_hotels?id=eq.${encodeURIComponent(rfp_hotel_id)}`, { bid_status: status });
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('rfp-status-update error:', e);
    return res.status(500).json({ error: e.message });
  }
}
