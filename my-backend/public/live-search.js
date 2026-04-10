/**
 * live-search.js — RailConnect Live Train Search Module
 *
 * Full flow:
 *   1. Debounced station autocomplete (from/to) via /api/live/stations
 *   2. Search trains between stations  via /api/live/trains
 *   3. View train schedule / route     via /api/live/train/:trainNo
 *   4. "Book Now" → redirects to existing queue system
 *
 * Does NOT use any external API for booking — only for search.
 */

'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
const API_BASE = '';
const TOKEN_KEY = 'rc_token';
const USER_KEY = 'rc_user';

// ── Auth Guard ───────────────────────────────────────────────────────────────
const token = localStorage.getItem(TOKEN_KEY);
if (!token) {
  window.location.replace('index.html');
}

// ── State ────────────────────────────────────────────────────────────────────
let fromStation = { name: '', code: '' };
let toStation = { name: '', code: '' };
let lastResults = [];

// ── Init ─────────────────────────────────────────────────────────────────────
(function init() {
  initUserChip();
  setDefaultDate();
  setupAutocomplete('from-input', 'from-dropdown', 'from-code', (s) => { fromStation = s; });
  setupAutocomplete('to-input', 'to-dropdown', 'to-code', (s) => { toStation = s; });

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#from-input') && !e.target.closest('#from-dropdown')) {
      document.getElementById('from-dropdown').classList.remove('show');
    }
    if (!e.target.closest('#to-input') && !e.target.closest('#to-dropdown')) {
      document.getElementById('to-dropdown').classList.remove('show');
    }
  });

  // Enter key triggers search
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !document.querySelector('.autocomplete-list.show')) {
      searchTrains();
    }
  });
})();

// ── Populate sidebar user chip ──────────────────────────────────────────────
function initUserChip() {
  try {
    const cached = JSON.parse(localStorage.getItem(USER_KEY));
    if (!cached) return;
    const name = cached.name || 'User';
    const email = cached.email || '';
    document.getElementById('sidebar-avatar').textContent = name.charAt(0).toUpperCase();
    document.getElementById('sidebar-name').textContent = name;
    document.getElementById('sidebar-email').textContent = email;
  } catch { /* skip */ }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.location.replace('index.html');
}

// ── Default date = today ────────────────────────────────────────────────────
function setDefaultDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1); // Default to tomorrow
  document.getElementById('date-input').value = d.toISOString().split('T')[0];
}

// ── Debounce helper ─────────────────────────────────────────────────────────
function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

// ── XSS guard ───────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Error display ───────────────────────────────────────────────────────────
function showError(msg) {
  const el = document.getElementById('search-error');
  document.getElementById('search-error-text').textContent = msg;
  el.classList.remove('hidden');
}
function hideError() {
  document.getElementById('search-error').classList.add('hidden');
}

