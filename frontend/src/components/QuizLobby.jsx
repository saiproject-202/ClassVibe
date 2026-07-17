// frontend/src/components/QuizLobby.jsx
// Shared pre-quiz lobby for BOTH roles — replaces the old split between QuizWaitingRoom
// (student-only) and QuizControlPanel's embedded "waiting" section (teacher-only).
//
// Teacher: shown right after creating a quiz. Shows the live roster + (read-only) team
// config, and a "Start Quiz" button. Once started, hands off to QuizControlPanel.
//
// Student: shown from the floating quiz button, for BOTH a pre-start joiner (picks a
// team here, then waits for the teacher to start) AND a late joiner into an
// already-active team quiz (must pick a team here before entering — no more silent
// auto-assignment). Once resolved, hands off to QuizPlayer.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import socket from '../socket';
import { SKIN_TONE_SWATCH_HEX } from '../avatarConstants';

const API = process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com';

// ✅ NEW: read-only labels for the Lobby's Quiz Mode display — never editable here,
// just reflects whatever was locked in at Quiz Creator time.
const QUIZ_MODE_LABELS = {
  individual:    { icon: '👤', label: 'Individual' },
  team_battle:   { icon: '⚔️', label: 'Team Battle' },
  random_teams:  { icon: '🎲', label: 'Random Teams' },
  school_house:  { icon: '🏠', label: 'School House' },
  custom_teams:  { icon: '🛠', label: 'Custom Teams' }
};

