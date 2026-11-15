// Captain Odysseus calling the player: LiveKit and Chert are replaced with fakes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { RoomServiceClient, AgentDispatchClient, TrackType } = require('livekit-server-sdk');

process.env.LIVEKIT_URL = 'wss://ithaca-test.livekit.cloud';
process.env.LIVEKIT_API_KEY = 'APItest';
process.env.LIVEKIT_API_SECRET = 'secret-secret-secret-secret-secret-1234';
process.env.AGENT_NAME = 'crew-of-ithaca-captain';
const { callPlayer, outboundEnabled } = require('../src/services/outboundCall');

function fakeLiveKit(t, { agentJoins = true } = {}) {
  const seen = { dispatch: null, metadata: null, deleted: [], lists: 0 };
  t.mock.method(RoomServiceClient.prototype, 'createRoom', async (opts) => ({ name: opts.name }));
  t.mock.method(RoomServiceClient.prototype, 'deleteRoom', async (name) => { seen.deleted.push(name); });
  t.mock.method(RoomServiceClient.prototype, 'updateRoomMetadata', async (name, md) => { seen.metadata = JSON.parse(md); });
  t.mock.method(RoomServiceClient.prototype, 'listParticipants', async (name) => {
    seen.lists += 1;
    const agent = { identity: 'agent-AJ_123', kind: 4, tracks: [] };
    if (!agentJoins) return [];
    if (seen.lists < 3) return [agent];
    return [agent, { identity: `chert-bridge-${name}`, kind: 0, tracks: [{ type: TrackType.AUDIO }] }];
  });
  t.mock.method(AgentDispatchClient.prototype, 'createDispatch', async (room, agentName, opts) => {
    seen.dispatch = { room, agentName, metadata: JSON.parse(opts.metadata) };
  });
  return seen;
}

const chert = { apiKey: 'ftk_test', projectId: 'bbebbb39', lineId: 'cda385e6' };

test('outbound call: dispatches the Captain, asks Chert to call, then signals bridge_ready', async (t) => {
  assert.equal(outboundEnabled(), true);
  const seen = fakeLiveKit(t);
  let request;
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    request = { url, headers: opts.headers, body: JSON.parse(opts.body) };
    return { ok: true, status: 201, text: async () => '{"data":{"id":"call_1"}}' };
  });

  const ok = await callPlayer({ room: 'ITHACA_1', player: 'Arnab', phone: '+16812172615', chert });
  assert.equal(ok, true);

  assert.equal(seen.dispatch.agentName, 'crew-of-ithaca-captain');
  assert.deepEqual(seen.dispatch.metadata, { outbound: true, room: 'ITHACA_1', player: 'Arnab' });

  assert.equal(request.url, 'https://app.trychert.com/api/v1/calls');
  assert.equal(request.headers['X-Chert-Project-Id'], 'bbebbb39');
  const b = request.body;
  assert.equal(b.mode, 'customer_managed');
  assert.equal(b.direction, 'outbound');
  assert.equal(b.line_id, 'cda385e6');
  assert.equal(b.destination, '+16812172615');
  assert.deepEqual(b.media, { audio: true, video: true });
  assert.equal(b.livekit_url, 'wss://ithaca-test.livekit.cloud');
  assert.equal(b.remote_participant_identity, 'agent-AJ_123');
  const grant = JSON.parse(Buffer.from(b.participant_token.split('.')[1], 'base64url').toString());
  assert.equal(grant.video.room, seen.dispatch.room);
  assert.equal(grant.video.roomJoin, true);
  assert.match(grant.sub, /^chert-bridge-/);

  // bridge_ready arrives once the bridge publishes audio (+1 s settle)
  const end = Date.now() + 5000;
  while (!seen.metadata && Date.now() < end) await new Promise((r) => setTimeout(r, 100));
  assert.equal(seen.metadata.chert_bridge_ready, true);
  assert.equal(seen.deleted.length, 0);
});

test('outbound call: Chert refuses -> false, room cleaned up', async (t) => {
  const seen = fakeLiveKit(t);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 422, text: async () => '{"error":{"code":"invalid_request"}}' }));
  const ok = await callPlayer({ room: 'ITHACA_1', player: 'Arnab', phone: '+16812172615', chert });
  assert.equal(ok, false);
  assert.equal(seen.deleted.length, 1);
});

test('outbound call: agent not running -> false without calling Chert', { timeout: 30000 }, async (t) => {
  const seen = fakeLiveKit(t, { agentJoins: false });
  let called = false;
  t.mock.method(globalThis, 'fetch', async () => { called = true; return { ok: true, text: async () => '' }; });
  const ok = await callPlayer({ room: 'ITHACA_1', player: 'Arnab', phone: '+16812172615', chert });
  assert.equal(ok, false);
  assert.equal(called, false);
  assert.equal(seen.deleted.length, 1);
});
