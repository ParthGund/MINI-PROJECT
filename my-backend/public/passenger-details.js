'use strict';

/**
 * passenger-details.js  —  RailConnect Passenger Details Module
 *
 * PAGE FLOW:
 *   booking-mode.html → (Continue clicked) → passenger-details.html?trainId=X&mode=Y&date=Z&type=T
 *
 * WHAT THIS PAGE DOES:
 *   1.  Reads URL params  : trainId, mode (queue|normal), seats (comma-separated), type (normal|tatkal)
 *   2.  Shows a count selector  : 1-6 for Normal/Queue, 1-4 for Tatkal
 *   3.  Dynamically generates one card per passenger.
 *       Each card contains, in this exact order:
 *         • Passenger Name     (text input)
 *         • Age                (number input)
 *         • Gender             (dropdown: Male / Female / Other)
 *         • Seat Preference 1  (dropdown)
 *         • Seat Preference 2  (dropdown)
 *         • Seat Preference 3  (dropdown)
 *   4.  Validates all fields when the CTA button is clicked.
 *   5.  Shows mode-appropriate success modal:
 *         - Normal mode → "Your seat is booked successfully."
 *         - Queue  mode → "You are in the queue."
 */

// ────────────────────────────────────────────────────────────────────────────
//  Constants
// ────────────────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'rc_token';
const USER_KEY = 'rc_user';

/** Options shown in every seat-preference dropdown */
const PREF_OPTIONS = [
    { value: 'lower', label: 'Lower Berth' },
    { value: 'middle', label: 'Middle Berth' },
    { value: 'upper', label: 'Upper Berth' },
    { value: 'window', label: 'Window' },
    { value: 'none', label: 'No Preference' },
];

/** Maximum passengers per booking type */
const MAX_PAX = { normal: 6, queue: 6, tatkal: 4 };

// ────────────────────────────────────────────────────────────────────────────
//  URL parameters
// ────────────────────────────────────────────────────────────────────────────

const _p = new URLSearchParams(window.location.search);
const trainId = _p.get('trainId') || '';
const bookMode = (_p.get('mode') || 'normal').toLowerCase();  // 'queue' | 'normal'
const bookType = (_p.get('type') || 'normal').toLowerCase();  // 'normal' | 'tatkal'
const journeyDate = _p.get('date') || '';                        // ISO date e.g. "2026-03-15"
const rawSeats = _p.get('seats') || '';

/** Array of selected seat numbers (empty since seat selection page is removed) */
const selectedSeats = rawSeats ? rawSeats.split(',').map(Number).filter(Boolean) : [];

// ────────────────────────────────────────────────────────────────────────────
//  Auth guard
// ────────────────────────────────────────────────────────────────────────────

(function authGuard() {
    if (!localStorage.getItem(TOKEN_KEY)) { window.location.replace('index.html'); }
    if (!trainId) { window.location.replace('search.html'); }
})();

// ────────────────────────────────────────────────────────────────────────────
//  State
// ────────────────────────────────────────────────────────────────────────────

let passengerCount = 1;                           // currently selected count
const maxPax = MAX_PAX[bookType] ?? MAX_PAX.normal; // ceiling for this booking type

// ────────────────────────────────────────────────────────────────────────────
//  Sidebar helpers  (same pattern as booking-mode.js)
// ────────────────────────────────────────────────────────────────────────────

function initUserChip() {
    try {
        const u = JSON.parse(localStorage.getItem(USER_KEY));
        if (!u) return;
        const av = document.getElementById('sidebar-avatar');
        const nm = document.getElementById('sidebar-name');
        const em = document.getElementById('sidebar-email');
        if (av) av.textContent = (u.name || 'U').charAt(0).toUpperCase();
        if (nm) nm.textContent = u.name || 'User';
        if (em) em.textContent = u.email || '';
    } catch { /* ignore */ }
}

function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.location.replace('index.html');
}

