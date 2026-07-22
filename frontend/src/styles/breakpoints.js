// Design System (Phase 1, fixed in Phase 5) — breakpoint constants + a
// shared responsive hook.
//
// Today, 9+ components read window.innerWidth directly and ad hoc, each with
// its own (uncoordinated) resize handling, if any. This gives later phases a
// single source of truth for breakpoint values and a hook with ONE shared
// resize listener instead of one per component.
//
// Phase 5 fix: the original implementation gave every useBreakpoint() call
// its own useEffect + addEventListener('resize', ...) — by Phase 5 that was
// 8 independent listeners (App.js, Header.js, QuizCreator.jsx, Sidebar.js,
// DashboardNav.jsx, BottomNav.jsx, FloatingQuizButton.jsx,
// DesignSystemPreview.jsx) all doing redundant work on every resize event,
// contradicting this file's own "single shared resize listener" comment.
// Rewritten on useSyncExternalStore (React 18+) so there's a genuine single
// module-level listener, attached lazily on first subscriber. Public API
// (useBreakpoint() returns the same bucket string) is unchanged, so no
// caller needed to change.
//
// Values match the device list this redesign targets: 360/390px phones,
// 768px tablets, 1024px laptops, 1440px desktops.

import { useSyncExternalStore } from 'react';

export const BREAKPOINTS = {
  mobile: 360,
  mobileLg: 390,
  tablet: 768,
  laptop: 1024,
  desktop: 1440,
};

const getBucket = (width) => {
  if (width < BREAKPOINTS.tablet) return 'mobile';
  if (width < BREAKPOINTS.laptop) return 'tablet';
  if (width < BREAKPOINTS.desktop) return 'laptop';
  return 'desktop';
};

let currentBucket = typeof window !== 'undefined' ? getBucket(window.innerWidth) : 'desktop';
const listeners = new Set();
let resizeListenerAttached = false;

const handleResize = () => {
  const next = getBucket(window.innerWidth);
  if (next !== currentBucket) {
    currentBucket = next;
    listeners.forEach(l => l());
  }
};

const subscribe = (callback) => {
  if (!resizeListenerAttached && typeof window !== 'undefined') {
    window.addEventListener('resize', handleResize);
    resizeListenerAttached = true;
  }
  listeners.add(callback);
  return () => listeners.delete(callback);
};

const getSnapshot = () => currentBucket;
const getServerSnapshot = () => 'desktop';

export const useBreakpoint = () => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
