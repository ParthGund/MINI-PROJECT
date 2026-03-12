require('dotenv').config();
const express = require('express');
const userRoutes = require('./routes/userRoutes');

const app = express();

// Middleware for JSON parsing
app.use(express.json());

// Routes
app.use('/api/users', userRoutes);

// Basic error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
