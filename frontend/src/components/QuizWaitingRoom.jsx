// frontend/src/components/QuizWaitingRoom.jsx
// Student waiting lobby before quiz starts
// ✅ NEW (Phase 3 — TEAM_MODE_DESIGN.md §3/§7): "Choose your Team" selection, shown
// only when the session is in team mode (session.teams non-empty).

import React, { useState, useEffect, useRef } from 'react';

const QuizWaitingRoom = ({ session, onClose, socket }) => {
  const [participants, setParticipants] = useState(session?.participants || []);
  const [status, setStatus] = useState(session?.status || 'waiting');

  const sessionId = session?._id || session?.sessionId;
  // Matches the same pattern used in QuizPlayer.jsx for consistency
  const userId = useRef(JSON.parse(localStorage.getItem('user') || '{}')?.id).current;

  // ✅ NEW (Phase 3): team state — teams list comes from the session itself (snapshotted
  // server-side at session creation, see routes/quiz.js), roster counts + my own pick
  // update live as students join teams
  const [teams] = useState(session?.teams || []);
  const [teamRosterCounts, setTeamRosterCounts] = useState({});
  const [myTeamId, setMyTeamId] = useState(() => {
    const me = (session?.participants || []).find(p => String(p.user) === String(userId));
    return me?.teamId || null;
  });
  const [teamFullMessage, setTeamFullMessage] = useState('');
  const allowStudentChoice = session?.sessionSettings?.allowStudentChoice !== false;

  const handleSelectTeam = (teamId) => {
    if (!socket || !sessionId || !allowStudentChoice) return;
    setTeamFullMessage('');
    socket.emit('student:selectTeam', { sessionId, teamId });
  };

  useEffect(() => {
    if (!socket) return;

    // Listen for other students joining (backend emits 'student:joined')
    socket.on('student:joined', (data) => {
      console.log('👤 New participant:', data);
      setParticipants(prev => {
        if (prev.find(p => p.userId === data.userId)) return prev;
        return [...prev, data];
      });
    });

    // ✅ NEW (Phase 3): team roster updates — fires for every pick (including the
    // teacher's lock-in auto-assignment at quiz start, which sends userId: null)
    socket.on('team:assigned', (data) => {
      setTeamRosterCounts(data.teamRosterCounts || {});
      if (data.userId && String(data.userId) === String(userId)) {
        setMyTeamId(data.teamId);
      }
    });

    socket.on('team:full', (data) => {
      setTeamFullMessage(`That team is full right now — try another.`);
    });

    // Listen for quiz starting
    socket.on('quiz:started', (data) => {
      console.log('🚀 Quiz started!');
      setStatus('active');
      // Auto-close waiting room and open quiz player
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('startQuiz', { detail: data }));
      }, 500);
    });

    return () => {
      socket.off('student:joined');
      socket.off('team:assigned');
      socket.off('team:full');
      socket.off('quiz:started');
    };
  }, [socket, userId]);

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>
            {status === 'waiting' ? '⏳ Waiting for Quiz to Start' : '🎮 Quiz Starting!'}
          </h2>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        {/* Status Message */}
        <div style={styles.statusSection}>
          {status === 'waiting' ? (
            <>
              <div style={styles.statusIcon}>⏳</div>
              <h3 style={styles.statusTitle}>Get Ready!</h3>
              <p style={styles.statusText}>
                Your teacher is preparing the quiz. Stay on this page.
              </p>
            </>
          ) : (
            <>
              <div style={styles.statusIcon}>🚀</div>
              <h3 style={styles.statusTitle}>Quiz is Starting!</h3>
              <p style={styles.statusText}>
                Get ready to answer questions...
              </p>
            </>
          )}
        </div>

        {/* ✅ NEW (Phase 3): Choose your Team — only rendered in team mode */}
        {teams.length > 0 && (
          <div style={styles.teamSection}>
            <h4 style={styles.sectionTitle}>
              {allowStudentChoice ? '🏆 Choose your Team' : '🏆 Your Team'}
            </h4>
            {!allowStudentChoice && !myTeamId && (
              <p style={styles.emptyText}>Your teacher will assign your team when the quiz starts.</p>
            )}
            <div style={styles.teamGrid}>
              {teams.map(team => {
                const count = teamRosterCounts[team.teamId] ?? 0;
                const isMine = myTeamId === team.teamId;
                return (
                  <div
                    key={team.teamId}
                    onClick={() => allowStudentChoice && handleSelectTeam(team.teamId)}
                    style={{
                      ...styles.teamCard,
                      borderColor: isMine ? (team.color || 'var(--cv-accent)') : '#e0e0e0',
                      backgroundColor: isMine ? `${team.color || 'var(--cv-accent)'}1A` : '#fff',
                      cursor: allowStudentChoice ? 'pointer' : 'default'
                    }}
                  >
                    <div style={styles.teamCardIcon}>{team.icon || '🏳️'}</div>
                    <div style={styles.teamCardName}>{team.name}</div>
                    <div style={styles.teamCardCount}>{count} joined</div>
                    {isMine && <div style={{ ...styles.teamCardBadge, backgroundColor: team.color || 'var(--cv-accent)' }}>You're here</div>}
                  </div>
                );
              })}
            </div>
            {teamFullMessage && <p style={styles.teamFullMsg}>{teamFullMessage}</p>}
          </div>
        )}

        {/* Participants List */}
        <div style={styles.participantsSection}>
          <h4 style={styles.sectionTitle}>
            👥 Participants ({participants.length})
          </h4>
          
          {participants.length === 0 ? (
            <p style={styles.emptyText}>You're the first one here!</p>
          ) : (
            <div style={styles.participantsGrid}>
              {participants.map((p, index) => (
                <div key={index} style={styles.participantChip}>
                  <div style={styles.participantAvatar}>
                    {p.user?.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <span style={styles.participantName}>
                    {p.user?.name || 'Student'}
                  </span>
                  {index === 0 && (
                    <span style={styles.firstBadge}>1st</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tips Section */}
        <div style={styles.tipsSection}>
          <h4 style={styles.tipsTitle}>💡 Quick Tips</h4>
          <ul style={styles.tipsList}>
            <li style={styles.tipItem}>Read each question carefully</li>
            <li style={styles.tipItem}>Faster correct answers = more points</li>
            <li style={styles.tipItem}>You can't change answers after submitting</li>
            <li style={styles.tipItem}>Stay focused and have fun! 🎯</li>
          </ul>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <div style={styles.waitingIndicator}>
            <div style={styles.pulsingDot} />
            <span style={styles.waitingText}>Waiting for teacher to start...</span>
          </div>
        </div>

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.2); }
          }
        `}</style>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '600px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '2px solid #e0e0e0',
    backgroundColor: '#075E54'
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '600',
    color: 'white'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: 'white'
  },
  statusSection: {
    padding: '40px 20px',
    textAlign: 'center',
    backgroundColor: '#f8f9fa',
    borderBottom: '1px solid #e0e0e0'
  },
  statusIcon: {
    fontSize: '64px',
    marginBottom: '15px'
  },
  statusTitle: {
    margin: '0 0 10px 0',
    fontSize: '24px',
    fontWeight: '600',
    color: '#075E54'
  },
  statusText: {
    margin: 0,
    fontSize: '14px',
    color: '#666'
  },
  participantsSection: {
    padding: '20px',
    borderBottom: '1px solid #e0e0e0'
  },
  // ✅ NEW (Phase 3): team selection
  teamSection: {
    padding: '20px',
    borderBottom: '1px solid #e0e0e0'
  },
  teamGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: '12px'
  },
  teamCard: {
    padding: '14px',
    borderRadius: '12px',
    border: '2px solid #e0e0e0',
    textAlign: 'center',
    transition: 'all 0.15s',
    position: 'relative'
  },
  teamCardIcon: { fontSize: '28px', marginBottom: '6px' },
  teamCardName: { fontSize: '14px', fontWeight: '700', color: '#1a1a1a', marginBottom: '2px' },
  teamCardCount: { fontSize: '12px', color: '#666' },
  teamCardBadge: {
    marginTop: '8px', display: 'inline-block', padding: '3px 10px',
    borderRadius: '10px', fontSize: '11px', fontWeight: '700', color: 'white'
  },
  teamFullMsg: { marginTop: '12px', fontSize: '13px', color: '#DC2626', textAlign: 'center' },
  sectionTitle: {
    margin: '0 0 15px 0',
    fontSize: '16px',
    fontWeight: '600',
    color: '#333'
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: '14px',
    padding: '20px'
  },
  participantsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '10px',
    maxHeight: '200px',
    overflowY: 'auto'
  },
  participantChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px',
    backgroundColor: '#D7F0DD',
    borderRadius: '8px',
    border: '1px solid #25D366'
  },
  participantAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: '#075E54',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: '600',
    flexShrink: 0
  },
  participantName: {
    flex: 1,
    fontSize: '13px',
    fontWeight: '500',
    color: '#333'
  },
  firstBadge: {
    padding: '3px 8px',
    backgroundColor: '#FFD700',
    color: '#333',
    borderRadius: '10px',
    fontSize: '10px',
    fontWeight: '700'
  },
  tipsSection: {
    padding: '20px',
    backgroundColor: '#fff9e6',
    flex: 1,
    overflowY: 'auto'
  },
  tipsTitle: {
    margin: '0 0 15px 0',
    fontSize: '16px',
    fontWeight: '600',
    color: '#FFA500'
  },
  tipsList: {
    margin: 0,
    paddingLeft: '20px'
  },
  tipItem: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '8px'
  },
  footer: {
    padding: '15px 20px',
    borderTop: '1px solid #e0e0e0',
    backgroundColor: '#f8f9fa'
  },
  waitingIndicator: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px'
  },
  pulsingDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: '#25D366',
    animation: 'pulse 2s ease-in-out infinite'
  },
  waitingText: {
    fontSize: '14px',
    color: '#666',
    fontWeight: '500'
  }
};

export default QuizWaitingRoom;