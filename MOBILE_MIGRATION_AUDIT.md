# ClassVibe → Android (Capacitor) Migration Audit — Phase 1

Status: **Audit only. No code changed.** This is the checklist requested before Phase 2 begins.

## Recommendation: Capacitor confirmed as the right tool

No strong reason to deviate. The app is a standard CRA (`react-scripts`) SPA with no SSR, no native-DOM-heavy libraries, and state-driven (not URL-routed) navigation — exactly Capacitor's sweet spot. It wraps the existing `build/` output in a native WebView shell; the React/JS codebase is untouched.

---

## 1. Critical blockers — must fix before the app is usable natively

These aren't polish items; without them core flows will not work at all in a packaged Android app.

### 1.1 Google Sign-In will not work as implemented
`AuthScreen.jsx` loads Google's **GSI JS SDK** (`accounts.google.com/gsi/client`) and calls `google.accounts.id.renderButton()` — a popup/One-Tap flow. Google actively blocks this flow inside embedded WebViews (including Capacitor's), returning `disallowed_useragent`. **This will fail 100% of the time on-device**, not intermittently.
- Fix: route Google auth through the system browser (Chrome Custom Tabs) via `@capacitor/browser` or a native plugin (`@codetrix-studio/capacitor-google-auth`), then hand the resulting ID token to the *existing* `googleAuth()` backend call — the backend endpoint itself needs zero changes.
- Backend impact: none. `verifyGoogleIdToken`/`resolveGoogleUser` already just take an ID token.

### 1.2 Backend CORS will reject every request from the app
`backend/server.js`'s `isAllowedOrigin()` allows only `FRONTEND_URL`, `localhost`/`127.0.0.1`, and `192.168.x.x`. A Capacitor Android WebView sends `Origin: capacitor://localhost` (or `https://localhost` if `androidScheme: 'https'` is configured) — **neither is in the allowlist**. Every `fetch`/axios call and the Socket.IO handshake will be blocked.
- Fix: add `capacitor://localhost` (and `https://localhost` if that scheme is chosen) to `isAllowedOrigin`. One-line backend change, no other logic touched.

### 1.3 `window.open()` for "Open Full Size" QR code
`Header.js:376` does `const w = window.open(); w.document.write(...)`. This pattern (writing HTML into a blank popup window) is unreliable-to-broken in WebViews — popups are frequently suppressed entirely, and even when allowed, `document.write` into an about:blank window is fragile.
- Fix: replace with an in-app modal/lightbox `<img>` overlay (same visual result, no new window). Small, contained change.

### 1.4 File "download" links don't download in a WebView
Two places use the `<a download>` trick:
- `ChatArea.js:306` (`downloadFile`) — saving a chat file attachment.
- `StudentAnalytics.jsx:61-65` — exporting the analytics CSV.

