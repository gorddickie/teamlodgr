// TeamLodgr — Hotelbeds Availability API
// Vercel Serverless Function

import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { city, checkin, checkout, rooms } = req.query;

  if (!city || !checkin || !checkout || !rooms) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const API_KEY = process.env.HOTELBEDS_API_KEY;
  const SECRET = process.env.HOTELBEDS_SECRET;

  if (!API_KEY || !SECRET) {
    return res.status(500).json({ error: 'Hotelbeds credentials not configured' });
  }

  // Generate HMAC-SHA256 signature
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

  // Hotelbeds sandbox base URL (switch to api.hotelbeds.com for production)
  const BASE_URL = 'https://api.test.hotelbeds.com';

  // lat/lng passed from the frontend (from Booking.com search result)
  const { lat, lng } = req.query;

  try {
    // Search by geolocation — more reliable than destination code lookup
    const numRooms = parseInt(rooms) || 1;
    const occupancies = Array(numRooms).fill({ rooms: 1, adults: 2, children: 0 });

    const searchBody = lat && lng ? {
      stay: { checkIn: checkin, checkOut: checkout },
      occupancies,
      geolocation: { latitude: parseFloat(lat), longitude: parseFloat(lng), radius: 20, unit: 'km' },
      filter: { maxHotels: 20 },
    } : null;

    if (!searchBody) return res.status(200).json({ hotels: [] });

    const searchRes = await fetch(`${BASE_URL}/hotel-api/1.0/hotels`, {
      method: 'POST',
      headers,
      body: JSON.stringify(searchBody),
    });

    const searchData = await searchRes.json();

    if (!searchData.hotels?.hotels) {
      return res.status(200).json({ hotels: [] });
    }

    // Format results
    const hotels = searchData.hotels.hotels.slice(0, 20).map(h => {
      // Find cheapest rate and its allotment
      let cheapestRate = null;
      let totalAllotment = 0;

      h.rooms?.forEach(room => {
        room.rates?.forEach(rate => {
          if (!cheapestRate || rate.net < cheapestRate.net) {
            cheapestRate = rate;
          }
          totalAllotment = Math.max(totalAllotment, rate.allotment || 0);
        });
      });

      return {
        id: h.code,
        name: h.name,
        rating: h.categoryCode || 'N/A',
        address: `${h.zoneName || ''}, ${city}`.trim().replace(/^,\s*/, ''),
        availableRooms: totalAllotment,
        pricePerNight: cheapestRate ? Math.round(parseFloat(cheapestRate.net)) : 'N/A',
        currency: searchData.hotels.currency || 'USD',
        source: 'Hotelbeds',
        photo: null, // Hotelbeds photos come from Content API separately
        bookingUrl: null, // Direct booking handled via Hotelbeds booking flow
      };
    });

    return res.status(200).json({ hotels });

  } catch (err) {
    console.error('Hotelbeds error:', err);
    return res.status(500).json({ error: 'Hotelbeds search failed', details: err.message });
  }
}
