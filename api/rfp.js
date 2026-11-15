// api/rfp.js — Unified RFP handler
// Routes by ?action= query param:
//   POST create         — create RFP + email hotels
//   GET  load           — load RFP by token or rfp_id
//   POST bid            — hotel submits bid
//   POST message        — send message between organizer and hotel
//   POST accept         — organizer selects winner
//   POST nudge          — send follow-up email to hotel
//   POST status-update  — update hotel bid_status

const SUPABASE_URL = 'https://ehgaopxzfcfrqpupctts.supabase.co';
const BASE_URL = 'https://teamlodgr.com';

// ── Supabase helpers ─────────────────────────────────────────────────────────

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
}

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { headers: sbHeaders() });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase GET ${path} → ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function sbPost(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase POST ${path} → ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function sbPatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${path} → ${res.status}: ${await res.text()}`);
}

// ── Email helper ─────────────────────────────────────────────────────────────

async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.warn('RESEND_API_KEY not set'); return; }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: 'noreply@teamlodgr.com', to, subject, html }),
  });
  if (!res.ok) console.error('Resend error:', res.status, await res.text());
}

const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

// ── Action handlers ───────────────────────────────────────────────────────────

async function handleCreate(req, res) {
  const { rfp: rfpData, hotels } = req.body;
  if (!rfpData?.organizer_email || !rfpData?.event_name || !rfpData?.check_in || !rfpData?.check_out || !rfpData?.rooms_needed)
    return res.status(400).json({ error: 'Missing required RFP fields' });
  if (!hotels || hotels.length === 0)
    return res.status(400).json({ error: 'At least one hotel is required' });

  const [rfp] = await sbPost('/rfps', {
    organizer_email: rfpData.organizer_email,
    organizer_name: rfpData.organizer_name || null,
    event_name: rfpData.event_name,
    check_in: rfpData.check_in,
    check_out: rfpData.check_out,
    rooms_needed: rfpData.rooms_needed,
    notes: rfpData.notes || null,
    status: 'open',
  });

  const rfpHotels = await sbPost('/rfp_hotels', hotels.map(h => ({ rfp_id: rfp.id, hotel_name: h.name, hotel_email: h.email })));

  const nights = Math.round((new Date(rfpData.check_out) - new Date(rfpData.check_in)) / 86400000);

  await Promise.all(rfpHotels.map(rh => {
    const bidLink = `${BASE_URL}/bid.html?token=${rh.token}`;
    const html = `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f4f6fa;padding:32px 20px;">
      <div style="background:white;border-radius:16px;padding:32px;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
        <h2 style="color:#0d1b3e;font-size:1.4rem;margin-bottom:8px;">Room Block RFP — ${rfpData.event_name}</h2>
        <p style="color:#6b7280;margin-bottom:24px;">You've received a Request for Proposal from <strong>${rfpData.organizer_name || rfpData.organizer_email}</strong>.</p>
        <div style="background:#f4f6fa;border-radius:12px;padding:20px;margin-bottom:24px;">
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;">Event</span><strong>${rfpData.event_name}</strong></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;">Check-In</span><strong>${fmtDate(rfpData.check_in)}</strong></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;">Check-Out</span><strong>${fmtDate(rfpData.check_out)}</strong></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;">Nights</span><strong>${nights}</strong></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;"><span style="color:#6b7280;">Rooms Needed</span><strong>${rfpData.rooms_needed} rooms</strong></div>
          ${rfpData.notes ? `<div style="padding:8px 0;color:#6b7280;font-size:0.9rem;border-top:1px solid #e5e7eb;"><strong>Notes:</strong> ${rfpData.notes}</div>` : ''}
        </div>
        <a href="${bidLink}" style="display:block;background:#1a6fd4;color:white;text-align:center;padding:16px;border-radius:10px;text-decoration:none;font-weight:700;">Submit Your Bid →</a>
        <p style="color:#9ca3af;font-size:0.82rem;text-align:center;margin-top:12px;">This link is unique to ${rh.hotel_name}.</p>
      </div>
    </div>`;
    return sendEmail({ to: rh.hotel_email, subject: `Room Block RFP: ${rfpData.event_name} — ${rfpData.rooms_needed} rooms, ${fmtDate(rfpData.check_in)}`, html });
  }));

  return res.status(200).json({ rfp_id: rfp.id });
}

async function handleLoad(req, res) {
  const { token, rfp_id, email } = req.query;

  if (token) {
    const hotels = await sbGet(`/rfp_hotels?token=eq.${encodeURIComponent(token)}&select=*`);
    if (!hotels?.length) return res.status(404).json({ error: 'Invalid token' });
    const rfpHotel = hotels[0];
    const rfps = await sbGet(`/rfps?id=eq.${rfpHotel.rfp_id}&select=*`);
    const rfp = rfps[0];
    if (!rfp) return res.status(404).json({ error: 'RFP not found' });
    const bids = await sbGet(`/rfp_bids?rfp_hotel_id=eq.${rfpHotel.id}&select=*&order=created_at.desc&limit=1`);
    const messages = await sbGet(`/rfp_messages?rfp_hotel_id=eq.${rfpHotel.id}&select=*&order=created_at.asc`);
    return res.status(200).json({ rfp, rfp_hotel: rfpHotel, bid: bids[0] || null, messages });
  }

  if (rfp_id) {
    const rfps = await sbGet(`/rfps?id=eq.${encodeURIComponent(rfp_id)}&select=*`);
    const rfp = rfps[0];
    if (!rfp) return res.status(404).json({ error: 'RFP not found' });
    if (email && rfp.organizer_email.toLowerCase() !== email.toLowerCase())
      return res.status(403).json({ error: 'Access denied' });
    const hotels = await sbGet(`/rfp_hotels?rfp_id=eq.${rfp_id}&select=*&order=created_at.asc`);
    const enriched = await Promise.all(hotels.map(async h => {
      const bids = await sbGet(`/rfp_bids?rfp_hotel_id=eq.${h.id}&select=*&order=created_at.desc&limit=1`);
      const messages = await sbGet(`/rfp_messages?rfp_hotel_id=eq.${h.id}&select=*&order=created_at.asc`);
      return { ...h, bid: bids[0] || null, messages };
    }));
    return res.status(200).json({ rfp, hotels: enriched });
  }

  return res.status(400).json({ error: 'Must provide token or rfp_id' });
}

async function handleBid(req, res) {
  const { token, nightly_rate, total_estimate, cutoff_date, perks, notes } = req.body;
  if (!token || !nightly_rate) return res.status(400).json({ error: 'token and nightly_rate are required' });

  const hotels = await sbGet(`/rfp_hotels?token=eq.${encodeURIComponent(token)}&select=*`);
  if (!hotels?.length) return res.status(404).json({ error: 'Invalid token' });
  const rfpHotel = hotels[0];

  await sbPost('/rfp_bids', { rfp_hotel_id: rfpHotel.id, nightly_rate, total_estimate: total_estimate || null, cutoff_date: cutoff_date || null, perks: perks || null, notes: notes || null });
  await sbPatch(`/rfp_hotels?id=eq.${rfpHotel.id}`, { bid_status: 'submitted' });

  const rfps = await sbGet(`/rfps?id=eq.${rfpHotel.rfp_id}&select=*`);
  const rfp = rfps[0];
  if (rfp) {
    const dashLink = `${BASE_URL}/rfp-dashboard.html?rfp=${rfp.id}&email=${encodeURIComponent(rfp.organizer_email)}`;
    const html = `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f4f6fa;padding:32px 20px;">
      <div style="background:white;border-radius:16px;padding:32px;">
        <h2 style="color:#0d1b3e;">New Bid Received! 🏨</h2>
        <p style="color:#6b7280;"><strong>${rfpHotel.hotel_name}</strong> submitted a bid for <strong>${rfp.event_name}</strong></p>
        <div style="background:#f4f6fa;border-radius:12px;padding:20px;margin:20px 0;">
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;">Hotel</span><strong>${rfpHotel.hotel_name}</strong></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;"><span style="color:#6b7280;">Nightly Rate</span><strong style="color:#1a6fd4;">$${nightly_rate}/night</strong></div>
        </div>
        <a href="${dashLink}" style="display:block;background:#1a6fd4;color:white;text-align:center;padding:16px;border-radius:10px;text-decoration:none;font-weight:700;">View All Bids →</a>
      </div>
    </div>`;
    await sendEmail({ to: rfp.organizer_email, subject: `New bid from ${rfpHotel.hotel_name} — ${rfp.event_name}`, html });
  }

  return res.status(200).json({ ok: true });
}

async function handleMessage(req, res) {
  const { token, sender, message } = req.body;
  if (!token || !sender || !message) return res.status(400).json({ error: 'token, sender, and message are required' });
  if (!['organizer', 'hotel'].includes(sender)) return res.status(400).json({ error: 'sender must be organizer or hotel' });

  const hotels = await sbGet(`/rfp_hotels?token=eq.${encodeURIComponent(token)}&select=*`);
  if (!hotels?.length) return res.status(404).json({ error: 'Invalid token' });
  const rfpHotel = hotels[0];

  await sbPost('/rfp_messages', { rfp_hotel_id: rfpHotel.id, sender, message });

  const rfps = await sbGet(`/rfps?id=eq.${rfpHotel.rfp_id}&select=*`);
  const rfp = rfps[0];
  if (!rfp) return res.status(200).json({ ok: true });

  const dashLink = `${BASE_URL}/rfp-dashboard.html?rfp=${rfp.id}&email=${encodeURIComponent(rfp.organizer_email)}`;
  const bidLink = `${BASE_URL}/bid.html?token=${rfpHotel.token}`;

  if (sender === 'organizer') {
    const html = `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f4f6fa;padding:32px 20px;">
      <div style="background:white;border-radius:16px;padding:32px;">
        <h2 style="color:#0d1b3e;">Message from the Organizer 💬</h2>
        <p style="color:#6b7280;">Re: <strong>${rfp.event_name}</strong></p>
        <div style="background:#e8f0fd;border-left:3px solid #1a6fd4;padding:16px;border-radius:8px;margin:16px 0;">${message}</div>
        <a href="${bidLink}" style="display:block;background:#1a6fd4;color:white;text-align:center;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;">Reply on TeamLodgr →</a>
      </div>
    </div>`;
    await sendEmail({ to: rfpHotel.hotel_email, subject: `Message re: ${rfp.event_name}`, html });
  } else {
    const html = `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f4f6fa;padding:32px 20px;">
      <div style="background:white;border-radius:16px;padding:32px;">
        <h2 style="color:#0d1b3e;">Message from ${rfpHotel.hotel_name} 🏨</h2>
        <p style="color:#6b7280;">Re: <strong>${rfp.event_name}</strong></p>
        <div style="background:#f4f6fa;border-left:3px solid #9ca3af;padding:16px;border-radius:8px;margin:16px 0;">${message}</div>
        <a href="${dashLink}" style="display:block;background:#1a6fd4;color:white;text-align:center;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;">View Dashboard →</a>
      </div>
    </div>`;
    await sendEmail({ to: rfp.organizer_email, subject: `${rfpHotel.hotel_name} replied to your RFP — ${rfp.event_name}`, html });
  }

  return res.status(200).json({ ok: true });
}

async function handleAccept(req, res) {
  const { rfp_id, rfp_hotel_id, organizer_email } = req.body;
  if (!rfp_id || !rfp_hotel_id || !organizer_email) return res.status(400).json({ error: 'rfp_id, rfp_hotel_id, organizer_email required' });

  const rfps = await sbGet(`/rfps?id=eq.${rfp_id}&select=*`);
  const rfp = rfps[0];
  if (!rfp) return res.status(404).json({ error: 'RFP not found' });
  if (rfp.organizer_email.toLowerCase() !== organizer_email.toLowerCase()) return res.status(403).json({ error: 'Access denied' });

  const hotels = await sbGet(`/rfp_hotels?rfp_id=eq.${rfp_id}&select=*`);
  const winner = hotels.find(h => h.id === rfp_hotel_id);
  if (!winner) return res.status(404).json({ error: 'Hotel not found in this RFP' });

  await sbPatch(`/rfps?id=eq.${rfp_id}`, { status: 'awarded' });
  await sbPatch(`/rfp_hotels?id=eq.${rfp_hotel_id}`, { bid_status: 'winner' });

  const winnerHtml = `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f4f6fa;padding:32px 20px;">
    <div style="background:white;border-radius:16px;padding:32px;text-align:center;">
      <div style="font-size:3rem;margin-bottom:12px;">🏆</div>
      <h2 style="color:#0d1b3e;">Congratulations — You've Been Selected!</h2>
      <p style="color:#6b7280;margin:12px 0;">Your bid for <strong>${rfp.event_name}</strong> has been chosen.</p>
      <div style="background:#f0fdf4;border:1.5px solid #16a34a;border-radius:12px;padding:20px;margin:20px 0;text-align:left;">
        <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #d1fae5;"><span style="color:#6b7280;">Check-In</span><strong>${fmtDate(rfp.check_in)}</strong></div>
        <div style="display:flex;justify-content:space-between;padding:7px 0;"><span style="color:#6b7280;">Rooms</span><strong>${rfp.rooms_needed} rooms</strong></div>
      </div>
      <p style="color:#6b7280;font-size:0.9rem;">The organizer will be in touch to finalize details.</p>
    </div>
  </div>`;

  await sendEmail({ to: winner.hotel_email, subject: `🏆 You've been selected for ${rfp.event_name}!`, html: winnerHtml });

  const losers = hotels.filter(h => h.id !== rfp_hotel_id && h.bid_status === 'submitted');
  await Promise.all(losers.map(loser => {
    const html = `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f4f6fa;padding:32px 20px;">
      <div style="background:white;border-radius:16px;padding:32px;">
        <h2 style="color:#0d1b3e;">Thank You for Your Bid</h2>
        <p style="color:#374151;line-height:1.7;margin:12px 0;">Thank you for submitting a proposal for <strong>${rfp.event_name}</strong>. After reviewing all bids, the organizer has selected another property. We hope to work with you on a future event!</p>
      </div>
    </div>`;
    return sendEmail({ to: loser.hotel_email, subject: `Update on RFP: ${rfp.event_name}`, html });
  }));

  return res.status(200).json({ ok: true });
}

