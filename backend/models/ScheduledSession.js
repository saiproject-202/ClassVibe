// backend/models/ScheduledSession.js
// ✅ FIXED: Methods were defined AFTER module.exports — they never attached to the model.
//           Moved all method definitions BEFORE module.exports.
// ✅ ADDED: accessType, allowedStudents (email+password per student),
//           draft status, enableReminders, customPin, endTime,
//           duration as String, unauthorizedAttempts

const mongoose = require('mongoose');

const scheduledSessionSchema = new mongoose.Schema({

  // ── Basic Info ──
  sessionName: {
    type: String,
    required: true,
    trim: true
  },

  subject: {
    type: String,
    trim: true
  },

  description: {
    type: String,
    trim: true
  },

  // ── Teacher ──
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // ── Timing ──
  scheduledDate: {
    type: Date
    // ✅ CHANGED: was required:true — removed so drafts can be saved without date
  },

  scheduledTime: {
    type: String
    // ✅ CHANGED: was required:true — removed so drafts can be saved without time
  },

  // ✅ NEW: End time field
  endTime: {
    type: String
  },

  // ✅ CHANGED: duration is now String (e.g. "1 Hour", "45 Min") to match frontend
  duration: {
    type: String,
    default: '1 Hour'
  },

  // ✅ NEW: access type — public (anyone) or private (email+password)
  accessType: {
    type: String,
    enum: ['public', 'private'],
    default: 'private'
  },

  // ✅ NEW: Per-student email + password (for private sessions)
  // Teacher sets a password for each student
  allowedStudents: [{
    email:    { type: String, lowercase: true, trim: true },
    password: { type: String },   // plain text, set by teacher
    name:     { type: String }
  }],

  // ── Email whitelist (derived from allowedStudents for quick lookup) ──
  allowedEmails: [{
    type: String,
    lowercase: true,
    trim: true
  }],

  // ── Registered Students ──
  registeredStudents: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    email: String,
    registeredAt: {
      type: Date,
      default: Date.now
    }
  }],

  // ── Status ──
  // ✅ ADDED: 'draft' to enum
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'live', 'completed', 'cancelled'],
    default: 'scheduled'
  },

  // When session goes live it becomes a Group
  liveGroupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group'
  },

  // ── Notifications ──
  // Two independent tiers (replaces the old single reminderSent boolean) — see
  // jobs/sessionReminder.js. Each fires once, independently, as its window opens.
  reminder15Sent: {
    type: Boolean,
    default: false
  },

  reminder5Sent: {
    type: Boolean,
    default: false
  },

  // ✅ NEW: Teacher can toggle reminders on/off
  enableReminders: {
    type: Boolean,
    default: true
  },

  // ── Settings ──
  autoStartEnabled: {
    type: Boolean,
    default: true
  },

  requireApproval: {
    type: Boolean,
    default: false
  },

  maxStudents: {
    type: Number,
    default: 100
  },

  // ✅ NEW: Custom PIN override (teacher can set their own PIN)
  customPin: {
    type: String
  },

  joinCode: {
    type: String,
    unique: true,
    sparse: true
  },

  // ✅ NEW: Track emails that tried to join but weren't registered
  // Used to notify teacher so they can add the student later
  unauthorizedAttempts: [{
    email:           { type: String },
    attemptedAt:     { type: Date, default: Date.now },
    notifiedTeacher: { type: Boolean, default: false }
  }]

}, {
  timestamps: true
});

// ════════════════════════════════════════════
// INSTANCE METHODS
// ✅ FIXED: These MUST be defined BEFORE module.exports
// ════════════════════════════════════════════

/**
 * Check if an email is allowed to join this session
 */
scheduledSessionSchema.methods.isEmailAllowed = function(email) {
  if (this.accessType === 'public') return true;
  if (!this.allowedEmails || this.allowedEmails.length === 0) return true;
  return this.allowedEmails.includes(email.toLowerCase().trim());
};

/**
 * ✅ NEW: Verify a student's email + password for private sessions
 * Returns { allowed: true } or { allowed: false, reason: '...' }
 */
scheduledSessionSchema.methods.verifyStudentPassword = function(email, password) {
  if (this.accessType === 'public') return { allowed: true };

  const student = this.allowedStudents.find(
    s => s.email === email.toLowerCase().trim()
  );

  if (!student) {
    return { allowed: false, reason: 'email_not_registered' };
  }

  if (student.password !== password) {
    return { allowed: false, reason: 'wrong_password' };
  }

  return { allowed: true };
};

