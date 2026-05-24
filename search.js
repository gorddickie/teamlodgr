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
let selectedVenue = null; // { name, lat, lng } — set when user picks a venue

// ── Venue search (Nominatim) ─────────────────────────────────────────────────
let nominatimTimer = null;
function initVenueSearch() {
  const input = document.getElementById('venue-input');
  const dropdown = document.getElementById('venue-dropdown');
  if (!input) return;

  input.addEventListener('input', () => {
    clearTimeout(nominatimTimer);
    const q = input.value.trim();
    if (q.length < 3) { dropdown.style.display = 'none'; return; }
    const city = (document.getElementById('city')?.value || '').trim();
    const query = city ? `${q} ${city}` : q;
    nominatimTimer = setTimeout(() => fetchVenueSuggestions(query), 400);
  });

  input.addEventListener('blur', () => {
    setTimeout(() => { dropdown.style.display = 'none'; }, 200);
  });

  input.addEventListener('focus', () => {
    const q = input.value.trim();
    if (q.length >= 3 && dropdown.innerHTML) dropdown.style.display = 'block';
  });
}

async function fetchVenueSuggestions(q) {
  const dropdown = document.getElementById('venue-dropdown');
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1`,
      { headers: { 'Accept': 'application/json' } }
    );
    const data = await res.json();
    if (!data.length) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = data.map((item, i) => {
      const parts = item.display_name.split(',');
      const name = parts[0].trim();
      const loc = parts.slice(1, 3).join(',').trim();
      return `<div class="venue-option" data-idx="${i}" data-lat="${item.lat}" data-lng="${item.lon}" data-name="${encodeURIComponent(name)}" data-display="${encodeURIComponent(item.display_name)}">
        <div class="venue-option-name">${name}</div>
        <div class="venue-option-loc">${loc}</div>
      </div>`;
    }).join('');
    dropdown.style.display = 'block';
    dropdown.querySelectorAll('.venue-option').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectVenue(el);
      });
    });
  } catch (err) {
    dropdown.style.display = 'none';
  }
}

function selectVenue(el) {
  const name = decodeURIComponent(el.dataset.name);
  const lat = parseFloat(el.dataset.lat);
  const lng = parseFloat(el.dataset.lng);
  selectedVenue = { name, lat, lng };

  const input = document.getElementById('venue-input');
  const dropdown = document.getElementById('venue-dropdown');
  const selectedDiv = document.getElementById('venue-selected');

  input.style.display = 'none';
  dropdown.style.display = 'none';
  selectedDiv.style.display = 'block';
  selectedDiv.innerHTML = `<div class="venue-selected-badge">🏒 ${name}<button type="button" class="clear-venue" onclick="clearVenue()">✕</button></div>`;
}

function clearVenue() {
  selectedVenue = null;
  const input = document.getElementById('venue-input');
  const selectedDiv = document.getElementById('venue-selected');
  input.style.display = 'block';
  input.value = '';
  selectedDiv.style.display = 'none';
  input.focus();
}

// ── Haversine distance (km) ───────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const searchForm     = document.getElementById('search-form');
const resultsSection = document.getElementById('results-section');
const resultsGrid    = document.getElementById('results-grid');
const loadingEl      = document.getElementById('loading');

// Init venue search on page load
document.addEventListener('DOMContentLoaded', initVenueSearch);
// Also init immediately in case DOM already loaded
if (document.readyState !== 'loading') initVenueSearch();

if (searchForm) {
  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const city    = document.getElementById('city').value.trim();
    const checkin = document.getElementById('checkin').value;
    const checkout= document.getElementById('checkout').value;
    const rooms   = parseInt(document.getElementById('rooms').value);

    if (!city) { alert('Please enter a destination city.'); return; }
    if (!checkin || !checkout || !rooms) { alert('Please fill in all fields.'); return; }

    currentParams = { city, checkin, checkout, rooms };

    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth' });
    // Hide nav so organizer can focus on results
    const mainNav = document.getElementById('main-nav');
    if (mainNav) mainNav.style.display = 'none';
    resultsGrid.innerHTML = '';
    const overlay = document.getElementById('search-overlay');
    const overlayTitle = document.getElementById('overlay-title');
    const overlaySub   = document.getElementById('overlay-sub');
    if (overlay) overlay.classList.add('active');
    const stepActive = (msg, sub) => { if(overlayTitle) overlayTitle.textContent = msg; if(overlaySub && sub) overlaySub.textContent = sub; };
    const stepDone   = () => {};
    stepActive('Finding hotels with availability...', 'Searching Booking.com, Agoda, Hotels.com and more');

    try {
      // ── SerpApi Google Hotels search ─────────────────────────────────────
      stepActive('Finding hotels with availability...', 'Searching Google Hotels for group-friendly options');
      const serpRes  = await fetch(`/api/hotels-search?city=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&rooms=${rooms}`);
      const serpData = await serpRes.json();
      if (!serpData.hotels?.length) { showError('No hotels found. Try different dates or city.'); return; }

      stepActive('Checking prices across providers...', 'Getting the best rates from Booking.com, Hotels.com and more');

      // Map SerpApi results into the same format the rest of the code expects
      const hotels = serpData.hotels;

      loadingEl.style.display = 'none';
      if (overlay) overlay.classList.remove('active');

      const locationLabel = currentParams.venueName
        ? `near <strong>${currentParams.venueName}</strong>, ${city}`
        : `in <strong>${city}</strong>`;

      resultsGrid.innerHTML = `
        <div class="results-summary">
          Hotels ${locationLabel} &nbsp;·&nbsp;
          ${formatDate(checkin)} → ${formatDate(checkout)} &nbsp;·&nbsp;
          <strong>${rooms} rooms needed</strong>
        </div>
      `;

      // Sort by distance to venue if selected
      let hotelsToShow = hotels;
      if (currentParams.venueLat && currentParams.venueLng) {
        hotelsToShow = hotels.slice().sort((a, b) => {
          if (!a.lat || !b.lat) return 0;
          return haversineKm(currentParams.venueLat, currentParams.venueLng, a.lat, a.lng) -
                 haversineKm(currentParams.venueLat, currentParams.venueLng, b.lat, b.lng);
        });
      }

      for (const h of hotelsToShow) renderSerpHotelCard(h, currentParams);
      return; // SerpApi path complete

      // ── Legacy Booking.com destination lookup (fallback) ──────────────────
      const destRes  = await fetch(`https://${BOOKING_HOST}/api/v1/hotels/searchDestination?query=${encodeURIComponent(city)}`, { headers: HEADERS_BOOKING });
      const destData = await destRes.json();
      const dest     = destData.data?.[0];
      if (!dest) { showError('City not found. Try a different location.'); return; }

      currentParams.ufi        = dest.dest_id;
      currentParams.searchType = dest.search_type;
      currentParams.lat        = dest.latitude || dest.lat || null;
      currentParams.lng        = dest.longitude || dest.lng || null;
      if (selectedVenue) {
        currentParams.venueLat  = selectedVenue.lat;
        currentParams.venueLng  = selectedVenue.lng;
        currentParams.venueName = selectedVenue.name;
      }

      stepActive('Finding hotels with availability...', 'Checking room availability for your group size');
      // Fetch Priceline + Agoda location IDs — wait for both before proceeding
      pricelineCache = {};
      const [agodaLoc] = await Promise.allSettled([
        fetch(`https://${AGODA_HOST}/hotels/auto-complete?query=${encodeURIComponent(city)}&locale=en-us`, { headers: HEADERS_AGODA }).then(r => r.json())
      ]);
      if (agodaLoc.status === 'fulfilled') {
        console.log('[Agoda autocomplete]', JSON.stringify(agodaLoc.value?.places?.slice(0,3)));
        const p = agodaLoc.value.places?.find(p => p.typeId === 1) || agodaLoc.value.places?.[0];
        if (p) { currentParams.agodaCityId = p.id; currentParams.agodaPlaceType = p.typeId; console.log('[Agoda] using place:', p.id, 'typeId:', p.typeId, 'name:', p.name); }
      }

      // Hotel search
      stepActive('Checking prices across providers...', 'Getting the best rates from Booking.com, Agoda and more');
      const hotelSearchUrl = `https://${BOOKING_HOST}/api/v1/hotels/searchHotels?dest_id=${dest.dest_id}&search_type=${dest.search_type}&arrival_date=${checkin}&departure_date=${checkout}&adults=2&room_qty=5&currency_code=CAD&sort_by=popularity`;
      const searchRes  = await fetch(hotelSearchUrl, { headers: HEADERS_BOOKING });
      const searchData = await searchRes.json();
      const legacyHotels = searchData.data?.hotels?.slice(0, 5);
      if (!legacyHotels?.length) { showError('No hotels found. Try different dates or city.'); return; }

      if (overlay) overlay.classList.remove('active');
      loadingEl.style.display = 'none';

      // Sort by distance if a venue was selected
      let legacyHotelsToShow = legacyHotels;
      if (currentParams.venueLat && currentParams.venueLng) {
        legacyHotelsToShow = legacyHotels.slice().sort((a, b) => {
          const aLat = a.property.latitude || a.property.lat;
          const aLng = a.property.longitude || a.property.lng || a.property.lon;
          const bLat = b.property.latitude || b.property.lat;
          const bLng = b.property.longitude || b.property.lng || b.property.lon;
          if (!aLat || !bLat) return 0;
          return haversineKm(currentParams.venueLat, currentParams.venueLng, aLat, aLng) -
                 haversineKm(currentParams.venueLat, currentParams.venueLng, bLat, bLng);
        });
      }

      const legacyLocationLabel = currentParams.venueName
        ? `near <strong>${currentParams.venueName}</strong>, ${city}`
        : `in <strong>${city}</strong>`;

      resultsGrid.innerHTML = `
        <div class="results-summary">
          Hotels ${legacyLocationLabel} &nbsp;·&nbsp;
          ${formatDate(checkin)} → ${formatDate(checkout)} &nbsp;·&nbsp;
          <strong>${rooms} rooms needed</strong>
        </div>
      `;

      for (const h of legacyHotelsToShow) renderHotelCard(h, currentParams);
      legacyHotelsToShow.forEach(h => loadProviderAvailability(h, currentParams));

    } catch (err) {
      showError('Search failed. Please try again.');
      console.error(err);
    }
  });
}

