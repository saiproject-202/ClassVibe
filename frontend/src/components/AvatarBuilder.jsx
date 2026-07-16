// frontend/src/components/AvatarBuilder.jsx
//
// Milestone 4: Avatar Builder UI shell. Milestone 10: real picker UI for
// Hair/Shirt/Pants/Shoes/Accessory (AvatarItemPicker), backed by the real
// catalog + Rewards Locker badge unlocks from backend/avatarCatalog.js.
// Milestone 11: Background joins the same picker; Favorite Emote gets its own
// simple picker (plain string field, not itemId/variant) — this sets the
// DEFAULT celebration; the live per-quiz choice for top-3 finishers happens
// on the Final Results podium instead (QuizPlayer.jsx/QuizControlPanel.jsx).
// Eyes stays a read-only "coming soon" row. The live preview is fully
// isolated behind AvatarRenderer.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getAvatar, updateAvatar, getAvatarCatalog } from '../api';
import AvatarRenderer from './AvatarRenderer';
import AvatarItemPicker from './AvatarItemPicker';
import { SKIN_TONES, SKIN_TONE_SWATCH_HEX, CELEBRATION_EMOTES } from '../avatarConstants';

const GENDER_OPTIONS = [
  { value: 'boy', label: 'Boy' },
  { value: 'girl', label: 'Girl' }
];

const PICKER_SLOTS = [
  { key: 'hair', label: 'Hair' },
  { key: 'shirt', label: 'Shirt' },
  { key: 'pants', label: 'Pants' },
  { key: 'shoes', label: 'Shoes' },
  { key: 'accessory', label: 'Accessories' }
];

const SLOT_LABEL = { hair: 'Hair', shirt: 'Shirt', pants: 'Pants', shoes: 'Shoes', accessory: 'Accessory', background: 'Background' };

const describeSlot = (value) => {
  if (!value) return 'None equipped';
  return `${value.itemId} · ${value.variant}`;
};

