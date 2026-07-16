// backend/avatarCatalog.js
//
// Milestone 10 (Avatar Builder picker UI): the real catalog of selectable hair/
// clothing items. Small on purpose — matches the vertical-slice content plan from
// AVATAR_FOUNDATION.md. Every already-existing default itemId (spiky01, crewneck01,
// jeans01, sneaker01) stays `unlock: null` so no existing user is ever locked out
// of what they're already wearing. The two "exciting" items (bob01 hair, hoodie01
// shirt) and the one accessory (glasses01) are gated behind real badges from the
// Rewards Locker (backend/badgeCatalog.js) — not a new, separate unlock economy.
//
// Icons are NOT here — the frontend renders one generic, reused-per-slot silhouette
// icon for every item in a category (see frontend/src/avatarItemIcons.jsx). This
// catalog only ever stores identifiers, names, and colors — never a depiction of
// what the item actually looks like, per AVATAR_FOUNDATION.md's asset-indirection
// principle.

const AVATAR_ITEM_CATALOG = {
  hair: [
    {
      itemId: 'spiky01', name: 'Spiky', rarity: 'common', isNew: false, unlock: null,
      colors: [{ variant: 'black', hex: '#2B2B2B' }, { variant: 'brown', hex: '#6B4A2F' }]
    },
    {
      itemId: 'bob01', name: 'Bob', rarity: 'rare', isNew: true, unlock: { badge: 'bestAccuracy' },
      colors: [{ variant: 'black', hex: '#2B2B2B' }, { variant: 'blonde', hex: '#D9B36C' }]
    }
  ],
  shirt: [
    {
      itemId: 'crewneck01', name: 'Crewneck', rarity: 'common', isNew: false, unlock: null,
      colors: [{ variant: 'default', hex: '#334155' }, { variant: 'red', hex: '#DC2626' }]
    },
    {
      itemId: 'hoodie01', name: 'Hoodie', rarity: 'epic', isNew: true, unlock: { badge: 'champion' },
      colors: [{ variant: 'charcoal', hex: '#1F2937' }, { variant: 'teal', hex: '#0F9D6E' }]
    }
  ],
  pants: [
    {
      itemId: 'jeans01', name: 'Jeans', rarity: 'common', isNew: false, unlock: null,
      colors: [{ variant: 'default', hex: '#3B5998' }, { variant: 'black', hex: '#1F2937' }]
    }
  ],
  shoes: [
    {
      itemId: 'sneaker01', name: 'Sneakers', rarity: 'common', isNew: false, unlock: null,
      colors: [{ variant: 'default', hex: '#EDE7DA' }, { variant: 'black', hex: '#1F2937' }]
    }
  ],
  accessory: [
    {
      itemId: 'glasses01', name: 'Glasses', rarity: 'rare', isNew: false, unlock: { badge: 'fastestThinker' },
      colors: [{ variant: 'default', hex: '#1F2937' }]
    }
  ],
  // Milestone 11: display-context scenery, not a worn item (see AVATAR_FOUNDATION.md
  // §3) — flat brand-tinted colors only, per AVATAR_STYLE_GUIDE.md §5's "no gradients,
  // no fake scenery art" rule.
  background: [
    {
      itemId: 'classroom01', name: 'Classroom', rarity: 'common', isNew: false, unlock: null,
      colors: [{ variant: 'default', hex: '#EEF2FF' }]
    },
    {
      itemId: 'starry01', name: 'Starry Night', rarity: 'rare', isNew: true, unlock: { badge: 'longestStreak' },
      colors: [{ variant: 'default', hex: '#1E1B3A' }]
    }
  ]
};

module.exports = { AVATAR_ITEM_CATALOG };
