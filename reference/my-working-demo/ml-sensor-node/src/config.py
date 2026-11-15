import os
from dotenv import load_dotenv

load_dotenv()

# Player / room config
PLAYER_NAME = os.getenv("PLAYER_NAME", "Arnab")
ROOM_CODE = os.getenv("ROOM_CODE", "ITHACA_1")
PLAYER_PHONE = os.getenv("PLAYER_PHONE", "+18175550199")

# Backend URL
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:4000")

# ElevenLabs
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ENABLE_ELEVENLABS = os.getenv("ENABLE_ELEVENLABS", "False").lower() == "true"
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")  # Bella

# Chert
CHERT_SECRET = os.getenv("CHERT_SECRET", "")
ENABLE_CHERT = os.getenv("ENABLE_CHERT", "False").lower() == "true"

# Detection thresholds
WARNING_DELAY = 0.4       # seconds before siren_warning fires
PENALTY_THRESHOLD = 3.0   # seconds before take_damage fires
DAMAGE_AMOUNT = 10

# MediaPipe landmark IDs
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

# Distraction thresholds
YAW_LOW = 0.34
YAW_HIGH = 0.66
PITCH_HIGH = 0.68
BLINK_LOW = 0.18
GAZE_LOW = 0.35
GAZE_HIGH = 0.65
