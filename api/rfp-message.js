// api/rfp-message.js — Send a message between organizer and hotel

const SUPABASE_URL = 'https://ehgaopxzfcfrqpupctts.supabase.co';
const BASE_URL = 'https://teamlodgr.com';

async function supabaseGet(path) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase GET ${path} → ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function supabasePost(path, body) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase POST ${path} → ${res.status}: ${text}`);
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

  const { token, sender, message } = req.body;

  if (!token || !sender || !message) {
    return res.status(400).json({ error: 'token, sender, and message are required' });
  }
  if (!['organizer', 'hotel'].includes(sender)) {
    return res.status(400).json({ error: 'sender must be "organizer" or "hotel"' });
  }

  try {
    // Find hotel record
    const hotels = await supabaseGet(`/rfp_hotels?token=eq.${encodeURIComponent(token)}&select=*`);
    if (!hotels || hotels.length === 0) return res.status(404).json({ error: 'Invalid token' });
    const rfpHotel = hotels[0];

    // Insert message
    await supabasePost('/rfp_messages', { rfp_hotel_id: rfpHotel.id, sender, message });

    // Load RFP for context
    const rfps = await supabaseGet(`/rfps?id=eq.${rfpHotel.rfp_id}&select=*`);
    const rfp = rfps[0];
    if (!rfp) return res.status(200).json({ ok: true });

    const dashLink = `${BASE_URL}/rfp-dashboard.html?rfp=${rfp.id}&email=${encodeURIComponent(rfp.organizer_email)}`;
    const bidLink = `${BASE_URL}/bid.html?token=${rfpHotel.token}`;

    // Email the other party
    if (sender === 'organizer') {
      // Email the hotel
      const html = `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f4f6fa;padding:32px 20px;">
          <div style="background:white;border-radius:16px;padding:32px;">
            <img src="${BASE_URL}/logo.png" alt="TeamLodgr" style="height:40px;margin-bottom:24px;"/>
            <h2 style="color:#0d1b3e;margin-bottom:8px;">Message from the Organizer 💬</h2>
            <p style="color:#6b7280;margin-bottom:16px;">Re: <strong>${rfp.event_name}</strong></p>
            <div style="background:#e8f0fd;border-left:3px solid #1a6fd4;padding:16px;border-radius:8px;margin-bottom:24px;font-size:0.95rem;line-height:1.6;">
              ${message}
            </div>
            <a href="${bidLink}" style="display:block;background:#1a6fd4;color:white;text-align:center;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;">Reply on TeamLodgr →</a>
          </div>
        </div>`;
      await sendEmail({ to: rfpHotel.hotel_email, subject: `Message re: ${rfp.event_name} — ${rfpHotel.hotel_name}`, html });
    } else {
      // Email the organizer
      const html = `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f4f6fa;padding:32px 20px;">
          <div style="background:white;border-radius:16px;padding:32px;">
            <img src="${BASE_URL}/logo.png" alt="TeamLodgr" style="height:40px;margin-bottom:24px;"/>
            <h2 style="color:#0d1b3e;margin-bottom:8px;">Message from ${rfpHotel.hotel_name} 🏨</h2>
            <p style="color:#6b7280;margin-bottom:16px;">Re: <strong>${rfp.event_name}</strong></p>
            <div style="background:#f4f6fa;border-left:3px solid #9ca3af;padding:16px;border-radius:8px;margin-bottom:24px;font-size:0.95rem;line-height:1.6;">
              ${message}
            </div>
            <a href="${dashLink}" style="display:block;background:#1a6fd4;color:white;text-align:center;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;">View Dashboard →</a>
          </div>
        </div>`;
      await sendEmail({ to: rfp.organizer_email, subject: `${rfpHotel.hotel_name} replied to your RFP — ${rfp.event_name}`, html });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('rfp-message error:', e);
    return res.status(500).json({ error: e.message });
  }
}
