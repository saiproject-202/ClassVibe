// src/components/PollComponent.js
import React, { useState, useEffect } from 'react';
import socket from '../socket';

const PollComponent = ({ groupId, currentUserId, isAdmin }) => {
  const [polls, setPolls] = useState([]);
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [pollType, setPollType] = useState('mcq');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState({}); // ✅ per-poll answers

  // ============================================
  // LOAD POLLS
  // ============================================
  useEffect(() => {
    if (!groupId) return;

    socket.emit('getPolls', { groupId });

    const onPollsUpdate = (data) => setPolls(data.polls || []);
    const onNewPoll = (poll) => setPolls((prev) => [poll, ...prev]);
    const onPollUpdated = (updatedPoll) =>
      setPolls((prev) =>
        prev.map((p) => (p._id === updatedPoll._id ? updatedPoll : p))
      );

    socket.on('pollsUpdate', onPollsUpdate);
    socket.on('newPoll', onNewPoll);
    socket.on('pollUpdated', onPollUpdated);

    return () => {
      socket.off('pollsUpdate', onPollsUpdate);
      socket.off('newPoll', onNewPoll);
      socket.off('pollUpdated', onPollUpdated);
    };
  }, [groupId]);

  // ============================================
  // CREATE POLL
  // ============================================
  const handleCreatePoll = () => {
    setError('');

    if (!question.trim()) {
      setError('Question is required');
      return;
    }

    if (pollType !== 'open') {
      const validOptions = options.filter((o) => o.trim());
      if (validOptions.length < 2) {
        setError('At least 2 options required');
        return;
      }
    }

    setCreating(true);

    socket.emit('createPoll', {
      groupId,
      pollType,
      question: question.trim(),
      options:
        pollType === 'yesno'
          ? [{ text: 'Yes' }, { text: 'No' }]
          : pollType === 'mcq'
          ? options.filter(Boolean).map((text) => ({ text }))
          : []
    });

    setTimeout(() => {
      setQuestion('');
      setOptions(['', '', '', '']);
      setPollType('mcq');
      setShowCreatePoll(false);
      setCreating(false);
    }, 400);
  };

  // ============================================
  // ACTIONS
  // ============================================
  const handleVote = (pollId, optionIndex) =>
    socket.emit('votePoll', { pollId, optionIndex });

  const handleSubmitAnswer = (pollId) => {
    const answer = answers[pollId];
    if (!answer?.trim()) return;

    socket.emit('answerPoll', { pollId, answer: answer.trim() });
    setAnswers((prev) => ({ ...prev, [pollId]: '' }));
  };

  const handleClosePoll = (pollId) => {
    if (window.confirm('Close this poll?')) {
      socket.emit('closePoll', { pollId });
    }
  };

  // ============================================
  // HELPERS
  // ============================================
  const hasVoted = (poll) =>
    poll.options?.some((opt) =>
      opt.votedBy?.some(
        (id) => String(id._id || id) === String(currentUserId)
      )
    );

  const hasAnswered = (poll) =>
    poll.answers?.some(
      (a) => String(a.user?._id || a.user) === String(currentUserId)
    );

  // ============================================
  // RENDER
  // ============================================
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2>Polls & Questions</h2>
        {isAdmin && (
          <button onClick={() => setShowCreatePoll(!showCreatePoll)}>
            {showCreatePoll ? 'Cancel' : '+ Create Poll'}
          </button>
        )}
      </div>

      {isAdmin && showCreatePoll && (
        <div style={styles.createForm}>
          <select value={pollType} onChange={(e) => setPollType(e.target.value)}>
            <option value="mcq">MCQ</option>
            <option value="yesno">Yes / No</option>
            <option value="open">Open</option>
          </select>

          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Question"
          />

          {pollType === 'mcq' &&
            options.map((opt, i) => (
              <input
                key={i}
                value={opt}
                placeholder={`Option ${i + 1}`}
                onChange={(e) => {
                  const copy = [...options];
                  copy[i] = e.target.value;
                  setOptions(copy);
                }}
              />
            ))}

          {error && <p style={{ color: 'red' }}>{error}</p>}

          <button disabled={creating} onClick={handleCreatePoll}>
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      )}

      {polls.map((poll) => (
        <div key={poll._id} style={styles.pollCard}>
          <h3>{poll.question}</h3>

          {(poll.pollType === 'mcq' || poll.pollType === 'yesno') &&
            (!hasVoted(poll) && poll.isActive ? (
              poll.options.map((opt, i) => (
                <button key={i} onClick={() => handleVote(poll._id, i)}>
                  {opt.text}
                </button>
              ))
            ) : (
              <p>Results shown</p>
            ))}

          {poll.pollType === 'open' &&
            (!hasAnswered(poll) && poll.isActive ? (
              <>
                <textarea
                  value={answers[poll._id] || ''}
                  onChange={(e) =>
                    setAnswers((p) => ({ ...p, [poll._id]: e.target.value }))
                  }
                />
                <button onClick={() => handleSubmitAnswer(poll._id)}>
                  Submit
                </button>
              </>
            ) : (
              <p>Answers submitted</p>
            ))}

          {isAdmin && poll.isActive && (
            <button onClick={() => handleClosePoll(poll._id)}>
              Close Poll
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

const styles = {
  container: { padding: 20 },
  header: { display: 'flex', justifyContent: 'space-between' },
  createForm: { padding: 15, background: '#fff', marginBottom: 20 },
  pollCard: { padding: 15, background: '#fff', marginBottom: 15 }
};

export default PollComponent;
