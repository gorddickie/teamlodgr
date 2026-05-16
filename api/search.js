// TeamLodgr — Hotel Search API
// Vercel Serverless Function
// Powered by Booking.com via RapidAPI

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { city, checkin, checkout, rooms } = req.query;

  if (!city || !checkin || !checkout || !rooms) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
  const headers = {
    'x-rapidapi-host': 'booking-com15.p.rapidapi.com',
    'x-rapidapi-key': RAPIDAPI_KEY,
    'Content-Type': 'application/json',
  };

  try {
    // Step 1: Search for destination ID
    const destRes = await fetch(
      `https://booking-com15.p.rapidapi.com/api/v1/hotels/searchDestination?query=${encodeURIComponent(city)}`,
      { headers }
    );
    const destData = await destRes.json();
    const dest = destData.data?.[0];

    if (!dest) {
      return res.status(200).json({ hotels: [] });
    }

    // Step 2: Search hotels
    const searchRes = await fetch(
      `https://booking-com15.p.rapidapi.com/api/v1/hotels/searchHotels?dest_id=${dest.dest_id}&search_type=${dest.search_type}&arrival_date=${checkin}&departure_date=${checkout}&adults=2&room_qty=${rooms}&units=metric&temperature_unit=c&languagecode=en-us&currency_code=CAD&sort_by=popularity`,
      { headers }
    );
    const searchData = await searchRes.json();

    if (!searchData.data?.hotels) {
      return res.status(200).json({ hotels: [] });
    }

    // Step 3: Format top 5 results
    const hotels = searchData.data.hotels.slice(0, 5).map(h => ({
      id: h.hotel_id,
      name: h.property.name,
      rating: h.property.reviewScore ? `${h.property.reviewScore}/10` : 'N/A',
      address: h.property.wishlistName || city,
      availableRooms: parseInt(rooms),
      pricePerNight: h.property.priceBreakdown?.grossPrice?.value
        ? Math.round(h.property.priceBreakdown.grossPrice.value)
        : 'N/A',
      currency: 'CAD',
      source: 'Booking.com',
      photo: h.property.photoUrls?.[0] || null,
      bookingUrl: `https://www.booking.com/hotel/${h.property.countryCode}/${h.hotel_id}.html`,
    }));

    return res.status(200).json({ hotels });

  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: 'Search failed', details: err.message });
  }
}