// ═════════════════════════════════════════════════════════════════════════════
// STATION AUTOCOMPLETE
// ═════════════════════════════════════════════════════════════════════════════
function setupAutocomplete(inputId, dropdownId, hiddenId, onSelect) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);

  const fetchStations = debounce(async (query) => {
    if (query.length < 2) {
      dropdown.classList.remove('show');
      return;
    }

    dropdown.innerHTML = '<div class="autocomplete-loading"><span class="spin" style="border-color:rgba(14,165,233,.3);border-top-color:#0ea5e9;width:14px;height:14px;margin-right:6px"></span>Searching stations…</div>';
    dropdown.classList.add('show');

    try {
      const res = await fetch(`${API_BASE}/api/live/stations?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      const stations = data.stations || [];

      if (stations.length === 0) {
        dropdown.innerHTML = '<div class="autocomplete-loading">No stations found</div>';
        return;
      }

      dropdown.innerHTML = stations.map(s => `
        <div class="autocomplete-item" data-name="${esc(s.name)}" data-code="${esc(s.code)}">
          <span class="stn-name">${esc(s.name)}</span>
          <span class="stn-code">${esc(s.code)}</span>
        </div>
      `).join('');

      // Click handlers
      dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
          const name = item.dataset.name;
          const code = item.dataset.code;
          input.value = `${name} (${code})`;
          document.getElementById(hiddenId).value = code;
          onSelect({ name, code });
          dropdown.classList.remove('show');
        });
      });

    } catch (err) {
      dropdown.innerHTML = '<div class="autocomplete-loading" style="color:#fca5a5">Failed to fetch stations</div>';
    }
  }, 300);

  input.addEventListener('input', (e) => {
    fetchStations(e.target.value.trim());
  });

  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) {
      fetchStations(input.value.trim());
    }
  });
}

// ── Swap stations ───────────────────────────────────────────────────────────
function swapStations() {
  const fromInput = document.getElementById('from-input');
  const toInput = document.getElementById('to-input');
  const fromCodeEl = document.getElementById('from-code');
  const toCodeEl = document.getElementById('to-code');

  [fromInput.value, toInput.value] = [toInput.value, fromInput.value];
  [fromCodeEl.value, toCodeEl.value] = [toCodeEl.value, fromCodeEl.value];
  [fromStation, toStation] = [toStation, fromStation];

  const btn = document.getElementById('swap-btn');
  btn.style.transform = 'rotate(180deg)';
  setTimeout(() => btn.style.transform = '', 300);
}

// ═════════════════════════════════════════════════════════════════════════════
// SKELETON LOADER
// ═════════════════════════════════════════════════════════════════════════════
function renderSkeleton() {
  const count = 4;
  const skels = Array.from({ length: count }, () => `
    <div class="train-card" style="animation:none">
      <div class="skeleton" style="height:22px;width:55%;margin-bottom:14px"></div>
      <div class="skeleton" style="height:16px;width:80%;margin-bottom:18px"></div>
      <div style="display:flex;gap:10px;margin-bottom:16px">
        <div class="skeleton" style="height:28px;width:90px"></div>
        <div class="skeleton" style="height:28px;width:90px"></div>
        <div class="skeleton" style="height:28px;width:80px"></div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <div class="skeleton" style="height:38px;width:110px"></div>
        <div class="skeleton" style="height:38px;width:100px"></div>
      </div>
    </div>
  `).join('');

  document.getElementById('results-area').innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px">
      <div class="spin" style="border-color:rgba(14,165,233,.3);border-top-color:#0ea5e9"></div>
      <span style="font-size:14px;color:rgba(148,163,184,.7)">Searching trains…</span>
    </div>
    <div style="display:grid;gap:16px">${skels}</div>
  `;
}

// ═════════════════════════════════════════════════════════════════════════════
// SEARCH TRAINS
// ═════════════════════════════════════════════════════════════════════════════
async function searchTrains() {
  hideError();
  document.getElementById('train-details-area').classList.add('hidden');

  const fromCode = document.getElementById('from-code').value || fromStation.code;
  const toCode = document.getElementById('to-code').value || toStation.code;
  const date = document.getElementById('date-input').value;
  const btn = document.getElementById('search-btn');

  if (!fromCode || !toCode) {
    showError('Please select both From and To stations from the suggestions.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>Searching…';
  renderSkeleton();

  try {
    const params = new URLSearchParams({ from: fromCode, to: toCode });
    if (date) params.set('date', date);

    const res = await fetch(`${API_BASE}/api/live/trains?${params}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Server error (${res.status})`);
    }

    const data = await res.json();
    lastResults = data.trains || [];
    renderResults(lastResults, data.source, fromCode, toCode, date);

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

// ═════════════════════════════════════════════════════════════════════════════
// RENDER RESULTS
// ═════════════════════════════════════════════════════════════════════════════
function renderResults(trains, source, from, to, date) {
  const area = document.getElementById('results-area');

  if (!trains || trains.length === 0) {
    area.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🚉</span>
        <h3 style="font-size:20px;font-weight:700;color:#e2e8f0;margin-bottom:8px">No trains found</h3>
        <p style="font-size:14px;color:rgba(148,163,184,.6);max-width:360px;margin:0 auto">
          No trains found between <strong>${esc(from)}</strong> and <strong>${esc(to)}</strong>
          ${date ? ` on ${esc(date)}` : ''}.<br/>
          Try different stations or check the date.
        </p>
      </div>
    `;
    return;
  }

  const sourceClass = source === 'api' ? 'source-api' : source === 'cache' ? 'source-cache' : 'source-fallback';
  const sourceLabel = source === 'api' ? 'Live API' : source === 'cache' ? 'Cached' : 'Fallback Data';

  area.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:17px;font-weight:700;color:#f1f5f9">${trains.length} Train${trains.length > 1 ? 's' : ''} Found</div>
        <div style="font-size:13px;color:rgba(148,163,184,.6);margin-top:2px">${esc(from)} → ${esc(to)}${date ? ` · ${esc(date)}` : ''}</div>
      </div>
      <span class="source-tag ${sourceClass}">${sourceLabel}</span>
    </div>
    <div style="display:grid;gap:16px">
      ${trains.map((t, i) => renderTrainCard(t, i)).join('')}
    </div>
  `;
}

function renderTrainCard(train, index) {
  const days = (train.run_days || []).map(d => `<span class="day">${esc(d)}</span>`).join(' ');
  const classes = (train.classes || []).map(c => `<span class="class-pill">${esc(c)}</span>`).join(' ');

  return `
    <div class="train-card" style="animation-delay:${index * 80}ms">
      <!-- Header -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">
        <div>
          <div style="font-size:18px;font-weight:800;color:#f1f5f9;margin-bottom:2px">${esc(train.train_name)}</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-size:12px;font-weight:600;color:rgba(148,163,184,.5);letter-spacing:.05em">#${esc(train.train_number)}</span>
            ${train.train_type ? `<span class="type-badge-pill">${esc(train.train_type)}</span>` : ''}
          </div>
        </div>
      </div>

      <!-- Route -->
      <div class="route-line">
        <span style="min-width:60px;text-align:right;font-family:monospace">${esc(train.from_sta)}</span>
        <div class="route-bar"></div>
        <span style="min-width:60px;font-family:monospace">${esc(train.to_sta)}</span>
      </div>

      <!-- Time + Duration -->
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px;margin-bottom:12px">
        <span class="time-badge time-dep">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Dep: ${esc(train.from_std)}
        </span>
        <span class="time-badge time-arr">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Arr: ${esc(train.to_std)}
        </span>
        ${train.duration ? `<span class="time-badge dur-badge">⏱ ${esc(train.duration)}</span>` : ''}
      </div>

      <!-- Days + Classes -->
      ${days ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px">${days}</div>` : ''}
      ${classes ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:16px">${classes}</div>` : ''}

      <!-- Actions -->
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding-top:12px;border-top:1px solid rgba(255,255,255,.06)">
        <button class="view-btn" onclick="viewSchedule('${esc(train.train_number)}')">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline;vertical-align:middle;margin-right:4px"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
          View Route
        </button>
        <button class="book-btn" onclick="bookTrain('${esc(train.train_number)}', '${esc(train.train_name)}')">
          🎫 Book Now
        </button>
      </div>
    </div>
  `;
}

// ═════════════════════════════════════════════════════════════════════════════
// VIEW TRAIN SCHEDULE / DETAILS
// ═════════════════════════════════════════════════════════════════════════════
async function viewSchedule(trainNo) {
  const area = document.getElementById('train-details-area');
  area.classList.remove('hidden');
  area.innerHTML = `
    <div style="margin-bottom:20px;padding:24px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:20px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
        <span class="spin" style="border-color:rgba(14,165,233,.3);border-top-color:#0ea5e9"></span>
        <span style="font-size:14px;color:rgba(148,163,184,.7)">Loading schedule for Train #${esc(trainNo)}…</span>
      </div>
      <div style="display:grid;gap:8px">
        ${Array.from({length:5}, () => '<div class="skeleton" style="height:24px;width:100%"></div>').join('')}
      </div>
    </div>
  `;

  area.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const res = await fetch(`${API_BASE}/api/live/train/${encodeURIComponent(trainNo)}`);
    if (!res.ok) throw new Error(`Failed (${res.status})`);
    const data = await res.json();
    const schedule = data.schedule;
    const source = data.source;

    renderSchedule(schedule, source);
  } catch (err) {
    area.innerHTML = `
      <div class="alert-box alert-err">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>Could not load schedule: ${esc(err.message)}</span>
      </div>
    `;
  }
}

function renderSchedule(schedule, source) {
  const area = document.getElementById('train-details-area');
  const route = schedule.route || [];

  const sourceClass = source === 'api' ? 'source-api' : source === 'cache' ? 'source-cache' : 'source-fallback';
  const sourceLabel = source === 'api' ? 'Live' : source === 'cache' ? 'Cached' : 'Fallback';

  area.innerHTML = `
    <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:20px;padding:28px;margin-bottom:24px;animation:fadeUp .4s ease both">
      <!-- Header -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:24px">
        <div>
          <div style="font-size:11px;font-weight:600;color:rgba(148,163,184,.5);letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px">Train Schedule</div>
          <h3 style="font-size:22px;font-weight:800;color:#f1f5f9;margin-bottom:4px">${esc(schedule.train_name)}</h3>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <span style="font-size:14px;color:rgba(148,163,184,.6)">#${esc(schedule.train_number)}</span>
            <span style="font-size:14px;color:rgba(148,163,184,.6)">${esc(schedule.source)} → ${esc(schedule.destination)}</span>
            <span class="source-tag ${sourceClass}">${sourceLabel}</span>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="book-btn" onclick="bookTrain('${esc(schedule.train_number)}', '${esc(schedule.train_name)}')">
            🎫 Book This Train
          </button>
          <button class="view-btn" onclick="closeSchedule()">✕ Close</button>
        </div>
      </div>

      <!-- Route Table -->
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:separate;border-spacing:0">
          <thead>
            <tr>
              <th style="text-align:left;padding:10px 14px;font-size:11px;font-weight:700;color:rgba(148,163,184,.5);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid rgba(255,255,255,.08)">#</th>
              <th style="text-align:left;padding:10px 14px;font-size:11px;font-weight:700;color:rgba(148,163,184,.5);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid rgba(255,255,255,.08)">Station</th>
              <th style="text-align:left;padding:10px 14px;font-size:11px;font-weight:700;color:rgba(148,163,184,.5);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid rgba(255,255,255,.08)">Code</th>
              <th style="text-align:center;padding:10px 14px;font-size:11px;font-weight:700;color:rgba(148,163,184,.5);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid rgba(255,255,255,.08)">Arrival</th>
              <th style="text-align:center;padding:10px 14px;font-size:11px;font-weight:700;color:rgba(148,163,184,.5);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid rgba(255,255,255,.08)">Departure</th>
              <th style="text-align:center;padding:10px 14px;font-size:11px;font-weight:700;color:rgba(148,163,184,.5);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid rgba(255,255,255,.08)">Day</th>
              <th style="text-align:center;padding:10px 14px;font-size:11px;font-weight:700;color:rgba(148,163,184,.5);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid rgba(255,255,255,.08)">Halt</th>
              <th style="text-align:right;padding:10px 14px;font-size:11px;font-weight:700;color:rgba(148,163,184,.5);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid rgba(255,255,255,.08)">Dist (km)</th>
            </tr>
          </thead>
          <tbody>
            ${route.map((stop, i) => {
              const isFirst = i === 0;
              const isLast = i === route.length - 1;
              const rowBg = i % 2 === 0 ? 'rgba(255,255,255,.02)' : 'transparent';
              const highlight = isFirst || isLast ? 'font-weight:700;color:#38bdf8' : 'color:#e2e8f0';
              return `
                <tr style="background:${rowBg}">
                  <td style="padding:10px 14px;font-size:13px;color:rgba(148,163,184,.5)">${i + 1}</td>
                  <td style="padding:10px 14px;font-size:14px;${highlight}">${esc(stop.station_name)}</td>
                  <td style="padding:10px 14px"><span class="class-pill">${esc(stop.station_code)}</span></td>
                  <td style="padding:10px 14px;text-align:center;font-size:13px;font-weight:500;color:${isFirst ? 'rgba(148,163,184,.5)' : '#e2e8f0'}">${isFirst ? '—' : esc(stop.arrive)}</td>
                  <td style="padding:10px 14px;text-align:center;font-size:13px;font-weight:500;color:${isLast ? 'rgba(148,163,184,.5)' : '#e2e8f0'}">${isLast ? '—' : esc(stop.depart)}</td>
                  <td style="padding:10px 14px;text-align:center"><span class="day">${stop.day}</span></td>
                  <td style="padding:10px 14px;text-align:center;font-size:12px;color:rgba(148,163,184,.6)">${esc(stop.halt)}</td>
                  <td style="padding:10px 14px;text-align:right;font-size:13px;color:rgba(148,163,184,.6)">${stop.distance ?? '—'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Total distance -->
      ${route.length > 0 ? `
        <div style="display:flex;justify-content:flex-end;margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,.06)">
          <span style="font-size:13px;color:rgba(148,163,184,.6)">Total Distance: <strong style="color:#38bdf8">${route[route.length-1]?.distance ?? '—'} km</strong> · ${route.length} stops</span>
        </div>
      ` : ''}
    </div>
  `;
}

function closeSchedule() {
  document.getElementById('train-details-area').classList.add('hidden');
  document.getElementById('train-details-area').innerHTML = '';
}

// ═════════════════════════════════════════════════════════════════════════════
// BOOK TRAIN → Redirect to existing queue system
// ═════════════════════════════════════════════════════════════════════════════
function bookTrain(trainNumber, trainName) {
  // Store the selected live train info in sessionStorage for the booking flow
  const bookingData = {
    trainNumber,
    trainName,
    fromStation,
    toStation,
    date: document.getElementById('date-input').value,
    source: 'live-api',
  };

  sessionStorage.setItem('liveTrainBooking', JSON.stringify(bookingData));

  // Redirect to the existing booking-mode page with a flag
  // The booking-mode page will pick up the train info from sessionStorage
  window.location.href = `booking-mode.html?trainId=${encodeURIComponent(trainNumber)}&trainName=${encodeURIComponent(trainName)}&liveSearch=true`;
}
