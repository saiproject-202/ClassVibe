// Design System (Phase 1) — token showcase / living style guide.
//
// Not part of the normal app flow (no nav item links here). Reachable at
// /?designsystem=1 (see index.js) so this and later phases can be reviewed
// in isolation without touching any real page. Uses the same const S = {...}
// inline-style pattern as the rest of the app, but every color/space/radius
// value here is read from a --cv-* CSS var — nothing is hardcoded — so this
// page doubles as a visual regression check for the tokens themselves.

import React, { useState } from 'react';
import { useBreakpoint, BREAKPOINTS } from '../styles/breakpoints';

const GRAYS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
const SPACES = [1, 2, 3, 4, 5, 6, 8, 10, 12];
const FONT_SIZES = ['xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl'];
const RADII = ['sm', 'md', 'lg', 'xl', 'full'];
const SHADOWS = ['sm', 'md', 'lg'];
const ACCENTS = ['accent', 'accent-hover', 'accent-light', 'accent-mid'];
const SEMANTIC = ['bg', 'surface', 'surface-alt', 'border', 'text', 'text-secondary', 'text-muted'];

const Section = ({ title, children }) => (
  <section style={S.section}>
    <h2 style={S.sectionTitle}>{title}</h2>
    {children}
  </section>
);

const Swatch = ({ label, varName }) => (
  <div style={S.swatchCol}>
    <div style={{ ...S.swatchBox, backgroundColor: `var(${varName})` }} />
    <div style={S.swatchLabel}>{label}</div>
    <div style={S.swatchVar}>{varName}</div>
  </div>
);

