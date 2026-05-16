// TeamLodgr Search Logic
// Connects to /api/search (Vercel serverless function)

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
    const rooms = document.getElementById('rooms').value;

    if (!city || !checkin || !checkout || !rooms) {
      alert('Please fill in all fields.');
      return;
    }

    // Show loading
    resultsSection.style.display = 'block';
    loadingEl.style.display = 'flex';
    resultsGrid.innerHTML = '';

    try {
      const res = await fetch(`/api/search?city=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&rooms=${rooms}`);
      const data = await res.json();

      loadingEl.style.display = 'none';

      if (!data.hotels || data.hotels.length === 0) {
        resultsGrid.innerHTML = '<p style="color:#6b7280;text-align:center;">No hotels found for those dates. Try adjusting your search.</p>';
        return;
      }

      renderResults(data.hotels, { city, checkin, checkout, rooms });

    } catch (err) {
      loadingEl.style.display = 'none';
      resultsGrid.innerHTML = '<p style="color:#e74c3c;text-align:center;">Search failed. Please try again.</p>';
    }
  });
}

function renderResults(hotels, searchParams) {
  resultsGrid.innerHTML = '';

  hotels.forEach((hotel, i) => {
    const card = document.createElement('div');
    card.className = 'hotel-card';
    card.innerHTML = `
      <div class="hotel-rank">#${i + 1}</div>
      <div class="hotel-info">
        <h3>${hotel.name}</h3>
        <div class="hotel-meta">
          <span>⭐ ${hotel.rating || 'N/A'}</span>
          <span>📍 ${hotel.address || searchParams.city}</span>
          <span>🛏️ ${hotel.availableRooms} rooms available</span>
        </div>
        <div class="hotel-price">
          From <strong>$${hotel.pricePerNight}/night</strong> per room
          <span class="hotel-source">via ${hotel.source}</span>
        </div>
      </div>
      <div class="hotel-actions">
        <button class="btn-share" onclick="shareHotel('${hotel.id}', '${encodeURIComponent(hotel.name)}')">
          🔗 Share Link
        </button>
        <a href="${hotel.bookingUrl}" target="_blank" class="btn-book">Book Now →</a>
      </div>
    `;
    resultsGrid.appendChild(card);
  });
}

function shareHotel(hotelId, hotelName) {
  // Generate shareable link
  const params = new URLSearchParams(window.location.search);
  const shareUrl = `${window.location.origin}/share.html?hotel=${hotelId}&name=${hotelName}&checkin=${params.get('checkin') || ''}&checkout=${params.get('checkout') || ''}&rooms=${params.get('rooms') || ''}`;

  // Save to Supabase (when connected)
  saveShareLink(hotelId, shareUrl);

  // Copy to clipboard
  navigator.clipboard.writeText(shareUrl).then(() => {
    showToast('Link copied! Share it with your team 🎉');
  });
}

function saveShareLink(hotelId, url) {
  // TODO: POST to /api/share to save in Supabase + start availability tracking
  console.log('Share link saved:', url);
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
