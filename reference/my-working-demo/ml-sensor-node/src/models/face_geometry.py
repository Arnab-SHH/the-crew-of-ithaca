"""
Pure-math helpers for extracting head-pose and eye ratios from MediaPipe
FaceMesh landmarks.  No I/O, no side-effects.
"""

from src.config import (
    NOSE, LEFT_CHEEK, RIGHT_CHEEK, FOREHEAD, CHIN,
    LEFT_EYE_OUTER, LEFT_EYE_INNER, LEFT_EYE_TOP, LEFT_EYE_BOTTOM,
    LEFT_IRIS_CENTER,
    YAW_LOW, YAW_HIGH, PITCH_HIGH, BLINK_LOW, GAZE_LOW, GAZE_HIGH,
)


def get_xy(lm, idx, w, h):
    """Return pixel (x, y) for landmark index idx."""
    p = lm[idx]
    return p.x * w, p.y * h


def compute_ratios(landmarks, w: int, h: int) -> dict:
    """
    Compute yaw_ratio, pitch_ratio, blink_ratio, gaze_ratio from raw landmarks.
    Returns a dict with keys: yaw, pitch, blink, gaze.
    """
    nx, ny = get_xy(landmarks, NOSE, w, h)
    lx, _  = get_xy(landmarks, LEFT_CHEEK, w, h)
    rx, _  = get_xy(landmarks, RIGHT_CHEEK, w, h)
    _, fy  = get_xy(landmarks, FOREHEAD, w, h)
    _, cy  = get_xy(landmarks, CHIN, w, h)

    face_width  = rx - lx if (rx - lx) != 0 else 1
    face_height = cy - fy if (cy - fy) != 0 else 1

    yaw_ratio   = (nx - lx) / face_width
    pitch_ratio = (ny - fy) / face_height

    # Eye metrics
    el_x, el_y   = get_xy(landmarks, LEFT_EYE_OUTER, w, h)
    er_x, _      = get_xy(landmarks, LEFT_EYE_INNER, w, h)
    _, et_y      = get_xy(landmarks, LEFT_EYE_TOP, w, h)
    _, eb_y      = get_xy(landmarks, LEFT_EYE_BOTTOM, w, h)
    iris_x, _    = get_xy(landmarks, LEFT_IRIS_CENTER, w, h)

    eye_width  = abs(er_x - el_x) if abs(er_x - el_x) != 0 else 1
    eye_height = abs(eb_y - et_y)

    blink_ratio = eye_height / eye_width
    gaze_ratio  = (iris_x - el_x) / eye_width

    return {
        "yaw":   yaw_ratio,
        "pitch": pitch_ratio,
        "blink": blink_ratio,
        "gaze":  gaze_ratio,
    }


def classify_distraction(ratios: dict):
    """
    Given computed ratios, return (is_distracted: bool, reason: str).
    Returns the first triggered distraction reason (priority order).
    """
    yaw   = ratios["yaw"]
    pitch = ratios["pitch"]
    blink = ratios["blink"]
    gaze  = ratios["gaze"]

    if yaw < YAW_LOW or yaw > YAW_HIGH:
        return True, "Head Turned Sideways"
    if pitch > PITCH_HIGH:
        return True, "Looking Down at Phone"
    if blink < BLINK_LOW:
        return True, "Eyes Closed or Peeking Down"
    if gaze < GAZE_LOW or gaze > GAZE_HIGH:
        return True, "Eyes Darting Away"
    return False, ""
