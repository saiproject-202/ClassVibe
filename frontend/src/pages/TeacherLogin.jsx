// frontend/src/pages/TeacherLogin.jsx
import React, { useState } from "react";
import "./TeacherLogin.css";
import { register, login, createGroup } from "../api";
import socket from "../socket";

/**
 * TeacherLogin
 * Props:
 *  - onAuthSuccess(user, token)  // called after successful sign-in + class creation
 *  - onBack()                    // go back to home
 */
export default function TeacherLogin({ onAuthSuccess, onBack }) {
  // form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(""); // success/error display
  const [messageType, setMessageType] = useState("error"); // 'error' | 'success'
  const [isRegisterMode, setIsRegisterMode] = useState(true); // Sign Up by default

  // small helpers
  const isValidEmail = (value) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(value).toLowerCase());
  };

  const parseJwt = (token) => {
    // safe parse of JWT payload (no deps)
    try {
      const payload = token.split(".")[1];
      const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  };

  // Normalize API response shapes to { token, user }
  const extractAuth = (resp) => {
    if (!resp) return {};
    const maybe = resp.data ?? resp;
    const token = maybe.token ?? maybe.accessToken ?? null;
    const user = maybe.user ?? maybe;
    return { token, user };
  };

  // persist token/user and connect socket (auth socket after connect)
  const finishAuth = async (userObj, token) => {
    if (token) localStorage.setItem("token", token);
    if (userObj) localStorage.setItem("user", JSON.stringify(userObj));
    // If server returns only token, attempt to decode for basic info
    if (!userObj && token) {
      const parsed = parseJwt(token);
      if (parsed) {
        const derived = { id: parsed.userId ?? parsed.sub, email: parsed.email ?? email, role: parsed.role ?? "teacher" };
        localStorage.setItem("user", JSON.stringify(derived));
        userObj = derived;
      }
    }

    try {
      // connect socket AFTER storing token
      socket.connect();
      if (token) socket.emit("authenticate", token);
    } catch (e) {
      console.warn("Socket connect/emit issue:", e?.message ?? e);
    }
  };

  // Wait for socket to confirm authentication (or timeout)
  const waitForSocketAuth = (timeoutMs = 3000) =>
    new Promise((resolve) => {
      let resolved = false;
      const onAuth = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve({ ok: true });
      };
      const onError = (data) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve({ ok: false, data });
      };
      const cleanup = () => {
        socket.off("authenticated", onAuth);
        socket.off("authError", onError);
      };

      socket.once("authenticated", onAuth);
      socket.once("authError", onError);

      setTimeout(() => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve({ ok: true, timeout: true }); // proceed even on timeout
      }, timeoutMs);
    });

  // Main submit handler
  const handleCreateClass = async (e) => {
    e && e.preventDefault();
    setMessage("");
    setMessageType("error");

    // Sign Up: email + password only
    if (isRegisterMode) {
      if (!email.trim()) {
        setMessage("Enter email id");
        return;
      }
      if (!isValidEmail(email.trim())) {
        setMessage("Invalid email id");
        return;
      }
      if (!password.trim() || password.length < 6) {
        setMessage("Password must be at least 6 characters");
        return;
      }

      setLoading(true);
      try {
        // Call register (backend expects { username, password } per api.js)
        await register(email.trim(), password);

        setMessageType("success");
        setMessage("Account created. Please sign in.");

        // Switch UI to Sign In so teacher can enter name & login to create class
        setIsRegisterMode(false);
      } catch (err) {
        console.error("Register error:", err);
        const serverMsg = err?.response?.data?.error || err?.response?.data?.message || err?.message || "Registration failed";
        setMessage(serverMsg);
        setMessageType("error");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Sign In mode: teacher must provide name + credentials, then create group
    if (!name.trim() || !email.trim() || !password.trim()) {
      setMessage("Please fill Name, Email and Password.");
      return;
    }
    if (!isValidEmail(email.trim())) {
      setMessage("Invalid email id");
      return;
    }

    setLoading(true);
    try {
      // Login
      const loginResp = await login(email.trim(), password);
      let { token, user } = extractAuth(loginResp);

      // If no token returned, try fallback: maybe register returned earlier; in that rare case error
      if (!token) throw new Error("Authentication failed (no token).");

      // persist + connect socket
      await finishAuth(user, token);

      // wait for socket auth (not required but useful)
      await waitForSocketAuth(3000);

      // Create classroom using teacher name
      const groupName = `${name.trim()}'s Class`;
      let grpResp = null;
      try {
        grpResp = await createGroup(groupName);
      } catch (gErr) {
        console.warn("Group create failed", gErr);
      }
      const pin = grpResp?.group?.pin ?? grpResp?.data?.group?.pin ?? null;

      setMessageType("success");
      setMessage(pin ? `Class created — PIN: ${pin}` : "Class created successfully.");

      // Notify parent after a short delay
      setTimeout(() => {
        // ensure we return user + token to parent
        const savedUser = JSON.parse(localStorage.getItem("user") || "null");
        onAuthSuccess && onAuthSuccess(savedUser ?? user, token);
      }, 600);
    } catch (err) {
      console.error("Sign-in error:", err);
      const errMsg = err?.response?.data?.error || err?.response?.data?.message || err?.message || "Failed to sign in";
      setMessage(errMsg);
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegisterMode((s) => !s);
    setMessage("");
    setMessageType("error");
  };

  return (
    <div className="teacher-page">
      <header className="teacher-header">
        <h2>
          ClassVibe <span className="owner">- sai</span>
        </h2>
        <div className="header-actions">
          <button className="link-btn" onClick={() => onBack && onBack()}>
            Back to Home
          </button>
        </div>
      </header>

      <main className="teacher-main">
        <div className="teacher-container">
          <div className="icon">🎓</div>

          <h2 className="teacher-title">Create Your classroom</h2>
          <p className="teacher-para">Set up a new classroom session for your students</p>

          <div className="card">
            <h3>Session Setup</h3>
            <p className="hint">Enter your details to start a new session</p>

            <form onSubmit={handleCreateClass}>
              {/* show name only in Sign In mode */}
              {!isRegisterMode && (
                <>
                  <label>Teacher Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    required
                  />
                </>
              )}

              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@school.edu"
                required
              />

              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Choose a password"
                required
              />

              <button type="submit" className="create-btn" disabled={loading}>
                {loading ? "Please wait..." : isRegisterMode ? "Sign Up" : "Sign In & Create Classroom"}
              </button>
            </form>

            <div className="small-row">
              <span>{isRegisterMode ? "Already have an account?" : "Don't have an account?"}</span>
              <button className="toggle-link" onClick={toggleMode}>
                {isRegisterMode ? " Sign In" : " Sign Up"}
              </button>
            </div>

            {message && (
              <div className={`msg ${messageType === "success" ? "success" : "error"}`} role="status">
                {message}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="teacher-footer">
        <div className="social-links">
          <img src="/css/all.min.css/instagram.png" alt="ig" />
          <img src="/css/all.min.css/linkedin.png" alt="in" />
          <img src="/css/all.min.css/telegram.png" alt="tg" />
        </div>
        <div className="copyright">© 2024 ClassVibe. Connecting classrooms worldwide.</div>
      </footer>
    </div>
  );
}
