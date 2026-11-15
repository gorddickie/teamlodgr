// api/rfp-create.js — Create an RFP and email each hotel with their bid link

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

async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.warn('RESEND_API_KEY not set'); return; }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: 'noreply@teamlodgr.com', to, subject, html }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error('Resend error:', res.status, t);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { rfp: rfpData, hotels } = req.body;

    if (!rfpData?.organizer_email || !rfpData?.event_name || !rfpData?.check_in || !rfpData?.check_out || !rfpData?.rooms_needed) {
      return res.status(400).json({ error: 'Missing required RFP fields' });
    }
    if (!hotels || hotels.length === 0) {
      return res.status(400).json({ error: 'At least one hotel is required' });
    }

    // Insert RFP
    const [rfp] = await supabaseRequest('/rfps', 'POST', {
      organizer_email: rfpData.organizer_email,
      organizer_name: rfpData.organizer_name || null,
      event_name: rfpData.event_name,
      check_in: rfpData.check_in,
      check_out: rfpData.check_out,
      rooms_needed: rfpData.rooms_needed,
      notes: rfpData.notes || null,
      status: 'open',
    });

    // Insert hotels and get tokens
    const hotelInserts = hotels.map(h => ({
      rfp_id: rfp.id,
      hotel_name: h.name,
      hotel_email: h.email,
    }));

    const rfpHotels = await supabaseRequest('/rfp_hotels', 'POST', hotelInserts);

    // Email each hotel
    const nights = Math.round((new Date(rfpData.check_out) - new Date(rfpData.check_in)) / 86400000);
    const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' });

    await Promise.all(rfpHotels.map(async (rh) => {
      const bidLink = `${BASE_URL}/bid.html?token=${rh.token}`;
      const html = `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f4f6fa;padding:32px 20px;">
          <div style="background:white;border-radius:16px;padding:32px;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
            <img src="${BASE_URL}/logo.png" alt="TeamLodgr" style="height:40px;margin-bottom:24px;"/>
            <h2 style="color:#0d1b3e;font-size:1.4rem;margin-bottom:8px;">Room Block RFP — ${rfpData.event_name}</h2>
            <p style="color:#6b7280;margin-bottom:24px;">You've received a Request for Proposal from <strong>${rfpData.organizer_name || rfpData.organizer_email}</strong> for a group room block.</p>

            <div style="background:#f4f6fa;border-radius:12px;padding:20px;margin-bottom:24px;">
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;">Event</span><strong style="color:#0d1b3e;">${rfpData.event_name}</strong></div>
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;">Check-In</span><strong style="color:#0d1b3e;">${fmtDate(rfpData.check_in)}</strong></div>
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;">Check-Out</span><strong style="color:#0d1b3e;">${fmtDate(rfpData.check_out)}</strong></div>
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;">Nights</span><strong style="color:#0d1b3e;">${nights}</strong></div>
              <div style="display:flex;justify-content:space-between;padding:8px 0;${rfpData.notes ? 'border-bottom:1px solid #e5e7eb;' : ''}"><span style="color:#6b7280;">Rooms Needed</span><strong style="color:#0d1b3e;">${rfpData.rooms_needed} rooms</strong></div>
              ${rfpData.notes ? `<div style="padding:8px 0;color:#6b7280;font-size:0.9rem;"><strong>Notes:</strong> ${rfpData.notes}</div>` : ''}
            </div>

            <a href="${bidLink}" style="display:block;background:#1a6fd4;color:white;text-align:center;padding:16px;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem;margin-bottom:16px;">Submit Your Bid →</a>
            <p style="color:#9ca3af;font-size:0.82rem;text-align:center;">This link is unique to ${rh.hotel_name}. Do not share it. <br/><a href="${bidLink}" style="color:#1a6fd4;">${bidLink}</a></p>
          </div>
          <p style="text-align:center;color:#9ca3af;font-size:0.78rem;margin-top:16px;">Powered by TeamLodgr — teamlodgr.com</p>
        </div>`;

      await sendEmail({
        to: rh.hotel_email,
        subject: `Room Block RFP: ${rfpData.event_name} — ${rfpData.rooms_needed} rooms, ${fmtDate(rfpData.check_in)}`,
        html,
      });
    }));

    return res.status(200).json({ rfp_id: rfp.id });
  } catch (e) {
    console.error('rfp-create error:', e);
    return res.status(500).json({ error: e.message });
  }
}
