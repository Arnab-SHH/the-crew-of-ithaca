"""
Main detection loop: captures frames, runs FaceMesh, calls face_geometry,
updates PlayerState, and returns action signals to main.py.
"""

import cv2
import mediapipe as mp
import time

from src.config import WARNING_DELAY, PENALTY_THRESHOLD, DAMAGE_AMOUNT
from src.models.face_geometry import compute_ratios, classify_distraction
from src.models.player_state import PlayerState


class FocusDetector:
    def __init__(self):
        self.face_mesh = mp.solutions.face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.state = PlayerState()
        self.cap = cv2.VideoCapture(0)

    def release(self):
        self.cap.release()
        self.face_mesh.close()
        cv2.destroyAllWindows()

    def process_frame(self):
        """
        Read one frame, run inference, update state.
        Returns a dict of signals:
          {
            "fire_warning": bool,      # emit siren_warning once
            "fire_damage": bool,       # emit take_damage
            "fire_recovery": bool,     # emit player_recovered
            "reason": str,
            "distraction_duration": float,
            "frame": np.ndarray | None,
          }
        """
        ret, frame = self.cap.read()
        signals = {
            "fire_warning": False,
            "fire_damage": False,
            "fire_recovery": False,
            "reason": "",
            "distraction_duration": 0.0,
            "frame": None,
        }

        if not ret:
            return signals

        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.face_mesh.process(rgb)

        is_distracted = False
        reason = ""

        if results.multi_face_landmarks:
            lm = results.multi_face_landmarks[0].landmark
            ratios = compute_ratios(lm, w, h)
            is_distracted, reason = classify_distraction(ratios)
        else:
            is_distracted = True
            reason = "Left Desk"

        # --- Time-domain debounce ---
        if is_distracted:
            self.state.mark_distracted(reason)
            dur = self.state.distraction_duration()

            # Draw orange countdown bar on frame
            bar_w = int((min(dur, PENALTY_THRESHOLD) / PENALTY_THRESHOLD) * w)
            cv2.rectangle(frame, (0, h - 20), (bar_w, h), (0, 165, 255), -1)
            cv2.putText(frame, f"DISTRACTED: {reason} ({dur:.1f}s)",
                        (10, h - 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 165, 255), 2)

            if dur >= WARNING_DELAY and not self.state.warning_sent:
                # Fire siren_warning ONCE
                self.state.warning_sent = True
                signals["fire_warning"] = True
                signals["reason"] = reason

            if dur >= PENALTY_THRESHOLD:
                # Periodic damage every PENALTY_THRESHOLD seconds
                now = time.time()
                if self.state.damage_last_time is None or \
                   (now - self.state.damage_last_time) >= PENALTY_THRESHOLD:
                    self.state.damage_last_time = now
                    # Reset so continuous distraction keeps dealing damage
                    self.state.distracted_start_time = now
                    signals["fire_damage"] = True
                    signals["reason"] = reason

        else:
            if self.state.is_distracted:
                was_warning = self.state.mark_focused()
                if was_warning:
                    signals["fire_recovery"] = True

        signals["distraction_duration"] = self.state.distraction_duration()
        signals["frame"] = frame
        return signals
