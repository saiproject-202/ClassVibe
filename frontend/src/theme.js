// frontend/src/theme.js
// Settings → Preferences: shared helpers so both App.js (applies on startup, before
// any settings page is ever opened) and PreferencesSettings.jsx (applies live on
// change) read/write the same source of truth instead of drifting out of sync.

// 'blue' matches this app's original hardcoded indigo exactly — see the --cv-accent
// defaults in App.css. Picking it back is always a true no-op.
export const ACCENTS = {
  blue:   { label: 'Blue',   swatch: '#4F46E5', accent: '#4F46E5', hover: '#4338CA', light: '#EEF2FF', mid: '#6366f1' },
  green:  { label: 'Green',  swatch: '#16A34A', accent: '#16A34A', hover: '#15803D', light: '#F0FDF4', mid: '#22C55E' },
  purple: { label: 'Purple', swatch: '#9333EA', accent: '#9333EA', hover: '#7E22CE', light: '#FAF5FF', mid: '#A855F7' },
  red:    { label: 'Red',    swatch: '#DC2626', accent: '#DC2626', hover: '#B91C1C', light: '#FEF2F2', mid: '#EF4444' },
  orange: { label: 'Orange', swatch: '#EA580C', accent: '#EA580C', hover: '#C2410C', light: '#FFF7ED', mid: '#F97316' }
};

export const ACCESSIBILITY_TOGGLES = [
  { key: 'largeText',     label: 'Large Text',          sub: 'Scale up text and UI across the app',                  cssClass: 'cv-large-text' },
  { key: 'highContrast',  label: 'High Contrast',       sub: 'Boost contrast for better readability',                cssClass: 'cv-high-contrast' },
  { key: 'reducedMotion', label: 'Reduced Motion',      sub: 'Turn off animations and transitions',                  cssClass: 'cv-reduced-motion' },
  { key: 'keyboardNav',   label: 'Keyboard Navigation', sub: 'Show a stronger highlight around the focused element', cssClass: 'cv-keyboard-nav' }
];

export const getStoredAccentColor = () => localStorage.getItem('accentColor') || 'blue';

export const applyAccentColor = (key) => {
  const c = ACCENTS[key] || ACCENTS.blue;
  const root = document.documentElement.style;
  root.setProperty('--cv-accent', c.accent);
  root.setProperty('--cv-accent-hover', c.hover);
  root.setProperty('--cv-accent-light', c.light);
  root.setProperty('--cv-accent-mid', c.mid);
};

export const getStoredAccessibilityPrefs = () => {
  try { return JSON.parse(localStorage.getItem('accessibilityPrefs')) || {}; }
  catch { return {}; }
};

export const applyAccessibilityPrefs = (prefs) => {
  ACCESSIBILITY_TOGGLES.forEach(t => {
    document.documentElement.classList.toggle(t.cssClass, !!prefs[t.key]);
  });
};
