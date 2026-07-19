// backend/services/authService.js
//
// Auth Spec v2 — the ONE authentication layer every provider funnels through.
// Google, Email/Password, and (later) Apple/Phone/Microsoft/GitHub/LinkedIn/Facebook
// all end up calling the same generateToken()/sanitizeUser() here — adding a new
// provider later means writing an adapter that produces a User document and calls
// into this file, never touching session/token logic again.

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Auth Spec v2 §12 (Security): no insecure fallback secret. A server that can't
  // sign tokens securely should fail loudly at boot, not silently run with a
  // publicly-known default (the previous middleware/auth.js fallback was 'changeme123').
  throw new Error('JWT_SECRET environment variable is required and not set.');
}

// Auth Spec v2 §5 (Sessions / Remember Me): checked → long-lived session; unchecked
// → normal session. A browser refresh must NEVER log anyone out either way — the
// distinction is purely how long the token stays valid before a real re-login is
// needed, not whether a page refresh survives.
const TOKEN_EXPIRY = {
  remembered: '30d',
  normal: '1d'
};

/**
 * Issue a session JWT for a user. Every provider (email, Google, future ones) calls
 * this — the single point where "a user is now logged in" becomes a token.
 */
const generateToken = (userId, { rememberMe = true } = {}) => {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: rememberMe ? TOKEN_EXPIRY.remembered : TOKEN_EXPIRY.normal }
  );
};

/**
 * The one safe-to-send-to-frontend shape for a user. Existing endpoints in
 * server.js each hand-roll their own subset of these fields today — new auth code
 * (Phase 2+) should use this instead, so the response shape can't drift between
 * login/register/Google/etc. Deliberately NOT used to rewrite existing endpoints in
 * Phase 1 — that's an unrelated risk this phase doesn't need to take.
 */
const sanitizeUser = (userDoc) => {
  if (!userDoc) return null;
  return {
    id: userDoc._id.toString(),
    username: userDoc.username,
    email: userDoc.email,
    name: userDoc.name,
    role: userDoc.role,
    authProvider: userDoc.authProvider,
    emailVerified: userDoc.emailVerified,
    profilePhoto: userDoc.profilePhoto,
    avatar: userDoc.avatar,
    organizationId: userDoc.organizationId,
    schoolId: userDoc.schoolId
  };
};

// ── Token helpers for email verification / password reset (wired in Phase 2) ──
// Only the HASH is ever stored on the User doc (same principle as passwords never
// being stored raw) — the raw token exists only in the emailed link, so a database
// read alone can never produce a valid token.

const hashToken = (rawToken) =>
  crypto.createHash('sha256').update(rawToken).digest('hex');

/**
 * Returns { rawToken, hashedToken, expiresAt }. Caller stores hashedToken/expiresAt
 * on the user doc and emails rawToken to the user (Phase 2).
 */
const createTimedToken = (minutesValid) => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  return {
    rawToken,
    hashedToken: hashToken(rawToken),
    expiresAt: new Date(Date.now() + minutesValid * 60 * 1000)
  };
};

/** True if a stored hashed token matches the raw token AND hasn't expired. */
const verifyTimedToken = (rawToken, hashedToken, expiresAt) => {
  if (!rawToken || !hashedToken || !expiresAt) return false;
  if (new Date() > new Date(expiresAt)) return false;
  return hashToken(rawToken) === hashedToken;
};

module.exports = {
  JWT_SECRET,
  generateToken,
  sanitizeUser,
  hashToken,
  createTimedToken,
  verifyTimedToken
};
