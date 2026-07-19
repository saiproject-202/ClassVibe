// ============================================
// IMPORTS - Load all required libraries
// ============================================

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose'); // ✅ ADD THIS

// After: const Message = require('./models/Message');
// ADD THIS:
const ScheduledSession = require('./models/ScheduledSession');  // ⭐ NEW

const connectDB = require('./config/db');
const User = require('./models/User');
const Group = require('./models/Group');
const Message = require('./models/Message');
const Notification = require('./models/Notification');
// Auth Spec v2 — server.js used to define ITS OWN separate authenticateToken/
// optionalAuth (setting only req.userId, no DB lookup, no fallback secret) while
// every routes/*.js file used the different implementation in middleware/auth.js
// (setting req.user, with an insecure hardcoded fallback secret). Now unified: this
// is the only implementation, and it sets both req.user and req.userId.
const { authenticateToken, optionalAuth, isTeacher } = require('./middleware/auth');
const { generateToken, sanitizeUser, createTimedToken, verifyTimedToken, hashToken } = require('./services/authService');
const { sendEmail } = require('./services/emailService');
const { verificationEmail, passwordResetEmail } = require('./services/authEmailTemplates');
const { verifyGoogleIdToken } = require('./services/googleAuthService');
const { resolveGoogleUser } = require('./services/googleAccountResolver');
const { AUTH_PROVIDERS } = require('./config/authProviders');

// ============================================
// SERVER SETUP
// ============================================

const app = express();
const server = http.createServer(app);

// ── CORS origin checker ───────────────────────────────────────────────────
// Allowed:
//   1. Exact match on FRONTEND_URL env var  (production deployment)
//   2. localhost or 127.0.0.1 on any port   (local dev, http or https)
//   3. Any 192.168.x.x on any port          (LAN / mobile dev, http or https)
// Everything else is rejected to keep production security intact.
const isAllowedOrigin = (origin) => {
  if (!origin) return true; // no Origin header = server-to-server or same-origin — allow
  if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  if (/^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin)) return true;
  return false;
};

const corsHandler = (origin, callback) => {
  if (isAllowedOrigin(origin)) {
    callback(null, true);
  } else {
    console.warn(`CORS blocked: ${origin}`);
    callback(new Error(`Origin not allowed by CORS policy: ${origin}`));
  }
};

// Explicit preflight handler — must be before app.use(cors()) and all routes.
// Without this, browsers sending OPTIONS preflight with a custom origin function
// may not receive Access-Control-Allow-Origin before other middleware runs.
app.options('*', cors({ origin: corsHandler, credentials: true }));
app.use(cors({ origin: corsHandler, credentials: true }));

const io = new Server(server, {
  cors: {
    origin: corsHandler,
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["polling", "websocket"]  // polling first
});

app.set('io', io); 
global.io = io;

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// Add tracking in socket events (copy from guide)

// ============================================
// ROUTE IMPORTS (Add at top with other imports)
// ============================================
const quizRoutes = require('./routes/quiz');                    // ⭐ ADD THIS
const analyticsRoutes = require('./routes/analytics');          // ⭐ ADD THIS
const notificationRoutes = require('./routes/notifications');   // ⭐ ADD THIS
const profileRoutes = require('./routes/profile');
const rewardsRoutes = require('./routes/rewards');
const { AVATAR_ITEM_CATALOG } = require('./avatarCatalog');
const { BADGE_CATALOG } = require('./badgeCatalog');
const { startSessionReminderJob } = require('./jobs/sessionReminder');
// Add this with other route imports (around line 20)
const quizTestRoutes = require('./routes/quiz-test');
const privacyRoutes = require('./routes/privacy');

// Add this with other app.use routes (around line 50)

// ============================================
// USE ROUTES (Add after other app.use routes)
// ============================================
// ✅ SECOND (VERY IMPORTANT)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/quiz', quizRoutes);                   // ⭐ ADD THIS
app.use('/api/analytics', analyticsRoutes);         // ⭐ ADD THIS
app.use('/api/profile', profileRoutes);
app.use('/api/rewards', rewardsRoutes);
app.use('/api/notifications', notificationRoutes);  // ⭐ ADD THIS
app.use('/api/privacy', privacyRoutes);

// ============================================
// START JOBS (Add after server starts)
// ============================================

// After io.listen() or server.listen(), add:

// Start session reminder job (optional - controlled by env variable)
if (process.env.ENABLE_SESSION_REMINDERS !== 'false') {
  const reminderJobId = startSessionReminderJob();
  
  // Store job ID for cleanup on shutdown
  process.reminderJobId = reminderJobId;
  
  console.log('✅ Session reminder job is running');
} else {
  console.log('⏸️ Session reminder job is disabled');
}

// In socket connection
const { setupQuizSocketHandlers, cleanupQuizTimers } = require('./socket-handlers/quiz-socket-handlers');

io.on('connection', (socket) => {
  setupQuizSocketHandlers(io, socket); // ← ADD THIS LINE
});  // ... existing auth ...

// Add cleanup
process.on('SIGTERM', () => {
  server.close();
});

// ============================================
// MIDDLEWARE
// ============================================


// ✅ FIX: Add explicit logging
app.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    console.log(`📥 ${req.method} ${req.path}`, {
      hasBody: !!req.body,
      contentType: req.headers['content-type']
    });
  }
  next();
});

// ... rest of your code continues here
// ============================================
// FILE UPLOAD SETUP (Multer)
// ============================================

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|pdf|doc|docx|txt/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, videos, and documents allowed.'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilter
});

// ============================================
// CONNECT TO DATABASE
// ============================================

connectDB();

// ============================================
// HELPER FUNCTIONS
// ============================================

