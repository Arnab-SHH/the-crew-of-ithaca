// Bridge phone (DEMO_FALLBACK_PHONE) and the one-call-at-a-time Chert line, with Chert and LiveKit faked.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const https = require('node:https');
const { EventEmitter } = require('node:events');

process.env.CHERT_API_KEY = 'ftk_test';
process.env.CHERT_PROJECT_ID = 'project';
process.env.DEMO_FALLBACK_PHONE = '+16825550000';

// Fake Chert HTTP API: records every iMessage, answers the lines list.
const texts = [];
https.request = (options, onResponse) => {
  const req = new EventEmitter();
  let body = '';
  req.write = (chunk) => { body += chunk; };
  req.end = () => {
    if (options.method === 'POST' && options.path.endsWith('/shared-messages')) texts.push(JSON.parse(body));
    const res = new EventEmitter();
    res.statusCode = 200;
    onResponse(res);
    const data = options.path.endsWith('/lines') ? { data: { items: [{ id: 'line-1', masked_identity: '+16465550100' }] } } : { ok: true };
    res.emit('data', JSON.stringify(data));
    res.emit('end');
  };
  return req;
};

// Fake outbound call: records who was called, and on which phone.
const calls = [];
const outbound = path.resolve(__dirname, '../src/services/outboundCall.js');
require.cache[outbound] = {
  id: outbound, filename: outbound, loaded: true,
  exports: { outboundEnabled: () => true, callPlayer: async (args) => { calls.push(args); return true; } },
};

const chert = require('../src/services/chertService');
const tick = () => new Promise((r) => setTimeout(r, 20));

test('bridge phone: the call and text go to one phone, naming the distracted sailor', async () => {
  const started = await chert.triggerDamage({ phone: '+16825551111', playerName: 'David', reason: 'Looking Down at Phone', room: 'R1' });
  await tick();
  assert.equal(started, true);
  assert.deepEqual({ player: calls[0].player, phone: calls[0].phone }, { player: 'David', phone: '+16825550000' });
  assert.equal(texts.at(-1).recipient, '+16825550000');
  assert.match(texts.at(-1).text, /David/);
});

test('busy line: another sailor gets a wait-your-turn text, not a second call', async () => {
  const started = await chert.triggerDamage({ phone: '+16825552222', playerName: 'Nhi', reason: 'Head Turned Sideways', room: 'R1' });
  await tick();
  assert.equal(started, false);
  assert.equal(calls.length, 1);
  assert.match(texts.at(-1).text, /Nhi, Captain Odysseus is inspecting David/);
  // only one busy text a minute per sailor
  const before = texts.length;
  await chert.triggerDamage({ phone: '+16825552222', playerName: 'Nhi', reason: 'Head Turned Sideways', room: 'R1' });
  await tick();
  assert.equal(texts.length, before);
});

test('line free again: the next sailor gets the call, even on the shared bridge phone', async () => {
  chert.markLineFree();
  const started = await chert.triggerDamage({ phone: '+16825552222', playerName: 'Nhi', reason: 'Head Turned Sideways', room: 'R1' });
  await tick();
  assert.equal(started, true);
  assert.deepEqual({ player: calls[1].player, phone: calls[1].phone }, { player: 'Nhi', phone: '+16825550000' });
  chert.markLineFree();
});
