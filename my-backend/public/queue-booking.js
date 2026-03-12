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
    passengerData.name = currentUser.name;
    passengerData.email = currentUser.email;
    
    const response = await fetch('/api/booking/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        assignedSeat: assignedSeat,
        passengerData
      })
    });
    
    if (!response.ok) throw new Error('Failed to confirm booking');
    
    localStorage.removeItem('queueUserId');
    
    // Show Ticket Summary
    document.getElementById('confirmation-card').classList.add('hidden');
    document.getElementById('ticket-summary').classList.remove('hidden');
    
    document.getElementById('ticket-name').textContent = currentUser.name || 'User';
    document.getElementById('ticket-age').textContent = passengerData.age || 'Adult';
    document.getElementById('ticket-train').textContent = `Train ${trainId}`;
    let dateStr = journeyDate;
    if (journeyDate) {
      dateStr = new Date(journeyDate).toLocaleDateString();
    } else if (passengerData && passengerData.date) {
      dateStr = new Date(passengerData.date).toLocaleDateString();
    }
    document.getElementById('ticket-date').textContent = dateStr || 'N/A';
    document.getElementById('ticket-seat').textContent = assignedSeat.replace('seat_','');
    
  } catch (error) {
    console.error('Error:', error);
    alert('Error confirming booking');
  }
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
