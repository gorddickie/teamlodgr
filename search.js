// TeamLodgr Search — Live hotel search with multi-site availability
const RAPIDAPI_KEY = '3173251728msha891fafe5abe622p17d02fjsn272b51fed579';
const RAPIDAPI_HOST = 'booking-com15.p.rapidapi.com';
const HEADERS = {
  'x-rapidapi-host': RAPIDAPI_HOST,
  'x-rapidapi-key': RAPIDAPI_KEY,
  'Content-Type': 'application/json'
};

// Booking sites to check for each hotel
const BOOKING_SITES = [
  { name: 'Booking.com',  icon: '🔵', buildUrl: (h, p) => `https://www.booking.com/hotel/${h.countryCode}/${h.id}.html?checkin=${p.checkin}&checkout=${p.checkout}&no_rooms=${p.rooms}&group_adults=2` },
  { name: 'Expedia',      icon: '🟠', buildUrl: (h, p) => `https://www.expedia.ca/h${h.id}.Hotel-Information?chkin=${p.checkin}&chkout=${p.checkout}&rm1=a2&x=${p.rooms}` },
  { name: 'Hotels.com',   icon: '🔴', buildUrl: (h, p) => `https://www.hotels.com/search.do?q-check-in=${p.checkin}&q-check-out=${p.checkout}&q-rooms=${p.rooms}&q-destination=${encodeURIComponent(h.name)}` },
  { name: 'Priceline',    icon: '🟣', buildUrl: (h, p) => `https://www.priceline.com/relax/at/${h.id}/from/${p.checkin.replace(/-/g,'')}/to/${p.checkout.replace(/-/g,'')}/rooms/${p.rooms}` },
  { name: 'Kayak',        icon: '🟡', buildUrl: (h, p) => `https://www.kayak.com/hotels/${encodeURIComponent(h.name)}-${encodeURIComponent(h.city)}/${p.checkin}/${p.checkout}/${p.rooms}rooms/` },
  { name: 'Trivago',      icon: '🟢', buildUrl: (h, p) => `https://www.trivago.ca/?search[ridotto]=0&search[isCitySearch]=1&search[hitsPerPage]=20&search[cityId]=${h.ufi}&search[arrivalDate]=${p.checkin}&search[departureDate]=${p.checkout}&search[roomsCount]=${p.rooms}` },
  { name: 'Agoda',        icon: '🔷', buildUrl: (h, p) => `https://www.agoda.com/search?city=${h.ufi}&checkIn=${p.checkin}&checkOut=${p.checkout}&rooms=${p.rooms}&adults=2` },
  { name: 'HotelsCombined', icon: '⚪', buildUrl: (h, p) => `https://www.hotelscombined.com/Hotel/${encodeURIComponent(h.name)}.htm?checkin=${p.checkin}&checkout=${p.checkout}&rooms=${p.rooms}` },
  { name: 'Trip.com',     icon: '🟤', buildUrl: (h, p) => `https://ca.trip.com/hotels/list?city=${h.ufi}&cityName=${encodeURIComponent(h.city)}&checkin=${p.checkin}&checkout=${p.checkout}&rooms=${p.rooms}` },
  { name: 'Marriott',     icon: '⭐', buildUrl: (h, p) => `https://www.marriott.com/search/default.mi?roomCount=${p.rooms}&fromDate=${p.checkin}&toDate=${p.checkout}&destination=${encodeURIComponent(h.city)}` },
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
    loadingEl.innerHTML = '<div class="spinner"></div> Searching hotels in ' + city + '...';
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
      if (!dest) { showError('City not found. Try a different search.'); return; }

      currentParams.destId = dest.dest_id;
      currentParams.searchType = dest.search_type;
      currentParams.ufi = dest.dest_id;

      // Search hotels
      const searchRes = await fetch(
        `https://${RAPIDAPI_HOST}/api/v1/hotels/searchHotels?dest_id=${dest.dest_id}&search_type=${dest.search_type}&arrival_date=${checkin}&departure_date=${checkout}&adults=2&room_qty=${rooms}&currency_code=CAD&sort_by=popularity`,
        { headers: HEADERS }
      );
      const searchData = await searchRes.json();
      loadingEl.style.display = 'none';

      const hotels = searchData.data?.hotels;
      if (!hotels?.length) { showError('No hotels found. Try different dates or a larger city.'); return; }

      renderHotelList(hotels.slice(0, 5), currentParams);

    } catch (err) {
      showError('Search failed. Please try again.');
      console.error(err);
    }
  });
}

