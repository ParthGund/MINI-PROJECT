/**
 * controllers/userController.js
 *
 * CHANGED: All in-memory `users` array operations have been replaced with
 * MySQL queries via the shared connection pool.
 *
 * What changed vs the original:
 *   - `const users = []`  → removed (was the in-memory store)
 *   - registerUser        → INSERT INTO users + SELECT to verify
 *   - loginUser           → SELECT by email, then bcrypt.compare
 *   - getUserProfile      → SELECT by id (decoded from JWT)
 *
 * The JWT shape (id, email) and all HTTP status codes are UNCHANGED
 * so the frontend requires zero modifications.
 */

'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
// ── NEW: import the MySQL pool instead of the old in-memory array ──
const pool = require('../db/connection');

// ─── Helper: sign a JWT ──────────────────────────────────────────────────────
const generateToken = (id, email) =>
    jwt.sign({ id, email }, process.env.JWT_SECRET, { expiresIn: '1h' });

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Register a new user
// @route   POST /api/users/register
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Please provide all fields' });
        }

        // ── CHANGED: check duplicate email against DB ────────────────────────────
        const [existing] = await pool.execute(
            'SELECT id FROM users WHERE email = ? LIMIT 1',
            [email]
        );
        if (existing.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash password (same as before)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // ── CHANGED: INSERT into users table ────────────────────────────────────
        const [result] = await pool.execute(
            'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
            [name, email, hashedPassword]
        );

        const newId = result.insertId;   // MySQL auto-increment id

        return res.status(201).json({
            id: newId,
            name,
            email,
            token: generateToken(newId, email),
        });

    } catch (error) {
        console.error('Error in registerUser:', error);
        return res.status(500).json({ message: 'Server error during registration' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Authenticate a user
// @route   POST /api/users/login
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Please provide email and password' });
        }

        // ── CHANGED: SELECT user by email from DB ────────────────────────────────
        const [rows] = await pool.execute(
            'SELECT id, name, email, password FROM users WHERE email = ? LIMIT 1',
            [email]
        );

        const user = rows[0];

        if (user && (await bcrypt.compare(password, user.password))) {
            return res.status(200).json({
                id: user.id,
                name: user.name,
                email: user.email,
                token: generateToken(user.id, user.email),
            });
        }

        return res.status(401).json({ message: 'Invalid email or password' });

    } catch (error) {
        console.error('Error in loginUser:', error);
        return res.status(500).json({ message: 'Server error during login' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private (JWT required)
// ─────────────────────────────────────────────────────────────────────────────
const getUserProfile = async (req, res) => {
    try {
        // req.user is the decoded JWT payload: { id, email }
        // ── CHANGED: SELECT from DB instead of searching in-memory array ─────────
        const [rows] = await pool.execute(
            'SELECT id, name, email, created_at FROM users WHERE id = ? LIMIT 1',
            [req.user.id]
        );

        const user = rows[0];

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.status(200).json({
            id: user.id,
            name: user.name,
            email: user.email,
            created_at: user.created_at,
        });

    } catch (error) {
        console.error('Error in getUserProfile:', error);
        return res.status(500).json({ message: 'Server error getting profile' });
    }
};

module.exports = { registerUser, loginUser, getUserProfile };
