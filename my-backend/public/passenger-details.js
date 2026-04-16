'use strict';

/**
 * passenger-details.js — RailConnect Passenger Selector Module
 *
 * Replaces bulk passenger forms with an incremental add system:
 *   1. Dropdown to add saved passengers (auto-fill)
 *   2. Inline form to add new passengers one-by-one
 *   3. Selected passengers list with remove
 *   4. Limit enforcement (6 normal, 4 tatkal)
 *   5. Auto-adds logged-in user as first passenger
 *   6. Integration with queue/normal booking flow
 */

// ── Constants ──────────────────────────────────────────────────────────────────
const TOKEN_KEY = 'rc_token';
const USER_KEY  = 'rc_user';

const PREF_OPTIONS = [
    { value: 'lower',  label: 'Lower Berth' },
    { value: 'middle', label: 'Middle Berth' },
    { value: 'upper',  label: 'Upper Berth' },
    { value: 'window', label: 'Window' },
    { value: 'none',   label: 'No Preference' },
];

const MAX_PAX = { normal: 6, queue: 6, tatkal: 4 };

// ── URL parameters ─────────────────────────────────────────────────────────────
const _p          = new URLSearchParams(window.location.search);
const trainId     = _p.get('trainId') || '';
const bookMode    = (_p.get('mode') || 'normal').toLowerCase();
const bookType    = (_p.get('type') || 'normal').toLowerCase();
const journeyDate = _p.get('date') || '';

// ── Auth guard ─────────────────────────────────────────────────────────────────
let currentUser = null;
(function authGuard() {
    if (!localStorage.getItem(TOKEN_KEY)) { window.location.replace('index.html'); return; }
    if (!trainId) { window.location.replace('live-search.html'); return; }
    try {
        currentUser = JSON.parse(localStorage.getItem(USER_KEY));
    } catch { /* ignore */ }
})();

// ── State ──────────────────────────────────────────────────────────────────────
const maxPax           = MAX_PAX[bookType] ?? MAX_PAX.normal;
let selectedPassengers = [];  // Array of { name, age, gender, preferences, _savedId? }
let savedPassengers    = [];  // From API

// ── Sidebar ────────────────────────────────────────────────────────────────────
function initUserChip() {
    try {
        const u = currentUser;
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

function goBack() {
    window.location.href = `booking-mode.html?trainId=${encodeURIComponent(trainId)}`;
}

// ── Train summary strip ────────────────────────────────────────────────────────
async function populateTrainSummary() {
    const nameEl  = document.getElementById('summary-train-name');
    const routeEl = document.getElementById('summary-train-route');
    const pillEl  = document.getElementById('summary-mode-pill');
    const seatsEl = document.getElementById('summary-seats');

    if (seatsEl) {
        let txt = '';
        if (journeyDate) txt += `Date: ${journeyDate}`;
        if (bookType === 'tatkal') txt += (txt ? '  ·  ' : '') + 'Tatkal';
        seatsEl.textContent = txt;
    }

    if (pillEl) {
        if (bookMode === 'queue') {
            pillEl.className = 'mode-pill pill-queue';
            pillEl.textContent = 'Queue Booking';
        } else {
            pillEl.className = 'mode-pill pill-normal';
            pillEl.textContent = 'Normal Booking';
        }
    }

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

// ── Saved passengers API ───────────────────────────────────────────────────────
async function fetchSavedPassengers() {
    const loadingEl  = document.getElementById('saved-loading');
    const dropdownEl = document.getElementById('saved-dropdown');
    const noSavedEl  = document.getElementById('no-saved-msg');

    try {
        const token = localStorage.getItem(TOKEN_KEY);
        const res = await fetch('/api/passengers', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (loadingEl) loadingEl.style.display = 'none';

        if (!res.ok) {
            // API might not be available (table not created yet)
            if (noSavedEl) { noSavedEl.style.display = 'block'; noSavedEl.textContent = 'Could not load saved passengers.'; }
            return;
        }

        savedPassengers = await res.json();

        if (savedPassengers.length === 0) {
            if (noSavedEl) noSavedEl.style.display = 'block';
            return;
        }

        // Populate dropdown
        if (dropdownEl) {
            dropdownEl.style.display = 'block';
            dropdownEl.innerHTML = '<option value="">— Select a saved passenger —</option>';
            savedPassengers.forEach(p => {
                const opt = document.createElement('option');
                opt.value = String(p.id);
                const genderLabel = p.gender ? p.gender.charAt(0).toUpperCase() : '?';
                opt.textContent = `${p.name} (${p.age}, ${genderLabel})${p.is_primary ? ' ★' : ''}`;
                dropdownEl.appendChild(opt);
            });
        }
    } catch (err) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (noSavedEl) { noSavedEl.style.display = 'block'; noSavedEl.textContent = 'Error loading passengers.'; }
        console.error('Error fetching saved passengers:', err);
    }
}

async function savePassengerToAPI(pax) {
    try {
        const token = localStorage.getItem(TOKEN_KEY);
        const res = await fetch('/api/passengers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: pax.name,
                age: pax.age,
                gender: pax.gender,
                berthPreference: pax.preferences?.[0] || null,
                isPrimary: false
            })
        });
        if (res.ok) {
            const saved = await res.json();
            // Refresh dropdown
            fetchSavedPassengers();
            return saved;
        }
    } catch (err) {
        console.error('Error saving passenger:', err);
    }
    return null;
}