// ── Hotel card skeleton ───────────────────────────────────────────────────────
function renderHotelCard(h, params) {
  const prop  = h.property;
  const rawPrice = prop.priceBreakdown?.grossPrice?.value;
  const nights = params.checkin && params.checkout ? Math.max(1, (new Date(params.checkout) - new Date(params.checkin)) / 86400000) : 1;
  const rooms = params.rooms ? Math.max(1, parseInt(params.rooms)) : 1;
  const pricePerRoom = rawPrice ? Math.round(rawPrice / nights / 5) : null; // search uses room_qty=5
  const price = pricePerRoom ? `$${pricePerRoom} CAD/night` : '';
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
        <span>📍 ${params.venueName || params.city}</span>
        ${price ? `<span>From ${price}</span>` : ''}
      </div>
      ${params.venueLat && (prop.latitude || prop.lat) ? (() => {
        const hLat = prop.latitude || prop.lat;
        const hLng = prop.longitude || prop.lng || prop.lon;
        const km = haversineKm(params.venueLat, params.venueLng, hLat, hLng);
        return `<div><span class="distance-badge">📍 ${km < 1 ? (km*1000).toFixed(0)+' meters' : km.toFixed(1)+' km'} from ${params.venueName}</span></div>`;
      })() : ''}
      <div class="providers-table" id="providers-${h.hotel_id}">
        <div class="provider-loading"><div class="spinner-sm"></div> Checking availability across booking sites...</div>
      </div>
      <div class="share-row">
        <button class="btn-copy-share" onclick="openSharePage(buildShareUrl('${h.hotel_id}','${encodeURIComponent(prop.name)}','${params.checkin}','${params.checkout}','${params.rooms}','${encodeURIComponent(photo||'')}',shareProviders_${h.hotel_id}), this)">
          🔗 Share with Team
        </button>
      </div>
    </div>
  `;
  // Store provider data for share URL building (set before appending)
  window['shareProviders_' + h.hotel_id] = [];
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
async function checkAgodaAvailability(hotelName, checkin, checkout, cityId) {
  if (!cityId) return { available: false, tier: 0, price: null };
  for (const tier of TIERS) {
    const r = await fetch(
      `https://${AGODA_HOST}/hotels/search-overnight?id=${cityId}&checkinDate=${checkin}&checkoutDate=${checkout}&adults=2&rooms=${tier}&locale=en-us&currency=USD`,
      { headers: HEADERS_AGODA }
    ).then(r => r.json()).catch(() => null);
    const total = r?.data?.citySearch?.searchResult?.searchInfo?.totalAvailableHotelsWithoutFilter || 0;
    if (total > 0) {
      // Try to fuzzy-match specific hotel and extract price
      const properties = r?.data?.citySearch?.searchResult?.properties || [];
      console.log('[Agoda] properties count:', properties.length, 'sample keys:', properties[0] ? Object.keys(properties[0]) : 'none');
      const match = properties
        .map(p => ({ p, s: fuzzyScore(hotelName, p.name || p.hotelName || p.content?.informationSummary?.hotelName || '') }))
        .filter(x => x.s >= 40)
        .sort((a, b) => b.s - a.s)[0]?.p || null;
      let price = null;
      if (match) {
        console.log('[Agoda] matched:', match?.name || match?.hotelName, JSON.stringify(match?.pricing || match?.price || match?.lowestAveragePrice));
        const raw = match?.pricing?.offers?.[0]?.roomOffers?.[0]?.room?.pricing?.[0]?.price?.perRoomPerNight?.exclusive?.display
          || match?.pricing?.minPrice
          || match?.lowestAveragePrice
          || match?.price?.perRoomPerNight
          || match?.minPrice
          || null;
        if (raw) price = `$${Math.round(raw)} USD`;
      } else {
        console.log('[Agoda] no match. Top names:', properties.slice(0,5).map(p => p.name || p.hotelName || p.content?.informationSummary?.hotelName));
      }
      return { available: true, tier, price };
    }
  }
  return { available: false, tier: 0, price: null };
}

