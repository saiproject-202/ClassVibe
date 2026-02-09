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
  
  // ✅ UPDATED: Array of members with joinedAt timestamp
  // Each member is now an object containing user reference and join date
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,  // References User documents
      ref: 'User',             // References the User model
      required: true           // User ID is required
    },
    joinedAt: {
      type: Date,              // When this user joined
      default: Date.now        // Automatically set to current time
    }
  }],
  
  // Unique PIN for joining the group
  // 6-digit number for easy joining
  pin: {
    type: String,              // Data type is string (to keep leading zeros)
    required: true,            // This field is mandatory
    unique: true,              // Each group has unique PIN
    length: 6                  // Exactly 6 digits
  },
  
  // QR Code data (base64 encoded image)
  // When users scan this, they can join the group
  qrCode: {
    type: String,              // Data type is string (base64 image data)
    required: true             // This field is mandatory
  },
  
  // Session status - is the group currently active?
  isActive: {
    type: Boolean,             // Data type is true/false
    default: true              // By default, new groups are active
  },
  
  // When the session was ended (if ended)
  endedAt: {
    type: Date,                // Data type is date/time
    default: null              // By default, no end time (still active)
  },
  
  // List of users currently online in this group
  // This helps show "who's online" status
  onlineUsers: [{
    type: mongoose.Schema.Types.ObjectId,  // References User documents
    ref: 'User'                // References the User model
  }]
  
}, {
  // Automatically add createdAt and updatedAt timestamps
  timestamps: true
});

// INDEX: Speed up searches by PIN
// When someone joins with PIN, MongoDB can find it quickly
groupSchema.index({ pin: 1 });

// INDEX: Speed up searches by admin
// To quickly find all groups created by a specific user
groupSchema.index({ admin: 1 });

// INDEX: Speed up searches for active sessions
// To quickly find all currently active groups
groupSchema.index({ isActive: 1 });

// INDEX: Speed up searches by member user ID
groupSchema.index({ 'members.user': 1 });

// ✅ UPDATED METHOD: Check if a user is a member of this group
groupSchema.methods.isMember = function(userId) {
  // Convert userId to string and check if it exists in members array
  const userIdStr = userId.toString();
  return this.members.some(member => {
    const memberUserId = member.user?._id?.toString() || member.user?.toString();
    return memberUserId === userIdStr;
  });
};

// METHOD: Check if a user is the admin of this group
groupSchema.methods.isAdmin = function(userId) {
  // Compare the admin ID with the provided userId
  const adminId = this.admin._id?.toString() || this.admin.toString();
  const userIdStr = userId.toString();
  return adminId === userIdStr;
};

// ✅ UPDATED METHOD: Add a user to the group with joinedAt timestamp
groupSchema.methods.addMember = async function(userId) {
  // Check if user is already a member
  if (!this.isMember(userId)) {
    // Add user to members array with current timestamp
    this.members.push({
      user: userId,
      joinedAt: new Date()
    });
    // Save the updated group to database
    await this.save();
  }
};

// ✅ NEW METHOD: Get joinedAt date for a specific user
groupSchema.methods.getJoinedAt = function(userId) {
  const userIdStr = userId.toString();
  const member = this.members.find(member => {
    const memberUserId = member.user?._id?.toString() || member.user?.toString();
    return memberUserId === userIdStr;
  });
  return member ? member.joinedAt : null;
};

// METHOD: End the session
groupSchema.methods.endSession = async function() {
  // Mark session as inactive
  this.isActive = false;
  // Set the ended time to now
  this.endedAt = new Date();
  // Save the updated group to database
  await this.save();
};

// Create the Group model from the schema
// 'Group' is the model name, MongoDB will create a 'groups' collection
const Group = mongoose.model('Group', groupSchema);

// Export the Group model so we can use it in other files
module.exports = Group;