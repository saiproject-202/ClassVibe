// frontend/src/components/QuizControlPanel.jsx
// Teacher's real-time quiz control panel
// Shows: waiting students, live progress, question preview, quiz history, end-quiz control

import React, { useState, useEffect, useCallback } from 'react';
import socket from '../socket';
import LbAvatar from './LbAvatar';
import { CELEBRATION_EMOTES } from '../avatarConstants';

const API = process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com';

const QuizControlPanel = ({ groupId, onClose, onStartQuiz }) => {
  // ── Tabs: 'control' | 'history' ───────────────────────────────────
  const [activeTab, setActiveTab] = useState('control');

  // ── Active session state ──────────────────────────────────────────
  const [activeSession, setActiveSession] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [quizStatus, setQuizStatus] = useState('none'); // none | waiting | active | finished
  const [waitingStudents, setWaitingStudents] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [leaderboard, setLeaderboard] = useState([]);
  // ✅ NEW: this panel never tracked any of these — teacher's "finished" state was
  // effectively blank (no team leaderboard, no awards, no per-question stats).
  const [teamLeaderboard, setTeamLeaderboard] = useState([]);
  // Milestone 11: read-only mirror of QuizPlayer's celebration choices —
  // { [userId]: emote }. Teacher never gets a picker, only ever watches.
  const [celebrationChoices, setCelebrationChoices] = useState({});
  const [questionMVP, setQuestionMVP] = useState(null);
  const [questionStats, setQuestionStats] = useState(null);
  const [awards, setAwards] = useState([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // ── History state ─────────────────────────────────────────────────
  const [quizHistory, setQuizHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState(null);
  // ✅ NEW: drill-down into one student's per-question review from the history detail view
  const [reviewParticipant, setReviewParticipant] = useState(null);

  const token = localStorage.getItem('token');

  // ── Fetch active quiz on mount ────────────────────────────────────
  const fetchActiveQuiz = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/quiz/group/${groupId}/active`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      if (data.session) {
        setActiveSession(data.session);
        setQuiz(data.session.quiz || data.quiz);
        setQuizStatus(data.session.status);
        setParticipants(data.session.participants || []);
        setWaitingStudents(data.session.participants?.filter(p => !p.hasStarted) || []);
        // Calculate total possible points
        const q = data.session.quiz || data.quiz;
        if (q?.questions) {
          setTotalPoints(q.questions.reduce((sum, qq) => sum + (qq.points || 10), 0));
        }
        setCurrentQuestionIndex(data.session.currentQuestionIndex || 0);
      }
    } catch (err) {
      console.error('Fetch active quiz error:', err);
    } finally {
      setLoading(false);
    }
  }, [groupId, token]);

  useEffect(() => { fetchActiveQuiz(); }, [fetchActiveQuiz]);

  // ✅ NEW: join the quiz session's socket room. Without this, the server's
  // io.to(sessionId).emit(...) broadcasts (next question, finished, etc.) never
  // reach this panel at all, no matter what it listens for below.
  // ✅ FIX (real-time regression): also RE-join on every reconnect. Socket.IO rooms don't
  // survive a reconnect (ping timeout, blip, server restart), and this used to join only
  // once — so after any reconnect the teacher's live panel silently stopped receiving
  // answers, leaderboard updates, next-question and finished broadcasts. Re-joining on
  // 'authenticated' (fired by the backend after App.js re-auths on 'connect') also
  // re-runs fetchActiveQuiz to catch up on state missed during the disconnect.
  useEffect(() => {
    if (!activeSession?._id) return;
    const joinRoom = () => {
      socket.emit('teacher:joinSession', { sessionId: activeSession._id });
      fetchActiveQuiz();
    };
    joinRoom();
    socket.on('authenticated', joinRoom);
    return () => socket.off('authenticated', joinRoom);
  }, [activeSession?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch quiz history ────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    if (historyLoading) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API}/api/quiz/group/${groupId}/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) { setHistoryLoading(false); return; }
      const data = await res.json();
      setQuizHistory(data.history || data.sessions || []);
    } catch (err) {
      console.error('Fetch history error:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [groupId, token, historyLoading]);

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket listeners (real-time updates) ─────────────────────────
  useEffect(() => {
    // ✅ FIXED: was only listening for 'participantJoined', which the backend never
    // sends — the real event is 'student:joined'. Waiting-student list never updated live.
    const onParticipantJoined = (data) => {
      setWaitingStudents(prev => {
        if (prev.find(s => s.userId === data.userId)) return prev;
        return [...prev, { userId: data.userId, name: data.name || 'Student', hasStarted: false }];
      });
      setParticipants(prev => {
        if (prev.find(s => s.userId === data.userId)) return prev;
        return [...prev, { userId: data.userId, name: data.name || 'Student', score: 0, streak: 0 }];
      });
    };

    const onAnswerReceived = (data) => {
      // Update participant's answered state for current question
      setParticipants(prev => prev.map(p =>
        p.userId === data.userId
          ? { ...p, lastAnswered: data.questionIndex, score: data.score || p.score }
          : p
      ));
    };

    const onLeaderboardUpdate = (data) => {
      setLeaderboard(data.leaderboard || []);
      setTeamLeaderboard(data.teamLeaderboard || []); // ✅ NEW
      setQuestionMVP(data.questionMVP || null); // ✅ NEW
      // Sync scores
      setParticipants(prev => prev.map(p => {
        const entry = (data.leaderboard || []).find(l => l.userId === p.userId);
        return entry ? { ...p, score: entry.score, streak: entry.streak || 0 } : p;
      }));
    };

    // ✅ NEW: "Question Summary" beat, same pacing the student view gets — useful when
    // a teacher is presenting on a projector.
    const onQuestionSummary = (data) => {
      setQuestionStats(data);
    };

    // ✅ NEW: arrives shortly after quiz:finished once results are saved
    const onAwardsRevealed = (data) => {
      setAwards(data.awards || []);
    };

    // ✅ FIXED: was only listening for the dead 'quizBegan' name — the real event
    // broadcast by teacher:startQuiz is 'quiz:started'. Also clears actionLoading now
    // that Start/Next/Finish are real socket round-trips, not REST calls.
    const onQuizBegan = (data) => {
      setQuizStatus('active');
      setCurrentQuestionIndex(data.questionIndex || 0);
      setActionLoading(false);
    };

    const onNextQuestion = (data) => {
      setCurrentQuestionIndex(data.questionIndex || 0);
      // Reset answered flags
      setParticipants(prev => prev.map(p => ({ ...p, lastAnswered: null })));
      setQuestionStats(null); // ✅ NEW: clear previous question's summary
      setActionLoading(false);
    };

    // ✅ FIXED: used to ignore its own payload entirely — the teacher's "finished"
    // state showed no final leaderboard at all until they switched to the History tab.
    const onQuizEnded = (data) => {
      setQuizStatus('finished');
      if (data?.leaderboard) {
        setLeaderboard(data.leaderboard);
        // Milestone 11: seed already-chosen celebrations (rare on this panel since
        // the teacher's view usually renders first, but harmless if it happens).
        const seeded = {};
        data.leaderboard.forEach(entry => {
          if (entry.celebrationEmote) seeded[entry.userId] = entry.celebrationEmote;
        });
        setCelebrationChoices(seeded);
      }
      setTeamLeaderboard(data?.teamLeaderboard || []); // ✅ NEW
      setActionLoading(false);
    };

    // Milestone 11: live update as each top-3 finisher confirms their celebration
    const onCelebrationChosen = (data) => {
      if (!data?.userId) return;
      setCelebrationChoices(prev => ({ ...prev, [data.userId]: data.emote }));
    };

    // ✅ NEW: surface server-side rejections (e.g. "Only host can control quiz")
    // instead of the button just spinning forever with no feedback
    const onError = (data) => {
      setActionLoading(false);
      alert(data?.message || 'Something went wrong.');
    };

    socket.on('student:joined', onParticipantJoined);
    socket.on('participantJoined', onParticipantJoined); // legacy alias, harmless if unused
    socket.on('student:answered', onAnswerReceived);
    socket.on('answer:submitted', onAnswerReceived);
    socket.on('leaderboard:update', onLeaderboardUpdate);
    socket.on('leaderboard:show', onLeaderboardUpdate);
    socket.on('question:summary', onQuestionSummary); // ✅ NEW
    socket.on('quiz:awardsRevealed', onAwardsRevealed); // ✅ NEW
    socket.on('quiz:started', onQuizBegan);
    socket.on('quizBegan', onQuizBegan); // legacy alias, harmless if unused
    socket.on('quiz:nextQuestion', onNextQuestion);
    socket.on('quiz:finished', onQuizEnded);
    socket.on('quizEnded', onQuizEnded);
    socket.on('celebration:chosen', onCelebrationChosen); // Milestone 11
    socket.on('error', onError);

    return () => {
      socket.off('student:joined', onParticipantJoined);
      socket.off('participantJoined', onParticipantJoined);
      socket.off('student:answered', onAnswerReceived);
      socket.off('answer:submitted', onAnswerReceived);
      socket.off('leaderboard:update', onLeaderboardUpdate);
      socket.off('leaderboard:show', onLeaderboardUpdate);
      socket.off('question:summary', onQuestionSummary);
      socket.off('quiz:awardsRevealed', onAwardsRevealed);
      socket.off('quiz:started', onQuizBegan);
      socket.off('quizBegan', onQuizBegan);
      socket.off('quiz:nextQuestion', onNextQuestion);
      socket.off('quiz:finished', onQuizEnded);
      socket.off('quizEnded', onQuizEnded);
      socket.off('celebration:chosen', onCelebrationChosen);
      socket.off('error', onError);
    };
  }, []);

  // ── Actions ───────────────────────────────────────────────────────
  // ✅ FIXED: all three actions used to POST to /api/quiz/session/:id/begin|next|end —
  // none of those addresses exist on the backend, so every click silently failed.
  // QuizHost.jsx already controls quizzes successfully over the socket connection, so
  // these now do exactly what it does. actionLoading is cleared by the matching
  // socket listener above (onQuizBegan/onNextQuestion/onQuizEnded) once the server
  // confirms, or by onError if the server rejects it.
  const handleStartQuiz = () => {
    if (!activeSession) return;
    setActionLoading(true);
    socket.emit('teacher:startQuiz', { sessionId: activeSession._id });
  };

  const handleNextQuestion = () => {
    if (!activeSession) return;
    setActionLoading(true);
    socket.emit('teacher:nextQuestion', { sessionId: activeSession._id });
  };

  // ✅ RENAMED from handleEndQuiz: this is now the single ending action used everywhere
  // (previously "End Quiz" and "Finish Quiz" were two separate buttons calling the same
  // broken handler on the last question). Does NOT auto-close the panel anymore — stays
  // open so the "Recreate Quiz" action can appear once quizStatus becomes 'finished'.
  const handleFinishQuiz = () => {
    if (!activeSession) return;
    if (!window.confirm('Finish the quiz now? Students will not be able to rejoin.')) return;
    setActionLoading(true);
    socket.emit('teacher:endQuiz', { sessionId: activeSession._id });
  };

  // ── Helpers ───────────────────────────────────────────────────────
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const getSourceLabel = (session) => {
    if (!session) return '—';
    const src = session.creationType || session.quiz?.source || session.source;
    const map = { topic: '📝 Topic', file: '📄 File', url: '🔗 Link', paste: '📋 Content', ai: '🤖 AI', manual: '✏️ Manual' };
    return map[src] || '📝 Topic';
  };

  const answeredCount = participants.filter(p => p.lastAnswered === currentQuestionIndex).length;
  const totalParticipants =
  quizStatus === 'waiting'
    ? waitingStudents.length
    : participants.length;
  const currentQ = quiz?.questions?.[currentQuestionIndex];
  const isLastQuestion = quiz?.questions && currentQuestionIndex >= quiz.questions.length - 1;

  // ── Render: LOADING ───────────────────────────────────────────────
  if (loading) {
    return (
      <div style={S.overlay}>
        <div style={S.panel}>
          <div style={S.panelHeader}>
            <h2 style={S.panelTitle}>🎮 Quiz Control Panel</h2>
            <button onClick={onClose} style={S.closeBtn}>✕</button>
          </div>
          <div style={S.centeredMsg}>
            <div style={S.spinner} />
            <p style={{ color: '#666', marginTop: 14 }}>Loading quiz data...</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: NO ACTIVE QUIZ ────────────────────────────────────────
  if (!activeSession && activeTab === 'control') {
    return (
      <div style={S.overlay}>
        <div style={S.panel}>
          <div style={S.panelHeader}>
            <h2 style={S.panelTitle}>🎮 Quiz Control Panel</h2>
            <button onClick={onClose} style={S.closeBtn}>✕</button>
          </div>

          <div style={S.tabRow}>
            {['control', 'history'].map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                style={{ ...S.tabBtn, ...(activeTab === t ? S.tabBtnActive : {}) }}>
                {t === 'control' ? '🎮 Active Quiz' : '📋 History'}
              </button>
            ))}
          </div>

          <div style={S.centeredMsg}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎯</div>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#333', marginBottom: 8 }}>
              No active quiz
            </p>
            <p style={{ fontSize: 14, color: '#888', marginBottom: 20 }}>
              Create a quiz using the Quiz Builder
            </p>
            {onStartQuiz && (
              <button onClick={() => { onClose(); onStartQuiz(); }} style={S.createBtn}>
                + Create New Quiz
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Render: MAIN PANEL ────────────────────────────────────────────
  return (
    <div style={S.overlay}>
      <style>{KEYFRAMES}</style>
      <div style={S.panel}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={S.panelHeader}>
          <div>
            <h2 style={S.panelTitle}>🎮 Quiz Control Panel</h2>
            {quiz && <p style={S.panelSubtitle}>{quiz.title}</p>}
          </div>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────── */}
        <div style={S.tabRow}>
          {['control', 'history'].map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{ ...S.tabBtn, ...(activeTab === t ? S.tabBtnActive : {}) }}>
              {t === 'control' ? '🎮 Live Control' : '📋 Quiz History'}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════
            TAB: CONTROL
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'control' && activeSession && (
          <div style={S.scrollBody}>

            {/* Status bar */}
            <div style={{
              ...S.statusBar,
              backgroundColor:
                quizStatus === 'active' ? '#D7F0DD' :
                quizStatus === 'finished' ? '#F3F4F6' : '#FFF9E6',
              borderColor:
                quizStatus === 'active' ? '#25D366' :
                quizStatus === 'finished' ? '#ccc' : '#FFA500'
            }}>
              <div style={S.statusDot(quizStatus)} />
              <span style={S.statusText}>
                {quizStatus === 'active' && `Live — Question ${currentQuestionIndex + 1} of ${quiz?.questions?.length || '?'}`}
                {quizStatus === 'finished' && 'Quiz finished'}
              </span>
            </div>

            {/* Stat cards */}
            <div style={S.statGrid}>
              {[
                { label: 'Questions', value: quiz?.questions?.length || 0, emoji: '📝' },
                { label: 'Students', value: totalParticipants, emoji: '👥' },
                { label: 'Total Points', value: totalPoints, emoji: '⭐' },
                ...(quizStatus === 'active' ? [{ label: 'Answered', value: `${answeredCount}/${totalParticipants}`, emoji: '✅' }] : [])
              ].map((c, i) => (
                <div key={i} style={S.statCard}>
                  <div style={S.statEmoji}>{c.emoji}</div>
                  <div style={S.statValue}>{c.value}</div>
                  <div style={S.statLabel}>{c.label}</div>
                </div>
              ))}
            </div>

            {/* ── Live roster ───────────────────────────────────── */}
            {quizStatus === 'active' && (
              <div style={S.section}>
                <h3 style={S.sectionTitle}>
                  👥 Students ({participants.length})
                </h3>
                {totalParticipants === 0 ? (
                  <div style={S.emptyBox}>
                    <div style={{ fontSize: 40, marginBottom: 10 }}>🎯</div>
                    <p style={S.emptyText}>No students yet</p>
                    <p style={S.emptySubtext}>Students can join via floating quiz button, notification, or chat</p>
                  </div>
                ) : (
                  <div style={S.studentGrid}>
                    {participants.map((p, i) => {
                      const hasAns = p.lastAnswered === currentQuestionIndex;
                      return (
                        <div key={i} style={{
                          ...S.studentChip,
                          borderColor: hasAns ? '#25D366' : '#e0e0e0',
                          backgroundColor: hasAns ? '#D7F0DD' : 'white'
                        }}>
                          <div style={{ ...S.studentAvatar, backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                            {(p.name || p.username || 'S')[0].toUpperCase()}
                          </div>
                          <div style={S.studentName}>{p.name || p.username || 'Student'}</div>
                          {quizStatus === 'active' && (
                            <div style={{ fontSize: 12, color: hasAns ? '#25D366' : '#FFA500', fontWeight: 600 }}>
                              {hasAns ? '✓' : '…'}
                            </div>
                          )}
                          {quizStatus === 'active' && p.score > 0 && (
                            <div style={S.studentScore}>{p.score}pts</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Live answer progress bar ──────────────────────── */}
            {quizStatus === 'active' && totalParticipants > 0 && (
              <div style={S.section}>
                <h3 style={S.sectionTitle}>📊 Answer Progress — Q{currentQuestionIndex + 1}</h3>
                <div style={S.progressTrack}>
                  <div style={{
                    ...S.progressFill,
                    width: `${(answeredCount / totalParticipants) * 100}%`
                  }} />
                </div>
                <p style={S.progressLabel}>
                  {answeredCount} / {totalParticipants} students answered
                </p>
              </div>
            )}

            {/* ── Current question preview ──────────────────────── */}
            {quizStatus === 'active' && currentQ && (
              <div style={S.section}>
                <h3 style={S.sectionTitle}>👁️ Current Question (Q{currentQuestionIndex + 1})</h3>
                <div style={S.questionPreview}>
                  <div style={S.qpTypeBadge}>{currentQ.questionType?.replace('_', ' ') || 'Multiple Choice'}</div>
                  <p style={S.qpText}>{currentQ.questionText}</p>
                  {currentQ.questionType !== 'fill_in_blank' && (
                    <div style={S.qpOptions}>
                      {(currentQ.options || []).map((opt, j) => (
                        <div key={j} style={{
                          ...S.qpOption,
                          backgroundColor: j === currentQ.correctAnswer ? '#D7F0DD' : '#f5f5f5',
                          border: j === currentQ.correctAnswer ? '2px solid #25D366' : '1px solid #e0e0e0'
                        }}>
                          <strong>{String.fromCharCode(65 + j)}.</strong> {opt}
                          {j === currentQ.correctAnswer && <span style={S.correctTag}>✓ Correct</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {currentQ.questionType === 'fill_in_blank' && (
                    <div style={S.qpFillAnswer}>
                      Correct answer: <strong>{currentQ.correctAnswer}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Question Summary (while active) ─────────────────
                ✅ NEW: same educational beat the students see, useful when a teacher
                is presenting on a projector — pacing parity, not a full replica. */}
            {quizStatus === 'active' && questionStats && (
              <div style={S.section}>
                <h3 style={S.sectionTitle}>📈 Question Summary</h3>
                <div style={S.qSummaryRow}>
                  <div style={S.qSummaryStat}>
                    <div style={S.qSummaryValue}>{questionStats.correctPercent}%</div>
                    <div style={S.qSummaryLabel}>Correct</div>
                  </div>
                  <div style={S.qSummaryStat}>
                    <div style={S.qSummaryValue}>{questionStats.avgTimeTaken}s</div>
                    <div style={S.qSummaryLabel}>Avg time</div>
                  </div>
                </div>
                {questionStats.fastestCorrect && (
                  <p style={S.qSummaryFastest}>⚡ Fastest: {questionStats.fastestCorrect.name} ({questionStats.fastestCorrect.timeTaken}s)</p>
                )}
              </div>
            )}

            {/* ── Live leaderboard (while active) ──────────────── */}
            {quizStatus === 'active' && (leaderboard.length > 0 || teamLeaderboard.length > 0) && (
              <div style={S.section}>
                <h3 style={S.sectionTitle}>🏆 Live Rankings</h3>
                {/* ✅ NEW: MVP callout, matching the student view */}
                {questionMVP && (
                  <p style={S.mvpCallout}>⭐ Question MVP: <strong>{questionMVP.name}</strong> (+{questionMVP.points} pts)</p>
                )}
                {/* ✅ NEW: team leaderboard — this panel previously only ever showed the
                    flat individual list, even in team mode. */}
                {teamLeaderboard.length > 0 ? (
                  teamLeaderboard.slice(0, 5).map((team, i) => (
                    <div key={team.teamId} style={S.lbRow}>
                      <div style={S.lbRank}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</div>
                      <div style={S.lbName}>{team.icon} {team.name}</div>
                      <div style={S.lbScore}>{team.averageScore} avg</div>
                    </div>
                  ))
                ) : (
                  leaderboard.slice(0, 5).map((entry, i) => (
                    <div key={i} style={S.lbRow}>
                      <div style={S.lbRank}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </div>
                      <LbAvatar name={entry.name} avatar={entry.avatar} size={22} />
                      <div style={S.lbName}>{entry.name || 'Student'}</div>
                      <div style={S.lbScore}>{entry.score} pts</div>
                      {entry.streak > 0 && <div style={S.lbStreak}>🔥 {entry.streak}</div>}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Finished: two distinct endings, matching the student view ──────
                ✅ NEW: this body was completely empty before — teacher had to switch
                to the History tab to see any result at all once a quiz ended. */}
            {quizStatus === 'finished' && (
              <>
                {/* ✅ CHANGED (Milestone 11): universal podium — top-3 individual
                    finishers, same as QuizPlayer, in every mode. Team mode's
                    distinct signal moves to the column-wise standings below,
                    replacing the old single-team "winning team" hero. */}
                {leaderboard.length > 0 && (() => {
                  const podiumTop3 = leaderboard.slice(0, 3);
                  return (
                    <div style={S.podiumSection}>
                      <div style={S.celebrationLabel}>🏆 PODIUM</div>
                      <div style={S.podiumRow}>
                        {[podiumTop3[1], podiumTop3[0], podiumTop3[2]].map((entry, i) => {
                          if (!entry) return <div key={i} style={S.podiumSlotEmpty} />;
                          const place = entry === podiumTop3[0] ? 1 : entry === podiumTop3[1] ? 2 : 3;
                          const placeColor = place === 1 ? '#F59E0B' : place === 2 ? '#9CA3AF' : '#B45309';
                          const chosen = celebrationChoices[entry.userId];
                          const chosenMeta = chosen && CELEBRATION_EMOTES.find(e => e.key === chosen);
                          return (
                            <div key={entry.userId} style={S.podiumSlot}>
                              <div style={{ marginBottom: '8px', position: 'relative' }}>
                                <LbAvatar name={entry.name} avatar={entry.avatar} color={placeColor} size={56} />
                                {chosenMeta && <span style={S.podiumEmoteBadge} title={chosenMeta.label}>{chosenMeta.icon}</span>}
                              </div>
                              <div style={S.podiumName}>{entry.name}</div>
                              <div style={{ ...S.podiumStand, height: place === 1 ? '60px' : place === 2 ? '42px' : '30px', backgroundColor: placeColor }}>
                                <span style={S.podiumPlace}>{place}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Milestone 11: column-wise team standings, replacing the old
                    single-team hero card — every team ranked, side by side. */}
                {teamLeaderboard.length > 0 && (
                  <div style={S.teamColumnsRow}>
                    {teamLeaderboard.map((team) => (
                      <div key={team.teamId} style={{ ...S.teamColumn, borderColor: team.color || '#4F46E5' }}>
                        <div style={S.teamColumnHeader}>#{team.rank} {team.icon} {team.name}</div>
                        <div style={S.teamColumnScore}>{team.averageScore} avg pts</div>
                        <div style={S.teamColumnMembers}>
                          {(team.members || []).map((m) => (
                            <div key={m.userId} style={S.teamColumnMemberRow}>
                              <LbAvatar name={m.name} avatar={m.avatar} size={20} />
                              <span style={S.teamColumnMemberName}>{m.name}</span>
                              <span style={S.teamColumnMemberScore}>{m.score}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {awards.length > 0 && (
                  <div style={S.section}>
                    <h3 style={S.sectionTitle}>🏅 Class Highlights</h3>
                    {awards.map((award, i) => (
                      <div key={i} style={S.lbRow}>
                        <div style={S.lbName}>{award.name}</div>
                        <div style={S.lbScore}>{award.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={S.section}>
                  <h3 style={S.sectionTitle}>🏆 Final Leaderboard</h3>
                  {teamLeaderboard.length > 0 ? (
                    teamLeaderboard.map((team, i) => (
                      <div key={team.teamId} style={S.lbRow}>
                        <div style={S.lbRank}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</div>
                        <div style={S.lbName}>{team.icon} {team.name}</div>
                        <div style={S.lbScore}>{team.averageScore} avg</div>
                      </div>
                    ))
                  ) : (
                    leaderboard.map((entry, i) => (
                      <div key={i} style={S.lbRow}>
                        <div style={S.lbRank}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</div>
                        <LbAvatar name={entry.name} avatar={entry.avatar} size={22} />
                        <div style={S.lbName}>{entry.name || 'Student'}</div>
                        <div style={S.lbScore}>{entry.score} pts</div>
                      </div>
                    ))
                  )}
                </div>

                <div style={S.savedNote}>✓ Saved to Quiz History</div>
              </>
            )}

            {/* ── Questions list preview ────────────────────────── */}
            {quizStatus === 'waiting' && quiz?.questions && (
              <div style={S.section}>
                <h3 style={S.sectionTitle}>📝 Questions Preview ({quiz.questions.length})</h3>
                <div style={S.questionsList}>
                  {quiz.questions.map((q, i) => (
                    <div key={i} style={S.questionItem}>
                      <div style={S.questionItemNum}>Q{i + 1}</div>
                      <div style={S.questionItemText}>{q.questionText}</div>
                      <div style={S.questionItemMeta}>
                        <span style={S.questionTypePill}>{q.questionType?.replace('_', ' ') || 'MC'}</span>
                        <span style={S.questionPts}>{q.points || 10}pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            TAB: HISTORY
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'history' && (
          <div style={S.scrollBody}>
            {historyLoading ? (
              <div style={S.centeredMsg}>
                <div style={S.spinner} />
                <p style={{ color: '#666', marginTop: 14 }}>Loading history...</p>
              </div>
            ) : quizHistory.length === 0 ? (
              <div style={S.centeredMsg}>
                <div style={{ fontSize: 52, marginBottom: 14 }}>📋</div>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#333', marginBottom: 6 }}>No quiz history yet</p>
                <p style={{ fontSize: 13, color: '#888' }}>Completed quizzes will appear here</p>
              </div>
            ) : selectedHistory && reviewParticipant ? (
              // ── Per-student review (like QuizPlayer's "My Review" tab) ──────
              <div>
                <button onClick={() => setReviewParticipant(null)} style={S.backBtn}>← Back to leaderboard</button>

                <div style={S.histDetailHeader}>
                  <h3 style={S.histDetailTitle}>{reviewParticipant.user?.name || reviewParticipant.name || 'Student'}</h3>
                  <div style={S.histDetailMeta}>
                    <span>🏆 {reviewParticipant.score} pts</span>
                    <span>
                      {reviewParticipant.answers?.filter(a => a.isCorrect).length || 0}/
                      {selectedHistory.quiz?.questions?.length || 0} correct
                    </span>
                  </div>
                </div>

                <div style={S.questionsList}>
                  {(selectedHistory.quiz?.questions || []).map((q, i) => {
                    const answer = reviewParticipant.answers?.find(a => a.questionIndex === i);
                    if (!answer) {
                      return (
                        <div key={i} style={{ ...S.answerCard, opacity: 0.6 }}>
                          <div style={S.answerHeader}>
                            <div style={S.questionItemNum}>Q{i + 1}</div>
                            <div style={{ ...S.answerResult, color: '#9CA3AF' }}>❓ Not answered</div>
                            <div style={S.questionPts}>+0 pts</div>
                          </div>
                          <p style={S.answerQuestionText}>{q.questionText}</p>
                        </div>
                      );
                    }
                    const isUnanswered = answer.selectedAnswer === null || answer.selectedAnswer === undefined || answer.selectedAnswer === -1;
                    return (
                      <div key={i} style={S.answerCard}>
                        <div style={S.answerHeader}>
                          <div style={S.questionItemNum}>Q{i + 1}</div>
                          <div style={{ ...S.answerResult, color: answer.isCorrect ? '#25D366' : (isUnanswered ? '#9CA3AF' : '#EF4444') }}>
                            {answer.isCorrect ? '✅ Correct' : (isUnanswered ? '❓ Not Answered' : '❌ Wrong')}
                          </div>
                          <div style={S.questionPts}>+{answer.points || 0} pts</div>
                        </div>
                        <p style={S.answerQuestionText}>{q.questionText}</p>
                        {q.explanation && <p style={S.answerExplanation}>💡 {q.explanation}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : selectedHistory ? (
              // ── History detail ──────────────────────────────────
              <div>
                <button onClick={() => { setSelectedHistory(null); setReviewParticipant(null); }} style={S.backBtn}>← Back to list</button>

                <div style={S.histDetailHeader}>
                  <h3 style={S.histDetailTitle}>{selectedHistory.quiz?.title || 'Quiz'}</h3>
                  <div style={S.histDetailMeta}>
                    <span>📅 {formatDate(selectedHistory.startedAt)}</span>
                    <span>🕐 {formatTime(selectedHistory.startedAt)} – {formatTime(selectedHistory.endedAt)}</span>
                    <span>{getSourceLabel(selectedHistory)}</span>
                  </div>
                </div>

                {/* Stats */}
                <div style={S.statGrid}>
                  {[
                    { label: 'Questions', value: selectedHistory.quiz?.questions?.length || '—', emoji: '📝' },
                    { label: 'Participants', value: selectedHistory.participants?.length || 0, emoji: '👥' },
                    { label: 'AI Generated', value: selectedHistory.quiz?.aiQuestionsCount || '—', emoji: '🤖' },
                    { label: 'Manual', value: selectedHistory.quiz?.manualQuestionsCount || '—', emoji: '✏️' }
                  ].map((c, i) => (
                    <div key={i} style={S.statCard}>
                      <div style={S.statEmoji}>{c.emoji}</div>
                      <div style={S.statValue}>{c.value}</div>
                      <div style={S.statLabel}>{c.label}</div>
                    </div>
                  ))}
                </div>

                {/* Final leaderboard */}
                {selectedHistory.participants?.length > 0 && (
                  <div style={S.section}>
                    <h3 style={S.sectionTitle}>🏆 Final Leaderboard</h3>
                    {[...selectedHistory.participants]
                      .sort((a, b) => b.score - a.score)
                      .map((p, i) => (
                        <div key={i} style={{ ...S.lbRow, cursor: 'pointer' }} onClick={() => setReviewParticipant(p)}>
                          <div style={S.lbRank}>
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                          </div>
                          <div style={S.lbName}>{p.user?.name || p.name || 'Student'}</div>
                          <div style={S.lbScore}>{p.score} pts</div>
                          <div style={{ fontSize: 13, color: '#888' }}>
                            {p.answers?.filter(a => a.isCorrect).length || 0}/
                            {p.answers?.length || 0} ✓
                          </div>
                          <div style={{ fontSize: 18, color: '#ccc' }}>›</div>
                        </div>
                      ))}
                  </div>
                )}

                {/* Questions + answers */}
                {selectedHistory.quiz?.questions && (
                  <div style={S.section}>
                    <h3 style={S.sectionTitle}>📝 Question List ({selectedHistory.quiz.questions.length})</h3>
                    {selectedHistory.quiz.questions.map((q, i) => (
                      <div key={i} style={{ ...S.questionItem, marginBottom: 12, padding: 14, backgroundColor: 'white', borderRadius: 10, border: '1px solid #eee' }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <div style={S.questionItemNum}>Q{i + 1}</div>
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#333' }}>{q.questionText}</p>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <span style={S.questionTypePill}>{q.questionType?.replace('_', ' ') || 'MC'}</span>
                              <span style={{ ...S.questionTypePill, backgroundColor: q.isAiGenerated ? '#E3F2FD' : '#F3F4F6', color: q.isAiGenerated ? '#1565C0' : '#555' }}>
                                {q.isAiGenerated ? '🤖 AI' : '✏️ Manual'}
                              </span>
                              <span style={S.questionPts}>{q.points || 10} pts</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              // ── History list ────────────────────────────────────
              <div>
                <h3 style={{ ...S.sectionTitle, marginBottom: 16 }}>Past Quizzes ({quizHistory.length})</h3>
                {quizHistory.map((session, i) => {
                  const winner = [...(session.participants || [])].sort((a, b) => b.score - a.score)[0];
                  return (
                    <div key={i} style={S.histCard} onClick={() => setSelectedHistory(session)}>
                      <div style={S.histCardLeft}>
                        <div style={S.histTitle}>{session.quiz?.title || 'Quiz'}</div>
                        <div style={S.histMeta}>
                          <span>📅 {formatDate(session.startedAt)}</span>
                          <span>🕐 {formatTime(session.startedAt)}</span>
                          <span>{getSourceLabel(session)}</span>
                        </div>
                        <div style={S.histMeta}>
                          <span>📝 {session.quiz?.questions?.length || 0} questions</span>
                          <span>👥 {session.participants?.length || 0} students</span>
                          {winner && <span>🏆 {winner.user?.name || winner.name || 'Winner'}: {winner.score}pts</span>}
                        </div>
                      </div>
                      <div style={S.histArrow}>›</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Footer action buttons ─────────────────────────────────── */}
        {activeTab === 'control' && activeSession && (
          <div style={S.footer}>
            <button onClick={onClose} style={S.cancelBtn} disabled={actionLoading}>
              Close
            </button>

            {quizStatus === 'waiting' && (
              <button
                onClick={handleStartQuiz}
                disabled={actionLoading}
                style={{ ...S.primaryBtn, backgroundColor: '#25D366' }}
              >
                {actionLoading ? 'Starting...' : `🚀 Start Quiz Now${totalParticipants > 0 ? ` (${totalParticipants})` : ''}`}
              </button>
            )}

            {quizStatus === 'active' && (
              <>
                {!isLastQuestion && (
                  <button
                    onClick={handleNextQuestion}
                    disabled={actionLoading}
                    style={{ ...S.primaryBtn, backgroundColor: '#4F46E5' }}
                  >
                    {actionLoading ? '...' : 'Next Question →'}
                  </button>
                )}

                {/* ✅ FIXED: single ending button everywhere — used to be TWO buttons
                    ("End Quiz" + "Finish Quiz") doing the exact same broken thing on the
                    last question. Once finished, students cannot rejoin (server already
                    enforces this — see quiz-socket-handlers.js student:joinQuiz). */}
                <button
                  onClick={handleFinishQuiz}
                  disabled={actionLoading}
                  style={{ ...S.primaryBtn, backgroundColor: isLastQuestion ? '#25D366' : '#dc3545' }}
                >
                  {actionLoading ? 'Finishing...' : '🏁 Finish Quiz'}
                </button>
              </>
            )}

            {/* ✅ NEW: once finished, let the teacher immediately build another quiz
                (a new topic) for this same classroom instead of dead-ending here */}
            {quizStatus === 'finished' && (
              <button
                onClick={() => { onClose(); onStartQuiz?.(); }}
                style={{ ...S.primaryBtn, backgroundColor: '#4F46E5' }}
              >
                🔄 Recreate Quiz
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

// ── Helpers ────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#075E54', '#9C27B0', '#FF5722', '#2196F3', '#FF9800', '#4CAF50', '#E91E63', '#00BCD4'];

const KEYFRAMES = `@keyframes spin { to { transform: rotate(360deg); } }`;

// ── Styles ─────────────────────────────────────────────────────────
const S = {
  overlay: {
    position: 'fixed', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 2500, padding: 16
  },
  panel: {
    backgroundColor: 'white', borderRadius: 16,
    width: '100%', maxWidth: 740,
    maxHeight: '92vh',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
  },
  panelHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '20px 24px 12px',
    background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
    color: 'white'
  },
  panelTitle: { margin: 0, fontSize: 20, fontWeight: 700, color: 'white' },
  panelSubtitle: { margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,.8)' },
  closeBtn: {
    background: 'rgba(255,255,255,.2)', border: 'none',
    color: 'white', fontSize: 20, width: 34, height: 34,
    borderRadius: '50%', cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0
  },

  tabRow: {
    display: 'flex', borderBottom: '2px solid #f0f0f0',
    padding: '0 24px', backgroundColor: '#fafafa'
  },
  tabBtn: {
    padding: '12px 20px', fontSize: 14, fontWeight: 500,
    border: 'none', backgroundColor: 'transparent',
    color: '#666', cursor: 'pointer', borderBottom: '3px solid transparent',
    marginBottom: -2, transition: 'all .2s'
  },
  tabBtnActive: { color: '#4F46E5', borderBottomColor: '#4F46E5', fontWeight: 700 },

  scrollBody: { flex: 1, overflowY: 'auto', padding: '20px 24px' },

  centeredMsg: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '50px 20px', textAlign: 'center'
  },
  spinner: {
    width: 40, height: 40,
    border: '4px solid #e0e0e0', borderTop: '4px solid #4F46E5',
    borderRadius: '50%', animation: 'spin 1s linear infinite'
  },

  statusBar: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 16px', borderRadius: 10,
    border: '2px solid', marginBottom: 18
  },
  statusDot: (status) => ({
    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
    backgroundColor: status === 'active' ? '#25D366' : status === 'finished' ? '#ccc' : '#FFA500',
    animation: status === 'active' ? 'pulse 1.5s infinite' : 'none'
  }),
  statusText: { fontSize: 14, fontWeight: 600, color: '#333' },

  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 12, marginBottom: 22 },
  statCard: {
    backgroundColor: '#f8f9fa', borderRadius: 12, padding: '14px 10px',
    textAlign: 'center', border: '1px solid #eee'
  },
  statEmoji: { fontSize: 24, marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: 700, color: '#4F46E5' },
  statLabel: { fontSize: 12, color: '#666', marginTop: 2 },

  section: { marginBottom: 22 },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: '#333', margin: '0 0 12px' },

  emptyBox: {
    textAlign: 'center', padding: '30px 20px',
    backgroundColor: '#f8f9fa', borderRadius: 12,
    border: '2px dashed #e0e0e0'
  },
  emptyText: { fontSize: 15, fontWeight: 600, color: '#555', margin: '0 0 6px' },
  emptySubtext: { fontSize: 13, color: '#888', margin: 0 },

  studentGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 },
  studentChip: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
    borderRadius: 8, border: '1px solid', transition: 'all .2s'
  },
  studentAvatar: {
    width: 28, height: 28, borderRadius: '50%', color: 'white',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 700, flexShrink: 0
  },
  studentName: { fontSize: 13, fontWeight: 500, color: '#333', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  studentScore: { fontSize: 11, fontWeight: 700, color: '#4F46E5' },

  progressTrack: { height: 12, backgroundColor: '#e0e0e0', borderRadius: 6, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', backgroundColor: '#25D366', borderRadius: 6, transition: 'width .5s ease' },
  progressLabel: { fontSize: 13, color: '#666', textAlign: 'center', margin: 0 },

  questionPreview: {
    backgroundColor: '#f8f9fa', borderRadius: 12,
    padding: '16px 18px', border: '1px solid #e0e0e0'
  },
  qpTypeBadge: {
    display: 'inline-block', padding: '3px 10px', borderRadius: 10,
    backgroundColor: '#E3F2FD', color: '#1565C0',
    fontSize: 12, fontWeight: 600, marginBottom: 10,
    textTransform: 'capitalize'
  },
  qpText: { fontSize: 16, fontWeight: 600, color: '#1a1a1a', margin: '0 0 14px', lineHeight: 1.4 },
  qpOptions: { display: 'flex', flexDirection: 'column', gap: 8 },
  qpOption: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px', borderRadius: 8, fontSize: 14, color: '#333'
  },
  correctTag: {
    marginLeft: 'auto', padding: '2px 8px', backgroundColor: '#25D366',
    color: 'white', borderRadius: 10, fontSize: 11, fontWeight: 700
  },
  qpFillAnswer: {
    padding: '10px 14px', backgroundColor: '#D7F0DD',
    borderRadius: 8, fontSize: 14, color: '#2E7D32', fontWeight: 500,
    border: '1px solid #25D366'
  },

  lbRow: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
    backgroundColor: '#f8f9fa', borderRadius: 8, marginBottom: 8,
    border: '1px solid #eee'
  },
  lbRank: { fontSize: 20, minWidth: 32, textAlign: 'center' },
  lbName: { flex: 1, fontSize: 14, fontWeight: 500, color: '#333' },
  lbScore: { fontSize: 15, fontWeight: 700, color: '#4F46E5' },
  lbStreak: { fontSize: 13, color: '#FFA500', fontWeight: 600 },

  // ✅ NEW: Question Summary flash (teacher, while active)
  qSummaryRow: { display: 'flex', gap: 10, marginBottom: 10 },
  qSummaryStat: { flex: 1, textAlign: 'center', padding: '12px', backgroundColor: '#F9FAFB', borderRadius: 10, border: '1px solid #eee' },
  qSummaryValue: { fontSize: 22, fontWeight: 800, color: '#4F46E5' },
  qSummaryLabel: { fontSize: 11, color: '#6B7280', fontWeight: 600, marginTop: 2 },
  qSummaryFastest: { fontSize: 12, color: '#92400E', backgroundColor: '#FFF7E6', border: '1px solid #FFD580', borderRadius: 8, padding: '8px 12px', margin: 0 },
  mvpCallout: { fontSize: 13, color: '#92400E', backgroundColor: '#FFF7E6', border: '1px solid #FFD580', borderRadius: 8, padding: '8px 12px', marginBottom: 10 },

  // ✅ NEW: shared avatar placeholder — colored circle + initial, same pattern used
  // everywhere else in the app; the exact spot a full-body avatar replaces later.
  avatarPlaceholderCircle: { width: 40, height: 40, borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0 },
  avatarPlaceholderRow: { display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 },

  // ✅ NEW: finished-state Individual Podium / Team celebration (teacher)
  celebrationLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: '#9CA3AF', marginBottom: 12, textAlign: 'center' },
  podiumSection: { textAlign: 'center', marginBottom: 20, padding: 18, backgroundColor: '#F9FAFB', borderRadius: 14 },
  podiumRow: { display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 12 },
  podiumSlot: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: 80 },
  podiumSlotEmpty: { width: 80 },
  podiumAvatar: { width: 48, height: 48, fontSize: 18, marginBottom: 6 },
  podiumName: { fontSize: 12, fontWeight: 600, color: '#1a1a1a', marginBottom: 6, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  podiumStand: { width: '100%', borderRadius: '6px 6px 0 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 6 },
  podiumPlace: { fontSize: 15, fontWeight: 800, color: 'white' },
  // Milestone 11: emote badge on a podium finisher's avatar + column-wise team standings
  podiumEmoteBadge: { position: 'absolute', bottom: -4, right: -4, fontSize: 14, backgroundColor: 'white', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' },
  teamColumnsRow: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 },
  teamColumn: { flex: '1 1 140px', minWidth: 140, borderRadius: 10, borderWidth: 2, borderStyle: 'solid', padding: 10, backgroundColor: '#F9FAFB' },
  teamColumnHeader: { fontSize: 13, fontWeight: 700, color: '#1a1a1a', marginBottom: 4 },
  teamColumnScore: { fontSize: 11, color: '#6B7280', fontWeight: 600, marginBottom: 6 },
  teamColumnMembers: { display: 'flex', flexDirection: 'column', gap: 5 },
  teamColumnMemberRow: { display: 'flex', alignItems: 'center', gap: 5 },
  teamColumnMemberName: { fontSize: 11, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  teamColumnMemberScore: { fontSize: 11, fontWeight: 700, color: '#4F46E5' },
  teamCelebrationCard: { textAlign: 'center', marginBottom: 20, padding: '20px 16px', backgroundColor: '#F9FAFB', borderRadius: 14 },
  teamCelebrationIcon: { fontSize: 32, marginBottom: 4 },
  teamCelebrationName: { fontSize: 18, fontWeight: 800, color: '#1a1a1a' },
  teamCelebrationScore: { fontSize: 13, color: '#6B7280', fontWeight: 600, marginTop: 4 },
  savedNote: { textAlign: 'center', fontSize: 12, color: '#25D366', fontWeight: 600, marginTop: 4 },

  questionsList: { display: 'flex', flexDirection: 'column', gap: 8 },
  questionItem: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, backgroundColor: '#f8f9fa', borderRadius: 8, border: '1px solid #eee' },
  questionItemNum: {
    padding: '4px 10px', backgroundColor: '#4F46E5', color: 'white',
    borderRadius: 8, fontSize: 12, fontWeight: 700, flexShrink: 0
  },
  questionItemText: { flex: 1, fontSize: 14, color: '#333' },
  questionItemMeta: { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' },
  questionTypePill: {
    padding: '2px 8px', borderRadius: 8,
    backgroundColor: '#E8EAF6', color: '#3949AB',
    fontSize: 11, fontWeight: 600, textTransform: 'capitalize'
  },
  questionPts: { fontSize: 11, fontWeight: 600, color: '#25D366' },

  // ✅ NEW: per-student review cards (history drill-down)
  answerCard: { padding: 12, backgroundColor: '#f8f9fa', borderRadius: 8, border: '1px solid #eee' },
  answerHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 },
  answerResult: { flex: 1, fontSize: 13, fontWeight: 700 },
  answerQuestionText: { margin: 0, fontSize: 14, color: '#333' },
  answerExplanation: { margin: '8px 0 0', fontSize: 12, color: '#666', fontStyle: 'italic' },

  // History
  histCard: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 16px', backgroundColor: 'white',
    borderRadius: 10, border: '1px solid #eee',
    cursor: 'pointer', marginBottom: 10,
    transition: 'all .2s',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
  },
  histCardLeft: { flex: 1 },
  histTitle: { fontSize: 15, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 },
  histMeta: { display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: '#666', marginBottom: 4 },
  histArrow: { fontSize: 22, color: '#ccc' },

  histDetailHeader: { marginBottom: 18 },
  histDetailTitle: { fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: '0 0 8px' },
  histDetailMeta: { display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: '#666' },

  backBtn: {
    padding: '8px 16px', marginBottom: 18, fontSize: 14, fontWeight: 600,
    backgroundColor: '#f0f0f0', color: '#333', border: 'none',
    borderRadius: 8, cursor: 'pointer'
  },

  footer: {
    display: 'flex', gap: 10, padding: '14px 24px',
    borderTop: '1px solid #f0f0f0', backgroundColor: '#fafafa',
    justifyContent: 'flex-end', flexWrap: 'wrap'
  },
  cancelBtn: {
    padding: '11px 22px', fontSize: 14, fontWeight: 600,
    backgroundColor: '#f0f0f0', color: '#333', border: 'none',
    borderRadius: 8, cursor: 'pointer'
  },
  primaryBtn: {
    padding: '11px 22px', fontSize: 14, fontWeight: 700,
    color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer',
    transition: 'all .2s'
  },
  createBtn: {
    padding: '12px 24px', fontSize: 15, fontWeight: 700,
    backgroundColor: '#4F46E5', color: 'white', border: 'none',
    borderRadius: 10, cursor: 'pointer'
  }
};

export default QuizControlPanel;