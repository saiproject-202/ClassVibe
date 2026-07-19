// frontend/src/pages/AuthScreen.jsx
//
// Auth Spec v2 (ChatGPT/Notion/Slack-style entry flow) — the ONE shared
// authentication component for both entry points. App.js renders this for
// authScreen === 'teacher' AND authScreen === 'student' with a different
// `role` prop; the visuals differ slightly (icon/title/copy) but every screen,
// every backend call, and the Google button are identical either way.
//
// role is only ever consulted for ACCOUNT CREATION (register / Google
// auto-create) — an existing account's real role always comes back from the
// server's response and drives which dashboard App.js renders, regardless of
// which entry point was clicked to sign in.
//
// Deliberately NOT a combined Sign Up/Sign In form. The first screen only ever
// offers providers + a single email field; pressing Continue calls
// /api/auth/check-email and the backend's answer decides whether the very next
// screen is a password field (existing account) or name/password/confirm
// (new account) — the user never manually toggles between "modes."
//
// PIN joining is not part of this screen at all — students authenticate first,
// then join a session from inside the Student Dashboard's existing "Join Live
// Session" box (handleStudentPinJoin in App.js, unchanged).

import React, { useState, useEffect, useCallback, useRef } from "react";
import "./AuthScreen.css";
import {
  register,
  login,
  checkEmail,
  googleAuth,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  getAuthProviders
} from "../api";
import { FaChalkboardTeacher, FaUserGraduate, FaApple, FaPhoneAlt } from "react-icons/fa";
import Footer from "../pages/Footer";

const ROLE_COPY = {
  teacher: {
    icon: FaChalkboardTeacher,
    title: "Teacher Authentication",
    para: "Sign in or create an account to manage your virtual classrooms",
    dashboardName: "Instructor Hub"
  },
  student: {
    icon: FaUserGraduate,
    title: "Student Authentication",
    para: "Sign in or create an account to join classrooms and track your progress",
    dashboardName: "Student Dashboard"
  }
};

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).toLowerCase());

// Google's official multi-color "G" mark — brand guidelines require the real
// mark (not a monochrome substitute) for "Continue with Google" buttons.
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9C16.98 14.2 17.64 11.9 17.64 9.2z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z"/>
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"/>
  </svg>
);

