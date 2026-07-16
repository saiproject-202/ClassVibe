// frontend/src/components/AvatarRenderer.jsx
//
// Isolated preview surface for the Avatar Builder (see AVATAR_FOUNDATION.md,
// AVATAR_PRODUCTION_PIPELINE.md). Today: a placeholder viewport only — no
// Boy/Girl GLB rigs exist yet (that needs a 3D artist, see AVATAR_ASSET_CHECKLIST.md).
//
// Once those rigs exist, only the inside of this component changes to a
// React Three Fiber <Canvas> scene loading the real GLB via the manifest.
// AvatarBuilder.jsx never needs to change — it just passes `avatar` in.
//
// Milestone 13: `justEquipped` ({ slotLabel, name, key }) makes this placeholder
// react to an equip too — a brief glow on the cube + a toast — so equipping
// something already feels connected to "your avatar," not just to a list item.
// Respects prefers-reduced-motion (AVATAR_STYLE_GUIDE.md §7).

import React from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const AvatarRenderer = ({ avatar, justEquipped }) => {
  const animate = !!justEquipped && !prefersReducedMotion();
  return (
    <div style={styles.viewport}>
      <style>{EQUIP_KEYFRAMES}</style>
      <svg
        key={animate ? `icon-${justEquipped.key}` : 'icon-static'}
        width="56" height="56" viewBox="0 0 56 56"
        style={{ ...styles.cubeIcon, animation: animate ? 'previewGlowPulse 0.7s ease-out' : 'none' }}
      >
        <polygon points="28,4 50,16 50,40 28,52 6,40 6,16" fill="none" stroke="#C7CCE0" strokeWidth="1.5" />
        <polygon points="28,4 50,16 28,28 6,16" fill="none" stroke="#C7CCE0" strokeWidth="1.5" />
        <line x1="28" y1="28" x2="28" y2="52" stroke="#C7CCE0" strokeWidth="1.5" />
      </svg>
      <p style={styles.title}>3D Avatar Preview Coming Soon</p>
      <p style={styles.subtitle}>
        Your selections are saved now. The live 3D preview renders here once the Boy and Girl avatar rigs are built.
      </p>
      {avatar && (
        <p style={styles.meta}>
          {avatar.gender === 'girl' ? 'Girl' : 'Boy'} rig · skin tone {avatar.skinTone}
        </p>
      )}
      {justEquipped && (
        <div key={`toast-${justEquipped.key}`} style={{ ...styles.equipToast, animation: animate ? 'toastInOut 2s ease' : 'none' }}>
          ✓ {justEquipped.slotLabel} equipped — {justEquipped.name}
        </div>
      )}
    </div>
  );
};

const styles = {
  viewport: {
    position: 'relative',
    width: '100%',
    height: '100%',
    minHeight: 360,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '32px 24px',
    borderRadius: 16,
    border: '2px dashed #D8DCEB',
    backgroundColor: '#F8F9FD'
  },
  equipToast: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '8px 16px',
    borderRadius: 999,
    backgroundColor: '#1E1B3A',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    boxShadow: '0 8px 20px rgba(15, 17, 30, 0.25)'
  },
  cubeIcon: {
    marginBottom: 16
  },
  title: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: '#4B5168'
  },
  subtitle: {
    margin: '8px 0 0',
    fontSize: 13,
    color: '#8B90A6',
    maxWidth: 260,
    lineHeight: 1.5
  },
  meta: {
    margin: '16px 0 0',
    fontSize: 12,
    color: '#AEB3C4',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  }
};

const EQUIP_KEYFRAMES = `
  @keyframes previewGlowPulse {
    0% { filter: drop-shadow(0 0 0 rgba(79, 70, 229, 0)); }
    40% { filter: drop-shadow(0 0 10px rgba(79, 70, 229, 0.6)); }
    100% { filter: drop-shadow(0 0 0 rgba(79, 70, 229, 0)); }
  }
  @keyframes toastInOut {
    0% { opacity: 0; transform: translate(-50%, 8px); }
    15% { opacity: 1; transform: translate(-50%, 0); }
    85% { opacity: 1; transform: translate(-50%, 0); }
    100% { opacity: 0; transform: translate(-50%, 8px); }
  }
`;

export default AvatarRenderer;
