// frontend/src/components/NotificationBell.jsx
// ✅ STYLING UPDATE — fixed for white header
//
// CHANGES:
//   1. Removed `filter: grayscale(100%) brightness(200%)` — was designed for dark header,
//      made bell INVISIBLE on new white header
//   2. Bell container: removed dark bg, added light border to match white header style
//   3. Badge: updated to match new red (#ef4444) instead of Bootstrap #DC3545
//   4. Toast: updated colors to match new indigo/slate design language
//   5. All notification logic (socket, fetch, toast) — 100% UNCHANGED

import React, { useState, useEffect, useRef } from 'react';
import NotificationCenter from './NotificationCenter';

// Settings → Notifications → Sound: a short synthesized "ding", no audio asset needed.
const playNotificationSound = () => {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (err) {
    console.warn('Notification sound failed:', err);
  }
};

const NotificationBell = ({ socket }) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [showCenter,  setShowCenter]  = useState(false);
  const [prefs, setPrefs] = useState({ soundEnabled: true });
  const bellRef = useRef(null);

  // Socket callback below is registered once and closes over stale state, so read
  // prefs through a ref that's always current instead of re-subscribing on every change.
  const prefsRef = useRef(prefs);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);

  useEffect(() => {
    fetchUnreadCount();
    fetchPrefs();

    if (socket) {
      socket.on('newNotification', (notification) => {
        setUnreadCount(prev => prev + 1);
        if (prefsRef.current.soundEnabled) playNotificationSound();
        showToast(notification);
      });
    }

    return () => {
      if (socket) socket.off('newNotification');
    };
  }, [socket]); // eslint-disable-line

  const fetchPrefs = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com'}/api/notifications/settings`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.ok) {
        const data = await response.json();
        setPrefs(p => ({ ...p, ...data.settings }));
      }
    } catch (err) {
      console.error('Fetch notification prefs error:', err);
    }
  };

  // ── Fetch unread count — UNCHANGED ────────────────────────────────────────
  const fetchUnreadCount = async () => {
    try {
      const token    = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com'}/api/notifications/unread-count`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.count);
      }
    } catch (err) {
      console.error('Fetch unread count error:', err);
    }
  };

  // ── Toast notification — updated colors for new design ────────────────────
  const showToast = (notification) => {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: white;
      padding: 14px 18px;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.14);
      border-left: 4px solid var(--cv-accent-mid);
      z-index: 10000;
      min-width: 280px;
      max-width: 380px;
      animation: toastSlideIn 0.3s ease;
      cursor: pointer;
    `;

    // Escape before building innerHTML — title/message can originate from
    // teacher-entered text (quiz titles, session names), so treat as untrusted.
    const div = document.createElement('div');
    div.textContent = notification.title || 'New Notification';
    const safeTitle = div.innerHTML;
    div.textContent = notification.message || '';
    const safeMessage = div.innerHTML;

    toast.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <span style="font-size:22px;flex-shrink:0;">${notification.icon || '🔔'}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;color:#0f172a;font-size:14px;margin-bottom:3px;">
            ${safeTitle}
          </div>
          <div style="font-size:13px;color:#64748b;line-height:1.4;">
            ${safeMessage}
          </div>
        </div>
        <button onclick="this.parentElement.parentElement.remove()"
          style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:16px;padding:0;line-height:1;flex-shrink:0;">✕</button>
      </div>
    `;

    // Inject animation if not already present
    if (!document.getElementById('toast-anim-style')) {
      const s = document.createElement('style');
      s.id = 'toast-anim-style';
      s.textContent = `
        @keyframes toastSlideIn {
          from { transform: translateX(400px); opacity: 0; }
          to   { transform: translateX(0);     opacity: 1; }
        }
      `;
      document.head.appendChild(s);
    }

    toast.onclick = (e) => {
      if (e.target.tagName !== 'BUTTON') {
        setShowCenter(true);
        toast.remove();
      }
    };

    document.body.appendChild(toast);

    // Auto-dismiss after 5 s
    setTimeout(() => {
      if (document.body.contains(toast)) {
        toast.style.transition = 'opacity 0.3s, transform 0.3s';
        toast.style.opacity    = '0';
        toast.style.transform  = 'translateX(400px)';
        setTimeout(() => toast.remove(), 300);
      }
    }, 5000);
  };

  const handleBellClick       = () => setShowCenter(v => !v);
  const handleNotificationRead = () => setUnreadCount(p => Math.max(0, p - 1));
  const handleMarkAllRead      = () => setUnreadCount(0);

  // ════════════════════════════════════════════════════════════════════════
  return (
    <>
      <div ref={bellRef} style={S.container} onClick={handleBellClick} title="Notifications">
        <div style={S.bell}>
          {/* Bell icon — no filter, visible on white header */}
          <span style={S.bellIcon}>🔔</span>
          {unreadCount > 0 && (
            <div style={S.badge}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </div>
          )}
        </div>
      </div>

      {showCenter && (
        <NotificationCenter
          onClose={() => setShowCenter(false)}
          onNotificationRead={handleNotificationRead}
          onMarkAllRead={handleMarkAllRead}
        />
      )}
    </>
  );
};

// ══════════════════════════════════════════════════════════════════════════
//  STYLES — designed for white header
// ══════════════════════════════════════════════════════════════════════════
const S = {
  container: {
    position: 'relative',
    cursor: 'pointer',
    flexShrink: 0,
  },

  bell: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    borderRadius: 8,
    // ✅ Light border, transparent bg — matches white header design
    backgroundColor: 'transparent',
    border: '1px solid #e2e8f0',
    transition: 'background 0.15s',
  },

  bellIcon: {
    fontSize: 17,
    // ✅ NO filter — bell emoji is naturally visible on white
    lineHeight: 1,
  },

  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#ef4444',
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
    padding: '2px 5px',
    borderRadius: 10,
    minWidth: 16,
    textAlign: 'center',
    lineHeight: '14px',
    boxShadow: '0 1px 4px rgba(239,68,68,0.4)',
  },
};

export default NotificationBell;