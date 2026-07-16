// frontend/src/components/LbAvatar.jsx
//
// Milestone 8 (Leaderboard avatar display): small avatar circle + optional
// badge-count pip, shared by QuizPlayer.jsx and QuizControlPanel.jsx everywhere
// a leaderboard/podium/celebration row needs one. `color` overrides the personal
// skin tone — team color / rank color takes precedence there, same rule
// established in the Lobby (see QuizLobby.jsx).
//
// Milestone 14: also used by ChatArea.js's message bubbles. Added a flat color
// ring for the equipped Background cosmetic (Milestone 11) — its first real
// visual payoff anywhere in the app — plus an optional `style` prop so callers
// can position the outer wrapper without reaching into its internals.

import React from 'react';
import { SKIN_TONE_SWATCH_HEX, BACKGROUND_SWATCH_HEX } from '../avatarConstants';

const LbAvatar = ({ name, avatar, color, size = 26, style }) => {
  const bg = color || (avatar?.skinTone && SKIN_TONE_SWATCH_HEX[avatar.skinTone]) || '#075E54';
  const badgeCount = avatar?.badges?.length || 0;
  const ringColor = avatar?.background?.itemId && BACKGROUND_SWATCH_HEX[avatar.background.itemId];
  return (
    <div style={{ position: 'relative', flexShrink: 0, width: size, height: size, ...style }}>
      <div style={{
        width: size, height: size, borderRadius: '50%', backgroundColor: bg, color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.max(10, Math.round(size * 0.4)), fontWeight: 700,
        boxShadow: ringColor ? `0 0 0 2px ${ringColor}` : 'none'
      }}>
        {(name || '?').charAt(0).toUpperCase()}
      </div>
      {badgeCount > 0 && (
        <span style={{
          position: 'absolute', bottom: -2, right: -2, minWidth: 13, height: 13, borderRadius: 7,
          backgroundColor: '#1E1B3A', color: 'white', fontSize: 8, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
          border: '1.5px solid #fff'
        }}>
          {badgeCount}
        </span>
      )}
    </div>
  );
};

export default LbAvatar;
