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
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
  timeout: 20000,
});

socket.on('connect', () => console.log('🔌 socket connected:', socket.id));
socket.on('disconnect', (reason) => console.log('🔌 socket disconnected, reason:', reason));
socket.on('connect_error', (err) => console.log('🔌 socket connect_error:', err.message));

export default socket;