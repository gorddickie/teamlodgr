// TeamLodgr — Hotel Search & Room Aggregation
// Tiered availability: queries at 5, 10, 20 rooms — shows highest confirmed tier

const RAPIDAPI_KEY      = '3173251728msha891fafe5abe622p17d02fjsn272b51fed579';
const BOOKING_HOST      = 'booking-com15.p.rapidapi.com';
const PRICELINE_HOST    = 'priceline-com-provider.p.rapidapi.com';
const AGODA_HOST        = 'agoda-com.p.rapidapi.com';
const HEADERS_BOOKING   = { 'x-rapidapi-host': BOOKING_HOST,   'x-rapidapi-key': RAPIDAPI_KEY };
const HEADERS_PRICELINE = { 'x-rapidapi-host': PRICELINE_HOST, 'x-rapidapi-key': RAPIDAPI_KEY };
const HEADERS_AGODA     = { 'x-rapidapi-host': AGODA_HOST,     'x-rapidapi-key': RAPIDAPI_KEY };

const TIERS = [20, 10, 5]; // Check highest first
let pricelineCache = {}; // Cache Priceline city results to avoid repeat calls

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
      // Destination lookup
      const destRes  = await fetch(`https://${BOOKING_HOST}/api/v1/hotels/searchDestination?query=${encodeURIComponent(city)}`, { headers: HEADERS_BOOKING });
      const destData = await destRes.json();
      const dest     = destData.data?.[0];
      if (!dest) { showError('City not found. Try a different location.'); return; }

      currentParams.ufi        = dest.dest_id;
      currentParams.searchType = dest.search_type;
      currentParams.lat        = dest.latitude || dest.lat || null;
      currentParams.lng        = dest.longitude || dest.lng || null;

      // Fetch Priceline + Agoda location IDs — wait for both before proceeding
      pricelineCache = {};
      const [plLoc, agodaLoc] = await Promise.allSettled([
        fetch(`https://${PRICELINE_HOST}/v1/hotels/locations?name=${encodeURIComponent(city)}&search_type=ALL`, { headers: HEADERS_PRICELINE }).then(r => r.json()),
        fetch(`https://${AGODA_HOST}/hotels/auto-complete?query=${encodeURIComponent(city)}&locale=en-us`, { headers: HEADERS_AGODA }).then(r => r.json())
      ]);
      if (plLoc.status === 'fulfilled' && Array.isArray(plLoc.value) && plLoc.value[0]) currentParams.pricelineLocId = plLoc.value[0].id;
      if (agodaLoc.status === 'fulfilled') { const p = agodaLoc.value.places?.find(p => p.typeId === 1); if (p) currentParams.agodaCityId = p.id; }

      // Hotel search
      loadingEl.innerHTML = '<div class="spinner"></div> Finding hotels with availability...';
      const searchRes  = await fetch(
        `https://${BOOKING_HOST}/api/v1/hotels/searchHotels?dest_id=${dest.dest_id}&search_type=${dest.search_type}&arrival_date=${checkin}&departure_date=${checkout}&adults=2&room_qty=5&currency_code=CAD&sort_by=popularity`,
        { headers: HEADERS_BOOKING }
      );
      const searchData = await searchRes.json();
      const hotels     = searchData.data?.hotels?.slice(0, 5);
      if (!hotels?.length) { showError('No hotels found. Try different dates or city.'); return; }

      loadingEl.style.display = 'none';

      resultsGrid.innerHTML = `
        <div class="results-summary">
          Hotels in <strong>${city}</strong> &nbsp;·&nbsp;
          ${formatDate(checkin)} → ${formatDate(checkout)} &nbsp;·&nbsp;
          <strong>${rooms} rooms needed</strong>
        </div>
      `;

      for (const h of hotels) renderHotelCard(h, currentParams);
      hotels.forEach(h => loadProviderAvailability(h, currentParams));

    } catch (err) {
      showError('Search failed. Please try again.');
      console.error(err);
    }
  });
}

