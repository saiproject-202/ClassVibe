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

      // ✅ NEW (Phase 3): lock in teams — anyone who never picked one during the lobby
      // (allowStudentChoice was on but they just didn't choose, or it was off entirely)
      // gets auto-assigned to whichever team is currently smallest.
      let teamRosterCounts = null;
      if (session.teams && session.teams.length > 0) {
        session.participants.forEach(p => {
          if (!p.teamId) assignToSmallestTeam(session, p);
        });
        teamRosterCounts = {};
        session.teams.forEach(t => { teamRosterCounts[t.teamId] = 0; });
        session.participants.forEach(p => {
          if (p.teamId) teamRosterCounts[p.teamId] = (teamRosterCounts[p.teamId] || 0) + 1;
        });
      }

      await session.save();

      // Let everyone see the final team rosters before the first question fires
      if (teamRosterCounts) {
        io.to(sessionId).emit('team:assigned', { userId: null, teamId: null, teamRosterCounts });
      }

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

      // ✅ NEW (Phase 5): show the momentum bar right away (even split, since nobody's
      // answered yet) instead of it appearing blank until the first answer comes in
      if (session.teams && session.teams.length > 0) {
        io.to(sessionId).emit('team:momentumUpdate', { teams: computeMomentum(session, session.quiz) });
      }

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

      if (session.teams && session.teams.length > 0) {
        io.to(sessionId).emit('team:momentumUpdate', { teams: computeMomentum(session, session.quiz) });
      }

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
      const teamLeaderboard = getTeamLeaderboard(session, session.quiz); // ✅ NEW (Phase 3) — [] in individual mode

      await sendChatNotification(io, session, 'quiz_ended', leaderboard);

      // ✅ FIXED: was 'quiz:ended' — now 'quiz:finished' to match QuizPlayer + QuizHost listeners
      io.to(sessionId).emit('quiz:finished', {
        sessionId,
        leaderboard,
        teamLeaderboard, // ✅ NEW (Phase 3)
        message: 'Quiz has ended'
      });

      console.log('🏁 Quiz ended by teacher:', sessionId);

      // ✅ NEW: persist QuizResult/Analytics — runs after quiz:finished so it never delays students
      await finalizeQuizSession(io, session, leaderboard);

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
          name:     userName, // ✅ NEW — captured once here, reused by getLeaderboard() so
                               // leaderboards can show real names instead of just points
          joinedAt: new Date(),
          answers:  [],
          score:    0,
          streak:   0
        });
        participant = session.participants[session.participants.length - 1];

        // ✅ NEW (Phase 3/4): auto-assign a team immediately on join in two cases:
        // (1) a genuinely late joiner (quiz already active) who missed the lobby's
        //     team-selection step entirely, or
        // (2) this session doesn't let students pick their own team at all — e.g.
        //     Random Teams mode (Phase 4), where the teacher only sets a team count and
        //     the system distributes everyone automatically as they arrive in the lobby.
        const noStudentChoice = session.sessionSettings?.allowStudentChoice === false;
        if (session.teams && session.teams.length > 0 && (session.status !== 'waiting' || noStudentChoice)) {
          assignToSmallestTeam(session, participant);
        }

        await session.save();

        if (participant.teamId) {
          const teamRosterCounts = {};
          session.teams.forEach(t => { teamRosterCounts[t.teamId] = 0; });
          session.participants.forEach(p => {
            if (p.teamId) teamRosterCounts[p.teamId] = (teamRosterCounts[p.teamId] || 0) + 1;
          });
          io.to(sessionId).emit('team:assigned', { userId: socket.userId, teamId: participant.teamId, teamRosterCounts });
        }
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
        timeRemaining,
        // ✅ NEW (Phase 3): team context — empty array + null in individual mode
        teams:              session.teams || [],
        myTeamId:           participant.teamId || null,
        allowStudentChoice: session.sessionSettings?.allowStudentChoice !== false
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
   * ✅ NEW (Phase 3 — TEAM_MODE_DESIGN.md §3/§11): student picks a team in the lobby.
   * Only valid while the session is 'waiting' — teams lock the moment the quiz starts
   * (lockOnStart in sessionSettings; enforced here by the status check, since once
   * 'active' this handler simply refuses further changes regardless of that flag).
   */
  socket.on('student:selectTeam', async (data) => {
    try {
      const { sessionId, teamId } = data || {};
      if (!socket.userId) {
        return socket.emit('error', { message: 'Not authenticated. Please refresh and try again.' });
      }

      const session = await QuizSession.findById(sessionId);
      if (!session) return socket.emit('error', { message: 'Session not found' });

      if (session.status !== 'waiting') {
        return socket.emit('error', { message: 'Teams are locked — the quiz has already started.' });
      }

      if (!session.teams || session.teams.length === 0) {
        return socket.emit('error', { message: 'This quiz is not in team mode.' });
      }

      const team = session.teams.find(t => t.teamId === teamId);
      if (!team) return socket.emit('error', { message: 'Invalid team.' });

      const participant = session.participants.find(
        p => p.user.toString() === socket.userId.toString()
      );
      if (!participant) {
        return socket.emit('error', { message: 'Join the quiz before picking a team.' });
      }

      // Auto-balance: a student may only join whichever team currently has the fewest
      // members (their own existing pick, if any, is excluded from the count first so
      // switching teams doesn't count against themselves). Keeps every team within 1
      // member of every other team at all times.
      if (session.sessionSettings?.autoBalance) {
        const counts = {};
        session.teams.forEach(t => { counts[t.teamId] = 0; });
        session.participants.forEach(p => {
          if (p.teamId && p.user.toString() !== socket.userId.toString()) {
            counts[p.teamId] = (counts[p.teamId] || 0) + 1;
          }
        });
        const minCount = Math.min(...Object.values(counts));
        if ((counts[teamId] || 0) > minCount) {
          return socket.emit('team:full', { teamId });
        }
      }

      participant.teamId = teamId;
      await session.save();

      const teamRosterCounts = {};
      session.teams.forEach(t => { teamRosterCounts[t.teamId] = 0; });
      session.participants.forEach(p => {
        if (p.teamId) teamRosterCounts[p.teamId] = (teamRosterCounts[p.teamId] || 0) + 1;
      });

      io.to(sessionId).emit('team:assigned', {
        userId: socket.userId,
        teamId,
        teamRosterCounts
      });

      console.log(`👥 Student ${socket.userId} joined team "${teamId}" in session ${sessionId}`);
    } catch (error) {
      console.error('❌ Select team error:', error);
      socket.emit('error', { message: 'Failed to select team' });
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

          // ✅ CHANGED: no longer reveals correct/wrong the instant this student submits.
          // Everyone (answered or not) now finds out together when the timer ends —
          // see the answer:summary broadcast loop in handleQuestionComplete() below.
          // A lightweight ack lets the client confirm the submission went through
          // without giving away whether it was correct.
          socket.emit('student:answerReceived', { questionIndex });

          socket.to(sessionId).emit('student:answered', {
            userId:        socket.userId,
            questionIndex,
            answeredCount: session.participants.filter(
              p => p.answers.some(a => a.questionIndex === questionIndex)
            ).length
          });

          // ✅ NEW (Phase 5): live team momentum bar — recomputed after every single
          // answer, not just at question end, so students see their team's standing
          // shift in real time. Team-aggregate only, doesn't reveal whether THIS
          // student's own answer was right or wrong (that's still saved for the
          // synchronized reveal in handleQuestionComplete).
          if (session.teams && session.teams.length > 0) {
            const momentum = computeMomentum(session, session.quiz);
            io.to(sessionId).emit('team:momentumUpdate', { teams: momentum });
          }

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

    // ✅ NEW: reveal correct/wrong to EVERY participant at the same moment — when the
    // timer ends — instead of the old behavior where each student found out the
    // instant they personally submitted, before anyone else had even answered.
    const basePoints = question.points || 10;
    for (const participant of updatedSession.participants) {
      const answerEntry = participant.answers.find(a => a.questionIndex === questionIndex);
      if (!answerEntry) continue;
      io.to(participant.user.toString()).emit('answer:summary', {
        questionIndex,
        selectedAnswer:  answerEntry.selectedAnswer,
        correctAnswer:   question.correctAnswer,
        isCorrect:       answerEntry.isCorrect,
        points:          answerEntry.points,
        speedMultiplier: answerEntry.isCorrect ? (answerEntry.points / basePoints) : 0,
        explanation:     question.explanation,
        currentScore:    participant.score,
        streak:          participant.streak || 0,
        questionText:    question.questionText,
        options:         question.options,
        questionType:    question.questionType || 'multiple_choice'
      });
    }

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
      const teamLeaderboard = getTeamLeaderboard(updatedSession, updatedSession.quiz); // ✅ NEW (Phase 3)
      const questionMVP = computeQuestionMVP(updatedSession, questionIndex); // ✅ NEW (Phase 5.2)

      io.to(sessionId).emit('leaderboard:show', {
        leaderboard,
        teamLeaderboard, // ✅ NEW (Phase 3)
        questionMVP, // ✅ NEW (Phase 5.2)
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

          if (updatedSession.teams && updatedSession.teams.length > 0) {
            io.to(sessionId).emit('team:momentumUpdate', { teams: computeMomentum(updatedSession, updatedSession.quiz) });
          }

          console.log(`➡️ Auto-advanced to question ${nextIndex + 1}`);
        }, 5000);
      } else {
        // Last question — end quiz
        setTimeout(async () => {
          // Mark session completed
          updatedSession.status = 'completed';
          await updatedSession.save();

          const finalLeaderboard = getLeaderboard(updatedSession);
          const finalTeamLeaderboard = getTeamLeaderboard(updatedSession, updatedSession.quiz); // ✅ NEW (Phase 3)
          await sendChatNotification(io, updatedSession, 'quiz_ended', finalLeaderboard);

          // ✅ CONSISTENT: always 'quiz:finished' (same event as teacher:endQuiz)
          io.to(sessionId).emit('quiz:finished', {
            leaderboard: finalLeaderboard,
            teamLeaderboard: finalTeamLeaderboard, // ✅ NEW (Phase 3)
            message:     'Quiz completed!'
          });
          console.log('🏁 Quiz finished (auto)');

          // ✅ NEW: persist QuizResult/Analytics — runs after quiz:finished so it never delays students
          await finalizeQuizSession(io, updatedSession, finalLeaderboard);
        }, 5000);
      }
    }, 10000);

  } catch (error) {
    console.error('❌ Question complete handler error:', error);
  }
}

