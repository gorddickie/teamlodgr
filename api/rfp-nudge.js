// api/rfp-nudge.js — Send a follow-up nudge email to a hotel that hasn't responded

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

  const { rfp_hotel_id } = req.body;
  if (!rfp_hotel_id) return res.status(400).json({ error: 'rfp_hotel_id is required' });

  try {
    // Load the rfp_hotel record
    const hotels = await supabaseGet(`/rfp_hotels?id=eq.${encodeURIComponent(rfp_hotel_id)}&select=*`);
    if (!hotels || hotels.length === 0) return res.status(404).json({ error: 'Hotel not found' });
    const rfpHotel = hotels[0];

    // Load the RFP
    const rfps = await supabaseGet(`/rfps?id=eq.${rfpHotel.rfp_id}&select=*`);
    const rfp = rfps[0];
    if (!rfp) return res.status(404).json({ error: 'RFP not found' });

    const bidLink = `${BASE_URL}/bid.html?token=${rfpHotel.token}`;
    const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

    const html = `
      <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f4f6fa;padding:32px 20px;">
        <div style="background:white;border-radius:16px;padding:32px;">
          <img src="${BASE_URL}/logo.png" alt="TeamLodgr" style="height:40px;margin-bottom:24px;"/>
          <h2 style="color:#0d1b3e;margin-bottom:8px;">Following Up on Your Room Block Request 👋</h2>
          <p style="color:#6b7280;margin-bottom:20px;">
            Just following up on our room block request for <strong>${rfp.event_name}</strong>.
            We'd love to hear from you!
          </p>
          <div style="background:#f4f6fa;border-radius:10px;padding:18px;margin-bottom:24px;">
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e7eb;">
              <span style="color:#6b7280;">Event</span>
              <strong style="color:#0d1b3e;">${rfp.event_name}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e7eb;">
              <span style="color:#6b7280;">Check-In</span>
              <strong style="color:#0d1b3e;">${fmtDate(rfp.check_in)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e7eb;">
              <span style="color:#6b7280;">Check-Out</span>
              <strong style="color:#0d1b3e;">${fmtDate(rfp.check_out)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;">
              <span style="color:#6b7280;">Rooms Needed</span>
              <strong style="color:#0d1b3e;">${rfp.rooms_needed}</strong>
            </div>
          </div>
          <a href="${bidLink}" style="display:block;background:#1a6fd4;color:white;text-align:center;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem;">
            Submit Your Bid →
          </a>
          <p style="color:#9ca3af;font-size:0.82rem;text-align:center;margin-top:16px;">
            If you have any questions, reply to this email or send a message via the portal.
          </p>
        </div>
        <p style="text-align:center;color:#9ca3af;font-size:0.78rem;margin-top:16px;">Powered by TeamLodgr — teamlodgr.com</p>
      </div>`;

    await sendEmail({
      to: rfpHotel.hotel_email,
      subject: `Following up: Room block request for ${rfp.event_name}`,
      html,
    });

    // Update nudge tracking
    const currentCount = rfpHotel.nudge_count || 0;
    await supabasePatch(`/rfp_hotels?id=eq.${rfp_hotel_id}`, {
      nudge_count: currentCount + 1,
      last_nudged_at: new Date().toISOString(),
    });

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('rfp-nudge error:', e);
    return res.status(500).json({ error: e.message });
  }
}
