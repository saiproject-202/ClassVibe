// frontend/src/components/ManageStudents.jsx
// ⭐ NEW COMPONENT - Teacher manages allowed students

import React, { useState } from 'react';

const ManageStudents = ({ session, onUpdate, onClose }) => {
  const [emailInput, setEmailInput] = useState('');
  const [bulkEmails, setBulkEmails] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('single'); // 'single' or 'bulk'

  // Add single email
  const handleAddEmail = async () => {
    if (!emailInput.trim()) {
      alert('Please enter an email');
      return;
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailInput)) {
      alert('Please enter a valid email');
      return;
    }

    setLoading(true);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || "https://classvibe-backend.onrender.com"}/api/schedule/${session._id}/emails`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'add',
            emails: [emailInput.trim().toLowerCase()]
          })
        }
      );

      const data = await response.json();

      if (response.ok) {
        setEmailInput('');
        if (onUpdate) onUpdate(data.allowedEmails);
        alert('Email added successfully!');
      } else {
        alert(data.error || 'Failed to add email');
      }
    } catch (error) {
      console.error('Add email error:', error);
      alert('Failed to add email');
    } finally {
      setLoading(false);
    }
  };

  // Add bulk emails
  const handleAddBulkEmails = async () => {
    if (!bulkEmails.trim()) {
      alert('Please enter emails');
      return;
    }

    // Split by comma, newline, or space
    const emailsArray = bulkEmails
      .split(/[\n,\s]+/)
      .map(e => e.trim().toLowerCase())
      .filter(e => e);

    // Validate all emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emailsArray.filter(e => !emailRegex.test(e));

    if (invalidEmails.length > 0) {
      alert(`Invalid emails found:\n${invalidEmails.join('\n')}`);
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || "https://classvibe-backend.onrender.com"}/api/schedule/${session._id}/emails`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'add',
            emails: emailsArray
          })
        }
      );

      const data = await response.json();

      if (response.ok) {
        setBulkEmails('');
        if (onUpdate) onUpdate(data.allowedEmails);
        alert(`${emailsArray.length} email(s) added successfully!`);
      } else {
        alert(data.error || 'Failed to add emails');
      }
    } catch (error) {
      console.error('Add bulk emails error:', error);
      alert('Failed to add emails');
    } finally {
      setLoading(false);
    }
  };

  // Remove email
  const handleRemoveEmail = async (email) => {
    if (!window.confirm(`Remove ${email}?`)) return;

    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || "https://classvibe-backend.onrender.com"}/api/schedule/${session._id}/emails`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'remove',
            emails: [email]
          })
        }
      );

      const data = await response.json();

      if (response.ok) {
        if (onUpdate) onUpdate(data.allowedEmails);
        alert('Email removed successfully!');
      } else {
        alert(data.error || 'Failed to remove email');
      }
    } catch (error) {
      console.error('Remove email error:', error);
      alert('Failed to remove email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Manage Allowed Students</h2>
          <button onClick={onClose} style={styles.closeBtn} aria-label="Close">✕</button>
        </div>

        {/* Session Info */}
        <div style={styles.sessionInfo}>
          <h3 style={styles.sessionName}>{session.sessionName}</h3>
          <p style={styles.sessionSubject}>{session.subject}</p>
        </div>

        {/* Mode Toggle */}
        <div style={styles.modeToggle}>
          <button
            onClick={() => setMode('single')}
            style={{
              ...styles.modeBtn,
              backgroundColor: mode === 'single' ? '#25D366' : '#f0f0f0',
              color: mode === 'single' ? 'white' : '#333'
            }}
          >
            Single Email
          </button>
          <button
            onClick={() => setMode('bulk')}
            style={{
              ...styles.modeBtn,
              backgroundColor: mode === 'bulk' ? '#25D366' : '#f0f0f0',
              color: mode === 'bulk' ? 'white' : '#333'
            }}
          >
            Bulk Add
          </button>
        </div>

        {/* Input Section */}
        <div style={styles.inputSection}>
          {mode === 'single' ? (
            <>
              <p style={styles.label}>Add Student Email:</p>
              <div style={styles.inputGroup}>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="student@example.com"
                  style={styles.input}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddEmail()}
                />
                <button
                  onClick={handleAddEmail}
                  disabled={loading}
                  style={styles.addBtn}
                >
                  {loading ? 'Adding...' : 'Add'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={styles.label}>
                Paste multiple emails (separated by comma, space, or new line):
              </p>
              <textarea
                value={bulkEmails}
                onChange={(e) => setBulkEmails(e.target.value)}
                placeholder="student1@example.com, student2@example.com&#10;student3@example.com"
                style={styles.textarea}
                rows={6}
              />
              <button
                onClick={handleAddBulkEmails}
                disabled={loading}
                style={styles.bulkAddBtn}
              >
                {loading ? 'Adding...' : 'Add All Emails'}
              </button>
            </>
          )}
        </div>

        {/* Current Allowed Emails */}
        <div style={styles.emailsList}>
          <h3 style={styles.listTitle}>
            Allowed Emails ({session.allowedEmails?.length || 0})
          </h3>

          {!session.allowedEmails || session.allowedEmails.length === 0 ? (
            <p style={styles.emptyText}>
              No restrictions - Anyone can join this session
            </p>
          ) : (
            <div style={styles.emailsGrid}>
              {session.allowedEmails.map((email, index) => (
                <div key={index} style={styles.emailChip}>
                  <span style={styles.emailText}>{email}</span>
                  <button
                    onClick={() => handleRemoveEmail(email)}
                    style={styles.removeBtn}
                    disabled={loading}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button onClick={onClose} style={styles.doneBtn}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
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
  modal: {
    backgroundColor: 'white',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '600px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    overflow: 'hidden'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '1px solid #e0e0e0',
    backgroundColor: '#075E54'
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '600',
    color: 'white'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: 'white',
    padding: '0 5px'
  },
  sessionInfo: {
    padding: '15px 20px',
    backgroundColor: '#D7F0DD',
    borderBottom: '1px solid #e0e0e0'
  },
  sessionName: {
    margin: '0 0 5px 0',
    fontSize: '18px',
    fontWeight: '600',
    color: '#075E54'
  },
  sessionSubject: {
    margin: 0,
    fontSize: '14px',
    color: '#128C7E'
  },
  modeToggle: {
    display: 'flex',
    padding: '15px 20px',
    gap: '10px'
  },
  modeBtn: {
    flex: 1,
    padding: '10px',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  inputSection: {
    padding: '20px',
    borderBottom: '1px solid #e0e0e0'
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '10px',
    color: '#333'
  },
  inputGroup: {
    display: 'flex',
    gap: '10px'
  },
  input: {
    flex: 1,
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    outline: 'none'
  },
  addBtn: {
    padding: '12px 20px',
    fontSize: '14px',
    fontWeight: '600',
    backgroundColor: '#25D366',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  },
  textarea: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
    marginBottom: '10px'
  },
  bulkAddBtn: {
    width: '100%',
    padding: '12px',
    fontSize: '14px',
    fontWeight: '600',
    backgroundColor: '#25D366',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  emailsList: {
    flex: 1,
    padding: '20px',
    overflowY: 'auto'
  },
  listTitle: {
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '15px',
    color: '#333'
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: '14px',
    padding: '20px'
  },
  emailsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  emailChip: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '8px',
    border: '1px solid #e0e0e0'
  },
  emailText: {
    fontSize: '14px',
    color: '#333'
  },
  removeBtn: {
    background: '#ff4444',
    color: 'white',
    border: 'none',
    borderRadius: '50%',
    width: '24px',
    height: '24px',
    fontSize: '14px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  footer: {
    padding: '15px 20px',
    borderTop: '1px solid #e0e0e0',
    display: 'flex',
    justifyContent: 'flex-end'
  },
  doneBtn: {
    padding: '10px 24px',
    fontSize: '14px',
    fontWeight: '600',
    backgroundColor: '#075E54',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer'
  }
};

export default ManageStudents;