/**
 * Chert iMessage & FaceTime alert integration.
 * Spec: https://app.trychert.com/skills.md
 *
 * Chert gives your agent a real Apple identity to send iMessages
 * and place FaceTime audio/video calls to distracted players.
 *
 * Setup:
 * Set CHERT_API_KEY (starts with ftk_...) and CHERT_PROJECT_ID in the root .env
 * (or CHERT_LINE_ID if you have a specific line).
 * CHERT_ASSISTANT_ID = your published "Captain Odysseus" managed assistant. It
 * checks the sailor's study notes on the phone camera and that they're back at their desk, then calls POST /api/chert-webhook.
 */

const https = require('https');
const crypto = require('crypto');
const { exec } = require('child_process');
const { callPlayer, outboundEnabled } = require('./outboundCall');
const CHERT_API_KEY = process.env.CHERT_API_KEY || process.env.CHERT_SECRET || '';
const CHERT_PROJECT_ID = process.env.CHERT_PROJECT_ID || '';
const CHERT_LINE_ID = process.env.CHERT_LINE_ID || '';
const CHERT_ASSISTANT_ID = process.env.CHERT_ASSISTANT_ID || '';
const CHERT_ENABLED = Boolean(CHERT_API_KEY);

// take_damage repeats every few seconds while a player stays distracted.
// Only one FaceTime call per sailor (their own phone) in this window.
const FACETIME_COOLDOWN_MS = 90 * 1000;
const lastCallAt = new Map(); // sailor's phone -> ms
// The sensor warns often; the free trial allows ~50 texts an hour. One warning text per phone per minute.
const WARNING_TEXT_COOLDOWN_MS = 60 * 1000;
const lastWarningAt = new Map(); // destination phone -> ms
const lastBusyTextAt = new Map(); // sailor's phone -> ms

// Demo "bridge phone": a trial line only reaches verified numbers, so DEMO_FALLBACK_PHONE sends
// every text and call to one phone. The Captain still names the sailor who was distracted.
const DEMO_FALLBACK_PHONE = process.env.DEMO_FALLBACK_PHONE || '';
const destination = (phone) => DEMO_FALLBACK_PHONE || phone;

// One Chert line = one FaceTime call at a time. While it is busy, other distracted sailors get a
// "Captain is busy" text instead of a call. Freed when the call ends (or by a safety timeout).
const RING_TIMEOUT_MS = 60 * 1000;      // placed but never answered
const CALL_TIMEOUT_MS = 5 * 60 * 1000;  // answered, but the "ended" report never came
let lineBusy = null; // { player, timer }

function markLineBusy(player, ms = CALL_TIMEOUT_MS) {
  if (lineBusy) clearTimeout(lineBusy.timer);
  const name = player || (lineBusy && lineBusy.player) || null;
  lineBusy = { player: name, timer: setTimeout(() => { lineBusy = null; console.log('[captain-call] Line free again (timed out)'); }, ms) };
  if (lineBusy.timer.unref) lineBusy.timer.unref();
}

function markLineFree() {
  if (!lineBusy) return;
  clearTimeout(lineBusy.timer);
  lineBusy = null;
  console.log('[captain-call] Line free again');
}

/**
 * The project's lines from Chert (fetched once).
 */
