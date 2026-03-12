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
 * Body: { userId, trainId, passengers, date, type }  (any JSON payload is accepted)
 * Adds the caller to the FIFO booking queue and returns their position.
 */
app.post('/api/queue/join', (req, res) => {
  queueCounter++;
  const entry = {
    position : queueCounter,
    joinedAt : new Date().toISOString(),
    data     : req.body || {},          // store whatever the client sent
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
 * Returns the current queue length and the list of positions still waiting.
 */
app.get('/api/queue/status', (req, res) => {
  res.json({
    queueLength : bookingQueue.length,
    positions   : bookingQueue.map(e => e.position),
  });
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