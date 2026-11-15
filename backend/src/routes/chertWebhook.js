/**
 * POST /api/chert-webhook
 * Called by the Captain Odysseus FaceTime agent once he has seen the sailor's notes on the
 * phone camera (or heard something true) and the sailor is back at their desk.
 *
 * Body: { room, player, verified: true, observedItem: "Study Notes / Notebook" }
 * If room/player are missing, the player is found by `phone` (the number Chert called).
 * If room/player don't match, a sailor name (any case) or the one sailor on a check-in call is used.
 * Optional: set CHERT_WEBHOOK_SECRET and send it as `Authorization: Bearer <secret>`.
 *
 * POST /api/chert-call  { status: "started" | "ended", room?, player? }
 * Sent by captain-agent/ when a FaceTime check-in begins and ends, so the sailor
 * isn't damaged for looking at their phone during it.
 *
 * GET /api/focus?room=&player=
 * For captain-agent/: { sensorOnline, focusedForMs } — is the sailor back at their desk?
 */
const express = require('express');

function createChertWebhookRouter({ verifyPlayer, setCheckInCall, focusState }) {
  const router = express.Router();

  const authorized = (req, res) => {
    const secret = process.env.CHERT_WEBHOOK_SECRET;
    if (secret && req.get('authorization') !== `Bearer ${secret}`) {
      res.status(401).json({ ok: false, error: 'bad webhook secret' });
      return false;
    }
    return true;
  };

  router.post('/chert-call', (req, res) => {
    if (!authorized(req, res)) return;
    const { status, room, player } = req.body || {};
    if (status !== 'started' && status !== 'ended') return res.status(400).json({ ok: false, error: 'status must be started or ended' });
    setCheckInCall(status === 'started', { room, player });
    res.json({ ok: true });
  });

  router.post('/chert-webhook', (req, res) => {
    if (!authorized(req, res)) return;

    const { room, player, phone, verified, observedItem } = req.body || {};
    if (verified !== true) {
      return res.json({ ok: true, healed: false });
    }

    const result = verifyPlayer({ room, player, phone, observedItem });
    if (!result) {
      return res.status(404).json({ ok: false, error: 'player not found in any room' });
    }
    res.json({ ok: true, healed: true, room: result.room, player: result.player, hullHealth: result.hullHealth });
  });

  router.get('/focus', (req, res) => {
    const state = focusState({ room: req.query.room, player: req.query.player });
    if (!state) return res.status(404).json({ ok: false, error: 'player not found in any room' });
    res.json({ ok: true, ...state });
  });

  return router;
}

module.exports = { createChertWebhookRouter };