const generatePIN = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Settings → Privacy → Show Online Status: given a list of candidate user ids (or
// populated {_id,...} objects), returns the subset who've opted out — i.e. who
// must NOT appear in any Group.onlineUsers payload sent to a client. This is a
// separate leak from the isOnline field (masked by User.toJSON): being listed IN
// onlineUsers is itself the presence signal, independent of any boolean field.
const getHiddenOnlineUserIds = async (candidateIds) => {
  if (!candidateIds || candidateIds.length === 0) return new Set();
  const ids = candidateIds.map(id => (id && id._id ? id._id : id).toString());
  const hidden = await User.find(
    { _id: { $in: ids }, 'privacyPreferences.showOnlineStatus': false },
    '_id'
  );
  return new Set(hidden.map(u => u._id.toString()));
};

// Private Session system — atomically transition (or create) a roster entry to
// 'requested' when someone not on the invite list tries to join. Uses
// arrayFilters throughout, not the positional $ operator — stress-testing
// under real concurrency (several approve/reject/request calls racing on the
// same document) showed plain query-matched positional-$ updates can silently
// fail to apply while still reporting a matched document, which is exactly
// the kind of bug that looks fine in a single manual test and then corrupts
// state under load. arrayFilters is MongoDB's unambiguous mechanism for
// "update the one array element matching these conditions" and is reliable
// where the positional operator proved not to be.
// Returns isNewRequest, decided by which atomic update actually wins, never
// by a pre-read of the caller's in-memory group snapshot — under true
// concurrency (several requests racing in with no existing entry yet), a
// pre-read would have every one of them see "nothing exists" and each
// conclude it's the first, spamming the teacher with a notification per
// attempt instead of once for the one real request that landed.
const upsertRosterRequest = async (groupId, email, userId) => {
  const now = new Date();

  // Case 1: a 'declined' entry being re-requested — genuinely new (decline
  // isn't terminal), so the teacher should hear about it again.
  //
  // timestamps:false on every arrayFilters call below is load-bearing, not
  // cosmetic: Group's schema has timestamps:true, so Mongoose auto-bumps
  // updatedAt on every update — including ones whose arrayFilters matched
  // ZERO array elements. That alone makes modifiedCount:1 even when the
  // intended $set never touched anything, which silently defeated the
  // "did this call actually win" checks below until caught by stress testing.
  const setFields = { 'roster.$[elem].status': 'requested', 'roster.$[elem].requestedAt': now, 'roster.$[elem].respondedAt': null };
  if (userId) setFields['roster.$[elem].user'] = userId;
  let result = await Group.updateOne(
    { _id: groupId },
    { $set: setFields },
    { arrayFilters: [{ 'elem.email': email, 'elem.status': 'declined' }], timestamps: false }
  );
  if (result.modifiedCount > 0) return true;

  // Case 2: no entry at all yet — atomic push, race-safe: if several requests
  // for the same never-before-seen email hit this simultaneously, only one
  // query can match (the others no longer see 'roster.email': {$ne: email}
  // once the first one lands), so only one is ever the "new" request. $push
  // doesn't target a specific existing array element via arrayFilters, so
  // it's unaffected by the timestamps quirk above — the query itself (not
  // just the array-scoped $set) has to fail to match for modifiedCount to be 0.
  result = await Group.updateOne(
    { _id: groupId, 'roster.email': { $ne: email } },
    { $push: { roster: { email, user: userId || null, status: 'requested', requestedAt: now } } }
  );
  if (result.modifiedCount > 0) return true;

  // Case 3: already sitting in 'requested' — this attempt lost the race (or is
  // simply a retry/double-click on an already-pending request). Just refresh
  // the timestamp; no second notification for a request the teacher already has.
  result = await Group.updateOne(
    { _id: groupId },
    { $set: { 'roster.$[elem].requestedAt': now } },
    { arrayFilters: [{ 'elem.email': email, 'elem.status': 'requested' }], timestamps: false }
  );
  if (result.modifiedCount > 0) return false;

  // Rare fallback (entry's state changed again between the checks above,
  // e.g. a concurrent reject just landed) — retry the declined-transition path.
  await Group.updateOne(
    { _id: groupId },
    { $set: setFields },
    { arrayFilters: [{ 'elem.email': email }] }
  );
  return true;
};

// Private Session system — flips an 'invited' roster entry to 'joined' (also
// resolving `user` if it was null, e.g. the account didn't exist at invite time).
const markRosterJoined = async (groupId, email, userId) => {
  const normalizedEmail = (email || '').toLowerCase().trim();
  await Group.updateOne(
    { _id: groupId },
    { $set: { 'roster.$[elem].status': 'joined', 'roster.$[elem].user': userId } },
    { arrayFilters: [{ 'elem.email': normalizedEmail }] }
  );
};

// Private Session system — real-time roster sync for the teacher's Session
// Details view. Deliberately sent ONLY to the teacher's personal room, never to
// the group room: the roster contains every invited/requested/declined
// student's email, which regular classroom members must never see (same PII
// concern as the isAdmin-gated GET /api/groups/:groupId response below).
const emitRosterUpdate = async (group) => {
  try {
    const io = global.io;
    if (!io) return;
    const fresh = await Group.findById(group._id).select('roster admin').lean();
    if (!fresh) return;
    io.to(fresh.admin.toString()).emit('rosterUpdate', { groupId: group._id.toString(), roster: fresh.roster });
  } catch (err) {
    console.error('emitRosterUpdate error (non-fatal):', err.message);
  }
};

// Private Session system — the single access-control decision point for every
// join path (PIN entry, QR scan, and the ?pin= URL deep-link all terminate at
// POST /api/groups/join, so fixing it here covers all of them). Returns
// { allowed: true } to proceed with addMember, or { allowed: false,
// pendingApproval: bool } to block — never leaks group/member data either way.
const checkGroupAccess = async (group, email, userId) => {
  const normalizedEmail = (email || '').toLowerCase().trim();

  if (group.isPrivate) {
    const existing = group.findRosterEntry(normalizedEmail);
    if (existing && (existing.status === 'invited' || existing.status === 'joined')) {
      return { allowed: true };
    }

    // isNewRequest is decided atomically inside upsertRosterRequest (by which
    // DB update wins), not from `existing` here — `existing` is a pre-loaded
    // snapshot that's stale under true concurrency (see upsertRosterRequest's
    // own comment for why a pre-read would over-notify).
    const isNewRequest = await upsertRosterRequest(group._id, normalizedEmail, userId || null);

    if (isNewRequest) {
      try {
        const requester = userId ? await User.findById(userId).select('name email') : null;
        await Notification.createNotification({
          recipient: group.admin,
          type: 'join_request',
          title: '🔔 Access Request',
          message: `${requester?.name || normalizedEmail} (${requester?.email || normalizedEmail}) wants to join "${group.groupName}"`,
          relatedGroup: group._id,
          priority: 'high',
          icon: '🔔',
          metadata: { groupId: group._id.toString(), email: normalizedEmail, requesterName: requester?.name || null }
        });
      } catch (notifErr) {
        console.error('Join-request notification error (non-fatal):', notifErr.message);
      }
    }
    return { allowed: false, pendingApproval: true };
  }

  if (group.allowedEmails && group.allowedEmails.length > 0) {
    // Legacy path — for groups created before isPrivate/roster existed, whose
    // only access gate is the older allowedEmails whitelist. Left untouched.
    return { allowed: group.isEmailAllowed(normalizedEmail) };
  }

  return { allowed: true };
};

// generateToken/authenticateToken/optionalAuth now come from
// ./services/authService and ./middleware/auth (imported near the top of this
// file) — see the Auth Spec v2 note there for why.

// ============================================
// REST API ROUTES
// ============================================

app.get('/', (req, res) => {
  res.json({ message: 'Chat App Server is Running! 🚀' });
});

app.get("/", (req, res) => {
  res.send("Server is running ✅");
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date(),
    uptime: process.uptime()
  });
});

// ------------------
// AUTH ROUTES
// ------------------

// Auth Spec v2 §1/§8 — public, read-only. The shared auth UI (Phase 4) reads this
// once on mount to decide which provider buttons are clickable vs shown as "coming
// soon," instead of duplicating config/authProviders.js's registry in the frontend.
app.get('/api/auth/providers', (req, res) => {
  res.json({ providers: AUTH_PROVIDERS });
});

