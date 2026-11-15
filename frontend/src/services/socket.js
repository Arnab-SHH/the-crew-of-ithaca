import { io } from 'socket.io-client'

// Same host the page was loaded from, so LAN players reach the host's backend
export const BACKEND_URL = `http://${window.location.hostname}:4000`

export const socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
})