// ────────────────────────────────────────────────────────────────────────────
//  Navigation
// ────────────────────────────────────────────────────────────────────────────

/** Return to the booking mode page (back from passenger details). */
function goBack() {
    window.location.href =
        `booking-mode.html?trainId=${encodeURIComponent(trainId)}`;
}

// ────────────────────────────────────────────────────────────────────────────
//  Train summary strip
// ────────────────────────────────────────────────────────────────────────────

/**
 * Populate the coloured strip showing train name, route, mode pill, selected seats.
 * Fetches from the server; falls back gracefully on error.
 */
async function populateTrainSummary() {
    const nameEl = document.getElementById('summary-train-name');
    const routeEl = document.getElementById('summary-train-route');
    const pillEl = document.getElementById('summary-mode-pill');
    const seatsEl = document.getElementById('summary-seats');

    // Selected seats are known from URL params — show immediately
    if (seatsEl) {
        let txt = selectedSeats.length ? `Seats: ${selectedSeats.join(', ')}` : '';
        if (journeyDate) txt = (txt ? txt + '  ·  ' : '') + `Date: ${journeyDate}`;
        if (bookType === 'tatkal') txt = (txt ? txt + '  ·  ' : '') + 'Tatkal';
        seatsEl.textContent = txt;
    }

    // Mode pill
    if (pillEl) {
        if (bookMode === 'queue') {
            pillEl.className = 'mode-pill pill-queue';
            pillEl.textContent = 'Queue Booking';
        } else {
            pillEl.className = 'mode-pill pill-normal';
            pillEl.textContent = 'Normal Booking';
        }
    }

    // Fetch train name & route from server (best-effort)
    try {
        const res = await fetch(`/api/trains/${encodeURIComponent(trainId)}`);
        if (!res.ok) throw new Error();
        const train = await res.json();
        if (nameEl) nameEl.textContent = train.name || trainId;
        if (routeEl) routeEl.textContent = `${train.source || '?'} → ${train.destination || '?'}`;
    } catch {
        if (nameEl) nameEl.textContent = trainId;
        if (routeEl) routeEl.textContent = 'Route unavailable';
    }
}

// ────────────────────────────────────────────────────────────────────────────
//  Passenger count selector
// ────────────────────────────────────────────────────────────────────────────

/**
 * Render numbered buttons 1 … maxPax.
 * Clicking a button updates `passengerCount` and regenerates the forms below.
 */
function renderCountButtons() {
    const box = document.getElementById('count-btns');
    if (!box) return;
    box.innerHTML = '';

    for (let i = 1; i <= maxPax; i++) {
        const btn = document.createElement('button');
        btn.className = `count-btn${i === passengerCount ? ' active' : ''}`;
        btn.textContent = String(i);
        btn.setAttribute('aria-label', `${i} passenger${i > 1 ? 's' : ''}`);
        btn.setAttribute('aria-pressed', String(i === passengerCount));
        btn.addEventListener('click', () => {
            passengerCount = i;
            renderCountButtons();
            renderPassengerForms();
        });
        box.appendChild(btn);
    }

    // Update description text
    const desc = document.getElementById('count-description');
    if (desc) {
        desc.textContent = bookType === 'tatkal'
            ? `Tatkal bookings allow up to ${maxPax} passengers.`
            : `Normal bookings allow up to ${maxPax} passengers.`;
    }
}

// ────────────────────────────────────────────────────────────────────────────
//  Passenger card builder
// ────────────────────────────────────────────────────────────────────────────

/**
 * Return the <option> tags for a seat-preference dropdown.
 */
function prefOptions() {
    return PREF_OPTIONS
        .map(o => `<option value="${o.value}">${o.label}</option>`)
        .join('');
}

