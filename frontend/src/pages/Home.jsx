import React from "react";
import "./Home.css";

export default function Home({ onTeacher, onStudent }) {
  return (
    <div className="home">
      <header>
        <h2>ClassVibe</h2>
      </header>

      <main>
        <div className="home-inner">
          <h1>
            Welcome to <span id="name">ClassVibe</span>
          </h1>

          <p className="sub1">
            Interactive classroom engagement made simple. Connect with <br />
            your students in real-time and create an engaging learning environment.
          </p>

          <div className="row feature-row">
            <div className="col-1">
              <div className="feature-card">
                <img
                  src="/css/all.min.css/qr.png"
                  alt="qr code"
                  className="big-icon"
                />
                <h3>Instant Access</h3>
                <p>
                  Students join sessions instantly with QR codes or PIN numbers.
                  No accounts needed.
                </p>
              </div>
            </div>

            <div className="col-1">
              <div className="feature-card">
                <img
                  src="/css/all.min.css/comment.png"
                  alt="chat"
                  className="big-icon"
                />
                <h3>Real-time Chat</h3>
                <p>Engage students with live messaging, polls, and interactive activities.</p>
              </div>
            </div>

            <div className="col-1">
              <div className="feature-card">
                <img
                  src="/css/all.min.css/skill-user.png"
                  alt="Management"
                  className="big-icon"
                />
                <h3>Classroom Management</h3>
                <p>Manage sessions, moderate content, and track participation effortlessly.</p>
              </div>
            </div>
          </div>

          <h2 className="mid">Choose Your Role</h2>
          <p className="sub2">Are you a teacher starting a session or a student joining one?</p>

          <div className="row">
            <div className="col-2">
              <div className="role-card">
                <img
                  src="/css/all.min.css/teacher.png"
                  alt="Teacher"
                  className="big-icon"
                />
                <h2>Teacher</h2>
                <p>Create a classroom and start<br /> engaging with your students</p>
                <br />
                <button className="btn" onClick={onTeacher}>Start as Teacher</button>
              </div>
            </div>

            <div className="col-2">
              <div className="role-card">
                <img
                  src="/css/all.min.css/student.png"
                  alt="student"
                  className="big-icon"
                />
                <h2>Student</h2>
                <p>Join a classroom using a PIN<br />code or by scanning a QR code</p>
                <br />
                <button className="btn-1" onClick={onStudent}>Join as Student</button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer>
        <div className="social-links">
          <ul>
            <li><img src="/css/all.min.css/instagram.png" alt="instagram" /></li>
            <li><img src="/css/all.min.css/linkedin.png" alt="linkedin" /></li>
            <li><img src="/css/all.min.css/telegram.png" alt="telegram" /></li>
          </ul>
        </div>
        © ClassVibe. Connecting classrooms worldwide.
      </footer>
    </div>
  );
}
