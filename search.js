// TeamLodgr — Hotel Search & Room Aggregation
// Tiered availability: queries at 5, 10, 20 rooms — shows highest confirmed tier

const RAPIDAPI_KEY      = '3173251728msha891fafe5abe622p17d02fjsn272b51fed579';
const BOOKING_HOST      = 'booking-com15.p.rapidapi.com';
// Priceline RapidAPI removed
// Agoda RapidAPI removed — deeplink only
const HEADERS_BOOKING   = { 'x-rapidapi-host': BOOKING_HOST,   'x-rapidapi-key': RAPIDAPI_KEY };

const TIERS = [20, 10, 5]; // Check highest first
let pricelineCache = {};

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

    const city           = document.getElementById('city').value.trim();
    const checkin        = document.getElementById('checkin').value;
    const checkout       = document.getElementById('checkout').value;
    const rooms          = parseInt(document.getElementById('rooms').value);
    const tournamentName = (document.getElementById('tournament-name')?.value || '').trim();
    const organizerName  = (document.getElementById('organizer-name')?.value || '').trim();
    const organizerEmail = (document.getElementById('organizer-email')?.value || '').trim();

    if (!city) { alert('Please enter a destination city.'); return; }
    if (!checkin || !checkout || !rooms) { alert('Please fill in all fields.'); return; }

    currentParams = { city, checkin, checkout, rooms, tournamentName, organizerName, organizerEmail };

    resultsSection.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Hide nav + search form so organizer can focus on results
    const mainNav = document.getElementById('main-nav');
    if (mainNav) mainNav.style.display = 'none';
    const searchSection = document.getElementById('search');
    if (searchSection) searchSection.style.display = 'none';
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
      stepActive('Searching for hotels in ' + city + '...', 'Looking up hotels with enough rooms for your group');
      const serpRes  = await fetch(`/api/hotels-search?city=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&rooms=${rooms}`);
      const serpData = await serpRes.json();
      if (!serpData.hotels?.length) { showError('No hotels found. Try different dates or city.'); return; }

      stepActive('Found some options! Checking prices...', 'Getting the best rates from Booking.com, Hotels.com, Agoda and more');

      // Map SerpApi results into the same format the rest of the code expects
      const hotels = serpData.hotels;

      loadingEl.style.display = 'none';
      if (overlay) overlay.classList.remove('active');

      const locationLabel = currentParams.venueName
        ? `near <strong>${currentParams.venueName}</strong>, ${city}`
        : `in <strong>${city}</strong>`;

      resultsGrid.innerHTML = `
        <div class="results-summary" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span>Hotels ${locationLabel} &nbsp;·&nbsp; ${formatDate(checkin)} → ${formatDate(checkout)} &nbsp;·&nbsp; <strong>${rooms} rooms needed</strong></span>
          <button onclick="location.reload()" style="background:none;border:1px solid #d1d5db;border-radius:6px;padding:6px 14px;font-size:0.85rem;cursor:pointer;color:#374151;">&#8592; New Search</button>
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
            pricelineCache = {};

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

  const hLat = prop.latitude || prop.lat || null;
  const hLng = prop.longitude || prop.lng || prop.lon || null;

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
      ${params.venueLat && hLat ? (() => {
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
    ${hLat ? `<div class="hotel-map-panel" id="map-${h.hotel_id}"></div>` : ''}
  `;
  // Store provider data for share URL building (set before appending)
  window['shareProviders_' + h.hotel_id] = [];
  resultsGrid.appendChild(card);
  // Init map after card is in DOM
  if (hLat) {
    initHotelMap(`map-${h.hotel_id}`, hLat, hLng, prop.name,
      params.venueLat || null, params.venueLng || null, params.venueName || null);
  }
}