// ── Limit badge ────────────────────────────────────────────────────────────────
function updateLimitBadge() {
    const badge  = document.getElementById('limit-badge');
    const text   = document.getElementById('limit-text');
    const count  = selectedPassengers.length;

    if (text) text.textContent = `${count} / ${maxPax} passengers`;

    if (badge) {
        if (count >= maxPax) {
            badge.className = 'limit-badge limit-max';
        } else {
            badge.className = 'limit-badge limit-ok';
        }
    }
}

// ── Duplicate check ────────────────────────────────────────────────────────────
function isDuplicate(name, age) {
    return selectedPassengers.some(p =>
        p.name.toLowerCase() === name.toLowerCase() && Number(p.age) === Number(age)
    );
}

// ── Add passenger to selected list ─────────────────────────────────────────────
function addPassengerToBooking(pax) {
    if (selectedPassengers.length >= maxPax) {
        showGlobalError(`Maximum ${maxPax} passengers allowed for ${bookType} booking.`);
        return false;
    }

    if (isDuplicate(pax.name, pax.age)) {
        showGlobalError(`${pax.name} (age ${pax.age}) is already added.`);
        return false;
    }

    clearGlobalError();
    selectedPassengers.push(pax);
    renderSelectedList();
    updateLimitBadge();
    updateCTAButton();
    updateDropdownState();
    return true;
}

function removePassenger(index) {
    selectedPassengers.splice(index, 1);
    renderSelectedList();
    updateLimitBadge();
    updateCTAButton();
    updateDropdownState();
    clearGlobalError();
}

// ── Render selected passengers ─────────────────────────────────────────────────
function renderSelectedList() {
    const list    = document.getElementById('pax-list');
    const emptyEl = document.getElementById('pax-empty');

    if (!list) return;

    if (selectedPassengers.length === 0) {
        list.innerHTML = '<div class="pax-empty" id="pax-empty">No passengers added yet</div>';
        return;
    }

    list.innerHTML = selectedPassengers.map((p, i) => {
        const genderLabel = p.gender ? p.gender.charAt(0).toUpperCase() : '?';
        const primary = i === 0 ? '<span class="pax-primary">Primary</span>' : '';
        return `
        <div class="pax-chip" style="animation-delay:${i * 40}ms">
            <div class="pax-num">${i + 1}</div>
            <div class="pax-info">
                <div class="pax-name">${escHtml(p.name)}</div>
                <div class="pax-meta">Age ${p.age} · ${genderLabel}${p.preferences?.[0] && p.preferences[0] !== 'none' ? ' · Pref: ' + prefLabel(p.preferences[0]) : ''}</div>
            </div>
            ${primary}
            <button class="pax-remove" onclick="removePassenger(${i})" title="Remove" aria-label="Remove ${escHtml(p.name)}">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
            </button>
        </div>`;
    }).join('');
}