/**
 * Build and return the full HTML for one passenger card.
 * Layout inside each card (top to bottom):
 *   [Passenger N header]
 *   [Name]  [Age]  [Gender]          ← row-personal (3-column grid)
 *   ── Seat Preferences ──            ← divider
 *   [Pref 1]  [Pref 2]  [Pref 3]    ← row-prefs (3-column grid)
 *
 * @param {number} n   1-based passenger number
 */
function buildCard(n) {
    const id = `pax${n}`;             // prefix for all IDs in this card
    const delay = (n - 1) * 60;          // stagger animation

    return /* html */`
<div class="pcard" id="pcard-${n}" style="animation-delay:${delay}ms">

  <!-- Header -->
  <div class="pcard-header">
    <div class="pcard-badge" aria-hidden="true">${n}</div>
    <div>
      <h3>Passenger ${n}</h3>
      <p>Enter personal details and seat preferences</p>
    </div>
  </div>

  <!-- Row 1: Name | Age | Gender -->
  <div class="row-personal">

    <div class="fgroup">
      <label class="flabel" for="${id}-name">Passenger Name</label>
      <input
        type="text" id="${id}-name" class="finput"
        placeholder="e.g. Priya Sharma" autocomplete="off" aria-required="true"
      />
      <span class="ferr" id="${id}-name-err">Name cannot be empty.</span>
    </div>

    <div class="fgroup">
      <label class="flabel" for="${id}-age">Age</label>
      <input
        type="number" id="${id}-age" class="finput"
        placeholder="e.g. 28" min="1" max="120" aria-required="true"
      />
      <span class="ferr" id="${id}-age-err">Age must be greater than 0.</span>
    </div>

    <div class="fgroup">
      <label class="flabel" for="${id}-gender">Gender</label>
      <select id="${id}-gender" class="fselect" aria-required="true">
        <option value="">Select…</option>
        <option value="male">Male</option>
        <option value="female">Female</option>
        <option value="other">Other</option>
      </select>
      <span class="ferr" id="${id}-gender-err">Please select a gender.</span>
    </div>

  </div><!-- /.row-personal -->

  <!-- Divider -->
  <div class="prefs-divider"><span>Seat Preferences (in order of priority)</span></div>

  <!-- Row 2: Pref 1 | Pref 2 | Pref 3 -->
  <div class="row-prefs">

    <div class="fgroup">
      <label class="flabel" for="${id}-pref1">1st Preference</label>
      <select id="${id}-pref1" class="fselect">${prefOptions()}</select>
    </div>

    <div class="fgroup">
      <label class="flabel" for="${id}-pref2">2nd Preference</label>
      <select id="${id}-pref2" class="fselect">${prefOptions()}</select>
    </div>

    <div class="fgroup">
      <label class="flabel" for="${id}-pref3">3rd Preference</label>
      <select id="${id}-pref3" class="fselect">${prefOptions()}</select>
    </div>

  </div><!-- /.row-prefs -->
  <span class="ferr" id="${id}-pref-err" style="margin-top:10px;display:none">
    All three preferences cannot be identical — please vary your selections.
  </span>

</div><!-- /.pcard -->`;
}

/**
 * (Re-)render all passenger cards into #passengers-container.
 * Called on boot and whenever the passenger count button changes.
 */
function renderPassengerForms() {
    const container = document.getElementById('passengers-container');
    if (!container) return;
    container.innerHTML = '';       // clear previous cards

    for (let i = 1; i <= passengerCount; i++) {
        // Insert card HTML
        container.insertAdjacentHTML('beforeend', buildCard(i));
    }
}

// ────────────────────────────────────────────────────────────────────────────
//  Validation
// ────────────────────────────────────────────────────────────────────────────

/** Mark a field invalid and show its error message. */
function setErr(fieldId, errId) {
    const f = document.getElementById(fieldId);
    const e = document.getElementById(errId);
    if (f) f.classList.add('err');
    if (e) { e.classList.add('on'); e.style.display = 'block'; }
}

