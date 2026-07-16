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
  certifications: { type: [String], default: [] }
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
  }
}, {
  timestamps: true  // Adds createdAt and updatedAt automatically
});

// ✅ FIX: Added indexes for faster lookups
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });

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

// ✅ NEW: Custom validation - teachers must have password
userSchema.pre('validate', function (next) {
  // If role is teacher, password is required
  if (this.role === 'teacher' && !this.password) {
    this.invalidate('password', 'Teachers must have a password');
  }
  
  next();
});

// ============================================
// EXPORT MODEL
// ============================================

const User = mongoose.model('User', userSchema);
module.exports = User;