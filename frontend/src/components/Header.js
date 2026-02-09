// src/components/Header.jsx
import React from "react";

const Header = ({ 
  onEndSession, 
  onLeaveMeeting,
  onCreateGroup,
  onToggleSidebar, 
  isAdmin, 
  groupName,
  userRole,
  onBack 
}) => {
  return (
    <header style={styles.header}>
      <div style={styles.left}>
        <div style={styles.titleWrap}>
          <h2 style={styles.title}>ClassVibe</h2>
          {onBack && (
            <button onClick={onBack} style={styles.backBtn}>
              Back to Home
            </button>
          )}
          {groupName && <span style={styles.groupName}> — {groupName}</span>}
        </div>
      </div>
      <div style={styles.right}>
        {!groupName && userRole === 'teacher' && onCreateGroup && (
          <button
            onClick={onCreateGroup}
            style={styles.createButton}
            onMouseEnter={(e) => (e.target.style.backgroundColor = "#128C7E")}
            onMouseLeave={(e) => (e.target.style.backgroundColor = "#25D366")}
          >
            + Create New Chat
          </button>
        )}
        {isAdmin && groupName && (
          <button
            onClick={onEndSession}
            style={styles.endButton}
            onMouseEnter={(e) => (e.target.style.backgroundColor = "#c82333")}
            onMouseLeave={(e) => (e.target.style.backgroundColor = "#dc3545")}
          >
            End Session
          </button>
        )}
        {!isAdmin && onLeaveMeeting && groupName && (
          <button
            onClick={onLeaveMeeting}
            style={styles.leaveButton}
            onMouseEnter={(e) => (e.target.style.backgroundColor = "#e68900")}
            onMouseLeave={(e) => (e.target.style.backgroundColor = "#ff9800")}
          >
            Leave Meeting
          </button>
        )}
        <button onClick={onToggleSidebar} style={styles.menuButton}>
          <div style={styles.menuLine} />
          <div style={styles.menuLine} />
          <div style={styles.menuLine} />
        </button>
      </div>
    </header>
  );
};

const styles = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 18px",
    backgroundColor: "#075E54",
    color: "white",
    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
    position: "sticky",
    top: 0,
    zIndex: 1000,
  },
  left: {
    display: "flex",
    alignItems: "center",
  },
  titleWrap: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  title: {
    margin: 0,
    fontSize: "20px",
    fontWeight: 700,
    color: "white",
  },
  backBtn: {
    background: "#128C7E",
    color: "white",
    border: "none",
    padding: "6px 10px",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "13px",
    transition: "background-color 0.2s",
  },
  groupName: {
    marginLeft: 6,
    fontSize: "14px",
    color: "#DCF8C6",
    fontStyle: "italic",
    fontWeight: 500,
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  createButton: {
    padding: "8px 14px",
    fontSize: "14px",
    fontWeight: 700,
    backgroundColor: "#25D366",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  endButton: {
    padding: "8px 14px",
    fontSize: "14px",
    fontWeight: 700,
    backgroundColor: "#dc3545",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  leaveButton: {
    padding: "8px 14px",
    fontSize: "14px",
    fontWeight: 700,
    backgroundColor: "#ff9800",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  menuButton: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-around",
    width: "36px",
    height: "30px",
    padding: "4px",
    backgroundColor: "transparent",
    border: "none",
    cursor: "pointer",
    borderRadius: "6px",
  },
  menuLine: {
    width: "100%",
    height: "3px",
    backgroundColor: "white",
    borderRadius: "2px",
  },
};

export default Header;