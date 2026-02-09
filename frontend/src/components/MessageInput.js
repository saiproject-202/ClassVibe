// src/components/MessageInput.js
import React, { useState, useRef, useEffect } from 'react';
import { uploadFile } from '../api';

const MessageInput = ({ 
  onSendMessage, 
  onTyping, 
  onStopTyping, 
  disabled = false,
  isAdmin = false,
  members = []
}) => {
  const [message, setMessage] = useState('');
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showRecipients, setShowRecipients] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setMessage(value);
    if (value.trim() && onTyping) {
      onTyping();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        if (onStopTyping) {
          onStopTyping();
        }
      }, 2000);
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    const messageData = {
      content: message.trim(),
      messageType: selectedRecipient ? 'private' : 'text',
      recipientId: selectedRecipient ? selectedRecipient._id : null
    };
    if (onSendMessage) {
      onSendMessage(messageData);
    }
    setMessage('');
    setSelectedRecipient(null);
    if (onStopTyping) {
      onStopTyping();
    }
    inputRef.current?.focus();
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('File too large! Maximum size is 10MB');
      return;
    }
    const allowedTypes = /\.(jpg|jpeg|png|gif|mp4|mov|avi|pdf|doc|docx|txt|mp3|wav|m4a|ogg)$/i;
    if (!allowedTypes.test(file.name)) {
      alert('Invalid file type! Allowed: Images, Videos, PDFs, Documents, Audio');
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    try {
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
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
          fileUrl: response.file.url,
          fileName: response.file.name,
          fileSize: response.file.size,
          fileType: response.file.type,
          recipientId: selectedRecipient ? selectedRecipient._id : null
        };
        if (onSendMessage) {
          onSendMessage(fileMessage);
        }
        setSelectedRecipient(null);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setShowFileMenu(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileMenuClick = (type) => {
    setShowFileMenu(false);
    if (type === 'camera') {
      if (fileInputRef.current) {
        fileInputRef.current.setAttribute('capture', 'environment');
        fileInputRef.current.setAttribute('accept', 'image/*,video/*');
        fileInputRef.current.click();
      }
    } else if (type === 'document') {
      if (fileInputRef.current) {
        fileInputRef.current.removeAttribute('capture');
        fileInputRef.current.setAttribute('accept', '.pdf,.doc,.docx,.txt');
        fileInputRef.current.click();
      }
    } else if (type === 'photos') {
      if (fileInputRef.current) {
        fileInputRef.current.removeAttribute('capture');
        fileInputRef.current.setAttribute('accept', 'image/*,video/*');
        fileInputRef.current.click();
      }
    } else if (type === 'audio') {
      if (fileInputRef.current) {
        fileInputRef.current.removeAttribute('capture');
        fileInputRef.current.setAttribute('accept', 'audio/*,.mp3,.wav,.m4a,.ogg');
        fileInputRef.current.click();
      }
    } else if (type === 'poll') {
      setShowPollCreator(true);
    }
  };

  const handlePollOptionChange = (index, value) => {
    const newOptions = [...pollOptions];
    newOptions[index] = value;
    setPollOptions(newOptions);
  };

  const addPollOption = () => {
    if (pollOptions.length < 10) {
      setPollOptions([...pollOptions, '']);
    }
  };

  const removePollOption = (index) => {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, i) => i !== index));
    }
  };

  const handleCreatePoll = () => {
    if (!pollQuestion.trim()) {
      alert('Please enter a poll question');
      return;
    }
    const validOptions = pollOptions.filter(opt => opt.trim());
    if (validOptions.length < 2) {
      alert('Please provide at least 2 options');
      return;
    }
    const pollMessage = {
      content: pollQuestion.trim(),
      messageType: 'poll',
      pollOptions: validOptions,
      recipientId: selectedRecipient ? selectedRecipient._id : null
    };
    if (onSendMessage) {
      onSendMessage(pollMessage);
    }
    setPollQuestion('');
    setPollOptions(['', '']);
    setShowPollCreator(false);
    setSelectedRecipient(null);
  };

  const cancelPoll = () => {
    setPollQuestion('');
    setPollOptions(['', '']);
    setShowPollCreator(false);
  };

  const handleRecipientSelect = (member) => {
    if (selectedRecipient && selectedRecipient._id === member._id) {
      setSelectedRecipient(null);
    } else {
      setSelectedRecipient(member);
    }
    setShowRecipients(false);
    inputRef.current?.focus();
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div style={styles.container}>
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
      {uploading && (
        <div style={styles.uploadProgress}>
          <div style={styles.progressBar}>
            <div 
              style={{
                ...styles.progressFill,
                width: `${uploadProgress}%`
              }}
            />
          </div>
          <span style={styles.progressText}>Uploading... {uploadProgress}%</span>
        </div>
      )}
      {selectedRecipient && (
        <div style={styles.recipientBanner}>
          <span style={styles.recipientText}>
            Private message to: <strong>{selectedRecipient.username}</strong>
          </span>
          <button
            onClick={() => setSelectedRecipient(null)}
            style={styles.clearRecipient}
          >
            ✕
          </button>
        </div>
      )}
      {showFileMenu && (
        <div style={styles.fileMenu}>
          <button
            onClick={() => handleFileMenuClick('camera')}
            style={styles.fileMenuItem}
          >
            <span style={styles.menuIcon}>📷</span>
            <span>Camera</span>
          </button>
          <button
            onClick={() => handleFileMenuClick('document')}
            style={styles.fileMenuItem}
          >
            <span style={styles.menuIcon}>📄</span>
            <span>Document</span>
          </button>
          <button
            onClick={() => handleFileMenuClick('photos')}
            style={styles.fileMenuItem}
          >
            <span style={styles.menuIcon}>🖼️</span>
            <span>Photos & videos</span>
          </button>
          <button
            onClick={() => handleFileMenuClick('audio')}
            style={styles.fileMenuItem}
          >
            <span style={styles.menuIcon}>🎵</span>
            <span>Audio</span>
          </button>
          <button
            onClick={() => handleFileMenuClick('poll')}
            style={styles.fileMenuItem}
          >
            <span style={styles.menuIcon}>📊</span>
            <span>Poll</span>
          </button>
        </div>
      )}
      {showPollCreator && (
        <div style={styles.pollOverlay}>
          <div style={styles.pollModal}>
            <div style={styles.pollHeader}>
              <h3 style={styles.pollTitle}>Create Poll</h3>
              <button onClick={cancelPoll} style={styles.pollCloseBtn}>✕</button>
            </div>
            <div style={styles.pollBody}>
              <label style={styles.pollLabel}>Question *</label>
              <input
                type="text"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="Ask a question..."
                style={styles.pollQuestionInput}
                maxLength={200}
              />
              <label style={styles.pollLabel}>Options *</label>
              {pollOptions.map((option, index) => (
                <div key={index} style={styles.pollOptionRow}>
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => handlePollOptionChange(index, e.target.value)}
                    placeholder={`Option ${index + 1}`}
                    style={styles.pollOptionInput}
                    maxLength={100}
                  />
                  {pollOptions.length > 2 && (
                    <button
                      onClick={() => removePollOption(index)}
                      style={styles.removeOptionBtn}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 10 && (
                <button onClick={addPollOption} style={styles.addOptionBtn}>
                  + Add Option
                </button>
              )}
            </div>
            <div style={styles.pollFooter}>
              <button onClick={cancelPoll} style={styles.pollCancelBtn}>
                Cancel
              </button>
              <button onClick={handleCreatePoll} style={styles.pollCreateBtn}>
                Create Poll
              </button>
            </div>
          </div>
        </div>
      )}
      {showRecipients && isAdmin && (
        <div style={styles.recipientDropdown}>
          <div style={styles.recipientHeader}>Send to:</div>
          <button
            onClick={() => {
              setSelectedRecipient(null);
              setShowRecipients(false);
            }}
            style={{
              ...styles.recipientOption,
              backgroundColor: !selectedRecipient ? '#e3f2fd' : 'transparent'
            }}
          >
            📢 Everyone
          </button>
          {members.map((member) => (
            <button
              key={member._id}
              onClick={() => handleRecipientSelect(member)}
              style={{
                ...styles.recipientOption,
                backgroundColor: 
                  selectedRecipient && selectedRecipient._id === member._id 
                    ? '#e3f2fd' 
                    : 'transparent'
              }}
            >
              👤 {member.username}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={handleSendMessage} style={styles.inputForm}>
        <button
          type="button"
          onClick={() => setShowFileMenu(!showFileMenu)}
          style={styles.iconButton}
          disabled={disabled || uploading}
          title="Attach file"
        >
          +
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowRecipients(!showRecipients)}
            style={styles.iconButton}
            disabled={disabled || uploading}
            title="Select recipient"
          >
            👥
          </button>
        )}
        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={handleInputChange}
          placeholder={
            uploading 
              ? "Uploading..." 
              : selectedRecipient 
                ? `Private message to ${selectedRecipient.username}...`
                : "Type a message..."
          }
          style={styles.input}
          disabled={disabled || uploading}
          maxLength={5000}
        />
        <button
          type="submit"
          style={{
            ...styles.sendButton,
            opacity: !message.trim() || disabled || uploading ? 0.5 : 1,
            cursor: !message.trim() || disabled || uploading ? 'not-allowed' : 'pointer'
          }}
          disabled={!message.trim() || disabled || uploading}
        >
          ➤
        </button>
      </form>
    </div>
  );
};

const styles = {
  container: {
    position: 'relative',
    borderTop: '1px solid #e0e0e0',
    backgroundColor: '#F0F0F0',
    padding: '15px',
    boxShadow: '0 -2px 5px rgba(0,0,0,0.05)'
  },
  uploadProgress: {
    marginBottom: '10px'
  },
  progressBar: {
    width: '100%',
    height: '4px',
    backgroundColor: '#e0e0e0',
    borderRadius: '2px',
    overflow: 'hidden',
    marginBottom: '5px'
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#25D366',
    transition: 'width 0.3s'
  },
  progressText: {
    fontSize: '12px',
    color: '#666'
  },
  recipientBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    backgroundColor: '#e3f2fd',
    borderRadius: '6px',
    marginBottom: '10px'
  },
  recipientText: {
    fontSize: '13px',
    color: '#1976d2'
  },
  clearRecipient: {
    background: 'none',
    border: 'none',
    fontSize: '16px',
    cursor: 'pointer',
    color: '#666',
    padding: '0 5px'
  },
  fileMenu: {
    position: 'absolute',
    bottom: '70px',
    left: '15px',
    backgroundColor: 'white',
    border: '1px solid #ddd',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    overflow: 'hidden',
    zIndex: 100,
    minWidth: '200px'
  },
  fileMenuItem: {
    width: '100%',
    padding: '14px 20px',
    fontSize: '15px',
    textAlign: 'left',
    border: 'none',
    backgroundColor: 'white',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    borderBottom: '1px solid #f0f0f0'
  },
  menuIcon: {
    fontSize: '20px',
    width: '24px',
    textAlign: 'center'
  },
  pollOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  pollModal: {
    backgroundColor: 'white',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '500px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
  },
  pollHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '1px solid #e0e0e0'
  },
  pollTitle: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '600'
  },
  pollCloseBtn: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#666',
    padding: '0 5px'
  },
  pollBody: {
    padding: '20px',
    overflowY: 'auto',
    flex: 1
  },
  pollLabel: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '8px',
    color: '#333'
  },
  pollQuestionInput: {
    width: '100%',
    padding: '12px',
    fontSize: '15px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    marginBottom: '20px',
    outline: 'none',
    boxSizing: 'border-box'
  },
  pollOptionRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '10px'
  },
  pollOptionInput: {
    flex: 1,
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    outline: 'none'
  },
  removeOptionBtn: {
    width: '36px',
    height: '36px',
    background: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px'
  },
  addOptionBtn: {
    padding: '10px 16px',
    fontSize: '14px',
    color: '#128C7E',
    backgroundColor: 'transparent',
    border: '1px dashed #128C7E',
    borderRadius: '8px',
    cursor: 'pointer',
    marginTop: '10px'
  },
  pollFooter: {
    display: 'flex',
    gap: '10px',
    padding: '20px',
    borderTop: '1px solid #e0e0e0'
  },
  pollCancelBtn: {
    flex: 1,
    padding: '12px',
    fontSize: '15px',
    fontWeight: '600',
    backgroundColor: '#f5f5f5',
    color: '#333',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  pollCreateBtn: {
    flex: 1,
    padding: '12px',
    fontSize: '15px',
    fontWeight: '600',
    backgroundColor: '#25D366',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  recipientDropdown: {
    position: 'absolute',
    bottom: '70px',
    right: '15px',
    backgroundColor: 'white',
    border: '1px solid #ddd',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    minWidth: '200px',
    maxHeight: '300px',
    overflowY: 'auto',
    zIndex: 100
  },
  recipientHeader: {
    padding: '10px 15px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#666',
    borderBottom: '1px solid #e0e0e0'
  },
  recipientOption: {
    width: '100%',
    padding: '10px 15px',
    fontSize: '14px',
    textAlign: 'left',
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  inputForm: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  iconButton: {
    fontSize: '28px',
    fontWeight: '300',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '8px 12px',
    borderRadius: '50%',
    transition: 'background-color 0.2s',
    flexShrink: 0,
    color: '#54656F'
  },
  input: {
    flex: 1,
    padding: '12px 15px',
    fontSize: '15px',
    border: 'none',
    borderRadius: '25px',
    outline: 'none',
    backgroundColor: 'white',
    transition: 'border-color 0.3s'
  },
  sendButton: {
    width: '45px',
    height: '45px',
    fontSize: '20px',
    backgroundColor: '#25D366',
    color: 'white',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    transition: 'all 0.3s',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
};

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    button[style*="fileMenuItem"]:hover {
      background-color: #f5f5f5 !important;
    }
    button[style*="fileMenuItem"]:last-child {
      border-bottom: none !important;
    }
    button[style*="iconButton"]:hover {
      background-color: #f0f0f0 !important;
    }
    button[style*="recipientOption"]:hover {
      background-color: #f5f5f5 !important;
    }
    button[style*="pollCloseBtn"]:hover {
      color: #333 !important;
    }
    button[style*="removeOptionBtn"]:hover {
      background-color: #d32f2f !important;
    }
    button[style*="addOptionBtn"]:hover {
      background-color: #D7F0DD !important;
    }
    button[style*="pollCancelBtn"]:hover {
      background-color: #e0e0e0 !important;
    }
    button[style*="pollCreateBtn"]:hover {
      background-color: #128C7E !important;
    }
  `;
  document.head.appendChild(style);
}

export default MessageInput;