// Auth Spec v2 (ChatGPT/Notion/Slack-style entry flow) — the single email step
// the shared auth screen submits before deciding whether to show a password
// field (existing account) or a name/password registration form (new account).
// Deliberately confirms account existence by design — this is the same
// industry-standard trade-off every referenced product (ChatGPT, Notion, Slack)
// makes for this exact UX, not an oversight. authProvider is also returned so
// the UI can suggest "Continue with Google" instead of a doomed password
// attempt for an email that was only ever created via Google.
app.post('/api/auth/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    const emailNorm = String(email).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(emailNorm)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }

    const user = await User.findOne({ email: emailNorm }).select('authProvider');
    res.json({ exists: !!user, authProvider: user ? user.authProvider : null });
  } catch (error) {
    console.error('Check email error:', error);
    res.status(500).json({ error: 'Server error checking email' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, name, role } = req.body;

    const finalUsername = username || (email ? email.split('@')[0] : null);
    const finalEmail = email || username;

    if (!finalUsername || !password) {
      return res.status(400).json({ error: 'Email/username and password are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const existingUser = await User.findOne({
      $or: [
        { username: finalUsername },
        { email: finalEmail }
      ]
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already taken' });
    }
    
    const user = new User({
      username: finalUsername,
      email: finalEmail,
      password,
      name: name || finalUsername,
      role: role || 'student'
    });

    // Auth Spec v2 §3 — email/password accounts start unverified (schema default)
    // and can't log in until they click the emailed link. No JWT is issued here
    // anymore: all 3 existing frontend callers (TeacherLogin.jsx, Login.js,
    // register() in api.js) already ignore register()'s token and only show the
    // success message, so removing it is a no-op for them, not a breaking change.
    const { rawToken, hashedToken, expiresAt } = createTimedToken(24 * 60);
    user.emailVerificationToken = hashedToken;
    user.emailVerificationExpires = expiresAt;

    await user.save();

    try {
      const emailContent = verificationEmail(user, rawToken);
      await sendEmail({ to: user.email, ...emailContent });
    } catch (emailErr) {
      // Account is already created — don't fail registration over a transient
      // email-send error. The user can always request another link via
      // /api/auth/resend-verification.
      console.error('Failed to send verification email:', emailErr);
    }

    res.status(201).json({
      message: 'Account created. Check your email to verify your account before logging in.',
      user: sanitizeUser(user)
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      message: "Database connection failed",
      error: 'Server error during registration' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, email, password, rememberMe } = req.body;

    if ((!username && !email) || !password) {
      return res.status(400).json({ error: 'Email/username and password are required' });
    }

    const loginIdentifier = email || username;

    const user = await User.findOne({
      $or: [
        { username: loginIdentifier },
        { email: loginIdentifier }
      ]
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Auth Spec v2 §3 — hard gate, email/password accounts only. Every other
    // authProvider (Google now, others later) is exempt by construction since
    // this check only runs for authProvider:'email'. Pre-existing accounts were
    // grandfathered to emailVerified:true by scripts/grandfatherEmailVerified.js
    // so this cannot lock out anyone who could already log in before Phase 2.
    if (user.authProvider === 'email' && !user.emailVerified) {
      return res.status(403).json({
        error: 'Please verify your email before logging in. Check your inbox for the verification link.',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    user.lastLogin = new Date();
    await user.save();

    // Auth Spec v2 §7 — "Remember me": checked → 30d session, unchecked → 1d
    // session, refresh must never log anyone out either way (both durations
    // comfortably outlive any real browsing session). Existing callers that don't
    // send rememberMe at all (current frontend, pre-Phase-4 UI) default to
    // remembered:true — identical to the previous unconditional-long-session
    // behavior, so this is not a regression for any existing flow.
    const token = generateToken(user._id, { rememberMe: rememberMe !== false });

    res.json({
      message: 'Login successful',
      token,
      user: sanitizeUser(user)
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// ------------------
// GOOGLE OAUTH
// Auth Spec v2 §2 — one endpoint handles all three cases: an existing Google user
// signing back in, an existing email/password user linking their (Google-verified)
// email, and a brand-new account being auto-created. `role` is only ever consulted
// for the auto-create case and is a claim from the request body, so it MUST be
// whitelisted here — never trust it enough to let a client mint an admin account.
// ------------------
app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken, role, rememberMe } = req.body;

    let profile;
    try {
      profile = await verifyGoogleIdToken(idToken);
    } catch (verifyErr) {
      return res.status(401).json({ error: verifyErr.message || 'Invalid Google sign-in.' });
    }

    const { user, isNewUser } = await resolveGoogleUser(profile, { role });

    const token = generateToken(user._id, { rememberMe: rememberMe !== false });

    res.json({
      message: isNewUser ? 'Account created successfully' : 'Signed in successfully',
      token,
      isNewUser,
      user: sanitizeUser(user)
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: 'Server error during Google sign-in' });
  }
});

// ------------------
// STUDENT GUEST AUTH  (used by "Open Student Dashboard" feature only)
// Register if email is new; sign in if email already exists.
// Leaves the existing /register and /login routes completely untouched.
// ------------------
app.post('/api/auth/student-guest-auth', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const emailNorm = email.trim().toLowerCase();

    // ── Case 1: email already exists → sign in ──────────────────────────────
    const existingUser = await User.findOne({ email: emailNorm });
    if (existingUser) {
      const passwordOk = existingUser.password
        ? await existingUser.comparePassword(password)
        : false;
      if (!passwordOk) {
        return res.status(401).json({
          error: 'An account with this email already exists. Enter the password you used when you first joined a classroom.'
        });
      }
      const token = generateToken(existingUser._id);
      return res.json({
        message: 'Signed in successfully',
        token,
        user: {
          id:       existingUser._id.toString(),
          username: existingUser.username,
          email:    existingUser.email,
          name:     existingUser.name,
          role:     existingUser.role
        }
      });
    }

    // ── Case 2: new email → register ─────────────────────────────────────────
    // Generate a unique username: email-prefix + random suffix so it never
    // collides with existing usernames even if two people share a prefix.
    const prefix = emailNorm.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 12);
    const uniqueUsername = (prefix + '_' + Math.random().toString(36).slice(2, 7)).slice(0, 20);

    const user = new User({
      username: uniqueUsername,
      email:    emailNorm,
      password,
      name:     name.trim(),
      role:     'student'
    });
    await user.save();

    const token = generateToken(user._id);
    return res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        id:       user._id.toString(),
        username: user.username,
        email:    user.email,
        name:     user.name,
        role:     user.role
      }
    });

  } catch (error) {
    console.error('Student guest auth error:', error);
    return res.status(500).json({ error: 'Server error during authentication.' });
  }
});

// ------------------
// VERIFY EMAIL
// Auth Spec v2 §3 — the raw token only ever exists in the emailed link; only its
// hash is stored (createTimedToken/verifyTimedToken from authService.js, same
// pattern already used for passwordResetToken below).
// ------------------
app.post('/api/auth/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    const hashed = hashToken(token);
    const user = await User.findOne({ emailVerificationToken: hashed })
      .select('+emailVerificationToken +emailVerificationExpires');

    if (!user || !verifyTimedToken(token, user.emailVerificationToken, user.emailVerificationExpires)) {
      return res.status(400).json({ error: 'This verification link is invalid or has expired.' });
    }

    user.emailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save();

    res.json({ message: 'Email verified successfully. You can now log in.' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Server error during email verification' });
  }
});

// ------------------
// RESEND VERIFICATION EMAIL
// Anti-enumeration: always returns the same generic response regardless of
// whether the email exists, is already verified, or uses a different provider —
// so this endpoint can't be used to probe which emails have accounts.
// ------------------
app.post('/api/auth/resend-verification', async (req, res) => {
  const genericResponse = { message: 'If an account with that email exists and needs verification, a new verification link has been sent.' };
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await User.findOne({ email: String(email).trim().toLowerCase() });
    if (user && user.authProvider === 'email' && !user.emailVerified) {
      const { rawToken, hashedToken, expiresAt } = createTimedToken(24 * 60);
      user.emailVerificationToken = hashedToken;
      user.emailVerificationExpires = expiresAt;
      await user.save();

      try {
        const emailContent = verificationEmail(user, rawToken);
        await sendEmail({ to: user.email, ...emailContent });
      } catch (emailErr) {
        console.error('Failed to send verification email:', emailErr);
      }
    }

    res.json(genericResponse);
  } catch (error) {
    console.error('Resend verification error:', error);
    res.json(genericResponse);
  }
});

// ------------------
// FORGOT PASSWORD
// Anti-enumeration, same pattern as resend-verification above. 15-30 min expiry
// per Auth Spec v2 §4 (using 30).
// ------------------
app.post('/api/auth/forgot-password', async (req, res) => {
  const genericResponse = { message: 'If an account with that email exists, a password reset link has been sent.' };
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Only email/password accounts have a local password to reset — OAuth
    // accounts (Google, etc.) have no password field by design.
    const user = await User.findOne({ email: String(email).trim().toLowerCase(), authProvider: 'email' });
    if (user) {
      const { rawToken, hashedToken, expiresAt } = createTimedToken(30);
      user.passwordResetToken = hashedToken;
      user.passwordResetExpires = expiresAt;
      await user.save();

      try {
        const emailContent = passwordResetEmail(user, rawToken);
        await sendEmail({ to: user.email, ...emailContent });
      } catch (emailErr) {
        console.error('Failed to send password reset email:', emailErr);
      }
    }

    res.json(genericResponse);
  } catch (error) {
    console.error('Forgot password error:', error);
    res.json(genericResponse);
  }
});

