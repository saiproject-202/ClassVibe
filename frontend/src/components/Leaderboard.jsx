// frontend/src/components/Leaderboard.jsx
// ✅ COLOR SCHEME UPDATE — matches new indigo/slate design language
//
// Changes: WhatsApp green (#25D366, #075E54, #D7F0DD)
//       → indigo/slate  (var(--cv-accent-mid), #1e293b, #eef2ff)
// All logic — fetch, ranking, myRank, badges — 100% UNCHANGED

import React, { useState, useEffect, useCallback } from 'react';

const Leaderboard = ({ sessionId, myScore, onClose }) => {
  const [rankings, setRankings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [myRank,   setMyRank]   = useState(null);

  // ── Fetch leaderboard — UNCHANGED ────────────────────────────────────────
  const fetchLeaderboard = useCallback(async () => {
    try {
      const token    = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com'}/api/quiz/session/${sessionId}/leaderboard`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.ok) {
        const data   = await response.json();
        setRankings(data.leaderboard);
        const user   = JSON.parse(localStorage.getItem('user'));
        const userId = user?._id;
        const idx    = data.leaderboard.findIndex(r => r.userId === userId);
        setMyRank(idx + 1);
        setLoading(false);
      }
    } catch (err) {
      console.error('Leaderboard error:', err);
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  // ── Badge helper — UNCHANGED ──────────────────────────────────────────────
  const getBadge = (rank) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '🎖️';
  };

  if (loading) return <div style={S.loading}>Loading rankings...</div>;

  // ════════════════════════════════════════════════════════════════════════
  return (
    <div style={S.overlay}>
      <div style={S.container}>

        {/* Header */}
        <div style={S.header}>
          <h2 style={S.title}>🏆 Leaderboard</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>

        {/* My rank card */}
        {myRank && (
          <div style={S.myRankCard}>
            <div style={S.myRankBadge}>{getBadge(myRank)}</div>
            <div>
              <div style={S.myRankLabel}>Your Rank</div>
              <div style={S.myRankNumber}>#{myRank}</div>
            </div>
            <div style={S.myScore}>{myScore} pts</div>
          </div>
        )}

        {/* Rankings list */}
        <div style={S.list}>
          {rankings.map((player, index) => (
            <div
              key={player.userId}
              style={{
                ...S.rankItem,
                backgroundColor: index < 3 ? '#f8faff' : '#ffffff',
                border:          index < 3 ? '2px solid var(--cv-accent-mid)' : '1px solid #e2e8f0',
              }}
            >
              <div style={S.rankLeft}>
                <span style={S.badge}>{getBadge(index + 1)}</span>
                <div>
                  <div style={S.playerName}>{player.user?.name || 'Player'}</div>
                  <div style={S.playerStats}>
                    {player.correctAnswers}/{player.answersCount} correct
                  </div>
                </div>
              </div>
              <div style={S.playerScore}>{player.score} pts</div>
            </div>
          ))}
        </div>

        {/* Continue button */}
        <button onClick={onClose} style={S.continueBtn}>Continue</button>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
//  STYLES — indigo/slate palette (matches rest of redesigned UI)
// ══════════════════════════════════════════════════════════════════════════
const S = {

  loading: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)',
    color: 'white',
    zIndex: 2001,
  },

  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(15,23,42,0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2001,
  },

  container: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '90%',
    maxWidth: 560,
    maxHeight: '88vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
    overflow: 'hidden',
  },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid #e2e8f0',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: '-0.3px',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 22,
    cursor: 'pointer',
    color: '#94a3b8',
    padding: '2px 6px',
    borderRadius: 6,
    lineHeight: 1,
  },

  // My rank card — light indigo tint
  myRankCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    margin: '20px 24px 8px',
    padding: '18px 20px',
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    border: '2px solid #c7d2fe',
    flexShrink: 0,
  },
  myRankBadge:  { fontSize: 44 },
  myRankLabel:  { fontSize: 11, color: 'var(--cv-accent-mid)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' },
  myRankNumber: { fontSize: 30, fontWeight: '800', color: '#1e293b', lineHeight: 1.2 },
  myScore: {
    marginLeft: 'auto',
    fontSize: 22,
    fontWeight: '800',
    color: 'var(--cv-accent-mid)',
  },

  // Rankings list
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 24px',
  },
  rankItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    marginBottom: 10,
    borderRadius: 10,
    transition: 'transform 0.15s',
  },
  rankLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  badge:       { fontSize: 30 },
  playerName:  { fontSize: 15, fontWeight: '600', color: '#1e293b', marginBottom: 3 },
  playerStats: { fontSize: 12, color: '#64748b' },
  playerScore: { fontSize: 18, fontWeight: '800', color: 'var(--cv-accent-mid)' },

  // Continue button — indigo
  continueBtn: {
    margin: '16px 24px 20px',
    padding: '14px',
    fontSize: 15,
    fontWeight: '700',
    backgroundColor: 'var(--cv-accent-mid)',
    color: '#ffffff',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 0.2s',
  },
};

export default Leaderboard;