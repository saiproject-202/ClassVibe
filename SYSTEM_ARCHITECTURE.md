# ClassVibe — SYSTEM_ARCHITECTURE.md

**Architecture-only reference.** This document deliberately excludes feature walkthroughs, UI/UX detail, and per-field database schema (see `UI_UX_ARCHITECTURE.md` and `DATABASE_BIBLE.md` for those). Everything here is about *how the system is put together*: layers, boundaries, data flow at the architectural level, coupling, scaling limits, and the architectural decisions (explicit or accidental) embedded in the code.

Every claim is grounded in the actual repository at `C:\ClassVibe` as of 2026-07-05. Where the architecture is inconsistent, duplicated, or incomplete, this document says so — an architecture document that hides the real shape of the system is worse than useless to the team that inherits it.

---

## Table of Contents

1. Architectural Style & Guiding Constraints
2. System Topology
3. Process & Runtime Model
4. Frontend Architecture
5. Backend Architecture
6. Realtime (Socket.IO) Architecture
7. Data Architecture (structural view)
8. AI/ML Integration Architecture
9. File Storage Architecture
10. Authentication & Authorization Architecture
11. Notification Architecture
12. Scheduling / Background Job Architecture
13. Cross-Cutting Concerns (error handling, logging, validation, rate limiting)
14. Deployment Architecture
15. Scaling Architecture & Hard Limits
16. Security Architecture
17. Observability Architecture
18. Coupling & Dependency Analysis
19. Architecture Decision Records (reconstructed from evidence)
20. Anti-Pattern Catalog
21. Target Future Architecture
22. Appendix: Full Middleware & Router Registration Order

---

# 1. Architectural Style & Guiding Constraints

## 1.1 Style
ClassVibe is a **monolithic client-server application with an embedded realtime layer**:
- One Express process serves REST + Socket.IO from the same Node runtime, sharing the same MongoDB connection pool and the same in-process memory space.
- One React single-page application (no server-side rendering, no static-site generation) consumes both the REST API and the Socket.IO connection.
- There is no service boundary, no API gateway, no message broker, no separate realtime service, and no background-worker process distinct from the web process itself (the one "job," `sessionReminder.js`, runs as a `setInterval` inside the same process that serves HTTP requests).

This is a **reasonable, conventional architecture for an MVP at classroom scale** — the problems documented below are not "monolith is wrong," they are specific implementation gaps (missing Redis adapter, in-memory-only quiz timers, duplicated auth logic) layered on top of an otherwise sound choice of style.

## 1.2 Guiding constraints actually observed in the code (not stated anywhere, but inferable)
- **Zero-friction join** was clearly prioritized over strict access control: PIN/QR/guest-auth all exist specifically to minimize account-creation friction for students. This constraint shapes almost every other architectural decision (e.g., why `User` documents can be created with no password, why JWTs are issued to anonymous guests, why `optionalAuth` exists as a distinct middleware tier).
- **Free-tier hosting economics** visibly shaped the architecture: the Render.com cold-start handling (`pingBackend()` warmup, 12-second retry-with-backoff logic duplicated in two login components) is a first-class architectural concern baked directly into the frontend, not an edge case.
- **Solo-developer velocity** over long-term maintainability: the near-total absence of shared abstractions (5 copies of JWT middleware, 2 independent poll systems, 2 independent quiz-hosting UIs) is consistent with rapid, sequential feature-by-feature development without refactoring passes.

## 1.3 What this system is *not*
- Not a microservices architecture (single deployable backend unit).
- Not an event-sourced system (state is mutated in place; no event log/audit trail beyond ad hoc `unauthorizedAttempts` arrays).
- Not multi-tenant (Section 21 of `MASTER_PROJECT_REPORT.md` and Section 21 below cover the gap).
- Not horizontally scalable in its current form (Section 15).

---

# 2. System Topology

```mermaid
flowchart TB
    subgraph Browser["Client Runtime — Browser"]
        direction TB
        ReactApp["React 18 SPA (CRA build)<br/>App.js — 2,412 lines,<br/>acts as router + global store + view layer"]
        SocketClient["socket.io-client 4.8.3<br/>singleton (socket.js), autoConnect:false"]
        AxiosClient["Axios instance (api.js)<br/>+ ad hoc raw fetch() calls scattered in App.js"]
    end

    subgraph EdgeVercel["Vercel Edge / Static Hosting"]
        StaticBuild["Static build/ output<br/>(react-scripts build)"]
    end

    subgraph RenderNode["Render.com — single Node process (inferred)"]
        direction TB
        ExpressApp["Express 4 app (server.js, 1,350 lines)"]
        SocketServer["Socket.IO 4.6 server<br/>— SAME process, SAME memory space"]
        InMemState["In-process memory:<br/>global.io reference<br/>activeQuizTimers Map (quiz-socket-handlers.js)"]
        StaticUploads["express.static('/uploads')<br/>— NO AUTH MIDDLEWARE"]
        ReminderLoop["sessionReminder.js<br/>setInterval, 5-min tick,<br/>runs IN the web process"]
    end

    subgraph ExternalSvcs["External Services"]
        MongoAtlas[("MongoDB (Atlas assumed)<br/>10 collections")]
        GroqAPI["Groq Cloud API<br/>openai/v1/chat/completions<br/>4-model fallback chain"]
    end

    ReactApp -->|"HTTPS REST, Bearer JWT"| ExpressApp
    SocketClient <-->|"WebSocket/long-poll"| SocketServer
    AxiosClient --> ExpressApp
    ReactApp --> StaticBuild

    ExpressApp --> MongoAtlas
    ExpressApp --> GroqAPI
    SocketServer --> MongoAtlas
    SocketServer --> InMemState
    ReminderLoop --> MongoAtlas
    ReminderLoop -->|"via global.io"| SocketServer

    Browser -->|"GET /uploads/:file<br/>unauthenticated"| StaticUploads
```

## 2.1 Physical deployment units
| Unit | Where | Confirmed by |
|---|---|---|
| Frontend static bundle | Vercel (`frontend/.vercel/project.json`, `projectName: "classvibe"`) | Committed Vercel project link; `@vercel/static-build` config with `distDir: "build"` |
| Backend Node process | Assumed Render.com | No `render.yaml`/Dockerfile/Procfile exists in-repo; inferred entirely from the hardcoded fallback URL `https://classvibe-backend.onrender.com` repeated in `api.js`, `socket.js`, `ChatArea.js`, `QuizControlPanel.jsx` |
| Database | Assumed MongoDB Atlas | `MONGODB_URI` env var name is the only evidence; no connection-string host is visible in the checked-in `.env` (values are secrets, not printed in this document) |
| AI provider | Groq Cloud | `aiQuizGenerator.js` hits `https://api.groq.com/openai/v1/chat/completions` directly |

## 2.2 What's conspicuously absent from the topology
- No CDN configuration beyond whatever Vercel provides by default for static assets.
- No reverse proxy / API gateway layer (Express receives requests directly).
- No message queue / event bus (all cross-cutting effects — e.g., "group created → notify past students" — happen synchronously, inline, in the same request that created the group).
- No dedicated cache layer (no Redis, no in-memory LRU) anywhere in the stack.
- No container orchestration evidence (no Dockerfile, no `docker-compose.yml`, no Kubernetes manifests).
- No CI/CD pipeline (no `.github/workflows`, no other CI config file of any kind).

---

# 3. Process & Runtime Model

## 3.1 The backend is a single Node.js event-loop process
Everything — REST request handling, Socket.IO connection handling, the session-reminder timer loop, and all in-memory quiz-timer state — executes on **one event loop, in one process**. Concretely:

