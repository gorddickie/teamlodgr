// TeamLodgr Search — Multi-provider hotel availability
const RAPIDAPI_KEY = '3173251728msha891fafe5abe622p17d02fjsn272b51fed579';
const RAPIDAPI_HOST = 'booking-com15.p.rapidapi.com';
const HEADERS = {
  'x-rapidapi-host': RAPIDAPI_HOST,
  'x-rapidapi-key': RAPIDAPI_KEY,
};

// Providers — each links to that site with dates pre-filled
const PROVIDERS = [
  { name: 'Booking.com',    icon: '🔵', buildUrl: (h, p) => `https://www.booking.com/hotel/${h.countryCode}/${h.id}.html?checkin=${p.checkin}&checkout=${p.checkout}&no_rooms=${p.rooms}&group_adults=2` },
  { name: 'Expedia',        icon: '🟠', buildUrl: (h, p) => `https://www.expedia.ca/Hotel-Search?destination=${encodeURIComponent(h.city)}&startDate=${p.checkin}&endDate=${p.checkout}&rooms=${p.rooms}&adults=2` },
  { name: 'Hotels.com',     icon: '🔴', buildUrl: (h, p) => `https://www.hotels.com/search.do?q-destination=${encodeURIComponent(h.city)}&q-check-in=${p.checkin}&q-check-out=${p.checkout}&q-rooms=${p.rooms}` },
  { name: 'Kayak',          icon: '🟡', buildUrl: (h, p) => `https://www.kayak.com/hotels/${encodeURIComponent(h.city)}/${p.checkin}/${p.checkout}/${p.rooms}rooms/` },
  { name: 'Priceline',      icon: '🟣', buildUrl: (h, p) => `https://www.priceline.com/hotel/search?q=${encodeURIComponent(h.city)}&date_start=${p.checkin}&date_end=${p.checkout}&num_rooms=${p.rooms}` },
  { name: 'Agoda',          icon: '🔷', buildUrl: (h, p) => `https://www.agoda.com/search?city=${h.ufi}&checkIn=${p.checkin}&checkOut=${p.checkout}&rooms=${p.rooms}&adults=2` },
  { name: 'Trivago',        icon: '🟢', buildUrl: (h, p) => `https://www.trivago.ca/?search[destination]=${encodeURIComponent(h.city)}&search[arrivalDate]=${p.checkin}&search[departureDate]=${p.checkout}&search[roomsCount]=${p.rooms}` },
  { name: 'Trip.com',       icon: '🟤', buildUrl: (h, p) => `https://ca.trip.com/hotels/list?cityName=${encodeURIComponent(h.city)}&checkin=${p.checkin}&checkout=${p.checkout}&rooms=${p.rooms}` },
  { name: 'HotelsCombined', icon: '⚪', buildUrl: (h, p) => `https://www.hotelscombined.com/Place/Place?Name=${encodeURIComponent(h.city)}&Arrival=${p.checkin}&Departure=${p.checkout}&Rooms=${p.rooms}` },
  { name: 'Marriott',       icon: '⭐', buildUrl: (h, p) => `https://www.marriott.com/search/default.mi?roomCount=${p.rooms}&fromDate=${p.checkin}&toDate=${p.checkout}&destination=${encodeURIComponent(h.city)}` },
];

let currentParams = {};

const searchForm = document.getElementById('search-form');
const resultsSection = document.getElementById('results-section');
const resultsGrid = document.getElementById('results-grid');
const loadingEl = document.getElementById('loading');

if (searchForm) {
  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const city = document.getElementById('city').value.trim();
    const checkin = document.getElementById('checkin').value;
    const checkout = document.getElementById('checkout').value;
    const rooms = parseInt(document.getElementById('rooms').value);

    if (!city || !checkin || !checkout || !rooms) {
      alert('Please fill in all fields.');
      return;
    }

    currentParams = { city, checkin, checkout, rooms };

    resultsSection.style.display = 'block';
    loadingEl.style.display = 'flex';
    loadingEl.innerHTML = '<div class="spinner"></div> Searching for hotels in ' + city + ' with ' + rooms + ' rooms available...';
    resultsGrid.innerHTML = '';
    resultsSection.scrollIntoView({ behavior: 'smooth' });

    try {
      // Get destination
      const destRes = await fetch(
        `https://${RAPIDAPI_HOST}/api/v1/hotels/searchDestination?query=${encodeURIComponent(city)}`,
        { headers: HEADERS }
      );
      const destData = await destRes.json();
      const dest = destData.data?.[0];
      if (!dest) { showError('City not found. Try a different location.'); return; }

      currentParams.ufi = dest.dest_id;

      // Search hotels
      const searchRes = await fetch(
        `https://${RAPIDAPI_HOST}/api/v1/hotels/searchHotels?dest_id=${dest.dest_id}&search_type=${dest.search_type}&arrival_date=${checkin}&departure_date=${checkout}&adults=2&room_qty=${rooms}&currency_code=CAD&sort_by=popularity`,
        { headers: HEADERS }
      );
      const searchData = await searchRes.json();
      loadingEl.style.display = 'none';

      const hotels = searchData.data?.hotels;
      if (!hotels?.length) { showError('No hotels found. Try different dates or city.'); return; }

      renderHotelList(hotels.slice(0, 5), currentParams);

    } catch (err) {
      showError('Search failed. Please try again.');
      console.error(err);
    }
  });
}

