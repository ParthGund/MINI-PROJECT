'use strict';

// Single module that captures server start time once, when it is first loaded.
// All timing logic (booking phases, departure date) derives from this value.
//
// Booking phases (relative to server start):
//   0 – 2 min  →  'waiting'  — Booking not yet open
//   2 – 4 min  →  'queue'    — Queue booking OPEN
//   4 – 6 min  →  'normal'   — Normal booking OPEN
//   6 min+     →  'tatkal'   — Tatkal booking OPEN

const projectStart = Date.now();

const TWO_MIN_MS  = 2 * 60 * 1000;
const FOUR_MIN_MS = 4 * 60 * 1000;
const SIX_MIN_MS  = 6 * 60 * 1000;

function getBookingStatus(nowMs = Date.now()) {
  const elapsed = nowMs - projectStart;

  let phase = 'tatkal';
  let timeRemaining = 0;

  if (elapsed < TWO_MIN_MS) {
    phase = 'waiting';
    timeRemaining = Math.ceil((TWO_MIN_MS - elapsed) / 1000);
  } else if (elapsed < FOUR_MIN_MS) {
    phase = 'queue';
    timeRemaining = Math.ceil((FOUR_MIN_MS - elapsed) / 1000);
  } else if (elapsed < SIX_MIN_MS) {
    phase = 'normal';
    timeRemaining = Math.ceil((SIX_MIN_MS - elapsed) / 1000);
  } else {
    phase = 'tatkal';
    timeRemaining = 0;
  }

  if (timeRemaining < 0) timeRemaining = 0;

  return { phase, timeRemaining };
}

function getDepartureDate() {
  // departure = server start date + 60 days
  const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
  const dt = new Date(projectStart + SIXTY_DAYS_MS);
  // Return date-only string (YYYY-MM-DD)
  return dt.toISOString().slice(0, 10);
}

module.exports = {
  projectStart,
  getBookingStatus,
  getDepartureDate,
};

