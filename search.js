// TeamLodgr Search — Multi-provider inline availability
const RAPIDAPI_KEY = '3173251728msha891fafe5abe622p17d02fjsn272b51fed579';
const BOOKING_HOST = 'booking-com15.p.rapidapi.com';
const SKY_HOST = 'sky-scrapper.p.rapidapi.com';
const PRICELINE_HOST = 'priceline-com-provider.p.rapidapi.com';
const HEADERS_BOOKING  = { 'x-rapidapi-host': BOOKING_HOST,   'x-rapidapi-key': RAPIDAPI_KEY };
const HEADERS_SKY      = { 'x-rapidapi-host': SKY_HOST,        'x-rapidapi-key': RAPIDAPI_KEY };
const HEADERS_PRICELINE= { 'x-rapidapi-host': PRICELINE_HOST,  'x-rapidapi-key': RAPIDAPI_KEY };

let currentParams = {};

const searchForm    = document.getElementById('search-form');
const resultsSection= document.getElementById('results-section');
const resultsGrid   = document.getElementById('results-grid');
const loadingEl     = document.getElementById('loading');

if (searchForm) {
  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const city    = document.getElementById('city').value.trim();
    const checkin = document.getElementById('checkin').value;
    const checkout= document.getElementById('checkout').value;
    const rooms   = parseInt(document.getElementById('rooms').value);

    if (!city || !checkin || !checkout || !rooms) { alert('Please fill in all fields.'); return; }

    currentParams = { city, checkin, checkout, rooms };

    resultsSection.style.display = 'block';
    loadingEl.style.display = 'flex';
    loadingEl.innerHTML = '<div class="spinner"></div> Searching hotels in ' + city + '...';
    resultsGrid.innerHTML = '';
    resultsSection.scrollIntoView({ behavior: 'smooth' });

    try {
      // Get all destination IDs in parallel
      const [bookingDest, skyDest, pricelineDest] = await Promise.all([
        fetch(`https://${BOOKING_HOST}/api/v1/hotels/searchDestination?query=${encodeURIComponent(city)}`, { headers: HEADERS_BOOKING }).then(r=>r.json()).catch(()=>({})),
        fetch(`https://${SKY_HOST}/api/v1/flights/searchAirport?query=${encodeURIComponent(city)}&locale=en-US`, { headers: HEADERS_SKY }).then(r=>r.json()).catch(()=>({})),
        fetch(`https://${PRICELINE_HOST}/v1/hotels/locations?name=${encodeURIComponent(city)}&search_type=ALL`, { headers: HEADERS_PRICELINE }).then(r=>r.json()).catch(()=>({}))
      ]);

      const dest = bookingDest.data?.[0];
      if (!dest) { showError('City not found. Try a different location.'); return; }

      currentParams.ufi             = dest.dest_id;
      currentParams.searchType      = dest.search_type;
      currentParams.skyEntityId     = skyDest.data?.[0]?.navigation?.relevantHotelParams?.entityId || null;
      currentParams.pricelineLocId  = Array.isArray(pricelineDest) ? pricelineDest[0]?.id : null;

      // Search Booking.com hotels
      loadingEl.innerHTML = '<div class="spinner"></div> Finding hotels with availability...';
      const searchRes = await fetch(
        `https://${BOOKING_HOST}/api/v1/hotels/searchHotels?dest_id=${dest.dest_id}&search_type=${dest.search_type}&arrival_date=${checkin}&departure_date=${checkout}&adults=2&room_qty=${rooms}&currency_code=CAD&sort_by=popularity`,
        { headers: HEADERS_BOOKING }
      );
      const searchData = await searchRes.json();
      const hotels = searchData.data?.hotels?.slice(0, 5);

      if (!hotels?.length) { showError('No hotels found. Try different dates or city.'); return; }

      loadingEl.style.display = 'none';

      // Render skeleton cards immediately
      renderSkeletonCards(hotels, currentParams);

      // Then fetch provider details for all hotels in parallel
      hotels.forEach(h => loadProviderData(h, currentParams));

    } catch (err) {
      showError('Search failed. Please try again.');
      console.error(err);
    }
  });
}

