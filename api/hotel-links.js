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
    const regionRes = await fetch(
      `https://hotels-com-provider.p.rapidapi.com/v2/regions?locale=en_CA&domain=CA&query=${encodeURIComponent(hotel + ' ' + city)}`,
      { headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': 'hotels-com-provider.p.rapidapi.com' } }
    );
    const regionData = await regionRes.json();
    const hotelResult = (regionData.data || []).find(r => r['@type'] === 'gaiaHotelResult' || r.type === 'HOTEL');

    if (hotelResult) {
      const propertyId = hotelResult.hotelId || hotelResult.essId?.sourceId;
      hotelName = hotelResult.regionNames?.shortName || hotel;

      if (propertyId) {
        // Build direct hotel page URLs using property ID
        const isCA = /\b(nb|ns|on|bc|ab|qc|mb|sk|nl|pe|nt|nu|yt|canada|moncton|halifax|toronto|vancouver|calgary|montreal|ottawa)\b/i.test(city);

        // Hotels.com direct property URL
        const hotelsBase = `https://www.hotels.com/ho${propertyId}/?q-check-in=${checkin}&q-check-out=${checkout}&q-rooms=1&q-adults-per-room=2`;
        links.hotels = hotelsBase;

        // Expedia direct property URL
        const expediaSlug = hotelName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const expediaBase = isCA
          ? `https://www.expedia.ca/h${propertyId}.Hotel-Information?chkin=${checkin}&chkout=${checkout}&rm1=a2&regionId=${propertyId}`
          : `https://www.expedia.com/h${propertyId}.Hotel-Information?chkin=${checkin}&chkout=${checkout}&rm1=a2`;
        links.expedia = expediaBase;
      }
    }

    return res.json({ links, hotelName });

  } catch (e) {
    return res.status(500).json({ error: e.message, links: {} });
  }
};
