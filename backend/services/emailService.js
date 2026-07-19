// backend/services/emailService.js
//
// Auth Spec v2 §3/§4 — the one place that actually sends an email. If real SMTP
// credentials aren't configured (nothing is set up yet for this project), falls
// back to logging the email to the server console instead of failing — so the
// entire verification/reset flow is fully testable end-to-end without live
// credentials. Swapping in real delivery later is purely an env-var change, no
// code changes: set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS (and optionally
// SMTP_SECURE/SMTP_FROM) and this file starts sending real mail automatically.

const nodemailer = require('nodemailer');

const hasSmtpConfig = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter = null;
if (hasSmtpConfig) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

/**
 * Sends an email, or — if no SMTP is configured — logs it clearly to the console
 * instead (dev fallback). Returns { delivered, devMode } so callers can tell which
 * happened without needing to inspect logs (e.g. to surface a helpful message in
 * local dev tooling later).
 */
const sendEmail = async ({ to, subject, html, text }) => {
  if (!transporter) {
    console.warn('⚠️  [DEV EMAIL — no SMTP configured, not actually sent]');
    console.warn(`   To:      ${to}`);
    console.warn(`   Subject: ${subject}`);
    console.warn(`   ${(text || html || '').toString()}`);
    return { delivered: false, devMode: true };
  }

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || '"ClassVibe" <no-reply@classvibe.app>',
    to,
    subject,
    html,
    text
  });
  return { delivered: true, devMode: false, messageId: info.messageId };
};

module.exports = { sendEmail, hasSmtpConfig };