```mermaid
flowchart LR
    subgraph SingleProcess["node server.js — one process, one event loop"]
        A["Express request handlers"]
        B["Socket.IO connection handlers<br/>(TWO separate io.on('connection') registrations)"]
        C["setInterval(checkSessionReminders, 5min)"]
        D["setInterval per active quiz question<br/>(activeQuizTimers Map, one per live QuizSession)"]
    end
    A <-.->|"shares process memory: global.io"| B
    C -->|"via global.io"| B
    D -->|"broadcasts timer:update"| B
```

Consequences of this design:
- **A CPU-heavy request (e.g., a slow Mongoose aggregation in `analytics.js`) blocks the event loop for every concurrent socket connection** — there is no worker-thread offload anywhere in the codebase.
- **A process crash or restart destroys every piece of in-memory state at once**: all active Socket.IO connections drop, and — critically — the `activeQuizTimers` Map (holding live `setInterval` handles for every in-progress quiz question) is wiped with no persistence and no recovery sweep on boot. Every quiz that was mid-question at the moment of restart is permanently stuck (`QuizSession.status` remains `'active'` in Mongo forever, with no running timer and no way to auto-advance).
- **Session-reminder ticks and quiz-timer ticks compete for the same event loop** as regular HTTP/socket traffic — at current classroom scale this is a non-issue, but it is a structural single point of contention that would need addressing before any significant scale-up.

## 3.2 Startup sequence (as literally written in `server.js`)
```mermaid
sequenceDiagram
    participant Node
    participant Express
    participant Mongo
    participant SocketIO

    Node->>Express: dotenv.config()
    Node->>Express: build corsHandler, register CORS + preflight
    Node->>SocketIO: new Server(server, {cors, transports})
    Express->>Express: app.set('io', io); global.io = io
    Express->>Express: register GET /health (before body parsers!)
    Express->>Express: express.json() / urlencoded()
    Express->>Express: mount /api/quiz, /api/analytics, /api/notifications
    Express->>Express: conditionally startSessionReminderJob()
    Express->>SocketIO: io.on('connection') #1 — quiz handlers only
    Express->>Express: process.on('SIGTERM') registered (1st of 2 times)
    Express->>Express: request-logging middleware (only covers routes AFTER this point)
    Express->>Express: bootstrap uploads dir + express.static('/uploads') — no auth
    Express->>Express: configure generic multer (/api/upload)
    Express->>Mongo: connectDB() — NOT awaited at call site
    Express->>Express: ~20 inline routes (auth/groups/messages/upload)
    Express->>Express: multer error-handling middleware
    Express->>Express: mount /api/schedule (much later than the other 3 routers)
    Express->>Express: more inline group/message routes
    Express->>SocketIO: io.on('connection') #2 — chat/presence handlers
    Express->>Node: server.listen(PORT, "0.0.0.0")
    Express->>Express: process.on('SIGTERM') registered again (2nd time — BOTH fire)
```

This sequence itself is architecturally significant: **`connectDB()` is fired but not awaited**, meaning `server.listen()` can complete and start accepting traffic before the MongoDB connection is actually established — any request arriving in that narrow startup window would hit Mongoose's default buffering behavior (which queues operations until connected, generally masking the race in practice, but it is not an explicit "wait for DB before serving traffic" design).

## 3.3 Shutdown sequence
`SIGTERM` is registered **twice** (`server.js` line ~131 and again near line ~1337) — both handlers fire on shutdown, since Node allows multiple listeners per signal. The second, fuller handler calls `server.close()` and stops the reminder job's `setInterval`. **Neither handler calls `cleanupQuizTimers()`** (a function that exists in `quiz-socket-handlers.js`, is imported into `server.js`, but is never invoked) — meaning any live quiz `setInterval` handles are simply killed by process exit rather than cleanly torn down. This is functionally harmless (the process is exiting anyway) but reflects the same "the intended integration exists, the wiring was never finished" pattern that recurs throughout the codebase (Section 20 below, and Section 19 of `MASTER_PROJECT_REPORT.md`).

---

# 4. Frontend Architecture

## 4.1 Build & tooling architecture
- **Create React App (`react-scripts` 5.0.1)** — a conventional, unmodified CRA setup (no `craco`/`react-app-rewired` ejection found, no custom webpack config). This means the project inherits CRA's default code-splitting behavior (route-based lazy loading), except **the app never uses `React.lazy`/`Suspense` anywhere**, so in practice the entire app — including the 1,841-line `QuizCreator.jsx` — ships in one initial bundle regardless of whether a given user ever opens the quiz-creation UI.
- **No TypeScript** — the entire frontend is plain JavaScript/JSX with no static type-checking layer.
- **No CSS-in-JS library, no CSS Modules, no Tailwind** — styling is either (a) inline `style={{}}` objects computed per-render, or (b) legacy standalone `.css` files for the three pre-auth pages (`Home.css`, `TeacherLogin.css`, `StudentJoin.css`) and `App.css`.

## 4.2 Application-shell architecture (the "no-router router")
`react-router-dom` 6.22.3 is a declared dependency and is **never imported anywhere in `frontend/src`**. In its place, `App.js` implements a hand-rolled, state-driven view-swap architecture:

```mermaid
flowchart TD
    Root["App.js — single component instance"]
    Root --> AuthGate{"isAuthenticated?"}
    AuthGate -->|false| PreAuth["authScreen state:<br/>'home' | 'teacher' | 'student'"]
    AuthGate -->|true| RoleGate{"user.role"}
    RoleGate -->|teacher| TeacherRouter["teacherView state:<br/>'dashboard' | 'schedule' | 'quizhistory' | 'analytics' | 'settings'"]
    RoleGate -->|student| StudentRouter["studentView state:<br/>'dashboard' | 'live' | 'participants' | 'schedule' | 'quizzes' | 'sessionlist' | 'settings'"]
    RoleGate -->|"currentGroup is set (either role)"| ChatRouter["Chat View<br/>(overrides both hub views)"]
```

**Architectural consequence**: there is no URL that identifies any of these states. `window.location` is never touched (except reading `?pin=` once, on initial mount, for deep-linking into the student-join screen). A browser refresh always re-derives `isAuthenticated`/`user` from `localStorage` and drops back to whatever the *default* value of `teacherView`/`studentView`/`authScreen` is — in-app navigation position is not preserved across a reload. This also means: no shareable deep links to a specific dashboard tab, no browser back-button support, no server-side route-based code-splitting.

## 4.3 State management architecture
**No Context API, no Redux/Zustand/Recoil, no custom global store.** All application state — auth, current group, chat messages, quiz session, scheduled sessions, every modal's visibility flag — lives as `useState` inside the single `App.js` component (roughly 25+ distinct pieces of state enumerated in `MASTER_PROJECT_REPORT.md` Section 5) and is passed down via props. A few `useRef`s exist specifically to avoid stale-closure bugs in socket-event callbacks (`currentGroupRef`, `selectGroupRef`) — a common workaround pattern when a large component's effects need to reference "the latest" version of state/functions without re-subscribing socket listeners on every state change.

**Cross-component signaling escape hatch**: three custom `window` `CustomEvent`s (`openWaitingRoom`, `startQuiz`, `joinSession`) are dispatched from deeply-nested components (chat message click handlers, notification-center item clicks) and consumed via `window.addEventListener` in `App.js`. This exists specifically because there is no Context/global-store mechanism for a deeply nested component to trigger a change in top-level state without either prop-drilling a callback down many levels or reaching outside React entirely — the team chose the latter.

