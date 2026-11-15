const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const ShipRoom = require('../models/ShipRoom');
const { triggerWarning, triggerDamage, clearCallCooldown } = require('../services/chertService');
const { announce } = require('../services/elevenlabsService');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const rooms = {};             // roomCode -> ShipRoom
const sensors = new Map();    // `${room}::${player}` -> ChildProcess
const facetimeTimers = new Map(); // `${room}::${player}` -> Timeout
let io = null;

const PORT = process.env.PORT || 4000;
const ML_DIR = path.resolve(__dirname, '../../../ml-sensor-node');
const MAIN_PY = path.join(ML_DIR, 'src', 'main.py');
const AUTO_SPAWN = (process.env.AUTO_SPAWN || 'local').toLowerCase(); // local | always | never
const FACETIME_WINDOW_MS = 90 * 1000; // longest pause while Captain Odysseus is on the call
const RING_WINDOW_MS = 30 * 1000;     // pause while his call is ringing; ends early if it is not answered
const CHERT_LIVE = Boolean(process.env.CHERT_API_KEY || process.env.CHERT_SECRET);

const PHONE_RE = /^\+?[1-9]\d{9,14}$/;
const JOIN_ERROR = 'Sailor name already taken in this room or invalid info!';
const MAX_VOICE_CHARS = 4 * 1024 * 1024; // ~3 MB of audio as base64

const normRoom = (r) => String(r || '').trim().toUpperCase().slice(0, 24);
const normName = (n) => String(n || '').trim().slice(0, 24);
const normPhone = (p) => String(p || '').replace(/[\s().-]/g, '');
const key = (room, player) => `${room}::${player}`;

function getOrCreateRoom(roomCode) {
  if (!rooms[roomCode]) rooms[roomCode] = new ShipRoom(roomCode);
  return rooms[roomCode];
}

function find(room, player) {
  const shipRoom = rooms[normRoom(room)];
  const p = shipRoom && shipRoom.players[normName(player)];
  return { shipRoom, p };
}

function broadcastRoomState(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  io.to(roomCode).emit('room_state_update', room.toJSON());
}

// ---------------------------------------------------------------------------
// ML sensor auto-spawner (one Python process per web player)
// ---------------------------------------------------------------------------
function pythonBin() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const venv = process.platform === 'win32'
    ? path.join(ML_DIR, '.venv', 'Scripts', 'python.exe')
    : path.join(ML_DIR, '.venv', 'bin', 'python');
  if (fs.existsSync(venv)) return venv;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function isLocalClient(socket) {
  const loopback = (a) => a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
  const direct = socket.handshake.address || '';
  if (!loopback(direct)) return false;
  // Through the frontend's HTTPS proxy every browser arrives from localhost; the proxy
  // passes the real address in X-Forwarded-For (only trusted when it came from localhost).
  const forwarded = String(socket.handshake.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return !forwarded || loopback(forwarded);
}

function shouldSpawn(socket) {
  if (AUTO_SPAWN === 'never') return false;
  if (AUTO_SPAWN === 'always') return true;
  // Default: the sensor runs on the backend machine and opens ITS webcam,
  // so only auto-launch for a browser on that same machine.
  return isLocalClient(socket);
}

function spawnSensor(room, player, phone) {
  const k = key(room, player);
  if (sensors.has(k)) return;
  const args = ['-u', MAIN_PY, '--player', player, '--room', room, '--phone', phone,
    '--server', `http://localhost:${PORT}`, '--headless'];
  const bin = pythonBin();
  console.log(`[sensor] Launching ${bin} ${args.slice(1).join(' ')}`);

  const child = spawn(bin, args, {
    cwd: ML_DIR,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    windowsHide: true,
  });
  sensors.set(k, child);

  const log = (buf) => String(buf).split(/\r?\n/).filter(Boolean)
    .forEach((line) => console.log(`[sensor:${player}] ${line}`));
  child.stdout.on('data', log);
  child.stderr.on('data', log);
  child.on('error', (err) => {
    console.error(`[sensor:${player}] Could not start Python (${err.message}). Set PYTHON_BIN in .env.`);
    if (sensors.get(k) === child) sensors.delete(k);
  });
  child.on('exit', (code, signal) => {
    console.log(`[sensor:${player}] exited (${signal || code})`);
    if (sensors.get(k) === child) sensors.delete(k);
  });
}

// On Windows a venv's python.exe (or the `py` launcher) starts the real
// interpreter as a child, so kill the whole process tree or the camera stays locked.
function stopProcess(child) {
  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  } else {
    child.kill('SIGTERM');
  }
}

