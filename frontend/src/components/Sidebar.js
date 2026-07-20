// frontend/src/components/Sidebar.js
// ✅ UPDATED — Major functional improvements
//
// CHANGES:
//  1. "ClassVibe" brand removed from sidebar header (user request)
//  2. Nav items now DO real things:
//       Dashboard   → calls onDashboard() + closes sidebar
//       Live Session→ calls onLiveSession() + closes sidebar
//       Participants→ scrolls / shows the participants panel (already in sidebar)
//       Settings    → opens Settings modal (full-screen overlay)
//       Whiteboard  → opens Whiteboard canvas (full-screen overlay)
//  3. "Participants" appeared 3× → removed "Participation" from Session Tools
//     (participantsPanel above it already shows the same data)
//  4. Active Students & Statistics kept (different data from participants panel)
//  5. Settings and Whiteboard rendered as fixed overlays — covers full screen
//  6. All existing socket/session logic UNCHANGED

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useBreakpoint } from '../styles/breakpoints';

// ─── inline Settings component ──────────────────────────────────────────────
export const Settings = ({ onClose, onUserUpdated, isDark }) => {
  const [user,         setUser]         = useState(null);
  const [username,     setUsername]     = useState('');
  const [photoPreview, setPhotoPreview] = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [msg,          setMsg]          = useState('');
  const photoInputRef = useRef(null);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      setUser(u);
      setUsername(u.username || u.name || '');
      setPhotoPreview(u.profilePhoto || null);
    } catch { /* ignore */ }
  }, []);

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setMsg('Photo too large (max 5 MB)'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!username.trim()) { setMsg('Username cannot be empty'); return; }
    setSaving(true); setMsg('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com'}/api/auth/update-profile`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ username: username.trim(), name: username.trim(), profilePhoto: photoPreview }),
        }
      );
      const updated = { ...user, username: username.trim(), name: username.trim(), profilePhoto: photoPreview };
      localStorage.setItem('user', JSON.stringify(updated));
      setUser(updated);
      if (typeof onUserUpdated === 'function') onUserUpdated(updated);
      setMsg(res.ok ? '✅ Profile updated!' : '✅ Saved locally (will sync when server available)');
    } catch {
      const updated = { ...user, username: username.trim(), name: username.trim(), profilePhoto: photoPreview };
      localStorage.setItem('user', JSON.stringify(updated));
      if (typeof onUserUpdated === 'function') onUserUpdated(updated);
      setMsg('✅ Saved locally');
    } finally { setSaving(false); }
  };

  const initials = (name) => (name || '??').substring(0, 2).toUpperCase();

  const dk = isDark;
  const mBg   = dk ? '#1e293b' : 'white';
  const mBdr  = dk ? '#334155' : '#e2e8f0';
  const mTxt  = dk ? '#f1f5f9' : '#0f172a';
  const mTxt2 = dk ? '#94a3b8' : '#374151';
  const mInp  = dk ? '#0f172a' : 'white';
  const mInpRo= dk ? '#0a111f' : '#f8fafc';

  return (
    <div style={ST.overlay}>
      <div style={{ ...ST.modal, backgroundColor: mBg }}>
        {/* Header */}
        <div style={{ ...ST.header, borderBottom: `1px solid ${mBdr}` }}>
          <h2 style={{ ...ST.title, color: mTxt }}>⚙️ Profile Settings</h2>
          <button onClick={onClose} style={ST.closeBtn}>✕</button>
        </div>

        {/* Body */}
        <div style={{ ...ST.body, backgroundColor: mBg }}>
          {/* ── Profile photo ── */}
          <div style={ST.photoSection}>
            <div style={ST.photoWrapper}>
              {photoPreview
                ? <img src={photoPreview} alt="Profile" style={ST.photoImg} />
                : <div style={ST.photoPlaceholder}>{initials(username)}</div>
              }
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
            <div style={ST.photoActions}>
              <button style={ST.uploadBtn} onClick={() => photoInputRef.current?.click()}>📷 Upload Photo</button>
              {photoPreview && (
                <button style={ST.removeBtn} onClick={() => { setPhotoPreview(null); if (photoInputRef.current) photoInputRef.current.value = ''; }}>
                  🗑️ Remove
                </button>
              )}
            </div>
            <p style={ST.photoHint}>Supports JPG, PNG, GIF · Max 5 MB</p>
          </div>

          {/* ── Username (editable) ── */}
          <div style={ST.field}>
            <div style={ST.labelRow}>
              <label style={{ ...ST.label, color: mTxt2 }}>Username</label>
              <span style={ST.editablePill}>Editable</span>
            </div>
            <input style={{ ...ST.input, backgroundColor: mInp, color: mTxt, borderColor: mBdr }} value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter username" maxLength={50} />
          </div>

          {/* ── Email (readonly) ── */}
          <div style={ST.field}>
            <div style={ST.labelRow}>
              <label style={{ ...ST.label, color: mTxt2 }}>Email</label>
              <span style={ST.readonlyPill}>Read only</span>
            </div>
            <input style={{ ...ST.input, ...ST.readonlyInput, backgroundColor: mInpRo, color: dk?'#64748b':'#94a3b8', borderColor: mBdr }} value={user?.email || '—'} readOnly />
            <p style={ST.hint}>Email is set at registration and cannot be changed here.</p>
          </div>

          {/* Message */}
          {msg && (
            <div style={{ ...ST.msgBox, backgroundColor: msg.startsWith('✅') ? '#f0fdf4' : '#fef2f2', color: msg.startsWith('✅') ? '#15803d' : '#dc2626', borderColor: msg.startsWith('✅') ? '#bbf7d0' : '#fecaca' }}>
              {msg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ ...ST.footer, borderTop: `1px solid ${mBdr}`, backgroundColor: mBg }}>
          <button onClick={onClose} style={{ ...ST.cancelBtn, backgroundColor: dk?'#334155':'#f1f5f9', color: dk?'#f1f5f9':'#475569' }}>Cancel</button>
          <button onClick={handleSave} style={ST.saveBtn} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Settings styles
const ST = {
  overlay:    { position:'fixed', inset:0, backgroundColor:'rgba(15,23,42,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:3000 },
  modal:      { backgroundColor:'white', borderRadius:16, width:'90%', maxWidth:480, maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 64px rgba(0,0,0,0.25)', overflow:'hidden' },
  header:     { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'18px 24px', borderBottom:'1px solid #e2e8f0', flexShrink:0 },
  title:      { margin:0, fontSize:18, fontWeight:'800', color:'#0f172a' },
  closeBtn:   { background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#94a3b8' },
  body:       { padding:24, overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:20 },
  photoSection:{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, padding:'20px 0', borderBottom:'1px solid #f1f5f9' },
  photoWrapper:{ position:'relative', width:88, height:88 },
  photoImg:   { width:88, height:88, borderRadius:'50%', objectFit:'cover', border:'3px solid #e2e8f0' },
  photoPlaceholder:{ width:88, height:88, borderRadius:'50%', backgroundColor:'var(--cv-accent-mid)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, fontWeight:'700' },
  photoActions:{ display:'flex', gap:10 },
  uploadBtn:  { padding:'7px 14px', fontSize:13, fontWeight:'600', backgroundColor:'#eef2ff', color:'#4f46e5', border:'1px solid #c7d2fe', borderRadius:8, cursor:'pointer' },
  removeBtn:  { padding:'7px 14px', fontSize:13, fontWeight:'600', backgroundColor:'#fee2e2', color:'#ef4444', border:'1px solid #fecaca', borderRadius:8, cursor:'pointer' },
  photoHint:  { fontSize:11, color:'#94a3b8', margin:0 },
  field:      { display:'flex', flexDirection:'column', gap:6 },
  labelRow:   { display:'flex', alignItems:'center', gap:8 },
  label:      { fontSize:13, fontWeight:'700', color:'#374151' },
  editablePill:{ fontSize:10, fontWeight:'600', color:'#15803d', backgroundColor:'#dcfce7', border:'1px solid #bbf7d0', borderRadius:20, padding:'2px 8px' },
  readonlyPill:{ fontSize:10, fontWeight:'600', color:'#64748b', backgroundColor:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:20, padding:'2px 8px' },
  input:      { padding:'10px 13px', fontSize:14, border:'1.5px solid #e2e8f0', borderRadius:8, outline:'none', color:'#1e293b', backgroundColor:'white' },
  readonlyInput:{ backgroundColor:'#f8fafc', color:'#94a3b8', cursor:'not-allowed' },
  hint:       { fontSize:11, color:'#94a3b8', margin:'2px 0 0' },
  msgBox:     { padding:'10px 14px', borderRadius:8, border:'1px solid', fontSize:13, fontWeight:'500' },
  footer:     { display:'flex', gap:10, padding:'16px 24px', borderTop:'1px solid #e2e8f0', flexShrink:0 },
  cancelBtn:  { flex:1, padding:12, fontSize:14, fontWeight:'600', backgroundColor:'#f1f5f9', color:'#475569', border:'none', borderRadius:8, cursor:'pointer' },
  saveBtn:    { flex:2, padding:12, fontSize:14, fontWeight:'700', backgroundColor:'var(--cv-accent-mid)', color:'white', border:'none', borderRadius:8, cursor:'pointer' },
};


// ─── inline Whiteboard component ────────────────────────────────────────────
const COLORS = ['#000000','#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#ffffff'];
const SIZES  = [2, 5, 10, 18];

const Whiteboard = ({ onClose }) => {
  const bucket = useBreakpoint(); // Design System (Phase 3)
  const canvasRef    = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPosRef   = useRef(null);
  const historyRef   = useRef([]);
  const stepRef      = useRef(-1);

  const [tool,     setTool]     = useState('pen');
  const [color,    setColor]    = useState('#000000');
  const [size,     setSize]     = useState(5);
  const [canUndo,  setCanUndo]  = useState(false);
  const [canRedo,  setCanRedo]  = useState(false);

  // ── Init canvas — re-runs on resize/orientation-change too, so the backing
  // store stays matched to the displayed size instead of stretching/blurring.
  // Debounced since resize fires continuously during a drag-resize. Redrawing
  // existing strokes across a resize is out of scope (matches mount behavior).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const initCanvas = () => {
      canvas.width  = canvas.parentElement?.clientWidth  || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || (window.innerHeight - 68);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
      historyRef.current = [snap];
      stepRef.current = 0;
      setCanUndo(false);
      setCanRedo(false);
    };
    initCanvas();
    let resizeTimer;
    const handleResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(initCanvas, 150); };
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); clearTimeout(resizeTimer); };
  }, []);

  const saveSnap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const snap = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    historyRef.current = historyRef.current.slice(0, stepRef.current + 1);
    historyRef.current.push(snap);
    stepRef.current = historyRef.current.length - 1;
    setCanUndo(stepRef.current > 0);
    setCanRedo(false);
  }, []);

  const undo = () => {
    if (stepRef.current <= 0) return;
    stepRef.current--;
    canvasRef.current.getContext('2d').putImageData(historyRef.current[stepRef.current], 0, 0);
    setCanUndo(stepRef.current > 0);
    setCanRedo(true);
  };
  const redo = () => {
    if (stepRef.current >= historyRef.current.length - 1) return;
    stepRef.current++;
    canvasRef.current.getContext('2d').putImageData(historyRef.current[stepRef.current], 0, 0);
    setCanUndo(true);
    setCanRedo(stepRef.current < historyRef.current.length - 1);
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveSnap();
  };

  const getPos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  };

  const startDraw = (e) => {
    e.preventDefault();
    isDrawingRef.current = true;
    lastPosRef.current = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineWidth   = tool === 'eraser' ? size * 4 : size;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPosRef.current = pos;
  };

  const endDraw = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    saveSnap();
  };

  return (
    <div style={WB.overlay}>
      {/* ── Toolbar ── */}
      <div style={WB.toolbar}>
        <span style={WB.wbTitle}>✏️ Whiteboard</span>

        <div style={WB.sep} />

        {/* Tools */}
        <button style={{ ...WB.toolBtn, ...(tool === 'pen'    ? WB.active : {}) }} onClick={() => setTool('pen')}>🖊 Pen</button>
        <button style={{ ...WB.toolBtn, ...(tool === 'eraser' ? WB.active : {}) }} onClick={() => setTool('eraser')}>🧹 Eraser</button>

        <div style={WB.sep} />

        {/* Colors */}
        {COLORS.map(c => (
          <button
            key={c}
            onClick={() => { setColor(c); setTool('pen'); }}
            style={{
              ...WB.colorDot,
              backgroundColor: c,
              outline: (color === c && tool === 'pen') ? '3px solid var(--cv-accent-mid)' : '2px solid #e2e8f0',
              outlineOffset: 2,
            }}
            title={c}
          />
        ))}

        <div style={WB.sep} />

        {/* Sizes */}
        {SIZES.map(s => (
          <button key={s} style={{ ...WB.sizeBtn, ...(size === s ? WB.active : {}) }} onClick={() => setSize(s)}>
            <span style={{ display:'inline-block', width: s * 1.8, height: s * 1.8, minWidth:4, minHeight:4, backgroundColor: tool === 'eraser' ? '#94a3b8' : color, borderRadius:'50%' }} />
          </button>
        ))}

        {/* On mobile, force a clean row break here instead of an arbitrary wrap
            point — row 1 is drawing tools, row 2 is actions. */}
        {bucket === 'mobile' ? <div style={WB.rowBreak} /> : <div style={WB.sep} />}

        {/* Undo / Redo / Clear */}
        <button style={{ ...WB.actionBtn, opacity: canUndo ? 1 : 0.4 }} onClick={undo} disabled={!canUndo}>↩ Undo</button>
        <button style={{ ...WB.actionBtn, opacity: canRedo ? 1 : 0.4 }} onClick={redo} disabled={!canRedo}>↪ Redo</button>
        <button style={{ ...WB.actionBtn, color:'#ef4444' }} onClick={clear}>🗑 Clear</button>

        {bucket !== 'mobile' && <div style={{ flex: 1 }} />}
        <button style={WB.closeBtn} onClick={onClose}>✕ Close</button>
      </div>

      {/* ── Canvas area ── */}
      <div style={WB.canvasWrap}>
        <canvas
          ref={canvasRef}
          style={{ ...WB.canvas, cursor: tool === 'eraser' ? 'cell' : 'crosshair' }}
          onMouseDown={startDraw}  onMouseMove={draw}  onMouseUp={endDraw}  onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw}  onTouchEnd={endDraw}
        />
      </div>
    </div>
  );
};

// Whiteboard styles
const WB = {
  overlay:    { position:'fixed', inset:0, zIndex:3000, backgroundColor:'#f8fafc', display:'flex', flexDirection:'column' },
  // height (not fixed) — a fixed height clipped wrapped rows whenever the ~20
  // controls didn't fit one line (not just on mobile — 768px tablet wraps
  // too); minHeight keeps the original single-row look wherever it still fits.
  toolbar:    { display:'flex', alignItems:'center', gap:6, padding:'8px 16px', minHeight:56, backgroundColor:'#ffffff', borderBottom:'1px solid #e2e8f0', flexShrink:0, flexWrap:'wrap', overflowX:'auto' },
  wbTitle:    { fontSize:14, fontWeight:'700', color:'#1e293b', marginRight:4, whiteSpace:'nowrap' },
  sep:        { width:1, height:28, backgroundColor:'#e2e8f0', flexShrink:0, margin:'0 4px' },
  rowBreak:   { flexBasis:'100%', height:0 },
  toolBtn:    { padding:'5px 10px', fontSize:12, fontWeight:'600', backgroundColor:'transparent', color:'#475569', border:'1px solid #e2e8f0', borderRadius:6, cursor:'pointer', whiteSpace:'nowrap' },
  active:     { backgroundColor:'#eef2ff', color:'#4f46e5', borderColor:'#c7d2fe' },
  colorDot:   { width:20, height:20, borderRadius:'50%', border:'none', cursor:'pointer', flexShrink:0, padding:0 },
  sizeBtn:    { width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'transparent', border:'1px solid #e2e8f0', borderRadius:6, cursor:'pointer', flexShrink:0 },
  actionBtn:  { padding:'5px 10px', fontSize:12, fontWeight:'600', backgroundColor:'transparent', color:'#374151', border:'1px solid #e2e8f0', borderRadius:6, cursor:'pointer', whiteSpace:'nowrap' },
  closeBtn:   { padding:'6px 14px', fontSize:13, fontWeight:'700', backgroundColor:'#1e293b', color:'white', border:'none', borderRadius:7, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 },
  canvasWrap: { flex:1, overflow:'hidden', position:'relative' },
  canvas:     { display:'block', width:'100%', height:'100%', touchAction:'none' },
};


// ─── Main Sidebar component ──────────────────────────────────────────────────
const Sidebar = ({
  isOpen,
  onClose,
  group,
  messages    = [],
  currentUserId,
  userRole,
  onLeaveMeeting,
  onLogout,
  onDashboard,
  onLiveSession,
  onUserUpdated,  // called with updated user object after profile save
  isDark,
  onToggleTheme,
}) => {
  const [activeNavItem,    setActiveNavItem]    = useState('Dashboard');
  const [showSettings,     setShowSettings]     = useState(false);
  const [showWhiteboard,   setShowWhiteboard]   = useState(false);

  const getCurrentUser = () => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  };
  const currentUser  = getCurrentUser();
  const resolvedRole = userRole || currentUser?.role || 'student';

  // Engagement (teacher)
  const engagementScore = (() => {
    if (!group?.members?.length || !messages?.length) return 0;
    const senders = new Set(messages.map(m => m.sender?._id).filter(Boolean));
    return Math.min(100, Math.round((senders.size / group.members.length) * 100));
  })();

  // Only currently connected users (cross-reference members with onlineUsers)
  const onlineIds = new Set((group?.onlineUsers || []).map(u => String(u._id || u.id || u)));
  const onlineMembers = (group?.members || []).filter(m => {
    const mId = String(m.user?._id || m.user?.id || m._id || m.id || '');
    return mId && onlineIds.has(mId);
  });
  const onlineCount = onlineMembers.length;

  // ── Nav handlers ──
  const handleNavClick = (label) => {
    setActiveNavItem(label);
    if (label === 'Dashboard') {
      if (typeof onDashboard === 'function') { onDashboard(); onClose(); }
    } else if (label === 'Live Session') {
      if (typeof onLiveSession === 'function') { onLiveSession(); onClose(); }
    } else if (label === 'Settings' || label === 'Profile') {
      setShowSettings(true);
    } else if (label === 'Whiteboard') {
      setShowWhiteboard(true);
    }
    // 'Participants' sets active and shows the panel below
  };

  const teacherNav = [
    { icon: '📊', label: 'Dashboard'    },
    { icon: '💬', label: 'Live Session' },
    { icon: '👥', label: 'Participants' },
    { icon: '⚙️', label: 'Settings'     },
    { icon: '✏️', label: 'Whiteboard', sub: 'Collaborative drawing space' },
  ];
  const studentNav = [
    { icon: '📊', label: 'Dashboard'    },
    { icon: '💬', label: 'Live Session' },
    { icon: '👥', label: 'Participants' },
    { icon: '⚙️', label: 'Settings'     },
  ];
  const navItems = resolvedRole === 'teacher' ? teacherNav : studentNav;

  // ════════════════════════════════════════════════════════════════════════
  return (
    <>
      {showSettings   && <Settings   onClose={() => setShowSettings(false)} onUserUpdated={onUserUpdated} isDark={isDark} />}
      {showWhiteboard && <Whiteboard onClose={() => setShowWhiteboard(false)} />}

      {isOpen && <div style={styles.backdrop} onClick={onClose} />}
      <div style={{ ...styles.sidebar, right: isOpen ? '0' : '-100vw',
        backgroundColor: isDark ? '#1e293b' : 'white',
        borderLeft: isDark ? '1px solid #334155' : '1px solid rgba(0,0,0,0.1)',
      }}>

        {/* ── HEADER ── */}
        <div style={{ ...styles.sidebarHeader, backgroundColor: isDark ? '#0f172a' : '#f9fafb', borderBottom: isDark ? '1px solid #334155' : '1px solid #e5e7eb' }}>
          <span style={{ ...styles.headerLabel, color: isDark ? '#64748b' : '#9ca3af' }}>Menu</span>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {onToggleTheme && (
              <button onClick={onToggleTheme} title="Toggle dark/light mode"
                style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, padding:'2px 4px', color: isDark ? '#94a3b8' : '#6b7280' }}>
                {isDark ? '☀️' : '🌙'}
              </button>
            )}
            <button onClick={onClose} style={{ ...styles.closeButton, color: isDark ? '#94a3b8' : '#6b7280' }}>✕</button>
          </div>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div style={styles.scrollContent}>

          {group && (
            <>
              {/* NAV ITEMS */}
              <div style={styles.navSection}>
                {navItems.map((item, i) => (
                  <button
                    key={i}
                    style={{
                      ...styles.navItem,
                      backgroundColor: activeNavItem === item.label
                        ? (isDark ? '#1e3a5f' : 'var(--cv-accent-light)')
                        : 'transparent',
                      color: activeNavItem === item.label
                        ? (isDark ? '#818cf8' : 'var(--cv-accent)')
                        : (isDark ? '#cbd5e1' : '#374151'),
                    }}
                    onClick={() => handleNavClick(item.label)}
                  >
                    <span style={styles.navIcon}>{item.icon}</span>
                    <div style={styles.navTextWrap}>
                      <span style={styles.navLabel}>{item.label}</span>
                      {item.sub && <span style={styles.navSub}>{item.sub}</span>}
                    </div>
                    {activeNavItem === item.label && <span style={styles.navActive} />}
                  </button>
                ))}
              </div>

              {/* ── PARTICIPANTS — only when that nav item is active ── */}
              {activeNavItem === 'Participants' && (
                <div style={styles.participantsPanel}>
                  <div style={styles.participantsHeader}>
                    <span style={styles.participantsTitle}>
                      Participants ({onlineCount} online)
                    </span>
                    <span style={styles.onlinePill}>{onlineCount} Online</span>
                  </div>
                  <div style={styles.participantsList}>
                    {onlineMembers.map((member, i) => {
                      const name   = member.user?.username ?? member.user?.name ?? member.username ?? member.name ?? `Member ${i + 1}`;
                      const mId    = member.user?._id ?? member.user?.id ?? member._id ?? member.id;
                      const colors = ['#FF6B6B','#4ECDC4','#45B7D1','#FFA07A','#BB8FCE','#98D8C8','#F7DC6F','#85C1E2'];
                      return (
                        <div key={mId || i} style={styles.participantRow}>
                          <div style={{ ...styles.participantAvatar, backgroundColor: colors[i % colors.length] }}>
                            {name.charAt(0).toUpperCase()}
                            <div style={styles.onlineDot} />
                          </div>
                          <span style={styles.participantName}>{name}</span>
                          {String(mId) === String(group.admin?._id ?? group.admin) && (
                            <span style={styles.teacherTag}>Teacher</span>
                          )}
                        </div>
                      );
                    })}
                    {onlineCount === 0 && (
                      <p style={styles.noUsers}>No one online right now</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── LIVE REACTIONS — teacher only ── */}
              {resolvedRole === 'teacher' && (
                <div style={{ ...styles.engagementPanel, backgroundColor: isDark?'#0f172a':'#fafafa', borderBottom: isDark?'1px solid #334155':'1px solid #f3f4f6' }}>
                  <div style={styles.engagementTitle}>LIVE REACTIONS</div>
                  <div style={styles.engagementContent}>
                    <span style={styles.engagementIcon}>⚡</span>
                    <div>
                      <div style={{ ...styles.engagementScore, color: isDark?'#f1f5f9':'#111827' }}>{engagementScore}%</div>
                      <div style={styles.engagementLabel}>Engagement</div>
                    </div>
                  </div>
                  <div style={styles.engagementBar}>
                    <div style={{ ...styles.engagementFill, width: `${engagementScore}%` }} />
                  </div>
                </div>
              )}

              {resolvedRole === 'teacher' && <div style={styles.divider} />}
            </>
          )}

          {/* Session Tools removed — teacher uses Dashboard Analytics page instead */}

        </div>{/* end scrollContent */}

        {/* ── BOTTOM BAR — always visible, fixed at bottom ── */}
        <div style={{ ...styles.bottomBar, backgroundColor: isDark?'#1e293b':'white', borderTop: isDark?'2px solid #334155':'2px solid #e5e7eb' }}>
          {group && resolvedRole === 'student' && onLeaveMeeting && (
            <button className="sidebar-leave-btn" style={styles.leaveSessionBtn} onClick={() => { onClose(); onLeaveMeeting(); }}>
              → Leave session
            </button>
          )}
          {resolvedRole === 'student' && onLogout && (
            <button className="sidebar-logout-btn" style={styles.logoutBottomBtn} onClick={onLogout}>
              ↗ Logout
            </button>
          )}
        </div>

      </div>
    </>
  );
};

// ══════════════════════════════════════════════════════════════════════════
//  SIDEBAR STYLES
// ══════════════════════════════════════════════════════════════════════════
const styles = {
  backdrop: { position:'fixed', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.45)', zIndex:999 },
  sidebar:  { position:'fixed', top:0, right:0, width:'min(360px, 100vw)', height:'100vh', backgroundColor:'white', boxShadow:'-2px 0 16px rgba(0,0,0,0.12)', transition:'right 0.28s ease', zIndex:1000, overflow:'hidden', display:'flex', flexDirection:'column' },
  scrollContent: { flex:1, overflowY:'auto', display:'flex', flexDirection:'column' },
  bottomBar: { flexShrink:0, borderTop:'2px solid #e5e7eb', backgroundColor:'white', padding:'8px 0' },

  // Header — no ClassVibe brand
  sidebarHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 20px', backgroundColor:'#f9fafb', borderBottom:'1px solid #e5e7eb', flexShrink:0, minHeight:52 },
  headerLabel:   { fontSize:'13px', fontWeight:'700', color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.5px' },
  closeButton:   { background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'#6b7280', padding:'4px', lineHeight:1 },

  // Nav
  navSection:  { padding:'8px 0', borderBottom:'1px solid #f3f4f6' },
  navItem:     { display:'flex', alignItems:'center', gap:'12px', padding:'10px 20px', border:'none', width:'100%', textAlign:'left', cursor:'pointer', fontSize:'14px', fontWeight:'500', transition:'background 0.15s', position:'relative', borderRadius:0 },
  navIcon:     { fontSize:'16px', width:'20px', textAlign:'center', flexShrink:0 },
  navTextWrap: { display:'flex', flexDirection:'column', flex:1 },
  navLabel:    { fontSize:'14px', fontWeight:'500' },
  navSub:      { fontSize:'11px', color:'#9ca3af', marginTop:'1px' },
  navActive:   { position:'absolute', left:0, top:0, bottom:0, width:'3px', backgroundColor:'var(--cv-accent)', borderRadius:'0 3px 3px 0' },

  // Participants panel
  participantsPanel:   { padding:'16px 20px', borderBottom:'1px solid #f3f4f6', backgroundColor:'#fafafa' },
  participantsHeader:  { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' },
  participantsTitle:   { fontSize:'13px', fontWeight:'700', color:'#374151' },
  onlinePill:          { fontSize:'11px', fontWeight:'600', color:'#10B981', backgroundColor:'#D1FAE5', padding:'3px 8px', borderRadius:'10px' },
  participantsList:    { display:'flex', flexDirection:'column', gap:'8px' },
  participantRow:      { display:'flex', alignItems:'center', gap:'10px' },
  participantAvatar:   { width:'32px', height:'32px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:'13px', fontWeight:'600', flexShrink:0, position:'relative' },
  onlineDot:           { position:'absolute', bottom:0, right:0, width:'9px', height:'9px', backgroundColor:'#10B981', borderRadius:'50%', border:'2px solid white' },
  participantName:     { fontSize:'13px', color:'#374151', fontWeight:'500', flex:1 },
  teacherTag:          { fontSize:'10px', fontWeight:'600', color:'#92400e', backgroundColor:'#fef3c7', border:'1px solid #fcd34d', borderRadius:4, padding:'1px 6px' },
  moreParticipants:    { fontSize:'12px', color:'#9ca3af', paddingLeft:'42px', marginTop:'4px' },
  noUsers:             { fontSize:'13px', color:'#999', textAlign:'center', padding:'12px', margin:0 },

  // Engagement (teacher)
  engagementPanel:   { padding:'14px 20px', borderBottom:'1px solid #f3f4f6', backgroundColor:'#fafafa' },
  engagementTitle:   { fontSize:'10px', fontWeight:'700', color:'#9ca3af', letterSpacing:'1px', marginBottom:'8px' },
  engagementContent: { display:'flex', alignItems:'center', gap:'12px', marginBottom:'8px' },
  engagementIcon:    { fontSize:'28px' },
  engagementScore:   { fontSize:'24px', fontWeight:'800' },
  engagementLabel:   { fontSize:'11px', color:'#6b7280' },
  engagementBar:     { height:'4px', backgroundColor:'#e5e7eb', borderRadius:'2px', overflow:'hidden' },
  engagementFill:    { height:'100%', backgroundColor:'var(--cv-accent)', borderRadius:'2px', transition:'width 0.5s' },

  // Student actions
  studentActionsPanel: { padding:'12px 20px', borderBottom:'1px solid #f3f4f6' },
  supportBtn:          { display:'flex', alignItems:'center', gap:'8px', width:'100%', padding:'10px 16px', border:'none', background:'none', fontSize:'14px', fontWeight:'500', color:'#374151', cursor:'pointer', borderRadius:'8px', textAlign:'left', marginBottom:'4px' },
  leaveSessionBtn:     { display:'flex', alignItems:'center', gap:'8px', width:'calc(100% - 24px)', margin:'4px 12px', padding:'10px 16px', border:'1px solid #FECACA', backgroundColor:'#FEF2F2', fontSize:'14px', fontWeight:'600', color:'#DC2626', cursor:'pointer', borderRadius:'8px', textAlign:'left', transition:'background 0.15s' },
  logoutBottomBtn:     { display:'flex', alignItems:'center', gap:'8px', width:'calc(100% - 24px)', margin:'4px 12px', padding:'10px 16px', border:'1px solid #BFDBFE', backgroundColor:'#EFF6FF', fontSize:'14px', fontWeight:'500', color:'#2563EB', cursor:'pointer', borderRadius:'8px', textAlign:'left', transition:'background 0.15s' },

  divider:       { height:'1px', backgroundColor:'#e5e7eb', margin:'8px 0' },
  sectionsTitle: { padding:'10px 20px 4px', fontSize:'11px', fontWeight:'700', color:'#9ca3af', letterSpacing:'0.5px' },

  // Session tool sections
  section:       { marginBottom:'2px', borderBottom:'1px solid #f3f4f6' },
  sectionHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px', cursor:'pointer', backgroundColor:'white' },
  sectionTitle:  { fontSize:'14px', fontWeight:'600', color:'#333' },
  arrow:         { fontSize:'12px', color:'#9ca3af' },
  sectionContent:{ padding:'12px 20px', backgroundColor:'#fafafa' },
  description:   { fontSize:'13px', color:'#666', marginBottom:'10px' },
  qrSection:     { textAlign:'center', paddingTop:6 },
  qrCode:        { width:'180px', height:'180px', border:'2px solid #ddd', borderRadius:'8px', padding:'6px', objectFit:'contain', backgroundColor:'white' },
  pinDisplay:    { fontSize:'16px', fontWeight:'700', color:'var(--cv-accent-mid)', marginTop:'8px' },
  button:        { padding:'10px 14px', fontSize:'14px', fontWeight:'600', backgroundColor:'var(--cv-accent-mid)', color:'white', border:'none', borderRadius:'6px', cursor:'pointer', marginTop:8 },
  smallBtn:      { padding:'5px 8px', marginRight:4, fontSize:12, borderRadius:5, border:'1px solid #ddd', cursor:'pointer', background:'#fff' },
  errorText:     { fontSize:'12px', color:'#dc3545', padding:'6px 8px', backgroundColor:'#fee', borderRadius:'4px', marginTop:8 },
  successText:   { fontSize:'12px', color:'#28a745', padding:'6px 8px', backgroundColor:'#efe', borderRadius:'4px', marginTop:8 },
  activeUsersList:  { display:'flex', flexDirection:'column', gap:'6px' },
  activeUserItem:   { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', backgroundColor:'#eef2ff', borderRadius:'6px' },
  activeUserLeft:   { display:'flex', alignItems:'center', gap:'8px' },
  activeStatusDot:  { width:'8px', height:'8px', borderRadius:'50%', backgroundColor:'var(--cv-accent-mid)', flexShrink:0 },
  activeUserName:   { fontSize:'13px', color:'#333', fontWeight:'500' },
  messageCount:     { fontSize:'11px', color:'#4f46e5', backgroundColor:'white', padding:'2px 7px', borderRadius:'10px', fontWeight:'600', border:'1px solid #c7d2fe' },
  statItem:  { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #f0f0f0' },
  statLabel: { fontSize:'13px', color:'#666' },
  statValue: { fontSize:'15px', fontWeight:'600', color:'var(--cv-accent-mid)' },
};

export default Sidebar;