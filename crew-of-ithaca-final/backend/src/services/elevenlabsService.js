/**
 * Captain Odysseus's voice via ElevenLabs text-to-speech.
 * Ported from the friend-ui-demo /api/voice adapter, now also triggered by the
 * backend itself on siren_warning / take_damage / facetime_verified so every
 * player in the room hears it.
 *
 * Without ELEVENLABS_API_KEY nothing is fetched; clients fall back to the
 * browser's speechSynthesis using the same text.
 */

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
const ELEVENLABS_MODEL = 'eleven_flash_v2_5';

// What the Captain says for each distraction reason (from teammate-ml-demo)
const CAUGHT = {
  'Looking Down at Phone': 'looking down at the phone',
  'Head Turned Sideways': 'turning away from the work',
  'Eyes Darting Away': 'letting the eyes wander',
  'Eyes Closed or Peeking Down': 'sleeping at the oars',
  'Eyes Covered': 'hiding from the work',
  'Left Desk': 'abandoning the post',
};

const LINES = {
  warning: (player) => `Sirens on deck. ${player} is drifting from the helm.`,
  damage: (player, reason) =>
    `Sirens on deck! ${player} was caught ${CAUGHT[reason] || 'slacking off'}. Ten damage to the hull!`,
  healed: (player) => `Well done, ${player}. I see your notes. Ten points restored to the hull!`,
};

// Don't repeat the same kind of line in a room too often (damage repeats every 3 s)
const COOLDOWN_MS = { warning: 8000, damage: 10000, healed: 0 };
const lastSpoke = new Map(); // `${room}:${type}` -> ms
const cache = new Map();     // text -> Buffer (repeated lines cost no credits)

async function synthesize(text) {
  if (!ELEVENLABS_API_KEY) return null;
  if (cache.has(text)) return cache.get(text);
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: text.slice(0, 400), model_id: ELEVENLABS_MODEL }),
  });
  if (!response.ok) throw new Error(`ElevenLabs returned ${response.status}`);
  const audio = Buffer.from(await response.arrayBuffer());
  cache.set(text, audio);
  return audio;
}

/**
 * Speak a game event to everyone in the room.
 * Emits `captain_voice` { type, player, text, audio } where audio is a base64
 * MP3 (or null -> browser speechSynthesis fallback).
 */
async function announce(io, room, type, player, reason) {
  const key = `${room}:${type}`;
  const cooldown = COOLDOWN_MS[type] || 0;
  if (cooldown && Date.now() - (lastSpoke.get(key) || 0) < cooldown) return;
  lastSpoke.set(key, Date.now());

  const text = LINES[type](player, reason);
  let audio = null;
  try {
    const buf = await synthesize(text);
    audio = buf ? buf.toString('base64') : null;
  } catch (e) {
    console.error('[ElevenLabs]', e.message);
  }
  io.to(room).emit('captain_voice', { type, player, text, audio });
}

module.exports = { synthesize, announce };