function killSensor(room, player) {
  const k = key(room, player);
  const child = sensors.get(k);
  if (!child) return;
  sensors.delete(k);
  stopProcess(child);
  console.log(`[sensor:${player}] stopped`);
}

function killAllSensors() {
  for (const child of sensors.values()) stopProcess(child);
  sensors.clear();
}

// ---------------------------------------------------------------------------
// FaceTime verification window
// ---------------------------------------------------------------------------
function clearFacetime(room, player) {
  const k = key(room, player);
  clearTimeout(facetimeTimers.get(k));
  facetimeTimers.delete(k);
}

/** Pause damage for this sailor (they are on, or picking up, the Captain's call) for up to `ms`. */
function startFacetime(roomCode, p, ms = FACETIME_WINDOW_MS) {
  p.facetimePending = true;
  clearFacetime(roomCode, p.name);
  facetimeTimers.set(key(roomCode, p.name), setTimeout(() => {
    facetimeTimers.delete(key(roomCode, p.name));
    if (rooms[roomCode] && rooms[roomCode].players[p.name] === p) {
      p.facetimePending = false;
      broadcastRoomState(roomCode);
    }
  }, ms));
}

/** Finds the sailor the Captain means: by room+name, phone, name (any case), the one on a check-in call, or the only one. */
function findSailor({ room, player, phone }) {
  let { shipRoom, p } = find(room, player);
  if (!p && phone) {
    const wanted = normPhone(phone);
    for (const r of Object.values(rooms)) {
      const match = Object.values(r.players).find((x) => normPhone(x.phone) === wanted);
      if (match) { shipRoom = r; p = match; break; }
    }
  }
  // Captain Odysseus only knows the name the sailor says on the call
  const everyone = () => Object.values(rooms).flatMap((r) => Object.values(r.players).map((x) => [r, x]));
  const pick = (matches) => { if (matches.length === 1) [shipRoom, p] = matches[0]; };
  if (!p && player) pick(everyone().filter(([, x]) => x.name.toLowerCase() === String(player).trim().toLowerCase()));
  if (!p) pick(everyone().filter(([, x]) => x.facetimePending)); // the one sailor on a check-in call
  if (!p) pick(everyone());                                      // or the only sailor at all
  return p ? { shipRoom, p } : null;
}

/** Is the sailor back at their desk? For the Captain's check: sensor online, and how long they've been focused. */
function focusState({ room, player, phone }) {
  const found = findSailor({ room, player, phone });
  if (!found) return null;
  const { p } = found;
  const focusedForMs = p.status === 'focused' && p.focusedSince ? Date.now() - p.focusedSince : 0;
  return { player: p.name, sensorOnline: Boolean(p.pySocketId), focusedForMs };
}

/** Heal +10 HP after Captain Odysseus's check-in passes. Used by socket + REST webhook. */
function verifyPlayer({ room, player, phone }) {
  const found = findSailor({ room, player, phone });
  if (!found) return null;
  const { shipRoom, p } = found;

  shipRoom.applyFaceTimeVerified({ player: p.name });
  clearFacetime(shipRoom.roomCode, p.name);
  clearCallCooldown(p.phone);
  console.log(`[facetime_verified] ${p.name} in ${shipRoom.roomCode}: +10 HP -> ${shipRoom.hullHealth}`);
  announce(io, shipRoom.roomCode, 'healed', p.name);
  broadcastRoomState(shipRoom.roomCode);
  return { room: shipRoom.roomCode, player: p.name, hullHealth: shipRoom.hullHealth };
}

/**
 * Captain Odysseus (captain-agent/) answered or ended a FaceTime check-in.
 * On his own outbound calls he knows the sailor; on incoming calls he doesn't yet,
 * so pause damage for the sailors who are distracted (or everyone, if no one is).
 */
