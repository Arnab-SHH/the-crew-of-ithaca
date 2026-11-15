import { io } from 'socket.io-client'

// The page is served over HTTPS by Vite, which proxies /socket.io and /api to the backend
// on port 4000. Connecting to the page's own origin keeps everything secure (no mixed content).
export const socket = io(window.location.origin, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
})

// The Python sensor runs outside the browser and talks to the backend directly (plain HTTP).
export const BACKEND_URL = `http://${window.location.hostname}:4000`
