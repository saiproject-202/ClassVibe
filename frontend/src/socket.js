// frontend/src/socket.js
import { io } from "socket.io-client";

const RAW_SOCKET =
  process.env.REACT_APP_SOCKET_URL ||
  process.env.VITE_SOCKET_URL ||
  process.env.SOCKET_URL ||
  process.env.REACT_APP_API_URL ||
  "http://localhost:5000";

// strip trailing slash and any trailing /api
const SOCKET_BASE = String(RAW_SOCKET).replace(/\/api\/?$/i, "").replace(/\/$/, "");

export const SOCKET_URL = SOCKET_BASE;

const socket = io(SOCKET_URL, {
  autoConnect: false, // call socket.connect() after auth/token set
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10,
  transports: ["websocket", "polling"],
});

export default socket;
