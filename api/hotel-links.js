// api/hotel-links.js — look up provider-specific hotel IDs and URLs
// Uses hotels-com-provider RapidAPI to get Hotels.com/Expedia property IDs
// Falls back to SerpAPI Google Hotels if needed

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || '3173251728msha891fafe5abe622p17d02fjsn272b51fed579';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { hotel, city, checkin, checkout } = req.query;
  if (!hotel || !city) return res.status(400).json({ error: 'Missing hotel or city' });

  const links = {};
  let hotelName = hotel;

  try {
    // ── Step 1: Hotels.com/Expedia property lookup via hotels-com-provider ──
    // Try progressively shorter name variants until we get a match
    const words = hotel.split(/\s+/);
    const cityInName = hotel.toLowerCase().includes(city.toLowerCase().split(/\s+/)[0]);
    let hotelResult = null;
    // Try progressively shorter name variants (don't append city if already in name)
    for (let len = words.length; len >= 2 && !hotelResult; len--) {
      const namePart = words.slice(0, len).join(' ');
      const query = cityInName ? namePart : (namePart + ' ' + city);
      const regionRes = await fetch(
        `https://hotels-com-provider.p.rapidapi.com/v2/regions?locale=en_CA&domain=CA&query=${encodeURIComponent(query)}`,
        { headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': 'hotels-com-provider.p.rapidapi.com' } }
      );
      const regionData = await regionRes.json();
      const match = (regionData.data || []).find(r => r['@type'] === 'gaiaHotelResult');
      if (match) hotelResult = match;
    }

    if (hotelResult) {
      const propertyId = hotelResult.hotelId || hotelResult.essId?.sourceId;
      hotelName = hotelResult.regionNames?.shortName || hotel;

      if (propertyId) {
        // Build direct hotel page URLs using property ID
        const isCA = /\b(nb|ns|on|bc|ab|qc|mb|sk|nl|pe|nt|nu|yt|canada|moncton|halifax|toronto|vancouver|calgary|montreal|ottawa)\b/i.test(city);
        const toSlug = s => s.replace(/[^a-zA-Z0-9\s]/g,' ').split(/\s+/).filter(Boolean).map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join('-');
        const slug = toSlug(hotelResult.regionNames?.shortName || hotel);
        const citySlug = toSlug(city);

        // Hotels.com: use ca.hotels.com for Canadian properties
        const hotelsDomain = isCA ? 'ca.hotels.com' : 'www.hotels.com';
        links.hotels = `https://${hotelsDomain}/ho${propertyId}/?q-check-in=${checkin}&q-check-out=${checkout}&q-rooms=1&q-adults-per-room=2`;

        // Expedia: use expedia.ca for Canadian properties
        const expediaDomain = isCA ? 'www.expedia.ca' : 'www.expedia.com';
        links.expedia = `https://${expediaDomain}/h${propertyId}.Hotel-Information?chkin=${checkin}&chkout=${checkout}&rm1=a2`;
      }
    }

    return res.json({ links, hotelName });

  } catch (e) {
    return res.status(500).json({ error: e.message, links: {} });
  }
};
