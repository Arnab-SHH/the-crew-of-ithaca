"""
detector.py - the "eyes" of the program.

Opens the webcam, sends each frame to MediaPipe Face Landmarker, and turns
the result into a FaceBox (see models/face_geometry.py).

Also has draw_debug(), which writes the live numbers on the video frame
so you can see what the program sees.
"""
import os
import time

import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_tasks
from mediapipe.tasks.python import vision

from src import config
from src.models.face_geometry import FaceBox


class Camera:
    """Small wrapper around the webcam."""

    def __init__(self, index=config.CAMERA_INDEX):
        # On Windows, DirectShow (CAP_DSHOW) opens the camera much faster
        backend = cv2.CAP_DSHOW if os.name == "nt" else cv2.CAP_ANY
        self.cap = cv2.VideoCapture(index, backend)
        if not self.cap.isOpened():
            self.cap = cv2.VideoCapture(index)          # try the default way
        if not self.cap.isOpened():
            raise RuntimeError(
                f"Could not open camera {index}. Close other apps using it, "
                "or try CAMERA_INDEX=1 in .env")
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self.cap.set(cv2.CAP_PROP_FPS, config.TARGET_FPS)

    def read(self):
        """Return one frame, mirrored like a selfie camera (or None)."""
        ok, frame = self.cap.read()
        return cv2.flip(frame, 1) if ok else None

    def release(self):
        self.cap.release()


class FaceDetector:
    """Wraps MediaPipe Face Landmarker in VIDEO mode."""

    def __init__(self, model_path=config.MODEL_PATH):
        if not model_path.exists():
            raise FileNotFoundError(f"Model file missing: {model_path}")
        options = vision.FaceLandmarkerOptions(
            base_options=mp_tasks.BaseOptions(model_asset_path=str(model_path)),
            running_mode=vision.RunningMode.VIDEO,
            num_faces=1,
            output_face_blendshapes=True,                 # eye scores
            output_facial_transformation_matrixes=True,   # head angles
        )
        self.landmarker = vision.FaceLandmarker.create_from_options(options)
        self._last_ts = 0
        self.last_result = None

    def process(self, frame_bgr):
        """Run one frame. Returns a FaceBox, or None if no face is found."""
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        # VIDEO mode needs a timestamp (ms) that always goes up
        ts = max(int(time.monotonic() * 1000), self._last_ts + 1)
        self._last_ts = ts
        self.last_result = self.landmarker.detect_for_video(image, ts)
        return FaceBox.from_result(self.last_result, frame_bgr)

    def close(self):
        self.landmarker.close()


# ---------------------------------------------------------------------------
# Drawing helper (used by scripts/live_view.py and later by main.py)
# ---------------------------------------------------------------------------
GREEN, ORANGE, RED, WHITE = (0, 200, 0), (0, 165, 255), (0, 0, 255), (255, 255, 255)


def draw_debug(frame, detector, face, baseline, reason, fps, status_text=None, color=None):
    """Draw face dots and live numbers on the frame (changes it in place)."""
    h, w = frame.shape[:2]

    # Face mesh dots
    result = detector.last_result
    if result is not None and result.face_landmarks:
        for p in result.face_landmarks[0][::4]:          # every 4th dot is enough
            cv2.circle(frame, (int(p.x * w), int(p.y * h)), 1, (255, 200, 0), -1)

    lines = [f"FPS {fps:4.1f}"]
    if face is None:
        lines.append("NO FACE")
    else:
        dy = face.yaw_deg - baseline.yaw
        dp = face.pitch_deg - baseline.pitch
        lines += [
            f"yaw   {dy:+6.1f} deg  (limit +/-{config.YAW_LIMIT_DEG})",
            f"pitch {dp:+6.1f} deg  (down {config.PITCH_DOWN_LIMIT_DEG} / up {config.PITCH_UP_LIMIT_DEG})",
            f"eyes closed {face.eyes_closed:.2f}  (limit {config.EYES_CLOSED_LIMIT})",
            f"gaze side   {face.gaze_side:.2f}  (limit {config.GAZE_AWAY_LIMIT})",
            f"gaze down   {face.gaze_down:.2f}  (info only)",
            
        ]
        if face.eye_contrast is not None and baseline.eye_contrast:
            ratio = face.eye_contrast / baseline.eye_contrast
            lines.append(f"eye detail  {ratio:.2f}  (covered below {config.EYES_COVERED_RATIO})")
    if not baseline.ready:
        lines.append("CALIBRATING... look at your screen")

    # See-through dark box behind the text so it is readable
    box = frame.copy()
    cv2.rectangle(box, (5, 5), (400, 14 + 20 * len(lines)), (0, 0, 0), -1)
    cv2.addWeighted(box, 0.45, frame, 0.55, 0, dst=frame)
    for i, text in enumerate(lines):
        cv2.putText(frame, text, (12, 24 + 20 * i), cv2.FONT_HERSHEY_SIMPLEX, 0.5, WHITE, 1)

    # Status bar at the bottom
    if status_text is None:
        status_text = f"DISTRACTED: {reason}" if reason else "FOCUSED"
    if color is None:
        color = ORANGE if reason else GREEN
    cv2.rectangle(frame, (0, h - 40), (w, h), color, -1)
    cv2.putText(frame, status_text, (12, h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.75, WHITE, 2)
    return frame