/**
 * ✅ NEW (Phase 3 — TEAM_MODE_DESIGN.md §3): assign a participant to whichever team
 * currently has the fewest members. Used for two cases: (1) a student who never picked
 * a team during the lobby, once the teacher starts the quiz, and (2) a genuinely late
 * joiner who missed the lobby entirely. No-op in individual mode (session.teams empty).
 */
function assignToSmallestTeam(session, participant) {
  if (!session.teams || session.teams.length === 0) return;
  const counts = {};
  session.teams.forEach(t => { counts[t.teamId] = 0; });
  session.participants.forEach(p => {
    if (p.teamId) counts[p.teamId] = (counts[p.teamId] || 0) + 1;
  });
  const smallestTeam = session.teams.reduce((smallest, t) =>
    (counts[t.teamId] || 0) < (counts[smallest.teamId] || 0) ? t : smallest
  , session.teams[0]);
  participant.teamId = smallestTeam.teamId;
}

/**
 * ✅ NEW (Phase 3 — TEAM_MODE_DESIGN.md §4.2): team-aware leaderboard. Deliberately
 * uses AVERAGE team score, not total, so a bigger team doesn't automatically win just
 * by having more players — this was the entire reason Team Mode was designed the way
 * it was (see TEAM_MODE_DESIGN.md §1). Team Rating blends average score (70%), average
 * speed bonus (20%), and participation (10%). Students only ever see the resulting
 * number and rank, never this formula ("transparent to students, not to formulas").
 * Returns [] in individual mode (session.teams empty).
 */