// ------------------
// RESET PASSWORD
// The reset token itself is the secret here (not an email address), so unlike the
// two endpoints above, it's safe to say specifically "invalid or expired" without
// leaking anything about which emails have accounts.
// ------------------
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const hashed = hashToken(token);
    const user = await User.findOne({ passwordResetToken: hashed })
      .select('+passwordResetToken +passwordResetExpires');

    if (!user || !verifyTimedToken(token, user.passwordResetToken, user.passwordResetExpires)) {
      return res.status(400).json({ error: 'This password reset link is invalid or has expired.' });
    }

    user.password = newPassword; // pre-save hook hashes it
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    res.json({ message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error during password reset' });
  }
});

// ------------------
// UPDATE PROFILE
// ------------------
app.put('/api/auth/update-profile', authenticateToken, async (req, res) => {
  try {
    const { name, username, profilePhoto } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (username && username.trim() !== user.username) {
      const exists = await User.findOne({ username: username.trim(), _id: { $ne: user._id } });
      if (exists) return res.status(400).json({ error: 'Username already taken' });
      user.username = username.trim();
    }
    if (name) user.name = name.trim();
    if (profilePhoto !== undefined) user.profilePhoto = profilePhoto;
    await user.save();
    res.json({
      message: 'Profile updated',
      user: { id: user._id.toString(), username: user.username, email: user.email, name: user.name, role: user.role }
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ------------------
// AVATAR (see AVATAR_FOUNDATION.md for the data model this reads/writes)
// ------------------
app.get('/api/avatar', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('avatar');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ avatar: user.avatar });
  } catch (err) {
    console.error('Get avatar error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/avatar', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // badges is intentionally excluded — earned via the Rewards system, not user-editable here
    const editableFields = ['gender', 'skinTone', 'hair', 'eyes', 'shirt', 'pants', 'shoes', 'accessory', 'background', 'favoriteEmote', 'title', 'favoriteItems'];
    for (const field of editableFields) {
      if (req.body[field] !== undefined) {
        user.avatar[field] = req.body[field];
      }
    }
    await user.save();
    res.json({ message: 'Avatar updated', avatar: user.avatar });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    console.error('Update avatar error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ------------------
// AVATAR ITEM CATALOG (Milestone 10 — Avatar Builder picker UI)
// ------------------
app.get('/api/avatar/catalog', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('avatar');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const earnedBadges = new Set(user.avatar.badges || []);
    const favoriteItems = user.avatar.favoriteItems || [];
    const badgeByslug = {};
    BADGE_CATALOG.forEach(b => { badgeByslug[b.slug] = b; });

    const catalog = {};
    for (const slot of Object.keys(AVATAR_ITEM_CATALOG)) {
      const equippedSlot = user.avatar[slot];
      catalog[slot] = AVATAR_ITEM_CATALOG[slot].map(item => {
        const locked = !!(item.unlock && item.unlock.badge && !earnedBadges.has(item.unlock.badge));
        const isEquipped = !!(equippedSlot && equippedSlot.itemId === item.itemId);
        const unlockBadge = item.unlock && badgeByslug[item.unlock.badge];
        return {
          ...item,
          locked,
          isEquipped,
          equippedVariant: isEquipped ? equippedSlot.variant : null,
          isFavorite: favoriteItems.includes(item.itemId),
          unlockHint: unlockBadge ? `Earn the ${unlockBadge.icon} ${unlockBadge.name} badge to unlock` : null
        };
      });
    }

    res.json({ catalog });
  } catch (err) {
    console.error('Get avatar catalog error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ------------------
// FILE UPLOAD ROUTE
// ------------------

app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    
    res.json({
      success: true,
      file: {
        url: fileUrl,
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: error.message });
  } else if (error) {
    return res.status(400).json({ error: error.message });
  }
  next();
});
  // Find this section:
  // ------------------
  // MESSAGE ROUTES
  // ------------------

  // BEFORE that section, ADD:

  // ------------------
  // SCHEDULE ROUTES
  // ------------------
  const scheduleRoutes = require('./routes/schedule');
  app.use('/api/schedule', scheduleRoutes);

// ------------------
// GROUP ROUTES
// ------------------

// Phase 5 route-guard audit — this route had NO role check at all: any
// authenticated student could call it and become the "admin" of their own
// classroom (confirmed live before this fix). A dead/unmounted duplicate route
// file (routes/groupRoutes.js + controllers/groupController.js, removed in the
// final audit) had documented this as "Teacher only" and even had isTeacher
// wired — but it was never require()'d by server.js, so it was never actually
// enforced. This is the one real route Express serves for this path.
app.post('/api/groups/create', authenticateToken, isTeacher, async (req, res) => {
  try {
    const { groupName } = req.body;
    
    if (!groupName) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    
    let pin;
    let pinExists = true;
    while (pinExists) {
      pin = generatePIN();
      pinExists = await Group.findOne({ pin });
    }
    
    const joinUrl = `${process.env.FRONTEND_URL}?pin=${pin}`;
    const qrCode = await QRCode.toDataURL(joinUrl);
    
    const group = new Group({
      groupName,
      admin: req.userId,
      members: [{
        user: req.userId,
        joinedAt: new Date()
      }],
      pin,
      qrCode,
      onlineUsers: []
    });
    
    await group.save();
    await group.populate('admin', 'username name');

    console.log('✅ Group created:', { groupName, pin, admin: req.userId });

    // Notify all students who have previously joined any of this teacher's sessions
    try {
      const teacher = await User.findById(req.userId);
      const pastGroups = await Group.find({ admin: req.userId }).select('members');
      const studentSet = new Set();
      const studentIds = [];
      pastGroups.forEach(g => {
        (g.members || []).forEach(m => {
          const uid = (m.user?._id || m.user)?.toString();
          if (uid && uid !== req.userId.toString() && !studentSet.has(uid)) {
            studentSet.add(uid);
            studentIds.push(m.user?._id || m.user);
          }
        });
      });
      if (studentIds.length > 0) {
        await Notification.createBulkNotifications(studentIds, {
          sender: req.userId,
          type: 'session_started',
          title: '🚀 Live Session Started!',
          message: `${teacher?.name || teacher?.username} just started "${groupName}". PIN: ${pin}`,
          relatedGroup: group._id,
          priority: 'high',
          icon: '🚀',
          metadata: { groupId: group._id.toString(), pin }
        });
        console.log(`📢 Notified ${studentIds.length} students about new session`);
      }
    } catch (notifErr) {
      console.error('Notification error (non-fatal):', notifErr.message);
    }

    res.status(201).json({
      message: 'Group created successfully',
      group: {
        id: group._id,
        groupName: group.groupName,
        pin: group.pin,
        qrCode: group.qrCode,
        admin: group.admin,
        createdAt: group.createdAt
      }
    });
    
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Server error creating group' });
  }
});

// ADD THIS - Active quiz check route (fixes FloatingQuizButton 404)
app.get('/api/quiz/group/:groupId/active', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    // Return no active session for now
    res.json({ session: null });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ FIX 2: JOIN GROUP ROUTE - Enhanced logging and PIN sanitization
app.post('/api/groups/join', optionalAuth, async (req, res) => {
  try {
    const { pin, name, email } = req.body;
    
    // ✅ LOG 1: Incoming request
    console.log('📥 Join request received:', { 
      pin: pin ? `${pin.substring(0, 2)}****` : 'MISSING',
      name: name || 'N/A', 
      email: email ? email.substring(0, 3) + '***' : 'N/A',
      hasAuth: !!req.userId,
      userId: req.userId || 'guest'
    });
    
    // ✅ VALIDATE PIN EXISTS
    if (!pin) {
      console.log('❌ Join failed: PIN missing');
      return res.status(400).json({ error: 'PIN is required' });
    }
    
    // ✅ CLEAN PIN (remove spaces, trim, convert to string)
    const cleanPin = String(pin).trim().replace(/\s+/g, '');
    
    console.log('🧹 Cleaned PIN:', cleanPin, `(original: "${pin}")`);
    
    // ✅ VALIDATE PIN FORMAT
    if (!/^\d{6}$/.test(cleanPin)) {
      console.log('❌ Join failed: Invalid PIN format');
      console.log('   Expected: 6 digits, Got:', cleanPin);
      return res.status(400).json({ 
        error: 'PIN must be exactly 6 digits',
        received: cleanPin.length + ' characters' 
      });
    }
    
    console.log('🔍 Searching for group with PIN:', cleanPin);
    
    // ✅ FIND GROUP
    const group = await Group.findOne({ pin: cleanPin, isActive: true });
    
    if (!group) {
      console.log('❌ Join failed: Group not found or inactive');
      console.log('   Searched PIN:', cleanPin);
      
      // Check if group exists but is inactive
      const inactiveGroup = await Group.findOne({ pin: cleanPin, isActive: false });
      if (inactiveGroup) {
        console.log('   Found inactive group:', inactiveGroup.groupName);
        return res.status(404).json({ error: 'This session has ended' });
      }
      
      return res.status(404).json({ error: 'Invalid PIN or session not found' });
    }
    
    console.log('✅ Group found:', group.groupName, '(ID:', group._id + ')');
    
    // ============================================
    // AUTHENTICATED USER JOIN
    // ============================================
    if (req.userId) {
      console.log('👤 Authenticated join for user:', req.userId);

      // Check if already a member
      if (group.isMember(req.userId)) {
        console.log('✅ User already a member');

        await group.populate('admin', 'username name');
        await group.populate('members.user', 'username name isOnline');

        return res.json({
          message: 'Already a member',
          group: {
            id: group._id,
            groupName: group.groupName,
            pin: group.pin,
            admin: group.admin,
            members: group.members,
            isActive: group.isActive
          }
        });
      }

      // Private Session system — single access-control decision for this join
      // attempt (covers isPrivate+roster and the legacy allowedEmails whitelist).
      const authUser = await User.findById(req.userId).select('email');
      const access = await checkGroupAccess(group, authUser?.email, req.userId);
      if (!access.allowed) {
        console.log('❌ Join failed: not authorized', access.pendingApproval ? '(request filed)' : '(legacy whitelist)');
        return res.status(403).json({
          error: access.pendingApproval
            ? 'You are not allowed to join this class. Please contact the teacher if you believe this is a mistake.'
            : 'Your email is not authorized for this session. Please contact the teacher.',
          pendingApproval: !!access.pendingApproval
        });
      }
      if (group.isPrivate) {
        await markRosterJoined(group._id, authUser?.email, req.userId);
      }

      // Add as member
      console.log('➕ Adding user to group');
      await group.addMember(req.userId);
      if (group.isPrivate) emitRosterUpdate(group);

      await group.populate('admin', 'username name');
      await group.populate('members.user', 'username name isOnline');

      console.log('✅ User joined successfully');

      return res.json({
        message: 'Joined group successfully',
        group: {
          id: group._id,
          groupName: group.groupName,
          pin: group.pin,
          admin: group.admin,
          members: group.members,
          isActive: group.isActive
        }
      });
    }

    // ============================================
    // GUEST USER JOIN
    // ============================================
    console.log('👥 Guest join attempt');

    if (!name || !email) {
      console.log('❌ Guest join failed: Name or email missing');
      return res.status(400).json({
        error: 'Name and email are required for guest join'
      });
    }

    const emailNorm = email.trim().toLowerCase();

    console.log('🔍 Checking if user exists with email:', emailNorm);

    let student = await User.findOne({ email: emailNorm });

    // Private Session system — check access BEFORE creating an account for an
    // unauthorized attempt, so a rejected/pending guest join doesn't leave a
    // throwaway User document behind. student may be null here (no account
    // yet) — checkGroupAccess/upsertRosterRequest both handle a null userId.
    const guestAccess = await checkGroupAccess(group, emailNorm, student?._id || null);
    if (!guestAccess.allowed) {
      console.log('❌ Guest join failed: not authorized', guestAccess.pendingApproval ? '(request filed)' : '(legacy whitelist)');
      return res.status(403).json({
        error: guestAccess.pendingApproval
          ? 'You are not allowed to join this class. Please contact the teacher if you believe this is a mistake.'
          : 'Your email is not authorized for this session. Please contact the teacher.',
        pendingApproval: !!guestAccess.pendingApproval
      });
    }

    if (!student) {
      console.log('👤 Creating new student user');

      const usernameBase = name.trim().replace(/\s+/g, '_').replace(/[^\w\-._]/g, '').slice(0, 30) || 'student';
      let username = usernameBase;
      let suffix = 0;

      while (await User.findOne({ username })) {
        suffix++;
        username = `${usernameBase}_${suffix}`;
        if (suffix > 100) break;
      }

      const randomPass = crypto.randomBytes(8).toString('hex');

      student = new User({
        username,
        email: emailNorm,
        password: randomPass,
        name: name.trim(),
        role: 'student'
      });

      await student.save();
      console.log('✅ New student created:', username);
    } else {
      console.log('✅ Existing user found:', student.username);
    }

    if (group.isPrivate) {
      await markRosterJoined(group._id, emailNorm, student._id);
    }

    // Add to group if not already member
    if (!group.isMember(student._id)) {
      console.log('➕ Adding guest to group');
      await group.addMember(student._id);
      if (group.isPrivate) emitRosterUpdate(group);
    } else {
      console.log('ℹ️ Guest already a member');
    }

    const token = generateToken(student._id);

    await group.populate('admin', 'username name');
    await group.populate('members.user', 'username name isOnline');

    console.log('✅ Guest joined successfully:', student.name);

    res.json({
      message: 'Joined group successfully',
      token,
      user: {
        id: student._id.toString(),
        username: student.username,
        email: student.email,
        name: student.name,
        role: student.role
      },
      group: {
        id: group._id,
        groupName: group.groupName,
        pin: group.pin,
        admin: group.admin,
        members: group.members,
        isActive: group.isActive
      }
    });
    
  } catch (error) {
    console.error('❌ Join group error:', error);
    console.error('   Stack:', error.stack);
    res.status(500).json({ 
      error: 'Server error joining group',
      details: error.message 
    });
  }
});

// GET MY GROUPS
app.get('/api/groups/my-groups', authenticateToken, async (req, res) => {
  try {
    const groups = await Group.find({
      'members.user': req.userId,
      // ✅ NEW: a "quick quiz" classroom (auto-created by "Create New Quiz" with no
      // classroom open) is hidden from the TEACHER who created it (admin) so it doesn't
      // clutter "My Classes" — but a student who joined it still needs to find their
      // session here, so it stays visible to everyone else.
      $or: [
        { isQuickQuiz: { $ne: true } },
        { isQuickQuiz: true, admin: { $ne: req.userId } }
      ]
    })
    .populate('admin', 'username name')
    .populate('members.user', 'username name isOnline')
    .sort({ createdAt: -1 })
    .lean(); // skip Mongoose document wrapper overhead — this endpoint is read-only

    // Settings → Privacy → Show Online Status. .lean() returns plain objects, so
    // User.toJSON's isOnline masking never runs here — mask it manually. Collect
    // every candidate id across all groups first so this is one query, not N+1.
    const allMemberIds = groups.flatMap(g => (g.members || []).map(m => m.user?._id).filter(Boolean));
    const allOnlineIds = groups.flatMap(g => g.onlineUsers || []);
    const hiddenIds = await getHiddenOnlineUserIds([...allMemberIds, ...allOnlineIds]);

    const groupsWithJoinedAt = groups.map(group => {
      // With .lean() group is already a plain object — no .toObject() needed
      const currentUserMember = group.members.find(m =>
        m.user && m.user._id && m.user._id.toString() === req.userId.toString()
      );
      (group.members || []).forEach(m => {
        if (m.user && hiddenIds.has(m.user._id.toString())) m.user.isOnline = false;
      });
      const visibleOnlineUsers = (group.onlineUsers || []).filter(id => !hiddenIds.has(id.toString()));

      // Private Session system — same teacher-only gate as GET /api/groups/:groupId.
      // .lean() returns every schema field by default, so roster (other people's
      // emails/request history) would otherwise leak to every ordinary member here.
      const isAdminHere = group.admin && group.admin._id && group.admin._id.toString() === req.userId.toString();
      const rosterField = (group.isPrivate && isAdminHere) ? group.roster : undefined;

      const result = {
        ...group,
        onlineUsers: visibleOnlineUsers,
        userJoinedAt: currentUserMember ? currentUserMember.joinedAt : null
      };
      if (rosterField) result.roster = rosterField; else delete result.roster;
      return result;
    });

    res.json({ groups: groupsWithJoinedAt });
    
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Server error fetching groups' });
  }
});

// GET GROUP DETAILS
app.get('/api/groups/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const group = await Group.findById(groupId)
      .populate('admin', 'username name')
      .populate('members.user', 'username name isOnline')
      .populate('onlineUsers', 'username')
      .populate('roster.user', 'username name');

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (!group.isMember(req.userId)) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    // ✅ Check if session is still active — the admin is exempt (pre-existing
    // bug, not introduced by Private Sessions: this blocked the teacher too,
    // which broke "Session Details" for every already-ended group, not just
    // private ones — a regular member trying to re-enter an ended chat still
    // correctly gets blocked here).
    if (!group.isActive && !group.isAdmin(req.userId)) {
      return res.status(403).json({ error: 'This session has ended' });
    }

    // Settings → Privacy → Show Online Status — see getHiddenOnlineUserIds above.
    const hiddenIds = await getHiddenOnlineUserIds(group.onlineUsers);
    group.onlineUsers = group.onlineUsers.filter(u => !hiddenIds.has(u._id.toString()));

    // Private Session system — roster (Invited/Joined status for Session Details)
    // is teacher-only. Every ordinary member hits this same endpoint on every
    // group load, so it must never be present in the response for a student —
    // it contains other people's emails and request/decline history.
    const responseGroup = group.toObject();
    if (group.isPrivate && group.isAdmin(req.userId)) {
      const onlineIdSet = new Set(group.onlineUsers.map(u => u._id.toString()));
      responseGroup.roster = group.roster.map(r => ({
        email: r.email,
        user: r.user ? { _id: r.user._id, name: r.user.name, username: r.user.username } : null,
        status: r.status,
        invitedAt: r.invitedAt,
        requestedAt: r.requestedAt,
        respondedAt: r.respondedAt,
        online: !!(r.user && onlineIdSet.has(r.user._id.toString()) && !hiddenIds.has(r.user._id.toString()))
      }));
    } else {
      delete responseGroup.roster;
    }

    res.json({ group: responseGroup });
    
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ error: 'Server error fetching group' });
  }
});

// Private Session system — teacher approves a pending ('requested') roster
// entry, letting that student in immediately. Every step is atomic: two
// concurrent approve calls for the same request (double-click, retry, etc.)
// must add the member exactly once and notify exactly once, never duplicate
// either — see the stress-test notes above upsertRosterRequest for why a
// load-mutate-save pattern doesn't hold up under real concurrency.
app.post('/api/groups/:groupId/roster/:email/approve', authenticateToken, async (req, res) => {
  try {
    const { groupId, email } = req.params;
    const normalizedEmail = decodeURIComponent(email).toLowerCase().trim();

    const group = await Group.findById(groupId).select('admin');
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (!group.isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Only the teacher can approve access requests' });
    }

    const entryLookup = await Group.findOne(
      { _id: groupId, 'roster.email': normalizedEmail },
      { roster: { $elemMatch: { email: normalizedEmail } } }
    );
    const entry = entryLookup?.roster?.[0];
    if (!entry) return res.status(404).json({ error: 'No request found for that email' });

    const now = new Date();

    // Add as a member — $ne guard makes this a no-op for every call after the
    // first, instead of each one blindly pushing its own duplicate entry.
    if (entry.user) {
      await Group.updateOne(
        { _id: groupId, 'members.user': { $ne: entry.user } },
        { $push: { members: { user: entry.user, joinedAt: now } } }
      );
    }

    // Flip roster status via arrayFilters, not the positional $ operator — under
    // real concurrency (several approve calls racing on the same document), a
    // plain query-matched positional $ update proved unreliable at correctly
    // scoping to just the one transitioning element (confirmed via stress
    // testing: concurrent calls all reported success while the document never
    // actually changed). arrayFilters is MongoDB's unambiguous mechanism for
    // this and is what should have been used from the start.
    const flipUpdate = await Group.updateOne(
      { _id: groupId },
      { $set: { 'roster.$[elem].status': 'joined', 'roster.$[elem].respondedAt': now } },
      { arrayFilters: [{ 'elem.email': normalizedEmail, 'elem.status': { $in: ['requested', 'declined'] } }], timestamps: false }
    );
    const flipped = flipUpdate.modifiedCount > 0;

    const freshGroup = await Group.findById(groupId);
    emitRosterUpdate(freshGroup);

    if (flipped && entry.user) {
      try {
        await Notification.createNotification({
          recipient: entry.user,
          sender: req.userId,
          type: 'access_approved',
          title: '✅ Access Approved',
          message: `You've been let into "${freshGroup.groupName}". Join now!`,
          relatedGroup: freshGroup._id,
          priority: 'high',
          icon: '✅',
          metadata: { groupId: freshGroup._id.toString(), pin: freshGroup.pin }
        });
      } catch (notifErr) {
        console.error('Access-approved notification error (non-fatal):', notifErr.message);
      }
    }

    res.json({ message: 'Access approved', email: normalizedEmail });
  } catch (error) {
    console.error('Approve roster request error:', error);
    res.status(500).json({ error: 'Server error approving request' });
  }
});

// Private Session system — teacher rejects a pending ('requested') roster
// entry. Not terminal — a fresh join attempt from the same email re-requests.
// Same atomic-transition gating as approve, so concurrent duplicate reject
// calls notify exactly once.
app.post('/api/groups/:groupId/roster/:email/reject', authenticateToken, async (req, res) => {
  try {
    const { groupId, email } = req.params;
    const normalizedEmail = decodeURIComponent(email).toLowerCase().trim();

    const group = await Group.findById(groupId).select('admin');
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (!group.isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Only the teacher can reject access requests' });
    }

    const entryLookup = await Group.findOne(
      { _id: groupId, 'roster.email': normalizedEmail },
      { roster: { $elemMatch: { email: normalizedEmail } } }
    );
    const entry = entryLookup?.roster?.[0];
    if (!entry) return res.status(404).json({ error: 'No request found for that email' });

    const now = new Date();
    // arrayFilters, not positional $ — see the approve endpoint's comment.
    const flipUpdate = await Group.updateOne(
      { _id: groupId },
      { $set: { 'roster.$[elem].status': 'declined', 'roster.$[elem].respondedAt': now } },
      { arrayFilters: [{ 'elem.email': normalizedEmail, 'elem.status': { $in: ['requested', 'invited'] } }], timestamps: false }
    );
    const flipped = flipUpdate.modifiedCount > 0;

    const freshGroup = await Group.findById(groupId);
    emitRosterUpdate(freshGroup);

    if (flipped && entry.user) {
      try {
        await Notification.createNotification({
          recipient: entry.user,
          sender: req.userId,
          type: 'access_declined',
          title: '🚫 Access Declined',
          message: `Your request to join "${freshGroup.groupName}" was declined.`,
          relatedGroup: freshGroup._id,
          priority: 'medium',
          icon: '🚫'
        });
      } catch (notifErr) {
        console.error('Access-declined notification error (non-fatal):', notifErr.message);
      }
    }

    res.json({ message: 'Access declined', email: normalizedEmail });
  } catch (error) {
    console.error('Reject roster request error:', error);
    res.status(500).json({ error: 'Server error rejecting request' });
  }
});

// END SESSION
app.post('/api/groups/:groupId/end', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    if (!group.isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Only admin can end the session' });
    }
    
    await group.endSession();

    console.log('🔴 Session ended:', groupId);

    io.to(groupId).emit('sessionEnded', {
      message: 'The admin has ended this session',
      groupId: group._id
    });

    // "Class completed successfully" — notify everyone who actually attended
    // (group.members), not the teacher themselves and not the full invite list
    // (people who were invited but never joined weren't "in" the class).
    try {
      const attendeeIds = group.members
        .map(m => m.user.toString())
        .filter(id => id !== req.userId.toString());
      if (attendeeIds.length > 0) {
        await Notification.createBulkNotifications(attendeeIds, {
          sender: req.userId,
          type: 'session_ended',
          title: '🏁 Class Completed',
          message: `"${group.groupName}" has ended. Class completed successfully.`,
          relatedGroup: group._id,
          priority: 'low',
          icon: '🏁'
        });
      }
    } catch (notifErr) {
      console.error('Class-completed notification error (non-fatal):', notifErr.message);
    }

    res.json({ message: 'Session ended successfully' });
    
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ error: 'Server error ending session' });
  }
});

