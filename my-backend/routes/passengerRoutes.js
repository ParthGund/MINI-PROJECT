'use strict';

const express = require('express');
const router = express.Router();

const {
  getPassengers,
  addPassenger,
  updatePassenger,
  deletePassenger,
} = require('../controllers/passengerController');

const { protect } = require('../middleware/authMiddleware');

// All routes are protected — require valid JWT
router.get('/', protect, getPassengers);
router.post('/', protect, addPassenger);
router.put('/:id', protect, updatePassenger);
router.delete('/:id', protect, deletePassenger);

module.exports = router;
