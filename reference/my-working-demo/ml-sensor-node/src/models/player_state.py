import time

class PlayerState:
    """Tracks the focus state and distraction timing for a single player."""

    def __init__(self):
        self.is_distracted = False
        self.distract_reason = ""
        self.distracted_start_time = None   # time.time() when distraction began
        self.warning_sent = False            # latch: siren_warning fired once per episode
        self.damage_last_time = None         # time of last take_damage in continuous distraction

    def mark_distracted(self, reason: str):
        if not self.is_distracted:
            self.is_distracted = True
            self.distract_reason = reason
            self.distracted_start_time = time.time()
            self.warning_sent = False
            self.damage_last_time = None

    def mark_focused(self):
        was_warning = self.warning_sent
        self.is_distracted = False
        self.distract_reason = ""
        self.distracted_start_time = None
        self.warning_sent = False
        self.damage_last_time = None
        return was_warning   # caller uses this to decide whether to emit player_recovered

    def distraction_duration(self) -> float:
        if self.distracted_start_time is None:
            return 0.0
        return time.time() - self.distracted_start_time
