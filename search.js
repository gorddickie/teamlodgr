// TeamLodgr — Hotel Search & Room Aggregation
// Aggregates real room counts across booking providers

const RAPIDAPI_KEY  = '3173251728msha891fafe5abe622p17d02fjsn272b51fed579';
const BOOKING_HOST  = 'booking-com15.p.rapidapi.com';
const HEADERS_BOOKING = { 'x-rapidapi-host': BOOKING_HOST, 'x-rapidapi-key': RAPIDAPI_KEY };

let currentParams = {};

const searchForm     = document.getElementById('search-form');
const resultsSection = document.getElementById('results-section');
const resultsGrid    = document.getElementById('results-grid');
const loadingEl      = document.getElementById('loading');

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
      // Step 1: Destination lookup
      const destRes  = await fetch(`https://${BOOKING_HOST}/api/v1/hotels/searchDestination?query=${encodeURIComponent(city)}`, { headers: HEADERS_BOOKING });
      const destData = await destRes.json();
      const dest     = destData.data?.[0];

      if (!dest) { showError('City not found. Try a different location.'); return; }
      currentParams.ufi        = dest.dest_id;
      currentParams.searchType = dest.search_type;
      currentParams.lat        = dest.latitude || dest.lat || null;
      currentParams.lng        = dest.longitude || dest.lng || null;

      // Step 2: Hotel list
      loadingEl.innerHTML = '<div class="spinner"></div> Finding hotels with availability...';
      const searchRes  = await fetch(
        `https://${BOOKING_HOST}/api/v1/hotels/searchHotels?dest_id=${dest.dest_id}&search_type=${dest.search_type}&arrival_date=${checkin}&departure_date=${checkout}&adults=2&room_qty=${rooms}&currency_code=CAD&sort_by=popularity`,
        { headers: HEADERS_BOOKING }
      );
      const searchData = await searchRes.json();
      const hotels     = searchData.data?.hotels?.slice(0, 5);

      if (!hotels?.length) { showError('No hotels found. Try different dates or city.'); return; }

      loadingEl.style.display = 'none';

      // Render summary header
      resultsGrid.innerHTML = `
        <div class="results-summary">
          Hotels in <strong>${city}</strong> &nbsp;·&nbsp;
          ${formatDate(checkin)} → ${formatDate(checkout)} &nbsp;·&nbsp;
          <strong>${rooms} rooms needed</strong>
        </div>
      `;

      // Render each hotel card + load provider availability
      for (const h of hotels) {
        renderHotelCard(h, currentParams);
      }
      hotels.forEach(h => loadProviderAvailability(h, currentParams));

    } catch (err) {
      showError('Search failed. Please try again.');
      console.error(err);
    }
  });
}

// ── Render hotel card skeleton ────────────────────────────────────────────────
function renderHotelCard(h, params) {
  const prop   = h.property;
  const price  = prop.priceBreakdown?.grossPrice?.value ? `$${Math.round(prop.priceBreakdown.grossPrice.value)} CAD/night` : '';
  const rating = prop.reviewScore ? `${prop.reviewScore}/10` : '';
  const stars  = prop.propertyClass ? '★'.repeat(Math.min(prop.propertyClass, 5)) : '';
  const photo  = prop.photoUrls?.[0] || '';

  const card = document.createElement('div');
  card.className = 'hotel-card';
  card.id = `hotel-card-${h.hotel_id}`;
  card.innerHTML = `
    ${photo ? `<img src="${photo}" alt="${prop.name}" class="hotel-photo" onerror="this.style.display='none'"/>` : ''}
    <div class="hotel-body">
      <div class="hotel-rank-name">
        <h3 class="hotel-name">${prop.name}</h3>
        ${stars ? `<span class="hotel-stars">${stars}</span>` : ''}
      </div>
      <div class="hotel-meta">
        ${rating ? `<span>⭐ ${rating} ${prop.reviewScoreWord ? '· ' + prop.reviewScoreWord : ''}</span>` : ''}
        <span>📍 ${params.city}</span>
        ${price ? `<span>From ${price}</span>` : ''}
      </div>

      <div class="room-tally" id="tally-${h.hotel_id}">
        <div class="tally-bar-wrap">
          <div class="tally-bar" id="tally-bar-${h.hotel_id}" style="width:0%"></div>
        </div>
        <span class="tally-label" id="tally-label-${h.hotel_id}">Loading availability...</span>
      </div>

      <div class="providers-table" id="providers-${h.hotel_id}">
        <div class="provider-loading"><div class="spinner-sm"></div> Checking room availability across booking sites...</div>
      </div>

      <div class="share-row">
        <button class="btn-copy-share" onclick="copyShareLink('${window.location.origin}/share.html?hotel=${h.hotel_id}&name=${encodeURIComponent(prop.name)}&checkin=${params.checkin}&checkout=${params.checkout}&rooms=${params.rooms}', this)">
          🔗 Share with Team
        </button>
      </div>
    </div>
  `;
  resultsGrid.appendChild(card);
}

