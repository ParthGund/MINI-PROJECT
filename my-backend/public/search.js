/**
 * search.js — RailConnect Train Search Module
 *
 * Responsibilities:
 *  - Auth guard: redirect to index.html if no JWT
 *  - Load user info into sidebar from JWT payload
 *  - Call GET /api/trains?source=&destination=
 *  - Render train cards from API response
 *  - Navigate to booking-mode.html?trainId=<id> on "Book"
 */

'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
const API_BASE = '';   // Same origin — no CORS issues when served from localhost:3000
const TOKEN_KEY = 'rc_token';   // Must match script.js
const USER_KEY = 'rc_user';

// ── Auth Guard ───────────────────────────────────────────────────────────────
const token = localStorage.getItem(TOKEN_KEY);
if (!token) {
  window.location.replace('index.html');
}

// ── Populate sidebar user chip — read from rc_user cache (set by script.js) ──
function initUserChip() {
  try {
    const cached = JSON.parse(localStorage.getItem(USER_KEY));
    if (!cached) return;
    const name = cached.name || 'User';
    const email = cached.email || '';
    document.getElementById('sidebar-avatar').textContent = name.charAt(0).toUpperCase();
    document.getElementById('sidebar-name').textContent = name;
    document.getElementById('sidebar-email').textContent = email;
  } catch { /* silently skip */ }
}

// ── Logout ───────────────────────────────────────────────────────────────────
function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.location.replace('index.html');
}