/** Clear error state for a field. */
function clearErr(fieldId, errId) {
    const f = document.getElementById(fieldId);
    const e = document.getElementById(errId);
    if (f) f.classList.remove('err');
    if (e) { e.classList.remove('on'); e.style.display = 'none'; }
}

/**
 * Validate one passenger card. Returns true if all fields pass.
 * @param {number} n   1-based passenger index
 */
function validateCard(n) {
    const id = `pax${n}`;
    let valid = true;

    // Name: non-empty
    const name = (document.getElementById(`${id}-name`)?.value || '').trim();
    if (!name) { setErr(`${id}-name`, `${id}-name-err`); valid = false; }
    else { clearErr(`${id}-name`, `${id}-name-err`); }

    // Age: integer > 0
    const ageRaw = document.getElementById(`${id}-age`)?.value;
    const age = parseInt(ageRaw, 10);
    if (!ageRaw || isNaN(age) || age <= 0) { setErr(`${id}-age`, `${id}-age-err`); valid = false; }
    else { clearErr(`${id}-age`, `${id}-age-err`); }

    // Gender: must be selected
    const gender = document.getElementById(`${id}-gender`)?.value || '';
    if (!gender) { setErr(`${id}-gender`, `${id}-gender-err`); valid = false; }
    else { clearErr(`${id}-gender`, `${id}-gender-err`); }

    // Preferences: all three must NOT be the same value
    const p1 = document.getElementById(`${id}-pref1`)?.value || '';
    const p2 = document.getElementById(`${id}-pref2`)?.value || '';
    const p3 = document.getElementById(`${id}-pref3`)?.value || '';
    const prefErrEl = document.getElementById(`${id}-pref-err`);
    const allSame = (p1 === p2 && p2 === p3);

    if (allSame) {
        [`${id}-pref1`, `${id}-pref2`, `${id}-pref3`].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('err');
        });
        if (prefErrEl) { prefErrEl.classList.add('on'); prefErrEl.style.display = 'block'; }
        valid = false;
    } else {
        [`${id}-pref1`, `${id}-pref2`, `${id}-pref3`].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('err');
        });
        if (prefErrEl) { prefErrEl.classList.remove('on'); prefErrEl.style.display = 'none'; }
    }

    return valid;
}

/** Validate every passenger card. Returns true only if all pass. */
function validateAll() {
    let ok = true;
    for (let i = 1; i <= passengerCount; i++) {
        if (!validateCard(i)) ok = false;   // don't short-circuit — show all errors
    }
    return ok;
}

// ────────────────────────────────────────────────────────────────────────────
//  Global error banner
// ────────────────────────────────────────────────────────────────────────────

function showGlobalError(msg) {
    const el = document.getElementById('global-error');
    if (!el) return;
    el.innerHTML = `
    <div class="alert-box alert-err">
      <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;margin-top:1px">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8"  x2="12"   y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>${escHtml(msg)}</span>
    </div>`;
}

function clearGlobalError() {
    const el = document.getElementById('global-error');
    if (el) el.innerHTML = '';
}

// ────────────────────────────────────────────────────────────────────────────
//  Collect passenger data
// ────────────────────────────────────────────────────────────────────────────

/**
 * Read values from all rendered cards and return a structured array.
 * Call only AFTER validation passes.
 */
function collectData() {
    return Array.from({ length: passengerCount }, (_, i) => {
        const id = `pax${i + 1}`;
        return {
            name: (document.getElementById(`${id}-name`)?.value || '').trim(),
            age: parseInt(document.getElementById(`${id}-age`)?.value || '0', 10),
            gender: document.getElementById(`${id}-gender`)?.value || '',
            preferences: [
                document.getElementById(`${id}-pref1`)?.value || 'none',
                document.getElementById(`${id}-pref2`)?.value || 'none',
                document.getElementById(`${id}-pref3`)?.value || 'none',
            ],
        };
    });
}

