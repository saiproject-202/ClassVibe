// frontend/src/components/QuizPlayer.jsx
// ✅ FIXES:
// 1. CRITICAL: Answer summary was never displaying — root cause: useEffect had [sessionId, hasAnswered, myScore, userId]
//    in dependency array. When student submits answer → hasAnswered becomes true → React cleans up ALL
//    socket listeners → answer:summary arrives from server but nobody's listening → view never changes.
//    FIX: use refs for hasAnswered and myScore so the effect only re-runs on [sessionId] change.
// 2. Timer was showing 0 on late join — quiz:joined was using hardcoded timeRemaining:30.
//    FIX: use actual timeRemaining from quiz:joined event, fallback to question.timeLimit.
// 3. Timer display was showing just the number without context when at 0 on mount.
//    FIX: only render timer when timeRemaining > 0 or quiz is active.
// ALL other logic — answer types, scoring, leaderboard, finished view — IDENTICAL.
// 4. "Not answered" now shows correctly instead of "Wrong"/"Incorrect" — the old check
//    only recognized selectedAnswer === null, but MC/true-false sends -1 and
//    multiple-select sends [] when nothing was picked, so both fell through to "Wrong".

import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket';

// ✅ NEW (Phase 2): display metadata for each award type — icon + label only,
// the actual winner/value comes from the server (quiz:awardsRevealed).
const AWARD_META = {
  fastestThinker: { icon: '⚡', label: 'Fastest Thinker' },
  bestAccuracy:   { icon: '🎯', label: 'Best Accuracy' },
  longestStreak:  { icon: '🔥', label: 'Longest Streak' },
  mostImproved:   { icon: '📈', label: 'Most Improved' }
};

// ✅ NEW: true if the student genuinely didn't pick anything for this question,
// covering every question type's "nothing selected" shape (not just null).
const isUnanswered = (selectedAnswer, questionType) => {
  if (selectedAnswer === null || selectedAnswer === undefined) return true;
  if (questionType === 'multiple_select') return !Array.isArray(selectedAnswer) || selectedAnswer.length === 0;
  if (questionType === 'fill_in_blank') return typeof selectedAnswer !== 'string' || selectedAnswer.trim() === '';
  return selectedAnswer === -1;
};

