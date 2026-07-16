// frontend/src/avatarConstants.js
//
// Shared avatar-personalization constants used anywhere a student's avatar
// needs a lightweight visual stand-in (Avatar Builder, Lobby roster, etc.)
// before real Boy/Girl GLB rigs exist — see AVATAR_ASSET_CHECKLIST.md.

export const SKIN_TONES = ['warm01', 'warm02', 'warm03', 'warm04', 'warm05', 'warm06'];

// Placeholder swatch colors for UI use only — the real hex value per tone is
// an art-production decision, not fixed here (AVATAR_ART_BIBLE.md §7).
export const SKIN_TONE_SWATCH_HEX = {
  warm01: '#F5D9BC',
  warm02: '#EFC49C',
  warm03: '#E0AC7D',
  warm04: '#C98B5E',
  warm05: '#A5693F',
  warm06: '#7A4B2E'
};

// Milestone 11: the fixed set of celebration emotes — used both as a profile-level
// "Favorite Emote" preference (Avatar Builder) and as the live, per-quiz choice
// top-3 finishers make on the Final Results podium (QuizPlayer/QuizControlPanel).
// Keys match the celebratory subset of ANIMATION_SPEC.md's clip list (Idle/Walk/
// Happy/Thinking/Listening excluded — not "celebration" appropriate) and must stay
// in sync with the ALLOWED_CELEBRATION_EMOTES list in quiz-socket-handlers.js.
export const CELEBRATION_EMOTES = [
  { key: 'celebrate', label: 'Celebrate', icon: '🎉' },
  { key: 'clap', label: 'Clap', icon: '👏' },
  { key: 'wave', label: 'Wave', icon: '👋' },
  { key: 'victory', label: 'Victory', icon: '🏆' },
  { key: 'thankYou', label: 'Thank You', icon: '🙏' },
  { key: 'teamRespect', label: 'Team Respect', icon: '🤝' }
];

// Milestone 14: the Background cosmetic (Milestone 11, backend/avatarCatalog.js's
// `background` category) had never been rendered anywhere — this gives it a real
// payoff as a flat color ring around the avatar chip (LbAvatar.jsx). Keyed by
// itemId only since every background item today has a single 'default' color
// variant. Must stay in sync with backend/avatarCatalog.js's background entries.
export const BACKGROUND_SWATCH_HEX = {
  classroom01: '#EEF2FF',
  starry01: '#1E1B3A'
};