function renderHotelList(hotels, params) {
  resultsGrid.innerHTML = `
    <p class="results-summary">
      Showing hotels in <strong>${params.city}</strong> with <strong>${params.rooms} rooms</strong> available
      &nbsp;·&nbsp; ${params.checkin} → ${params.checkout}
    </p>
  `;

  hotels.forEach((h, i) => {
    const prop = h.property;
    const price = prop.priceBreakdown?.grossPrice?.value
      ? `$${Math.round(prop.priceBreakdown.grossPrice.value)} CAD`
      : 'Check price';
    const rating = prop.reviewScore ? `${prop.reviewScore}/10` : '';
    const reviewWord = prop.reviewScoreWord || '';
    const stars = prop.propertyClass ? '★'.repeat(Math.min(prop.propertyClass, 5)) : '';
    const photo = prop.photoUrls?.[0] || '';

    const hotelInfo = {
      id: h.hotel_id,
      name: prop.name,
      countryCode: prop.countryCode || 'ca',
      city: params.city,
      ufi: params.ufi,
    };

    const card = document.createElement('div');
    card.className = 'hotel-card';
    card.id = `hotel-${h.hotel_id}`;
    card.innerHTML = `
      ${photo ? `<img src="${photo}" alt="${prop.name}" class="hotel-photo" onerror="this.style.display='none'"/>` : ''}
      <div class="hotel-body">
        <div class="hotel-rank-name">
          <span class="hotel-rank">#${i + 1}</span>
          <h3 class="hotel-name">${prop.name}</h3>
          ${stars ? `<span class="hotel-stars">${stars}</span>` : ''}
        </div>
        <div class="hotel-meta">
          ${rating ? `<span>⭐ ${rating} ${reviewWord ? '· ' + reviewWord : ''}</span>` : ''}
          <span>📍 ${params.city}</span>
          <span>🛏️ ${params.rooms} rooms requested</span>
        </div>
        <div class="hotel-price-row">
          <div class="hotel-price">${price}</div>
          <span class="hotel-source">from Booking.com</span>
        </div>
      </div>
      <div class="hotel-actions">
        <button class="btn-show-rooms" id="btn-${h.hotel_id}"
          onclick="toggleRooms(this, ${h.hotel_id}, '${prop.name.replace(/'/g,"\\'")}', '${prop.countryCode || 'ca'}')">
          Show Rooms
        </button>
      </div>
    `;
    resultsGrid.appendChild(card);

    // Placeholder for room panel (inserted after card)
    const panel = document.createElement('div');
    panel.id = `rooms-${h.hotel_id}`;
    panel.className = 'rooms-panel';
    panel.style.display = 'none';
    resultsGrid.appendChild(panel);
  });
}

async function toggleRooms(btn, hotelId, hotelName, countryCode) {
  const panel = document.getElementById(`rooms-${hotelId}`);

  // Toggle off if already open
  if (panel.style.display === 'block') {
    panel.style.display = 'none';
    btn.textContent = 'Show Rooms';
    return;
  }

  btn.textContent = 'Loading...';
  btn.disabled = true;

  const params = currentParams;
  const hotelInfo = {
    id: hotelId,
    name: hotelName,
    countryCode: countryCode,
    city: params.city,
    ufi: params.ufi,
  };

  try {
    // Get hotel details + available room count
    const detailRes = await fetch(
      `https://${RAPIDAPI_HOST}/api/v1/hotels/getHotelDetails?hotel_id=${hotelId}&arrival_date=${params.checkin}&departure_date=${params.checkout}&adults=2&room_qty=${params.rooms}&currency_code=CAD&languagecode=en-us&units=metric`,
      { headers: HEADERS }
    );
    const detailData = await detailRes.json();
    const detail = detailData.data;

    const availableRooms = detail?.available_rooms ?? '?';
    const soldOut = detail?.soldout === 1;
    const address = detail?.address || params.city;
    const pricePerNight = detail?.product_price_breakdown?.gross_amount?.value
      ? `$${Math.round(detail.product_price_breakdown.gross_amount.value)} CAD/night`
      : null;

    // Share link
    const shareUrl = `${window.location.origin}/share.html?hotel=${hotelId}&name=${encodeURIComponent(hotelName)}&checkin=${params.checkin}&checkout=${params.checkout}&rooms=${params.rooms}`;

    panel.innerHTML = `
      <div class="rooms-header">
        <div class="rooms-avail ${soldOut ? 'sold-out' : availableRooms <= 5 ? 'low' : 'good'}">
          ${soldOut
            ? '❌ Sold out on Booking.com for these dates'
            : `✅ ${availableRooms} rooms available on Booking.com`}
        </div>
        <button class="btn-copy-share" onclick="copyShareLink('${shareUrl}', this)">🔗 Share with Team</button>
      </div>

      <p class="rooms-subtext">Book on any of these providers — all link directly to <strong>${hotelName}</strong>:</p>

      <div class="providers-list">
        ${PROVIDERS.map(p => `
          <a href="${p.buildUrl(hotelInfo, params)}" target="_blank" class="provider-row">
            <span class="provider-icon">${p.icon}</span>
            <span class="provider-name">${p.name}</span>
            <span class="provider-rooms">🛏️ Check availability</span>
            <span class="provider-book">Book →</span>
          </a>
        `).join('')}
      </div>
    `;

    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    btn.textContent = 'Hide Rooms';

  } catch (err) {
    panel.innerHTML = `<p style="color:#e74c3c;padding:16px;">Could not load room details. Please try again.</p>`;
    panel.style.display = 'block';
    btn.textContent = 'Show Rooms';
    console.error(err);
  }

  btn.disabled = false;
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
