"""
config.py - every setting for the ML Sensor Node, in one place.

Secrets (API keys, phone number) come from the .env file.
Timers and limits are written here, so you can tune them without
touching any other file.

Test it:  python -m src.config   (run from the ml-sensor-node folder)
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# 1. Paths
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).resolve().parent.parent     # .../ml-sensor-node
MODEL_PATH = ROOT_DIR / "assets" / "face_landmarker.task"

load_dotenv(ROOT_DIR / ".env")                         # read the .env file


def _env(key, default=""):
    """Read one value from .env. Treat 'PASTE_HERE' placeholders as empty."""
    value = os.getenv(key, default).strip()
    return "" if "PASTE" in value or "XXXX" in value else value


# ---------------------------------------------------------------------------
# 2. Who am I in the game  (from .env)
# ---------------------------------------------------------------------------
PLAYER_NAME = _env("PLAYER_NAME", "Player")
ROOM_CODE = _env("ROOM_CODE", "ITHACA_1")
BACKEND_URL = _env("BACKEND_URL", "http://localhost:4000")
CAMERA_INDEX = int(_env("CAMERA_INDEX", "0") or 0)

# ---------------------------------------------------------------------------
# 3. API keys  (from .env)
# ---------------------------------------------------------------------------
ELEVENLABS_API_KEY = _env("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = _env("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")
ELEVENLABS_MODEL = "eleven_flash_v2_5"                 # fastest ElevenLabs model

CHERT_API_KEY = _env("CHERT_API_KEY")
PLAYER_PHONE = _env("PLAYER_PHONE")

# ---------------------------------------------------------------------------
# 4. Timers  - pick a mode: "STUDY" (real use) or "DEMO" (judges)
# ---------------------------------------------------------------------------
MODE = "STUDY"

TIMER_PROFILES = {
    #                    STUDY  DEMO
    # Look away shorter than this = ignored (blinks, glances at notes)
    "WARNING_AFTER_SEC":  (3.0,  1.0),
    # Still looking away after this = ship takes damage
    "DAMAGE_AFTER_SEC":   (10.0, 3.0),
    # If you STAY distracted, more damage this often
    "DAMAGE_REPEAT_SEC":  (10.0, 5.0),
    # Must look back for this long to count as "recovered"
    # (stops flicker when you look up for a split second)
    "RECOVERY_SEC":       (1.0,  0.5),
    # Face missing (left the desk) gets extra time before the warning
    "NO_FACE_GRACE_SEC":  (5.0,  1.5),
}

_col = 0 if MODE == "STUDY" else 1
WARNING_AFTER_SEC = TIMER_PROFILES["WARNING_AFTER_SEC"][_col]
DAMAGE_AFTER_SEC = TIMER_PROFILES["DAMAGE_AFTER_SEC"][_col]
DAMAGE_REPEAT_SEC = TIMER_PROFILES["DAMAGE_REPEAT_SEC"][_col]
RECOVERY_SEC = TIMER_PROFILES["RECOVERY_SEC"][_col]
NO_FACE_GRACE_SEC = TIMER_PROFILES["NO_FACE_GRACE_SEC"][_col]

DAMAGE_AMOUNT = 10                                     # HP lost per hit

# Don't spam: minimum gap between repeated alerts of the same kind
VOICE_COOLDOWN_SEC = 15                                # Captain's voice
IMESSAGE_COOLDOWN_SEC = 60                             # texts to your phone

# ---------------------------------------------------------------------------
# 5. Distraction limits  (starting guesses - we tune them live in Step 3)
# ---------------------------------------------------------------------------
# Head angles in degrees, from MediaPipe's head-rotation matrix
YAW_LIMIT_DEG = 30          # head turned left/right more than this
PITCH_DOWN_LIMIT_DEG = 25   # head tilted down more than this (phone in lap)
PITCH_UP_LIMIT_DEG = 25     # head tilted up more than this

# Eye scores from MediaPipe blendshapes: 0.0 = not at all, 1.0 = fully
EYES_CLOSED_LIMIT = 0.60    # eyeBlink score above this = eyes closed
GAZE_AWAY_LIMIT = 0.60      # eyeLookOut / eyeLookDown score above this

# Eyes covered (hand over eyes): the pixels around the eyes lose their
# detail. Below this fraction of your calibrated normal = covered.
EYES_COVERED_RATIO = 0.45

# Reason text sent to the backend (must match the team's data contract)
REASON_LOOKING_DOWN = "Looking Down at Phone"
REASON_HEAD_TURNED = "Head Turned Sideways"
REASON_EYES_AWAY = "Eyes Darting Away"
REASON_EYES_CLOSED = "Eyes Closed"
REASON_EYES_COVERED = "Eyes Covered"
REASON_LEFT_DESK = "Left Desk"

# ---------------------------------------------------------------------------
# 6. Camera & display
# ---------------------------------------------------------------------------
TARGET_FPS = 30
SHOW_DEBUG_WINDOW = True    # show the webcam window with live numbers


# ---------------------------------------------------------------------------
# Self-test:  python -m src.config
# ---------------------------------------------------------------------------
def _hide(secret):
    return "MISSING" if not secret else secret[:4] + "..." + " (set)"


if __name__ == "__main__":
    print(f"Mode: {MODE}")
    print(f"  Player {PLAYER_NAME} | room {ROOM_CODE} | backend {BACKEND_URL} | camera {CAMERA_INDEX}")
    print(f"  Model file: {'found' if MODEL_PATH.exists() else 'MISSING'}")
    print(f"  ElevenLabs key: {_hide(ELEVENLABS_API_KEY)} | voice {ELEVENLABS_VOICE_ID}")
    print(f"  Chert key: {_hide(CHERT_API_KEY)} | phone: {'set' if PLAYER_PHONE else 'MISSING'}")
    print("Timers:")
    print(f"  warning after {WARNING_AFTER_SEC}s, damage after {DAMAGE_AFTER_SEC}s, "
          f"repeat every {DAMAGE_REPEAT_SEC}s, recover after {RECOVERY_SEC}s, "
          f"left-desk grace {NO_FACE_GRACE_SEC}s")
    print("Limits:")
    print(f"  yaw {YAW_LIMIT_DEG} deg, pitch down {PITCH_DOWN_LIMIT_DEG} deg, pitch up {PITCH_UP_LIMIT_DEG} deg, "
          f"eyes closed {EYES_CLOSED_LIMIT}, gaze away {GAZE_AWAY_LIMIT}")