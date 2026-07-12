// frontend/src/components/QuizHost.jsx
// ✅ CHANGES:
// 1. Listen for 'student:joined' (was broken — backend now also fixed to emit this)
// 2. Store real student name in state (sent from backend)
// 3. Display real name instead of "Student {userId.substring(0,6)}"
// 4. REMOVED "Finish Quiz" button — last question footer now shows "End Quiz" same as header
//    (End Quiz ends + auto-saves to history via server)
// 5. Finished view: added "🔄 Create Again Quiz" button (calls onCreateAgain prop if provided)
// 6. Active view: added per-question leaderboard flash + final leaderboard with names
// 7. Active view: header "End Quiz" (duplicated the footer one) replaced with Minimize +
//    real browser Fullscreen toggle; footer "Minimize" removed (now lives in the header)
// 8. ALL other logic — timer, next question, start quiz — IDENTICAL

import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket';

// ✅ NEW (Phase 2): display metadata for each award type — icon + label only,
// the actual winner/value comes from the server (quiz:awardsRevealed).
const AWARD_META = {
  fastestThinker: { icon: '⚡', label: 'Fastest Thinker' },
  bestAccuracy:   { icon: '🎯', label: 'Best Accuracy' },
  longestStreak:  { icon: '🔥', label: 'Longest Streak' },
  mostImproved:   { icon: '📈', label: 'Most Improved' }
};