async function handleNudge(req, res) {
  const { rfp_hotel_id } = req.body;
  if (!rfp_hotel_id) return res.status(400).json({ error: 'rfp_hotel_id required' });

  const hotels = await sbGet(`/rfp_hotels?id=eq.${encodeURIComponent(rfp_hotel_id)}&select=*`);
  if (!hotels?.length) return res.status(404).json({ error: 'Hotel not found' });
  const rfpHotel = hotels[0];

  const rfps = await sbGet(`/rfps?id=eq.${rfpHotel.rfp_id}&select=*`);
  const rfp = rfps[0];
  if (!rfp) return res.status(404).json({ error: 'RFP not found' });

  const bidLink = `${BASE_URL}/bid.html?token=${rfpHotel.token}`;
  const html = `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f4f6fa;padding:32px 20px;">
    <div style="background:white;border-radius:16px;padding:32px;">
      <h2 style="color:#0d1b3e;">Following Up on Your Room Block Request 👋</h2>
      <p style="color:#6b7280;margin:12px 0;">Just following up on our room block request for <strong>${rfp.event_name}</strong>. We'd love to hear from you!</p>
      <div style="background:#f4f6fa;border-radius:10px;padding:18px;margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;">Check-In</span><strong>${fmtDate(rfp.check_in)}</strong></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e5e7eb;"><span style="color:#6b7280;">Check-Out</span><strong>${fmtDate(rfp.check_out)}</strong></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;"><span style="color:#6b7280;">Rooms Needed</span><strong>${rfp.rooms_needed}</strong></div>
      </div>
      <a href="${bidLink}" style="display:block;background:#1a6fd4;color:white;text-align:center;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;">Submit Your Bid →</a>
    </div>
  </div>`;

  await sendEmail({ to: rfpHotel.hotel_email, subject: `Following up: Room block request for ${rfp.event_name}`, html });
  await sbPatch(`/rfp_hotels?id=eq.${rfp_hotel_id}`, { nudge_count: (rfpHotel.nudge_count || 0) + 1, last_nudged_at: new Date().toISOString() });

  return res.status(200).json({ success: true });
}

