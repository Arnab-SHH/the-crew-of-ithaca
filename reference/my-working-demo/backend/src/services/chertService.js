/**
 * Chert iMessage & FaceTime alert integration.
 * Spec: https://app.trychert.com/skills.md
 *
 * Chert gives your agent a real Apple identity to send iMessages
 * and place FaceTime audio/video calls to distracted players.
 *
 * Setup:
 * Set CHERT_API_KEY (starts with ftk_...) and CHERT_PROJECT_ID in backend/.env
 * (or CHERT_LINE_ID if you have a specific line)
 */

const https = require('https');
const crypto = require('crypto');
const { exec } = require('child_process');
const CHERT_API_KEY = process.env.CHERT_API_KEY || process.env.CHERT_SECRET || '';
const CHERT_PROJECT_ID = process.env.CHERT_PROJECT_ID || '';
const CHERT_LINE_ID = process.env.CHERT_LINE_ID || '';
const CHERT_ENABLED = Boolean(CHERT_API_KEY);

/**
 * Fetch the first available line_id from Chert if not provided in environment
 */
let cachedLineId = CHERT_LINE_ID;
function getLineId() {
  return new Promise((resolve) => {
    if (cachedLineId) return resolve(cachedLineId);
    if (!CHERT_ENABLED) return resolve('');

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
          const lines = Array.isArray(json) ? json : json.lines || [];
          if (lines.length > 0 && lines[0].id) {
            cachedLineId = lines[0].id;
            resolve(cachedLineId);
          } else {
            resolve('');
          }
        } catch {
          resolve('');
        }
      });
    });

    req.on('error', () => resolve(''));
    req.end();
  });
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
 * Place a FaceTime Call via official Chert Cloud API
 */
async function sendFaceTimeCall({ phone, playerName, reason }) {
  if (!phone) return;

  if (!CHERT_ENABLED) {
    console.log(`[Chert MOCK FaceTime Call] Ringing ${playerName} (${phone}) due to: ${reason}`);
    return;
  }

  const lineId = await getLineId();
  const payload = JSON.stringify({
    direction: 'outbound',
    mode: 'managed',
    line_id: lineId || undefined,
    destination: phone,
    media: { audio: true, video: true }, // Enable FaceTime Video
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

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      console.log(`[Chert Cloud FaceTime] Call placed to ${playerName}: HTTP ${res.statusCode} - ${data}`);
      if (res.statusCode >= 400 && process.platform === 'darwin') {
        const cleanPhone = phone.replace(/[^0-9+]/g, '');
        exec(`open "facetime://${cleanPhone}"`, () => {});
      }
    });
  });

  req.on('error', (err) => {
    console.error(`[Chert Cloud FaceTime Error] Failed to call ${playerName}:`, err.message);
    if (process.platform === 'darwin') {
      const cleanPhone = phone.replace(/[^0-9+]/g, '');
      exec(`open "facetime://${cleanPhone}"`, () => {});
    }
  });

  req.write(payload);
  req.end();
}

function triggerWarning({ phone, playerName, reason }) {
  const message = `⚠️ SIREN WARNING! ${playerName}, stop: ${reason}. Your Crew of Ithaca needs you focused!`;
  sendiMessage({ phone, playerName, message });
}

function triggerDamage({ phone, playerName, reason }) {
  const message = `🚨 SHIP DAMAGED! ${playerName} caused -10 HP damage due to: ${reason}! Stay focused or Ithaca sinks!`;
  sendiMessage({ phone, playerName, message });
  sendFaceTimeCall({ phone, playerName, reason });
}

module.exports = { triggerWarning, triggerDamage, sendiMessage, sendFaceTimeCall };
