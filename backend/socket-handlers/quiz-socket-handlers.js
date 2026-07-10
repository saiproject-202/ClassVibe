// backend/socket-handlers/quiz-socket-handlers.js
// ✅ CHANGES from previous version:
// 1. student:joinQuiz → look up real user name from DB, emit 'student:joined' (was 'participantJoined')
//    QuizHost listens for 'student:joined' — this fixes the real name display
// 2. student:joinQuiz → block rejoin if quiz status === 'completed' (send quizEnded event)
// 3. teacher:endQuiz → was emitting 'quiz:ended' but QuizPlayer/QuizHost listen for 'quiz:finished'
//    Fixed: now emits 'quiz:finished' consistently
// 4. quiz:joined → was hardcoding timeRemaining: 30, now uses actual timer value from activeQuizTimers
// 5. quiz:started for late joiners → include questionType + points (were missing for late-join case)
// ALL other logic — timers, scoring, streaks, leaderboard, chat notifications — IDENTICAL

const QuizSession = require('../models/QuizSession');
const Quiz        = require('../models/Quiz');
const QuizResult  = require('../models/QuizResult');
const Analytics   = require('../models/Analytics');
const Message     = require('../models/Message');
const User        = require('../models/User');

// Store active quiz timers
const activeQuizTimers = new Map();

/**
 * Setup quiz-related socket event handlers
 */