// ── Hotel card skeleton ───────────────────────────────────────────────────────
function renderHotelCard(h, params) {
  const prop  = h.property;
  const price = prop.priceBreakdown?.grossPrice?.value ? `$${Math.round(prop.priceBreakdown.grossPrice.value)} CAD/night` : '';
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
        <h3 class="hotel-name">${prop.name}</h3>
        ${stars ? `<span class="hotel-stars">${stars}</span>` : ''}
      </div>
      <div class="hotel-meta">
        ${rating ? `<span>⭐ ${rating} ${prop.reviewScoreWord ? '· ' + prop.reviewScoreWord : ''}</span>` : ''}
        <span>📍 ${params.city}</span>
        ${price ? `<span>From ${price}</span>` : ''}
      </div>
      <div class="providers-table" id="providers-${h.hotel_id}">
        <div class="provider-loading"><div class="spinner-sm"></div> Checking availability across booking sites...</div>
      </div>
      <div class="share-row">
        <button class="btn-copy-share" onclick="openSharePage('${window.location.origin}/share.html?hotel=${h.hotel_id}&name=${encodeURIComponent(prop.name)}&checkin=${params.checkin}&checkout=${params.checkout}&rooms=${params.rooms}', this)">
          🔗 Share with Team
        </button>
      </div>
    </div>
  `;
  resultsGrid.appendChild(card);
}

// ── Tiered availability check for Priceline ─────────────────────────────────
async function checkPricelineAvailability(hotelName, checkin, checkout, locId) {
  if (!locId) return { available: false, tier: 0, price: null };
  for (const tier of TIERS) {
    const cacheKey = `${locId}_${checkin}_${checkout}_${tier}`;
    let hotels;
    if (pricelineCache[cacheKey]) {
      hotels = pricelineCache[cacheKey];
    } else {
      const r = await fetch(
        `https://${PRICELINE_HOST}/v1/hotels/search?location_id=${locId}&date_checkin=${checkin}&date_checkout=${checkout}&sort_order=PRICE&rooms_number=${tier}&adults_number=2&limit=20`,
        { headers: HEADERS_PRICELINE }
      ).then(r => r.json()).catch(() => []);
      hotels = Array.isArray(r) ? r : (r.hotels || []);
      pricelineCache[cacheKey] = hotels;
    }
    const match = hotels.find(h => {
      const score = fuzzyScore(hotelName, h.name || '');
      return score >= 40;
    });
    if (match) {
      const price = match.ratesSummary?.minPrice ? `$${Math.round(match.ratesSummary.minPrice)} USD` : null;
      return { available: true, tier, price };
    }
  }
  return { available: false, tier: 0, price: null };
}

// ── Tiered availability check for Agoda ─────────────────────────────────
async function checkAgodaAvailability(checkin, checkout, cityId) {
  if (!cityId) return { available: false, tier: 0, price: null };
  for (const tier of TIERS) {
    const r = await fetch(
      `https://${AGODA_HOST}/hotels/search-overnight?id=1_${cityId}&checkinDate=${checkin}&checkoutDate=${checkout}&adults=2&rooms=${tier}&locale=en-us&currency=USD`,
      { headers: HEADERS_AGODA }
    ).then(r => r.json()).catch(() => null);
    const total = r?.data?.citySearch?.searchResult?.searchInfo?.totalAvailableHotelsWithoutFilter || 0;
    if (total > 0) return { available: true, tier, price: null };
  }
  return { available: false, tier: 0, price: null };
}

// ── Shared fuzzy scorer ───────────────────────────────────────────────────────
function fuzzyScore(a, b) {
  const norm = s => (s||'').toLowerCase().replace(/\b(hotel|the|inn|suites|suite|resort|and|by|at)\b/g,'').replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
  const wa = norm(a).split(' ').filter(w=>w.length>2);
  const wb = norm(b).split(' ').filter(w=>w.length>2);
  if (!wa.length || !wb.length) return 0;
  return Math.round((wa.filter(w=>wb.includes(w)).length / Math.max(wa.length,wb.length))*100);
}

// ── Tiered availability check for Booking.com ────────────────────────────────
async function checkBookingAvailability(hotelId, checkin, checkout, countryCode) {
  // Query all tiers in parallel
  const results = await Promise.all(TIERS.map(tier =>
    fetch(
      `https://${BOOKING_HOST}/api/v1/hotels/getHotelDetails?hotel_id=${hotelId}&arrival_date=${checkin}&departure_date=${checkout}&adults=2&room_qty=${tier}&currency_code=CAD&languagecode=en-us&units=metric`,
      { headers: HEADERS_BOOKING }
    ).then(r => r.json()).catch(() => null)
  ));

  for (let i = 0; i < TIERS.length; i++) {
    const data = results[i]?.data;
    if (!data) continue;
    if (data.soldout === 1) return { available: false, tier: 0, price: null };
    // Available if not sold out and no explicit unavailable flag
    if (data.soldout !== 1) {
      const price = data.product_price_breakdown?.gross_amount?.value
        ? `$${Math.round(data.product_price_breakdown.gross_amount.value)} CAD`
        : null;
      return { available: true, tier: TIERS[i], price };
    }
  }
  return { available: false, tier: 0, price: null };
}