function renderSkeletonCards(hotels, params) {
  resultsGrid.innerHTML = `<p class="results-summary">
    Found hotels in <strong>${params.city}</strong> &nbsp;·&nbsp;
    ${formatDate(params.checkin)} → ${formatDate(params.checkout)} &nbsp;·&nbsp;
    ${params.rooms} rooms requested
  </p>`;

  hotels.forEach((h, i) => {
    const prop  = h.property;
    const price = prop.priceBreakdown?.grossPrice?.value ? `$${Math.round(prop.priceBreakdown.grossPrice.value)} CAD` : '';
    const rating= prop.reviewScore ? `${prop.reviewScore}/10` : '';
    const stars = prop.propertyClass ? '★'.repeat(Math.min(prop.propertyClass, 5)) : '';
    const photo = prop.photoUrls?.[0] || '';

    const card = document.createElement('div');
    card.className = 'hotel-card';
    card.id = `hotel-card-${h.hotel_id}`;
    card.innerHTML = `
      ${photo ? `<img src="${photo}" alt="${prop.name}" class="hotel-photo" onerror="this.style.display='none'"/>` : ''}
      <div class="hotel-body">
        <div class="hotel-rank-name">
          <span class="hotel-rank">#${i+1}</span>
          <h3 class="hotel-name">${prop.name}</h3>
          ${stars ? `<span class="hotel-stars">${stars}</span>` : ''}
        </div>
        <div class="hotel-meta">
          ${rating ? `<span>⭐ ${rating} · ${prop.reviewScoreWord||''}</span>` : ''}
          <span>📍 ${params.city}</span>
        </div>

        <div class="providers-table" id="providers-${h.hotel_id}">
          <div class="provider-loading">
            <div class="spinner-sm"></div> Loading availability from all booking sites...
          </div>
        </div>

        <div class="share-row" style="margin-top:12px;">
          <button class="btn-copy-share" onclick="copyShareLink('${window.location.origin}/share.html?hotel=${h.hotel_id}&name=${encodeURIComponent(prop.name)}&checkin=${params.checkin}&checkout=${params.checkout}&rooms=${params.rooms}', this)">
            🔗 Share with Team
          </button>
        </div>
      </div>
    `;
    resultsGrid.appendChild(card);
  });
}

