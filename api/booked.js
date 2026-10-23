// api/booked.js — Vercel serverless function for TeamLodgr
// Called when a team member clicks "I've Booked My Room"
//
// POST body: { token, email }
//   token — share token from the booking link (?token=...)
//   email — team member's email address
//
// What it does:
//   1. Looks up the booking by share token
//   2. Finds the team member by booking_id + email
//   3. Sets booked_at = now
//   4. Emails the organizer with updated booking count
//   5. Returns updated progress to the frontend

const SUPABASE_URL = 'https://ehgaopxzfcfrqpupctts.supabase.co';

async function supabaseRequest(path, method, body) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');

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
  return text ? JSON.parse(text) : [];
}

async function sendPlayerConfirmationEmail({ email, name, booking }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:40px 20px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
    <tr><td style="padding-bottom:28px;border-bottom:2px solid #0d1b3e;">
      <img src="https://www.teamlodgr.com/logo.png" alt="TeamLodgr" height="40" style="display:block;">
    </td></tr>
    <tr><td style="padding:32px 0 28px;">
      <p style="margin:0 0 8px;font-size:28px;">✅</p>
      <p style="margin:0 0 12px;font-size:20px;font-weight:700;color:#111827;">You're booked!</p>
      <p style="margin:0 0 20px;font-size:15px;color:#6b7280;line-height:1.6;">
        Your room at <strong style="color:#0d1b3e;">${booking.hotel_name}</strong> has been confirmed.
        We've let your team manager know.
      </p>
      <table width="100%" cellpadding="12" style="background:#f9fafb;border-radius:8px;margin-bottom:24px;">
        <tr><td style="font-size:15px;color:#374151;">
          🏨 <strong>${booking.hotel_name}</strong>${booking.city ? ', ' + booking.city : ''}<br>
          📅 ${booking.checkin} → ${booking.checkout}
          ${booking.tournament_name ? '<br>🏆 ' + booking.tournament_name : ''}
        </td></tr>
      </table>
      <p style="margin:0;font-size:14px;color:#6b7280;">See you there! 🎉</p>
    </td></tr>
    <tr><td style="padding-top:20px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:13px;color:#9ca3af;">Sent via TeamLodgr · <a href="https://teamlodgr.com" style="color:#9ca3af;">teamlodgr.com</a></p>
    </td></tr>
  </table>
</body>
</html>`.trim();

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: 'TeamLodgr <bookings@teamlodgr.com>',
        to: [email],
        subject: `✅ You're booked at ${booking.hotel_name}!`,
        html,
      }),
    });
    return r.ok;
  } catch (e) {
    console.error('Resend player confirm error:', e.message);
    return false;
  }
}

