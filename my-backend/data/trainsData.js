/**
 * data/trainsData.js
 *
 * Single source of truth for in-memory train data.
 * Generates fresh random seat states every server restart.
 *
 * Extension points (for later):
 *   - Replace the array with a Map for O(1) lookups by id
 *   - Swap this module with a DB-backed version without touching controllers
 */

'use strict';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Pick `count` unique random integers in [1, total] (inclusive).
 * @param {number} total  - Total seat count
 * @param {number} count  - How many to mark booked
 * @returns {Set<number>}
 */
function randomBookedSet(total, count) {
    const booked = new Set();
    while (booked.size < count) {
        booked.add(Math.floor(Math.random() * total) + 1);
    }
    return booked;
}

/**
 * Generate a seat array of `total` seats with `bookedCount` randomly booked.
 * @param {number} total
 * @param {number} bookedCount - Must be in [8, 10] per spec
 * @returns {Array<{number: number, status: 'available'|'booked'}>}
 */
function generateSeats(total, bookedCount) {
    const booked = randomBookedSet(total, bookedCount);
    return Array.from({ length: total }, (_, i) => ({
        number: i + 1,
        status: booked.has(i + 1) ? 'booked' : 'available',
    }));
}

// ─── Seed data ────────────────────────────────────────────────────────────────
// bookedCount is randomised between 8 and 10 (inclusive) per spec.
const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const TOTAL_SEATS = 40;

/**
 * @type {Array<{
 *   id: string,
 *   name: string,
 *   source: string,
 *   destination: string,
 *   departure: string,
 *   arrival: string,
 *   seats: Array<{number: number, status: string}>
 * }>}
 */
const trains = [
    {
        id: 'TRN001',
        name: 'Rajdhani Express',
        source: 'Mumbai',
        destination: 'Delhi',
        departure: '06:00',
        arrival: '22:00',
        seats: generateSeats(TOTAL_SEATS, randomBetween(8, 10)),
    },
    {
        id: 'TRN002',
        name: 'Shatabdi Express',
        source: 'Delhi',
        destination: 'Jaipur',
        departure: '10:15',
        arrival: '14:30',
        seats: generateSeats(TOTAL_SEATS, randomBetween(8, 10)),
    },
    {
        id: 'TRN003',
        name: 'Deccan Queen',
        source: 'Pune',
        destination: 'Mumbai',
        departure: '07:15',
        arrival: '10:45',
        seats: generateSeats(TOTAL_SEATS, randomBetween(8, 10)),
    },
];

module.exports = trains;
