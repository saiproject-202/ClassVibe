// backend/config/authProviders.js
//
// Auth Spec v2 §1/§8 — single source of truth for which auth providers exist and
// which are actually wired up. The frontend's shared auth component (Phase 4) reads
// `enabled` to decide which buttons are clickable vs. shown as "coming soon."
// Adding a real provider later means flipping `enabled: true` here and writing its
// adapter — never redesigning the auth screen or the session layer.

const AUTH_PROVIDERS = {
  email:     { label: 'Email',     enabled: true },
  google:    { label: 'Google',    enabled: true },
  apple:     { label: 'Apple',     enabled: false },
  phone:     { label: 'Phone',     enabled: false },
  microsoft: { label: 'Microsoft', enabled: false },
  github:    { label: 'GitHub',    enabled: false },
  linkedin:  { label: 'LinkedIn',  enabled: false },
  facebook:  { label: 'Facebook',  enabled: false }
};

module.exports = { AUTH_PROVIDERS };
