// TeamLodgr Search — Browser-side, calls RapidAPI directly
// Booking.com via RapidAPI (booking-com15)

const RAPIDAPI_KEY = '3173251728msha891fafe5abe622p17d02fjsn272b51fed579';
const RAPIDAPI_HOST = 'booking-com15.p.rapidapi.com';

// Affiliate IDs — update when approved
const BOOKING_AFFILIATE_ID = '';   // e.g. 'YOUR_BOOKING_AID'
const EXPEDIA_AFFILIATE_ID = '';   // e.g. 'YOUR_EXPEDIA_ID'

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

    // Show results section + loading
    resultsSection.style.display = 'block';
    loadingEl.style.display = 'flex';
    resultsGrid.innerHTML = '';
    resultsSection.scrollIntoView({ behavior: 'smooth' });

    try {
      // Step 1: Get destination ID
      const destRes = await fetch(
        `https://booking-com15.p.rapidapi.com/api/v1/hotels/searchDestination?query=${encodeURIComponent(city)}`,
        { headers: { 'x-rapidapi-host': RAPIDAPI_HOST, 'x-rapidapi-key': RAPIDAPI_KEY } }
      );
      const destData = await destRes.json();
      const dest = destData.data?.[0];

      if (!dest) {
        showError('No results found for that city. Try a different location.');
        return;
      }

      // Step 2: Search hotels
      const searchRes = await fetch(
        `https://booking-com15.p.rapidapi.com/api/v1/hotels/searchHotels?dest_id=${dest.dest_id}&search_type=${dest.search_type}&arrival_date=${checkin}&departure_date=${checkout}&adults=2&room_qty=${rooms}&units=metric&languagecode=en-us&currency_code=CAD&sort_by=popularity`,
        { headers: { 'x-rapidapi-host': RAPIDAPI_HOST, 'x-rapidapi-key': RAPIDAPI_KEY } }
      );
      const searchData = await searchRes.json();

      loadingEl.style.display = 'none';

      const hotels = searchData.data?.hotels;
      if (!hotels || hotels.length === 0) {
        showError('No hotels found with availability for those dates. Try different dates.');
        return;
      }

      renderResults(hotels.slice(0, 5), { city, checkin, checkout, rooms });

    } catch (err) {
      showError('Search failed. Please try again.');
      console.error(err);
    }
  });
}

function renderResults(hotels, params) {
  loadingEl.style.display = 'none';
  resultsGrid.innerHTML = '';

  // Results header
  const header = document.createElement('div');
  header.style.cssText = 'margin-bottom:20px;';
  header.innerHTML = `<p style="color:#6b7280;font-size:0.95rem;">Found <strong style="color:#0d1b3e;">${hotels.length} hotels</strong> in ${params.city} with ${params.rooms} rooms available</p>`;
  resultsGrid.appendChild(header);

  hotels.forEach((h, i) => {
    const prop = h.property;
    const price = prop.priceBreakdown?.grossPrice?.value
      ? `$${Math.round(prop.priceBreakdown.grossPrice.value)}`
      : 'Check price';
    const rating = prop.reviewScore ? `${prop.reviewScore}/10` : 'N/A';
    const reviewWord = prop.reviewScoreWord || '';
    const photo = prop.photoUrls?.[0] || '';

    // Build booking URL with affiliate ID
    const bookingUrl = BOOKING_AFFILIATE_ID
      ? `https://www.booking.com/hotel/${h.hotel_id}.html?aid=${BOOKING_AFFILIATE_ID}&checkin=${params.checkin}&checkout=${params.checkout}&no_rooms=${params.rooms}`
      : `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(params.city)}&checkin=${params.checkin}&checkout=${params.checkout}&no_rooms=${params.rooms}&group_adults=2`;

    // Generate share link
    const shareUrl = `${window.location.origin}/share.html?hotel=${h.hotel_id}&name=${encodeURIComponent(prop.name)}&checkin=${params.checkin}&checkout=${params.checkout}&rooms=${params.rooms}&price=${Math.round(prop.priceBreakdown?.grossPrice?.value || 0)}`;

    const card = document.createElement('div');
    card.className = 'hotel-card';
    card.innerHTML = `
      ${photo ? `<img src="${photo}" alt="${prop.name}" class="hotel-photo" onerror="this.style.display='none'"/>` : ''}
      <div class="hotel-body">
        <div class="hotel-rank-name">
          <span class="hotel-rank">#${i + 1}</span>
          <h3 class="hotel-name">${prop.name}</h3>
        </div>
        <div class="hotel-meta">
          <span>⭐ ${rating} ${reviewWord ? `· ${reviewWord}` : ''}</span>
          <span>📍 ${params.city}</span>
          <span>🛏️ ${params.rooms} rooms</span>
        </div>
        <div class="hotel-price-row">
          <div class="hotel-price">${price} <span class="hotel-price-label">CAD / night</span></div>
          <span class="hotel-source">via Booking.com</span>
        </div>
      </div>
      <div class="hotel-actions">
        <button class="btn-share-card" onclick="copyShareLink('${shareUrl}', this)">🔗 Share Link</button>
        <a href="${bookingUrl}" target="_blank" class="btn-book-card">Book Now →</a>
      </div>
    `;
    resultsGrid.appendChild(card);
  });
}

function copyShareLink(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    btn.textContent = '✅ Copied!';
    setTimeout(() => btn.textContent = '🔗 Share Link', 2500);
    showToast('Link copied! Share it with your team 🎉');
  });
}

function showError(msg) {
  loadingEl.style.display = 'none';
  resultsGrid.innerHTML = `<p style="color:#e74c3c;padding:20px 0;">${msg}</p>`;
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