## 4.4 Component architecture layers
```mermaid
flowchart TD
    L1["Layer 1 — Shell<br/>App.js (owns all state, all routing logic)"]
    L2["Layer 2 — Chrome<br/>Header.js, Sidebar.js (always mounted once authenticated)"]
    L3["Layer 3 — Feature Surfaces<br/>ChatArea+MessageInput, QuizCreator, QuizHost,<br/>QuizPlayer, QuizWaitingRoom, ScheduleSession,<br/>StudentAnalytics, NotificationBell+Center"]
    L4["Layer 4 — Leaf/presentational<br/>Leaderboard(dead), PollComponent(dead),<br/>Footer(x2, one dead), Login.js(legacy)"]
    L1 --> L2 --> L3 --> L4
```

There is no formal "container vs. presentational component" split, no custom hooks abstraction layer (no `hooks/` directory exists), and no shared component library (`components/` is a flat directory of 20 files with no sub-grouping by feature).

## 4.5 API access architecture
Two parallel, inconsistent access patterns coexist:
1. **`api.js`** — a single Axios instance with request/response interceptors (auto-attach Bearer token, auto-logout on 401/403). Hardcodes its base URL to the production backend, ignoring `process.env.REACT_APP_API_URL` (an inconsistency relative to `socket.js`, which does read the env var correctly).
2. **Raw `fetch()` calls scattered directly inside `App.js`** — used for roughly 6+ call sites that duplicate logic already exported (unused) from `api.js`, each independently re-reading `localStorage.getItem('token')` and re-computing the same `process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com'` fallback expression.

This split is not principled (e.g., "reads go through api.js, writes go through fetch") — it is simply incremental accretion, with `api.js` functions written early and then bypassed later as `App.js` grew.

## 4.6 Realtime access architecture (frontend side)
A single Socket.IO client instance (`socket.js`) is exported and imported by name across the app (`App.js`, `Login.js`, `TeacherLogin.jsx`, and every quiz/chat component that needs live events) — there is exactly one WebSocket connection per browser tab, shared by every feature. `autoConnect: false` — the connection is deliberately deferred until an explicit `socket.connect()` call (post-login, post-guest-join, or on session restore), immediately followed by `socket.emit('authenticate', token)`.

---

# 5. Backend Architecture

## 5.1 Layering as designed vs. layering as actually executed

The repository's folder structure *implies* a layered architecture:

```
routes/  →  controllers/  →  models/
              ↑
         middleware/
```

**This layering is real for exactly one subsystem (auth's canonical middleware) and is otherwise bypassed everywhere else.** The actual, executed architecture looks like this:

```mermaid
flowchart TD
    subgraph Implied["IMPLIED layered architecture (folder structure)"]
        R1["routes/groupRoutes.js"] --> C1["controllers/groupController.js"]
        C1 --> M1["middleware/auth.js"]
        C1 --> Mo1["models/*"]
    end

    subgraph Actual["ACTUAL executed architecture"]
        SJ["server.js — 1,350 lines<br/>~20 inline routes, own auth copy,<br/>own group logic, own socket handlers"]
        RQ["routes/quiz.js — own auth copy"]
        RS["routes/schedule.js — own auth copy"]
        RA["routes/analytics.js — own auth copy + own isTeacher"]
        RN["routes/notifications.js — own auth copy"]
        SJ --> Mo2["models/*"]
        RQ --> Mo2
        RS --> Mo2
        RA --> Mo2
        RN --> Mo2
        QSH["socket-handlers/quiz-socket-handlers.js"] --> Mo2
    end

    Implied -.->|"NEVER MOUNTED — dead code path"| Actual
    style Implied fill:#7f1d1d,color:#fff
```

**This is the single most important architectural fact about the backend**: the "clean" layered path (`groupRoutes.js` → `groupController.js` → `middleware/auth.js`) that the folder structure suggests is the intended architecture is entirely dead code — never `require`d, never `app.use`'d, and would throw immediately if resurrected (most of `groupController.js`'s referenced functions don't exist in the file; `middleware/auth.js`'s consumers don't exist either). The architecture that actually runs in production is monolithic-inline: `server.js` plus four route files, each independently re-implementing the same authentication middleware.

## 5.2 Backend module map

```mermaid
flowchart LR
    subgraph EntryPoint["server.js (1,350 lines)"]
        MW["Middleware stack<br/>(CORS, JSON parsing, static files, multer, logging)"]
        InlineRoutes["Inline routes:<br/>/api/auth/*, /api/groups/*, /api/upload"]
        Sock1["io.on('connection') #1<br/>→ setupQuizSocketHandlers"]
        Sock2["io.on('connection') #2<br/>→ chat/presence handlers"]
    end

    EntryPoint --> Config["config/db.js<br/>bare mongoose.connect(), no retry"]
    EntryPoint --> Routes["routes/*.js<br/>quiz.js, analytics.js, notifications.js, schedule.js<br/>(each with its OWN local authenticateToken)"]
    EntryPoint --> SocketHandlers["socket-handlers/quiz-socket-handlers.js<br/>the real quiz gameplay engine"]
    EntryPoint --> Jobs["jobs/sessionReminder.js<br/>setInterval, 5-min tick"]
    Routes --> Services["services/aiQuizGenerator.js<br/>Groq client, PDF/DOCX parsing"]
    Routes --> Models["models/*.js — 10 Mongoose schemas"]
    SocketHandlers --> Models
    Jobs --> Models

    DeadCode["routes/groupRoutes.js + controllers/groupController.js<br/>+ middleware/auth.js — orphaned, never mounted"]
    DeadCode -.->|"disconnected from EntryPoint"| EntryPoint
    style DeadCode fill:#7f1d1d,color:#fff
```

## 5.3 Middleware pipeline architecture
See Section 22 (Appendix) for the exact line-by-line registration order. Architecturally significant properties of this pipeline:
- **CORS is evaluated per-request via a custom predicate function** (`isAllowedOrigin`), not a static allow-list — this is more flexible (supports arbitrary LAN IPs for dev) but also means CORS policy is imperative code rather than declarative configuration, harder to audit at a glance.
- **The request-logging middleware is positioned after several routers are already mounted**, meaning it structurally cannot observe traffic to `/api/quiz`, `/api/analytics`, or `/api/notifications` — an ordering bug baked into the pipeline itself, not a one-off oversight.
- **Static file serving (`/uploads`) has no middleware in front of it at all** — it is the only "route" in the entire application with zero authentication or authorization gate.
- **Two separate Multer instances exist** (generic uploader in `server.js`, quiz-file uploader in `routes/quiz.js`) with different storage directories, different filename schemes, different allowed-type lists, and different lifecycle (generic uploads persist forever; quiz-source files are always deleted after processing) — architecturally, file-upload handling is not a shared service, it is reimplemented per use case.

## 5.4 Service layer
Only one true "service" module exists: `services/aiQuizGenerator.js`. It encapsulates the Groq API client, the model-fallback probing strategy, PDF/DOCX/TXT text extraction, and LLM-output validation/normalization. Architecturally this is the **one part of the backend that follows conventional service-layer separation** — routes call into it, it has no direct dependency on Express request/response objects, and it's independently testable in principle (though no tests exist for it in practice).

## 5.5 Controller layer
Functionally does not exist in the live system. `groupController.js` is the only file in `controllers/`, and it is dead code (Section 5.1). Every other "controller"-shaped responsibility (validating input, orchestrating model calls, shaping the response) is inlined directly into route handler functions across `server.js` and the four route files.

---

# 6. Realtime (Socket.IO) Architecture

## 6.1 Connection & room architecture

```mermaid
flowchart TD
    Client["Client socket connects<br/>(autoConnect:false, manual .connect())"]
    Client --> Auth["emit('authenticate', jwt)"]
    Auth --> PersonalRoom["socket.join(socket.userId)<br/>— personal room, for Notification targeting"]
    PersonalRoom --> GroupJoin["emit('joinGroup', groupId)<br/>→ socket.join(groupId)<br/>— chat/presence room"]
    PersonalRoom --> SessionJoin["emit('teacher:joinSession' / 'student:joinQuiz', sessionId)<br/>→ socket.join(sessionId)<br/>— quiz gameplay room"]
    GroupJoin -.->|"shares Socket.IO room namespace<br/>(both are Mongo ObjectId strings — no collision in practice)"| SessionJoin
```

Three room families exist, all keyed by MongoDB ObjectId strings, all sharing Socket.IO's single flat room namespace (Socket.IO does not scope rooms per "family" — a `groupId` and a `sessionId` room are indistinguishable from the framework's perspective except by the string value used).