let linesPromise = null;
function fetchLines() {
  if (!CHERT_ENABLED) return Promise.resolve([]);
  if (linesPromise) return linesPromise;
  linesPromise = new Promise((resolve) => {

    const options = {
      hostname: 'app.trychert.com',
      path: '/api/v1/lines',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CHERT_API_KEY}`,
        'X-Chert-Project-Id': CHERT_PROJECT_ID,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          // Chert returns { data: { items: [...] } }
          resolve(Array.isArray(json) ? json : (json.data && json.data.items) || json.lines || []);
        } catch {
          resolve([]);
        }
      });
    });

    req.on('error', () => resolve([]));
    req.end();
  });
  return linesPromise;
}

/** CHERT_LINE_ID, or the first line in the project. */
async function getLineId() {
  if (CHERT_LINE_ID) return CHERT_LINE_ID;
  const lines = await fetchLines();
  return (lines[0] && lines[0].id) || '';
}

/** The line's phone number, which players FaceTime to reach Captain Odysseus. */
async function getLineNumber() {
  const lines = await fetchLines();
  const line = lines.find((l) => l.id === CHERT_LINE_ID) || lines[0];
  return (line && line.masked_identity) || '';
}

/*
// [PREVIOUS LOCAL MACOS APPLESCRIPT FALLBACK - COMMENTED OUT]
function sendLocalMacMessage({ phone, message, playerName }) {
  if (process.platform !== 'darwin' || !phone) return;
  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  const escapedMessage = message.replace(/"/g, '\\"');
  const appleScript = `
    tell application "Messages"
      set targetService to 1st service whose service type = iMessage
      set targetBuddy to buddy "${cleanPhone}" of targetService
      send "${escapedMessage}" to targetBuddy
    end tell
  `;
  exec(`osascript -e '${appleScript}'`, (err) => {
    if (err) {
      console.log(`[Chert MOCK iMessage] Logged for ${playerName} (${phone}): "${message}"`);
    } else {
      console.log(`[Local macOS iMessage] Sent real iMessage to ${playerName} (${phone}) via Messages.app!`);
    }
  });
}

function triggerLocalFaceTimeCall({ phone, playerName }) {
  if (process.platform !== 'darwin' || !phone) return;
  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  exec(`open "facetime-audio://${cleanPhone}"`, (err) => {
    if (err) {
      console.log(`[Chert MOCK FaceTime Call] Logged for ${playerName} (${phone})`);
    } else {
      console.log(`[Local macOS FaceTime] Placed real FaceTime call to ${playerName} (${phone})!`);
    }
  });
}
*/

/**
 * Send an iMessage via official Chert Cloud API
 */
async function sendiMessage({ phone, playerName, message }) {
  phone = destination(phone);
  if (!phone) return;

  if (!CHERT_ENABLED) {
    console.log(`[Chert MOCK iMessage] To: ${playerName} (${phone}) -> "${message}"`);
    return;
  }

  const lineId = await getLineId();
  const payload = JSON.stringify({
    line_id: lineId || undefined,
    recipient: phone,
    text: message,
  });

  const options = {
    hostname: 'app.trychert.com',
    path: '/api/v1/shared-messages',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CHERT_API_KEY}`,
      'X-Chert-Project-Id': CHERT_PROJECT_ID,
      'Idempotency-Key': crypto.randomBytes(16).toString('hex'),
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      console.log(`[Chert Cloud iMessage] Sent to ${playerName} (${phone}): HTTP ${res.statusCode} - ${data}`);
    });
  });

  req.on('error', (err) => {
    console.error(`[Chert Cloud iMessage Error] Failed to send to ${playerName}:`, err.message);
  });

  req.write(payload);
  req.end();
}

/**
 * Place a FaceTime Call via official Chert Cloud API.
 * Resolves true only if Chert accepted the call.
 */