export default function AuthScreen({ role, onAuthSuccess, onBack, initialMode = "entry", initialToken = null }) {
  const [darkMode] = useState(localStorage.getItem("theme") === "dark");
  const copy = ROLE_COPY[role] || ROLE_COPY.student;
  const Icon = copy.icon;

  // mode: 'entry' | 'password' | 'register' | 'registered' | 'forgot' | 'reset' | 'verify'
  const [mode, setMode] = useState(initialMode);

  const [email, setEmail] = useState("");
  const [existingAuthProvider, setExistingAuthProvider] = useState(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");

  // Only shown after a login attempt is blocked specifically for being unverified
  // — lets the user immediately request a fresh link without retyping their email.
  const [showResendLink, setShowResendLink] = useState(false);

  // Providers registry (Auth Spec v2 §1/§8) — drives which buttons render at all.
  const [providers, setProviders] = useState(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    getAuthProviders().then((data) => setProviders(data?.providers || null)).catch(() => setProviders(null));
    // App.js deliberately does NOT strip ?verifyToken=/?resetToken= from the URL
    // itself (StrictMode double-invoke race — see App.js's comment). Safe to do
    // it here instead: initialToken/initialMode are stable props by this point,
    // not re-derived from the URL, so replacing an already-stripped URL with
    // itself on a second invocation is a harmless no-op.
    if (initialToken && (mode === "verify" || mode === "reset")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetMessage = () => { setMessage(""); setMessageType("error"); setShowResendLink(false); };

  const switchMode = (m) => {
    setMode(m);
    resetMessage();
  };

  const backToEntry = () => {
    setMode("entry");
    resetMessage();
    setPassword(""); setConfirmPassword(""); setName(""); setExistingAuthProvider(null);
  };

  // ── Verify-email mode: auto-runs once on mount when reached via an emailed link ──
  const verifyRanRef = useRef(false);
  useEffect(() => {
    if (mode !== "verify" || !initialToken || verifyRanRef.current) return;
    verifyRanRef.current = true;
    setLoading(true);
    verifyEmail(initialToken)
      .then((data) => { setMessageType("success"); setMessage(data?.message || "Email verified successfully. You can now log in."); })
      .catch((err) => { setMessageType("error"); setMessage(err?.response?.data?.error || "This verification link is invalid or has expired."); })
      .finally(() => setLoading(false));
  }, [mode, initialToken]);

  // ── STEP 1: email → decide sign-in vs. create-account ──
  const handleEmailContinue = async (e) => {
    e.preventDefault();
    resetMessage();
    const trimmed = email.trim();
    if (!trimmed || !isValidEmail(trimmed)) { setMessage("Enter a valid email"); return; }

    setLoading(true);
    try {
      const data = await checkEmail(trimmed);
      setEmail(trimmed);
      if (data.exists) {
        setExistingAuthProvider(data.authProvider);
        setMode("password");
      } else {
        setExistingAuthProvider(null);
        setMode("register");
      }
    } catch (err) {
      setMessage(err?.response?.data?.error || "Could not check that email right now");
    } finally { setLoading(false); }
  };

  // ── STEP 2a: existing account → password → sign in ──
  const handleSignIn = async (e) => {
    e.preventDefault();
    resetMessage();
    if (!password) { setMessage("Enter your password"); return; }

    setLoading(true);
    try {
      const data = await login(email, password, rememberMe);
      onAuthSuccess && onAuthSuccess(data.user, data.token);
    } catch (err) {
      const code = err?.response?.data?.code;
      const errMsg = err?.response?.data?.error || "Sign in failed";
      setMessage(errMsg);
      setShowResendLink(code === "EMAIL_NOT_VERIFIED");
    } finally { setLoading(false); }
  };

  const handleResend = async () => {
    resetMessage();
    setLoading(true);
    try {
      const data = await resendVerification(email);
      setMessageType("success");
      setMessage(data?.message || "If an account with that email exists and needs verification, a new verification link has been sent.");
    } catch {
      setMessage("Could not resend verification email right now.");
    } finally { setLoading(false); }
  };

  // ── STEP 2b: new account → name/password/confirm → register ──
  const handleRegister = async (e) => {
    e.preventDefault();
    resetMessage();
    if (!name.trim()) { setMessage("Enter your name"); return; }
    if (password.length < 6) { setMessage("Password must be at least 6 characters"); return; }
    if (password !== confirmPassword) { setMessage("Passwords do not match"); return; }

    setLoading(true);
    try {
      await register(email, password, name.trim(), role);
      setMode("registered");
    } catch (err) {
      setMessage(err?.response?.data?.error || "Registration failed");
    } finally { setLoading(false); }
  };

  // ── FORGOT PASSWORD ──
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    resetMessage();
    if (!email.trim() || !isValidEmail(email.trim())) { setMessage("Enter a valid email"); return; }

    setLoading(true);
    try {
      const data = await forgotPassword(email.trim());
      setMessageType("success");
      setMessage(data?.message || "If an account with that email exists, a password reset link has been sent.");
    } catch {
      setMessage("Could not send reset link right now.");
    } finally { setLoading(false); }
  };

  // ── RESET PASSWORD ──
  const handleResetPassword = async (e) => {
    e.preventDefault();
    resetMessage();
    if (newPassword.length < 6) { setMessage("Password must be at least 6 characters"); return; }
    if (newPassword !== confirmNewPassword) { setMessage("Passwords do not match"); return; }

    setLoading(true);
    try {
      const data = await resetPassword(initialToken, newPassword);
      setMessageType("success");
      setMessage(data?.message || "Password reset successfully. You can now log in with your new password.");
      setTimeout(() => switchMode("entry"), 1800);
    } catch (err) {
      setMessage(err?.response?.data?.error || "This password reset link is invalid or has expired.");
    } finally { setLoading(false); }
  };

  // ── GOOGLE SIGN-IN ──
  const handleGoogleCredential = useCallback(async (credentialResponse) => {
    resetMessage();
    setLoading(true);
    try {
      const idToken = credentialResponse?.credential;
      const data = await googleAuth(idToken, role, rememberMe);
      onAuthSuccess && onAuthSuccess(data.user, data.token);
    } catch (err) {
      setMessage(err?.response?.data?.error || "Google sign-in failed");
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, rememberMe]);

  const googleButtonRef = useRef(null);
  const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
  const googleEnabled = !!(googleClientId && providers?.google?.enabled);

  useEffect(() => {
    if (!googleEnabled || mode !== "entry") return;
    if (!window.google?.accounts?.id) {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => initGoogle();
      document.body.appendChild(script);
      return;
    }
    initGoogle();

    function initGoogle() {
      if (!window.google?.accounts?.id || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredential
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: darkMode ? "filled_black" : "outline",
        size: "large",
        shape: "pill",
        width: 320,
        text: "continue_with"
      });
    }
    // googleClientId is a build-time env constant, not a reactive value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleEnabled, mode, darkMode, handleGoogleCredential]);

  const appleLabel = providers?.apple?.label || "Apple";
  const phoneLabel = providers?.phone?.label || "Phone";

  const Header = () => (
    <header className="auth-header">
      <h2>ClassVibe <span className="owner">- sai</span></h2>
      <div className="header-actions">
        <button className="link-btn" onClick={() => onBack && onBack()}>Back to Home</button>
      </div>
    </header>
  );

  // ── VERIFY EMAIL screen (reached only via an emailed ?verifyToken= link) ──
  if (mode === "verify") {
    return (
      <div className={`auth-page ${darkMode ? "dark-mode" : ""}`}>
        <Header />
        <main className="auth-main">
          <div className="auth-container">
            <Icon className="icon" />
            <h2 className="auth-title">Email Verification</h2>
            <div className="card">
              {loading && <p className="hint">Verifying your email…</p>}
              {!loading && message && (
                <div className={`msg ${messageType === "success" ? "success" : "error"}`} role="status">{message}</div>
              )}
              {!loading && (
                <button className="create-btn" style={{ marginTop: 14 }} onClick={() => switchMode("entry")}>
                  Continue
                </button>
              )}
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ── RESET PASSWORD screen (reached only via an emailed ?resetToken= link) ──
  if (mode === "reset") {
    return (
      <div className={`auth-page ${darkMode ? "dark-mode" : ""}`}>
        <Header />
        <main className="auth-main">
          <div className="auth-container">
            <Icon className="icon" />
            <h2 className="auth-title">Reset Your Password</h2>
            <div className="card">
              <h3>New Password</h3>
              <p className="hint">Choose a new password for your account</p>
              <form onSubmit={handleResetPassword} autoComplete="off">
                <label>New Password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 6 characters" autoComplete="new-password" required />
                <label>Confirm New Password</label>
                <input type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Re-enter new password" autoComplete="new-password" required />
                <button type="submit" className="create-btn" disabled={loading}>
                  {loading ? "Please wait..." : "Reset Password"}
                </button>
              </form>
              {message && (
                <div className={`msg ${messageType === "success" ? "success" : "error"}`} role="status">{message}</div>
              )}
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ── FORGOT PASSWORD screen ──
  if (mode === "forgot") {
    return (
      <div className={`auth-page ${darkMode ? "dark-mode" : ""}`}>
        <Header />
        <main className="auth-main">
          <div className="auth-container">
            <Icon className="icon" />
            <h2 className="auth-title">Forgot Password</h2>
            <p className="auth-para">Enter your email and we'll send you a reset link</p>
            <div className="card">
              <form onSubmit={handleForgotPassword} autoComplete="off">
                <label>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" autoComplete="email" required />
                <button type="submit" className="create-btn" disabled={loading}>
                  {loading ? "Please wait..." : "Send Reset Link"}
                </button>
              </form>
              <div className="small-row">
                <button className="toggle-link" onClick={() => switchMode("password")}>← Back</button>
              </div>
              {message && (
                <div className={`msg ${messageType === "success" ? "success" : "error"}`} role="status">{message}</div>
              )}
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ── REGISTERED — "check your email" confirmation ──
  if (mode === "registered") {
    return (
      <div className={`auth-page ${darkMode ? "dark-mode" : ""}`}>
        <Header />
        <main className="auth-main">
          <div className="auth-container">
            <Icon className="icon" />
            <h2 className="auth-title">Check your email</h2>
            <p className="auth-para">We sent a verification link to <strong>{email}</strong>. Click it to activate your account, then sign in below.</p>
            <div className="card">
              <button className="create-btn" onClick={() => switchMode("password")}>
                Continue to Sign In
              </button>
              <div className="small-row">
                <span>Didn't get it?</span>
                <button className="toggle-link" onClick={handleResend} disabled={loading}>
                  {loading ? "Sending..." : "Resend verification email"}
                </button>
              </div>
              {message && (
                <div className={`msg ${messageType === "success" ? "success" : "error"}`} role="status">{message}</div>
              )}
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ── PASSWORD — existing account sign-in ──
  if (mode === "password") {
    const isGoogleLinked = existingAuthProvider && existingAuthProvider !== "email";
    return (
      <div className={`auth-page ${darkMode ? "dark-mode" : ""}`}>
        <Header />
        <main className="auth-main">
          <div className="auth-container">
            <Icon className="icon" />
            <h2 className="auth-title">{copy.title}</h2>
            <div className="card">
              <div className="email-chip">
                <span>{email}</span>
                <button type="button" className="toggle-link" onClick={backToEntry}>Change</button>
              </div>

              {isGoogleLinked ? (
                <div className="msg error" role="status" style={{ marginTop: 14 }}>
                  This email is linked to a {existingAuthProvider} account. Please continue with {existingAuthProvider} from the previous screen.
                </div>
              ) : (
                <form onSubmit={handleSignIn} autoComplete="off">
                  <label>Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password" autoComplete="current-password" autoFocus required />

                  <div className="remember-row">
                    <label className="remember-label">
                      <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                      Remember me
                    </label>
                    <button type="button" className="toggle-link forgot-link" onClick={() => switchMode("forgot")}>
                      Forgot password?
                    </button>
                  </div>

                  <button type="submit" className="create-btn" disabled={loading}>
                    {loading ? "Please wait..." : "Sign In"}
                  </button>
                </form>
              )}

              {message && (
                <div className={`msg ${messageType === "success" ? "success" : "error"}`} role="status">
                  {message}
                  {showResendLink && (
                    <button type="button" className="toggle-link" style={{ display: "block", marginTop: 8 }} onClick={handleResend}>
                      Resend verification email
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ── REGISTER — new account: name/password/confirm ──
  if (mode === "register") {
    return (
      <div className={`auth-page ${darkMode ? "dark-mode" : ""}`}>
        <Header />
        <main className="auth-main">
          <div className="auth-container">
            <Icon className="icon" />
            <h2 className="auth-title">Create your account</h2>
            <div className="card">
              <div className="email-chip">
                <span>{email}</span>
                <button type="button" className="toggle-link" onClick={backToEntry}>Change</button>
              </div>

              <form onSubmit={handleRegister} autoComplete="off">
                <label>Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder={role === "teacher" ? "e.g., Mrs. Smith" : "e.g., Alex Johnson"}
                  autoComplete="name" autoFocus required />

                <label>Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Choose a password (min. 6 chars)" autoComplete="new-password" required />

                <label>Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password" autoComplete="new-password" required />

                <button type="submit" className="create-btn" disabled={loading}>
                  {loading ? "Please wait..." : "Continue"}
                </button>
              </form>

              {message && (
                <div className={`msg ${messageType === "success" ? "success" : "error"}`} role="status">{message}</div>
              )}
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ── ENTRY (default) — providers + single email field ──
  return (
    <div className={`auth-page ${darkMode ? "dark-mode" : ""}`}>
      <Header />
      <main className="auth-main">
        <div className="auth-container">
          <Icon className="icon" />
          <h2 className="auth-title">{copy.title}</h2>
          <p className="auth-para">{copy.para}</p>

          <div className="card">
            <div className="provider-stack">
              {googleEnabled ? (
                <div ref={googleButtonRef} className="google-btn-slot" />
              ) : (
                <button type="button" className="provider-btn" disabled>
                  <GoogleIcon /> <span>Continue with Google</span>
                </button>
              )}

              <button type="button" className="provider-btn" disabled title="Coming soon">
                <FaApple /> <span>Continue with {appleLabel}</span>
                <span className="coming-soon-badge">Coming Soon</span>
              </button>

              <button type="button" className="provider-btn" disabled title="Coming soon">
                <FaPhoneAlt /> <span>Continue with {phoneLabel}</span>
                <span className="coming-soon-badge">Coming Soon</span>
              </button>
            </div>

            <div className="divider"><span>OR</span></div>

            <form onSubmit={handleEmailContinue} autoComplete="off">
              <label>Email Address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder={role === "teacher" ? "teacher@school.edu" : "you@example.com"}
                autoComplete="email" required />
              <button type="submit" className="create-btn" disabled={loading}>
                {loading ? "Please wait..." : "Continue"}
              </button>
            </form>

            {message && (
              <div className={`msg ${messageType === "success" ? "success" : "error"}`} role="status">{message}</div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
