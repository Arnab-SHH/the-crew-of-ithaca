# The Crew of Ithaca 🚢

A multiplayer co-op focus game based on Homer's *Odyssey*. Your crew shares one ship. A webcam sensor watches each sailor. Look at your phone and the Sirens warn you, then damage the hull. Captain Odysseus (Chert) FaceTimes you and looks through your phone camera: show him your study notes, get back to your desk, and the hull is repaired.

```
ml-sensor-node/  Python  webcam → MediaPipe → focus events + live camera frames
backend/         Node    rooms, Python auto-launcher, Chert iMessage/FaceTime, ElevenLabs voice
frontend/        React   the game UI (friend-ui-demo design)
captain-agent/   Node    Captain Odysseus, the FaceTime agent Chert connects to your line
```

## 1. Install (once)

You need Node 18+ and Python 3.10+.

```powershell
# backend
cd backend
npm install

# frontend
cd ..\frontend
npm install

# ML sensor (a venv here is picked up automatically by the backend)
cd ..\ml-sensor-node
python -m venv .venv
.venv\Scripts\activate        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

On first run the sensor downloads MediaPipe's `face_landmarker.task` model (about 4 MB) into `ml-sensor-node/assets/`. If that download is blocked, get it from the URL in `src/config.py` (`MODEL_URL`) and put it there yourself.

## 2. Configure

Copy the example file, then fill it in. Every setting is explained inside it.

```powershell
copy .env.example .env      # macOS/Linux: cp .env.example .env
```

Your existing Chert key is in `reference/my-working-demo/backend/.env`. The main settings:

| Key | What it does |
|---|---|
| `CHERT_API_KEY`, `CHERT_PROJECT_ID`, `CHERT_LINE_ID` | Real iMessages and FaceTime calls. If these are blank, messages are only logged. |
| `CHERT_ASSISTANT_ID` | Your published "Captain Odysseus" assistant (see section 5) |
| `ELEVENLABS_API_KEY` | The Captain's voice. If blank, browsers use their built-in voice instead. |
| `AUTO_SPAWN` | `local` (default), `always` or `never` |
| `PYTHON_BIN` | Set this only if the backend can't find Python |

## 3. Run

Windows, one command from the repo root (opens a window each for the backend, frontend, Captain agent and `chert dev`):

```powershell
npm start
```

Or start the parts yourself:

```powershell
cd backend;  npm start        # http://localhost:4000
cd frontend; npm run dev      # http://localhost:5173 (also shown on your LAN IP)
```

Open the page, then enter your **name, room code and phone** (with country code). After you join, the backend starts `ml-sensor-node/src/main.py ... --headless` for you, and its annotated camera feed appears in the **Live Sensor** picture-in-picture. **Abandon ship** stops that process and returns you to the lobby. Closing the tab also stops it.

Running the sensor by hand, with a debug window:

```powershell
cd ml-sensor-node
python src/main.py --player Arnab --room ITHACA_1 --phone +18175550199 --server http://localhost:4000
```

## 4. Playing over LAN

- Other players open `http://<host-LAN-IP>:5173`. The UI connects to the backend at `http://<same host>:4000`.
- The auto-launched sensor uses **the backend computer's webcam**. For that reason it only starts automatically for a browser on that computer (`AUTO_SPAWN=local`). A player on another laptop runs the sensor on their own machine. The PIP shows the exact command, with `--server http://<host-IP>:4000`.
- Browsers only allow the microphone (push-to-talk) and the browser-camera fallback on `localhost` or HTTPS. Over plain-HTTP LAN those two features are blocked by the browser. Everything else works.

## 5. Chert "Captain Odysseus" FaceTime check-in

1. **Siren warning:** the backend sends an iMessage to the player's phone.
2. **Damage:** **Captain Odysseus calls the player on FaceTime.** The backend creates a LiveKit room, dispatches `captain-agent/` into it with the player's name, and asks Chert (`mode: customer_managed`) to FaceTime their phone into it. An iMessage says he's calling.
   If that call can't be placed, the iMessage instead says *"FaceTime Captain Odysseus at <your Chert number>"*, and `chert dev` answers with the same agent. Set `CAPTAIN_CALLS=inbound` in `.env` to always use that.
3. The Captain greets the player by name (on incoming calls he asks for it) and asks them to show their notes.
4. When they hold the notes up, the Captain takes a snapshot from their camera and checks it with a vision model (Gemini, or OpenAI). If it's real study material, he calls `POST http://localhost:4000/api/chert-webhook` and the hull gets +10 HP. Every player sees the shield animation.
5. While the call is live, damage is paused for the sailor who is distracted (`POST /api/chert-call`), since they're looking at their phone on purpose.

### Run Captain Odysseus (free trial / Shared plan: no LiveKit account needed)

```powershell
cd captain-agent
npm install
copy .env.example .env.local     # then put ONE key in .env.local: GOOGLE_API_KEY (free, aistudio.google.com) or OPENAI_API_KEY (paid)
npm start                        # terminal 3: the agent

# terminal 4, also in captain-agent:
npx --yes @trychert/facetime@0.1.0-beta.21 login    # once per computer; pick project bbebbb39-…
npx --yes @trychert/facetime@0.1.0-beta.21 doctor
npx --yes @trychert/facetime@0.1.0-beta.21 dev      # keep running; Ctrl+C frees the line
```

When `chert dev` says your agent is waiting, FaceTime **Video** your Chert number from your verified phone.

Notes:
- Keep the backend running too: the Captain heals the hull through it.
- After changing the agent's code, restart both `npm start` and `chert dev`.
- A trial line goes back to the pool if no agent is connected, and the number can change. Leaving `chert dev` running keeps it.
- Optional: with a published Chert managed assistant on a line you own, set `CHERT_ASSISTANT_ID` and the backend places an outbound FaceTime call instead.

## 6. Demo controls

Open **DEMO CONTROLS** (bottom right) to fire `siren_warning`, `take_damage`, `facetime_verified`, `player_recovered` and `reset_voyage` as yourself. These are real events. With Chert configured, they really text and FaceTime the phone you entered.

## Socket.io contract (port 4000)

| Event | Direction | Payload |
|---|---|---|
| `join_room` | web/python → server | `{ room, player, phone, source: "web" \| "python" }` |
| `join_success` / `join_error` | server → client | `{ room, player, roomState, sensor }` / `{ message }` |
| `leave_room` | web → server | `{ room, player }` |
| `webcam_frame` | python → server → that player's browser | `{ room, player, image, state, reason }` |
| `siren_warning` | python → server → room | `{ room, player, phone, reason }` |
| `take_damage` | python → server → room | `{ room, player, phone, damage, reason }` |
| `player_recovered` | python → server → room | `{ room, player }` |
| `facetime_verified` | socket, or `POST /api/chert-webhook` | `{ room, player, verified, observedItem }` |
| — | `POST /api/chert-call` (captain-agent) | `{ status: "started" \| "ended" }` |
| `crew_voice_message` | web → server → rest of room | `{ room, player, audioData }` (data: URL) |
| `reset_voyage` | web → server → room | `{ room }` |
| `room_state_update` | server → room | `{ roomCode, hullHealth, maxHealth, isSunk, lastEvent, players }` |
| `captain_voice` | server → room | `{ type, player, text, audio }` (base64 MP3 or `null`) |

## Tests

```powershell
cd backend;  npm test           # end-to-end socket + webhook test
cd frontend; npm run build
```
