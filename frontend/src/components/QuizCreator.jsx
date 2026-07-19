// frontend/src/components/QuizCreator.jsx
// Complete Quiz Creator with Undo/Redo, Multiple Question Types, Timer Editing

import React, { useState, useEffect, useRef } from 'react';

const QuizCreator = ({ groupId, onClose, onSuccess }) => {
  // Navigation steps
  const [currentStep, setCurrentStep] = useState('essentials');
  
  // Step 1: Essentials
  const [inputMethod, setInputMethod] = useState('topic');
  const [topic, setTopic] = useState('');
  const [pastedContent, setPastedContent] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [urlLink, setUrlLink] = useState(''); // ✅ NEW: URL input
  const [description, setDescription] = useState(''); // ✅ NEW: Description for file/URL
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState('medium');
  const [recentTopics, setRecentTopics] = useState([]);
  
  // Step 2: Questions
  const [questions, setQuestions] = useState([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  
  // ✅ NEW: Undo/Redo System
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // ✅ NEW: Timer animation
  const [previewTimer, setPreviewTimer] = useState(null);
  const timerInterval = useRef(null);
  
  // Step 3: Settings
  // ✅ NEW (Phase 3 — TEAM_MODE_DESIGN.md §12): quizMode + teamMode nested here so the
  // existing handleSaveChanges() (which already sends the whole `settings` object as-is)
  // needs no changes at all to start saving team config too.
  const [settings, setSettings] = useState({
    showCorrectAnswer: true,
    showLeaderboard: true,
    allowLateJoin: true,
    shuffleQuestions: false,
    shuffleOptions: true,
    // 'individual' | 'team_battle' (teacher types names — also covers what
    // TEAM_MODE_DESIGN.md calls "Custom Teams", same mechanism, one UI path) |
    // 'random_teams' | 'school_house' (Phase 4)
    quizMode: 'individual',
    teamMode: {
      teamCount: 2,
      teams: [
        { name: '', color: 'var(--cv-accent)', icon: '🚀' },
        { name: '', color: '#EF4444', icon: '☄️' }
      ],
      allowStudentChoice: true,
      autoBalance: true,
      lockOnStart: true
    }
  });

  // ✅ NEW (Phase 3): preset color swatches offered per team row — keeps the UI to a
  // one-click choice instead of a full color picker, matching the "under one minute to
  // configure" design requirement (§12.4)
  const TEAM_COLOR_PRESETS = ['var(--cv-accent)', '#EF4444', '#10B981', '#F59E0B'];

  // ✅ NEW (Phase 4): School House Mode's default preset — teacher can still rename/
  // recolor every field, this just saves them from starting on a blank form
  const SCHOOL_HOUSE_PRESETS = [
    { name: 'Red House',    color: '#EF4444', icon: '🔴' },
    { name: 'Blue House',   color: '#3B82F6', icon: '🔵' },
    { name: 'Green House',  color: '#10B981', icon: '🟢' },
    { name: 'Yellow House', color: '#F59E0B', icon: '🟡' }
  ];

  // Resizes settings.teamMode.teams to match a new team count (2-4), keeping any
  // already-filled rows intact rather than resetting everything. New rows are seeded
  // differently depending on the active mode (blank / auto-numbered / house preset).
  const handleTeamCountChange = (count) => {
    setSettings(prev => {
      const teams = [...prev.teamMode.teams];
      while (teams.length < count) {
        const i = teams.length;
        if (prev.quizMode === 'random_teams') {
          teams.push({ name: `Team ${i + 1}`, color: TEAM_COLOR_PRESETS[i % TEAM_COLOR_PRESETS.length], icon: '' });
        } else if (prev.quizMode === 'school_house' && SCHOOL_HOUSE_PRESETS[i]) {
          teams.push({ ...SCHOOL_HOUSE_PRESETS[i] });
        } else {
          teams.push({ name: '', color: TEAM_COLOR_PRESETS[i % TEAM_COLOR_PRESETS.length], icon: '' });
        }
      }
      teams.length = count; // trim if reduced
      return { ...prev, teamMode: { ...prev.teamMode, teamCount: count, teams } };
    });
  };

  const handleTeamFieldChange = (index, field, value) => {
    setSettings(prev => {
      const teams = [...prev.teamMode.teams];
      teams[index] = { ...teams[index], [field]: value };
      return { ...prev, teamMode: { ...prev.teamMode, teams } };
    });
  };

  // ✅ NEW (Phase 4 — TEAM_MODE_DESIGN.md §2 implementation note: "School House and
  // Custom Teams are the same underlying mechanism" — Random Teams reuses it too, just
  // with auto-generated names and no student choice). Applies the right defaults for
  // whichever mode the teacher just switched to.
  const handleQuizModeChange = (mode) => {
    setSettings(prev => {
      const count = prev.teamMode.teamCount || 2;
      let teams = prev.teamMode.teams;
      let allowStudentChoice = prev.teamMode.allowStudentChoice;

      if (mode === 'random_teams') {
        teams = Array.from({ length: 4 }, (_, i) => ({
          name: `Team ${i + 1}`,
          color: TEAM_COLOR_PRESETS[i % TEAM_COLOR_PRESETS.length],
          icon: ''
        }));
        allowStudentChoice = false; // the system distributes everyone automatically
      } else if (mode === 'school_house') {
        teams = SCHOOL_HOUSE_PRESETS.map(h => ({ ...h }));
        allowStudentChoice = true;
      } else if ((mode === 'team_battle' || mode === 'custom_teams') && (prev.quizMode === 'random_teams' || prev.quizMode === 'school_house')) {
        // Coming from an auto-populated mode — reset to blank rows for manual entry.
        // (Switching between team_battle <-> team_battle, or arriving fresh, keeps
        // whatever the teacher already typed.)
        teams = Array.from({ length: count }, (_, i) => ({
          name: '', color: TEAM_COLOR_PRESETS[i % TEAM_COLOR_PRESETS.length], icon: ''
        }));
        allowStudentChoice = true;
      }

      return { ...prev, quizMode: mode, teamMode: { ...prev.teamMode, teamCount: count, teams, allowStudentChoice } };
    });
  };
  
  // UI State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedQuizId, setGeneratedQuizId] = useState(null);

  // ========================================
  // UNDO/REDO SYSTEM
  // ========================================

  // Save current state to history
  const saveToHistory = (newQuestions) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newQuestions)));
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  // Undo action
  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setQuestions(JSON.parse(JSON.stringify(history[historyIndex - 1])));
    }
  };

  // Redo action
  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setQuestions(JSON.parse(JSON.stringify(history[historyIndex + 1])));
    }
  };

  // Initialize history when questions are generated
  useEffect(() => {
    if (questions.length > 0 && history.length === 0) {
      setHistory([JSON.parse(JSON.stringify(questions))]);
      setHistoryIndex(0);
    }
  }, [questions, history.length]);

  // ========================================
  // TIMER PREVIEW ANIMATION
  // ========================================

  const startPreviewTimer = () => {
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }

    const currentQ = questions[previewIndex];
    if (!currentQ) return;

    setPreviewTimer(currentQ.timeLimit || 45);

    timerInterval.current = setInterval(() => {
      setPreviewTimer(prev => {
        if (prev <= 1) {
          clearInterval(timerInterval.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopPreviewTimer = () => {
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }
    setPreviewTimer(null);
  };

  useEffect(() => {
    return () => {
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
      }
    };
  }, []);

  // ========================================
  // QUESTION OPERATIONS
  // ========================================

  // Add new question
  const handleAddQuestion = () => {
    const newQuestion = {
      questionText: 'New question',
      questionType: 'multiple_choice', // ✅ Default type
      options: ['Option 1', 'Option 2', 'Option 3', 'Option 4'],
      correctAnswer: 0,
      explanation: 'Explanation here',
      points: 10,
      timeLimit: 45,
      difficulty: 'medium'
    };
    const updated = [...questions, newQuestion];
    setQuestions(updated);
    saveToHistory(updated);
  };

  // Update question field
  const handleUpdateQuestion = (index, field, value) => {
    const updated = [...questions];
    updated[index][field] = value;
    
    // ✅ Handle question type change
    if (field === 'questionType') {
      if (value === 'fill_in_blank') {
        updated[index].options = []; // No options for fill in blank
        updated[index].correctAnswer = ''; // String answer
      } else if (value === 'true_false') {
        updated[index].options = ['True', 'False'];
        updated[index].correctAnswer = 0; // Default to True
      } else if (value === 'multiple_select') {
        updated[index].options = ['Option 1', 'Option 2', 'Option 3', 'Option 4'];
        updated[index].correctAnswer = [0]; // Array of indices
      } else {
        // multiple_choice
        updated[index].options = ['Option 1', 'Option 2', 'Option 3', 'Option 4'];
        updated[index].correctAnswer = 0;
      }
    }
    
    setQuestions(updated);
    saveToHistory(updated);
  };

  // Update option
  const handleUpdateOption = (qIndex, oIndex, value) => {
    const updated = [...questions];
    updated[qIndex].options[oIndex] = value;
    setQuestions(updated);
    saveToHistory(updated);
  };

  // Delete question
  const handleDeleteQuestion = (index) => {
    if (questions.length === 1) {
      alert('Cannot delete the last question!');
      return;
    }
    const updated = questions.filter((_, i) => i !== index);
    setQuestions(updated);
    saveToHistory(updated);
    
    if (previewIndex >= updated.length) {
      setPreviewIndex(Math.max(0, updated.length - 1));
    }
  };

  // Set correct answer (for multiple choice and true/false)
  const handleSetCorrectAnswer = (qIndex, oIndex) => {
    const updated = [...questions];
    const questionType = updated[qIndex].questionType;
    
    if (questionType === 'multiple_select') {
      // Toggle selection for multiple select
      const currentAnswers = Array.isArray(updated[qIndex].correctAnswer) 
        ? [...updated[qIndex].correctAnswer] 
        : [];
      
      if (currentAnswers.includes(oIndex)) {
        updated[qIndex].correctAnswer = currentAnswers.filter(i => i !== oIndex);
      } else {
        updated[qIndex].correctAnswer = [...currentAnswers, oIndex];
      }
    } else {
      // Single selection for multiple choice and true/false
      updated[qIndex].correctAnswer = oIndex;
    }
    
    setQuestions(updated);
    saveToHistory(updated);
  };

  // ========================================
  // API OPERATIONS
  // ========================================

  const fetchRecentTopics = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com'}/api/quiz/recent-topics`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setRecentTopics(data.topics || []);
      }
    } catch (error) {
      console.error('Failed to load recent topics:', error);
    }
  };

  useEffect(() => {
    fetchRecentTopics();
  }, []);

  // Generate quiz
  const handleGenerate = async () => {
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');

      if (inputMethod === 'file' && selectedFile) {
        // Generate from file
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('questionCount', questionCount);
        formData.append('groupId', groupId);
        formData.append('difficulty', difficulty);
        if (description.trim()) {
          formData.append('description', description.trim()); // ✅ Include description
        }

        const response = await fetch(
          `${process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com'}/api/quiz/generate-from-file`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
          }
        );

        const data = await response.json();

        if (response.ok) {
          setQuestions(data.quiz.questions);
          setGeneratedQuizId(data.quiz._id);
          setCurrentStep('questions');
        } else {
          setError(data.error || 'Failed to generate quiz');
        }
      } else if (inputMethod === 'url' && urlLink.trim()) {
        // ✅ NEW: Generate from URL (YouTube/Website)
        if (!description.trim()) {
          setError('Please provide a description to guide the AI');
          setLoading(false);
          return;
        }

        const response = await fetch(
          `${process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com'}/api/quiz/generate-from-url`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              url: urlLink.trim(),
              description: description.trim(),
              questionCount,
              groupId,
              difficulty
            })
          }
        );

        const data = await response.json();

        if (response.ok) {
          setQuestions(data.quiz.questions);
          setGeneratedQuizId(data.quiz._id);
          setCurrentStep('questions');
        } else {
          setError(data.error || 'Failed to generate quiz from URL. This feature may not be fully implemented yet.');
        }
      } else {
        // Generate from topic or pasted content
        const contentToUse = inputMethod === 'paste' ? pastedContent : topic;
        
        if (!contentToUse.trim()) {
          setError('Please enter a topic or paste content');
          setLoading(false);
          return;
        }

        const response = await fetch(
          `${process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com'}/api/quiz/generate`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              topic: contentToUse,
              questionCount,
              groupId,
              difficulty
            })
          }
        );

        const data = await response.json();

        if (response.ok) {
          setQuestions(data.quiz.questions);
          setGeneratedQuizId(data.quiz._id);
          setCurrentStep('questions');
        } else {
          setError(data.error || data.details || 'Failed to generate quiz');
        }
      }
    } catch (error) {
      console.error('Generate error:', error);
      setError('Failed to generate quiz. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // Save quiz

  // ✅ FIX — after saving, also start the session
    const handleSaveChanges = async (shouldStart = false) => {
      if (!generatedQuizId) return;

      // ✅ NEW (Phase 3/4): team names are required before any team-mode quiz can be
      // saved — catch it here rather than letting a session start with blank/duplicate
      // names. Random Teams always has auto-generated names by this point, so this
      // check passes trivially for it, but we still run it for consistency.
      if (settings.quizMode !== 'individual') {
        const activeTeams = settings.teamMode.teams.slice(0, settings.teamMode.teamCount);
        if (activeTeams.some(t => !t.name.trim())) {
          setError('Please name every team before saving (see Quiz Mode in Settings).');
          return;
        }
        const names = activeTeams.map(t => t.name.trim().toLowerCase());
        if (new Set(names).size !== names.length) {
          setError('Team names must be unique.');
          return;
        }
      }

      setLoading(true);

      try {
        const token = localStorage.getItem('token');

        // Step 1: Save quiz
        const saveResponse = await fetch(
          `${process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com'}/api/quiz/${generatedQuizId}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ questions, settings, status: 'ready' })
          }
        );

        const saveData = await saveResponse.json();
        if (!saveResponse.ok) {
          setError(saveData.error || 'Failed to save quiz');
          return;
        }

        // Step 2: If "Start Now" was clicked, create a session
        if (shouldStart) {
          const sessionResponse = await fetch(
            `${process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com'}/api/quiz/${generatedQuizId}/start-session`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              }
            }
          );

          const sessionData = await sessionResponse.json();
          if (!sessionResponse.ok) {
            setError(sessionData.error || 'Failed to start session');
            return;
          }

          if (onSuccess) onSuccess(sessionData.session); // ← passes session to App.js
        } else {
          if (onSuccess) onSuccess(null);
        }

        onClose();
      } catch (error) {
        setError('Failed to save quiz');
      } finally {
        setLoading(false);
      }
    };

  // ========================================
  // RENDER HELPERS
  // ========================================

  const getQuestionTypeLabel = (type) => {
    const labels = {
      'multiple_choice': 'Multiple Choice',
      'fill_in_blank': 'Fill in Blank',
      'true_false': 'True/False',
      'multiple_select': 'Multiple Select'
    };
    return labels[type] || 'Multiple Choice';
  };

  const renderQuestionEditor = (q, qIndex) => {
    const questionType = q.questionType || 'multiple_choice';

    return (
      <div key={qIndex} style={styles.questionCard}>
        <div style={styles.questionCardHeader}>
          <div style={styles.questionTypeRow}>
            <span style={styles.questionNumber}>{qIndex + 1}</span>
            
            {/* ✅ Question Type Selector */}
            <select
              value={questionType}
              onChange={(e) => handleUpdateQuestion(qIndex, 'questionType', e.target.value)}
              style={styles.questionTypeSelect}
            >
              <option value="multiple_choice">Multiple Choice</option>
              <option value="fill_in_blank">Fill in Blank</option>
              <option value="true_false">True/False</option>
              <option value="multiple_select">Multiple Select</option>
            </select>

            {/* ✅ Timer Editor */}
            <div style={styles.timerEditor}>
              <span>⏱️</span>
              <input
                type="number"
                value={q.timeLimit || 45}
                onChange={(e) => handleUpdateQuestion(qIndex, 'timeLimit', parseInt(e.target.value))}
                style={styles.timerInput}
                min="10"
                max="300"
              />
              <span style={styles.timerUnit}>s</span>
            </div>
          </div>
          
          <button 
            onClick={() => handleDeleteQuestion(qIndex)}
            style={styles.deleteBtn}
            title="Delete Question"
          >
            🗑️
          </button>
        </div>

        <input
          type="text"
          value={q.questionText}
          onChange={(e) => handleUpdateQuestion(qIndex, 'questionText', e.target.value)}
          style={styles.questionInput}
          placeholder="Enter question text..."
        />

        {/* ✅ Conditional Options Rendering */}
        {questionType === 'fill_in_blank' ? (
          <div style={styles.fillInBlankEditor}>
            <label style={styles.answerLabel}>Correct Answer:</label>
            <input
              type="text"
              value={q.correctAnswer || ''}
              onChange={(e) => handleUpdateQuestion(qIndex, 'correctAnswer', e.target.value)}
              placeholder="Type the correct answer (case-insensitive)"
              style={styles.fillInBlankInput}
            />
            <div style={styles.fillInBlankHint}>
              💡 Students will type their answer. Matching is case-insensitive.
            </div>
          </div>
        ) : (
          <div style={styles.optionsList}>
            {questionType === 'multiple_select' && (
              <div style={styles.multiSelectHint}>
                ℹ️ Check all correct answers (students can select multiple)
              </div>
            )}
            {q.options.map((opt, oIndex) => {
              const isCorrect = questionType === 'multiple_select'
                ? (Array.isArray(q.correctAnswer) && q.correctAnswer.includes(oIndex))
                : (q.correctAnswer === oIndex);

              return (
                <div key={oIndex} style={styles.optionRow}>
                  <input
                    type={questionType === 'multiple_select' ? 'checkbox' : 'radio'}
                    checked={isCorrect}
                    onChange={() => handleSetCorrectAnswer(qIndex, oIndex)}
                    style={styles.optionCheckbox}
                    name={`question-${qIndex}`}
                  />
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => handleUpdateOption(qIndex, oIndex, e.target.value)}
                    style={{
                      ...styles.optionInput,
                      backgroundColor: isCorrect ? '#E8F5E9' : '#fff',
                      fontWeight: isCorrect ? '600' : '400'
                    }}
                  />
                  {isCorrect && (
                    <span style={styles.correctBadge}>✓</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <button 
          onClick={() => setPreviewIndex(qIndex)} 
          style={styles.previewThisBtn}
        >
          👁️ Preview
        </button>
      </div>
    );
  };

  const renderLivePreview = () => {
    const currentQ = questions[previewIndex];
    if (!currentQ) return null;

    const questionType = currentQ.questionType || 'multiple_choice';
    const timeLimit = currentQ.timeLimit || 45;
    const isTimerRunning = previewTimer !== null;
    const timeRemainingDisplay = isTimerRunning ? previewTimer : timeLimit;

    return (
      <div style={styles.livePreview}>
        <div style={styles.previewHeader}>LIVE PREVIEW</div>
        <div style={styles.previewSubtitle}>Student View Experience</div>

        <div style={styles.phoneFrame}>
          <div style={styles.phoneNotch}></div>
          
          <div style={styles.phoneContent}>
            {/* Question Number & Timer */}
            <div style={styles.previewTopBar}>
              <div style={styles.previewQuestionNumber}>
                QUESTION {previewIndex + 1} OF {questions.length}
              </div>
              <div style={{
                ...styles.previewTimer,
                backgroundColor: timeRemainingDisplay <= 10 ? '#dc3545' : '#ff9800',
                animation: isTimerRunning && timeRemainingDisplay <= 10 ? 'pulse 1s infinite' : 'none'
              }}>
                ⏱️ {timeRemainingDisplay}s
              </div>
            </div>

            {/* Question Type Badge */}
            <div style={styles.previewTypeBadge}>
              {getQuestionTypeLabel(questionType)}
            </div>

            {/* Question Text */}
            <div style={styles.previewQuestionText}>
              {currentQ.questionText}
            </div>

            {/* Render Preview Based on Question Type */}
            {questionType === 'fill_in_blank' ? (
              <div style={styles.previewFillInBlank}>
                <input
                  type="text"
                  placeholder="Type your answer here..."
                  style={styles.previewFillInput}
                  disabled
                />
              </div>
            ) : (
              <div style={styles.previewOptions}>
                {questionType === 'multiple_select' && (
                  <div style={styles.previewMultiSelectHint}>
                    ℹ️ Select all correct answers
                  </div>
                )}
                {currentQ.options.map((opt, i) => (
                  <div key={i} style={styles.previewOption}>
                    {questionType === 'multiple_select' ? (
                      <div style={styles.previewCheckbox}></div>
                    ) : (
                      <span style={styles.previewOptionLabel}>
                        {String.fromCharCode(65 + i)}
                      </span>
                    )}
                    <span style={styles.previewOptionText}>{opt}</span>
                  </div>
                ))}
              </div>
            )}

            <button style={styles.previewNextBtn}>
              {questionType === 'fill_in_blank' ? 'Submit Answer' : 'Next Question'}
            </button>
          </div>
        </div>

        {/* Timer Controls */}
        <div style={styles.timerControls}>
          {!isTimerRunning ? (
            <button onClick={startPreviewTimer} style={styles.timerControlBtn}>
              ▶️ Start Timer
            </button>
          ) : (
            <button onClick={stopPreviewTimer} style={styles.timerControlBtn}>
              ⏸️ Stop Timer
            </button>
          )}
        </div>

        {/* Preview Navigation */}
        <div style={styles.previewNavigation}>
          <button 
            onClick={() => {
              stopPreviewTimer();
              setPreviewIndex(Math.max(0, previewIndex - 1));
            }}
            disabled={previewIndex === 0}
            style={styles.navBtn}
          >
            ← Previous
          </button>
          <span style={styles.navIndicator}>
            {previewIndex + 1} / {questions.length}
          </span>
          <button 
            onClick={() => {
              stopPreviewTimer();
              setPreviewIndex(Math.min(questions.length - 1, previewIndex + 1));
            }}
            disabled={previewIndex === questions.length - 1}
            style={styles.navBtn}
          >
            Next →
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Quiz Builder</h2>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        {/* Navigation Tabs */}
        <div style={styles.tabs}>
          <button 
            style={{...styles.tab, ...(currentStep === 'essentials' ? styles.tabActive : {})}}
            onClick={() => setCurrentStep('essentials')}
          >
            <span style={styles.tabIcon}>✓</span>
            Essentials
          </button>
          <button 
            style={{...styles.tab, ...(currentStep === 'questions' ? styles.tabActive : {})}}
            onClick={() => questions.length > 0 && setCurrentStep('questions')}
            disabled={questions.length === 0}
          >
            <span style={styles.tabIcon}>📋</span>
            Questions
          </button>
          <button 
            style={{...styles.tab, ...(currentStep === 'settings' ? styles.tabActive : {})}}
            onClick={() => questions.length > 0 && setCurrentStep('settings')}
            disabled={questions.length === 0}
          >
            <span style={styles.tabIcon}>⚙️</span>
            Settings
          </button>
          <button 
            style={{...styles.tab, ...(currentStep === 'assign' ? styles.tabActive : {})}}
            disabled
          >
            <span style={styles.tabIcon}>✈️</span>
            Assign
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {error && <div style={styles.error}>{error}</div>}

          {/* STEP 1: ESSENTIALS - Keep existing code */}
          {currentStep === 'essentials' && (
            <div style={styles.essentialsContainer}>
              <h3 style={styles.sectionTitle}>Create Your Quiz</h3>
              
              <div style={styles.inputMethodGroup}>
                <button
                  style={{...styles.inputMethodBtn, ...(inputMethod === 'topic' ? styles.inputMethodBtnActive : {})}}
                  onClick={() => setInputMethod('topic')}
                >
                  📝 Enter Topic
                </button>
                <button
                  style={{...styles.inputMethodBtn, ...(inputMethod === 'file' ? styles.inputMethodBtnActive : {})}}
                  onClick={() => setInputMethod('file')}
                >
                  📤 Upload File
                </button>
                <button
                  style={{...styles.inputMethodBtn, ...(inputMethod === 'url' ? styles.inputMethodBtnActive : {})}}
                  onClick={() => setInputMethod('url')}
                >
                  🔗 YouTube/Website
                </button>
                <button
                  style={{...styles.inputMethodBtn, ...(inputMethod === 'paste' ? styles.inputMethodBtnActive : {})}}
                  onClick={() => setInputMethod('paste')}
                >
                  📋 Paste Content
                </button>
              </div>

              {inputMethod === 'topic' && (
                <>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Quiz Topic *</label>
                    <input
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="e.g., Machine Learning Algorithms, Data Structures..."
                      style={styles.input}
                      autoFocus
                    />
                  </div>

                  {recentTopics.length > 0 && (
                    <div style={styles.suggestionsBox}>
                      <div style={styles.suggestionsTitle}>💡 Suggested Topics:</div>
                      <div style={styles.suggestionsList}>
                        {recentTopics.slice(0, 6).map((t, i) => (
                          <button
                            key={i}
                            onClick={() => setTopic(t)}
                            style={styles.suggestionChip}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {inputMethod === 'file' && (
                <>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Upload Document *</label>
                    <div style={styles.fileUpload}>
                      <input
                        type="file"
                        accept=".pdf,.docx,.doc,.txt"
                        onChange={(e) => setSelectedFile(e.target.files[0])}
                        style={styles.fileInput}
                        id="quiz-file-upload"
                      />
                      <label htmlFor="quiz-file-upload" style={styles.fileLabel}>
                        {selectedFile ? (
                          <span>📄 {selectedFile.name}</span>
                        ) : (
                          <span>📤 Choose PDF, DOCX, or TXT file</span>
                        )}
                      </label>
                    </div>
                    <div style={styles.fileHint}>
                      AI will analyze the document and generate questions based on the content
                    </div>
                  </div>

                  {/* ✅ NEW: Description for file */}
                  <div style={styles.formGroup}>
                    <label style={styles.label}>
                      Description (Optional)
                      <span style={styles.labelHint}> - Guide the AI on what to focus on</span>
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g., Focus on chapters 3-5, emphasize practical applications, create questions about key formulas..."
                      style={styles.textarea}
                      rows={3}
                    />
                    <div style={styles.fileHint}>
                      💡 This helps AI understand which parts to focus on or what type of questions to generate
                    </div>
                  </div>
                </>
              )}

              {/* ✅ NEW: URL Input (YouTube/Website) */}
              {inputMethod === 'url' && (
                <>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>YouTube or Website URL *</label>
                    <input
                      type="url"
                      value={urlLink}
                      onChange={(e) => setUrlLink(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=... or https://example.com/article"
                      style={styles.input}
                      autoFocus
                    />
                    <div style={styles.urlHint}>
                      <div style={styles.urlHintTitle}>✅ Supported:</div>
                      <div>• YouTube videos (will extract transcript)</div>
                      <div>• Educational websites and articles</div>
                      <div>• Documentation pages</div>
                    </div>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>
                      Description *
                      <span style={styles.labelHint}> - What should the quiz focus on?</span>
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g., Create questions about the main concepts explained in the video, focus on the tutorial steps, emphasize the key takeaways..."
                      style={styles.textarea}
                      rows={4}
                    />
                    <div style={styles.fileHint}>
                      💡 Describe what aspects of the content you want the quiz to cover
                    </div>
                  </div>
                </>
              )}

              {inputMethod === 'paste' && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Paste Your Content *</label>
                  <textarea
                    value={pastedContent}
                    onChange={(e) => setPastedContent(e.target.value)}
                    placeholder="Paste notes, articles, or any educational content here..."
                    style={styles.textarea}
                    rows={8}
                  />
                </div>
              )}

              <div style={styles.optionsRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Number of Questions</label>
                  <select value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} style={styles.select}>
                    <option value={5}>5 questions</option>
                    <option value={10}>10 questions</option>
                    <option value={15}>15 questions</option>
                    <option value={20}>20 questions</option>
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Difficulty Level</label>
                  <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={styles.select}>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                    <option value="expert">Expert</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={
                  loading || 
                  (inputMethod === 'topic' && !topic.trim()) || 
                  (inputMethod === 'file' && !selectedFile) || 
                  (inputMethod === 'url' && (!urlLink.trim() || !description.trim())) ||
                  (inputMethod === 'paste' && !pastedContent.trim())
                }
                style={styles.generateBtn}
              >
                {loading ? '🤖 Generating Quiz...' : '🚀 Generate Quiz with AI'}
              </button>
            </div>
          )}

          {/* STEP 2: QUESTIONS */}
          {currentStep === 'questions' && (
            <div style={styles.questionsContainer}>
              {/* Left Panel: Question Bank */}
              <div style={styles.questionBank}>
                <div style={styles.questionBankHeader}>
                  <h3 style={styles.questionBankTitle}>Question Bank</h3>
                  <div style={styles.headerActions}>
                    {/* ✅ Undo/Redo Buttons */}
                    <button 
                      onClick={handleUndo}
                      disabled={historyIndex <= 0}
                      style={{
                        ...styles.undoRedoBtn,
                        opacity: historyIndex <= 0 ? 0.4 : 1,
                        cursor: historyIndex <= 0 ? 'not-allowed' : 'pointer'
                      }}
                      title="Undo"
                    >
                      ↶
                    </button>
                    <button 
                      onClick={handleRedo}
                      disabled={historyIndex >= history.length - 1}
                      style={{
                        ...styles.undoRedoBtn,
                        opacity: historyIndex >= history.length - 1 ? 0.4 : 1,
                        cursor: historyIndex >= history.length - 1 ? 'not-allowed' : 'pointer'
                      }}
                      title="Redo"
                    >
                      ↷
                    </button>
                    <button onClick={handleAddQuestion} style={styles.addQuestionBtn}>
                      + Add Question
                    </button>
                  </div>
                </div>
                <div style={styles.questionBankSubtitle}>
                  {questions.length} question{questions.length !== 1 ? 's' : ''} added so far
                </div>

                <div style={styles.questionsList}>
                  {questions.map((q, qIndex) => renderQuestionEditor(q, qIndex))}
                </div>
              </div>

              {/* Right Panel: Live Preview */}
              {renderLivePreview()}
            </div>
          )}

          {/* STEP 3: SETTINGS - Keep existing code */}
          {currentStep === 'settings' && (
            <div style={styles.settingsContainer}>
              <h3 style={styles.sectionTitle}>Quiz Settings</h3>

              {/* ✅ NEW (Phase 3 — TEAM_MODE_DESIGN.md §12): Quiz Mode card, placed above
                  the existing checkboxes per the progressive-disclosure layout — nothing
                  below changes when Individual is selected (today's default, unchanged). */}
              <div style={styles.quizModeCard}>
                <div style={styles.quizModeTitle}>🎮 Quiz Mode</div>
                <div style={styles.quizModeOptions}>
                  <div
                    onClick={() => handleQuizModeChange('individual')}
                    style={{ ...styles.quizModeOption, ...(settings.quizMode === 'individual' ? styles.quizModeOptionActive : {}) }}
                  >
                    <div style={styles.quizModeOptionTitle}>👤 Individual Mode</div>
                    <div style={styles.quizModeOptionDesc}>Every student competes independently. Best for exams and practice.</div>
                  </div>
                  <div
                    onClick={() => handleQuizModeChange('team_battle')}
                    style={{ ...styles.quizModeOption, ...(settings.quizMode === 'team_battle' ? styles.quizModeOptionActive : {}) }}
                  >
                    <div style={styles.quizModeOptionTitle}>⚔️ Team Battle</div>
                    <div style={styles.quizModeOptionDesc}>You name the teams. Team leaderboard shown after every question.</div>
                  </div>
                  {/* ✅ NEW (Phase 4) */}
                  <div
                    onClick={() => handleQuizModeChange('random_teams')}
                    style={{ ...styles.quizModeOption, ...(settings.quizMode === 'random_teams' ? styles.quizModeOptionActive : {}) }}
                  >
                    <div style={styles.quizModeOptionTitle}>🎲 Random Teams</div>
                    <div style={styles.quizModeOptionDesc}>Just pick how many teams — students are distributed automatically and fairly.</div>
                  </div>
                  <div
                    onClick={() => handleQuizModeChange('school_house')}
                    style={{ ...styles.quizModeOption, ...(settings.quizMode === 'school_house' ? styles.quizModeOptionActive : {}) }}
                  >
                    <div style={styles.quizModeOptionTitle}>🏠 School House</div>
                    <div style={styles.quizModeOptionDesc}>Starts with Red/Blue/Green/Yellow House — rename if your school uses different ones.</div>
                  </div>
                  {/* ✅ NEW: restored as its own mode — same team-editing UI as Team
                      Battle underneath, but a different teacher intent: "I already have
                      groups" (school houses, class sections, departments) vs. "set up a
                      competition." Distinct enough to matter for how teachers scan this list. */}
                  <div
                    onClick={() => handleQuizModeChange('custom_teams')}
                    style={{ ...styles.quizModeOption, ...(settings.quizMode === 'custom_teams' ? styles.quizModeOptionActive : {}) }}
                  >
                    <div style={styles.quizModeOptionTitle}>🛠 Custom Teams</div>
                    <div style={styles.quizModeOptionDesc}>You already have groups — sections, houses, departments. Name them exactly as they are.</div>
                  </div>
                </div>

                {/* Team setup — appears for any non-Individual mode */}
                {settings.quizMode !== 'individual' && (
                  <div style={styles.teamSetup}>
                    <div style={styles.teamSetupRow}>
                      <span style={styles.teamSetupLabel}>Number of teams</span>
                      <div style={styles.teamCountButtons}>
                        {[2, 3, 4].map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => handleTeamCountChange(n)}
                            style={{ ...styles.teamCountBtn, ...(settings.teamMode.teamCount === n ? styles.teamCountBtnActive : {}) }}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* ✅ NEW (Phase 4): Random Teams needs no name/color input at all —
                        names are auto-generated and there's nothing for the teacher to
                        configure per-team. Team Battle and School House both show the
                        same editable rows, just with different starting values. */}
                    {settings.quizMode === 'random_teams' ? (
                      <p style={styles.randomTeamsNote}>
                        Teams will be named "Team 1", "Team 2"... and students will be spread across them evenly and automatically — nobody picks their own team in this mode.
                      </p>
                    ) : (
                      <div style={styles.teamRows}>
                        {settings.teamMode.teams.slice(0, settings.teamMode.teamCount).map((team, i) => (
                          <div key={i} style={styles.teamRow}>
                            <input
                              type="text"
                              value={team.icon}
                              onChange={(e) => handleTeamFieldChange(i, 'icon', e.target.value)}
                              placeholder="🚀"
                              maxLength={2}
                              style={styles.teamIconInput}
                            />
                            <input
                              type="text"
                              value={team.name}
                              onChange={(e) => handleTeamFieldChange(i, 'name', e.target.value)}
                              placeholder={`Team ${i + 1} name`}
                              maxLength={30}
                              style={styles.teamNameInput}
                            />
                            <div style={styles.teamColorSwatches}>
                              {TEAM_COLOR_PRESETS.map(c => (
                                <div
                                  key={c}
                                  onClick={() => handleTeamFieldChange(i, 'color', c)}
                                  style={{
                                    ...styles.teamColorSwatch,
                                    backgroundColor: c,
                                    ...(team.color === c ? styles.teamColorSwatchActive : {})
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={styles.teamTogglesList}>
                      {[
                        // Allow-choice toggle doesn't apply to Random Teams — that whole
                        // mode's point is that nobody picks, so it's hidden there instead
                        // of shown-but-forced-off (less confusing than a disabled checkbox)
                        ...(settings.quizMode !== 'random_teams'
                          ? [{ key: 'allowStudentChoice', label: 'Allow students to choose their own team' }]
                          : []),
                        { key: 'autoBalance', label: 'Keep teams balanced automatically' },
                        { key: 'lockOnStart', label: 'Lock teams once the quiz starts' }
                      ].map(t => (
                        <label key={t.key} style={styles.settingLabel}>
                          <input
                            type="checkbox"
                            checked={settings.teamMode[t.key]}
                            onChange={(e) => setSettings({
                              ...settings,
                              teamMode: { ...settings.teamMode, [t.key]: e.target.checked }
                            })}
                            style={styles.settingCheckbox}
                          />
                          {t.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div style={styles.settingsList}>
                {[
                  { key: 'showCorrectAnswer', label: 'Show correct answer after each question' },
                  { key: 'showLeaderboard', label: 'Display leaderboard after each question' },
                  { key: 'allowLateJoin', label: 'Allow students to join after quiz starts' },
                  { key: 'shuffleQuestions', label: 'Randomize question order for each student' },
                  { key: 'shuffleOptions', label: 'Shuffle answer options (prevents cheating)' }
                ].map(setting => (
                  <div key={setting.key} style={styles.settingItem}>
                    <label style={styles.settingLabel}>
                      <input
                        type="checkbox"
                        checked={settings[setting.key]}
                        onChange={(e) => setSettings({...settings, [setting.key]: e.target.checked})}
                        style={styles.settingCheckbox}
                      />
                      {setting.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={styles.footer}>
          {currentStep === 'essentials' && (
            <button onClick={onClose} style={styles.cancelBtn}>Cancel</button>
          )}
          
          {currentStep === 'questions' && (
            <>
              <button onClick={() => setCurrentStep('essentials')} style={styles.backBtn}>
                ← Back to Essentials
              </button>
              <button onClick={() => setCurrentStep('settings')} style={styles.nextBtn}>
                Configure Rules →
              </button>
            </>
          )}

          {currentStep === 'settings' && (
            <>
              <button onClick={() => setCurrentStep('questions')} style={styles.backBtn}>
                ← Back
              </button>
              <div style={styles.footerActions}>
                <button onClick={() => handleSaveChanges(false)} disabled={loading} style={styles.saveBtn}>
                  {loading ? 'Saving...' : 'Save Draft'}
                </button>
                <button onClick={() => handleSaveChanges(true)} disabled={loading} style={styles.publishBtn}>
                  {loading ? 'Publishing...' : '🚀 Start Quiz Now'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ========================================
// STYLES
// ========================================

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    backdropFilter: 'blur(4px)'
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '16px',
    width: '95%',
    maxWidth: '1400px',
    maxHeight: '95vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    overflow: 'hidden'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px 32px',
    borderBottom: '2px solid #f0f0f0',
    backgroundColor: '#fff'
  },
  title: {
    margin: 0,
    fontSize: '24px',
    fontWeight: '700',
    color: '#1a1a1a'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '28px',
    cursor: 'pointer',
    color: '#666',
    padding: '4px 12px',
    borderRadius: '8px'
  },
  tabs: {
    display: 'flex',
    borderBottom: '2px solid #f0f0f0',
    backgroundColor: '#fafafa',
    padding: '0 32px'
  },
  tab: {
    padding: '16px 32px',
    border: 'none',
    background: 'none',
    fontSize: '15px',
    fontWeight: '600',
    color: '#666',
    cursor: 'pointer',
    borderBottom: '3px solid transparent',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  tabActive: {
    color: 'var(--cv-accent)',
    borderBottomColor: 'var(--cv-accent)',
    backgroundColor: '#fff'
  },
  tabIcon: {
    fontSize: '18px'
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '32px',
    backgroundColor: '#fafafa'
  },
  error: {
    padding: '16px',
    backgroundColor: '#FEE2E2',
    color: '#DC2626',
    borderRadius: '12px',
    marginBottom: '24px',
    fontSize: '14px',
    fontWeight: '500',
    border: '1px solid #FCA5A5'
  },

  // Essentials - Keep existing styles
  essentialsContainer: {
    maxWidth: '800px',
    margin: '0 auto'
  },
  sectionTitle: {
    fontSize: '22px',
    fontWeight: '700',
    marginBottom: '24px',
    color: '#1a1a1a'
  },
  inputMethodGroup: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)', // ✅ Changed from 3 to 4
    gap: '12px',
    marginBottom: '32px'
  },
  inputMethodBtn: {
    padding: '16px',
    border: '2px solid #e0e0e0',
    borderRadius: '12px',
    background: '#fff',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    color: '#666'
  },
  inputMethodBtnActive: {
    borderColor: 'var(--cv-accent)',
    backgroundColor: 'var(--cv-accent-light)',
    color: 'var(--cv-accent)'
  },
  formGroup: {
    marginBottom: '24px'
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151'
  },
  labelHint: {
    fontSize: '12px',
    fontWeight: '400',
    color: '#6b7280',
    marginLeft: '4px'
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    fontSize: '15px',
    border: '2px solid #e0e0e0',
    borderRadius: '10px',
    outline: 'none',
    fontFamily: 'inherit'
  },
  select: {
    width: '100%',
    padding: '14px 16px',
    fontSize: '15px',
    border: '2px solid #e0e0e0',
    borderRadius: '10px',
    outline: 'none',
    backgroundColor: '#fff',
    cursor: 'pointer'
  },
  textarea: {
    width: '100%',
    padding: '14px 16px',
    fontSize: '15px',
    border: '2px solid #e0e0e0',
    borderRadius: '10px',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit'
  },
  fileUpload: {
    position: 'relative'
  },
  fileInput: {
    position: 'absolute',
    opacity: 0,
    width: '100%',
    height: '100%',
    cursor: 'pointer'
  },
  fileLabel: {
    display: 'block',
    padding: '20px',
    border: '2px dashed #cbd5e0',
    borderRadius: '12px',
    textAlign: 'center',
    cursor: 'pointer',
    backgroundColor: '#fff',
    fontSize: '15px',
    fontWeight: '500',
    color: '#4b5563'
  },
  fileHint: {
    marginTop: '8px',
    fontSize: '13px',
    color: '#6b7280',
    fontStyle: 'italic'
  },
  urlHint: {
    marginTop: '12px',
    padding: '12px',
    backgroundColor: 'var(--cv-accent-light)',
    borderRadius: '8px',
    fontSize: '13px',
    color: '#4b5563',
    border: '1px solid #C7D2FE'
  },
  urlHintTitle: {
    fontWeight: '600',
    marginBottom: '8px',
    color: 'var(--cv-accent)'
  },
  suggestionsBox: {
    padding: '20px',
    backgroundColor: '#FEF3C7',
    borderRadius: '12px',
    marginBottom: '24px',
    border: '1px solid #FDE68A'
  },
  suggestionsTitle: {
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '12px',
    color: '#92400E'
  },
  suggestionsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px'
  },
  suggestionChip: {
    padding: '8px 16px',
    border: '1px solid #FCD34D',
    borderRadius: '20px',
    background: '#fff',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    color: '#92400E'
  },
  optionsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '20px',
    marginBottom: '32px'
  },
  generateBtn: {
    width: '100%',
    padding: '18px',
    fontSize: '16px',
    fontWeight: '700',
    backgroundColor: 'var(--cv-accent)',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
  },

  // Questions Panel
  questionsContainer: {
    display: 'grid',
    gridTemplateColumns: '1.5fr 1fr',
    gap: '32px',
    height: 'calc(95vh - 300px)'
  },
  questionBank: {
    display: 'flex',
    flexDirection: 'column'
  },
  questionBankHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px'
  },
  questionBankTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: 0
  },
  headerActions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center'
  },
  // ✅ Undo/Redo Buttons
  undoRedoBtn: {
    width: '40px',
    height: '40px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    background: '#fff',
    fontSize: '20px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s'
  },
  addQuestionBtn: {
    padding: '10px 20px',
    border: '2px solid var(--cv-accent)',
    borderRadius: '10px',
    background: '#fff',
    color: 'var(--cv-accent)',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  questionBankSubtitle: {
    fontSize: '13px',
    color: '#6b7280',
    marginBottom: '20px'
  },
  questionsList: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    paddingRight: '8px'
  },
  questionCard: {
    backgroundColor: '#fff',
    border: '2px solid #e5e7eb',
    borderRadius: '12px',
    padding: '20px'
  },
  questionCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px'
  },
  questionTypeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  questionNumber: {
    backgroundColor: 'var(--cv-accent)',
    color: '#fff',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '700'
  },
  // ✅ Question Type Dropdown
  questionTypeSelect: {
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '600',
    border: '1px solid #e0e0e0',
    borderRadius: '6px',
    backgroundColor: '#fff',
    color: '#4b5563',
    cursor: 'pointer',
    outline: 'none'
  },
  // ✅ Timer Editor
  timerEditor: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    border: '1px solid #e0e0e0',
    borderRadius: '6px',
    backgroundColor: '#fff'
  },
  timerInput: {
    width: '50px',
    padding: '4px',
    fontSize: '13px',
    fontWeight: '600',
    border: 'none',
    outline: 'none',
    textAlign: 'center'
  },
  timerUnit: {
    fontSize: '12px',
    color: '#6b7280',
    fontWeight: '600'
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '6px'
  },
  questionInput: {
    width: '100%',
    padding: '12px',
    fontSize: '15px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    marginBottom: '16px',
    fontWeight: '500',
    outline: 'none'
  },
  // ✅ Fill in Blank Editor
  fillInBlankEditor: {
    marginBottom: '16px'
  },
  answerLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#374151',
    marginBottom: '8px',
    display: 'block'
  },
  fillInBlankInput: {
    width: '100%',
    padding: '12px',
    fontSize: '15px',
    border: '2px solid var(--cv-accent)',
    borderRadius: '8px',
    outline: 'none',
    backgroundColor: 'var(--cv-accent-light)'
  },
  fillInBlankHint: {
    marginTop: '8px',
    fontSize: '12px',
    color: '#6b7280',
    fontStyle: 'italic'
  },
  multiSelectHint: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--cv-accent)',
    marginBottom: '12px',
    padding: '8px 12px',
    backgroundColor: 'var(--cv-accent-light)',
    borderRadius: '6px'
  },
  optionsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '12px'
  },
  optionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    position: 'relative'
  },
  optionCheckbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
    accentColor: '#10B981'
  },
  optionInput: {
    flex: 1,
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    outline: 'none'
  },
  correctBadge: {
    position: 'absolute',
    right: '12px',
    fontSize: '16px',
    color: '#10B981'
  },
  previewThisBtn: {
    padding: '8px 16px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    background: '#fff',
    fontSize: '13px',
    fontWeight: '600',
    color: '#4b5563',
    cursor: 'pointer'
  },

  // Live Preview
  livePreview: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  previewHeader: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#6b7280',
    letterSpacing: '1px',
    marginBottom: '4px'
  },
  previewSubtitle: {
    fontSize: '13px',
    color: '#9ca3af',
    marginBottom: '24px'
  },
  phoneFrame: {
    width: '320px',
    height: '640px',
    border: '12px solid #1f2937',
    borderRadius: '36px',
    backgroundColor: '#fff',
    boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
    position: 'relative',
    overflow: 'hidden'
  },
  phoneNotch: {
    width: '140px',
    height: '28px',
    backgroundColor: '#1f2937',
    borderRadius: '0 0 20px 20px',
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1
  },
  phoneContent: {
    padding: '50px 24px 24px',
    height: '100%',
    overflowY: 'auto'
  },
  previewTopBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  previewQuestionNumber: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--cv-accent)',
    letterSpacing: '0.5px'
  },
  // ✅ Animated Timer
  previewTimer: {
    padding: '6px 12px',
    borderRadius: '16px',
    fontSize: '13px',
    fontWeight: '700',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  previewTypeBadge: {
    display: 'inline-block',
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: '600',
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
    borderRadius: '12px',
    marginBottom: '12px'
  },
  previewQuestionText: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: '24px',
    lineHeight: '1.5'
  },
  // ✅ Fill in Blank Preview
  previewFillInBlank: {
    marginBottom: '24px'
  },
  previewFillInput: {
    width: '100%',
    padding: '14px',
    fontSize: '15px',
    border: '2px solid #e0e0e0',
    borderRadius: '10px',
    outline: 'none'
  },
  previewMultiSelectHint: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--cv-accent)',
    marginBottom: '12px',
    padding: '8px',
    backgroundColor: 'var(--cv-accent-light)',
    borderRadius: '6px',
    textAlign: 'center'
  },
  previewOptions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '24px'
  },
  previewOption: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px',
    border: '2px solid #e5e7eb',
    borderRadius: '10px',
    backgroundColor: '#fff'
  },
  previewCheckbox: {
    width: '20px',
    height: '20px',
    border: '2px solid #9ca3af',
    borderRadius: '4px',
    flexShrink: 0
  },
  previewOptionLabel: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '700',
    color: '#4b5563',
    flexShrink: 0
  },
  previewOptionText: {
    fontSize: '14px',
    color: '#374151',
    lineHeight: '1.4'
  },
  previewNextBtn: {
    width: '100%',
    padding: '14px',
    backgroundColor: 'var(--cv-accent)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer'
  },
  // ✅ Timer Controls
  timerControls: {
    marginTop: '16px',
    marginBottom: '12px'
  },
  timerControlBtn: {
    padding: '10px 24px',
    border: '2px solid var(--cv-accent)',
    borderRadius: '8px',
    background: '#fff',
    color: 'var(--cv-accent)',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  previewNavigation: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    marginTop: '20px',
    width: '320px'
  },
  navBtn: {
    padding: '10px 20px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    background: '#fff',
    fontSize: '14px',
    fontWeight: '600',
    color: '#4b5563',
    cursor: 'pointer'
  },
  navIndicator: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#6b7280'
  },

  // Settings
  settingsContainer: {
    maxWidth: '800px',
    margin: '0 auto'
  },
  settingsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  settingItem: {
    padding: '20px',
    backgroundColor: '#fff',
    border: '2px solid #e5e7eb',
    borderRadius: '12px'
  },
  settingLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '15px',
    fontWeight: '500',
    color: '#374151',
    cursor: 'pointer',
    userSelect: 'none'
  },
  settingCheckbox: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
    accentColor: 'var(--cv-accent)'
  },

  // ✅ NEW (Phase 3): Quiz Mode card + team setup
  quizModeCard: {
    padding: '20px',
    backgroundColor: '#fff',
    border: '2px solid #e5e7eb',
    borderRadius: '12px',
    marginBottom: '16px'
  },
  quizModeTitle: { fontSize: '16px', fontWeight: '700', color: '#1F2937', marginBottom: '14px' },
  quizModeOptions: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' },
  quizModeOption: {
    padding: '16px', borderRadius: '10px', border: '2px solid #e5e7eb',
    cursor: 'pointer', transition: 'all 0.15s'
  },
  quizModeOptionActive: { border: '2px solid var(--cv-accent)', backgroundColor: 'var(--cv-accent-light)' },
  quizModeOptionTitle: { fontSize: '15px', fontWeight: '700', color: '#1F2937', marginBottom: '4px' },
  quizModeOptionDesc: { fontSize: '13px', color: '#6B7280', lineHeight: '1.4' },

  teamSetup: {
    marginTop: '18px', paddingTop: '18px', borderTop: '2px solid #f0f0f0',
    display: 'flex', flexDirection: 'column', gap: '16px'
  },
  teamSetupRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  teamSetupLabel: { fontSize: '14px', fontWeight: '600', color: '#374151' },
  teamCountButtons: { display: 'flex', gap: '8px' },
  teamCountBtn: {
    width: '36px', height: '36px', borderRadius: '8px', border: '2px solid #e5e7eb',
    backgroundColor: '#fff', color: '#374151', fontWeight: '700', cursor: 'pointer'
  },
  teamCountBtnActive: { border: '2px solid var(--cv-accent)', backgroundColor: 'var(--cv-accent)', color: '#fff' },

  teamRows: { display: 'flex', flexDirection: 'column', gap: '10px' },
  teamRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  teamIconInput: {
    width: '44px', height: '40px', textAlign: 'center', fontSize: '18px',
    border: '2px solid #e5e7eb', borderRadius: '8px'
  },
  teamNameInput: {
    flex: 1, height: '40px', padding: '0 12px', fontSize: '14px',
    border: '2px solid #e5e7eb', borderRadius: '8px'
  },
  teamColorSwatches: { display: 'flex', gap: '6px', flexShrink: 0 },
  teamColorSwatch: {
    width: '24px', height: '24px', borderRadius: '50%', cursor: 'pointer',
    border: '2px solid transparent'
  },
  teamColorSwatchActive: { border: '2px solid #1F2937', boxShadow: '0 0 0 2px #fff inset' },

  teamTogglesList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  // ✅ NEW (Phase 4)
  randomTeamsNote: { fontSize: '13px', color: '#6B7280', lineHeight: '1.5', margin: 0, padding: '12px 14px', backgroundColor: '#F9FAFB', borderRadius: '8px' },

  // Footer
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px 32px',
    borderTop: '2px solid #f0f0f0',
    backgroundColor: '#fff'
  },
  cancelBtn: {
    padding: '12px 24px',
    border: '2px solid #e5e7eb',
    borderRadius: '10px',
    background: '#fff',
    fontSize: '15px',
    fontWeight: '600',
    color: '#6b7280',
    cursor: 'pointer'
  },
  backBtn: {
    padding: '12px 24px',
    border: '2px solid #e5e7eb',
    borderRadius: '10px',
    background: '#fff',
    fontSize: '15px',
    fontWeight: '600',
    color: '#4b5563',
    cursor: 'pointer'
  },
  nextBtn: {
    padding: '12px 32px',
    border: 'none',
    borderRadius: '10px',
    background: 'var(--cv-accent)',
    fontSize: '15px',
    fontWeight: '700',
    color: '#fff',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
  },
  footerActions: {
    display: 'flex',
    gap: '12px'
  },
  saveBtn: {
    padding: '12px 24px',
    border: '2px solid var(--cv-accent)',
    borderRadius: '10px',
    background: '#fff',
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--cv-accent)',
    cursor: 'pointer'
  },
  publishBtn: {
    padding: '12px 32px',
    border: 'none',
    borderRadius: '10px',
    background: '#10B981',
    fontSize: '15px',
    fontWeight: '700',
    color: '#fff',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
  }
};

// Add CSS animations
const styleSheet = document.styleSheets[0];
if (styleSheet) {
  try {
    styleSheet.insertRule(`
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
    `, styleSheet.cssRules.length);
  } catch (e) {
    console.log('Animation already defined');
  }
}

export default QuizCreator;