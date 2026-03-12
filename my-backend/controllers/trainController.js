/**
 * controllers/trainController.js
 *
 * CHANGED: All in-memory data from `data/trainsData.js` has been replaced
 * with MySQL queries via the shared connection pool.
 *
 * What changed vs the original:
 *   - `require('../data/trainsData')`   → removed
 *   - `require('../db/connection')`     → added
 *   - getAllTrains   → SELECT from trains + COUNT available seats
 *   - getTrainById  → SELECT train + all its seats
 *   - selectSeats   → validate seats exist & are available (DB check)
 *   - bookSeats     → NEW: POST /api/trains/:id/book-seats
 *                    confirms booking → updates seats to 'booked', writes Bookings row
 *   - enterQueue    → NEW helper: adds user to the queue table, called by selectSeats
 *
 * All existing API routes (GET /api/trains, GET /api/trains/:id,
 * POST /api/trains/:id/select-seats) keep the SAME path and response shape.
 * Two new optional routes are exported for wiring up later if needed.
 */

'use strict';

const pool = require('../db/connection');   // ── NEW: MySQL pool
const { getDepartureDate } = require('../timing');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trains
// Optional query: ?source=&destination=
// ─────────────────────────────────────────────────────────────────────────────
const getAllTrains = async (req, res) => {
    try {
        const { source, destination } = req.query;

        // ── CHANGED: build a dynamic SQL query with optional filters ─────────────
        let sql = `
      SELECT
        t.id,
        t.name,
        t.source,
        t.destination,
        t.departure,
        t.arrival,
        COUNT(CASE WHEN s.status = 'available' THEN 1 END) AS availableSeats,
        COUNT(s.id)                                         AS totalSeats
      FROM trains t
      LEFT JOIN seats s ON s.train_id = t.id
    `;
        const params = [];

        // Append WHERE clauses dynamically (mirrors the original trim/lowercase logic)
        const conditions = [];
        if (source) {
            conditions.push('LOWER(t.source) LIKE ?');
            params.push(`%${source.trim().toLowerCase()}%`);
        }
        if (destination) {
            conditions.push('LOWER(t.destination) LIKE ?');
            params.push(`%${destination.trim().toLowerCase()}%`);
        }
        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }

        sql += ' GROUP BY t.id, t.name, t.source, t.destination, t.departure, t.arrival';

        const [trains] = await pool.execute(sql, params);

        const departureDate = getDepartureDate();
        const enriched = trains.map(t => ({
            ...t,
            departureDate,
        }));

        return res.status(200).json({
            count: enriched.length,
            trains: enriched,
        });
    } catch (err) {
        console.error('[trainController.getAllTrains]', err);
        return res.status(500).json({ message: 'Error fetching trains' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trains/:id
// Returns full train detail including all seats.
// ─────────────────────────────────────────────────────────────────────────────
const getTrainById = async (req, res) => {
    try {
        // ── CHANGED: fetch train row from DB ─────────────────────────────────────
        const [trainRows] = await pool.execute(
            'SELECT id, name, source, destination, departure, arrival FROM trains WHERE id = ? LIMIT 1',
            [req.params.id]
        );

        if (trainRows.length === 0) {
            return res.status(404).json({ message: `Train '${req.params.id}' not found` });
        }

        const train = trainRows[0];

        // ── CHANGED: fetch all seats for this train ───────────────────────────────
        const [seats] = await pool.execute(
            `SELECT seat_number AS number, coach, seat_type, status
       FROM seats
       WHERE train_id = ?
       ORDER BY seat_number ASC`,
            [train.id]
        );

        const departureDate = getDepartureDate();

        return res.status(200).json({ ...train, seats, departureDate });

    } catch (err) {
        console.error('[trainController.getTrainById]', err);
        return res.status(500).json({ message: 'Error fetching train details' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/trains/:id/select-seats  (Protected — requires Bearer token)
// Body: { seats: [1, 5, 12] }
//
// Validates the requested seats against the DB, then:
//   1. Locks the seats (status → 'locked', locked_by_user_id = user.id)
//   2. Adds the user to the queue table
//   3. Returns success
//
// CHANGED: Previously only validated against in-memory data and did NOT persist
// anything.  Now it writes to seats (lock) and queue tables.
// ─────────────────────────────────────────────────────────────────────────────
const selectSeats = async (req, res) => {
    const trainId = req.params.id;
    const userId = req.user.id;   // from JWT decoded in authMiddleware

    try {
        // ── Validate body ─────────────────────────────────────────────────────────
        const { seats: requestedSeats } = req.body;

        if (!Array.isArray(requestedSeats) || requestedSeats.length === 0) {
            return res.status(400).json({ message: 'Provide a non-empty "seats" array in the request body' });
        }

        // ── Rule 1: Max 3 seats ──────────────────────────────────────────────────
        if (requestedSeats.length > 3) {
            return res.status(400).json({
                message: `Maximum 3 seats allowed per request. You requested ${requestedSeats.length}.`,
            });
        }

        // ── Rule 2: All values must be valid integers ─────────────────────────────
        const invalid = requestedSeats.filter(n => !Number.isInteger(n) || n < 1);
        if (invalid.length > 0) {
            return res.status(400).json({ message: `Invalid seat number(s): ${invalid.join(', ')}` });
        }

        // ── CHANGED: Verify train exists in DB ───────────────────────────────────
        const [trainRows] = await pool.execute(
            'SELECT id FROM trains WHERE id = ? LIMIT 1',
            [trainId]
        );
        if (trainRows.length === 0) {
            return res.status(404).json({ message: `Train '${trainId}' not found` });
        }

        // ── CHANGED: Validate seats exist and are available in DB ────────────────
        // Fetch all requested seats in a single query using IN (?)
        const placeholders = requestedSeats.map(() => '?').join(',');
        const [seatRows] = await pool.execute(
            `SELECT seat_number, status FROM seats
       WHERE train_id = ? AND seat_number IN (${placeholders})`,
            [trainId, ...requestedSeats]
        );

        // Build a quick lookup map
        const foundMap = new Map(seatRows.map(s => [s.seat_number, s.status]));

        for (const seatNum of requestedSeats) {
            if (!foundMap.has(seatNum)) {
                return res.status(400).json({
                    message: `Seat ${seatNum} does not exist on train ${trainId}`,
                });
            }
            const status = foundMap.get(seatNum);
            if (status === 'booked') {
                return res.status(400).json({ message: `Seat ${seatNum} is already booked` });
            }
            if (status === 'locked') {
                return res.status(400).json({ message: `Seat ${seatNum} is currently locked by another user` });
            }
        }

        // ── CHANGED: Lock seats + add to queue inside a transaction ──────────────
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            // Lock each seat (status = 'locked', locked_by_user_id = userId)
            for (const seatNum of requestedSeats) {
                await conn.execute(
                    `UPDATE seats SET status = 'locked', locked_by_user_id = ?
           WHERE train_id = ? AND seat_number = ?`,
                    [userId, trainId, seatNum]
                );
            }

            // Determine next queue position for this train
            const [[{ maxPos }]] = await conn.execute(
                'SELECT COALESCE(MAX(position), 0) AS maxPos FROM queue WHERE train_id = ?',
                [trainId]
            );
            const newPosition = maxPos + 1;

            // Insert queue entry with comma-separated seat numbers
            await conn.execute(
                `INSERT INTO queue (user_id, train_id, position, selected_seats)
         VALUES (?, ?, ?, ?)`,
                [userId, trainId, newPosition, requestedSeats.join(',')]
            );

            await conn.commit();
        } catch (txErr) {
            await conn.rollback();
            throw txErr;   // re-throw to outer catch
        } finally {
            conn.release();
        }

        // ── Return success (same shape as original) ───────────────────────────────
        return res.status(200).json({
            message: 'Seats validated and queued successfully',
            selectedSeats: requestedSeats,
        });

    } catch (err) {
        console.error('[trainController.selectSeats]', err);
        return res.status(500).json({ message: 'Error validating seats' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/trains/:id/book-seats  (Protected)
// Body: { seats: [1, 5, 12] }
//
// NEW: Confirms a booking — marks seats as 'booked' and writes a Bookings row.
// Typically called after the user has already been placed in the queue via
// selectSeats() and it is their turn.
// ─────────────────────────────────────────────────────────────────────────────
const bookSeats = async (req, res) => {
    const trainId = req.params.id;
    const userId = req.user.id;

    try {
        const { seats: requestedSeats } = req.body;

        if (!Array.isArray(requestedSeats) || requestedSeats.length === 0) {
            return res.status(400).json({ message: 'Provide a non-empty "seats" array' });
        }

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            // Mark each seat as 'booked'
            for (const seatNum of requestedSeats) {
                await conn.execute(
                    `UPDATE seats
           SET status = 'booked', locked_by_user_id = NULL
           WHERE train_id = ? AND seat_number = ? AND locked_by_user_id = ?`,
                    [trainId, seatNum, userId]
                );
            }

            // Write confirmed booking record
            await conn.execute(
                `INSERT INTO bookings (user_id, train_id, seat_numbers, booking_status)
         VALUES (?, ?, ?, 'confirmed')`,
                [userId, trainId, requestedSeats.join(',')]
            );

            // Remove user from the queue for this train (their turn is done)
            await conn.execute(
                'DELETE FROM queue WHERE user_id = ? AND train_id = ?',
                [userId, trainId]
            );

            await conn.commit();
        } catch (txErr) {
            await conn.rollback();
            throw txErr;
        } finally {
            conn.release();
        }

        return res.status(200).json({
            message: 'Booking confirmed!',
            bookedSeats: requestedSeats,
            booking_status: 'confirmed',
        });

    } catch (err) {
        console.error('[trainController.bookSeats]', err);
        return res.status(500).json({ message: 'Error confirming booking' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/trains/:id/queue  (Protected)
// Returns the current queue for a train.
// ─────────────────────────────────────────────────────────────────────────────
const getQueue = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT q.id, q.position, q.selected_seats, q.joined_at,
              u.name AS user_name, u.email AS user_email
       FROM queue q
       JOIN users u ON u.id = q.user_id
       WHERE q.train_id = ?
       ORDER BY q.position ASC`,
            [req.params.id]
        );

        return res.status(200).json({ queue: rows });
    } catch (err) {
        console.error('[trainController.getQueue]', err);
        return res.status(500).json({ message: 'Error fetching queue' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/bookings  (Protected) — convenience: all bookings for a user
// ─────────────────────────────────────────────────────────────────────────────
const getUserBookings = async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT b.id, b.seat_numbers, b.booking_status, b.created_at,
              t.name AS train_name, t.source, t.destination, t.departure, t.arrival
       FROM bookings b
       JOIN trains t ON t.id = b.train_id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC`,
            [req.user.id]
        );

        return res.status(200).json({ bookings: rows });
    } catch (err) {
        console.error('[trainController.getUserBookings]', err);
        return res.status(500).json({ message: 'Error fetching bookings' });
    }
};

module.exports = {
    getAllTrains,
    getTrainById,
    selectSeats,
    bookSeats,
    getQueue,
    getUserBookings,
};
