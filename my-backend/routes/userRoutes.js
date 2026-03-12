const express = require('express');
const router = express.Router();

const {
    registerUser,
    loginUser,
    getUserProfile,
} = require('../controllers/userController');

// ── CHANGED: import getUserBookings which now lives in trainController ──
const { getUserBookings } = require('../controllers/trainController');

const { protect } = require('../middleware/authMiddleware');

// @route   POST /api/users/register
// @access  Public
router.post('/register', registerUser);

// @route   POST /api/users/login
// @access  Public
router.post('/login', loginUser);

// @route   GET /api/users/profile
// @access  Private
router.get('/profile', protect, getUserProfile);

// @route   GET /api/users/bookings   (NEW)
// @access  Private — returns all confirmed bookings for the logged-in user
router.get('/bookings', protect, getUserBookings);

module.exports = router;
