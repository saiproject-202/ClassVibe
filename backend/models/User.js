// backend/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Avatar Foundation (see AVATAR_FOUNDATION.md) — one wearable item reference: identifier only, never a file path
const avatarItemSchema = new mongoose.Schema({
  itemId: { type: String, required: true },
  variant: { type: String, required: true, default: 'default' }
}, { _id: false });

// Avatar Foundation — full avatar configuration, embedded on the user (see AVATAR_FOUNDATION.md §4)
const avatarSchema = new mongoose.Schema({
  gender: { type: String, enum: ['boy', 'girl'], default: 'boy' },
  // Curated base-body tone, not a wearable slot — no itemId/design, just a selectable tone (see AVATAR_ART_BIBLE.md §7)
  skinTone: { type: String, enum: ['warm01', 'warm02', 'warm03', 'warm04', 'warm05', 'warm06'], default: 'warm03' },
  hair: { type: avatarItemSchema, default: () => ({ itemId: 'spiky01', variant: 'black' }) },
  eyes: { type: avatarItemSchema, default: () => ({ itemId: 'round01', variant: 'brown' }) },
  shirt: { type: avatarItemSchema, default: () => ({ itemId: 'crewneck01', variant: 'default' }) },
  pants: { type: avatarItemSchema, default: () => ({ itemId: 'jeans01', variant: 'default' }) },
  shoes: { type: avatarItemSchema, default: () => ({ itemId: 'sneaker01', variant: 'default' }) },
  accessory: { type: avatarItemSchema, default: null },
  badges: { type: [String], default: [] },
  background: { type: avatarItemSchema, default: null },
  favoriteEmote: { type: String, default: null },
  // Chosen/earned display title shown on the Student Profile (e.g. "Fraction Hero").
  // Personalization field, same category as favoriteEmote/badges — not tied to a
  // rewards-award pipeline yet (that's the future Rewards phase), just a slot to hold it.
  title: { type: String, default: null },
  // Milestone 10 (Avatar Builder picker UI): itemIds the student has starred in the
  // picker — purely a display preference, not tied to unlock/equip state.
  favoriteItems: { type: [String], default: [] },
  // Milestone 12 (Rewards Locker unlock celebration): itemIds whose badge-gated
  // cosmetic unlock has already been shown to the student — so the Locker only
  // celebrates a given unlock once, not every time it's reopened.
  seenUnlocks: { type: [String], default: [] }
}, { _id: false });

// Teacher-only profile fields shown on the Teacher Profile screen — additive,
// all optional/null by default. Not applicable to students.
const teacherProfileSchema = new mongoose.Schema({
  subject: { type: String, default: null },
  gradeRange: { type: String, default: null },
  school: { type: String, default: null },
  degree: { type: String, default: null },
  yearsExperience: { type: Number, default: null },
  certifications: { type: [String], default: [] },
  // Auth Spec v2 §10 — optional, added alongside the existing fields above.
  department: { type: String, default: null },
  phone: { type: String, default: null }
}, { _id: false });

// Auth Spec v2 §10 — Student-only profile fields, mirroring teacherProfileSchema's
// shape/purpose. All optional/null by default; nothing here is required at signup.
// Kept alongside the original "Grade" field rather than replacing it (Grade suits a
// K-12 classroom, College/Branch/Semester suit higher-ed — the product can decide
// later which subset to actually surface in the UI without another migration).
const studentProfileSchema = new mongoose.Schema({
  grade: { type: String, default: null },
  rollNumber: { type: String, default: null },
  college: { type: String, default: null },
  branch: { type: String, default: null },
  semester: { type: String, default: null },
  phone: { type: String, default: null }
}, { _id: false });

// Settings → Notifications (General). notificationsEnabled is the master switch —
// when false, Notification.createNotification/createBulkNotifications skip this
// user entirely (see models/Notification.js). soundEnabled and previewEnabled are
// frontend-only display preferences, not enforced server-side.
const notificationPreferencesSchema = new mongoose.Schema({
  notificationsEnabled: { type: Boolean, default: true },
  emailNotifications:   { type: Boolean, default: true },
  pushNotifications:    { type: Boolean, default: true },
  soundEnabled:         { type: Boolean, default: true },
  previewEnabled:       { type: Boolean, default: true }
}, { _id: false });

