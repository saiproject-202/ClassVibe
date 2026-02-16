// src/components/ChatArea.jsx
import React, { useRef, useEffect, useState } from 'react';
import socket from '../socket';

const ChatArea = ({ 
  messages, 
  currentUserId,
  currentGroup,
  typingUsers, 
  onMessageEdited,
  onMessageDeleted 
}) => {
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState('');
  
  // ✅ NEW: Full-screen media viewer
  const [fullscreenMedia, setFullscreenMedia] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  
  // ✅ NEW: PDF viewer
  const [pdfViewer, setPdfViewer] = useState(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleMessageEdited = (editedMessage) => {
      if (typeof onMessageEdited === 'function') {
        onMessageEdited(editedMessage);
      }
      if (editingMessageId === editedMessage._id) {
        setEditingMessageId(null);
        setEditText('');
      }
    };

    const handleMessageDeleted = (data) => {
      if (typeof onMessageDeleted === 'function') {
        onMessageDeleted(data.messageId);
      }
    };

    socket.on('messageEdited', handleMessageEdited);
    socket.on('messageDeleted', handleMessageDeleted);

    return () => {
      socket.off('messageEdited', handleMessageEdited);
      socket.off('messageDeleted', handleMessageDeleted);
    };
  }, [onMessageEdited, onMessageDeleted, editingMessageId]);

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (container) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      setShowScrollButton(!isNearBottom);
    }
  };

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto'
    });
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  const getDateSeparator = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === now.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      });
    }
  };

  const needsDateSeparator = (currentMsg, previousMsg) => {
    if (!previousMsg) return true;
    const currentDate = new Date(currentMsg.createdAt).toDateString();
    const previousDate = new Date(previousMsg.createdAt).toDateString();
    return currentDate !== previousDate;
  };

  const getInitials = (username) => {
    return username?.substring(0, 2).toUpperCase() || '??';
  };

  const getAvatarColor = (username) => {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
      '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'
    ];
    const index = username?.charCodeAt(0) % colors.length || 0;
    return colors[index];
  };

  const handleContextMenu = (e, message) => {
    e.preventDefault();
    if (message.isDeleted) return;
    const isOwnMessage = message.sender && message.sender._id === currentUserId;
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      message: message,
      isOwn: isOwnMessage
    });
  };

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const copyMessage = (text) => {
    if (!text) {
      alert('No text to copy');
      return;
    }
    navigator.clipboard.writeText(text)
      .then(() => {
        setContextMenu(null);
        alert('Message copied!');
      })
      .catch((err) => {
        console.error('Failed to copy:', err);
        alert('Failed to copy');
      });
  };

  const startEditMessage = (message) => {
    setEditingMessageId(message._id);
    setEditText(message.content);
    setContextMenu(null);
  };

  const saveEditMessage = () => {
    if (!editText.trim()) {
      alert('Message cannot be empty');
      return;
    }
    socket.emit('editMessage', {
      messageId: editingMessageId,
      newContent: editText.trim()
    });
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditText('');
  };

  const deleteMessage = (messageId) => {
    if (window.confirm('Delete this message?')) {
      socket.emit('deleteMessage', { messageId });
      setContextMenu(null);
    }
  };

  // ✅ NEW: POLL RENDERING
  const handlePollVote = (messageId, optionIndex) => {
    socket.emit('votePoll', {
      messageId,
      optionIndex,
      groupId: currentGroup?._id || currentGroup?.id
    });
  };

  const renderPoll = (message) => {
    if (!message.pollOptions || message.pollOptions.length === 0) {
      return <div style={styles.pollError}>Poll data unavailable</div>;
    }

    const totalVotes = message.pollOptions.reduce((sum, opt) => sum + (opt.votes?.length || 0), 0);
    const userHasVoted = message.pollOptions.some(opt => 
      opt.votes?.some(voterId => String(voterId) === String(currentUserId))
    );
    const userVoteIndex = message.pollOptions.findIndex(opt =>
      opt.votes?.some(voterId => String(voterId) === String(currentUserId))
    );

    return (
      <div style={styles.pollContainer}>
        <div style={styles.pollHeader}>
          <span style={styles.pollIcon}>📊</span>
          <span style={styles.pollQuestion}>{message.content}</span>
        </div>
        <div style={styles.pollOptions}>
          {message.pollOptions.map((option, index) => {
            const votes = option.votes?.length || 0;
            const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
            const isUserVote = index === userVoteIndex;
            
            return (
              <div key={index} style={styles.pollOptionWrapper}>
                {userHasVoted ? (
                  <div style={{
                    ...styles.pollResult,
                    borderColor: isUserVote ? '#25D366' : '#e0e0e0',
                    borderWidth: isUserVote ? '2px' : '1px'
                  }}>
                    <div style={styles.pollResultTop}>
                      <span style={styles.pollOptionText}>{option.text || option}</span>
                      <span style={styles.pollPercentage}>{percentage}%</span>
                    </div>
                    <div style={styles.pollProgressBar}>
                      <div style={{
                        ...styles.pollProgressFill,
                        width: `${percentage}%`,
                        backgroundColor: isUserVote ? '#25D366' : '#128C7E'
                      }} />
                    </div>
                    <div style={styles.pollVoteCount}>
                      {votes} {votes === 1 ? 'vote' : 'votes'}
                      {isUserVote && <span style={styles.checkmark}> ✓</span>}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => handlePollVote(message._id, index)}
                    style={styles.pollButton}
                  >
                    {option.text || option}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div style={styles.pollFooter}>
          {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
        </div>
      </div>
    );
  };

  // ✅ NEW: Full-screen media viewer functions
  const openFullscreen = (fileUrl, fileType, fileName) => {
    setFullscreenMedia({ fileUrl, fileType, fileName });
    setZoomLevel(1);
  };

  const closeFullscreen = () => {
    setFullscreenMedia(null);
    setZoomLevel(1);
  };

  const downloadFile = (fileUrl, fileName) => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName || 'download';
    link.click();
  };

  const zoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.25, 3));
  };

  const zoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
  };

  // ✅ NEW: PDF viewer
  const openPdfViewer = (fileUrl, fileName) => {
    setPdfViewer({ fileUrl, fileName });
  };

  const closePdfViewer = () => {
    setPdfViewer(null);
  };

  const renderFileAttachment = (message) => {
    if (message.messageType !== 'file' || !message.fileUrl) return null;
    const fileType = message.fileType || '';
    const fileUrl = message.fileUrl.startsWith('http') 
      ? message.fileUrl:`https://classvibe-backend.onrender.com${message.fileUrl}`;

    // Image
    if (fileType.startsWith('image/')) {
      return (
        <img 
          src={fileUrl} 
          alt={message.fileName || 'Image'}
          style={styles.imageAttachment}
          onClick={() => openFullscreen(fileUrl, fileType, message.fileName)}
        />
      );
    }

    // Video
    if (fileType.startsWith('video/')) {
      return (
        <div style={styles.videoWrapper}>
          <video 
            src={fileUrl} 
            controls 
            style={styles.videoAttachment}
            onClick={(e) => {
              e.stopPropagation();
              openFullscreen(fileUrl, fileType, message.fileName);
            }}
          />
        </div>
      );
    }

    // Audio - WhatsApp style
    if (fileType.startsWith('audio/')) {
      return (
        <div style={styles.audioContainer}>
          <div style={styles.audioIcon}>🎵</div>
          <audio 
            src={fileUrl} 
            controls 
            style={styles.audioPlayer}
          />
        </div>
      );
    }

    // PDF
    if (fileType === 'application/pdf' || message.fileName?.endsWith('.pdf')) {
      return (
        <div style={styles.documentContainer}>
          <div style={styles.pdfPreview}>
            <span style={styles.pdfIcon}>📄</span>
            <div style={styles.pdfInfo}>
              <span style={styles.pdfName}>{message.fileName || 'Document.pdf'}</span>
              <span style={styles.pdfSize}>
                {Math.round((message.fileSize || 0) / 1024)} KB
              </span>
            </div>
          </div>
          <div style={styles.pdfActions}>
            <button 
              style={styles.pdfButton}
              onClick={() => openPdfViewer(fileUrl, message.fileName)}
            >
              View
            </button>
            <button 
              style={styles.pdfButton}
              onClick={() => downloadFile(fileUrl, message.fileName)}
            >
              Download
            </button>
          </div>
        </div>
      );
    }

    // Other documents
    return (
      <a 
        href={fileUrl} 
        target="_blank" 
        rel="noopener noreferrer"
        style={styles.documentAttachment}
        onClick={(e) => e.stopPropagation()}
      >
        <span style={styles.documentIcon}>📄</span>
        <span>{message.fileName || 'Download File'}</span>
        <span style={styles.fileSize}>
          ({Math.round((message.fileSize || 0) / 1024)} KB)
        </span>
      </a>
    );
  };

  const filteredMessages = searchQuery.trim()
    ? messages.filter(msg => 
        msg.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        msg.sender?.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        msg.sender?.name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  return (
    <div style={styles.chatArea}>
      <div style={styles.searchBar}>
        <input
          type="text"
          placeholder="Search messages..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={styles.searchInput}
        />
        {searchQuery && (
          <>
            <button onClick={() => setSearchQuery('')} style={styles.clearSearch}>✕</button>
            <span style={styles.searchResults}>
              {filteredMessages.length} result{filteredMessages.length !== 1 ? 's' : ''}
            </span>
          </>
        )}
      </div>

      <div
        style={styles.messagesContainer}
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {filteredMessages.length === 0 && !searchQuery && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>💬</div>
            <p style={styles.emptyText}>No messages yet</p>
            <p style={styles.emptySubtext}>Start the conversation! 👋</p>
          </div>
        )}

        {filteredMessages.length === 0 && searchQuery && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>🔍</div>
            <p style={styles.emptyText}>No messages found</p>
            <p style={styles.emptySubtext}>Try a different search</p>
          </div>
        )}

        {filteredMessages.map((message, index) => {
          const isOwnMessage = message.sender && message.sender._id === currentUserId;
          const isSystemMessage = message.messageType === 'system';
          const showDateSeparator = needsDateSeparator(message, filteredMessages[index - 1]);
          const isEditing = editingMessageId === message._id;
          const isPoll = message.messageType === 'poll';

          return (
            <React.Fragment key={message._id || `${index}-${message.createdAt}`}>
              {showDateSeparator && (
                <div style={styles.dateSeparator}>
                  <span style={styles.dateSeparatorText}>
                    {getDateSeparator(message.createdAt)}
                  </span>
                </div>
              )}

              <div
                style={{
                  ...styles.messageWrapper,
                  justifyContent: isSystemMessage ? 'center' : isOwnMessage ? 'flex-end' : 'flex-start'
                }}
                onContextMenu={(e) => !isSystemMessage && !isPoll && handleContextMenu(e, message)}
              >
                {isSystemMessage ? (
                  <div style={styles.systemMessage}>{message.content}</div>
                ) : (
                  <div style={styles.messageRow}>
                    {!isOwnMessage && (
                      <div style={{
                        ...styles.avatar,
                        backgroundColor: getAvatarColor(message.sender?.username)
                      }}>
                        {getInitials(message.sender?.username)}
                      </div>
                    )}

                    <div style={{
                      ...styles.messageBubble,
                      backgroundColor: isOwnMessage 
                        ? (message.isDeleted ? '#B8D4C8' : '#DCF8C6') 
                        : (message.isDeleted ? '#e0e0e0' : 'white'),
                      color: '#333',
                      boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)',
                      opacity: message.isDeleted ? 0.7 : 1
                    }}>
                      {!isOwnMessage && (
                        <div style={{
                          ...styles.senderName,
                          color: getAvatarColor(message.sender?.username)
                        }}>
                          {message.sender?.name || message.sender?.username}
                        </div>
                      )}

                      {isEditing ? (
                        <div style={styles.editContainer}>
                          <input
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') saveEditMessage();
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            style={styles.editInput}
                            autoFocus
                          />
                          <div style={styles.editButtons}>
                            <button onClick={saveEditMessage} style={styles.saveBtn}>Save</button>
                            <button onClick={cancelEdit} style={styles.cancelBtn}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {isPoll && !message.isDeleted && renderPoll(message)}
                          {message.messageType === 'file' && !message.isDeleted && renderFileAttachment(message)}
                          {message.content && !isPoll && (
                            <div style={{
                              ...styles.messageContent,
                              fontStyle: message.isDeleted ? 'italic' : 'normal',
                              color: message.isDeleted ? '#666' : '#333'
                            }}>
                              {message.content}
                            </div>
                          )}
                        </>
                      )}

                      {!isEditing && (
                        <div style={styles.messageFooter}>
                          <span style={styles.timestamp}>
                            {formatTime(message.createdAt)}
                          </span>
                          {message.isEdited && !message.isDeleted && (
                            <span style={styles.editedLabel}>(edited)</span>
                          )}
                          {isOwnMessage && (
                            <span style={styles.readStatus}>✓✓</span>
                          )}
                        </div>
                      )}
                    </div>

                    {isOwnMessage && (
                      <div style={{
                        ...styles.avatar,
                        backgroundColor: '#128C7E'
                      }}>
                        {getInitials(message.sender?.username)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}

        {typingUsers && typingUsers.length > 0 && typingUsers.some(u => u && u.trim()) && (
          <div style={styles.typingWrapper}>
            <div style={styles.typingBubble}>
              <span style={styles.typingText}>
                {typingUsers.length === 1
                  ? `${typingUsers[0]} is typing`
                  : `${typingUsers.length} people are typing`}
              </span>
              <div style={styles.typingDots}>
                <span style={styles.dot}></span>
                <span style={styles.dot}></span>
                <span style={styles.dot}></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {showScrollButton && (
        <button style={styles.scrollButton} onClick={() => scrollToBottom()}>↓</button>
      )}

      {contextMenu && (
        <div style={{
          ...styles.contextMenu,
          top: contextMenu.y,
          left: contextMenu.x
        }}>
          <div style={styles.contextMenuItem} onClick={() => copyMessage(contextMenu.message.content)}>
            📋 Copy
          </div>
          {contextMenu.isOwn && !contextMenu.message.isDeleted && (
            <>
              <div style={styles.contextMenuItem} onClick={() => startEditMessage(contextMenu.message)}>
                ✏️ Edit
              </div>
              <div style={{ ...styles.contextMenuItem, color: '#dc3545' }} onClick={() => deleteMessage(contextMenu.message._id)}>
                🗑️ Delete
              </div>
            </>
          )}
        </div>
      )}

      {/* ✅ FULL-SCREEN MEDIA VIEWER */}
      {fullscreenMedia && (
        <div style={styles.fullscreenOverlay}>
          <div style={styles.fullscreenHeader}>
            <button style={styles.fullscreenBtn} onClick={closeFullscreen}>✕ Close</button>
            <span style={styles.fullscreenTitle}>{fullscreenMedia.fileName}</span>
            <div style={styles.fullscreenActions}>
              {fullscreenMedia.fileType?.startsWith('image/') && (
                <>
                  <button style={styles.fullscreenBtn} onClick={zoomOut}>-</button>
                  <span style={styles.zoomLevel}>{Math.round(zoomLevel * 100)}%</span>
                  <button style={styles.fullscreenBtn} onClick={zoomIn}>+</button>
                </>
              )}
              <button style={styles.fullscreenBtn} onClick={() => downloadFile(fullscreenMedia.fileUrl, fullscreenMedia.fileName)}>
                ⬇ Download
              </button>
            </div>
          </div>
          <div style={styles.fullscreenContent}>
            {fullscreenMedia.fileType?.startsWith('image/') ? (
              <img 
                src={fullscreenMedia.fileUrl} 
                alt={fullscreenMedia.fileName}
                style={{
                  ...styles.fullscreenImage,
                  transform: `scale(${zoomLevel})`
                }}
              />
            ) : fullscreenMedia.fileType?.startsWith('video/') ? (
              <video 
                src={fullscreenMedia.fileUrl} 
                controls 
                autoPlay
                style={styles.fullscreenVideo}
              />
            ) : null}
          </div>
        </div>
      )}

      {/* ✅ PDF VIEWER */}
      {pdfViewer && (
        <div style={styles.pdfViewerOverlay}>
          <div style={styles.pdfViewerHeader}>
            <span style={styles.pdfViewerTitle}>{pdfViewer.fileName}</span>
            <div>
              <button style={styles.fullscreenBtn} onClick={() => downloadFile(pdfViewer.fileUrl, pdfViewer.fileName)}>
                ⬇ Download
              </button>
              <button style={styles.fullscreenBtn} onClick={closePdfViewer}>✕ Close</button>
            </div>
          </div>
          <iframe 
            src={pdfViewer.fileUrl}
            style={styles.pdfIframe}
            title={pdfViewer.fileName}
          />
        </div>
      )}
    </div>
  );
};

const styles = {
  chatArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: '#E5DDD5',
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 30L0 0v60l30-30zm0 0l30 30V0L30 30z' fill='%23d9d9d9' fill-opacity='0.1'/%3E%3C/svg%3E")`,
    position: 'relative'
  },
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 20px',
    backgroundColor: '#075E54',
    borderBottom: '1px solid #128C7E'
  },
  searchInput: {
    flex: 1,
    padding: '8px 12px',
    fontSize: '14px',
    border: 'none',
    borderRadius: '20px',
    outline: 'none',
    backgroundColor: 'rgba(255,255,255,0.9)'
  },
  clearSearch: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    color: 'white'
  },
  searchResults: {
    fontSize: '12px',
    color: 'white',
    whiteSpace: 'nowrap'
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#999'
  },
  emptyIcon: { fontSize: '64px', marginBottom: '16px', opacity: 0.5 },
  emptyText: { fontSize: '18px', fontWeight: '600', margin: '0 0 8px 0' },
  emptySubtext: { fontSize: '14px', margin: 0 },
  dateSeparator: {
    display: 'flex',
    justifyContent: 'center',
    margin: '20px 0',
    position: 'relative'
  },
  dateSeparatorText: {
    backgroundColor: 'rgba(225, 245, 254, 0.92)',
    color: '#075E54',
    padding: '5px 12px',
    borderRadius: '7.5px',
    fontSize: '12.5px',
    fontWeight: '500',
    boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)'
  },
  messageWrapper: {
    display: 'flex',
    width: '100%',
    marginBottom: '4px'
  },
  systemMessage: {
    padding: '8px 16px',
    backgroundColor: 'rgba(225, 245, 254, 0.92)',
    color: '#075E54',
    borderRadius: '7.5px',
    fontSize: '13px',
    fontStyle: 'italic',
    textAlign: 'center',
    maxWidth: '70%',
    boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)'
  },
  messageRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-end',
    maxWidth: '75%'
  },
  avatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontSize: '12px',
    fontWeight: '600',
    flexShrink: 0
  },
  messageBubble: {
    padding: '6px 7px 8px 9px',
    borderRadius: '7.5px',
    wordWrap: 'break-word',
    minWidth: '60px',
    maxWidth: '100%',
    position: 'relative'
  },
  senderName: {
    fontSize: '12.8px',
    fontWeight: '600',
    marginBottom: '4px',
    opacity: 0.9
  },
  messageContent: {
    fontSize: '14.2px',
    lineHeight: '19px',
    marginBottom: '2px',
    wordBreak: 'break-word'
  },
  imageAttachment: {
    maxWidth: '100%',
    maxHeight: '300px',
    borderRadius: '8px',
    cursor: 'pointer',
    marginBottom: '4px'
  },
  videoWrapper: {
    maxWidth: '100%',
    marginBottom: '4px'
  },
  videoAttachment: {
    maxWidth: '100%',
    maxHeight: '300px',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  audioContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px',
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: '20px',
    marginBottom: '4px'
  },
  audioIcon: {
    fontSize: '20px'
  },
  audioPlayer: {
    flex: 1,
    height: '32px'
  },
  documentContainer: {
    marginBottom: '4px'
  },
  pdfPreview: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px',
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: '8px',
    marginBottom: '8px'
  },
  pdfIcon: {
    fontSize: '32px'
  },
  pdfInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  pdfName: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#333'
  },
  pdfSize: {
    fontSize: '12px',
    color: '#666'
  },
  pdfActions: {
    display: 'flex',
    gap: '8px'
  },
  pdfButton: {
    flex: 1,
    padding: '8px',
    fontSize: '13px',
    backgroundColor: '#25D366',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '600'
  },
  documentAttachment: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: '8px',
    textDecoration: 'none',
    color: 'inherit',
    marginBottom: '4px'
  },
  documentIcon: { fontSize: '20px' },
  fileSize: { fontSize: '11px', opacity: 0.7 },
  editContainer: { width: '100%' },
  editInput: {
    width: '100%',
    padding: '8px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    marginBottom: '8px'
  },
  editButtons: { display: 'flex', gap: '8px' },
  saveBtn: {
    padding: '4px 12px',
    fontSize: '12px',
    backgroundColor: '#25D366',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  cancelBtn: {
    padding: '4px 12px',
    fontSize: '12px',
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  messageFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '2px'
  },
  timestamp: {
    fontSize: '11px',
    color: 'rgba(0,0,0,0.45)'
  },
  editedLabel: {
    fontSize: '11px',
    fontStyle: 'italic',
    color: 'rgba(0,0,0,0.45)'
  },
  readStatus: {
    fontSize: '11px',
    marginLeft: '4px',
    color: '#53bdeb'
  },
  pollContainer: {
    padding: '12px',
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderRadius: '8px',
    marginBottom: '4px'
  },
  pollHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px'
  },
  pollIcon: {
    fontSize: '20px'
  },
  pollQuestion: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#333'
  },
  pollOptions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '10px'
  },
  pollOptionWrapper: {
    width: '100%'
  },
  pollButton: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    backgroundColor: 'white',
    color: '#075E54',
    border: '1px solid #128C7E',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'all 0.2s'
  },
  pollResult: {
    padding: '10px',
    border: '1px solid #e0e0e0',
    borderRadius: '6px',
    backgroundColor: 'white'
  },
  pollResultTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px'
  },
  pollOptionText: {
    fontSize: '14px',
    color: '#333',
    fontWeight: '500'
  },
  pollPercentage: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#075E54'
  },
  pollProgressBar: {
    width: '100%',
    height: '6px',
    backgroundColor: '#e0e0e0',
    borderRadius: '3px',
    overflow: 'hidden',
    marginBottom: '4px'
  },
  pollProgressFill: {
    height: '100%',
    transition: 'width 0.3s'
  },
  pollVoteCount: {
    fontSize: '11px',
    color: '#666'
  },
  checkmark: {
    color: '#25D366',
    fontWeight: 'bold'
  },
  pollFooter: {
    fontSize: '12px',
    color: '#666',
    fontStyle: 'italic'
  },
  pollError: {
    padding: '10px',
    fontSize: '13px',
    color: '#dc3545',
    fontStyle: 'italic'
  },
  typingWrapper: {
    display: 'flex',
    justifyContent: 'flex-start',
    marginTop: '8px'
  },
  typingBubble: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    backgroundColor: 'white',
    borderRadius: '7.5px',
    boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)'
  },
  typingText: {
    fontSize: '13px',
    color: '#666',
    fontStyle: 'italic'
  },
  typingDots: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center'
  },
  dot: {
    width: '6px',
    height: '6px',
    backgroundColor: '#999',
    borderRadius: '50%',
    animation: 'bounce 1.4s infinite ease-in-out both'
  },
  scrollButton: {
    position: 'absolute',
    bottom: '20px',
    right: '20px',
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: '#25D366',
    color: 'white',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
    transition: 'all 0.3s',
    zIndex: 10
  },
  contextMenu: {
    position: 'fixed',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    padding: '8px 0',
    zIndex: 1000,
    minWidth: '150px'
  },
  contextMenuItem: {
    padding: '10px 16px',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    borderBottom: '1px solid #f0f0f0'
  },
  fullscreenOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.95)',
    zIndex: 2000,
    display: 'flex',
    flexDirection: 'column'
  },
  fullscreenHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '15px 20px',
    backgroundColor: 'rgba(0,0,0,0.8)',
    color: 'white'
  },
  fullscreenTitle: {
    fontSize: '16px',
    fontWeight: '500'
  },
  fullscreenActions: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center'
  },
  fullscreenBtn: {
    padding: '8px 12px',
    fontSize: '14px',
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  zoomLevel: {
    fontSize: '14px',
    color: 'white',
    minWidth: '50px',
    textAlign: 'center'
  },
  fullscreenContent: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'auto',
    padding: '20px'
  },
  fullscreenImage: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    transition: 'transform 0.2s'
  },
  fullscreenVideo: {
    maxWidth: '100%',
    maxHeight: '100%'
  },
  pdfViewerOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.95)',
    zIndex: 2000,
    display: 'flex',
    flexDirection: 'column'
  },
  pdfViewerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '15px 20px',
    backgroundColor: 'rgba(0,0,0,0.8)',
    color: 'white'
  },
  pdfViewerTitle: {
    fontSize: '16px',
    fontWeight: '500'
  },
  pdfIframe: {
    flex: 1,
    width: '100%',
    border: 'none'
  }
};

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes bounce {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-8px); }
    }
    div[style*="contextMenuItem"]:hover {
      background-color: #f0f0f0 !important;
    }
    button[style*="scrollButton"]:hover {
      transform: scale(1.1);
    }
    button[style*="pollButton"]:hover {
      background-color: #D7F0DD !important;
      border-color: #25D366 !important;
    }
    button[style*="pdfButton"]:hover {
      background-color: #128C7E !important;
    }
    button[style*="fullscreenBtn"]:hover {
      background-color: rgba(255,255,255,0.2) !important;
    }
  `;
  document.head.appendChild(style);
}

export default ChatArea;