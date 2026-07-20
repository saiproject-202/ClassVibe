// Design System (Phase 2) — shared dashboard navigation sidebar.
//
// Replaces two nearly-identical inline sidebars that used to live directly
// in App.js JSX (Instructor Hub + Student Hub), each with its own
// duplicated collapse/nav/user/logout markup. Same visual language and
// interaction (collapsible, active-item highlight, avatar+name+role,
// logout), now built once from Phase 1's design tokens and reused by both
// roles via props.
//
// Responsive split: on `mobile` this renders nothing — App.js mounts
// <BottomNav> instead for that breakpoint. Tablet and up keep today's
// docked, collapsible sidebar behavior unchanged.

import React from 'react';
import { useBreakpoint } from '../styles/breakpoints';

const DashboardNav = ({
  items,          // [{ icon, label, view }]
  activeView,
  onNavigate,
  isOpen,
  onToggle,
  displayName,
  avatar,         // ReactNode (emoji or initial-letter div — caller decides)
  roleLabel,
  onLogout,
}) => {
  const bucket = useBreakpoint();
  if (bucket === 'mobile') return null; // BottomNav takes over on mobile

  return (
    <div style={{ ...S.sidebar, width: isOpen ? 220 : 60, transition: 'width 0.22s ease', overflow: 'hidden' }}>
      <button
        style={S.logoToggleBtn}
        onClick={onToggle}
        title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        <span style={{ fontSize: 20, flexShrink: 0 }}>🎓</span>
        {isOpen && <span style={S.logoText}>ClassVibe</span>}
      </button>

      {items.map((item, i) => {
        const active = activeView === item.view;
        return (
          <button
            key={i}
            title={!isOpen ? item.label : undefined}
            style={{
              ...S.navItem,
              justifyContent: isOpen ? 'flex-start' : 'center',
              backgroundColor: active ? 'var(--cv-accent-light)' : 'transparent',
              color: active ? 'var(--cv-accent)' : 'var(--cv-text-secondary)',
              fontWeight: active ? '700' : '500',
            }}
            onClick={() => onNavigate(item.view)}
          >
            <span style={S.navIcon}>{item.icon}</span>
            {isOpen && <span>{item.label}</span>}
          </button>
        );
      })}

      <div style={S.spacer} />

      {isOpen ? (
        <div style={S.userRow}>
          <div style={S.avatar}>{avatar}</div>
          <div>
            <div style={S.userName}>{displayName}</div>
            <div style={S.userRoleText}>{roleLabel}</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
          <div style={{ ...S.avatar, cursor: 'default' }} title={displayName}>{avatar}</div>
        </div>
      )}

      <button onClick={onLogout} className="cv-nav-logout-btn" style={{ ...S.logoutBtn, margin: isOpen ? '6px 10px 10px' : '6px 8px 10px' }}>
        {isOpen ? '→ Logout' : '🚪'}
      </button>
    </div>
  );
};

const S = {
  sidebar: {
    flexShrink: 0,
    backgroundColor: 'var(--cv-surface)',
    borderRight: '1px solid var(--cv-border)',
    display: 'flex',
    flexDirection: 'column',
    padding: 'var(--cv-space-3) 0',
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  logoToggleBtn: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    border: 'none', background: 'none', cursor: 'pointer',
    padding: '8px 14px 20px', color: 'var(--cv-accent-mid)', textAlign: 'left',
  },
  logoText: { fontSize: 'var(--cv-font-lg)', fontWeight: '900', letterSpacing: '-0.5px', whiteSpace: 'nowrap', overflow: 'hidden' },
  navItem: {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px',
    border: 'none', background: 'none', fontSize: 'var(--cv-font-base)', cursor: 'pointer',
    width: '100%', textAlign: 'left', transition: 'all 0.15s', whiteSpace: 'nowrap', overflow: 'hidden',
  },
  navIcon: { fontSize: 'var(--cv-font-lg)', width: 20, textAlign: 'center', flexShrink: 0 },
  spacer: { flex: 1 },
  userRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderTop: '1px solid var(--cv-border)' },
  avatar: {
    width: 34, height: 34, borderRadius: '50%', backgroundColor: 'var(--cv-accent-light)',
    color: 'var(--cv-accent-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 'var(--cv-font-base)', fontWeight: '700', flexShrink: 0,
  },
  userName: { fontSize: 'var(--cv-font-base)', fontWeight: '700', color: 'var(--cv-text)', whiteSpace: 'nowrap', overflow: 'hidden' },
  userRoleText: { fontSize: 'var(--cv-font-xs)', color: 'var(--cv-text-muted)' },
  logoutBtn: {
    padding: '10px 14px', border: '1.5px solid #FCA5A5', borderRadius: 'var(--cv-radius-md)',
    background: '#FEF2F2', fontSize: 'var(--cv-font-sm)', fontWeight: '700', color: '#DC2626',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    whiteSpace: 'nowrap', overflow: 'hidden', transition: 'all 0.18s ease',
  },
};

export default DashboardNav;