const AvatarBuilder = ({ onClose }) => {
  const [avatar, setAvatar] = useState(null);
  const [savedAvatar, setSavedAvatar] = useState(null);
  const [catalog, setCatalog] = useState({});
  const [recentlyUsed, setRecentlyUsed] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Milestone 13: item equip animation — the preview reacts to the most recent
  // equip even though the real 3D rig doesn't exist yet (see AvatarRenderer.jsx).
  const [justEquipped, setJustEquipped] = useState(null); // { slot, itemId, name, key } | null
  const equipToastTimerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [avatarData, catalogData] = await Promise.all([getAvatar(), getAvatarCatalog()]);
      setAvatar(avatarData.avatar);
      setSavedAvatar(avatarData.avatar);
      setCatalog(catalogData.catalog);
    } catch (err) {
      setError('Could not load your avatar. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isDirty = avatar && savedAvatar && JSON.stringify(avatar) !== JSON.stringify(savedAvatar);

  const handleSave = async () => {
    if (!isDirty) return;
    setSaving(true);
    setError('');
    try {
      const data = await updateAvatar({
        gender: avatar.gender, skinTone: avatar.skinTone,
        hair: avatar.hair, shirt: avatar.shirt, pants: avatar.pants, shoes: avatar.shoes, accessory: avatar.accessory,
        background: avatar.background, favoriteEmote: avatar.favoriteEmote
      });
      setAvatar(data.avatar);
      setSavedAvatar(data.avatar);
    } catch (err) {
      setError('Could not save your avatar. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => setAvatar(savedAvatar);

  const handleRandomize = () => {
    // Only gender/skin tone get randomized — randomly equipping a locked item
    // would be confusing, and there isn't enough real catalog depth yet for a
    // meaningful "randomize my outfit" to feel intentional rather than arbitrary.
    setAvatar((prev) => ({
      ...prev,
      gender: GENDER_OPTIONS[Math.floor(Math.random() * GENDER_OPTIONS.length)].value,
      skinTone: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)]
    }));
  };

  // Equipping is staged like gender/skin tone — persisted only on Save.
  const handleEquip = (slot, itemId, variant) => {
    setAvatar((a) => ({ ...a, [slot]: { itemId, variant } }));
    setRecentlyUsed((r) => {
      const list = r[slot] || [];
      return { ...r, [slot]: [itemId, ...list.filter((id) => id !== itemId)].slice(0, 5) };
    });

    const item = (catalog[slot] || []).find((i) => i.itemId === itemId);
    clearTimeout(equipToastTimerRef.current);
    setJustEquipped({ slot, slotLabel: SLOT_LABEL[slot] || slot, name: item?.name || itemId, key: Date.now() });
    equipToastTimerRef.current = setTimeout(() => setJustEquipped(null), 2000);
  };

  // Favoriting saves immediately — it's a lightweight bookmark, not part of
  // "your look," so it shouldn't be gated behind the Save button.
  const handleToggleFavorite = async (itemId) => {
    const current = avatar.favoriteItems || [];
    const updated = current.includes(itemId)
      ? current.filter((id) => id !== itemId)
      : [...current, itemId];
    setAvatar((a) => ({ ...a, favoriteItems: updated }));
    setSavedAvatar((a) => ({ ...a, favoriteItems: updated }));
    try {
      await updateAvatar({ favoriteItems: updated });
    } catch (err) {
      // Non-fatal — worst case it doesn't persist past this session.
    }
  };

  const mergeItems = (slot) => (catalog[slot] || []).map((item) => ({
    ...item,
    isFavorite: (avatar.favoriteItems || []).includes(item.itemId),
    isEquipped: avatar[slot]?.itemId === item.itemId,
    equippedVariant: avatar[slot]?.itemId === item.itemId ? avatar[slot].variant : null
  }));

  if (loading) {
    return (
      <div style={styles.overlay}>
        <div style={styles.loadingBox}>Loading avatar…</div>
      </div>
    );
  }

  if (!avatar) {
    return (
      <div style={styles.overlay}>
        <div style={styles.loadingBox}>
          <p>{error || 'Failed to load avatar.'}</p>
          <button onClick={onClose} style={styles.secondaryBtn}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        <div style={styles.header}>
          <h2 style={styles.title}>Avatar Builder</h2>
          <button onClick={onClose} style={styles.closeBtn} aria-label="Close">✕</button>
        </div>

        {error && <div style={styles.errorBanner}>{error}</div>}

        <div style={styles.body}>
          {/* Left panel */}
          <div style={styles.leftPanel}>
            <div style={styles.panelSection}>
              <p style={styles.panelLabel}>Gender</p>
              <div style={styles.pillRow}>
                {GENDER_OPTIONS.map((g) => (
                  <button
                    key={g.value}
                    onClick={() => setAvatar((a) => ({ ...a, gender: g.value }))}
                    style={{ ...styles.pill, ...(avatar.gender === g.value ? styles.pillActive : {}) }}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={styles.panelSection}>
              <p style={styles.panelLabel}>Skin tone</p>
              <div style={styles.swatchRow}>
                {SKIN_TONES.map((tone) => (
                  <button
                    key={tone}
                    title={tone}
                    aria-label={`Skin tone ${tone}`}
                    onClick={() => setAvatar((a) => ({ ...a, skinTone: tone }))}
                    style={{
                      ...styles.swatch,
                      backgroundColor: SKIN_TONE_SWATCH_HEX[tone],
                      ...(avatar.skinTone === tone ? styles.swatchActive : {})
                    }}
                  />
                ))}
              </div>
            </div>

            <AvatarItemPicker
              slot="hair" label="Hair"
              items={mergeItems('hair')}
              onEquip={handleEquip}
              onToggleFavorite={handleToggleFavorite}
              recentlyUsedIds={recentlyUsed.hair || []}
            />

            <div style={styles.panelSection}>
              <div style={styles.slotRow}>
                <span style={styles.panelLabel}>Eyes</span>
                <span style={styles.comingSoonTag}>Coming soon</span>
              </div>
              <p style={styles.slotHint}>{describeSlot(avatar.eyes)}</p>
            </div>

            {PICKER_SLOTS.filter((s) => s.key !== 'hair').map((slot) => (
              <AvatarItemPicker
                key={slot.key}
                slot={slot.key} label={slot.label}
                items={mergeItems(slot.key)}
                onEquip={handleEquip}
                onToggleFavorite={handleToggleFavorite}
                recentlyUsedIds={recentlyUsed[slot.key] || []}
              />
            ))}

            <AvatarItemPicker
              slot="background" label="Background"
              items={mergeItems('background')}
              onEquip={handleEquip}
              onToggleFavorite={handleToggleFavorite}
              recentlyUsedIds={recentlyUsed.background || []}
            />

            <div style={styles.panelSection}>
              <p style={styles.panelLabel}>Favorite emote</p>
              <p style={{ ...styles.slotHint, margin: '0 0 8px' }}>
                Your default celebration — plays on the podium unless you pick something else that round.
              </p>
              <div style={styles.emoteGrid}>
                {CELEBRATION_EMOTES.map((e) => (
                  <button
                    key={e.key}
                    onClick={() => setAvatar((a) => ({ ...a, favoriteEmote: a.favoriteEmote === e.key ? null : e.key }))}
                    style={{ ...styles.emoteBtn, ...(avatar.favoriteEmote === e.key ? styles.emoteBtnActive : {}) }}
                  >
                    <span style={styles.emoteIcon}>{e.icon}</span>
                    <span style={styles.emoteLabel}>{e.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Center */}
          <div style={styles.centerPanel}>
            <AvatarRenderer avatar={avatar} justEquipped={justEquipped} />
          </div>

          {/* Right panel */}
          <div style={styles.rightPanel}>
            <button
              onClick={handleSave}
              disabled={!isDirty || saving}
              style={{ ...styles.primaryBtn, ...(!isDirty || saving ? styles.btnDisabled : {}) }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleReset}
              disabled={!isDirty}
              style={{ ...styles.secondaryBtn, ...(!isDirty ? styles.btnDisabled : {}) }}
            >
              Reset
            </button>
            <button onClick={handleRandomize} style={styles.secondaryBtn}>
              🎲 Randomize
            </button>
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
    maxWidth: 1080,
    maxHeight: '90vh',
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
    color: '#242841'
  },
  closeBtn: {
    border: 'none',
    background: 'transparent',
    fontSize: 18,
    cursor: 'pointer',
    color: '#8B90A6',
    padding: 4
  },
  errorBanner: {
    margin: '12px 24px 0',
    padding: '10px 14px',
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    color: '#B91C1C',
    fontSize: 13
  },
  body: {
    display: 'flex',
    gap: 20,
    padding: 24,
    overflowY: 'auto'
  },
  leftPanel: {
    width: 340,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  },
  panelSection: {
    padding: '10px 0',
    borderBottom: '1px solid #F1F2F8'
  },
  panelLabel: {
    margin: '0 0 8px',
    fontSize: 12,
    fontWeight: 700,
    color: '#8B90A6',
    textTransform: 'uppercase',
    letterSpacing: 0.4
  },
  pillRow: {
    display: 'flex',
    gap: 8
  },
  pill: {
    flex: 1,
    padding: '8px 12px',
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
  pillActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
    color: '#4F46E5'
  },
  swatchRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap'
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: 'transparent',
    cursor: 'pointer',
    padding: 0
  },
  swatchActive: {
    borderColor: '#4F46E5',
    boxShadow: '0 0 0 2px #EEF2FF'
  },
  slotRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  comingSoonTag: {
    fontSize: 10,
    fontWeight: 700,
    color: '#B45309',
    backgroundColor: '#FEF3C7',
    padding: '2px 8px',
    borderRadius: 999,
    textTransform: 'uppercase',
    letterSpacing: 0.3
  },
  emoteGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 6
  },
  emoteBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '8px 4px',
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#E1E3EE',
    backgroundColor: '#FFFFFF',
    cursor: 'pointer'
  },
  emoteBtnActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF'
  },
  emoteIcon: {
    fontSize: 18
  },
  emoteLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: '#4B5168'
  },
  slotHint: {
    margin: '6px 0 0',
    fontSize: 12,
    color: '#AEB3C4'
  },
  centerPanel: {
    flex: 1,
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center'
  },
  rightPanel: {
    width: 160,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 10
  },
  primaryBtn: {
    padding: '10px 14px',
    borderRadius: 8,
    border: 'none',
    backgroundColor: '#4F46E5',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer'
  },
  secondaryBtn: {
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid #E1E3EE',
    backgroundColor: '#FFFFFF',
    color: '#4B5168',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer'
  },
  btnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  }
};

export default AvatarBuilder;
