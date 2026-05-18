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

  const { bookingId, shareToken, members, hotelName, checkin, checkout, shareUrl } = req.body;

  if (!bookingId || !members || !Array.isArray(members) || members.length === 0) {
    return res.status(400).json({ error: 'Missing required fields: bookingId, members' });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const results = [];

  for (const member of members) {
    const { email, name } = member;
    if (!email) continue;

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
            from: 'TeamLodgr <noreply@teamlodgr.com>',
            to: [email],
            subject: `Your team has selected ${hotelName} — Book your room now`,
            html: `
              <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#f4f6fa;padding:32px;">
                <div style="background:#0d1b3e;padding:20px 32px;border-radius:12px 12px 0 0;">
                  <h1 style="color:white;font-size:1.4rem;margin:0;">🏨 TeamLodgr</h1>
                </div>
                <div style="background:white;padding:32px;border-radius:0 0 12px 12px;box-shadow:0 4px 24px rgba(0,0,0,0.1);">
                  <h2 style="color:#0d1b3e;margin-top:0;">Your team has selected a hotel!</h2>
                  <p style="color:#6b7280;">Hi ${name || 'there'},</p>
                  <p style="color:#1a1a2e;">Your team manager has selected <strong>${hotelName}</strong> for <strong>${checkin}</strong> → <strong>${checkout}</strong>.</p>
                  <p style="color:#dc2626;font-weight:600;">⚠️ Rooms are limited — book now before they sell out!</p>
                  <a href="${shareUrl}" style="display:inline-block;background:#1a6fd4;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0;">
                    Book Your Room Now →
                  </a>
                  <p style="color:#9ca3af;font-size:0.85rem;margin-top:24px;">Sent via TeamLodgr — Group hotel booking made simple.</p>
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
