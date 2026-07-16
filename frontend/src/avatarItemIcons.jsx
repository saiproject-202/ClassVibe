// frontend/src/avatarItemIcons.jsx
//
// Milestone 10 (Avatar Builder picker UI): one generic, reused-per-category
// silhouette icon per slot. Every item within a slot (e.g. every hairstyle)
// renders the SAME icon here, differentiated only by name/color/rarity — never
// a shape depicting what a specific item actually looks like. See
// feedback_no_fake_avatar_art in project memory for why this line matters.

import React from 'react';

const ICON_PATHS = {
  hair: 'M8 28C8 15.85 15.4 6 24 6s16 9.85 16 22v2H8v-2z',
  shirt: 'M18 6L10 12l3 5 3-2v25h16V15l3 2 3-5-8-6-3 2h-8l-3-2z',
  pants: 'M14 6h20v8l-2 28h-6l-1-21-1 21h-6l-2-28V6z',
  shoes: 'M4 36c0-3 2-5 5-6l16-6c3-1 5 0 6 3l1 3c4 0 10 1 12 4 1 2 0 5-3 5H8c-2 0-4-1-4-3z',
  accessory: 'M24 4l4 14 14 4-14 4-4 14-4-14-14-4 14-4z',
  // A simple frame outline — generic "scenery/canvas" icon, not a depiction of any
  // specific background scene.
  background: 'M6 6h36v36H6V6zm4 4v28h28V10H10z'
};

const AvatarItemIcon = ({ slot, size = 28, color = 'currentColor' }) => {
  const d = ICON_PATHS[slot] || ICON_PATHS.accessory;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d={d} fill={color} fillRule="evenodd" />
    </svg>
  );
};

export default AvatarItemIcon;
