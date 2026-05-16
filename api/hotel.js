// TeamLodgr — Single Hotel Detail API
// Used by share.html to show live availability

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { id, checkin, checkout, rooms } = req.query;

  if (!id || !checkin || !checkout || !rooms) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const tokenRes = await fetch('https://test.api.amadeus.com/v1/security/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.AMADEUS_API_KEY,
        client_secret: process.env.AMADEUS_API_SECRET,
      }),
    });
    const { access_token } = await tokenRes.json();

    const offersRes = await fetch(
      `https://test.api.amadeus.com/v3/shopping/hotel-offers?hotelIds=${id}&adults=1&checkInDate=${checkin}&checkOutDate=${checkout}&roomQuantity=${rooms}&currency=CAD`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    const data = await offersRes.json();
    const hotel = data.data?.[0];

    if (!hotel) return res.status(404).json({ error: 'Hotel not found' });

    return res.status(200).json({
      id: hotel.hotel.hotelId,
      name: hotel.hotel.name,
      rating: hotel.hotel.rating,
      address: hotel.hotel.address?.lines?.[0],
      availableRooms: parseInt(rooms),
      pricePerNight: parseFloat(hotel.offers?.[0]?.price?.total || 0).toFixed(0),
      source: 'Amadeus',
      bookingUrl: hotel.offers?.[0]?.links?.self || '#',
      available: hotel.available,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
