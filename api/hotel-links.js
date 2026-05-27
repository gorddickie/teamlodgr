// api/hotel-links.js — look up provider-specific hotel URLs via SerpAPI Google Hotels
// Called by book.html to get direct hotel deep links for Hotels.com, Expedia, etc.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { hotel, city, checkin, checkout } = req.query;
  if (!hotel || !city) return res.status(400).json({ error: 'Missing hotel or city' });

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return res.status(500).json({ error: 'SERPAPI_KEY not configured' });

  const params = new URLSearchParams({
    engine:         'google_hotels',
    q:              hotel + ' ' + city,
    check_in_date:  checkin  || '',
    check_out_date: checkout || '',
    adults:         '2',
    rooms:          '1',
    currency:       'CAD',
    gl:             'ca',
    hl:             'en',
    api_key:        apiKey,
  });

  try {
    const r = await fetch(`https://serpapi.com/search?${params}`);
    const data = await r.json();

    const properties = data.properties || [];

    // Find best match by hotel name
    const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    const target = norm(hotel);
    const match = properties.find(p => {
      const score = norm(p.name || '');
      return score.includes(target.slice(0, 12)) || target.includes(score.slice(0, 12));
    }) || properties[0];

    if (!match) return res.json({ links: {} });

    const links = {};
    (match.prices || []).forEach(p => {
      const src = (p.source || '').toLowerCase();
      const url = p.link || null;
      if (!url) return;
      if (src.includes('hotels.com'))  links.hotels  = url;
      if (src.includes('expedia'))     links.expedia = url;
      if (src.includes('agoda'))       links.agoda   = url;
      if (src.includes('booking'))     links.booking = url;
      if (src.includes('priceline'))   links.priceline = url;
    });

    return res.json({ links, hotelName: match.name, debug: { pricesCount: (match.prices||[]).length, serpCount: properties.length } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
