// backend/models/QuizSession.js
// Tracks a live quiz session (when teacher starts a quiz)

const mongoose = require('mongoose');

const quizSessionSchema = new mongoose.Schema({
  // Reference to the quiz
  quiz: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quiz',
    required: true
  },
  
  // Group/classroom where quiz is running
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  
  // Teacher who started the quiz
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Session status
  status: {
    type: String,
    enum: ['waiting', 'active', 'paused', 'completed'],
    default: 'waiting'
  },
  
  // Current question index (0-based)
  currentQuestionIndex: {
    type: Number,
    default: 0
  },
  
  // Participants (students who joined)
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    // Captured once at join time so leaderboards can show real names without an
    // extra populate() on every read — see student:joinQuiz in quiz-socket-handlers.js
    name: {
      type: String,
      default: ''
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    score: {
      type: Number,
      default: 0
    },
    answers: [{
      questionIndex: Number,
      selectedAnswer: mongoose.Schema.Types.Mixed, // Number for MC/TF, String for FIB, Number[] for multiple_select
      isCorrect: Boolean,
      points: Number,
      answeredAt: Date,
      timeTaken: Number
    }],
    streak: {
      type: Number,
      default: 0
    },
    completedAt: Date,
    // ✅ NEW (Phase 3 — TEAM_MODE_DESIGN.md §9.2): references teams[].teamId below,
    // or null in individual mode / before a student has picked a team
    teamId: {
      type: String,
      default: null
    },
    // Milestone 11: the celebration a top-3 finisher chose on the Final Results
    // podium — null until they choose (see student:chooseCelebration in
    // quiz-socket-handlers.js). Copied onto QuizResult.celebrationEmote when the
    // session finalizes, for permanent history.
    celebrationEmote: {
      type: String,
      default: null
    }
  }],

  // ✅ NEW (Phase 3): snapshot of the team definitions for THIS session, copied from
  // quiz.settings.teamMode.teams at session-creation time (see POST /:quizId/start-session
  // in routes/quiz.js) — deliberately NOT read live off the Quiz template, so that teams
  // exist and stay stable throughout the lobby/game even if the Quiz doc is edited later.
  // Empty array in individual mode.
  teams: [{
    teamId: { type: String, required: true }, // slug of the team name — see quiz-socket-handlers.js
    name:   String,
    color:  String,
    icon:   String
  }],

  // When each question started
  questionStartTimes: [{
    questionIndex: Number,
    startedAt: Date
  }],

  // Session timing
  startedAt: Date,
  pausedAt: Date,
  resumedAt: Date,
  completedAt: Date,

  // Session settings (copied from quiz at start)
  sessionSettings: {
    totalTimeLimit: Number,
    showCorrectAnswer: Boolean,
    showLeaderboard: Boolean,
    allowLateJoin: Boolean,
    // ✅ NEW (Phase 3): quizMode + team behavior flags, snapshotted alongside `teams`
    // above so a running session's rules can't change out from under it mid-game
    quizMode: String,
    allowStudentChoice: Boolean,
    autoBalance: Boolean,
    lockOnStart: Boolean
  }

}, {
  timestamps: true
});

// ========================================
// METHODS
// ========================================

// Start the quiz session
quizSessionSchema.methods.start = async function() {
  this.status = 'active';
  this.startedAt = new Date();
  this.questionStartTimes.push({
    questionIndex: 0,
    startedAt: new Date()
  });
  await this.save();
};

// Move to next question
quizSessionSchema.methods.nextQuestion = async function() {
  this.currentQuestionIndex += 1;
  this.questionStartTimes.push({
    questionIndex: this.currentQuestionIndex,
    startedAt: new Date()
  });
  await this.save();
};

// Pause quiz
quizSessionSchema.methods.pause = async function() {
  this.status = 'paused';
  this.pausedAt = new Date();
  await this.save();
};

// Resume quiz
quizSessionSchema.methods.resume = async function() {
  this.status = 'active';
  this.resumedAt = new Date();
  await this.save();
};