// ── Load availability from all providers ─────────────────────────────────────
async function loadProviderAvailability(h, params) {
  const container = document.getElementById(`providers-${h.hotel_id}`);
  const countryCode = h.property.countryCode || 'ca';

  try {
    // Run all providers in parallel
    const [bookingAvail, hbResult, plAvail, agodaAvail] = await Promise.allSettled([
      checkBookingAvailability(h.hotel_id, params.checkin, params.checkout, countryCode),
      fetch(`/api/hotelbeds?city=${encodeURIComponent(params.city)}&checkin=${params.checkin}&checkout=${params.checkout}&rooms=5&lat=${params.lat||''}&lng=${params.lng||''}`)
        .then(r => r.json()).catch(() => ({ hotels: [] })),

      checkPricelineAvailability(h.property.name, params.checkin, params.checkout, params.pricelineLocId),
      checkAgodaAvailability(params.checkin, params.checkout, params.agodaCityId)
    ]);

    const booking  = bookingAvail.status === 'fulfilled' ? bookingAvail.value : { available: false, tier: 0 };
    const hbHotels = hbResult.status === 'fulfilled' ? hbResult.value?.hotels || [] : [];
    const priceline = plAvail.status === 'fulfilled' ? plAvail.value : { available: false, tier: 0 };
    const agoda     = agodaAvail.status === 'fulfilled' ? agodaAvail.value : { available: false, tier: 0 };

    // Hotelbeds fuzzy match
    const hbMatch = hbHotels.map(hb=>({hb,s:fuzzyScore(h.property.name,hb.name)})).filter(x=>x.s>=40).sort((a,b)=>b.s-a.s)[0]?.hb||null;
    const hbTier  = hbMatch?.availableRooms >= 20 ? 20 : hbMatch?.availableRooms >= 10 ? 10 : hbMatch?.availableRooms >= 5 ? 5 : 0;
    const hbPrice = hbMatch?.pricePerNight ? `$${hbMatch.pricePerNight} ${hbMatch.currency}` : null;

    // Build providers list
    const providers = [
      {
        name: 'Booking.com', icon: '🔵',
        available: booking.available,
        tier: booking.tier,
        price: booking.price,
        url: `https://www.booking.com/hotel/${countryCode}/${h.hotel_id}.html?checkin=${params.checkin}&checkout=${params.checkout}&no_rooms=${params.rooms}&group_adults=2`,
      },
      {
        name: 'Hotelbeds', icon: '🟤',
        available: hbTier >= 5,
        tier: hbTier,
        price: hbPrice,
        url: `https://www.booking.com/hotel/${countryCode}/${h.hotel_id}.html?checkin=${params.checkin}&checkout=${params.checkout}&no_rooms=${params.rooms}`,
      },
      {
        name: 'Priceline', icon: '🟣',
        available: priceline.available,
        tier: priceline.tier,
        price: priceline.price,
        url: `https://www.priceline.com/hotel/search?q=${encodeURIComponent(params.city)}&date_start=${params.checkin}&date_end=${params.checkout}&num_rooms=${params.rooms}`,
      },
      {
        name: 'Agoda', icon: '🟢',
        available: agoda.available,
        tier: agoda.tier,
        price: agoda.price,
        url: `https://www.agoda.com/search?city=${params.agodaCityId||''}&checkIn=${params.checkin}&checkOut=${params.checkout}&rooms=${params.rooms}&adults=2`,
      },
      {
        name: 'Expedia', icon: '🟡', available: null, tier: null, price: null,
        url: `https://www.expedia.ca/Hotel-Search?destination=${encodeURIComponent(params.city)}&startDate=${params.checkin}&endDate=${params.checkout}&rooms=${params.rooms}&adults=2`,
      },
      {
        name: 'Hotels.com', icon: '🔴', available: null, tier: null, price: null,
        url: `https://www.hotels.com/search.do?q-destination=${encodeURIComponent(params.city)}&q-check-in=${params.checkin}&q-check-out=${params.checkout}&q-rooms=${params.rooms}`,
      },
      {
        name: 'Kayak',      icon: '🟠', available: null, tier: null, price: null,
        url: `https://www.kayak.com/hotels/${encodeURIComponent(params.city)}/${params.checkin}/${params.checkout}/${params.rooms}rooms/`,
      },
      {
        name: 'Agoda',      icon: '🟢', available: null, tier: null, price: null,
        url: `https://www.agoda.com/search?city=${params.ufi}&checkIn=${params.checkin}&checkOut=${params.checkout}&rooms=${params.rooms}&adults=2`,
      },
      {
        name: 'Trivago',    icon: '⚪', available: null, tier: null, price: null,
        url: `https://www.trivago.ca/?search[destination]=${encodeURIComponent(params.city)}&search[arrivalDate]=${params.checkin}&search[departureDate]=${params.checkout}&search[roomsCount]=${params.rooms}`,
      },
    ];

    // Only show providers with confirmed availability
    const visible = providers.filter(p => p.available === true);

    container.innerHTML = `
      <div class="providers-header">
        <span>Booking Site</span>
        <span>Availability</span>
        <span>Price/night</span>
        <span></span>
      </div>
      ${visible.map(p => `
        <div class="provider-row ${p.available ? 'has-count' : ''}">
          <span class="provider-name">${p.icon} ${p.name}</span>
          <span class="provider-rooms ${p.available ? 'avail' : 'unknown'}">
            ${p.available ? `✅ At least ${p.tier} rooms available` : '<span class="check-site">Check site</span>'}
          </span>
          <span class="provider-price">${p.price || '—'}</span>
          <a href="${p.url}" target="_blank" class="btn-book-sm">Book →</a>
        </div>
      `).join('')}
      ${visible.length === 0 ? '<p style="padding:16px;color:#6b7280;font-size:0.88rem;">No confirmed availability found. Use the Book buttons above to check sites directly.</p>' : ''}
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

function openSharePage(url, btn) {
  btn.textContent = '✅ Opening...';
  window.location.href = url;
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
