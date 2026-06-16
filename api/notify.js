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

// ── Send hotel group booking notice ──────────────────────────────────────────
async function sendHotelNoticeEmail({ resendApiKey, hotelEmail, hotelName, checkin, checkout, rooms, organizerName, organizerEmail, tournamentName, memberCount }) {
  if (!resendApiKey || !hotelEmail) return false;
  const ci = checkin  ? new Date(checkin  + 'T00:00:00').toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }) : checkin;
  const co = checkout ? new Date(checkout + 'T00:00:00').toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }) : checkout;
  const nights = (checkin && checkout)
    ? Math.round((new Date(checkout) - new Date(checkin)) / 86400000)
    : null;
  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from: 'TeamLodgr <bookings@teamlodgr.com>',
        reply_to: organizerEmail || undefined,
        to: [hotelEmail],
        subject: `Group Booking Notice — ${rooms} room${rooms !== 1 ? 's' : ''}${tournamentName ? ` for ${tournamentName}` : ''} (${ci} – ${co})`,
        html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:40px 20px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
    <tr><td style="padding-bottom:28px;border-bottom:2px solid #0d1b3e;">
      <img src="https://www.teamlodgr.com/logo.png" alt="TeamLodgr" height="40" style="display:block;height:40px;width:auto;">
    </td></tr>
    <tr><td style="padding:32px 0 28px;">
      <p style="margin:0 0 6px;font-size:16px;color:#111827;">Hello ${hotelName || 'Hotel Team'},</p>
      <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
        A sports team${tournamentName ? ` attending <strong>${tournamentName}</strong>` : ''} has selected your property through <strong>TeamLodgr</strong>.
        ${memberCount ? `<strong>${memberCount} team member${memberCount !== 1 ? 's' : ''}</strong> are in the process of booking their rooms individually.` : ''}
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;border-radius:10px;padding:20px;margin-bottom:24px;">
        <tr><td style="padding:6px 0;font-size:14px;color:#374151;"><strong>Check-in:</strong> &nbsp; ${ci || '—'}</td></tr>
        <tr><td style="padding:6px 0;font-size:14px;color:#374151;"><strong>Check-out:</strong> &nbsp; ${co || '—'}</td></tr>
        ${nights !== null ? `<tr><td style="padding:6px 0;font-size:14px;color:#374151;"><strong>Nights:</strong> &nbsp; ${nights}</td></tr>` : ''}
        <tr><td style="padding:6px 0;font-size:14px;color:#374151;"><strong>Rooms:</strong> &nbsp; ${rooms}</td></tr>
        ${organizerName ? `<tr><td style="padding:6px 0;font-size:14px;color:#374151;"><strong>Organizer:</strong> &nbsp; ${organizerName}</td></tr>` : ''}
        ${organizerEmail ? `<tr><td style="padding:6px 0;font-size:14px;color:#374151;"><strong>Contact:</strong> &nbsp; <a href="mailto:${organizerEmail}" style="color:#1a6fd4;">${organizerEmail}</a></td></tr>` : ''}
      </table>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">Each team member books and pays for their own room directly. If you have group rate availability or need to coordinate, please reply to this email or contact the organizer directly.</p>
      <p style="margin:0;font-size:13px;color:#9ca3af;">Sent by <a href="https://teamlodgr.com" style="color:#1a6fd4;">TeamLodgr</a> — Group hotel booking for sports teams.</p>
    </td></tr>
  </table>
