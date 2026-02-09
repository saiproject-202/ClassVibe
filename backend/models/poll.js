// backend/models/Poll.js
const mongoose = require('mongoose');

const pollSchema = new mongoose.Schema({
  // Which group/session this poll belongs to
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  
  // Who created the poll (teacher)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Type of poll
  pollType: {
    type: String,
    enum: ['mcq', 'open', 'yesno'],
    default: 'mcq'
  },
  
  // The question
  question: {
    type: String,
    required: true,
    maxlength: 500
  },
  
  // For MCQ polls - options
  options: [{
    text: {
      type: String,
      required: true,
      maxlength: 200
    },
    votes: {
      type: Number,
      default: 0
    },
    votedBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  }],
  
  // For open-ended questions - text answers
  answers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    answer: {
      type: String,
      required: true,
      maxlength: 1000
    },
    submittedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Poll settings
  allowMultipleVotes: {
    type: Boolean,
    default: false
  },
  
  isAnonymous: {
    type: Boolean,
    default: false
  },
  
  // Poll status
  isActive: {
    type: Boolean,
    default: true
  },
  
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
  },
  
  // Statistics
  totalVotes: {
    type: Number,
    default: 0
  },
  
  totalAnswers: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// ============================================
// INDEXES
// ============================================

pollSchema.index({ group: 1, createdAt: -1 });
pollSchema.index({ createdBy: 1 });
pollSchema.index({ isActive: 1 });

// ============================================
// METHODS
// ============================================

// Check if user has already voted
pollSchema.methods.hasUserVoted = function(userId) {
  if (this.pollType === 'mcq' || this.pollType === 'yesno') {
    return this.options.some(option => 
      option.votedBy.some(voterId => voterId.toString() === userId.toString())
    );
  }
  
  if (this.pollType === 'open') {
    return this.answers.some(answer => 
      answer.user.toString() === userId.toString()
    );
  }
  
  return false;
};

// Vote on MCQ poll
pollSchema.methods.vote = async function(userId, optionIndex) {
  if (this.pollType !== 'mcq' && this.pollType !== 'yesno') {
    throw new Error('This poll type does not support voting');
  }
  
  if (this.hasUserVoted(userId) && !this.allowMultipleVotes) {
    throw new Error('You have already voted on this poll');
  }
  
  if (optionIndex < 0 || optionIndex >= this.options.length) {
    throw new Error('Invalid option index');
  }
  
  // Add vote
  this.options[optionIndex].votes += 1;
  this.options[optionIndex].votedBy.push(userId);
  this.totalVotes += 1;
  
  await this.save();
  return this;
};

// Submit answer to open question
pollSchema.methods.submitAnswer = async function(userId, answerText) {
  if (this.pollType !== 'open') {
    throw new Error('This poll type does not support text answers');
  }
  
  if (this.hasUserVoted(userId)) {
    throw new Error('You have already answered this question');
  }
  
  this.answers.push({
    user: userId,
    answer: answerText,
    submittedAt: new Date()
  });
  
  this.totalAnswers += 1;
  
  await this.save();
  return this;
};

// Get results (formatted)
pollSchema.methods.getResults = function() {
  if (this.pollType === 'mcq' || this.pollType === 'yesno') {
    return {
      question: this.question,
      pollType: this.pollType,
      totalVotes: this.totalVotes,
      options: this.options.map(opt => ({
        text: opt.text,
        votes: opt.votes,
        percentage: this.totalVotes > 0 ? (opt.votes / this.totalVotes * 100).toFixed(1) : 0,
        votedBy: this.isAnonymous ? [] : opt.votedBy
      }))
    };
  }
  
  if (this.pollType === 'open') {
    return {
      question: this.question,
      pollType: this.pollType,
      totalAnswers: this.totalAnswers,
      answers: this.answers.map(ans => ({
        user: this.isAnonymous ? null : ans.user,
        answer: ans.answer,
        submittedAt: ans.submittedAt
      }))
    };
  }
};

// Close poll
pollSchema.methods.close = async function() {
  this.isActive = false;
  await this.save();
  return this;
};

// ============================================
// STATIC METHODS
// ============================================

// Get active polls for a group
pollSchema.statics.getActivePolls = async function(groupId) {
  return await this.find({
    group: groupId,
    isActive: true,
    expiresAt: { $gt: new Date() }
  })
  .populate('createdBy', 'username name')
  .sort({ createdAt: -1 });
};

// Get all polls for a group (including closed)
pollSchema.statics.getAllPolls = async function(groupId) {
  return await this.find({ group: groupId })
    .populate('createdBy', 'username name')
    .populate('answers.user', 'username name')
    .sort({ createdAt: -1 });
};

// ============================================
// AUTO-EXPIRE POLLS
// ============================================

pollSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Poll', pollSchema);