// ── Dropdown handling ──────────────────────────────────────────────────────────
function setupDropdown() {
    const dropdown = document.getElementById('saved-dropdown');
    if (!dropdown) return;

    dropdown.addEventListener('change', () => {
        const id = dropdown.value;
        if (!id) return;

        const pax = savedPassengers.find(p => String(p.id) === id);
        if (!pax) return;

        const added = addPassengerToBooking({
            name: pax.name,
            age: pax.age,
            gender: pax.gender,
            preferences: [pax.berth_preference || 'none', 'none', 'none'],
            _savedId: pax.id,
        });

        // Reset dropdown
        dropdown.value = '';
    });
}

function updateDropdownState() {
    const dropdown = document.getElementById('saved-dropdown');
    const addBtn   = document.getElementById('btn-show-form');

    const atLimit = selectedPassengers.length >= maxPax;

    if (dropdown) dropdown.disabled = atLimit;
    if (addBtn)   addBtn.disabled   = atLimit;
}

// ── Inline form ────────────────────────────────────────────────────────────────
function setupForm() {
    const showBtn   = document.getElementById('btn-show-form');
    const cancelBtn = document.getElementById('btn-cancel-form');
    const addBtn    = document.getElementById('btn-add-pax');
    const form      = document.getElementById('new-pax-form');

    showBtn?.addEventListener('click', () => {
        if (selectedPassengers.length >= maxPax) return;
        form?.classList.add('show');
        showBtn.style.display = 'none';
        document.getElementById('new-name')?.focus();
    });

    cancelBtn?.addEventListener('click', () => {
        form?.classList.remove('show');
        showBtn.style.display = '';
        clearFormErrors();
        clearFormFields();
    });

    addBtn?.addEventListener('click', async () => {
        if (!validateForm()) return;

        const pax = {
            name: document.getElementById('new-name').value.trim(),
            age: parseInt(document.getElementById('new-age').value, 10),
            gender: document.getElementById('new-gender').value,
            preferences: [
                document.getElementById('new-pref1')?.value || 'none',
                document.getElementById('new-pref2')?.value || 'none',
                document.getElementById('new-pref3')?.value || 'none',
            ],
        };

        const added = addPassengerToBooking(pax);
        if (!added) return;

        // Optionally save to DB
        const shouldSave = document.getElementById('cb-save-profile')?.checked;
        if (shouldSave) {
            await savePassengerToAPI(pax);
        }

        // Reset form
        clearFormFields();
        clearFormErrors();
        form?.classList.remove('show');
        document.getElementById('btn-show-form').style.display = '';
    });
}

function validateForm() {
    let valid = true;

    const name = (document.getElementById('new-name')?.value || '').trim();
    if (!name) { setFieldErr('new-name', 'new-name-err'); valid = false; }
    else { clearFieldErr('new-name', 'new-name-err'); }

    const age = parseInt(document.getElementById('new-age')?.value || '', 10);
    if (isNaN(age) || age < 1 || age > 120) { setFieldErr('new-age', 'new-age-err'); valid = false; }
    else { clearFieldErr('new-age', 'new-age-err'); }

    const gender = document.getElementById('new-gender')?.value || '';
    if (!gender) { setFieldErr('new-gender', 'new-gender-err'); valid = false; }
    else { clearFieldErr('new-gender', 'new-gender-err'); }

    return valid;
}

function clearFormFields() {
    const fields = ['new-name', 'new-age', 'new-gender', 'new-pref1', 'new-pref2', 'new-pref3'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = el.tagName === 'SELECT' ? (id.startsWith('new-pref') ? 'none' : '') : '';
    });
}

function clearFormErrors() {
    ['new-name', 'new-age', 'new-gender'].forEach(id => {
        clearFieldErr(id, id + '-err');
    });
}

