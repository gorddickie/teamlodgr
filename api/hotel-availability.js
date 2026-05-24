// api/hotel-availability.js — Check Booking.com availability for a named hotel
// Returns tiered room availability count

const BOOKING_HOST = 'booking-com15.p.rapidapi.com';
const AGODA_HOST   = 'agoda-com.p.rapidapi.com';
const RAPIDAPI_KEY = '3173251728msha891fafe5abe622p17d02fjsn272b51fed579';
const HEADERS_BOOKING = { 'x-rapidapi-host': BOOKING_HOST, 'x-rapidapi-key': RAPIDAPI_KEY };
const HEADERS_AGODA   = { 'x-rapidapi-host': AGODA_HOST,   'x-rapidapi-key': RAPIDAPI_KEY };
const HEADERS = HEADERS_BOOKING; // alias for existing code

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

  try {
    // Step 1: Find destination
    const destRes  = await fetch(`https://${BOOKING_HOST}/api/v1/hotels/searchDestination?query=${encodeURIComponent(city)}`, { headers: HEADERS });
    const destData = await destRes.json();
    const dest     = destData.data?.[0];
    if (!dest) return res.json({ available: false, rooms: null });

    // Step 2: Search hotels in city
    const searchRes  = await fetch(
      `https://${BOOKING_HOST}/api/v1/hotels/searchHotels?dest_id=${dest.dest_id}&search_type=${dest.search_type}&arrival_date=${checkin}&departure_date=${checkout}&adults=2&room_qty=5&currency_code=CAD&sort_by=popularity`,
      { headers: HEADERS }
    );
    const searchData = await searchRes.json();
    const hotels     = searchData.data?.hotels || [];

    // Step 3: Fuzzy match hotel name
    const match = hotels
      .map(h => ({ h, s: fuzzyScore(name, h.property?.name || '') }))
      .filter(x => x.s >= 40)
      .sort((a, b) => b.s - a.s)[0]?.h;

    if (!match) return res.json({ available: false, rooms: null });

    const hotelId = match.hotel_id;

    // Step 4: Check availability at 20 rooms (highest tier)
    const detailRes = await fetch(
      `https://${BOOKING_HOST}/api/v1/hotels/getHotelDetails?hotel_id=${hotelId}&arrival_date=${checkin}&departure_date=${checkout}&adults=2&room_qty=20&currency_code=CAD&languagecode=en-us`,
      { headers: HEADERS }
    ).then(r => r.json()).catch(() => null);

    const data = detailRes?.data;
    let bookingRooms = 0;
    if (data && data.soldout !== 1) {
      bookingRooms = data.rooms_available ?? 20; // assume 20 if not specified but not sold out
    }

    // Step 5: Check Agoda independently
    let agodaRooms = 0;
    try {
      const agodaLocRes = await fetch(
        `https://${AGODA_HOST}/hotels/auto-complete?query=${encodeURIComponent(city)}&locale=en-us`,
        { headers: HEADERS_AGODA }
      ).then(r => r.json());
      const agodaPlace = agodaLocRes?.places?.find(p => p.typeId === 1) || agodaLocRes?.places?.[0];
      if (agodaPlace) {
        const agodaSearch = await fetch(
          `https://${AGODA_HOST}/hotels/search-overnight?id=${agodaPlace.id}&checkinDate=${checkin}&checkoutDate=${checkout}&adults=2&rooms=20&locale=en-us&currency=USD`,
          { headers: HEADERS_AGODA }
        ).then(r => r.json()).catch(() => null);
        const props = agodaSearch?.data?.citySearch?.searchResult?.properties || [];
        const match = props
          .map(p => ({ p, s: fuzzyScore(name, p.name || p.hotelName || '') }))
          .filter(x => x.s >= 40).sort((a, b) => b.s - a.s)[0]?.p;
        if (match) agodaRooms = 20; // Agoda confirmed availability
      }
    } catch (e) { /* Agoda check failed, proceed with Booking.com count only */ }

    const totalRooms = bookingRooms + agodaRooms;
    const needed     = parseInt(rooms) || 1;

    return res.json({
      available:    totalRooms > 0,
      rooms:        totalRooms,
      bookingRooms,
      agodaRooms,
      sufficient:   totalRooms >= needed,
      hotelId,
    });

    return res.json({ available: false, rooms: null });

  } catch (err) {
    console.error('hotel-availability error:', err);
    res.status(500).json({ error: 'Failed' });
  }
};
