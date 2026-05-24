// api/notify.js — Vercel serverless function for TeamLodgr team notifications
// TODO: Set RESEND_API_KEY in Vercel environment variables before emails will send.
// TODO: Set SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables.

const SUPABASE_URL = 'https://ehgaopxzfcfrqpupctts.supabase.co';

async function supabaseRequest(path, method, body, serviceRole = true) {
  const key = serviceRole
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_PUBLISHABLE_KEY;
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { bookingId, shareToken, members, hotelName, hotelPhoto, checkin, checkout, shareUrl, baseUrl } = req.body;

  if (!bookingId || !members || !Array.isArray(members) || members.length === 0) {
    return res.status(400).json({ error: 'Missing required fields: bookingId, members' });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const results = [];

  for (const member of members) {
    const { email, name } = member;
    if (!email) continue;

    // Build player booking link: /book.html?token=SHARE_TOKEN&email=ENCODED_EMAIL
    const siteBase = baseUrl || shareUrl?.replace(/\/share\.html.*$/, '') || 'https://teamlodgr.com';
    const playerLink = `${siteBase}/book.html?token=${encodeURIComponent(shareToken)}&email=${encodeURIComponent(email)}`;

    // Send email via Resend
    let emailSent = false;
    if (resendApiKey) {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: 'TeamLodgr <bookings@teamlodgr.com>',
            reply_to: req.body.organizerEmail || undefined,
            to: [email],
            subject: req.body.tournamentName ? `Hotel Selected for ${req.body.tournamentName}` : `Hotel Selected for Your Team — ${hotelName}`,
            html: (() => {
                const organizerName = req.body.organizerName || 'your team manager';
                const tournament = req.body.tournamentName;
                return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:40px 20px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">

    <!-- Logo -->
    <tr><td style="padding-bottom:28px;border-bottom:2px solid #0d1b3e;">
      <img src="https://www.teamlodgr.com/logo.png" alt="TeamLodgr" height="40" style="display:block;height:40px;width:auto;">
    </td></tr>

    <!-- Message -->
    <tr><td style="padding:32px 0 28px;">
      ${hotelPhoto ? `<img src="${hotelPhoto}" alt="${hotelName || 'Hotel'}" style="display:block;width:100%;max-height:220px;object-fit:cover;border-radius:8px;margin-bottom:20px;">` : ''}
      <p style="margin:0 0 8px;font-size:17px;color:#111827;line-height:1.5;">
        A hotel has been selected for
        ${tournament ? `<strong>${tournament}</strong>` : 'your team'}.
      </p>
      ${hotelName ? `<p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0d1b3e;">${hotelName}</p>` : ''}
      ${checkin && checkout ? `<p style="margin:0 0 20px;font-size:15px;color:#6b7280;">📅 ${checkin} → ${checkout}</p>` : ''}
      <a href="${playerLink}" style="display:block;background:#0d1b3e;color:#ffffff;text-decoration:none;text-align:center;font-size:18px;font-weight:700;padding:18px 24px;border-radius:8px;">Book Your Room</a>
    </td></tr>

    <!-- Footer -->
    <tr><td style="padding-top:20px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:13px;color:#9ca3af;">Sent by ${organizerName} via TeamLodgr. Reply to reach them directly.</p>
    </td></tr>

  </table>
</body>
</html>
`;
              })(),
          }),
        });
        if (emailRes.ok) emailSent = true;
      } catch (e) {
        console.error('Resend error for', email, e.message);
      }
    } else {
      console.warn('RESEND_API_KEY not set — skipping email for', email);
    }

    // Update notified_at in Supabase for this member
    try {
      await supabaseRequest(
        `/team_members?booking_id=eq.${bookingId}&email=eq.${encodeURIComponent(email)}`,
        'PATCH',
        { notified_at: new Date().toISOString() }
      );
    } catch (e) {
      console.error('Supabase update error for', email, e.message);
    }

    results.push({ email, emailSent });
  }

  return res.status(200).json({ ok: true, results });
};
