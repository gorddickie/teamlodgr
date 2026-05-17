// TeamLodgr — Hotel Search API
// Vercel Serverless Function
// Sources: Booking.com (RapidAPI) + Hotelbeds

import crypto from 'crypto';

// ── Booking.com via RapidAPI ──────────────────────────────────────────────────
async function searchBookingCom(city, checkin, checkout, rooms) {
  const headers = {
    'x-rapidapi-host': 'booking-com15.p.rapidapi.com',
    'x-rapidapi-key': process.env.RAPIDAPI_KEY,
    'Content-Type': 'application/json',
  };

  // Step 1: Destination lookup
  const destRes = await fetch(
    `https://booking-com15.p.rapidapi.com/api/v1/hotels/searchDestination?query=${encodeURIComponent(city)}`,
    { headers }
  );
  const destData = await destRes.json();
  const dest = destData.data?.[0];
  if (!dest) return [];

  // Step 2: Hotel search
  const searchRes = await fetch(
    `https://booking-com15.p.rapidapi.com/api/v1/hotels/searchHotels?dest_id=${dest.dest_id}&search_type=${dest.search_type}&arrival_date=${checkin}&departure_date=${checkout}&adults=2&room_qty=${rooms}&units=metric&temperature_unit=c&languagecode=en-us&currency_code=CAD&sort_by=popularity`,
    { headers }
  );
  const searchData = await searchRes.json();
  if (!searchData.data?.hotels) return [];

  return searchData.data.hotels.slice(0, 5).map(h => ({
    id: `bcom_${h.hotel_id}`,
    name: h.property.name,
    rating: h.property.reviewScore ? `${h.property.reviewScore}/10` : 'N/A',
    address: h.property.wishlistName || city,
    availableRooms: h.property.availableRooms ?? parseInt(rooms),
    pricePerNight: h.property.priceBreakdown?.grossPrice?.value
      ? Math.round(h.property.priceBreakdown.grossPrice.value)
      : 'N/A',
    currency: 'CAD',
    source: 'Booking.com',
    photo: h.property.photoUrls?.[0] || null,
    bookingUrl: `https://www.booking.com/hotel/${h.property.countryCode}/${h.hotel_id}.html`,
  }));
}

// ── Hotelbeds ─────────────────────────────────────────────────────────────────
async function searchHotelbeds(city, checkin, checkout, rooms) {
  const API_KEY = process.env.HOTELBEDS_API_KEY;
  const SECRET = process.env.HOTELBEDS_SECRET;
  if (!API_KEY || !SECRET) return [];

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHash('sha256')
    .update(API_KEY + SECRET + timestamp)
    .digest('hex');

  const headers = {
    'Api-Key': API_KEY,
    'X-Signature': signature,
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip',
    'Content-Type': 'application/json',
  };

  const BASE_URL = 'https://api.test.hotelbeds.com'; // swap to api.hotelbeds.com for production

  // Step 1: Destination lookup
  const destRes = await fetch(
    `${BASE_URL}/hotel-content-api/1.0/locations/destinations?fields=all&language=ENG&from=1&to=5&useSecondaryLanguage=false&match=${encodeURIComponent(city)}`,
    { headers }
  );
  const destData = await destRes.json();
  const destination = destData.destinations?.[0];
  if (!destination) return [];

  // Step 2: Availability search
  const numRooms = parseInt(rooms) || 1;
  const occupancies = Array(numRooms).fill({ rooms: 1, adults: 2, children: 0 });

  const searchRes = await fetch(`${BASE_URL}/hotel-api/1.0/hotels`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      stay: { checkIn: checkin, checkOut: checkout },
      occupancies,
      destination: { code: destination.code },
      filter: { maxHotels: 10 },
    }),
  });
  const searchData = await searchRes.json();
  if (!searchData.hotels?.hotels) return [];

  return searchData.hotels.hotels.slice(0, 5).map(h => {
    let cheapestRate = null;
    let totalAllotment = 0;

    h.rooms?.forEach(room => {
      room.rates?.forEach(rate => {
        if (!cheapestRate || rate.net < cheapestRate.net) cheapestRate = rate;
        totalAllotment = Math.max(totalAllotment, rate.allotment || 0);
      });
    });

    return {
      id: `hb_${h.code}`,
      name: h.name,
      rating: h.categoryCode || 'N/A',
      address: `${h.zoneName || ''}, ${destination.name || city}`.trim().replace(/^,\s*/, ''),
      availableRooms: totalAllotment,
      pricePerNight: cheapestRate ? Math.round(parseFloat(cheapestRate.net)) : 'N/A',
      currency: searchData.hotels.currency || 'USD',
      source: 'Hotelbeds',
      photo: null,
      bookingUrl: null,
    };
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { city, checkin, checkout, rooms } = req.query;

  if (!city || !checkin || !checkout || !rooms) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    // Call both sources in parallel
    const [bookingResults, hotelbedsResults] = await Promise.allSettled([
      searchBookingCom(city, checkin, checkout, rooms),
      searchHotelbeds(city, checkin, checkout, rooms),
    ]);

    const booking = bookingResults.status === 'fulfilled' ? bookingResults.value : [];
    const hotelbeds = hotelbedsResults.status === 'fulfilled' ? hotelbedsResults.value : [];

    // Merge and sort by price
    const allHotels = [...booking, ...hotelbeds].sort((a, b) => {
      if (a.pricePerNight === 'N/A') return 1;
      if (b.pricePerNight === 'N/A') return -1;
      return a.pricePerNight - b.pricePerNight;
    });

    return res.status(200).json({ hotels: allHotels });

  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: 'Search failed', details: err.message });
  }
}
