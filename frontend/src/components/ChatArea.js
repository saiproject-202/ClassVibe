// src/components/ChatArea.js
// ✅ v4 — All specs implemented
//
// CHANGES vs v3:
//   1. chatTopStrip REMOVED — search is now triggered ONLY from Header's 🔍 button
//   2. window.addEventListener('toggleChatSearch') wires Header → ChatArea
//   3. Search bar renders as position:absolute overlay (floats over chat, no push-down)
//   4. Leaderboard always shows ▼ arrow when currentGroup exists (regardless of quiz state)
//   5. quizInProgress state added — detected from quiz_started/quiz_ended messages
//   6. Leaderboard expanded: shows loading / top-3 / no-quiz states correctly
//   7. Leaderboard refreshes on every new quiz (leaderbarBar resets when quiz starts)
//   8. All existing logic UNCHANGED (polls, quiz, files, context menu, fullscreen, PDF)

import React, { useRef, useEffect, useState, useMemo } from 'react';
import socket from '../socket';
import LbAvatar from './LbAvatar';

const ChatArea = ({
  messages,
  currentUserId,
  currentGroup,
  typingUsers,
  onMessageEdited,
  onMessageDeleted,
  userRole,
  moderatedChat     = false,
  isAdmin           = false,
  onReplyToStudent,
}) => {
  const [teacherFilter, setTeacherFilter] = useState('all'); // 'all' | 'unread' | a studentId
  const [studentSearch, setStudentSearch] = useState(''); // filters the filter-chip list, not messages
  const messagesEndRef       = useRef(null);
  const messagesContainerRef = useRef(null);

  const [showScrollButton, setShowScrollButton] = useState(false);
  const [contextMenu,      setContextMenu]      = useState(null);
  const [searchQuery,      setSearchQuery]      = useState('');
  const [showSearch,       setShowSearch]       = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText,         setEditText]         = useState('');
  const [fullscreenMedia,  setFullscreenMedia]  = useState(null);
  const [zoomLevel,        setZoomLevel]        = useState(1);
  const [pdfViewer,        setPdfViewer]        = useState(null);

  // ── Swipe-to-reply (drag a message bubble right to reply, like other chat apps) ──
  const [dragMsg, setDragMsg] = useState(null); // { id, dx }
  const dragStartRef = useRef({ x: 0, y: 0, active: false });
  const REPLY_DRAG_THRESHOLD = 50;
  const REPLY_DRAG_MAX = 70;

  const handleReplyDragStart = (e) => {
    dragStartRef.current = { x: e.clientX, y: e.clientY, active: true };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
  };
  const handleReplyDragMove = (e, msg) => {
    if (!dragStartRef.current.active) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dy) > Math.abs(dx) || dx < 4) return; // vertical scroll/selection — ignore
    setDragMsg({ id: msg._id, dx: Math.min(REPLY_DRAG_MAX, dx) });
  };
  const handleReplyDragEnd = (msg) => {
    if (dragMsg && dragMsg.id === msg._id && dragMsg.dx > REPLY_DRAG_THRESHOLD && typeof onReplyToStudent === 'function') {
      onReplyToStudent(msg.sender);
    }
    dragStartRef.current = { x: 0, y: 0, active: false };
    setDragMsg(null);
  };

  // ── Leaderboard ──────────────────────────────────────────────────────────
  // ▼ arrow always shows when currentGroup exists
  // lbCollapsed=true  → only arrow visible
  // lbCollapsed=false → bar expanded (loading / top-3 / no-data)
  const [leaderboardBar,  setLeaderboardBar]  = useState(null);   // null = no quiz done yet
  const [lbCollapsed,     setLbCollapsed]     = useState(true);
  const [quizInProgress,  setQuizInProgress]  = useState(false);  // quiz running right now

  // ── Socket: leaderboard data (quiz finished) ──────────────────────────────
  useEffect(() => {
    const onLeaderboard = (data) => {
      setQuizInProgress(false);
      if (data?.leaderboard?.length > 0) {
        setLeaderboardBar(data.leaderboard.slice(0, 3));
        setLbCollapsed(false); // auto-expand to show results
      }
    };
    socket.on('leaderboard:show', onLeaderboard);
    socket.on('quiz:finished',    onLeaderboard);
    return () => {
      socket.off('leaderboard:show', onLeaderboard);
      socket.off('quiz:finished',    onLeaderboard);
    };
  }, []);

  // ── Detect quiz state from messages ──────────────────────────────────────
  // quiz_started message → quiz in progress
  // quiz_ended   message → quiz done (leaderboard socket will bring data)
  useEffect(() => {
    if (!messages?.length) return;
    const reversed = [...messages].reverse();
    const lastQuizMsg = reversed.find(
      m => m.messageType === 'quiz_started' || m.messageType === 'quiz_ended'
    );
    if (!lastQuizMsg) return;
    if (lastQuizMsg.messageType === 'quiz_started') {
      // New quiz started → reset previous leaderboard, show loading
      setQuizInProgress(true);
      setLeaderboardBar(null);
      setLbCollapsed(false); // expand to show loading state
    } else if (lastQuizMsg.messageType === 'quiz_ended') {
      setQuizInProgress(false);
      // Actual results will arrive via socket 'leaderboard:show'
    }
  }, [messages]);

  // ── Window event: search toggle from Header's 🔍 button ───────────────────
  useEffect(() => {
    const handler = () => {
      setShowSearch(prev => {
        if (prev) setSearchQuery(''); // clear query when closing
        return !prev;
      });
    };
    window.addEventListener('toggleChatSearch', handler);
    return () => window.removeEventListener('toggleChatSearch', handler);
  }, []);

  // ── Message edit / delete ─────────────────────────────────────────────────
  useEffect(() => {
    const onEdited = (edited) => {
      if (typeof onMessageEdited === 'function') onMessageEdited(edited);
      if (editingMessageId === edited._id) { setEditingMessageId(null); setEditText(''); }
    };
    const onDeleted = (data) => {
      if (typeof onMessageDeleted === 'function') onMessageDeleted(data.messageId);
    };
    socket.on('messageEdited',  onEdited);
    socket.on('messageDeleted', onDeleted);
    return () => {
      socket.off('messageEdited',  onEdited);
      socket.off('messageDeleted', onDeleted);
    };
  }, [onMessageEdited, onMessageDeleted, editingMessageId]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  // ── Teacher Moderated Chat: mark student messages as read while the teacher
  // has the chat open. Server replies with 'messagesSeen' to both this socket
  // (so the Unread badge/filter updates locally) and each sender's room (so
  // students see "Seen by Teacher").
  useEffect(() => {
    if (!isAdmin || !moderatedChat || !currentGroup) return;
    const groupId = currentGroup._id ?? currentGroup.id;
    if (!groupId) return;
    socket.emit('markMessagesRead', { groupId });
  }, [isAdmin, moderatedChat, currentGroup, messages]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const handleScroll = () => {
    const c = messagesContainerRef.current;
    if (c) setShowScrollButton(c.scrollHeight - c.scrollTop - c.clientHeight > 100);
  };

  const scrollToBottom = (smooth = true) =>
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });

  const formatTime = (ts) => {
    const d = new Date(ts), now = new Date();
    return d.toDateString() === now.toDateString()
      ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getDateLabel = (ts) => {
    const d = new Date(ts), now = new Date();
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === now.toDateString())       return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  };

  const needsDateSep = (cur, prev) =>
    !prev || new Date(cur.createdAt).toDateString() !== new Date(prev.createdAt).toDateString();

  const getAvatarColor = (u) => {
    const c = ['var(--cv-accent-mid)','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#14b8a6'];
    return c[(u?.charCodeAt(0) || 0) % c.length];
  };

  // Defined here so it's available throughout the component
  const isDark = document.body.classList.contains('dark-mode');

  const ownBubbleColor = isDark
    ? (userRole === 'teacher'
        ? { bg: '#1e3a5f', border: '#3730a3', tick: '#818cf8' }
        : { bg: '#064e3b', border: '#065f46', tick: '#34d399' })
    : (userRole === 'teacher'
        ? { bg: '#eef2ff', border: '#c7d2fe', tick: 'var(--cv-accent-mid)' }
        : { bg: '#f0fdf4', border: '#bbf7d0', tick: '#10b981' });

  // ── Context menu ──────────────────────────────────────────────────────────
  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    if (msg.isDeleted) return;
    setContextMenu({ x: e.clientX, y: e.clientY, message: msg, isOwn: msg.sender?._id === currentUserId });
  };
  useEffect(() => {
    const dismiss = () => setContextMenu(null);
    document.addEventListener('click', dismiss);
    return () => document.removeEventListener('click', dismiss);
  }, []);

  const copyMsg    = (text) => {
    if (!text) { alert('Nothing to copy'); return; }
    navigator.clipboard.writeText(text).then(() => { setContextMenu(null); alert('Copied!'); }).catch(() => alert('Copy failed'));
  };
  const startEdit  = (msg) => { setEditingMessageId(msg._id); setEditText(msg.content); setContextMenu(null); };
  const saveEdit   = ()    => {
    if (!editText.trim()) { alert('Cannot be empty'); return; }
    socket.emit('editMessage', { messageId: editingMessageId, newContent: editText.trim() });
  };
  const cancelEdit = ()    => { setEditingMessageId(null); setEditText(''); };
  const deleteMsg  = (id)  => {
    if (window.confirm('Delete this message?')) { socket.emit('deleteMessage', { messageId: id }); setContextMenu(null); }
  };

  // ── Poll — UNCHANGED ──────────────────────────────────────────────────────
  const handlePollVote = (messageId, optionIndex) =>
    socket.emit('votePoll', { messageId, optionIndex, groupId: currentGroup?._id || currentGroup?.id });

  const renderPoll = (message) => {
    if (!message.pollOptions?.length) return <div style={S.pollError}>Poll data unavailable</div>;
    const total = message.pollOptions.reduce((s, o) => s + (o.votes?.length || 0), 0);
    const uvi   = message.pollOptions.findIndex(o => o.votes?.some(v => String(v) === String(currentUserId)));
    const voted = uvi !== -1;
    return (
      <div style={S.pollContainer}>
        <div style={S.pollHeader}><span>📊</span><span style={S.pollQuestion}>{message.content}</span></div>
        <div style={S.pollOptions}>
          {message.pollOptions.map((opt, i) => {
            const votes = opt.votes?.length || 0;
            const pct   = total > 0 ? Math.round((votes / total) * 100) : 0;
            const mine  = i === uvi;
            return (
              <div key={i}>
                {voted ? (
                  <div style={{ ...S.pollResult, borderColor: mine ? 'var(--cv-accent-mid)' : '#e2e8f0', borderWidth: mine ? '2px' : '1px' }}>
                    <div style={S.pollResultTop}><span style={S.pollOptText}>{opt.text || opt}</span><span style={S.pollPct}>{pct}%</span></div>
                    <div style={S.pollBar}><div style={{ ...S.pollFill, width: `${pct}%`, backgroundColor: mine ? 'var(--cv-accent-mid)' : '#94a3b8' }} /></div>
                    <div style={S.pollVotes}>{votes} vote{votes !== 1 ? 's' : ''}{mine && <span style={{ color: 'var(--cv-accent-mid)', fontWeight: 'bold' }}> ✓</span>}</div>
                  </div>
                ) : (
                  <button onClick={() => handlePollVote(message._id, i)} style={S.pollBtn}>{opt.text || opt}</button>
                )}
              </div>
            );
          })}
        </div>
        <div style={S.pollFooter}>{total} vote{total !== 1 ? 's' : ''}</div>
      </div>
    );
  };

  // ── Quiz notification — UNCHANGED ─────────────────────────────────────────
  const handleJoinQuiz = (sessionId) => {
    socket.emit('student:joinQuiz', { sessionId });
    window.dispatchEvent(new CustomEvent('openWaitingRoom', { detail: { sessionId } }));
  };

  const renderQuizNotification = (message) => {
    const started = message.messageType === 'quiz_started';
    const ended   = message.messageType === 'quiz_ended';
    if (!started && !ended) return null;
    const { sessionId, quizTitle, winnerName, winnerScore } = message.metadata || {};
    return (
      <div style={S.quizBox}>
        {started && (
          <>
            <div style={S.quizHeader}><span style={{ fontSize: 24 }}>📝</span><span style={S.quizHeadText}>Quiz Started!</span></div>
            <div style={S.quizBody}><div style={S.quizName}>{quizTitle || 'New Quiz'}</div><div style={S.quizMsg}>Join now to participate! 🎮</div></div>
            <button onClick={() => sessionId && handleJoinQuiz(sessionId)} style={S.joinBtn}>Join Quiz</button>
          </>
        )}
        {ended && (
          <>
            <div style={S.quizHeader}><span style={{ fontSize: 24 }}>🎉</span><span style={S.quizHeadText}>Quiz Completed!</span></div>
            <div style={S.quizBody}>
              <div style={S.quizName}>{quizTitle || 'Quiz'}</div>
              {winnerName && (
                <div style={S.winnerRow}>
                  <span style={{ fontSize: 30 }}>🏆</span>
                  <div><div style={S.winnerName}>Top Scorer: {winnerName}</div><div style={S.winnerPts}>{winnerScore} points</div></div>
                </div>
              )}
              <div style={S.quizMsg}>Check your results in the quiz section</div>
            </div>
          </>
        )}
      </div>
    );
  };

  // ── File attachment — UNCHANGED ───────────────────────────────────────────
  const openFullscreen  = (u, t, n) => { setFullscreenMedia({ fileUrl: u, fileType: t, fileName: n }); setZoomLevel(1); };
  const closeFullscreen = ()         => { setFullscreenMedia(null); setZoomLevel(1); };
  const downloadFile    = (u, n)     => { const a = document.createElement('a'); a.href = u; a.download = n || 'download'; a.click(); };
  const zoomIn  = () => setZoomLevel(p => Math.min(p + 0.25, 3));
  const zoomOut = () => setZoomLevel(p => Math.max(p - 0.25, 0.5));
  const openPdf  = (u, n) => setPdfViewer({ fileUrl: u, fileName: n });
  const closePdf = ()     => setPdfViewer(null);

  const renderFile = (message) => {
    if (message.messageType !== 'file' || !message.fileUrl) return null;
    const ft  = message.fileType || '';
    const url = message.fileUrl.startsWith('http')
      ? message.fileUrl
      : `https://classvibe-backend.onrender.com${message.fileUrl}`;
    if (ft.startsWith('image/'))
      return <img src={url} alt={message.fileName || 'Image'} style={S.imgAttach} onClick={() => openFullscreen(url, ft, message.fileName)} />;
    if (ft.startsWith('video/'))
      return <div><video src={url} controls style={S.videoAttach} onClick={e => { e.stopPropagation(); openFullscreen(url, ft, message.fileName); }} /></div>;
    if (ft.startsWith('audio/'))
      return <div style={S.audioWrap}><span>🎵</span><audio src={url} controls style={{ flex: 1, height: 32 }} /></div>;
    if (ft === 'application/pdf' || message.fileName?.endsWith('.pdf'))
      return (
        <div>
          <div style={S.pdfPreview}>
            <span style={{ fontSize: 28 }}>📄</span>
            <div style={{ flex: 1 }}>
              <div style={S.pdfName}>{message.fileName || 'Document.pdf'}</div>
              <div style={S.pdfSize}>{Math.round((message.fileSize || 0) / 1024)} KB</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.pdfBtn} onClick={() => openPdf(url, message.fileName)}>View</button>
            <button style={S.pdfBtn} onClick={() => downloadFile(url, message.fileName)}>Download</button>
          </div>
        </div>
      );
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" style={S.docLink} onClick={e => e.stopPropagation()}>
        <span>📄</span><span>{message.fileName || 'Download File'}</span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>({Math.round((message.fileSize || 0) / 1024)} KB)</span>
      </a>
    );
  };

  // ── Filter ────────────────────────────────────────────────────────────────
  const searched = searchQuery.trim()
    ? messages.filter(m =>
        m.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.sender?.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.sender?.name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  // Teacher Moderated Chat — quick filters (All / Unread / per-student), reusing
  // the existing Message.readBy field. Applied on top of the search filter above.
  const isUnreadForTeacher = (m) =>
    m.sender && m.sender._id !== currentUserId &&
    !(m.readBy || []).some(r => (r.user?._id || r.user) === currentUserId);

  const moderatedStudents = useMemo(() => {
    if (!isAdmin || !moderatedChat) return [];
    const seen = new Map();
    messages.forEach(m => {
      if (m.sender && m.sender._id !== currentUserId && !seen.has(m.sender._id)) {
        seen.set(m.sender._id, m.sender);
      }
    });
    return [...seen.values()];
  }, [messages, isAdmin, moderatedChat, currentUserId]);

  // Counts shown on each chip — computed off `searched` so they stay
  // consistent with what clicking the chip actually reveals.
  const filterCounts = useMemo(() => {
    if (!isAdmin || !moderatedChat) return { all: 0, unread: 0, perStudent: {} };
    const perStudent = {};
    moderatedStudents.forEach(s => { perStudent[s._id] = 0; });
    let unread = 0;
    searched.forEach(m => {
      if (isUnreadForTeacher(m)) {
        unread++;
        if (perStudent[m.sender._id] !== undefined) perStudent[m.sender._id]++;
      }
    });
    return { all: searched.length, unread, perStudent };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, isAdmin, moderatedChat, moderatedStudents, currentUserId]);

  const visibleModeratedStudents = useMemo(() => {
    if (!studentSearch.trim()) return moderatedStudents;
    const q = studentSearch.trim().toLowerCase();
    return moderatedStudents.filter(s =>
      (s.name || '').toLowerCase().includes(q) || (s.username || '').toLowerCase().includes(q)
    );
  }, [moderatedStudents, studentSearch]);

  const filtered = useMemo(() => {
    if (!isAdmin || !moderatedChat || teacherFilter === 'all') return searched;
    if (teacherFilter === 'unread') return searched.filter(isUnreadForTeacher);
    // Per-student: that student's own messages plus anything addressed to them
    return searched.filter(m =>
      m.sender?._id === teacherFilter || m.recipient?._id === teacherFilter
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, isAdmin, moderatedChat, teacherFilter, currentUserId]);

  // ════════════════════════════════════════════════════════════════════════
  //  LEADERBOARD RENDERER
  //
  //  Always shows ▼ arrow when currentGroup exists (session is active)
  //  Collapsed  → ▼ arrow only
  //  Expanded   →
  //    quizInProgress = true  → "Loading for top 3 players..."
  //    leaderboardBar has data → show top 3 (most recent quiz)
  //    else                   → "No quiz completed in this session yet"
  // ════════════════════════════════════════════════════════════════════════
  const renderLeaderboard = () => {
    // Only show when inside a session
    if (!currentGroup) return null;

    if (lbCollapsed) {
      return (
        <div style={{ ...LB.arrowRow, backgroundColor: isDark?'#0f172a':'#f8fafc', borderBottom: isDark?'1px solid #334155':'1px solid #e2e8f0' }}>
          <button
            style={{ ...LB.arrowBtn, color: isDark?'#94a3b8':'#64748b', borderColor: isDark?'#334155':'#cbd5e1' }}
            onClick={() => setLbCollapsed(false)}
            title="Show leaderboard"
          >
            ▼
          </button>
        </div>
      );
    }

    // Expanded bar
    return (
      <div style={LB.bar}>
        <div style={LB.headerRow}>
          <span style={{ fontSize: 15 }}>🏆</span>
          <span style={LB.title}>Leaderboard of recent quiz</span>
          <button style={LB.collapseBtn} onClick={() => setLbCollapsed(true)} title="Hide">▼</button>
        </div>

        {/* State 1: Quiz currently in progress → loading */}
        {quizInProgress && (
          <div style={LB.statusRow}>
            <span style={LB.spinnerEmoji}>⏳</span>
            <span style={LB.statusText}>Loading for top 3 players...</span>
          </div>
        )}

        {/* State 2: Quiz finished, results available → top 3 */}
        {!quizInProgress && leaderboardBar && leaderboardBar.length > 0 && (
          <div style={LB.entries}>
            {leaderboardBar.map((entry, i) => (
              <div key={i} style={{ ...LB.entry, backgroundColor: i === 0 ? 'rgba(255,215,0,0.12)' : 'transparent' }}>
                <span style={{ fontSize: 16, width: 24, flexShrink: 0 }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                </span>
                <LbAvatar name={entry.name || entry.username} avatar={entry.avatar} size={22} />
                <span style={LB.entryName}>{entry.name || entry.username || `Player ${i + 1}`}</span>
                <span style={LB.entryScore}>+{entry.score} Points</span>
              </div>
            ))}
          </div>
        )}

        {/* State 3: No quiz started/completed yet */}
        {!quizInProgress && (!leaderboardBar || leaderboardBar.length === 0) && (
          <div style={LB.statusRow}>
            <span style={LB.statusText}>No quiz completed in this session yet</span>
          </div>
        )}
      </div>
    );
  };

  // ── Meta row ──────────────────────────────────────────────────────────────
  const recipientLabel = (message) => {
    if (!message.recipient) return null;
    if (message.recipient._id === currentUserId) return '🔒 Private reply';
    if (isAdmin || message.sender?._id === currentUserId) {
      return `🔒 to ${message.recipient.name || message.recipient.username || 'student'}`;
    }
    return null;
  };

  // Teacher Moderated Chat — student-facing delivery status for their own
  // private messages. `seenByTeacher` is a client-only flag set from the
  // 'messagesSeen' socket event (App.js); `readBy` covers the case where the
  // message was already read before this client loaded history.
  const deliveryStatus = (message) => {
    if (isAdmin || !moderatedChat || !message.recipient) return null;
    const teacherId = currentGroup?.admin?._id || currentGroup?.admin;
    const seen = message.seenByTeacher ||
      (message.readBy || []).some(r => (r.user?._id || r.user) === teacherId);
    return seen ? '✓✓ Seen by Teacher' : '✓ Sent to Teacher';
  };

  const renderMeta = (message) => {
    const isTeacher = message.sender?.role === 'teacher';
    const name      = message.sender?.name || message.sender?.username || 'Unknown';
    const recLabel  = recipientLabel(message);
    return (
      <div style={S.meta}>
        <span style={{ ...S.metaName, color: getAvatarColor(message.sender?.username) }}>{name}</span>
        {isTeacher && <span style={S.teacherBadge}>Teacher</span>}
        <span style={S.metaTime}>{formatTime(message.createdAt)}</span>
        {message.isEdited && !message.isDeleted && <span style={S.editedLabel}>(edited)</span>}
        {recLabel && <span style={S.recipientBadge}>{recLabel}</span>}
      </div>
    );
  };

  const renderEditUI = () => (
    <div>
      <input style={S.editInput} value={editText} onChange={e => setEditText(e.target.value)}
        onKeyPress={e => { if (e.key === 'Enter') saveEdit(); }}
        onKeyDown={e => { if (e.key === 'Escape') cancelEdit(); }}
        autoFocus
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button onClick={saveEdit}   style={S.saveBtn}>Save</button>
        <button onClick={cancelEdit} style={S.cancelBtn}>Cancel</button>
      </div>
    </div>
  );

  const renderContent = (message) => (
    <>
      {(message.messageType === 'quiz_started' || message.messageType === 'quiz_ended') && !message.isDeleted && renderQuizNotification(message)}
      {message.messageType === 'poll' && !message.isDeleted && renderPoll(message)}
      {message.messageType === 'file' && !message.isDeleted && renderFile(message)}
      {message.content && message.messageType !== 'poll' && message.messageType !== 'quiz_started' && message.messageType !== 'quiz_ended' && (
        <div style={{ ...S.msgText, color: isDark ? '#e2e8f0' : '#1e293b' }}>{message.isDeleted ? '🚫 This message was deleted' : message.content}</div>
      )}
    </>
  );

  // ════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ ...S.chatArea, backgroundColor: isDark ? '#0f172a' : S.chatArea.backgroundColor }}>

      {/* ── Leaderboard (arrow or expanded bar) ── */}
      {renderLeaderboard()}

      {/* ── Teacher Moderated Chat: student notice banner ── */}
      {moderatedChat && !isAdmin && (
        <div style={{ ...S.modNotice, backgroundColor: isDark?'#1e3a5f':'#eef2ff', borderBottom: isDark?'1px solid #3730a3':'1px solid #c7d2fe', color: isDark?'#a5b4fc':'#4f46e5' }}>
          🛡 Teacher Moderated Chat is enabled. Your messages are visible only to the teacher unless the teacher replies.
        </div>
      )}

      {/* ── Teacher Moderated Chat: quick filters ── */}
      {moderatedChat && isAdmin && (
        <div style={{ backgroundColor: isDark?'#0f172a':'#f8fafc', borderBottom: isDark?'1px solid #334155':'1px solid #e2e8f0' }}>
          {moderatedStudents.length > 5 && (
            <div style={S.modSearchRow}>
              <input
                type="text"
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
                placeholder="🔍 Search student..."
                style={{ ...S.modSearchInput, backgroundColor: isDark?'#1e293b':'#ffffff', color: isDark?'#e2e8f0':'#1e293b', borderColor: isDark?'#334155':'#e2e8f0' }}
              />
            </div>
          )}
          <div style={S.modFilterRow}>
            <span style={{ ...S.modFilterLabel, color: isDark?'#94a3b8':'#64748b' }}>🛡 Moderated:</span>
            <button onClick={() => setTeacherFilter('all')} style={{ ...S.modFilterChip, ...(teacherFilter==='all'?S.modFilterChipActive:{}) }}>
              All <span style={S.modFilterCount}>({filterCounts.all})</span>
            </button>
            <button onClick={() => setTeacherFilter('unread')} style={{ ...S.modFilterChip, ...(teacherFilter==='unread'?S.modFilterChipActive:{}) }}>
              Unread <span style={S.modFilterCount}>({filterCounts.unread})</span>
            </button>
            {visibleModeratedStudents.map(s => (
              <button key={s._id} onClick={() => setTeacherFilter(s._id)} style={{ ...S.modFilterChip, ...(teacherFilter===s._id?S.modFilterChipActive:{}) }}>
                {s.name || s.username} <span style={S.modFilterCount}>({filterCounts.perStudent[s._id] || 0})</span>
              </button>
            ))}
            {studentSearch.trim() && visibleModeratedStudents.length === 0 && (
              <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>No students match "{studentSearch}"</span>
            )}
          </div>
        </div>
      )}

      {/* ── Messages ── */}
      <div style={S.msgContainer} ref={messagesContainerRef} onScroll={handleScroll}>

        {filtered.length === 0 && !searchQuery && (
          <div style={S.empty}>
            <div style={{ fontSize: 52, marginBottom: 14, opacity: 0.35 }}>💬</div>
            <p style={{ fontSize: 16, fontWeight: '600', margin: '0 0 6px', color: '#64748b' }}>No messages yet</p>
            <p style={{ fontSize: 13, margin: 0, color: '#94a3b8' }}>Start the conversation! 👋</p>
          </div>
        )}
        {filtered.length === 0 && searchQuery && (
          <div style={S.empty}>
            <div style={{ fontSize: 52, marginBottom: 14, opacity: 0.35 }}>🔍</div>
            <p style={{ fontSize: 16, fontWeight: '600', margin: '0 0 6px', color: '#64748b' }}>No results</p>
            <p style={{ fontSize: 13, margin: 0, color: '#94a3b8' }}>Try a different search</p>
          </div>
        )}

        {filtered.map((message, index) => {
          const isOwn    = message.sender?._id === currentUserId;
          const isSys    = message.messageType === 'system';
          const showDate = needsDateSep(message, filtered[index - 1]);
          const editing  = editingMessageId === message._id;
          const isPoll   = message.messageType === 'poll';

          return (
            <React.Fragment key={message._id || `${index}-${message.createdAt}`}>
              {showDate && (
                <div style={S.dateSep}>
                  <span style={S.dateSepText}>{getDateLabel(message.createdAt)}</span>
                </div>
              )}
              <div
                style={{ ...S.msgRow, justifyContent: isSys ? 'center' : isOwn ? 'flex-end' : 'flex-start' }}
                onContextMenu={e => !isSys && !isPoll && handleContextMenu(e, message)}
              >
                {isSys && <div style={S.sysMsg}>{message.content}</div>}

                {/* Own message — RIGHT */}
                {!isSys && isOwn && (
                  <div style={S.ownRow}>
                    {/* Column: bubble + time row below (time outside bubble) */}
                    <div style={S.ownCol}>
                      <div style={{ ...S.bubble, backgroundColor: message.isDeleted ? (isDark?'#1e293b':'#f1f5f9') : ownBubbleColor.bg, borderColor: message.isDeleted ? (isDark?'#334155':'#e2e8f0') : ownBubbleColor.border, borderRadius: '12px 3px 12px 12px', opacity: message.isDeleted ? 0.65 : 1 }}>
                        {editing ? renderEditUI() : renderContent(message)}
                      </div>
                      {!editing && (
                        <div style={S.ownFooter}>
                          {recipientLabel(message) && <span style={S.recipientBadge}>{recipientLabel(message)}</span>}
                          {message.isEdited && !message.isDeleted && <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>(edited)</span>}
                          <span style={S.ownTime}>{formatTime(message.createdAt)}</span>
                          {deliveryStatus(message)
                            ? <span style={S.deliveryStatus}>{deliveryStatus(message)}</span>
                            : <span style={{ ...S.readTick, color: ownBubbleColor.tick }}>✓✓</span>}
                        </div>
                      )}
                    </div>
                    <LbAvatar
                      name={message.sender?.name || message.sender?.username}
                      avatar={message.sender?.avatar}
                      size={32}
                      style={{ alignSelf: 'flex-end' }}
                    />
                  </div>
                )}

                {/* Other's message — LEFT */}
                {!isSys && !isOwn && (() => {
                  const canReply = isAdmin && moderatedChat && message.sender && !message.isDeleted && typeof onReplyToStudent === 'function';
                  const isDragging = dragMsg?.id === message._id;
                  const dragDx = isDragging ? dragMsg.dx : 0;
                  return (
                    <div style={S.otherRow}>
                      <LbAvatar
                        name={message.sender?.name || message.sender?.username}
                        avatar={message.sender?.avatar}
                        size={32}
                        style={{ alignSelf: 'flex-start', marginTop: 20 }}
                      />
                      <div style={{ ...S.otherCol, position: 'relative' }}>
                        {renderMeta(message)}
                        {canReply && dragDx > 6 && (
                          <span style={{ ...S.replyDragIcon, opacity: Math.min(1, dragDx / REPLY_DRAG_THRESHOLD) }}>↩</span>
                        )}
                        <div
                          style={{ ...S.bubble, backgroundColor: message.isDeleted ? (isDark?'#1e293b':'#f1f5f9') : (isDark?'#1e3a5f':'#ffffff'), borderColor: isDark?'#334155':'#e2e8f0', borderRadius: '3px 12px 12px 12px', opacity: message.isDeleted ? 0.65 : 1, transform: dragDx ? `translateX(${dragDx}px)` : undefined, transition: isDragging ? 'none' : 'transform 0.2s ease', touchAction: canReply ? 'pan-y' : undefined, cursor: canReply ? 'grab' : undefined }}
                          onPointerDown={canReply ? handleReplyDragStart : undefined}
                          onPointerMove={canReply ? (e) => handleReplyDragMove(e, message) : undefined}
                          onPointerUp={canReply ? () => handleReplyDragEnd(message) : undefined}
                          onPointerCancel={canReply ? () => setDragMsg(null) : undefined}
                        >
                          {editing ? renderEditUI() : renderContent(message)}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </React.Fragment>
          );
        })}

        {typingUsers?.length > 0 && typingUsers.some(u => u?.trim()) && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 4, paddingLeft: 8 }}>
            <div style={S.typingBubble}>
              <span style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic' }}>
                {typingUsers.length === 1 ? `${typingUsers[0]} is typing` : `${typingUsers.length} people are typing`}
              </span>
              <div style={{ display: 'flex', gap: 3, marginLeft: 8, alignItems: 'center' }}>
                <span style={S.dot}/><span style={S.dot}/><span style={S.dot}/>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ══ Search overlay — floats over chat, triggered from Header 🔍 ══
          position:absolute so it OVERLAYS messages without pushing them down
          Toggled by window event 'toggleChatSearch' dispatched from Header.js
      ══════════════════════════════════════════════════════════════════ */}
      {showSearch && (
        <div style={{ ...S.searchOverlay, backgroundColor: isDark?'rgba(15,23,42,0.97)':'rgba(255,255,255,0.97)', borderBottom: isDark?'1px solid #334155':'1px solid #e2e8f0' }}>
          <span style={{ fontSize: 14, opacity: 0.5, flexShrink: 0 }}>🔍</span>
          <input
            type="text"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ ...S.searchInput, color: isDark?'#f1f5f9':'#1e293b' }}
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Escape') { setShowSearch(false); setSearchQuery(''); }
            }}
          />
          {searchQuery && (
            <>
              <button onClick={() => setSearchQuery('')} style={S.clearBtn}>✕</button>
              <span style={S.searchCount}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
            </>
          )}
          <button
            style={S.closeSearchBtn}
            onClick={() => { setShowSearch(false); setSearchQuery(''); }}
          >
            Close
          </button>
        </div>
      )}

      {showScrollButton && (
        <button style={S.scrollBtn} onClick={() => scrollToBottom()}>↓</button>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div style={{ ...S.ctxMenu, top: contextMenu.y, left: contextMenu.x }}>
          {isAdmin && moderatedChat && !contextMenu.isOwn && contextMenu.message.sender && !contextMenu.message.isDeleted && typeof onReplyToStudent === 'function' && (
            <div style={S.ctxItem} onClick={() => { onReplyToStudent(contextMenu.message.sender); setContextMenu(null); }}>↩️ Reply</div>
          )}
          <div style={S.ctxItem} onClick={() => copyMsg(contextMenu.message.content)}>📋 Copy</div>
          {contextMenu.isOwn && !contextMenu.message.isDeleted && (
            <>
              <div style={S.ctxItem} onClick={() => startEdit(contextMenu.message)}>✏️ Edit</div>
              <div style={{ ...S.ctxItem, color: '#ef4444' }} onClick={() => deleteMsg(contextMenu.message._id)}>🗑️ Delete</div>
            </>
          )}
        </div>
      )}

      {/* Fullscreen media viewer — UNCHANGED */}
      {fullscreenMedia && (
        <div style={S.fsOverlay}>
          <div style={S.fsHeader}>
            <button style={S.fsBtn} onClick={closeFullscreen}>✕ Close</button>
            <span style={{ fontSize: 14, fontWeight: '500', color: 'white' }}>{fullscreenMedia.fileName}</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {fullscreenMedia.fileType?.startsWith('image/') && (
                <>
                  <button style={S.fsBtn} onClick={zoomOut}>−</button>
                  <span style={{ fontSize: 13, color: 'white', minWidth: 46, textAlign: 'center' }}>{Math.round(zoomLevel * 100)}%</span>
                  <button style={S.fsBtn} onClick={zoomIn}>+</button>
                </>
              )}
              <button style={S.fsBtn} onClick={() => downloadFile(fullscreenMedia.fileUrl, fullscreenMedia.fileName)}>⬇ Download</button>
            </div>
          </div>
          <div style={S.fsContent}>
            {fullscreenMedia.fileType?.startsWith('image/')
              ? <img src={fullscreenMedia.fileUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transform: `scale(${zoomLevel})`, transition: 'transform 0.2s' }} />
              : fullscreenMedia.fileType?.startsWith('video/')
                ? <video src={fullscreenMedia.fileUrl} controls autoPlay style={{ maxWidth: '100%', maxHeight: '100%' }} />
                : null}
          </div>
        </div>
      )}

      {/* PDF viewer — UNCHANGED */}
      {pdfViewer && (
        <div style={S.fsOverlay}>
          <div style={S.fsHeader}>
            <span style={{ fontSize: 14, fontWeight: '500', color: 'white' }}>{pdfViewer.fileName}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={S.fsBtn} onClick={() => downloadFile(pdfViewer.fileUrl, pdfViewer.fileName)}>⬇ Download</button>
              <button style={S.fsBtn} onClick={closePdf}>✕ Close</button>
            </div>
          </div>
          <iframe src={pdfViewer.fileUrl} style={{ flex: 1, width: '100%', border: 'none' }} title={pdfViewer.fileName} />
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
//  LEADERBOARD STYLES
// ══════════════════════════════════════════════════════════════════════════
const LB = {
  arrowRow: { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4px 0 2px', flexShrink: 0 },
  arrowBtn: { background: 'none', border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 22px', cursor: 'pointer', color: '#64748b', fontSize: 12, lineHeight: 1.6 },
  bar:        { backgroundColor: '#0f172a', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 },
  headerRow:  { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', minHeight: 42 },
  title:      { flex: 1, fontSize: 11, fontWeight: '700', color: '#94a3b8', letterSpacing: '0.6px', textTransform: 'uppercase' },
  collapseBtn:{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 11, padding: '4px 8px', borderRadius: 4, lineHeight: 1 },
  entries:    { padding: '2px 16px 12px', display: 'flex', flexDirection: 'column', gap: 2 },
  entry:      { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 6 },
  entryName:  { flex: 1, fontSize: 13, fontWeight: '600', color: '#e2e8f0' },
  entryScore: { fontSize: 12, fontWeight: '700', color: '#22c55e', whiteSpace: 'nowrap' },
  // Status rows (loading / no-data)
  statusRow:  { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 14px' },
  statusText: { fontSize: 13, color: '#64748b', fontStyle: 'italic' },
  spinnerEmoji:{ fontSize: 16 },
};

// ══════════════════════════════════════════════════════════════════════════
//  MAIN STYLES
// ══════════════════════════════════════════════════════════════════════════
const S = {
  chatArea: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#f8fafc', position: 'relative' },

  // ── Search overlay — absolute, floats over messages ──
  // Triggered via window event from Header's 🔍 button
  searchOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 16px',
    backgroundColor: 'rgba(255,255,255,0.97)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    borderBottom: '1px solid #e2e8f0',
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
  },
  searchInput:  { flex: 1, padding: '6px 4px', fontSize: 13, border: 'none', outline: 'none', backgroundColor: 'transparent', color: '#1e293b' },
  clearBtn:     { background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', color: '#94a3b8', padding: '2px 4px', flexShrink: 0 },
  searchCount:  { fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', fontWeight: '500', flexShrink: 0 },
  closeSearchBtn:{ padding: '5px 12px', fontSize: 12, fontWeight: '600', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },

  // ── Teacher Moderated Chat ──
  modNotice:    { padding: '8px 16px', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  modSearchRow: { padding: '8px 16px 0' },
  modSearchInput: { width: '100%', padding: '6px 10px', fontSize: 12, border: '1px solid', borderRadius: 8, outline: 'none', boxSizing: 'border-box' },
  modFilterRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', overflowX: 'auto', flexWrap: 'wrap' },
  modFilterLabel: { fontSize: 12, fontWeight: '700', flexShrink: 0 },
  modFilterChip: { padding: '4px 11px', fontSize: 12, fontWeight: '600', border: '1px solid #e2e8f0', borderRadius: 20, cursor: 'pointer', backgroundColor: 'transparent', color: '#64748b', whiteSpace: 'nowrap', flexShrink: 0 },
  modFilterChipActive: { backgroundColor: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe' },
  modFilterCount: { opacity: 0.7, fontWeight: '500' },
  replyDragIcon: { position: 'absolute', left: -26, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: '#4f46e5', pointerEvents: 'none' },
  deliveryStatus: { fontSize: 10, color: '#94a3b8', fontWeight: '500' },

  msgContainer: { flex: 1, overflowY: 'auto', padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 2 },
  empty:        { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' },
  dateSep:      { display: 'flex', justifyContent: 'center', margin: '16px 0 10px' },
  dateSepText:  { backgroundColor: '#e2e8f0', color: '#64748b', padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: '600' },
  msgRow:       { display: 'flex', width: '100%', marginBottom: 8 },
  sysMsg:       { padding: '5px 16px', backgroundColor: '#e2e8f0', color: '#475569', borderRadius: 20, fontSize: 12, fontStyle: 'italic', textAlign: 'center', margin: '0 auto', maxWidth: '70%' },
  ownRow:       { display: 'flex', alignItems: 'flex-end', gap: 8, maxWidth: '70%' },
  ownCol:       { display: 'flex', flexDirection: 'column', gap: 3 },
  otherRow:     { display: 'flex', alignItems: 'flex-start', gap: 10, maxWidth: '70%' },
  otherCol:     { display: 'flex', flexDirection: 'column', gap: 3, flex: 1 },
  meta:         { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingLeft: 2 },
  metaName:     { fontSize: 13, fontWeight: '700', lineHeight: 1 },
  teacherBadge: { fontSize: 10, fontWeight: '600', color: '#92400e', backgroundColor: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 4, padding: '1px 6px' },
  metaTime:     { fontSize: 11, color: '#94a3b8' },
  editedLabel:  { fontSize: 11, color: '#94a3b8', fontStyle: 'italic' },
  recipientBadge: { fontSize: 10, fontWeight: '600', color: '#4f46e5', backgroundColor: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 4, padding: '1px 6px' },
  bubble:       { padding: '10px 13px', border: '1px solid', wordWrap: 'break-word', position: 'relative', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', maxWidth: '100%' },
  ownFooter:    { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingRight: 2 },
  ownTime:      { fontSize: 11, color: '#94a3b8' },
  readTick:     { fontSize: 11 },
  editInput:    { width: '100%', padding: '7px 10px', fontSize: 14, border: '1px solid #c7d2fe', borderRadius: 6, outline: 'none', backgroundColor: '#fff', boxSizing: 'border-box' },
  saveBtn:      { padding: '5px 14px', fontSize: 12, fontWeight: '600', backgroundColor: 'var(--cv-accent-mid)', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer' },
  cancelBtn:    { padding: '5px 14px', fontSize: 12, fontWeight: '600', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 5, cursor: 'pointer' },
  msgText:      { fontSize: 14, lineHeight: '21px', color: '#1e293b', wordBreak: 'break-word' },
  typingBubble: { display: 'flex', alignItems: 'center', padding: '8px 14px', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '3px 12px 12px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  dot:          { display: 'inline-block', width: 5, height: 5, backgroundColor: '#94a3b8', borderRadius: '50%', animation: 'bounce 1.4s infinite ease-in-out both' },
  scrollBtn:    { position: 'absolute', bottom: 16, right: 16, width: 36, height: 36, borderRadius: '50%', backgroundColor: 'var(--cv-accent-mid)', color: 'white', border: 'none', fontSize: 18, cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.3)', zIndex: 10 },
  ctxMenu:      { position: 'fixed', backgroundColor: 'white', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '6px 0', zIndex: 1000, minWidth: 150, border: '1px solid #f1f5f9' },
  ctxItem:      { padding: '10px 16px', fontSize: 13, cursor: 'pointer', color: '#374151' },

  pollContainer: { padding: '2px 0' },
  pollHeader:    { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 18 },
  pollQuestion:  { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  pollOptions:   { display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 8 },
  pollBtn:       { width: '100%', padding: '9px 13px', fontSize: 13, backgroundColor: '#f1f5f9', color: '#1e293b', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontWeight: '500', textAlign: 'left' },
  pollResult:    { padding: '9px 12px', borderRadius: 7, backgroundColor: 'white' },
  pollResultTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  pollOptText:   { fontSize: 13, color: '#1e293b', fontWeight: '500' },
  pollPct:       { fontSize: 12, fontWeight: '700', color: 'var(--cv-accent-mid)' },
  pollBar:       { width: '100%', height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
  pollFill:      { height: '100%', transition: 'width 0.3s' },
  pollVotes:     { fontSize: 11, color: '#64748b' },
  pollFooter:    { fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginTop: 4 },
  pollError:     { fontSize: 12, color: '#ef4444', fontStyle: 'italic' },

  quizBox:      { padding: '12px 14px', backgroundColor: 'rgba(79,70,229,0.06)', borderRadius: 10, border: '1.5px solid #c7d2fe' },
  quizHeader:   { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  quizHeadText: { fontSize: 15, fontWeight: '700', color: '#4f46e5' },
  quizBody:     { marginBottom: 10 },
  quizName:     { fontSize: 14, fontWeight: '600', color: '#1e293b', marginBottom: 5 },
  quizMsg:      { fontSize: 13, color: '#64748b' },
  joinBtn:      { width: '100%', padding: 10, fontSize: 14, fontWeight: '700', backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' },
  winnerRow:    { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', backgroundColor: 'rgba(255,215,0,0.1)', borderRadius: 8, marginBottom: 8, border: '1px solid rgba(255,215,0,0.25)' },
  winnerName:   { fontSize: 13, fontWeight: '600', color: '#1e293b', marginBottom: 3 },
  winnerPts:    { fontSize: 12, color: '#64748b' },

  imgAttach:  { maxWidth: '100%', maxHeight: 260, borderRadius: 8, cursor: 'pointer', display: 'block', marginBottom: 4 },
  videoAttach:{ maxWidth: '100%', maxHeight: 260, borderRadius: 8 },
  audioWrap:  { display: 'flex', alignItems: 'center', gap: 10, padding: 8, backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: 20 },
  pdfPreview: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: 8, marginBottom: 6, border: '1px solid #e2e8f0' },
  pdfName:    { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  pdfSize:    { fontSize: 11, color: '#64748b' },
  pdfBtn:     { flex: 1, padding: 7, fontSize: 12, fontWeight: '600', backgroundColor: 'var(--cv-accent-mid)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' },
  docLink:    { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: 8, textDecoration: 'none', color: '#1e293b', border: '1px solid #e2e8f0' },

  fsOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 2000, display: 'flex', flexDirection: 'column' },
  fsHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', backgroundColor: 'rgba(0,0,0,0.7)' },
  fsBtn:     { padding: '7px 12px', fontSize: 13, backgroundColor: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, cursor: 'pointer' },
  fsContent: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: 20 },
};

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
  `;
  document.head.appendChild(style);
}

export default ChatArea;