function setFieldErr(fieldId, errId) {
    const f = document.getElementById(fieldId);
    const e = document.getElementById(errId);
    if (f) f.classList.add('err');
    if (e) e.classList.add('on');
}

function clearFieldErr(fieldId, errId) {
    const f = document.getElementById(fieldId);
    const e = document.getElementById(errId);
    if (f) f.classList.remove('err');
    if (e) e.classList.remove('on');
}

// ── CTA button ─────────────────────────────────────────────────────────────────
function updateCTAButton() {
    const btn   = document.getElementById('enter-queue-btn');
    const label = document.getElementById('cta-btn-label');

    if (selectedPassengers.length === 0) {
        if (btn) btn.disabled = true;
        if (label) label.textContent = 'Add at least 1 passenger';
    } else {
        if (btn) btn.disabled = false;
        const ctaText = bookMode === 'queue'
            ? `Enter Queue (${selectedPassengers.length} passenger${selectedPassengers.length > 1 ? 's' : ''})`
            : `Book Seats (${selectedPassengers.length} passenger${selectedPassengers.length > 1 ? 's' : ''})`;
        if (label) label.textContent = ctaText;
    }
}

// ── Global errors ──────────────────────────────────────────────────────────────
function showGlobalError(msg) {
    const el = document.getElementById('global-error');
    if (!el) return;
    el.innerHTML = `
    <div class="alert-box alert-err">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;margin-top:1px">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>${escHtml(msg)}</span>
    </div>`;
    // Auto-clear after 5s
    setTimeout(clearGlobalError, 5000);
}

function clearGlobalError() {
    const el = document.getElementById('global-error');
    if (el) el.innerHTML = '';
}

// ── Auto-add logged-in user ────────────────────────────────────────────────────
function autoAddCurrentUser() {
    if (!currentUser) return;

    addPassengerToBooking({
        name: currentUser.name || 'User',
        age: 25,  // Default — user can remove & re-add with correct age
        gender: 'male',  // Default
        preferences: ['none', 'none', 'none'],
        _isCurrentUser: true,
    });
}