// ── Shared fuzzy scorer ───────────────────────────────────────────────────────
// ── SerpApi hotel card renderer ─────────────────────────────────────────────
function renderSerpHotelCard(h, params) {
  const stars   = h.stars ? '★'.repeat(Math.min(h.stars, 5)) : '';
  const price   = h.pricePerNight ? `$${h.pricePerNight} CAD/night` : '';
  const rating  = h.rating ? `${h.rating}/5` : '';
  const shareToken = Math.random().toString(36).slice(2);

  // Build provider booking URLs with affiliate links
  const _q        = encodeURIComponent(h.name + ', ' + params.city);
  const bookingUrl = `https://www.booking.com/searchresults.html?ss=${_q}&checkin=${params.checkin}&checkout=${params.checkout}&no_rooms=${params.rooms}&group_adults=2&selected_currency=CAD`;
  const hotelsUrl  = `https://www.anrdoezrs.net/click-101756333-15042852?url=${encodeURIComponent('https://www.hotels.com/Hotel-Search?destination=' + _q + '&startDate=' + params.checkin + '&endDate=' + params.checkout + '&adults=2&rooms=' + params.rooms)}`;
  const expediaUrl = `https://www.dpbolvw.net/click-101756333-13859169?url=${encodeURIComponent('https://www.expedia.ca/Hotels/search?q=' + _q + '&startDate=' + params.checkin + '&endDate=' + params.checkout + '&rooms=' + params.rooms + '&adults=2')}`;

  const _agodaLos = Math.max(1, Math.round((new Date(params.checkout) - new Date(params.checkin)) / 86400000));
  const agodaUrl  = `https://www.agoda.com/search?textToSearch=${_q}&checkIn=${params.checkin}&los=${_agodaLos}&rooms=1&adults=2&currency=CAD&hl=en-us`;
  const kayakUrl   = `https://www.kayak.com/hotels/${encodeURIComponent(params.city)}/${params.checkin}/${params.checkout}/${params.rooms}rooms/?q=${encodeURIComponent(h.name)}`;

  // Detect brand and build direct hotel brand URL
  function getBrandUrl(name, checkin, checkout, rooms) {
    const n  = (name || '').toLowerCase();
    const ci = checkin; const co = checkout; const r = rooms;
    const c  = encodeURIComponent(params.city);

    // Hilton family — correct format: /en/hotels/?locationQuery=CITY&arrivalDate=YYYY-MM-DD&departureDate=YYYY-MM-DD
    if (n.includes('hilton') || n.includes('hampton inn') || n.includes('doubletree') || n.includes('embassy suites') || n.includes('homewood') || n.includes('home2') || n.includes('curio') || n.includes('tapestry'))
      return `https://www.hilton.com/en/hotels/?locationQuery=${c}&arrivalDate=${ci}&departureDate=${co}&numAdults=2&numRooms=${r}`;

    // Marriott family — correct format: /search/findHotels.mi
    if (n.includes('marriott') || n.includes('courtyard') || n.includes('fairfield') || n.includes('residence inn') || n.includes('springhill') || n.includes('towneplace') || n.includes('westin') || n.includes('sheraton') || n.includes('w hotel') || n.includes('renaissance'))
      return `https://www.marriott.com/search/findHotels.mi?searchType=InCity&location=${c}&fromDate=${ci}&toDate=${co}&numberOfRooms=${r}&numberOfGuests=2`;

    // Hyatt family
    if (n.includes('hyatt') || n.includes('andaz') || n.includes('park hyatt') || n.includes('grand hyatt') || n.includes('aloft'))
      return `https://www.hyatt.com/search/${c}?checkinDate=${ci}&checkoutDate=${co}&rooms=${r}&adults=2`;

    // IHG family
    if (n.includes('ihg') || n.includes('holiday inn') || n.includes('crowne plaza') || n.includes('intercontinental') || n.includes('even hotel') || n.includes('staybridge'))
      return `https://www.ihg.com/hotels/us/en/find-hotels/hotel/rooms?qDest=${c}&qCiD=${ci}&qCoD=${co}&qRms=${r}&qAdlt=2`;

    // Best Western
    if (n.includes('best western'))
      return `https://www.bestwestern.com/en_US/book/hotels-in.html?city=${c}&checkIn=${ci}&checkOut=${co}&rooms=${r}&adults=2`;

    // Wyndham family (Days Inn, Super 8, La Quinta, Ramada, Howard Johnson)
    if (n.includes('wyndham') || n.includes('days inn') || n.includes('super 8') || n.includes('la quinta') || n.includes('ramada') || n.includes('howard johnson') || n.includes('microtel') || n.includes('travelodge'))
      return `https://www.wyndhamhotels.com/search?checkInDate=${ci}&checkOutDate=${co}&query=${c}&numberOfRooms=${r}&adults=2`;

    // Choice Hotels (Comfort Inn, Quality Inn, Econo Lodge, etc.)
    if (n.includes('comfort inn') || n.includes('quality inn') || n.includes('econo lodge') || n.includes('sleep inn') || n.includes('clarion') || n.includes('rodeway'))
      return `https://www.choicehotels.com/hotels?checkInDate=${ci}&checkOutDate=${co}&destination=${c}&rooms=${r}&adults=2`;

    return null;
  }
  const brandUrl = getBrandUrl(h.name, params.checkin, params.checkout, params.rooms);

  // Pull provider-specific URLs from SerpApi — these are direct hotel links, not generic searches
  const serpHotels  = h.providers?.find(p => /hotels\.com/i.test(p.name || p.url || ''));
  const serpExpedia = h.providers?.find(p => /expedia/i.test(p.name || p.url || ''));
  const serpAgoda   = h.providers?.find(p => /agoda/i.test(p.name || p.url || ''));

  // Wrap serp URLs with affiliate tracking if available
  function wrapHotels(url) {
    if (!url) return hotelsUrl;
    const isCA = /\.ca\b|canada/i.test(url + params.city);
    const base = isCA ? 'https://www.tkqlhce.com/click-101756333-15042853' : 'https://www.anrdoezrs.net/click-101756333-15042852';
    return `${base}?url=${encodeURIComponent(url)}`;
  }
  function wrapExpedia(url) {
    if (!url) return expediaUrl;
    const isCA = /expedia\.ca|canada/i.test(url + params.city);
    const base = isCA ? 'https://www.dpbolvw.net/click-101756333-13859169' : 'https://www.kqzyfj.com/click-101756333-15042831';
    return `${base}?url=${encodeURIComponent(url)}`;
  }

  const agodaFinalUrl   = serpAgoda?.url   || agodaUrl;
  const hotelseFinalUrl = serpHotels?.url  ? wrapHotels(serpHotels.url)   : hotelsUrl;
  const expediaFinalUrl = serpExpedia?.url ? wrapExpedia(serpExpedia.url) : expediaUrl;

  const providers = [
    { name: 'Booking.com', icon: '🔵', price: price,             url: bookingUrl      },
    { name: 'Hotels.com',  icon: '🔴', price: serpHotels?.price  || price, url: hotelseFinalUrl },
    { name: 'Expedia',     icon: '🟡', price: serpExpedia?.price || price, url: expediaFinalUrl },
    { name: 'Agoda',       icon: '🟢', price: serpAgoda?.price   || null,  url: agodaFinalUrl   },
  ];
  if (brandUrl) providers.unshift({ name: 'Book Direct', icon: '🏨', price: price, url: brandUrl });

  // Add any SerpApi provider links that have prices (excluding already-listed ones)
  h.providers?.forEach(p => {
    if (p.url && p.name && !providers.find(x => x.name.toLowerCase().includes(p.name.toLowerCase().slice(0,5)))) {
      providers.push({ name: p.name, icon: '⚪', price: p.price || price, url: p.url });
    }
  });

  // Use the real Booking.com hotel_id so we can deep-link directly to the hotel
  const hotelId = h.hotel_id || ('serp_' + Math.random().toString(36).slice(2));
  const shareProviders = providers.map(p => ({ name: p.name, price: p.price, url: p.url }));
  window['shareProviders_' + hotelId] = shareProviders;

  const card = document.createElement('div');
  card.className = 'hotel-card loading';
  card.id = `hotel-card-${hotelId}`;
  card.innerHTML = `
    <div class="hotel-loading-badge" id="loading-badge-${hotelId}"><div class="spin"></div> Checking availability...</div>
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
      <div id="team-banner-${hotelId}" style="margin-bottom:12px;padding:10px 14px;background:#f9fafb;border-radius:8px;font-size:0.9rem;color:#6b7280;display:none;"></div>
      <div class="providers-table" id="providers-table-${hotelId}" style="display:none;">
        <div class="providers-header">
          <span>Booking Site</span><span>Availability</span><span>Price/night</span>
        </div>
        ${providers.map(p => `
          <div class="provider-row has-count">
            <span class="provider-name">${p.icon} ${p.name}</span>
            <span class="provider-rooms avail" id="avail-${hotelId}-${p.name.replace(/\s/g,'')}">⏳</span>
            <span class="provider-price">${p.price || ''}</span>
          </div>
        `).join('')}
      </div>
      <div class="share-row" style="margin-top:auto;padding-top:16px;">
        <button class="btn-copy-share" style="width:100%;padding:13px 20px;font-size:1rem;background:#0d1b3e;" onclick="openSharePage(buildShareUrl('${hotelId}','${encodeURIComponent(h.name)}','${params.checkin}','${params.checkout}','${params.rooms}','${encodeURIComponent(h.photo||'')}',shareProviders_${hotelId},'${encodeURIComponent(h.serpLink||'')}'), this)">
          🔗 Share with Team
        </button>
      </div>
    </div>
    ${h.lat ? `<div class="hotel-map-panel" id="map-${hotelId}"></div>` : ''}
  `;
  resultsGrid.appendChild(card);
  // Init map after card is in DOM
  if (h.lat) {
    initHotelMap(`map-${hotelId}`, h.lat, h.lng, h.name,
      params.venueLat || null, params.venueLng || null, params.venueName || null);
  }

  // Load real availability async
  fetch(`/api/hotel-availability?name=${encodeURIComponent(h.name)}&city=${encodeURIComponent(params.city)}&checkin=${params.checkin}&checkout=${params.checkout}&rooms=${params.rooms}`)
    .then(r => r.json())
    .then(avail => {
      console.log('[Availability]', h.name, avail);
      const banner    = document.getElementById(`team-banner-${hotelId}`);
      const cardEl    = document.getElementById(`hotel-card-${hotelId}`);
      const tableEl   = document.getElementById(`providers-table-${hotelId}`);
      const badge     = document.getElementById(`loading-badge-${hotelId}`);
      const needed    = parseInt(params.rooms) || 1;

      // Always remove loading state first
      if (cardEl) cardEl.classList.remove('loading');
      if (badge)  badge.remove();

      if (avail.available && avail.sufficient !== false) {
        // Sufficient rooms confirmed — show table + banner
        if (tableEl) tableEl.style.display = '';
        if (banner) {
          banner.innerHTML = `<span style="color:#16a34a;font-weight:700;">✅ ${avail.rooms}+ rooms confirmed for your team of ${needed}</span>`;
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
      const cardEl = document.getElementById(`hotel-card-${hotelId}`);
      const badge  = document.getElementById(`loading-badge-${hotelId}`);
      if (cardEl) cardEl.classList.remove('loading');
      if (badge)  badge.remove();
      providers.forEach(p => {
        const el = document.getElementById(`avail-${hotelId}-${p.name.replace(/\s/g,'')}`);
        if (el) el.innerHTML = 'Check site';
      });
    });
}

// ── Hotel map initialiser (Leaflet) ─────────────────────────────────────────
function initHotelMap(containerId, hotelLat, hotelLng, hotelName, venueLat, venueLng, venueName) {
  // Small delay so the card is fully painted before Leaflet measures the container
  setTimeout(() => {
    const el = document.getElementById(containerId);
    if (!el || typeof L === 'undefined') return;

    // Custom small icons
    const hotelIcon = L.divIcon({
      className: '',
      html: '<div style="background:#1a6fd4;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.3);">🏨</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    const venueIcon = L.divIcon({
      className: '',
      html: '<div style="background:#e55;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.3);">🏒</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const points = [[hotelLat, hotelLng]];
    if (venueLat) points.push([venueLat, venueLng]);

    // Center on midpoint between hotel and venue (or just hotel)
    const centerLat = venueLat ? (hotelLat + venueLat) / 2 : hotelLat;
    const centerLng = venueLng ? (hotelLng + venueLng) / 2 : hotelLng;

    const map = L.map(el, {
      center: [centerLat, centerLng],
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
      dragging: false,
      doubleClickZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    L.marker([hotelLat, hotelLng], { icon: hotelIcon })
      .addTo(map)
      .bindTooltip(hotelName, { permanent: false, direction: 'top' });

    if (venueLat) {
      L.marker([venueLat, venueLng], { icon: venueIcon })
        .addTo(map)
        .bindTooltip(venueName || 'Venue', { permanent: false, direction: 'top' });

      // Fit both pins with padding
      map.fitBounds(L.latLngBounds(points), { padding: [20, 20], maxZoom: 15 });
    }

    // Force Leaflet to recalculate size after layout
    setTimeout(() => map.invalidateSize(), 100);

    // Add compact legend
    const legend = document.createElement('div');
    legend.className = 'map-legend';
    legend.innerHTML = '🏨 Hotel' + (venueLat ? '<br>🏒 Venue' : '');
    el.appendChild(legend);
  }, 50);
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
    const [bookingAvail, hbResult] = await Promise.allSettled([
      checkBookingAvailability(h.hotel_id, params.checkin, params.checkout, countryCode, params.rooms || 1),
      fetch(`/api/hotelbeds?city=${encodeURIComponent(params.city)}&checkin=${params.checkin}&checkout=${params.checkout}&rooms=5&lat=${params.lat||''}&lng=${params.lng||''}`)
        .then(r => r.json()).catch(() => ({ hotels: [] }))
    ]);

    const booking  = bookingAvail.status === 'fulfilled' ? bookingAvail.value : { available: false, tier: 0 };
    const hbHotels = hbResult.status === 'fulfilled' ? hbResult.value?.hotels || [] : [];

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
        available: null, tier: null, price: null,
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

function buildShareUrl(hotelId, name, checkin, checkout, rooms, photo, providers, serpLink) {
  const base = window.location.origin + '/share.html';
  const p = new URLSearchParams({ hotel: hotelId, name: decodeURIComponent(name), checkin, checkout, rooms, photo: decodeURIComponent(photo), city: currentParams.city || '' });
  if (providers && providers.length) p.set('providers', JSON.stringify(providers));
  if (currentParams.tournamentName) p.set('tournament', currentParams.tournamentName);
  if (currentParams.organizerName)  p.set('organizer',  currentParams.organizerName);
  if (currentParams.organizerEmail) p.set('orgEmail',   currentParams.organizerEmail);
  if (serpLink) p.set('serpLink', decodeURIComponent(serpLink));
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