// ────────────────────────────────────────────────────────────────────────────
//  Success modal
// ────────────────────────────────────────────────────────────────────────────

/** Show the success modal populated with a booking summary. */
function showSuccessModal(passengers) {
    const modal = document.getElementById('success-modal');
    const detail = document.getElementById('modal-detail-block');
    const headingEl = document.getElementById('modal-heading');
    const bodyEl = document.getElementById('modal-body-text');

    // Set mode-appropriate heading and message
    if (bookMode === 'normal') {
        if (headingEl) headingEl.textContent = 'Booking Confirmed!';
        if (bodyEl) bodyEl.textContent = 'Your seat is booked successfully.';
    } else {
        if (headingEl) headingEl.textContent = 'You are in the Queue!';
        if (bodyEl) bodyEl.textContent = 'You are in the queue. Your booking will be confirmed shortly.';
    }

    if (detail) {
        const trainName = document.getElementById('summary-train-name')?.textContent || trainId;
        const rows = passengers.map((p, i) => `
      <p><strong>Passenger ${i + 1}:</strong> ${escHtml(p.name)}, Age ${p.age}, ${cap(p.gender)}
         — Prefs: ${p.preferences.map(v => prefLabel(v)).join(' › ')}</p>
    `).join('');

        detail.innerHTML = `
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;
                color:rgba(148,163,184,.45);margin-bottom:10px;">Booking Summary</p>
      <p><strong>Train:</strong> ${escHtml(trainName)}</p>
      <p style="margin-bottom:10px"><strong>Seats selected:</strong> ${selectedSeats.length ? selectedSeats.join(', ') : '—'}</p>
      ${rows}`;
    }

    if (modal) modal.classList.add('show');
}

/** Close the success modal and redirect back to Search. */
function closeSuccessModal() {
    const modal = document.getElementById('success-modal');
    if (modal) modal.classList.remove('show');
    window.location.href = 'search.html';
}

// Clicking the backdrop also closes the modal
document.getElementById('success-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('success-modal')) closeSuccessModal();
});

// ────────────────────────────────────────────────────────────────────────────
//  Queue status panel
// ────────────────────────────────────────────────────────────────────────────

/**
 * Hide the CTA button and reveal the queue status panel populated with
 * position data returned by POST /api/queue/join.
 *
 * @param {number} position   - queue position number returned by the server
 * @param {number} queueLength - total entries currently in the queue
 */
