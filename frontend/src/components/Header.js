// frontend/src/components/Header.js
// ✅ UI UPDATE v3
//
// CHANGES vs v2:
//   1. User profile SELF-READS from localStorage
//      → No longer depends on App.js passing `currentUser` prop
//      → If prop IS passed → use it (prop takes priority)
//      → If prop NOT passed → reads from localStorage.getItem('user')
//      → Same pattern Sidebar.js already uses
//
//   2. "View Session PIN & QR" ALWAYS shows when inside a session
//      → Previously only rendered when `onViewPin` prop was wired in App.js
//      → Now: always shows when groupName exists
//      → Click logic:
//          a) If `onViewPin` prop is provided → call it (App.js handles modal)
//          b) Else → show built-in PIN/QR modal inside Header
//      → Built-in modal reads PIN + QR from new optional `group` prop
//         (pass currentGroup from App.js like: <Header group={currentGroup} .../>)
//
//   3. All existing props/logic/styles UNCHANGED

import React, { useState, useEffect } from "react";
import { useBreakpoint } from '../styles/breakpoints';
import NotificationBell from './NotificationBell';

const Header = ({
  // ── Existing props — all kept ──
  onEndSession,
  onLeaveMeeting,
  onCreateGroup,
  onOpenSchedule,
  onOpenQuiz,
  onOpenAnalytics,
  onToggleSidebar,
  isAdmin,
  groupName,
  userRole,
  onBack,
  socket,
  // ── Existing optional props ──
  participantCount,
  sessionStartedAt,
  onViewPin,           // if provided → App.js handles PIN modal; else built-in modal
  currentUser,         // if provided → use it; else read from localStorage
  // ── NEW optional prop ──
  group,               // full group object → group.pin, group.qrCode for built-in modal
                       // pass as: <Header group={currentGroup} ... />
  isDark,              // global dark mode flag
  onToggleTheme,       // theme toggle callback
  onOpenProfile,       // opens the Teacher/Student Profile overlay (App.js)
  // ── Teacher Moderated Chat ──
  moderatedChat,        // current on/off state for this session
  onToggleModeratedChat,// teacher-only toggle callback
}) => {

  // ── Resolve user: prop → localStorage → null ────────────────────────────
  // WHY: App.js may not pass currentUser yet. Header must be self-sufficient.
  // Same approach Sidebar.js uses for getCurrentUser().
  const resolvedUser = currentUser || (() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); }
    catch { return null; }
  })();

  // ── Internal PIN/QR modal state ─────────────────────────────────────────
  const [showPinModal, setShowPinModal] = useState(false);

  // ── "Session started X ago" timer ───────────────────────────────────────
  const [timeAgo, setTimeAgo] = useState('');
  useEffect(() => {
    if (!sessionStartedAt) return;
    const calc = () => {
      const mins = Math.floor((Date.now() - new Date(sessionStartedAt)) / 60000);
      if (mins < 1)  return setTimeAgo('just now');
      if (mins < 60) return setTimeAgo(`${mins} minute${mins !== 1 ? 's' : ''} ago`);
      const hrs = Math.floor(mins / 60);
      setTimeAgo(`${hrs} hour${hrs !== 1 ? 's' : ''} ago`);
    };
    calc();
    const id = setInterval(calc, 60000);
    return () => clearInterval(id);
  }, [sessionStartedAt]);

  const isTeacher = userRole === 'teacher';
  const bucket = useBreakpoint(); // Design System (Phase 2)

  // ── Helpers ──────────────────────────────────────────────────────────────
  const getInitials = (name) => (name || '??').substring(0, 2).toUpperCase();

  // Search: dispatches event → ChatArea.js listens via window.addEventListener
  const toggleSearch = () =>
    window.dispatchEvent(new CustomEvent('toggleChatSearch'));

  // PIN/QR button click handler
  const handleViewPin = () => {
    if (typeof onViewPin === 'function') {
      onViewPin();            // let App.js handle it
    } else {
      setShowPinModal(true);  // show built-in modal
    }
  };

  // Copy text to clipboard
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('Copied!');
    } catch {
      alert('Copy failed — please copy manually');
    }
  };

  // ════════════════════════════════════════════════════════════════════════
  // Compute theme-aware tokens
  const dk    = isDark;
  const hBg   = dk ? '#1e293b' : '#ffffff';
  const hBdr  = dk ? '#334155' : '#e0e7ff';
  const hTxt  = dk ? '#f1f5f9' : '#0f172a';
  const hTxt2 = dk ? '#94a3b8' : '#64748b';

  return (
    <>
      <header style={{ ...S.header, backgroundColor: hBg, borderBottom: `1px solid ${hBdr}`, boxShadow: dk ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(99,102,241,0.08)' }}>

        {/* ═══ ROW 1 — BRAND BAR ═══════════════════════════════════════════
            Left:  ClassVibe wordmark (+ Back button when outside session)
            Right: User profile (name / role / avatar) — self-reads localStorage
                   + Bell + hamburger only when NOT in a session
        ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ ...S.brandRow, backgroundColor: hBg }}>

          <div style={S.brandLeft}>
            <span style={S.logo}>ClassVibe</span>
            {onBack && !groupName && (
              <button onClick={onBack} style={S.backBtn}>← Back</button>
            )}
          </div>

          <div style={S.brandRight}>

            {/* User profile — shows whenever resolvedUser is available */}
            {resolvedUser && (
              <div style={S.userProfile}>
                <div style={S.userTextBlock} className="header-user-text">
                  <span style={{ ...S.userName, color: hTxt }}>
                    {resolvedUser.name || resolvedUser.username || 'User'}
                  </span>
                  <span style={{ ...S.userRoleLabel, color: hTxt2 }}>
                    {resolvedUser.role || userRole || ''}
                  </span>
                </div>
                {/* Avatar: photo → initials circle. Click opens the Profile screen. */}
                <button
                  type="button"
                  onClick={onOpenProfile}
                  style={S.avatarWrap}
                  title="View profile"
                  aria-label="View profile"
                >
                  {resolvedUser.profilePhoto ? (
                    <img
                      src={resolvedUser.profilePhoto}
                      alt="profile"
                      style={S.avatarImg}
                    />
                  ) : (
                    <div style={S.avatarFallback}>
                      {getInitials(resolvedUser.name || resolvedUser.username)}
                    </div>
                  )}
                  <div style={S.onlineDot} />
                </button>
              </div>
            )}

            {/* Bell — always shown outside session */}
            {!groupName && socket && <NotificationBell socket={socket} />}
            {/* Hamburger — outside session, always for teachers; for students only on
                mobile (Design System Phase 2), since desktop/tablet students still
                navigate via DashboardNav, not this drawer. */}
            {!groupName && (userRole !== 'student' || bucket === 'mobile') && (
              <button
                onClick={onToggleSidebar}
                style={S.hamburgerBtn}
                aria-label="Menu"
              >
                <span style={S.hLine} />
                <span style={S.hLine} />
                <span style={S.hLine} />
              </button>
            )}
          </div>
        </div>

        {/* ═══ ROW 2 — SESSION SUB-HEADER ══════════════════════════════════
            Teacher: LIVE | name | View PIN & QR | Live Analytics | End | 🔍 | 🔔 | ⋮
            Student: 💬   | name | SESSION ACTIVE | View PIN      | 🔍 | 🔔 | ⋮
        ═══════════════════════════════════════════════════════════════════ */}
        {groupName && (
          <div style={{ ...S.sessionBar, backgroundColor: hBg, borderBottom: `1px solid ${hBdr}` }}>

            {/* LEFT: session identity */}
            <div style={S.sessionLeft}>
              {isTeacher ? (
                <>
                  <span style={S.liveBadge}>LIVE</span>
                  <div style={S.sessionInfo}>
                    <span style={{ ...S.sessionName, color: hTxt }}>{groupName}</span>
                    {timeAgo && (
                      <span style={{ ...S.sessionMeta, color: hTxt2 }}>Session started {timeAgo}</span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div style={S.chatIconBox}>
                    <span style={{ fontSize: 15 }}>💬</span>
                  </div>
                  <div style={S.sessionInfo}>
                    <span style={{ ...S.sessionName, color: hTxt }}>{groupName}</span>
                    <span style={{ ...S.sessionMeta, color: hTxt2 }}>
                      SESSION ACTIVE
                      {participantCount ? ` • ${participantCount} PARTICIPANTS` : ''}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* RIGHT: action buttons */}
            <div style={S.sessionRight}>

              {/* View Session PIN & QR — ALWAYS shown when in session
                  WHY: Previously only rendered when onViewPin prop existed.
                  Now: always shows. Clicking opens built-in modal OR calls onViewPin. */}
              <button
                onClick={handleViewPin}
                style={{ ...S.pinBtn, backgroundColor: dk?'#1e293b':'#ffffff', color: dk?'#cbd5e1':'#374151', border: `1px solid ${dk?'#334155':'#e2e8f0'}` }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = dk?'#334155':'#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = dk?'#1e293b':'#ffffff'}
              >
                {isTeacher ? 'View Session PIN & QR' : 'View Session PIN'}
              </button>

              {/* Live Analytics — teacher only */}
              {isTeacher && onOpenAnalytics && (
                <button
                  onClick={onOpenAnalytics}
                  style={S.analyticsBtn}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#ffffff'}
                >
                  📊 Live Analytics
                </button>
              )}

              {/* Teacher Moderated Chat toggle — teacher/admin only */}
              {isAdmin && onToggleModeratedChat && (
                <button
                  onClick={onToggleModeratedChat}
                  style={moderatedChat ? S.modChatBtnOn : S.modChatBtnOff}
                  title={moderatedChat ? 'Moderated Chat is ON — student messages are private to you' : 'Turn on Moderated Chat — hide student messages from each other'}
                >
                  🛡 Moderated Chat: {moderatedChat ? 'On' : 'Off'}
                </button>
              )}

              {/* End Session — teacher/admin only */}
              {isAdmin && onEndSession && (
                <button
                  onClick={onEndSession}
                  style={S.endBtn}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#dc2626'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#ef4444'}
                >
                  🔴 End Session
                </button>
              )}

              {/* Leave — student only */}
              {!isAdmin && onLeaveMeeting && groupName && (
                <button
                  onClick={onLeaveMeeting}
                  style={S.leaveBtn}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#ea580c'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f97316'}
                >
                  Leave
                </button>
              )}

              {/* 🔍 Search — dispatches event to ChatArea */}
              <button
                onClick={toggleSearch}
                style={S.searchBtn}
                title="Search messages"
                aria-label="Search messages"
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                🔍
              </button>

              {/* Notification Bell */}
              {socket && <NotificationBell socket={socket} />}

              {/* ⋮ Three-dot menu */}
              <button
                onClick={onToggleSidebar}
                style={S.moreBtn}
                aria-label="More options"
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                ⋮
              </button>

            </div>
          </div>
        )}
      </header>

      {/* ══ PIN / QR MODAL ════════════════════════════════════════════════════
          Shows when "View Session PIN & QR" is clicked and no onViewPin prop.
          Data comes from `group` prop (pass currentGroup from App.js).
          WHY built-in: App.js hasn't wired onViewPin yet — this makes the
          button functional immediately without touching App.js.
      ══════════════════════════════════════════════════════════════════════ */}
      {showPinModal && (
        <div style={M.overlay} onClick={() => setShowPinModal(false)}>
          <div style={{ ...M.card, backgroundColor: dk?'#1e293b':'white' }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ ...M.header, borderBottom: `1px solid ${dk?'#334155':'#f1f5f9'}` }}>
              <div>
                <h2 style={{ ...M.title, color: dk?'#f1f5f9':'#0f172a' }}>Session PIN & QR Code</h2>
                <p style={{ ...M.subtitle, color: dk?'#94a3b8':'#64748b' }}>{groupName}</p>
              </div>
              <button onClick={() => setShowPinModal(false)} style={M.closeBtn}>✕</button>
            </div>

            {/* PIN display */}
            <div style={{ ...M.pinSection, backgroundColor: dk?'#1e293b':undefined }}>
              <p style={{ ...M.pinLabel, color: dk?'#64748b':'#94a3b8' }}>SESSION PIN</p>
              <div style={{ ...M.pinBox, backgroundColor: dk?'#0f172a':'#f8fafc', borderColor: dk?'#334155':'#e2e8f0' }}>
                <span style={{ ...M.pinNumber, color: dk?'#f1f5f9':'#0f172a' }}>
                  {group?.pin
                    ? String(group.pin).replace(/(\d{3})(\d{3})/, '$1-$2')
                    : '— —'}
                </span>
                {group?.pin && (
                  <button
                    style={M.copyBtn}
                    onClick={() => copyToClipboard(String(group.pin))}
                  >
                    📋 Copy PIN
                  </button>
                )}
              </div>
              <p style={{ ...M.pinHint, color: dk?'#94a3b8':'#64748b' }}>
                Share this PIN with students to join the session
              </p>
            </div>

            {/* QR code */}
            {group?.qrCode ? (
              <div style={M.qrSection}>
                <p style={M.pinLabel}>QR CODE</p>
                <div style={{ ...M.qrWrap, backgroundColor: dk?'#0f172a':'#f8fafc', borderColor: dk?'#334155':'#e2e8f0' }}>
                  <img
                    src={group.qrCode}
                    alt="Session QR Code"
                    style={M.qrImg}
                  />
                </div>
                <div style={M.qrActions}>
                  <button
                    style={M.copyBtn}
                    onClick={() => copyToClipboard(
                      group?.pin
                        ? `${window.location.origin}${window.location.pathname}?pin=${group.pin}`
                        : group?.qrCode || ''
                    )}
                  >
                    📋 Copy QR Link
                  </button>
                  <button
                    style={M.copyBtn}
                    onClick={() => {
                      const w = window.open();
                      w.document.write(`<img src="${group.qrCode}" style="max-width:100%;padding:20px"/>`);
                      w.document.title = 'ClassVibe QR Code';
                    }}
                  >
                    🔍 Open Full Size
                  </button>
                </div>
              </div>
            ) : (
              <div style={M.noQr}>
                <span style={{ fontSize: 32, opacity: 0.3 }}>📷</span>
                <p style={{ fontSize: 13, color: '#94a3b8', margin: '8px 0 0' }}>
                  QR code not available for this session
                </p>
              </div>
            )}

            {/* Footer */}
            <div style={{ ...M.footer, borderTop: `1px solid ${dk?'#334155':'#f1f5f9'}` }}>
              <button
                onClick={() => setShowPinModal(false)}
                style={M.doneBtn}
              >
                Done
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};

// ══════════════════════════════════════════════════════════════════════════
//  HEADER STYLES
// ══════════════════════════════════════════════════════════════════════════
const S = {
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 1000,
    boxSizing: 'border-box',
  },

  // Brand row
  brandRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 24px',
    minHeight: 54,
    width: '100%',
    boxSizing: 'border-box',
  },
  brandLeft:  { display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
  logo:       { fontSize: 20, fontWeight: '800', color: '#818cf8', letterSpacing: '-0.5px', userSelect: 'none', whiteSpace: 'nowrap' },
  backBtn:    { padding: '5px 12px', fontSize: 13, fontWeight: '600', borderRadius: 6, cursor: 'pointer', flexShrink: 0 },
  brandRight: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },

  // User profile (brand row right)
  userProfile:    { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' },
  userTextBlock:  { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, minWidth: 0, overflow: 'hidden', maxWidth: 160 },
  userName:       { fontSize: 13, fontWeight: '700', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' },
  userRoleLabel:  { fontSize: 11, textTransform: 'capitalize', whiteSpace: 'nowrap' },
  avatarWrap:     { position: 'relative', flexShrink: 0, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' },
  avatarImg:      { width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e2e8f0', display: 'block' },
  avatarFallback: { width: 36, height: 36, borderRadius: '50%', backgroundColor: 'var(--cv-accent-mid)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: '700' },
  onlineDot:      { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, backgroundColor: '#22c55e', borderRadius: '50%', border: '2px solid white' },

  // Hamburger
  hamburgerBtn: { display: 'flex', flexDirection: 'column', justifyContent: 'space-around', width: 32, height: 28, backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: 2, gap: 4 },
  hLine:        { display: 'block', width: '100%', height: 2, backgroundColor: '#64748b', borderRadius: 1 },

  // Session sub-header — wrap allowed so buttons never get clipped
  sessionBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 20px',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#ffffff',
    flexWrap: 'wrap',
    gap: '6px 8px',
    width: '100%',
    boxSizing: 'border-box',
  },
  sessionLeft: { display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, overflow: 'hidden' },
  liveBadge:   { display: 'inline-flex', alignItems: 'center', padding: '3px 8px', backgroundColor: '#22c55e', color: '#ffffff', borderRadius: 5, fontSize: 10, fontWeight: '800', letterSpacing: '0.8px', flexShrink: 0, lineHeight: 1.6 },
  chatIconBox: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sessionInfo: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, overflow: 'hidden' },
  sessionName: { fontSize: 14, fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  sessionMeta: { fontSize: 10, fontWeight: '600', letterSpacing: '0.3px', textTransform: 'uppercase' },

  // Session right buttons
  sessionRight: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' },
  pinBtn: {
    padding: '7px 13px', fontSize: 12, fontWeight: '500',
    borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background 0.15s',
  },
  analyticsBtn: {
    padding: '7px 13px', fontSize: 12, fontWeight: '500',
    border: '1px solid #e2e8f0', borderRadius: 7,
    cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background 0.15s',
  },
  endBtn: {
    padding: '7px 13px', fontSize: 12, fontWeight: '700',
    backgroundColor: '#ef4444', color: '#ffffff',
    border: 'none', borderRadius: 7, cursor: 'pointer',
    whiteSpace: 'nowrap', transition: 'background 0.15s',
  },
  leaveBtn: {
    padding: '7px 13px', fontSize: 12, fontWeight: '600',
    backgroundColor: '#f97316', color: '#ffffff',
    border: 'none', borderRadius: 7, cursor: 'pointer',
    transition: 'background 0.15s',
  },
  modChatBtnOff: {
    padding: '7px 13px', fontSize: 12, fontWeight: '600',
    backgroundColor: 'transparent', color: '#64748b',
    border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer',
    whiteSpace: 'nowrap', transition: 'background 0.15s',
  },
  modChatBtnOn: {
    padding: '7px 13px', fontSize: 12, fontWeight: '700',
    backgroundColor: '#eef2ff', color: '#4f46e5',
    border: '1px solid #c7d2fe', borderRadius: 7, cursor: 'pointer',
    whiteSpace: 'nowrap', transition: 'background 0.15s',
  },
  searchBtn: {
    width: 34, height: 34, fontSize: 16, color: '#475569',
    backgroundColor: 'transparent', border: '1px solid #e2e8f0',
    borderRadius: 8, cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.15s', flexShrink: 0,
  },
  moreBtn: {
    width: 34, height: 34, fontSize: 22, fontWeight: '700',
    color: '#475569', backgroundColor: 'transparent',
    border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    lineHeight: 1, transition: 'background 0.15s', flexShrink: 0,
  },
};

// ══════════════════════════════════════════════════════════════════════════
//  PIN / QR MODAL STYLES
// ══════════════════════════════════════════════════════════════════════════
const M = {
  overlay: {
    position: 'fixed', inset: 0,
    backgroundColor: 'rgba(15,23,42,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 2000,
    padding: 20,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },

  // Modal header
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '20px 24px 16px',
    borderBottom: '1px solid #f1f5f9',
  },
  title:    { margin: 0, fontSize: 18, fontWeight: '800', color: '#0f172a' },
  subtitle: { margin: '3px 0 0', fontSize: 12, color: '#64748b' },
  closeBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', lineHeight: 1, padding: 4 },

  // PIN section
  pinSection: { padding: '20px 24px 16px' },
  pinLabel:   { margin: '0 0 10px', fontSize: 10, fontWeight: '700', color: '#94a3b8', letterSpacing: '1px', textTransform: 'uppercase' },
  pinBox: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#f8fafc', border: '1.5px solid #e2e8f0',
    borderRadius: 12, padding: '14px 18px',
  },
  pinNumber: { fontSize: 36, fontWeight: '800', color: '#0f172a', letterSpacing: 4, fontVariantNumeric: 'tabular-nums' },
  pinHint:   { margin: '10px 0 0', fontSize: 12, color: '#64748b' },

  // QR section
  qrSection: { padding: '4px 24px 16px' },
  qrWrap: {
    display: 'flex', justifyContent: 'center',
    backgroundColor: '#f8fafc', border: '1.5px solid #e2e8f0',
    borderRadius: 12, padding: 16,
  },
  qrImg:    { width: 180, height: 180, objectFit: 'contain' },
  qrActions:{ display: 'flex', gap: 8, marginTop: 10 },
  noQr:     { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 24px 20px' },

  // Copy button
  copyBtn: {
    padding: '7px 14px', fontSize: 12, fontWeight: '600',
    backgroundColor: '#eef2ff', color: '#4f46e5',
    border: '1px solid #c7d2fe', borderRadius: 8, cursor: 'pointer',
  },

  // Footer
  footer: { padding: '14px 24px 20px' },
  doneBtn: {
    width: '100%', padding: 12, fontSize: 14, fontWeight: '700',
    backgroundColor: 'var(--cv-accent-mid)', color: 'white',
    border: 'none', borderRadius: 10, cursor: 'pointer',
  },
};

export default Header;