## 6.2 Handler registration architecture (a structural smell)
`server.js` registers **two separate `io.on('connection', ...)` blocks** — one thin one (near the top of the file) that exists solely to call `setupQuizSocketHandlers(io, socket)`, and one large one (near the bottom, ~850 lines later) containing all chat/presence/auth socket events. Both fire for every connecting socket, because Socket.IO permits multiple listeners on the same event. This works correctly today, but it means:
- The full picture of "what happens when a socket connects" cannot be read top-to-bottom in one place — it's split across two locations roughly 850 lines apart in the same file.
- Any future third socket subsystem would likely repeat this pattern rather than consolidate into one connection handler, compounding the fragmentation.

## 6.3 Event-driven architecture map

```mermaid
flowchart TB
    subgraph ChatSubsystem["Chat/Presence subsystem (server.js, 2nd connection block)"]
        E1["authenticate/joinGroup/leaveGroup"]
        E2["sendMessage/editMessage/deleteMessage"]
        E3["typing/stopTyping"]
        E4["votePoll (embedded Message.pollOptions)"]
    end
    subgraph QuizSubsystem["Quiz subsystem (quiz-socket-handlers.js)"]
        Q1["teacher:joinSession/startQuiz/nextQuestion/endQuiz"]
        Q2["student:joinQuiz/submitAnswer"]
        Q3["Server-driven timer engine<br/>(activeQuizTimers Map + setInterval per question)"]
        Q4["Auto-advance chain:<br/>question:complete → wait 10s → leaderboard:show → wait 5s → next/finish"]
    end
    subgraph RestTriggered["REST-triggered socket emits (cross-subsystem coupling)"]
        X1["POST /groups/:id/end → sessionEnded"]
        X2["POST /schedule/:id/start → sessionStarted (per-student personal room)"]
        X3["POST /quiz/:id/start-session → quizStarted"]
        X4["Notification.create* statics → newNotification (personal room)"]
    end
    RestTriggered -->|"global.io.to(...).emit(...)"| ChatSubsystem
    RestTriggered -->|"global.io.to(...).emit(...)"| QuizSubsystem
```

**Architectural note on `RestTriggered`**: this is the one place where REST (stateless, request/response) and Socket.IO (stateful, connection-oriented) are directly coupled — an Express route handler reaches into the global `io` reference to push a realtime event. This pattern only works because everything is one process; it is also the single largest reason horizontal scaling requires a Redis adapter (Section 15) rather than being a drop-in change.

## 6.4 In-memory state inventory (the parts that don't survive a restart)
| State | Location | Lifetime | Recovery on restart |
|---|---|---|---|
| `activeQuizTimers` (Map: sessionId → {interval, timeRemaining, questionIndex}) | `quiz-socket-handlers.js`, module scope | Life of the process | ❌ None — every in-progress quiz question freezes permanently until a teacher manually clicks Next/End |
| `global.io` reference | `server.js` | Life of the process | N/A — recreated on boot, but any REST handler mid-flight during a restart loses its reference |
| Socket.IO's own internal room membership | Socket.IO library internals | Per-connection | Rebuilt automatically as clients reconnect and re-run `authenticate`/`joinGroup`/`joinSession` — **except** clients do not automatically re-run `joinGroup`/`joinSession` on a bare reconnect (only on component remount), so this recovery is partial in practice |

## 6.5 Reconnection architecture
```mermaid
sequenceDiagram
    participant C as Client (socket.js)
    participant S as Server

    Note over C: Network blip / Render cold-start disconnect
    C--xS: connection lost
    C->>C: Socket.IO auto-reconnect<br/>(5 attempts, 2s delay, 20s timeout)
    C->>S: transport re-established
    C->>S: 'connect' event fires client-side<br/>→ App.js's reAuth() re-emits 'authenticate'
    S->>S: socket.join(personal room) — restored
    Note over C,S: ⚠️ groupId / sessionId rooms are NOT automatically rejoined —<br/>only re-established if the owning component remounts<br/>(e.g. QuizPlayer re-emits student:joinQuiz on mount, but not on bare reconnect)
```

This is a partial, not full, reconnection architecture — the personal-notification-room path is robust; the chat/quiz room paths are not.

---

# 7. Data Architecture (structural view)

(Full per-field schema detail lives in `DATABASE_BIBLE.md`. This section covers only the *structural* role each collection plays in the architecture.)

```mermaid
flowchart TD
    User[("User — identity hub,<br/>referenced by all 9 other models")]
    Group[("Group — the live-session aggregate root")]
    Message[("Message — event log for chat<br/>+ embedded poll sub-documents")]
    Quiz[("Quiz — reusable template")]
    QuizSession[("QuizSession — live gameplay aggregate<br/>(the real engine)")]
    QuizResult[("QuizResult — intended durable ledger<br/>❌ never written")]
    ScheduledSession[("ScheduledSession — future-state aggregate,<br/>converts into a Group")]
    Analytics[("Analytics — intended materialized rollup<br/>❌ write-path never instrumented")]
    Notification[("Notification — fan-out inbox")]
    Poll[("Poll — dead parallel model")]

    User --> Group
    Group --> Message
    User --> Quiz
    Group --> Quiz
    Quiz --> QuizSession
    Group --> QuizSession
    QuizSession -.->|"SHOULD flow here, doesn't"| QuizResult
    QuizResult -.->|"SHOULD flow here, doesn't"| Analytics
    User --> ScheduledSession
    ScheduledSession -->|"go-live conversion"| Group
    User --> Notification
    Group -.-> Poll
    style QuizResult fill:#7f1d1d,color:#fff
    style Analytics fill:#92400E,color:#fff
    style Poll fill:#7f1d1d,color:#fff
```

## 7.1 Aggregate-root analysis
In DDD terms (applied loosely, since the codebase itself has no domain-driven design vocabulary), the natural aggregate roots are:
- **`User`** — identity; referenced everywhere, never itself contains other aggregates.
- **`Group`** — the "live session" aggregate; owns `members[]`/`onlineUsers[]` as embedded references (not embedded documents) to `User`.
- **`QuizSession`** — the "live game" aggregate; genuinely embeds its child entities (`participants[].answers[]`) as true sub-documents rather than separate collections — this is the one place in the schema where embedding (vs. referencing) was chosen deliberately and it works well for the access pattern (always read/write the whole session at once during gameplay).
- **`ScheduledSession`** — the "planned session" aggregate; embeds `allowedStudents[]`/`registeredStudents[]`/`unauthorizedAttempts[]` as sub-documents.

