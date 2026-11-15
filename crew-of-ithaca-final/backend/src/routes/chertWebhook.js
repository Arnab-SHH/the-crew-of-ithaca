/**
 * POST /api/chert-webhook
 * Called by the Chert "Captain Odysseus" FaceTime assistant once it has seen
 * the student hold up their notebook / study notes on the iPhone camera.
 *
 * Body: { room, player, verified: true, observedItem: "Study Notes / Notebook" }
 * If room/player are missing, the player is found by `phone` (the number Chert called).
 * Optional: set CHERT_WEBHOOK_SECRET and send it as `Authorization: Bearer <secret>`.
 */
const express = require('express');

function createChertWebhookRouter({ verifyPlayer }) {
  const router = express.Router();

  router.post('/chert-webhook', (req, res) => {
    const secret = process.env.CHERT_WEBHOOK_SECRET;
    if (secret && req.get('authorization') !== `Bearer ${secret}`) {
      return res.status(401).json({ ok: false, error: 'bad webhook secret' });
    }

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

  return router;
}

module.exports = { createChertWebhookRouter };
