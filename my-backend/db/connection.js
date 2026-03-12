/**
 * db/connection.js
 *
 * Creates a single, reusable mysql2 connection POOL.
 * Using a pool (not a single connection) is the best practice for Express apps:
 *   - Automatically reuses idle connections → no overhead per request.
 *   - Handles dropped connections / reconnects transparently.
 *
 * All config is read from environment variables (.env) so credentials
 * are never hard-coded in source code.
 *
 * Usage (anywhere in the backend):
 *   const pool = require('./db/connection');
 *   const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
 */

'use strict';

const mysql = require('mysql2/promise');

// ── Create pool ───────────────────────────────────────────────────────────────
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',        // set in .env
    database: process.env.DB_NAME || 'railconnect',
    waitForConnections: true,   // queue requests rather than throw immediately
    connectionLimit: 10,      // max simultaneous connections in the pool
    queueLimit: 0,       // unlimited queue size (0 = no limit)
    timezone: '+00:00',// store all timestamps as UTC
});

// ── Quick connectivity test on startup ───────────────────────────────────────
// This logs a warning if the DB is unreachable but does NOT crash the server.
// Remove / adjust this block if you prefer a hard crash on startup.
(async () => {
    try {
        const conn = await pool.getConnection();
        console.log('✅  MySQL connected — database:', process.env.DB_NAME || 'railconnect');
        conn.release();
    } catch (err) {
        console.error('⚠️  MySQL connection failed:', err.message);
        console.error('    Make sure MySQL is running and .env has correct DB_* variables.');
    }
})();

module.exports = pool;
