// Design System (Phase 2) — mobile bottom navigation.
//
// Mirrors DashboardNav's `items`/`activeView`/`onNavigate` prop shape so
// App.js mounts both identically per hub, differing only in which one is
// visible for the current breakpoint. Renders nothing above the `mobile`
// bucket — DashboardNav's docked sidebar takes over there.

import React from 'react';
import { useBreakpoint } from '../styles/breakpoints';

const BottomNav = ({ items, activeView, onNavigate }) => {
  const bucket = useBreakpoint();
  if (bucket !== 'mobile') return null;

  return (
    <nav className="cv-bottom-nav-safe-area" style={S.bar}>
      {items.map((item, i) => {
        const active = activeView === item.view;
        return (
          <button
            key={i}
            onClick={() => onNavigate(item.view)}
            style={{ ...S.tab, color: active ? 'var(--cv-accent)' : 'var(--cv-text-secondary)' }}
          >
            <span style={{ fontSize: 'var(--cv-font-xl)' }}>{item.icon}</span>
            <span style={{ ...S.label, fontWeight: active ? '700' : '500' }}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

const S = {
  bar: {
    position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 500,
    display: 'flex', justifyContent: 'space-around', alignItems: 'center',
    backgroundColor: 'var(--cv-surface)', borderTop: '1px solid var(--cv-border)',
    paddingTop: 6,
  },
  tab: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    border: 'none', background: 'none', cursor: 'pointer', padding: '4px 2px',
  },
  label: { fontSize: 'var(--cv-font-xs)' },
};

export default BottomNav;