const QuizLobby = ({ sessionId, groupId, role, onClose, onEnterLive }) => {
  const isTeacher = role === 'teacher';
  const userId = useRef(JSON.parse(localStorage.getItem('user') || '{}')?.id).current;
  const token = localStorage.getItem('token');

  const [loading, setLoading] = useState(true);
  const [quizTitle, setQuizTitle] = useState('');
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [participants, setParticipants] = useState([]); // [{ userId, name, teamId }]
  const [teams, setTeams] = useState([]);
  const [teamRosterCounts, setTeamRosterCounts] = useState({});
  const [myTeamId, setMyTeamId] = useState(null);
  // ✅ NEW: read-only display of the mode locked in at Quiz Creator time — the Lobby
  // never changes this, it only shows it and handles team selection accordingly.
  const [quizMode, setQuizMode] = useState('individual');
  const [allowStudentChoice, setAllowStudentChoice] = useState(true);
  const [teamFullMessage, setTeamFullMessage] = useState('');
  const [quizHasStarted, setQuizHasStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  // ✅ NEW: set only when this quiz's classroom was auto-created by "Create New Quiz"
  // with no classroom open — shown front-and-center so students can join by PIN.
  const [quickQuizPin, setQuickQuizPin] = useState(null);
  const [quickQuizQrCode, setQuickQuizQrCode] = useState(null);

  const recalcTeamCounts = (teamList, participantList) => {
    const counts = {};
    teamList.forEach(t => { counts[t.teamId] = 0; });
    participantList.forEach(p => { if (p.teamId) counts[p.teamId] = (counts[p.teamId] || 0) + 1; });
    return counts;
  };

  // ── Teacher: initial roster/teams come from REST (no join-ack event for teachers) ──
  const fetchActiveSession = useCallback(async () => {
    if (!groupId) { setLoading(false); return; }
    try {
      const res = await fetch(`${API}/api/quiz/group/${groupId}/active`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      const s = data.session;
      if (!s) { setLoading(false); return; }
      setQuizTitle(s.quiz?.title || 'Quiz');
      setTotalQuestions(s.quiz?.questions?.length || 0);
      const teamList = s.teams || [];
      const participantList = (s.participants || []).map(p => ({
        userId: p.user?._id || p.user, name: p.name || p.user?.name || 'Student', teamId: p.teamId || null,
        avatar: p.user?.avatar || null
      }));
      setTeams(teamList);
      setAllowStudentChoice(s.sessionSettings?.allowStudentChoice !== false);
      setQuizMode(s.sessionSettings?.quizMode || 'individual');
      setParticipants(participantList);
      setTeamRosterCounts(recalcTeamCounts(teamList, participantList));
      if (s.group?.isQuickQuiz) {
        setQuickQuizPin(s.group.pin || null);
        setQuickQuizQrCode(s.group.qrCode || null);
      }
      if (s.status === 'active') setQuizHasStarted(true);
    } catch (err) {
      console.warn('QuizLobby fetchActiveSession:', err.message);
    } finally {
      setLoading(false);
    }
  }, [groupId, token]);

  useEffect(() => {
    if (!socket.connected) socket.connect();

    // ✅ FIX (real-time regression): join the session's socket room, and RE-join on every
    // reconnect. Socket.IO rooms do NOT survive a reconnect (ping timeout, network blip,
    // idle, server restart), and nothing here used to re-join — so after any reconnect the
    // client silently stopped receiving ALL session events (student:joined, team:assigned,
    // quiz:started, …). That's why the teacher's lobby roster froze at "0 joined" while
    // students' own lobbies (freshly mounted, still in-room) looked fine, and why a student
    // sitting in the lobby could miss quiz:started and get stranded until a manual reload.
    // App.js re-authenticates on 'connect', and the backend emits 'authenticated' after each
    // (re)auth — so re-joining on 'authenticated' guarantees socket.userId is set first.
    const joinRoom = () => {
      if (isTeacher) {
        socket.emit('teacher:joinSession', { sessionId });
        fetchActiveSession(); // re-sync roster: catch anyone who joined during the disconnect
      } else {
        socket.emit('student:joinQuiz', { sessionId });
      }
    };
    joinRoom();
    socket.on('authenticated', joinRoom);

    const onQuizJoined = (data) => {
      if (data.status === 'completed') {
        setErrorMsg('This quiz has already ended.');
        setLoading(false);
        return;
      }
      setLoading(false);
      setTotalQuestions(data.totalQuestions || 0);
      const teamList = data.teams || [];
      const participantList = data.participants || [];
      setTeams(teamList);
      setMyTeamId(data.myTeamId || null);
      setAllowStudentChoice(data.allowStudentChoice !== false);
      setQuizMode(data.quizMode || 'individual');
      setParticipants(participantList);
      setTeamRosterCounts(recalcTeamCounts(teamList, participantList));
      if (data.status === 'active') setQuizHasStarted(true);
    };

    const onStudentJoined = (data) => {
      setParticipants(prev => {
        if (prev.find(p => String(p.userId) === String(data.userId))) return prev;
        return [...prev, { userId: data.userId, name: data.name, teamId: null, avatar: data.avatar || null }];
      });
    };

    const onTeamAssigned = (data) => {
      setTeamRosterCounts(data.teamRosterCounts || {});
      if (data.userId) {
        setParticipants(prev => prev.map(p =>
          String(p.userId) === String(data.userId) ? { ...p, teamId: data.teamId } : p
        ));
        if (!isTeacher && String(data.userId) === String(userId)) {
          setMyTeamId(data.teamId);
        }
      }
    };

    const onTeamFull = () => setTeamFullMessage('That team is full right now — try another.');
    const onQuizStarted = () => setQuizHasStarted(true);
    // ✅ FIX: this never cleared `loading`, which starts true and is otherwise only ever
    // cleared by a SUCCESSFUL join (quiz:joined / fetchActiveSession). If the join itself
    // failed — a stale/deleted session, a race right as the teacher recreated the quiz,
    // a brief disconnect — the component stayed on the "Loading lobby..." spinner FOREVER,
    // silently hiding the error message underneath it. This was the real cause behind
    // "clicked the floating button and it's not showing the lobby correctly": the lobby
    // WAS opening, it just never got past its own loading screen.
    const onError = (data) => { setErrorMsg(data.message || 'Something went wrong.'); setStarting(false); setLoading(false); };

    socket.on('quiz:joined', onQuizJoined);
    socket.on('student:joined', onStudentJoined);
    socket.on('team:assigned', onTeamAssigned);
    socket.on('team:full', onTeamFull);
    socket.on('quiz:started', onQuizStarted);
    socket.on('error', onError);

    return () => {
      socket.off('authenticated', joinRoom);
      socket.off('quiz:joined', onQuizJoined);
      socket.off('student:joined', onStudentJoined);
      socket.off('team:assigned', onTeamAssigned);
      socket.off('team:full', onTeamFull);
      socket.off('quiz:started', onQuizStarted);
      socket.off('error', onError);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, isTeacher]);

  // ── Hand off to the live view once conditions are met ────────────
  // Teacher: as soon as the quiz has started.
  // Student: quiz has started AND (individual mode OR their team is resolved).
  useEffect(() => {
    if (!quizHasStarted) return;
    if (isTeacher) { onEnterLive(); return; }
    if (teams.length === 0 || myTeamId) onEnterLive();
  }, [quizHasStarted, myTeamId, teams.length, isTeacher, onEnterLive]);

  const [justSelected, setJustSelected] = useState(null);
  const handleSelectTeam = (teamId) => {
    if (isTeacher || !allowStudentChoice) return;
    setTeamFullMessage('');
    setJustSelected(teamId);
    setTimeout(() => setJustSelected(null), 300);
    socket.emit('student:selectTeam', { sessionId, teamId });
  };

  const handleStartQuiz = () => {
    if (starting) return;
    if (participants.length === 0 && !window.confirm('No students have joined yet. Start anyway?')) return;
    setStarting(true);
    socket.emit('teacher:startQuiz', { sessionId });
  };

  const needsTeamPick = !isTeacher && teams.length > 0 && !myTeamId && allowStudentChoice;
  const lateJoin = quizHasStarted && needsTeamPick;

  if (loading) {
    return (
      <div style={styles.overlay}>
        <div style={styles.modal}>
          <div style={styles.loadingBox}>
            <div style={styles.spinner} />
            <p style={{ color: '#666', marginTop: 14 }}>Loading lobby...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>{lateJoin ? '⚡ Quiz is Live!' : '⏳ Lobby'}</h2>
            {quizTitle && <p style={styles.subtitle}>{quizTitle} · {totalQuestions} questions</p>}
          </div>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        {errorMsg && <div style={styles.errorBanner}>{errorMsg}</div>}

        {/* ✅ NEW: join PIN + QR for a quick-quiz classroom (no pre-existing classroom
            open when the teacher hit "Create New Quiz") — the only way students find it */}
        {isTeacher && quickQuizPin && (
          <div style={styles.pinSection}>
            <div style={styles.pinLabel}>JOIN AT CLASSVIBE.IO</div>
            <div style={styles.pinValue}>{quickQuizPin.slice(0, 3)} {quickQuizPin.slice(3)}</div>
            {quickQuizQrCode && <img src={quickQuizQrCode} alt="Scan to join" style={styles.pinQrImg} />}
          </div>
        )}

        {/* Status message */}
        <div style={styles.statusSection}>
          <div style={styles.statusIcon}>{lateJoin ? '⚡' : '⏳'}</div>
          <h3 style={styles.statusTitle}>{lateJoin ? 'Pick your team to jump in' : 'Get Ready!'}</h3>
          <p style={styles.statusText}>
            {lateJoin
              ? 'The quiz has already started — choose a team below and you\'ll join right away.'
              : (isTeacher ? 'Students are joining. Start whenever you\'re ready.' : 'Your teacher is preparing the quiz. Stay on this page.')}
          </p>
        </div>

        {/* ✅ NEW: read-only Quiz Mode label — locked in at Quiz Creator, never editable
            here. Shown regardless of mode (including plain Individual, no teams). */}
        <div style={{ ...styles.modeLabel, padding: '12px 20px 0' }}>
          QUIZ MODE · {QUIZ_MODE_LABELS[quizMode]?.icon || '👤'} {QUIZ_MODE_LABELS[quizMode]?.label || 'Individual'}
        </div>

        {/* Teams */}
        {teams.length > 0 && (
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>
              {isTeacher ? '🏆 Teams' : (allowStudentChoice ? '🏆 Choose your Team' : '🏆 Your Team')}
            </h4>
            {!isTeacher && !allowStudentChoice && !myTeamId && (
              <p style={styles.emptyText}>Assigning your team...</p>
            )}
            <div style={styles.teamGrid}>
              {teams.map(team => {
                const count = teamRosterCounts[team.teamId] ?? 0;
                const isMine = !isTeacher && myTeamId === team.teamId;
                const clickable = !isTeacher && allowStudentChoice;
                return (
                  <div
                    key={team.teamId}
                    onClick={() => clickable && handleSelectTeam(team.teamId)}
                    style={{
                      ...styles.teamCard,
                      borderColor: isMine ? (team.color || '#4F46E5') : '#e0e0e0',
                      backgroundColor: isMine ? `${team.color || '#4F46E5'}1A` : '#fff',
                      cursor: clickable ? 'pointer' : 'default',
                      // ✅ NEW: brief scale-bounce on selection — subtle, not looping
                      animation: justSelected === team.teamId ? 'teamBounce 0.3s ease' : 'none'
                    }}
                  >
                    <div style={styles.teamCardIcon}>{team.icon || '🏳️'}</div>
                    <div style={styles.teamCardName}>{team.name}</div>
                    <div style={styles.teamCardCount}>{count} joined</div>
                    {isMine && <div style={{ ...styles.teamCardBadge, backgroundColor: team.color || '#4F46E5' }}>You're here</div>}
                  </div>
                );
              })}
            </div>
            {teamFullMessage && <p style={styles.teamFullMsg}>{teamFullMessage}</p>}
          </div>
        )}

        {/* Players */}
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>👥 Players ({participants.length})</h4>
          {participants.length === 0 ? (
            <p style={styles.emptyText}>{isTeacher ? 'No students yet.' : "You're the first one here!"}</p>
          ) : (
            <div style={styles.playersGrid}>
              {participants.map((p, i) => {
                const team = teams.find(t => t.teamId === p.teamId);
                // Team color always wins when a team is assigned (identity signal takes
                // priority); otherwise fall back to the student's own real skin tone, then
                // the original fixed green when no avatar data is available at all.
                const avatarColor = team?.color
                  || (p.avatar?.skinTone && SKIN_TONE_SWATCH_HEX[p.avatar.skinTone])
                  || '#075E54';
                const badgeCount = p.avatar?.badges?.length || 0;
                return (
                  <div key={i} style={{ ...styles.playerChip, borderColor: team?.color || '#e0e0e0' }}>
                    <div style={styles.playerAvatarWrap}>
                      <div style={{ ...styles.playerAvatar, backgroundColor: avatarColor }}>
                        {(p.name || 'S').charAt(0).toUpperCase()}
                      </div>
                      {badgeCount > 0 && <span style={styles.playerBadgePip}>{badgeCount}</span>}
                    </div>
                    <div style={styles.playerTextBlock}>
                      <span style={styles.playerName}>{p.name}</span>
                      {p.avatar?.title && <span style={styles.playerTitle}>🚀 {p.avatar.title}</span>}
                    </div>
                    {team && <span style={styles.playerTeamIcon}>{team.icon}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          {isTeacher ? (
            <button onClick={handleStartQuiz} disabled={starting} style={styles.startBtn}>
              {starting ? 'Starting...' : '🚀 Start Quiz'}
            </button>
          ) : (
            <div style={styles.waitingIndicator}>
              <div style={styles.pulsingDot} />
              <span style={styles.waitingText}>
                {lateJoin ? 'Waiting for your team pick...' : 'Waiting for teacher to start...'}
              </span>
            </div>
          )}
        </div>

        <style>{`
          @keyframes teamBounce {
            0% { transform: scale(1); }
            40% { transform: scale(1.06); }
            100% { transform: scale(1); }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.2); }
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  );
};

const styles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '16px' },
  modal: { backgroundColor: 'white', borderRadius: '12px', width: '90%', maxWidth: '600px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  loadingBox: { padding: '60px 20px', textAlign: 'center' },
  spinner: { width: 40, height: 40, border: '4px solid #eee', borderTop: '4px solid #4F46E5', borderRadius: '50%', margin: '0 auto', animation: 'spin 1s linear infinite' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '2px solid #e0e0e0', backgroundColor: '#075E54' },
  title: { margin: 0, fontSize: '20px', fontWeight: '600', color: 'white' },
  subtitle: { margin: '4px 0 0', fontSize: '13px', color: '#D7F0DD' },
  closeBtn: { background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: 'white' },
  errorBanner: { padding: '10px 20px', backgroundColor: '#FEE2E2', color: '#B91C1C', fontSize: '13px', fontWeight: 600 },
  // ✅ NEW: quick-quiz PIN + QR display
  pinSection: { padding: '20px', textAlign: 'center', backgroundColor: '#111827', borderBottom: '1px solid #e0e0e0' },
  pinLabel: { fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', color: '#9CA3AF', marginBottom: '6px' },
  pinValue: { fontSize: '36px', fontWeight: 800, color: 'white', letterSpacing: '4px', marginBottom: '10px' },
  pinQrImg: { width: '110px', height: '110px', borderRadius: '8px', backgroundColor: 'white', padding: '6px' },
  statusSection: { padding: '30px 20px', textAlign: 'center', backgroundColor: '#f8f9fa', borderBottom: '1px solid #e0e0e0' },
  statusIcon: { fontSize: '56px', marginBottom: '12px' },
  statusTitle: { margin: '0 0 8px 0', fontSize: '22px', fontWeight: '600', color: '#075E54' },
  statusText: { margin: 0, fontSize: '14px', color: '#666' },
  section: { padding: '20px', borderBottom: '1px solid #e0e0e0' },
  sectionTitle: { margin: '0 0 15px 0', fontSize: '16px', fontWeight: '600', color: '#333' },
  modeLabel: { fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', color: '#9CA3AF', marginBottom: '8px' },
  emptyText: { textAlign: 'center', color: '#999', fontSize: '14px', padding: '10px' },
  teamGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' },
  teamCard: { padding: '14px', borderRadius: '12px', border: '2px solid #e0e0e0', textAlign: 'center', transition: 'all 0.15s', position: 'relative' },
  teamCardIcon: { fontSize: '28px', marginBottom: '6px' },
  teamCardName: { fontSize: '14px', fontWeight: '700', color: '#1a1a1a', marginBottom: '2px' },
  teamCardCount: { fontSize: '12px', color: '#666' },
  teamCardBadge: { marginTop: '8px', display: 'inline-block', padding: '3px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', color: 'white' },
  teamFullMsg: { marginTop: '12px', fontSize: '13px', color: '#DC2626', textAlign: 'center' },
  playersGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', maxHeight: '220px', overflowY: 'auto' },
  playerChip: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0' },
  playerAvatarWrap: { position: 'relative', flexShrink: 0 },
  playerAvatar: { width: '30px', height: '30px', borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '600' },
  playerBadgePip: { position: 'absolute', bottom: -2, right: -2, minWidth: '14px', height: '14px', borderRadius: '7px', backgroundColor: '#1E1B3A', color: 'white', fontSize: '9px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', border: '1.5px solid #fff' },
  playerTextBlock: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
  playerName: { fontSize: '13px', fontWeight: '500', color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  playerTitle: { fontSize: '10px', fontWeight: '600', color: '#B45309', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  playerTeamIcon: { fontSize: '13px' },
  footer: { padding: '15px 20px', borderTop: '1px solid #e0e0e0', backgroundColor: '#f8f9fa' },
  waitingIndicator: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' },
  pulsingDot: { width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#25D366', animation: 'pulse 2s ease-in-out infinite' },
  waitingText: { fontSize: '14px', color: '#666', fontWeight: '500' },
  startBtn: { width: '100%', padding: '14px', fontSize: '15px', fontWeight: '700', backgroundColor: '#25D366', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer' }
};

export default QuizLobby;
