// backend/middleware/auth.js
//
// Auth Spec v2 — the ONE canonical auth middleware. Before this, server.js had a
// SECOND, separate authenticateToken implementation defined locally (setting only
// req.userId, no DB lookup, no fallback secret) used by every route defined
// directly in server.js, while every routes/*.js file used THIS one (setting
// req.user, with an insecure hardcoded 'changeme123' fallback secret). The two had
// drifted. This is now the only implementation — server.js imports it instead of
// defining its own. Sets BOTH req.user (full doc, minus password) AND req.userId
// (string) so none of the ~30 existing routes that read one or the other need to
// change.
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('../services/authService');

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

    // Attach user to request object — both shapes, for backward compat (see header note)
    req.user = user;
    req.userId = user._id.toString();

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
 * Same verification as authenticateToken, but never rejects — just proceeds
 * without req.user/req.userId if no/invalid token is present. Used by routes that
 * behave differently for guests vs. authenticated users (e.g. joining a classroom
 * by PIN). Moved here from server.js's local copy for the same reason as above —
 * one implementation, one JWT_SECRET source.
 */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id || decoded.userId).select('-password');
      if (user) {
        req.user = user;
        req.userId = user._id.toString();
      }
    } catch (error) {
      console.log('Optional auth: Invalid token, proceeding without auth');
    }
  }

  next();
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

/**
 * Middleware to check if user is a student
 * Must be used AFTER authenticateToken
 * Final audit — was previously duplicated byte-for-byte in routes/profile.js and
 * routes/rewards.js; consolidated here alongside isTeacher.
 */
const isStudent = (req, res, next) => {
  if (!req.user || req.user.role !== 'student') {
    return res.status(403).json({ error: 'Access denied. Student role required.' });
  }
  next();
};

module.exports = {
  authenticateToken,
  optionalAuth,
  isTeacher,
  isStudent
};