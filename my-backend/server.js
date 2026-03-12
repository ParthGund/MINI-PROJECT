require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

// Booking timing helpers (relative to server start)
const { getBookingStatus } = require('./timing');

const userRoutes = require('./routes/userRoutes');
const trainRoutes = require('./routes/trainRoutes');

// ── In-memory booking queue (shared across all connected clients) ──────────────
const bookingQueue = [];   // stores entries in FIFO order
let queueCounter   = 0;   // ever-incrementing; gives each entry a stable position #

// ── Seat locking and booking system ───────────────────────────────────────────────
let bookedSeats = [];

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

  let assignedSeat = null;
  let message = "";

  if (preferredSeats && preferredSeats.length > 0) {
    const seat1 = String(preferredSeats[0]).startsWith('seat_') ? String(preferredSeats[0]) : `seat_${preferredSeats[0]}`;
    const seat2 = preferredSeats.length > 1 ? (String(preferredSeats[1]).startsWith('seat_') ? String(preferredSeats[1]) : `seat_${preferredSeats[1]}`) : null;
    
    if (!bookedSeats.includes(seat1)) {
      assignedSeat = seat1;
      message = "First preference available and booked.";
    } else if (seat2) {
      assignedSeat = seat2;
      message = "First preference already booked, second preference allotted.";
    } else {
      message = "No preferences available.";
    }
    
    if (assignedSeat && !bookedSeats.includes(assignedSeat)) {
      bookedSeats.push(assignedSeat);
    }
  }

  console.log(`[Queue] User ${userId} entering booking window. Assigned: ${assignedSeat}`);
  res.json({ message: 'You can now start booking', assignedSeat, message });
});

/**
 * GET /api/seats/status
 * Returns booked seats.
 */
app.get('/api/seats/status', (req, res) => {
  res.json({ bookedSeats });
});

/**
 * POST /api/booking/confirm
 * Body: { userId, assignedSeat, passengerData }
 */
app.post('/api/booking/confirm', (req, res) => {
  const { userId, assignedSeat, passengerData } = req.body;
  
  // NOTE: previously pushed in enter-booking
  if (assignedSeat && !bookedSeats.includes(assignedSeat)) {
    bookedSeats.push(assignedSeat); // fallback
  }
  
  // QUEUE SAFETY CHECK: After booking confirmation: queue.shift()
  if (bookingQueue.length > 0 && String(bookingQueue[0].data.userId) === String(userId)) {
    bookingQueue.shift();
    
    // Then check if queue.length > 0
    if (bookingQueue.length > 0) {
      const nextUser = bookingQueue[0];
      // allowBookingFor(nextUser) - polling logic on frontend handles this immediately
      console.log(`[Queue] Advanced queue. Next user is #1: ${nextUser.data.userId}`);
    } else {
      console.log(`[Queue] Advanced queue. Queue is now empty.`);
    }
  }
  
  console.log(`[Booking] User ${userId} confirmed booking. Seat: ${assignedSeat}`);
  
  res.json({
    message: 'Booking confirmed successfully',
    seat: assignedSeat,
    passengerData
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