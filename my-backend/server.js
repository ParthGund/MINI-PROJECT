require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

// Booking timing helpers (relative to server start)
const { getBookingStatus } = require('./timing');

const userRoutes = require('./routes/userRoutes');
const trainRoutes = require('./routes/trainRoutes');

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

app.listen(3000, () => {
  console.log('✅  Server running at http://localhost:3000');
  console.log('🖥️   Frontend  →  http://localhost:3000/index.html');
  console.log('📊  Dashboard →  http://localhost:3000/dashboard.html');
});