async function sendFaceTimeCall({ phone, playerName, reason }) {
  phone = destination(phone);
  if (!phone) return false;

  if (!CHERT_ENABLED) {
    console.log(`[Chert MOCK FaceTime Call] Ringing ${playerName} (${phone}) due to: ${reason}`);
    return true;
  }

  const lineId = await getLineId();
  const payload = JSON.stringify({
    direction: 'outbound',
    mode: 'managed',
    line_id: lineId || undefined,
    destination: phone,
    media: { audio: true, video: true }, // Enable FaceTime Video
    assistant_id: CHERT_ASSISTANT_ID || undefined,
  });

  const options = {
    hostname: 'app.trychert.com',
    path: '/api/v1/calls',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CHERT_API_KEY}`,
      'X-Chert-Project-Id': CHERT_PROJECT_ID,
      'Idempotency-Key': crypto.randomBytes(16).toString('hex'),
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        console.log(`[Chert Cloud FaceTime] Call placed to ${playerName}: HTTP ${res.statusCode} - ${data}`);
        if (res.statusCode >= 400 && process.platform === 'darwin') {
          const cleanPhone = phone.replace(/[^0-9+]/g, '');
          exec(`open "facetime://${cleanPhone}"`, () => {});
        }
        resolve(res.statusCode < 400);
      });
    });

    req.on('error', (err) => {
      console.error(`[Chert Cloud FaceTime Error] Failed to call ${playerName}:`, err.message);
      if (process.platform === 'darwin') {
        const cleanPhone = phone.replace(/[^0-9+]/g, '');
        exec(`open "facetime://${cleanPhone}"`, () => {});
      }
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

function triggerWarning({ phone, playerName, reason }) {
  const to = destination(phone);
  if (!to || Date.now() - (lastWarningAt.get(to) || 0) < WARNING_TEXT_COOLDOWN_MS) return;
  lastWarningAt.set(to, Date.now());
  const message = `⚠️ SIREN WARNING! ${playerName}, stop: ${reason}. Your Crew of Ithaca needs you focused!`;
  sendiMessage({ phone, playerName, message });
}

/**
 * Escalate damage: iMessage + FaceTime video call from "Captain Odysseus".
 * Resolves true if Chert accepted a new FaceTime verification call.
 */
async function triggerDamage({ phone, playerName, reason, room }) {
  const to = destination(phone);
  if (!to) return false;
  const key = phone || playerName; // cooldowns are per sailor, even when all calls go to one bridge phone

  // The line is on another sailor's call: tell this one to wait (at most one text a minute).
  if (lineBusy && lineBusy.player !== playerName) {
    const busyWith = lineBusy.player || 'another sailor';
    console.log(`[captain-call] Line busy with ${busyWith}: not calling ${playerName}.`);
    if (Date.now() - (lastBusyTextAt.get(key) || 0) >= WARNING_TEXT_COOLDOWN_MS) {
      lastBusyTextAt.set(key, Date.now());
      sendiMessage({ phone, playerName, message: `⚠️ ${playerName}, Captain Odysseus is inspecting ${busyWith} on FaceTime! `
        + 'Wait your turn, and get back to your helm before the Sirens sink the ship.' });
    }
    return false;
  }

  const last = lastCallAt.get(key) || 0;
  if (Date.now() - last < FACETIME_COOLDOWN_MS) {
    const wait = Math.ceil((FACETIME_COOLDOWN_MS - (Date.now() - last)) / 1000);
    console.log(`[captain-call] Not calling ${playerName} yet: they had a check-in less than 90 s ago (${wait} s left).`);
    return false;
  }
  lastCallAt.set(key, Date.now());

  // Without a managed assistant, Captain Odysseus is our own agent (captain-agent/).
  if (CHERT_ENABLED && !CHERT_ASSISTANT_ID) {
    // He calls the player (needs the LiveKit keys in captain-agent/.env.local)...
    if (!outboundEnabled()) {
      console.log('[captain-call] Outbound calls are off (CAPTAIN_CALLS=inbound, or no LiveKit keys in captain-agent/.env.local).');
    } else {
      console.log(`[captain-call] Calling ${playerName} at ${to}: starting a room for Captain Odysseus...`);
      const started = await callPlayer({
        room, player: playerName, phone: to,
        chert: { apiKey: CHERT_API_KEY, projectId: CHERT_PROJECT_ID, lineId: await getLineId() },
      });
      if (started) {
        markLineBusy(playerName, RING_TIMEOUT_MS);
        sendiMessage({ phone, playerName, message: `🚨 SHIP DAMAGED! ${playerName} caused -10 HP damage due to: ${reason}! `
          + 'Captain Odysseus is FaceTiming you now — answer and show him your notes on camera to repair +10 HP.' });
        return true;
      }
    }
    // ...or, if that isn't possible, the player FaceTimes the line and `chert dev` answers.
    const number = await getLineNumber();
    const message = `🚨 SHIP DAMAGED! ${playerName} caused -10 HP damage due to: ${reason}! ` +
      `FaceTime Captain Odysseus${number ? ` at ${number}` : ''} and show him your notes on camera to repair +10 HP.`;
    sendiMessage({ phone, playerName, message });
    return false;
  }

  const message = `🚨 SHIP DAMAGED! ${playerName} caused -10 HP damage due to: ${reason}! ` +
    `Captain Odysseus is FaceTiming you — show him your notes on camera to repair +10 HP.`;
  sendiMessage({ phone, playerName, message });
  const placed = await sendFaceTimeCall({ phone, playerName, reason });
  if (placed) markLineBusy(playerName, RING_TIMEOUT_MS);
  return placed;
}

function clearCallCooldown(phone) {
  if (phone) lastCallAt.delete(phone);
}

module.exports = {
  triggerWarning, triggerDamage, clearCallCooldown, sendiMessage, sendFaceTimeCall,
  markLineBusy, markLineFree,
};
