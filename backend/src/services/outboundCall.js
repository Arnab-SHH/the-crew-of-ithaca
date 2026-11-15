/**
 * Captain Odysseus calls the player (Chert "customer_managed" outbound FaceTime).
 *
 * 1. Create a LiveKit room and dispatch the captain-agent into it, telling it who it is calling.
 * 2. Mint a token for Chert's FaceTime bridge to join that room.
 * 3. POST /api/v1/calls so Chert FaceTimes the player's phone into the room.
 * 4. When the bridge is publishing audio, set {"chert_bridge_ready": true} in the room metadata —
 *    the same signal `chert dev` uses — so the agent greets right away (Chert ends silent calls).
 *
 * Uses the LiveKit project in captain-agent/.env.local (loaded by server.js).
 */
const crypto = require('crypto');
const { AccessToken, AgentDispatchClient, RoomServiceClient, TrackType } = require('livekit-server-sdk');

const AGENT_KIND = 4; // livekit ParticipantInfo.Kind.AGENT
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function config() {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, AGENT_NAME } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return null;
  return {
    wsUrl: LIVEKIT_URL,
    httpUrl: LIVEKIT_URL.replace(/^ws/, 'http'),
    key: LIVEKIT_API_KEY,
    secret: LIVEKIT_API_SECRET,
    agentName: AGENT_NAME || 'crew-of-ithaca-captain',
  };
}

/** True when outbound Captain calls can be made (LiveKit keys present, not switched off). */
function outboundEnabled() {
  return Boolean(config()) && (process.env.CAPTAIN_CALLS || 'outbound') !== 'inbound';
}

/** Polls fn() until it returns something truthy, or gives up after ms. */
async function waitFor(fn, ms, every = 500) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await fn().catch(() => undefined);
    if (value) return value;
    await pause(every);
  }
  return undefined;
}

/**
 * Starts the call. Resolves true if Chert accepted it.
 * chert: { apiKey, projectId, lineId }
 */
async function callPlayer({ room, player, phone, chert }) {
  const cfg = config();
  if (!cfg) return false;
  const rooms = new RoomServiceClient(cfg.httpUrl, cfg.key, cfg.secret);
  const dispatch = new AgentDispatchClient(cfg.httpUrl, cfg.key, cfg.secret);
  const roomName = `ithaca-call-${crypto.randomBytes(4).toString('hex')}`;
  const bridgeIdentity = `chert-bridge-${roomName}`;
  const cleanup = () => rooms.deleteRoom(roomName).catch(() => {});

  try {
    await rooms.createRoom({ name: roomName, emptyTimeout: 120, maxParticipants: 4 });
    await dispatch.createDispatch(roomName, cfg.agentName, {
      metadata: JSON.stringify({ outbound: true, room, player }),
    });

    // The Mac takes audio and video from the agent, so Chert needs its identity.
    const agentIdentity = await waitFor(async () => {
      const list = await rooms.listParticipants(roomName);
      const agent = list.find((p) => p.kind === AGENT_KIND || p.identity.startsWith('agent-'));
      return agent && agent.identity;
    }, 15000);
    if (!agentIdentity) {
      console.error(`[captain-call] The Captain agent didn't join ${roomName}. Is "npm start" running in captain-agent?`);
      await cleanup();
      return false;
    }

    const at = new AccessToken(cfg.key, cfg.secret, { identity: bridgeIdentity, ttl: '15m' });
    at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
    const participantToken = await at.toJwt();

    const res = await fetch('https://app.trychert.com/api/v1/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${chert.apiKey}`,
        'X-Chert-Project-Id': chert.projectId,
        'Idempotency-Key': crypto.randomBytes(16).toString('hex'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        direction: 'outbound',
        mode: 'customer_managed',
        line_id: chert.lineId || undefined,
        destination: phone,
        media: { audio: true, video: true },
        livekit_url: cfg.wsUrl,
        participant_token: participantToken,
        remote_participant_identity: agentIdentity,
      }),
    });
    const body = await res.text();
    console.log(`[captain-call] Chert outbound call to ${player}: HTTP ${res.status} - ${body}`);
    if (!res.ok) {
      await cleanup();
      return false;
    }

    signalBridgeReady(rooms, roomName, bridgeIdentity);
    return true;
  } catch (err) {
    console.error('[captain-call] Could not start the call:', err.message);
    await cleanup();
    return false;
  }
}

/** Once Chert's bridge publishes audio, tell the agent FaceTime is ready (it then greets). */
async function signalBridgeReady(rooms, roomName, bridgeIdentity) {
  const ready = await waitFor(async () => {
    const list = await rooms.listParticipants(roomName);
    const bridge = list.find((p) => p.identity === bridgeIdentity || p.identity.startsWith('chert-bridge-'));
    return bridge && (bridge.tracks || []).some((t) => t.type === TrackType.AUDIO);
  }, 90000);
  if (!ready) {
    console.log(`[captain-call] The call in ${roomName} was not answered.`);
    rooms.deleteRoom(roomName).catch(() => {});
    return;
  }
  await pause(1000); // give FaceTime a moment to finish connecting
  await rooms.updateRoomMetadata(roomName, JSON.stringify({ chert_bridge_ready: true, at: new Date().toISOString() }))
    .catch((err) => console.error('[captain-call] Could not set bridge_ready:', err.message));
  console.log(`[captain-call] FaceTime connected in ${roomName}; the Captain is greeting.`);
}

module.exports = { callPlayer, outboundEnabled };
