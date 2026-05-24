// api/hotels-search.js — SerpApi Google Hotels proxy
// Keeps the API key server-side

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { city, checkin, checkout, rooms } = req.query;
  if (!city || !checkin || !checkout) return res.status(400).json({ error: 'Missing params' });

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return res.status(500).json({ error: 'SERPAPI_KEY not configured' });

  const params = new URLSearchParams({
    engine:        'google_hotels',
    q:             city + ' hotel',
    check_in_date: checkin,
    check_out_date: checkout,
    adults:        '2',
    rooms:         rooms || '1',
    currency:      'CAD',
    gl:            'ca',
    hl:            'en',
    api_key:       apiKey,
  });

  try {
    const r = await fetch(`https://serpapi.com/search?${params}`);
    const data = await r.json();

    if (!data.properties?.length) return res.json({ hotels: [] });

    // Filter out vacation rentals / private rooms — keep only actual hotels
    const hotelOnly = data.properties.filter(p => {
      const name = (p.name || '').toLowerCase();
      const type = (p.type || '').toLowerCase();
      if (type && !type.includes('hotel') && !type.includes('motel') && !type.includes('resort') && !type.includes('inn') && !type.includes('suite')) return false;
      if (name.includes('private') || name.includes('bedroom') || name.includes('apartment') || name.includes('condo') || name.includes('airbnb') || name.includes('vacation rental')) return false;
      return true;
    });
    const source = hotelOnly.length >= 3 ? hotelOnly : data.properties; // fallback if filter too aggressive
    const hotels = source.slice(0, 10).map(p => ({
      name:        p.name,
      rating:      p.overall_rating,
      reviews:     p.reviews,
      stars:       p.hotel_class,
      photo:       p.images?.[0]?.thumbnail || p.thumbnail,
      lat:         p.gps_coordinates?.latitude,
      lng:         p.gps_coordinates?.longitude,
      pricePerNight: p.rate_per_night?.lowest
        ? Math.round(parseFloat(p.rate_per_night.lowest.replace(/[^0-9.]/g, '')))
        : null,
      currency:    'CAD',
      providers:   (p.prices || []).map(pr => ({
        name:  pr.source,
        price: pr.rate_per_night?.lowest || null,
        url:   pr.link || null,
      })),
      serpLink:    p.link || null,
    }));

    res.json({ hotels });
  } catch (err) {
    console.error('SerpApi error:', err);
    res.status(500).json({ error: 'SerpApi request failed' });
  }
};
