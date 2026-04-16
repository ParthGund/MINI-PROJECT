'use strict';

const pool = require('../db/connection');

// ── GET /api/passengers — list all saved passengers for logged-in user ────────
const getPassengers = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, age, gender, berth_preference, is_primary FROM saved_passengers WHERE user_id = ? ORDER BY is_primary DESC, name ASC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching passengers:', err);
    res.status(500).json({ message: 'Failed to fetch saved passengers' });
  }
};

// ── POST /api/passengers — add a new saved passenger ──────────────────────────
const addPassenger = async (req, res) => {
  try {
    const { name, age, gender, berthPreference, isPrimary } = req.body;

    if (!name || !age || !gender) {
      return res.status(400).json({ message: 'Name, age, and gender are required' });
    }
    if (age < 1 || age > 120) {
      return res.status(400).json({ message: 'Age must be between 1 and 120' });
    }

    // Check limit: max 10 saved passengers per user
    const [countRows] = await pool.execute(
      'SELECT COUNT(*) as cnt FROM saved_passengers WHERE user_id = ?',
      [req.user.id]
    );
    if (countRows[0].cnt >= 10) {
      return res.status(400).json({ message: 'Maximum 10 saved passengers allowed' });
    }

    const [result] = await pool.execute(
      'INSERT INTO saved_passengers (user_id, name, age, gender, berth_preference, is_primary) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, name.trim(), age, gender, berthPreference || null, isPrimary ? 1 : 0]
    );

    res.status(201).json({
      id: result.insertId,
      name: name.trim(),
      age,
      gender,
      berth_preference: berthPreference || null,
      is_primary: isPrimary ? 1 : 0,
    });
  } catch (err) {
    console.error('Error adding passenger:', err);
    res.status(500).json({ message: 'Failed to add passenger' });
  }
};

// ── PUT /api/passengers/:id — update a saved passenger ────────────────────────
const updatePassenger = async (req, res) => {
  try {
    const { name, age, gender, berthPreference, isPrimary } = req.body;
    const passengerId = req.params.id;

    // Verify ownership
    const [existing] = await pool.execute(
      'SELECT id FROM saved_passengers WHERE id = ? AND user_id = ?',
      [passengerId, req.user.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Passenger not found' });
    }

    await pool.execute(
      'UPDATE saved_passengers SET name = ?, age = ?, gender = ?, berth_preference = ?, is_primary = ? WHERE id = ? AND user_id = ?',
      [name.trim(), age, gender, berthPreference || null, isPrimary ? 1 : 0, passengerId, req.user.id]
    );

    res.json({ message: 'Passenger updated successfully' });
  } catch (err) {
    console.error('Error updating passenger:', err);
    res.status(500).json({ message: 'Failed to update passenger' });
  }
};

// ── DELETE /api/passengers/:id — remove a saved passenger ─────────────────────
const deletePassenger = async (req, res) => {
  try {
    const passengerId = req.params.id;

    const [result] = await pool.execute(
      'DELETE FROM saved_passengers WHERE id = ? AND user_id = ?',
      [passengerId, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Passenger not found' });
    }

    res.json({ message: 'Passenger deleted successfully' });
  } catch (err) {
    console.error('Error deleting passenger:', err);
    res.status(500).json({ message: 'Failed to delete passenger' });
  }
};

module.exports = { getPassengers, addPassenger, updatePassenger, deletePassenger };