async function sendOrganizerEmail({ booking, bookedCount, totalMembers, memberEmail, memberName }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('RESEND_API_KEY not set — skipping organizer email');
    return false;
  }

  const remaining  = Math.max(0, booking.rooms_needed - bookedCount);
  const allBooked  = remaining === 0;
  const subject    = allBooked
    ? `✅ All rooms booked — ${booking.hotel_name}`
    : `${bookedCount} of ${booking.rooms_needed} rooms booked — ${booking.hotel_name}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:40px 20px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">

    <!-- Logo -->
    <tr><td style="padding-bottom:28px;border-bottom:2px solid #0d1b3e;">
      <img src="https://www.teamlodgr.com/logo.png" alt="TeamLodgr" height="40" style="display:block;height:40px;width:auto;">
    </td></tr>

    <!-- Body -->
    <tr><td style="padding:32px 0 28px;">
      <p style="margin:0 0 16px;font-size:17px;color:#111827;line-height:1.5;">
        <strong>${memberName || memberEmail}</strong> just booked their room at
        <strong>${booking.hotel_name}</strong>. 🎉
      </p>

      <!-- Progress bar -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td style="font-size:14px;color:#6b7280;padding-bottom:8px;">
            Booking progress: <strong style="color:#111827;">${bookedCount} of ${booking.rooms_needed} rooms</strong>
            ${allBooked ? ' — <strong style="color:#16a34a;">All done! ✅</strong>' : `— ${remaining} remaining`}
          </td>
        </tr>
        <tr>
          <td>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#e5e7eb;border-radius:4px;height:8px;">
              <tr>
                <td width="${Math.round((bookedCount / booking.rooms_needed) * 100)}%"
                    style="background:#1a6fd4;border-radius:4px;height:8px;"></td>
                <td></td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 20px;font-size:15px;color:#6b7280;">
        📅 ${booking.checkin} → ${booking.checkout}<br>
        🏨 ${booking.hotel_name}${booking.city ? ', ' + booking.city : ''}
      </p>
      <a href="https://teamlodgr.com/dashboard.html?token=${encodeURIComponent(booking.share_token)}" style="display:inline-block;background:#f1f5f9;color:#0d1b3e;text-decoration:none;font-size:14px;font-weight:700;padding:10px 18px;border-radius:8px;border:1px solid #e2e8f0;">
        📊 View Full Dashboard →
      </a>
    </td></tr>

    <!-- Footer -->
    <tr><td style="padding-top:20px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:13px;color:#9ca3af;">
        Sent by TeamLodgr · <a href="https://teamlodgr.com" style="color:#9ca3af;">teamlodgr.com</a>
      </p>
    </td></tr>

  </table>
</body>
</html>
  `.trim();

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        from: 'TeamLodgr <bookings@teamlodgr.com>',
        to: [booking.organizer_email],
        subject,
        html,
      }),
    });
    return emailRes.ok;
  } catch (e) {
    console.error('Resend error:', e.message);
    return false;
  }
}

module.exports = async (req, res) => {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, email } = req.body || {};

  if (!token || !email) {
    return res.status(400).json({ error: 'Missing required fields: token, email' });
  }

  try {
    // 1. Look up booking by share token
    const bookings = await supabaseRequest(
      `/bookings?share_token=eq.${encodeURIComponent(token)}&limit=1`,
      'GET'
    );

    if (!bookings.length) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const booking = bookings[0];

    // 2. Find the team member
    const members = await supabaseRequest(
      `/team_members?booking_id=eq.${booking.id}&email=eq.${encodeURIComponent(email)}&limit=1`,
      'GET'
    );

    if (!members.length) {
      return res.status(404).json({ error: 'Team member not found for this booking' });
    }

    const member = members[0];

    // 3. Already booked? Return current progress without re-sending email
    const alreadyBooked = !!member.booked_at;

    if (!alreadyBooked) {
      // Mark booked
      await supabaseRequest(
        `/team_members?id=eq.${member.id}`,
        'PATCH',
        { booked_at: new Date().toISOString() }
      );
    }

    // 4. Get updated booking count
    const allMembers = await supabaseRequest(
      `/team_members?booking_id=eq.${booking.id}&select=email,booked_at,name`,
      'GET'
    );
    const bookedCount  = allMembers.filter(m => m.booked_at).length;
    const totalMembers = allMembers.length;
    const remaining    = Math.max(0, booking.rooms_needed - bookedCount);

    // 5. Send emails (only on new booking)
    let emailSent = false;
    if (!alreadyBooked) {
      // Confirmation to player
      await sendPlayerConfirmationEmail({ email, name: member.name, booking });

      // Notify organizer
      if (booking.organizer_email) {
        emailSent = await sendOrganizerEmail({
          booking,
          bookedCount,
          totalMembers,
          memberEmail: email,
          memberName: member.name || null,
        });
      }
    }

    return res.status(200).json({
      ok: true,
      alreadyBooked,
      emailSent,
      progress: {
        booked: bookedCount,
        total: booking.rooms_needed,
        remaining,
        allBooked: remaining === 0,
      },
    });

  } catch (err) {
    console.error('booked.js error:', err.message);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
};
