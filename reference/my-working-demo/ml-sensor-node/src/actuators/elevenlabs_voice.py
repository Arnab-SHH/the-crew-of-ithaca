"""
ElevenLabs voice alert actuator.
Runs in a daemon thread so it never blocks the 30 FPS camera loop.
"""

import threading
from src.config import ENABLE_ELEVENLABS, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID


def _speak_threaded(text: str):
    """Internal: called inside a daemon thread."""
    if not ENABLE_ELEVENLABS or not ELEVENLABS_API_KEY:
        print(f"[ElevenLabs MOCK] Would say: {text}")
        return
    try:
        from elevenlabs import ElevenLabs, VoiceSettings
        import tempfile, os, subprocess

        client = ElevenLabs(api_key=ELEVENLABS_API_KEY)
        audio = client.text_to_speech.convert(
            voice_id=ELEVENLABS_VOICE_ID,
            text=text,
            model_id="eleven_monolingual_v1",
            voice_settings=VoiceSettings(stability=0.5, similarity_boost=0.75),
        )
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            for chunk in audio:
                f.write(chunk)
            tmp_path = f.name

        # Play via afplay (macOS) or mpg123 (Linux)
        try:
            subprocess.Popen(["afplay", tmp_path])
        except FileNotFoundError:
            subprocess.Popen(["mpg123", "-q", tmp_path])
    except Exception as e:
        print(f"[ElevenLabs] Error: {e}")


def speak_warning(player_name: str, reason: str):
    """Non-blocking: fire-and-forget voice warning."""
    text = f"Warning, {player_name}! The Sirens call! {reason}. Refocus now!"
    t = threading.Thread(target=_speak_threaded, args=(text,), daemon=True)
    t.start()


def speak_damage(player_name: str, reason: str):
    """Non-blocking: fire-and-forget damage announcement."""
    text = f"Damage! {player_name} caused the ship to take ten hit points! {reason}!"
    t = threading.Thread(target=_speak_threaded, args=(text,), daemon=True)
    t.start()