function setupQuizSocketHandlers(io, socket) {
  console.log('🎮 Setting up quiz socket handlers for:', socket.id);

  // ========================================
  // TEACHER CONTROLS — all unchanged except endQuiz fix
  // ========================================

  /**
   * Teacher joins the quiz session socket room so they receive all session events.
   * Must be emitted by QuizHost immediately on mount, before any other quiz event.
   */
  socket.on('teacher:joinSession', (data) => {
    const { sessionId } = data || {};
    if (!sessionId) return;
    socket.join(sessionId);
    console.log(`👨‍🏫 Teacher ${socket.userId} joined session room: ${sessionId}`);
    socket.emit('teacher:sessionJoined', { sessionId });
  });

  /**
   * Teacher starts quiz (begins Question 1)
   */
  socket.on('teacher:startQuiz', async (data) => {
    try {
      const { sessionId } = data;
      console.log('🚀 Teacher starting quiz:', sessionId);

      if (!socket.userId) {
        return socket.emit('error', { message: 'Not authenticated. Please refresh and try again.' });
      }

      const session = await QuizSession.findById(sessionId).populate('quiz');
      if (!session) return socket.emit('error', { message: 'Session not found' });

      if (session.host.toString() !== socket.userId.toString()) {
        return socket.emit('error', { message: 'Only host can start quiz' });
      }

      if (!session.quiz) {
        return socket.emit('error', { message: 'Quiz not found. It may have been deleted.' });
      }
      if (!session.quiz.questions || session.quiz.questions.length === 0) {
        return socket.emit('error', { message: 'Quiz has no questions.' });
      }

      session.status = 'active';
      session.currentQuestionIndex = 0;
      await session.save();

      const firstQuestion = session.quiz.questions[0];
      const questionTimeLimit = firstQuestion.timeLimit || 45;

      startQuestionTimer(io, session, 0, questionTimeLimit);

      io.to(sessionId).emit('quiz:started', {
        sessionId,
        questionIndex: 0,
        question: {
          questionText: firstQuestion.questionText,
          options:      firstQuestion.options,
          timeLimit:    questionTimeLimit,
          points:       firstQuestion.points || 10,
          questionType: firstQuestion.questionType || 'multiple_choice'
        },
        totalQuestions: session.quiz.questions.length
      });

      await sendChatNotification(io, session, 'quiz_started');
      console.log('✅ Quiz started successfully');

    } catch (error) {
      console.error('❌ Start quiz error:', error);
      socket.emit('error', { message: 'Failed to start quiz' });
    }
  });

  /**
   * Teacher manually advances to next question — UNCHANGED
   */
  socket.on('teacher:nextQuestion', async (data) => {
    try {
      const { sessionId } = data;

      const session = await QuizSession.findById(sessionId).populate('quiz');
      if (!session) return;

      if (session.host.toString() !== socket.userId.toString()) {
        return socket.emit('error', { message: 'Only host can control quiz' });
      }

      stopQuestionTimer(sessionId);

      const nextIndex = session.currentQuestionIndex + 1;
      if (nextIndex >= session.quiz.questions.length) {
        return socket.emit('error', { message: 'No more questions' });
      }

      session.currentQuestionIndex = nextIndex;
      await session.save();

      const nextQuestion    = session.quiz.questions[nextIndex];
      const questionTimeLimit = nextQuestion.timeLimit || 45;

      startQuestionTimer(io, session, nextIndex, questionTimeLimit);

      io.to(sessionId).emit('quiz:nextQuestion', {
        questionIndex: nextIndex,
        question: {
          questionText: nextQuestion.questionText,
          options:      nextQuestion.options,
          timeLimit:    questionTimeLimit,
          points:       nextQuestion.points || 10,
          questionType: nextQuestion.questionType || 'multiple_choice'
        },
        totalQuestions: session.quiz.questions.length
      });

      console.log(`✅ Advanced to question ${nextIndex + 1}`);

    } catch (error) {
      console.error('❌ Next question error:', error);
    }
  });

  /**
   * Teacher ends quiz
   * ✅ FIXED: was emitting 'quiz:ended' — QuizPlayer and QuizHost both listen for 'quiz:finished'
   */
  socket.on('teacher:endQuiz', async (data) => {
    try {
      const { sessionId } = data;

      const session = await QuizSession.findById(sessionId).populate('quiz');
      if (!session) return;

      if (session.host.toString() !== socket.userId.toString()) {
        return socket.emit('error', { message: 'Only host can end quiz' });
      }

      stopQuestionTimer(sessionId);

      session.status = 'completed';
      await session.save();

      const leaderboard = getLeaderboard(session);

      await sendChatNotification(io, session, 'quiz_ended', leaderboard);

      // ✅ FIXED: was 'quiz:ended' — now 'quiz:finished' to match QuizPlayer + QuizHost listeners
      io.to(sessionId).emit('quiz:finished', {
        sessionId,
        leaderboard,
        message: 'Quiz has ended'
      });

      console.log('🏁 Quiz ended by teacher:', sessionId);

      // ✅ NEW: persist QuizResult/Analytics — runs after quiz:finished so it never delays students
      await finalizeQuizSession(session, leaderboard);

    } catch (error) {
      console.error('❌ End quiz error:', error);
    }
  });

  // ========================================
  // STUDENT ACTIONS
  // ========================================

  /**
   * Student joins quiz session
   * ✅ CHANGED:
   *   - Block rejoin if status === 'completed'
   *   - Lookup real user name from DB
   *   - Emit 'student:joined' (was 'participantJoined') with { userId, name, username }
   *   - Fix hardcoded timeRemaining: 30 → use actual timer value
   *   - Fix late-join quiz:started to include questionType + points
   */
  socket.on('student:joinQuiz', async (data) => {
    try {
      const { sessionId } = data;
      console.log(`👤 Student ${socket.userId} joining quiz ${sessionId}`);

      const session = await QuizSession.findById(sessionId).populate('quiz');
      if (!session) {
        return socket.emit('error', { message: 'Session not found' });
      }

      // ✅ NEW: Block rejoin after quiz is completed
      if (session.status === 'completed') {
        console.log(`🚫 Student ${socket.userId} tried to rejoin completed quiz`);
        socket.emit('quiz:joined', {
          sessionId,
          status: 'completed',
          totalQuestions: session.quiz.questions.length,
          currentQuestion: null,
          timeRemaining: 0
        });
        return;
      }

      // Add student to session room
      socket.join(sessionId);

      // ✅ NEW: Look up real user name from DB
      let userName     = `Student`;
      let userUsername = '';
      try {
        const userDoc = await User.findById(socket.userId).select('name username email');
        if (userDoc) {
          userName     = userDoc.name || userDoc.username || userDoc.email?.split('@')[0] || 'Student';
          userUsername = userDoc.username || '';
        }
      } catch (e) {
        console.warn('Could not fetch user name for quiz join:', e.message);
      }

      // Check if student already in participants
      let participant = session.participants.find(
        p => p.user.toString() === socket.userId.toString()
      );

      if (!participant) {
        session.participants.push({
          user:     socket.userId,
          joinedAt: new Date(),
          answers:  [],
          score:    0,
          streak:   0
        });
        await session.save();
      }

      // ✅ FIXED: Get actual timeRemaining from timer (was hardcoded to 30)
      let timeRemaining = 0;
      if (session.status === 'active') {
        const timerInfo = activeQuizTimers.get(sessionId);
        if (timerInfo) {
          timeRemaining = timerInfo.timeRemaining;
        } else {
          const currentQ = session.quiz.questions[session.currentQuestionIndex];
          timeRemaining = currentQ?.timeLimit || 45;
        }
      }

      // Send current state to student
      socket.emit('quiz:joined', {
        sessionId,
        status:         session.status,
        totalQuestions: session.quiz.questions.length,
        currentQuestion: session.status === 'active'
          ? {
              questionIndex: session.currentQuestionIndex,
              question:      session.quiz.questions[session.currentQuestionIndex]
            }
          : null,
        // ✅ FIXED: actual timeRemaining, not hardcoded 30
        timeRemaining
      });

      // ✅ CHANGED: emit 'student:joined' with real name (was 'participantJoined' without name)
      // QuizHost listens for 'student:joined' — this is what powers the real name display
      io.to(sessionId).emit('student:joined', {
        userId:       socket.userId,
        name:         userName,
        username:     userUsername,
        studentCount: session.participants.length
      });

      // If quiz is already active, send the current question to the late-joining student
      if (session.status === 'active') {
        const currentQ = session.quiz.questions[session.currentQuestionIndex];

        // ✅ FIXED: include questionType + points (were missing before)
        socket.emit('quiz:started', {
          sessionId,
          questionIndex: session.currentQuestionIndex,
          question: {
            questionText: currentQ.questionText,
            options:      currentQ.options,
            timeLimit:    currentQ.timeLimit || 45,
            points:       currentQ.points || 10,
            questionType: currentQ.questionType || 'multiple_choice'
          },
          totalQuestions: session.quiz.questions.length
        });
      }

      console.log(`✅ Student "${userName}" joined quiz successfully`);

    } catch (error) {
      console.error('❌ Join quiz error:', error);
      socket.emit('error', { message: 'Failed to join quiz' });
    }
  });

  /**
   * Student submits answer — UNCHANGED
   */
  socket.on('student:submitAnswer', async (data) => {
    try {
      const { sessionId, questionIndex, selectedAnswer, timeTaken } = data;

      console.log(`📝 Student ${socket.userId} submitted answer for Q${questionIndex + 1}`);

      const session = await QuizSession.findById(sessionId).populate('quiz');
      if (!session) return;

      const question = session.quiz.questions[questionIndex];

      let isCorrect;
      if (question.questionType === 'fill_in_blank') {
        const studentAnswer = String(selectedAnswer ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
        const correctAnswer = String(question.correctAnswer ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
        isCorrect = studentAnswer === correctAnswer;
      } else if (question.questionType === 'multiple_select') {
        // ✅ FIXED: array === array is always false (reference comparison), so
        // multiple_select questions could never be marked correct. Compare as sets instead.
        const selected = Array.isArray(selectedAnswer) ? [...selectedAnswer].map(Number).sort((a, b) => a - b) : [];
        const correct  = Array.isArray(question.correctAnswer) ? [...question.correctAnswer].map(Number).sort((a, b) => a - b) : [];
        isCorrect = selected.length === correct.length && selected.every((v, i) => v === correct[i]);
      } else {
        isCorrect = selectedAnswer === question.correctAnswer;
      }

      const basePoints   = question.points || 10;
      const timeLimit    = question.timeLimit || 45;
      const timeRemaining = timeLimit - (timeTaken || 0);

      let points = 0;
      if (isCorrect) {
        if (timeRemaining >= (timeLimit * 2 / 3)) {
          points = basePoints * 2;
        } else if (timeRemaining >= (timeLimit * 1 / 3)) {
          points = Math.floor(basePoints * 1.5);
        } else {
          points = basePoints;
        }
      }

      const participantIndex = session.participants.findIndex(
        p => p.user.toString() === socket.userId.toString()
      );

      if (participantIndex !== -1) {
        const alreadyAnswered = session.participants[participantIndex].answers.some(
          a => a.questionIndex === questionIndex
        );

        if (!alreadyAnswered) {
          let currentStreak = session.participants[participantIndex].streak || 0;
          currentStreak     = isCorrect ? currentStreak + 1 : 0;
          session.participants[participantIndex].streak = currentStreak;

          session.participants[participantIndex].answers.push({
            questionIndex,
            selectedAnswer,
            isCorrect,
            points,
            timeTaken,
            answeredAt: new Date()
          });

          session.participants[participantIndex].score += points;
          await session.save();

          socket.emit('answer:summary', {
            questionIndex,
            selectedAnswer,
            correctAnswer:   question.correctAnswer,
            isCorrect,
            points,
            speedMultiplier: isCorrect ? (points / basePoints) : 0,
            explanation:     question.explanation,
            currentScore:    session.participants[participantIndex].score,
            streak:          currentStreak,
            questionText:    question.questionText,
            options:         question.options,
            questionType:    question.questionType || 'multiple_choice'
          });

          socket.to(sessionId).emit('student:answered', {
            userId:        socket.userId,
            questionIndex,
            answeredCount: session.participants.filter(
              p => p.answers.some(a => a.questionIndex === questionIndex)
            ).length
          });

          console.log(`✅ Answer recorded: ${isCorrect ? 'Correct' : 'Wrong'} (+${points} pts, Streak: ${currentStreak})`);
        }
      }

    } catch (error) {
      console.error('❌ Submit answer error:', error);
      socket.emit('error', { message: 'Failed to submit answer' });
    }
  });

  // ========================================
  // SOCKET DISCONNECT — UNCHANGED
  // ========================================

  socket.on('disconnect', () => {
    console.log('👋 Socket disconnected:', socket.id);
  });
}

// ========================================
// SERVER-SIDE TIMER FUNCTIONS — ALL UNCHANGED
// ========================================

function startQuestionTimer(io, session, questionIndex, timeLimit) {
  const sessionId = session._id.toString();
  stopQuestionTimer(sessionId);

  console.log(`⏱️ Starting timer for Q${questionIndex + 1}: ${timeLimit}s`);

  let timeRemaining = timeLimit;

  const timerInterval = setInterval(() => {
    timeRemaining--;

    // ✅ Update stored timeRemaining so late-joining students get correct value
    const stored = activeQuizTimers.get(sessionId);
    if (stored) stored.timeRemaining = timeRemaining;

    io.to(sessionId).emit('timer:update', {
      questionIndex,
      timeRemaining
    });

    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      activeQuizTimers.delete(sessionId);
      console.log(`⏰ Time expired for Q${questionIndex + 1}`);
      handleQuestionComplete(io, session, questionIndex);
    }
  }, 1000);

  activeQuizTimers.set(sessionId, {
    interval:      timerInterval,
    timeRemaining,
    questionIndex
  });
}

function stopQuestionTimer(sessionId) {
  const timerInfo = activeQuizTimers.get(sessionId);
  if (timerInfo) {
    clearInterval(timerInfo.interval);
    activeQuizTimers.delete(sessionId);
    console.log('⏹️ Timer stopped for session:', sessionId);
  }
}

/**
 * Handle question completion — UNCHANGED except final quiz:finished consistency
 */
async function handleQuestionComplete(io, session, questionIndex) {
  const sessionId = session._id.toString();

  try {
    const updatedSession = await QuizSession.findById(sessionId).populate('quiz');
    const question       = updatedSession.quiz.questions[questionIndex];

    const participantsWhoAnswered = updatedSession.participants.filter(
      p => p.answers.some(a => a.questionIndex === questionIndex)
    );

    for (let participant of updatedSession.participants) {
      const hasAnswered = participant.answers.some(a => a.questionIndex === questionIndex);
      if (!hasAnswered) {
        participant.answers.push({
          questionIndex,
          selectedAnswer: null,
          isCorrect:      false,
          points:         0,
          timeTaken:      question.timeLimit || 45,
          answeredAt:     new Date()
        });
        participant.streak = 0;
      }
    }

    await updatedSession.save();

    io.to(sessionId).emit('question:complete', {
      questionIndex,
      correctAnswer: question.correctAnswer,
      explanation:   question.explanation,
      questionText:  question.questionText,
      options:       question.options,
      questionType:  question.questionType || 'multiple_choice',
      answeredCount: participantsWhoAnswered.length,
      totalStudents: updatedSession.participants.length
    });

    setTimeout(() => {
      const leaderboard = getLeaderboard(updatedSession);

      io.to(sessionId).emit('leaderboard:show', {
        leaderboard,
        questionIndex,
        isLastQuestion: questionIndex >= updatedSession.quiz.questions.length - 1
      });

      if (questionIndex < updatedSession.quiz.questions.length - 1) {
        setTimeout(async () => {
          const nextIndex = questionIndex + 1;

          updatedSession.currentQuestionIndex = nextIndex;
          await updatedSession.save();

          const nextQuestion      = updatedSession.quiz.questions[nextIndex];
          const questionTimeLimit = nextQuestion.timeLimit || 45;

          startQuestionTimer(io, updatedSession, nextIndex, questionTimeLimit);

          io.to(sessionId).emit('quiz:nextQuestion', {
            questionIndex: nextIndex,
            question: {
              questionText: nextQuestion.questionText,
              options:      nextQuestion.options,
              timeLimit:    questionTimeLimit,
              points:       nextQuestion.points || 10,
              questionType: nextQuestion.questionType || 'multiple_choice'
            },
            totalQuestions: updatedSession.quiz.questions.length
          });

          console.log(`➡️ Auto-advanced to question ${nextIndex + 1}`);
        }, 5000);
      } else {
        // Last question — end quiz
        setTimeout(async () => {
          // Mark session completed
          updatedSession.status = 'completed';
          await updatedSession.save();

          const finalLeaderboard = getLeaderboard(updatedSession);
          await sendChatNotification(io, updatedSession, 'quiz_ended', finalLeaderboard);

          // ✅ CONSISTENT: always 'quiz:finished' (same event as teacher:endQuiz)
          io.to(sessionId).emit('quiz:finished', {
            leaderboard: finalLeaderboard,
            message:     'Quiz completed!'
          });
          console.log('🏁 Quiz finished (auto)');

          // ✅ NEW: persist QuizResult/Analytics — runs after quiz:finished so it never delays students
          await finalizeQuizSession(updatedSession, finalLeaderboard);
        }, 5000);
      }
    }, 10000);

  } catch (error) {
    console.error('❌ Question complete handler error:', error);
  }
}

/**
 * Generate leaderboard — UNCHANGED
 */
function getLeaderboard(session) {
  return session.participants
    .map(p => ({
      userId:         p.user,
      score:          p.score,
      correctAnswers: p.answers.filter(a => a.isCorrect).length,
      totalAnswers:   p.answers.length,
      streak:         p.streak || 0
    }))
    .sort((a, b) => b.score !== a.score ? b.score - a.score : b.correctAnswers - a.correctAnswers)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/**
 * ✅ NEW: Finalize a completed quiz session.
 *
 * Persists one QuizResult document per participant (this collection previously
 * had zero documents ever written to it — quiz history was read directly off
 * the live QuizSession instead, so per-student badges/percentiles/history were
 * always empty), updates the Quiz template's running average score, and feeds
 * the Analytics model so the teacher dashboard reflects real activity instead
 * of permanently-zero counters.
 *
 * Called once from BOTH completion paths (teacher:endQuiz and the auto-complete
 * branch of handleQuestionComplete) via this single shared function, specifically
 * so the two paths can't drift out of sync with each other over time.
 *
 * Deliberately non-fatal: this always runs AFTER the 'quiz:finished' event has
 * already been broadcast to students, so a failure here never delays or blocks
 * what students see.
 */
async function finalizeQuizSession(session, leaderboard) {
  try {
    const quiz = session.quiz;
    if (!quiz || !quiz.questions || quiz.questions.length === 0) return;

    const participantsWithAnswers = session.participants.filter(p => p.answers && p.answers.length > 0);
    if (participantsWithAnswers.length === 0) {
      console.log('ℹ️ finalizeQuizSession: no participants with answers, skipping QuizResult creation');
      return;
    }

    const maxScore = quiz.getTotalPoints();
    const totalQuestions = quiz.questions.length;
    const rankByUserId = new Map(
      (leaderboard || []).map(entry => [entry.userId.toString(), entry.rank])
    );

    let sessionScoreSum = 0;
    let resultsCreated = 0;

    for (const participant of participantsWithAnswers) {
      try {
        const correctAnswers = participant.answers.filter(a => a.isCorrect).length;

        const answers = participant.answers.map(a => {
          const q = quiz.questions[a.questionIndex];
          return {
            questionIndex: a.questionIndex,
            questionText: q ? q.questionText : '',
            selectedAnswer: a.selectedAnswer,
            correctAnswer: q ? q.correctAnswer : null,
            isCorrect: a.isCorrect,
            points: a.points,
            timeTaken: a.timeTaken,
            answeredAt: a.answeredAt
          };
        });

        const result = new QuizResult({
          quiz: quiz._id,
          session: session._id,
          student: participant.user,
          group: session.group,
          score: participant.score,
          maxScore,
          percentage: 0, // computed by calculateMetrics() below
          correctAnswers,
          totalQuestions,
          answers,
          startedAt: participant.joinedAt || session.createdAt || new Date(),
          completedAt: new Date(),
          rank: rankByUserId.get(participant.user.toString()) || null
        });

        result.calculateMetrics();
        result.assignBadge(participantsWithAnswers.length);
        await result.save();
        resultsCreated++;

        sessionScoreSum += participant.score;

        // Feed Analytics — this is what makes the teacher dashboard reflect
        // real quiz activity instead of always showing "Needs Attention".
        try {
          const analytics = await Analytics.getOrCreate(participant.user, session.group);
          analytics.recordQuizResult({
            score: result.score,
            correctAnswers: result.correctAnswers,
            totalQuestions: result.totalQuestions,
            badge: result.badge,
            averageTimePerQuestion: result.averageTimePerQuestion
          });
          await analytics.save();
        } catch (analyticsError) {
          console.error('⚠️ Analytics.recordQuizResult failed (non-fatal):', analyticsError.message);
        }
      } catch (participantError) {
        console.error('⚠️ QuizResult creation failed for one participant (non-fatal):', participantError.message);
      }
    }

    // One session-level average-score update for the Quiz template
    try {
      const sessionAverageScore = sessionScoreSum / participantsWithAnswers.length;
      await quiz.updateAverageScore(sessionAverageScore);
    } catch (quizUpdateError) {
      console.error('⚠️ Quiz.updateAverageScore failed (non-fatal):', quizUpdateError.message);
    }

    console.log(`✅ finalizeQuizSession: created ${resultsCreated}/${participantsWithAnswers.length} QuizResult docs for session ${session._id}`);
  } catch (error) {
    console.error('❌ finalizeQuizSession error (non-fatal — quiz:finished was already broadcast):', error);
  }
}

/**
 * Send chat notification — UNCHANGED
 */
async function sendChatNotification(io, session, type, leaderboard = null) {
  try {
    const groupId = session.group;

    if (type === 'quiz_started') {
      const message = await Message.create({
        group:       groupId,
        messageType: 'quiz_started',
        content:     `📝 Quiz Started: ${session.quiz.title}\n\nJoin now!`,
        metadata:    { quizId: session.quiz._id, sessionId: session._id }
      });
      io.to(groupId.toString()).emit('newMessage', { message });

    } else if (type === 'quiz_ended') {
      if (!leaderboard || leaderboard.length === 0) return;
      const winner     = leaderboard[0];
      const winnerUser = await User.findById(winner.userId);

      const message = await Message.create({
        group:       groupId,
        messageType: 'quiz_ended',
        content:     `🎉 Quiz completed!\n🏆 ${winnerUser?.name || 'Winner'}: ${winner.score} pts`,
        metadata:    {
          quizId:      session.quiz._id,
          sessionId:   session._id,
          winnerId:    winner.userId,
          winnerScore: winner.score
        }
      });
      io.to(groupId.toString()).emit('newMessage', { message });
    }
  } catch (error) {
    console.error('Chat notification error:', error);
  }
}

// ========================================
// CLEANUP — UNCHANGED
// ========================================

function cleanupQuizTimers() {
  console.log('🧹 Cleaning up all quiz timers...');
  for (const [sessionId, timerInfo] of activeQuizTimers.entries()) {
    clearInterval(timerInfo.interval);
    console.log(`⏹️ Stopped timer for session: ${sessionId}`);
  }
  activeQuizTimers.clear();
  console.log('✅ All timers cleaned up');
}

module.exports = {
  setupQuizSocketHandlers,
  cleanupQuizTimers,
  stopQuestionTimer
};