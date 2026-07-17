import { io } from "socket.io-client";

const SOCKET_URL =
  process.env.REACT_APP_SOCKET_URL ||
  process.env.REACT_APP_API_URL ||
  "https://classvibe-backend.onrender.com";

const socket = io(SOCKET_URL, {
  path: "/socket.io",
  transports: ["polling", "websocket"],  // ✅ polling FIRST, then upgrade to websocket
  withCredentials: true,
  autoConnect: false,
  reconnection: true,
  // ✅ FIX (production sync): never give up reconnecting. The backend runs on a free
  // tier that spins down when idle and can take 30-60s to cold-start; the old cap of
  // 5 attempts × 2s meant the socket permanently gave up after ~10s and only a full
  // page reload could revive it (this was the root of "teacher lobby / chat / quiz not
  // updating until I reload"). With infinite retries + a capped backoff it keeps trying
  // and auto-recovers the moment the server is back — and the app re-joins its rooms on
  // the 'authenticated' event that follows each reconnect (see App.js + the quiz views).
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});

socket.on('connect', () => console.log('🔌 socket connected:', socket.id));
socket.on('disconnect', (reason) => console.log('🔌 socket disconnected, reason:', reason));
socket.on('connect_error', (err) => console.log('🔌 socket connect_error:', err.message));

export default socket;