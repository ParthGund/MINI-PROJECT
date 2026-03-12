const jwt = require('jsonwebtoken');

const protect = (req, res, next) => {
    let token;

    // Check if the authorization header exists and starts with Bearer
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Extract the token from the header
            token = req.headers.authorization.split(' ')[1];

            // Verify the token using the secret
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Attach user data to request object
            req.user = decoded;

            next();
        } catch (error) {
            return res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token provided' });
    }
};

module.exports = { protect };
