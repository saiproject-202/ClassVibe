// frontend/src/components/Footer.jsx
// ✅ ClassVibe footer — "© 2024 ClassVibe. All rights reserved. | Privacy Policy | Terms of Service"
//
// HOW TO USE IN App.js (add just before the closing </div> of your main layout):
//   import Footer from './components/Footer';
//   ...
//   <Footer />
//
// The footer sticks to the bottom and stays out of the chat scroll area.

import React from 'react';

const Footer = () => (
  <footer style={S.footer}>
    <span style={S.copy}>© 2024 ClassVibe. All rights reserved.</span>
    <div style={S.links}>
      <a
        href="/privacy-policy"
        style={S.link}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--cv-accent-mid)'}
        onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
      >
        Privacy Policy
      </a>
      <span style={S.divider}>|</span>
      <a
        href="/terms-of-service"
        style={S.link}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--cv-accent-mid)'}
        onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
      >
        Terms of Service
      </a>
    </div>
  </footer>
);

const S = {
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 24px',
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e2e8f0',
    flexShrink: 0,         // never shrink inside flex layout
    flexWrap: 'wrap',
    gap: '4px 16px',
  },
  copy: {
    fontSize: 12,
    color: '#94a3b8',
  },
  links: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  link: {
    fontSize: 12,
    color: '#64748b',
    textDecoration: 'none',
    transition: 'color 0.15s',
  },
  divider: {
    fontSize: 12,
    color: '#e2e8f0',
  },
};

export default Footer;