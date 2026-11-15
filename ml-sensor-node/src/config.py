"""
config.py - every setting for the ML Sensor Node, in one place.

Player / room / phone / server come from CLI args (main.py) first, then the
root .env file, then these defaults. Timers and limits live here.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Paths  (the shared .env lives at the repo root, one level above ml-sensor-node)
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).resolve().parent.parent          # .../ml-sensor-node
REPO_DIR = ROOT_DIR.parent                                 # .../crew-of-ithaca-final
load_dotenv(REPO_DIR / ".env.local")                       # written by the ElevenLabs / Chert CLIs
load_dotenv(REPO_DIR / ".env")
load_dotenv(ROOT_DIR / ".env")                             # optional local override

MODEL_PATH = ROOT_DIR / "assets" / "face_landmarker.task"
MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/face_landmarker/"
             "face_landmarker/float16/1/face_landmarker.task")

# Player / room defaults (overridden by --player/--room/--phone/--server)
PLAYER_NAME = os.getenv("PLAYER_NAME", "Arnab")
ROOM_CODE = os.getenv("ROOM_CODE", "ITHACA_1")
PLAYER_PHONE = os.getenv("PLAYER_PHONE", "+18175550199")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:4000")
CAMERA_INDEX = int(os.getenv("CAMERA_INDEX", "0") or 0)

# ---------------------------------------------------------------------------
# Debounce timers (made less sensitive after playtesting; were 0.4 s / 3.0 s)
# ---------------------------------------------------------------------------
WARNING_DELAY = 1.5        # seconds distracted before siren_warning fires
PENALTY_THRESHOLD = 6.0    # seconds distracted before take_damage fires
DAMAGE_REPEAT_SEC = 3.0    # keep dealing damage this often while distracted
RECOVERY_SEC = 0.5         # must look back this long to count as recovered (teammate)
NO_FACE_GRACE_SEC = 1.5    # extra time before "Left Desk" counts (teammate)
DAMAGE_AMOUNT = 10

# Webcam stream to the browser PIP
STREAM_FPS = 11
STREAM_WIDTH = 320
STREAM_JPEG_QUALITY = 60

# ---------------------------------------------------------------------------
# MediaPipe Face & Iris Mesh landmark IDs  (verified)
# ---------------------------------------------------------------------------
NOSE = 1
LEFT_CHEEK = 234
RIGHT_CHEEK = 454
FOREHEAD = 10
CHIN = 152
LEFT_EYE_OUTER = 33
LEFT_EYE_INNER = 133
LEFT_EYE_TOP = 159
LEFT_EYE_BOTTOM = 145
LEFT_IRIS_CENTER = 468

# Ratio thresholds (widened after playtesting; were 0.34/0.66, 0.68, 0.18, 0.35/0.65)
YAW_LOW = 0.28
YAW_HIGH = 0.72
PITCH_HIGH = 0.75
BLINK_LOW = 0.12
GAZE_LOW = 0.28
GAZE_HIGH = 0.72

# ---------------------------------------------------------------------------
# Teammate's posture / eye limits (used when head-pose + blendshapes exist)
# ---------------------------------------------------------------------------
# (widened after playtesting; were 30, 25, 25, 0.60, 0.60)
YAW_LIMIT_DEG = 38          # head turned left/right more than this
PITCH_DOWN_LIMIT_DEG = 32   # head tilted down (phone in lap)
PITCH_UP_LIMIT_DEG = 30     # head tilted back / away
EYES_CLOSED_LIMIT = 0.75    # eyeBlink blendshape score
GAZE_AWAY_LIMIT = 0.75      # eyeLookOut / eyeLookDown score
EYES_COVERED_RATIO = 0.45   # eye detail below this share of calibrated normal = covered
BASELINE_FRAMES = 60        # ~2-5 s of "looking at the screen" to calibrate

# Reason strings sent to the backend (data contract)
REASON_LOOKING_DOWN = "Looking Down at Phone"
REASON_HEAD_TURNED = "Head Turned Sideways"
REASON_EYES_AWAY = "Eyes Darting Away"
REASON_EYES_CLOSED = "Eyes Closed or Peeking Down"
REASON_EYES_COVERED = "Eyes Covered"
REASON_LEFT_DESK = "Left Desk"
