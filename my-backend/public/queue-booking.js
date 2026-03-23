'use strict';

const TOKEN_KEY = 'rc_token';
const USER_KEY = 'rc_user';

let currentUser = null;
let assignedSeat = null;

const urlParams = new URLSearchParams(window.location.search);
const trainId = urlParams.get('trainId') || '';
const journeyDate = urlParams.get('date') || '';
const bookingType = urlParams.get('type') || 'normal';

// Auth
(function authGuard() {
  if (!localStorage.getItem(TOKEN_KEY)) {
    window.location.replace('index.html');
    return;
  }
  try {
    currentUser = JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    logout();
  }
})();

// Init
document.addEventListener('DOMContentLoaded', () => {
  initUserChip();
  checkQueuePosition();
  setupEventListeners();
});

function initUserChip() {
  if (!currentUser) return;
  const avatar = document.getElementById('sidebar-avatar');
  const name = document.getElementById('sidebar-name');
  const email = document.getElementById('sidebar-email');
  if (avatar) avatar.textContent = (currentUser.name || 'U').charAt(0).toUpperCase();
  if (name) name.textContent = currentUser.name || 'User';
  if (email) email.textContent = currentUser.email || '';
}

function setupEventListeners() {
  document.getElementById('confirmBooking')?.addEventListener('click', confirmBooking);
  document.getElementById('cancel-btn')?.addEventListener('click', cancelBooking);
}

function checkQueuePosition() {
  const userId = localStorage.getItem('queueUserId');
  if (!userId) {
    document.getElementById('queue-message').textContent = 'No queue session found';
    document.getElementById('loading').classList.add('hidden');
    return;
  }
  pollQueueStatus(userId);
}

let isBooking = false;

async function pollQueueStatus(userId) {
  if (isBooking) return;
  
  try {
    const response = await fetch(`/api/queue-status/${userId}`);
    const data = await response.json();
    
    if (data.position === null || data.position === undefined) {
      document.getElementById('queue-message').innerHTML = '<span class="text-slate-400">Queue session expired</span>';
      document.getElementById('loading').classList.add('hidden');
      localStorage.removeItem('queueUserId');
      return;
    }
    
    document.getElementById('loading').classList.add('hidden');
    
    if (data.position === 1) {
      isBooking = true;
      document.getElementById('queue-message').innerHTML = 
        `<span class="text-green-400">You are at the front of the queue! Checking seat availability...</span>`;
      await enterBooking();
      return;
    } else {
      document.getElementById('queue-message').innerHTML = 
        `<span class="text-yellow-400">You are #${data.position} in queue</span>`;
    }
    
    setTimeout(() => pollQueueStatus(userId), 2000);
    
  } catch (error) {
    console.error('Error:', error);
    document.getElementById('queue-message').textContent = 'Error checking queue position';
    document.getElementById('loading').classList.add('hidden');
    setTimeout(() => pollQueueStatus(userId), 2000);
  }
}

async function enterBooking() {
  const userId = localStorage.getItem('queueUserId');
  if (!userId) return;
  
  try {
    const preferredSeats = JSON.parse(localStorage.getItem("preferredSeats")) || [];
    
    // Acknowledge entering booking and perform local dummy allocation on backend
    const response = await fetch('/api/queue/enter-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, preferredSeats })
    });
    
    const data = await response.json();
    assignedSeat = data.assignedSeat;
    const message = data.message;
    
    showConfirmationCard(preferredSeats, message);
    
  } catch (error) {
    console.error('Error:', error);
    document.getElementById('queue-message').textContent = 'Error starting booking';
  }
}

function showConfirmationCard(preferredSeats, message) {
  document.getElementById('queue-status').classList.add('hidden');
  document.getElementById('confirmation-card').classList.remove('hidden');
  
  // Populate UI
  document.getElementById('card-preferred').textContent = preferredSeats.map(s => String(s).replace('seat_','')).join(', ') || 'None';
  document.getElementById('card-assigned').textContent = assignedSeat ? assignedSeat.replace('seat_','') : 'None Available';
  document.getElementById('card-name').textContent = currentUser.name || 'User';
  document.getElementById('card-message').textContent = message || '';
  
  const tempPassenger = JSON.parse(localStorage.getItem('tempPassengerDetails')) || {};
  document.getElementById('card-age').textContent = tempPassenger.age || 'Adult';
  
  if (!assignedSeat) {
    document.getElementById('card-assigned').classList.replace('text-green-400', 'text-red-400');
    document.getElementById('confirmBooking').disabled = true;
    document.getElementById('confirmBooking').classList.add('opacity-50', 'cursor-not-allowed');
  }
}

