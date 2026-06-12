// api/rfp-send.js — sends a group RFP email to the hotel on organizer's behalf
// Called from api/confirm.js after organizer confirms booking

const SUPABASE_URL = 'https://ehgaopxzfcfrqpupctts.supabase.co';

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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { bookingId } = req.body;
  if (!bookingId) return res.status(400).json({ error: 'Missing bookingId' });

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return res.status(500).json({ error: 'RESEND_API_KEY not configured' });

  // Load booking
  let bookings;
  try {
    bookings = await supabaseRequest(`/bookings?id=eq.${bookingId}&select=*`, 'GET');
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load booking' });
  }

  const b = bookings?.[0];
  if (!b) return res.status(404).json({ error: 'Booking not found' });
  if (!b.hotel_email) return res.status(200).json({ ok: false, reason: 'No hotel email on file' });

  // Format dates
  const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : d;
  const checkin  = fmt(b.checkin);
  const checkout = fmt(b.checkout);

  const organizerName  = b.organizer_name  || 'The Organizer';
  const tournamentName = b.tournament_name || null;
  const rooms          = b.rooms_needed    || 1;

  // RFP reply-to: rfp+BOOKINGID@teamlodgr.com so inbound replies are routed correctly
  const replyTo = `rfp+${bookingId}@teamlodgr.com`;

  const subject = tournamentName
    ? `Group Accommodation Request — ${tournamentName} — ${rooms} Rooms`
    : `Group Accommodation Request — ${rooms} Rooms, ${b.checkin} to ${b.checkout}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:40px 20px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
    <tr><td style="padding-bottom:24px;border-bottom:2px solid #0d1b3e;">
      <img src="https://www.teamlodgr.com/logo.png" alt="TeamLodgr" height="36" style="display:block;">
    </td></tr>
    <tr><td style="padding:28px 0;">
      <p style="margin:0 0 16px;font-size:15px;color:#374151;">Dear ${b.hotel_name} Sales Team,</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">
        My name is ${organizerName}. I am writing on behalf of our group to request accommodation at <strong>${b.hotel_name}</strong>${tournamentName ? ` for <strong>${tournamentName}</strong>` : ''}.
      </p>

      <table style="width:100%;background:#f4f6fa;border-radius:10px;padding:20px;margin-bottom:20px;border-collapse:collapse;">
        <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;width:140px;">Check-in</td><td style="font-size:14px;font-weight:700;color:#0d1b3e;">${checkin}</td></tr>
        <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Check-out</td><td style="font-size:14px;font-weight:700;color:#0d1b3e;">${checkout}</td></tr>
        <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Rooms Required</td><td style="font-size:14px;font-weight:700;color:#0d1b3e;">${rooms} rooms</td></tr>
        <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Room Type</td><td style="font-size:14px;font-weight:700;color:#0d1b3e;">Standard (1 or 2 beds)</td></tr>
        ${tournamentName ? `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Event</td><td style="font-size:14px;font-weight:700;color:#0d1b3e;">${tournamentName}</td></tr>` : ''}
      </table>

      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">
        We would appreciate a group rate quote for the above dates. Please reply to this email with your best available rate and any applicable group policies (attrition, cutoff date, comp rooms, etc.).
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
        TeamLodgr is an IATAN-accredited travel agency. We look forward to your response.
      </p>
      <p style="margin:0;font-size:15px;color:#374151;">
        Kind regards,<br/>
        <strong>${organizerName}</strong><br/>
        via TeamLodgr Group Travel<br/>
        <a href="https://teamlodgr.com" style="color:#1a6fd4;">teamlodgr.com</a>
      </p>
    </td></tr>
    <tr><td style="padding-top:20px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">
        This request was sent via TeamLodgr. To reply, simply respond to this email — your reply will be forwarded to the group organizer.
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  // Send RFP email
  let resendId = null;
  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from:     'TeamLodgr Group Travel <rfp@teamlodgr.com>',
        to:       [b.hotel_email],
        reply_to: replyTo,
        subject,
        html,
      }),
    });
    const emailData = await emailRes.json();
    if (emailRes.ok) resendId = emailData.id;
    else console.error('Resend RFP error:', JSON.stringify(emailData));
  } catch (e) {
    console.error('RFP send error:', e.message);
    return res.status(500).json({ error: 'Failed to send RFP email' });
  }

  // Log to rfp_emails table
  try {
    await supabaseRequest('/rfp_emails', 'POST', {
      booking_id: bookingId,
      direction:  'outbound',
      from_email: `rfp@teamlodgr.com`,
      to_email:   b.hotel_email,
      subject,
      body:       html,
      resend_id:  resendId,
    });
  } catch (e) {
    console.error('rfp_emails insert error:', e.message);
  }

  // Update booking with rfp_sent_at
  try {
    await supabaseRequest(`/bookings?id=eq.${bookingId}`, 'PATCH', {
      rfp_sent_at: new Date().toISOString(),
    });
  } catch (e) {
    // Column may not exist yet — non-fatal
    console.warn('rfp_sent_at update skipped:', e.message);
  }

  return res.status(200).json({ ok: true, resendId, hotelEmail: b.hotel_email });
};
