// frontend/src/components/NotificationSettings.jsx
// Settings → Notifications (General) — real, persisted toggles backed by
// GET/PUT /api/notifications/settings (see backend/routes/notifications.js).

import React, { useState, useEffect } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com';

const DEFAULTS = {
  notificationsEnabled: true,
  emailNotifications: true,
  pushNotifications: true,
  soundEnabled: true,
  previewEnabled: true
};

const TOGGLES = [
  { key: 'pushNotifications',    label: 'Push Notifications', sub: "Real-time alerts while you're using ClassVibe", icon: '📲' },
  { key: 'emailNotifications',   label: 'Email Notifications', sub: 'Also send notifications to your email address', icon: '✉️' },
  { key: 'soundEnabled',         label: 'Sound', sub: 'Play a sound when a new notification arrives', icon: '🔊' }
];

const NotificationSettings = ({ isDark }) => {
  const [prefs, setPrefs] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/notifications/settings`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setPrefs({ ...DEFAULTS, ...data.settings });
        }
      } catch (err) {
        console.error('Load notification settings error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleToggle = async (key) => {
    const prevPrefs = prefs;
    const nextValue = !prefs[key];
    setPrefs(p => ({ ...p, [key]: nextValue }));
    setSavingKey(key);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/notifications/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [key]: nextValue })
      });
      if (!res.ok) throw new Error('Save failed');
      const data = await res.json();
      setPrefs({ ...DEFAULTS, ...data.settings });
    } catch (err) {
      console.error('Save notification settings error:', err);
      setPrefs(prevPrefs);
      setError('Failed to save — try again');
    } finally {
      setSavingKey(null);
    }
  };

  const txt  = isDark ? '#f1f5f9' : '#111827';
  const txt2 = isDark ? '#94a3b8' : '#6b7280';
  const bdr  = isDark ? '#334155' : '#e5e7eb';

  if (loading) {
    return <div style={{ padding: '16px 24px', fontSize: 13, color: txt2 }}>Loading notification settings…</div>;
  }

  return (
    <div style={{ padding: '4px 24px 20px' }}>
      {TOGGLES.map((t, i) => (
        <div key={t.key} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '14px 0',
          borderBottom: i < TOGGLES.length - 1 ? `1px solid ${bdr}` : 'none'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{t.icon}</span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: '600', color: txt }}>{t.label}</div>
              <div style={{ fontSize: 12, color: txt2, marginTop: 2 }}>{t.sub}</div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={prefs[t.key]}
            disabled={savingKey === t.key}
            onClick={() => handleToggle(t.key)}
            style={{
              position: 'relative', flexShrink: 0, width: 42, height: 24, borderRadius: 999,
              border: 'none', cursor: savingKey === t.key ? 'not-allowed' : 'pointer',
              backgroundColor: prefs[t.key] ? 'var(--cv-accent)' : (isDark ? '#334155' : '#d1d5db'),
              transition: 'background-color 0.15s'
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: prefs[t.key] ? 21 : 3,
              width: 18, height: 18, borderRadius: '50%', backgroundColor: 'white',
              boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left 0.15s'
            }} />
          </button>
        </div>
      ))}
      {error && <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>{error}</div>}
    </div>
  );
};

export default NotificationSettings;