// Settings → Privacy. showOnlineStatus:false hides this user's presence from
// everyone else — see toJSON() below (masks the isOnline field on this document
// wherever it's serialized) and server.js's getHiddenOnlineUserIds() (masks
// Group.onlineUsers array membership, which isOnline masking alone can't cover).
const privacyPreferencesSchema = new mongoose.Schema({
  showOnlineStatus: { type: Boolean, default: true }
}, { _id: false });

/**
 * User Model
 * Supports:
 * - Teachers (with password, email, name)
 * - Students (with optional password for guests, email, name)
 * - Admins
 */
const userSchema = new mongoose.Schema({
  // Username - unique identifier
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 1,
    maxlength: 60
  },
  
  // ✅ FIX: Added name field (required)
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  
  // ✅ FIX: Email now required and unique
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
  },
  
  // Password - optional for guest students
  // Teachers MUST have password (validated in server.js)
  password: {
    type: String,
    required: false,
    minlength: 6
  },
  
  // ✅ FIX: Removed redundant 'user' role
  role: {
    type: String,
    enum: ['teacher', 'student', 'admin'],
    default: 'student'
  },
  
  // Online status tracking
  isOnline: {
    type: Boolean,
    default: false
  },
  
  lastSeen: {
    type: Date,
    default: Date.now
  },
  
  // Socket.io connection tracking
  socketId: {
    type: String,
    default: null
  },

  // Profile photo (base64 or URL)
  profilePhoto: {
    type: String,
    default: null
  },

  // Avatar Foundation — see AVATAR_FOUNDATION.md (no UI/rendering yet, data model only)
  avatar: {
    type: avatarSchema,
    default: () => ({})
  },

  // Teacher Profile screen fields — only meaningful when role === 'teacher'
  teacherProfile: {
    type: teacherProfileSchema,
    default: () => ({})
  },

  // Student Profile fields (Auth Spec v2 §10) — only meaningful when role === 'student'
  studentProfile: {
    type: studentProfileSchema,
    default: () => ({})
  },

  // Settings → Notifications (General)
  notificationPreferences: {
    type: notificationPreferencesSchema,
    default: () => ({})
  },

  // Settings → Privacy
  privacyPreferences: {
    type: privacyPreferencesSchema,
    default: () => ({})
  },

  // ========================================
  // AUTH SPEC v2 — provider-agnostic auth fields
  // ========================================

  // Which provider created/authenticates this account. Every provider (current or
  // future) converges on the same session-creation path in authService.js — this
  // field is metadata about HOW the account authenticates, not a separate schema
  // per provider. Enum includes not-yet-implemented providers now so adding one
  // later (Apple, Phone, Microsoft, GitHub, LinkedIn, Facebook) never needs a migration.
  authProvider: {
    type: String,
    enum: ['email', 'google', 'apple', 'phone', 'microsoft', 'github', 'linkedin', 'facebook'],
    default: 'email'
  },

  // The provider's own unique identifier for this user (e.g. Google's `sub` claim).
  // Generic name (not `googleId`) so any future OAuth-style provider reuses the same
  // field. null for authProvider:'email'. Sparse so multiple email-auth users (all
  // null) don't collide on the unique index.
  providerId: {
    type: String,
    default: null
  },

  // Email/password accounts start unverified and are gated from the dashboard until
  // they click the verification link (Auth Spec v2 §3). OAuth providers are trusted
  // to have already verified the email themselves, so their accounts are created
  // with this already true.
  emailVerified: {
    type: Boolean,
    default: false
  },

  // Hashed (never stored raw) — set when a verification email is sent, cleared once
  // used. Short-lived by emailVerificationExpires.
  emailVerificationToken: { type: String, default: null, select: false },
  emailVerificationExpires: { type: Date, default: null, select: false },

  // Hashed (never stored raw) — set when a password-reset email is requested,
  // cleared once used or expired. 15–30 min lifetime per Auth Spec v2 §4.
  passwordResetToken: { type: String, default: null, select: false },
  passwordResetExpires: { type: Date, default: null, select: false },

  // Organization-readiness (Auth Spec v2 §8) — empty/null today. Lets a future
  // School → Teacher → Students hierarchy be added without another User migration.
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
  classIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'Group', default: [] },

  // Auth-audit timestamp — distinct from `lastSeen` above, which tracks live
  // presence/online-status for chat, not sign-in events.
  lastLogin: { type: Date, default: null },

  // Account lifecycle state (Auth Spec v2 §12 security requirements). Not yet wired
  // into any auth-gating logic in Phase 1 — that's a later phase — but the schema
  // needs the field now so nothing has to migrate to add it.
  accountStatus: {
    type: String,
    enum: ['active', 'suspended', 'deactivated'],
    default: 'active'
  }
}, {
  timestamps: true  // Adds createdAt and updatedAt automatically
});