</body>
</html>`,
      }),
    });
    return emailRes.ok;
  } catch (e) {
    console.error('Hotel notice email error:', e.message);
    return false;
  }
}

// ── Send organizer confirmation email ──────────────────────────────────────
async function sendOrganizerConfirmEmail({ resendApiKey, confirmUrl, hotelName, hotelPhoto, checkin, checkout, rooms, organizerEmail, organizerName, tournamentName, memberCount }) {
  if (!resendApiKey || !organizerEmail) return false;
  const ci = checkin  ? new Date(checkin  + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : checkin;
  const co = checkout ? new Date(checkout + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : checkout;
  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendApiKey}` },
      body: JSON.stringify({
        from: 'TeamLodgr <bookings@teamlodgr.com>',
        to: [organizerEmail],
        subject: tournamentName ? `Confirm hotel selection for ${tournamentName}` : `Confirm your hotel selection — ${hotelName}`,
        html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:40px 20px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
    <tr><td style="padding-bottom:28px;border-bottom:2px solid #0d1b3e;">
      <img src="https://www.teamlodgr.com/logo.png" alt="TeamLodgr" height="40" style="display:block;height:40px;width:auto;">
    </td></tr>
    <tr><td style="padding:32px 0 28px;">
      ${hotelPhoto ? `<img src="${hotelPhoto}" alt="${hotelName || 'Hotel'}" style="display:block;width:100%;max-height:220px;object-fit:cover;border-radius:8px;margin-bottom:20px;">` : ''}
      <p style="margin:0 0 6px;font-size:16px;color:#111827;">Hi ${organizerName || 'there'},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">You've selected a hotel for ${tournamentName ? `<strong>${tournamentName}</strong>` : 'your team'}. Review the details below, then click the button to notify your ${memberCount} team member${memberCount !== 1 ? 's' : ''}.</p>
      ${hotelName ? `<p style="margin:0 0 4px;font-size:22px;font-weight:700;color:#0d1b3e;">${hotelName}</p>` : ''}
      ${ci && co ? `<p style="margin:0 0 20px;font-size:15px;color:#6b7280;">📅 ${ci} → ${co} &nbsp;·&nbsp; 🛏️ ${rooms} room${rooms !== 1 ? 's' : ''}</p>` : ''}
      <a href="${confirmUrl}" style="display:block;background:#0d1b3e;color:#ffffff;text-decoration:none;text-align:center;font-size:18px;font-weight:700;padding:18px 24px;border-radius:8px;">✅ Confirm &amp; Notify My Team</a>
      <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;text-align:center;">Your team won't receive anything until you click this button.</p>
    </td></tr>
    <tr><td style="padding-top:20px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:13px;color:#9ca3af;">Sent by TeamLodgr. Questions? Reply to this email.</p>
    </td></tr>
  </table>
</body>
</html>`,
      }),
    });
    return emailRes.ok;
  } catch (e) {
    console.error('Organizer confirm email error:', e.message);
    return false;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, bookingId, shareToken, members, hotelName, hotelPhoto, checkin, checkout, shareUrl, baseUrl } = req.body;

  // ── Organizer confirmation email ─────────────────────────────────────
  if (action === 'organizer-confirm') {
    const { confirmUrl, organizerEmail, organizerName, tournamentName, rooms, memberCount } = req.body;
    if (!organizerEmail || !confirmUrl) {
      return res.status(400).json({ error: 'Missing organizerEmail or confirmUrl' });
    }
    const sent = await sendOrganizerConfirmEmail({
      resendApiKey: process.env.RESEND_API_KEY,
      confirmUrl,
      hotelName: req.body.hotelName,
      hotelPhoto: req.body.hotelPhoto,
      checkin: req.body.checkin,
      checkout: req.body.checkout,
      rooms: req.body.rooms,
      organizerEmail,
      organizerName,
      tournamentName,
      memberCount,
    });

    // ── Fire hotel notice in background (non-blocking) ──────────────────────
    // Fetch hotel_email from the booking row, then send notice
    const { bookingId: bId } = req.body;
    if (bId) {
      (async () => {
        try {
          const rows = await supabaseRequest(`/bookings?id=eq.${bId}&select=hotel_email,hotel_name`, 'GET', null);
          const hotelEmail = rows?.[0]?.hotel_email;
          if (hotelEmail) {
            const hotelSent = await sendHotelNoticeEmail({
              resendApiKey: process.env.RESEND_API_KEY,
              hotelEmail,
              hotelName:     req.body.hotelName,
              checkin:       req.body.checkin,
              checkout:      req.body.checkout,
              rooms:         req.body.rooms,
              organizerName,
              organizerEmail,
              tournamentName,
              memberCount,
            });
            console.log('[TeamLodgr] Hotel notice email sent:', hotelSent, hotelEmail);
          } else {
            console.log('[TeamLodgr] No hotel_email on booking', bId, '— skipping hotel notice');
          }
        } catch (e) {
          console.error('[TeamLodgr] Hotel notice background error:', e.message);
        }
      })();
    }

    return res.status(200).json({ ok: true, emailSent: sent });
  }

  if (!bookingId || !members || !Array.isArray(members) || members.length === 0) {
    return res.status(400).json({ error: 'Missing required fields: bookingId, members' });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const results = [];

  for (const member of members) {
    const { email, name } = member;
    if (!email) continue;

    // Build player booking link with all params so book.html can show hotel + providers
    const siteBase = baseUrl || shareUrl?.replace(/\/share\.html.*$/, '') || 'https://teamlodgr.com';
    const bookParams = new URLSearchParams({
      token:    shareToken,
      email:    email,
      ...(req.body.hotelName   ? { name:     req.body.hotelName }                          : {}),
      ...(req.body.checkin     ? { checkin:  req.body.checkin }                            : {}),
      ...(req.body.checkout    ? { checkout: req.body.checkout }                           : {}),
      ...(req.body.hotelPhoto  ? { photo:    req.body.hotelPhoto }                         : {}),
      ...(req.body.providers?.length ? { providers: encodeURIComponent(JSON.stringify(req.body.providers)) } : {}),
    });
    const playerLink = `${siteBase}/book.html?${bookParams.toString()}`;

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
        <strong>${organizerName}</strong> has selected a hotel for
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