// ── Shared fuzzy scorer ───────────────────────────────────────────────────────
// ── SerpApi hotel card renderer ─────────────────────────────────────────────
function renderSerpHotelCard(h, params) {
  const stars   = h.stars ? '★'.repeat(Math.min(h.stars, 5)) : '';
  const price   = h.pricePerNight ? `$${h.pricePerNight} CAD/night` : '';
  const rating  = h.rating ? `${h.rating}/5` : '';
  const shareToken = Math.random().toString(36).slice(2);

  // Build provider booking URLs with affiliate links
  const bookingUrl = `https://www.booking.com/search.html?ss=${encodeURIComponent(h.name + ' ' + params.city)}&checkin_year=${params.checkin.split('-')[0]}&checkin_month=${parseInt(params.checkin.split('-')[1])}&checkin_monthday=${parseInt(params.checkin.split('-')[2])}&checkout_year=${params.checkout.split('-')[0]}&checkout_month=${parseInt(params.checkout.split('-')[1])}&checkout_monthday=${parseInt(params.checkout.split('-')[2])}&no_rooms=${params.rooms}&group_adults=2&selected_currency=CAD`;
  const hotelsUrl  = `https://www.dpbolvw.net/click-7635804-1702763?url=${encodeURIComponent('https://www.hotels.com/search.do?q-destination=' + encodeURIComponent(h.name + ' ' + params.city) + '&q-check-in=' + params.checkin + '&q-check-out=' + params.checkout + '&q-rooms=' + params.rooms)}`;
  const expediaUrl = `https://www.expedia.ca/Hotels/search?q=${encodeURIComponent(h.name + ' ' + params.city)}&startDate=${params.checkin}&endDate=${params.checkout}&rooms=${params.rooms}&adults=2`;

  const agodaUrl  = `https://www.agoda.com/search?q=${encodeURIComponent(h.name + ' ' + params.city)}&checkIn=${params.checkin}&checkOut=${params.checkout}&rooms=${params.rooms}&adults=2`;
  const kayakUrl   = `https://www.kayak.com/hotels/${encodeURIComponent(params.city)}/${params.checkin}/${params.checkout}/${params.rooms}rooms/?q=${encodeURIComponent(h.name)}`;

  // Detect brand and build direct hotel brand URL
  function getBrandUrl(name, checkin, checkout, rooms) {
    const n = (name || '').toLowerCase();
    const ci = checkin; const co = checkout; const r = rooms;
    if (n.includes('marriott') || n.includes('courtyard') || n.includes('fairfield') || n.includes('residence inn') || n.includes('springhill') || n.includes('towneplace') || n.includes('westin') || n.includes('sheraton') || n.includes('w hotel') || n.includes('renaissance'))
      return `https://www.marriott.com/search/findHotels.mi?searchType=InCity&location=${encodeURIComponent(params.city)}&fromDate=${ci}&toDate=${co}&numberOfRooms=${r}`;
    if (n.includes('hilton') || n.includes('hampton inn') || n.includes('doubletree') || n.includes('embassy suites') || n.includes('homewood') || n.includes('home2') || n.includes('curio') || n.includes('tapestry'))
      return `https://www.hilton.com/en/hotels/?search=${encodeURIComponent(name + ' ' + params.city)}&checkin=${ci}&checkout=${co}&numRooms=${r}`;
    if (n.includes('hyatt') || n.includes('andaz') || n.includes('park hyatt') || n.includes('grand hyatt') || n.includes('aloft'))
      return `https://www.hyatt.com/search/${encodeURIComponent(params.city)}?checkinDate=${ci}&checkoutDate=${co}&rooms=${r}`;
    if (n.includes('ihg') || n.includes('holiday inn') || n.includes('crowne plaza') || n.includes('intercontinental') || n.includes('even hotel') || n.includes('staybridge'))
      return `https://www.ihg.com/hotels/us/en/find-hotels/hotel/rooms?qDest=${encodeURIComponent(params.city)}&qCiD=${ci}&qCoD=${co}&qRms=${r}`;
    if (n.includes('best western'))
      return `https://www.bestwestern.com/en_US/book/hotel-rooms.html?propertyCode=&checkIn=${ci}&checkOut=${co}&numberOfRooms=${r}&city=${encodeURIComponent(params.city)}`;
    if (n.includes('wyndham') || n.includes('days inn') || n.includes('super 8') || n.includes('la quinta') || n.includes('ramada') || n.includes('howard johnson'))
      return `https://www.wyndhamhotels.com/search?checkInDate=${ci}&checkOutDate=${co}&query=${encodeURIComponent(params.city)}&numberOfRooms=${r}`;
    return null;
  }
  const brandUrl = getBrandUrl(h.name, params.checkin, params.checkout, params.rooms);

  const providers = [
    { name: 'Booking.com', icon: '🔵', price: price, url: bookingUrl },
    { name: 'Hotels.com',  icon: '🔴', price: price, url: hotelsUrl },
    { name: 'Expedia',     icon: '🟡', price: price, url: expediaUrl },
    { name: 'Agoda',       icon: '🟢', price: null,  url: agodaUrl  },
    { name: 'Kayak',       icon: '🟠', price: null,  url: kayakUrl  },
  ];
  if (brandUrl) providers.unshift({ name: 'Book Direct', icon: '🏨', price: price, url: brandUrl });

  // Add any SerpApi provider links that have prices
  h.providers?.forEach(p => {
    if (p.url && p.name && !providers.find(x => x.name.toLowerCase().includes(p.name.toLowerCase().slice(0,5)))) {
      providers.push({ name: p.name, icon: '⚪', price: p.price || price, url: p.url });
    }
  });

  const shareProviders = providers.map(p => ({ name: p.name, price: p.price, url: p.url }));
  const hotelId = 'serp_' + Math.random().toString(36).slice(2);

  const card = document.createElement('div');
  card.className = 'hotel-card';
  card.id = `hotel-card-${hotelId}`;
  card.innerHTML = `
    ${h.photo ? `<img src="${h.photo}" alt="${h.name}" class="hotel-photo" onerror="this.style.display='none'"/>` : ''}
    <div class="hotel-body">
      <div class="hotel-rank-name">
        <h3 class="hotel-name">${h.name}</h3>
        ${stars ? `<span class="hotel-stars">${stars}</span>` : ''}
      </div>
      <div class="hotel-meta">
        ${rating ? `<span>⭐ ${rating}${h.reviews ? ' · ' + h.reviews.toLocaleString() + ' reviews' : ''}</span>` : ''}
        <span>📍 ${params.venueName || params.city}</span>
        ${price ? `<span>From ${price}</span>` : ''}
      </div>
      ${params.venueLat && h.lat ? (() => {
        const km = haversineKm(params.venueLat, params.venueLng, h.lat, h.lng);
        return `<div><span class="distance-badge">📍 ${km < 1 ? (km*1000).toFixed(0)+' meters' : km.toFixed(1)+' km'} from ${params.venueName}</span></div>`;
      })() : ''}
      <div id="team-banner-${hotelId}" style="margin-bottom:12px;padding:10px 14px;background:#f9fafb;border-radius:8px;font-size:0.9rem;color:#6b7280;">⏳ Checking room availability for your team...</div>
      <div class="share-row">
        <button class="btn-copy-share" onclick="openSharePage(buildShareUrl('${hotelId}','${encodeURIComponent(h.name)}','${params.checkin}','${params.checkout}','${params.rooms}','${encodeURIComponent(h.photo||'')}',${JSON.stringify(shareProviders)}), this)">
          🔗 Share with Team
        </button>
      </div>
    </div>
  `;
  resultsGrid.appendChild(card);

  // Load real availability async
  fetch(`/api/hotel-availability?name=${encodeURIComponent(h.name)}&city=${encodeURIComponent(params.city)}&checkin=${params.checkin}&checkout=${params.checkout}&rooms=${params.rooms}`)
    .then(r => r.json())
    .then(avail => {
      console.log('[Availability]', h.name, avail);
      const banner = document.getElementById(`team-banner-${hotelId}`);
      const cardEl = document.getElementById(`hotel-card-${hotelId}`);
      const needed = parseInt(params.rooms) || 1;

      if (!avail.available || avail.sufficient === false) {
        // Not enough rooms across all providers — hide card
        if (cardEl) cardEl.style.display = 'none';
      } else {
        // Sufficient rooms confirmed — show banner
        if (banner) {
          const parts = [];
          if (avail.bookingRooms > 0) parts.push(`Booking.com: ${avail.bookingRooms}`);
          if (avail.agodaRooms > 0)   parts.push(`Agoda: ${avail.agodaRooms}`);
          const detail = parts.length ? ` (${parts.join(', ')})` : '';
          banner.innerHTML = `<span style="color:#16a34a;font-weight:700;">✅ ${avail.rooms}+ rooms available across providers${detail} — enough for your team of ${needed}</span>`;
          banner.style.display = 'block';
        }
      }
      providers.forEach(p => {
        const el = document.getElementById(`avail-${hotelId}-${p.name.replace(/\s/g,'')}`);
        if (!el) return;
        if (avail.available === false) {
          el.innerHTML = '<span style="color:#ef4444">Sold out</span>';
        } else if (avail.rooms !== null && avail.rooms !== undefined) {
          el.innerHTML = `✅ ${avail.rooms}+ rooms`;
        } else if (avail.tier) {
          el.innerHTML = `✅ ${avail.tier}+ rooms`;
        } else if (avail.available) {
          el.innerHTML = '✅ Available';
        } else {
          el.innerHTML = 'Check site';
        }
      });
    })
    .catch(() => {
      providers.forEach(p => {
        const el = document.getElementById(`avail-${hotelId}-${p.name.replace(/\s/g,'')}`);
        if (el) el.innerHTML = 'Check site';
      });
    });
}