async function loadProviderData(h, params) {
  const container = document.getElementById(`providers-${h.hotel_id}`);

  try {
    // Fetch Booking.com details + Priceline + Skyscanner in parallel
    const [bookingDetail, skyResults, plResults] = await Promise.all([
      fetch(`https://${BOOKING_HOST}/api/v1/hotels/getHotelDetails?hotel_id=${h.hotel_id}&arrival_date=${params.checkin}&departure_date=${params.checkout}&adults=2&room_qty=${params.rooms}&currency_code=CAD&languagecode=en-us&units=metric`,
        { headers: HEADERS_BOOKING }).then(r=>r.json()).catch(()=>({})),

      params.skyEntityId ? fetch(`https://${SKY_HOST}/api/v1/hotels/searchHotels?entityId=${params.skyEntityId}&checkin=${params.checkin}&checkout=${params.checkout}&adults=2&rooms=${params.rooms}&currency=CAD&countryCode=CA&market=en-CA`,
        { headers: HEADERS_SKY }).then(r=>r.json()).catch(()=>({})) : Promise.resolve({}),

      params.pricelineLocId ? fetch(`https://${PRICELINE_HOST}/v1/hotels/search?location_id=${params.pricelineLocId}&date_checkin=${params.checkin}&date_checkout=${params.checkout}&sort_order=PRICE&rooms_number=${params.rooms}&adults_number=2&limit=20`,
        { headers: HEADERS_PRICELINE }).then(r=>r.json()).catch(()=>({})) : Promise.resolve({})
    ]);

    const detail      = bookingDetail.data || {};
    const bookingRooms= detail.available_rooms ?? null;
    const bookingSold = detail.soldout === 1;
    const bookingPrice= detail.product_price_breakdown?.gross_amount?.value
      ? `$${Math.round(detail.product_price_breakdown.gross_amount.value)} CAD`
      : null;

    // Match in Skyscanner
    const skyHotels = skyResults?.data?.hotels || [];
    const skyMatch  = skyHotels.find(sh =>
      sh.name?.toLowerCase().includes(h.property.name.split(' ')[0].toLowerCase())
    );
    const skyPrice  = skyMatch?.price || null;

    // Match in Priceline
    const plHotels  = plResults?.hotels || [];
    const plMatch   = plHotels.find(ph =>
      ph.name?.toLowerCase().includes(h.property.name.split(' ')[0].toLowerCase())
    );
    const plPrice   = plMatch?.ratesSummary?.minPrice
      ? `$${Math.round(plMatch.ratesSummary.minPrice)} USD`
      : null;

    const hotelInfo = {
      id: h.hotel_id,
      name: h.property.name,
      countryCode: h.property.countryCode || 'ca',
      city: params.city,
      ufi: params.ufi,
    };

    // Build provider rows
    const providers = [
      {
        icon: '🔵', name: 'Booking.com',
        rooms: bookingSold ? '❌ Sold out' : bookingRooms !== null ? `${bookingRooms} ${bookingRooms === 1 ? 'room' : 'rooms'} available` : 'Check site',
        roomsClass: bookingSold ? 'sold' : bookingRooms !== null ? 'avail' : '',
        price: bookingPrice,
        url: `https://www.booking.com/hotel/${hotelInfo.countryCode}/${h.hotel_id}.html?checkin=${params.checkin}&checkout=${params.checkout}&no_rooms=${params.rooms}&group_adults=2`
      },
      {
        icon: '🟣', name: 'Priceline',
        rooms: plMatch ? 'Available' : 'Check site',
        roomsClass: plMatch ? 'avail' : '',
        price: plPrice,
        url: `https://www.priceline.com/hotel/search?q=${encodeURIComponent(params.city)}&date_start=${params.checkin}&date_end=${params.checkout}&num_rooms=${params.rooms}`
      },
      {
        icon: '🟡', name: 'Kayak',
        rooms: skyMatch ? 'Available' : 'Check site',
        roomsClass: skyMatch ? 'avail' : '',
        price: skyPrice,
        url: `https://www.kayak.com/hotels/${encodeURIComponent(params.city)}/${params.checkin}/${params.checkout}/${params.rooms}rooms/`
      },
      {
        icon: '🟠', name: 'Expedia',
        rooms: 'Check site', roomsClass: '', price: null,
        url: `https://www.expedia.ca/Hotel-Search?destination=${encodeURIComponent(params.city)}&startDate=${params.checkin}&endDate=${params.checkout}&rooms=${params.rooms}&adults=2`
      },
      {
        icon: '🔴', name: 'Hotels.com',
        rooms: 'Check site', roomsClass: '', price: null,
        url: `https://www.hotels.com/search.do?q-destination=${encodeURIComponent(params.city)}&q-check-in=${params.checkin}&q-check-out=${params.checkout}&q-rooms=${params.rooms}`
      },
      {
        icon: '🟢', name: 'Trivago',
        rooms: 'Check site', roomsClass: '', price: null,
        url: `https://www.trivago.ca/?search[destination]=${encodeURIComponent(params.city)}&search[arrivalDate]=${params.checkin}&search[departureDate]=${params.checkout}&search[roomsCount]=${params.rooms}`
      },
      {
        icon: '🔷', name: 'Agoda',
        rooms: 'Check site', roomsClass: '', price: null,
        url: `https://www.agoda.com/search?city=${params.ufi}&checkIn=${params.checkin}&checkOut=${params.checkout}&rooms=${params.rooms}&adults=2`
      },
      {
        icon: '🟤', name: 'Trip.com',
        rooms: 'Check site', roomsClass: '', price: null,
        url: `https://ca.trip.com/hotels/list?cityName=${encodeURIComponent(params.city)}&checkin=${params.checkin}&checkout=${params.checkout}&rooms=${params.rooms}`
      },
      {
        icon: '⭐', name: 'Marriott',
        rooms: 'Check site', roomsClass: '', price: null,
        url: `https://www.marriott.com/search/default.mi?roomCount=${params.rooms}&fromDate=${params.checkin}&toDate=${params.checkout}&destination=${encodeURIComponent(params.city)}`
      },
      {
        icon: '⚪', name: 'Hilton',
        rooms: 'Check site', roomsClass: '', price: null,
        url: `https://www.hilton.com/en/search/?query=${encodeURIComponent(params.city)}&arrivalDate=${params.checkin}&departureDate=${params.checkout}&numRooms=${params.rooms}`
      },
    ];

    container.innerHTML = `
      <div class="providers-header">
        <span>Booking Site</span>
        <span>Dates</span>
        <span>Rooms</span>
        <span>Price/night</span>
        <span></span>
      </div>
      ${providers.map(p => `
        <div class="provider-row">
          <span class="provider-name">${p.icon} ${p.name}</span>
          <span class="provider-dates">${formatDate(params.checkin)} → ${formatDate(params.checkout)}</span>
          <span class="provider-rooms ${p.roomsClass}">${p.rooms}</span>
          <span class="provider-price">${p.price || '—'}</span>
          <a href="${p.url}" target="_blank" class="btn-book-sm">Book →</a>
        </div>
      `).join('')}
    `;

  } catch (err) {
    container.innerHTML = `<p style="color:#e74c3c;font-size:0.85rem;padding:10px 0;">Could not load availability. <a href="https://www.booking.com" target="_blank">Try Booking.com directly</a></p>`;
    console.error(err);
  }
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

function copyShareLink(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    btn.textContent = '✅ Copied!';
    setTimeout(() => btn.textContent = '🔗 Share with Team', 2500);
    showToast('Share link copied! Send it to your team 🎉');
  });
}

function showError(msg) {
  loadingEl.style.display = 'none';
  resultsGrid.innerHTML = `<p style="color:#e74c3c;padding:20px 0;font-weight:600;">${msg}</p>`;
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
