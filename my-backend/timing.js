'use strict';

// Single module that captures server start time once, when it is first loaded.
// All timing logic (booking phases, departure date) derives from this value.
//
// Booking phases (relative to server start):
//   0 – 30 sec      →  'waiting'  — Booking not yet open
//   30 sec – 2m30s  →  'queue'    — Queue booking OPEN  (2 min window)
//   2m30s – 4m30s   →  'normal'   — Normal booking OPEN (2 min window)
//   4m30s+          →  'tatkal'   — Tatkal booking OPEN (indefinite)

const projectStart = Date.now();

// Phase boundary timestamps (ms from server start)
const WAITING_END_MS = 30_000;        //  30 seconds
const QUEUE_END_MS   = 150_000;       //  2 min 30 sec  (30s + 120s)
const NORMAL_END_MS  = 270_000;       //  4 min 30 sec  (150s + 120s)

function getBookingStatus(nowMs = Date.now()) {
  const elapsed = nowMs - projectStart;

  let phase = 'tatkal';
  let timeRemaining = 0;

  if (elapsed < WAITING_END_MS) {
    phase = 'waiting';
    timeRemaining = Math.ceil((WAITING_END_MS - elapsed) / 1000);
  } else if (elapsed < QUEUE_END_MS) {
    phase = 'queue';
    timeRemaining = Math.ceil((QUEUE_END_MS - elapsed) / 1000);
  } else if (elapsed < NORMAL_END_MS) {
    phase = 'normal';
    timeRemaining = Math.ceil((NORMAL_END_MS - elapsed) / 1000);
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

