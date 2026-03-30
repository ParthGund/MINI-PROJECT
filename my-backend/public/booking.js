'use strict';

/**
 * booking.js — RailConnect Unified Booking Module
 *
 * FLOW:
 *   search.html → (Book clicked) → booking.html?trainId=X
 *
 * THIS PAGE HANDLES (in order):
 *   1. Journey date selection   — date picker, today → today+60 days
 *   2. Booking type selection   — Normal (max 6) | Tatkal (max 4)
 *   3. Passenger count          — numbered buttons, limit = booking type max
 *   4. Passenger forms          — one card per passenger, each containing:
 *                                   Name, Age, Gender,
 *                                   Seat Pref 1, Seat Pref 2, Seat Pref 3
 *   5. "Enter Booking Queue"    — validates everything, shows success alert
 *
 * TODO – queue integration:
 *   In enterBookingQueue(), replace the simulateSubmission() stub with:
 *     POST /api/trains/:trainId/book-queue
 *     { journeyDate, bookingType, passengers }
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'rc_token';
const USER_KEY = 'rc_user';

/** How many days in advance tickets can be booked */
const MAX_ADVANCE_DAYS = 60;

/** Max passengers per booking type */
const MAX_PAX = { normal: 6, tatkal: 4 };

/** Seat preference options (value + display label) */
const PREF_OPTIONS = [
    { value: 'lower', label: 'Lower Berth' },
    { value: 'middle', label: 'Middle Berth' },
    { value: 'upper', label: 'Upper Berth' },
    { value: 'window', label: 'Window' },
    { value: 'none', label: 'No Preference' },
];


const _p = new URLSearchParams(window.location.search);
const trainId = _p.get('trainId') || '';



(function authGuard() {
    if (!localStorage.getItem(TOKEN_KEY)) window.location.replace('index.html');
    if (!trainId) window.location.replace('search.html');
})();



let bookingType = 'normal';   
let passengerCount = 1;          



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

// ─────────────────────────────────────────────────────────────────────────────
//  Train info strip
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the selected train from the API and populate the info strip.
 * Fails gracefully — shows trainId if the fetch errors.
 */