// Complete quiz
quizSessionSchema.methods.complete = async function() {
  this.status = 'completed';
  this.completedAt = new Date();
  await this.save();
};

// Add participant
quizSessionSchema.methods.addParticipant = function(userId) {
  const existing = this.participants.find(
    p => p.user.toString() === userId.toString()
  );
  
  if (!existing) {
    this.participants.push({
      user: userId,
      joinedAt: new Date(),
      score: 0,
      answers: []
    });
  }
};

// Submit answer
quizSessionSchema.methods.submitAnswer = async function(
  userId, 
  questionIndex, 
  selectedAnswer,
  isCorrect,
  points,
  timeTaken
) {
  const participant = this.participants.find(
    p => p.user.toString() === userId.toString()
  );
  
  if (!participant) {
    throw new Error('Participant not found');
  }
  
  // Check if already answered
  const alreadyAnswered = participant.answers.some(
    a => a.questionIndex === questionIndex
  );
  
  if (alreadyAnswered) {
    throw new Error('Already answered this question');
  }
  
  // Add answer
  participant.answers.push({
    questionIndex,
    selectedAnswer,
    isCorrect,
    points: isCorrect ? points : 0,
    answeredAt: new Date(),
    timeTaken
  });
  
  // Update score
  if (isCorrect) {
    participant.score += points;
  }
  
  await this.save();
  
  return participant;
};

// Get leaderboard
quizSessionSchema.methods.getLeaderboard = function() {
  return this.participants
    .map(p => ({
      userId: p.user,
      score: p.score,
      answersCount: p.answers.length,
      correctAnswers: p.answers.filter(a => a.isCorrect).length
    }))
    .sort((a, b) => b.score - a.score);
};

// Get participant stats
quizSessionSchema.methods.getParticipantStats = function(userId) {
  const participant = this.participants.find(
    p => p.user.toString() === userId.toString()
  );
  
  if (!participant) return null;
  
  return {
    score: participant.score,
    answersCount: participant.answers.length,
    correctAnswers: participant.answers.filter(a => a.isCorrect).length,
    answers: participant.answers
  };
};

// Check if all participants finished
quizSessionSchema.methods.areAllFinished = async function() {
  const quiz = await mongoose.model('Quiz').findById(this.quiz);
  const totalQuestions = quiz.questions.length;
  
  return this.participants.every(p => 
    p.answers.length >= totalQuestions
  );
};

// Get session summary
quizSessionSchema.methods.getSummary = function() {
  const totalParticipants = this.participants.length;
  const finishedParticipants = this.participants.filter(
    p => p.completedAt
  ).length;
  
  const averageScore = totalParticipants > 0
    ? this.participants.reduce((sum, p) => sum + p.score, 0) / totalParticipants
    : 0;
  
  return {
    totalParticipants,
    finishedParticipants,
    averageScore,
    duration: this.completedAt 
      ? (this.completedAt - this.startedAt) / 1000 / 60 // minutes
      : 0
  };
};

// ========================================
// STATICS
// ========================================

// Find active session for a group
quizSessionSchema.statics.findActiveSession = function(groupId) {
  return this.findOne({
    group: groupId,
    status: { $in: ['waiting', 'active', 'paused'] }
  }).populate('quiz').populate('host', 'name username')
    // ✅ NEW: lets the Lobby show a quick-quiz classroom's PIN+QR without a second fetch
    .populate('group', 'pin qrCode isQuickQuiz groupName')
    // Milestone 6 (Lobby avatar display): lets the teacher's REST lobby fetch show each
    // student's real avatar data (skinTone/title/badges) instead of a generic placeholder.
    .populate('participants.user', 'avatar');
};

// ========================================
// INDEXES
// ========================================

quizSessionSchema.index({ group: 1, status: 1 });
quizSessionSchema.index({ quiz: 1 });
quizSessionSchema.index({ 'participants.user': 1 });

module.exports = mongoose.model('QuizSession', quizSessionSchema);