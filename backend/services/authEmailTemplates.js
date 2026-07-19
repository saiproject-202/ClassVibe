// backend/services/authEmailTemplates.js
//
// Auth Spec v2 §3/§4 — email CONTENT lives here, separate from emailService.js's
// SENDING mechanism, so either can change independently (a different transport, or
// a different template, never both at once).
//
// Link format: simple query params on FRONTEND_URL, matching the pattern this app
// already uses for the PIN-join QR flow (?pin=123456 read via URLSearchParams in
// App.js). Phase 4 adds the two small screens that read ?verifyToken=/?resetToken=
// and call the corresponding backend endpoint — no routing library needed, same
// approach already used elsewhere in this app.

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const verificationEmail = (user, rawToken) => {
  const link = `${FRONTEND_URL}/?verifyToken=${rawToken}`;
  return {
    subject: 'Verify your ClassVibe email',
    text: `Hi ${user.name},\n\nVerify your email to finish setting up your ClassVibe account:\n${link}\n\nThis link expires in 24 hours. If you didn't create a ClassVibe account, you can ignore this email.`,
    html: `
      <p>Hi ${user.name},</p>
      <p>Verify your email to finish setting up your ClassVibe account:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link expires in 24 hours. If you didn't create a ClassVibe account, you can ignore this email.</p>
    `
  };
};

const passwordResetEmail = (user, rawToken) => {
  const link = `${FRONTEND_URL}/?resetToken=${rawToken}`;
  return {
    subject: 'Reset your ClassVibe password',
    text: `Hi ${user.name},\n\nReset your ClassVibe password here:\n${link}\n\nThis link expires in 30 minutes. If you didn't request this, you can ignore this email — your password won't change.`,
    html: `
      <p>Hi ${user.name},</p>
      <p>Reset your ClassVibe password here:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link expires in 30 minutes. If you didn't request this, you can ignore this email — your password won't change.</p>
    `
  };
};

module.exports = { verificationEmail, passwordResetEmail };
