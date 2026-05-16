// TeamLodgr — Hotel Search API
// Vercel Serverless Function
// Powered by Amadeus Hotel Search API

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { city, checkin, checkout, rooms } = req.query;

  if (!city || !checkin || !checkout || !rooms) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    // Step 1: Get Amadeus access token
    const tokenRes = await fetch('https://test.api.amadeus.com/v1/security/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.AMADEUS_API_KEY,
        client_secret: process.env.AMADEUS_API_SECRET,
      }),
    });
    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;

    // Step 2: Search hotels by city
    const hotelListRes = await fetch(
      `https://test.api.amadeus.com/v1/reference-data/locations/hotels/by-city?cityCode=${encodeURIComponent(city)}&radius=20&radiusUnit=KM&hotelSource=ALL`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const hotelList = await hotelListRes.json();
    const hotelIds = hotelList.data?.slice(0, 20).map(h => h.hotelId).join(',');

    if (!hotelIds) {
      return res.status(200).json({ hotels: [] });
    }

    // Step 3: Get offers/pricing
    const offersRes = await fetch(
      `https://test.api.amadeus.com/v3/shopping/hotel-offers?hotelIds=${hotelIds}&adults=1&checkInDate=${checkin}&checkOutDate=${checkout}&roomQuantity=${rooms}&currency=CAD&bestRateOnly=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const offersData = await offersRes.json();

    if (!offersData.data) {
      return res.status(200).json({ hotels: [] });
    }

    // Step 4: Format and return top 5
    const hotels = offersData.data
      .filter(h => h.available)
      .slice(0, 5)
      .map(h => ({
        id: h.hotel.hotelId,
        name: h.hotel.name,
        rating: h.hotel.rating,
        address: h.hotel.address?.lines?.[0] || city,
        availableRooms: parseInt(rooms),
        pricePerNight: parseFloat(h.offers?.[0]?.price?.total || 0).toFixed(0),
        currency: h.offers?.[0]?.price?.currency || 'CAD',
        source: 'Amadeus',
        bookingUrl: `https://amadeus.com/hotel/${h.hotel.hotelId}`,
      }));

    return res.status(200).json({ hotels });

  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: 'Search failed', details: err.message });
  }
}
