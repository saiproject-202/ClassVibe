// src/components/Sidebar.jsx
import React, { useState, useEffect } from 'react';

const Sidebar = ({ isOpen, onClose, group, messages = [], currentUserId }) => {
  const [expandedSection, setExpandedSection] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const getCurrentUser = () => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  };

  const currentUser = getCurrentUser();

  const isAdmin = (() => {
    if (!group || !currentUser) return false;
    const admin = group.admin;
    if (!admin) return false;
    const adminId = typeof admin === 'string' ? admin : (admin._id ?? admin.id ?? admin);
    const userId = currentUser._id ?? currentUser.id ?? currentUser.userId ?? currentUser.uid;
    return String(adminId) === String(userId);
  })();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const pinFromUrl = urlParams.get('pin');
    if (pinFromUrl) {
      setExpandedSection('rejoin');
    }
  }, []);

  // ✅ CALCULATE MESSAGE COUNTS PER USER
  const getMessageCounts = () => {
    const counts = {};
    if (!messages || messages.length === 0) return counts;
    messages.forEach(msg => {
      if (msg.sender && msg.sender._id) {
        const userId = msg.sender._id;
        counts[userId] = (counts[userId] || 0) + 1;
      }
    });
    return counts;
  };

  const messageCounts = getMessageCounts();

  const toggleSection = (section) => {
    setExpandedSection((prev) => (prev === section ? null : section));
    setError('');
    setSuccess('');
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text || '');
      setSuccess('Copied to clipboard');
      setTimeout(() => setSuccess(''), 1800);
    } catch (err) {
      setError('Unable to copy');
      setTimeout(() => setError(''), 1800);
    }
  };

  const openQrInNewTab = (qrData) => {
    if (!qrData) return;
    try {
      const w = window.open();
      w.document.write(`<img src="${qrData}" style="max-width:100%"/>`);
      w.document.title = 'QR Code';
    } catch (e) {
      console.warn('Open QR failed', e);
    }
  };

  const openStudentJoinWithPin = (pin) => {
    if (!pin) return;
    const base = window.location.origin + window.location.pathname;
    window.location.href = `${base}?pin=${encodeURIComponent(pin)}`;
  };

  return (
    <>
      {isOpen && <div style={styles.backdrop} onClick={onClose} />}
      <div style={{ ...styles.sidebar, right: isOpen ? '0' : '-380px' }}>
        <button onClick={onClose} style={styles.closeButton}>✕</button>
        <h2 style={styles.sidebarTitle}>Menu</h2>

        {/* REJOIN SECTION */}
        <div style={styles.section}>
          <div style={styles.sectionHeader} onClick={() => toggleSection('rejoin')}>
            <span style={styles.sectionTitle}>🔗 Rejoin Section</span>
            <span style={styles.arrow}>{expandedSection === 'rejoin' ? '▼' : '▶'}</span>
          </div>
          {expandedSection === 'rejoin' && (
            <div style={styles.sectionContent}>
              {isAdmin ? (
                <>
                  <p style={styles.description}>
                    Share the classroom PIN / QR code with students to let them join.
                  </p>
                  {group && (
                    <div style={styles.qrSection}>
                      {group.qrCode ? (
                        <>
                          <img src={group.qrCode} alt="QR Code" style={styles.qrCode} />
                          <div style={{ marginTop: 8 }}>
                            <button style={styles.smallBtn} onClick={() => copyText(group.pin)}>
                              Copy PIN
                            </button>
                            <button style={styles.smallBtn} onClick={() => copyText(group.qrCode)}>
                              Copy QR
                            </button>
                            <button style={styles.smallBtn} onClick={() => openQrInNewTab(group.qrCode)}>
                              Open QR
                            </button>
                          </div>
                        </>
                      ) : (
                        <p style={{ color: '#666' }}>No QR code generated yet.</p>
                      )}
                      <p style={styles.pinDisplay}>PIN: {group?.pin ?? '—'}</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p style={styles.description}>
                    Scan the teacher's QR or use the PIN below to join this classroom.
                  </p>
                  {group && (
                    <div style={styles.qrSection}>
                      {group.qrCode ? (
                        <>
                          <img src={group.qrCode} alt="QR Code" style={styles.qrCode} />
                          <div style={{ marginTop: 8 }}>
                            <button style={styles.smallBtn} onClick={() => openQrInNewTab(group.qrCode)}>
                              Open QR
                            </button>
                            <button style={styles.smallBtn} onClick={() => copyText(group.qrCode)}>
                              Copy QR
                            </button>
                          </div>
                        </>
                      ) : (
                        <p style={{ color: '#666' }}>QR code not available.</p>
                      )}
                      <p style={styles.pinDisplay}>PIN: {group?.pin ?? '—'}</p>
                      <div style={{ marginTop: 10 }}>
                        <button style={styles.button} onClick={() => openStudentJoinWithPin(group?.pin)}>
                          Join this class (use PIN)
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
              {error && <div style={styles.errorText}>{error}</div>}
              {success && <div style={styles.successText}>{success}</div>}
            </div>
          )}
        </div>

        {/* ✅ ACTIVE USERS SECTION - FILTER: Students with messages only, exclude teacher */}
        <div style={styles.section}>
          <div style={styles.sectionHeader} onClick={() => toggleSection('activeUsers')}>
            <span style={styles.sectionTitle}>👤 Active Students</span>
            <span style={styles.arrow}>{expandedSection === 'activeUsers' ? '▼' : '▶'}</span>
          </div>
          {expandedSection === 'activeUsers' && (
            <div style={styles.sectionContent}>
              {group && group.onlineUsers && group.onlineUsers.length > 0 ? (
                <>
                  <p style={styles.description}>
                    Students who have sent at least one message
                  </p>
                  <div style={styles.activeUsersList}>
                    {(() => {
                      const teacherId = group.admin?._id || group.admin?.id || group.admin;
                      const activeStudents = group.onlineUsers.filter(user => {
                        const userId = user._id || user.id;
                        const isTeacher = String(userId) === String(teacherId);
                        const messageCount = messageCounts[userId] || 0;
                        return !isTeacher && messageCount > 0;
                      });
                      
                      if (activeStudents.length === 0) {
                        return (
                          <p style={styles.noUsers}>
                            No active students yet. Students will appear here after sending their first message.
                          </p>
                        );
                      }
                      
                      return activeStudents.map((user) => {
                        const userId = user._id || user.id;
                        const username = user.username || user.name || 'Unknown';
                        const messageCount = messageCounts[userId] || 0;
                        
                        return (
                          <div key={userId} style={styles.activeUserItem}>
                            <div style={styles.activeUserLeft}>
                              <div style={styles.activeStatusDot} />
                              <span style={styles.activeUserName}>{username}</span>
                            </div>
                            <span style={styles.messageCount}>
                              {messageCount} {messageCount === 1 ? 'msg' : 'msgs'}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  <p style={styles.onlineCount}>
                    🟢 {(() => {
                      const teacherId = group.admin?._id || group.admin?.id || group.admin;
                      const activeStudents = group.onlineUsers.filter(user => {
                        const userId = user._id || user.id;
                        const isTeacher = String(userId) === String(teacherId);
                        const messageCount = messageCounts[userId] || 0;
                        return !isTeacher && messageCount > 0;
                      });
                      return activeStudents.length;
                    })()} active student{(() => {
                      const teacherId = group.admin?._id || group.admin?.id || group.admin;
                      const activeStudents = group.onlineUsers.filter(user => {
                        const userId = user._id || user.id;
                        const isTeacher = String(userId) === String(teacherId);
                        const messageCount = messageCounts[userId] || 0;
                        return !isTeacher && messageCount > 0;
                      });
                      return activeStudents.length !== 1 ? 's' : '';
                    })()}
                  </p>
                </>
              ) : (
                <p style={styles.noUsers}>No users currently online</p>
              )}
            </div>
          )}
        </div>

        {/* PARTICIPATION SECTION */}
        <div style={styles.section}>
          <div style={styles.sectionHeader} onClick={() => toggleSection('participation')}>
            <span style={styles.sectionTitle}>👥 Participation</span>
            <span style={styles.arrow}>{expandedSection === 'participation' ? '▼' : '▶'}</span>
          </div>
          {expandedSection === 'participation' && (
            <div style={styles.sectionContent}>
              {group ? (
                <>
                  <p style={styles.memberCount}>
                    Total Members: {group.members ? group.members.length : 0}
                  </p>
                  <div style={styles.memberList}>
                    {group.members && group.members.map((member) => {
                      const memberId = member._id ?? member.id;
                      const isOnline = group.onlineUsers?.some(
                        u => (u._id || u.id || u) === memberId
                      );
                      return (
                        <div key={memberId} style={styles.memberItem}>
                          <div style={{
                            ...styles.statusDot,
                            backgroundColor: isOnline ? '#28a745' : '#999'
                          }} />
                          <span style={styles.memberName}>
                            {member.username ?? member.name ?? 'Unknown'}
                          </span>
                          {group.admin && String(memberId) === String(group.admin._id ?? group.admin) && (
                            <span style={styles.adminBadge}>Admin</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p style={styles.noGroup}>No group selected</p>
              )}
            </div>
          )}
        </div>

        {/* STATISTICS SECTION */}
        <div style={styles.section}>
          <div style={styles.sectionHeader} onClick={() => toggleSection('stats')}>
            <span style={styles.sectionTitle}>📊 Statistics</span>
            <span style={styles.arrow}>{expandedSection === 'stats' ? '▼' : '▶'}</span>
          </div>
          {expandedSection === 'stats' && (
            <div style={styles.sectionContent}>
              <div style={styles.statItem}>
                <span style={styles.statLabel}>Total Messages:</span>
                <span style={styles.statValue}>{messages?.length || 0}</span>
              </div>
              <div style={styles.statItem}>
                <span style={styles.statLabel}>Online Members:</span>
                <span style={styles.statValue}>{group?.onlineUsers?.length || 0}</span>
              </div>
              <div style={styles.statItem}>
                <span style={styles.statLabel}>Total Members:</span>
                <span style={styles.statValue}>{group?.members?.length || 0}</span>
              </div>
              {group?.createdAt && (
                <div style={styles.statItem}>
                  <span style={styles.statLabel}>Session Started:</span>
                  <span style={styles.statValue}>
                    {new Date(group.createdAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

const styles = {
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 999
  },
  sidebar: {
    position: 'fixed',
    top: 0,
    right: 0,
    width: '380px',
    height: '100vh',
    backgroundColor: 'white',
    boxShadow: '-2px 0 10px rgba(0,0,0,0.1)',
    transition: 'right 0.28s ease',
    zIndex: 1000,
    overflowY: 'auto',
    padding: '20px'
  },
  closeButton: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    background: 'none',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    color: '#666'
  },
  sidebarTitle: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#333',
    marginBottom: '18px'
  },
  section: {
    marginBottom: '18px',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    overflow: 'hidden'
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 15px',
    backgroundColor: '#f8f9fa',
    cursor: 'pointer'
  },
  sectionTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#333'
  },
  arrow: {
    fontSize: '14px',
    color: '#666'
  },
  sectionContent: {
    padding: '14px',
    backgroundColor: 'white'
  },
  description: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '12px'
  },
  qrSection: {
    textAlign: 'center',
    paddingTop: 8
  },
  qrCode: {
    width: '200px',
    height: '200px',
    border: '2px solid #ddd',
    borderRadius: '8px',
    padding: '8px',
    objectFit: 'contain',
    backgroundColor: 'white'
  },
  pinDisplay: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#25D366',
    marginTop: '10px'
  },
  button: {
    padding: '10px 14px',
    fontSize: '14px',
    fontWeight: '600',
    backgroundColor: '#25D366',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  smallBtn: {
    padding: '6px 8px',
    marginRight: 8,
    marginTop: 6,
    fontSize: 13,
    borderRadius: 6,
    border: '1px solid #ddd',
    cursor: 'pointer',
    background: '#fff'
  },
  errorText: {
    fontSize: '13px',
    color: '#dc3545',
    padding: '8px',
    backgroundColor: '#fee',
    borderRadius: '4px',
    marginTop: 8
  },
  successText: {
    fontSize: '13px',
    color: '#28a745',
    padding: '8px',
    backgroundColor: '#efe',
    borderRadius: '4px',
    marginTop: 8
  },
  activeUsersList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '12px'
  },
  activeUserItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    backgroundColor: '#D7F0DD',
    borderRadius: '6px',
    transition: 'all 0.2s'
  },
  activeUserLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  activeStatusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: '#25D366',
    flexShrink: 0
  },
  activeUserName: {
    fontSize: '14px',
    color: '#333',
    fontWeight: '500'
  },
  messageCount: {
    fontSize: '12px',
    color: '#075E54',
    backgroundColor: 'white',
    padding: '3px 8px',
    borderRadius: '12px',
    fontWeight: '600'
  },
  noUsers: {
    fontSize: '14px',
    color: '#999',
    textAlign: 'center',
    padding: '18px'
  },
  memberCount: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '12px'
  },
  memberList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  memberItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px'
  },
  statusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0
  },
  memberName: {
    fontSize: '14px',
    color: '#333',
    flex: 1
  },
  adminBadge: {
    fontSize: '11px',
    padding: '3px 8px',
    backgroundColor: '#075E54',
    color: 'white',
    borderRadius: '12px',
    fontWeight: '600'
  },
  onlineCount: {
    fontSize: '13px',
    color: '#25D366',
    marginTop: '12px',
    fontWeight: '600'
  },
  noGroup: {
    fontSize: '14px',
    color: '#999',
    textAlign: 'center',
    padding: '18px'
  },
  statItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #f0f0f0'
  },
  statLabel: {
    fontSize: '14px',
    color: '#666'
  },
  statValue: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#25D366'
  }
};

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    div[style*="activeUserItem"]:hover {
      background-color: #C1E7CB !important;
      transform: translateX(-5px);
    }
  `;
  document.head.appendChild(style);
}

export default Sidebar;