// api/confirm.js — Vercel serverless function
// Called when the organizer clicks the confirmation link in their email.
// Looks up the pending booking, fires team member invite emails, marks booking as confirmed.

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
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const confirmToken = req.method === 'GET'
    ? req.query.token
    : req.body?.token;

  if (!confirmToken) {
    return res.status(400).send('Missing confirmation token.');
  }

  // Look up the booking by confirm_token
  let bookings;
  try {
    bookings = await supabaseRequest(
      `/bookings?confirm_token=eq.${encodeURIComponent(confirmToken)}&select=*`,
      'GET'
    );
  } catch (e) {
    console.error('Supabase lookup error:', e.message);
    return res.status(500).send('Database error. Please try again.');
  }

  if (!bookings || bookings.length === 0) {
    return res.status(404).send('Confirmation link not found or already used.');
  }

  const booking = bookings[0];

  // Check if already confirmed
  if (booking.confirmed_at) {
    // Already confirmed — redirect to confirmed page
    return res.redirect(302, `https://teamlodgr.com/confirmed.html?token=${encodeURIComponent(booking.share_token)}&alreadySent=1`);
  }

  // Mark booking as confirmed
  try {
    await supabaseRequest(
      `/bookings?id=eq.${booking.id}`,
      'PATCH',
      { confirmed_at: new Date().toISOString() }
    );
  } catch (e) {
    console.error('Supabase confirm update error:', e.message);
    return res.status(500).send('Could not confirm booking. Please try again.');
  }

  // Fetch team members for this booking
  let members;
  try {
    members = await supabaseRequest(
      `/team_members?booking_id=eq.${booking.id}&select=email,name`,
      'GET'
    );
  } catch (e) {
    console.error('Supabase members fetch error:', e.message);
    return res.status(500).send('Could not load team members.');
  }

  // Send team member invite emails via /api/notify
  if (members && members.length > 0) {
    try {
      const notifyRes = await fetch('https://teamlodgr.com/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          shareToken: booking.share_token,
          members,
          hotelName: booking.hotel_name,
          hotelPhoto: booking.hotel_photo || null,
          checkin: booking.checkin,
          checkout: booking.checkout,
          shareUrl: `https://teamlodgr.com/book.html?token=${booking.share_token}`,
          tournamentName: booking.tournament_name || null,
          organizerName: booking.organizer_name || null,
          organizerEmail: booking.organizer_email || null,
          providers: booking.providers || [],
          baseUrl: 'https://teamlodgr.com',
        }),
      });
      if (!notifyRes.ok) {
        console.error('Notify API error:', await notifyRes.text());
      }
    } catch (e) {
      console.error('Notify fetch error:', e.message);
    }
  }

  // Redirect organizer to confirmed page
  return res.redirect(302,
    `https://teamlodgr.com/confirmed.html?token=${encodeURIComponent(booking.share_token)}&sent=${members?.length || 0}`
  );
};
