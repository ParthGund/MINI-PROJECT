const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getUserProfile } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

// Route for user registration
router.post('/register', registerUser);

// Route for user login
router.post('/login', loginUser);

// Protected route to get user profile (requires the "protect" middleware)
router.get('/profile', protect, getUserProfile);

module.exports = router;
