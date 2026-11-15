"""
player_state.py - the "referee". Decides WHEN to warn, damage, or forgive.

Every frame, detector + face_geometry tell us one thing:
    reason = None                      -> focused this frame
    reason = "Looking Down at Phone"   -> distracted this frame

That flickers a lot (blinks, quick glances). PlayerTelemetry adds timers
from config.py so we only react to distraction that LASTS:

    FOCUSED --(distracted WARNING_AFTER_SEC)--> WARNING   sends "siren_warning"
    WARNING --(distracted DAMAGE_AFTER_SEC)---> DAMAGED   sends "take_damage"
    DAMAGED --(every DAMAGE_REPEAT_SEC)-------> DAMAGED   sends "take_damage" again
    any     --(focused RECOVERY_SEC)----------> FOCUSED   sends "player_recovered"

Each event is sent ONCE (the "latches"), so the backend isn't spammed
30 times a second.
"""
import time
from dataclasses import dataclass

from src import config

FOCUSED, WARNING, DAMAGED = "focused", "warning", "damaged"


@dataclass
class Event:
    """Something the actuators (Step 5) should send / say / text."""
    name: str          # "siren_warning", "take_damage" or "player_recovered"
    reason: str = None  # e.g. "Looking Down at Phone"


class PlayerTelemetry:
    def __init__(self):
        self.status = FOCUSED
        self.reason = None              # current distraction reason
        self.distracted_since = None    # when this distraction started
        self.focused_since = None       # when you looked back
        self.next_damage_at = None      # when the next repeat hit is due
        self.penalties_caused = 0       # total damage events (for the UI)

    # -- timer limits (Left Desk gets extra grace time) --------------------
    def _limits(self, reason):
        extra = config.NO_FACE_GRACE_SEC if reason == config.REASON_LEFT_DESK else 0.0
        return config.WARNING_AFTER_SEC + extra, config.DAMAGE_AFTER_SEC + extra

    def update(self, reason, now=None):
        """Feed one frame's result. Returns a list of Events (usually empty)."""
        now = time.monotonic() if now is None else now
        events = []

        if reason is None:
            # ---------------- Focused this frame ----------------
            if self.distracted_since is None:
                return events                      # already calm
            if self.focused_since is None:
                self.focused_since = now           # start the recovery clock
            if now - self.focused_since >= config.RECOVERY_SEC:
                if self.status != FOCUSED:         # only if we told anyone
                    events.append(Event("player_recovered"))
                self._reset()
            return events

        # ---------------- Distracted this frame ----------------
        self.focused_since = None                  # a short look back doesn't count
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
            self.penalties_caused += 1
            self.next_damage_at = now + config.DAMAGE_REPEAT_SEC
            events.append(Event("take_damage", reason))
        elif self.status == DAMAGED and now >= self.next_damage_at:
            self.penalties_caused += 1
            self.next_damage_at = now + config.DAMAGE_REPEAT_SEC
            events.append(Event("take_damage", reason))

        return events

    def _reset(self):
        self.status = FOCUSED
        self.reason = None
        self.distracted_since = None
        self.focused_since = None
        self.next_damage_at = None

    # -- helpers for the on-screen display ----------------------------------
    def seconds_distracted(self, now=None):
        if self.distracted_since is None:
            return 0.0
        return (time.monotonic() if now is None else now) - self.distracted_since

    def progress(self, now=None):
        """0.0 -> 1.0 on the way to the first damage hit (for a progress bar)."""
        if self.distracted_since is None:
            return 0.0
        _, damage_after = self._limits(self.reason)
        return min(self.seconds_distracted(now) / damage_after, 1.0)