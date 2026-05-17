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

  try {
    // Step 1: Find destination using Hotel Content API
    const destRes = await fetch(
      `${BASE_URL}/hotel-content-api/1.0/locations/destinations?fields=all&language=ENG&from=1&to=5&useSecondaryLanguage=false&match=${encodeURIComponent(city)}`,
      { headers }
    );
    const destData = await destRes.json();
    const destination = destData.destinations?.[0];

    if (!destination) {
      return res.status(200).json({ hotels: [] });
    }

    // Step 2: Search availability
    const numRooms = parseInt(rooms) || 1;
    const occupancies = Array(numRooms).fill({ rooms: 1, adults: 2, children: 0 });

    const searchRes = await fetch(`${BASE_URL}/hotel-api/1.0/hotels`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        stay: {
          checkIn: checkin,
          checkOut: checkout,
        },
        occupancies,
        destination: {
          code: destination.code,
        },
        filter: {
          maxHotels: 10,
        },
      }),
    });

    const searchData = await searchRes.json();

    if (!searchData.hotels?.hotels) {
      return res.status(200).json({ hotels: [] });
    }

    // Step 3: Format results
    const hotels = searchData.hotels.hotels.slice(0, 5).map(h => {
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
        address: `${h.zoneName || ''}, ${destination.name || city}`.trim().replace(/^,\s*/, ''),
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
