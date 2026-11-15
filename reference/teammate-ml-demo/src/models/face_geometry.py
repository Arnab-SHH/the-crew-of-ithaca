"""
face_geometry.py - turns MediaPipe's raw face data into simple numbers.

MediaPipe Face Landmarker gives us, for each video frame:
  * a 4x4 "transformation matrix"  -> which way the head is pointing
  * 52 "blendshape" scores (0 to 1) -> eyes closed? eyes looking sideways?
  * 478 face points                 -> where the eyes are in the picture

FaceBox boils that down to 7 numbers:
  yaw_deg      head turned left/right   (0 = facing camera; sign = side)
  pitch_deg    head tilted              (+ = looking DOWN, - = looking UP)
  roll_deg     head tilted toward a shoulder (not used for alarms)
  eyes_closed  0..1  (1 = fully closed)
  gaze_down    0..1  (eyes looking down)
  gaze_side    0..1  (eyes looking left or right)
  eye_contrast how much detail the eye area has (drops when a hand covers it)

check_distraction() compares those numbers with the limits in config.py
and returns a reason string (like "Looking Down at Phone") or None.
"""
import math
from dataclasses import dataclass

import cv2

from src import config

# Face-mesh point numbers around each eye (from MediaPipe's face mesh map)
LEFT_EYE_POINTS = [33, 133, 159, 145, 160, 144, 158, 153]
RIGHT_EYE_POINTS = [362, 263, 386, 374, 385, 380, 387, 373]


def measure_eye_contrast(frame_bgr, landmarks):
    """
    How much detail is in the eye areas: (brightness spread / brightness).
    Real eyes (dark pupils, lashes) = high. A hand over the eyes = low.
    Dividing by brightness makes it work the same in dim or bright rooms.
    """
    h, w = frame_bgr.shape[:2]
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    values = []
    for points in (LEFT_EYE_POINTS, RIGHT_EYE_POINTS):
        xs = [landmarks[i].x * w for i in points]
        ys = [landmarks[i].y * h for i in points]
        cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
        half = max(max(xs) - min(xs), 8) * 0.75          # box a bit wider than the eye
        y0, y1 = max(int(cy - half * 0.6), 0), int(cy + half * 0.6)
        x0, x1 = max(int(cx - half), 0), int(cx + half)
        patch = gray[y0:y1, x0:x1]
        if patch.size < 20:
            return None
        values.append(float(patch.std()) / (float(patch.mean()) + 1))
    return sum(values) / len(values)


@dataclass
class FaceBox:
    yaw_deg: float
    pitch_deg: float
    roll_deg: float
    eyes_closed: float
    gaze_down: float
    gaze_side: float
    eye_contrast: float = None

    @classmethod
    def from_result(cls, result, frame_bgr=None):
        """Build a FaceBox from a FaceLandmarkerResult. Returns None if no face."""
        if not result.face_landmarks or not result.facial_transformation_matrixes:
            return None

        # --- Head direction from the rotation part of the matrix ---------
        m = result.facial_transformation_matrixes[0]
        # Column 2 = the direction the face is pointing ("nose vector"),
        # in camera space: x = right, y = up, z = toward the camera.
        fx, fy, fz = m[0][2], m[1][2], m[2][2]
        yaw = math.degrees(math.atan2(fx, fz))            # left/right
        pitch = math.degrees(math.atan2(-fy, fz))         # + = down
        roll = math.degrees(math.atan2(m[1][0], m[0][0]))  # shoulder tilt

        # --- Eye scores from blendshapes ---------------------------------
        s = {c.category_name: c.score for c in result.face_blendshapes[0]}
        eyes_closed = (s["eyeBlinkLeft"] + s["eyeBlinkRight"]) / 2
        gaze_down = (s["eyeLookDownLeft"] + s["eyeLookDownRight"]) / 2
        # Looking to one side = one eye looks "out" while the other looks "in"
        gaze_side = max(
            (s["eyeLookOutLeft"] + s["eyeLookInRight"]) / 2,
            (s["eyeLookOutRight"] + s["eyeLookInLeft"]) / 2,
        )

        # --- Eye detail from the actual pixels (hand-over-eyes check) ----
        contrast = None
        if frame_bgr is not None:
            contrast = measure_eye_contrast(frame_bgr, result.face_landmarks[0])

        return cls(yaw, pitch, roll, eyes_closed, gaze_down, gaze_side, contrast)


class Baseline:
    """
    Learns your normal 'looking at the screen' pose during the first few
    seconds: head angles AND how much detail your open eyes show.
    Laptop webcams sit above the screen, so 'looking at the screen' is
    already ~5-15 degrees down. We measure everything from here.
    """

    def __init__(self, frames_needed=60):           # ~2 s at 30 FPS
        self.frames_needed = frames_needed
        self._yaws, self._pitches, self._contrasts = [], [], []
        self.yaw = 0.0
        self.pitch = 0.0
        self.eye_contrast = None

    @property
    def ready(self):
        return len(self._yaws) >= self.frames_needed

    def update(self, face):
        if self.ready or face is None:
            return
        self._yaws.append(face.yaw_deg)
        self._pitches.append(face.pitch_deg)
        if face.eye_contrast is not None:
            self._contrasts.append(face.eye_contrast)
        if self.ready:
            self.yaw = sum(self._yaws) / len(self._yaws)
            self.pitch = sum(self._pitches) / len(self._pitches)
            if self._contrasts:
                self.eye_contrast = sum(self._contrasts) / len(self._contrasts)


def eyes_covered(face, baseline):
    """True if the eye area has lost most of its normal detail."""
    if baseline is None or baseline.eye_contrast is None or face.eye_contrast is None:
        return False
    return face.eye_contrast < baseline.eye_contrast * config.EYES_COVERED_RATIO


def check_distraction(face, baseline=None):
    """
    Return a reason string if this single frame looks distracted, else None.
    (Timing - how LONG you've been distracted - is handled in player_state.py.)
    """
    if face is None:
        return config.REASON_LEFT_DESK

    base_yaw = baseline.yaw if baseline else 0.0
    base_pitch = baseline.pitch if baseline else 0.0
    yaw = face.yaw_deg - base_yaw
    pitch = face.pitch_deg - base_pitch

    # Order matters: the most obvious cause wins.
    if pitch > config.PITCH_DOWN_LIMIT_DEG:
        return config.REASON_LOOKING_DOWN
    if abs(yaw) > config.YAW_LIMIT_DEG:
        return config.REASON_HEAD_TURNED
    if pitch < -config.PITCH_UP_LIMIT_DEG:
        return config.REASON_HEAD_TURNED      # head tipped back / away
    if eyes_covered(face, baseline):
        return config.REASON_EYES_COVERED
    # Eyelids drop when you look down at notes, which looks like "closed".
    # So only count closed eyes when the eyes are NOT looking down.
    if face.eyes_closed > config.EYES_CLOSED_LIMIT and face.gaze_down < config.GAZE_AWAY_LIMIT:
        return config.REASON_EYES_CLOSED
    if face.gaze_side > config.GAZE_AWAY_LIMIT:
        return config.REASON_EYES_AWAY
    # Note: eyes looking DOWN alone is ignored on purpose - that is
    # normal for reading notes or the keyboard.
    return None
