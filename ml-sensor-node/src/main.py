"""
The Crew of Ithaca - ML Sensor Node
Webcam -> MediaPipe focus detection -> Socket.io events to the Node backend.

Usage (the backend auto-launches this when you join from the browser):
    python src/main.py --player Arnab --room ITHACA_1 --phone +18175550199 \
        --server http://localhost:4000 --headless

Without --headless an OpenCV debug window opens (press 'q' to quit).
"""
import argparse
import base64
import os
import signal
import sys
import time

import cv2

# Make `src.` imports work no matter where this is launched from
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src import config
from src.ml.detector import FocusDetector
from src.actuators.socket_client import SocketClient


def parse_args():
    p = argparse.ArgumentParser(description="Crew of Ithaca ML Sensor Node")
    p.add_argument("--player", default=config.PLAYER_NAME, help="Player name")
    p.add_argument("--room", default=config.ROOM_CODE, help="Room code")
    p.add_argument("--phone", default=config.PLAYER_PHONE, help="Player phone (E.164)")
    p.add_argument("--server", default=config.BACKEND_URL, help="Backend URL")
    p.add_argument("--camera", type=int, default=config.CAMERA_INDEX, help="Camera index")
    p.add_argument("--headless", action="store_true", help="No OpenCV window; stream frames to the UI")
    return p.parse_args()


def encode_frame(frame):
    """Shrink + JPEG + base64 for the browser PIP."""
    h, w = frame.shape[:2]
    scale = config.STREAM_WIDTH / w
    small = cv2.resize(frame, (config.STREAM_WIDTH, int(h * scale)))
    ok, buf = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, config.STREAM_JPEG_QUALITY])
    return base64.b64encode(buf).decode("ascii") if ok else None


def main():
    args = parse_args()
    room = args.room.strip().upper()
    print("\n🚢 Crew of Ithaca — ML Sensor Node")
    print(f"   Player : {args.player}")
    print(f"   Room   : {room}")
    print(f"   Backend: {args.server}")
    print(f"   Mode   : {'headless (streaming to UI)' if args.headless else 'debug window'}\n")

    # The backend stops us with SIGTERM; turn it into a clean shutdown
    def _stop(*_):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, _stop)

    client = SocketClient(args.server, room, args.player, args.phone)
    client.connect()

    try:
        detector = FocusDetector(args.camera)
    except Exception as e:
        print(f"[main] {e}")
        client.disconnect()
        sys.exit(1)

    frame_interval = 1.0 / config.STREAM_FPS
    last_sent = 0.0
    print("[main] Camera loop started.\n")

    try:
        while True:
            out = detector.process_frame()
            frame = out["frame"]
            if frame is None:
                time.sleep(0.05)
                continue

            for ev in out["events"]:
                if ev.name == "siren_warning":
                    print(f"[WARN] {args.player}: {ev.reason}")
                    client.emit_warning(ev.reason)
                elif ev.name == "take_damage":
                    print(f"[DMG]  {args.player}: {ev.reason}")
                    client.emit_damage(ev.reason)
                elif ev.name == "player_recovered":
                    print(f"[OK]   {args.player} refocused")
                    client.emit_recovery()

            now = time.monotonic()
            if now - last_sent >= frame_interval:
                last_sent = now
                image = encode_frame(frame)
                if image:
                    focused = out["reason"] is None
                    client.emit_frame(image, "focused" if focused else "distracted",
                                      "Nominal" if focused else out["reason"])

            if not args.headless:
                cv2.imshow("Crew of Ithaca — Focus Sensor", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
    except KeyboardInterrupt:
        print("\n[main] Stopping")
    finally:
        detector.release()
        if not args.headless:
            cv2.destroyAllWindows()
        client.disconnect()
        print("[main] Sensor node stopped.")


if __name__ == "__main__":
    main()
