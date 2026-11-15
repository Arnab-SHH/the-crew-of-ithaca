"""
face_geometry.py - pure math on MediaPipe face data. No I/O.

Two layers, checked in this order:
  1. Verified Face & Iris Mesh ratios (yaw_ratio, pitch_ratio, blink_ratio,
     gaze_ratio) from the 478 landmarks. Works with both MediaPipe engines.
  2. Teammate's posture + eye checks: head angles from the transformation
     matrix, blendshape eye scores, and an "eyes covered" pixel-detail test,
     all measured against a calibrated baseline. Only available with the
     Face Landmarker (Tasks) engine.
"""
import math
from dataclasses import dataclass

import cv2

from src import config
from src.config import (
    NOSE, LEFT_CHEEK, RIGHT_CHEEK, FOREHEAD, CHIN,
    LEFT_EYE_OUTER, LEFT_EYE_INNER, LEFT_EYE_TOP, LEFT_EYE_BOTTOM,
    LEFT_IRIS_CENTER,
    YAW_LOW, YAW_HIGH, PITCH_HIGH, BLINK_LOW, GAZE_LOW, GAZE_HIGH,
)

# ===========================================================================
# 1. Verified landmark ratios
# ===========================================================================

def get_xy(lm, idx, w, h):
    """Return pixel (x, y) for landmark index idx."""
    p = lm[idx]
    return p.x * w, p.y * h


def compute_ratios(landmarks, w: int, h: int) -> dict:
    """Compute yaw, pitch, blink, gaze ratios from raw landmarks."""
    nx, ny = get_xy(landmarks, NOSE, w, h)
    lx, _ = get_xy(landmarks, LEFT_CHEEK, w, h)
    rx, _ = get_xy(landmarks, RIGHT_CHEEK, w, h)
    _, fy = get_xy(landmarks, FOREHEAD, w, h)
    _, cy = get_xy(landmarks, CHIN, w, h)

    face_width = rx - lx if (rx - lx) != 0 else 1
    face_height = cy - fy if (cy - fy) != 0 else 1

    yaw_ratio = (nx - lx) / face_width
    pitch_ratio = (ny - fy) / face_height

    el_x, _ = get_xy(landmarks, LEFT_EYE_OUTER, w, h)
    er_x, _ = get_xy(landmarks, LEFT_EYE_INNER, w, h)
    _, et_y = get_xy(landmarks, LEFT_EYE_TOP, w, h)
    _, eb_y = get_xy(landmarks, LEFT_EYE_BOTTOM, w, h)
    iris_x, _ = get_xy(landmarks, LEFT_IRIS_CENTER, w, h)

    eye_width = abs(er_x - el_x) if abs(er_x - el_x) != 0 else 1
    eye_height = abs(eb_y - et_y)

    blink_ratio = eye_height / eye_width
    gaze_ratio = (iris_x - el_x) / eye_width

    return {"yaw": yaw_ratio, "pitch": pitch_ratio, "blink": blink_ratio, "gaze": gaze_ratio}


def classify_distraction(ratios: dict):
    """Return (is_distracted, reason) from the verified ratios (priority order)."""
    yaw, pitch, blink, gaze = ratios["yaw"], ratios["pitch"], ratios["blink"], ratios["gaze"]

    if yaw < YAW_LOW or yaw > YAW_HIGH:
        return True, config.REASON_HEAD_TURNED
    if pitch > PITCH_HIGH:
        return True, config.REASON_LOOKING_DOWN
    if blink < BLINK_LOW:
        return True, config.REASON_EYES_CLOSED
    if gaze < GAZE_LOW or gaze > GAZE_HIGH:
        return True, config.REASON_EYES_AWAY
    return False, ""


# ===========================================================================
# 2. Teammate's posture / eye logic
# ===========================================================================

LEFT_EYE_POINTS = [33, 133, 159, 145, 160, 144, 158, 153]
RIGHT_EYE_POINTS = [362, 263, 386, 374, 385, 380, 387, 373]


def measure_eye_contrast(frame_bgr, landmarks):
    """
    How much detail is in the eye areas: (brightness spread / brightness).
    Real eyes = high. A hand over the eyes = low. Works in dim or bright rooms.
    """
    h, w = frame_bgr.shape[:2]
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    values = []
    for points in (LEFT_EYE_POINTS, RIGHT_EYE_POINTS):
        xs = [landmarks[i].x * w for i in points]
        ys = [landmarks[i].y * h for i in points]
        cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
        half = max(max(xs) - min(xs), 8) * 0.75
        y0, y1 = max(int(cy - half * 0.6), 0), int(cy + half * 0.6)
        x0, x1 = max(int(cx - half), 0), int(cx + half)
        patch = gray[y0:y1, x0:x1]
        if patch.size < 20:
            return None
        values.append(float(patch.std()) / (float(patch.mean()) + 1))
    return sum(values) / len(values)


