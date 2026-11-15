// api/rfp-bid.js — Hotel submits a bid

const SUPABASE_URL = 'https://ehgaopxzfcfrqpupctts.supabase.co';
const BASE_URL = 'https://teamlodgr.com';

async function supabaseRequest(path, method, body) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${method} ${path} → ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function supabaseGet(path) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase GET ${path} → ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: 'noreply@teamlodgr.com', to, subject, html }),
  });
  if (!res.ok) console.error('Resend error:', res.status, await res.text());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, nightly_rate, total_estimate, cutoff_date, perks, notes } = req.body;

  if (!token || !nightly_rate) {
    return res.status(400).json({ error: 'token and nightly_rate are required' });
  }

  try {
    // Find hotel record by token
    const hotels = await supabaseGet(`/rfp_hotels?token=eq.${encodeURIComponent(token)}&select=*`);
    if (!hotels || hotels.length === 0) return res.status(404).json({ error: 'Invalid token' });
    const rfpHotel = hotels[0];

    // Insert bid
    await supabaseRequest('/rfp_bids', 'POST', {
      rfp_hotel_id: rfpHotel.id,
      nightly_rate,
      total_estimate: total_estimate || null,
      cutoff_date: cutoff_date || null,
      perks: perks || null,
      notes: notes || null,
    });

    // Update bid_status
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    await fetch(`${SUPABASE_URL}/rest/v1/rfp_hotels?id=eq.${rfpHotel.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ bid_status: 'submitted' }),
    });

    // Load RFP to get organizer email
    const rfps = await supabaseGet(`/rfps?id=eq.${rfpHotel.rfp_id}&select=*`);
    const rfp = rfps[0];

    if (rfp) {
      const dashLink = `${BASE_URL}/rfp-dashboard.html?rfp=${rfp.id}&email=${encodeURIComponent(rfp.organizer_email)}`;
      const html = `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f4f6fa;padding:32px 20px;">
          <div style="background:white;border-radius:16px;padding:32px;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
            <img src="${BASE_URL}/logo.png" alt="TeamLodgr" style="height:40px;margin-bottom:24px;"/>
            <h2 style="color:#0d1b3e;font-size:1.3rem;margin-bottom:8px;">New Bid Received! 🏨</h2>
            <p style="color:#6b7280;margin-bottom:20px;"><strong>${rfpHotel.hotel_name}</strong> has submitted a bid for your RFP: <strong>${rfp.event_name}</strong></p>

            <div style="background:#f4f6fa;border-radius:12px;padding:20px;margin-bottom:24px;">
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;">Hotel</span><strong style="color:#0d1b3e;">${rfpHotel.hotel_name}</strong></div>
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;">Nightly Rate</span><strong style="color:#1a6fd4;font-size:1.1rem;">$${nightly_rate}/night</strong></div>
              ${total_estimate ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;">Total Estimate</span><strong style="color:#0d1b3e;">$${total_estimate}</strong></div>` : ''}
              ${cutoff_date ? `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;">Cutoff Date</span><strong style="color:#0d1b3e;">${cutoff_date}</strong></div>` : ''}
              ${perks ? `<div style="padding:8px 0;"><span style="color:#6b7280;">Perks: </span>${perks}</div>` : ''}
            </div>

            <a href="${dashLink}" style="display:block;background:#1a6fd4;color:white;text-align:center;padding:16px;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem;margin-bottom:16px;">View All Bids →</a>
          </div>
          <p style="text-align:center;color:#9ca3af;font-size:0.78rem;margin-top:16px;">Powered by TeamLodgr — teamlodgr.com</p>
        </div>`;

      await sendEmail({
        to: rfp.organizer_email,
        subject: `New bid from ${rfpHotel.hotel_name} — ${rfp.event_name}`,
        html,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('rfp-bid error:', e);
    return res.status(500).json({ error: e.message });
  }
}
