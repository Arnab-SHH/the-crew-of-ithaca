# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# Project: The Crew of Ithaca

## Execution rule
Never spawn parallel swarm workers or subagents. Execute all tasks sequentially in a single thread.

## Layout
- `ml-sensor-node/` — Python. Webcam → MediaPipe (Face Landmarker, Face Mesh fallback) → `siren_warning` / `take_damage` / `player_recovered` / `webcam_frame` over Socket.io. Never calls ElevenLabs or Chert.
- `backend/` — Node (CommonJS), port 4000. Room state (`models/`), socket contract (`sockets/roomHandler.js`), Python auto-spawner, Chert (`services/chertService.js`, `routes/chertWebhook.js`), ElevenLabs (`services/elevenlabsService.js`).
- `captain-agent/` — Node LiveKit agent (from `chert new --video`). Captain Odysseus answers FaceTime via `chert dev`, snapshots the caller's camera, checks it with Gemini (GOOGLE_API_KEY, free tier) or OpenAI vision, then calls `POST /api/chert-webhook`. Follow its `AGENTS.md` (Chert's rules).
- `frontend/` — React + Vite. Visual design comes from `reference/friend-ui-demo/` (`src/style.css`, Playfair / DM Mono / Manrope, gold-on-slate palette). Match it for any new UI.
- Shared secrets live in the root `.env` (git-ignored; template in `.env.example`).

## Socket contract (do not rename events or fields)
`join_room`, `join_success`, `join_error`, `leave_room`, `webcam_frame`, `siren_warning`, `take_damage`, `player_recovered`, `facetime_verified`, `crew_voice_message`, `reset_voyage`, `room_state_update`, plus server → client `captain_voice`.
REST: `POST /api/chert-webhook`, `POST /api/chert-call`, `POST /api/voice`, `GET /health`.

## Verified values — change only with a reason
- Ratios: `yaw_ratio`, `pitch_ratio`, `blink_ratio`, `gaze_ratio` and thresholds in `ml-sensor-node/src/config.py`.
- Debounce: 0.4 s warning, 3.0 s penalty.

## Tests
- `cd backend && npm test` — end-to-end socket contract test (Chert/ElevenLabs/auto-spawn disabled).
- `cd frontend && npm run build`.
