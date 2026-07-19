// frontend/src/components/MyProfile.jsx
//
// Milestone 5: Student "My Profile" screen. Same person as TeacherProfile,
// opposite register — fun, personal, built entirely from things the student
// actually earned. The avatar itself is still the colored-circle-with-initial
// placeholder used everywhere else in the app (no real Boy/Girl rig exists
// yet — see AVATAR_ASSET_CHECKLIST.md); the "aura ring" around it is a real
// decorative gradient, not a stand-in for 3D avatar art.

import React, { useState, useEffect, useCallback } from 'react';
import { getStudentProfile } from '../api';

const getInitials = (name) => (name || '??').trim().substring(0, 2).toUpperCase();

const formatBadgeLabel = (slug) =>
  slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const MyProfile = ({ onClose, onEditAvatar, onViewRewards }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getStudentProfile();
      setProfile(data);
    } catch (err) {
      setError('Could not load your profile. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={styles.overlay}>
        <div style={styles.loadingBox}>Loading profile…</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={styles.overlay}>
        <div style={styles.loadingBox}>
          <p>{error || 'Failed to load profile.'}</p>
          <button onClick={onClose} style={styles.secondaryBtn}>Close</button>
        </div>
      </div>
    );
  }

  const avatar = profile.avatar || {};
  const badges = avatar.badges || [];
  const { streak, wins, topPercentile } = profile.stats;

  return (
    <div style={styles.overlay}>
      <div style={styles.phone}>
        <div style={styles.header}>
          <div style={styles.headerTop}>
            <span style={styles.headerTitle}>MY PROFILE</span>
            <button onClick={onClose} style={styles.closeBtn} aria-label="Close">✕</button>
          </div>

          <div style={styles.avatarWrap}>
            <div style={styles.auraRing}>
              <div style={styles.avatarCircle}>{getInitials(profile.name)}</div>
            </div>
            {badges.length > 0 && (
              <div style={styles.badgeCountBubble}>{badges.length}</div>
            )}
          </div>

          <p style={styles.name}>{profile.name}</p>
          {avatar.title ? (
            <p style={styles.title}>🚀 “{avatar.title}”</p>
          ) : (
            <p style={styles.titleEmpty}>No title yet</p>
          )}

          <button onClick={onEditAvatar} style={styles.editAvatarBtn}>✏️ Edit Avatar</button>
        </div>

        <div style={styles.body}>
          {error && <div style={styles.errorBanner}>{error}</div>}

          {/* Stat row */}
          <div style={styles.statRow}>
            <div style={styles.statCard}>
              <p style={styles.statValue}>🔥 {streak}-day</p>
              <p style={styles.statLabel}>Streak</p>
            </div>
            <div style={styles.statCard}>
              <p style={styles.statValue}>🏅 {wins}</p>
              <p style={styles.statLabel}>{wins === 1 ? 'Win' : 'Wins'}</p>
            </div>
            <div style={styles.statCard}>
              <p style={styles.statValue}>⭐ {topPercentile !== null ? `Top ${topPercentile}%` : '—'}</p>
              <p style={styles.statLabel}>{topPercentile !== null ? 'This week' : 'Not enough data yet'}</p>
            </div>
          </div>

          {/* Badge case */}
          <div style={styles.sectionHeaderRow}>
            <p style={styles.sectionLabel}>Badge case</p>
            <button onClick={onViewRewards} style={styles.viewAllLink}>View all →</button>
          </div>
          {badges.length === 0 ? (
            <p style={styles.emptyHint}>No badges earned yet — keep playing quizzes!</p>
          ) : (
            <div style={styles.badgeRow}>
              {badges.map((slug) => (
                <div key={slug} style={styles.badgeChip} title={formatBadgeLabel(slug)}>
                  🏅
                </div>
              ))}
            </div>
          )}

          {/* Favorite celebration */}
          <p style={styles.sectionLabel}>Favorite celebration</p>
          <div style={styles.card}>
            {avatar.favoriteEmote ? (
              <>
                <p style={styles.celebrationTitle}>{avatar.favoriteEmote}</p>
                <p style={styles.celebrationHint}>Plays when you hit the podium</p>
              </>
            ) : (
              <p style={styles.emptyHint}>Not set yet — choose one in Avatar Builder</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(15, 17, 30, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 16
  },
  phone: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90vh',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(15, 17, 30, 0.25)'
  },
  loadingBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    textAlign: 'center',
    color: '#4B5168'
  },
  header: {
    background: 'linear-gradient(180deg, #7C6EE8 0%, #6C5CE7 100%)',
    padding: '16px 20px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  headerTop: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1,
    color: '#FFFFFF'
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#E4E1FA',
    fontSize: 16,
    cursor: 'pointer',
    padding: 2
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 10
  },
  auraRing: {
    width: 96,
    height: 96,
    borderRadius: '50%',
    padding: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'conic-gradient(from 0deg, #FF7AC6, #FFB86B, #7CE8B0, #6EC6FF, #B58CFF, #FF7AC6)'
  },
  avatarCircle: {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    backgroundColor: 'var(--cv-accent-light)',
    color: 'var(--cv-accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 26,
    fontWeight: 700,
    border: '3px solid #FFFFFF'
  },
  badgeCountBubble: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1E1B3A',
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 5px',
    border: '2px solid #FFFFFF'
  },
  name: {
    margin: 0,
    fontSize: 17,
    fontWeight: 700,
    color: '#FFFFFF'
  },
  title: {
    margin: '4px 0 0',
    fontSize: 13,
    fontWeight: 600,
    color: '#FFD9A0'
  },
  titleEmpty: {
    margin: '4px 0 0',
    fontSize: 12,
    color: '#DCD8F7'
  },
  editAvatarBtn: {
    marginTop: 14,
    padding: '8px 18px',
    borderRadius: 999,
    border: 'none',
    backgroundColor: '#FFFFFF',
    color: '#6C5CE7',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer'
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: 20,
    backgroundColor: '#FFFFFF'
  },
  errorBanner: {
    marginBottom: 12,
    padding: '10px 14px',
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    color: '#B91C1C',
    fontSize: 13
  },
  statRow: {
    display: 'flex',
    gap: 10,
    marginBottom: 20
  },
  statCard: {
    flex: 1,
    backgroundColor: '#F7F7FB',
    borderRadius: 12,
    padding: '14px 6px',
    textAlign: 'center'
  },
  statValue: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: '#1F2333',
    whiteSpace: 'nowrap'
  },
  statLabel: {
    margin: '4px 0 0',
    fontSize: 11,
    color: '#8B90A6'
  },
  sectionLabel: {
    margin: '0 0 10px',
    fontSize: 11,
    fontWeight: 700,
    color: '#8B90A6',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  sectionHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  viewAllLink: {
    background: 'transparent',
    border: 'none',
    color: 'var(--cv-accent)',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    marginBottom: 10
  },
  emptyHint: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 20
  },
  badgeRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 20
  },
  badgeChip: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F7F7FB',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18
  },
  card: {
    backgroundColor: '#F7F7FB',
    borderRadius: 12,
    padding: 14
  },
  celebrationTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: '#1F2333',
    textTransform: 'capitalize'
  },
  celebrationHint: {
    margin: '4px 0 0',
    fontSize: 12,
    color: '#8B90A6'
  },
  secondaryBtn: {
    padding: '8px 14px',
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#E1E3EE',
    backgroundColor: '#FFFFFF',
    color: '#4B5168',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer'
  }
};

export default MyProfile;