## 7.2 Denormalization points
- `ScheduledSession.allowedEmails[]` is a denormalized projection of `allowedStudents[].email`, manually kept in sync by application code on every create/update — a classic denormalization-consistency risk (nothing prevents these two arrays from drifting apart if a future code path updates one without the other).
- `QuizSession.sessionSettings` is a **deliberate, correct** denormalization: a snapshot copy of `Quiz.settings` taken at session-creation time, specifically so that editing the `Quiz` template later does not retroactively alter an already-running session. This is the one clear example of intentional, well-reasoned denormalization in the schema.

## 7.3 Read/write pattern architecture
- **Chat** (`Message`): high write frequency (every message), read via a single bounded query (`limit(100)`, no pagination) — a "recent window" access pattern with no support for historical paging.
- **Analytics**: read-heavy in *design intent* (dashboards), but every read route also *writes* (recalculates and saves the document) — an unusual "read-triggers-write" pattern that makes these endpoints non-idempotent from a caching perspective, and which is moot in practice since the underlying counters are never fed real data (see `DATABASE_BIBLE.md`).
- **QuizSession**: write-heavy during gameplay (every answer submission triggers a full document save), read-heavy afterward (history views) — a single collection serving two very different access patterns without any read-model/write-model separation (no CQRS).

---

# 8. AI/ML Integration Architecture

```mermaid
flowchart TD
    Route["routes/quiz.js<br/>POST /generate, /generate-from-file"]
    Route --> Service["services/aiQuizGenerator.js"]
    Service --> Probe["getWorkingModel()<br/>probes 4 models in fallback order<br/>with a trivial 1-token request each"]
    Probe --> ModelChain["llama-3.1-8b-instant<br/>→ llama3-8b-8192<br/>→ mixtral-8x7b-32768<br/>→ gemma2-9b-it"]
    ModelChain --> Extract["Content extraction<br/>pdf-parse (PDF) / mammoth (DOCX) / fs.readFile (TXT)<br/>truncate to 8,000 chars"]
    Extract --> Prompt["Prompt construction<br/>60/20/10/10 MC/FIB/TF/multi-select target,<br/>embedded JSON schema examples,<br/>temperature 0.5, max_tokens 1500"]
    Prompt --> GroqCall["Groq chat-completions API call<br/>(60s timeout)"]
    GroqCall --> Parse["extractJSON() — strips markdown fences,<br/>regex-extracts the JSON array"]
    Parse --> Validate["validateQuestions() —<br/>per-questionType normalization,<br/>fuzzy string→index matching for MC,<br/>array-of-numbers coercion for multi-select"]
    Validate --> QuizDoc[("new Quiz(status:'draft', questions, aiSource)")]
```

## 8.1 Architectural properties of this integration
- **Every single generation request costs at least 2 Groq API calls** (one liveness probe + one real generation), and up to 5 if earlier models in the fallback chain are unavailable — this is a deliberate reliability-over-cost tradeoff, but it is not configurable (no flag to skip probing and just try the primary model with a shorter timeout-and-retry instead).
- **No caching layer** — identical topics generate a fresh LLM call every time; no memoization of recent generations exists.
- **No rate limiting or per-user quota** at the Express layer — the AI-generation cost surface is fully uncapped per authenticated teacher (and, via the dead-but-dangerously-close-to-live `quiz-test.js` route, was at one point reachable with no auth at all).
- **Two unimplemented integration stubs already reserved in the architecture**: `generateFromYouTube`/`generateFromWebsite` exist as named methods on the service that immediately throw — the frontend UI for URL-based generation is fully built against an endpoint (`/generate-from-url`) that was never added to `routes/quiz.js`, making this a complete, coherent, but entirely non-functional vertical slice of the architecture.
- **Fragile parsing boundary**: `extractJSON()` relies on string manipulation (strip code fences, regex-extract the first `[...]`/`{...}`) rather than the LLM provider's structured-output/function-calling mode — the architecture has no schema-enforcement guarantee from the model side, only post-hoc validation on the response.

---

# 9. File Storage Architecture

```mermaid
flowchart TD
    subgraph Generic["Generic upload — POST /api/upload (server.js)"]
        G1["multer.diskStorage<br/>→ backend/public/uploads/"]
        G2["Filename: sanitizedBaseName-timestamp-random.ext"]
        G3["10MB limit, jpeg/jpg/png/gif/mp4/mov/avi/pdf/doc/docx/txt"]
        G4["express.static('/uploads') — served PUBLICLY, NO AUTH, FOREVER"]
    end
    subgraph QuizFile["Quiz-source upload — POST /api/quiz/generate-from-file (routes/quiz.js)"]
        Q1["multer.diskStorage<br/>→ backend/uploads/quiz-files/ (different base path!)"]
        Q2["Filename: quiz-timestamp-random.ext (no original name preserved)"]
        Q3["10MB limit, pdf/docx/doc/txt only, extension-check only (no mimetype check)"]
        Q4["fs.unlink() on EVERY code path (success or failure) —<br/>never persisted, never publicly servable"]
    end
```

Architecturally, file storage is **not a shared service** — it is two independently-implemented Multer configurations with different destination directories, different filename schemes, different validation rules, and diametrically opposite persistence/access-control postures (one persists forever and is public; the other is always deleted and never exposed). There is no object-storage integration (no S3/GCS/Azure Blob) anywhere — all files live on the same local disk as the Node process, which is itself an architectural constraint worth flagging: **any horizontal scaling of the backend (Section 15) would immediately break file access for uploads that landed on a different instance's disk**, since there is no shared/networked file store.

---

# 10. Authentication & Authorization Architecture

## 10.1 The five-implementation problem

```mermaid
flowchart TD
    Canonical["middleware/auth.js<br/>authenticateToken (async, DB lookup,<br/>attaches full req.user, 401 on failure)<br/>ONLY consumer: groupRoutes.js (DEAD, never mounted)"]
    Copy1["server.js inline copy<br/>(sync, req.userId only, 403 on failure)"]
    Copy2["routes/quiz.js local copy<br/>(sync, req.userId, supports decoded.userId||decoded.id)"]
    Copy3["routes/schedule.js local copy<br/>(sync, req.userId, manual isTeacher checks per-route)"]
    Copy4["routes/notifications.js local copy<br/>(sync, req.userId)"]

    style Canonical fill:#7f1d1d,color:#fff
```

The architecturally "correct" version (async, real DB lookup verifying the user still exists, full `req.user` object) is the one version nothing in production actually uses. Every live code path uses a leaner, synchronous, DB-lookup-free copy that trusts the JWT payload alone (meaning a token for a since-deleted user would still pass auth in every live route, since none of them re-verify existence — only the dead canonical version does that check).

## 10.2 Authorization model
There is no RBAC/ABAC framework — authorization is a flat `role` string (`teacher|student|admin`) checked ad hoc, per-route, via one of two patterns:
1. **Ownership checks** (`group.isAdmin(userId)`, `quiz.creator.toString() === userId`, `session.host.toString() === userId`) — consistently applied and generally correct.
2. **Role checks** (`role !== 'teacher'` → 403) — re-implemented independently in `analytics.js` (dedicated `isTeacher` middleware), `schedule.js` (manual inline check per route), `quiz.js` (manual inline check per route) — three separate implementations of the same concept, none sharing code with each other or with the dead canonical `isTeacher` in `middleware/auth.js`.

## 10.3 Trust boundary map