// ── Utility: show/hide inline error ─────────────────────────────────────────
function showError(msg) {
  const el = document.getElementById('search-error');
  const txt = document.getElementById('search-error-text');
  txt.textContent = msg;
  el.classList.remove('hidden');
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function hideError() {
  document.getElementById('search-error').classList.add('hidden');
}

// ── Swap source ↔ destination ────────────────────────────────────────────────
function swapInputs() {
  const src = document.getElementById('src-input');
  const dest = document.getElementById('dest-input');
  [src.value, dest.value] = [dest.value, src.value];

  // Brief scale animation on the swap button
  const btn = document.getElementById('swap-btn');
  btn.style.transform = 'rotate(180deg)';
  setTimeout(() => btn.style.transform = '', 300);
}

// ── Render skeleton loader ───────────────────────────────────────────────────
function renderSkeleton() {
  const skeletons = Array.from({ length: 3 }, () => `
    <div class="train-card" style="animation:none">
      <div class="skeleton" style="height:22px;width:55%;margin-bottom:14px"></div>
      <div class="skeleton" style="height:16px;width:80%;margin-bottom:18px"></div>
      <div style="display:flex;gap:10px;margin-bottom:16px">
        <div class="skeleton" style="height:28px;width:90px"></div>
        <div class="skeleton" style="height:28px;width:90px"></div>
        <div class="skeleton" style="height:28px;width:80px"></div>
      </div>
      <div style="display:flex;justify-content:flex-end">
        <div class="skeleton" style="height:38px;width:110px"></div>
      </div>
    </div>
  `).join('');

  document.getElementById('results-area').innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px">
      <div class="spin" style="border-color:rgba(14,165,233,.3);border-top-color:#0ea5e9"></div>
      <span style="font-size:14px;color:rgba(148,163,184,.7)">Searching trains…</span>
    </div>
    <div style="display:grid;gap:16px">${skeletons}</div>
  `;
}

// ── Format duration ──────────────────────────────────────────────────────────
function formatDuration(dep, arr) {
  try {
    const [dh, dm] = dep.split(':').map(Number);
    const [ah, am] = arr.split(':').map(Number);
    let mins = (ah * 60 + am) - (dh * 60 + dm);
    if (mins < 0) mins += 24 * 60;
    const h = Math.floor(mins / 60), m = mins % 60;
    return `${h}h ${m > 0 ? m + 'm' : ''}`.trim();
  } catch { return '—' }
}

// ── Render one train card ────────────────────────────────────────────────────
function renderTrainCard(train, index) {
  const avail = train.availableSeats ?? 'N/A';
  const total = train.totalSeats ?? 40;
  const pillClass = avail <= 5 ? 'seat-pill seat-pill-low' : 'seat-pill';
  const duration = formatDuration(train.departure, train.arrival);

  return `
    <div class="train-card" style="animation-delay:${index * 80}ms">
      <!-- Header row -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        <div>
          <div style="font-size:18px;font-weight:800;color:#f1f5f9;margin-bottom:2px">${escHtml(train.name)}</div>
          <div style="font-size:12px;font-weight:600;color:rgba(148,163,184,.5);letter-spacing:.05em;text-transform:uppercase">${escHtml(train.id)}</div>
        </div>
        <span class="${pillClass}" style="flex-shrink:0">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4l2 2"/>
          </svg>
          ${avail} / ${total} seats
        </span>
      </div>

      <!-- Route row -->
      <div class="route-line">
        <span style="min-width:80px;text-align:right">${escHtml(train.source)}</span>
        <div class="route-bar"></div>
        <span style="min-width:80px">${escHtml(train.destination)}</span>
      </div>

      <!-- Time row -->
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px;margin-bottom:18px">
        <span class="time-badge time-dep">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Dep: ${escHtml(train.departure)}
        </span>
        <span class="time-badge time-arr">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Arr: ${escHtml(train.arrival)}
        </span>
        ${duration ? `<span style="font-size:12px;color:rgba(148,163,184,.5)">⏱ ${duration}</span>` : ''}
      </div>

      <!-- Footer row: single Book button routes through booking-mode selection -->
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap">
        <button
          id="book-btn-${escHtml(train.id)}"
          class="view-btn"
          onclick="goToBookingMode('${escHtml(train.id)}')"
          ${avail === 0 ? 'disabled style=\"opacity:.4;cursor:not-allowed\"' : ''}
        >
          Book
        </button>
      </div>
    </div>
  `;
}

// ── Render results ────────────────────────────────────────────────────────────
function renderResults(trains) {
  const area = document.getElementById('results-area');

  if (!trains || trains.length === 0) {
    area.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🚉</span>
        <h3 style="font-size:20px;font-weight:700;color:#e2e8f0;margin-bottom:8px">No trains found</h3>
        <p style="font-size:14px;color:rgba(148,163,184,.6);max-width:320px;margin:0 auto">
          We couldn't find any trains for the selected route.<br/>
          Try different source or destination cities.
        </p>
      </div>
    `;
    return;
  }

  area.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:17px;font-weight:700;color:#f1f5f9">${trains.length} Train${trains.length > 1 ? 's' : ''} Found</div>
        <div style="font-size:13px;color:rgba(148,163,184,.6);margin-top:2px">Select a train to view and choose seats</div>
      </div>
    </div>
    <div style="display:grid;gap:16px">
      ${trains.map((t, i) => renderTrainCard(t, i)).join('')}
    </div>
  `;
}

// ── Navigate to booking-mode page (queue timer + phase detection) ─────────────
// booking-mode.js reads the server phase (waiting / queue / normal) and shows
// the 2-minute countdown before redirecting to passenger-details.html with ?mode=queue|normal
function goToBookingMode(trainId) {
  window.location.href = `booking-mode.html?trainId=${encodeURIComponent(trainId)}`;
}

// Aliases kept in case referenced elsewhere
function goToSeats(trainId) { goToBookingMode(trainId); }
function goToQueue(trainId) { goToBookingMode(trainId); }

// ── XSS guard ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Main search function ─────────────────────────────────────────────────────
async function searchTrains() {
  hideError();

  const source = document.getElementById('src-input').value.trim();
  const destination = document.getElementById('dest-input').value.trim();
  const btn = document.getElementById('search-btn');

  // Show loading
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>Searching…';
  renderSkeleton();

  try {
    const params = new URLSearchParams();
    if (source) params.set('source', source);
    if (destination) params.set('destination', destination);

    const res = await fetch(`${API_BASE}/api/trains?${params}`, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Server error (${res.status})`);
    }

    const data = await res.json();
    renderResults(data.trains || []);

  } catch (err) {
    document.getElementById('results-area').innerHTML = '';
    showError(err.message || 'Failed to fetch trains. Please try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"
        style="display:inline;vertical-align:middle;margin-right:8px">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.4-4.4"/>
      </svg>Search Trains
    `;
  }
}

// ── Allow Enter key to trigger search ────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchTrains();
});

// ── Boot ─────────────────────────────────────────────────────────────────────
initUserChip();

// Auto-search if query params were passed (e.g. from dashboard)
(function autoSearch() {
  const p = new URLSearchParams(window.location.search);
  const src = p.get('source');
  const dst = p.get('destination');
  if (src && dst) {
    document.getElementById('src-input').value = src;
    document.getElementById('dest-input').value = dst;
    searchTrains();
  }
})();