The HTML `download` attribute is not honored the same way inside Android WebViews; clicking these links typically just navigates in-place instead of saving a file, so both features silently stop working.
- Fix (Phase 4, native plugin): fetch the blob, write it via `@capacitor/filesystem`, then hand off to `@capacitor/share` (Android's native "Save/Share" sheet). This is the correct native replacement, not a workaround.

### 1.5 Shareable "Copy QR Link" uses `window.location.origin`
`Header.js:367` builds the join link as `` `${window.location.origin}${window.location.pathname}?pin=${pin}` ``. Inside the native app, `window.location.origin` resolves to `capacitor://localhost`, not the real public web address — a link copied *from inside the Android app* would be meaningless to whoever receives it.
- Fix: use the existing `REACT_APP_API_URL`-style public base URL (already used correctly server-side for QR code generation in `routes/quiz.js`) instead of `window.location.origin` whenever the app is running natively. Small, surgical fix.
- Note this is the seed for a nicer improvement later (Phase 4/5, optional): Android App Links so a shared `https://classvibe.app?pin=...` link opens the app directly instead of a browser. Not required for parity — current QR/PIN-in-classroom join flow works fine without it.

### 1.6 `.env.local` will silently poison a local release build
`frontend/.env.local` (this dev machine's file) points at `http://localhost:5000`. Per CRA's env precedence, `.env.local` **outranks** `.env.production` even during `npm run build`. If Phase 5's release AAB/APK is built from this machine without removing/renaming that file first, the packaged app will try to talk to `localhost:5000` — meaningless on a real device — and every network call will fail.
- Not a code bug, an operational gotcha. Will be called out explicitly as a release-build precondition in Phase 5, and I'll verify the production `build/` output doesn't contain `localhost` before every release build.

---

## 2. Real but non-blocking — should fix, won't crash the app

| Area | Finding | Plan |
|---|---|---|
| Status bar / safe area | Only the bottom nav has `env(safe-area-inset-bottom)` (`layout.css`). The sticky `Header` has no top inset handling. | Prefer configuring Capacitor's `StatusBar` plugin to **not overlay** the WebView (push content down natively) — avoids new CSS entirely, matches "don't touch existing UI unless necessary." Fall back to `env(safe-area-inset-top)` only if overlay mode turns out to be needed. |
| Android hardware/gesture back button | `react-router-dom` is a declared dependency but **entirely unused** — zero `<Route>`/`useNavigate`/`BrowserRouter` anywhere. All navigation is React state in `App.js` (modals, `dashboardView`, `studentView`, quiz overlays, etc.), so there's no browser history to hook into. | Add a `@capacitor/app` `backButton` listener that closes the topmost open modal/overlay first, then steps back through the app's own view state, and only exits the app when at the true root (dashboard, logged out). This needs a small, explicit "what's currently on top" stack — will design this carefully in Phase 3 since it's the one piece of real new logic, not just wrapping. |
| File input / camera / gallery | 3 native `<input type="file">` usages: chat attach (`MessageInput.js`), profile photo (`Sidebar.js`, already `accept="image/*"`), and QuizCreator's content-generation upload. Plain file inputs *do* trigger Android's native picker automatically inside a WebView — this likely works with zero changes. | Verify as-is in Phase 6 testing. Optionally (Phase 4, purely additive) swap to `@capacitor/camera` for a nicer direct-camera-launch option — not required for parity, current behavior (chooser dialog) will work. |
| Clipboard | `navigator.clipboard.writeText` used in `ChatArea.js` (copy message) and `Header.js` (copy QR link). Standard Clipboard API works fine in modern Android WebViews (API 21+ effectively guaranteed via Capacitor's minimum WebView version) — no change expected, will confirm in testing. | No action unless testing reveals otherwise. |
| Notifications | No browser `Notification` API and no service worker registration anywhere — all "notifications" are in-app UI (`NotificationBell`/`NotificationCenter`) fed by REST + Socket.IO. This means there is currently **no push capability to preserve** — nothing breaks, but there's also no background/killed-app notification delivery. | Out of scope for parity (nothing to preserve). Flagging as an optional Phase 4/5 addition (`@capacitor/push-notifications` + FCM) if wanted later — will not build this unless asked, per "no feature redesigns." |
| `localStorage` (auth token, user, theme, etc.) | 76 usages across 21 files, heaviest in `App.js`. Works fine as-is inside a Capacitor WebView (backed by the native WebView engine) — no polyfill needed. | No change required. Could optionally harden the auth token specifically via `@capacitor/preferences` later, but that's a robustness nice-to-have, not a requirement — will not touch this without a specific reason found in testing. |
| PWA manifest (`public/manifest.json`) | Still the default CRA boilerplate (`"React App"`, generic icons), unused by anything in the app (no install prompt, no service worker). | Not used by Capacitor at all (it generates its own native icon/splash resources separately). Leave as-is or clean up trivially in Phase 5 — cosmetic only, zero functional impact either way. |
| Whiteboard canvas | Already has correct `touchstart/touchmove/touchend`, `touchAction:'none'`, and a resize listener (confirmed working from the earlier mobile-responsive pass). | No action expected; will re-verify on-device in Phase 6 since canvas touch handling is exactly the kind of thing that can differ subtly between mobile Chrome and Android System WebView. |
| Responsive layout | Extensive mobile-first work already done and verified live in-browser down to 360px across every screen (`useBreakpoint()`, `BottomNav`, dashboard/settings/quiz/whiteboard fixes) in earlier phases this session. | Should largely carry over unchanged. Phase 3 is mostly *verification on a real WebView*, not new layout work — will not redo work already done. |
| Landscape | Not explicitly tested previously (session focus was portrait/mobile-width). | Spot-check in Phase 3/6; fix only if something genuinely breaks — no proactive redesign. |

---

## 3. Confirmed non-issues (checked, nothing to do)

- **Socket.IO** (`socket.js`): singleton, `autoConnect:false`, infinite reconnection with capped backoff, already built for exactly the kind of network flakiness (background/foreground, cold-start backend) that mobile makes more common. No changes anticipated; will verify background/foreground reconnection specifically in Phase 6 since Android can suspend WebView JS timers more aggressively than desktop Chrome.
- **Environment variables**: already externalized via `REACT_APP_API_URL` / `REACT_APP_SOCKET_URL` / `REACT_APP_GOOGLE_CLIENT_ID`, already pointed at the real deployed backend in `.env`/`.env.production`. Exactly the setup Capacitor needs (app bundles static JS, always talks to a real remote backend — there's no "same origin" to rely on, which this app already doesn't rely on).
- **Camera/geolocation/vibration/MediaRecorder APIs**: none used anywhere currently. Nothing to preserve; only relevant if new native features are requested later.
- **Build tooling**: plain `react-scripts build` producing a static `build/` folder — exactly Capacitor's expected input, no ejecting or bundler changes needed.

---

## 4. What's genuinely missing for a Play Store submission (not a code/audit item, a content item)

Per your own note — confirmed via search, **none of these exist in the repo today**:
- No Privacy Policy page/document (`Footer.jsx`'s social links are even still placeholder `YOUR_USERNAME` URLs).
- No Terms & Conditions.
- No real app icon/logo asset anywhere — "ClassVibe" in the header is styled **text**, not an image (`Header.js` `<span style={S.logo}>ClassVibe</span>`). `public/logo192.png`/`logo512.png` are the generic default CRA placeholders, unrelated to the product.
- No splash screen asset.

Google Play requires a hosted Privacy Policy URL for any app handling accounts/user content — this is a hard submission blocker, not a nice-to-have. Will draft Privacy Policy, Terms, and an About page as plain content (not tied to app logic) once you confirm scope, plus propose an icon/splash direction — these need your sign-off on branding/wording before I finalize them.

---

## 5. Proposed order of work (unchanged from your phases, just restating the gate)

1. ✅ **Phase 1 — this document.**
2. **Phase 2** — add Capacitor to the existing `frontend/` (new `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` deps + `capacitor.config.ts` + `android/` folder living alongside, not replacing, the current structure), point it at `build/`, get a debug APK installed and loading the real app end-to-end (even with 1.1–1.5 above still unfixed, just to prove the wrapping works) before fixing anything.
3. Fix 1.1–1.5 (the real blockers) as their own small, verifiable steps.
4. **Phase 3** — on-device pass over every screen for status bar / back button / keyboard / landscape, per the table above.
5. **Phase 4** — native plugin swaps (file download → Filesystem+Share; optional camera polish), only where item 2 confirmed the browser version doesn't already work.
6. **Phase 5** — icons, splash, signing, Play Store metadata, Privacy Policy/Terms/About content.
7. **Phase 6** — full workflow re-test on-device per your checklist.
8. **Phase 7** — deliverables writeup.

I'm stopping here per "work incrementally and verify each phase" — nothing installed or changed yet. Let me know if this matches your expectations before I start Phase 2 (adding Capacitor).