async function handleStatusUpdate(req, res) {
  const { rfp_hotel_id, status } = req.body;
  const ALLOWED = ['pending', 'declined', 'removed'];
  if (!rfp_hotel_id || !status) return res.status(400).json({ error: 'rfp_hotel_id and status required' });
  if (!ALLOWED.includes(status)) return res.status(400).json({ error: `status must be: ${ALLOWED.join(', ')}` });
  await sbPatch(`/rfp_hotels?id=eq.${encodeURIComponent(rfp_hotel_id)}`, { bid_status: status });
  return res.status(200).json({ success: true });
}

// ── Main router ───────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const action = req.query.action;

  try {
    if (req.method === 'GET' && action === 'load') return await handleLoad(req, res);
    if (req.method === 'POST' && action === 'create') return await handleCreate(req, res);
    if (req.method === 'POST' && action === 'bid') return await handleBid(req, res);
    if (req.method === 'POST' && action === 'message') return await handleMessage(req, res);
    if (req.method === 'POST' && action === 'accept') return await handleAccept(req, res);
    if (req.method === 'POST' && action === 'nudge') return await handleNudge(req, res);
    if (req.method === 'POST' && action === 'status-update') return await handleStatusUpdate(req, res);

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (e) {
    console.error(`rfp[${action}] error:`, e);
    return res.status(500).json({ error: e.message });
  }
}
