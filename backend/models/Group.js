// Import mongoose to create the database schema
const mongoose = require('mongoose');

// Define the Group Schema (structure of group/session data)
const groupSchema = new mongoose.Schema({
  
  // Group name/title
  groupName: {
    type: String,              // Data type is string
    required: true,            // This field is mandatory
    trim: true,                // Remove extra spaces
    maxlength: 100             // Maximum 100 characters
  },
  
  // Admin/Creator of the group
  // This is a reference to the User who created this group
  admin: {
    type: mongoose.Schema.Types.ObjectId,  // References another document
    ref: 'User',               // References the User model
    required: true             // Every group must have an admin
  },
  
  // ✅ EXISTING: Array of members with joinedAt timestamp
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Unique PIN for joining the group
  pin: {
    type: String,
    required: true,
    unique: true,
    length: 6
  },
  
  // QR Code data (base64 encoded image)
  qrCode: {
    type: String,
    required: true
  },
  
  // Session status - is the group currently active?
  isActive: {
    type: Boolean,
    default: true
  },
  
  // When the session was ended (if ended)
  endedAt: {
    type: Date,
    default: null
  },
  
  // List of users currently online in this group
  onlineUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // ⭐ NEW: Email whitelist (optional - backward compatible)
  allowedEmails: [{
    type: String,
    lowercase: true,
    trim: true
  }],

  // ✅ NEW: an auto-created, chat-less classroom created behind the scenes when a
  // teacher uses "Create New Quiz" with no classroom already open. Hidden from the
  // teacher's own "My Classes" list (see /my-groups); still visible to students who
  // join it, since that IS their session.
  isQuickQuiz: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true
});

// INDEXES
groupSchema.index({ pin: 1 });
groupSchema.index({ admin: 1 });
groupSchema.index({ isActive: 1 });
groupSchema.index({ 'members.user': 1 });
groupSchema.index({ allowedEmails: 1 });

// ✅ EXISTING METHODS - UNCHANGED
groupSchema.methods.isMember = function(userId) {
  const userIdStr = userId.toString();
  return this.members.some(member => {
    const memberUserId = member.user?._id?.toString() || member.user?.toString();
    return memberUserId === userIdStr;
  });
};

groupSchema.methods.isAdmin = function(userId) {
  const adminId = this.admin._id?.toString() || this.admin.toString();
  const userIdStr = userId.toString();
  return adminId === userIdStr;
};

groupSchema.methods.addMember = async function(userId) {
  if (!this.isMember(userId)) {
    this.members.push({
      user: userId,
      joinedAt: new Date()
    });
    await this.save();
  }
};

groupSchema.methods.getJoinedAt = function(userId) {
  const userIdStr = userId.toString();
  const member = this.members.find(member => {
    const memberUserId = member.user?._id?.toString() || member.user?.toString();
    return memberUserId === userIdStr;
  });
  return member ? member.joinedAt : null;
};

groupSchema.methods.endSession = async function() {
  this.isActive = false;
  this.endedAt = new Date();
  await this.save();
};

// ⭐ NEW METHODS
groupSchema.methods.isEmailAllowed = function(email) {
  if (!this.allowedEmails || this.allowedEmails.length === 0) {
    return true;
  }
  return this.allowedEmails.includes(email.toLowerCase().trim());
};

groupSchema.methods.addAllowedEmail = function(email) {
  const normalizedEmail = email.toLowerCase().trim();
  if (!this.allowedEmails) {
    this.allowedEmails = [];
  }
  if (!this.allowedEmails.includes(normalizedEmail)) {
    this.allowedEmails.push(normalizedEmail);
  }
};

groupSchema.methods.removeAllowedEmail = function(email) {
  if (this.allowedEmails) {
    this.allowedEmails = this.allowedEmails.filter(
      e => e !== email.toLowerCase().trim()
    );
  }
};

module.exports = mongoose.model('Group', groupSchema);