function setCheckInCall(active, { room, player } = {}) {
  const { p: known } = find(room, player);
  for (const r of Object.values(rooms)) {
    const players = known ? Object.values(r.players).filter((p) => p === known) : Object.values(r.players);
    const distracted = players.filter((p) => p.status !== 'focused');
    for (const p of players) {
      if (active && (distracted.length === 0 || distracted.includes(p))) startFacetime(r.roomCode, p);
      if (!active && p.facetimePending) { p.facetimePending = false; clearFacetime(r.roomCode, p.name); }
    }
    broadcastRoomState(r.roomCode);
  }
  console.log(`[chert-call] Check-in call ${active ? 'started' : 'ended'}`);
}

// ---------------------------------------------------------------------------
// Leaving
// ---------------------------------------------------------------------------
function removeWebPlayer(socket, roomCode, player) {
  const shipRoom = rooms[roomCode];
  killSensor(roomCode, player);
  clearFacetime(roomCode, player);
  if (shipRoom) {
    shipRoom.removePlayer(player);
    if (shipRoom.isEmpty()) delete rooms[roomCode];
  }
  socket.leave(roomCode);
  socket.data = {};
  broadcastRoomState(roomCode);
}

// ---------------------------------------------------------------------------
// Socket events
// ---------------------------------------------------------------------------
function initRoomHandler(ioServer) {
  io = ioServer;
}

