/**
 * routes/trainRoutes.js
 *
 * CHANGED: Added two new protected routes for the DB-backed flow:
 *   POST /:id/book-seats  — confirm a booking
 *   GET  /:id/queue       — view queue for a train
 *
 * The three original routes are UNCHANGED (same HTTP method + path).
 */

'use strict';

const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');
const {
    getAllTrains,
    getTrainById,
    selectSeats,
    bookSeats,    // NEW
    getQueue,     // NEW
} = require('../controllers/trainController');

// ── Public routes ─────────────────────────────────────────────────────────────

// GET /api/trains?source=Mumbai&destination=Delhi
router.get('/', getAllTrains);

// GET /api/trains/TRN001
router.get('/:id', getTrainById);

// ── Protected routes ──────────────────────────────────────────────────────────

// POST /api/trains/TRN001/select-seats  → validate + lock seats + add to queue
router.post('/:id/select-seats', protect, selectSeats);

// POST /api/trains/TRN001/book-seats   → confirm booking (mark seats 'booked')
router.post('/:id/book-seats', protect, bookSeats);

// GET  /api/trains/TRN001/queue        → view current queue
router.get('/:id/queue', protect, getQueue);

module.exports = router;
