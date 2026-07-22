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
const Group       = require('../models/Group');

// Quick-quiz groups are one-off, auto-created backing rooms for a single Instant Quiz
// (hidden from the teacher's "My Classes" list, so there's no manual "End Session" button
// for them). Once their one quiz completes, end the group too — otherwise it stays
// isActive:true forever and keeps showing as "LIVE" on students' dashboards.
async function endQuickQuizGroupIfDone(session) {
  if (!session.group) return;
  try {
    const group = await Group.findById(session.group);
    if (group && group.isQuickQuiz && group.isActive) {
      await group.endSession();
    }
  } catch (err) {
    console.error('❌ Failed to auto-end quick-quiz group:', err);
  }
}

// Store active quiz timers
const activeQuizTimers = new Map();

// Milestone 11: must stay in sync with CELEBRATION_EMOTES in
// frontend/src/avatarConstants.js — the fixed set of celebration choices a
// top-3 finisher can pick on the Final Results podium.
const ALLOWED_CELEBRATION_EMOTES = ['celebrate', 'clap', 'wave', 'victory', 'thankYou', 'teamRespect'];

// ✅ Score scaling: teachers author small per-question weights (10/15/25…), but final
// leaderboard scores should feel substantial (a full quiz lands in the low thousands).
// This multiplier scales the DISPLAYED and AWARDED points identically, and is applied to
// the max-score/percentage baselines too — so absolute scores grow ~20×, while accuracy
// percentages, speed multipliers, and team normalization all stay unchanged. Tune here.
const POINTS_MULTIPLIER = 20;
// Effective points for one question (raw author weight × the display/award multiplier).
const scaledPoints = (q) => ((q && q.points) || 10) * POINTS_MULTIPLIER;