```mermaid
flowchart LR
    Anon["Anonymous request"] -->|"POST /api/auth/register<br/>⚠️ role is CLIENT-SUPPLIED, unrestricted"| Trusted["Trusted as: whatever role the client claims"]
    Anon -->|"POST /api/groups/join (guest)"| GuestUser["Trusted as: student<br/>(server-forced, cannot escalate here)"]
    JWTHolder["Any valid JWT"] -->|"socket 'authenticate'"| SocketTrust["socket.userId set for life of connection<br/>— NOT re-verified per subsequent action"]
    SocketTrust -->|"teacher:startQuiz etc."| HostCheck["Re-checked against session.host<br/>(good — ownership re-verified)"]
    SocketTrust -->|"student:submitAnswer timeTaken"| NoCheck["⚠️ NOT re-checked against server's own timer state<br/>— client-reported timing trusted for scoring"]
```

The architecture is **inconsistent about what it re-verifies and what it trusts once established**: quiz *host* identity is correctly re-checked against the database on every privileged action; quiz *timing* (used for scoring) is not cross-checked at all, despite the server having its own authoritative timer state (`activeQuizTimers`) sitting right there.

---

# 11. Notification Architecture

```mermaid
flowchart TD
    Producers["Producers (5+ independent call sites)"]
    Producers --> P1["server.js: group-created bulk notify"]
    Producers --> P2["schedule.js: session-scheduled, session-started (x2, inline, duplicating dead model statics)"]
    Producers --> P3["sessionReminder.js: the ONE call site that actually uses<br/>a model template static (notifySessionStartingSoon)"]
    Producers -.->|"defined, NEVER called"| P4["quiz-start / quiz-result / achievement<br/>(3 of 6 template statics on Notification model)"]

    P1 --> Store[("Notification collection")]
    P2 --> Store
    P3 --> Store

    Store --> Fanout["global.io.to(recipientId).emit('newNotification')"]
    Fanout --> Bell["NotificationBell.jsx — badge + DOM toast<br/>(⚠️ built via innerHTML — XSS surface)"]
    Bell --> Center["NotificationCenter.jsx — REST fetch on open,<br/>no live subscription of its own"]
    Center --> ReadFlow["PUT /:id/read, /mark-all-read"]
    ReadFlow --> Cleanup["DELETE /:id, /clear-read (user-triggered only)"]
    Store -.->|"expiresAt field exists,<br/>NO TTL index, isExpired() never called"| NeverExpires["❌ Notifications never auto-expire"]

    style P4 fill:#7f1d1d,color:#fff
    style NeverExpires fill:#7f1d1d,color:#fff
```

Architecturally, this is a **fan-out-on-write** notification system (the write path directly pushes to connected sockets) with **no fan-out-on-read fallback batching** and **no durable delivery guarantee** — if a recipient's socket isn't connected to this exact process at the moment of emission, the realtime portion of the notification is simply lost (the `Notification` document itself does persist in Mongo, so it is recoverable the next time the user opens the Notification Center, just not delivered as a live toast).

---

# 12. Scheduling / Background Job Architecture

Exactly one background job exists: `jobs/sessionReminder.js`. Its architecture:

```mermaid
flowchart TD
    Boot["server.js boot<br/>(unless ENABLE_SESSION_REMINDERS==='false')"] --> Start["startSessionReminderJob()"]
    Start --> Interval["setInterval(checkSessionReminders, 5*60*1000)<br/>— runs immediately once, then every 5 min"]
    Interval --> Query["ScheduledSession.find({status:'scheduled',<br/>enableReminders:true, reminderSent:{$ne:true}})"]
    Query --> Filter["In-application-code date filter:<br/>reconstruct Date from scheduledDate+scheduledTime strings,<br/>keep if within now..now+20min<br/>(⚠️ hardcoded 20min, env var REMINDER_ADVANCE_MINUTES never read)"]
    Filter --> PerSession["Per matching session (try/catch isolated):<br/>Notification.notifySessionStartingSoon()"]
    PerSession --> MarkSent["session.reminderSent = true; save()<br/>— guarantees exactly one reminder ever, never a second nudge"]
```

This is a **naive polling architecture** (not a real scheduler like `node-cron`/`agenda`/`bull`), running inside the same process as the web server, with no persistence of its own beyond the `reminderSent` flag on the target documents. It has no distributed-lock mechanism — if this codebase were ever run as multiple instances without the accompanying Socket.IO/Redis fix, **every instance would independently run this same 5-minute loop and could send duplicate reminders** (the `reminderSent` flag mitigates this at the database level via a check-then-set race, but there is a window where two instances could both read `reminderSent:false` before either writes `true`).

---

# 13. Cross-Cutting Concerns

## 13.1 Error handling architecture
No centralized error-handling middleware pattern beyond one narrow Multer-specific 4-arg handler in `server.js` (positioned so it does *not* catch errors from routes mounted after it, an ordering issue noted in Section 22). Individual routes handle errors with local `try/catch`, with **inconsistent response shapes**: some return `{error: string}`, one (`POST /api/quiz/generate`) returns `{error, details, stack}` (leaking the stack trace, self-flagged in-code as "temporary"), and uncaught `CastError`s from malformed ObjectId route params fall through to Express's default 500 handler rather than a friendly 400.

## 13.2 Logging architecture
`console.log`/`console.error` only, no structured logging (no Winston/Pino/Bunyan), no correlation IDs, no log levels, no external log aggregation (no Sentry/Datadog/LogRocket integration found in either `package.json`). Several log statements are debug-artifact-shaped (emoji-prefixed, logging full request bodies or API-key presence) rather than intentional operational logging.

## 13.3 Validation architecture
`express-validator` is declared as a dependency and **not used anywhere found in the reviewed route files** — all validation is manual, ad hoc, per-route (`if (!field) return res.status(400)...`), with wildly inconsistent thoroughness (the AI-generation path validates/normalizes output questions rigorously via `validateQuestions()`; the manual-edit path `PUT /api/quiz/:quizId` accepts a wholesale `questions[]` array with zero shape validation).

## 13.4 Rate limiting architecture
**None exists anywhere.** No `express-rate-limit`, no token-bucket, no sliding-window counter, at any layer (login, registration, guest-auth, AI generation, file upload). This is a structural gap across the entire API surface, not a per-endpoint oversight.

---

# 14. Deployment Architecture

```mermaid
flowchart LR
    Dev["Local development<br/>(no Docker, run via node/nodemon + CRA dev server)"]
    Dev -->|"git push (manual, no CI gate)"| VercelDeploy["Vercel — auto-deploys frontend/<br/>on push (inferred from Vercel project link;<br/>no vercel.json found, build config lives<br/>unusually inside .vercel/project.json)"]
    Dev -->|"manual deploy trigger (inferred)"| RenderDeploy["Render.com — backend<br/>(NO in-repo config: no render.yaml, no Dockerfile,<br/>no Procfile — configured entirely in Render's dashboard,<br/>outside version control)"]
    VercelDeploy --> ProdFE["Static build served globally"]
    RenderDeploy --> ProdBE["Single Node dyno<br/>(free tier — cold-start behavior<br/>explicitly handled in frontend code)"]
```

**There is no CI/CD pipeline anywhere in this repository** — no `.github/workflows`, no `.gitlab-ci.yml`, no Jenkinsfile, nothing. Deploys are presumed to be push-to-deploy on both platforms with **zero automated gating** (no test run, no lint check, no build-verification step) between a commit and it reaching production. This is consistent with the git history's evidence of very rapid, unreviewed iteration (many placeholder `:wq` commits — accidental Vim-exit sequences committed as messages).

## 14.1 Environment variable architecture
Configuration is split across two `.env` files (`backend/.env`, `frontend/.env`) with no schema/validation of required variables at boot (a missing `JWT_SECRET` would only surface as a crash the first time a request tries to sign/verify a token, not as a clear startup-time error). Two backend env vars (`REMINDER_INTERVAL_MINUTES`, `REMINDER_ADVANCE_MINUTES`) are declared but never read by any code — dead configuration surface that misleads anyone auditing the `.env` file into believing the reminder timing is adjustable.

