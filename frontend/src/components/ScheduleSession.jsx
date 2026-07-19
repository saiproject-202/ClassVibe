// frontend/src/components/ScheduleSession.jsx
// Private sessions are pure email-invite — no per-student password. Invited
// students are notified on creation and blocked/routed to teacher approval if
// someone else tries to join (see Private Session system, server.js).

import React, { useState, useEffect } from 'react';

const API = process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com';

const ScheduleSession = ({ onClose, onSuccess }) => {

  // ── FORM STATE ──
  const [sessionTitle, setSessionTitle]   = useState('');
  const [description, setDescription]     = useState('');
  const [scheduledDate, setScheduledDate] = useState(''); // ✅ no default — stays empty
  const [startTime, setStartTime]         = useState('');
  const [endTime, setEndTime]             = useState('');
  const [duration, setDuration]           = useState('1 Hour');
  const [accessType, setAccessType]       = useState('private');
  const [customPin, setCustomPin]         = useState('');
  const [enableReminders, setEnableReminders] = useState(true);

  const [allowedStudents, setAllowedStudents] = useState([{ email: '' }]);

  // ── UI STATE ──
  const [loading, setLoading]         = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError]             = useState('');
  const [drafts, setDrafts]           = useState([]);
  const [activeTab, setActiveTab]     = useState('details');

  // 6-digit preview PIN (100000–999999) — matches backend generatePIN()
  const [previewPin] = useState(() => Math.floor(100000 + Math.random() * 900000).toString());

  useEffect(() => { fetchDrafts(); }, []);

  const fetchDrafts = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/schedule/drafts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDrafts(data.drafts || []);
      }
    } catch (e) { console.error('Failed to load drafts', e); }
  };

  // Auto-calculate duration from start/end time — UNCHANGED
  useEffect(() => {
    if (startTime && endTime) {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      const diffMin = (eh * 60 + em) - (sh * 60 + sm);
      if (diffMin > 0) {
        if (diffMin < 60)        setDuration(`${diffMin} Min`);
        else if (diffMin === 60) setDuration('1 Hour');
        else if (diffMin % 60 === 0) setDuration(`${diffMin / 60} Hours`);
        else setDuration(`${Math.floor(diffMin / 60)}h ${diffMin % 60}m`);
      }
    }
  }, [startTime, endTime]);

  // ── STUDENT ROW HELPERS ── UNCHANGED
  const addStudentRow    = () => setAllowedStudents(prev => [...prev, { email: '' }]);
  const removeStudentRow = (i) => setAllowedStudents(prev => prev.filter((_, idx) => idx !== i));
  const updateStudent    = (i, field, val) =>
    setAllowedStudents(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));

  const formatDisplayTime = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'pm' : 'am';
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  // buildPayload: uses 6-digit PIN (custom or auto-generated preview) — private
  // sessions are pure email-invite, no per-student password
  const buildPayload = (status = 'scheduled') => {
    const validStudents = allowedStudents.filter(s => s.email.trim());

    const effectivePin = (customPin.length === 6 ? customPin : null) || previewPin; // 6-digit PIN

    return {
      sessionName:     sessionTitle,
      subject:         sessionTitle,
      description,
      scheduledDate,
      scheduledTime:   startTime,
      endTime,
      duration,
      accessType,
      customPin:       effectivePin,
      enableReminders,
      allowedStudents: accessType === 'private' ? validStudents : [],
      allowedEmails:   accessType === 'private' ? validStudents.map(s => s.email.trim()) : [],
      status
    };
  };

  // Private sessions require at least one invited email — no password needed
  const validate = () => {
    if (!sessionTitle.trim()) { setError('Session title is required'); return false; }
    if (!scheduledDate)       { setError('Please select a date');      return false; }
    if (!startTime)           { setError('Please select a start time'); return false; }

    if (accessType === 'private') {
      const valid = allowedStudents.filter(s => s.email.trim());
      if (valid.length === 0) {
        setError('Private session: add at least one invited student email');
        return false;
      }
    }

    const dt = new Date(`${scheduledDate}T${startTime}`);
    if (isNaN(dt.getTime())) { setError('Invalid date or time format'); return false; }
    if (dt <= new Date()) { setError('Scheduled time must be in the future'); return false; }
    return true;
  };

  // Save Draft: only requires a title (no date/time needed for drafts)
  const handleSaveDraft = async () => {
    if (!sessionTitle.trim()) { setError('Add a session title before saving draft'); return; }
    setSavingDraft(true); setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/schedule/draft`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify(buildPayload('draft'))
      });
      const data = await res.json();
      if (res.ok) {
        await fetchDrafts();
        setActiveTab('drafts');
      } else {
        setError(data.error || 'Failed to save draft');
      }
    } catch (e) { setError('Network error — failed to save draft'); }
    finally { setSavingDraft(false); }
  };

  // ── CONFIRM & SCHEDULE — UNCHANGED ──
  const handleConfirm = async () => {
    if (!validate()) return;
    setLoading(true); setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/schedule/create`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body:    JSON.stringify(buildPayload('scheduled'))
      });
      const data = await res.json();
      if (res.ok) {
        if (onSuccess) onSuccess(data.session);
        onClose();
      } else {
        setError(data.error || 'Failed to schedule session');
      }
    } catch (e) { setError('Network error — failed to schedule session'); }
    finally { setLoading(false); }
  };

  // ── LOAD DRAFT — UNCHANGED ──
  const loadDraft = (draft) => {
    setSessionTitle(draft.sessionName || '');
    setDescription(draft.description || '');
    setScheduledDate(draft.scheduledDate ? draft.scheduledDate.split('T')[0] : '');
    setStartTime(draft.scheduledTime || '');
    setEndTime(draft.endTime || '');
    setDuration(draft.duration || '1 Hour');
    setAccessType(draft.accessType || 'private');
    setCustomPin(draft.customPin || '');
    setEnableReminders(draft.enableReminders !== false);
    // Restore invited student emails from draft
    if (draft.allowedStudents?.length) {
      setAllowedStudents(draft.allowedStudents.map(s => ({
        email: s.email || ''
      })));
    } else {
      setAllowedStudents([{ email: '' }]);
    }
    setActiveTab('details');
    setError('');
  };

  // ─────────────────────────────────────────
  // RENDER — layout identical to previous version
  // ─────────────────────────────────────────
  const dk = document.body.classList.contains('dark-mode');
  const sBg   = dk ? '#1e293b' : '#fff';
  const sBdr  = dk ? '#334155' : '#e5e7eb';
  const sTxt  = dk ? '#f1f5f9' : '#111827';
  const sTxt2 = dk ? '#94a3b8' : '#6b7280';
  const sCard  = dk ? '#0f172a' : '#fafafa';
  // Pre-computed dark overrides to apply inline throughout JSX
  const oST   = { color: sTxt };                               // sectionTitle
  const oSub  = { color: sTxt2 };                              // sectionSub
  const oLbl  = { color: dk?'#e2e8f0':'#374151' };            // label
  const oDvd  = { borderTop: `1px solid ${sBdr}` };           // divider
  const oAccB = { background: dk?'#1e293b':'white', border: `2px solid ${sBdr}`, color: sTxt };  // accessBtn
  const oAccA = { background: dk?'#1e3a5f':'var(--cv-accent-light)', border: `2px solid var(--cv-accent-mid)` };            // accessBtnActive
  const oPriv = { backgroundColor: dk?'#0a111f':'#f8fafc', border: `1px solid ${sBdr}` };      // privateSection
  const oPST  = { color: dk?'#e2e8f0':'#374151' };            // privateSectionTitle

  return (
    <div style={S.overlay}>
      <div style={{ ...S.modal, backgroundColor: sBg }}>

        {/* HEADER — dark-mode aware */}
        <div style={{ ...S.header, backgroundColor: sBg, borderBottom: `1px solid ${sBdr}` }}>
          <button onClick={onClose} style={{ ...S.backBtn, color: sTxt2 }}>← Back</button>
          <h2 style={{ ...S.headerTitle, color: sTxt }}>Schedule New Session</h2>
          <div style={S.avatar}>👨‍🏫</div>
        </div>

        {/* TABS */}
        <div style={{ ...S.tabRow, backgroundColor: sCard, borderBottom: `1px solid ${sBdr}` }}>
          <button
            style={{ ...S.tabBtn, ...(activeTab === 'details' ? S.tabBtnActive : {}) }}
            onClick={() => setActiveTab('details')}
          >
            Session Details
          </button>
          <button
            style={{ ...S.tabBtn, ...(activeTab === 'drafts' ? S.tabBtnActive : {}) }}
            onClick={() => { setActiveTab('drafts'); fetchDrafts(); }}
          >
            Drafts {drafts.length > 0 && <span style={S.draftBadge}>{drafts.length}</span>}
          </button>
        </div>

        {/* ── DRAFTS TAB ── */}
        {activeTab === 'drafts' && (
          <div style={{ ...S.bodyOnly, backgroundColor: sBg, color: sTxt }}>
            <h3 style={S.sectionHead}>📋 Saved Drafts</h3>
            {drafts.length === 0 ? (
              <div style={S.emptyDrafts}>No drafts saved yet. Fill in session details and click "Save Draft".</div>
            ) : (
              drafts.map((d, i) => (
                <div key={i} style={S.draftCard}>
                  <div>
                    <div style={S.draftTitle}>{d.sessionName}</div>
                    <div style={S.draftMeta}>
                      {d.scheduledDate
                        ? new Date(d.scheduledDate).toLocaleDateString()
                        : 'No date set'}&nbsp;·&nbsp;
                      {d.accessType === 'private' ? '🔒 Private' : '🌐 Public'}&nbsp;·&nbsp;
                      {d.allowedStudents?.length || 0} students
                    </div>
                  </div>
                  <button style={S.loadDraftBtn} onClick={() => loadDraft(d)}>Load</button>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── DETAILS TAB ── */}
        {activeTab === 'details' && (
          <div style={S.twoCol}>

            {/* ═══ LEFT FORM ═══ */}
            {/* eslint-disable-next-line no-undef */}
            <div style={{ ...S.formCol, ...(document.body.classList.contains('dark-mode') ? { backgroundColor:'#1e293b', borderColor:'#334155' } : {}) }}>
              {error && <div style={S.errorBox}>{error}</div>}

              {/* General Information */}
              <div style={S.section}>
                <div style={S.sectionHeader}>
                  <span style={S.sectionIcon}>📋</span>
                  <div>
                    <div style={{ ...S.sectionTitle, ...oST }}>General Information</div>
                    <div style={{ ...S.sectionSub, ...oSub }}>The public identity of your session.</div>
                  </div>
                </div>

                <div style={S.field}>
                  <label style={{ ...S.label, ...oLbl }}>Session Title</label>
                  <input
                    style={S.input}
                    placeholder="e.g., Advanced Calculus - Week 4"
                    value={sessionTitle}
                    onChange={e => setSessionTitle(e.target.value)}
                    autoComplete="off"
                  />
                </div>

                <div style={S.field}>
                  <label style={{ ...S.label, ...oLbl }}>Description <span style={S.optional}>(Optional)</span></label>
                  <textarea
                    style={{ ...S.input, minHeight: 80, resize: 'vertical' }}
                    placeholder="Briefly describe the lesson goals..."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ ...S.divider, ...oDvd }} />

              {/* Date & Time */}
              <div style={S.section}>
                <div style={S.sectionHeader}>
                  <span style={S.sectionIcon}>🕐</span>
                  <div>
                    <div style={{ ...S.sectionTitle, ...oST }}>Date & Time</div>
                    <div style={{ ...S.sectionSub, ...oSub }}>When will the learning begin?</div>
                  </div>
                </div>

                <div style={S.twoField}>
                  <div style={{ ...S.field, flex: 1 }}>
                    <label style={{ ...S.label, ...oLbl }}>Scheduled Date</label>
                    <input
                      style={S.input}
                      type="date"
                      // ✅ FIX: min prevents past dates, but NO default value set
                      // autoComplete="off" stops browser from autofilling today's date
                      min={new Date().toISOString().split('T')[0]}
                      value={scheduledDate}
                      onChange={e => setScheduledDate(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div style={{ ...S.field, flex: 1 }}>
                    <label style={{ ...S.label, ...oLbl }}>Start Time</label>
                    <input
                      style={S.input}
                      type="time"
                      value={startTime}
                      onChange={e => setStartTime(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div style={S.twoField}>
                  <div style={{ ...S.field, flex: 1 }}>
                    <label style={{ ...S.label, ...oLbl }}>Duration <span style={S.optional}>(Auto)</span></label>
                    <select style={S.input} value={duration} onChange={e => setDuration(e.target.value)}>
                      {['30 Min','45 Min','1 Hour','1.5 Hours','2 Hours','3 Hours'].map(d => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ ...S.field, flex: 1 }}>
                    <label style={{ ...S.label, ...oLbl }}>End Time</label>
                    <input
                      style={S.input}
                      type="time"
                      value={endTime}
                      onChange={e => setEndTime(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </div>
              </div>

              <div style={{ ...S.divider, ...oDvd }} />

              {/* Access Control */}
              <div style={S.section}>
                <div style={S.sectionHeader}>
                  <span style={S.sectionIcon}>🔒</span>
                  <div>
                    <div style={{ ...S.sectionTitle, ...oST }}>Access Control</div>
                    <div style={{ ...S.sectionSub, ...oSub }}>Control who can join your live classroom.</div>
                  </div>
                </div>

                <div style={S.accessRow}>
                  <button
                    style={{ ...S.accessBtn, ...oAccB, ...(accessType === 'public' ? { ...S.accessBtnActive, ...oAccA } : {}) }}
                    onClick={() => setAccessType('public')}
                  >
                    <div style={S.accessIcon}>🌐</div>
                    <div style={{ ...S.accessLabel, color: dk?'#f1f5f9':'#111827' }}>Public</div>
                    <div style={{ ...S.accessDesc, color: dk?'#94a3b8':'#6b7280' }}>Anyone with link</div>
                  </button>
                  <button
                    style={{ ...S.accessBtn, ...oAccB, ...(accessType === 'private' ? { ...S.accessBtnActive, ...oAccA } : {}) }}
                    onClick={() => setAccessType('private')}
                  >
                    <div style={S.accessIcon}>🔒</div>
                    <div style={{ ...S.accessLabel, color: dk?'#f1f5f9':'#111827' }}>Private</div>
                    <div style={{ ...S.accessDesc, color: dk?'#94a3b8':'#6b7280' }}>Registered emails only</div>
                  </button>
                </div>

                {/* Private: invite students by email */}
                {accessType === 'private' && (
                  <div style={{ ...S.privateSection, ...oPriv }}>
                    <div style={{ ...S.privateSectionTitle, ...oPST }}>👥 Invited Students</div>
                    <div style={S.privateNote}>
                      💡 Enter each student's email. Only invited students can join — anyone else who
                      tries will be blocked and you'll get a real-time request to approve or reject them.
                    </div>

                    {/* Column header */}
                    <div style={{ display:'flex', gap:'8px', marginBottom:'6px' }}>
                      <div style={{ flex:1, fontSize:'12px', fontWeight:'600', color:'#6b7280', paddingLeft:'4px' }}>Email</div>
                      <div style={{ width:'28px' }} />
                    </div>

                    {allowedStudents.map((s, i) => (
                      <div key={i} style={S.studentRow}>
                        <input
                          style={{ ...S.input, flex: 1 }}
                          placeholder="student@email.com"
                          type="email"
                          value={s.email}
                          onChange={e => updateStudent(i, 'email', e.target.value)}
                          autoComplete="off"
                        />
                        {allowedStudents.length > 1 && (
                          <button style={S.removeBtn} onClick={() => removeStudentRow(i)} title="Remove student">✕</button>
                        )}
                      </div>
                    ))}

                    <button style={S.addStudentBtn} onClick={addStudentRow}>
                      + Add Another Student
                    </button>
                  </div>
                )}

                {/* ✅ Custom PIN — 4 digits max */}
                <div style={S.field}>
                  <label style={{ ...S.label, ...oLbl }}>
                    Custom PIN Override
                    <span style={S.optional}> (6 digits, optional)</span>
                  </label>
                  <input
                    style={S.input}
                    placeholder={`Default: ${previewPin}`}
                    value={customPin}
                    onChange={e => setCustomPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="off"
                  />
                  {customPin && customPin.length < 6 && (
                    <div style={{ fontSize:'12px', color:'#ef4444', marginTop:'4px' }}>
                      PIN must be exactly 6 digits
                    </div>
                  )}
                </div>
              </div>

              <div style={{ ...S.divider, ...oDvd }} />

              {/* Reminders */}
              <div style={S.section}>
                <div style={S.sectionHeader}>
                  <span style={S.sectionIcon}>🔔</span>
                  <div>
                    <div style={{ ...S.sectionTitle, ...oST }}>Reminders & Notifications</div>
                    <div style={{ ...S.sectionSub, ...oSub }}>Automate attendance boosters.</div>
                  </div>
                </div>

                <div style={{ ...S.toggleRow, backgroundColor: dk?'#0f172a':'white', borderColor: dk?'#334155':'#e5e7eb' }}>
                  <div>
                    <div style={{ ...S.toggleLabel, color: dk?'#f1f5f9':'#374151' }}>Enable Student Reminders</div>
                    <div style={S.toggleSub}>Send notifications 15 min before start</div>
                  </div>
                  <button
                    style={{ ...S.toggle, ...(enableReminders ? S.toggleOn : S.toggleOff) }}
                    onClick={() => setEnableReminders(v => !v)}
                  >
                    <div style={{ ...S.toggleThumb, ...(enableReminders ? S.thumbOn : S.thumbOff) }} />
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div style={{ ...S.formFooter, borderTop: `1px solid ${sBdr}` }}>
                <div style={S.footerLeft}>
                  <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
                  <button style={S.draftBtn} onClick={handleSaveDraft} disabled={savingDraft}>
                    {savingDraft ? 'Saving...' : '💾 Save Draft'}
                  </button>
                </div>
                <button style={S.confirmBtn} onClick={handleConfirm} disabled={loading}>
                  {loading ? 'Scheduling...' : 'Confirm & Schedule Session →'}
                </button>
              </div>
              <p style={S.termsText}>By scheduling, you agree to the ClassVibe Educator Terms of Service.</p>
            </div>

            {/* ═══ RIGHT: INVITATION PREVIEW ═══ */}
            {/* eslint-disable-next-line no-undef */}
            <div style={{ ...S.previewCol, ...(document.body.classList.contains('dark-mode') ? { backgroundColor:'#0f172a', color:'#f1f5f9' } : {}) }}>
              <div style={S.previewLabel}>INVITATION PREVIEW</div>

              {/* eslint-disable-next-line no-undef */}
              <div style={{ ...S.previewCard, ...(document.body.classList.contains('dark-mode') ? { backgroundColor:'#1e293b', boxShadow:'0 4px 20px rgba(0,0,0,0.4)' } : {}) }}>
                <div style={S.previewTopBar} />

                <div style={S.previewBadge}>
                  {accessType === 'private' ? '🔒 private' : '🌐 public'}
                </div>

                <div style={{ ...S.previewTitle, color: dk?'#f1f5f9':'#111827' }}>
                  {sessionTitle || <span style={{ color:'#9ca3af' }}>Your Session Title</span>}
                </div>
                <div style={{ ...S.previewDate, color: dk?'#94a3b8':'#6b7280', borderBottom: dk?'1px solid #334155':'1px solid #f3f4f6' }}>
                  {scheduledDate
                    ? `Scheduled for ${new Date(scheduledDate + 'T00:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })}`
                    : <span style={{ color:'#9ca3af' }}>Date not set</span>}
                </div>

                <div style={{ ...S.previewPinBox, backgroundColor: dk?'#0a111f':'transparent' }}>
                  <div style={{ ...S.previewPinLabel, color: dk?'#64748b':'#9ca3af' }}>SESSION PIN</div>
                  {/* ✅ Shows 6-digit PIN */}
                  <div style={{ ...S.previewPinValue, color: dk?'#818cf8':'#111827' }}>
                    {customPin.length === 6 ? customPin : previewPin}
                  </div>
                </div>

                {startTime && (
                  <div style={{ ...S.previewMeta, color: dk?'#94a3b8':'#6b7280' }}>🕐 Starts at {formatDisplayTime(startTime)}</div>
                )}
                <div style={{ ...S.previewMeta, color: dk?'#94a3b8':'#6b7280' }}>
                  {accessType === 'private'
                    ? `👥 Limited to ${allowedStudents.filter(s => s.email).length} registered student(s)`
                    : '👥 Open to anyone with the PIN'}
                </div>

                <div style={{ ...S.previewNote, color: dk?'#94a3b8':'#9ca3af', borderTop: dk?'1px solid #334155':'1px solid #f3f4f6' }}>
                  Students can join by entering the PIN at classvibe.app/join
                </div>

                <button style={S.copyLinkBtn}>🔗 Copy Invitation Link</button>
              </div>

              <div style={S.proTip}>
                <div style={S.proTipTitle}>💡 Pro Tip for Educators</div>
                <div style={S.proTipText}>
                  {accessType === 'private'
                    ? "Private sessions only let invited emails in — great for graded quizzes. Anyone else who tries sends you a real-time approve/reject request."
                    : 'Public sessions are great for open webinars or office hours where anyone can join with just the PIN.'}
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────
// STYLES — all identical to previous, no removals
// ─────────────────────────────────────────
const S = {
  overlay:{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, padding:'16px' },
  modal:{ backgroundColor:'#fff', borderRadius:'16px', width:'100%', maxWidth:'1100px', maxHeight:'95vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 80px rgba(0,0,0,0.25)' },
  header:{ display:'flex', alignItems:'center', gap:'12px', padding:'18px 28px', borderBottom:'1px solid #e5e7eb', flexShrink:0 },
  backBtn:{ background:'none', border:'none', fontSize:'15px', fontWeight:'600', color:'#6b7280', cursor:'pointer', padding:'6px 12px', borderRadius:'8px' },
  headerTitle:{ flex:1, fontSize:'20px', fontWeight:'700', color:'#111827', margin:0 },
  avatar:{ width:36, height:36, borderRadius:'50%', backgroundColor:'#e5e7eb', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px' },
  tabRow:{ display:'flex', borderBottom:'1px solid #e5e7eb', padding:'0 28px', backgroundColor:'#fafafa', flexShrink:0 },
  tabBtn:{ padding:'12px 20px', border:'none', background:'none', fontSize:'14px', fontWeight:'600', color:'#6b7280', cursor:'pointer', borderBottom:'3px solid transparent', display:'flex', alignItems:'center', gap:'6px' },
  tabBtnActive:{ color:'var(--cv-accent)', borderBottomColor:'var(--cv-accent)' },
  draftBadge:{ backgroundColor:'var(--cv-accent)', color:'white', borderRadius:'10px', padding:'2px 7px', fontSize:'11px' },
  bodyOnly:{ padding:'28px', overflowY:'auto', flex:1 },
  sectionHead:{ fontSize:'18px', fontWeight:'700', color:'#111827', marginBottom:'16px' },
  emptyDrafts:{ textAlign:'center', padding:'40px', color:'#9ca3af', fontSize:'15px' },
  draftCard:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px', border:'1px solid #e5e7eb', borderRadius:'10px', marginBottom:'10px' },
  draftTitle:{ fontWeight:'600', color:'#111827', fontSize:'15px' },
  draftMeta:{ fontSize:'13px', color:'#6b7280', marginTop:'4px' },
  loadDraftBtn:{ padding:'8px 16px', backgroundColor:'var(--cv-accent)', color:'white', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'600', cursor:'pointer' },
  twoCol:{ display:'flex', flex:1, overflow:'hidden' },
  formCol:{ flex:'0 0 58%', overflowY:'auto', padding:'28px', borderRight:'1px solid #e5e7eb' },
  previewCol:{ flex:'0 0 42%', overflowY:'auto', padding:'28px', backgroundColor:'#f9fafb' },
  errorBox:{ padding:'12px 16px', backgroundColor:'#FEE2E2', color:'#DC2626', borderRadius:'8px', marginBottom:'20px', fontSize:'14px' },
  section:{ marginBottom:'8px' },
  sectionHeader:{ display:'flex', alignItems:'flex-start', gap:'12px', marginBottom:'16px' },
  sectionIcon:{ fontSize:'20px', marginTop:'2px' },
  sectionTitle:{ fontSize:'16px', fontWeight:'700', color:'#111827' },
  sectionSub:{ fontSize:'13px', color:'#6b7280', marginTop:'2px' },
  divider:{ borderTop:'1px solid #f3f4f6', margin:'20px 0' },
  field:{ marginBottom:'14px' },
  twoField:{ display:'flex', gap:'14px' },
  label:{ display:'block', fontSize:'13px', fontWeight:'600', color:'#374151', marginBottom:'6px' },
  optional:{ fontWeight:'400', color:'#9ca3af' },
  input:{ width:'100%', padding:'10px 12px', fontSize:'14px', border:'1.5px solid #d1d5db', borderRadius:'8px', outline:'none', fontFamily:'inherit', backgroundColor:'white', boxSizing:'border-box' },
  accessRow:{ display:'flex', gap:'12px', marginBottom:'16px' },
  accessBtn:{ flex:1, padding:'16px', border:'2px solid #e5e7eb', borderRadius:'10px', background:'white', cursor:'pointer', textAlign:'center', transition:'all 0.2s' },
  accessBtnActive:{ border:'2px solid var(--cv-accent)', background:'var(--cv-accent-light)' },
  accessIcon:{ fontSize:'24px', marginBottom:'6px' },
  accessLabel:{ fontWeight:'700', fontSize:'14px', color:'#111827' },
  accessDesc:{ fontSize:'12px', color:'#6b7280', marginTop:'2px' },
  privateSection:{ padding:'16px', backgroundColor:'#f8fafc', borderRadius:'10px', border:'1px solid #e2e8f0', marginBottom:'16px' },
  privateSectionTitle:{ fontSize:'14px', fontWeight:'700', color:'#374151', marginBottom:'8px' },
  privateNote:{ fontSize:'12px', color:'#6b7280', backgroundColor:'#FEF3C7', padding:'8px 12px', borderRadius:'6px', marginBottom:'12px', border:'1px solid #FDE68A' },
  studentRow:{ display:'flex', gap:'8px', marginBottom:'8px', alignItems:'center' },
  removeBtn:{ background:'none', border:'none', color:'#ef4444', fontSize:'16px', cursor:'pointer', padding:'4px 8px', flexShrink:0 },
  addStudentBtn:{ background:'none', border:'1.5px dashed var(--cv-accent)', color:'var(--cv-accent)', borderRadius:'8px', padding:'8px 16px', fontSize:'13px', fontWeight:'600', cursor:'pointer', width:'100%', marginTop:'6px' },
  toggleRow:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px', backgroundColor:'white', borderRadius:'8px', border:'1px solid #e5e7eb' },
  toggleLabel:{ fontSize:'14px', fontWeight:'600', color:'#374151' },
  toggleSub:{ fontSize:'12px', color:'#9ca3af', marginTop:'2px' },
  toggle:{ width:'44px', height:'24px', borderRadius:'12px', border:'none', cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0 },
  toggleOn:{ backgroundColor:'var(--cv-accent)' }, toggleOff:{ backgroundColor:'#d1d5db' },
  toggleThumb:{ position:'absolute', top:'3px', width:'18px', height:'18px', borderRadius:'50%', backgroundColor:'white', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' },
  thumbOn:{ left:'23px' }, thumbOff:{ left:'3px' },
  formFooter:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'24px', paddingTop:'20px', borderTop:'1px solid #e5e7eb' },
  footerLeft:{ display:'flex', gap:'10px' },
  cancelBtn:{ padding:'10px 18px', border:'1.5px solid #d1d5db', borderRadius:'8px', background:'white', fontSize:'14px', fontWeight:'600', color:'#374151', cursor:'pointer' },
  draftBtn:{ padding:'10px 18px', border:'1.5px solid var(--cv-accent)', borderRadius:'8px', background:'white', fontSize:'14px', fontWeight:'600', color:'var(--cv-accent)', cursor:'pointer' },
  confirmBtn:{ padding:'12px 24px', backgroundColor:'var(--cv-accent)', color:'white', border:'none', borderRadius:'10px', fontSize:'14px', fontWeight:'700', cursor:'pointer', boxShadow:'0 4px 12px rgba(79,70,229,0.3)' },
  termsText:{ fontSize:'12px', color:'#9ca3af', textAlign:'center', marginTop:'12px' },
  previewLabel:{ fontSize:'11px', fontWeight:'700', color:'#9ca3af', letterSpacing:'1px', marginBottom:'16px', textAlign:'center' },
  previewCard:{ backgroundColor:'white', borderRadius:'12px', overflow:'hidden', boxShadow:'0 4px 20px rgba(0,0,0,0.08)', marginBottom:'16px' },
  previewTopBar:{ height:'6px', backgroundColor:'var(--cv-accent)' },
  previewBadge:{ display:'inline-block', fontSize:'11px', fontWeight:'600', color:'#6b7280', padding:'4px 10px', border:'1px solid #e5e7eb', borderRadius:'12px', margin:'16px 16px 8px' },
  previewTitle:{ fontSize:'18px', fontWeight:'700', color:'#111827', padding:'0 16px', lineHeight:'1.4', minHeight:'28px' },
  previewDate:{ fontSize:'13px', color:'#6b7280', padding:'4px 16px 12px', borderBottom:'1px solid #f3f4f6' },
  previewPinBox:{ padding:'16px', textAlign:'center' },
  previewPinLabel:{ fontSize:'11px', fontWeight:'700', color:'#9ca3af', letterSpacing:'1px' },
  previewPinValue:{ fontSize:'36px', fontWeight:'900', color:'#111827', letterSpacing:'4px', marginTop:'4px' },
  previewMeta:{ fontSize:'13px', color:'#6b7280', padding:'4px 16px' },
  previewNote:{ fontSize:'12px', color:'#9ca3af', padding:'12px 16px', borderTop:'1px solid #f3f4f6', marginTop:'8px', lineHeight:'1.5' },
  copyLinkBtn:{ width:'calc(100% - 32px)', margin:'12px 16px', padding:'10px', border:'1.5px solid #e5e7eb', borderRadius:'8px', background:'white', fontSize:'13px', fontWeight:'600', color:'#374151', cursor:'pointer' },
  proTip:{ backgroundColor:'#FFFBEB', borderRadius:'10px', padding:'16px', border:'1px solid #FDE68A' },
  proTipTitle:{ fontSize:'13px', fontWeight:'700', color:'#92400E', marginBottom:'6px' },
  proTipText:{ fontSize:'12px', color:'#78350F', lineHeight:'1.5' },
};

export default ScheduleSession;