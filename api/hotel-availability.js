// api/hotel-availability.js — Check availability across Booking.com + Agoda
// Runs both in parallel to stay within Vercel timeout

const BOOKING_HOST = 'booking-com15.p.rapidapi.com';
const AGODA_HOST   = 'agoda-com.p.rapidapi.com';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const HEADERS_BOOKING = { 'x-rapidapi-host': BOOKING_HOST, 'x-rapidapi-key': RAPIDAPI_KEY };
const HEADERS_AGODA   = { 'x-rapidapi-host': AGODA_HOST,   'x-rapidapi-key': RAPIDAPI_KEY };

function fuzzyScore(a, b) {
  const norm = s => (s||'').toLowerCase().replace(/\b(hotel|the|inn|suites|suite|resort|and|by|at)\b/g,'').replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
  const wa = norm(a).split(' ').filter(w=>w.length>2);
  const wb = norm(b).split(' ').filter(w=>w.length>2);
  if (!wa.length || !wb.length) return 0;
  return Math.round((wa.filter(w=>wb.includes(w)).length / Math.max(wa.length,wb.length))*100);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { name, city, checkin, checkout, rooms } = req.query;
  if (!name || !city || !checkin || !checkout) return res.status(400).json({ error: 'Missing params' });
  const needed = parseInt(rooms) || 1;

  // Booking.com's searchDestination chokes on a trailing province/state suffix
  // (e.g. "Halifax, NS" returns []), so query on the primary city token only.
  const cityQuery = String(city).split(',')[0].trim() || city;

  try {
    // Run Booking.com dest lookup + Agoda city lookup in parallel
    const [destRes, agodaLocRes] = await Promise.allSettled([
      fetch(`https://${BOOKING_HOST}/api/v1/hotels/searchDestination?query=${encodeURIComponent(cityQuery)}`, { headers: HEADERS_BOOKING }).then(r => r.json()),
      fetch(`https://${AGODA_HOST}/hotels/auto-complete?query=${encodeURIComponent(cityQuery)}&locale=en-us`, { headers: HEADERS_AGODA }).then(r => r.json()),
    ]);

    // Run Booking.com hotel search + Agoda hotel search in parallel
    const dest = destRes.status === 'fulfilled' ? destRes.value?.data?.[0] : null;
    const agodaPlace = agodaLocRes.status === 'fulfilled'
      ? (agodaLocRes.value?.places?.find(p => p.typeId === 1) || agodaLocRes.value?.places?.[0])
      : null;

    const [bookingSearchRes, agodaSearchRes] = await Promise.allSettled([
      dest ? fetch(
        `https://${BOOKING_HOST}/api/v1/hotels/searchHotels?dest_id=${dest.dest_id}&search_type=${dest.search_type}&arrival_date=${checkin}&departure_date=${checkout}&adults=2&room_qty=${needed}&currency_code=CAD&sort_by=popularity`,
        { headers: HEADERS_BOOKING }
      ).then(r => r.json()) : Promise.resolve(null),
      agodaPlace ? fetch(
        `https://${AGODA_HOST}/hotels/search-overnight?id=${agodaPlace.id}&checkinDate=${checkin}&checkoutDate=${checkout}&adults=2&rooms=${needed}&locale=en-us&currency=USD`,
        { headers: HEADERS_AGODA }
      ).then(r => r.json()) : Promise.resolve(null),
    ]);

    // ── Booking.com match ──
    let bookingRooms = 0;
    if (bookingSearchRes.status === 'fulfilled' && bookingSearchRes.value) {
      const hotels = bookingSearchRes.value?.data?.hotels || [];
      const match = hotels
        .map(h => ({ h, s: fuzzyScore(name, h.property?.name || '') }))
        .filter(x => x.s >= 35)
        .sort((a, b) => b.s - a.s)[0]?.h;
      if (match) bookingRooms = needed; // found in search with room_qty=needed means available
    }

    // ── Agoda match ──
    let agodaRooms = 0;
    if (agodaSearchRes.status === 'fulfilled' && agodaSearchRes.value) {
      const props = agodaSearchRes.value?.data?.citySearch?.searchResult?.properties || [];
      const match = props
        .map(p => ({ p, s: fuzzyScore(name, p.name || p.hotelName || '') }))
        .filter(x => x.s >= 35)
        .sort((a, b) => b.s - a.s)[0]?.p;
      if (match) agodaRooms = needed;
    }

    const totalRooms = bookingRooms + agodaRooms;

    return res.json({
      available:    totalRooms > 0,
      rooms:        totalRooms,
      bookingRooms,
      agodaRooms,
      sufficient:   totalRooms >= needed,
    });

  } catch (err) {
    console.error('hotel-availability error:', err);
    res.status(500).json({ error: 'Failed' });
  }
};
