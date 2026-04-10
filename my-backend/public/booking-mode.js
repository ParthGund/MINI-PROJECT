'use strict';

/**
 * booking-mode.js
 *
 * Determines the booking phase by calling GET /api/booking/status,
 * which derives the phase entirely from server start time (timing.js).
 *
 * Booking phases (relative to server start):
 *   waiting (0–30 sec)      : Booking not open yet — button disabled
 *   queue   (30s–2m30s)     : Queue booking OPEN — "Enter Queue"
 *   normal  (2m30s–4m30s)   : Normal booking OPEN — "Book Seats", Tatkal locked
 *   tatkal  (4m30s+)        : Tatkal OPEN — Normal booking closed
 *
 * No localStorage timestamps. No hardcoded clock times. Pure server-side truth.
 *
 * Flow: booking-mode.html → passenger-details.html (seats.html removed)
 */

const TOKEN_KEY = 'rc_token';
const USER_KEY = 'rc_user';

// ── Journey input helpers ─────────────────────────────────────────────────────

/**
 * Set min/max on the date picker (today → today+60).
 * Default to tomorrow so the user always has a valid pre-selected value.
 */
function initJourneyInputs() {
  const input = document.getElementById('journey-date');
  if (!input) return;

  const today = new Date();
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + 60);
  const toISO = d => d.toISOString().split('T')[0];

  input.min = toISO(today);
  input.max = toISO(maxDate);

  // Default to tomorrow
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  input.value = toISO(tomorrow);

  // Wire booking-type label clicks
  ['normal', 'tatkal'].forEach(type => {
    const lbl = document.getElementById(`lbl-${type}`);
    const radio = document.getElementById(`radio-${type}`);
    if (!lbl || !radio) return;
    lbl.addEventListener('click', () => {
      // Only allow selection if not disabled
      if (lbl.classList.contains('type-opt-disabled')) return;
      radio.checked = true;
      document.getElementById('lbl-normal').classList.toggle('selected', type === 'normal');
      document.getElementById('lbl-tatkal').classList.toggle('selected', type === 'tatkal');
    });
  });
}

/**
 * Validate the journey date. Returns the ISO date string or null.
 */
function validateJourneyInputs() {
  const input = document.getElementById('journey-date');
  const errEl = document.getElementById('date-err');
  if (!input) return null;

  const val = input.value;
  if (!val) {
    input.classList.add('err');
    if (errEl) { errEl.style.display = 'block'; }
    return null;
  }
  input.classList.remove('err');
  if (errEl) { errEl.style.display = 'none'; }
  return val; // ISO date string e.g. "2026-03-12"
}

/** Read the currently selected booking type (normal | tatkal) */
function getBookingType() {
  return document.querySelector('input[name="btype"]:checked')?.value || 'normal';
}

// ── Booking type option enablement ────────────────────────────────────────────

/**
 * Lock the Tatkal option with a message and select Normal automatically.
 * @param {string} msg - message shown inside the tatkal option card
 */
function lockTatkal(msg) {
  const lblTatkal = document.getElementById('lbl-tatkal');
  const radioNormal = document.getElementById('radio-normal');
  const lblNormal = document.getElementById('lbl-normal');

  if (lblTatkal) {
    lblTatkal.classList.add('type-opt-disabled');
    lblTatkal.style.opacity = '0.45';
    lblTatkal.style.cursor = 'not-allowed';
    lblTatkal.style.pointerEvents = 'none';
    // Update description inside the card
    const p = lblTatkal.querySelector('p');
    if (p) p.textContent = msg;
  }
  // Ensure Normal is selected
  if (radioNormal) radioNormal.checked = true;
  if (lblNormal) {
    lblNormal.classList.add('selected');
  }
  const lblTatkalEl = document.getElementById('lbl-tatkal');
  if (lblTatkalEl) lblTatkalEl.classList.remove('selected');
}

/**
 * Lock the Normal option — Tatkal is now the active window.
 * @param {string} msg - message shown inside the normal option card
 */
