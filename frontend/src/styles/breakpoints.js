// Design System (Phase 1) — breakpoint constants + a shared responsive hook.
//
// Today, 9+ components read window.innerWidth directly and ad hoc, each with
// its own (uncoordinated) resize handling, if any. This gives later phases a
// single source of truth for breakpoint values and a hook with ONE shared
// resize listener instead of one per component.
//
// Values match the device list this redesign targets: 360/390px phones,
// 768px tablets, 1024px laptops, 1440px desktops.

import { useState, useEffect } from 'react';

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

// Single shared resize listener — every component calling useBreakpoint()
// re-renders only when the bucket actually changes, not on every pixel.
export const useBreakpoint = () => {
  const [bucket, setBucket] = useState(() =>
    typeof window !== 'undefined' ? getBucket(window.innerWidth) : 'desktop'
  );

  useEffect(() => {
    const handleResize = () => {
      const next = getBucket(window.innerWidth);
      setBucket(prev => (prev === next ? prev : next));
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return bucket; // 'mobile' | 'tablet' | 'laptop' | 'desktop'
};
