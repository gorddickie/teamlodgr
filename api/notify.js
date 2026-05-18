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
            html: `
              <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f4f6fa;padding:32px;">
                <div style="background:#0d1b3e;padding:20px 32px;border-radius:12px 12px 0 0;">
                  <h1 style="color:white;font-size:1.4rem;margin:0;">🏨 TeamLodgr</h1>
                </div>
                <div style="background:white;padding:32px;border-radius:0 0 12px 12px;box-shadow:0 4px 24px rgba(0,0,0,0.1);">
                  <h2 style="color:#0d1b3e;margin-top:0;">Hotel accommodation confirmed for your team</h2>
                  ${req.body.tournamentName ? `<div style="display:inline-block;background:#e8f0fd;color:#1a6fd4;font-weight:700;font-size:0.85rem;padding:4px 12px;border-radius:50px;margin-bottom:12px;">🏆 ${req.body.tournamentName}</div>` : ''}
                  <p style="color:#6b7280;margin-bottom:20px;">Hi ${name || 'there'},</p>

                  <!-- Hotel details box -->
                  <div style="background:#f4f6fa;border-radius:10px;padding:20px;margin-bottom:20px;">
                    <div style="font-size:1.15rem;font-weight:800;color:#0d1b3e;margin-bottom:12px;">${hotelName}</div>
                    <table style="width:100%;border-collapse:collapse;">
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:0.88rem;">📅 Dates</td>
                        <td style="padding:6px 0;font-weight:600;color:#1a1a2e;font-size:0.88rem;">${checkin} → ${checkout}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:0.88rem;">🛏️ Rooms needed</td>
                        <td style="padding:6px 0;font-weight:600;color:#1a1a2e;font-size:0.88rem;">${req.body.roomsNeeded || '—'} rooms</td>
                      </tr>
                    </table>

                    ${req.body.providers && req.body.providers.length > 0 ? `
                    <div style="margin-top:16px;">
                      <div style="font-size:0.82rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Best Prices by Booking Site</div>
                      <table style="width:100%;border-collapse:collapse;">
                        <tr style="background:#e8f0fd;">
                          <th style="padding:8px 10px;text-align:left;font-size:0.82rem;color:#0d1b3e;">Site</th>
                          <th style="padding:8px 10px;text-align:right;font-size:0.82rem;color:#0d1b3e;">Price/night</th>
                          <th style="padding:8px 10px;text-align:center;font-size:0.82rem;color:#0d1b3e;">Book</th>
                        </tr>
                        ${req.body.providers.map(p => `
                        <tr style="border-bottom:1px solid #e5e7eb;">
                          <td style="padding:8px 10px;font-size:0.88rem;font-weight:600;color:#1a1a2e;">${p.name}</td>
                          <td style="padding:8px 10px;font-size:0.88rem;font-weight:700;color:#1a6fd4;text-align:right;">${p.price || '—'}</td>
                          <td style="padding:8px 10px;text-align:center;"><a href="${p.url}" style="background:#1a6fd4;color:white;padding:4px 12px;border-radius:4px;text-decoration:none;font-size:0.8rem;font-weight:700;">Book</a></td>
                        </tr>`).join('')}
                      </table>
                    </div>` : ''}

                    <table style="width:100%;border-collapse:collapse;"><tr><td><!-- spacer --></td></tr>
                    </table>
                  </div>

                  <p style="color:#1a6fd4;font-weight:600;margin-bottom:16px;">Please secure your room as soon as possible — availability is limited for group bookings.</p>

                  <a href="${playerLink}" style="display:block;background:#1a6fd4;color:white;padding:16px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:1.05rem;text-align:center;margin-bottom:24px;">
                    Reserve Your Room →
                  </a>

                  <p style="color:#9ca3af;font-size:0.82rem;">You received this because your team manager added you to a group hotel booking on TeamLodgr. Reply to this email to reach your team manager directly.</p>
                </div>
              </div>
            `,
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