function lockNormal(msg) {
  const lblNormal = document.getElementById('lbl-normal');
  const radioTatkal = document.getElementById('radio-tatkal');
  const lblTatkal = document.getElementById('lbl-tatkal');

  if (lblNormal) {
    lblNormal.classList.add('type-opt-disabled');
    lblNormal.style.opacity = '0.45';
    lblNormal.style.cursor = 'not-allowed';
    lblNormal.style.pointerEvents = 'none';
    lblNormal.classList.remove('selected');
    const p = lblNormal.querySelector('p');
    if (p) p.textContent = msg;
  }
  // Ensure Tatkal is selected
  if (radioTatkal) radioTatkal.checked = true;
  if (lblTatkal) {
    lblTatkal.classList.add('selected');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.location.replace('index.html');
}

function initUserChip() {
  try {
    const cached = JSON.parse(localStorage.getItem(USER_KEY));
    if (!cached) return;
    const name = cached.name || 'User';
    const email = cached.email || '';
    const avatar = document.getElementById('sidebar-avatar');
    const nameEl = document.getElementById('sidebar-name');
    const emailEl = document.getElementById('sidebar-email');
    if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
    if (nameEl) nameEl.textContent = name;
    if (emailEl) emailEl.textContent = email;
  } catch { /* ignore */ }
}

// ── Status polling ─────────────────────────────────────────────────────────────

/** Fetch current booking phase from the server. Returns { phase, timeRemaining } */
async function fetchBookingStatus() {
  const res = await fetch('/api/booking/status');
  if (!res.ok) throw new Error(`Status ${res.status}`);
  return res.json(); // { phase: "normal"|"tatkal", timeRemaining: seconds }
}

// ── UI helpers ────────────────────────────────────────────────────────────────

/** Apply waiting-phase UI (0–30 sec): booking not open yet */
function renderWaiting(timeRemaining) {
  setTopSubtitle('Booking window not open yet — please wait…');
  setPill('pill-waiting', 'Waiting');
  setModeTitle('⏳ Booking Not Open Yet');
  setModeDesc('The booking window will open in 30 seconds. Queue booking starts first.');
  setLaunchInfo(`Queue booking opens in ${formatSeconds(timeRemaining)}`);
  setContinueBtnDisabled(true, 'Please wait…');
  setCountdown(timeRemaining, () =>
    setContinueBtnDisabled(true, '⏳ Still waiting for queue window…')
  );
}

/** Apply queue-phase UI (30s–2m30s): queue booking open */
function renderQueue(timeRemaining, trainId) {
  setTopSubtitle('You are in Queue Booking mode');
  setPill('pill-queue', 'Queue Booking');
  setModeTitle('Queue Booking Window');
  setModeDesc('Select up to 3 preferred seats before booking opens. Your choices will be placed in the queue.');
  setLaunchInfo(`Normal booking opens in ${formatSeconds(timeRemaining)}`);
  setContinueBtnDisabled(false, 'Continue to Queue Seat Selection');
  setCountdownLive(timeRemaining, 'Normal booking starts in');

  document.getElementById('continue-btn').onclick = function () {
    const date = validateJourneyInputs();
    if (!date) return;
    const type = getBookingType();
    this.disabled = true;
    this.innerHTML = '<span class="spin"></span>Loading…';
    window.location.href =
      `passenger-details.html?trainId=${encodeURIComponent(trainId)}` +
      `&mode=queue` +
      `&date=${encodeURIComponent(date)}` +
      `&type=${encodeURIComponent(type)}`;
  };
}

/** Apply normal-phase UI (2m30s–4m30s): normal booking open, tatkal locked */
function renderNormal(timeRemaining, trainId) {
  setTopSubtitle('Normal booking is open — Tatkal opens after 4 min 30 sec');
  setPill('pill-normal', 'Normal Booking');
  setModeTitle('Normal Booking Window');
  setModeDesc('Normal booking is currently open. Tatkal booking will become available 4 minutes 30 seconds from server start.');
  setLaunchInfo(`Tatkal window opens in ${formatSeconds(timeRemaining)}`);
  setContinueBtnDisabled(false, 'Continue to Book Seats');

  // Lock Tatkal option with a hint
  lockTatkal('Tatkal booking opens after 4 min 30 sec.');

  // Live countdown until tatkal opens
  setCountdownLive(timeRemaining, 'Tatkal opens in');

  document.getElementById('continue-btn').onclick = function () {
    const date = validateJourneyInputs();
    if (!date) return;
    const type = getBookingType();
    this.disabled = true;
    this.innerHTML = '<span class="spin"></span>Loading…';
    window.location.href =
      `passenger-details.html?trainId=${encodeURIComponent(trainId)}` +
      `&mode=normal` +
      `&date=${encodeURIComponent(date)}` +
      `&type=${encodeURIComponent(type)}`;
  };
}

/** Apply tatkal-phase UI (6 min+): tatkal open, normal closed */
function renderTatkal(trainId) {
  setTopSubtitle('Tatkal booking is now open — Normal booking has closed');
  setPill('pill-queue', 'Tatkal Booking');
  setModeTitle('Tatkal Booking Window');
  setModeDesc('Tatkal booking is now available. Normal booking window has closed.');
  setLaunchInfo('Tatkal window is now open. Normal booking has ended.');
  const countdownEl = document.getElementById('countdown-info');
  if (countdownEl) countdownEl.textContent = '';
  setContinueBtnDisabled(false, 'Continue to Tatkal Booking');

  // Lock Normal option
  lockNormal('Normal booking window has closed.');

  document.getElementById('continue-btn').onclick = function () {
    const date = validateJourneyInputs();
    if (!date) return;
    const type = getBookingType();
    this.disabled = true;
    this.innerHTML = '<span class="spin"></span>Loading…';
    window.location.href =
      `passenger-details.html?trainId=${encodeURIComponent(trainId)}` +
      `&mode=normal` +
      `&date=${encodeURIComponent(date)}` +
      `&type=${encodeURIComponent(type)}`;
  };
}

// ── Small DOM mutators ────────────────────────────────────────────────────────

function setTopSubtitle(text) {
  const el = document.getElementById('topbar-subtitle');
  if (el) el.textContent = text;
}

function setPill(cls, label) {
  const pill = document.getElementById('mode-pill');
  const labelEl = document.getElementById('mode-pill-label');
  if (pill) {
    pill.className = `mode-pill ${cls}`;
  }
  if (labelEl) labelEl.textContent = label;
}

function setModeTitle(text) {
  const el = document.getElementById('mode-title');
  if (el) el.textContent = text;
}

function setModeDesc(text) {
  const el = document.getElementById('mode-description');
  if (el) el.textContent = text;
}

function setLaunchInfo(text) {
  const el = document.getElementById('launch-info');
  if (el) el.textContent = text;
}

function setContinueBtnDisabled(disabled, label) {
  const btn = document.getElementById('continue-btn');
  const lbl = document.getElementById('continue-label');
  if (btn) btn.disabled = disabled;
  if (lbl) lbl.textContent = label;
}

function setCountdown(initialSeconds, onExpire) {
  const el = document.getElementById('countdown-info');
  if (!el) return;
  let remaining = initialSeconds;
  const tick = () => {
    if (remaining <= 0) {
      el.textContent = 'Queue window is opening now…';
      if (onExpire) onExpire();
      return;
    }
    el.textContent = `Opens in ${formatSeconds(remaining)}`;
    remaining--;
    setTimeout(tick, 1000);
  };
  tick();
}

function setCountdownLive(initialSeconds, prefix) {
  const el = document.getElementById('countdown-info');
  if (!el) return;
  let remaining = initialSeconds;
  const tick = () => {
    if (remaining <= 0) {
      el.textContent = 'Switching to next booking window…';
      // Auto-reload so the page re-fetches the new phase
      setTimeout(() => window.location.reload(), 1500);
      return;
    }
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    el.textContent = `${prefix} ${m}m ${String(s).padStart(2, '0')}s`;
    remaining--;
    setTimeout(tick, 1000);
  };
  tick();
}

function formatSeconds(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0
    ? `${m}m ${String(s).padStart(2, '0')}s`
    : `${s}s`;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
  // Auth guard
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    window.location.replace('index.html');
    return;
  }

  initUserChip();
  initJourneyInputs();   // ← set up date picker + booking type toggle

  // Get trainId from URL
  const params = new URLSearchParams(window.location.search);
  const trainId = params.get('trainId');
  if (!trainId) {
    window.location.replace('live-search.html');
    return;
  }

  // Show loading state while fetching
  setModeTitle('Loading…');
  setModeDesc('Checking server booking phase…');
  setContinueBtnDisabled(true, 'Please wait…');

  try {
    const { phase, timeRemaining } = await fetchBookingStatus();

    switch (phase) {
      case 'waiting':
        renderWaiting(timeRemaining);
        break;
      case 'queue':
        renderQueue(timeRemaining, trainId);
        break;
      case 'normal':
        renderNormal(timeRemaining, trainId);
        break;
      case 'tatkal':
      default:
        renderTatkal(trainId);
        break;
    }

    // Poll server every 5 seconds to stay in sync
    // (handles phase transitions: waiting→queue→normal→tatkal automatically)
    let pollInterval = setInterval(async () => {
      try {
        const status = await fetchBookingStatus();
        // If phase changed, re-render by reloading the page cleanly
        if (status.phase !== phase) {
          clearInterval(pollInterval);
          window.location.reload();
        }
      } catch { /* network hiccup — keep polling */ }
    }, 5000);

  } catch (err) {
    console.error('[booking-mode] Failed to fetch booking status:', err);
    setModeTitle('Connection Error');
    setModeDesc('Unable to reach the server. Please check your connection and refresh the page.');
    setLaunchInfo('');
    setContinueBtnDisabled(true, 'Cannot connect to server');
  }
}

boot();