function renderHotelList(hotels, params) {
  resultsGrid.innerHTML = `<p style="color:#6b7280;font-size:0.9rem;margin-bottom:20px;">Top ${hotels.length} hotels in <strong style="color:#0d1b3e;">${params.city}</strong> — click a hotel to see availability across booking sites</p>`;

  hotels.forEach((h, i) => {
    const prop = h.property;
    const price = prop.priceBreakdown?.grossPrice?.value ? `$${Math.round(prop.priceBreakdown.grossPrice.value)} CAD` : 'Check price';
    const rating = prop.reviewScore ? `${prop.reviewScore}/10` : 'N/A';
    const photo = prop.photoUrls?.[0] || '';
    const stars = prop.propertyClass ? '⭐'.repeat(Math.min(prop.propertyClass, 5)) : '';

    const card = document.createElement('div');
    card.className = 'hotel-card';
    card.style.cursor = 'pointer';
    card.innerHTML = `
      ${photo ? `<img src="${photo}" alt="${prop.name}" class="hotel-photo" onerror="this.style.display='none'"/>` : ''}
      <div class="hotel-body">
        <div class="hotel-rank-name">
          <span class="hotel-rank">#${i + 1}</span>
          <h3 class="hotel-name">${prop.name}</h3>
        </div>
        <div class="hotel-meta">
          <span>${stars} ${rating} · ${prop.reviewScoreWord || ''}</span>
          <span>📍 ${prop.wishlistName || params.city}</span>
          <span>📏 ${prop.distance ? prop.distance + ' from centre' : ''}</span>
        </div>
        <div class="hotel-price-row">
          <div class="hotel-price">${price}</div>
          <span class="hotel-source">via Booking.com</span>
        </div>
      </div>
      <div class="hotel-actions">
        <button class="btn-check-availability" onclick="checkAvailability(event, ${h.hotel_id}, '${prop.name.replace(/'/g,"\\'")}', '${prop.countryCode}', ${prop.ufi || 0}, '${params.city}')">
          Check Availability →
        </button>
      </div>
    `;
    resultsGrid.appendChild(card);
  });
}

async function checkAvailability(e, hotelId, hotelName, countryCode, ufi, city) {
  e.stopPropagation();
  const btn = e.target;
  btn.textContent = 'Loading...';
  btn.disabled = true;

  const params = currentParams;

  // Remove any existing availability panel
  const existing = document.getElementById('avail-panel');
  if (existing) existing.remove();

  try {
    // Get hotel details including available_rooms
    const detailRes = await fetch(
      `https://${RAPIDAPI_HOST}/api/v1/hotels/getHotelDetails?hotel_id=${hotelId}&arrival_date=${params.checkin}&departure_date=${params.checkout}&adults=2&room_qty=${params.rooms}&currency_code=CAD&languagecode=en-us&units=metric`,
      { headers: HEADERS }
    );
    const detailData = await detailRes.json();
    const detail = detailData.data;

    const availableRooms = detail?.available_rooms ?? '?';
    const address = detail?.address || city;
    const soldOut = detail?.soldout === 1;

    const hotelInfo = {
      id: hotelId,
      name: hotelName,
      countryCode: countryCode,
      city: city,
      ufi: ufi,
    };

    // Build availability panel
    const panel = document.createElement('div');
    panel.id = 'avail-panel';
    panel.className = 'avail-panel';
    panel.innerHTML = `
      <div class="avail-header">
        <div>
          <h3>${hotelName}</h3>
          <p>📍 ${address} &nbsp;|&nbsp; 📅 ${params.checkin} → ${params.checkout} &nbsp;|&nbsp; 🛏️ ${params.rooms} rooms requested</p>
        </div>
        <button onclick="document.getElementById('avail-panel').remove()" class="btn-close">✕</button>
      </div>

      <div class="avail-summary ${soldOut ? 'sold-out' : availableRooms > 5 ? 'good' : 'low'}">
        ${soldOut
          ? '❌ Sold out on Booking.com for these dates'
          : `✅ <strong>${availableRooms} rooms available</strong> on Booking.com for these dates`
        }
      </div>

      <h4 style="margin:20px 0 12px;color:#0d1b3e;font-size:1rem;">Book on your preferred site:</h4>
      <div class="sites-grid">
        ${BOOKING_SITES.map(site => `
          <a href="${site.buildUrl(hotelInfo, params)}" target="_blank" class="site-card">
            <span class="site-icon">${site.icon}</span>
            <span class="site-name">${site.name}</span>
            <span class="site-action">Book →</span>
          </a>
        `).join('')}
      </div>

      <div class="share-row">
        <strong>Share this hotel with your team:</strong>
        <button class="btn-share-card" onclick="copyShareLink('${window.location.origin}/share.html?hotel=${hotelId}&name=${encodeURIComponent(hotelName)}&checkin=${params.checkin}&checkout=${params.checkout}&rooms=${params.rooms}', this)">
          🔗 Copy Share Link
        </button>
      </div>
    `;

    // Insert panel after the clicked card
    btn.closest('.hotel-card').insertAdjacentElement('afterend', panel);
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    console.error(err);
    alert('Could not load availability. Please try again.');
  }

  btn.textContent = 'Check Availability →';
  btn.disabled = false;
}

function copyShareLink(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    btn.textContent = '✅ Copied!';
    setTimeout(() => btn.textContent = '🔗 Copy Share Link', 2500);
    showToast('Link copied! Send it to your team 🎉');
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
