// src/components/MessageInput.js
// ✅ UI REDESIGN — Visily-style message input
//
// Visual changes only (ALL functional logic unchanged):
//   1. Container: clean white, light border-top (no more gray #F0F0F0)
//   2. Input card: white rounded card with subtle border + shadow
//   3. Button order: [👥 people icon] [input] [send ▶] [+ attach]
//   4. Send button: dark slate circle (#1e293b) instead of green
//   5. Plus button: dark slate circle, moved to RIGHT side
//   6. File/recipient popup positions adjusted to match new button positions
//   7. Poll modal, file upload, recipient logic — 100% UNCHANGED

import React, { useState, useRef, useEffect } from 'react';
import { uploadFile } from '../api';

const MessageInput = ({
  onSendMessage,
  onTyping,
  onStopTyping,
  disabled       = false,
  isAdmin        = false,
  members        = [],
  moderatedChat  = false,
  adminId        = null
}) => {
  const [message,           setMessage]           = useState('');
  const [showFileMenu,      setShowFileMenu]      = useState(false);
  const [showRecipients,    setShowRecipients]    = useState(false);
  const [selectedRecipients,setSelectedRecipients]= useState([]);
  const [uploading,        setUploading]        = useState(false);
  const [uploadProgress,   setUploadProgress]   = useState(0);
  const [showPollCreator,  setShowPollCreator]  = useState(false);
  const [pollQuestion,     setPollQuestion]     = useState('');
  const [pollOptions,      setPollOptions]      = useState(['', '']);

  const typingTimeoutRef = useRef(null);
  const inputRef         = useRef(null);
  const fileInputRef     = useRef(null);

  // ── Typing detection — UNCHANGED ────────────────────────────────────────
  const handleInputChange = (e) => {
    const value = e.target.value;
    setMessage(value);
    if (value.trim() && onTyping) {
      onTyping();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        if (onStopTyping) onStopTyping();
      }, 2000);
    }
  };

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    const messageData = {
      content: message.trim(),
      messageType: selectedRecipients.length ? 'private' : 'text',
      recipientIds: selectedRecipients.map(r => r._id)
    };
    if (onSendMessage) onSendMessage(messageData);
    setMessage('');
    setSelectedRecipients([]);
    if (onStopTyping) onStopTyping();
    inputRef.current?.focus();
  };

  // ── File handling — UNCHANGED ────────────────────────────────────────────
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert('File too large! Maximum size is 10MB'); return; }
    const allowed = /\.(jpg|jpeg|png|gif|mp4|mov|avi|pdf|doc|docx|txt|mp3|wav|m4a|ogg)$/i;
    if (!allowed.test(file.name)) { alert('Invalid file type! Allowed: Images, Videos, PDFs, Documents, Audio'); return; }

    setUploading(true);
    setUploadProgress(0);
    try {
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) { clearInterval(progressInterval); return 90; }
          return prev + 10;
        });
      }, 200);
      const response = await uploadFile(file);
      clearInterval(progressInterval);
      setUploadProgress(100);
      if (response.success) {
        const fileMessage = {
          content: file.name,
          messageType: 'file',
          fileUrl:   response.file.url,
          fileName:  response.file.name,
          fileSize:  response.file.size,
          fileType:  response.file.type,
          recipientIds: selectedRecipients.map(r => r._id)
        };
        if (onSendMessage) onSendMessage(fileMessage);
        setSelectedRecipients([]);
      }
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setShowFileMenu(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileMenuClick = (type) => {
    setShowFileMenu(false);
    if (!fileInputRef.current) return;
    if (type === 'camera') {
      fileInputRef.current.setAttribute('capture', 'environment');
      fileInputRef.current.setAttribute('accept', 'image/*,video/*');
      fileInputRef.current.click();
    } else if (type === 'document') {
      fileInputRef.current.removeAttribute('capture');
      fileInputRef.current.setAttribute('accept', '.pdf,.doc,.docx,.txt');
      fileInputRef.current.click();
    } else if (type === 'photos') {
      fileInputRef.current.removeAttribute('capture');
      fileInputRef.current.setAttribute('accept', 'image/*,video/*');
      fileInputRef.current.click();
    } else if (type === 'audio') {
      fileInputRef.current.removeAttribute('capture');
      fileInputRef.current.setAttribute('accept', 'audio/*,.mp3,.wav,.m4a,.ogg');
      fileInputRef.current.click();
    } else if (type === 'poll') {
      setShowPollCreator(true);
    }
  };

  // ── Poll logic — UNCHANGED ────────────────────────────────────────────────
  const handlePollOptionChange = (index, value) => {
    const updated = [...pollOptions];
    updated[index] = value;
    setPollOptions(updated);
  };
  const addPollOption    = () => { if (pollOptions.length < 10) setPollOptions([...pollOptions, '']); };
  const removePollOption = (i) => { if (pollOptions.length > 2) setPollOptions(pollOptions.filter((_, idx) => idx !== i)); };
  const handleCreatePoll = () => {
    if (!pollQuestion.trim()) { alert('Please enter a poll question'); return; }
    const valid = pollOptions.filter(o => o.trim());
    if (valid.length < 2) { alert('Please provide at least 2 options'); return; }
    const pollMessage = {
      content: pollQuestion.trim(),
      messageType: 'poll',
      pollOptions: valid,
      recipientIds: selectedRecipients.map(r => r._id)
    };
    if (onSendMessage) onSendMessage(pollMessage);
    setPollQuestion('');
    setPollOptions(['', '']);
    setShowPollCreator(false);
    setSelectedRecipients([]);
  };
  const cancelPoll = () => { setPollQuestion(''); setPollOptions(['', '']); setShowPollCreator(false); };

  // ── Recipient (multi-select — Teacher Moderated Chat) ─────────────────────
  const toggleRecipient = (member) => {
    setSelectedRecipients(prev =>
      prev.some(r => r._id === member._id)
        ? prev.filter(r => r._id !== member._id)
        : [...prev, member]
    );
    inputRef.current?.focus();
  };
  const recipientMembers = members.filter(m => m._id !== adminId);
  const showRecipientPicker = isAdmin && moderatedChat;

  useEffect(() => {
    return () => { if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); };
  }, []);

  // ── Placeholder text ──────────────────────────────────────────────────────
  const placeholder = uploading
    ? 'Uploading...'
    : selectedRecipients.length === 1
      ? `Private message to ${selectedRecipients[0].username || selectedRecipients[0].name}...`
      : selectedRecipients.length > 1
        ? `Private message to ${selectedRecipients.length} students...`
        : 'Type a message to the class...';

  // ════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════════════════
  const isDarkMode = document.body.classList.contains('dark-mode');
  return (
    <div style={{ ...S.container, backgroundColor: isDarkMode?'#1e293b':'#ffffff', borderTop: isDarkMode?'1px solid #334155':'1px solid #e2e8f0' }}>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileSelect} />

      {/* ── Upload progress ── */}
      {uploading && (
        <div style={S.uploadWrap}>
          <div style={S.progressBar}>
            <div style={{ ...S.progressFill, width: `${uploadProgress}%` }} />
          </div>
          <span style={S.progressText}>Uploading... {uploadProgress}%</span>
        </div>
      )}

      {/* ── Private message banner ── */}
      {selectedRecipients.length > 0 && (
        <div style={{ ...S.recipientBanner, backgroundColor: document.body.classList.contains('dark-mode')?'#1e3a5f':'#eef2ff', borderColor: document.body.classList.contains('dark-mode')?'#3730a3':'#c7d2fe' }}>
          <span style={{ ...S.recipientText, color: document.body.classList.contains('dark-mode')?'#a5b4fc':'#4f46e5' }}>
            Private message to: <strong>{selectedRecipients.map(r => r.username || r.name || 'User').join(', ')}</strong>
          </span>
          <button onClick={() => setSelectedRecipients([])} style={S.clearRecipient}>✕</button>
        </div>
      )}

      {/* ── File attach menu popup — anchored to right (+) button ── */}
      {showFileMenu && (
        <div style={S.fileMenu}>
          {[
            { type: 'camera',   icon: '📷', label: 'Camera' },
            { type: 'document', icon: '📄', label: 'Document' },
            { type: 'photos',   icon: '🖼️', label: 'Photos & videos' },
            { type: 'audio',    icon: '🎵', label: 'Audio' },
            { type: 'poll',     icon: '📊', label: 'Poll' },
          ].map(({ type, icon, label }) => (
            <button key={type} onClick={() => handleFileMenuClick(type)} style={S.fileMenuItem}>
              <span style={S.menuIcon}>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Poll creator modal — UNCHANGED ── */}
      {showPollCreator && (
        <div style={S.pollOverlay}>
          <div style={S.pollModal}>
            <div style={S.pollHeader}>
              <h3 style={S.pollTitle}>Create Poll</h3>
              <button onClick={cancelPoll} style={S.pollCloseBtn}>✕</button>
            </div>
            <div style={S.pollBody}>
              <label style={S.pollLabel}>Question *</label>
              <input
                type="text"
                value={pollQuestion}
                onChange={e => setPollQuestion(e.target.value)}
                placeholder="Ask a question..."
                style={S.pollQuestionInput}
                maxLength={200}
              />
              <label style={S.pollLabel}>Options *</label>
              {pollOptions.map((option, index) => (
                <div key={index} style={S.pollOptionRow}>
                  <input
                    type="text"
                    value={option}
                    onChange={e => handlePollOptionChange(index, e.target.value)}
                    placeholder={`Option ${index + 1}`}
                    style={S.pollOptionInput}
                    maxLength={100}
                  />
                  {pollOptions.length > 2 && (
                    <button onClick={() => removePollOption(index)} style={S.removeOptionBtn}>✕</button>
                  )}
                </div>
              ))}
              {pollOptions.length < 10 && (
                <button onClick={addPollOption} style={S.addOptionBtn}>+ Add Option</button>
              )}
            </div>
            <div style={S.pollFooterRow}>
              <button onClick={cancelPoll}      style={S.pollCancelBtn}>Cancel</button>
              <button onClick={handleCreatePoll} style={S.pollCreateBtn}>Create Poll</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Recipient dropdown (multi-select) — anchored to left (👥) button ── */}
      {showRecipients && showRecipientPicker && (
        <div style={S.recipientDropdown}>
          <div style={S.recipientHeader}>Reply to:</div>
          <button
            onClick={() => { setSelectedRecipients([]); setShowRecipients(false); }}
            style={{ ...S.recipientOption, backgroundColor: selectedRecipients.length === 0 ? '#eef2ff' : 'transparent' }}
          >
            📢 Everyone
          </button>
          {recipientMembers.map(member => {
            const checked = selectedRecipients.some(r => r._id === member._id);
            return (
              <button
                key={member._id}
                onClick={() => toggleRecipient(member)}
                style={{
                  ...S.recipientOption,
                  backgroundColor: checked ? '#eef2ff' : 'transparent'
                }}
              >
                {checked ? '✅' : '👤'} {member.username || member.name}
              </button>
            );
          })}
          {selectedRecipients.length > 0 && (
            <button onClick={() => setShowRecipients(false)} style={S.recipientDone}>
              Done ({selectedRecipients.length} selected)
            </button>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════
          INPUT CARD
          Layout: [👥 icon] [text input] [send ▶] [+ attach]
          ════════════════════════════════════════ */}
      <form onSubmit={handleSendMessage} style={S.inputCard}>

        {/* Left: people icon — teacher gets recipient picker only in Moderated Chat mode */}
        {showRecipientPicker ? (
          <button
            type="button"
            onClick={() => setShowRecipients(!showRecipients)}
            style={S.leftIconBtn}
            disabled={disabled || uploading}
            title="Select recipient(s)"
          >
            👥
          </button>
        ) : (
          <span style={S.leftIconDecorative}>👤</span>
        )}

        {/* Text input — takes all remaining space */}
        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={handleInputChange}
          placeholder={placeholder}
          style={S.textInput}
          disabled={disabled || uploading}
          maxLength={5000}
        />

        {/* Send button — dark circle, paper-plane arrow */}
        <button
          type="submit"
          style={{
            ...S.sendBtn,
            opacity: !message.trim() || disabled || uploading ? 0.45 : 1,
            cursor:  !message.trim() || disabled || uploading ? 'not-allowed' : 'pointer',
          }}
          disabled={!message.trim() || disabled || uploading}
          title="Send message"
        >
          ➤
        </button>

        {/* Plus / attach button — dark circle, right side */}
        <button
          type="button"
          onClick={() => setShowFileMenu(!showFileMenu)}
          style={S.plusBtn}
          disabled={disabled || uploading}
          title="Attach file or create poll"
        >
          +
        </button>

      </form>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
//  STYLES — Visily design
// ══════════════════════════════════════════════════════════════════════════
const S = {

  // ── Outer container ──
  container: {
    position: 'relative',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e2e8f0',
    padding: '12px 20px 14px',
  },

  // ── Upload progress ──
  uploadWrap:    { marginBottom: 10 },
  progressBar:   { width: '100%', height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, overflow: 'hidden', marginBottom: 5 },
  progressFill:  { height: '100%', backgroundColor: 'var(--cv-accent-mid)', transition: 'width 0.3s' },
  progressText:  { fontSize: 12, color: '#64748b' },

  // ── Private recipient banner ──
  recipientBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '7px 12px',
    backgroundColor: '#eef2ff',
    borderRadius: 8,
    marginBottom: 10,
    border: '1px solid #c7d2fe',
  },
  recipientText: { fontSize: 13, color: '#4f46e5' },
  clearRecipient: { background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#94a3b8', padding: '0 4px' },

  // ── File menu popup (bottom-right, above + button) ──
  fileMenu: {
    position: 'absolute',
    bottom: 70,
    right: 20,
    backgroundColor: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: 14,
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    overflow: 'hidden',
    zIndex: 100,
    minWidth: 210,
  },
  fileMenuItem: {
    width: '100%',
    padding: '13px 18px',
    fontSize: 14,
    textAlign: 'left',
    border: 'none',
    borderBottom: '1px solid #f1f5f9',
    backgroundColor: 'white',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    color: '#374151',
    transition: 'background 0.15s',
  },
  menuIcon: { fontSize: 20, width: 24, textAlign: 'center' },

  // ── Recipient dropdown (bottom-left, above 👥 button) ──
  recipientDropdown: {
    position: 'absolute',
    bottom: 70,
    left: 20,
    backgroundColor: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    minWidth: 210,
    maxHeight: 300,
    overflowY: 'auto',
    zIndex: 100,
  },
  recipientHeader: { padding: '10px 14px', fontSize: 12, fontWeight: '700', color: '#64748b', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase', letterSpacing: '0.4px' },
  recipientOption: { width: '100%', padding: '10px 14px', fontSize: 14, textAlign: 'left', border: 'none', cursor: 'pointer', color: '#374151', transition: 'background 0.15s' },
  recipientDone: { width: '100%', padding: '10px 14px', fontSize: 13, fontWeight: '700', textAlign: 'center', border: 'none', borderTop: '1px solid #e2e8f0', cursor: 'pointer', color: 'var(--cv-accent-mid)', backgroundColor: '#f8fafc' },

  // ════════════════════════════════════════
  //  INPUT CARD
  // ════════════════════════════════════════
  inputCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    border: '1.5px solid #e2e8f0',
    borderRadius: 14,
    padding: '8px 12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },

  // Left people icon (decorative for students)
  leftIconDecorative: {
    fontSize: 18,
    opacity: 0.45,
    flexShrink: 0,
    lineHeight: 1,
    userSelect: 'none',
  },

  // Left people icon (interactive button for admin/teacher)
  leftIconBtn: {
    background: 'none',
    border: 'none',
    fontSize: 18,
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: 8,
    flexShrink: 0,
    color: '#64748b',
    transition: 'background 0.15s, color 0.15s',
    lineHeight: 1,
  },

  // Text input
  textInput: {
    flex: 1,
    padding: '8px 4px',
    fontSize: 14,
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
    color: '#1e293b',
    minWidth: 0, // prevent flex overflow
  },

  // Send button — dark circle ▶
  sendBtn: {
    width: 38,
    height: 38,
    fontSize: 16,
    backgroundColor: '#1e293b',
    color: 'white',
    border: 'none',
    borderRadius: '50%',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s, opacity 0.2s',
  },

  // Plus / attach button — dark circle
  plusBtn: {
    width: 38,
    height: 38,
    fontSize: 22,
    fontWeight: '300',
    backgroundColor: '#1e293b',
    color: 'white',
    border: 'none',
    borderRadius: '50%',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    lineHeight: 1,
    transition: 'background 0.2s',
  },

  // ── Poll modal — UNCHANGED visually ──
  pollOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  pollModal: {
    backgroundColor: 'white',
    borderRadius: 14,
    width: '90%',
    maxWidth: 500,
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
  },
  pollHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '18px 20px',
    borderBottom: '1px solid #e2e8f0',
  },
  pollTitle:   { margin: 0, fontSize: 18, fontWeight: '700', color: '#1e293b' },
  pollCloseBtn:{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' },
  pollBody:    { padding: 20, overflowY: 'auto', flex: 1 },
  pollLabel:   { display: 'block', fontSize: 13, fontWeight: '700', marginBottom: 8, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.4px' },
  pollQuestionInput: {
    width: '100%',
    padding: '11px 13px',
    fontSize: 14,
    border: '1.5px solid #e2e8f0',
    borderRadius: 8,
    marginBottom: 20,
    outline: 'none',
    boxSizing: 'border-box',
    color: '#1e293b',
  },
  pollOptionRow:   { display: 'flex', gap: 8, marginBottom: 10 },
  pollOptionInput: { flex: 1, padding: '10px 12px', fontSize: 14, border: '1.5px solid #e2e8f0', borderRadius: 8, outline: 'none', color: '#1e293b' },
  removeOptionBtn: { width: 36, height: 36, backgroundColor: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 15, fontWeight: '700' },
  addOptionBtn:    { padding: '9px 14px', fontSize: 13, fontWeight: '600', color: 'var(--cv-accent-mid)', backgroundColor: 'transparent', border: '1.5px dashed #c7d2fe', borderRadius: 8, cursor: 'pointer', marginTop: 8 },
  pollFooterRow:   { display: 'flex', gap: 10, padding: '16px 20px', borderTop: '1px solid #e2e8f0' },
  pollCancelBtn:   { flex: 1, padding: 12, fontSize: 14, fontWeight: '600', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, cursor: 'pointer' },
  pollCreateBtn:   { flex: 1, padding: 12, fontSize: 14, fontWeight: '700', backgroundColor: 'var(--cv-accent-mid)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' },
};

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    /* Hover states for MessageInput buttons */
    .mi-send:hover  { background-color: #334155 !important; }
    .mi-plus:hover  { background-color: #334155 !important; }
    .mi-left:hover  { background-color: #f1f5f9 !important; color: #4f46e5 !important; }
    .mi-file:hover  { background-color: #f8fafc !important; }
    .mi-opt:hover   { background-color: #f8fafc !important; }
    .mi-rmv:hover   { background-color: #fca5a5 !important; }
    .mi-add:hover   { background-color: #eef2ff !important; }
    .mi-cancel:hover{ background-color: #e2e8f0 !important; }
    .mi-create:hover{ background-color: #4f46e5 !important; }
  `;
  document.head.appendChild(style);
}

export default MessageInput;