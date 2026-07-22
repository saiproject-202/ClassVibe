// frontend/src/components/StudentProfile.jsx
// Detailed student profile and analytics

import React, { useState, useEffect, useCallback } from 'react';

const StudentProfile = ({ studentId, groupId, onClose, onBack }) => {
  const [analytics, setAnalytics] = useState(null);
  const [recentQuizzes, setRecentQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);

  // ✅ FIX: useCallback
  const fetchStudentData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');

      const response = await fetch(
        `${process.env.REACT_APP_API_URL || "https://classvibe-backend.onrender.com"}/api/analytics/student/${studentId}/group/${groupId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setAnalytics(data.analytics);
        setRecentQuizzes(data.recentQuizzes);
      }
    } catch (error) {
      console.error('Fetch student data error:', error);
    } finally {
      setLoading(false);
    }
  }, [studentId, groupId]); // ✅ dependencies

  // ✅ FIX: dependency added
  useEffect(() => {
    fetchStudentData();
  }, [fetchStudentData]);

  const getPerformanceColor = (level) => {
    const colors = {
      'Excellent': '#25D366',
      'Good': '#128C7E',
      'Average': '#FFA500',
      'Below Average': '#FF6B6B',
      'Needs Attention': '#DC3545'
    };
    return colors[level] || '#999';
  };

  const formatDate = (date) => {
    if (!date) return 'Never';
    const d = new Date(date);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  };

  const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  if (loading) {
    return (
      <div style={styles.overlay}>
        <div style={styles.loading}>Loading profile...</div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div style={styles.overlay}>
        <div style={styles.error}>Failed to load student data</div>
      </div>
    );
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <button onClick={onBack} style={styles.backBtn}>← Back</button>
          <h2 style={styles.title}>Student Profile</h2>
          <button onClick={onClose} style={styles.closeBtn} aria-label="Close">✕</button>
        </div>

        <div style={styles.content}>
          {/* Student Info Card */}
          <div style={styles.infoCard}>
            <div style={styles.avatar}>{analytics.student.name.charAt(0).toUpperCase()}</div>
            <div style={styles.studentDetails}>
              <h3 style={styles.studentName}>{analytics.student.name}</h3>
              <p style={styles.studentEmail}>{analytics.student.email}</p>
              <p style={styles.studentUsername}>@{analytics.student.username}</p>
            </div>
            <div
              style={{
                ...styles.performanceBadge,
                backgroundColor: getPerformanceColor(analytics.performanceLevel)
              }}
            >
              {analytics.performanceLevel}
            </div>
          </div>

          {/* Attention Flags */}
          {analytics.needsAttention && (
            <div style={styles.attentionBox}>
              <h4 style={styles.attentionTitle}>⚠️ Needs Attention</h4>
              <ul style={styles.attentionList}>
                {analytics.attentionReasons.map((reason, index) => (
                  <li key={index} style={styles.attentionItem}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Stats Grid */}
          <div style={styles.statsGrid}>
            {/* Attendance Section */}
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>📅 Attendance</h4>
              <div style={styles.statsRow}>
                <div style={styles.statBox}>
                  <div style={styles.statValue}>{analytics.sessionAttendance.length}</div>
                  <div style={styles.statLabel}>Total Sessions</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statValue}>{analytics.engagement.participationRate}%</div>
                  <div style={styles.statLabel}>Attendance Rate</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statValue}>
                    {formatDuration(
                      analytics.sessionAttendance.reduce((sum, s) => sum + (s.duration || 0), 0)
                    )}
                  </div>
                  <div style={styles.statLabel}>Total Time</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statValue}>{formatDate(analytics.engagement.lastActive)}</div>
                  <div style={styles.statLabel}>Last Active</div>
                </div>
              </div>
            </div>

            {/* Quiz Performance */}
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>🎮 Quiz Performance</h4>
              <div style={styles.statsRow}>
                <div style={styles.statBox}>
                  <div style={styles.statValue}>{analytics.quizStats.totalQuizzesTaken}</div>
                  <div style={styles.statLabel}>Quizzes Taken</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statValue}>{Math.round(analytics.quizStats.averageScore)}</div>
                  <div style={styles.statLabel}>Average Score</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statValue}>{analytics.quizStats.highestScore}</div>
                  <div style={styles.statLabel}>Highest Score</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statValue}>
                    {analytics.quizStats.totalQuestions > 0
                      ? Math.round((analytics.quizStats.correctAnswers / analytics.quizStats.totalQuestions) * 100)
                      : 0}%
                  </div>
                  <div style={styles.statLabel}>Accuracy</div>
                </div>
              </div>

              {/* Badges */}
              <div style={styles.badges}>
                <div style={styles.badge}>
                  <span style={styles.badgeIcon}>🥇</span>
                  <span style={styles.badgeCount}>{analytics.quizStats.badges.gold}</span>
                </div>
                <div style={styles.badge}>
                  <span style={styles.badgeIcon}>🥈</span>
                  <span style={styles.badgeCount}>{analytics.quizStats.badges.silver}</span>
                </div>
                <div style={styles.badge}>
                  <span style={styles.badgeIcon}>🥉</span>
                  <span style={styles.badgeCount}>{analytics.quizStats.badges.bronze}</span>
                </div>
              </div>
            </div>

            {/* Engagement */}
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>💬 Engagement</h4>
              <div style={styles.statsRow}>
                <div style={styles.statBox}>
                  <div style={styles.statValue}>{analytics.messageStats.totalMessages}</div>
                  <div style={styles.statLabel}>Total Messages</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statValue}>{analytics.messageStats.textMessages}</div>
                  <div style={styles.statLabel}>Text Messages</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statValue}>{analytics.messageStats.fileUploads}</div>
                  <div style={styles.statLabel}>Files Uploaded</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statValue}>{analytics.messageStats.pollsParticipated}</div>
                  <div style={styles.statLabel}>Polls Participated</div>
                </div>
              </div>
            </div>

            {/* Weekly Trends */}
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>📈 This Week</h4>
              <div style={styles.statsRow}>
                <div style={styles.statBox}>
                  <div style={styles.statValue}>{analytics.weeklyTrends.messagesThisWeek}</div>
                  <div style={styles.statLabel}>Messages</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statValue}>{analytics.weeklyTrends.quizzesThisWeek}</div>
                  <div style={styles.statLabel}>Quizzes</div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statValue}>{analytics.weeklyTrends.attendanceThisWeek}</div>
                  <div style={styles.statLabel}>Attendance</div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Quizzes */}
          {recentQuizzes.length > 0 && (
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>📝 Recent Quizzes</h4>
              <div style={styles.quizzesList}>
                {recentQuizzes.map((quiz) => (
                  <div key={quiz._id} style={styles.quizCard}>
                    <div style={styles.quizHeader}>
                      <div style={styles.quizTitle}>{quiz.quiz.title}</div>
                      <div style={styles.quizScore}>
                        {quiz.score}/{quiz.maxScore}
                      </div>
                    </div>
                    <div style={styles.quizStats}>
                      <span style={styles.quizStat}>
                        ✓ {quiz.correctAnswers}/{quiz.totalQuestions} correct
                      </span>
                      <span style={styles.quizStat}>
                        {quiz.percentage}%
                      </span>
                      <span style={styles.quizStat}>
                        Rank #{quiz.rank}
                      </span>
                      {quiz.badge && (
                        <span style={styles.quizBadge}>
                          {quiz.badge === 'gold' && '🥇'}
                          {quiz.badge === 'silver' && '🥈'}
                          {quiz.badge === 'bronze' && '🥉'}
                        </span>
                      )}
                    </div>
                    <div style={styles.quizDate}>
                      {new Date(quiz.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
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
    zIndex: 2001
  },
  container: {
    backgroundColor: 'white',
    borderRadius: '12px',
    width: '95%',
    maxWidth: '1000px',
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
    borderBottom: '2px solid #e0e0e0',
    backgroundColor: '#075E54'
  },
  backBtn: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '600',
    backgroundColor: '#128C7E',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  title: {
    margin: 0,
    fontSize: '22px',
    fontWeight: '700',
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
  infoCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    padding: '20px',
    backgroundColor: '#D7F0DD',
    borderRadius: '12px',
    marginBottom: '20px'
  },
  avatar: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    backgroundColor: '#075E54',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '36px',
    fontWeight: '700'
  },
  studentDetails: {
    flex: 1
  },
  studentName: {
    margin: '0 0 5px 0',
    fontSize: '24px',
    fontWeight: '700',
    color: '#075E54'
  },
  studentEmail: {
    margin: '0 0 3px 0',
    fontSize: '14px',
    color: '#128C7E'
  },
  studentUsername: {
    margin: 0,
    fontSize: '13px',
    color: '#666'
  },
  performanceBadge: {
    padding: '8px 16px',
    borderRadius: '20px',
    fontSize: '14px',
    fontWeight: '600',
    color: 'white'
  },
  attentionBox: {
    padding: '15px',
    backgroundColor: '#FFF3CD',
    border: '2px solid #FFC107',
    borderRadius: '10px',
    marginBottom: '20px'
  },
  attentionTitle: {
    margin: '0 0 10px 0',
    fontSize: '16px',
    fontWeight: '600',
    color: '#856404'
  },
  attentionList: {
    margin: 0,
    paddingLeft: '20px'
  },
  attentionItem: {
    fontSize: '14px',
    color: '#856404',
    marginBottom: '5px'
  },
  statsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  section: {
    padding: '20px',
    backgroundColor: '#f8f9fa',
    borderRadius: '10px',
    border: '1px solid #e0e0e0'
  },
  sectionTitle: {
    margin: '0 0 15px 0',
    fontSize: '18px',
    fontWeight: '600',
    color: '#075E54'
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '15px'
  },
  statBox: {
    padding: '15px',
    backgroundColor: 'white',
    borderRadius: '8px',
    textAlign: 'center',
    border: '1px solid #e0e0e0'
  },
  statValue: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#075E54',
    marginBottom: '5px'
  },
  statLabel: {
    fontSize: '12px',
    color: '#666'
  },
  badges: {
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: '30px',
    marginTop: '20px'
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    backgroundColor: 'white',
    borderRadius: '10px',
    border: '2px solid #e0e0e0'
  },
  badgeIcon: {
    fontSize: '32px'
  },
  badgeCount: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#075E54'
  },
  quizzesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  quizCard: {
    padding: '15px',
    backgroundColor: 'white',
    borderRadius: '8px',
    border: '1px solid #e0e0e0'
  },
  quizHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px'
  },
  quizTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#333'
  },
  quizScore: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#25D366'
  },
  quizStats: {
    display: 'flex',
    gap: '15px',
    marginBottom: '8px'
  },
  quizStat: {
    fontSize: '13px',
    color: '#666'
  },
  quizBadge: {
    fontSize: '20px'
  },
  quizDate: {
    fontSize: '12px',
    color: '#999'
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    fontSize: '18px',
    color: 'white'
  },
  error: {
    textAlign: 'center',
    padding: '40px',
    fontSize: '18px',
    color: '#DC3545'
  }
};

export default StudentProfile;