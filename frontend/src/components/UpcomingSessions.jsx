// frontend/src/components/UpcomingSessions.jsx
// Student views upcoming scheduled sessions

import React, { useState, useEffect } from 'react';

const UpcomingSessions = ({ onClose }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchUpcomingSessions();
  }, []);

  const fetchUpcomingSessions = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || "https://classvibe-backend.onrender.com"}/api/schedule/available`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      } else {
        setError('Failed to load sessions');
      }
    } catch (error) {
      console.error('Fetch error:', error);
      setError('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (sessionId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || "https://classvibe-backend.onrender.com"}/api/schedule/${sessionId}/register`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.ok) {
        alert('✅ Registered successfully!');
        fetchUpcomingSessions(); // Refresh list
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to register');
      }
    } catch (error) {
      console.error('Register error:', error);
      alert('Failed to register');
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>📅 Upcoming Sessions</h2>
          <button onClick={onClose} style={styles.closeBtn} aria-label="Close">✕</button>
        </div>

        <div style={styles.content}>
          {loading && (
            <div style={styles.loading}>Loading...</div>
          )}

          {error && (
            <div style={styles.error}>{error}</div>
          )}

          {!loading && !error && sessions.length === 0 && (
            <div style={styles.empty}>
              <div style={styles.emptyIcon}>📭</div>
              <p style={styles.emptyText}>No schedules for now...</p>
              <p style={styles.emptySubtext}>
                Check back later for upcoming classes
              </p>
            </div>
          )}

          {!loading && sessions.length > 0 && (
            <div style={styles.sessionsList}>
              {sessions.map((session) => (
                <div key={session._id} style={styles.sessionCard}>
                  <div style={styles.sessionHeader}>
                    <h3 style={styles.sessionName}>{session.sessionName}</h3>
                    {session.isRegistered && (
                      <span style={styles.registeredBadge}>✓ Registered</span>
                    )}
                  </div>

                  <div style={styles.sessionDetails}>
                    <div style={styles.detailRow}>
                      <span style={styles.icon}>📚</span>
                      <span>{session.subject}</span>
                    </div>

                    <div style={styles.detailRow}>
                      <span style={styles.icon}>👨‍🏫</span>
                      <span>{session.teacher?.name || 'Teacher'}</span>
                    </div>

                    <div style={styles.detailRow}>
                      <span style={styles.icon}>📅</span>
                      <span>{formatDate(session.scheduledDate)}</span>
                    </div>

                    <div style={styles.detailRow}>
                      <span style={styles.icon}>🕒</span>
                      <span>{session.scheduledTime} ({session.duration} min)</span>
                    </div>

                    {session.description && (
                      <div style={styles.description}>
                        {session.description}
                      </div>
                    )}

                    <div style={styles.stats}>
                      <span style={styles.statItem}>
                        👥 {session.registeredStudents?.length || 0}/{session.maxStudents} students
                      </span>
                      {session.spotsLeft !== undefined && (
                        <span style={styles.statItem}>
                          {session.spotsLeft} spots left
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={styles.cardFooter}>
                    {!session.isRegistered ? (
                      <button
                        onClick={() => handleRegister(session._id)}
                        style={styles.registerBtn}
                        disabled={session.spotsLeft === 0}
                      >
                        {session.spotsLeft === 0 ? 'Full' : 'Register'}
                      </button>
                    ) : (
                      <button style={styles.waitingBtn} disabled>
                        Waiting for session to start...
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '700px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '1px solid #e0e0e0',
    backgroundColor: '#075E54'
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '600',
    color: 'white'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: 'white'
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px'
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
    fontSize: '16px'
  },
  error: {
    padding: '15px',
    backgroundColor: '#fee',
    color: '#c33',
    borderRadius: '8px',
    textAlign: 'center'
  },
  empty: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#999'
  },
  emptyIcon: {
    fontSize: '64px',
    marginBottom: '20px'
  },
  emptyText: {
    fontSize: '20px',
    fontWeight: '600',
    marginBottom: '10px',
    color: '#666'
  },
  emptySubtext: {
    fontSize: '14px',
    color: '#999'
  },
  sessionsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  sessionCard: {
    backgroundColor: 'white',
    border: '1px solid #e0e0e0',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    transition: 'all 0.2s'
  },
  sessionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px'
  },
  sessionName: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '600',
    color: '#075E54'
  },
  registeredBadge: {
    padding: '4px 12px',
    backgroundColor: '#D7F0DD',
    color: '#075E54',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600'
  },
  sessionDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '15px'
  },
  detailRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '14px',
    color: '#333'
  },
  icon: {
    fontSize: '16px',
    width: '20px'
  },
  description: {
    padding: '10px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
    fontSize: '13px',
    color: '#666',
    fontStyle: 'italic'
  },
  stats: {
    display: 'flex',
    gap: '15px',
    fontSize: '12px',
    color: '#666',
    marginTop: '10px'
  },
  statItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px'
  },
  cardFooter: {
    marginTop: '15px',
    paddingTop: '15px',
    borderTop: '1px solid #f0f0f0'
  },
  registerBtn: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    fontWeight: '600',
    backgroundColor: '#25D366',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  waitingBtn: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    fontWeight: '600',
    backgroundColor: '#f0f0f0',
    color: '#666',
    border: 'none',
    borderRadius: '8px'
  }
};

export default UpcomingSessions;