// api/remind.js — Send reminder emails to unbooked team members
// POST body: { token } — share token (organizer only)
//
// Finds all team members with booked_at = null and resends their booking link

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

async function sendReminderEmail({ member, booking }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;

  const playerLink = `https://teamlodgr.com/book.html?token=${encodeURIComponent(booking.share_token)}&email=${encodeURIComponent(member.email)}`;

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
      <p style="margin:0 0 12px;font-size:17px;color:#111827;line-height:1.5;">
        👋 Hey${member.name ? ' ' + member.name : ''}! Just a reminder — rooms are filling up for <strong>${booking.hotel_name}</strong>.
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">
        📅 ${booking.checkin} → ${booking.checkout}<br>
        ${booking.tournament_name ? `🏆 ${booking.tournament_name}` : ''}
      </p>
      <a href="${playerLink}" style="display:block;background:#0d1b3e;color:#ffffff;text-decoration:none;text-align:center;font-size:18px;font-weight:700;padding:18px 24px;border-radius:8px;">
        Book Your Room →
      </a>
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
        to: [member.email],
        subject: `⏰ Reminder: Book your room at ${booking.hotel_name}`,
        html,
      }),
    });
    return r.ok;
  } catch (e) {
    console.error('Resend error:', e.message);
    return false;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Missing token' });

  try {
    const bookings = await supabaseRequest(
      `/bookings?share_token=eq.${encodeURIComponent(token)}&limit=1`, 'GET'
    );
    if (!bookings.length) return res.status(404).json({ error: 'Booking not found' });
    const booking = bookings[0];

    // Get unbooked members only
    const members = await supabaseRequest(
      `/team_members?booking_id=eq.${booking.id}&booked_at=is.null&select=id,email,name`, 'GET'
    );

    if (!members.length) {
      return res.status(200).json({ ok: true, sent: 0, message: 'Everyone has already booked!' });
    }

    let sent = 0;
    for (const member of members) {
      const ok = await sendReminderEmail({ member, booking });
      if (ok) {
        sent++;
        // Update notified_at
        await supabaseRequest(
          `/team_members?id=eq.${member.id}`, 'PATCH',
          { notified_at: new Date().toISOString() }
        ).catch(() => {});
      }
    }

    return res.status(200).json({ ok: true, sent, total: members.length });
  } catch (err) {
    console.error('remind.js error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