const DesignSystemPreview = () => {
  const [isDark, setIsDark] = useState(document.body.classList.contains('dark-mode'));
  const bucket = useBreakpoint();

  const toggleDark = () => {
    const next = !isDark;
    document.body.classList.toggle('dark-mode', next);
    setIsDark(next);
  };

  return (
    <div style={{ ...S.page, backgroundColor: 'var(--cv-bg)', color: 'var(--cv-text)' }}>
      <header style={S.header}>
        <div>
          <h1 style={S.h1}>ClassVibe Design System</h1>
          <p style={S.sub}>Phase 1 — tokens only. Not linked from app navigation.</p>
        </div>
        <button style={S.toggleBtn} onClick={toggleDark}>
          {isDark ? '☀️ Light' : '🌙 Dark'}
        </button>
      </header>

      <Section title="Breakpoint (live, via useBreakpoint())">
        <p style={S.body}>
          Current bucket: <strong>{bucket}</strong> at {typeof window !== 'undefined' ? window.innerWidth : '—'}px wide.
          Resize the window to see it change. Thresholds: mobile &lt;{BREAKPOINTS.tablet}px,
          tablet &lt;{BREAKPOINTS.laptop}px, laptop &lt;{BREAKPOINTS.desktop}px, desktop ≥{BREAKPOINTS.desktop}px.
        </p>
      </Section>

      <Section title="Semantic surface tokens">
        <div style={S.swatchRow}>
          {SEMANTIC.map(name => <Swatch key={name} label={name} varName={`--cv-${name}`} />)}
        </div>
      </Section>

      <Section title="Accent tokens (unchanged, runtime-overridable via Settings)">
        <div style={S.swatchRow}>
          {ACCENTS.map(name => <Swatch key={name} label={name} varName={`--cv-${name}`} />)}
        </div>
      </Section>

      <Section title="Neutral scale">
        <div style={S.swatchRow}>
          {GRAYS.map(n => <Swatch key={n} label={`gray-${n}`} varName={`--cv-gray-${n}`} />)}
        </div>
      </Section>

      <Section title="Typography scale">
        {FONT_SIZES.map(size => (
          <div key={size} style={{ fontSize: `var(--cv-font-${size})`, marginBottom: 'var(--cv-space-2)' }}>
            --cv-font-{size} — The quick brown fox jumps over the lazy dog
          </div>
        ))}
      </Section>

      <Section title="Spacing scale (4px grid)">
        {SPACES.map(n => (
          <div key={n} style={S.spaceRow}>
            <span style={S.spaceLabel}>--cv-space-{n}</span>
            <div style={{ height: 14, width: `var(--cv-space-${n})`, backgroundColor: 'var(--cv-accent-mid)', borderRadius: 3 }} />
          </div>
        ))}
      </Section>

      <Section title="Radius scale">
        <div style={S.swatchRow}>
          {RADII.map(r => (
            <div key={r} style={S.radiusCol}>
              <div style={{ ...S.radiusBox, borderRadius: `var(--cv-radius-${r})` }} />
              <div style={S.swatchLabel}>{r}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Shadow scale">
        <div style={S.swatchRow}>
          {SHADOWS.map(s => (
            <div key={s} style={{ ...S.shadowBox, boxShadow: `var(--cv-shadow-${s})` }}>
              {s}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Example composition (card + buttons using tokens)">
        <div style={S.exampleCard}>
          <div style={S.exampleTitle}>Session card example</div>
          <div style={S.exampleBody}>
            Built entirely from tokens: var(--cv-surface) background, var(--cv-border) border,
            var(--cv-radius-lg) corners, var(--cv-shadow-sm) elevation, var(--cv-space-*) padding/gaps.
          </div>
          <div style={S.exampleBtnRow}>
            <button style={S.primaryBtn}>Primary action</button>
            <button style={S.secondaryBtn}>Secondary</button>
          </div>
        </div>
      </Section>
    </div>
  );
};

const S = {
  page: { minHeight: '100vh', padding: 'var(--cv-space-6)', fontFamily: 'var(--cv-font-family)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--cv-space-8)', flexWrap: 'wrap', gap: 'var(--cv-space-4)' },
  h1: { fontSize: 'var(--cv-font-2xl)', margin: 0 },
  sub: { fontSize: 'var(--cv-font-sm)', color: 'var(--cv-text-secondary)', margin: '4px 0 0' },
  toggleBtn: { padding: 'var(--cv-space-2) var(--cv-space-4)', borderRadius: 'var(--cv-radius-md)', border: '1px solid var(--cv-border)', backgroundColor: 'var(--cv-surface)', color: 'var(--cv-text)', cursor: 'pointer', fontSize: 'var(--cv-font-base)' },
  section: { marginBottom: 'var(--cv-space-8)' },
  sectionTitle: { fontSize: 'var(--cv-font-lg)', marginBottom: 'var(--cv-space-4)', borderBottom: '1px solid var(--cv-border)', paddingBottom: 'var(--cv-space-2)' },
  body: { fontSize: 'var(--cv-font-base)', color: 'var(--cv-text-secondary)', lineHeight: 1.6 },
  swatchRow: { display: 'flex', gap: 'var(--cv-space-4)', flexWrap: 'wrap' },
  swatchCol: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 96 },
  swatchBox: { width: 72, height: 48, borderRadius: 'var(--cv-radius-md)', border: '1px solid var(--cv-border)' },
  swatchLabel: { fontSize: 'var(--cv-font-xs)', fontWeight: 600 },
  swatchVar: { fontSize: '9px', color: 'var(--cv-text-muted)', textAlign: 'center' },
  spaceRow: { display: 'flex', alignItems: 'center', gap: 'var(--cv-space-4)', marginBottom: 'var(--cv-space-2)' },
  spaceLabel: { fontSize: 'var(--cv-font-xs)', width: 100, color: 'var(--cv-text-secondary)' },
  radiusCol: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  radiusBox: { width: 64, height: 64, backgroundColor: 'var(--cv-accent-light)', border: '1px solid var(--cv-accent-mid)' },
  shadowBox: { width: 96, height: 64, backgroundColor: 'var(--cv-surface)', borderRadius: 'var(--cv-radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--cv-font-xs)', color: 'var(--cv-text-secondary)' },
  exampleCard: { backgroundColor: 'var(--cv-surface)', border: '1px solid var(--cv-border)', borderRadius: 'var(--cv-radius-lg)', boxShadow: 'var(--cv-shadow-sm)', padding: 'var(--cv-space-5)', maxWidth: 420 },
  exampleTitle: { fontSize: 'var(--cv-font-lg)', fontWeight: 700, marginBottom: 'var(--cv-space-2)' },
  exampleBody: { fontSize: 'var(--cv-font-sm)', color: 'var(--cv-text-secondary)', lineHeight: 1.5, marginBottom: 'var(--cv-space-4)' },
  exampleBtnRow: { display: 'flex', gap: 'var(--cv-space-3)' },
  primaryBtn: { padding: 'var(--cv-space-3) var(--cv-space-5)', borderRadius: 'var(--cv-radius-md)', border: 'none', backgroundColor: 'var(--cv-accent)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 'var(--cv-font-base)' },
  secondaryBtn: { padding: 'var(--cv-space-3) var(--cv-space-5)', borderRadius: 'var(--cv-radius-md)', border: '1px solid var(--cv-border)', backgroundColor: 'transparent', color: 'var(--cv-text)', fontWeight: 600, cursor: 'pointer', fontSize: 'var(--cv-font-base)' },
};

export default DesignSystemPreview;
