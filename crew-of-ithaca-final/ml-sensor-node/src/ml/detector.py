"""
detector.py - the "eyes". Webcam -> MediaPipe -> verdict -> debounced events.

Engines (picked automatically):
  * Face Landmarker (Tasks API, teammate) - works on every current mediapipe
    release, gives 478 landmarks + head-pose matrix + eye blendshapes.
    The model file is downloaded once into ml-sensor-node/assets/.
  * Face Mesh (legacy mp.solutions) - fallback for old mediapipe installs
    when the model file can't be fetched. Gives 478 landmarks only.

Both feed the same verified ratio checks; the Tasks engine also enables the
teammate's posture / eye checks.
"""
import os
import time
import urllib.request

import cv2
import mediapipe as mp

from src import config
from src.models.face_geometry import FaceBox, Baseline, check_distraction
from src.models.player_state import PlayerState


class Camera:
    """Webcam wrapper (teammate): fast open on Windows, mirrored selfie view."""

    def __init__(self, index=config.CAMERA_INDEX):
        backend = cv2.CAP_DSHOW if os.name == "nt" else cv2.CAP_ANY
        self.cap = cv2.VideoCapture(index, backend)
        if not self.cap.isOpened():
            self.cap = cv2.VideoCapture(index)
        if not self.cap.isOpened():
            raise RuntimeError(
                f"Could not open camera {index}. Close other apps using it "
                "(including a browser tab), or set CAMERA_INDEX=1 in .env")
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    def read(self):
        ok, frame = self.cap.read()
        return cv2.flip(frame, 1) if ok else None

    def release(self):
        self.cap.release()


def _ensure_model():
    """Download the Face Landmarker model once. Returns True if it is on disk."""
    if config.MODEL_PATH.exists():
        return True
    try:
        config.MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        print(f"[detector] Downloading face model to {config.MODEL_PATH} ...")
        tmp = config.MODEL_PATH.with_suffix(".part")
        urllib.request.urlretrieve(config.MODEL_URL, tmp)
        tmp.replace(config.MODEL_PATH)
        return True
    except Exception as e:
        print(f"[detector] Could not download face model: {e}")
        return False


class _TasksEngine:
    """Face Landmarker in VIDEO mode."""
    name = "face_landmarker"

    def __init__(self):
        from mediapipe.tasks import python as mp_tasks
        from mediapipe.tasks.python import vision
        options = vision.FaceLandmarkerOptions(
            base_options=mp_tasks.BaseOptions(model_asset_path=str(config.MODEL_PATH)),
            running_mode=vision.RunningMode.VIDEO,
            num_faces=1,
            output_face_blendshapes=True,
            output_facial_transformation_matrixes=True,
        )
        self.landmarker = vision.FaceLandmarker.create_from_options(options)
        self._last_ts = 0

    def process(self, rgb):
        """Returns (landmarks, matrix, blendshapes) or (None, None, None)."""
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        ts = max(int(time.monotonic() * 1000), self._last_ts + 1)   # must always go up
        self._last_ts = ts
        r = self.landmarker.detect_for_video(image, ts)
        if not r.face_landmarks:
            return None, None, None
        matrix = r.facial_transformation_matrixes[0] if r.facial_transformation_matrixes else None
        shapes = r.face_blendshapes[0] if r.face_blendshapes else None
        return r.face_landmarks[0], matrix, shapes

    def close(self):
        self.landmarker.close()


class _FaceMeshEngine:
    """Legacy Face & Iris Mesh (refine_landmarks adds iris points 468-477)."""
    name = "face_mesh"

    def __init__(self):
        self.mesh = mp.solutions.face_mesh.FaceMesh(
            max_num_faces=1, refine_landmarks=True,
            min_detection_confidence=0.5, min_tracking_confidence=0.5)

    def process(self, rgb):
        r = self.mesh.process(rgb)
        if not r.multi_face_landmarks:
            return None, None, None
        return r.multi_face_landmarks[0].landmark, None, None

    def close(self):
        self.mesh.close()


def _make_engine():
    if _ensure_model():
        return _TasksEngine()
    if hasattr(mp, "solutions"):
        print("[detector] Falling back to legacy Face Mesh engine.")
        return _FaceMeshEngine()
    raise RuntimeError(
        "No face model available. Download face_landmarker.task manually from\n"
        f"  {config.MODEL_URL}\ninto {config.MODEL_PATH}")


GREEN, ORANGE, RED, WHITE = (0, 200, 0), (0, 165, 255), (0, 0, 255), (255, 255, 255)


class FocusDetector:
    def __init__(self, camera_index=config.CAMERA_INDEX):
        self.camera = Camera(camera_index)
        self.engine = _make_engine()
        self.baseline = Baseline()
        self.state = PlayerState()
        print(f"[detector] Engine: {self.engine.name}")

    def release(self):
        self.camera.release()
        self.engine.close()

    def process_frame(self):
        """
        Read one frame, run inference, update the timers.
        Returns {"events": [Event], "reason": str|None, "status": str, "frame": ndarray|None}
        """
        frame = self.camera.read()
        if frame is None:
            return {"events": [], "reason": None, "status": self.state.status, "frame": None}

        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        landmarks, matrix, shapes = self.engine.process(rgb)

        face = FaceBox.build(landmarks, frame, matrix, shapes) if landmarks is not None else None
        reason = check_distraction(landmarks, w, h, face, self.baseline)
        if reason is None:
            self.baseline.update(face)          # only learn from focused frames

        events = self.state.update(reason)
        self._draw(frame, landmarks, reason)
        return {"events": events, "reason": reason, "status": self.state.status, "frame": frame}

    def _draw(self, frame, landmarks, reason):
        """Face dots + status bar + damage countdown (shown in the browser PIP)."""
        h, w = frame.shape[:2]
        if landmarks is not None:
            for p in list(landmarks)[::6]:
                cv2.circle(frame, (int(p.x * w), int(p.y * h)), 1, (255, 200, 0), -1)

        if not self.baseline.ready and landmarks is not None:
            cv2.putText(frame, "CALIBRATING - look at your screen", (12, 28),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, WHITE, 2)

        progress = self.state.progress()
        color = GREEN if reason is None else (RED if self.state.status == "damaged" else ORANGE)
        text = "FOCUSED" if reason is None else f"DISTRACTED: {reason}"
        cv2.rectangle(frame, (0, h - 36), (w, h), color, -1)
        if progress > 0:
            cv2.rectangle(frame, (0, h - 6), (int(progress * w), h), WHITE, -1)
        cv2.putText(frame, text, (12, h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.7, WHITE, 2)
