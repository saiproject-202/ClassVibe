// backend/models/QuizResult.js
// Stores final quiz results for each student (analytics)

const mongoose = require('mongoose');

const quizResultSchema = new mongoose.Schema({
  // Reference to quiz
  quiz: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quiz',
    required: true
  },

  // Reference to quiz session
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuizSession',
    required: true
  },
  
  // Student who took the quiz
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Group/classroom
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  
  // Score and performance
  score: {
    type: Number,
    required: true,
    default: 0
  },
  
  maxScore: {
    type: Number,
    required: true
  },
  
  percentage: {
    type: Number, // 0-100
    required: true
  },
  
  correctAnswers: {
    type: Number,
    default: 0
  },
  
  totalQuestions: {
    type: Number,
    required: true
  },
  
  // Detailed answers
  answers: [{
    questionIndex: Number,
    questionText: String,
    selectedAnswer: Number,

    correctAnswer: {
      type: mongoose.Schema.Types.Mixed, // 🔥 THIS FIXES EVERYTHING
      required: true
    },

    isCorrect: Boolean,
    points: Number,
    timeTaken: Number, // seconds
    answeredAt: Date
  }],
  
  // Timing
  startedAt: {
    type: Date,
    required: true
  },
  
  completedAt: {  
    type: Date,
    required: true
  },
  
  duration: {
    type: Number // seconds
  },
  
  // Ranking in this session
  rank: Number,
  
  // Performance metrics
  averageTimePerQuestion: Number, // seconds
  fastestAnswer: Number, // seconds
  slowestAnswer: Number, // seconds
  
  // Badge/achievement
  badge: {
    type: String,
    enum: ['gold', 'silver', 'bronze', 'participant', null],
    default: null
  },

  // ✅ NEW (Phase 3 — TEAM_MODE_DESIGN.md §9.3): null in individual mode.
  // A separate QuizTeamResult collection was considered (§9.4) and deferred — these
  // fields are enough to reconstruct team history by grouping QuizResult rows by
  // teamId, without the added surface area of a whole new model this round.
  teamId:     { type: String, default: null },
  teamRank:   { type: Number, default: null },
  teamRating: { type: Number, default: null },
  awardsEarned: [{ type: String }],

  // Milestone 11: the celebration this student chose on the Final Results podium
  // (top-3 finishers only) — copied from QuizSession.participants.celebrationEmote
  // at finalization time, for permanent quiz-history record. Null if they never
  // finished top-3, or finished top-3 but the quiz ended before they chose.
  celebrationEmote: { type: String, default: null }

}, {
  timestamps: true
});

// ========================================
// METHODS
// ========================================

// Calculate performance metrics
quizResultSchema.methods.calculateMetrics = function() {
  if (this.answers.length === 0) return;
  
  const times = this.answers.map(a => a.timeTaken).filter(t => t > 0);
  
  if (times.length > 0) {
    this.averageTimePerQuestion = times.reduce((a, b) => a + b, 0) / times.length;
    this.fastestAnswer = Math.min(...times);
    this.slowestAnswer = Math.max(...times);
  }
  
  this.duration = (this.completedAt - this.startedAt) / 1000; // seconds
  this.percentage = Math.round((this.score / this.maxScore) * 100);
};

// Determine badge based on rank
quizResultSchema.methods.assignBadge = function(totalParticipants) {
  if (!this.rank) return;
  
  if (this.rank === 1) {
    this.badge = 'gold';
  } else if (this.rank === 2) {
    this.badge = 'silver';
  } else if (this.rank === 3) {
    this.badge = 'bronze';
  } else {
    this.badge = 'participant';
  }
};

// Get performance level
quizResultSchema.methods.getPerformanceLevel = function() {
  if (this.percentage >= 90) return 'Excellent';
  if (this.percentage >= 75) return 'Good';
  if (this.percentage >= 60) return 'Average';
  if (this.percentage >= 40) return 'Below Average';
  return 'Needs Improvement';
};

// ========================================
// STATICS
// ========================================

// Get student's quiz history
quizResultSchema.statics.getStudentHistory = function(studentId, limit = 10) {
  return this.find({ student: studentId })
    .populate('quiz', 'title')
    .populate('group', 'groupName')
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Get quiz analytics
quizResultSchema.statics.getQuizAnalytics = async function(quizId) {
  const results = await this.find({ quiz: quizId });
  
  if (results.length === 0) {
    return {
      totalAttempts: 0,
      averageScore: 0,
      highestScore: 0,
      lowestScore: 0,
      averagePercentage: 0
    };
  }
  
  return {
    totalAttempts: results.length,
    averageScore: results.reduce((sum, r) => sum + r.score, 0) / results.length,
    highestScore: Math.max(...results.map(r => r.score)),
    lowestScore: Math.min(...results.map(r => r.score)),
    averagePercentage: results.reduce((sum, r) => sum + r.percentage, 0) / results.length,
    passRate: (results.filter(r => r.percentage >= 60).length / results.length) * 100
  };
};

// Get group quiz performance
quizResultSchema.statics.getGroupPerformance = async function(groupId) {
  const results = await this.find({ group: groupId })
    .populate('student', 'name username')
    .populate('quiz', 'title');
  
  return results;
};

// Get leaderboard across all quizzes
quizResultSchema.statics.getGlobalLeaderboard = async function(groupId, limit = 10) {
  const results = await this.aggregate([
    { $match: { group: new mongoose.Types.ObjectId(groupId) } },
    {
      $group: {
        _id: '$student',
        totalScore: { $sum: '$score' },
        quizzesCount: { $sum: 1 },
        averagePercentage: { $avg: '$percentage' },
        badges: { $push: '$badge' }
      }
    },
    { $sort: { totalScore: -1 } },
    { $limit: limit }
  ]);
  
  return results;
};

// ========================================
// INDEXES
// ========================================

quizResultSchema.index({ student: 1, createdAt: -1 });
quizResultSchema.index({ quiz: 1 });
quizResultSchema.index({ group: 1 });
quizResultSchema.index({ session: 1 });
quizResultSchema.index({ percentage: -1 });

module.exports = mongoose.model('QuizResult', quizResultSchema);