// src/App.js
import React, { useState, useEffect, useCallback } from 'react';
import { createGroup, getMyGroups, getGroupDetails, getMessages, endSession } from './api';
import socket from './socket';
import Home from './pages/Home';
import Login from './components/Login';
import TeacherLogin from './pages/TeacherLogin';
import StudentJoin from './pages/StudentJoin';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import MessageInput from './components/MessageInput';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authScreen, setAuthScreen] = useState('home');
  const [groups, setGroups] = useState([]);
  const [currentGroup, setCurrentGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const getUserId = (u) => u?.id ?? u?._id ?? u?.userId ?? null;

  const loadGroups = useCallback(async (autoSelect = false) => {
    try {
      const response = await getMyGroups();
      setGroups(response.groups || []);
      if (autoSelect && (response.groups || []).length > 0 && !currentGroup) {
        const first = response.groups[0];
        selectGroup(first._id ?? first.id);
      }
    } catch (err) {
      console.error('Error loading groups:', err);
    }
  }, [currentGroup]);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    const urlParams = new URLSearchParams(window.location.search);
    const pinFromUrl = urlParams.get('pin');

    if (savedToken) {
      try {
        const parsedUser = savedUser ? JSON.parse(savedUser) : null;
        if (parsedUser) setUser(parsedUser);
        setIsAuthenticated(true);
        socket.connect();
        socket.emit('authenticate', savedToken);
        loadGroups(true);
      } catch (err) {
        console.error('Error restoring session:', err);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    } else {
      if (pinFromUrl) {
        console.log('PIN detected in URL:', pinFromUrl);
        setAuthScreen('student');
      } else {
        setAuthScreen('home');
      }
    }
  }, [loadGroups]);

  useEffect(() => {
    if (!isAuthenticated) return;

    socket.on('newMessage', (message) => {
      setMessages(prevMessages => [...prevMessages, message]);
    });

    socket.on('userJoined', (data) => {
      if (currentGroup) {
        loadGroupDetails(currentGroup._id ?? currentGroup.id);
      }
    });

    socket.on('userTyping', (data) => {
      if (!data || !data.username) return;
      setTypingUsers(prev => {
        if (data.userId === getUserId(user)) return prev;
        if (!prev.includes(data.username)) {
          return [...prev, data.username];
        }
        return prev;
      });
    });

    socket.on('userStopTyping', (data) => {
      if (!data || !data.username) return;
      setTypingUsers(prev => prev.filter(u => u !== data.username));
    });

    socket.on('onlineUsersUpdate', (data) => {
      if (currentGroup) {
        setCurrentGroup(prev => ({ ...prev, onlineUsers: data.onlineUsers }));
      }
    });

    socket.on('sessionEnded', (data) => {
      alert('The admin has ended this session');
      loadGroups(false);
      setCurrentGroup(null);
      setMessages([]);
    });

    socket.on('messageEdited', (editedMessage) => {
      setMessages(prevMessages => 
        prevMessages.map(msg => 
          msg._id === editedMessage._id ? editedMessage : msg
        )
      );
    });

    socket.on('messageDeleted', (data) => {
      setMessages(prevMessages => 
        prevMessages.map(msg => 
          msg._id === data.messageId 
            ? { ...msg, isDeleted: true, content: 'This message was deleted' }
            : msg
        )
      );
    });

    return () => {
      socket.off('newMessage');
      socket.off('userJoined');
      socket.off('userTyping');
      socket.off('userStopTyping');
      socket.off('onlineUsersUpdate');
      socket.off('sessionEnded');
      socket.off('messageEdited');
      socket.off('messageDeleted');
    };
  }, [isAuthenticated, currentGroup, loadGroups, user]);

  const loadGroupDetails = async (groupId) => {
    try {
      const response = await getGroupDetails(groupId);
      setCurrentGroup(response.group);
    } catch (err) {
      console.error('Error loading group details:', err);
    }
  };

  const selectGroup = async (groupId) => {
    try {
      console.log('📂 Selecting group:', groupId);
      const groupResponse = await getGroupDetails(groupId);
      setCurrentGroup(groupResponse.group);
      const messagesResponse = await getMessages(groupId);
      setMessages(messagesResponse.messages || []);
      socket.emit('joinGroup', groupId);
      console.log('✅ Group selected successfully');
    } catch (err) {
      console.error('Error selecting group:', err);
      alert('Failed to join classroom: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleCreateGroup = async () => {
    const groupName = prompt('Enter classroom name:');
    if (!groupName || !groupName.trim()) return;
    try {
      const response = await createGroup(groupName.trim());
      alert(`Classroom created! PIN: ${response.group?.pin ?? response.group?.data?.pin}`);
      await loadGroups();
      const id = response.group?._id ?? response.group?.id;
      if (id) selectGroup(id);
    } catch (err) {
      console.error('Error creating group:', err);
      alert('Failed to create classroom');
    }
  };

  // ✅ UPDATED: Handle poll messages
  const handleSendMessage = (messageData) => {
    if (!currentGroup) return;
    const payload = {
      groupId: currentGroup._id ?? currentGroup.id,
      content: messageData.content,
      messageType: messageData.messageType,
      recipientId: messageData.recipientId,
      fileUrl: messageData.fileUrl || null,
      fileName: messageData.fileName || null,
      fileSize: messageData.fileSize || null,
      fileType: messageData.fileType || null
    };
    // ✅ Add poll options if poll message
    if (messageData.messageType === 'poll' && messageData.pollOptions) {
      payload.pollOptions = messageData.pollOptions;
    }
    socket.emit('sendMessage', payload);
  };

  const handleTyping = () => {
    if (!currentGroup) return;
    socket.emit('typing', { groupId: currentGroup._id ?? currentGroup.id });
  };

  const handleStopTyping = () => {
    if (!currentGroup) return;
    socket.emit('stopTyping', { groupId: currentGroup._id ?? currentGroup.id });
  };

  const handleEndSession = async () => {
    if (!currentGroup) return;
    const confirmed = window.confirm('Are you sure you want to end this session?');
    if (!confirmed) return;
    const groupId = currentGroup._id ?? currentGroup.id;
    try {
      console.log('🔴 Ending session:', groupId);
      await endSession(groupId);
      setCurrentGroup(null);
      setMessages([]);
      console.log('✅ Session ended, returned to dashboard');
      setTimeout(() => {
        loadGroups(false);
      }, 100);
    } catch (err) {
      console.error('❌ Error ending session:', err);
      alert('Failed to end session: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleLeaveMeeting = () => {
    const confirmed = window.confirm('Are you sure you want to leave this session?');
    if (!confirmed) return;
    try {
      socket.emit('leaveGroup', currentGroup._id ?? currentGroup.id);
      setCurrentGroup(null);
      setMessages([]);
      console.log('✅ Left session successfully');
    } catch (err) {
      console.error('Error leaving session:', err);
    }
  };

  const handleMessageEdited = (editedMessage) => {
    console.log('App.js - Message edited:', editedMessage);
    setMessages(prevMessages => 
      prevMessages.map(msg => 
        msg._id === editedMessage._id ? editedMessage : msg
      )
    );
  };

  const handleMessageDeleted = (messageId) => {
    console.log('App.js - Message deleted:', messageId);
    setMessages(prevMessages => 
      prevMessages.map(msg => 
        msg._id === messageId 
          ? { ...msg, isDeleted: true, content: 'This message was deleted' }
          : msg
      )
    );
  };

  const handleLogout = () => {
    try {
      socket.disconnect();
    } catch (e) {
      console.warn('Socket disconnect error', e);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setIsAuthenticated(false);
    setGroups([]);
    setCurrentGroup(null);
    setMessages([]);
    setAuthScreen('home');
  };

  const handleLoginSuccess = (loggedInUser, token) => {
    if (token) localStorage.setItem('token', token);
    if (loggedInUser) {
      localStorage.setItem('user', JSON.stringify(loggedInUser));
      setUser(loggedInUser);
    } else {
      const savedUser = localStorage.getItem('user');
      if (savedUser) setUser(JSON.parse(savedUser));
    }
    const savedToken = token ?? localStorage.getItem('token');
    if (savedToken) {
      try {
        socket.connect();
        socket.emit('authenticate', savedToken);
      } catch (e) {
        console.warn('Socket auth failed at login:', e);
      }
    }
    setIsAuthenticated(true);
    loadGroups(false);
  };

  const handleGroupJoined = (group, returnedUser, token) => {
    console.log('👥 Group joined:', { 
      groupName: group?.groupName, 
      userName: returnedUser?.name,
      hasToken: !!token 
    });
    if (token) localStorage.setItem('token', token);
    if (returnedUser) {
      localStorage.setItem('user', JSON.stringify(returnedUser));
      setUser(returnedUser);
    } else {
      const savedUser = localStorage.getItem('user');
      if (savedUser) setUser(JSON.parse(savedUser));
    }
    setIsAuthenticated(true);
    const savedToken = token ?? localStorage.getItem('token');
    if (savedToken) {
      console.log('🔌 Connecting socket...');
      socket.connect();
      socket.emit('authenticate', savedToken);
      socket.once('authenticated', (response) => {
        console.log('✅ Socket authenticated');
        loadGroups(false);
        const gid = group?._id ?? group?.id;
        if (gid) {
          console.log('📂 Selecting group after auth:', gid);
          setTimeout(() => {
            selectGroup(gid);
          }, 500);
        }
      });
      setTimeout(() => {
        loadGroups(false);
        const gid = group?._id ?? group?.id;
        if (gid) {
          console.log('📂 Selecting group (fallback):', gid);
          selectGroup(gid);
        }
      }, 1000);
    }
  };

  const isAdmin = !!(
    currentGroup &&
    user &&
    currentGroup.admin &&
    (getUserId(user) && (currentGroup.admin._id === getUserId(user) || currentGroup.admin._id === user?.id || currentGroup.admin._id === user?._id))
  );

  const displayName = user?.name ?? user?.username ?? 'User';

  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    const dateStr = date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
    const timeStr = date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    return { date: dateStr, time: timeStr };
  };

  if (!isAuthenticated) {
    if (authScreen === 'home') {
      return (
        <Home
          onTeacher={() => setAuthScreen('teacher')}
          onStudent={() => setAuthScreen('student')}
        />
      );
    }
    if (authScreen === 'teacher') {
      return (
        <TeacherLogin
          onAuthSuccess={(loggedUser, token) => {
            handleLoginSuccess(loggedUser, token);
          }}
          onBack={() => setAuthScreen('home')}
        />
      );
    }
    if (authScreen === 'student') {
      return (
        <StudentJoin
          onJoinSuccess={(group, returnedUser, token) => {
            handleGroupJoined(group, returnedUser, token);
          }}
          onBack={() => setAuthScreen('home')}
        />
      );
    }
    return (
      <div>
        <Login onLoginSuccess={(userObj, token) => handleLoginSuccess(userObj, token)} />
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button
            onClick={() => setAuthScreen('teacher')}
            style={{ padding: '8px 12px', cursor: 'pointer' }}
          >
            Teacher Login / Create Class
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <Header
        onEndSession={handleEndSession}
        onLeaveMeeting={handleLeaveMeeting}
        onCreateGroup={handleCreateGroup}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isAdmin={isAdmin}
        groupName={currentGroup ? currentGroup.groupName : ''}
        userRole={user?.role}
      />

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        group={currentGroup}
        messages={messages}
        currentUserId={getUserId(user)}
        onGroupJoined={(g) => handleGroupJoined(g)}
      />

      <div className="main-content">
        {!currentGroup ? (
          <div className="group-selector">
            {user?.role === 'teacher' && (
              <>
                <div className="dashboard-welcome">
                  <h2>Welcome back, {displayName}! 👋</h2>
                  <p className="dashboard-subtitle">Manage your virtual classrooms</p>
                </div>
                <div className="create-classroom-section">
                  <button onClick={handleCreateGroup} className="create-classroom-btn">
                    <span className="btn-icon">+</span>
                    <span className="btn-text">Create a Classroom</span>
                  </button>
                  <p className="create-hint">Start a new session and invite students</p>
                </div>
                {groups.length > 0 ? (
                  <div className="dashboard-content">
                    <div className="section-header">
                      <h3>Your Classrooms</h3>
                      <span className="count-badge">{groups.length}</span>
                    </div>
                    <div className="classroom-grid">
                      {groups.map((group) => {
                        const { date, time } = formatDateTime(group.createdAt);
                        return (
                          <div
                            key={group._id ?? group.id}
                            className={`classroom-card ${!group.isActive ? 'inactive' : ''}`}
                          >
                            <div className="card-header">
                              <h4 className="classroom-name">{group.groupName}</h4>
                              <span className={group.isActive ? "badge-active" : "badge-ended"}>
                                {group.isActive ? 'Active' : 'Ended'}
                              </span>
                            </div>
                            <div className="card-body">
                              <div className="info-row">
                                <span className="info-icon">📌</span>
                                <span className="info-label">PIN:</span>
                                <span className="info-value">{group.pin}</span>
                              </div>
                              <div className="info-row">
                                <span className="info-icon">👥</span>
                                <span className="info-label">Members:</span>
                                <span className="info-value">{(group.members || []).length}</span>
                              </div>
                              <div className="info-row">
                                <span className="info-icon">📅</span>
                                <span className="info-label">Created:</span>
                                <span className="info-value">{date}</span>
                              </div>
                              <div className="info-row">
                                <span className="info-icon">🕐</span>
                                <span className="info-label">Time:</span>
                                <span className="info-value">{time}</span>
                              </div>
                            </div>
                            {group.isActive && (
                              <button
                                onClick={() => selectGroup(group._id ?? group.id)}
                                className="card-action-btn"
                              >
                                Resume Session →
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">📚</div>
                    <p className="empty-title">No classrooms yet</p>
                    <p className="empty-text">
                      Click "Create a Classroom" above to get started!
                    </p>
                  </div>
                )}
              </>
            )}
            {user?.role === 'student' && (
              <>
                <div className="dashboard-welcome">
                  <h2>Welcome, {displayName}! 👋</h2>
                  <p className="dashboard-subtitle">Your joined classrooms</p>
                </div>
                {groups.length > 0 ? (
                  <div className="dashboard-content">
                    <div className="section-header">
                      <h3>My Classrooms</h3>
                      <span className="count-badge">{groups.length}</span>
                    </div>
                    <div className="classroom-grid">
                      {groups.map((group) => {
                        const { date, time } = formatDateTime(group.createdAt);
                        const teacherName = group.admin?.name || group.admin?.username || 'Unknown Teacher';
                        return (
                          <div
                            key={group._id ?? group.id}
                            className={`classroom-card ${!group.isActive ? 'inactive' : ''}`}
                          >
                            <div className="card-header">
                              <h4 className="classroom-name">{group.groupName}</h4>
                              <span className={group.isActive ? "badge-active" : "badge-ended"}>
                                {group.isActive ? 'Active' : 'Ended'}
                              </span>
                            </div>
                            <div className="card-body">
                              <div className="info-row teacher-info">
                                <span className="info-icon">👨‍🏫</span>
                                <span className="info-label">Teacher:</span>
                                <span className="info-value teacher-name">{teacherName}</span>
                              </div>
                              <div className="info-row">
                                <span className="info-icon">👥</span>
                                <span className="info-label">Students:</span>
                                <span className="info-value">{(group.members || []).length}</span>
                              </div>
                              {group.userJoinedAt ? (
                                <>
                                  <div className="info-row">
                                    <span className="info-icon">📅</span>
                                    <span className="info-label">Joined:</span>
                                    <span className="info-value">{formatDateTime(group.userJoinedAt).date}</span>
                                  </div>
                                  <div className="info-row">
                                    <span className="info-icon">🕐</span>
                                    <span className="info-label">Time:</span>
                                    <span className="info-value">{formatDateTime(group.userJoinedAt).time}</span>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="info-row">
                                    <span className="info-icon">📅</span>
                                    <span className="info-label">Started:</span>
                                    <span className="info-value">{date}</span>
                                  </div>
                                  <div className="info-row">
                                    <span className="info-icon">🕐</span>
                                    <span className="info-label">Time:</span>
                                    <span className="info-value">{time}</span>
                                  </div>
                                </>
                              )}
                            </div>
                            {group.isActive && (
                              <button
                                onClick={() => selectGroup(group._id ?? group.id)}
                                className="card-action-btn"
                              >
                                Join Classroom →
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">🎒</div>
                    <p className="empty-title">No classrooms joined</p>
                    <p className="empty-text">
                      Ask your teacher for a PIN or scan a QR code to join!
                    </p>
                  </div>
                )}
              </>
            )}
            {!user?.role && (
              <>
                <div className="dashboard-welcome">
                  <h2>Welcome, {displayName}! 👋</h2>
                  <p className="dashboard-subtitle">Select or create a group</p>
                </div>
                <button onClick={handleCreateGroup} className="create-group-btn">
                  + Create New Group
                </button>
                {groups.length > 0 && (
                  <div className="groups-list">
                    <h3>Your Groups:</h3>
                    {groups.map((group) => (
                      <div
                        key={group._id ?? group.id}
                        onClick={() => selectGroup(group._id ?? group.id)}
                        className="group-item"
                      >
                        <div className="group-name">{group.groupName}</div>
                        <div className="group-info">
                          {(group.members || []).length} members
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            <button onClick={handleLogout} className="logout-btn">
              Logout
            </button>
          </div>
        ) : (
          <>
            <ChatArea
              messages={messages}
              currentUserId={getUserId(user)}
              currentGroup={currentGroup}
              typingUsers={typingUsers}
              onMessageEdited={handleMessageEdited}
              onMessageDeleted={handleMessageDeleted}
            />
            <MessageInput
              onSendMessage={handleSendMessage}
              onTyping={handleTyping}
              onStopTyping={handleStopTyping}
              disabled={!currentGroup || !currentGroup.isActive}
              isAdmin={isAdmin}
              members={currentGroup.members || []}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default App;