function getTeamLeaderboard(session, quiz) {
  if (!session.teams || session.teams.length === 0) return [];

  const maxPossibleScore = quiz.getTotalPoints() || 1;

  const rows = session.teams.map(team => {
    const members = session.participants.filter(p => p.teamId === team.teamId);
    const answeredMembers = members.filter(p => p.answers && p.answers.length > 0);

    const totalScore = members.reduce((sum, p) => sum + (p.score || 0), 0);
    const avgScore = answeredMembers.length > 0 ? totalScore / answeredMembers.length : 0;
    const avgScoreNormalized = Math.min(100, (avgScore / maxPossibleScore) * 100);

    // Average speed factor across answered members (1x-2x range from the existing
    // speed-bonus formula in student:submitAnswer), normalized so 1x→0%, 2x→100%
    const speedFactors = answeredMembers.map(p => {
      const correct = p.answers.filter(a => a.isCorrect);
      if (correct.length === 0) return 0;
      const multipliers = correct.map(a => {
        const q = quiz.questions[a.questionIndex];
        const basePoints = (q && q.points) || 10;
        return basePoints > 0 ? a.points / basePoints : 1;
      });
      return multipliers.reduce((a, b) => a + b, 0) / multipliers.length;
    });
    const avgSpeedFactor = speedFactors.length > 0
      ? speedFactors.reduce((a, b) => a + b, 0) / speedFactors.length
      : 0;
    const avgSpeedNormalized = Math.min(100, Math.max(0, (avgSpeedFactor - 1) * 100));

    const participationRate = members.length > 0 ? (answeredMembers.length / members.length) * 100 : 0;

    const teamRating = (0.70 * avgScoreNormalized) + (0.20 * avgSpeedNormalized) + (0.10 * participationRate);

    return {
      teamId:            team.teamId,
      name:              team.name,
      color:             team.color,
      icon:              team.icon,
      memberCount:       members.length,
      totalScore,
      averageScore:      Math.round(avgScore * 10) / 10,
      participationRate: Math.round(participationRate),
      teamRating:        Math.round(teamRating * 10) / 10,
      members: members.map(p => ({ userId: p.user, name: p.name || 'Student', score: p.score || 0 }))
    };
  });

  return rows
    .sort((a, b) => b.teamRating - a.teamRating)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

/**
 * ✅ NEW (Phase 5 — TEAM_MODE_DESIGN.md §5/§16.4): live "momentum" percentages for the
 * bar shown at the top of the question screen, recomputed after every answer (not just
 * at question end). Reuses getTeamLeaderboard's Team Rating rather than a separate
 * metric — the momentum bar and the leaderboard should never disagree about who's ahead.
 * Splits evenly if nobody has scored anything yet, so the bar starts at a sensible 50/50
 * (or 1/N) instead of one team showing 0% before the first answer comes in.
 */
function computeMomentum(session, quiz) {
  const rows = getTeamLeaderboard(session, quiz);
  if (rows.length === 0) return [];

  const totalRating = rows.reduce((sum, t) => sum + t.teamRating, 0);
  if (totalRating <= 0) {
    const even = Math.round(100 / rows.length);
    return rows.map(t => ({ teamId: t.teamId, name: t.name, icon: t.icon, color: t.color, percentage: even }));
  }
  return rows.map(t => ({
    teamId: t.teamId,
    name: t.name,
    icon: t.icon,
    color: t.color,
    percentage: Math.round((t.teamRating / totalRating) * 100)
  }));
}

/**
 * ✅ NEW (Phase 5.2): find the top scorer for a single question — highest points,
 * tiebroken by fastest timeTaken. Returns null if nobody answered correctly (an
 * all-wrong/all-unanswered question has no MVP to celebrate).
 */
function computeQuestionMVP(session, questionIndex) {
  let mvp = null;
  for (const participant of session.participants) {
    const answerEntry = participant.answers.find(a => a.questionIndex === questionIndex);
    if (!answerEntry || !answerEntry.isCorrect || answerEntry.points <= 0) continue;

    if (
      !mvp ||
      answerEntry.points > mvp.points ||
      (answerEntry.points === mvp.points && answerEntry.timeTaken < mvp.timeTaken)
    ) {
      mvp = {
        userId:     participant.user,
        name:       participant.name || 'Student',
        points:     answerEntry.points,
        timeTaken:  answerEntry.timeTaken
      };
    }
  }
  return mvp;
}

/**
 * Generate leaderboard — UNCHANGED
 */
function getLeaderboard(session) {
  return session.participants
    .map(p => ({
      userId:         p.user,
      name:           p.name || 'Student', // ✅ NEW — captured once at join time (see student:joinQuiz)
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
 *
 * ✅ NEW (Phase 2 — TEAM_MODE_DESIGN.md): also computes end-of-quiz awards
 * (Fastest Thinker, Best Accuracy, Longest Streak, Most Improved) from the
 * QuizResult docs just created, and broadcasts them via 'quiz:awardsRevealed'.
 */
async function finalizeQuizSession(io, session, leaderboard) {
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
    const resultsForAwards = []; // ✅ NEW — { result, name } pairs, fed to computeAwards() below

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
          rank: rankByUserId.get(participant.user.toString()) || null,
          teamId: participant.teamId || null // ✅ NEW (Phase 3) — null in individual mode
        });

        result.calculateMetrics();
        result.assignBadge(participantsWithAnswers.length);
        await result.save();
        resultsCreated++;
        resultsForAwards.push({ result, name: participant.name || 'Student' });

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

    // ✅ NEW (Phase 3): stamp team rank/rating onto each participant's QuizResult, and
    // compute the final team leaderboard once for both this and the awards step below.
    let teamLeaderboardRows = [];
    if (session.teams && session.teams.length > 0) {
      try {
        teamLeaderboardRows = getTeamLeaderboard(session, quiz);
        const teamInfoById = new Map(teamLeaderboardRows.map(t => [t.teamId, t]));
        for (const { result } of resultsForAwards) {
          if (!result.teamId) continue;
          const teamInfo = teamInfoById.get(result.teamId);
          if (!teamInfo) continue;
          result.teamRank = teamInfo.rank;
          result.teamRating = teamInfo.teamRating;
          await result.save();
        }
      } catch (teamStampError) {
        console.error('⚠️ Team rank/rating stamping failed (non-fatal):', teamStampError.message);
      }
    }

    // ✅ NEW (Phase 2/3): compute and broadcast end-of-quiz awards. No MVP award here —
    // in individual mode it's redundant with leaderboard rank #1 (TEAM_MODE_DESIGN.md §6).
    // Each award type is gated behind quiz.settings.awards.* so a teacher who turns one
    // off in the (Phase 3.6) Settings UI actually sees it disappear, not just decoration.
    try {
      const awardsSettings = quiz.settings?.awards || {};
      const awards = await computeAwards(resultsForAwards, awardsSettings, teamLeaderboardRows);

      if (awards.length > 0) {
        // Record which awards each student/team earned, for quiz history
        const resultByUserId = new Map(resultsForAwards.map(({ result }) => [result.student.toString(), result]));
        for (const award of awards) {
          try {
            if (award.userId) {
              const r = resultByUserId.get(award.userId.toString());
              if (r) { r.awardsEarned.push(award.type); await r.save(); }
            } else if (award.teamId) {
              const teamMembers = resultsForAwards.filter(({ result }) => result.teamId === award.teamId);
              for (const { result: r } of teamMembers) { r.awardsEarned.push(award.type); await r.save(); }
            }
          } catch (stampError) {
            console.error('⚠️ awardsEarned stamping failed for one award (non-fatal):', stampError.message);
          }
        }
      }

      if (awards.length > 0 && io) {
        io.to(session._id.toString()).emit('quiz:awardsRevealed', { awards });
        console.log(`🏅 Awards revealed for session ${session._id}:`, awards.map(a => a.type).join(', '));
      }
    } catch (awardsError) {
      console.error('⚠️ computeAwards failed (non-fatal):', awardsError.message);
    }

    console.log(`✅ finalizeQuizSession: created ${resultsCreated}/${participantsWithAnswers.length} QuizResult docs for session ${session._id}`);
  } catch (error) {
    console.error('❌ finalizeQuizSession error (non-fatal — quiz:finished was already broadcast):', error);
  }
}

/**
 * ✅ NEW (Phase 2/3 — TEAM_MODE_DESIGN.md §6): compute end-of-quiz awards from the
 * QuizResult documents just created for this session.
 *
 * - Fastest Thinker: lowest average time-taken among CORRECT answers (must have ≥1 correct)
 * - Best Accuracy: highest correctAnswers/totalQuestions ratio
 * - Longest Streak: longest run of consecutive correct answers across the WHOLE quiz —
 *   deliberately recomputed from the full answer history here, not read from the live
 *   session's `streak` counter, because that counter resets to 0 on any wrong answer and
 *   would lose a student's best streak if they missed a later question.
 * - Most Improved: this quiz's percentage vs. the student's own average on past QuizResult
 *   documents in this group — skipped for a student (or entirely) with no prior history yet.
 * - Team Spirit (team mode only): the team with the smallest score gap between its highest
 *   and lowest contributing member — rewards teams where everyone pitched in, not just one
 *   star player. Needs ≥2 teams with ≥2 members each to be meaningful.
 *
 * Every award is gated behind quiz.settings.awards.<type> (default true, matching the
 * schema) — a teacher who turns one off via the Settings UI (Phase 3.6) actually sees it
 * disappear, not just decoration. Awards with no eligible winner are simply omitted.
 */
async function computeAwards(participantResults, awardsSettings = {}, teamLeaderboardRows = []) {
  const awards = [];
  if (!participantResults || participantResults.length === 0) return awards;
  const enabled = (key) => awardsSettings[key] !== false; // undefined/true → enabled

  // Fastest Thinker
  if (enabled('fastestThinker')) {
    let fastest = null;
    for (const { result, name } of participantResults) {
      const correctTimes = result.answers
        .filter(a => a.isCorrect && typeof a.timeTaken === 'number')
        .map(a => a.timeTaken);
      if (correctTimes.length === 0) continue;
      const avgTime = correctTimes.reduce((a, b) => a + b, 0) / correctTimes.length;
      if (!fastest || avgTime < fastest.avgTime) {
        fastest = { userId: result.student, name, avgTime };
      }
    }
    if (fastest) {
      awards.push({ type: 'fastestThinker', userId: fastest.userId, name: fastest.name, value: `${fastest.avgTime.toFixed(1)}s avg` });
    }
  }

  // Best Accuracy
  if (enabled('bestAccuracy')) {
    let bestAccuracy = null;
    for (const { result, name } of participantResults) {
      if (!result.totalQuestions) continue;
      const accuracy = result.correctAnswers / result.totalQuestions;
      if (!bestAccuracy || accuracy > bestAccuracy.accuracy) {
        bestAccuracy = { userId: result.student, name, accuracy };
      }
    }
    if (bestAccuracy) {
      awards.push({ type: 'bestAccuracy', userId: bestAccuracy.userId, name: bestAccuracy.name, value: `${Math.round(bestAccuracy.accuracy * 100)}% accuracy` });
    }
  }

  // Longest Streak
  if (enabled('longestStreak')) {
    let longestStreak = null;
    for (const { result, name } of participantResults) {
      const sorted = [...result.answers].sort((a, b) => a.questionIndex - b.questionIndex);
      let run = 0, best = 0;
      for (const a of sorted) {
        run = a.isCorrect ? run + 1 : 0;
        if (run > best) best = run;
      }
      if (best > 0 && (!longestStreak || best > longestStreak.streak)) {
        longestStreak = { userId: result.student, name, streak: best };
      }
    }
    if (longestStreak) {
      awards.push({ type: 'longestStreak', userId: longestStreak.userId, name: longestStreak.name, value: `${longestStreak.streak} in a row` });
    }
  }

  // Most Improved — needs one DB lookup per student for their prior history
  if (enabled('mostImproved')) {
    let mostImproved = null;
    for (const { result, name } of participantResults) {
      try {
        const pastResults = await QuizResult.find({
          student: result.student,
          group:   result.group,
          _id:     { $ne: result._id }
        }).select('percentage').lean();

        if (pastResults.length === 0) continue; // no history yet — not eligible

        const pastAverage = pastResults.reduce((sum, r) => sum + (r.percentage || 0), 0) / pastResults.length;
        const improvement = result.percentage - pastAverage;
        if (improvement > 0 && (!mostImproved || improvement > mostImproved.improvement)) {
          mostImproved = { userId: result.student, name, improvement };
        }
      } catch (e) {
        console.error('⚠️ Most Improved lookup failed for one student (non-fatal):', e.message);
      }
    }
    if (mostImproved) {
      awards.push({ type: 'mostImproved', userId: mostImproved.userId, name: mostImproved.name, value: `+${Math.round(mostImproved.improvement)}% improvement` });
    }
  }

  // Team Spirit — team mode only
  if (enabled('teamSpirit') && teamLeaderboardRows.length >= 2) {
    let teamSpirit = null;
    for (const team of teamLeaderboardRows) {
      if (!team.members || team.members.length < 2) continue;
      const scores = team.members.map(m => m.score || 0);
      const gap = Math.max(...scores) - Math.min(...scores);
      if (!teamSpirit || gap < teamSpirit.gap) {
        teamSpirit = { teamId: team.teamId, name: team.name, gap };
      }
    }
    if (teamSpirit) {
      awards.push({ type: 'teamSpirit', teamId: teamSpirit.teamId, name: teamSpirit.name, value: `${teamSpirit.gap} pt spread` });
    }
  }

  return awards;
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