---

# 15. Scaling Architecture & Hard Limits

```mermaid
flowchart TD
    Current["CURRENT: single Node process,<br/>single Socket.IO instance, local disk storage,<br/>in-memory quiz timers"]
    Current -->|"add a 2nd instance behind a load balancer"| Break1["❌ BREAKS: Socket.IO rooms don't span instances<br/>without a Redis adapter — teacher/student on<br/>different instances never see each other's events"]
    Current -->|"add a 2nd instance"| Break2["❌ BREAKS: uploaded files on instance A's disk<br/>are 404 from instance B — no shared file store"]
    Current -->|"restart during a live quiz"| Break3["❌ BREAKS: activeQuizTimers Map wiped —<br/>every in-progress quiz freezes permanently"]
    Current -->|"restart during the reminder loop, if ever scaled to N instances"| Break4["❌ BREAKS (at scale only): N instances all run<br/>the same setInterval — duplicate-reminder race window"]
```

## 15.1 What would need to change, in order, to remove each blocker
1. **Redis adapter for Socket.IO** (`@socket.io/redis-adapter`) — unblocks multi-instance room broadcasting. This is additive (no rewrite required), but every `global.io.to(...).emit(...)` call site (REST routes reaching into the socket layer) needs to keep working identically, which the adapter is designed to preserve.
2. **Externalize file storage** (S3-compatible object storage) — replaces both Multer `diskStorage` configurations' destination with a cloud upload, and the `/uploads` static-file route with a redirect/proxy to signed URLs (this is also the natural point to finally add access control to the currently-public uploads, Section 16 of `MASTER_PROJECT_REPORT.md`).
3. **Persist quiz-timer state** — either move `activeQuizTimers` into Redis (with a lightweight lock per session) or add a boot-time recovery sweep that finds `QuizSession.status==='active'` documents with no corresponding live timer and either resumes or gracefully force-completes them.
4. **Distributed lock or single-designated-instance for the reminder job** — trivial once Redis is already in the stack for reason #1 (a simple Redis-based lock, or moving the job to a dedicated worker/cron service, e.g. Render's own Cron Jobs feature).

## 15.2 What does *not* need to change to scale from "one classroom" to "moderate multi-classroom" load
The database schema, the REST API shape, and the core Socket.IO event protocol are all reasonable as-is for scaling within a single-instance ceiling — the four blockers above are specifically about *horizontal* scaling (multiple server instances), not about the data model or API design being wrong at a conceptual level.

---

# 16. Security Architecture

(Full ranked findings live in `MASTER_PROJECT_REPORT.md` Section 14; this section covers only the *architectural* shape of the security posture.)

```mermaid
flowchart TD
    Perimeter["No API gateway / WAF layer — Express is the perimeter"]
    Perimeter --> CORS["CORS: predicate-based allow-list<br/>(exact FRONTEND_URL + any localhost/LAN IP)"]
    CORS --> AuthN["AuthN: JWT, 5 duplicated verifiers,<br/>no shared secret-rotation mechanism"]
    AuthN --> AuthZ["AuthZ: flat role string + ad hoc ownership checks,<br/>no centralized policy layer"]
    AuthZ --> DataAccess["Data access: Mongoose queries directly in route handlers,<br/>no repository/data-access-layer abstraction to centrally enforce scoping"]
    DataAccess --> FileAccess["File access: /uploads fully public, no signed URLs"]
    AuthN --> SocketAuthN["Socket AuthN: established once at connect,<br/>never re-verified per subsequent privileged action<br/>(except quiz host-ownership, which IS re-checked)"]
```

The architecture has **no centralized policy-enforcement point** — every route and every socket handler independently decides what to check, which is exactly why the specific gaps cataloged in `MASTER_PROJECT_REPORT.md` Section 14 (self-service role escalation, untrusted client timing data, unauthenticated file access) exist: there is no single choke point where "is this request/socket-event allowed" is decided once, consistently, for the whole system.

---

# 17. Observability Architecture

There effectively is none, beyond `console.log`. No metrics (no Prometheus/StatsD), no distributed tracing, no APM, no structured/queryable logs, no uptime/alerting configuration found in-repo (any such configuration, if it exists, lives entirely in the Render/Vercel dashboards, outside this codebase). The only "health" signal is a trivial `GET /health` returning static text `"OK"` with no dependency checks (it does not verify the MongoDB connection is alive, for instance) — so it is a liveness check, not a readiness check, architecturally speaking.

---

# 18. Coupling & Dependency Analysis

```mermaid
flowchart LR
    subgraph HighCoupling["Tightly coupled (change one, must check the other)"]
        A["server.js inline auth copy"] <--> B["routes/quiz.js auth copy"]
        B <--> C["routes/schedule.js auth copy"]
        C <--> D["routes/notifications.js auth copy"]
        E["QuizHost.jsx socket protocol"] <--> F["quiz-socket-handlers.js event names"]
        G["REST routes emitting via global.io"] <--> H["Socket.IO connection handlers"]
    end
    subgraph LowCoupling["Well-isolated"]
        I["services/aiQuizGenerator.js"] -.->|"clean interface, no Express deps"| J["routes/quiz.js"]
        K["models/*.js schemas"] -.->|"Mongoose is the only real interface"| L["everything else"]
    end
```

The **JWT-verification logic is the highest-risk coupling point** in the codebase: because it is duplicated five times rather than centralized, any future security fix (e.g., adding token-revocation checking, or fixing the inconsistent 401-vs-403 status codes) must be applied in five places, and there is no structural safeguard (no shared test suite, no lint rule) that would catch a fix applied to only four of the five.

The **quiz socket protocol** is the second-highest-risk coupling point: event names are string literals repeated across `quiz-socket-handlers.js` (server) and five different frontend components (`QuizHost.jsx`, `QuizPlayer.jsx`, `QuizWaitingRoom.jsx`, `QuizControlPanel.jsx`, `FloatingQuizButton.jsx`), with no shared constants file — this is precisely how the confirmed event-naming drift (`participantJoined` vs `student:joined`, `quizEnded` vs `quiz:finished`) happened, and how it will keep happening without a shared source of truth for event names.

---

# 19. Architecture Decision Records (reconstructed from evidence)

These were not written contemporaneously (no ADR files exist in the repo) — they are reconstructed here from what the code itself demonstrates was decided, to give a future team the "why" behind load-bearing choices.

### ADR-001: Single Node process for REST + Socket.IO
**Decision (implicit)**: run Express and Socket.IO in the same process, sharing `global.io`.
**Evidence**: `app.set('io', io); global.io = io;` in `server.js`, consumed directly by REST route handlers and Mongoose model statics.
**Consequence**: simplest possible realtime integration for an MVP; the direct cause of the horizontal-scaling blocker in Section 15.

### ADR-002: No client-side router
**Decision (implicit)**: manage all navigation via component-swap state in one root component rather than `react-router-dom` (despite it being installed).
**Evidence**: zero imports of `react-router-dom` anywhere in `frontend/src`; `App.js`'s `authScreen`/`teacherView`/`studentView` state machine.
**Consequence**: no deep-linking, no back-button support, but a simpler mental model for a single developer to hold in their head while iterating quickly.

### ADR-003: JWT-only auth, no server-side session store
**Decision (implicit)**: stateless auth via Bearer tokens in `localStorage`, no session/cookie store.
**Evidence**: `jsonwebtoken` used throughout; `axios` configured `withCredentials:true` but no cookie-based flow actually implemented.
**Consequence**: simple to scale statelessly in principle (any instance can verify any token) — ironically, this is one part of the architecture that *is* already horizontal-scaling-friendly, unlike the Socket.IO layer.

