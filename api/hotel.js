// TeamLodgr — Single Hotel Detail API
// Used by share.html for live availability

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { id, checkin, checkout, rooms } = req.query;

  if (!id || !checkin || !checkout) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const headers = {
    'x-rapidapi-host': 'booking-com15.p.rapidapi.com',
    'x-rapidapi-key': process.env.RAPIDAPI_KEY,
    'Content-Type': 'application/json',
  };

  try {
    const res2 = await fetch(
      `https://booking-com15.p.rapidapi.com/api/v1/hotels/getHotelDetails?hotel_id=${id}&arrival_date=${checkin}&departure_date=${checkout}&adults=2&room_qty=${rooms}&units=metric&languagecode=en-us&currency_code=CAD`,
      { headers }
    );
    const data = await res2.json();
    const hotel = data.data;

    if (!hotel) return res.status(404).json({ error: 'Hotel not found' });

    return res.status(200).json({
      id: hotel.hotel_id,
      name: hotel.hotel_name,
      rating: hotel.review_score ? `${hotel.review_score}/10` : 'N/A',
      address: hotel.address,
      availableRooms: parseInt(rooms) || 1,
      pricePerNight: hotel.composite_price_breakdown?.gross_amount?.value
        ? Math.round(hotel.composite_price_breakdown.gross_amount.value)
        : 'N/A',
      source: 'Booking.com',
      bookingUrl: hotel.url || `https://www.booking.com/hotel/${hotel.hotel_id}.html`,
      available: true,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
