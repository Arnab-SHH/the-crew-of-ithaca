"""
player_state.py - the "referee". Decides WHEN to warn, damage, or forgive.

Each frame gives one verdict: reason=None (focused) or a reason string.
That flickers (blinks, quick glances), so timers debounce it:

    FOCUSED --(distracted WARNING_DELAY 0.4s)-----> WARNING   "siren_warning"
    WARNING --(distracted PENALTY_THRESHOLD 3.0s)-> DAMAGED   "take_damage"
    DAMAGED --(every DAMAGE_REPEAT_SEC)-----------> DAMAGED   "take_damage" again
    any     --(focused RECOVERY_SEC)--------------> FOCUSED   "player_recovered"

"Left Desk" (no face) gets NO_FACE_GRACE_SEC extra before it counts, and looking
left/right (head or eyes) gets SIDE_LOOK_GRACE_SEC extra, so normal glances are free.
Each event fires once per step, so the backend is not spammed every frame.
"""
import time
from dataclasses import dataclass

from src import config

FOCUSED, WARNING, DAMAGED = "focused", "warning", "damaged"


@dataclass
class Event:
    name: str          # "siren_warning", "take_damage" or "player_recovered"
    reason: str = None


class PlayerState:
    def __init__(self):
        self.status = FOCUSED
        self.reason = None
        self.distracted_since = None
        self.focused_since = None
        self.next_damage_at = None

    def _limits(self, reason):
        if reason == config.REASON_LEFT_DESK:
            extra = config.NO_FACE_GRACE_SEC
        elif reason in (config.REASON_HEAD_TURNED, config.REASON_EYES_AWAY):
            extra = config.SIDE_LOOK_GRACE_SEC
        else:
            extra = 0.0
        return config.WARNING_DELAY + extra, config.PENALTY_THRESHOLD + extra

    def update(self, reason, now=None):
        """Feed one frame's verdict. Returns a list of Events (usually empty)."""
        now = time.monotonic() if now is None else now
        events = []

        if reason is None:
            if self.distracted_since is None:
                return events
            if self.focused_since is None:
                self.focused_since = now
            if now - self.focused_since >= config.RECOVERY_SEC:
                if self.status != FOCUSED:
                    events.append(Event("player_recovered"))
                self._reset()
            return events

        self.focused_since = None
        self.reason = reason
        if self.distracted_since is None:
            self.distracted_since = now

        warn_after, damage_after = self._limits(reason)
        elapsed = now - self.distracted_since

        if self.status == FOCUSED and elapsed >= warn_after:
            self.status = WARNING
            events.append(Event("siren_warning", reason))

        if self.status == WARNING and elapsed >= damage_after:
            self.status = DAMAGED
            self.next_damage_at = now + config.DAMAGE_REPEAT_SEC
            events.append(Event("take_damage", reason))
        elif self.status == DAMAGED and now >= self.next_damage_at:
            self.next_damage_at = now + config.DAMAGE_REPEAT_SEC
            events.append(Event("take_damage", reason))

        return events

    def _reset(self):
        self.status = FOCUSED
        self.reason = None
        self.distracted_since = None
        self.focused_since = None
        self.next_damage_at = None

    def progress(self, now=None):
        """0.0 -> 1.0 on the way to the first damage hit (for the on-frame bar)."""
        if self.distracted_since is None:
            return 0.0
        now = time.monotonic() if now is None else now
        _, damage_after = self._limits(self.reason)
        return min((now - self.distracted_since) / damage_after, 1.0)
