// frontend/src/components/RewardsLocker.jsx
//
// Milestone 9: Rewards Locker. Shows every badge a student can earn, each one
// cross-referenced against real quiz history — earned badges are colorful with
// a real earn count, locked ones are muted with a hint of how to earn them.
// Nothing here is sample data; an empty locker is a real, honest empty state.

import React, { useState, useEffect, useCallback } from 'react';
import { getRewardsLocker, acknowledgeUnlocks } from '../api';
import AvatarItemIcon from '../avatarItemIcons';

// Same rarity/slot vocabulary as AvatarItemPicker.jsx — duplicated here rather
// than shared because the two components don't otherwise depend on each other.
const RARITY_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic' };
const RARITY_COLOR = {
  common: { bg: '#EEF0F6', text: '#5B6072' },
  rare: { bg: '#E6F1FB', text: '#185FA5' },
  epic: { bg: '#F3EAFB', text: '#7C3FA8' }
};
const SLOT_LABEL = {
  hair: 'Hair', shirt: 'Shirt', pants: 'Pants', shoes: 'Shoes',
  accessory: 'Accessory', background: 'Background'
};

const RewardsLocker = ({ onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [celebrationIndex, setCelebrationIndex] = useState(0);
  const [acknowledging, setAcknowledging] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getRewardsLocker();
      setData(result);
      setCelebrationIndex(0);
    } catch (err) {
      setError('Could not load your rewards. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const newUnlocks = data?.newUnlocks || [];
  const currentUnlock = newUnlocks[celebrationIndex];

  const handleDismissUnlock = async () => {
    if (!currentUnlock || acknowledging) return;
    setAcknowledging(true);
    try {
      await acknowledgeUnlocks([currentUnlock.itemId]);
    } catch (err) {
      // Non-fatal — worst case the same unlock celebrates again next visit.
    } finally {
      setAcknowledging(false);
      setCelebrationIndex((i) => i + 1);
    }
  };

  if (loading) {
    return (
      <div style={styles.overlay}>
        <div style={styles.loadingBox}>Loading rewards…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={styles.overlay}>
        <div style={styles.loadingBox}>
          <p>{error || 'Failed to load rewards.'}</p>
          <button onClick={onClose} style={styles.secondaryBtn}>Close</button>
        </div>
      </div>
    );
  }

  const earnedCount = data.badges.filter(b => b.earned).length;

  if (currentUnlock) {
    const rarity = RARITY_COLOR[currentUnlock.rarity] || RARITY_COLOR.common;
    const iconColor = currentUnlock.colors?.[0]?.hex || '#4F46E5';
    const isLast = celebrationIndex === newUnlocks.length - 1;
    return (
      <div style={styles.overlay}>
        <style>{CELEBRATION_KEYFRAMES}</style>
        <div style={styles.celebrationContainer}>
          {newUnlocks.length > 1 && (
            <p style={styles.celebrationProgress}>Unlock {celebrationIndex + 1} of {newUnlocks.length}</p>
          )}
          <div style={styles.celebrationBadgeWrap}>
            <div style={{ ...styles.celebrationRing, borderColor: iconColor }} />
            <div style={{ ...styles.celebrationIconCircle, backgroundColor: `${iconColor}1A` }}>
              <AvatarItemIcon slot={currentUnlock.slot} size={40} color={iconColor} />
            </div>
          </div>
          <p style={styles.celebrationEyebrow}>🎉 New Unlock!</p>
          <h2 style={styles.celebrationName}>{currentUnlock.name}</h2>
          <div style={styles.celebrationMetaRow}>
            <span style={styles.celebrationSlotTag}>{SLOT_LABEL[currentUnlock.slot] || currentUnlock.slot}</span>
            <span style={{ ...styles.celebrationRarityTag, backgroundColor: rarity.bg, color: rarity.text }}>
              {RARITY_LABEL[currentUnlock.rarity] || currentUnlock.rarity}
            </span>
          </div>
          {currentUnlock.unlockedBy && (
            <p style={styles.celebrationUnlockedBy}>
              Unlocked by earning the {currentUnlock.unlockedBy.icon} {currentUnlock.unlockedBy.name} badge
            </p>
          )}
          <button onClick={handleDismissUnlock} disabled={acknowledging} style={styles.celebrationBtn}>
            {acknowledging ? 'Saving…' : (isLast ? 'Awesome!' : 'Next unlock →')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Rewards Locker</h2>
            <p style={styles.subtitle}>{earnedCount} of {data.badges.length} badges earned</p>
          </div>
          <button onClick={onClose} style={styles.closeBtn} aria-label="Close">✕</button>
        </div>

        <div style={styles.body}>
          {error && <div style={styles.errorBanner}>{error}</div>}

          <div style={styles.grid}>
            {data.badges.map((badge) => (
              <div key={badge.slug} style={{ ...styles.card, ...(badge.earned ? styles.cardEarned : styles.cardLocked) }}>
                <div style={{ ...styles.icon, ...(badge.earned ? {} : styles.iconLocked) }}>
                  {badge.icon}
                </div>
                <p style={styles.badgeName}>{badge.name}</p>
                <p style={styles.badgeDescription}>{badge.description}</p>
                {badge.earned ? (
                  <span style={styles.earnedTag}>Earned ×{badge.count}</span>
                ) : (
                  <span style={styles.lockedTag}>Locked</span>
                )}
              </div>
            ))}
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
  container: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '85vh',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    borderBottom: '1px solid #EEF0F6'
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: '#1F2333'
  },
  subtitle: {
    margin: '2px 0 0',
    fontSize: 12,
    color: '#8B90A6'
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: 18,
    cursor: 'pointer',
    color: '#8B90A6',
    padding: 4
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: 20,
    backgroundColor: '#F7F7FB'
  },
  errorBanner: {
    marginBottom: 12,
    padding: '10px 14px',
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    color: '#B91C1C',
    fontSize: 13
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: 14
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: '18px 14px',
    textAlign: 'center',
    borderWidth: 1,
    borderStyle: 'solid'
  },
  cardEarned: {
    borderColor: '#E1E3EE'
  },
  cardLocked: {
    borderColor: '#EEF0F6',
    opacity: 0.6
  },
  icon: {
    fontSize: 32,
    marginBottom: 8
  },
  iconLocked: {
    filter: 'grayscale(100%)'
  },
  badgeName: {
    margin: '0 0 4px',
    fontSize: 13,
    fontWeight: 700,
    color: '#1F2333'
  },
  badgeDescription: {
    margin: '0 0 10px',
    fontSize: 11,
    color: '#8B90A6',
    lineHeight: 1.4
  },
  earnedTag: {
    display: 'inline-block',
    fontSize: 11,
    fontWeight: 700,
    color: '#0F9D6E',
    backgroundColor: '#E1F5EE',
    padding: '3px 10px',
    borderRadius: 999
  },
  lockedTag: {
    display: 'inline-block',
    fontSize: 11,
    fontWeight: 700,
    color: '#8B90A6',
    backgroundColor: '#EEF0F6',
    padding: '3px 10px',
    borderRadius: 999
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
  },

  // Milestone 12: cosmetic unlock celebration
  celebrationContainer: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: '32px 28px',
    textAlign: 'center',
    boxShadow: '0 20px 60px rgba(15, 17, 30, 0.3)',
    animation: 'unlockCardPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both'
  },
  celebrationProgress: {
    margin: '0 0 12px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.4,
    color: '#8B90A6',
    textTransform: 'uppercase'
  },
  celebrationBadgeWrap: {
    position: 'relative',
    width: 96,
    height: 96,
    margin: '0 auto 18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  celebrationRing: {
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    borderWidth: 3,
    borderStyle: 'solid',
    opacity: 0.5,
    animation: 'unlockRingPulse 1.8s ease-out infinite'
  },
  celebrationIconCircle: {
    width: 76,
    height: 76,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'unlockIconPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both'
  },
  celebrationEyebrow: {
    margin: '0 0 4px',
    fontSize: 14,
    fontWeight: 700,
    color: '#1F2333'
  },
  celebrationName: {
    margin: '0 0 10px',
    fontSize: 22,
    fontWeight: 800,
    color: '#1F2333'
  },
  celebrationMetaRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14
  },
  celebrationSlotTag: {
    fontSize: 11,
    fontWeight: 700,
    color: '#5B6072',
    backgroundColor: '#EEF0F6',
    padding: '3px 10px',
    borderRadius: 999
  },
  celebrationRarityTag: {
    fontSize: 11,
    fontWeight: 700,
    padding: '3px 10px',
    borderRadius: 999
  },
  celebrationUnlockedBy: {
    margin: '0 0 24px',
    fontSize: 13,
    color: '#8B90A6',
    lineHeight: 1.4
  },
  celebrationBtn: {
    width: '100%',
    padding: '13px',
    fontSize: 15,
    fontWeight: 700,
    backgroundColor: '#1E1B3A',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer'
  }
};

const CELEBRATION_KEYFRAMES = `
  @keyframes unlockCardPop {
    0% { transform: scale(0.85); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes unlockIconPop {
    0% { transform: scale(0.4); opacity: 0; }
    60% { transform: scale(1.15); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes unlockRingPulse {
    0% { transform: scale(0.85); opacity: 0.6; }
    100% { transform: scale(1.4); opacity: 0; }
  }
`;

export default RewardsLocker;