@dataclass
class FaceBox:
    """Head angles + eye scores. Angle/blendshape fields are None on the FaceMesh engine."""
    eye_contrast: float = None
    yaw_deg: float = None
    pitch_deg: float = None
    eyes_closed: float = None
    gaze_down: float = None
    gaze_side: float = None

    @classmethod
    def build(cls, landmarks, frame_bgr, matrix=None, blendshapes=None):
        box = cls(eye_contrast=measure_eye_contrast(frame_bgr, landmarks))
        if matrix is not None:
            # Column 2 = direction the face points (x right, y up, z toward camera)
            fx, fy, fz = matrix[0][2], matrix[1][2], matrix[2][2]
            box.yaw_deg = math.degrees(math.atan2(fx, fz))
            box.pitch_deg = math.degrees(math.atan2(-fy, fz))   # + = looking down
        if blendshapes:
            s = {c.category_name: c.score for c in blendshapes}
            box.eyes_closed = (s["eyeBlinkLeft"] + s["eyeBlinkRight"]) / 2
            box.gaze_down = (s["eyeLookDownLeft"] + s["eyeLookDownRight"]) / 2
            box.gaze_side = max(
                (s["eyeLookOutLeft"] + s["eyeLookInRight"]) / 2,
                (s["eyeLookOutRight"] + s["eyeLookInLeft"]) / 2,
            )
        return box


class Baseline:
    """
    Learns your normal 'looking at the screen' pose during the first frames.
    Laptop webcams sit above the screen, so 'looking at the screen' is already
    a few degrees down - posture checks are measured from here.
    """

    def __init__(self, frames_needed=config.BASELINE_FRAMES):
        self.frames_needed = frames_needed
        self._count = 0
        self._yaws, self._pitches, self._contrasts = [], [], []
        self.yaw = 0.0
        self.pitch = 0.0
        self.eye_contrast = None

    @property
    def ready(self):
        return self._count >= self.frames_needed

    def update(self, face):
        if self.ready or face is None:
            return
        self._count += 1
        if face.yaw_deg is not None:
            self._yaws.append(face.yaw_deg)
            self._pitches.append(face.pitch_deg)
        if face.eye_contrast is not None:
            self._contrasts.append(face.eye_contrast)
        if self.ready:
            if self._yaws:
                self.yaw = sum(self._yaws) / len(self._yaws)
                self.pitch = sum(self._pitches) / len(self._pitches)
            if self._contrasts:
                self.eye_contrast = sum(self._contrasts) / len(self._contrasts)


def check_posture(face, baseline):
    """Teammate's checks. Returns a reason string or None. Needs a ready baseline."""
    if face is None or baseline is None or not baseline.ready:
        return None

    if face.pitch_deg is not None:
        yaw = face.yaw_deg - baseline.yaw
        pitch = face.pitch_deg - baseline.pitch
        if pitch > config.PITCH_DOWN_LIMIT_DEG:
            return config.REASON_LOOKING_DOWN
        if abs(yaw) > config.YAW_LIMIT_DEG:
            return config.REASON_HEAD_TURNED
        if pitch < -config.PITCH_UP_LIMIT_DEG:
            return config.REASON_HEAD_TURNED

    if (baseline.eye_contrast and face.eye_contrast is not None
            and face.eye_contrast < baseline.eye_contrast * config.EYES_COVERED_RATIO):
        return config.REASON_EYES_COVERED

    if face.eyes_closed is not None:
        # Eyelids drop when reading notes, so only count closed eyes when NOT looking down
        if face.eyes_closed > config.EYES_CLOSED_LIMIT and face.gaze_down < config.GAZE_AWAY_LIMIT:
            return config.REASON_EYES_CLOSED
        if face.gaze_side > config.GAZE_AWAY_LIMIT:
            return config.REASON_EYES_AWAY
    return None


# ===========================================================================
# Combined per-frame verdict
# ===========================================================================

def check_distraction(landmarks, w, h, face=None, baseline=None):
    """
    One frame -> reason string, or None if focused.
    landmarks=None means no face was found.
    """
    if landmarks is None:
        return config.REASON_LEFT_DESK
    distracted, reason = classify_distraction(compute_ratios(landmarks, w, h))
    if distracted:
        return reason
    return check_posture(face, baseline)
