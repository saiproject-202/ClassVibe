// frontend/src/components/NotificationCenter.jsx
// Notification center panel

import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com';

const NotificationCenter = ({ onClose, onNotificationRead, onMarkAllRead }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  // Private Session system — join_request cards resolve in place (Approve/
  // Reject) rather than navigating anywhere, so track outcome per notification
  // id here instead of relying on a page reload to reflect it.
  const [resolvedRequests, setResolvedRequests] = useState({}); // { [notificationId]: 'approved' | 'declined' }

  // ✅ FIX: useCallback
  const fetchNotifications = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');

      const url =
        filter === 'unread'
          ? `${process.env.REACT_APP_API_URL || "https://classvibe-backend.onrender.com"}/api/notifications/my-notifications?unreadOnly=true`
          : `${process.env.REACT_APP_API_URL || "https://classvibe-backend.onrender.com"}/api/notifications/my-notifications`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications);
      }
    } catch (error) {
      console.error('Fetch notifications error:', error);
    } finally {
      setLoading(false);
    }
  }, [filter]); // ✅ dependency

  // ✅ FIX: dependency added
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleNotificationClick = async (notification) => {
    if (!notification.isRead) {
      try {
        const token = localStorage.getItem('token');

        await fetch(
          `${process.env.REACT_APP_API_URL || "https://classvibe-backend.onrender.com"}/api/notifications/${notification._id}/read`,
          {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` }
          }
        );

        setNotifications((prev) =>
          prev.map((n) =>
            n._id === notification._id ? { ...n, isRead: true } : n
          )
        );

        if (onNotificationRead) onNotificationRead();
      } catch (error) {
        console.error('Mark as read error:', error);
      }
    }

    console.log("📍 Notification clicked:", notification);

    if (notification.type === 'session_started' || notification.type === 'access_approved') {
      const groupId = notification.metadata?.groupId || notification.relatedGroup?._id || notification.relatedGroup;
      const pin = notification.metadata?.pin;
      if (groupId) {
        // pin (when present) makes the join actually re-run the access check —
        // see App.js's joinSession listener — instead of just navigating.
        window.dispatchEvent(new CustomEvent('joinSession', { detail: { groupId, pin } }));
      }
      onClose();
    } else if (notification.type === 'quiz_started') {
      const sessionId = notification.metadata?.sessionId;
      if (sessionId) {
        window.dispatchEvent(new CustomEvent('openWaitingRoom', { detail: { sessionId } }));
      }
      onClose();
    } else if (notification.type === 'session_scheduled') {
      window.dispatchEvent(new CustomEvent('openClassDetails', { detail: { sessionId: notification.metadata?.sessionId } }));
      onClose();
    } else if (notification.type === 'join_request') {
      // Resolves in place via the Approve/Reject buttons below — don't navigate
      // or close the panel on a plain card click.
    } else {
      onClose();
    }
  };

  // Private Session system — teacher approves/rejects an uninvited student's
  // join attempt directly from the notification card.
  const respondToRequest = async (notification, action) => {
    const { groupId, email } = notification.metadata || {};
    if (!groupId || !email) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${API_URL}/api/groups/${groupId}/roster/${encodeURIComponent(email)}/${action}`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        setResolvedRequests(prev => ({ ...prev, [notification._id]: action === 'approve' ? 'approved' : 'declined' }));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || `Failed to ${action} request`);
      }
    } catch (error) {
      console.error(`${action} request error:`, error);
      alert(`Failed to ${action} request`);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const token = localStorage.getItem('token');

      await fetch(
        `${process.env.REACT_APP_API_URL || "https://classvibe-backend.onrender.com"}/api/notifications/mark-all-read`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true }))
      );

      if (onMarkAllRead) onMarkAllRead();
    } catch (error) {
      console.error('Mark all as read error:', error);
    }
  };

  const handleClearRead = async () => {
    if (!window.confirm('Clear all read notifications?')) return;

    try {
      const token = localStorage.getItem('token');

      await fetch(
        `${process.env.REACT_APP_API_URL || "https://classvibe-backend.onrender.com"}/api/notifications/clear-read`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setNotifications((prev) => prev.filter((n) => !n.isRead));
    } catch (error) {
      console.error('Clear notifications error:', error);
    }
  };

const getNotificationIcon = (type) => {
  const icons = {
    session_scheduled: '📅',
    session_starting: '⏰',
    session_started: '🚀',
    quiz_started: '🎮',  // ← Already there!
    quiz_result: '📊',    // ← Already there!
    message: '💬',
    poll_created: '📊',
    session_ended: '🏁',
    session_cancelled: '❌',
    attention_needed: '⚠️',
    achievement: '🏆',
    join_request: '🔔',
    access_approved: '✅',
    access_declined: '🚫'
  };
  return icons[type] || '🔔';
};

  const getTimeAgo = (date) => {
    const now = new Date();
    const then = new Date(date);
    const seconds = Math.floor((now - then) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return then.toLocaleDateString();
  };

  const dk   = document.body.classList.contains('dark-mode');
  const nBg  = dk ? '#1e293b' : 'white';
  const nBdr = dk ? '#334155' : '#e0e0e0';

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.panel, backgroundColor: nBg }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h3 style={styles.title}>Notifications</h3>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        {/* Controls */}
        <div style={{ ...styles.controls, backgroundColor: nBg, borderBottom: `1px solid ${nBdr}` }}>
          <div style={styles.filters}>
            <button
              onClick={() => setFilter('all')}
              style={{
                ...styles.filterBtn,
                backgroundColor: filter === 'all' ? '#075E54' : (dk?'#334155':'#f0f0f0'),
                color: filter === 'all' ? 'white' : (dk?'#f1f5f9':'#333')
              }}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              style={{
                ...styles.filterBtn,
                backgroundColor: filter === 'unread' ? '#075E54' : (dk?'#334155':'#f0f0f0'),
                color: filter === 'unread' ? 'white' : (dk?'#f1f5f9':'#333')
              }}
            >
              Unread
            </button>
          </div>

          <div style={styles.actions}>
            <button onClick={handleMarkAllRead} style={styles.actionBtn}>
              Mark all read
            </button>
            <button onClick={handleClearRead} style={styles.actionBtn}>
              Clear read
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div style={{ ...styles.list, backgroundColor: nBg }}>
          {loading ? (
            <div style={styles.loading}>Loading...</div>
          ) : notifications.length === 0 ? (
            <div style={styles.empty}>
              <div style={styles.emptyIcon}>🔔</div>
              <p style={styles.emptyTitle}>No Notifications Yet</p>
              <p style={styles.emptyText}>You're all caught up.</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification._id}
                onClick={() => handleNotificationClick(notification)}
                style={{
                  ...styles.notificationCard,
                  backgroundColor: notification.isRead ? '#f8f9fa' : '#D7F0DD',
                  borderLeft: notification.isRead 
                    ? '3px solid #e0e0e0' 
                    : '3px solid #25D366'
                }}
              >
                <div style={styles.notificationIcon}>
                  {notification.icon || getNotificationIcon(notification.type)}
                </div>
                <div style={styles.notificationContent}>
                  <div style={styles.notificationHeader}>
                    <div style={styles.notificationTitle}>
                      {notification.title}
                    </div>
                    <div style={styles.notificationTime}>
                      {getTimeAgo(notification.createdAt)}
                    </div>
                  </div>
                  <div style={styles.notificationMessage}>
                    {notification.message}
                  </div>
                  {notification.relatedGroup && (
                    <div style={styles.notificationGroup}>
                      📚 {notification.relatedGroup.groupName}
                    </div>
                  )}
                  {/* Join Now button for live session / just-approved notifications */}
                  {(notification.type === 'session_started' || notification.type === 'access_approved') && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleNotificationClick(notification); }}
                      style={styles.joinNowBtn}
                    >
                      Join Now →
                    </button>
                  )}
                  {/* Private Session system — Approve/Reject an uninvited join attempt */}
                  {notification.type === 'join_request' && (
                    resolvedRequests[notification._id] ? (
                      <div style={styles.requestResolvedLabel}>
                        {resolvedRequests[notification._id] === 'approved' ? '✅ Approved' : '🚫 Declined'}
                      </div>
                    ) : (
                      <div style={styles.requestActions}>
                        <button
                          onClick={(e) => { e.stopPropagation(); respondToRequest(notification, 'approve'); }}
                          style={styles.approveBtn}
                        >
                          Approve
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); respondToRequest(notification, 'reject'); }}
                          style={styles.rejectBtn}
                        >
                          Reject
                        </button>
                      </div>
                    )
                  )}
                </div>
                {!notification.isRead && (
                  <div style={styles.unreadDot}></div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 2000,
    display: 'flex',
    justifyContent: 'flex-end'
  },
  panel: {
    width: '100%',
    maxWidth: '450px',
    height: '100vh',
    backgroundColor: 'white',
    boxShadow: '-4px 0 12px rgba(0,0,0,0.15)',
    display: 'flex',
    flexDirection: 'column'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '2px solid #e0e0e0',
    backgroundColor: '#075E54'
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '700',
    color: 'white'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: 'white',
    padding: '0 5px'
  },
  controls: {
    padding: '15px 20px',
    borderBottom: '1px solid #e0e0e0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px'
  },
  filters: {
    display: 'flex',
    gap: '8px'
  },
  filterBtn: {
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  actions: {
    display: 'flex',
    gap: '8px'
  },
  actionBtn: {
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '600',
    backgroundColor: 'transparent',
    color: '#075E54',
    border: '1px solid #075E54',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '10px'
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#999'
  },
  empty: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#999'
  },
  emptyIcon: {
    fontSize: '56px',
    marginBottom: '12px',
    opacity: 0.4,
  },
  emptyTitle: {
    fontSize: '17px',
    fontWeight: '700',
    color: '#1e293b',
    margin: '0 0 6px',
  },
  emptyText: {
    fontSize: '13px',
    color: '#94a3b8',
    margin: 0,
  },
  notificationCard: {
    display: 'flex',
    gap: '12px',
    padding: '15px',
    marginBottom: '8px',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    position: 'relative'
  },
  notificationIcon: {
    fontSize: '28px',
    flexShrink: 0
  },
  notificationContent: {
    flex: 1,
    minWidth: 0
  },
  notificationHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'start',
    marginBottom: '4px'
  },
  notificationTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#075E54',
    wordBreak: 'break-word'
  },
  notificationTime: {
    fontSize: '11px',
    color: '#666',
    whiteSpace: 'nowrap'
  },
  notificationMessage: {
    fontSize: '13px',
    color: '#333',
    lineHeight: 1.4,
    marginBottom: '4px',
    wordBreak: 'break-word'
  },
  notificationGroup: {
    fontSize: '12px',
    color: '#666',
    fontWeight: '500'
  },
  unreadDot: {
    position: 'absolute',
    top: '15px',
    right: '15px',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#25D366'
  },
  joinNowBtn: {
    marginTop: '8px',
    padding: '6px 14px',
    backgroundColor: 'var(--cv-accent)',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'inline-block'
  },
  requestActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px'
  },
  approveBtn: {
    padding: '6px 14px',
    backgroundColor: '#10B981',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer'
  },
  rejectBtn: {
    padding: '6px 14px',
    backgroundColor: 'transparent',
    color: '#dc2626',
    border: '1.5px solid #dc2626',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer'
  },
  requestResolvedLabel: {
    marginTop: '8px',
    fontSize: '12px',
    fontWeight: '700',
    color: '#6b7280'
  }
};

export default NotificationCenter;