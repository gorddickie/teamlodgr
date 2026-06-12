// api/hotel-email.js — scrape hotel website for contact email
// Tries homepage, /contact, /about pages and extracts email addresses

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url param' });

  try {
    const email = await scrapeHotelEmail(url);
    return res.status(200).json({ email: email || null });
  } catch (e) {
    console.error('hotel-email scrape error:', e.message);
    return res.status(200).json({ email: null });
  }
};

async function scrapeHotelEmail(baseUrl) {
  // Normalise base URL
  const base = baseUrl.replace(/\/$/, '');
  const domain = new URL(base).hostname;

  // Skip big chain central sites — they don't have property emails
  const chainDomains = [
    'marriott.com', 'hilton.com', 'ihg.com', 'wyndhamhotels.com',
    'bestwestern.com', 'choicehotels.com', 'hyatt.com', 'accor.com',
    'booking.com', 'expedia.com', 'hotels.com', 'agoda.com',
    'hihostels.ca', 'hihostels.com',
  ];
  if (chainDomains.some(c => domain.includes(c))) {
    return null;
  }

  const pagesToTry = [
    base,
    `${base}/contact`,
    `${base}/contact-us`,
    `${base}/about`,
    `${base}/about-us`,
    `${base}/en/contact`,
  ];

  const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

  // Emails to ignore
  const IGNORE = [
    'example.com', 'domain.com', 'email.com', 'yourdomain',
    'sentry.io', 'schema.org', 'w3.org', 'googleapis.com',
    'wixpress.com', 'squarespace.com',
  ];

  for (const pageUrl of pagesToTry) {
    try {
      const r = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TeamLodgr/1.0)',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(6000),
        redirect: 'follow',
      });
      if (!r.ok) continue;

      const html = await r.text();

      // Extract emails from HTML
      const matches = html.match(EMAIL_RE) || [];
      const emails = matches.filter(e =>
        !IGNORE.some(ig => e.includes(ig)) &&
        !e.includes('.png') &&
        !e.includes('.jpg') &&
        !e.includes('.css') &&
        !e.includes('.js') &&
        e.length < 80
      );

      if (emails.length > 0) {
        // Prefer reservations/bookings/info emails over generic ones
        const preferred = emails.find(e =>
          /reservations?|bookings?|sales|groups?|info|contact|hotel/i.test(e)
        );
        return preferred || emails[0];
      }
    } catch (e) {
      // Timeout or fetch error — try next page
      continue;
    }
  }

  return null;
}
