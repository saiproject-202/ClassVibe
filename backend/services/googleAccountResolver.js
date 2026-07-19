// backend/services/googleAccountResolver.js
//
// Auth Spec v2 §2 — given an ALREADY-VERIFIED Google profile (see
// googleAuthService.js, which does the actual cryptographic verification), decides
// which of the three cases applies (returning Google user / link to existing
// email account / brand-new account) and returns the resulting User document.
// Split out from the route handler in server.js specifically so this
// security-sensitive decision logic can be exercised directly in tests with a
// fake-but-plausible profile object, without needing a real signed Google ID
// token (which can't be produced outside a real browser OAuth flow — that's
// Phase 4's job).

const User = require('../models/User');

const ALLOWED_AUTO_CREATE_ROLES = ['teacher', 'student'];

/**
 * @param {{ providerId: string, email: string, name: string, picture: string|null }} profile
 * @param {{ role?: string }} options - role is only consulted for brand-new accounts
 * @returns {Promise<{ user: import('mongoose').Document, isNewUser: boolean }>}
 */
const resolveGoogleUser = async (profile, { role } = {}) => {
  const { providerId, email, name, picture } = profile;

  // Case 1: returning Google user.
  let user = await User.findOne({ authProvider: 'google', providerId });
  let isNewUser = false;

  if (!user) {
    // Case 2: an existing account (almost certainly authProvider:'email') already
    // owns this email. Google independently verified the requester owns that
    // inbox, so it's safe to link rather than reject as a duplicate — the
    // pre-existing photo/avatar/role are left exactly as they are; only the
    // linkage + verification status change.
    user = await User.findOne({ email });
    if (user) {
      user.providerId = providerId;
      user.emailVerified = true;
    }
  }

  if (!user) {
    // Case 3: brand-new account. `role` is a client-supplied claim — MUST be
    // whitelisted here, never trusted enough to let a client mint an admin
    // account. Anything unrecognized falls back to 'student', matching the
    // existing /register endpoint's own default.
    const finalRole = ALLOWED_AUTO_CREATE_ROLES.includes(role) ? role : 'student';

    const prefix = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 12);
    const uniqueUsername = (prefix + '_' + Math.random().toString(36).slice(2, 7)).slice(0, 20);

    user = new User({
      username: uniqueUsername,
      email,
      name,
      role: finalRole,
      authProvider: 'google',
      providerId,
      emailVerified: true, // Google already verified this email — exempt from our own gate
      profilePhoto: picture // imported ONLY here, at account creation — never again
    });
    isNewUser = true;
  }

  user.lastLogin = new Date();
  await user.save();

  return { user, isNewUser };
};

module.exports = { resolveGoogleUser, ALLOWED_AUTO_CREATE_ROLES };