// ── Queue status panel ─────────────────────────────────────────────────────────
function showQueueStatusPanel(position, queueLength) {
    const btn = document.getElementById('enter-queue-btn');
    if (btn) btn.style.display = 'none';

    const ahead   = position - 1;
    const waitMin = ahead * 2;

    const posEl   = document.getElementById('qs-position');
    const aheadEl = document.getElementById('qs-ahead');
    const waitEl  = document.getElementById('qs-wait');

    if (posEl)   posEl.textContent   = `#${position}`;
    if (aheadEl) aheadEl.textContent = ahead;
    if (waitEl)  waitEl.textContent  = waitMin === 0 ? '<1' : waitMin;

    const panel = document.getElementById('queue-status-panel');
    if (panel) {
        panel.classList.add('show');
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// ── Success modal ──────────────────────────────────────────────────────────────
function showSuccessModal() {
    const modal     = document.getElementById('success-modal');
    const detail    = document.getElementById('modal-detail-block');
    const headingEl = document.getElementById('modal-heading');
    const bodyEl    = document.getElementById('modal-body-text');

    if (bookMode === 'normal') {
        if (headingEl) headingEl.textContent = 'Booking Confirmed!';
        if (bodyEl)    bodyEl.textContent    = 'Your seat is booked successfully.';
    } else {
        if (headingEl) headingEl.textContent = 'You are in the Queue!';
        if (bodyEl)    bodyEl.textContent    = 'You are in the queue. Your booking will be confirmed shortly.';
    }

    if (detail) {
        const trainName = document.getElementById('summary-train-name')?.textContent || trainId;
        const rows = selectedPassengers.map((p, i) => `
            <p><strong>Passenger ${i + 1}:</strong> ${escHtml(p.name)}, Age ${p.age}, ${cap(p.gender)}</p>
        `).join('');

        detail.innerHTML = `
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:rgba(148,163,184,.45);margin-bottom:10px;">Booking Summary</p>
            <p><strong>Train:</strong> ${escHtml(trainName)}</p>
            <p style="margin-bottom:10px"><strong>Date:</strong> ${journeyDate || '—'}</p>
            ${rows}`;
    }

    if (modal) modal.classList.add('show');
}

function closeSuccessModal() {
    const modal = document.getElementById('success-modal');
    if (modal) modal.classList.remove('show');
    window.location.href = 'live-search.html';
}

document.getElementById('success-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('success-modal')) closeSuccessModal();
});

// ── Main CTA handler ───────────────────────────────────────────────────────────
async function enterBookingQueue() {
    clearGlobalError();

    const btn = document.getElementById('enter-queue-btn');

    if (selectedPassengers.length === 0) {
        showGlobalError('Please add at least 1 passenger.');
        return;
    }

    // Disable button
    const loadingLabel = bookMode === 'normal' ? 'Booking Seats…' : 'Joining Queue…';
    if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${loadingLabel}`; }

    try {
        if (bookMode === 'queue') {
            // QUEUE MODE
            const payload = {
                userId: currentUser?.id,
                trainId,
                date: journeyDate,
                type: bookType,
                seats: [],
                passengers: selectedPassengers.map(p => ({
                    name: p.name,
                    age: p.age,
                    gender: p.gender,
                    preferences: p.preferences || ['none', 'none', 'none'],
                })),
            };

            const res = await fetch('/api/queue/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.message || `Server error ${res.status}`);
            }

            const { position, queueLength } = await res.json();

            if (currentUser?.id) {
                localStorage.setItem('queueUserId', currentUser.id);
            }

            // Store first passenger preferences for seat allocation
            const firstPax = selectedPassengers[0];
            if (firstPax) {
                const prefMap = { 'lower': 10, 'middle': 11, 'upper': 12, 'window': 13, 'none': 0 };
                const prefs = (firstPax.preferences || [])
                    .map(p => prefMap[p] || 0)
                    .filter(s => s !== 0);
                localStorage.setItem('preferredSeats', JSON.stringify(prefs.length > 0 ? prefs : [0]));

                localStorage.setItem('tempPassengerDetails', JSON.stringify({
                    name: firstPax.name,
                    age: firstPax.age,
                    gender: firstPax.gender,
                    date: journeyDate,
                    preferences: firstPax.preferences,
                }));
            }

            // Redirect to queue booking page
            window.location.href = `queue-booking.html?trainId=${encodeURIComponent(trainId)}&date=${encodeURIComponent(journeyDate)}&type=${encodeURIComponent(bookType)}`;
            return;

        } else {
            // NORMAL MODE — stub booking
            await new Promise(r => setTimeout(r, 800));
            console.log('[PassengerSelector] Booking payload:', {
                trainId, bookType, journeyDate,
                passengers: selectedPassengers,
            });
            showSuccessModal();
        }

    } catch (err) {
        showGlobalError(err.message || 'Failed to submit. Please try again.');
        if (btn) {
            btn.disabled = false;
            const ctaLabel = bookMode === 'normal' ? 'Book Seats' : 'Enter Queue';
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

// ── Utilities ──────────────────────────────────────────────────────────────────
function escHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function cap(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function prefLabel(val) {
    return (PREF_OPTIONS.find(o => o.value === val) || { label: cap(val) }).label;
}

// ── Boot ───────────────────────────────────────────────────────────────────────
(function boot() {
    initUserChip();
    populateTrainSummary();
    fetchSavedPassengers();
    setupDropdown();
    setupForm();
    updateLimitBadge();
    updateCTAButton();

    // Auto-add current user
    autoAddCurrentUser();

    // Mode-aware subtitle
    const topbarSub = document.getElementById('topbar-pd-subtitle');
    if (bookMode === 'normal') {
        if (topbarSub) topbarSub.textContent = 'Select passengers for your booking';
    } else {
        if (topbarSub) topbarSub.textContent = 'Select passengers before joining the queue';
    }

    // Wire CTA click
    document.getElementById('enter-queue-btn')?.addEventListener('click', enterBookingQueue);
})();
