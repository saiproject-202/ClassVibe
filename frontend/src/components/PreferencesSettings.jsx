// frontend/src/components/PreferencesSettings.jsx
// Settings → Preferences — Appearance (theme mode), Accent Color, Language,
// Accessibility. All persisted client-side (localStorage), matching how this app's
// theme choice already worked before this existed — no backend model needed since
// nothing server-side depends on these.

import React, { useState } from 'react';
import {
  ACCENTS, ACCESSIBILITY_TOGGLES,
  getStoredAccentColor, applyAccentColor,
  getStoredAccessibilityPrefs, applyAccessibilityPrefs
} from '../theme';

const APPEARANCE_OPTIONS = [
  { key: 'light',  label: 'Light Mode',   icon: '☀️' },
  { key: 'dark',   label: 'Dark Mode',    icon: '🌙' },
  { key: 'system', label: 'System Theme', icon: '🖥️' }
];

const PreferencesSettings = ({ isDark, themeMode, setThemeMode }) => {
  const [accentKey, setAccentKey] = useState(getStoredAccentColor);
  const [a11y, setA11y] = useState(getStoredAccessibilityPrefs);

  const txt  = isDark ? '#f1f5f9' : '#111827';
  const txt2 = isDark ? '#94a3b8' : '#6b7280';
  const bdr  = isDark ? '#334155' : '#e5e7eb';
  const sectionLabel = { fontSize: 12, fontWeight: '700', color: txt2, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '4px 0 10px' };

  const handleAccentPick = (key) => {
    setAccentKey(key);
    localStorage.setItem('accentColor', key);
    applyAccentColor(key);
  };

  const handleA11yToggle = (key) => {
    setA11y(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('accessibilityPrefs', JSON.stringify(next));
      applyAccessibilityPrefs(next);
      return next;
    });
  };

  return (
    <div style={{ padding: '4px 24px 20px' }}>
      {/* Appearance */}
      <div style={sectionLabel}>Appearance</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
        {APPEARANCE_OPTIONS.map(opt => {
          const active = themeMode === opt.key;
          return (
            <button key={opt.key} type="button" onClick={() => setThemeMode(opt.key)} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 8,
              border: `1.5px solid ${active ? 'var(--cv-accent)' : bdr}`,
              backgroundColor: active ? 'var(--cv-accent-light)' : 'transparent',
              color: active ? 'var(--cv-accent)' : txt,
              fontSize: 13, fontWeight: '600', cursor: 'pointer'
            }}>
              <span>{opt.icon}</span>{opt.label}
            </button>
          );
        })}
      </div>

      {/* Accent Color */}
      <div style={sectionLabel}>Accent Color</div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 22 }}>
        {Object.entries(ACCENTS).map(([key, c]) => (
          <button key={key} type="button" onClick={() => handleAccentPick(key)} title={c.label}
            aria-label={c.label} aria-pressed={accentKey === key}
            style={{
              width: 32, height: 32, borderRadius: '50%', backgroundColor: c.swatch, cursor: 'pointer',
              border: accentKey === key ? `2px solid ${isDark ? '#f1f5f9' : 'white'}` : '2px solid transparent',
              boxShadow: accentKey === key ? `0 0 0 2px ${c.swatch}` : 'none'
            }}
          />
        ))}
      </div>

      {/* Language */}
      <div style={sectionLabel}>Language</div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 8,
        border: '1.5px solid var(--cv-accent)', backgroundColor: 'var(--cv-accent-light)', color: 'var(--cv-accent)',
        fontSize: 13, fontWeight: '600', marginBottom: 22
      }}>
        English <span style={{ fontSize: 11, fontWeight: '500', opacity: 0.75 }}>— only language available right now</span>
      </div>

      {/* Accessibility */}
      <div style={sectionLabel}>Accessibility</div>
      {ACCESSIBILITY_TOGGLES.map((t, i) => (
        <div key={t.key} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '12px 0', borderBottom: i < ACCESSIBILITY_TOGGLES.length - 1 ? `1px solid ${bdr}` : 'none'
        }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: '600', color: txt }}>{t.label}</div>
            <div style={{ fontSize: 12, color: txt2, marginTop: 2 }}>{t.sub}</div>
          </div>
          <button type="button" role="switch" aria-checked={!!a11y[t.key]} onClick={() => handleA11yToggle(t.key)}
            style={{
              position: 'relative', flexShrink: 0, width: 42, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer',
              backgroundColor: a11y[t.key] ? 'var(--cv-accent)' : (isDark ? '#334155' : '#d1d5db'), transition: 'background-color 0.15s'
            }}>
            <span style={{
              position: 'absolute', top: 3, left: a11y[t.key] ? 21 : 3, width: 18, height: 18, borderRadius: '50%',
              backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left 0.15s'
            }} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default PreferencesSettings;
