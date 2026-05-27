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

        // Expedia: works directly with Expedia property ID
        const expediaDomain = isCA ? 'www.expedia.ca' : 'www.expedia.com';
        links.expedia = `https://${expediaDomain}/h${propertyId}.Hotel-Information?chkin=${checkin}&chkout=${checkout}&rm1=a2`;

        // Hotels.com: needs listing ID (different from Expedia ID)
        // Try to find it via SerpAPI Google search
        const apiKey = process.env.SERPAPI_KEY;
        if (apiKey) {
          try {
            const gParams = new URLSearchParams({
              engine: 'google',
              q: `"${hotelResult.regionNames?.shortName || hotel}" (site:hotels.com OR site:agoda.com)`,
              api_key: apiKey,
              num: 5,
            });
            const gRes = await fetch(`https://serpapi.com/search?${gParams}`);
            const gData = await gRes.json();
            const hotelLink = (gData.organic_results || []).find(r => /hotels\.com\/ho\d+/.test(r.link));
            // Also grab Agoda and Expedia links from Google results
            const agodaLink = (gData.organic_results || []).find(r => /agoda\.com\//.test(r.link) && !/agoda\.com\/$/.test(r.link));
            if (agodaLink) {
              // Append dates to Agoda hotel URL
              const agodaBase = agodaLink.link.split('?')[0];
              links.agoda = `${agodaBase}?checkIn=${checkin}&checkOut=${checkout}&rooms=1&adults=2`;
            }
            if (hotelLink) {
              const idMatch = hotelLink.link.match(/hotels\.com\/ho(\d+)/);
              if (idMatch) {
                const listingId = idMatch[1];
                links.hotels = `https://www.hotels.com/ho${listingId}/?chkin=${checkin}&chkout=${checkout}&q-rooms=1&q-adults-per-room=2`;
              }
            }
          } catch(e) {}
        }
        // Fallback if Google lookup failed
        if (!links.hotels) {
          links.hotels = `https://www.hotels.com/Hotel-Search?destination=${encodeURIComponent((hotelResult.regionNames?.shortName || hotel) + ', ' + city)}&startDate=${checkin}&endDate=${checkout}&adults=2&rooms=1`;
        }
      }
    }

    return res.json({ links, hotelName });

  } catch (e) {
    return res.status(500).json({ error: e.message, links: {} });
  }
};
