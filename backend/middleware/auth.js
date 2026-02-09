// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme123';

/**
 * Middleware to authenticate JWT token
 * Extracts token from Authorization header and verifies it
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

    if (!token) {
      return res.status(401).json({ error: 'Authentication token required' });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Find user from token payload
    const user = await User.findById(decoded.id || decoded.userId).select('-password');

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Attach user to request object
    req.user = user;
    
    // Continue to next middleware/route
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

/**
 * Middleware to check if user is a teacher
 * Must be used AFTER authenticateToken
 */
const isTeacher = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Access denied. Teacher role required.' });
  }

  next();
};

module.exports = {
  authenticateToken,
  isTeacher
};