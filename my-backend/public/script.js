/**
 * RailConnect — script.js
 * Modular vanilla JS connecting to Node.js + Express + JWT backend.
 * Base URL: http://localhost:3000
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const API_BASE = 'http://localhost:3000';
const TOKEN_KEY = 'rc_token';
const USER_KEY = 'rc_user';

// ─── Utility: token helpers ───────────────────────────────────────────────────
const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
const clearAuth = () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); };
const cacheUser = (u) => localStorage.setItem(USER_KEY, JSON.stringify(u));
const getCachedUser = () => { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } };

// ─── Utility: Button loading state ───────────────────────────────────────────
function setLoading(btn, loading, label) {
    if (loading) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spin"></span>${label || 'Loading…'}`;
    } else {
        btn.disabled = false;
        btn.innerHTML = label;
    }
}

// ─── Utility: Show alert ──────────────────────────────────────────────────────
function showAlert(elId, message, type = 'error') {
    const el = document.getElementById(elId);
    if (!el) return;
    const isErr = type === 'error';
    el.className = `al ${isErr ? 'al-err' : 'al-ok'} mb-5`;
    el.innerHTML = `
    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;margin-top:1px">
      ${isErr
            ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
            : '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'}
    </svg>
    <span>${message}</span>`;
    el.classList.remove('hidden');
}

function hideAlert(elId) {
    const el = document.getElementById(elId);
    if (el) el.classList.add('hidden');
}

// ─── Tab switching (index.html) ───────────────────────────────────────────────
function switchTab(tab) {
    const panels = { login: 'panel-login', signup: 'panel-signup' };
    const tabs = { login: 'tab-login', signup: 'tab-signup' };

    Object.keys(panels).forEach(key => {
        const panel = document.getElementById(panels[key]);
        const tabEl = document.getElementById(tabs[key]);
        if (!panel || !tabEl) return;
        if (key === tab) {
            panel.classList.replace('fp-h', 'fp-a');
            tabEl.classList.add('active');
        } else {
            panel.classList.replace('fp-a', 'fp-h');
            tabEl.classList.remove('active');
        }
    });

    hideAlert('login-alert');
    hideAlert('signup-alert');
}

// ─── Password visibility toggle ───────────────────────────────────────────────
function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.innerHTML = isHidden
        ? `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
       </svg>`
        : `<svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/>
        <circle cx="12" cy="12" r="3"/>
       </svg>`;
    btn.style.color = isHidden ? '#0ea5e9' : 'rgba(148,163,184,.7)';
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
async function login(email, password) {
    const res = await fetch(`${API_BASE}/api/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');
    return data;
}

async function handleLogin(e) {
    e.preventDefault();
    hideAlert('login-alert');

    const email = document.getElementById('login-email')?.value.trim();
    const password = document.getElementById('login-password')?.value;
    const btn = document.getElementById('login-btn');

    if (!email || !password) {
        showAlert('login-alert', 'Please enter your email and password.');
        return;
    }

    setLoading(btn, true, 'Signing in…');
    try {
        const user = await login(email, password);
        setToken(user.token);
        cacheUser({ id: user.id, name: user.name, email: user.email });
        window.location.href = 'dashboard.html';
    } catch (err) {
        showAlert('login-alert', err.message);
        setLoading(btn, false, 'Sign In');
    }
}

// ─── SIGNUP ───────────────────────────────────────────────────────────────────
async function signup(name, email, password) {
    const res = await fetch(`${API_BASE}/api/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Registration failed');
    return data;
}

async function handleSignup(e) {
    e.preventDefault();
    hideAlert('signup-alert');

    const name = document.getElementById('signup-name')?.value.trim();
    const email = document.getElementById('signup-email')?.value.trim();
    const password = document.getElementById('signup-password')?.value;
    const btn = document.getElementById('signup-btn');

    if (!name || !email || !password) {
        showAlert('signup-alert', 'Please fill in all fields.');
        return;
    }
    if (password.length < 6) {
        showAlert('signup-alert', 'Password must be at least 6 characters.');
        return;
    }

    setLoading(btn, true, 'Creating account…');
    try {
        await signup(name, email, password);
        showAlert('signup-alert', '🎉 Account created successfully! Please sign in.', 'success');
        setTimeout(() => switchTab('login'), 1800);
    } catch (err) {
        showAlert('signup-alert', err.message);
    } finally {
        setLoading(btn, false, 'Create Account');
    }
}

// ─── FETCH PROFILE (protected) ────────────────────────────────────────────────
async function fetchProfile() {
    const token = getToken();
    if (!token) throw new Error('No token');

    const res = await fetch(`${API_BASE}/api/users/profile`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.status === 401) { clearAuth(); window.location.href = 'index.html'; return null; }
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to fetch profile');
    return data;
}

// ─── CHECK AUTH + init dashboard ─────────────────────────────────────────────
async function checkAuth() {
    const token = getToken();
    if (!token) { window.location.href = 'index.html'; return; }

    // Populate immediately from cache for instant paint
    const cached = getCachedUser();
    if (cached) populateDashboard(cached);

    // Then verify token with real API call
    try {
        const profile = await fetchProfile();
        if (profile) {
            cacheUser(profile);
            populateDashboard(profile);
        }
    } catch {
        clearAuth();
        window.location.href = 'index.html';
    }
}

function populateDashboard(user) {
    const initial = (user.name || '?').charAt(0).toUpperCase();

    // Sidebar
    const sName = document.getElementById('sidebar-name');
    const sEmail = document.getElementById('sidebar-email');
    const sAvatar = document.getElementById('sidebar-avatar');
    if (sName) sName.textContent = user.name || '—';
    if (sEmail) sEmail.textContent = user.email || '—';
    if (sAvatar) sAvatar.textContent = initial;

    // Topbar
    const tName = document.getElementById('topbar-name');
    if (tName) tName.textContent = user.name || '—';

    // Profile section
    const pAvatar = document.getElementById('profile-avatar');
    const pName = document.getElementById('profile-name');
    const pEmail = document.getElementById('profile-email');
    const pId = document.getElementById('profile-id');
    const pFull = document.getElementById('profile-fullname');
    const pEmailF = document.getElementById('profile-email-field');
    if (pAvatar) pAvatar.textContent = initial;
    if (pName) pName.textContent = user.name || '—';
    if (pEmail) pEmail.textContent = user.email || '—';
    if (pId) pId.textContent = user.id || '—';
    if (pFull) pFull.textContent = user.name || '—';
    if (pEmailF) pEmailF.textContent = user.email || '—';
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
function logout() {
    clearAuth();
    window.location.href = 'index.html';
}

// ─── Load real ticket from backend ────────────────────────────────────────────
async function loadUserTicket() {
    const user = getCachedUser();
    if (!user || !user.id) return;

    const loading = document.getElementById('booking-loading');
    const empty   = document.getElementById('booking-empty');
    const ticket  = document.getElementById('booking-ticket');

    // Reset: show skeleton
    if (loading) loading.classList.remove('hidden');
    if (empty)   empty.classList.add('hidden');
    if (ticket)  ticket.classList.add('hidden');

    try {
        const res  = await fetch(`/api/ticket/${user.id}`);
        const data = await res.json();

        if (loading) loading.classList.add('hidden');

        if (!data.ticket) {
            if (empty) empty.classList.remove('hidden');
            return;
        }

        const t = data.ticket;
        document.getElementById('ticket-name').textContent  = t.passengerName || '—';
        document.getElementById('ticket-age').textContent   = t.age           || '—';
        document.getElementById('ticket-train').textContent = `Train ${t.train}`;
        document.getElementById('ticket-date').textContent  = t.journeyDate
            ? new Date(t.journeyDate).toLocaleDateString()
            : '—';
        document.getElementById('ticket-seat').textContent  = t.seatNumber    || '—';
        document.getElementById('ticket-type').textContent  = t.seatType      || 'Confirmed';

        if (ticket) ticket.classList.remove('hidden');
    } catch (err) {
        console.error('[Ticket] fetch error:', err);
        if (loading) loading.classList.add('hidden');
        if (empty)   empty.classList.remove('hidden');
    }
}

// ─── Dashboard section navigation ─────────────────────────────────────────────
function showSection(name, clickedNav) {
    const sections = ['dashboard', 'bookings', 'pnr', 'profile'];
    sections.forEach(s => {
        const el = document.getElementById(`section-${s}`);
        if (el) el.classList.toggle('hidden', s !== name);
    });

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (clickedNav) clickedNav.classList.add('active');

    // Update topbar title
    const titles = { dashboard: ['Dashboard', 'Overview of your railway journey'], bookings: ['My Bookings', 'Manage your train reservations'], pnr: ['PNR Status', 'Track your ticket status'], profile: ['Profile', 'Your account information'] };
    const t = titles[name];
    const topbarTitle = document.getElementById('topbar-title');
    const topbarSubtitle = document.getElementById('topbar-subtitle');
    if (topbarTitle && t) topbarTitle.textContent = t[0];
    if (topbarSubtitle && t) topbarSubtitle.textContent = t[1];

    // Re-set topbar username on dashboard
    if (name === 'dashboard') {
        const cached = getCachedUser();
        if (cached) {
            const el = document.getElementById('topbar-name');
            if (el) el.textContent = cached.name || '—';
            const topbarSub = document.getElementById('topbar-subtitle');
            if (topbarSub) topbarSub.innerHTML = `Welcome back, <span id="topbar-name" class="text-sky-400 font-semibold">${cached.name || '—'}</span>`;
        }
    }

    // Fetch live ticket whenever bookings section is opened
    if (name === 'bookings') {
        loadUserTicket();
    }

    // Close mobile sidebar
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('open');

    return false;
}

// ─── PNR demo check ──────────────────────────────────────────────────────────
function checkPNR() {
    const val = document.getElementById('pnr-input')?.value.trim();
    if (!val || val.length < 8) {
        alert('Please enter a valid 8-10 digit PNR number.');
        return;
    }
    // Display demo result (connect to real PNR API when available)
    const result = document.getElementById('pnr-result');
    const route = document.getElementById('pnr-route');
    const details = document.getElementById('pnr-details');
    const status = document.getElementById('pnr-status');
    if (route) route.textContent = `PNR ${val} — Mumbai → Delhi`;
    if (details) details.textContent = 'Rajdhani Express · 12952 · 06:00 AM · Seat 24B · Sleeper';
    if (status) status.textContent = 'Confirmed';
    if (result) result.classList.remove('hidden');
}

// ─── Page init ────────────────────────────────────────────────────────────────
(function init() {
    const page = window.location.pathname;

    // Dashboard page
    if (page.includes('dashboard.html')) {
        checkAuth();
        // Show dashboard section by default
        showSection('dashboard', document.getElementById('nav-dashboard'));
        return;
    }

    // Index page — redirect if already logged in
    if (getToken()) {
        window.location.href = 'dashboard.html';
    }
})();