// Teacher Moderated Chat — admin-only toggle. Broadcasts to the whole group
// room so every connected client (teacher + all students) updates instantly.
app.post('/api/groups/:groupId/moderated-chat', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { enabled } = req.body;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (!group.isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Only the teacher can change this setting' });
    }

    group.moderatedChat = !!enabled;
    await group.save();

    io.to(groupId).emit('moderatedChatToggled', {
      groupId: group._id,
      moderatedChat: group.moderatedChat
    });

    res.json({ moderatedChat: group.moderatedChat });

  } catch (error) {
    console.error('Toggle moderated chat error:', error);
    res.status(500).json({ error: 'Server error updating moderated chat setting' });
  }
});

// ------------------
// MESSAGE ROUTES
// ------------------

app.get('/api/groups/:groupId/messages', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (!group.isMember(req.userId)) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    // Teacher Moderated Chat: non-admins only ever see their own messages,
    // broadcasts (recipient:null), and messages addressed to them. The admin
    // always sees everything. Because non-moderated sends always store
    // recipient:null, this same filter is a no-op when the mode is off.
    const query = { group: groupId };
    if (!group.isAdmin(req.userId)) {
      query.$or = [
        { sender: req.userId },
        { recipient: null },
        { recipient: req.userId }
      ];
    }

    const messages = await Message.find(query)
      .populate('sender', 'username name isOnline avatar')
      .populate('recipient', 'username name')
      .sort({ createdAt: 1 })
      .limit(100);

    res.json({ messages });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Server error fetching messages' });
  }
});

