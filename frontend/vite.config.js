import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// HTTPS (self-signed) so every LAN device gets a secure context for camera and microphone.
// The backend stays plain HTTP on port 4000; the page reaches it through this proxy.
// xfwd passes each player's real address on, so the backend can still tell the host
// computer (whose webcam the auto-started sensor uses) from other players.
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    https: true,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
        changeOrigin: true,
        xfwd: true,
      },
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        xfwd: true,
      },
    },
  },
})
