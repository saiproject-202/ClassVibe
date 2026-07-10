// frontend/src/components/QuizHistoryPanel.jsx
// Shows past completed quizzes for a classroom.
//
// This replaces QuizControlPanel.jsx, which used to have TWO jobs in one component:
// a "Live Control" tab (Start/Next/End buttons that called REST endpoints that don't
// exist on the backend — they always 404'd) and a "History" tab (which worked fine).
// Live quiz control now always happens in QuizHost.jsx (the screen that actually works).
// This component keeps only the part that already worked: browsing quiz history.

import React, { useState, useEffect, useCallback } from 'react';

const API = process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com';

const QuizHistoryPanel = ({ groupId, onClose, onStartQuiz }) => {
  const [quizHistory, setQuizHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [selectedHistory, setSelectedHistory] = useState(null);

  const token = localStorage.getItem('token');

  const fetchHistory = useCallback(async () => {
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
  }, [groupId, token]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

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

  return (
    <div style={S.overlay}>
      <style>{KEYFRAMES}</style>
      <div style={S.panel}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={S.panelHeader}>
          <div>
            <h2 style={S.panelTitle}>📋 Quiz History</h2>
            <p style={S.panelSubtitle}>Past quizzes for this classroom</p>
          </div>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>

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
              <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Completed quizzes will appear here</p>
              {onStartQuiz && (
                <button onClick={onStartQuiz} style={S.createBtn}>+ Create New Quiz</button>
              )}
            </div>
          ) : selectedHistory ? (
            // ── History detail ──────────────────────────────────
            <div>
              <button onClick={() => setSelectedHistory(null)} style={S.backBtn}>← Back to list</button>

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
                      <div key={i} style={S.lbRow}>
                        <div style={S.lbRank}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                        </div>
                        <div style={S.lbName}>{p.user?.name || p.name || 'Student'}</div>
                        <div style={S.lbScore}>{p.score} pts</div>
                        <div style={{ fontSize: 13, color: '#888' }}>
                          {p.answers?.filter(a => a.isCorrect).length || 0}/
                          {p.answers?.length || 0} ✓
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {/* Questions + answers */}
              {selectedHistory.quiz?.questions && (
                <div style={S.section}>
                  <h3 style={S.sectionTitle}>📝 Question List ({selectedHistory.quiz.questions.length})</h3>
                  {selectedHistory.quiz.questions.map((q, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12, padding: 14, backgroundColor: 'white', borderRadius: 10, border: '1px solid #eee' }}>
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
                  ))}
                </div>
              )}
            </div>
          ) : (
            // ── History list ────────────────────────────────────
            <div>
              <div style={S.listHeader}>
                <h3 style={{ ...S.sectionTitle, margin: 0 }}>Past Quizzes ({quizHistory.length})</h3>
                {onStartQuiz && (
                  <button onClick={onStartQuiz} style={S.newQuizBtn}>+ New Quiz</button>
                )}
              </div>
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
      </div>
    </div>
  );
};

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
    padding: '20px 24px',
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

  lbRow: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
    backgroundColor: '#f8f9fa', borderRadius: 8, marginBottom: 8,
    border: '1px solid #eee'
  },
  lbRank: { fontSize: 20, minWidth: 32, textAlign: 'center' },
  lbName: { flex: 1, fontSize: 14, fontWeight: 500, color: '#333' },
  lbScore: { fontSize: 15, fontWeight: 700, color: '#4F46E5' },

  questionItemNum: {
    padding: '4px 10px', backgroundColor: '#4F46E5', color: 'white',
    borderRadius: 8, fontSize: 12, fontWeight: 700, flexShrink: 0
  },
  questionTypePill: {
    padding: '2px 8px', borderRadius: 8,
    backgroundColor: '#E8EAF6', color: '#3949AB',
    fontSize: 11, fontWeight: 600, textTransform: 'capitalize'
  },
  questionPts: { fontSize: 11, fontWeight: 600, color: '#25D366' },

  listHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16
  },
  newQuizBtn: {
    padding: '8px 16px', fontSize: 13, fontWeight: 700,
    backgroundColor: '#4F46E5', color: 'white', border: 'none',
    borderRadius: 8, cursor: 'pointer'
  },

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

  createBtn: {
    padding: '12px 24px', fontSize: 15, fontWeight: 700,
    backgroundColor: '#4F46E5', color: 'white', border: 'none',
    borderRadius: 10, cursor: 'pointer'
  }
};

export default QuizHistoryPanel;