// ============================================
// SOCKET.IO - REAL-TIME COMMUNICATION
// ============================================

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);
  
  socket.userId = null;
  
  // AUTHENTICATION
  socket.on('authenticate', async (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;

      // Join personal room so the user receives targeted notifications
      socket.join(socket.userId.toString());

      await User.findByIdAndUpdate(socket.userId, {
        socketId: socket.id,
        isOnline: true,
        lastSeen: new Date()
      });

      console.log(`✅ User ${socket.userId} authenticated`);
      socket.emit('authenticated', { success: true });
      
    } catch (error) {
      console.error('Socket authentication error:', error);
      socket.emit('authError', { error: 'Invalid token' });
    }
  });
  
  // JOIN GROUP
  socket.on('joinGroup', async (groupId) => {
    try {
      if (!socket.userId) {
        console.log('❌ Join group failed: Not authenticated');
        return socket.emit('error', { error: 'Not authenticated' });
      }
      
      console.log(`📂 User ${socket.userId} joining group ${groupId}`);
      
      const group = await Group.findById(groupId);
      
      if (!group) {
        console.log('❌ Group not found');
        return socket.emit('error', { error: 'Group not found' });
      }
      
      if (!group.isActive) {
        console.log('❌ Session has ended');
        return socket.emit('error', { error: 'This session has ended' });
      }
      
      if (!group.isMember(socket.userId)) {
        console.log('❌ User not a member');
        return socket.emit('error', { error: 'Access denied' });
      }
      
      socket.join(groupId);
      
      if (!group.onlineUsers.includes(socket.userId)) {
        group.onlineUsers.push(socket.userId);
        await group.save();
      }
      
      const user = await User.findById(socket.userId);
      
      socket.to(groupId).emit('userJoined', {
        userId: socket.userId,
        username: user.username,
        timestamp: new Date()
      });
      
      socket.emit('joinedGroup', { groupId });

      await group.populate('onlineUsers', 'username');
      const hiddenIds = await getHiddenOnlineUserIds(group.onlineUsers);
      io.to(groupId).emit('onlineUsersUpdate', {
        onlineUsers: group.onlineUsers.filter(u => !hiddenIds.has(u._id.toString()))
      });

      console.log(`✅ User ${socket.userId} joined group ${groupId}`);
      
    } catch (error) {
      console.error('Join group error:', error);
      socket.emit('error', { error: 'Failed to join group' });
    }
  });
  
  // LEAVE GROUP
  socket.on('leaveGroup', async (groupId) => {
    try {
      if (!socket.userId) return;
      
      const group = await Group.findById(groupId);
      if (!group) return;
      
      group.onlineUsers = group.onlineUsers.filter(
        userId => userId.toString() !== socket.userId.toString()
      );
      await group.save();
      
      socket.leave(groupId);

      await group.populate('onlineUsers', 'username');
      const hiddenIds = await getHiddenOnlineUserIds(group.onlineUsers);
      io.to(groupId).emit('onlineUsersUpdate', {
        onlineUsers: group.onlineUsers.filter(u => !hiddenIds.has(u._id.toString()))
      });

      console.log(`👋 User ${socket.userId} left group ${groupId}`);
      
    } catch (error) {
      console.error('Leave group error:', error);
    }
  });
  
  // SEND MESSAGE
  socket.on('sendMessage', async (data) => {
    try {
      if (!socket.userId) {
        return socket.emit('error', { error: 'Not authenticated' });
      }

      const { groupId, content, messageType, recipientId, fileUrl, fileName, fileSize, fileType } = data;

      const group = await Group.findById(groupId);
      if (!group || !group.isMember(socket.userId)) {
        return socket.emit('error', { error: 'Access denied' });
      }

      // Teacher Moderated Chat — recipient is always resolved server-side,
      // never trusted from the client. When the mode is off, every message
      // is a broadcast (recipient:null), exactly like before this feature.
      // When it's on: students' messages are forced to the teacher; the
      // teacher may broadcast or target any single member (multi-recipient
      // replies are handled client-side as one sendMessage call per target).
      let finalRecipient = null;
      if (group.moderatedChat) {
        if (group.isAdmin(socket.userId)) {
          if (recipientId && group.isMember(recipientId)) {
            finalRecipient = recipientId;
          }
        } else {
          finalRecipient = group.admin;
        }
      }

      const message = new Message({
        group: groupId,
        sender: socket.userId,
        content,
        messageType: finalRecipient ? 'private' : (messageType || 'text'),
        recipient: finalRecipient,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        fileSize: fileSize || null,
        fileType: fileType || null
      });

      await message.save();

      await message.populate('sender', 'username name isOnline avatar');
      if (finalRecipient) {
        await message.populate('recipient', 'username name');
      }

      if (finalRecipient) {
        io.to(socket.userId.toString()).to(finalRecipient.toString()).emit('newMessage', message);
      } else {
        io.to(groupId).emit('newMessage', message);
      }

    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('error', { error: 'Failed to send message' });
    }
  });

    // ⭐ NEW: POLL VOTING
    socket.on('votePoll', async (data) => {
      try {
        if (!socket.userId) {
          return socket.emit('error', { error: 'Not authenticated' });
        }
        
        const { messageId, optionIndex, groupId } = data;
        
        // Find the poll message
        const message = await Message.findById(messageId);
        if (!message) {
          return socket.emit('error', { error: 'Poll not found' });
        }
        
        // Check if user is in the group
        const group = await Group.findById(groupId || message.group);
        if (!group || !group.isMember(socket.userId)) {
          return socket.emit('error', { error: 'Access denied' });
        }
        
        // Check if poll options exist
        if (!message.pollOptions || !message.pollOptions[optionIndex]) {
          return socket.emit('error', { error: 'Invalid poll option' });
        }
        
        // Remove previous vote if exists
        message.pollOptions.forEach(option => {
          if (!option.votes) option.votes = [];
          option.votes = option.votes.filter(
            voterId => voterId.toString() !== socket.userId.toString()
          );
        });
        
        // Add new vote
        if (!message.pollOptions[optionIndex].votes) {
          message.pollOptions[optionIndex].votes = [];
        }
        message.pollOptions[optionIndex].votes.push(socket.userId);
        
        // Save updated poll
        await message.save();
        await message.populate('sender', 'username name avatar');

        // Broadcast updated poll to all group members
        io.to(message.group.toString()).emit('pollUpdated', message);
        
        console.log(`✅ User ${socket.userId} voted on poll ${messageId}`);
        
      } catch (error) {
        console.error('Vote poll error:', error);
        socket.emit('error', { error: 'Failed to vote' });
      }
    });
  
  // EDIT MESSAGE
  socket.on('editMessage', async (data) => {
    try {
      if (!socket.userId) return;
      
      const { messageId, newContent } = data;
      
      const message = await Message.findById(messageId);
      if (!message) {
        return socket.emit('error', { error: 'Message not found' });
      }
      
      if (message.sender.toString() !== socket.userId.toString()) {
        return socket.emit('error', { error: 'Can only edit your own messages' });
      }
      
      message.content = newContent;
      message.isEdited = true;
      message.editedAt = new Date();
      await message.save();
      
      await message.populate('sender', 'username name isOnline avatar');

      io.to(message.group.toString()).emit('messageEdited', message);
      
    } catch (error) {
      console.error('Edit message error:', error);
      socket.emit('error', { error: 'Failed to edit message' });
    }
  });
  
  // DELETE MESSAGE
  socket.on('deleteMessage', async (data) => {
    try {
      if (!socket.userId) return;
      
      const { messageId } = data;
      
      const message = await Message.findById(messageId);
      if (!message) {
        return socket.emit('error', { error: 'Message not found' });
      }
      
      if (message.sender.toString() !== socket.userId.toString()) {
        return socket.emit('error', { error: 'Can only delete your own messages' });
      }
      
      message.isDeleted = true;
      message.content = 'This message was deleted';
      await message.save();
      
      io.to(message.group.toString()).emit('messageDeleted', {
        messageId: message._id,
        groupId: message.group
      });
      
    } catch (error) {
      console.error('Delete message error:', error);
      socket.emit('error', { error: 'Failed to delete message' });
    }
  });
  
  // TYPING INDICATORS
  socket.on('typing', async (data) => {
    try {
      if (!socket.userId) return;
      
      const { groupId } = data;
      const user = await User.findById(socket.userId);
      
      socket.to(groupId).emit('userTyping', {
        userId: socket.userId,
        username: user.username
      });
      
    } catch (error) {
      console.error('Typing indicator error:', error);
    }
  });
  
  socket.on('stopTyping', async (data) => {
    try {
      if (!socket.userId) return;
      
      const { groupId } = data;
      const user = await User.findById(socket.userId);
      
      socket.to(groupId).emit('userStopTyping', {
        userId: socket.userId,
        username: user.username
      });
      
    } catch (error) {
      console.error('Stop typing error:', error);
    }
  });
  
  // DISCONNECT
  socket.on('disconnect', async () => {
    try {
      if (socket.userId) {
        await User.findByIdAndUpdate(socket.userId, {
          isOnline: false,
          lastSeen: new Date(),
          socketId: null
        });
        
        await Group.updateMany(
          { onlineUsers: socket.userId },
          { $pull: { onlineUsers: socket.userId } }
        );
        
        console.log(`👋 User ${socket.userId} disconnected`);
      }
      
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 5000;

// ✅ START SERVER FIRST (IMPORTANT)
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// ✅ THEN CONNECT DB (non-blocking)

// ============================================
// GRACEFUL SHUTDOWN (Add at bottom of file)
// ============================================

// Clean up jobs on server shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  // Stop reminder job
  if (process.reminderJobId) {
    const { stopSessionReminderJob } = require('./jobs/sessionReminder');
    stopSessionReminderJob(process.reminderJobId);
  }
  
  // Close server
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});