// ── Load real availability from all providers ─────────────────────────────────
async function loadProviderAvailability(h, params) {
  const container  = document.getElementById(`providers-${h.hotel_id}`);
  const tallyBar   = document.getElementById(`tally-bar-${h.hotel_id}`);
  const tallyLabel = document.getElementById(`tally-label-${h.hotel_id}`);

  try {
    // Fetch Booking.com room detail (real count) + Hotelbeds (via our API)
    const [bookingDetail, hbResult] = await Promise.allSettled([
      fetch(
        `https://${BOOKING_HOST}/api/v1/hotels/getHotelDetails?hotel_id=${h.hotel_id}&arrival_date=${params.checkin}&departure_date=${params.checkout}&adults=2&room_qty=${params.rooms}&currency_code=CAD&languagecode=en-us&units=metric`,
        { headers: HEADERS_BOOKING }
      ).then(r => r.json()),

      fetch(
        `/api/hotelbeds?city=${encodeURIComponent(params.city)}&checkin=${params.checkin}&checkout=${params.checkout}&rooms=${params.rooms}&lat=${params.lat || ''}&lng=${params.lng || ''}`
      ).then(r => r.json()).catch(() => ({ hotels: [] }))
    ]);

    const detail       = bookingDetail.status === 'fulfilled' ? bookingDetail.value?.data || {} : {};
    const hbHotels     = hbResult.status === 'fulfilled' ? hbResult.value?.hotels || [] : [];
    const countryCode  = h.property.countryCode || 'ca';

    // Booking.com real room count
    const bookingRooms = detail.available_rooms ?? null;
    const bookingSold  = detail.soldout === 1;
    const bookingPrice = detail.product_price_breakdown?.gross_amount?.value
      ? `$${Math.round(detail.product_price_breakdown.gross_amount.value)} CAD`
      : null;

    // Hotelbeds — improved fuzzy match by scoring shared words
    function normalizeHotelName(name) {
      return (name || '').toLowerCase()
        .replace(/\b(hotel|the|inn|suites|suite|resort|and|by|at)\b/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ').trim();
    }
    function matchScore(a, b) {
      const na = normalizeHotelName(a);
      const nb = normalizeHotelName(b);
      if (na === nb) return 100;
      const wordsA = na.split(' ').filter(w => w.length > 2);
      const wordsB = nb.split(' ').filter(w => w.length > 2);
      const shared = wordsA.filter(w => wordsB.includes(w)).length;
      return Math.round((shared / Math.max(wordsA.length, wordsB.length)) * 100);
    }
    const hbMatch = hbHotels
      .map(hb => ({ hb, score: matchScore(h.property.name, hb.name) }))
      .filter(x => x.score >= 40)
      .sort((a, b) => b.score - a.score)[0]?.hb || null;
    const hbRooms = hbMatch?.availableRooms || null;
    const hbPrice = hbMatch?.pricePerNight ? `$${hbMatch.pricePerNight} ${hbMatch.currency}` : null;

    // Build provider list — real counts first, then links-only
    const providers = [
      {
        name: 'Booking.com',
        icon: '🔵',
        rooms: bookingSold ? 0 : bookingRooms,
        roomsLabel: bookingSold ? '❌ Sold out' : bookingRooms !== null ? bookingRooms : null,
        price: bookingPrice,
        hasRealCount: bookingRooms !== null && !bookingSold,
        url: `https://www.booking.com/hotel/${countryCode}/${h.hotel_id}.html?checkin=${params.checkin}&checkout=${params.checkout}&no_rooms=${params.rooms}&group_adults=2`,
      },
      {
        name: 'Hotelbeds',
        icon: '🟤',
        rooms: hbRooms,
        roomsLabel: hbRooms !== null ? hbRooms : null,
        price: hbPrice,
        hasRealCount: hbRooms !== null,
        url: `https://www.booking.com/hotel/${countryCode}/${h.hotel_id}.html?checkin=${params.checkin}&checkout=${params.checkout}&no_rooms=${params.rooms}`,
      },
      {
        name: 'Expedia',       icon: '🟡', rooms: null, roomsLabel: null, price: null, hasRealCount: false,
        url: `https://www.expedia.ca/Hotel-Search?destination=${encodeURIComponent(params.city)}&startDate=${params.checkin}&endDate=${params.checkout}&rooms=${params.rooms}&adults=2`,
      },
      {
        name: 'Priceline',     icon: '🟣', rooms: null, roomsLabel: null, price: null, hasRealCount: false,
        url: `https://www.priceline.com/hotel/search?q=${encodeURIComponent(params.city)}&date_start=${params.checkin}&date_end=${params.checkout}&num_rooms=${params.rooms}`,
      },
      {
        name: 'Hotels.com',    icon: '🔴', rooms: null, roomsLabel: null, price: null, hasRealCount: false,
        url: `https://www.hotels.com/search.do?q-destination=${encodeURIComponent(params.city)}&q-check-in=${params.checkin}&q-check-out=${params.checkout}&q-rooms=${params.rooms}`,
      },
      {
        name: 'Kayak',         icon: '🟠', rooms: null, roomsLabel: null, price: null, hasRealCount: false,
        url: `https://www.kayak.com/hotels/${encodeURIComponent(params.city)}/${params.checkin}/${params.checkout}/${params.rooms}rooms/`,
      },
      {
        name: 'Agoda',         icon: '🟢', rooms: null, roomsLabel: null, price: null, hasRealCount: false,
        url: `https://www.agoda.com/search?city=${params.ufi}&checkIn=${params.checkin}&checkOut=${params.checkout}&rooms=${params.rooms}&adults=2`,
      },
      {
        name: 'Trivago',       icon: '⚪', rooms: null, roomsLabel: null, price: null, hasRealCount: false,
        url: `https://www.trivago.ca/?search[destination]=${encodeURIComponent(params.city)}&search[arrivalDate]=${params.checkin}&search[departureDate]=${params.checkout}&search[roomsCount]=${params.rooms}`,
      },
    ];

    // Calculate tally — sum of confirmed room counts
    const confirmedRooms = providers
      .filter(p => p.hasRealCount && p.rooms > 0)
      .reduce((sum, p) => sum + p.rooms, 0);
    const pct = Math.min(100, Math.round((confirmedRooms / params.rooms) * 100));
    const met = confirmedRooms >= params.rooms;

    // Update tally bar
    tallyBar.style.width  = `${pct}%`;
    tallyBar.style.background = met ? '#16a34a' : '#1a6fd4';
    tallyLabel.innerHTML = met
      ? `✅ <strong>${confirmedRooms} rooms confirmed</strong> across providers — goal of ${params.rooms} met!`
      : `<strong>${confirmedRooms} of ${params.rooms} rooms confirmed</strong> — check additional sites below`;

    // Filter: only show providers with 5+ rooms OR no real count (unknown)
    const visibleProviders = providers.filter(p => !p.hasRealCount || p.rooms >= 5);

    // Render providers table
    container.innerHTML = `
      <div class="providers-header">
        <span>Booking Site</span>
        <span>Rooms Available</span>
        <span>Price/night</span>
        <span></span>
      </div>
      ${visibleProviders.map(p => `
        <div class="provider-row ${p.hasRealCount && p.rooms > 0 ? 'has-count' : ''}">
          <span class="provider-name">${p.icon} ${p.name}</span>
          <span class="provider-rooms ${p.hasRealCount ? (p.rooms > 0 ? 'avail' : 'sold') : 'unknown'}">
            ${p.hasRealCount
              ? (p.rooms > 0 ? `<strong>${p.roomsLabel}</strong> rooms` : p.roomsLabel)
              : '<span class="check-site">Check site</span>'}
          </span>
          <span class="provider-price">${p.price || '—'}</span>
          <a href="${p.url}" target="_blank" class="btn-book-sm">Book →</a>
        </div>
      `).join('')}
      ${visibleProviders.length === 0 ? '<p style="padding:12px;color:#e74c3c;font-size:0.85rem;">No providers currently have 5+ rooms available for these dates.</p>' : ''}
    `;

  } catch (err) {
    container.innerHTML = `<p style="color:#e74c3c;font-size:0.85rem;padding:10px 0;">Could not load availability. <a href="https://www.booking.com" target="_blank">Try Booking.com directly</a></p>`;
    console.error(err);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
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
