// src/components/PollComponent.js
// ✅ STYLING UPDATE — matches new indigo/slate design language
//
// CHANGES: Visual redesign only — ALL socket logic and poll functionality UNCHANGED
//   - Clean white cards with subtle borders
//   - Indigo (var(--cv-accent-mid)) instead of old green accent
//   - Results shown with progress bars
//   - Open answer textarea styled properly
//   - Create poll form matches MessageInput card style

import React, { useState, useEffect } from 'react';
import socket from '../socket';

const PollComponent = ({ groupId, currentUserId, isAdmin }) => {
  const [polls,          setPolls]          = useState([]);
  const [showCreate,     setShowCreate]     = useState(false);
  const [pollType,       setPollType]       = useState('mcq');
  const [question,       setQuestion]       = useState('');
  const [options,        setOptions]        = useState(['', '', '', '']);
  const [creating,       setCreating]       = useState(false);
  const [error,          setError]          = useState('');
  const [answers,        setAnswers]        = useState({});   // per-poll open answers

  // ── Load polls via socket — UNCHANGED ────────────────────────────────────
  useEffect(() => {
    if (!groupId) return;

    socket.emit('getPolls', { groupId });

    const onPollsUpdate = (data) => setPolls(data.polls || []);
    const onNewPoll     = (poll) => setPolls(prev => [poll, ...prev]);
    const onPollUpdated = (updated) =>
      setPolls(prev => prev.map(p => p._id === updated._id ? updated : p));

    socket.on('pollsUpdate', onPollsUpdate);
    socket.on('newPoll',     onNewPoll);
    socket.on('pollUpdated', onPollUpdated);

    return () => {
      socket.off('pollsUpdate', onPollsUpdate);
      socket.off('newPoll',     onNewPoll);
      socket.off('pollUpdated', onPollUpdated);
    };
  }, [groupId]);

  // ── Create poll — UNCHANGED ────────────────────────────────────────────────
  const handleCreatePoll = () => {
    setError('');
    if (!question.trim()) { setError('Question is required'); return; }
    if (pollType !== 'open') {
      const valid = options.filter(o => o.trim());
      if (valid.length < 2) { setError('At least 2 options required'); return; }
    }
    setCreating(true);
    socket.emit('createPoll', {
      groupId,
      pollType,
      question: question.trim(),
      options:
        pollType === 'yesno' ? [{ text: 'Yes' }, { text: 'No' }] :
        pollType === 'mcq'   ? options.filter(Boolean).map(text => ({ text })) :
        []
    });
    setTimeout(() => {
      setQuestion(''); setOptions(['', '', '', '']); setPollType('mcq');
      setShowCreate(false); setCreating(false);
    }, 400);
  };

  // ── Poll actions — UNCHANGED ───────────────────────────────────────────────
  const handleVote          = (pollId, idx)  => socket.emit('votePoll', { pollId, optionIndex: idx });
  const handleSubmitAnswer  = (pollId)        => {
    const ans = answers[pollId];
    if (!ans?.trim()) return;
    socket.emit('answerPoll', { pollId, answer: ans.trim() });
    setAnswers(prev => ({ ...prev, [pollId]: '' }));
  };
  const handleClosePoll = (pollId) => {
    if (window.confirm('Close this poll? Students can no longer vote.'))
      socket.emit('closePoll', { pollId });
  };

  // ── Helpers — UNCHANGED ────────────────────────────────────────────────────
  const hasVoted = (poll) =>
    poll.options?.some(opt =>
      opt.votedBy?.some(id => String(id._id || id) === String(currentUserId))
    );

  const hasAnswered = (poll) =>
    poll.answers?.some(a => String(a.user?._id || a.user) === String(currentUserId));

  const getTotalVotes = (poll) =>
    poll.options?.reduce((s, o) => s + (o.votedBy?.length || 0), 0) || 0;

  const getPct = (opt, total) =>
    total > 0 ? Math.round(((opt.votedBy?.length || 0) / total) * 100) : 0;

  // ════════════════════════════════════════════════════════════════════════
  return (
    <div style={S.container}>

      {/* ── Header ── */}
      <div style={S.header}>
        <h2 style={S.title}>📊 Polls & Questions</h2>
        {isAdmin && (
          <button
            onClick={() => setShowCreate(v => !v)}
            style={{ ...S.btn, ...(showCreate ? S.btnSecondary : S.btnPrimary) }}
          >
            {showCreate ? '✕ Cancel' : '+ Create Poll'}
          </button>
        )}
      </div>

      {/* ── Create Poll Form ── */}
      {isAdmin && showCreate && (
        <div style={S.createCard}>
          <h3 style={S.createTitle}>New Poll</h3>

          {/* Type selector */}
          <div style={S.fieldGroup}>
            <label style={S.label}>Poll Type</label>
            <div style={S.typeRow}>
              {[['mcq', 'Multiple Choice'], ['yesno', 'Yes / No'], ['open', 'Open Answer']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setPollType(val)}
                  style={{ ...S.typeBtn, ...(pollType === val ? S.typeBtnActive : {}) }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Question */}
          <div style={S.fieldGroup}>
            <label style={S.label}>Question *</label>
            <input
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Ask the class a question..."
              style={S.input}
              maxLength={200}
            />
          </div>

          {/* MCQ options */}
          {pollType === 'mcq' && (
            <div style={S.fieldGroup}>
              <label style={S.label}>Options *</label>
              {options.map((opt, i) => (
                <input
                  key={i}
                  value={opt}
                  onChange={e => { const copy = [...options]; copy[i] = e.target.value; setOptions(copy); }}
                  placeholder={`Option ${i + 1}`}
                  style={{ ...S.input, marginBottom: 8 }}
                  maxLength={100}
                />
              ))}
            </div>
          )}

          {error && <p style={S.errorText}>{error}</p>}

          <div style={S.formFooter}>
            <button onClick={() => setShowCreate(false)} style={S.btnSecondary}>Cancel</button>
            <button onClick={handleCreatePoll} disabled={creating} style={S.btnPrimary}>
              {creating ? 'Creating…' : 'Create Poll'}
            </button>
          </div>
        </div>
      )}

      {/* ── Poll list ── */}
      {polls.length === 0 && (
        <div style={S.empty}>
          <div style={{ fontSize: 40, marginBottom: 10, opacity: 0.3 }}>📊</div>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>No polls yet</p>
          {isAdmin && <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Create one above to engage your class</p>}
        </div>
      )}

      {polls.map(poll => {
        const total    = getTotalVotes(poll);
        const voted    = hasVoted(poll);
        const answered = hasAnswered(poll);

        return (
          <div key={poll._id} style={{ ...S.pollCard, ...(poll.isActive ? {} : S.pollCardClosed) }}>

            {/* Poll header */}
            <div style={S.pollCardHeader}>
              <div style={S.pollMeta}>
                <span style={{ ...S.typePill, ...(poll.isActive ? S.typePillActive : S.typePillClosed) }}>
                  {poll.isActive ? '● Active' : '✓ Closed'}
                </span>
                <span style={S.pollTypePill}>
                  {poll.pollType === 'yesno' ? 'Yes/No' : poll.pollType === 'open' ? 'Open' : 'MCQ'}
                </span>
              </div>
              {isAdmin && poll.isActive && (
                <button onClick={() => handleClosePoll(poll._id)} style={S.closeBtn}>Close</button>
              )}
            </div>

            <p style={S.pollQuestion}>{poll.question}</p>

            {/* MCQ / Yes-No voting */}
            {(poll.pollType === 'mcq' || poll.pollType === 'yesno') && (
              <div style={S.optionsList}>
                {poll.options?.map((opt, i) => (
                  <div key={i} style={S.optionWrap}>
                    {(!voted && poll.isActive) ? (
                      /* Unvoted → show vote button */
                      <button onClick={() => handleVote(poll._id, i)} style={S.voteBtn}>
                        {opt.text}
                      </button>
                    ) : (
                      /* Voted or closed → show result bar */
                      <div style={S.resultRow}>
                        <div style={S.resultLabel}>
                          <span style={S.optText}>{opt.text}</span>
                          <span style={S.optPct}>{getPct(opt, total)}%</span>
                        </div>
                        <div style={S.barTrack}>
                          <div style={{ ...S.barFill, width: `${getPct(opt, total)}%` }} />
                        </div>
                        <span style={S.voteCount}>{opt.votedBy?.length || 0} vote{(opt.votedBy?.length || 0) !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                  </div>
                ))}
                <div style={S.totalVotes}>{total} total vote{total !== 1 ? 's' : ''}</div>
              </div>
            )}

            {/* Open answer */}
            {poll.pollType === 'open' && (
              <div>
                {!answered && poll.isActive ? (
                  <div style={S.openAnswerWrap}>
                    <textarea
                      value={answers[poll._id] || ''}
                      onChange={e => setAnswers(p => ({ ...p, [poll._id]: e.target.value }))}
                      placeholder="Type your answer..."
                      style={S.textarea}
                      rows={3}
                      maxLength={500}
                    />
                    <button onClick={() => handleSubmitAnswer(poll._id)} style={S.btnPrimary}>
                      Submit Answer
                    </button>
                  </div>
                ) : (
                  <p style={S.answeredMsg}>
                    {answered ? '✅ Your answer was submitted' : 'This poll is now closed'}
                  </p>
                )}

                {/* Show all answers if admin */}
                {isAdmin && poll.answers?.length > 0 && (
                  <div style={S.answersList}>
                    <p style={S.answersTitle}>{poll.answers.length} answer{poll.answers.length !== 1 ? 's' : ''}:</p>
                    {poll.answers.map((a, i) => (
                      <div key={i} style={S.answerItem}>
                        <span style={S.answerAuthor}>{a.user?.name || a.user?.username || 'Student'}</span>
                        <span style={S.answerText}>{a.answer}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
//  STYLES — indigo/slate palette
// ══════════════════════════════════════════════════════════════════════════
const S = {
  container: { padding: 20, maxWidth: 680, margin: '0 auto' },

  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title:  { margin: 0, fontSize: 20, fontWeight: '800', color: '#0f172a' },

  // Buttons
  btn:          { padding: '8px 16px', fontSize: 13, fontWeight: '600', border: 'none', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s' },
  btnPrimary:   { padding: '8px 16px', fontSize: 13, fontWeight: '700', backgroundColor: 'var(--cv-accent-mid)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' },
  btnSecondary: { padding: '8px 16px', fontSize: 13, fontWeight: '600', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer' },

  // Create card
  createCard: { backgroundColor: 'white', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' },
  createTitle:{ margin: '0 0 16px', fontSize: 16, fontWeight: '700', color: '#1e293b' },
  fieldGroup: { marginBottom: 14 },
  label:      { display: 'block', fontSize: 12, fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 },
  input:      { width: '100%', padding: '10px 12px', fontSize: 14, border: '1.5px solid #e2e8f0', borderRadius: 8, outline: 'none', color: '#1e293b', boxSizing: 'border-box' },
  typeRow:    { display: 'flex', gap: 8 },
  typeBtn:    { padding: '7px 14px', fontSize: 13, fontWeight: '500', backgroundColor: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', flex: 1 },
  typeBtnActive: { backgroundColor: '#eef2ff', color: '#4f46e5', borderColor: '#c7d2fe', fontWeight: '700' },
  errorText:  { fontSize: 12, color: '#ef4444', margin: '4px 0 0' },
  formFooter: { display: 'flex', gap: 10, marginTop: 16 },

  // Poll cards
  pollCard: { backgroundColor: 'white', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: 18, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' },
  pollCardClosed: { opacity: 0.75 },
  pollCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  pollMeta:   { display: 'flex', gap: 8, alignItems: 'center' },
  typePill:   { fontSize: 11, fontWeight: '700', padding: '3px 8px', borderRadius: 20 },
  typePillActive: { backgroundColor: '#dcfce7', color: '#15803d' },
  typePillClosed: { backgroundColor: '#f1f5f9', color: '#64748b' },
  pollTypePill:{ fontSize: 11, fontWeight: '600', color: 'var(--cv-accent-mid)', backgroundColor: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 20, padding: '2px 8px' },
  closeBtn:   { padding: '4px 10px', fontSize: 12, fontWeight: '600', backgroundColor: '#fee2e2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer' },
  pollQuestion:{ fontSize: 15, fontWeight: '600', color: '#1e293b', margin: '0 0 14px', lineHeight: 1.4 },

  // Options
  optionsList:{ display: 'flex', flexDirection: 'column', gap: 8 },
  optionWrap: {},
  voteBtn:    { width: '100%', padding: '10px 14px', fontSize: 14, fontWeight: '500', backgroundColor: '#f8fafc', color: '#1e293b', border: '1.5px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s' },
  resultRow:  { display: 'flex', flexDirection: 'column', gap: 4 },
  resultLabel:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  optText:    { fontSize: 13, fontWeight: '500', color: '#1e293b' },
  optPct:     { fontSize: 12, fontWeight: '700', color: 'var(--cv-accent-mid)' },
  barTrack:   { width: '100%', height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden' },
  barFill:    { height: '100%', backgroundColor: 'var(--cv-accent-mid)', borderRadius: 3, transition: 'width 0.4s ease' },
  voteCount:  { fontSize: 11, color: '#94a3b8' },
  totalVotes: { fontSize: 12, color: '#64748b', marginTop: 6, textAlign: 'right', fontStyle: 'italic' },

  // Open answer
  openAnswerWrap: { display: 'flex', flexDirection: 'column', gap: 10 },
  textarea:   { width: '100%', padding: '10px 12px', fontSize: 14, border: '1.5px solid #e2e8f0', borderRadius: 8, outline: 'none', resize: 'vertical', color: '#1e293b', boxSizing: 'border-box', fontFamily: 'inherit' },
  answeredMsg:{ fontSize: 13, color: '#64748b', margin: '4px 0', fontStyle: 'italic' },
  answersList:{ marginTop: 12, borderTop: '1px solid #f1f5f9', paddingTop: 12 },
  answersTitle:{ fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 8px' },
  answerItem: { display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: 8, marginBottom: 6 },
  answerAuthor:{ fontSize: 11, fontWeight: '700', color: 'var(--cv-accent-mid)' },
  answerText: { fontSize: 13, color: '#1e293b', lineHeight: 1.4 },

  // Empty state
  empty: { textAlign: 'center', padding: '48px 20px', color: '#94a3b8' },
};

export default PollComponent;

