// api/rfp-accept.js — Organizer selects a winning hotel bid

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

  const { rfp_id, rfp_hotel_id, organizer_email } = req.body;

  if (!rfp_id || !rfp_hotel_id || !organizer_email) {
    return res.status(400).json({ error: 'rfp_id, rfp_hotel_id, and organizer_email are required' });
  }

  try {
    // Load RFP and verify organizer
    const rfps = await supabaseGet(`/rfps?id=eq.${rfp_id}&select=*`);
    const rfp = rfps[0];
    if (!rfp) return res.status(404).json({ error: 'RFP not found' });
    if (rfp.organizer_email.toLowerCase() !== organizer_email.toLowerCase()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Load all hotels for this RFP
    const hotels = await supabaseGet(`/rfp_hotels?rfp_id=eq.${rfp_id}&select=*`);
    const winner = hotels.find(h => h.id === rfp_hotel_id);
    if (!winner) return res.status(404).json({ error: 'Hotel not found in this RFP' });

    // Update RFP status
    await supabasePatch(`/rfps?id=eq.${rfp_id}`, { status: 'awarded' });

    // Update winner's bid_status
    await supabasePatch(`/rfp_hotels?id=eq.${rfp_hotel_id}`, { bid_status: 'winner' });

    // Email winner
    const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' });
    const winnerHtml = `
      <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f4f6fa;padding:32px 20px;">
        <div style="background:white;border-radius:16px;padding:32px;">
          <img src="${BASE_URL}/logo.png" alt="TeamLodgr" style="height:40px;margin-bottom:24px;"/>
          <div style="text-align:center;margin-bottom:24px;">
            <div style="font-size:3rem;margin-bottom:12px;">🏆</div>
            <h2 style="color:#0d1b3e;font-size:1.4rem;margin-bottom:8px;">Congratulations — You've Been Selected!</h2>
            <p style="color:#6b7280;">Your bid for <strong>${rfp.event_name}</strong> has been chosen.</p>
          </div>
          <div style="background:#f0fdf4;border:1.5px solid #16a34a;border-radius:12px;padding:20px;margin-bottom:24px;">
            <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #d1fae5;"><span style="color:#6b7280;">Event</span><strong style="color:#0d1b3e;">${rfp.event_name}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #d1fae5;"><span style="color:#6b7280;">Check-In</span><strong style="color:#0d1b3e;">${fmtDate(rfp.check_in)}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #d1fae5;"><span style="color:#6b7280;">Check-Out</span><strong style="color:#0d1b3e;">${fmtDate(rfp.check_out)}</strong></div>
            <div style="display:flex;justify-content:space-between;padding:7px 0;"><span style="color:#6b7280;">Rooms</span><strong style="color:#0d1b3e;">${rfp.rooms_needed} rooms</strong></div>
          </div>
          <p style="color:#6b7280;font-size:0.9rem;">The organizer (<strong>${rfp.organizer_name || rfp.organizer_email}</strong>) will be in touch to finalize details. Team members will begin booking their rooms shortly.</p>
        </div>
        <p style="text-align:center;color:#9ca3af;font-size:0.78rem;margin-top:16px;">Powered by TeamLodgr — teamlodgr.com</p>
      </div>`;

    await sendEmail({
      to: winner.hotel_email,
      subject: `🏆 You've been selected for ${rfp.event_name}!`,
      html: winnerHtml,
    });

    // Email losing hotels
    const losers = hotels.filter(h => h.id !== rfp_hotel_id && h.bid_status === 'submitted');
    await Promise.all(losers.map(async (loser) => {
      const loserHtml = `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f4f6fa;padding:32px 20px;">
          <div style="background:white;border-radius:16px;padding:32px;">
            <img src="${BASE_URL}/logo.png" alt="TeamLodgr" style="height:40px;margin-bottom:24px;"/>
            <h2 style="color:#0d1b3e;margin-bottom:8px;">Thank You for Your Bid</h2>
            <p style="color:#6b7280;margin-bottom:16px;">Re: <strong>${rfp.event_name}</strong></p>
            <p style="color:#374151;line-height:1.7;margin-bottom:20px;">
              Thank you for taking the time to submit a proposal for this event. After reviewing all bids,
              the organizer has selected another property for this booking.
              <br/><br/>
              We appreciate your participation and hope to work with you on a future event through TeamLodgr.
            </p>
          </div>
          <p style="text-align:center;color:#9ca3af;font-size:0.78rem;margin-top:16px;">Powered by TeamLodgr — teamlodgr.com</p>
        </div>`;
      await sendEmail({
        to: loser.hotel_email,
        subject: `Update on RFP: ${rfp.event_name}`,
        html: loserHtml,
      });
    }));

    return res.status(200).json({ ok: true, winner_hotel_id: rfp_hotel_id });
  } catch (e) {
    console.error('rfp-accept error:', e);
    return res.status(500).json({ error: e.message });
  }
}