const QuizHost = ({ quiz, sessionId, onClose, onCreateAgain }) => {
  const [currentView, setCurrentView] = useState('preview'); // preview, active, finished
  // ✅ CHANGED: students now store { userId, name, answered } — name is real name from DB
  const [students, setStudents] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  // ✅ NEW: teacher now sees the same leaderboard students see — was never wired up before.
  // leaderboard = the latest list from the server; showLeaderboardFlash = whether the brief
  // "who's leading" panel is currently visible (auto-hides when the next question starts).
  const [leaderboard, setLeaderboard] = useState([]);
  const [showLeaderboardFlash, setShowLeaderboardFlash] = useState(false);
  // ✅ NEW (Phase 3 — TEAM_MODE_DESIGN.md §4/§5): team-grouped leaderboard, shown instead
  // of the flat list whenever non-empty (individual mode: always [])
  const [teamLeaderboard, setTeamLeaderboard] = useState([]);
  // ✅ NEW (Phase 5.3): live team momentum, empty in individual mode
  const [momentum, setMomentum] = useState([]);
  // ✅ NEW (Phase 5.4): top scorer for the question that just ended
  const [questionMVP, setQuestionMVP] = useState(null);
  // ✅ NEW (Phase 2 — TEAM_MODE_DESIGN.md): end-of-quiz awards, same data the students see
  const [awards, setAwards] = useState([]);

  // ✅ NEW: real browser fullscreen toggle (replaces the header's duplicate "End Quiz").
  // fullscreenRef targets the whole overlay (backdrop + card), not just the card, so the
  // browser's fullscreen view doesn't show anything but the quiz. isFullscreen is kept in
  // sync via the 'fullscreenchange' event so it's correct even if a desktop teacher exits
  // with Esc instead of clicking the button.
  const fullscreenRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      fullscreenRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  };

  // ========================================
  // SOCKET EVENT LISTENERS
  // ========================================

  useEffect(() => {
    if (!socket.connected) socket.connect();

    // Join the quiz session socket room so teacher receives all session events
    socket.emit('teacher:joinSession', { sessionId });

    // ✅ CHANGED: was 'student:joined', backend was emitting 'participantJoined' — now both fixed
    // Backend now emits 'student:joined' with { userId, name } so real name shows up
    socket.on('student:joined', (data) => {
      console.log('👤 Student joined:', data.name || data.userId);
      setStudents(prev => {
        if (prev.find(s => s.userId === data.userId)) return prev;
        return [...prev, {
          userId: data.userId,
          // ✅ CHANGED: use real name from event, fallback to short ID if missing
          name: data.name || data.username || `Student ${String(data.userId).substring(0, 6)}`,
          answered: false,
          score: 0
        }];
      });
    });

    // Listen for student answered — UNCHANGED
    socket.on('student:answered', (data) => {
      console.log('✅ Student answered');
      setAnsweredCount(data.answeredCount);
      setStudents(prev => prev.map(s =>
        s.userId === data.userId ? { ...s, answered: true } : s
      ));
    });

    // Listen for timer updates from server — UNCHANGED
    socket.on('timer:update', (data) => {
      setTimeRemaining(data.timeRemaining);
    });

    // Listen for quiz started confirmation — UNCHANGED
    socket.on('quiz:started', (data) => {
      console.log('🚀 Quiz started');
      setCurrentView('active');
      setCurrentQuestionIndex(0);
      setTimeRemaining(data.question.timeLimit || 45);
      setAnsweredCount(0);
    });

    // Listen for next question — UNCHANGED, plus hide the leaderboard flash so it doesn't
    // linger on top of the new question
    socket.on('quiz:nextQuestion', (data) => {
      console.log('➡️ Next question');
      setCurrentQuestionIndex(data.questionIndex);
      setTimeRemaining(data.question.timeLimit || 45);
      setAnsweredCount(0);
      setStudents(prev => prev.map(s => ({ ...s, answered: false })));
      setShowLeaderboardFlash(false);
    });

    // ✅ NEW: teacher now receives the same 'leaderboard:show' event students already get
    // after every question (previously not listened for at all — teacher never saw it)
    socket.on('leaderboard:show', (data) => {
      console.log('🏆 Leaderboard (teacher view)');
      setLeaderboard(data.leaderboard || []);
      setTeamLeaderboard(data.teamLeaderboard || []); // ✅ NEW (Phase 3)
      setQuestionMVP(data.questionMVP || null); // ✅ NEW (Phase 5.4)
      setShowLeaderboardFlash(true);
    });

    // ✅ NEW (Phase 5.1): live team momentum bar, recomputed after every answer and
    // at the start of every question
    socket.on('team:momentumUpdate', (data) => {
      setMomentum(data.teams || []);
    });

    // ✅ CHANGED: also handle 'quiz:finished' (sent by auto-complete) AND 'quiz:ended' (teacher end)
    // Backend teacher:endQuiz now emits 'quiz:finished' — this handles both paths
    // ✅ NEW: also capture the final leaderboard payload — previously discarded entirely
    socket.on('quiz:finished', (data) => {
      console.log('🏁 Quiz finished');
      if (data?.leaderboard) setLeaderboard(data.leaderboard);
      setTeamLeaderboard(data?.teamLeaderboard || []); // ✅ NEW (Phase 3)
      setShowLeaderboardFlash(false);
      setCurrentView('finished');
    });

    // ✅ NEW (Phase 2): arrives a moment after quiz:finished, once results are saved
    socket.on('quiz:awardsRevealed', (data) => {
      console.log('🏅 Awards revealed:', data.awards);
      setAwards(data.awards || []);
    });

    socket.on('error', (data) => {
      console.error('❌ Error:', data.message);
      alert(data.message);
    });

    return () => {
      socket.off('student:joined');
      socket.off('student:answered');
      socket.off('timer:update');
      socket.off('quiz:started');
      socket.off('quiz:nextQuestion');
      socket.off('leaderboard:show');
      socket.off('team:momentumUpdate');
      socket.off('quiz:finished');
      socket.off('quiz:awardsRevealed');
      socket.off('error');
    };
  }, [sessionId]);

  // ========================================
  // HANDLERS
  // ========================================

  const handleStartQuiz = () => {
    if (students.length === 0) {
      if (!window.confirm('No students have joined yet. Start anyway?')) return;
    }
    socket.emit('teacher:startQuiz', { sessionId });
  };

  const handleNextQuestion = () => {
    socket.emit('teacher:nextQuestion', { sessionId });
  };

  // ✅ CHANGED: Single "End Quiz" handler — used for BOTH header button AND last-question footer
  // Ends quiz + server auto-saves to history
  const handleEndQuiz = () => {
    if (!window.confirm('End the quiz? Results will be saved to history automatically.')) return;
    socket.emit('teacher:endQuiz', { sessionId });
  };

  // ✅ NEW: "Create Again Quiz" — calls onCreateAgain prop if provided by App.js
  const handleCreateAgain = () => {
    onCreateAgain ? onCreateAgain() : onClose();
  };

  // ✅ NEW: the server now sends a real name on every leaderboard entry (entry.name).
  // This is a fallback for older cached data only — looks up the name we tracked
  // locally from 'student:joined' in case entry.name is ever missing.
  const getStudentName = (userId) => {
    const match = students.find(s => String(s.userId) === String(userId));
    return match?.name || 'Student';
  };

  // ========================================
  // VIEW RENDERERS
  // ========================================

  const currentQuestion = quiz?.questions[currentQuestionIndex];
  const totalQuestions = quiz?.questions.length || 0;

  // ── PREVIEW VIEW ──
  if (currentView === 'preview') {
    return (
      <div style={styles.overlay}>
        <div style={styles.modal}>
          <div style={styles.header}>
            <div>
              <h2 style={styles.title}>🎮 Quiz Control Panel</h2>
              <p style={styles.subtitle}>{quiz?.title}</p>
            </div>
            <button onClick={onClose} style={styles.closeBtn}>✕</button>
          </div>

          <div style={styles.content}>
            <div style={styles.infoCard}>
              <div style={styles.infoItem}>
                <div style={styles.infoNumber}>{totalQuestions}</div>
                <div style={styles.infoLabel}>Questions</div>
              </div>
              <div style={styles.infoItem}>
                <div style={styles.infoNumber}>{students.length}</div>
                <div style={styles.infoLabel}>Students Waiting</div>
              </div>
              <div style={styles.infoItem}>
                <div style={styles.infoNumber}>
                  {quiz?.questions.reduce((sum, q) => sum + (q.points || 10), 0)}
                </div>
                <div style={styles.infoLabel}>Total Points</div>
              </div>
            </div>

            {/* Waiting Students */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>👥 Waiting Students ({students.length})</h3>
              {students.length === 0 ? (
                <div style={styles.emptyState}>
                  <div style={styles.emptyIcon}>🎯</div>
                  <p style={styles.emptyText}>No students yet</p>
                  <p style={styles.emptySubtext}>Students can join using the FloatingQuizButton</p>
                </div>
              ) : (
                <div style={styles.studentGrid}>
                  {students.map((student, index) => (
                    <div key={index} style={styles.studentChip}>
                      <div style={styles.studentAvatar}>
                        {/* ✅ CHANGED: avatar letter from real name */}
                        {(student.name || 'S').charAt(0).toUpperCase()}
                      </div>
                      {/* ✅ CHANGED: show real name */}
                      <span style={styles.studentName}>{student.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Questions Preview — IDENTICAL */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>📝 Questions Preview</h3>
              <div style={styles.questionsList}>
                {quiz?.questions.map((q, index) => (
                  <div key={index} style={styles.questionPreview}>
                    <div style={styles.questionPreviewNumber}>Q{index + 1}</div>
                    <div style={styles.questionPreviewText}>
                      {q.questionText.substring(0, 60)}...
                    </div>
                    <div style={styles.questionPreviewMeta}>
                      <span style={styles.questionPreviewTime}>⏱️ {q.timeLimit || 45}s</span>
                      <span style={styles.questionPreviewPoints}>{q.points || 10} pts</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={styles.footer}>
            <button onClick={onClose} style={styles.cancelBtn}>Cancel</button>
            <button onClick={handleStartQuiz} style={styles.startBtn}>🚀 Start Quiz Now</button>
          </div>
        </div>
      </div>
    );
  }

  // ── ACTIVE VIEW ──
  if (currentView === 'active') {
    const progressPercent = ((currentQuestionIndex + 1) / totalQuestions) * 100;

    return (
      <div style={styles.overlay} ref={fullscreenRef}>
        <div style={styles.modalActive}>
          {/* ✅ NEW: brief "who's leading" panel — mirrors what students see after each question.
              Appears when the server sends leaderboard:show, disappears when the next question starts. */}
          {showLeaderboardFlash && (
            <div style={styles.leaderboardFlash}>
              <div style={styles.leaderboardFlashHeader}>🏆 Leaderboard</div>
              {/* ✅ NEW (Phase 5.4): top scorer for the question that just ended */}
              {questionMVP && (
                <div style={styles.questionMvpFlash}>
                  ⭐ MVP: <strong>{questionMVP.name}</strong> (+{questionMVP.points})
                </div>
              )}
              <div style={styles.leaderboardFlashList}>
                {/* ✅ NEW (Phase 3): team mode shows team averages here instead of
                    individual rows — compact panel, so no nested member list */}
                {teamLeaderboard.length > 0 ? (
                  teamLeaderboard.map((team) => (
                    <div key={team.teamId} style={styles.leaderboardFlashItem}>
                      <span style={styles.leaderboardFlashRank}>#{team.rank}</span>
                      <span style={styles.leaderboardFlashName}>{team.icon} {team.name}</span>
                      <span style={styles.leaderboardFlashScore}>{team.averageScore} avg</span>
                    </div>
                  ))
                ) : (
                  <>
                    {leaderboard.slice(0, 5).map((entry) => (
                      <div key={entry.userId} style={styles.leaderboardFlashItem}>
                        <span style={styles.leaderboardFlashRank}>#{entry.rank}</span>
                        <span style={styles.leaderboardFlashName}>{entry.name || getStudentName(entry.userId)}</span>
                        <span style={styles.leaderboardFlashScore}>{entry.score} pts</span>
                      </div>
                    ))}
                    {leaderboard.length === 0 && (
                      <div style={styles.leaderboardFlashEmpty}>No answers yet</div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Header */}
          <div style={styles.headerActive}>
            <div>
              <h2 style={styles.titleActive}>🎮 Live Quiz</h2>
              <div style={styles.progressBar}>
                <div style={{ ...styles.progressFill, width: `${progressPercent}%` }}></div>
              </div>
              <p style={styles.progressText}>
                Question {currentQuestionIndex + 1} of {totalQuestions}
              </p>
              {/* ✅ NEW (Phase 5.3): live team momentum bar, empty in individual mode */}
              {momentum.length > 0 && (
                <div style={styles.momentumBar}>
                  {momentum.map((team) => (
                    <div
                      key={team.teamId}
                      style={{
                        ...styles.momentumSegment,
                        width: `${team.percentage}%`,
                        backgroundColor: team.color || '#10B981'
                      }}
                      title={`${team.icon || ''} ${team.name}: ${team.percentage}%`}
                    >
                      {team.percentage >= 12 && (
                        <span style={styles.momentumLabel}>{team.icon} {team.percentage}%</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={styles.headerControls}>
              {/* Timer — color turns red when ≤10s */}
              <div style={{
                ...styles.timerDisplay,
                backgroundColor: timeRemaining <= 10 ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.2)'
              }}>
                <div style={styles.timerIcon}>⏱️</div>
                {/* ✅ FIXED: was showing raw number, now clearly shows Xs format */}
                <div style={{
                  ...styles.timerText,
                  color: timeRemaining <= 10 ? '#FCA5A5' : 'white'
                }}>
                  {timeRemaining}s
                </div>
              </div>
              {/* ✅ CHANGED: the header used to have its own "End Quiz" button, duplicating
                  the one in the footer (visible at the same time on the last question).
                  Replaced with minimize (steps away without ending the quiz — same as the
                  old footer "Minimize" button, just relocated) and a fullscreen toggle.
                  Ending the quiz now only happens via the single footer button. */}
              <button onClick={onClose} style={styles.iconBtn} title="Minimize">
                🗕
              </button>
              <button onClick={toggleFullscreen} style={styles.iconBtn} title={isFullscreen ? 'Exit Full Screen' : 'Full Screen'}>
                {isFullscreen ? '🗗' : '⛶'}
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div style={styles.contentActive}>
            {/* Left: Current Question — IDENTICAL */}
            <div style={styles.leftPanel}>
              <div style={styles.currentQuestionCard}>
                <div style={styles.currentQuestionHeader}>
                  <span style={styles.currentQuestionBadge}>
                    Question {currentQuestionIndex + 1}
                  </span>
                  <span style={styles.currentQuestionPoints}>
                    {currentQuestion?.points || 10} points
                  </span>
                </div>
                <h3 style={styles.currentQuestionText}>{currentQuestion?.questionText}</h3>
                <div style={styles.currentOptions}>
                  {(currentQuestion?.options || []).map((option, index) => {
                    // Handle correctAnswer as number, string letter ("A"), or full text
                    let isCorrect = false;
                    const ca = currentQuestion.correctAnswer;
                    if (typeof ca === 'number') isCorrect = index === ca;
                    else if (typeof ca === 'string' && ca.length === 1 && ca >= 'A' && ca <= 'Z') {
                      isCorrect = index === (ca.charCodeAt(0) - 65);
                    } else if (typeof ca === 'string') {
                      isCorrect = option === ca;
                    }

                    return (
                      <div key={index} style={{
                        ...styles.currentOption,
                        backgroundColor: isCorrect ? '#E8F5E9' : '#f9f9f9',
                        border: isCorrect ? '3px solid #4CAF50' : '2px solid #e0e0e0'
                      }}>
                        <div style={styles.currentOptionLetter}>
                          {String.fromCharCode(65 + index)}
                        </div>
                        <div style={styles.currentOptionText}>{option}</div>
                        {isCorrect && <div style={styles.correctIndicator}>✓ Correct</div>}
                      </div>
                    );
                  })}
                </div>
                {currentQuestion?.explanation && (
                  <div style={styles.explanationCard}>
                    <div style={styles.explanationTitle}>💡 Explanation:</div>
                    <p style={styles.explanationText}>{currentQuestion.explanation}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Student Progress */}
            <div style={styles.rightPanel}>
              <div style={styles.progressCard}>
                <h3 style={styles.progressTitle}>📊 Student Progress</h3>
                <div style={styles.statsRow}>
                  <div style={styles.statBox}>
                    <div style={styles.statNumber}>{students.length}</div>
                    <div style={styles.statLabel}>Waiting</div>
                  </div>
                  <div style={styles.statBox}>
                    <div style={styles.statNumber}>{students.filter(s => s.answered).length}</div>
                    <div style={styles.statLabel}>Active</div>
                  </div>
                  <div style={styles.statBox}>
                    <div style={styles.statNumber}>{answeredCount}</div>
                    <div style={styles.statLabel}>Answered</div>
                  </div>
                </div>

                {/* Answer progress bar */}
                <div style={styles.answerProgress}>
                  <div style={{
                    ...styles.answerProgressFill,
                    width: students.length > 0
                      ? `${(answeredCount / students.length) * 100}%` : '0%'
                  }}></div>
                </div>
                <p style={styles.answerProgressText}>
                  {students.length > 0
                    ? Math.round((answeredCount / students.length) * 100) : 0}% answered
                </p>

                {/* ✅ CHANGED: Student list shows real names */}
                <div style={styles.studentListActive}>
                  {students.map((student, index) => (
                    <div key={index} style={styles.studentItemActive}>
                      <div style={{
                        ...styles.studentStatusDot,
                        backgroundColor: student.answered ? '#4CAF50' : '#FF9800'
                      }}></div>
                      {/* ✅ CHANGED: real name display */}
                      <span style={styles.studentNameActive}>{student.name}</span>
                      {student.answered && <span style={styles.studentAnsweredBadge}>✓</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Footer Controls */}
          {/* ✅ CHANGED: "Minimize" removed from here — it now lives as an icon in the
              header (next to the fullscreen toggle) instead of duplicating that action */}
          <div style={styles.footerActive}>
            {currentQuestionIndex < totalQuestions - 1 ? (
              <button onClick={handleNextQuestion} style={styles.nextBtn}>
                Next Question →
              </button>
            ) : (
              // ✅ CHANGED: Was "🏁 Finish Quiz" — now "🔴 End Quiz" (same handler, same outcome)
              // No separate "Finish Quiz" — End Quiz always ends + saves to history
              <button onClick={handleEndQuiz} style={styles.endQuizLastBtn}>
                🔴 End Quiz
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── FINISHED VIEW ──
  if (currentView === 'finished') {
    return (
      <div style={styles.overlay}>
        <div style={styles.modal}>
          <div style={styles.finishedCard}>
            <div style={styles.finishedIcon}>🎉</div>
            <h2 style={styles.finishedTitle}>Quiz Complete!</h2>
            <p style={styles.finishedText}>
              Results have been saved to history automatically.
            </p>

            {/* ✅ NEW: final class leaderboard — was completely missing before, teacher saw
                no results at all when a quiz ended. A fancier podium/1st-2nd-3rd visual is a
                future polish pass; this is the working data version.
                ✅ NEW (Phase 3): team mode shows team cards with members nested underneath
                instead of the flat individual list — same scores, grouped presentation. */}
            {teamLeaderboard.length > 0 ? (
              <div style={styles.finalLeaderboardSection}>
                <h3 style={styles.finalLeaderboardTitle}>🏆 Final Leaderboard</h3>
                <div style={styles.finalLeaderboardList}>
                  {teamLeaderboard.map((team) => (
                    <div key={team.teamId} style={styles.teamFinalCard}>
                      <div style={styles.teamFinalHeader}>
                        <span style={styles.finalLeaderboardRank}>#{team.rank}</span>
                        <span style={styles.teamFinalIcon}>{team.icon}</span>
                        <span style={styles.finalLeaderboardName}>{team.name}</span>
                        <span style={styles.finalLeaderboardScore}>{team.averageScore} avg</span>
                      </div>
                      <div style={styles.teamFinalMembers}>
                        {team.members.map((m) => (
                          <div key={m.userId} style={styles.teamFinalMemberRow}>
                            <span>{m.name || getStudentName(m.userId)}</span>
                            <span>{m.score} pts</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : leaderboard.length > 0 && (
              <div style={styles.finalLeaderboardSection}>
                <h3 style={styles.finalLeaderboardTitle}>🏆 Final Leaderboard</h3>
                <div style={styles.finalLeaderboardList}>
                  {leaderboard.map((entry) => (
                    <div key={entry.userId} style={styles.finalLeaderboardItem}>
                      <span style={styles.finalLeaderboardRank}>#{entry.rank}</span>
                      <span style={styles.finalLeaderboardName}>{entry.name || getStudentName(entry.userId)}</span>
                      <span style={styles.finalLeaderboardScore}>{entry.score} pts</span>
                      <span style={styles.finalLeaderboardMeta}>
                        {entry.correctAnswers}/{entry.totalAnswers} correct
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ✅ NEW (Phase 2): Class Highlights — same awards students see. Doesn't
                render an award that has no eligible winner (e.g. no quiz history yet
                for "Most Improved") rather than showing an empty slot. */}
            {awards.length > 0 && (
              <div style={styles.awardsCard}>
                <h3 style={styles.finalLeaderboardTitle}>🏅 Class Highlights</h3>
                <div style={styles.awardsList}>
                  {awards.map((award, i) => {
                    const meta = AWARD_META[award.type] || { icon: '🏅', label: award.type };
                    return (
                      <div key={i} style={styles.awardItem}>
                        <span style={styles.awardIcon}>{meta.icon}</span>
                        <div style={styles.awardInfo}>
                          <div style={styles.awardLabel}>{meta.label}</div>
                          <div style={styles.awardWinner}>{award.name} — {award.value}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={styles.finishedActions}>
              {/* ✅ NEW: "Create Again Quiz" — helps teacher re-run quiz for better learning */}
              <button onClick={handleCreateAgain} style={styles.createAgainBtn}>
                🔄 Create Again Quiz
              </button>
              {/* Close without creating */}
              <button onClick={onClose} style={styles.doneBtn}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

// ========================================
// STYLES — All existing styles preserved, new ones added
// ========================================

const styles = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '20px'
  },
  modal: {
    backgroundColor: 'white', borderRadius: '16px', width: '100%', maxWidth: '900px',
    maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
  },
  modalActive: {
    backgroundColor: 'white', borderRadius: '16px', width: '100%', maxWidth: '1200px',
    maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)', position: 'relative'
  },

  // ✅ NEW: per-question leaderboard flash (teacher view)
  leaderboardFlash: {
    position: 'absolute', top: '90px', right: '25px', width: '260px', zIndex: 10,
    backgroundColor: 'white', borderRadius: '12px', border: '2px solid #4F46E5',
    boxShadow: '0 8px 24px rgba(0,0,0,0.18)', overflow: 'hidden'
  },
  leaderboardFlashHeader: {
    padding: '10px 16px', backgroundColor: '#4F46E5', color: 'white',
    fontSize: '14px', fontWeight: '700'
  },
  leaderboardFlashList: { padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' },
  leaderboardFlashItem: {
    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
    borderRadius: '8px', backgroundColor: '#F9FAFB', fontSize: '13px'
  },
  leaderboardFlashRank: { fontWeight: '700', color: '#4F46E5', minWidth: '22px' },
  leaderboardFlashName: { flex: 1, fontWeight: '600', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  leaderboardFlashScore: { fontWeight: '700', color: '#10B981' },
  leaderboardFlashEmpty: { padding: '12px', fontSize: '13px', color: '#9CA3AF', textAlign: 'center' },
  // ✅ NEW (Phase 5.4): MVP line inside the leaderboard flash panel
  questionMvpFlash: { padding: '8px 16px', backgroundColor: '#FFF7E6', color: '#92400E', fontSize: '12px', fontWeight: '600', borderBottom: '1px solid #FFD580' },
  // ✅ NEW (Phase 5.3): live momentum bar (teacher header)
  momentumBar: { display: 'flex', width: '300px', height: '10px', borderRadius: '6px', overflow: 'hidden', marginTop: '6px', backgroundColor: 'rgba(255,255,255,0.3)' },
  momentumSegment: { display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'width 0.6s ease', minWidth: '2%' },
  momentumLabel: { fontSize: '9px', fontWeight: '700', color: 'white', whiteSpace: 'nowrap' },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '25px 30px', borderBottom: '2px solid #f0f0f0', backgroundColor: '#4F46E5'
  },
  title: { fontSize: '24px', fontWeight: '700', color: 'white', margin: 0 },
  subtitle: { fontSize: '14px', color: '#E0E7FF', margin: '5px 0 0 0' },
  closeBtn: { background: 'none', border: 'none', fontSize: '28px', color: 'white', cursor: 'pointer', padding: '0 10px' },
  content: { flex: 1, overflowY: 'auto', padding: '30px' },
  infoCard: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' },
  infoItem: { textAlign: 'center', padding: '25px', backgroundColor: '#F9FAFB', borderRadius: '12px', border: '2px solid #E5E7EB' },
  infoNumber: { fontSize: '36px', fontWeight: '700', color: '#4F46E5', marginBottom: '8px' },
  infoLabel: { fontSize: '14px', fontWeight: '600', color: '#6B7280' },
  section: { marginBottom: '30px' },
  sectionTitle: { fontSize: '18px', fontWeight: '700', color: '#1F2937', marginBottom: '15px' },
  emptyState: { textAlign: 'center', padding: '50px 20px', backgroundColor: '#F9FAFB', borderRadius: '12px', border: '2px dashed #E5E7EB' },
  emptyIcon: { fontSize: '48px', marginBottom: '15px' },
  emptyText: { fontSize: '18px', fontWeight: '600', color: '#374151', marginBottom: '8px' },
  emptySubtext: { fontSize: '14px', color: '#6B7280', margin: 0 },
  studentGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' },
  studentChip: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: '#F9FAFB', borderRadius: '10px', border: '2px solid #E5E7EB' },
  studentAvatar: { width: '38px', height: '38px', borderRadius: '50%', backgroundColor: '#4F46E5', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700' },
  studentName: { fontSize: '14px', fontWeight: '600', color: '#374151' },
  questionsList: { display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto' },
  questionPreview: { display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', backgroundColor: '#F9FAFB', borderRadius: '10px', border: '1px solid #E5E7EB' },
  questionPreviewNumber: { padding: '8px 14px', backgroundColor: '#4F46E5', color: 'white', borderRadius: '8px', fontSize: '13px', fontWeight: '700', flexShrink: 0 },
  questionPreviewText: { flex: 1, fontSize: '14px', color: '#374151', fontWeight: '500' },
  questionPreviewMeta: { display: 'flex', gap: '10px', flexShrink: 0 },
  questionPreviewTime: { fontSize: '12px', color: '#6B7280', fontWeight: '600' },
  questionPreviewPoints: { fontSize: '12px', color: '#10B981', fontWeight: '700' },
  footer: { display: 'flex', justifyContent: 'space-between', padding: '25px 30px', borderTop: '2px solid #f0f0f0' },
  cancelBtn: { padding: '14px 28px', fontSize: '15px', fontWeight: '600', backgroundColor: '#F3F4F6', color: '#374151', border: 'none', borderRadius: '10px', cursor: 'pointer' },
  startBtn: { padding: '14px 32px', fontSize: '15px', fontWeight: '700', backgroundColor: '#10B981', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' },

  // Active header
  headerActive: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 30px', borderBottom: '2px solid #f0f0f0', backgroundColor: '#4F46E5' },
  titleActive: { fontSize: '22px', fontWeight: '700', color: 'white', margin: '0 0 10px 0' },
  progressBar: { width: '300px', height: '8px', backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: '10px', overflow: 'hidden', marginBottom: '5px' },
  progressFill: { height: '100%', backgroundColor: '#10B981', transition: 'width 0.3s ease' },
  progressText: { fontSize: '13px', color: '#E0E7FF', margin: 0 },
  headerControls: { display: 'flex', alignItems: 'center', gap: '10px' },
  timerDisplay: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 20px', borderRadius: '25px', transition: 'background-color 0.3s' },
  timerIcon: { fontSize: '20px' },
  timerText: { fontSize: '20px', fontWeight: '700', transition: 'color 0.3s' },
  // ✅ NEW: small icon buttons (minimize, fullscreen toggle) — replaces the old header endBtn
  iconBtn: {
    width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '18px', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white',
    border: 'none', borderRadius: '8px', cursor: 'pointer', flexShrink: 0
  },

  // Active content
  contentActive: { flex: 1, display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '20px', padding: '25px', overflowY: 'auto' },
  leftPanel: { display: 'flex', flexDirection: 'column' },
  currentQuestionCard: { backgroundColor: '#F9FAFB', padding: '25px', borderRadius: '12px', border: '2px solid #E5E7EB' },
  currentQuestionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  currentQuestionBadge: { padding: '8px 16px', backgroundColor: '#4F46E5', color: 'white', borderRadius: '20px', fontSize: '14px', fontWeight: '700' },
  currentQuestionPoints: { fontSize: '14px', fontWeight: '700', color: '#10B981' },
  currentQuestionText: { fontSize: '22px', fontWeight: '600', color: '#1F2937', lineHeight: '1.4', marginBottom: '20px' },
  currentOptions: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' },
  currentOption: { display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', borderRadius: '10px' },
  currentOptionLetter: { width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#4F46E5', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '700', flexShrink: 0 },
  currentOptionText: { flex: 1, fontSize: '16px', color: '#374151', fontWeight: '500' },
  correctIndicator: { padding: '5px 12px', backgroundColor: '#10B981', color: 'white', borderRadius: '15px', fontSize: '12px', fontWeight: '700' },
  explanationCard: { padding: '18px', backgroundColor: 'white', borderRadius: '10px', border: '1px solid #E5E7EB' },
  explanationTitle: { fontSize: '14px', fontWeight: '700', color: '#4F46E5', marginBottom: '8px' },
  explanationText: { fontSize: '15px', color: '#374151', lineHeight: '1.5', margin: 0 },

  // Right panel
  rightPanel: {},
  progressCard: { backgroundColor: '#F9FAFB', padding: '25px', borderRadius: '12px', border: '2px solid #E5E7EB', height: 'fit-content' },
  progressTitle: { fontSize: '18px', fontWeight: '700', color: '#1F2937', marginBottom: '20px' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' },
  statBox: { textAlign: 'center', padding: '15px', backgroundColor: 'white', borderRadius: '10px', border: '1px solid #E5E7EB' },
  statNumber: { fontSize: '24px', fontWeight: '700', color: '#4F46E5', marginBottom: '5px' },
  statLabel: { fontSize: '11px', color: '#6B7280', fontWeight: '600' },
  answerProgress: { width: '100%', height: '12px', backgroundColor: 'white', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' },
  answerProgressFill: { height: '100%', backgroundColor: '#10B981', transition: 'width 0.3s ease' },
  answerProgressText: { fontSize: '13px', color: '#6B7280', textAlign: 'center', marginBottom: '20px' },
  studentListActive: { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' },
  studentItemActive: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #E5E7EB' },
  studentStatusDot: { width: '12px', height: '12px', borderRadius: '50%', flexShrink: 0 },
  studentNameActive: { flex: 1, fontSize: '13px', fontWeight: '600', color: '#374151' },
  studentAnsweredBadge: { fontSize: '16px', color: '#10B981' },

  // Footer active
  // ✅ CHANGED: was 'space-between' to spread Minimize + the action button apart;
  // now only one button remains, so it's right-aligned like a normal footer CTA
  footerActive: { display: 'flex', justifyContent: 'flex-end', padding: '20px 30px', borderTop: '2px solid #f0f0f0' },
  nextBtn: { padding: '12px 28px', fontSize: '14px', fontWeight: '700', backgroundColor: '#4F46E5', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)' },
  // ✅ NEW: End Quiz on last question — red, same as header endBtn
  endQuizLastBtn: { padding: '12px 28px', fontSize: '14px', fontWeight: '700', backgroundColor: '#EF4444', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)' },

  // Finished view
  finishedCard: { textAlign: 'center', padding: '60px 40px' },
  finishedIcon: { fontSize: '80px', marginBottom: '20px' },
  finishedTitle: { fontSize: '32px', fontWeight: '700', color: '#1F2937', marginBottom: '15px' },
  finishedText: { fontSize: '16px', color: '#6B7280', marginBottom: '30px' },

  // ✅ NEW: final leaderboard (teacher view)
  finalLeaderboardSection: { textAlign: 'left', marginBottom: '30px', maxWidth: '480px', marginLeft: 'auto', marginRight: 'auto' },
  finalLeaderboardTitle: { fontSize: '18px', fontWeight: '700', color: '#1F2937', marginBottom: '12px', textAlign: 'center' },
  finalLeaderboardList: { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' },
  finalLeaderboardItem: {
    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
    backgroundColor: '#F9FAFB', borderRadius: '10px', border: '1px solid #E5E7EB'
  },
  finalLeaderboardRank: { fontWeight: '700', color: '#4F46E5', minWidth: '30px' },
  finalLeaderboardName: { flex: 1, fontWeight: '600', color: '#374151', textAlign: 'left' },
  finalLeaderboardScore: { fontWeight: '700', color: '#10B981' },
  finalLeaderboardMeta: { fontSize: '12px', color: '#6B7280', minWidth: '90px', textAlign: 'right' },
  // ✅ NEW (Phase 3): team final leaderboard cards
  teamFinalCard: { border: '1px solid #E5E7EB', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' },
  teamFinalHeader: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', backgroundColor: '#F9FAFB' },
  teamFinalIcon: { fontSize: '16px' },
  teamFinalMembers: { padding: '6px 14px 10px 52px', display: 'flex', flexDirection: 'column', gap: '4px' },
  teamFinalMemberRow: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#4B5563' },
  // ✅ NEW (Phase 2): Class Highlights / awards card
  awardsCard: { textAlign: 'left', marginBottom: '30px', maxWidth: '480px', marginLeft: 'auto', marginRight: 'auto', backgroundColor: '#F5F3FF', border: '2px solid #DDD6FE', borderRadius: '14px', padding: '18px' },
  awardsList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  awardItem: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '10px', backgroundColor: 'white' },
  awardIcon: { fontSize: '22px', flexShrink: 0 },
  awardInfo: { flex: 1, minWidth: 0 },
  awardLabel: { fontSize: '12px', fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.3px' },
  awardWinner: { fontSize: '14px', fontWeight: '600', color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  // ✅ NEW: two-button layout in finished view
  finishedActions: { display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' },
  createAgainBtn: {
    padding: '16px 40px', fontSize: '16px', fontWeight: '700',
    backgroundColor: '#10B981', color: 'white', border: 'none',
    borderRadius: '12px', cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
    width: '100%', maxWidth: '300px'
  },
  doneBtn: {
    padding: '14px 40px', fontSize: '15px', fontWeight: '600',
    backgroundColor: '#F3F4F6', color: '#374151', border: 'none',
    borderRadius: '12px', cursor: 'pointer',
    width: '100%', maxWidth: '300px'
  }
};

export default QuizHost;