function registerRoomHandlers(ioServer, socket) {
  io = io || ioServer;

  // join_room: { room, player, phone, source: 'web' | 'python' }
  socket.on('join_room', (payload = {}) => {
    const room = normRoom(payload.room);
    const player = normName(payload.player);
    const phone = normPhone(payload.phone);
    const source = payload.source === 'python' ? 'python' : 'web';

    if (!room || !player || !PHONE_RE.test(phone)) {
      socket.emit('join_error', { message: JOIN_ERROR });
      return;
    }

    const existing = rooms[room] && rooms[room].players[player];
    if (source === 'web' && existing && existing.webSocketId && existing.webSocketId !== socket.id
        && io.sockets.sockets.get(existing.webSocketId)) {
      socket.emit('join_error', { message: JOIN_ERROR });
      return;
    }

    const shipRoom = getOrCreateRoom(room);
    const p = shipRoom.getOrCreatePlayer({ name: player, phone });
    socket.join(room);
    socket.data = { room, player, role: source };

    if (source === 'web') {
      p.webSocketId = socket.id;
    } else {
      p.pySocketId = socket.id;
    }
    console.log(`[join_room] ${player} joined ${room} via ${source}`);

    const spawning = source === 'web' && shouldSpawn(socket);
    socket.emit('join_success', {
      room, player, roomState: shipRoom.toJSON(),
      // auto = sensor launched on this machine; remote/off = player starts it themselves
      sensor: source === 'web' ? (spawning ? 'auto' : AUTO_SPAWN === 'never' ? 'off' : 'remote') : undefined,
    });
    broadcastRoomState(room);
    if (spawning) spawnSensor(room, player, phone);
  });

  // leave_room: { room, player } — stop that player's Python sensor and remove them
  socket.on('leave_room', ({ room, player } = {}) => {
    const { p } = find(room, player);
    if (!p || p.webSocketId !== socket.id) return;
    console.log(`[leave_room] ${p.name} left ${normRoom(room)}`);
    removeWebPlayer(socket, normRoom(room), p.name);
  });

  // webcam_frame: Python -> that player's browser only (keeps bandwidth + privacy in check)
  socket.on('webcam_frame', (payload = {}) => {
    const { p } = find(payload.room, payload.player);
    if (p && p.webSocketId) io.to(p.webSocketId).volatile.emit('webcam_frame', payload);
  });

  // siren_warning: { room, player, phone, reason }
  socket.on('siren_warning', ({ room, player, phone, reason } = {}) => {
    const { shipRoom, p } = find(room, player);
    if (!p || !shipRoom.applyWarning({ player: p.name, reason })) return;
    console.log(`[siren_warning] ${p.name} in ${shipRoom.roomCode}: ${reason}`);
    triggerWarning({ phone: p.phone || phone, playerName: p.name, reason });
    announce(io, shipRoom.roomCode, 'warning', p.name, reason);
    broadcastRoomState(shipRoom.roomCode);
  });

  // take_damage: { room, player, phone, damage, reason }
  socket.on('take_damage', ({ room, player, phone, damage, reason } = {}) => {
    const { shipRoom, p } = find(room, player);
    if (!p) return;
    // While Captain Odysseus is on a live FaceTime with this player, they are
    // looking at their phone on purpose — don't keep sinking the ship.
    if (p.facetimePending && CHERT_LIVE) {
      console.log(`[take_damage] ${p.name} ignored: FaceTime verification in progress`);
      return;
    }
    // One hit per check-in: after it, no more damage until the Captain heals them (+10 HP),
    // so picking up the phone to answer him doesn't keep sinking the ship.
    if (p.damageLocked) {
      console.log(`[take_damage] ${p.name} ignored: waiting for Captain Odysseus's check-in (+10 HP unlocks damage)`);
      return;
    }
    shipRoom.applyDamage({ player: p.name, damage, reason });
    console.log(`[take_damage] ${p.name} in ${shipRoom.roomCode}: -${damage} HP (${reason})`);
    announce(io, shipRoom.roomCode, 'damage', p.name, reason);
    broadcastRoomState(shipRoom.roomCode);
    // Pause further damage only once Chert has accepted the call, and only while it rings:
    // when the Captain joins, setCheckInCall() extends it; unanswered, damage counts again.
    if (CHERT_LIVE) p.damageLocked = true;
    triggerDamage({ phone: p.phone || phone, playerName: p.name, reason, room: shipRoom.roomCode }).then((started) => {
      if (shipRoom.players[p.name] !== p) return;
      if (started) startFacetime(shipRoom.roomCode, p, RING_WINDOW_MS);
      else if (p.damageLocked) { // no Captain call is coming, so don't leave them unable to take damage
        p.damageLocked = false;
        console.log(`[take_damage] ${p.name}: no check-in call started, damage counts again`);
      }
      broadcastRoomState(shipRoom.roomCode);
    });
  });

  // player_recovered: { room, player }
  socket.on('player_recovered', ({ room, player } = {}) => {
    const { shipRoom, p } = find(room, player);
    if (!p || !shipRoom.applyRecovery({ player: p.name })) return;
    console.log(`[player_recovered] ${p.name} in ${shipRoom.roomCode} is focused again`);
    broadcastRoomState(shipRoom.roomCode);
  });

  // facetime_verified: { room, player, verified, observedItem }
  socket.on('facetime_verified', ({ room, player, verified } = {}) => {
    if (verified !== true) return;
    verifyPlayer({ room, player });
  });

  // crew_voice_message: { room, player, audioData } -> everyone else in the room
  socket.on('crew_voice_message', ({ room, player, audioData } = {}) => {
    const r = normRoom(room);
    if (!socket.rooms.has(r) || typeof audioData !== 'string' || audioData.length > MAX_VOICE_CHARS) return;
    socket.to(r).emit('crew_voice_message', { room: r, player: normName(player), audioData });
  });

  // reset_voyage: { room }
  socket.on('reset_voyage', ({ room } = {}) => {
    const r = normRoom(room);
    const shipRoom = rooms[r];
    if (!shipRoom) return;
    shipRoom.reset();
    for (const name of Object.keys(shipRoom.players)) clearFacetime(r, name);
    console.log(`[reset_voyage] Room ${r} reset`);
    broadcastRoomState(r);
  });

  socket.on('disconnect', () => {
    const { room, player, role } = socket.data || {};
    if (!room || !player) return;
    const { p } = find(room, player);
    if (!p) return;
    if (role === 'web' && p.webSocketId === socket.id) {
      console.log(`[disconnect] ${player} closed the browser — removing from ${room}`);
      removeWebPlayer(socket, room, player);
    } else if (role === 'python' && p.pySocketId === socket.id) {
      p.pySocketId = null;
      broadcastRoomState(room);
    }
  });
}

module.exports = { initRoomHandler, registerRoomHandlers, verifyPlayer, focusState, setCheckInCall, killAllSensors };
