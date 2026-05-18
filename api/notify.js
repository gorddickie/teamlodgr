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

  const { bookingId, shareToken, members, hotelName, checkin, checkout, shareUrl, baseUrl } = req.body;

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
                const fmtDate = (iso) => {
                  if (!iso) return '';
                  const [y, m, d] = iso.split('-').map(Number);
                  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                };
                const checkinFmt = fmtDate(checkin);
                const checkoutFmt = fmtDate(checkout);
                const roomCount = req.body.roomsNeeded;
                const organizerName = req.body.organizerName || 'your team manager';
                const tournament = req.body.tournamentName;
                const providers = req.body.providers || [];
                return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hotel Booking</title></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:24px 0;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">

        <!-- Header -->
        <tr><td style="padding:24px 28px 20px;border-bottom:2px solid #0d1b3e;">
          <img src="https://www.teamlodgr.com/logo.png" alt="TeamLodgr" height="40" style="display:block;height:40px;width:auto;">
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 28px 0;">

          ${tournament ? `
          <!-- Tournament badge -->
          <div style="display:inline-block;background:#0d1b3e;color:#ffffff;font-size:13px;font-weight:700;padding:6px 14px;border-radius:50px;margin-bottom:20px;">🏆 ${tournament}</div>
          ` : ''}

          <p style="margin:0 0 24px;color:#374151;font-size:16px;">Hi ${name || 'there'},</p>

          <!-- Hotel summary card -->
          <div style="border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin-bottom:24px;">
            <div style="font-size:22px;font-weight:800;color:#0d1b3e;margin-bottom:10px;line-height:1.2;">${hotelName}</div>
            <div style="font-size:15px;color:#374151;margin-bottom:8px;">📅 ${checkinFmt} → ${checkoutFmt}</div>
            ${roomCount ? `<div style="font-size:15px;color:#374151;">🛏️ ${roomCount} rooms reserved for your team</div>` : ''}
          </div>

          <!-- CTA button -->


          ${providers.length > 0 ? `
          <!-- Provider table -->
          <div style="margin-bottom:28px;">
            <div style="font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;">Also available on:</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${providers.map((p, i) => `
              <tr style="${i > 0 ? 'border-top:1px solid #f3f4f6;' : ''}">
                <td style="padding:10px 0;font-size:15px;color:#111827;font-weight:600;">${p.name}</td>
                <td style="padding:10px 0;font-size:15px;color:#374151;text-align:center;">${p.price || '—'}</td>
                <td style="padding:10px 0;text-align:right;"><a href="${p.url}" style="color:#1a6fd4;font-size:15px;font-weight:600;text-decoration:none;">Book</a></td>
              </tr>`).join('')}
            </table>
          </div>` : ''}

        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 28px 28px;border-top:1px solid #f3f4f6;">
          <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;">You received this because ${organizerName} added you to a group hotel booking.</p>
          <p style="margin:0;font-size:13px;color:#9ca3af;">Reply to this email to reach them directly.</p>
        </td></tr>

      </table>
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
