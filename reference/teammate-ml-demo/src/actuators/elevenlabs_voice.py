"""
elevenlabs_voice.py - Captain Odysseus's voice.

say() returns immediately; a background thread asks ElevenLabs for the
audio and plays it, so the camera loop never freezes while he talks.

Audio comes back as raw PCM (22,050 Hz, 16-bit), which the `sounddevice`
library (already installed with MediaPipe) plays directly - no ffmpeg.
Lines are cached, so repeating the same line costs no extra credits.
"""
import queue
import threading
import time

import numpy as np
import sounddevice as sd

from src import config

SAMPLE_RATE = 22050
OUTPUT_FORMAT = "pcm_22050"     # works on the free plan (44.1 kHz PCM needs Pro)

# What the Captain says for each distraction reason
CAUGHT = {
    config.REASON_LOOKING_DOWN: "looking down at the phone",
    config.REASON_HEAD_TURNED: "turning away from the work",
    config.REASON_EYES_AWAY: "letting the eyes wander",
    config.REASON_EYES_CLOSED: "sleeping at the oars",
    config.REASON_EYES_COVERED: "hiding from the work",
    config.REASON_LEFT_DESK: "abandoning the post",
}


def damage_line(player, reason):
    caught = CAUGHT.get(reason, "slacking off")
    return (f"Sirens on deck! {player} was caught {caught}. "
            f"{config.DAMAGE_AMOUNT} damage to the hull!")


class CaptainVoice:
    def __init__(self):
        self.enabled = bool(config.ELEVENLABS_API_KEY)
        self._cache = {}                      # text -> audio samples
        self._queue = queue.Queue(maxsize=2)  # at most 2 lines waiting
        self._last_spoke = -1e9
        self._busy = False                    # True while fetching/playing audio
        if not self.enabled:
            print("[voice] No ELEVENLABS_API_KEY in .env - Captain is muted.")
            return
        from elevenlabs.client import ElevenLabs
        self._client = ElevenLabs(api_key=config.ELEVENLABS_API_KEY)
        threading.Thread(target=self._worker, daemon=True).start()

    # -- public ------------------------------------------------------------
    def say(self, text, ignore_cooldown=False):
        """Queue a line to speak. Returns False if skipped (muted/cooldown/busy)."""
        if not self.enabled:
            return False
        now = time.monotonic()
        if not ignore_cooldown and now - self._last_spoke < config.VOICE_COOLDOWN_SEC:
            return False
        try:
            self._queue.put_nowait(text)
        except queue.Full:
            return False
        self._last_spoke = now
        return True

    def announce_damage(self, player, reason):
        return self.say(damage_line(player, reason))

    def wait_until_done(self, timeout=15):
        """Block until queued lines finish (used by the test script)."""
        end = time.monotonic() + timeout
        time.sleep(0.2)
        while (not self._queue.empty() or self._busy) and time.monotonic() < end:
            time.sleep(0.1)

    # -- background thread ---------------------------------------------------
    def _synthesize(self, text):
        if text not in self._cache:
            chunks = self._client.text_to_speech.convert(
                text=text,
                voice_id=config.ELEVENLABS_VOICE_ID,
                model_id=config.ELEVENLABS_MODEL,
                output_format=OUTPUT_FORMAT,
            )
            pcm = b"".join(chunks)
            self._cache[text] = np.frombuffer(pcm, dtype=np.int16)
        return self._cache[text]

    def _worker(self):
        while True:
            text = self._queue.get()
            self._busy = True
            try:
                audio = self._synthesize(text)
                sd.play(audio, SAMPLE_RATE)
                sd.wait()
            except Exception as e:                # keep the game running no matter what
                print(f"[voice] Could not speak: {e}")
            finally:
                self._busy = False