function fuzzyScore(a, b) {
  const norm = s => (s||'').toLowerCase().replace(/\b(hotel|the|inn|suites|suite|resort|and|by|at)\b/g,'').replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
  const wa = norm(a).split(' ').filter(w=>w.length>2);
  const wb = norm(b).split(' ').filter(w=>w.length>2);
  if (!wa.length || !wb.length) return 0;
  return Math.round((wa.filter(w=>wb.includes(w)).length / Math.max(wa.length,wb.length))*100);
}

// ── Tiered availability check for Booking.com ────────────────────────────────
async function checkBookingAvailability(hotelId, checkin, checkout, countryCode, rooms = 1) {
  const nights = checkin && checkout ? Math.max(1, (new Date(checkout) - new Date(checkin)) / 86400000) : 1;
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
      const grossVal = data.product_price_breakdown?.gross_amount?.value;
      const pricePerRoomPerNight = grossVal ? Math.round(grossVal / nights) : null;
      const price = pricePerRoomPerNight ? `$${pricePerRoomPerNight} CAD/night` : null;
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
    const [bookingAvail, hbResult, agodaAvail] = await Promise.allSettled([
      checkBookingAvailability(h.hotel_id, params.checkin, params.checkout, countryCode, params.rooms || 1),
      fetch(`/api/hotelbeds?city=${encodeURIComponent(params.city)}&checkin=${params.checkin}&checkout=${params.checkout}&rooms=5&lat=${params.lat||''}&lng=${params.lng||''}`)
        .then(r => r.json()).catch(() => ({ hotels: [] })),
      checkAgodaAvailability(h.property.name, params.checkin, params.checkout, params.agodaCityId)
    ]);

    const booking  = bookingAvail.status === 'fulfilled' ? bookingAvail.value : { available: false, tier: 0 };
    const hbHotels = hbResult.status === 'fulfilled' ? hbResult.value?.hotels || [] : [];
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
        url: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(h.property.name + ' ' + params.city)}&checkin_year=${params.checkin.split('-')[0]}&checkin_month=${parseInt(params.checkin.split('-')[1])}&checkin_monthday=${parseInt(params.checkin.split('-')[2])}&checkout_year=${params.checkout.split('-')[0]}&checkout_month=${parseInt(params.checkout.split('-')[1])}&checkout_monthday=${parseInt(params.checkout.split('-')[2])}&no_rooms=${params.rooms}&group_adults=2&selected_currency=CAD`,
      },
      {
        name: 'Hotelbeds', icon: '🟤',
        available: hbTier >= 5,
        tier: hbTier,
        price: hbPrice,
        url: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(h.property.name + ' ' + params.city)}&checkin_year=${params.checkin.split('-')[0]}&checkin_month=${parseInt(params.checkin.split('-')[1])}&checkin_monthday=${parseInt(params.checkin.split('-')[2])}&checkout_year=${params.checkout.split('-')[0]}&checkout_month=${parseInt(params.checkout.split('-')[1])}&checkout_monthday=${parseInt(params.checkout.split('-')[2])}&no_rooms=${params.rooms}&group_adults=2&selected_currency=CAD`,
      },

      {
        name: 'Agoda', icon: '🟢',
        available: agoda.available,
        tier: agoda.tier,
        price: agoda.price,
        url: `https://www.agoda.com/search?q=${encodeURIComponent(h.property.name)}&checkIn=${params.checkin}&checkOut=${params.checkout}&rooms=${params.rooms}&adults=2&los=${Math.max(1,Math.round((new Date(params.checkout)-new Date(params.checkin))/86400000))}`,
      },
      {
        name: 'Expedia', icon: '🟡', available: null, tier: null, price: null,
        url: `https://www.expedia.ca/Hotel-Search?destination=${encodeURIComponent(h.property.name + ' ' + params.city)}&startDate=${params.checkin}&endDate=${params.checkout}&rooms=${params.rooms}&adults=2`,
      },
      {
        name: 'Hotels.com', icon: '🔴',
        available: booking.available || null,
        tier: booking.tier || null,
        price: booking.price || null,  // Hotels.com shares Expedia/Booking inventory — use Booking price as proxy
        url: `https://www.hotels.com/search.do?q-destination=${encodeURIComponent(h.property.name + ' ' + params.city)}&q-check-in=${params.checkin}&q-check-out=${params.checkout}&q-rooms=${params.rooms}`,
      },
      {
        name: 'Kayak',      icon: '🟠', available: null, tier: null, price: null,
        url: `https://www.kayak.com/hotels/${encodeURIComponent(params.city)}/${params.checkin}/${params.checkout}/${params.rooms}rooms/?q=${encodeURIComponent(h.property.name)}`,
      },
      {
        name: 'Trivago',    icon: '⚪', available: null, tier: null, price: null,
        url: `https://www.trivago.ca/?search[destination]=${encodeURIComponent(h.property.name + ' ' + params.city)}&search[arrivalDate]=${params.checkin}&search[departureDate]=${params.checkout}&search[roomsCount]=${params.rooms}`,
      },
    ];

    // Only show providers with confirmed availability
    const visible = providers.filter(p => p.available === true);
    // Update share providers once availability is known
    window['shareProviders_' + h.hotel_id] = visible.map(p => ({ name: p.name, price: p.price, url: p.url }));

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
            ${p.available ? (p.tier ? `✅ At least ${p.tier} rooms available` : '✅ Available') : '<span class="check-site">Check site</span>'}
          </span>
          <span class="provider-price">${p.price || '<span style="color:#9ca3af;font-size:0.82rem;">See site</span>'}</span>

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

function buildShareUrl(hotelId, name, checkin, checkout, rooms, photo, providers) {
  const base = window.location.origin + '/share.html';
  const p = new URLSearchParams({ hotel: hotelId, name: decodeURIComponent(name), checkin, checkout, rooms, photo: decodeURIComponent(photo), city: currentParams.city || '' });
  if (providers && providers.length) p.set('providers', JSON.stringify(providers));
  return base + '?' + p.toString();
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
  const overlay = document.getElementById('search-overlay');
  if (overlay) overlay.classList.remove('active');
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
