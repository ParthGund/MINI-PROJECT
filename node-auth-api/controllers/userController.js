const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Temporary array to store users in memory
const users = [];

// Helper function to generate JWT
const generateToken = (id, email) => {
    return jwt.sign({ id, email }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

// @desc    Register a new user
// @route   POST /api/users/register
// @access  Public
const registerUser = async (req, res, next) => {
    try {
        const { name, email, password } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Please provide name, email, and password' });
        }

        // Check if user already exists
        const userExists = users.find((user) => user.email === email);
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create new user object
        const newUser = {
            id: users.length + 1, // Simple auto-increment ID
            name,
            email,
            password: hashedPassword,
        };

        // Store user in memory
        users.push(newUser);

        // Return user info and JWT token
        res.status(201).json({
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
            token: generateToken(newUser.id, newUser.email),
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Authenticate a user
// @route   POST /api/users/login
// @access  Public
const loginUser = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({ message: 'Please provide email and password' });
        }

        // Find user by email
        const user = users.find((u) => u.email === email);

        if (user && (await bcrypt.compare(password, user.password))) {
            // Password matches, return token
            res.json({
                id: user.id,
                name: user.name,
                email: user.email,
                token: generateToken(user.id, user.email),
            });
        } else {
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private (Requires JWT)
const getUserProfile = async (req, res, next) => {
    try {
        // The "protect" middleware attaches the decoded token payload to req.user
        // We find the user from our memory array
        const user = users.find((u) => u.id === req.user.id);

        if (user) {
            res.json({
                id: user.id,
                name: user.name,
                email: user.email,
            });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        next(error);
    }
};

module.exports = {
    registerUser,
    loginUser,
    getUserProfile,
};
