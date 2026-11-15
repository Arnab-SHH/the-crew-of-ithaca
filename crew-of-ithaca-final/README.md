# The Crew of Ithaca 🚢

A multiplayer co-op focus game based on Homer's *Odyssey*. Your crew shares one ship. A webcam sensor watches each sailor. Look at your phone and the Sirens warn you, then damage the hull. Captain Odysseus (Chert) FaceTimes you, and showing your notebook on camera repairs the hull.

```
ml-sensor-node/  Python  webcam → MediaPipe → focus events + live camera frames
backend/         Node    rooms, Python auto-launcher, Chert iMessage/FaceTime, ElevenLabs voice
frontend/        React   the game UI (friend-ui-demo design)
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

## 5. Chert "Captain Odysseus" FaceTime verification

1. **Siren warning:** the backend sends an iMessage to the player's phone.
2. **Damage:** the backend sends an iMessage and starts a Chert FaceTime **video** call (`mode: managed`, `assistant_id: CHERT_ASSISTANT_ID`). It places at most one call per phone every 90 s. While that call is live (up to 90 s), further damage from that player is paused, because they are looking at their phone on purpose.
3. In the Chert dashboard, give your managed assistant a prompt like this:
   > You are Captain Odysseus of the Crew of Ithaca. A student got distracted while studying. Greet them in character, ask them to hold their notebook or study notes up to the camera, and look for real handwritten or printed study material. When you clearly see it, call the `verify_notebook` tool, then praise them and tell them to get back to work.
4. Point that tool or webhook at `POST https://<your-tunnel>/api/chert-webhook`. Chert can't reach `localhost`, so use a tunnel such as `ngrok http 4000`. Send this body:
   ```json
   { "room": "ITHACA_1", "player": "Arnab", "verified": true, "observedItem": "Study Notes / Notebook" }
   ```
   If the assistant only knows the phone number it called, send `"phone": "+1..."` instead of room and player. If `CHERT_WEBHOOK_SECRET` is set, add the header `Authorization: Bearer <secret>`.
5. The hull gets +10 HP (capped at 100), and every player sees the shield animation and hears the Captain.

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
| `crew_voice_message` | web → server → rest of room | `{ room, player, audioData }` (data: URL) |
| `reset_voyage` | web → server → room | `{ room }` |
| `room_state_update` | server → room | `{ roomCode, hullHealth, maxHealth, isSunk, lastEvent, players }` |
| `captain_voice` | server → room | `{ type, player, text, audio }` (base64 MP3 or `null`) |

## Tests

```powershell
cd backend;  npm test           # end-to-end socket + webhook test
cd frontend; npm run build
```
