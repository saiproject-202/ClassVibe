import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/tokens.css';
import './styles/layout.css';
import App from './App.js';
import DesignSystemPreview from './components/DesignSystemPreview.jsx';
import reportWebVitals from './reportWebVitals';

// Design System (Phase 1) — living style guide, reachable at /?designsystem=1.
// Not linked from any nav; doesn't affect normal app usage at all.
const showDesignSystem = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('designsystem');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {showDesignSystem ? <DesignSystemPreview /> : <App />}
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