// ✅ FIX: Added indexes for faster lookups
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
// Auth Spec v2 — unique per (provider, providerId), but ONLY across documents that
// actually have a real providerId. `sparse` alone does NOT achieve this here: every
// user has SOME authProvider (default 'email'), so a sparse compound index would
// still index every email/password user as the tuple ('email', null) — and the
// SECOND such user would collide on that unique constraint. partialFilterExpression
// is the correct tool: it excludes providerId:null (or missing) documents entirely,
// regardless of authProvider's value.
userSchema.index(
  { authProvider: 1, providerId: 1 },
  { unique: true, partialFilterExpression: { providerId: { $type: 'string' } } }
);

// Phase 2 — lookup indexes for verify-email/reset-password (find-by-hashed-token).
// Not unique (unlike the index above), so sparse here is purely a size optimization,
// not a correctness concern — no uniqueness constraint to accidentally violate.
userSchema.index({ emailVerificationToken: 1 }, { sparse: true });
userSchema.index({ passwordResetToken: 1 }, { sparse: true });

// ============================================
// PASSWORD HASHING MIDDLEWARE
// ============================================

// Hash password before saving (only if password exists and was modified)
userSchema.pre('save', async function (next) {
  // Skip if password wasn't modified
  if (!this.isModified('password')) {
    return next();
  }
  
  // Skip if no password (guest student)
  if (!this.password) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (err) {
    return next(err);
  }
});

// ============================================
// INSTANCE METHODS
// ============================================

// Compare entered password with hashed password
userSchema.methods.comparePassword = async function (enteredPassword) {
  // If no password set (guest student), return false
  if (!this.password) {
    return false;
  }
  
  return await bcrypt.compare(enteredPassword, this.password);
};

// ✅ NEW: Get public profile (safe to send to frontend)
userSchema.methods.toJSON = function () {
  const obj = this.toObject();

  // Remove sensitive fields
  delete obj.password;
  delete obj.__v;

  // Settings → Privacy → Show Online Status: applies wherever this user's
  // document is serialized (own profile, populated as a group member, populated
  // as a message sender). Does NOT cover Group.onlineUsers array membership —
  // that's a separate signal, masked at the source in server.js.
  if (this.privacyPreferences && this.privacyPreferences.showOnlineStatus === false) {
    obj.isOnline = false;
  }

  return obj;
};

// ============================================
// STATIC METHODS
// ============================================

// ✅ NEW: Find user by email or username
userSchema.statics.findByEmailOrUsername = async function (identifier) {
  return await this.findOne({
    $or: [
      { email: identifier },
      { username: identifier }
    ]
  });
};

// ============================================
// VALIDATION
// ============================================

// ✅ NEW: Custom validation - teachers signing up with email/password must have a
// password. Auth Spec v2 FIX: this used to require ANY teacher to have a password,
// which would have rejected every Google-auth teacher account (Phase 3) — a
// Google-authenticated user never has a local password at all, by design. Scoped
// to authProvider === 'email' so OAuth-created accounts are unaffected.
userSchema.pre('validate', function (next) {
  if (this.role === 'teacher' && this.authProvider === 'email' && !this.password) {
    this.invalidate('password', 'Teachers signing up with email must have a password');
  }

  next();
});

// ============================================
// EXPORT MODEL
// ============================================

const User = mongoose.model('User', userSchema);
module.exports = User;