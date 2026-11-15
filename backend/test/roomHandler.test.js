// End-to-end check of the Socket.io data contract.
// Runs the real server on a spare port with Chert/ElevenLabs/auto-spawn turned off.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');

const PORT = 4599;
const URL = `http://localhost:${PORT}`;
let server;

// Resolve on the first `event` whose payload passes `match` (other broadcasts are skipped)
const once = (socket, event, match = () => true, ms = 3000) => new Promise((resolve, reject) => {
  const handler = (data) => { if (!match(data)) return; clearTimeout(t); socket.off(event, handler); resolve(data); };
  const t = setTimeout(() => { socket.off(event, handler); reject(new Error(`timeout waiting for ${event}`)); }, ms);
  socket.on(event, handler);
});
const connect = async () => { const s = io(URL, { transports: ['websocket'] }); await once(s, 'connect'); return s; };

test.before(async () => {
  server = spawn(process.execPath, [path.join(__dirname, '../src/server.js')], {
    env: { ...process.env, PORT: String(PORT), AUTO_SPAWN: 'never', CHERT_API_KEY: '', CHERT_SECRET: '',
      ELEVENLABS_API_KEY: '', CHERT_WEBHOOK_SECRET: '' },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('Socket.io ready')) resolve(); }));
});
test.after(() => server.kill());

