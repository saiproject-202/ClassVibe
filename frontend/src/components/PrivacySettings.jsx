// frontend/src/components/PrivacySettings.jsx
// Settings → Privacy — Online Status. Backed by GET/PUT /api/privacy/settings
// (see backend/routes/privacy.js). Turning this off hides the user from every
// "X online" / online-members list across the app — enforced server-side in
// server.js (getHiddenOnlineUserIds) and models/User.js (toJSON isOnline mask),
// not just a cosmetic frontend flag.

import React, { useState, useEffect } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com';

const PrivacySettings = ({ isDark }) => {
  const [showOnlineStatus, setShowOnlineStatus] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/privacy/settings`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && typeof data.settings?.showOnlineStatus === 'boolean') {
            setShowOnlineStatus(data.settings.showOnlineStatus);
          }
        }
      } catch (err) {
        console.error('Load privacy settings error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleToggle = async () => {
    const prev = showOnlineStatus;
    const next = !prev;
    setShowOnlineStatus(next);
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/privacy/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ showOnlineStatus: next })
      });
      if (!res.ok) throw new Error('Save failed');
    } catch (err) {
      console.error('Save privacy settings error:', err);
      setShowOnlineStatus(prev);
      setError('Failed to save — try again');
    } finally {
      setSaving(false);
    }
  };

  const txt  = isDark ? '#f1f5f9' : '#111827';
  const txt2 = isDark ? '#94a3b8' : '#6b7280';
  const sectionLabel = { fontSize: 12, fontWeight: '700', color: txt2, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '4px 0 10px' };

  if (loading) {
    return <div style={{ padding: '16px 24px', fontSize: 13, color: txt2 }}>Loading privacy settings…</div>;
  }

  return (
    <div style={{ padding: '4px 24px 20px' }}>
      <div style={sectionLabel}>Online Status</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: '600', color: txt }}>Show Online Status</div>
          <div style={{ fontSize: 12, color: txt2, marginTop: 2 }}>Let others see when you're active in a classroom</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={showOnlineStatus}
          disabled={saving}
          onClick={handleToggle}
          style={{
            position: 'relative', flexShrink: 0, width: 42, height: 24, borderRadius: 999,
            border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            backgroundColor: showOnlineStatus ? 'var(--cv-accent)' : (isDark ? '#334155' : '#d1d5db'),
            transition: 'background-color 0.15s'
          }}
        >
          <span style={{
            position: 'absolute', top: 3, left: showOnlineStatus ? 21 : 3,
            width: 18, height: 18, borderRadius: '50%', backgroundColor: 'white',
            boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left 0.15s'
          }} />
        </button>
      </div>
      {error && <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626' }}>{error}</div>}
    </div>
  );
};

export default PrivacySettings;
