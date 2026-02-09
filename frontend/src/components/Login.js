// frontend/src/components/Login.jsx
import React, { useState } from "react";
import { register, login } from "../api";
import socket from "../socket";

/**
 * Login component
 * Props:
 *  - onLoginSuccess(user, token)
 */
const Login = ({ onLoginSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const extractAuth = (resp) => {
    if (!resp) return {};
    const maybe = resp.data ?? resp;
    const token = maybe.token ?? maybe.accessToken ?? null;
    const user = maybe.user ?? maybe;
    return { token, user };
  };

  const finishAuth = (userObj, token) => {
    if (token) localStorage.setItem("token", token);
    if (userObj) localStorage.setItem("user", JSON.stringify(userObj));
    try {
      socket.connect();
      if (token) socket.emit("authenticate", token);
    } catch (e) {
      console.warn("Socket connect issue:", e?.message ?? e);
    }
  };

  const waitForSocketAuth = (timeoutMs = 3000) =>
    new Promise((resolve) => {
      let finished = false;
      const onAuth = () => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve({ ok: true });
      };
      const onError = (data) => {
        if (finished) return;
        finished = true;
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
        if (finished) return;
        finished = true;
        cleanup();
        resolve({ ok: true, timeout: true });
      }, timeoutMs);
    });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!username.trim() || !password.trim()) {
      setError("Username and password are required");
      return;
    }
    if (username.trim().length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      let resp;
      if (isRegister) {
        resp = await register(username.trim(), password);
        setSuccess("Account created. You can sign in now.");
        setIsRegister(false);
        setLoading(false);
        return;
      } else {
        resp = await login(username.trim(), password);
      }

      const { token, user } = extractAuth(resp);
      if (!token) throw new Error("Authentication failed (no token).");

      finishAuth(user, token);
      // wait a short time for socket auth but proceed even if it times out
      await waitForSocketAuth(3500);

      setSuccess("Login successful! Redirecting...");
      setTimeout(() => {
        onLoginSuccess && onLoginSuccess(user, token);
      }, 600);
    } catch (err) {
      console.error("Auth error:", err);
      const serverMsg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "An error occurred. Please try again.";
      setError(serverMsg);
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegister(!isRegister);
    setError("");
    setSuccess("");
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>{isRegister ? "Create Account" : "Welcome Back"}</h1>
        <p style={styles.subtitle}>
          {isRegister ? "Sign up to start chatting" : "Sign in to continue"}
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>{isRegister ? "Email or Username" : "Username"}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              style={styles.input}
              disabled={loading}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              style={styles.input}
              disabled={loading}
            />
          </div>

          {error && <div style={styles.errorBox}>{error}</div>}
          {success && <div style={styles.successBox}>{success}</div>}

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? "Please wait..." : isRegister ? "Create Account" : "Login"}
          </button>
        </form>

        <p style={styles.toggleText}>
          {isRegister ? "Already have an account? " : "Don't have an account? "}
          <span onClick={toggleMode} style={styles.toggleLink}>
            {isRegister ? "Login" : "Sign Up"}
          </span>
        </p>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    backgroundColor: "#f0f2f5",
    padding: "20px",
  },
  card: {
    backgroundColor: "white",
    padding: "40px",
    borderRadius: "10px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
    width: "100%",
    maxWidth: "400px",
  },
  title: {
    fontSize: "28px",
    fontWeight: "bold",
    color: "#333",
    marginBottom: "10px",
    textAlign: "center",
  },
  subtitle: {
    fontSize: "14px",
    color: "#666",
    marginBottom: "30px",
    textAlign: "center",
  },
  form: { display: "flex", flexDirection: "column", gap: "20px" },
  inputGroup: { display: "flex", flexDirection: "column", gap: "8px" },
  label: { fontSize: "14px", fontWeight: "500", color: "#333" },
  input: {
    padding: "12px",
    fontSize: "14px",
    border: "1px solid #ddd",
    borderRadius: "6px",
    outline: "none",
  },
  button: {
    padding: "12px",
    fontSize: "16px",
    fontWeight: "600",
    backgroundColor: "#007bff",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    marginTop: "10px",
  },
  errorBox: {
    padding: "12px",
    backgroundColor: "#fee",
    color: "#c33",
    borderRadius: "6px",
    fontSize: "14px",
    textAlign: "center",
  },
  successBox: {
    padding: "12px",
    backgroundColor: "#efe",
    color: "#3c3",
    borderRadius: "6px",
    fontSize: "14px",
    textAlign: "center",
  },
  toggleText: { marginTop: "20px", textAlign: "center", fontSize: "14px", color: "#666" },
  toggleLink: { color: "#007bff", cursor: "pointer", fontWeight: "600" },
};

export default Login;