### ADR-004: Guest accounts are real `User` documents, not a separate ephemeral concept
**Decision (implicit)**: rather than model "guest" as a distinct, session-scoped entity, guests get a full `User` document with `role:'student'` and either a self-chosen or randomly-generated password.
**Evidence**: `User` schema's `password` field is optional specifically to accommodate this; two independent guest-creation code paths exist (PIN-join vs. guest-auth).
**Consequence**: simplifies the data model (one `User` collection, no parallel "Guest" collection) at the cost of the two-incompatible-flows bug documented in `MASTER_PROJECT_REPORT.md` Section 19 #9.

### ADR-005: Embed quiz gameplay state directly in `QuizSession`, defer durable results to a separate never-finished model
**Decision (implicit)**: model live gameplay as one mutable aggregate (`QuizSession.participants[].answers[]`), with a separate `QuizResult` collection intended for durable, denormalized, per-attempt history.
**Evidence**: `QuizResult.js`'s rich method set (`calculateMetrics`, `assignBadge`) clearly anticipates being populated from a completed `QuizSession`; nothing in `quiz-socket-handlers.js` ever performs that population.
**Consequence**: architecturally sound *intent* (separate the "live, mutable, ephemeral" representation from the "durable, historical, read-optimized" one) that was never finished — this is the clearest example in the whole codebase of a correct architectural instinct left incomplete.

### ADR-006: AI generation via a model-fallback chain rather than a single provider/model
**Decision (implicit)**: probe 4 Groq models in priority order before every real generation call, rather than hard-committing to one model with a simple retry.
**Evidence**: `getWorkingModel()` in `aiQuizGenerator.js`.
**Consequence**: improved resilience against any single model being temporarily rate-limited or deprecated, at the cost of doubling-to-quintupling API call volume per quiz generation.

---

# 20. Anti-Pattern Catalog

| Anti-pattern | Where | Architectural risk |
|---|---|---|
| **Shotgun-surgery auth** | 5 copies of JWT middleware | A security fix applied to 4 of 5 leaves a live gap |
| **God component** | `App.js`, 2,412 lines | Every state change risks re-rendering the entire app tree; impossible for a second developer to safely modify in isolation |
| **Dead-but-present architecture** | `groupRoutes.js`/`groupController.js`/`middleware/auth.js` | Misleads any new engineer reading the folder structure into believing this is the real request path |
| **Silent redundant implementations** | 2 quiz-hosting UIs, 2 poll systems, 2 Footers, 2 Logins | Doubles the maintenance surface for the same feature, with only one half actually working |
| **REST-to-socket backdoor coupling** | `global.io.to(...).emit(...)` from Express routes and Mongoose statics | Blocks horizontal scaling; makes the realtime layer's true dependency graph invisible from the socket-handler files alone |
| **Unenforced schema settings** | `Quiz.settings.showCorrectAnswer/showLeaderboard/allowLateJoin` stored but never read by gameplay code | Configuration that silently does nothing — a trap for anyone debugging "why didn't this setting take effect" |
| **Read-triggers-write endpoints** | `routes/analytics.js` GET routes that recalculate-and-save on every call | Breaks the assumption that GET is safe/idempotent; complicates any future caching layer |
| **String-literal event contracts with no shared constants** | Socket.IO event names duplicated as literals across 6+ files | Root cause of the confirmed event-naming drift bugs |
| **Env vars that do nothing** | `REMINDER_INTERVAL_MINUTES`, `REMINDER_ADVANCE_MINUTES` | Operators believe they can tune behavior that is actually hardcoded |
| **Committed build artifacts / backups** | `node_modules/` (99% of tracked files), `backend.zip`, `frontend/src.zip` | Bloats the repo, slows clones, and — for the zips — embeds an entire second copy of `node_modules` inside version control |

---

# 21. Target Future Architecture

Building on Section 15 (scaling) and Section 21 of `MASTER_PROJECT_REPORT.md` (SaaS expansion), the following is the recommended target-state architecture — an evolution, not a rewrite, of what exists today.

```mermaid
flowchart TB
    subgraph Today["TODAY"]
        T1["1 Node process<br/>REST + Socket.IO + in-memory state"]
        T2["Local disk uploads"]
        T3["Flat, single-tenant User/Group model"]
    end

    subgraph Target["TARGET"]
        R1["N Node processes behind a load balancer<br/>+ Redis adapter for Socket.IO<br/>+ Redis-backed quiz-timer state"]
        R2["Object storage (S3-compatible)<br/>+ signed URLs for access-controlled uploads"]
        R3["Organization-scoped multi-tenant data model<br/>(every query gains an organizationId clause)"]
        R4["Centralized auth middleware<br/>(consolidate the 5 copies into 1, actually mounted)"]
        R5["Shared Socket.IO event-constants module<br/>(single source of truth for event names,<br/>imported by both frontend and backend)"]
        R6["A real background-job runner<br/>(e.g. a dedicated cron/worker service)<br/>replacing the in-process setInterval reminder job"]
        R7["Actual QuizResult + Analytics write-path,<br/>closing the loop from gameplay → durable history → dashboards"]
    end

    Today --> Target
```

This target architecture requires **no framework replacement** (Express, Socket.IO, Mongoose, React all remain fit-for-purpose at the scale a multi-school SaaS would first need) — it is a matter of finishing the integrations that were already designed into the schema (`QuizResult`, `Analytics`), removing the duplicated/dead implementations, and adding the three infrastructure pieces (Redis, object storage, multi-tenancy) that the current single-classroom-scale MVP never needed.

---

# 22. Appendix: Full Middleware & Router Registration Order

(Reproduced here for architecture-document completeness — see `MASTER_PROJECT_REPORT.md` Section 6 for the same list presented alongside feature-level commentary.)

1. `dotenv.config()`
2. `app.options('*', cors(...))` — explicit preflight handler
3. `app.use(cors(...))` — `corsHandler` predicate (no-Origin, exact `FRONTEND_URL`, any `localhost`/`127.0.0.1`, any `192.168.x.x`)
4. `new Server(server, {...})` — Socket.IO construction, same CORS handler
5. `app.set('io', io); global.io = io;`
6. `GET /health` — before body parsers
7. `express.json()` / `express.urlencoded({extended:true})`
8. `app.use('/api/quiz', ...)`, `app.use('/api/analytics', ...)`, `app.use('/api/notifications', ...)` (in that order)
9. Conditional `startSessionReminderJob()`
10. `io.on('connection')` block #1 → `setupQuizSocketHandlers`
11. `process.on('SIGTERM', ...)` — 1st registration
12. Request-logging middleware (only covers routes registered after this line)
13. Uploads directory bootstrap + `express.static('/uploads', ...)` — no auth
14. Generic Multer configuration
15. `connectDB()` — fired, not awaited
16. ~20 inline REST routes (auth, groups, messages, upload)
17. Multer error-handling middleware (4-arg)
18. `app.use('/api/schedule', ...)`
19. More inline group/message routes
20. `io.on('connection')` block #2 → chat/presence handlers
21. `server.listen(PORT, "0.0.0.0", ...)`
22. `process.on('SIGTERM', ...)` — 2nd registration (both fire)

---

*End of SYSTEM_ARCHITECTURE.md. For feature-level narrative and the full audit findings, see `MASTER_PROJECT_REPORT.md`. For screen/state/animation detail, see `UI_UX_ARCHITECTURE.md`. For full per-field schema documentation, see `DATABASE_BIBLE.md`.*
