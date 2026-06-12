// api/rfp-reply.js — Resend inbound webhook
// Hotel replies to rfp+BOOKINGID@teamlodgr.com → this endpoint fires
// We log the email and forward it to the organizer

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const resendApiKey = process.env.RESEND_API_KEY;

  // Resend inbound payload
  const { to, from, subject, html, text } = req.body;

  // Extract booking ID from the to address: rfp+BOOKINGID@teamlodgr.com
  const toAddr = Array.isArray(to) ? to[0] : to;
  const match  = (toAddr || '').match(/rfp\+([a-f0-9\-]+)@teamlodgr\.com/i);
  if (!match) {
    console.error('Could not extract booking ID from to address:', toAddr);
    return res.status(200).json({ ok: false, reason: 'Could not parse booking ID from address' });
  }

  const bookingId = match[1];

  // Load booking to get organizer email
  let bookings;
  try {
    bookings = await supabaseRequest(`/bookings?id=eq.${bookingId}&select=id,hotel_name,organizer_email,organizer_name,checkin,checkout,tournament_name`, 'GET');
  } catch (e) {
    console.error('Supabase lookup error:', e.message);
    return res.status(500).json({ error: 'Database error' });
  }

  const b = bookings?.[0];
  if (!b) return res.status(404).json({ error: 'Booking not found' });

  // Log inbound email
  try {
    await supabaseRequest('/rfp_emails', 'POST', {
      booking_id: bookingId,
      direction:  'inbound',
      from_email: from,
      to_email:   toAddr,
      subject:    subject || '(no subject)',
      body:       html || text || '',
    });
  } catch (e) {
    console.error('rfp_emails insert error:', e.message);
  }

  // Forward to organizer
  if (b.organizer_email && resendApiKey) {
    const forwardSubject = subject?.startsWith('Re:') ? subject : `Re: Group Rate — ${b.hotel_name}`;
    const hotelName = from?.match(/@(.+)/)?.[1] || 'the hotel';

    const forwardHtml = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:40px 20px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
    <tr><td style="padding-bottom:24px;border-bottom:2px solid #0d1b3e;">
      <img src="https://www.teamlodgr.com/logo.png" alt="TeamLodgr" height="36" style="display:block;">
    </td></tr>
    <tr><td style="padding:24px 0 16px;">
      <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">Reply from <strong>${from}</strong> regarding your group booking at <strong>${b.hotel_name}</strong></p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;">
      ${html || `<p style="white-space:pre-wrap;font-size:14px;color:#374151;">${text || ''}</p>`}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;">
    </td></tr>
    <tr><td style="padding-bottom:24px;">
      <p style="margin:0 0 12px;font-size:14px;color:#374151;">To reply to the hotel, just reply to this email — TeamLodgr will forward it automatically.</p>
    </td></tr>
    <tr><td style="padding-top:16px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">Managed by TeamLodgr Group Travel · <a href="https://teamlodgr.com" style="color:#1a6fd4;">teamlodgr.com</a></p>
    </td></tr>
  </table>
</body>
</html>`;

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendApiKey}` },
        body: JSON.stringify({
          from:     'TeamLodgr Group Travel <rfp@teamlodgr.com>',
          to:       [b.organizer_email],
          reply_to: `rfp+${bookingId}@teamlodgr.com`,
          subject:  forwardSubject,
          html:     forwardHtml,
        }),
      });
    } catch (e) {
      console.error('Forward to organizer error:', e.message);
    }
  }

  return res.status(200).json({ ok: true, bookingId });
};
