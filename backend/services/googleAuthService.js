// backend/services/googleAuthService.js
//
// Auth Spec v2 §1/§2 — Google OAuth adapter. Its only job is turning a
// Google-issued ID token into a verified, trustworthy identity payload; it never
// touches User documents or sessions directly — that's server.js's job, calling
// into authService.js exactly like the email/password flow does (see Phase 2).
// This is the "write an adapter" half of the "one authentication layer, many
// providers" architecture authService.js's header comment describes.

const { OAuth2Client } = require('google-auth-library');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || null;

// Mirrors emailService.js's hasSmtpConfig pattern from Phase 2 — a provider can be
// "enabled" in authProviders.js but still not actually configured for this
// deployment yet. The endpoint checks this and fails gracefully rather than
// crashing the whole server (unlike JWT_SECRET, a missing Google Client ID only
// disables ONE provider, not authentication entirely).
const isConfigured = !!GOOGLE_CLIENT_ID;

const client = isConfigured ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

/**
 * Verifies a Google ID token's signature, issuer, audience, and expiry against
 * Google's own public keys (network call to Google, not just a JWT decode).
 * Throws if invalid/expired/wrong-audience/tampered — callers must catch.
 * Returns the subset of the verified payload this app actually uses.
 */
const verifyGoogleIdToken = async (idToken) => {
  if (!isConfigured) {
    throw new Error('Google Sign-In is not configured on this server (GOOGLE_CLIENT_ID missing).');
  }
  if (!idToken) {
    throw new Error('idToken is required');
  }

  const ticket = await client.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID
  });

  const payload = ticket.getPayload();

  // Google's own contract: verifyIdToken already confirms the token was issued by
  // Google and hasn't expired, but email_verified is a claim ON the payload, not
  // something verifyIdToken itself enforces — Auth Spec v2 exempts Google accounts
  // from OUR verification gate specifically because Google verifies email
  // ownership, so this check is what makes that exemption actually safe.
  if (!payload || !payload.email || payload.email_verified !== true) {
    throw new Error('Google account email is not verified.');
  }

  return {
    providerId: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name || payload.email.split('@')[0],
    picture: payload.picture || null
  };
};

module.exports = { verifyGoogleIdToken, isConfigured };
