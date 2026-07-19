// frontend/src/components/AvatarItemPicker.jsx
//
// Milestone 10: the real picker UI for a single wearable slot (Hair, Shirt,
// Pants, Shoes, Accessory). Search, rarity grouping, favorites, a session-local
// "recently used" strip, locked/unlocked state (tied to real Rewards Locker
// badges), and a color-variant swatch row for whichever item is selected.
//
// Every card renders the same generic per-slot silhouette icon (AvatarItemIcon)
// — never a depiction of what a specific item actually looks like.

import React, { useState, useMemo, useRef } from 'react';
import AvatarItemIcon from '../avatarItemIcons';

const RARITY_ORDER = ['common', 'rare', 'epic'];
const RARITY_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic' };
const RARITY_COLOR = {
  common: { bg: '#EEF0F6', text: '#5B6072' },
  rare: { bg: '#E6F1FB', text: '#185FA5' },
  epic: { bg: '#F3EAFB', text: '#7C3FA8' }
};

// Milestone 13: equip feedback respects the "no motion for reduced-motion
// users" rule already documented in AVATAR_STYLE_GUIDE.md §7.
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const AvatarItemPicker = ({ slot, label, items, onEquip, onToggleFavorite, recentlyUsedIds }) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | favorites | recent
  // Milestone 13: item equip animation — which card/swatch just got equipped,
  // cleared automatically so the pop only ever plays once per equip action.
  const [justEquipped, setJustEquipped] = useState(null); // { itemId, variant } | null
  const equipTimerRef = useRef(null);

  const playEquipPop = (itemId, variant) => {
    if (prefersReducedMotion()) return;
    clearTimeout(equipTimerRef.current);
    setJustEquipped({ itemId, variant });
    equipTimerRef.current = setTimeout(() => setJustEquipped(null), 500);
  };

  const filtered = useMemo(() => {
    let list = items;
    if (filter === 'favorites') list = list.filter(i => i.isFavorite);
    if (filter === 'recent') list = list.filter(i => recentlyUsedIds.includes(i.itemId));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }
    return list;
  }, [items, filter, search, recentlyUsedIds]);

  const grouped = useMemo(() => {
    const groups = {};
    RARITY_ORDER.forEach(r => { groups[r] = []; });
    filtered.forEach(i => { (groups[i.rarity] || (groups[i.rarity] = [])).push(i); });
    return groups;
  }, [filtered]);

  const equippedItem = items.find(i => i.isEquipped);
  const [activeItemId, setActiveItemId] = useState(equippedItem?.itemId || null);
  const activeItem = items.find(i => i.itemId === activeItemId);

  const handleCardClick = (item) => {
    if (item.locked) return;
    setActiveItemId(item.itemId);
    if (item.colors.length === 1) {
      onEquip(slot, item.itemId, item.colors[0].variant);
      playEquipPop(item.itemId, item.colors[0].variant);
    }
  };

  const handleSwatchClick = (item, variant) => {
    onEquip(slot, item.itemId, variant);
    playEquipPop(item.itemId, variant);
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.headerRow}>
        <p style={styles.label}>{label}</p>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${label.toLowerCase()}…`}
          style={styles.search}
        />
      </div>

      <div style={styles.filterRow}>
        {['all', 'favorites', 'recent'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{ ...styles.filterTab, ...(filter === f ? styles.filterTabActive : {}) }}
          >
            {f === 'all' ? 'All' : f === 'favorites' ? '★ Favorites' : '🕐 Recent'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p style={styles.emptyHint}>
          {filter === 'favorites' ? 'No favorites yet — tap the star on an item.' :
            filter === 'recent' ? 'Nothing equipped yet this session.' :
              'No items match your search.'}
        </p>
      ) : (
        RARITY_ORDER.map((rarity) => {
          const group = grouped[rarity] || [];
          if (group.length === 0) return null;
          return (
            <div key={rarity} style={styles.raritySection}>
              <p style={{ ...styles.rarityLabel, color: RARITY_COLOR[rarity].text }}>{RARITY_LABEL[rarity]}</p>
              <div style={styles.grid}>
                {group.map((item) => (
                  <div
                    key={item.itemId}
                    onClick={() => handleCardClick(item)}
                    style={{
                      ...styles.card,
                      ...(item.isEquipped ? styles.cardEquipped : {}),
                      ...(item.locked ? styles.cardLocked : { cursor: 'pointer' }),
                      animation: justEquipped?.itemId === item.itemId ? 'equipCardPop 0.5s ease' : 'none'
                    }}
                    title={item.locked ? item.unlockHint : item.name}
                  >
                    {item.isNew && !item.locked && <span style={styles.newBadge}>NEW</span>}
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleFavorite(item.itemId); }}
                      style={styles.favoriteBtn}
                      aria-label="Toggle favorite"
                    >
                      {item.isFavorite ? '★' : '☆'}
                    </button>
                    <div style={{ ...styles.iconWrap, ...(item.locked ? styles.iconWrapLocked : {}) }}>
                      <AvatarItemIcon slot={slot} size={30} color={item.locked ? '#B7BBC9' : '#4B5168'} />
                    </div>
                    <p style={{ ...styles.cardName, ...(item.locked ? styles.cardNameLocked : {}) }}>{item.name}</p>
                    <span style={{ ...styles.rarityPill, backgroundColor: RARITY_COLOR[rarity].bg, color: RARITY_COLOR[rarity].text }}>
                      {RARITY_LABEL[rarity]}
                    </span>
                    {item.locked && <p style={styles.lockHint}>🔒 {item.unlockHint}</p>}
                    {item.isEquipped && <span style={styles.equippedTag}>Equipped</span>}
                    {justEquipped?.itemId === item.itemId && <span style={styles.equipRing} />}
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {activeItem && !activeItem.locked && activeItem.colors.length > 1 && (
        <div style={styles.colorRow}>
          <p style={styles.colorLabel}>Color</p>
          <div style={styles.swatchRow}>
            {activeItem.colors.map((c) => (
              <button
                key={c.variant}
                onClick={() => handleSwatchClick(activeItem, c.variant)}
                title={c.variant}
                style={{
                  ...styles.swatch,
                  backgroundColor: c.hex,
                  ...(activeItem.isEquipped && activeItem.equippedVariant === c.variant ? styles.swatchActive : {}),
                  animation: justEquipped?.itemId === activeItem.itemId && justEquipped?.variant === c.variant
                    ? 'equipSwatchPop 0.4s ease' : 'none'
                }}
              />
            ))}
          </div>
        </div>
      )}
      <style>{EQUIP_KEYFRAMES}</style>
    </div>
  );
};

const styles = {
  wrap: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottom: '1px solid #F1F2F8'
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 10
  },
  label: {
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    color: '#8B90A6',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    whiteSpace: 'nowrap'
  },
  search: {
    flex: 1,
    maxWidth: 140,
    padding: '5px 8px',
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#E1E3EE',
    fontSize: 12,
    fontFamily: 'inherit'
  },
  filterRow: {
    display: 'flex',
    gap: 6,
    marginBottom: 10
  },
  filterTab: {
    padding: '4px 10px',
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#E1E3EE',
    backgroundColor: '#FFFFFF',
    color: '#6B7080',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer'
  },
  filterTabActive: {
    borderColor: 'var(--cv-accent)',
    backgroundColor: 'var(--cv-accent-light)',
    color: 'var(--cv-accent)'
  },
  emptyHint: {
    fontSize: 12,
    color: '#9CA3AF',
    margin: '4px 0 8px'
  },
  raritySection: {
    marginBottom: 10
  },
  rarityLabel: {
    margin: '0 0 6px',
    fontSize: 11,
    fontWeight: 700
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))',
    gap: 8
  },
  card: {
    position: 'relative',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#E1E3EE',
    padding: '10px 6px 8px',
    textAlign: 'center'
  },
  cardEquipped: {
    borderColor: 'var(--cv-accent)',
    boxShadow: '0 0 0 2px var(--cv-accent-light)'
  },
  cardLocked: {
    opacity: 0.65,
    cursor: 'not-allowed'
  },
  iconWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4
  },
  iconWrapLocked: {
    opacity: 0.7
  },
  cardName: {
    margin: '0 0 4px',
    fontSize: 11,
    fontWeight: 700,
    color: '#1F2333',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  cardNameLocked: {
    color: '#9CA3AF'
  },
  rarityPill: {
    fontSize: 9,
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: 999,
    textTransform: 'uppercase',
    letterSpacing: 0.3
  },
  newBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    fontSize: 8,
    fontWeight: 700,
    color: '#FFFFFF',
    backgroundColor: '#DC2626',
    padding: '2px 5px',
    borderRadius: 4
  },
  favoriteBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    background: 'transparent',
    border: 'none',
    fontSize: 14,
    color: '#F59E0B',
    cursor: 'pointer',
    padding: 4,
    lineHeight: 1
  },
  lockHint: {
    margin: '4px 0 0',
    fontSize: 9,
    color: '#9CA3AF',
    lineHeight: 1.3
  },
  equippedTag: {
    display: 'block',
    marginTop: 4,
    fontSize: 9,
    fontWeight: 700,
    color: 'var(--cv-accent)'
  },
  equipRing: {
    position: 'absolute',
    inset: -2,
    borderRadius: 12,
    border: '2px solid var(--cv-accent)',
    pointerEvents: 'none',
    animation: 'equipRingFlash 0.5s ease-out'
  },
  colorRow: {
    marginTop: 8
  },
  colorLabel: {
    margin: '0 0 6px',
    fontSize: 11,
    fontWeight: 700,
    color: '#8B90A6'
  },
  swatchRow: {
    display: 'flex',
    gap: 8
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: 'transparent',
    cursor: 'pointer',
    padding: 0
  },
  swatchActive: {
    borderColor: 'var(--cv-accent)',
    boxShadow: '0 0 0 2px var(--cv-accent-light)'
  }
};

// Milestone 13: item equip animation — a quick, subtle pop, never a looping
// or attention-hogging effect (matches AVATAR_STYLE_GUIDE.md §7's "subtle,
// not noisy" tone already used for QuizLobby's team-select bounce).
const EQUIP_KEYFRAMES = `
  @keyframes equipCardPop {
    0% { transform: scale(1); }
    40% { transform: scale(1.07); }
    100% { transform: scale(1); }
  }
  @keyframes equipRingFlash {
    0% { opacity: 1; transform: scale(0.94); }
    100% { opacity: 0; transform: scale(1.08); }
  }
  @keyframes equipSwatchPop {
    0% { transform: scale(1); }
    50% { transform: scale(1.3); }
    100% { transform: scale(1); }
  }
`;

export default AvatarItemPicker;