function showQueueStatusPanel(position, queueLength) {
    // Hide the CTA button to prevent multiple joins
    const btn = document.getElementById('enter-queue-btn');
    if (btn) btn.style.display = 'none';

    // Populate values
    const ahead = position - 1;
    const waitMin = ahead * 2;   // each position = 2-minute processing cycle

    const posEl  = document.getElementById('qs-position');
    const aheadEl = document.getElementById('qs-ahead');
    const waitEl  = document.getElementById('qs-wait');

    if (posEl)   posEl.textContent  = `#${position}`;
    if (aheadEl) aheadEl.textContent = ahead;
    if (waitEl)  waitEl.textContent  = waitMin === 0 ? '<1' : waitMin;

    // Show the panel
    const panel = document.getElementById('queue-status-panel');
    if (panel) {
        panel.classList.add('show');
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// ────────────────────────────────────────────────────────────────────────────
//  Enter Booking Queue — main CTA handler
// ────────────────────────────────────────────────────────────────────────────

/**
 * Triggered by the CTA button ("Book Seats" for normal mode, "Enter Queue" for queue mode).
 *
 * Queue mode  → POST /api/queue/join  → show inline queue status panel
 * Normal mode → simulateQueueSubmission (stub) → show success modal
 */
async function enterBookingQueue() {
    clearGlobalError();

    const btn = document.getElementById('enter-queue-btn');
    const ctaLabel = bookMode === 'normal' ? 'Book Seats' : 'Enter Queue';

    // ── Step 1: Validate ───────────────────────────────────────────
    if (!validateAll()) {
        showGlobalError('Please fix the errors in the forms above before continuing.');
        const firstErr = document.querySelector('.ferr.on, .finput.err, .fselect.err');
        if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    // ── Step 2: Collect ────────────────────────────────────────────
    const passengers = collectData();

    // ── Step 3: Disable button immediately (prevent double-click) ────────
    const loadingLabel = bookMode === 'normal' ? 'Booking Seats…' : 'Joining Queue…';
    if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${loadingLabel}`; }

    try {
        if (bookMode === 'queue') {
            // ── QUEUE MODE: call the real backend queue endpoint ───────────────
            const payload = {
                trainId,
                date      : journeyDate,
                type      : bookType,
                seats     : selectedSeats,
                passengers,
            };
            const res = await fetch('/api/queue/join', {
                method  : 'POST',
                headers : { 'Content-Type': 'application/json' },
                body    : JSON.stringify(payload),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.message || `Server error ${res.status}`);
            }
            const { position, queueLength } = await res.json();

            // Show inline queue status panel (no page reload)
            showQueueStatusPanel(position, queueLength);

        } else {
            // ── NORMAL / TATKAL MODE: stub — replace with real booking API later
            await simulateQueueSubmission(passengers);
            showSuccessModal(passengers);
        }

    } catch (err) {
        showGlobalError(err.message || 'Failed to submit. Please try again.');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <span id="cta-btn-label">${ctaLabel}</span>`;
        }
    }
}

// ────────────────────────────────────────────────────────────────────────────
//  Queue submission stub
// ────────────────────────────────────────────────────────────────────────────

/**
 * TEMPORARY placeholder — simulates ~800 ms of network latency.
 * Logs the full payload to the browser console so you can verify the data.
 * Delete once the real API is wired in.
 */
function simulateQueueSubmission(passengers) {
    return new Promise(resolve => {
        setTimeout(() => {
            console.group('[PassengerDetails] Queue payload (stub — not sent to server)');
            console.log('trainId      :', trainId);
            console.log('bookMode     :', bookMode);
            console.log('bookType     :', bookType);
            console.log('selectedSeats:', selectedSeats);
            console.table(passengers);
            console.groupEnd();
            resolve();
        }, 800);
    });
}

// ────────────────────────────────────────────────────────────────────────────
//  Utility helpers
// ────────────────────────────────────────────────────────────────────────────

/** Escape a string for safe innerHTML insertion. */
function escHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Capitalise first character. */
function cap(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/** Map a preference value to its human label. */
function prefLabel(val) {
    return (PREF_OPTIONS.find(o => o.value === val) || { label: cap(val) }).label;
}

// ────────────────────────────────────────────────────────────────────────────
//  Boot
// ────────────────────────────────────────────────────────────────────────────

(function boot() {
    initUserChip();           // populate sidebar avatar + name
    populateTrainSummary();   // fetch train name/route (async, non-blocking)
    renderCountButtons();     // draw 1…maxPax selector buttons
    renderPassengerForms();   // draw initial 1-passenger card

    // ── Mode-aware UI init ────────────────────────────────────────────────
    // Set CTA button label based on booking mode
    const ctaLabelEl = document.getElementById('cta-btn-label');
    const topbarSubtitle = document.getElementById('topbar-pd-subtitle');

    if (bookMode === 'normal') {
        // Normal Booking: direct booking flow
        if (ctaLabelEl) ctaLabelEl.textContent = 'Book Seats';
        if (topbarSubtitle) topbarSubtitle.textContent = 'Fill in passenger details to book your seats directly';
    } else {
        // Queue Booking: queue flow
        if (ctaLabelEl) ctaLabelEl.textContent = 'Enter Queue';
        if (topbarSubtitle) topbarSubtitle.textContent = 'Fill in the details for each traveller before joining the queue';
    }
})();
