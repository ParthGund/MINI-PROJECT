/**
 * db/seed.js
 *
 * Seeds the database with initial train and seat data.
 * Run ONCE after applying schema.sql:
 *     node db/seed.js
 *
 * It is IDEMPOTENT — running it twice won't create duplicate rows because
 * INSERT IGNORE respects the UNIQUE KEY on (train_id, seat_number).
 */

'use strict';

require('dotenv').config();
const pool = require('./connection');

// ─── Train master data ───────────────────────────────────────────────────────
const TRAINS = [
    { id: 'TRN001', name: 'Rajdhani Express', source: 'Mumbai', destination: 'Delhi', departure: '06:00', arrival: '22:00' },
    { id: 'TRN002', name: 'Shatabdi Express', source: 'Delhi', destination: 'Jaipur', departure: '10:15', arrival: '14:30' },
    { id: 'TRN003', name: 'Deccan Queen', source: 'Pune', destination: 'Mumbai', departure: '07:15', arrival: '10:45' },
];

const TOTAL_SEATS = 40;   // 40 seats per train

// ─── Helpers ──────────────────────────────────────────────────────────────────
function randomBookedSet(total, count) {
    const set = new Set();
    while (set.size < count) {
        set.add(Math.floor(Math.random() * total) + 1);
    }
    return set;
}

// Assign a seat type based on position within a coach berth pattern (LB/MB/UB repeating)
function getSeatType(seatNumber) {
    const types = ['LB', 'MB', 'UB', 'LB', 'MB', 'UB'];
    return types[(seatNumber - 1) % 6];
}

async function seed() {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // ── 1. Insert trains (ignore if already present) ─────────────────────────
        for (const train of TRAINS) {
            await conn.execute(
                `INSERT IGNORE INTO trains (id, name, source, destination, departure, arrival)
         VALUES (?, ?, ?, ?, ?, ?)`,
                [train.id, train.name, train.source, train.destination, train.departure, train.arrival]
            );
            console.log(`  Train ${train.id} (${train.name}) — seeded.`);
        }

        // ── 2. Insert seats for each train ───────────────────────────────────────
        for (const train of TRAINS) {
            // Check if seats already exist for this train
            const [existing] = await conn.execute(
                'SELECT COUNT(*) AS cnt FROM seats WHERE train_id = ?', [train.id]
            );
            if (existing[0].cnt > 0) {
                console.log(`  Seats for ${train.id} already exist — skipping.`);
                continue;
            }

            // Randomly mark 8-10 seats as booked (mirrors the original in-memory logic)
            const bookedCount = Math.floor(Math.random() * 3) + 8; // 8, 9, or 10
            const bookedSet = randomBookedSet(TOTAL_SEATS, bookedCount);

            for (let n = 1; n <= TOTAL_SEATS; n++) {
                const status = bookedSet.has(n) ? 'booked' : 'available';
                const seatType = getSeatType(n);
                await conn.execute(
                    `INSERT IGNORE INTO seats (train_id, seat_number, coach, seat_type, status)
           VALUES (?, ?, ?, ?, ?)`,
                    [train.id, n, 'General', seatType, status]
                );
            }
            console.log(`  ${TOTAL_SEATS} seats for ${train.id} — seeded (${bookedCount} booked).`);
        }

        await conn.commit();
        console.log('\n✅  Seeding complete.');
    } catch (err) {
        await conn.rollback();
        console.error('❌  Seeding failed:', err.message);
        throw err;
    } finally {
        conn.release();
        await pool.end();
    }
}

seed().catch(() => process.exit(1));
