const path = require('path');
// .env.local (written by the ElevenLabs / Chert CLIs) wins over .env
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
// LiveKit keys + AGENT_NAME for Captain Odysseus's outbound calls come from captain-agent/.env.local,
// even if another file left them empty.
try {
  const agentEnv = require('dotenv').parse(require('fs').readFileSync(path.resolve(__dirname, '../../captain-agent/.env.local')));
  for (const k of ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'AGENT_NAME']) {
    if (!process.env[k] && agentEnv[k]) process.env[k] = agentEnv[k];
  }
} catch { /* no captain-agent/.env.local yet */ }

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { initRoomHandler, registerRoomHandlers, verifyPlayer, focusState, setCheckInCall, killAllSensors } = require('./sockets/roomHandler');
const { createChertWebhookRouter } = require('./routes/chertWebhook');
const { synthesize } = require('./services/elevenlabsService');

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0'; // LAN multiplayer

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '64kb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'crew-of-ithaca-backend', port: PORT });
});

// Chert FaceTime assistant -> heal +10 HP
app.use('/api', createChertWebhookRouter({ verifyPlayer, setCheckInCall, focusState }));

// ElevenLabs TTS proxy (friend-ui-demo route, kept for direct use)
app.post('/api/voice', async (req, res) => {
  const { text } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'text is required' });
  try {
    const audio = await synthesize(text);
    if (!audio) return res.status(204).end();
    res.set('Content-Type', 'audio/mpeg');
    res.send(audio);
  } catch (e) {
    console.error('voice adapter:', e.message);
    res.status(502).json({ error: 'Voice provider unavailable' });
  }
});

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 5e6, // webcam frames + push-to-talk clips
});
initRoomHandler(io);

io.on('connection', (socket) => {
  console.log(`[socket] Client connected: ${socket.id}`);
  registerRoomHandlers(io, socket);
  socket.on('disconnect', () => {
    console.log(`[socket] Client disconnected: ${socket.id}`);
  });
});

// Never leave Python sensors holding the webcam after the server stops
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { killAllSensors(); process.exit(0); });
}
process.on('exit', killAllSensors);

httpServer.listen(PORT, HOST, () => {
  console.log(`\n🚢 Crew of Ithaca backend running on http://localhost:${PORT}`);
  console.log(`   Health:  http://localhost:${PORT}/health`);
  console.log(`   Webhook: POST http://localhost:${PORT}/api/chert-webhook`);
  console.log('   Socket.io ready\n');
});
