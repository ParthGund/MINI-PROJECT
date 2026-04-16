require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

// Booking timing helpers (relative to server start)
const { getBookingStatus } = require('./timing');

const userRoutes = require('./routes/userRoutes');
const trainRoutes = require('./routes/trainRoutes');
const liveTrainRoutes = require('./routes/liveTrainRoutes');
const passengerRoutes = require('./routes/passengerRoutes');

// ── In-memory booking queue (shared across all connected clients) ──────────────
const bookingQueue = [];   // stores entries in FIFO order
let queueCounter   = 0;   // ever-incrementing; gives each entry a stable position #

// ── Seat type locking (demo: one booking per type) ──────────────────────────
// Allowed types in order of preference fallback
const SEAT_TYPES = ['Lower', 'Middle', 'Upper'];
let bookedSeatTypes = []; // tracks which seat types have been booked

// ── Auto-incrementing seat number generator ──────────────────────────────────
let seatNumberCounter = 11; // starts at 12 on first use
function getNextSeatNumber() { return ++seatNumberCounter; }

// ── Per-user ticket storage (in-memory) ───────────────────────────────────────
let userTickets = {}; // { userId: { passengerName, age, trainId, journeyDate, seatNumber, seatType, status } }

// ── CORS (only needed if you ever call the API from a different origin) ──
app.use(cors({
  origin: '*',                           // tighten this in production
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── JSON body parsing ──
app.use(express.json());

// ── Serve frontend (public folder) at the same origin → zero CORS issues ──
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ──
app.use('/api/users', userRoutes);
app.use('/api/trains', trainRoutes);
app.use('/api/live', liveTrainRoutes);
app.use('/api/passengers', passengerRoutes);

// Booking status (relative to server start time)
app.get('/api/booking/status', (req, res) => {
  res.json(getBookingStatus());
});

// ── Queue endpoints ────────────────────────────────────────────────────────────

/**
 * POST /api/queue/join
 * Body: { userId, trainId, passengers, date, type }
 */
app.post('/api/queue/join', (req, res) => {
  queueCounter++;
  const entry = {
    position : queueCounter,
    joinedAt : new Date().toISOString(),
    data     : req.body || {},
  };
  bookingQueue.push(entry);
  console.log(`[Queue] User joined — position #${entry.position} | queue length: ${bookingQueue.length}`);
  res.json({
    message  : 'You are in the queue',
    position : entry.position,
    queueLength: bookingQueue.length,
  });
});

/**
 * GET /api/queue/status
 */
app.get('/api/queue/status', (req, res) => {
  res.json({
    queueLength : bookingQueue.length,
    positions   : bookingQueue.map(e => e.position),
  });
});

/**
 * GET /api/queue/position/:userId
 */
app.get('/api/queue/position/:userId', (req, res) => {
  const userId = req.params.userId;
  const userPosition = bookingQueue.findIndex(e => String(e.data.userId) === String(userId));
  
  if (userPosition === -1) {
    return res.json({ position: null });
  }
  
  res.json({
    position: userPosition + 1,
    queueLength: bookingQueue.length,
    isFront: userPosition === 0
  });
});

/**
 * GET /api/queue-status/:userId
 */
app.get('/api/queue-status/:userId', (req, res) => {
  const userId = req.params.userId;
  const position = bookingQueue.findIndex(e => String(e.data.userId) === String(userId)) + 1;
  
  if (position === 0) {
    return res.json({ position: null });
  }
  
  res.json({ position });
});

/**
 * POST /api/queue/enter-booking
 * Assigns a seat TYPE (Lower / Middle / Upper) based on preference.
 * Only ONE booking per seat type is allowed (demo constraint).
 */
app.post('/api/queue/enter-booking', (req, res) => {
  const { userId, preferredSeats } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const userIndex = bookingQueue.findIndex(e => String(e.data.userId) === String(userId));

  if (userIndex !== 0) {
    return res.status(403).json({
      error: 'You are not at the front of the queue',
      position: userIndex + 1
    });
  }

  let assignedSeatType = null;
  let message = '';

  if (preferredSeats && preferredSeats.length > 0) {
    // Normalise: strip 'seat_' prefix, capitalise first letter
    const normalise = (s) => {
      const raw = String(s).replace(/^seat_/i, '');
      return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    };

    const pref1 = normalise(preferredSeats[0]);
    const pref2 = preferredSeats.length > 1 ? normalise(preferredSeats[1]) : null;

    if (!bookedSeatTypes.includes(pref1)) {
      assignedSeatType = pref1;
      message = `First preference (${pref1}) available and assigned.`;
    } else if (pref2 && !bookedSeatTypes.includes(pref2)) {
      assignedSeatType = pref2;
      message = `${pref1} already booked — second preference (${pref2}) assigned.`;
    } else {
      // Fallback: find first available type
      const fallback = SEAT_TYPES.find(t => !bookedSeatTypes.includes(t));
      if (fallback) {
        assignedSeatType = fallback;
        message = `Both preferences taken — assigned available type: ${fallback}.`;
      } else {
        message = 'All seat types are fully booked.';
      }
    }

    if (assignedSeatType && !bookedSeatTypes.includes(assignedSeatType)) {
      bookedSeatTypes.push(assignedSeatType);
    }
  }

  console.log(`[Queue] User ${userId} entering booking. Seat type: ${assignedSeatType}`);
  // assignedSeat kept for backward compat with frontend
  res.json({ message: 'You can now start booking', assignedSeat: assignedSeatType, seatType: assignedSeatType, message });
});

/**
 * GET /api/seats/status
 * Returns booked seat types.
 */
app.get('/api/seats/status', (req, res) => {
  res.json({ bookedSeatTypes });
});

/**
 * POST /api/booking/confirm
 * Body: { userId, assignedSeat (seatType), seatType, passengerData, trainId, journeyDate }
 */
app.post('/api/booking/confirm', (req, res) => {
  const { userId, passengerData, passengers } = req.body;

  // Resolve seat type — frontend may send as assignedSeat OR seatType
  const rawSeatType = req.body.seatType || req.body.assignedSeat || null;
  const seatType = rawSeatType ? String(rawSeatType).replace(/^seat_/i, '') : null;

  // Ensure it's tracked as booked (fallback if enter-booking wasn't called)
  if (seatType && !bookedSeatTypes.includes(seatType)) {
    bookedSeatTypes.push(seatType);
  }

  // Auto-generate a seat number
  const seatNumber = getNextSeatNumber();

  // ── Save ticket for this user — support multi-passenger array ─────────────
  const paxList = passengers || (passengerData ? [passengerData] : []);
  const primaryPax = paxList[0] || {};

  userTickets[userId] = {
    passengerName : primaryPax.name || passengerData?.name || 'Unknown',
    age           : primaryPax.age  || passengerData?.age  || 'N/A',
    trainId       : req.body.trainId    || 'TRN001',
    journeyDate   : req.body.journeyDate || new Date().toISOString(),
    seatType      : seatType            || 'General',
    seatNumber    : seatNumber,
    status        : 'Confirmed',
    passengers    : paxList,
  };

  // QUEUE SAFETY CHECK: After booking confirmation: queue.shift() — DO NOT MODIFY
  if (bookingQueue.length > 0 && String(bookingQueue[0].data.userId) === String(userId)) {
    bookingQueue.shift();

    if (bookingQueue.length > 0) {
      const nextUser = bookingQueue[0];
      console.log(`[Queue] Advanced queue. Next user is #1: ${nextUser.data.userId}`);
    } else {
      console.log(`[Queue] Advanced queue. Queue is now empty.`);
    }
  }

  console.log(`[Booking] User ${userId} confirmed. SeatType: ${seatType} | SeatNumber: ${seatNumber} | Passengers: ${paxList.length}`);

  res.json({
    message     : 'Booking confirmed successfully',
    seatType,
    seatNumber,
    passengerData : primaryPax,
    passengers    : paxList,
    ticket        : userTickets[userId],
  });
});

/**
 * POST /api/booking/cancel
 * Body: { userId }
 */
app.post('/api/booking/cancel', (req, res) => {
  const { userId } = req.body;
  
  if (bookingQueue.length > 0 && String(bookingQueue[0].data.userId) === String(userId)) {
    bookingQueue.shift();
  }
  
  console.log(`[Booking] User ${userId} cancelled booking. Advanced queue.`);
  res.json({ message: 'Booking cancelled successfully' });
});

// ── Fetch ticket for a specific user ──────────────────────────────────────────
app.get('/api/ticket/:userId', (req, res) => {
  const userId = req.params.userId;
  if (!userTickets[userId]) {
    return res.json({ ticket: null });
  }
  res.json({ ticket: userTickets[userId] });
});

// ── Fallback: serve index.html for any non-API route ──
app.get('/{*path}', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ── Global error handler ──
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

// ── Queue processor: runs every 2 minutes (FIFO — processes the first entry) ──
const TWO_MINUTES_MS = 2 * 60 * 1000;
setInterval(() => {
  if (bookingQueue.length === 0) {
    console.log('[Queue] Processor tick — queue is empty, nothing to process.');
    return;
  }
  const next = bookingQueue.shift();   // remove first entry (FIFO)
  console.log(`[Queue] Processing position #${next.position} | remaining in queue: ${bookingQueue.length}`);
  // TODO: wire to real booking logic here when ready
  // e.g. call bookSeats(next.data) or emit a WebSocket event to the user
}, TWO_MINUTES_MS);

app.listen(3000, () => {
  console.log('✅  Server running at http://localhost:3000');
  console.log('🖥️   Frontend  →  http://localhost:3000/index.html');
  console.log('📊  Dashboard →  http://localhost:3000/dashboard.html');
});