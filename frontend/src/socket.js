// frontend/src/socket.js
import { io } from "socket.io-client";

const SOCKET_URL =
  process.env.REACT_APP_API_URL || "https://classvibe-backend.onrender.com";

const socket = io(SOCKET_URL, {
  autoConnect: false,
  withCredentials: true,
  transports: ["websocket", "polling"],
  secure: true,
});

export default socket;