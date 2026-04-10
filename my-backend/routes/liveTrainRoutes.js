/**
 * routes/liveTrainRoutes.js
 *
 * Routes for the live IRCTC RapidAPI integration.
 * These are SEPARATE from the existing trainRoutes (which handle
 * internal DB-backed booking/queue logic).
 *
 * Endpoints:
 *   GET /api/live/stations?query=mumbai     → search stations
 *   GET /api/live/trains?from=BCT&to=NDLS   → trains between stations
 *   GET /api/live/train/:trainNo            → train schedule / route
 *   POST /api/live/cache/clear              → clear API cache
 */

'use strict';

const express = require('express');
const router = express.Router();

const {
  searchStations,
  getTrainsBetween,
  getTrainSchedule,
  clearCache,
} = require('../controllers/liveTrainController');

// ── Station autocomplete ────────────────────────────────────────────────────
router.get('/stations', searchStations);

// ── Trains between two stations ─────────────────────────────────────────────
router.get('/trains', getTrainsBetween);

// ── Full schedule / route for a specific train ──────────────────────────────
router.get('/train/:trainNo', getTrainSchedule);

// ── Admin: clear cache ──────────────────────────────────────────────────────
router.post('/cache/clear', clearCache);

module.exports = router;
