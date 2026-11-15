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
 * checks the student's notebook on camera, then calls POST /api/chert-webhook.
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
// Only one FaceTime call per phone in this window.
const FACETIME_COOLDOWN_MS = 90 * 1000;
const lastCallAt = new Map(); // phone -> ms
// The sensor warns often; the free trial allows ~50 texts an hour. One warning text per phone per minute.
const WARNING_TEXT_COOLDOWN_MS = 60 * 1000;
const lastWarningAt = new Map(); // phone -> ms

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
  if (!phone || Date.now() - (lastWarningAt.get(phone) || 0) < WARNING_TEXT_COOLDOWN_MS) return;
  lastWarningAt.set(phone, Date.now());
  const message = `⚠️ SIREN WARNING! ${playerName}, stop: ${reason}. Your Crew of Ithaca needs you focused!`;
  sendiMessage({ phone, playerName, message });
}

/**
 * Escalate damage: iMessage + FaceTime video call from "Captain Odysseus".
 * Resolves true if Chert accepted a new FaceTime verification call.
 */
async function triggerDamage({ phone, playerName, reason, room }) {
  if (!phone) return false;
  const last = lastCallAt.get(phone) || 0;
  if (Date.now() - last < FACETIME_COOLDOWN_MS) return false;
  lastCallAt.set(phone, Date.now());

  // Without a managed assistant, Captain Odysseus is our own agent (captain-agent/).
  if (CHERT_ENABLED && !CHERT_ASSISTANT_ID) {
    // He calls the player (needs the LiveKit keys in captain-agent/.env.local)...
    if (outboundEnabled()) {
      const started = await callPlayer({
        room, player: playerName, phone,
        chert: { apiKey: CHERT_API_KEY, projectId: CHERT_PROJECT_ID, lineId: await getLineId() },
      });
      if (started) {
        sendiMessage({ phone, playerName, message: `🚨 SHIP DAMAGED! ${playerName} caused -10 HP damage due to: ${reason}! `
          + 'Captain Odysseus is FaceTiming you now — answer and hold your notebook up to the camera to repair +10 HP.' });
        return true;
      }
    }
    // ...or, if that isn't possible, the player FaceTimes the line and `chert dev` answers.
    const number = await getLineNumber();
    const message = `🚨 SHIP DAMAGED! ${playerName} caused -10 HP damage due to: ${reason}! ` +
      `FaceTime Captain Odysseus${number ? ` at ${number}` : ''} and hold your notebook up to the camera to repair +10 HP.`;
    sendiMessage({ phone, playerName, message });
    return false;
  }

  const message = `🚨 SHIP DAMAGED! ${playerName} caused -10 HP damage due to: ${reason}! ` +
    `Captain Odysseus is FaceTiming you — hold your notebook up to the camera to repair +10 HP.`;
  sendiMessage({ phone, playerName, message });
  return sendFaceTimeCall({ phone, playerName, reason });
}

function clearCallCooldown(phone) {
  if (phone) lastCallAt.delete(phone);
}

module.exports = { triggerWarning, triggerDamage, clearCallCooldown, sendiMessage, sendFaceTimeCall };
