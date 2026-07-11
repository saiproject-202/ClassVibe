// frontend/src/components/FloatingQuizButton.jsx
// Draggable floating quiz button
// Teacher: opens QuizControlPanel (create / control)
// Student: joins active quiz (waiting room / player)

import React, { useState, useEffect, useRef, useCallback } from 'react';
import QuizControlPanel from './QuizControlPanel';

const API = process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com';

const FloatingQuizButton = ({
  groupId,
  isTeacher,
  onCreateQuiz,   // called when teacher wants to build a new quiz
  onJoinQuiz,     // called with sessionId when student joins
  socket
}) => {
  // ── Quiz session state ────────────────────────────────────────────
  const [quizSession, setQuizSession] = useState(null);
  const [pulse, setPulse] = useState(false);

  // ── Control-panel visibility (teacher) ───────────────────────────
  const [showControlPanel, setShowControlPanel] = useState(false);

  // ── Draggable state ───────────────────────────────────────────────
  // Start position: bottom-right corner
  const [pos, setPos] = useState({ x: window.innerWidth - 120, y: window.innerHeight - 200 });
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const buttonRef = useRef(null);
  const moved = useRef(false); // distinguish drag from click

  // ── Fetch active quiz ─────────────────────────────────────────────
  const checkActiveQuiz = useCallback(async () => {
    if (!groupId) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const res = await fetch(`${API}/api/quiz/group/${groupId}/active`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        // Server returned HTML error page — silently ignore
        return;
      }
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          console.warn('FloatingQuizButton: auth error', res.status);
        }
        return;
      }

      const data = await res.json();
      if (data.session) {
        setQuizSession(data.session);
      } else {
        setQuizSession(null);
      }
    } catch (err) {
      // Network errors are non-fatal for this button
      console.warn('FloatingQuizButton checkActiveQuiz:', err.message);
    }
  }, [groupId]);

  // ── Socket listeners ──────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !groupId) return;

    const onQuizStarted = (data) => {
      setQuizSession({ status: 'waiting', ...data });
      setPulse(true);
      setTimeout(() => setPulse(false), 2500);
    };

    const onQuizBegan = (data) => {
      setQuizSession(prev => prev ? { ...prev, status: 'active' } : { status: 'active', ...data });
    };

    const onQuizEnded = () => {
      setQuizSession(null);
      setShowControlPanel(false);
    };

    const onParticipantJoined = (data) => {
      setQuizSession(prev => {
        if (!prev) return prev;
        const existing = prev.participants || [];
        if (existing.find(p => p.userId === data.userId)) return prev;
        return { ...prev, participants: [...existing, data] };
      });
    };

    socket.on('quiz:started', onQuizStarted);
    socket.on('quizStarted', onQuizStarted);     // backend may emit either name
    socket.on('quizBegan', onQuizBegan);
    socket.on('quiz:ended', onQuizEnded);
    socket.on('quizEnded', onQuizEnded);
    socket.on('participantJoined', onParticipantJoined);

    checkActiveQuiz();

    return () => {
      socket.off('quiz:started', onQuizStarted);
      socket.off('quizStarted', onQuizStarted);
      socket.off('quizBegan', onQuizBegan);
      socket.off('quiz:ended', onQuizEnded);
      socket.off('quizEnded', onQuizEnded);
      socket.off('participantJoined', onParticipantJoined);
    };
  }, [socket, groupId, checkActiveQuiz]);

  // ── Listen for waitingRoom open event from ChatArea ───────────────
  useEffect(() => {
    const handler = (e) => {
      if (onJoinQuiz) onJoinQuiz(e.detail.sessionId);
    };
    window.addEventListener('openWaitingRoom', handler);
    return () => window.removeEventListener('openWaitingRoom', handler);
  }, [onJoinQuiz]);

  // ── Draggable mouse handlers ──────────────────────────────────────
  const onMouseDown = (e) => {
    // Only drag on left mouse button; ignore right-click
    if (e.button !== 0) return;
    moved.current = false;
    dragging.current = true;
    dragOffset.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y
    };
    e.preventDefault();
  };

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragging.current) return;
      moved.current = true;
      const SIZE = 96;
      const newX = Math.max(0, Math.min(window.innerWidth - SIZE, e.clientX - dragOffset.current.x));
      const newY = Math.max(0, Math.min(window.innerHeight - SIZE, e.clientY - dragOffset.current.y));
      setPos({ x: newX, y: newY });
    };

    const onMouseUp = () => { dragging.current = false; };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // ── Touch drag support ────────────────────────────────────────────
  const onTouchStart = (e) => {
    moved.current = false;
    dragging.current = true;
    const touch = e.touches[0];
    dragOffset.current = { x: touch.clientX - pos.x, y: touch.clientY - pos.y };
  };

  const onTouchMove = (e) => {
    if (!dragging.current) return;
    moved.current = true;
    const touch = e.touches[0];
    const SIZE = 96;
    const newX = Math.max(0, Math.min(window.innerWidth - SIZE, touch.clientX - dragOffset.current.x));
    const newY = Math.max(0, Math.min(window.innerHeight - SIZE, touch.clientY - dragOffset.current.y));
    setPos({ x: newX, y: newY });
    e.preventDefault();
  };

  const onTouchEnd = () => { dragging.current = false; };

  // ── Student join helper (declared BEFORE handleClick) ─────────────
  const handleStudentJoin = useCallback((sessionId) => {
    if (!socket) return;
    socket.emit('student:joinQuiz', { sessionId });
    if (onJoinQuiz) onJoinQuiz(sessionId);
  }, [socket, onJoinQuiz]);

  // ── Click handler ─────────────────────────────────────────────────
  const handleClick = () => {
    // If the user dragged (not a click), ignore
    if (moved.current) return;

    if (isTeacher) {
      // Teacher: open control panel if quiz exists, else open quiz builder
      if (quizSession) {
        setShowControlPanel(true);
      } else {
        onCreateQuiz?.(null);
      }
    } else {
      // Student
      if (quizSession) {
        handleStudentJoin(quizSession._id || quizSession.sessionId);
      } else {
        alert('📝 No quiz available right now!\n\nWait for your teacher to create and publish a quiz.');
      }
    }
  };

  // ── Button appearance ─────────────────────────────────────────────
  const getContent = () => {
    if (!quizSession) {
      return {
        emoji: '🎮',
        text: isTeacher ? 'Create' : 'Quiz',
        subtext: isTeacher ? 'AI Quiz' : 'Ready?',
        color: '#9C27B0',
        shadow: 'rgba(156,39,176,.55)'
      };
    }
    if (quizSession.status === 'active') {
      return {
        emoji: '🔥',
        text: 'LIVE',
        subtext: isTeacher ? 'Control' : 'Join Now!',
        color: '#E53935',
        shadow: 'rgba(229,57,53,.55)'
      };
    }
    if (quizSession.status === 'waiting') {
      const count = quizSession.participants?.length || 0;
      return {
        emoji: '⏳',
        text: 'Waiting',
        subtext: isTeacher ? `${count} joined` : 'Join Now',
        color: '#F57C00',
        shadow: 'rgba(245,124,0,.55)'
      };
    }
    return {
      emoji: '🎮', text: 'Quiz', subtext: 'Ready',
      color: '#9C27B0', shadow: 'rgba(156,39,176,.55)'
    };
  };

  const c = getContent();
  const participantCount = quizSession?.participants?.length || 0;

  return (
    <>
      {/* ── Floating button ─────────────────────────────────────── */}
      <div
        ref={buttonRef}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={handleClick}
        title={isTeacher ? (quizSession ? 'Open Quiz Control Panel' : 'Create New Quiz') : (quizSession ? 'Join Quiz' : 'No quiz active')}
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          width: 88,
          height: 88,
          borderRadius: '50%',
          backgroundColor: c.color,
          boxShadow: pulse
            ? `0 0 0 8px ${c.shadow}, 0 6px 24px ${c.shadow}`
            : `0 4px 18px ${c.shadow}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: dragging.current ? 'grabbing' : 'grab',
          zIndex: 1200,
          border: '4px solid white',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          transition: pulse ? 'box-shadow .2s' : 'box-shadow .3s, background-color .3s',
          animation: pulse ? 'fbPulse 1s ease-in-out 2' : 'fbFloat 3s ease-in-out infinite'
        }}
      >
        <style>{`
          @keyframes fbFloat {
            0%,100% { transform: translateY(0px); }
            50%      { transform: translateY(-8px); }
          }
          @keyframes fbPulse {
            0%,100% { transform: scale(1); }
            50%      { transform: scale(1.12); }
          }
        `}</style>

        <div style={{ fontSize: 30, lineHeight: 1, marginBottom: 2, pointerEvents: 'none' }}>{c.emoji}</div>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'white', letterSpacing: 1, pointerEvents: 'none' }}>{c.text}</div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.95)', fontWeight: 600, pointerEvents: 'none' }}>{c.subtext}</div>

        {/* Participant badge */}
        {participantCount > 0 && (
          <div style={{
            position: 'absolute', top: -6, right: -6,
            backgroundColor: '#E53935', color: 'white',
            borderRadius: '50%', width: 26, height: 26,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800, border: '2px solid white',
            boxShadow: '0 2px 6px rgba(0,0,0,.25)', pointerEvents: 'none'
          }}>
            {participantCount > 99 ? '99+' : participantCount}
          </div>
        )}

        {/* Drag hint tooltip (shows only when no quiz active) */}
        {!quizSession && (
          <div style={{
            position: 'absolute', bottom: -26, left: '50%',
            transform: 'translateX(-50%)', fontSize: 9,
            color: 'rgba(255,255,255,.7)', whiteSpace: 'nowrap',
            pointerEvents: 'none', fontWeight: 500
          }}>
            drag to move
          </div>
        )}
      </div>

      {/* ── Teacher: Quiz Control Panel ──────────────────────────── */}
      {isTeacher && showControlPanel && (
        <QuizControlPanel
          groupId={groupId}
          onClose={() => setShowControlPanel(false)}
          onStartQuiz={() => {
            setShowControlPanel(false);
            onCreateQuiz?.(null);
          }}
        />
      )}
    </>
  );
};

export default FloatingQuizButton;