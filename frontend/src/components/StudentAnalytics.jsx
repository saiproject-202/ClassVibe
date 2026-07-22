// frontend/src/components/StudentAnalytics.jsx
// Teacher dashboard for student analytics

import React, { useState, useEffect, useCallback } from 'react';
import StudentProfile from './StudentProfile';

const StudentAnalytics = ({ groupId, onClose }) => {
  const [summary, setSummary] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('participation');

  // ✅ FIX: wrap in useCallback
  const fetchAnalytics = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');

      const summaryRes = await fetch(
        `${process.env.REACT_APP_API_URL || "https://classvibe-backend.onrender.com"}/api/analytics/group/${groupId}/summary`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const studentsRes = await fetch(
        `${process.env.REACT_APP_API_URL || "https://classvibe-backend.onrender.com"}/api/analytics/group/${groupId}/students`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (summaryRes.ok && studentsRes.ok) {
        const summaryData = await summaryRes.json();
        const studentsData = await studentsRes.json();

        setSummary(summaryData.summary);
        setStudents(studentsData.analytics);
      }
    } catch (error) {
      console.error('Fetch analytics error:', error);
    } finally {
      setLoading(false);
    }
  }, [groupId]); // ✅ dependency

  // ✅ FIX: dependency added
  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || "https://classvibe-backend.onrender.com"}/api/analytics/group/${groupId}/export?type=all`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-${Date.now()}.csv`;
        a.click();
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export data');
    }
  };

  const getFilteredStudents = () => {
    let filtered = [...students];

    // Apply filter
    if (filter === 'excellent') {
      filtered = filtered.filter(s => s.performanceLevel === 'Excellent');
    } else if (filter === 'needsAttention') {
      filtered = filtered.filter(s => s.needsAttention);
    }

    // Apply sort
    if (sortBy === 'participation') {
      filtered.sort((a, b) => b.engagement.participationRate - a.engagement.participationRate);
    } else if (sortBy === 'quizScore') {
      filtered.sort((a, b) => b.quizStats.averageScore - a.quizStats.averageScore);
    } else if (sortBy === 'messages') {
      filtered.sort((a, b) => b.messageStats.totalMessages - a.messageStats.totalMessages);
    }

    return filtered;
  };

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

  if (selectedStudent) {
    return (
      <StudentProfile
        studentId={selectedStudent.student._id}
        groupId={groupId}
        onClose={() => setSelectedStudent(null)}
        onBack={() => setSelectedStudent(null)}
      />
    );
  }

  const dk    = document.body.classList.contains('dark-mode');
  const aBg   = dk ? '#1e293b' : 'white';
  const aTxt2 = dk ? '#94a3b8' : '#666';

  if (loading) {
    return (
      <div style={styles.overlay}>
        <div style={{ ...styles.loading, backgroundColor: aBg, color: aTxt2 }}>Loading analytics...</div>
      </div>
    );
  }

  return (
    <div style={styles.overlay}>
      <div style={{ ...styles.container, backgroundColor: aBg }}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>📊 Student Analytics</h2>
          <div style={styles.headerActions}>
            <button onClick={handleExport} style={styles.exportBtn}>
              📥 Export CSV
            </button>
            <button onClick={onClose} style={styles.closeBtn} aria-label="Close">✕</button>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div style={{ ...styles.summaryCards, backgroundColor: aBg }}>
            <div style={styles.card}>
              <div style={styles.cardIcon}>👥</div>
              <div style={styles.cardContent}>
                <div style={styles.cardValue}>{summary.totalStudents}</div>
                <div style={styles.cardLabel}>Total Students</div>
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardIcon}>✅</div>
              <div style={styles.cardContent}>
                <div style={styles.cardValue}>{summary.activeStudents}</div>
                <div style={styles.cardLabel}>Active (7 days)</div>
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardIcon}>⚠️</div>
              <div style={styles.cardContent}>
                <div style={styles.cardValue}>{summary.needsAttention}</div>
                <div style={styles.cardLabel}>Needs Attention</div>
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardIcon}>📈</div>
              <div style={styles.cardContent}>
                <div style={styles.cardValue}>{Math.round(summary.averageParticipation)}%</div>
                <div style={styles.cardLabel}>Avg Participation</div>
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardIcon}>🎮</div>
              <div style={styles.cardContent}>
                <div style={styles.cardValue}>{Math.round(summary.averageQuizScore)}</div>
                <div style={styles.cardLabel}>Avg Quiz Score</div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={styles.controls}>
          <div style={styles.filters}>
            <button
              onClick={() => setFilter('all')}
              style={{
                ...styles.filterBtn,
                backgroundColor: filter === 'all' ? '#075E54' : '#f0f0f0',
                color: filter === 'all' ? 'white' : '#333'
              }}
            >
              All ({students.length})
            </button>
            <button
              onClick={() => setFilter('excellent')}
              style={{
                ...styles.filterBtn,
                backgroundColor: filter === 'excellent' ? '#25D366' : '#f0f0f0',
                color: filter === 'excellent' ? 'white' : '#333'
              }}
            >
              Excellent
            </button>
            <button
              onClick={() => setFilter('needsAttention')}
              style={{
                ...styles.filterBtn,
                backgroundColor: filter === 'needsAttention' ? '#DC3545' : '#f0f0f0',
                color: filter === 'needsAttention' ? 'white' : '#333'
              }}
            >
              Needs Attention
            </button>
          </div>

          <div style={styles.sortControls}>
            <label style={styles.sortLabel}>Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={styles.sortSelect}
            >
              <option value="participation">Participation</option>
              <option value="quizScore">Quiz Score</option>
              <option value="messages">Messages</option>
            </select>
          </div>
        </div>

        {/* Students List */}
        <div style={styles.studentsList}>
          {getFilteredStudents().map((student) => (
            <div
              key={student._id}
              onClick={() => setSelectedStudent(student)}
              style={styles.studentCard}
            >
              <div style={styles.studentHeader}>
                <div style={styles.studentInfo}>
                  <div style={styles.studentName}>{student.student.name}</div>
                  <div style={styles.studentEmail}>{student.student.email}</div>
                </div>
                <div
                  style={{
                    ...styles.performanceBadge,
                    backgroundColor: getPerformanceColor(student.performanceLevel)
                  }}
                >
                  {student.performanceLevel}
                </div>
              </div>

              <div style={styles.studentStats}>
                <div style={styles.stat}>
                  <span style={styles.statIcon}>📅</span>
                  <span style={styles.statValue}>{student.engagement.participationRate}%</span>
                  <span style={styles.statLabel}>Attendance</span>
                </div>

                <div style={styles.stat}>
                  <span style={styles.statIcon}>🎮</span>
                  <span style={styles.statValue}>{Math.round(student.quizStats.averageScore)}</span>
                  <span style={styles.statLabel}>Quiz Avg</span>
                </div>

                <div style={styles.stat}>
                  <span style={styles.statIcon}>💬</span>
                  <span style={styles.statValue}>{student.messageStats.totalMessages}</span>
                  <span style={styles.statLabel}>Messages</span>
                </div>

                <div style={styles.stat}>
                  <span style={styles.statIcon}>🏆</span>
                  <span style={styles.statValue}>
                    🥇{student.quizStats.badges.gold}
                    🥈{student.quizStats.badges.silver}
                    🥉{student.quizStats.badges.bronze}
                  </span>
                  <span style={styles.statLabel}>Badges</span>
                </div>
              </div>

              {student.needsAttention && (
                <div style={styles.attentionFlag}>
                  ⚠️ {student.attentionReasons.join(', ')}
                </div>
              )}
            </div>
          ))}

          {getFilteredStudents().length === 0 && (
            <div style={styles.empty}>
              <p>No students match this filter</p>
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
  container: {
    backgroundColor: 'white',
    borderRadius: '12px',
    width: '95%',
    maxWidth: '1200px',
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
  title: {
    margin: 0,
    fontSize: '22px',
    fontWeight: '700',
    color: 'white'
  },
  headerActions: {
    display: 'flex',
    gap: '10px'
  },
  exportBtn: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '600',
    backgroundColor: '#25D366',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: 'white'
  },
  summaryCards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '15px',
    padding: '20px'
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '10px',
    border: '1px solid #e0e0e0'
  },
  cardIcon: {
    fontSize: '32px'
  },
  cardContent: {
    flex: 1
  },
  cardValue: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#075E54'
  },
  cardLabel: {
    fontSize: '12px',
    color: '#666',
    marginTop: '2px'
  },
  controls: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 20px 15px 20px',
    flexWrap: 'wrap',
    gap: '10px'
  },
  filters: {
    display: 'flex',
    gap: '8px'
  },
  filterBtn: {
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  sortControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  sortLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#666'
  },
  sortSelect: {
    padding: '6px 12px',
    fontSize: '13px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  studentsList: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 20px 20px 20px'
  },
  studentCard: {
    padding: '15px',
    marginBottom: '12px',
    backgroundColor: 'white',
    border: '1px solid #e0e0e0',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    ':hover': {
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      transform: 'translateY(-2px)'
    }
  },
  studentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px'
  },
  studentInfo: {},
  studentName: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '4px'
  },
  studentEmail: {
    fontSize: '13px',
    color: '#666'
  },
  performanceBadge: {
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '600',
    color: 'white'
  },
  studentStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '12px'
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '10px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px'
  },
  statIcon: {
    fontSize: '20px',
    marginBottom: '4px'
  },
  statValue: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#075E54',
    marginBottom: '2px'
  },
  statLabel: {
    fontSize: '11px',
    color: '#666'
  },
  attentionFlag: {
    marginTop: '12px',
    padding: '8px 12px',
    backgroundColor: '#FFF3CD',
    color: '#856404',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500'
  },
  empty: {
    textAlign: 'center',
    padding: '40px',
    color: '#999'
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    fontSize: '18px',
    color: 'white'
  }
};

export default StudentAnalytics;