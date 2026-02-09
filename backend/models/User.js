// backend/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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