async function populateTrainStrip() {
    const nameEl = document.getElementById('ts-name');
    const routeEl = document.getElementById('ts-route');
    const badgesEl = document.getElementById('ts-badges');

    try {
        const res = await fetch(`/api/trains/${encodeURIComponent(trainId)}`);
        if (!res.ok) throw new Error('not-ok');
        const train = await res.json();

        if (nameEl) nameEl.textContent = train.name || trainId;
        if (routeEl) routeEl.textContent = `${train.source || '?'} → ${train.destination || '?'}`;

        if (badgesEl) {
            badgesEl.innerHTML = `
        <span class="ts-badge ts-dep">🕐 Dep: ${esc(train.departure || '—')}</span>
        <span class="ts-badge ts-arr">🕐 Arr: ${esc(train.arrival || '—')}</span>
        <span class="ts-badge ts-av"> ✓ ${train.availableSeats ?? '?'} seats available</span>
      `;
        }
    } catch {
        if (nameEl) nameEl.textContent = trainId;
        if (routeEl) routeEl.textContent = 'Train details unavailable';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Date picker initialisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set the date input's min (today) and max (today + 60 days).
 * Defaults to tomorrow so the user has a sensible starting point.
 */
function initDatePicker() {
    const input = document.getElementById('journey-date');
    if (!input) return;

    const today = new Date();
    const max = new Date(today);
    max.setDate(today.getDate() + MAX_ADVANCE_DAYS);

    const toISO = d => d.toISOString().split('T')[0];

    input.min = toISO(today);
    input.max = toISO(max);

    // Default to tomorrow
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    input.value = toISO(tomorrow);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Booking type toggle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called when either booking-type radio changes.
 * Updates UI, adjusts count selector, and re-renders passenger forms if needed.
 */
function onBookingTypeChange() {
    bookingType = document.querySelector('input[name="booking-type"]:checked')?.value || 'normal';

    // Toggle "selected" class on the label cards
    document.getElementById('type-normal').classList.toggle('selected', bookingType === 'normal');
    document.getElementById('type-tatkal').classList.toggle('selected', bookingType === 'tatkal');

    // Update description
    const desc = document.getElementById('count-desc');
    const max = MAX_PAX[bookingType];
    if (desc) desc.textContent = `${bookingType === 'tatkal' ? 'Tatkal' : 'Normal'} booking: select 1 to ${max} passengers.`;

    // Clamp passenger count to the new max
    if (passengerCount > max) passengerCount = max;

    renderCountButtons();
    renderPassengerForms();
}

// ─────────────────────────────────────────────────────────────────────────────
//  Passenger count selector
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render numbered buttons 1…MAX_PAX[bookingType].
 * Active button is highlighted. Clicking a button regenerates forms.
 */
function renderCountButtons() {
    const box = document.getElementById('count-btns');
    if (!box) return;
    box.innerHTML = '';

    const max = MAX_PAX[bookingType];

    for (let i = 1; i <= max; i++) {
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
}

// ─────────────────────────────────────────────────────────────────────────────
//  Passenger form builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build <option> tags for a seat-preference dropdown.
 * @returns {string} HTML string of <option> elements
 */
function prefOpts() {
    return PREF_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
}

/**
 * Build the complete HTML for one passenger card (number n, 1-based).
 *
 * Card layout (top → bottom):
 *   [Passenger N header]
 *   [Name] | [Age] | [Gender]         ← row-3 grid
 *   ── Seat Preferences ──             ← decorative divider
 *   [1st Pref] | [2nd Pref] | [3rd]   ← row-3-prefs grid
 *
 * @param {number} n  1-based index
 */
function buildCard(n) {
    const p = `p${n}`;    // ID prefix unique to this passenger

    return /* html */`
<div class="pcard" id="pcard-${n}" style="animation-delay:${(n - 1) * 55}ms">

  <!-- Card header -->
  <div class="pcard-head">
    <div class="pcard-badge" aria-hidden="true">${n}</div>
    <div>
      <h3>Passenger ${n}</h3>
      <p>Enter personal details and seat preferences below</p>
    </div>
  </div>

  <!-- Row 1: Name | Age | Gender -->
  <div class="row-3">

    <div class="fg">
      <label class="fl" for="${p}-name">Passenger Name</label>
      <input type="text" id="${p}-name" class="fi"
        placeholder="e.g. Ravi Kumar" autocomplete="off" aria-required="true" />
      <span class="ferr" id="${p}-name-err">Name cannot be empty.</span>
    </div>

    <div class="fg">
      <label class="fl" for="${p}-age">Age</label>
      <input type="number" id="${p}-age" class="fi"
        placeholder="e.g. 28" min="1" max="120" aria-required="true" />
      <span class="ferr" id="${p}-age-err">Age must be greater than 0.</span>
    </div>

    <div class="fg">
      <label class="fl" for="${p}-gender">Gender</label>
      <select id="${p}-gender" class="fs" aria-required="true">
        <option value="">Select…</option>
        <option value="male">Male</option>
        <option value="female">Female</option>
        <option value="other">Other</option>
      </select>
      <span class="ferr" id="${p}-gender-err">Please select a gender.</span>
    </div>

  </div><!-- /.row-3 -->

  <!-- Seat preferences divider -->
  <div class="pref-divider"><span>Seat Preferences — in order of priority</span></div>

  <!-- Row 2: Pref 1 | Pref 2 | Pref 3 -->
  <div class="row-3-prefs">

    <div class="fg">
      <label class="fl" for="${p}-pref1">1st Preference</label>
      <select id="${p}-pref1" class="fs">${prefOpts()}</select>
    </div>

    <div class="fg">
      <label class="fl" for="${p}-pref2">2nd Preference</label>
      <select id="${p}-pref2" class="fs">${prefOpts()}</select>
    </div>

    <div class="fg">
      <label class="fl" for="${p}-pref3">3rd Preference</label>
      <select id="${p}-pref3" class="fs">${prefOpts()}</select>
    </div>

  </div><!-- /.row-3-prefs -->

  <!-- Preference validation error (shown when all 3 are identical) -->
  <span class="ferr" id="${p}-pref-err" style="margin-top:10px">
    All three preferences are the same — please choose different options.
  </span>

</div><!-- /.pcard -->`;
}

/**
 * (Re-)render all passenger cards into #passengers-container.
 * Clears existing cards first so the count is always exact.
 */
function renderPassengerForms() {
    const box = document.getElementById('passengers-container');
    if (!box) return;
    box.innerHTML = '';
    for (let i = 1; i <= passengerCount; i++) {
        box.insertAdjacentHTML('beforeend', buildCard(i));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Mark a field + its error span as invalid. */
function setErr(fieldId, errId) {
    document.getElementById(fieldId)?.classList.add('err');
    const e = document.getElementById(errId);
    if (e) { e.classList.add('on'); e.style.display = 'block'; }
}

/** Clear error state for a field. */
function clrErr(fieldId, errId) {
    document.getElementById(fieldId)?.classList.remove('err');
    const e = document.getElementById(errId);
    if (e) { e.classList.remove('on'); e.style.display = 'none'; }
}

/**
 * Validate the journey date field.
 * @returns {boolean} true if valid
 */
function validateDate() {
    const input = document.getElementById('journey-date');
    const errEl = document.getElementById('date-err');
    const val = input?.value;

    if (!val) {
        input?.classList.add('err');
        if (errEl) { errEl.classList.add('on'); errEl.style.display = 'block'; }
        return false;
    }
    input?.classList.remove('err');
    if (errEl) { errEl.classList.remove('on'); errEl.style.display = 'none'; }
    return true;
}

/**
 * Validate all fields for passenger n (1-based).
 * Does NOT short-circuit — all errors are surfaced at once.
 * @returns {boolean} true if all fields pass
 */
function validateCard(n) {
    const p = `p${n}`;
    let ok = true;

    // Name: non-empty string
    const name = (document.getElementById(`${p}-name`)?.value || '').trim();
    if (!name) { setErr(`${p}-name`, `${p}-name-err`); ok = false; }
    else { clrErr(`${p}-name`, `${p}-name-err`); }

    // Age: positive integer
    const ageStr = document.getElementById(`${p}-age`)?.value;
    const age = parseInt(ageStr, 10);
    if (!ageStr || isNaN(age) || age <= 0) { setErr(`${p}-age`, `${p}-age-err`); ok = false; }
    else { clrErr(`${p}-age`, `${p}-age-err`); }

    // Gender: must be selected
    const gender = document.getElementById(`${p}-gender`)?.value || '';
    if (!gender) { setErr(`${p}-gender`, `${p}-gender-err`); ok = false; }
    else { clrErr(`${p}-gender`, `${p}-gender-err`); }

    // Seat preferences: all three must NOT be the same value
    const pref1 = document.getElementById(`${p}-pref1`)?.value || '';
    const pref2 = document.getElementById(`${p}-pref2`)?.value || '';
    const pref3 = document.getElementById(`${p}-pref3`)?.value || '';
    const errEl = document.getElementById(`${p}-pref-err`);
    const allSame = (pref1 === pref2 && pref2 === pref3);

    if (allSame) {
        [`${p}-pref1`, `${p}-pref2`, `${p}-pref3`].forEach(id =>
            document.getElementById(id)?.classList.add('err')
        );
        if (errEl) { errEl.classList.add('on'); errEl.style.display = 'block'; }
        ok = false;
    } else {
        [`${p}-pref1`, `${p}-pref2`, `${p}-pref3`].forEach(id =>
            document.getElementById(id)?.classList.remove('err')
        );
        if (errEl) { errEl.classList.remove('on'); errEl.style.display = 'none'; }
    }

    return ok;
}

/**
 * Validate everything on the page.
 * @returns {boolean} true only when date + all passenger cards pass
 */
function validateAll() {
    const dateOk = validateDate();
    let paxOk = true;
    for (let i = 1; i <= passengerCount; i++) {
        if (!validateCard(i)) paxOk = false;   // keep looping — show all errors
    }
    return dateOk && paxOk;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Global error banner
// ─────────────────────────────────────────────────────────────────────────────

function showGlobalError(msg) {
    const el = document.getElementById('global-error');
    if (!el) return;
    el.innerHTML = `
    <div class="alert alert-err">
      <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;margin-top:1px">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>${esc(msg)}</span>
    </div>`;
}

function clearGlobalError() {
    const el = document.getElementById('global-error');
    if (el) el.innerHTML = '';
}

// ─────────────────────────────────────────────────────────────────────────────
//  Collect booking data
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read all form values and return a structured booking object.
 * Only call AFTER validateAll() returns true.
 *
 * @returns {{ journeyDate:string, bookingType:string, passengers:Array }}
 */
function collectData() {
    const journeyDate = document.getElementById('journey-date')?.value || '';

    const passengers = Array.from({ length: passengerCount }, (_, i) => {
        const p = `p${i + 1}`;
        return {
            name: (document.getElementById(`${p}-name`)?.value || '').trim(),
            age: parseInt(document.getElementById(`${p}-age`)?.value || '0', 10),
            gender: document.getElementById(`${p}-gender`)?.value || '',
            preferences: [
                document.getElementById(`${p}-pref1`)?.value || 'none',
                document.getElementById(`${p}-pref2`)?.value || 'none',
                document.getElementById(`${p}-pref3`)?.value || 'none',
            ],
        };
    });

    return { journeyDate, bookingType, passengers };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Success modal
// ─────────────────────────────────────────────────────────────────────────────

function showModal(data) {
    const summaryEl = document.getElementById('modal-summary');
    if (summaryEl) {
        const rows = data.passengers.map((p, i) => `
      <div class="ms-row">
        <strong>Passenger ${i + 1}:</strong>
        ${esc(p.name)}, Age&nbsp;${p.age}, ${cap(p.gender)}
        &nbsp;—&nbsp;Prefs: ${p.preferences.map(v => prefLabel(v)).join(' › ')}
      </div>`).join('');

        summaryEl.innerHTML = `
      <div class="ms-label">Booking Summary</div>
      <div class="ms-row"><strong>Train:</strong> ${esc(document.getElementById('ts-name')?.textContent || trainId)}</div>
      <div class="ms-row"><strong>Journey Date:</strong> ${esc(data.journeyDate)}</div>
      <div class="ms-row" style="margin-bottom:10px"><strong>Booking Type:</strong> ${cap(data.bookingType)}</div>
      ${rows}`;
    }
    document.getElementById('success-modal')?.classList.add('show');
}

function closeModal() {
    document.getElementById('success-modal')?.classList.remove('show');
    window.location.href = 'search.html';
}

// Close on backdrop click
document.getElementById('success-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('success-modal')) closeModal();
});

// ─────────────────────────────────────────────────────────────────────────────
//  Enter Booking Queue — main CTA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called when "Enter Booking Queue" is clicked.
 *
 * Steps:
 *   1. Validate date + all passenger cards
 *   2. Collect form data
 *   3. Submit (stub — replace with real API later)
 *   4. Show success modal
 *
 * ── TO WIRE REAL QUEUE LOGIC ─────────────────────────────────────────────────
 * Replace `await simulateSubmit(data)` with:
 *
 *   const res = await fetch(`/api/trains/${trainId}/book-queue`, {
 *     method : 'POST',
 *     headers: { 'Content-Type': 'application/json',
 *                'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
 *     body   : JSON.stringify(data)
 *   });
 *   if (!res.ok) {
 *     const e = await res.json().catch(() => ({}));
 *     throw new Error(e.message || `Server error (${res.status})`);
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */
async function enterBookingQueue() {
    clearGlobalError();

    const btn = document.getElementById('queue-btn');

    // Step 1 — Validate
    if (!validateAll()) {
        showGlobalError('Some fields have errors — please fix them before continuing.');
        const firstErr = document.querySelector('.ferr.on, .fi.err, .fs.err');
        if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    // Step 2 — Collect
    const data = collectData();

    // Step 3 — Submit
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>&nbsp;Joining Queue…'; }

    try {
        await simulateSubmit(data);      // ← replace with real fetch() later

        // Step 4 — Success
        showModal(data);

    } catch (err) {
        showGlobalError(err.message || 'Failed to join the queue — please try again.');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg> Enter Booking Queue`;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Stub — simulates a backend call
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TEMPORARY placeholder. Logs the payload and resolves after ~700 ms.
 * Delete this function once the real API endpoint is integrated above.
 */
function simulateSubmit(data) {
    return new Promise(resolve => {
        setTimeout(() => {
            console.group('[booking.js] Queue payload (stub — not sent to server)');
            console.log('trainId     :', trainId);
            console.log('journeyDate :', data.journeyDate);
            console.log('bookingType :', data.bookingType);
            console.table(data.passengers);
            console.groupEnd();
            resolve();
        }, 700);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

/** XSS-safe HTML escaping */
function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Capitalise first letter */
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

/** Preference value → human label */
function prefLabel(val) {
    return (PREF_OPTIONS.find(o => o.value === val) || { label: cap(val) }).label;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Boot
// ─────────────────────────────────────────────────────────────────────────────

(function boot() {
    initUserChip();           // sidebar avatar / name / email
    populateTrainStrip();     // fetch train info (async, non-blocking)
    initDatePicker();         // set min/max on date input, default to tomorrow

    // Wire booking-type radio buttons
    document.querySelectorAll('input[name="booking-type"]').forEach(radio => {
        radio.addEventListener('change', onBookingTypeChange);
    });

    // Wire type-card labels as clickable (clicking the label checks the radio)
    document.getElementById('type-normal')?.addEventListener('click', () => {
        document.getElementById('radio-normal').checked = true;
        onBookingTypeChange();
    });
    document.getElementById('type-tatkal')?.addEventListener('click', () => {
        document.getElementById('radio-tatkal').checked = true;
        onBookingTypeChange();
    });

    renderCountButtons();     // draw 1…6 selector
    renderPassengerForms();   // draw initial 1-passenger card
})();