async function confirmBooking() {
  if (!assignedSeat) return;

  try {
    const passengerData = JSON.parse(localStorage.getItem('tempPassengerDetails')) || {};
    passengerData.name  = currentUser.name;
    passengerData.email = currentUser.email;

    const response = await fetch('/api/booking/confirm', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        userId      : currentUser.id,
        assignedSeat: assignedSeat,   // kept for backward compat
        seatType    : assignedSeat,   // new clean field
        passengerData,
        trainId     : trainId     || 'TRN001',
        journeyDate : journeyDate || passengerData.date || new Date().toISOString(),
      }),
    });

    if (!response.ok) throw new Error('Failed to confirm booking');

    const data = await response.json();
    const ticket = data.ticket || {};

    localStorage.removeItem('queueUserId');

    // Hide booking UI and queue status bar
    document.getElementById('confirmation-card').classList.add('hidden');
    document.getElementById('queue-status').classList.add('hidden');

    // Show the premium ticket modal
    const modal = document.getElementById('ticket-summary');
    modal.classList.remove('hidden');

    // Populate all fields from the backend-returned ticket
    document.getElementById('ticket-name').textContent =
      ticket.passengerName || currentUser.name || 'N/A';

    document.getElementById('ticket-age').textContent =
      ticket.age || passengerData.age || 'N/A';

    document.getElementById('ticket-train').textContent =
      `Train ${ticket.trainId || trainId || 'TRN001'}`;

    let dateStr = ticket.journeyDate || journeyDate;
    if (dateStr) {
      try { dateStr = new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
      catch { /* keep raw */ }
    }
    document.getElementById('ticket-date').textContent = dateStr || 'N/A';

    // Seat number (auto-generated integer from backend)
    document.getElementById('ticket-seat').textContent = ticket.seatNumber || '—';

    // Seat type badge with colour
    const seatTypeEl = document.getElementById('ticket-seattype');
    const st = ticket.seatType || assignedSeat || 'General';
    seatTypeEl.textContent = st;
    // Colour-code by type
    const colourMap = { lower: '#fb923c', middle: '#a78bfa', upper: '#38bdf8' };
    const colKey = st.toLowerCase();
    if (colourMap[colKey]) {
      seatTypeEl.style.color       = colourMap[colKey];
      seatTypeEl.style.background  = `${colourMap[colKey]}22`;
      seatTypeEl.style.borderColor = `${colourMap[colKey]}55`;
    }

    // Scroll to ticket
    modal.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (error) {
    console.error('Error:', error);
    alert('Error confirming booking');
  }
}

function handleDownload() {
  // UI-only stub — implementation can use html2canvas or window.print()
  const name  = document.getElementById('ticket-name').textContent;
  const train = document.getElementById('ticket-train').textContent;
  const seat  = document.getElementById('ticket-seat').textContent;
  const type  = document.getElementById('ticket-seattype').textContent;
  const date  = document.getElementById('ticket-date').textContent;
  const text  = [
    '===== RailConnect — e-Ticket =====',
    `Passenger : ${name}`,
    `Train     : ${train}`,
    `Date      : ${date}`,
    `Seat No.  : ${seat}`,
    `Seat Type : ${type}`,
    `Status    : Confirmed`,
    '==================================',
  ].join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'railconnect-ticket.txt';
  a.click();
  URL.revokeObjectURL(url);
}

async function cancelBooking() {
  if (!confirm('Are you sure you want to cancel this booking?')) return;
  
  try {
    await fetch('/api/booking/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id })
    });
    
    localStorage.removeItem('queueUserId');
    window.location.replace('dashboard.html');
  } catch (error) {
    console.error('Error cancelling:', error);
  }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.location.replace('index.html');
}
