// backend/models/Message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Group reference
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  
  // Sender
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Message content
  content: {
    type: String,
    maxlength: 5000
  },
  
  // Message type
  messageType: {
    type: String,
    enum: ['text', 'system', 'private', 'file'],
    default: 'text'
  },
  
  // For private messages
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // ✅ NEW: File attachment fields
  fileUrl: {
    type: String,
    default: null
  },
  
  fileName: {
    type: String,
    default: null
  },
  
  fileSize: {
    type: Number,
    default: null
  },
  
  fileType: {
    type: String,
    default: null
  },
  
  // Editing
  isEdited: {
    type: Boolean,
    default: false
  },
  
  editedAt: {
    type: Date,
    default: null
  },
  
  // Deletion
  isDeleted: {
    type: Boolean,
    default: false
  },
  
  deletedAt: {
    type: Date,
    default: null
  },
  
  // Read receipts
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Reply to another message
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  }
}, {
  timestamps: true
});

// ============================================
// INDEXES
// ============================================

messageSchema.index({ group: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ recipient: 1 });
messageSchema.index({ isDeleted: 1 });

// ============================================
// METHODS
// ============================================

// Mark message as read by user
messageSchema.methods.markAsRead = async function(userId) {
  const alreadyRead = this.readBy.some(
    read => read.user.toString() === userId.toString()
  );
  
  if (!alreadyRead) {
    this.readBy.push({ user: userId, readAt: new Date() });
    await this.save();
  }
  
  return this;
};

// Edit message
messageSchema.methods.editMessage = async function(newContent) {
  this.content = newContent;
  this.isEdited = true;
  this.editedAt = new Date();
  await this.save();
  return this;
};

// Delete message (soft delete)
messageSchema.methods.deleteMessage = async function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.content = 'This message was deleted';
  await this.save();
  return this;
};

// Check if user can edit this message
messageSchema.methods.canEdit = function(userId) {
  return this.sender.toString() === userId.toString() && !this.isDeleted;
};

// Check if user can delete this message
messageSchema.methods.canDelete = function(userId) {
  return this.sender.toString() === userId.toString();
};

// ============================================
// STATIC METHODS
// ============================================

// Get recent messages for a group
messageSchema.statics.getRecentMessages = async function(groupId, limit = 100) {
  return await this.find({
    group: groupId,
    isDeleted: false
  })
  .populate('sender', 'username name isOnline')
  .populate('recipient', 'username name')
  .populate('replyTo', 'content sender')
  .sort({ createdAt: -1 })
  .limit(limit);
};

// Get unread messages for a user in a group
messageSchema.statics.getUnreadMessages = async function(groupId, userId) {
  return await this.find({
    group: groupId,
    isDeleted: false,
    'readBy.user': { $ne: userId }
  })
  .populate('sender', 'username name')
  .sort({ createdAt: 1 });
};

// Search messages in a group
messageSchema.statics.searchMessages = async function(groupId, searchText) {
  return await this.find({
    group: groupId,
    isDeleted: false,
    content: { $regex: searchText, $options: 'i' }
  })
  .populate('sender', 'username name')
  .sort({ createdAt: -1 })
  .limit(50);
};

module.exports = mongoose.model('Message', messageSchema);