/**
 * Check if session should auto-start now (within ±5 min of scheduled time)
 */
scheduledSessionSchema.methods.shouldStartNow = function() {
  if (!this.scheduledDate || !this.scheduledTime) return false;

  const now = new Date();
  const scheduledDateTime = new Date(this.scheduledDate);

  // Handle both "HH:MM" (24h) and "HH:MM AM/PM" formats
  const timeParts12 = this.scheduledTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
  const timeParts24 = this.scheduledTime.match(/^(\d{1,2}):(\d{2})$/);

  if (timeParts12) {
    let hours = parseInt(timeParts12[1]);
    const minutes = parseInt(timeParts12[2]);
    const meridiem = timeParts12[3].toUpperCase();
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    scheduledDateTime.setHours(hours, minutes, 0, 0);
  } else if (timeParts24) {
    scheduledDateTime.setHours(parseInt(timeParts24[1]), parseInt(timeParts24[2]), 0, 0);
  }

  const diff = scheduledDateTime - now;
  return diff <= 5 * 60 * 1000 && diff >= -5 * 60 * 1000;
};

/**
 * Register a student for this session
 */
scheduledSessionSchema.methods.registerStudent = async function(userId, email) {
  const alreadyRegistered = this.registeredStudents.some(
    s => s.user.toString() === userId.toString()
  );
  if (alreadyRegistered) {
    return { success: false, message: 'Already registered' };
  }
  if (!this.isEmailAllowed(email)) {
    return { success: false, message: 'Your email is not authorized for this session' };
  }
  if (this.registeredStudents.length >= this.maxStudents) {
    return { success: false, message: 'Session is full' };
  }
  this.registeredStudents.push({ user: userId, email });
  await this.save();
  return { success: true, message: 'Registered successfully' };
};

/**
 * Add an email to the allowed list
 */
scheduledSessionSchema.methods.addAllowedEmail = function(email) {
  const normalizedEmail = email.toLowerCase().trim();
  if (!this.allowedEmails.includes(normalizedEmail)) {
    this.allowedEmails.push(normalizedEmail);
  }
};

/**
 * Remove an email from the allowed list
 */
scheduledSessionSchema.methods.removeAllowedEmail = function(email) {
  this.allowedEmails = this.allowedEmails.filter(
    e => e !== email.toLowerCase().trim()
  );
};

// ════════════════════════════════════════════
// STATIC METHODS
// ════════════════════════════════════════════

/**
 * Get upcoming sessions for a teacher (by status)
 */
scheduledSessionSchema.statics.getTeacherSessions = function(teacherId, status = 'scheduled') {
  return this.find({ teacher: teacherId, status })
    .populate('registeredStudents.user', 'name email')
    .sort({ scheduledDate: 1 });
};

/**
 * ✅ NEW: Get all drafts for a teacher
 */
scheduledSessionSchema.statics.getTeacherDrafts = function(teacherId) {
  return this.find({ teacher: teacherId, status: 'draft' })
    .sort({ updatedAt: -1 });
};

/**
 * Get sessions available to a student (public or their email is in allowedEmails)
 */
scheduledSessionSchema.statics.getAvailableSessions = async function(userEmail) {
  return this.find({
    status: 'scheduled',
    $or: [
      { accessType: 'public' },
      { allowedEmails: { $size: 0 } },
      { allowedEmails: userEmail.toLowerCase() }
    ]
  })
  .populate('teacher', 'name email')
  .sort({ scheduledDate: 1 });
};

/**
 * Find sessions that should auto-start now
 */
scheduledSessionSchema.statics.findSessionsToStart = function() {
  const now = new Date();
  const fiveMinutesAgo   = new Date(now.getTime() - 5 * 60 * 1000);
  const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);

  return this.find({
    status: 'scheduled',
    autoStartEnabled: true,
    scheduledDate: {
      $gte: fiveMinutesAgo,
      $lte: fiveMinutesLater
    }
  }).populate('teacher');
};

// ════════════════════════════════════════════
// INDEXES
// ════════════════════════════════════════════

scheduledSessionSchema.index({ teacher: 1, scheduledDate: 1 });
scheduledSessionSchema.index({ status: 1, scheduledDate: 1 });
scheduledSessionSchema.index({ joinCode: 1 });
scheduledSessionSchema.index({ allowedEmails: 1 });

// ✅ FIXED: module.exports is now LAST — after all method definitions
module.exports = mongoose.model('ScheduledSession', scheduledSessionSchema);