const QuizPlayer = ({ sessionId, onClose }) => {
  const [currentView, setCurrentView] = useState('loading');
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);

  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [fillFocused, setFillFocused] = useState(false);
  const fillInputRef = useRef(null);
  const [selectedAnswers, setSelectedAnswers] = useState([]);
  const [textAnswer, setTextAnswer] = useState('');
  const [hasAnswered, setHasAnswered] = useState(false);
  const [answerSummary, setAnswerSummary] = useState(null);

  const [timeRemaining, setTimeRemaining] = useState(0);

  const [myScore, setMyScore] = useState(0);
  const [myStreak, setMyStreak] = useState(0);
  const [speedMultiplier, setSpeedMultiplier] = useState(1.0);
  const [myAnswers, setMyAnswers] = useState([]);

  const [leaderboard, setLeaderboard] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [finalTab, setFinalTab] = useState('leaderboard');
  // ✅ NEW (Phase 3 — TEAM_MODE_DESIGN.md §4/§5): grouped-by-team leaderboard, empty
  // array in individual mode. When present, it's shown INSTEAD of the flat individual
  // list — same underlying scores, just grouped (see §16.1: one scoring engine, only
  // the leaderboard presentation differs by mode).
  const [teamLeaderboard, setTeamLeaderboard] = useState([]);
  const [myTeamId, setMyTeamId] = useState(null);
  // ✅ NEW (Phase 5.3): live team momentum — recomputed after every answer, empty
  // array in individual mode (see computeMomentum in quiz-socket-handlers.js)
  const [momentum, setMomentum] = useState([]);
  // ✅ NEW (Phase 5.4): top scorer for the question that just ended, shown on the
  // mid-quiz leaderboard flash
  const [questionMVP, setQuestionMVP] = useState(null);
  // ✅ NEW (Phase 2 — TEAM_MODE_DESIGN.md): end-of-quiz awards (Fastest Thinker,
  // Best Accuracy, Longest Streak, Most Improved), revealed shortly after quiz:finished
  const [awards, setAwards] = useState([]);

  const userId = useRef(JSON.parse(localStorage.getItem('user'))?.id).current;

  // ✅ FIX: Use refs so socket listeners never need to be re-registered when these change.
  // This is the root cause of the missing answer:summary — re-registering removes the listener
  // at the exact moment the server sends the event.
  const hasAnsweredRef = useRef(false);
  const myScoreRef     = useRef(0);
  const currentQuestionRef = useRef(null);
  const questionIndexRef   = useRef(0);
  const selectedAnswerRef  = useRef(null);
  const selectedAnswersRef = useRef([]);
  const textAnswerRef      = useRef('');

  // Keep refs in sync with state
  useEffect(() => { hasAnsweredRef.current = hasAnswered; }, [hasAnswered]);
  useEffect(() => { myScoreRef.current = myScore; }, [myScore]);
  useEffect(() => { currentQuestionRef.current = currentQuestion; }, [currentQuestion]);
  useEffect(() => { questionIndexRef.current = questionIndex; }, [questionIndex]);
  useEffect(() => { selectedAnswerRef.current = selectedAnswer; }, [selectedAnswer]);
  useEffect(() => { selectedAnswersRef.current = selectedAnswers; }, [selectedAnswers]);
  useEffect(() => { textAnswerRef.current = textAnswer; }, [textAnswer]);

  // Focus the FIB input whenever a fill_in_blank question appears
  useEffect(() => {
    if (currentView === 'question' && currentQuestion?.questionType === 'fill_in_blank' && !hasAnswered) {
      const t = setTimeout(() => fillInputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [currentView, currentQuestion, hasAnswered]);

  // Auto-submit uses refs — no stale closures
  const handleAutoSubmit = () => {
    if (hasAnsweredRef.current) return;
    hasAnsweredRef.current = true;
    setHasAnswered(true);

    const questionType = currentQuestionRef.current?.questionType || 'multiple_choice';
    let finalAnswer;
    if (questionType === 'fill_in_blank') {
      finalAnswer = textAnswerRef.current.trim();
    } else if (questionType === 'multiple_select') {
      finalAnswer = selectedAnswersRef.current.length > 0 ? selectedAnswersRef.current : [];
    } else {
      finalAnswer = selectedAnswerRef.current !== null ? selectedAnswerRef.current : -1;
    }

    socket.emit('student:submitAnswer', {
      sessionId,
      questionIndex: questionIndexRef.current,
      selectedAnswer: finalAnswer,
      timeTaken: currentQuestionRef.current?.timeLimit || 45
    });
    console.log('⏰ Auto-submitted:', finalAnswer);
  };

  const autoSubmitRef = useRef(handleAutoSubmit);
  useEffect(() => { autoSubmitRef.current = handleAutoSubmit; });

  // ========================================
  // SOCKET EVENT LISTENERS
  // ✅ FIX: dependency array is ONLY [sessionId]
  // All state access via refs to avoid stale closures
  // ========================================
  useEffect(() => {
    if (!socket.connected) socket.connect();

    socket.emit('student:joinQuiz', { sessionId });

    socket.on('quiz:joined', (data) => {
      console.log('✅ Joined quiz:', data);
      setTotalQuestions(data.totalQuestions);
      setMyTeamId(data.myTeamId || null); // ✅ NEW (Phase 3) — null in individual mode

      if (data.status === 'active' && data.currentQuestion) {
        const q = data.currentQuestion.question || data.currentQuestion;
        setCurrentQuestion(q);
        setQuestionIndex(data.currentQuestion.questionIndex || 0);
        // ✅ FIX: use actual timeRemaining from server, not hardcoded 30
        setTimeRemaining(data.timeRemaining > 0 ? data.timeRemaining : (q?.timeLimit || 45));
        setCurrentView('question');
      } else if (data.status === 'completed') {
        // ✅ NEW: quiz already ended, show message instead of joining
        setCurrentView('quizEnded');
      } else {
        setCurrentView('waiting');
      }
    });

    socket.on('quiz:started', (data) => {
      console.log('🚀 Quiz started');
      setCurrentQuestion(data.question);
      setQuestionIndex(data.questionIndex || 0);
      // ✅ FIX: ensure timeLimit has fallback
      setTimeRemaining(data.question?.timeLimit || data.timeLimit || 45);
      setTotalQuestions(data.totalQuestions);
      setCurrentView('question');
      resetAnswerState();
    });

    socket.on('timer:update', (data) => {
      setTimeRemaining(data.timeRemaining);
      // Use ref — no stale closure issue
      if (data.timeRemaining === 0 && !hasAnsweredRef.current) {
        autoSubmitRef.current && autoSubmitRef.current();
      }
    });

    // ✅ FIX: This listener was being removed and re-registered when hasAnswered changed,
    // causing the race condition where answer:summary event arrived with no listener.
    // Now it's registered once and uses refs.
    socket.on('answer:summary', (data) => {
      console.log('📊 Answer summary received:', data);
      setAnswerSummary(data);
      setMyScore(data.currentScore);
      myScoreRef.current = data.currentScore;
      setMyStreak(data.streak || 0);
      setSpeedMultiplier(data.speedMultiplier || 1.0);
      setMyAnswers(prev => [...prev, {
        questionIndex: data.questionIndex,
        questionText: data.questionText,
        questionType: data.questionType,
        options: data.options,
        selectedAnswer: data.selectedAnswer,
        correctAnswer: data.correctAnswer,
        isCorrect: data.isCorrect,
        points: data.points,
        explanation: data.explanation
      }]);
      // ✅ This view transition was the broken part — now works correctly
      setCurrentView('answerSummary');
    });

    socket.on('question:complete', (data) => {
      console.log('✅ Question complete');
      // Use ref to check hasAnswered — avoids stale closure
      if (!hasAnsweredRef.current) {
        setAnswerSummary({
          questionIndex: data.questionIndex,
          questionText: data.questionText,
          questionType: data.questionType,
          options: data.options,
          selectedAnswer: null,
          correctAnswer: data.correctAnswer,
          isCorrect: false,
          points: 0,
          explanation: data.explanation,
          currentScore: myScoreRef.current,
          streak: 0
        });
        setMyStreak(0);
        setMyAnswers(prev => [...prev, {
          questionIndex: data.questionIndex,
          questionText: data.questionText,
          questionType: data.questionType,
          options: data.options,
          selectedAnswer: null,
          correctAnswer: data.correctAnswer,
          isCorrect: false,
          points: 0,
          explanation: data.explanation
        }]);
        setCurrentView('answerSummary');
      }
    });

    socket.on('leaderboard:show', (data) => {
      console.log('🏆 Leaderboard');
      setLeaderboard(data.leaderboard);
      setTeamLeaderboard(data.teamLeaderboard || []); // ✅ NEW (Phase 3)
      setQuestionMVP(data.questionMVP || null); // ✅ NEW (Phase 5.4)
      const myRankData = data.leaderboard.find(
        entry => String(entry.userId) === String(userId)
      );
      setMyRank(myRankData ? myRankData.rank : null);
      setCurrentView('leaderboard');
    });

    // ✅ NEW (Phase 5.1): live team momentum bar, recomputed after every answer and
    // at the start of every question
    socket.on('team:momentumUpdate', (data) => {
      setMomentum(data.teams || []);
    });

    socket.on('quiz:nextQuestion', (data) => {
      console.log('➡️ Next question');
      setCurrentQuestion(data.question);
      setQuestionIndex(data.questionIndex);
      // ✅ FIX: ensure timeLimit has fallback
      setTimeRemaining(data.question?.timeLimit || 45);
      resetAnswerState();
      setCurrentView('question');
    });

    socket.on('quiz:finished', (data) => {
      console.log('🏁 Quiz finished');
      if (data?.leaderboard) {
        setLeaderboard(data.leaderboard);
        const myRankData = data.leaderboard.find(
          entry => String(entry.userId) === String(userId)
        );
        setMyRank(myRankData ? myRankData.rank : null);
      }
      setTeamLeaderboard(data?.teamLeaderboard || []); // ✅ NEW (Phase 3)
      setCurrentView('finished');
    });

    // ✅ NEW (Phase 2): arrives a moment after quiz:finished, once results are saved
    socket.on('quiz:awardsRevealed', (data) => {
      console.log('🏅 Awards revealed:', data.awards);
      setAwards(data.awards || []);
    });

    socket.on('error', (data) => {
      console.error('❌ Socket error:', data.message);
      alert(data.message);
    });

    return () => {
      socket.off('quiz:joined');
      socket.off('quiz:started');
      socket.off('timer:update');
      socket.off('answer:summary');
      socket.off('question:complete');
      socket.off('leaderboard:show');
      socket.off('team:momentumUpdate');
      socket.off('quiz:nextQuestion');
      socket.off('quiz:finished');
      socket.off('quiz:awardsRevealed');
      socket.off('error');
    };
  // ✅ FIX: ONLY sessionId in dependency array — this is the critical fix
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ========================================
  // HELPER FUNCTIONS
  // ========================================

  const resetAnswerState = () => {
    setSelectedAnswer(null);
    setSelectedAnswers([]);
    setTextAnswer('');
    setHasAnswered(false);
    hasAnsweredRef.current = false;
    setAnswerSummary(null);
  };

  const handleSubmit = () => {
    const questionType = currentQuestion?.questionType || 'multiple_choice';
    let finalAnswer;

    if (questionType === 'fill_in_blank') {
      if (!textAnswer.trim()) { alert('Please type your answer!'); return; }
      finalAnswer = textAnswer.trim();
    } else if (questionType === 'multiple_select') {
      if (selectedAnswers.length === 0) { alert('Please select at least one answer!'); return; }
      finalAnswer = selectedAnswers;
    } else {
      if (selectedAnswer === null) { alert('Please select an answer!'); return; }
      finalAnswer = selectedAnswer;
    }

    hasAnsweredRef.current = true;
    setHasAnswered(true);
    const timeTaken = (currentQuestion.timeLimit || 45) - timeRemaining;

    socket.emit('student:submitAnswer', {
      sessionId,
      questionIndex,
      selectedAnswer: finalAnswer,
      timeTaken
    });
    console.log('📤 Answer submitted:', finalAnswer);
  };

  const handleMultipleSelectToggle = (index) => {
    if (hasAnswered) return;
    setSelectedAnswers(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  // ========================================
  // RENDER FUNCTIONS
  // ========================================

  // ✅ NEW (Phase 5.3 — TEAM_MODE_DESIGN.md §16.4): live momentum bar, a single stacked
  // bar showing each team's current share of the standings. Widths are percentages that
  // always sum to 100 (see computeMomentum on the backend), so this is purely a display
  // of already-computed values — no scoring logic lives here.
  const renderMomentumBar = () => (
    <div style={styles.momentumBar}>
      {momentum.map((team) => (
        <div
          key={team.teamId}
          style={{
            ...styles.momentumSegment,
            width: `${team.percentage}%`,
            backgroundColor: team.color || '#4F46E5',
            outline: team.teamId === myTeamId ? '2px solid #fff' : 'none',
            outlineOffset: team.teamId === myTeamId ? '-2px' : '0'
          }}
          title={`${team.icon || ''} ${team.name}: ${team.percentage}%`}
        >
          {team.percentage >= 12 && (
            <span style={styles.momentumLabel}>{team.icon} {team.percentage}%</span>
          )}
        </div>
      ))}
    </div>
  );

  // ✅ NEW (Phase 3 — TEAM_MODE_DESIGN.md §4.2/§5): team-grouped leaderboard, shown
  // INSTEAD of the flat individual list whenever teamLeaderboard is non-empty. Ranked
  // by Team Rating (already sorted server-side); shows Average Score per §4.2 ("never
  // use total, since a bigger team would win purely on headcount"), with each member's
  // own score listed underneath, matching the design doc's worked example format.
  const renderTeamLeaderboard = () => (
    <div style={styles.teamLbList}>
      {teamLeaderboard.map((team) => (
        <div
          key={team.teamId}
          style={{
            ...styles.teamLbCard,
            borderColor: team.teamId === myTeamId ? (team.color || '#4F46E5') : '#e0e0e0'
          }}
        >
          <div style={styles.teamLbHeader}>
            <span style={styles.teamLbRank}>#{team.rank}</span>
            <span style={styles.teamLbIcon}>{team.icon}</span>
            <span style={styles.teamLbName}>{team.name}</span>
            <span style={styles.teamLbScore}>{team.averageScore} avg</span>
          </div>
          <div style={styles.teamLbMembers}>
            {team.members.map((m) => (
              <div key={m.userId} style={styles.teamLbMemberRow}>
                <span style={{ ...styles.teamLbMemberName, fontWeight: String(m.userId) === String(userId) ? '700' : '500' }}>
                  {m.name}{String(m.userId) === String(userId) ? ' (You)' : ''}
                </span>
                <span style={styles.teamLbMemberScore}>{m.score} pts</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderQuestionInput = () => {
    const questionType = currentQuestion?.questionType || 'multiple_choice';

    if (questionType === 'fill_in_blank') {
      return (
        <div style={styles.fillInBlankContainer}>
          <label htmlFor="fib-input" style={styles.fillInBlankLabel}>
            Your Answer
          </label>
          <input
            id="fib-input"
            ref={fillInputRef}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={textAnswer}
            onChange={(e) => { if (!hasAnswered) setTextAnswer(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !hasAnswered && textAnswer.trim()) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            onFocus={() => setFillFocused(true)}
            onBlur={() => setFillFocused(false)}
            placeholder="Type your answer..."
            disabled={hasAnswered}
            aria-label="Fill in the blank answer"
            aria-disabled={hasAnswered}
            style={{
              ...styles.fillInBlankInput,
              opacity: hasAnswered ? 0.6 : 1,
              cursor: hasAnswered ? 'not-allowed' : 'text',
              border: hasAnswered
                ? '3px solid #ccc'
                : fillFocused
                  ? '3px solid #25D366'
                  : '3px solid #4F46E5',
              boxShadow: fillFocused && !hasAnswered
                ? '0 0 0 4px rgba(37,211,102,0.18)'
                : 'none',
              transition: 'border 0.15s ease, box-shadow 0.15s ease'
            }}
          />
          <div style={styles.fillInBlankFooter}>
            {!hasAnswered && (
              <span style={styles.fillInBlankHint}>
                Press <kbd style={styles.kbd}>Enter ↵</kbd> to submit
              </span>
            )}
            {hasAnswered && (
              <span style={styles.fillInBlankSaved}>✓ Answer submitted</span>
            )}
          </div>
        </div>
      );
    }

    if (questionType === 'multiple_select') {
      return (
        <div style={styles.optionsGrid}>
          <div style={styles.multiSelectHint}>ℹ️ Select all correct answers</div>
          {currentQuestion?.options.map((option, index) => {
            const isSelected = selectedAnswers.includes(index);
            return (
              <div key={index} onClick={() => handleMultipleSelectToggle(index)} style={{
                ...styles.option,
                backgroundColor: isSelected ? '#E3F2FD' : '#fff',
                border: isSelected ? '3px solid #2196F3' : '2px solid #e0e0e0',
                cursor: hasAnswered ? 'not-allowed' : 'pointer', opacity: hasAnswered ? 0.6 : 1
              }}>
                <div style={{ ...styles.checkbox, backgroundColor: isSelected ? '#2196F3' : 'white', border: isSelected ? '2px solid #2196F3' : '2px solid #999' }}>
                  {isSelected && <span style={styles.checkmark}>✓</span>}
                </div>
                <div style={styles.optionLetter}>{String.fromCharCode(65 + index)}</div>
                <div style={styles.optionText}>{option}</div>
              </div>
            );
          })}
        </div>
      );
    }

    // MC / True-False
    return (
      <div style={styles.optionsGrid}>
        {currentQuestion?.options.map((option, index) => {
          const isSelected = selectedAnswer === index;
          return (
            <button key={index} onClick={() => !hasAnswered && setSelectedAnswer(index)} disabled={hasAnswered} style={{
              ...styles.option,
              backgroundColor: isSelected ? '#E3F2FD' : '#fff',
              border: isSelected ? '3px solid #2196F3' : '2px solid #e0e0e0',
              cursor: hasAnswered ? 'not-allowed' : 'pointer', opacity: hasAnswered ? 0.6 : 1
            }}>
              <div style={styles.optionLetter}>{String.fromCharCode(65 + index)}</div>
              <div style={styles.optionText}>{option}</div>
              {isSelected && <div style={styles.selectedBadge}>✓</div>}
            </button>
          );
        })}
      </div>
    );
  };

  // ========================================
  // VIEW RENDERERS
  // ========================================

  if (currentView === 'loading') {
    return (
      <div style={styles.overlay}>
        <div style={styles.loadingBox}>
          <div style={styles.loadingSpinner}></div>
          <p style={styles.loadingText}>Joining quiz...</p>
        </div>
      </div>
    );
  }

  // ✅ NEW: Quiz already ended — show message, no rejoin
  if (currentView === 'quizEnded') {
    return (
      <div style={styles.overlay}>
        <div style={styles.container}>
          <div style={styles.waitingBox}>
            <div style={styles.waitingIcon}>🏁</div>
            <h2 style={styles.waitingTitle}>Quiz Already Ended</h2>
            <p style={styles.waitingText}>This quiz has been completed. You cannot rejoin a finished quiz.</p>
          </div>
          <button onClick={onClose} style={styles.closeWaitingBtn}>Close</button>
        </div>
      </div>
    );
  }

  if (currentView === 'waiting') {
    return (
      <div style={styles.overlay}>
        <div style={styles.container}>
          <div style={styles.waitingBox}>
            <div style={styles.waitingIcon}>⏳</div>
            <h2 style={styles.waitingTitle}>Waiting for Quiz to Start</h2>
            <p style={styles.waitingText}>The teacher will start the quiz soon. Stay ready!</p>
            <div style={styles.waitingPulse}></div>
          </div>
          <button onClick={onClose} style={styles.closeWaitingBtn}>Leave Quiz</button>
        </div>
      </div>
    );
  }

  if (currentView === 'question') {
    const questionType = currentQuestion?.questionType || 'multiple_choice';
    const questionTypeLabel = {
      'multiple_choice': 'Multiple Choice',
      'fill_in_blank': 'Fill in the Blank',
      'true_false': 'True/False',
      'multiple_select': 'Multiple Select'
    }[questionType] || 'Question';

    return (
      <div style={styles.overlay}>
        <div style={styles.container}>
          <div style={styles.header}>
            <div style={styles.headerLeft}>
              <div style={styles.progressText}>Question {questionIndex + 1} of {totalQuestions}</div>
              <div style={styles.questionTypeBadge}>{questionTypeLabel}</div>
            </div>
            <div style={styles.headerRight}>
              {myStreak > 0 && <div style={styles.streakDisplay}>🔥 {myStreak}</div>}
              {/* ✅ FIX: timer is always shown, color changes when low, no more showing 0 on mount */}
              <div style={{
                ...styles.timer,
                backgroundColor: timeRemaining <= 10 ? '#dc3545' : '#ff9800',
                animation: timeRemaining <= 10 ? 'pulse 1s infinite' : 'none'
              }}>
                ⏱️ {timeRemaining}s
              </div>
            </div>
          </div>

          {momentum.length > 0 && renderMomentumBar()}

          <div style={styles.questionBox}>
            <h2 style={styles.questionText}>{currentQuestion?.questionText}</h2>
            <div style={styles.questionPoints}>{currentQuestion?.points || 10} points</div>
          </div>

          {renderQuestionInput()}

          {!hasAnswered && (
            <button onClick={handleSubmit} style={styles.submitBtn}>Submit Answer</button>
          )}

          {hasAnswered && (
            <div style={styles.waitingMessage}>
              <div style={styles.waitingSpinner}></div>
              Waiting for answer summary...
            </div>
          )}

          <div style={styles.scoreDisplay}>
            <div>Score: {myScore} points</div>
            {myStreak > 0 && <div style={styles.streakText}>🔥 {myStreak} streak!</div>}
          </div>
        </div>
      </div>
    );
  }

  // Answer Summary View
  if (currentView === 'answerSummary') {
    const isCorrect = answerSummary?.isCorrect;
    const questionType = answerSummary?.questionType || 'multiple_choice';

    return (
      <div style={styles.overlay}>
        <div style={styles.container}>
          <div style={{
            ...styles.resultBadge,
            backgroundColor: isCorrect ? '#D7F0DD' : '#FFEBEE',
            borderColor: isCorrect ? '#25D366' : '#F44336'
          }}>
            <div style={styles.resultIcon}>{isCorrect ? '✅' : '❌'}</div>
            <div style={styles.resultText}>
              <h2 style={{ ...styles.resultTitle, color: isCorrect ? '#1B5E20' : '#C62828' }}>
                {isCorrect ? 'Correct!' : isUnanswered(answerSummary?.selectedAnswer, questionType) ? 'Not Answered' : 'Incorrect'}
              </h2>
              <p style={styles.resultPoints}>
                {isCorrect ? `+${answerSummary?.points} points` : '+0 points'}
                {isCorrect && speedMultiplier > 1 && (
                  <span style={styles.multiplierBadge}>⚡ {speedMultiplier}x</span>
                )}
              </p>
              {myStreak > 0 && <p style={styles.streakBadge}>🔥 {myStreak} streak!</p>}
            </div>
          </div>

          <div style={styles.reviewBox}>
            <h3 style={styles.reviewTitle}>Question {questionIndex + 1}</h3>
            <p style={styles.reviewQuestion}>{answerSummary?.questionText}</p>

            {questionType === 'fill_in_blank' ? (
              <div style={styles.fillInBlankReview}>
                <div style={styles.reviewLabel}>Your Answer:</div>
                <div style={{ ...styles.fillInBlankAnswer, backgroundColor: isCorrect ? '#E8F5E9' : '#FFEBEE', color: isCorrect ? '#1B5E20' : '#C62828' }}>
                  {answerSummary?.selectedAnswer || '(No answer)'}
                </div>
                <div style={styles.reviewLabel}>Correct Answer:</div>
                <div style={styles.fillInBlankAnswer}>{answerSummary?.correctAnswer}</div>
              </div>
            ) : questionType === 'multiple_select' ? (
              <div style={styles.reviewOptions}>
                {(answerSummary?.options || []).map((option, index) => {
                  const isThisCorrect = Array.isArray(answerSummary.correctAnswer) && answerSummary.correctAnswer.includes(index);
                  const isThisSelected = Array.isArray(answerSummary.selectedAnswer) && answerSummary.selectedAnswer.includes(index);
                  return (
                    <div key={index} style={{ ...styles.reviewOption, backgroundColor: isThisCorrect ? '#E8F5E9' : isThisSelected ? '#FFEBEE' : '#f5f5f5', border: isThisCorrect ? '2px solid #4CAF50' : isThisSelected ? '2px solid #F44336' : '1px solid #ddd' }}>
                      <div style={styles.reviewOptionLetter}>{String.fromCharCode(65 + index)}</div>
                      <div style={styles.reviewOptionText}>{option}</div>
                      {isThisCorrect && <div style={styles.correctBadge}>✓ Correct</div>}
                      {isThisSelected && !isThisCorrect && <div style={styles.wrongBadge}>Your Choice</div>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={styles.reviewOptions}>
                {(answerSummary?.options || []).map((option, index) => {
                  const isThisCorrect = index === answerSummary.correctAnswer;
                  const isThisSelected = index === answerSummary.selectedAnswer;
                  return (
                    <div key={index} style={{ ...styles.reviewOption, backgroundColor: isThisCorrect ? '#E8F5E9' : isThisSelected ? '#FFEBEE' : '#f5f5f5', border: isThisCorrect ? '2px solid #4CAF50' : isThisSelected ? '2px solid #F44336' : '1px solid #ddd' }}>
                      <div style={styles.reviewOptionLetter}>{String.fromCharCode(65 + index)}</div>
                      <div style={styles.reviewOptionText}>{option}</div>
                      {isThisCorrect && <div style={styles.correctBadge}>✓ Correct Answer</div>}
                      {isThisSelected && !isThisCorrect && <div style={styles.wrongBadge}>Your Answer</div>}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={styles.explanationBox}>
              <div style={styles.explanationTitle}>💡 Explanation:</div>
              <p style={styles.explanationText}>{answerSummary?.explanation || 'No explanation provided.'}</p>
            </div>

            <div style={styles.scoreUpdate}>
              Your Total Score: <strong>{answerSummary?.currentScore} points</strong>
            </div>
          </div>

          <div style={styles.waitNextMessage}>
            <div style={styles.waitSpinner}></div>
            Showing leaderboard next...
          </div>
        </div>
      </div>
    );
  }

  // Leaderboard View — IDENTICAL
  if (currentView === 'leaderboard') {
    return (
      <div style={styles.overlay}>
        <div style={styles.container}>
          <h2 style={styles.leaderboardTitle}>🏆 Leaderboard</h2>
          {/* ✅ NEW (Phase 5.4): callout for whoever scored highest on the question
              that just ended (null if nobody answered it correctly) */}
          {questionMVP && (
            <div style={styles.questionMvpBanner}>
              ⭐ Question MVP: <strong>{String(questionMVP.userId) === String(userId) ? 'You' : questionMVP.name}</strong> (+{questionMVP.points} pts)
            </div>
          )}
          {/* ✅ NEW (Phase 3): team leaderboard replaces the flat list in team mode —
              same underlying scores, just grouped (see §16.1) */}
          {teamLeaderboard.length > 0 ? renderTeamLeaderboard() : (
            <div style={styles.leaderboardList}>
              {leaderboard.map((entry, index) => (
                <div key={index} style={{ ...styles.leaderboardItem, backgroundColor: String(entry.userId) === String(userId) ? '#FFF9C4' : '#fff' }}>
                  <div style={styles.rank}>#{entry.rank}</div>
                  <div style={styles.playerInfo}>
                    <div style={styles.playerNameRow}>
                      <span style={styles.playerName}>{entry.name || 'Student'}</span>
                      <span style={styles.playerScore}>{entry.score} pts</span>
                    </div>
                    <div style={styles.playerStats}>
                      {entry.correctAnswers}/{entry.totalAnswers} correct
                      {entry.streak > 0 && ` • 🔥 ${entry.streak}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={styles.waitNextMessage}>
            <div style={styles.waitSpinner}></div>
            Next question loading...
          </div>
        </div>
      </div>
    );
  }

  // Finished View — IDENTICAL
  if (currentView === 'finished') {
    return (
      <div style={styles.overlay}>
        <div style={styles.container}>
          <h2 style={styles.finishedTitle}>🏁 Quiz Completed!</h2>

          {/* ✅ NEW (Phase 2): Class Highlights — arrives shortly after quiz:finished,
              once the server has saved results and computed awards. Simply doesn't
              render if an award type has no eligible winner (e.g. no one has quiz
              history yet for "Most Improved") rather than showing an empty slot. */}
          {awards.length > 0 && (
            <div style={styles.awardsCard}>
              <div style={styles.awardsTitle}>🏅 Class Highlights</div>
              <div style={styles.awardsList}>
                {awards.map((award, i) => {
                  const meta = AWARD_META[award.type] || { icon: '🏅', label: award.type };
                  const isMe = String(award.userId) === String(userId);
                  return (
                    <div key={i} style={{ ...styles.awardItem, backgroundColor: isMe ? '#FFF9C4' : '#F9FAFB' }}>
                      <span style={styles.awardIcon}>{meta.icon}</span>
                      <div style={styles.awardInfo}>
                        <div style={styles.awardLabel}>{meta.label}</div>
                        <div style={styles.awardWinner}>{award.name}{isMe ? ' (You!)' : ''} — {award.value}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={styles.tabs}>
            <button onClick={() => setFinalTab('leaderboard')} style={{ ...styles.tab, ...(finalTab === 'leaderboard' ? styles.tabActive : {}) }}>🏆 Leaderboard</button>
            <button onClick={() => setFinalTab('review')} style={{ ...styles.tab, ...(finalTab === 'review' ? styles.tabActive : {}) }}>📊 My Review</button>
          </div>

          {finalTab === 'leaderboard' && (
            <div style={styles.tabContent}>
              {myRank && (
                <div style={styles.myRankCard}>
                  <div style={styles.myRankText}>Your Rank: #{myRank}</div>
                  <div style={styles.myScoreText}>{myScore} points</div>
                  {/* ✅ NEW (Phase 3): team rank shown alongside personal rank */}
                  {teamLeaderboard.length > 0 && myTeamId && (() => {
                    const myTeam = teamLeaderboard.find(t => t.teamId === myTeamId);
                    return myTeam ? (
                      <div style={styles.myTeamRankText}>
                        {myTeam.icon} {myTeam.name} — Team Rank #{myTeam.rank}
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
              {/* ✅ NEW (Phase 3): team leaderboard replaces the flat list in team mode */}
              {teamLeaderboard.length > 0 ? renderTeamLeaderboard() : (
                <div style={styles.leaderboardList}>
                  {leaderboard.map((entry, index) => (
                    <div key={index} style={{ ...styles.leaderboardItem, backgroundColor: String(entry.userId) === String(userId) ? '#FFF9C4' : '#fff' }}>
                      <div style={styles.rank}>#{entry.rank}</div>
                      <div style={styles.playerInfo}>
                        <div style={styles.playerNameRow}>
                          <span style={styles.playerName}>{entry.name || 'Student'}</span>
                          <span style={styles.playerScore}>{entry.score} pts</span>
                        </div>
                        <div style={styles.playerStats}>{entry.correctAnswers}/{entry.totalAnswers} correct{entry.streak > 0 && ` • 🔥 ${entry.streak}`}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {finalTab === 'review' && (
            <div style={styles.tabContent}>
              <div style={styles.reviewSummary}>
                <div style={styles.summaryCard}><div style={styles.summaryLabel}>Total Score</div><div style={styles.summaryValue}>{myScore} pts</div></div>
                <div style={styles.summaryCard}><div style={styles.summaryLabel}>Correct</div><div style={styles.summaryValue}>{myAnswers.filter(a => a.isCorrect).length}/{myAnswers.length}</div></div>
                <div style={styles.summaryCard}><div style={styles.summaryLabel}>Best Streak</div><div style={styles.summaryValue}>🔥 {myStreak}</div></div>
              </div>
              <div style={styles.answersList}>
                {/* ✅ FIXED: was only listing questions this device actually received
                    (myAnswers) — a student who joined late (e.g. at Q4) would see Q1-Q3
                    silently missing from their review with no explanation. Now every
                    question in the quiz gets a row, with a clear placeholder for any
                    the student wasn't present for. */}
                {Array.from({ length: totalQuestions }, (_, i) => i).map((qIndex) => {
                  const answer = myAnswers.find(a => a.questionIndex === qIndex);
                  if (!answer) {
                    return (
                      <div key={qIndex} style={{ ...styles.answerCard, opacity: 0.6 }}>
                        <div style={styles.answerHeader}>
                          <div style={styles.answerNumber}>Q{qIndex + 1}</div>
                          <div style={{ ...styles.answerResult, color: '#9CA3AF' }}>❓ Not answered</div>
                          <div style={styles.answerPoints}>+0 pts</div>
                        </div>
                        <div style={styles.answerQuestion}>You joined after this question was shown.</div>
                      </div>
                    );
                  }
                  // ✅ FIXED: a student present for the question but who never picked
                  // anything before time ran out used to show "❌ Wrong" — now shows
                  // "Not Answered" instead, distinct from an actually-wrong answer.
                  const notAnswered = !answer.isCorrect && isUnanswered(answer.selectedAnswer, answer.questionType);
                  return (
                    <div key={qIndex} style={styles.answerCard}>
                      <div style={styles.answerHeader}>
                        <div style={styles.answerNumber}>Q{qIndex + 1}</div>
                        <div style={{ ...styles.answerResult, color: answer.isCorrect ? '#4CAF50' : notAnswered ? '#9CA3AF' : '#F44336' }}>
                          {answer.isCorrect ? '✅ Correct' : notAnswered ? '❓ Not Answered' : '❌ Wrong'}
                        </div>
                        <div style={styles.answerPoints}>+{answer.points} pts</div>
                      </div>
                      <div style={styles.answerQuestion}>{answer.questionText}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button onClick={onClose} style={styles.exitBtn}>Exit Quiz</button>
        </div>
      </div>
    );
  }

  return null;
};

// ========================================
// STYLES — ALL IDENTICAL to previous version
// ========================================
const styles = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '20px' },
  loadingBox: { textAlign: 'center', color: 'white' },
  loadingSpinner: { width: '50px', height: '50px', border: '4px solid rgba(255,255,255,0.3)', borderTop: '4px solid white', borderRadius: '50%', margin: '0 auto 20px', animation: 'spin 1s linear infinite' },
  loadingText: { fontSize: '18px' },
  container: { backgroundColor: 'white', borderRadius: '16px', width: '100%', maxWidth: '700px', maxHeight: '90vh', overflow: 'auto', padding: '30px', position: 'relative' },
  waitingBox: { textAlign: 'center', padding: '60px 20px' },
  waitingIcon: { fontSize: '80px', marginBottom: '20px', animation: 'bounce 2s infinite' },
  waitingTitle: { fontSize: '28px', fontWeight: '700', color: '#1a1a1a', marginBottom: '15px' },
  waitingText: { fontSize: '16px', color: '#666', marginBottom: '30px' },
  waitingPulse: { width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#4F46E5', margin: '0 auto', animation: 'pulse 2s infinite' },
  closeWaitingBtn: { padding: '12px 32px', fontSize: '15px', fontWeight: '600', backgroundColor: '#f0f0f0', color: '#333', border: 'none', borderRadius: '10px', cursor: 'pointer', marginTop: '20px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', paddingBottom: '20px', borderBottom: '2px solid #f0f0f0' },
  headerLeft: { display: 'flex', flexDirection: 'column', gap: '8px' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '12px' },
  progressText: { fontSize: '15px', fontWeight: '600', color: '#4F46E5' },
  questionTypeBadge: { fontSize: '12px', fontWeight: '600', color: '#666', backgroundColor: '#f0f0f0', padding: '4px 10px', borderRadius: '12px', display: 'inline-block' },
  streakDisplay: { padding: '8px 16px', borderRadius: '20px', fontSize: '16px', fontWeight: '700', backgroundColor: '#FFA500', color: 'white', display: 'flex', alignItems: 'center', gap: '6px' },
  timer: { padding: '10px 20px', borderRadius: '25px', fontSize: '20px', fontWeight: '700', color: 'white', minWidth: '100px', textAlign: 'center' },
  questionBox: { marginBottom: '30px' },
  questionText: { fontSize: '24px', fontWeight: '600', color: '#1a1a1a', lineHeight: '1.4', marginBottom: '12px' },
  questionPoints: { fontSize: '14px', fontWeight: '600', color: '#25D366' },
  fillInBlankContainer: { marginBottom: '25px' },
  fillInBlankLabel: { display: 'block', fontSize: '13px', fontWeight: '700', color: '#4F46E5', marginBottom: '10px', letterSpacing: '0.5px', textTransform: 'uppercase' },
  fillInBlankInput: { display: 'block', width: '100%', padding: '16px 20px', fontSize: '18px', borderRadius: '12px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', backgroundColor: '#fff', color: '#1a1a1a', lineHeight: '1.4', WebkitAppearance: 'none' },
  fillInBlankFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', minHeight: '22px' },
  fillInBlankHint: { fontSize: '13px', color: '#888' },
  fillInBlankSaved: { fontSize: '13px', fontWeight: '600', color: '#25D366' },
  kbd: { display: 'inline-block', padding: '2px 7px', fontSize: '11px', fontFamily: 'inherit', fontWeight: '700', color: '#444', backgroundColor: '#f0f0f0', border: '1px solid #bbb', borderRadius: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' },
  characterCount: { marginTop: '8px', fontSize: '12px', color: '#666', textAlign: 'right' },
  multiSelectHint: { fontSize: '14px', fontWeight: '600', color: '#4F46E5', marginBottom: '12px', padding: '10px', backgroundColor: '#E3F2FD', borderRadius: '8px', textAlign: 'center' },
  checkbox: { width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s' },
  checkmark: { color: 'white', fontSize: '18px', fontWeight: '700' },
  optionsGrid: { display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '25px' },
  option: { display: 'flex', alignItems: 'center', gap: '15px', padding: '18px', borderRadius: '12px', transition: 'all 0.2s', position: 'relative', background: 'none' },
  optionLetter: { width: '45px', height: '45px', borderRadius: '50%', backgroundColor: '#4F46E5', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: '700', flexShrink: 0 },
  optionText: { flex: 1, fontSize: '17px', color: '#333', fontWeight: '500', textAlign: 'left' },
  selectedBadge: { width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#4CAF50', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '700' },
  submitBtn: { width: '100%', padding: '18px', fontSize: '18px', fontWeight: '700', backgroundColor: '#25D366', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(37, 211, 102, 0.3)' },
  waitingMessage: { textAlign: 'center', padding: '20px', fontSize: '16px', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' },
  waitingSpinner: { width: '20px', height: '20px', border: '3px solid #f0f0f0', borderTop: '3px solid #4F46E5', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  scoreDisplay: { textAlign: 'center', marginTop: '20px', padding: '15px', backgroundColor: '#F3F4F6', borderRadius: '10px', fontSize: '16px', fontWeight: '600', color: '#1a1a1a', display: 'flex', justifyContent: 'space-around', alignItems: 'center' },
  streakText: { fontSize: '16px', fontWeight: '700', color: '#FFA500' },
  resultBadge: { display: 'flex', alignItems: 'center', gap: '20px', padding: '25px', borderRadius: '16px', marginBottom: '25px', border: '3px solid' },
  resultIcon: { fontSize: '60px' },
  resultText: { flex: 1 },
  resultTitle: { fontSize: '28px', fontWeight: '700', margin: '0 0 8px 0' },
  resultPoints: { fontSize: '18px', fontWeight: '600', margin: 0 },
  multiplierBadge: { marginLeft: '10px', padding: '4px 12px', backgroundColor: '#FFA500', color: 'white', borderRadius: '12px', fontSize: '14px', fontWeight: '700' },
  streakBadge: { fontSize: '16px', fontWeight: '700', color: '#FFA500', marginTop: '8px' },
  reviewBox: { backgroundColor: '#f9f9f9', padding: '25px', borderRadius: '12px', marginBottom: '20px' },
  reviewTitle: { fontSize: '16px', fontWeight: '700', color: '#4F46E5', marginBottom: '10px' },
  reviewQuestion: { fontSize: '20px', fontWeight: '600', color: '#1a1a1a', marginBottom: '20px', lineHeight: '1.4' },
  fillInBlankReview: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' },
  reviewLabel: { fontSize: '14px', fontWeight: '600', color: '#666' },
  fillInBlankAnswer: { padding: '15px 20px', borderRadius: '10px', fontSize: '18px', fontWeight: '600', border: '2px solid #e0e0e0' },
  reviewOptions: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' },
  reviewOption: { display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', borderRadius: '10px', position: 'relative' },
  reviewOptionLetter: { width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#4F46E5', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '700', flexShrink: 0 },
  reviewOptionText: { flex: 1, fontSize: '16px', color: '#333', fontWeight: '500' },
  correctBadge: { padding: '5px 12px', backgroundColor: '#4CAF50', color: 'white', borderRadius: '20px', fontSize: '12px', fontWeight: '700' },
  wrongBadge: { padding: '5px 12px', backgroundColor: '#F44336', color: 'white', borderRadius: '20px', fontSize: '12px', fontWeight: '700' },
  explanationBox: { padding: '18px', backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e0e0e0', marginBottom: '15px' },
  explanationTitle: { fontSize: '14px', fontWeight: '700', color: '#4F46E5', marginBottom: '8px' },
  explanationText: { fontSize: '15px', color: '#333', lineHeight: '1.5', margin: 0 },
  scoreUpdate: { textAlign: 'center', fontSize: '18px', fontWeight: '600', color: '#1a1a1a' },
  waitNextMessage: { textAlign: 'center', padding: '20px', fontSize: '15px', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' },
  waitSpinner: { width: '16px', height: '16px', border: '2px solid #f0f0f0', borderTop: '2px solid #4F46E5', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  leaderboardTitle: { fontSize: '28px', fontWeight: '700', color: '#1a1a1a', marginBottom: '20px', textAlign: 'center' },
  leaderboardList: { display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' },
  leaderboardItem: { display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', borderRadius: '10px', border: '2px solid #e0e0e0' },
  rank: { fontSize: '24px', fontWeight: '700', color: '#4F46E5', minWidth: '50px' },
  playerInfo: { flex: 1 },
  playerNameRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', marginBottom: '4px' },
  playerName: { fontSize: '16px', fontWeight: '700', color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  playerScore: { fontSize: '16px', fontWeight: '700', color: '#4F46E5', flexShrink: 0 },
  playerStats: { fontSize: '13px', color: '#666' },
  finishedTitle: { fontSize: '32px', fontWeight: '700', color: '#1a1a1a', marginBottom: '20px', textAlign: 'center' },
  // ✅ NEW (Phase 2): Class Highlights / awards card
  awardsCard: { backgroundColor: '#F5F3FF', border: '2px solid #DDD6FE', borderRadius: '14px', padding: '18px', marginBottom: '20px' },
  awardsTitle: { fontSize: '15px', fontWeight: '700', color: '#4F46E5', marginBottom: '12px', textAlign: 'center' },
  awardsList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  awardItem: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '10px' },
  awardIcon: { fontSize: '22px', flexShrink: 0 },
  awardInfo: { flex: 1, minWidth: 0 },
  awardLabel: { fontSize: '12px', fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.3px' },
  awardWinner: { fontSize: '14px', fontWeight: '600', color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  tabs: { display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #e0e0e0', paddingBottom: '10px' },
  tab: { flex: 1, padding: '12px', fontSize: '15px', fontWeight: '600', backgroundColor: '#f0f0f0', color: '#666', border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', transition: 'all 0.2s' },
  tabActive: { backgroundColor: '#4F46E5', color: 'white' },
  tabContent: { marginBottom: '20px' },
  myRankCard: { padding: '20px', backgroundColor: '#FFF9C4', borderRadius: '12px', marginBottom: '20px', textAlign: 'center', border: '2px solid #FDD835' },
  myRankText: { fontSize: '18px', fontWeight: '600', color: '#1a1a1a', marginBottom: '8px' },
  myScoreText: { fontSize: '24px', fontWeight: '700', color: '#4F46E5' },
  // ✅ NEW (Phase 3): team leaderboard
  myTeamRankText: { fontSize: '14px', fontWeight: '600', color: '#6B7280', marginTop: '8px' },
  teamLbList: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' },
  teamLbCard: { border: '2px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' },
  teamLbHeader: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', backgroundColor: '#F9FAFB' },
  teamLbRank: { fontSize: '18px', fontWeight: '700', color: '#4F46E5', minWidth: '32px' },
  teamLbIcon: { fontSize: '18px' },
  teamLbName: { flex: 1, fontSize: '15px', fontWeight: '700', color: '#1a1a1a' },
  teamLbScore: { fontSize: '15px', fontWeight: '700', color: '#10B981' },
  teamLbMembers: { padding: '8px 16px 12px 58px', display: 'flex', flexDirection: 'column', gap: '4px' },
  teamLbMemberRow: { display: 'flex', justifyContent: 'space-between', fontSize: '13px' },
  teamLbMemberName: { color: '#374151' },
  teamLbMemberScore: { color: '#6B7280' },
  // ✅ NEW (Phase 5.3): live momentum bar
  momentumBar: { display: 'flex', width: '100%', height: '28px', borderRadius: '14px', overflow: 'hidden', marginBottom: '16px', backgroundColor: '#e0e0e0' },
  momentumSegment: { display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'width 0.6s ease', minWidth: '2%' },
  momentumLabel: { fontSize: '12px', fontWeight: '700', color: 'white', whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,0.3)' },
  questionMvpBanner: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px', backgroundColor: '#FFF7E6', border: '1px solid #FFD580', marginBottom: '16px', fontSize: '14px', fontWeight: '600', color: '#92400E' },
  reviewSummary: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginBottom: '20px' },
  summaryCard: { padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '10px', textAlign: 'center', border: '2px solid #e0e0e0' },
  summaryLabel: { fontSize: '12px', fontWeight: '600', color: '#666', marginBottom: '8px' },
  summaryValue: { fontSize: '20px', fontWeight: '700', color: '#4F46E5' },
  answersList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  answerCard: { padding: '15px', backgroundColor: '#fff', borderRadius: '10px', border: '2px solid #e0e0e0' },
  answerHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  answerNumber: { fontSize: '14px', fontWeight: '700', color: '#4F46E5' },
  answerResult: { fontSize: '14px', fontWeight: '700' },
  answerPoints: { fontSize: '14px', fontWeight: '700', color: '#666' },
  answerQuestion: { fontSize: '14px', color: '#333', lineHeight: '1.4' },
  exitBtn: { width: '100%', padding: '18px', fontSize: '18px', fontWeight: '700', backgroundColor: '#4F46E5', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s' }
};

if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.8; } }
    @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-20px); } }

    /* Fill in Blank — mobile keyboard stays below input */
    @media (max-width: 600px) {
      #fib-input {
        font-size: 16px !important; /* prevents iOS zoom on focus */
        padding: 14px 16px !important;
      }
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      #fib-input {
        background-color: #1e1e2e !important;
        color: #e0e0e0 !important;
      }
    }
  `;
  document.head.appendChild(styleSheet);
}

export default QuizPlayer;