// ✅ Question-cycle pacing (ms) — how long each between-questions beat is shown before the
// next one. Deliberately relaxed (not "hurry-burry") so every student and the watching
// teacher get a full look at the answer reveal, the class stats, and the leaderboard.
// The reveal chain is: Answer Reveal → Question Summary → Leaderboard (+ short countdown)
// → next question. Tune these three numbers to speed up / slow down the whole flow.
const ANSWER_REVEAL_MS    = 15000; // Correct/Wrong answer reveal (was 4s — students missed it)
const QUESTION_SUMMARY_MS = 7000;  // class-wide stats beat (was 3s)
const LEADERBOARD_MS      = 12000; // ranked leaderboard, then next question (was 3s)
const COUNTDOWN_MS        = 3000;  // the "3…2…1" tail shown at the END of the leaderboard beat
// A question object with its DISPLAY `points` scaled to match what's actually awarded —
// used in the quiz:joined snapshots so a reload mid-question shows the same big number
// students see on a fresh question. Handles both Mongoose subdocs and plain objects.
const scaledQuestion = (q) => ({ ...(q && q.toObject ? q.toObject() : q), points: scaledPoints(q) });

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
  socket.on('teacher:joinSession', async (data) => {
    const { sessionId } = data || {};
    if (!sessionId) return;
    socket.join(sessionId);
    console.log(`👨‍🏫 Teacher ${socket.userId} joined session room: ${sessionId}`);
    socket.emit('teacher:sessionJoined', { sessionId });

    // ✅ NEW (teacher spectator view): send the teacher the current question state, the
    // same shape students get from quiz:joined, so a teacher watching the live student
    // flow in spectator mode (QuizPlayer) syncs to the current question IMMEDIATELY on
    // (re)join — instead of a blank screen until the next room broadcast. Purely additive:
    // QuizControlPanel doesn't listen for quiz:joined, so it ignores this harmlessly.
    try {
      const session = await QuizSession.findById(sessionId).populate('quiz');
      if (!session || !session.quiz) return;
      let timeRemaining = 0;
      if (session.status === 'active') {
        const timerInfo = activeQuizTimers.get(sessionId);
        timeRemaining = timerInfo
          ? timerInfo.timeRemaining
          : (session.quiz.questions[session.currentQuestionIndex]?.timeLimit || 45);
      }
      socket.emit('quiz:joined', {
        sessionId,
        status:          session.status,
        totalQuestions:  session.quiz.questions.length,
        currentQuestion: session.status === 'active'
          ? { questionIndex: session.currentQuestionIndex, question: scaledQuestion(session.quiz.questions[session.currentQuestionIndex]) }
          : null,
        timeRemaining,
        teams:           session.teams || [],
        myTeamId:        null,          // teacher isn't on a team
        allowStudentChoice: session.sessionSettings?.allowStudentChoice !== false,
        quizMode:        session.sessionSettings?.quizMode || 'individual',
        spectator:       true
      });
    } catch (e) {
      console.error('teacher:joinSession state sync failed:', e.message);
    }
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
      let newlyAssigned = [];
      if (session.teams && session.teams.length > 0) {
        session.participants.forEach(p => {
          if (!p.teamId) { assignToSmallestTeam(session, p); newlyAssigned.push(p); }
        });
        teamRosterCounts = {};
        session.teams.forEach(t => { teamRosterCounts[t.teamId] = 0; });
        session.participants.forEach(p => {
          if (p.teamId) teamRosterCounts[p.teamId] = (teamRosterCounts[p.teamId] || 0) + 1;
        });
      }

      await session.save();

      // ✅ FIX (quiz lobby stuck-transition bug, root cause #2): this used to be a single
      // aggregate-only broadcast ({userId:null, teamId:null, teamRosterCounts}), so
      // QuizLobby's onTeamAssigned handler (which only sets myTeamId `if (data.userId)`)
      // never learned any auto-assigned student's own team — their Lobby→Player hand-off
      // gate (`teams.length === 0 || myTeamId`) then never passed, stranding them on the
      // Lobby screen forever even though the quiz had actually started. Emitting one
      // team:assigned per newly-auto-assigned student — same payload shape the manual
      // student:selectTeam path already sends — fixes this with zero client-side changes.
      if (teamRosterCounts) {
        newlyAssigned.forEach(p => {
          io.to(sessionId).emit('team:assigned', { userId: p.user.toString(), teamId: p.teamId, teamRosterCounts });
        });
        // Also cover the case where every participant already had a team picked manually
        // (newlyAssigned is empty) — still let everyone see the final roster counts.
        if (newlyAssigned.length === 0) {
          io.to(sessionId).emit('team:assigned', { userId: null, teamId: null, teamRosterCounts });
        }
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
          points:       scaledPoints(firstQuestion),
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
          points:       scaledPoints(nextQuestion),
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
      // ✅ FIX (quiz lobby stuck-transition bug, root cause #6): every student-facing
      // handler emits 'error' on failure; this one and endQuiz below only logged
      // server-side, so an exception here was completely invisible to the teacher's
      // UI — it would just silently fail to advance, looking identical to a stuck client.
      socket.emit('error', { message: 'Failed to advance to the next question' });
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
      await endQuickQuizGroupIfDone(session);

      const avatarByUserId = await buildAvatarLookup(session); // Milestone 8 (Leaderboard avatar display)
      const leaderboard = getLeaderboard(session, avatarByUserId);
      const teamLeaderboard = getTeamLeaderboard(session, session.quiz, avatarByUserId); // ✅ NEW (Phase 3) — [] in individual mode

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
      socket.emit('error', { message: 'Failed to end the quiz' });
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

      // ✅ FIX (quiz lobby stuck-transition bug, root cause #4): every other
      // student/teacher-facing handler in this file (teacher:startQuiz,
      // student:selectTeam, student:chooseCelebration) guards socket.userId before
      // using it — this one didn't. Without the guard, a join firing before the
      // 'authenticate' round-trip completes threw on socket.userId.toString() below,
      // caught by the outer catch — but socket.join(sessionId) (a few lines down)
      // already ran first, so the socket ended up IN the room without the server ever
      // recording that student as a participant. Guarding here gives a clear,
      // client-visible reason instead of a generic 'Failed to join quiz', and avoids
      // that partial-join state entirely.
      if (!socket.userId) {
        return socket.emit('error', { message: 'Not authenticated. Please refresh and try again.' });
      }

      console.log(`👤 Student ${socket.userId} joining quiz ${sessionId}`);

      let session = await QuizSession.findById(sessionId).populate('quiz');
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
      let userAvatar   = null; // Milestone 6 (Lobby avatar display)
      try {
        const userDoc = await User.findById(socket.userId).select('name username email avatar');
        if (userDoc) {
          userName     = userDoc.name || userDoc.username || userDoc.email?.split('@')[0] || 'Student';
          userUsername = userDoc.username || '';
          userAvatar   = userDoc.avatar || null;
        }
      } catch (e) {
        console.warn('Could not fetch user name for quiz join:', e.message);
      }

      // Check if student already in participants
      let participant = session.participants.find(
        p => p.user.toString() === socket.userId.toString()
      );

      if (!participant) {
        // ✅ FIX: this used to be a read-modify-write (push onto the in-memory array,
        // then .save()) — two 'student:joinQuiz' emits arriving close together (React
        // StrictMode's double-effect in dev, a reconnect, or the Lobby-then-QuizPlayer
        // double-join on hand-off) could both read the session before either saved,
        // each push their own copy, and the later .save() clobber the earlier one —
        // producing duplicate participant rows for the same user. The filter below
        // ('participants.user' $ne this user) makes the push atomic and conditional at
        // the database level, so only the first of any concurrent joins actually adds one.
        const pushResult = await QuizSession.findOneAndUpdate(
          { _id: sessionId, 'participants.user': { $ne: socket.userId } },
          { $push: { participants: {
              user:     socket.userId,
              name:     userName, // ✅ NEW — captured once here, reused by getLeaderboard() so
                                   // leaderboards can show real names instead of just points
              joinedAt: new Date(),
              answers:  [],
              score:    0,
              streak:   0
          } } },
          { new: true }
        ).populate('quiz');

        // If pushResult is null, someone else's concurrent join already added this
        // participant first — re-fetch to get the current (already-added) state.
        session = pushResult || await QuizSession.findById(sessionId).populate('quiz');
        participant = session.participants.find(
          p => p.user.toString() === socket.userId.toString()
        );

        // ✅ CHANGED (Phase 6 — Lobby): only auto-assign when this session doesn't let
        // students pick their own team at all (e.g. Random Teams mode). Late joiners in
        // a choice-allowed team quiz used to be silently auto-assigned here too — now
        // they're left unassigned and the Lobby shows them the team picker instead,
        // same as a pre-start joiner would see. Only the request that actually performed
        // the push (pushResult truthy) does the assignment, so a losing concurrent join
        // doesn't double-assign.
        if (pushResult && participant && !participant.teamId) {
          const noStudentChoice = session.sessionSettings?.allowStudentChoice === false;
          if (session.teams && session.teams.length > 0 && noStudentChoice) {
            assignToSmallestTeam(session, participant);
            await session.save();
          }
        }

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

      // Milestone 6 (Lobby avatar display)
      const avatarByUserId = await buildAvatarLookup(session);

      // Send current state to student
      socket.emit('quiz:joined', {
        sessionId,
        status:         session.status,
        totalQuestions: session.quiz.questions.length,
        currentQuestion: session.status === 'active'
          ? {
              questionIndex: session.currentQuestionIndex,
              question:      scaledQuestion(session.quiz.questions[session.currentQuestionIndex])
            }
          : null,
        // ✅ FIXED: actual timeRemaining, not hardcoded 30
        timeRemaining,
        // ✅ NEW (Phase 3): team context — empty array + null in individual mode
        teams:              session.teams || [],
        myTeamId:           participant.teamId || null,
        allowStudentChoice: session.sessionSettings?.allowStudentChoice !== false,
        // ✅ NEW: lets the Lobby show a read-only "Quiz Mode" label for students too
        quizMode:           session.sessionSettings?.quizMode || 'individual',
        // ✅ NEW (Phase 6 — Lobby): existing roster snapshot, so a freshly-joining
        // student can immediately see who's already here instead of only learning about
        // people who join AFTER them via the live 'student:joined' broadcast.
        participants: session.participants.map(p => ({
          userId: p.user, name: p.name || 'Student', teamId: p.teamId || null,
          avatar: avatarByUserId[p.user.toString()] || null // Milestone 6 (Lobby avatar display)
        }))
      });

      // ✅ CHANGED: emit 'student:joined' with real name (was 'participantJoined' without name)
      // QuizHost listens for 'student:joined' — this is what powers the real name display
      io.to(sessionId).emit('student:joined', {
        userId:       socket.userId,
        name:         userName,
        username:     userUsername,
        avatar:       userAvatar, // Milestone 6 (Lobby avatar display)
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
            points:       scaledPoints(currentQ),
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

      if (session.status === 'completed') {
        return socket.emit('error', { message: 'This quiz has already ended.' });
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

      // ✅ CHANGED: teams used to lock the moment status left 'waiting', which meant a
      // late joiner (quiz already active) could never pick a team at all — they'd get
      // silently auto-assigned instead. Now the lock only applies once THIS student
      // already has a team; a late joiner's first pick is still allowed, they just
      // can't switch teams after the quiz has started.
      if (session.status !== 'waiting' && participant.teamId) {
        return socket.emit('error', { message: 'Teams are locked — you already have a team for this quiz.' });
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
   * Milestone 11: top-3 finisher picks their celebration on the Final Results
   * podium. Only callable once the quiz is completed, and only by whoever's
   * CURRENT rank (recomputed here, not trusted from the client) is 1st/2nd/3rd.
   * Stored on the live session's participant subdoc (no race with
   * finalizeQuizSession's QuizResult creation, which reads it back off there),
   * then broadcast so the teacher and every other student see it update live.
   */
  socket.on('student:chooseCelebration', async (data) => {
    try {
      const { sessionId, emote } = data || {};
      if (!socket.userId) {
        return socket.emit('error', { message: 'Not authenticated. Please refresh and try again.' });
      }

      if (!ALLOWED_CELEBRATION_EMOTES.includes(emote)) {
        return socket.emit('error', { message: 'Invalid celebration.' });
      }

      const session = await QuizSession.findById(sessionId);
      if (!session) return socket.emit('error', { message: 'Session not found' });

      if (session.status !== 'completed') {
        return socket.emit('error', { message: 'The quiz has to finish before you can celebrate.' });
      }

      const participant = session.participants.find(
        p => p.user.toString() === socket.userId.toString()
      );
      if (!participant) {
        return socket.emit('error', { message: 'You did not participate in this quiz.' });
      }

      const rank = getLeaderboard(session).find(
        entry => entry.userId.toString() === socket.userId.toString()
      )?.rank;
      if (!rank || rank > 3) {
        return socket.emit('error', { message: 'Only the top 3 finishers choose a celebration.' });
      }

      participant.celebrationEmote = emote;
      await session.save();

      // Keep the permanent history record in sync too, if it already exists —
      // finalizeQuizSession may not have run yet (non-fatal if it hasn't; it'll
      // read the same value off this session's participant when it does).
      try {
        await QuizResult.updateOne(
          { session: sessionId, student: socket.userId },
          { $set: { celebrationEmote: emote } }
        );
      } catch (resultSyncError) {
        console.error('⚠️ QuizResult celebrationEmote sync failed (non-fatal):', resultSyncError.message);
      }

      io.to(sessionId).emit('celebration:chosen', { userId: socket.userId, emote });
      console.log(`🎉 Student ${socket.userId} chose celebration "${emote}" (rank #${rank}) in session ${sessionId}`);
    } catch (error) {
      console.error('❌ Choose celebration error:', error);
      socket.emit('error', { message: 'Failed to save your celebration' });
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

      const basePoints   = scaledPoints(question);
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

          // ✅ FIX: this used to mutate the in-memory participants array and .save() the
          // whole document — racing with handleQuestionComplete's own full-document save
          // when the timer expires at almost the same instant this answer arrives
          // (Mongoose VersionError, and worse, a silent lost-update since whichever save
          // landed second would overwrite the other's changes to the same array). Now an
          // atomic, conditional per-participant update: it only applies if this student
          // hasn't already got an entry for this question, so it can't collide with
          // handleQuestionComplete's own atomic "mark unanswered" write for anyone else.
          const updateResult = await QuizSession.updateOne(
            {
              _id: sessionId,
              'participants.user': socket.userId,
              'participants.answers.questionIndex': { $ne: questionIndex }
            },
            {
              $push: { 'participants.$.answers': { questionIndex, selectedAnswer, isCorrect, points, timeTaken, answeredAt: new Date() } },
              $inc:  { 'participants.$.score': points },
              $set:  { 'participants.$.streak': currentStreak }
            }
          );

          // Someone else (e.g. the timer's own auto-fill) already recorded an entry for
          // this question in the moment between our read and this write.
          // ✅ FIX (quiz lobby stuck-transition bug, root cause #5): this used to be a
          // bare `return` — the client's own submission is still sitting on a "waiting
          // for the server" state with no ack ever coming, since it lost this race.
          // Acknowledging anyway (flagged `late`) means the client never hangs; the
          // synchronized answer:summary reveal below is what shows the true recorded
          // answer to everyone regardless of which write actually won.
          if (updateResult.modifiedCount === 0) {
            socket.emit('student:answerReceived', { questionIndex, late: true });
            return;
          }

          // Keep the in-memory copy consistent for the rest of this handler (momentum calc below)
          session.participants[participantIndex].streak = currentStreak;
          session.participants[participantIndex].answers.push({
            questionIndex, selectedAnswer, isCorrect, points, timeTaken, answeredAt: new Date()
          });
          session.participants[participantIndex].score += points;

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
      } else {
        // ✅ FIX (quiz lobby stuck-transition bug, root cause #5): this used to be a
        // silent no-op — a student whose join never registered them as a participant
        // (e.g. student:joinQuiz raced ahead of authentication before the guard added
        // above existed) would submit an answer that vanished with zero feedback,
        // leaving their client waiting for an ack that would never come.
        socket.emit('error', { message: 'You are not registered for this quiz — please refresh and rejoin.' });
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
    let updatedSession = await QuizSession.findById(sessionId).populate('quiz');
    const question       = updatedSession.quiz.questions[questionIndex];

    const participantsWhoAnswered = updatedSession.participants.filter(
      p => p.answers.some(a => a.questionIndex === questionIndex)
    );

    // ✅ FIX: this used to mutate updatedSession's in-memory participants array and
    // .save() the whole document — racing with student:submitAnswer's own full-document
    // save when an answer lands right as the timer expires (Mongoose VersionError, and
    // worse, a silent lost-update where whichever save landed second could wipe out the
    // other's write to the same participants array). Now each "mark unanswered" write is
    // an atomic, conditional per-participant update — it only applies if that student
    // still hasn't answered this question by the time it runs, so it can never collide
    // with a real answer that was just recorded.
    const unanswered = updatedSession.participants.filter(
      p => !p.answers.some(a => a.questionIndex === questionIndex)
    );
    for (const participant of unanswered) {
      await QuizSession.updateOne(
        {
          _id: sessionId,
          'participants.user': participant.user,
          'participants.answers.questionIndex': { $ne: questionIndex }
        },
        {
          $push: { 'participants.$.answers': {
            questionIndex,
            selectedAnswer: null,
            isCorrect:      false,
            points:         0,
            timeTaken:      question.timeLimit || 45,
            answeredAt:     new Date()
          } },
          $set: { 'participants.$.streak': 0 }
        }
      );
    }

    // Re-fetch so every read below (and the further saves later in this function) sees
    // a fully consistent, up-to-date document.
    updatedSession = await QuizSession.findById(sessionId).populate('quiz');

    // ✅ NEW: computed once, up front, so every participant's personal reveal can be
    // stamped with their CURRENT rank (their previous rank is already sitting in the
    // client's own state from the last leaderboard:show — "rank movement" is a client-
    // side diff of the two, no extra persistence needed). Reused again below for the
    // leaderboard broadcast so it's only ever computed once per question.
    const avatarByUserId = await buildAvatarLookup(updatedSession); // Milestone 8 (Leaderboard avatar display)
    const rankLeaderboard = getLeaderboard(updatedSession, avatarByUserId);
    const rankByUserId = {};
    rankLeaderboard.forEach(entry => { rankByUserId[entry.userId.toString()] = entry.rank; });

    // ✅ NEW: computed once, up front, and reused by both the Question Summary
    // ("fastest correct answer") and the Leaderboard ("Question MVP") broadcasts below.
    const questionMVP = computeQuestionMVP(updatedSession, questionIndex);

    // ✅ NEW: reveal correct/wrong to EVERY participant at the same moment — when the
    // timer ends — instead of the old behavior where each student found out the
    // instant they personally submitted, before anyone else had even answered.
    const basePoints = scaledPoints(question);
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
        questionType:    question.questionType || 'multiple_choice',
        rank:            rankByUserId[participant.user.toString()] || null // ✅ NEW: rank movement
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

    // ✅ NEW: finalized question-cycle pacing —
    //   Correct/Wrong Feedback (shown now) → Question Summary → Leaderboard → Countdown → Next Question
    // Countdown itself is not a separate server event — the client shows a self-driven
    // "next question in Ns" transition for the known remaining delay below, then reacts
    // to the real quiz:nextQuestion/quiz:finished event exactly as it always has.
    setTimeout(() => {
      // ── Question Summary: educational beat, class-wide stats for this question ──
      const questionStats = computeQuestionStats(updatedSession, questionIndex, questionMVP);
      io.to(sessionId).emit('question:summary', { questionIndex, ...questionStats });

      setTimeout(() => {
        // ── Leaderboard: competitive beat, ranked list only (no podium/celebration —
        // that's reserved for the very end of the quiz) ──
        const teamLeaderboard = getTeamLeaderboard(updatedSession, updatedSession.quiz, avatarByUserId); // ✅ NEW (Phase 3)

        io.to(sessionId).emit('leaderboard:show', {
          leaderboard: rankLeaderboard,
          teamLeaderboard, // ✅ NEW (Phase 3)
          questionMVP, // ✅ NEW (Phase 5.2)
          questionIndex,
          isLastQuestion: questionIndex >= updatedSession.quiz.questions.length - 1,
          // ✅ how long until the next question fires — lets the client show the leaderboard
          // for most of it, then a short countdown tail, staying in sync with this timer.
          nextIn: LEADERBOARD_MS,
          countdownMs: COUNTDOWN_MS
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
                points:       scaledPoints(nextQuestion),
                questionType: nextQuestion.questionType || 'multiple_choice'
              },
              totalQuestions: updatedSession.quiz.questions.length
            });

            if (updatedSession.teams && updatedSession.teams.length > 0) {
              io.to(sessionId).emit('team:momentumUpdate', { teams: computeMomentum(updatedSession, updatedSession.quiz) });
            }

            console.log(`➡️ Auto-advanced to question ${nextIndex + 1}`);
          }, LEADERBOARD_MS); // leaderboard beat, then the next question
        } else {
          // Last question — end quiz
          setTimeout(async () => {
            // Mark session completed
            updatedSession.status = 'completed';
            await updatedSession.save();
            await endQuickQuizGroupIfDone(updatedSession);

            const finalLeaderboard = getLeaderboard(updatedSession, avatarByUserId);
            const finalTeamLeaderboard = getTeamLeaderboard(updatedSession, updatedSession.quiz, avatarByUserId); // ✅ NEW (Phase 3)
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
          }, LEADERBOARD_MS); // leaderboard beat, then finish
        }
      }, QUESTION_SUMMARY_MS); // Question Summary shown, then Leaderboard
    }, ANSWER_REVEAL_MS); // Answer Reveal (Correct/Wrong) shown, then Question Summary

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
function getTeamLeaderboard(session, quiz, avatarByUserId = {}) {
  if (!session.teams || session.teams.length === 0) return [];

  const maxPossibleScore = (quiz.getTotalPoints() * POINTS_MULTIPLIER) || 1;

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
        const basePoints = scaledPoints(q);
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
      members: members.map(p => ({
        userId: p.user, name: p.name || 'Student', score: p.score || 0,
        avatar: avatarByUserId[p.user.toString()] || null
      }))
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
 * ✅ NEW: per-question aggregate stats for the "Question Summary" beat — an educational
 * moment (class-wide performance on THIS question) shown before the competitive
 * Leaderboard, per the finalized question-cycle flow:
 *   Correct/Wrong Feedback → Question Summary → Leaderboard → Countdown → Next Question
 */
function computeQuestionStats(session, questionIndex, questionMVP) {
  const answers = session.participants
    .map(p => p.answers.find(a => a.questionIndex === questionIndex))
    .filter(Boolean);

  const totalAnswered  = answers.length;
  const correctCount   = answers.filter(a => a.isCorrect).length;
  const correctPercent = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
  const avgTimeTaken   = totalAnswered > 0
    ? Math.round(answers.reduce((sum, a) => sum + (a.timeTaken || 0), 0) / totalAnswered)
    : 0;

  // Team comparison — this question only, separate from the cumulative team leaderboard
  let teamComparison = [];
  if (session.teams && session.teams.length > 0) {
    teamComparison = session.teams.map(team => {
      const teamAnswers = session.participants
        .filter(p => p.teamId === team.teamId)
        .map(p => p.answers.find(a => a.questionIndex === questionIndex))
        .filter(Boolean);
      const teamCorrect = teamAnswers.filter(a => a.isCorrect).length;
      return {
        teamId:         team.teamId,
        name:           team.name,
        icon:           team.icon,
        color:          team.color,
        correctCount:   teamCorrect,
        totalCount:     teamAnswers.length,
        correctPercent: teamAnswers.length > 0 ? Math.round((teamCorrect / teamAnswers.length) * 100) : 0
      };
    });
  }

  return {
    correctPercent,
    avgTimeTaken,
    // "Fastest correct answer" reuses the MVP calc (highest points, fastest-time
    // tiebreak) — since this scoring system awards more points for faster correct
    // answers, the MVP is already effectively the fastest correct answerer.
    fastestCorrect: questionMVP ? { name: questionMVP.name, timeTaken: questionMVP.timeTaken } : null,
    teamComparison
  };
}

/**
 * Milestone 6/8 (Lobby/Leaderboard avatar display): batch-fetch every participant's
 * avatar in one query, keyed by userId string. Kept separate from populating
 * session.participants.user directly — several call sites compare p.user.toString()
 * against socket.userId, which needs p.user to stay a raw ObjectId, not a populated
 * subdocument.
 */
async function buildAvatarLookup(session) {
  const participantUserIds = session.participants.map(p => p.user);
  const avatarDocs = await User.find({ _id: { $in: participantUserIds } }).select('avatar');
  const avatarByUserId = {};
  avatarDocs.forEach(u => { avatarByUserId[u._id.toString()] = u.avatar; });
  return avatarByUserId;
}

/**
 * Generate leaderboard — ✅ CHANGED (Milestone 8): optional avatarByUserId map (from
 * buildAvatarLookup) attaches each entry's real avatar data for the Leaderboard's
 * avatar display; defaults to {} so internal/aggregate-only callers are unaffected.
 */
function getLeaderboard(session, avatarByUserId = {}) {
  return session.participants
    .map(p => ({
      userId:         p.user,
      name:           p.name || 'Student', // ✅ NEW — captured once at join time (see student:joinQuiz)
      score:          p.score,
      correctAnswers: p.answers.filter(a => a.isCorrect).length,
      totalAnswers:   p.answers.length,
      streak:         p.streak || 0,
      avatar:         avatarByUserId[p.user.toString()] || null,
      celebrationEmote: p.celebrationEmote || null // Milestone 11
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

    const maxScore = quiz.getTotalPoints() * POINTS_MULTIPLIER;
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
          teamId: participant.teamId || null, // ✅ NEW (Phase 3) — null in individual mode
          celebrationEmote: participant.celebrationEmote || null // Milestone 11
        });

        result.calculateMetrics();
        result.assignBadge(participantsWithAnswers.length);
        await result.save();
        resultsCreated++;
        resultsForAwards.push({ result, name: participant.name || 'Student' });

        // Milestone 9 (Rewards Locker): a rank-1 finish earns the 'champion' badge —
        // synced onto the avatar so it's visible everywhere a badge pip already renders
        // (Chat, Lobby, Leaderboard, Profile) without needing a new game mechanic.
        if (result.badge === 'gold') {
          try {
            await User.findByIdAndUpdate(participant.user, { $addToSet: { 'avatar.badges': 'champion' } });
          } catch (badgeSyncError) {
            console.error('⚠️ champion badge sync failed (non-fatal):', badgeSyncError.message);
          }
        }

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
              // Milestone 9 (Rewards Locker): sync onto the avatar too
              await User.findByIdAndUpdate(award.userId, { $addToSet: { 'avatar.badges': award.type } });
            } else if (award.teamId) {
              const teamMembers = resultsForAwards.filter(({ result }) => result.teamId === award.teamId);
              for (const { result: r } of teamMembers) {
                r.awardsEarned.push(award.type); await r.save();
                await User.findByIdAndUpdate(r.student, { $addToSet: { 'avatar.badges': award.type } });
              }
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
        sender:      session.host,
        messageType: 'quiz_started',
        content:     `📝 Quiz Started: ${session.quiz.title}\n\nJoin now!`,
        metadata:    { quizId: session.quiz._id, sessionId: session._id }
      });
      await message.populate('sender', 'username name isOnline avatar');
      io.to(groupId.toString()).emit('newMessage', { message });

    } else if (type === 'quiz_ended') {
      if (!leaderboard || leaderboard.length === 0) return;
      const winner     = leaderboard[0];
      const winnerUser = await User.findById(winner.userId);

      const message = await Message.create({
        group:       groupId,
        sender:      session.host,
        messageType: 'quiz_ended',
        content:     `🎉 Quiz completed!\n🏆 ${winnerUser?.name || 'Winner'}: ${winner.score} pts`,
        metadata:    {
          quizId:      session.quiz._id,
          sessionId:   session._id,
          winnerId:    winner.userId,
          winnerScore: winner.score
        }
      });
      await message.populate('sender', 'username name isOnline avatar');
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