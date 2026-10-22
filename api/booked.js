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

      <p style="margin:0 0 8px;font-size:15px;color:#6b7280;">
        📅 ${booking.checkin} → ${booking.checkout}<br>
        🏨 ${booking.hotel_name}${booking.city ? ', ' + booking.city : ''}
      </p>
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

    // 5. Email organizer (only if this is a new booking, and organizer email exists)
    let emailSent = false;
    if (!alreadyBooked && booking.organizer_email) {
      emailSent = await sendOrganizerEmail({
        booking,
        bookedCount,
        totalMembers,
        memberEmail: email,
        memberName: member.name || null,
      });
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