test('full voyage: join, validation, damage, FaceTime heal, voice, leave', async () => {
  const a = await connect();
  const b = await connect();
  const py = await connect();

  // invalid phone -> join_error
  a.emit('join_room', { room: 'ITHACA_1', player: 'Arnab', phone: '123', source: 'web' });
  assert.match((await once(a, 'join_error')).message, /already taken|invalid/);

  // valid join -> join_success + room_state_update
  a.emit('join_room', { room: 'ithaca_1', player: 'Arnab', phone: '+1 817 555 0199', source: 'web' });
  const ok = await once(a, 'join_success');
  assert.equal(ok.room, 'ITHACA_1');
  assert.equal(ok.roomState.players.Arnab.status, 'focused');
  assert.equal(ok.roomState.players.Arnab.phone, undefined, 'phone is not broadcast');

  // same name from another browser -> blocked
  b.emit('join_room', { room: 'ITHACA_1', player: 'Arnab', phone: '+18175550199', source: 'web' });
  assert.ok(await once(b, 'join_error'));

  b.emit('join_room', { room: 'ITHACA_1', player: 'Penelope', phone: '+18175550100', source: 'web' });
  await once(b, 'join_success');

  // python sensor attaches to the same player
  py.emit('join_room', { room: 'ITHACA_1', player: 'Arnab', phone: '+18175550199', source: 'python' });
  const withSensor = await once(a, 'room_state_update', (s) => s.players.Arnab?.sensorOnline);
  assert.equal(withSensor.players.Arnab.sensorOnline, true);

  // webcam_frame reaches only Arnab's browser
  let penelopeGotFrame = false;
  b.on('webcam_frame', () => { penelopeGotFrame = true; });
  py.emit('webcam_frame', { room: 'ITHACA_1', player: 'Arnab', image: 'AAAA', state: 'focused', reason: 'Nominal' });
  assert.equal((await once(a, 'webcam_frame')).image, 'AAAA');

  // the Captain can ask whether the sailor is at their desk (name in any case)
  const focus = await (await fetch(`${URL}/api/focus?room=ITHACA_1&player=arnab`)).json();
  assert.equal(focus.player, 'Arnab');
  assert.equal(focus.sensorOnline, true);
  assert.ok(focus.focusedForMs >= 0);

  // siren_warning -> status + captain voice (text fallback)
  py.emit('siren_warning', { room: 'ITHACA_1', player: 'Arnab', phone: '+18175550199', reason: 'Looking Down at Phone' });
  const [warnState, voice] = await Promise.all([once(b, 'room_state_update', (s) => s.lastEvent?.type === 'warning'), once(b, 'captain_voice')]);
  assert.equal(warnState.players.Arnab.status, 'warning');
  assert.equal(voice.type, 'warning');
  assert.equal(voice.audio, null);
  // distracted -> not focused for the Captain's desk check
  assert.equal((await (await fetch(`${URL}/api/focus?room=ITHACA_1&player=Arnab`)).json()).focusedForMs, 0);

  // take_damage -> -10 HP and FaceTime pending
  py.emit('take_damage', { room: 'ITHACA_1', player: 'Arnab', phone: '+18175550199', damage: 10, reason: 'Looking Down at Phone' });
  const dmg = await once(b, 'room_state_update', (s) => s.lastEvent?.type === 'damage' && s.players.Arnab.facetimePending);
  assert.equal(dmg.hullHealth, 90);
  assert.equal(dmg.players.Arnab.status, 'damaged');
  assert.equal(dmg.players.Arnab.facetimePending, true);

  // REST webhook from Chert -> +10 HP
  const healedPromise = once(b, 'room_state_update', (s) => s.lastEvent?.type === 'healed');
  const res = await fetch(`${URL}/api/chert-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room: 'ITHACA_1', player: 'Arnab', verified: true, observedItem: 'Study Notes / Notebook' }),
  });
  assert.equal((await res.json()).healed, true);
  const healed = await healedPromise;
  assert.equal(healed.hullHealth, 100);
  assert.equal(healed.players.Arnab.status, 'focused');
  assert.equal(healed.players.Arnab.reason, 'FaceTime Verified: Studying Notebook! (+10 HP)');
  assert.equal(healed.players.Arnab.facetimePending, false);
  assert.deepEqual(
    { type: healed.lastEvent.type, player: healed.lastEvent.player, reason: healed.lastEvent.reason },
    { type: 'healed', player: 'Arnab', reason: 'FaceTime Camera Verified Study Notes (+10 HP)' });

  // facetime_verified socket event caps at 100
  a.emit('facetime_verified', { room: 'ITHACA_1', player: 'Arnab', verified: true, observedItem: 'Study Notes / Notebook' });
  assert.equal((await once(b, 'room_state_update')).hullHealth, 100);

  // player_recovered
  py.emit('take_damage', { room: 'ITHACA_1', player: 'Penelope', phone: '+18175550100', damage: 10, reason: 'Left Desk' });
  await once(a, 'room_state_update', (s) => s.players.Penelope?.status === 'damaged');
  b.emit('player_recovered', { room: 'ITHACA_1', player: 'Penelope' });
  assert.equal((await once(a, 'room_state_update', (s) => s.lastEvent?.type === 'recovery')).players.Penelope.status, 'focused');
  await new Promise((r) => setTimeout(r, 300));
  assert.ok((await (await fetch(`${URL}/api/focus?room=ITHACA_1&player=Penelope`)).json()).focusedForMs >= 250);

  // crew_voice_message goes to everyone but the sender
  let echoed = false;
  a.on('crew_voice_message', () => { echoed = true; });
  a.emit('crew_voice_message', { room: 'ITHACA_1', player: 'Arnab', audioData: 'data:audio/webm;base64,AAAA' });
  assert.equal((await once(b, 'crew_voice_message')).player, 'Arnab');

  // reset_voyage
  b.emit('reset_voyage', { room: 'ITHACA_1' });
  assert.equal((await once(a, 'room_state_update', (s) => s.lastEvent === null)).hullHealth, 100);

  // leave_room removes the player
  a.emit('leave_room', { room: 'ITHACA_1', player: 'Arnab' });
  const afterLeave = await once(b, 'room_state_update', (s) => !s.players.Arnab);
  assert.equal(afterLeave.players.Arnab, undefined);

  // name is free again
  a.emit('join_room', { room: 'ITHACA_1', player: 'Arnab', phone: '+18175550199', source: 'web' });
  assert.ok(await once(a, 'join_success'));

  assert.equal(penelopeGotFrame, false);
  assert.equal(echoed, false);
  [a, b, py].forEach((s) => s.close());
});

test('Captain Odysseus check-in call: pause, heal by spoken name, end', async () => {
  const a = await connect();
  const b = await connect();
  a.emit('join_room', { room: 'CALL_ROOM', player: 'Arnab', phone: '+18175550199', source: 'web' });
  await once(a, 'join_success');
  b.emit('join_room', { room: 'CALL_ROOM', player: 'Penelope', phone: '+18175550100', source: 'web' });
  await once(b, 'join_success');

  a.emit('take_damage', { room: 'CALL_ROOM', player: 'Arnab', phone: '+18175550199', damage: 10, reason: 'Looking Down at Phone' });
  await once(b, 'room_state_update', (s) => s.hullHealth === 90 && s.players.Arnab.facetimePending);
  // reset the mock-mode pending flag from the damage itself
  const cleared = once(b, 'room_state_update', (s) => !s.players.Arnab.facetimePending);
  await fetch(`${URL}/api/chert-call`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'ended' }) });
  await cleared;

  // call starts: only the distracted sailor is marked
  const started = once(b, 'room_state_update', (s) => s.players.Arnab.facetimePending);
  await fetch(`${URL}/api/chert-call`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'started' }) });
  const s1 = await started;
  assert.equal(s1.players.Penelope.facetimePending, false);

  // the Captain heals using the name as spoken, any case
  const healed = once(b, 'room_state_update', (s) => s.lastEvent?.type === 'healed');
  const res = await fetch(`${URL}/api/chert-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player: 'arnab', verified: true, observedItem: 'spiral notebook' }) });
  const body = await res.json();
  assert.equal(body.healed, true);
  assert.equal(body.player, 'Arnab');
  assert.equal((await healed).hullHealth, 100);

  // unknown name with nobody on a call and several sailors -> 404
  const miss = await fetch(`${URL}/api/chert-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player: 'Zeus', verified: true }) });
  assert.equal(miss.status, 404);

  // bad status is rejected; ended clears everything
  assert.equal((await fetch(`${URL}/api/chert-call`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"status":"x"}' })).status, 400);
  [a, b].forEach((s) => s.close());
});
