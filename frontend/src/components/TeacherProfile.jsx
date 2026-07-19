// frontend/src/components/TeacherProfile.jsx
//
// Milestone 5: Teacher Profile screen. Deliberately restrained per the design
// brief — dark header, credential card, class roster with real averages.
// No avatar cartoon, no badges, no emotes. All numbers are computed live from
// real Group/Quiz/QuizResult data — nothing here is sample/placeholder content.

import React, { useState, useEffect, useCallback } from 'react';
import { getTeacherProfile, updateTeacherProfile } from '../api';

const getInitials = (name) => (name || '??').trim().substring(0, 2).toUpperCase();

const avgColor = (avg) => {
  if (avg === null || avg === undefined) return '#9CA3AF';
  if (avg >= 80) return '#0F9D6E';
  if (avg >= 60) return '#B45309';
  return '#DC2626';
};

const TeacherProfile = ({ onClose, onOpenAnalytics, onOpenSettings }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getTeacherProfile();
      setProfile(data);
      setForm(data.teacherProfile);
    } catch (err) {
      setError('Could not load your profile. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaveCredentials = async () => {
    setSaving(true);
    try {
      const data = await updateTeacherProfile(form);
      setProfile((p) => ({ ...p, teacherProfile: data.teacherProfile }));
      setForm(data.teacherProfile);
      setEditing(false);
    } catch (err) {
      setError('Could not save your credentials. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.overlay}>
        <div style={styles.loadingBox}>Loading profile…</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={styles.overlay}>
        <div style={styles.loadingBox}>
          <p>{error || 'Failed to load profile.'}</p>
          <button onClick={onClose} style={styles.secondaryBtn}>Close</button>
        </div>
      </div>
    );
  }

  const tp = profile.teacherProfile || {};
  const subjectLine = [tp.subject, tp.gradeRange].filter(Boolean).join(' · ');

  return (
    <div style={styles.overlay}>
      <div style={styles.phone}>
        <div style={styles.header}>
          <span style={styles.headerTitle}>TEACHER PROFILE</span>
          <div style={styles.headerActions}>
            <button onClick={onOpenSettings} style={styles.headerLink}>⚙ Settings</button>
            <button onClick={onClose} style={styles.closeBtn} aria-label="Close">✕</button>
          </div>
        </div>

        <div style={styles.body}>
          {error && <div style={styles.errorBanner}>{error}</div>}

          {/* Identity card */}
          <div style={styles.card}>
            <div style={styles.identityRow}>
              <div style={styles.avatarCircle}>{getInitials(profile.name)}</div>
              <div>
                <p style={styles.name}>{profile.name}</p>
                <p style={styles.subjectLine}>{subjectLine || 'Add your subject & grade'}</p>
                <p style={styles.schoolLine}>{tp.school || 'Add your school'}</p>
              </div>
            </div>
          </div>

          {/* Stat row */}
          <div style={styles.statRow}>
            <div style={styles.statCard}>
              <p style={styles.statValue}>{profile.classesCount}</p>
              <p style={styles.statLabel}>Classes</p>
            </div>
            <div style={styles.statCard}>
              <p style={styles.statValue}>{profile.studentsCount}</p>
              <p style={styles.statLabel}>Students</p>
            </div>
            <div style={styles.statCard}>
              <p style={styles.statValue}>{profile.quizzesRunCount}</p>
              <p style={styles.statLabel}>Quizzes Run</p>
            </div>
          </div>

          {/* Classes */}
          <p style={styles.sectionLabel}>Classes</p>
          {profile.classes.length === 0 ? (
            <p style={styles.emptyHint}>No classes yet — create one from your dashboard.</p>
          ) : (
            <div style={styles.card}>
              {profile.classes.map((c, i) => (
                <div
                  key={c.groupId}
                  style={{ ...styles.classRow, borderTop: i === 0 ? 'none' : '1px solid #F1F2F8' }}
                >
                  <div>
                    <p style={styles.className}>{c.groupName}</p>
                    <p style={styles.classMeta}>{c.studentCount} student{c.studentCount === 1 ? '' : 's'}</p>
                  </div>
                  <span style={{ ...styles.avgBadge, color: avgColor(c.avgPercentage) }}>
                    {c.avgPercentage === null ? 'No data yet' : `${c.avgPercentage}% avg`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Credentials */}
          <div style={styles.sectionHeaderRow}>
            <p style={styles.sectionLabel}>Credentials</p>
            {!editing && (
              <button onClick={() => setEditing(true)} style={styles.editLink}>Edit</button>
            )}
          </div>

          {editing ? (
            <div style={styles.card}>
              <label style={styles.formLabel}>Degree / field</label>
              <input
                style={styles.formInput}
                value={form.degree || ''}
                onChange={(e) => setForm((f) => ({ ...f, degree: e.target.value }))}
                placeholder="e.g. M.Ed, Mathematics Education"
              />
              <label style={styles.formLabel}>Years teaching experience</label>
              <input
                type="number"
                style={styles.formInput}
                value={form.yearsExperience ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, yearsExperience: e.target.value === '' ? null : Number(e.target.value) }))}
                placeholder="e.g. 9"
              />
              <label style={styles.formLabel}>Certifications (one per line)</label>
              <textarea
                style={{ ...styles.formInput, minHeight: 60 }}
                value={(form.certifications || []).join('\n')}
                onChange={(e) => setForm((f) => ({ ...f, certifications: e.target.value.split('\n').filter(Boolean) }))}
                placeholder="e.g. ClassVibe Certified Educator"
              />
              <div style={styles.formActions}>
                <button onClick={handleSaveCredentials} disabled={saving} style={styles.primaryBtn}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => { setForm(tp); setEditing(false); }} style={styles.secondaryBtn}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={styles.card}>
              {tp.degree ? <p style={styles.credLine}>{tp.degree}</p> : null}
              {tp.yearsExperience ? (
                <p style={styles.credLine}>{tp.yearsExperience} years teaching experience</p>
              ) : null}
              {(tp.certifications || []).map((cert) => (
                <p key={cert} style={styles.credBadge}>{cert}</p>
              ))}
              {!tp.degree && !tp.yearsExperience && (tp.certifications || []).length === 0 && (
                <p style={styles.emptyHint}>No credentials added yet.</p>
              )}
            </div>
          )}

          <button onClick={onOpenAnalytics} style={styles.analyticsBtn}>View Full Analytics</button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(15, 17, 30, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 16
  },
  phone: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90vh',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(15, 17, 30, 0.25)'
  },
  loadingBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    textAlign: 'center',
    color: '#4B5168'
  },
  header: {
    backgroundColor: '#1E1B3A',
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1,
    color: '#FFFFFF'
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 12
  },
  headerLink: {
    background: 'transparent',
    border: 'none',
    color: '#C7C9E8',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer'
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#C7C9E8',
    fontSize: 16,
    cursor: 'pointer',
    padding: 2
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: 20,
    backgroundColor: '#F7F7FB'
  },
  errorBanner: {
    marginBottom: 12,
    padding: '10px 14px',
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    color: '#B91C1C',
    fontSize: 13
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    boxShadow: '0 1px 3px rgba(15,17,30,0.06)'
  },
  identityRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#1E1B3A',
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    fontWeight: 700,
    flexShrink: 0
  },
  name: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: '#1F2333'
  },
  subjectLine: {
    margin: '4px 0 0',
    fontSize: 13,
    color: '#6B7080'
  },
  schoolLine: {
    margin: '2px 0 0',
    fontSize: 13,
    color: 'var(--cv-accent)',
    fontWeight: 600
  },
  statRow: {
    display: 'flex',
    gap: 10,
    marginBottom: 16
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: '14px 8px',
    textAlign: 'center',
    boxShadow: '0 1px 3px rgba(15,17,30,0.06)'
  },
  statValue: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: '#1F2333'
  },
  statLabel: {
    margin: '4px 0 0',
    fontSize: 11,
    color: '#8B90A6'
  },
  sectionLabel: {
    margin: '0 0 8px',
    fontSize: 11,
    fontWeight: 700,
    color: '#8B90A6',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  sectionHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  editLink: {
    background: 'transparent',
    border: 'none',
    color: 'var(--cv-accent)',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    marginBottom: 8
  },
  emptyHint: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 16
  },
  classRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 0'
  },
  className: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: '#1F2333'
  },
  classMeta: {
    margin: '2px 0 0',
    fontSize: 12,
    color: '#8B90A6'
  },
  avgBadge: {
    fontSize: 13,
    fontWeight: 700,
    whiteSpace: 'nowrap'
  },
  credLine: {
    margin: '0 0 6px',
    fontSize: 13,
    color: '#4B5168'
  },
  credBadge: {
    margin: '0 0 6px',
    fontSize: 13,
    color: 'var(--cv-accent)',
    fontWeight: 600
  },
  formLabel: {
    display: 'block',
    fontSize: 11,
    fontWeight: 700,
    color: '#8B90A6',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    margin: '10px 0 4px'
  },
  formInput: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#E1E3EE',
    fontSize: 13,
    fontFamily: 'inherit'
  },
  formActions: {
    display: 'flex',
    gap: 8,
    marginTop: 14
  },
  primaryBtn: {
    padding: '8px 14px',
    borderRadius: 8,
    border: 'none',
    backgroundColor: 'var(--cv-accent)',
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer'
  },
  secondaryBtn: {
    padding: '8px 14px',
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#E1E3EE',
    backgroundColor: '#FFFFFF',
    color: '#4B5168',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer'
  },
  analyticsBtn: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    border: 'none',
    backgroundColor: '#1E1B3A',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer'
  }
};

export default TeacherProfile;
