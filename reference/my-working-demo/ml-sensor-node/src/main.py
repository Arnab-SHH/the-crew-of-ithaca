"""
The Crew of Ithaca — ML Sensor Node
Entry point: connects to backend, opens webcam, runs focus detection loop.

Usage:
    python src/main.py [--player NAME] [--room ROOM] [--phone PHONE]
"""

import argparse
import sys
import time
import cv2

# Patch sys.path so sub-imports work when running from ml-sensor-node/
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.config import PLAYER_NAME, ROOM_CODE, PLAYER_PHONE, BACKEND_URL
from src.ml.detector import FocusDetector
from src.actuators.socket_client import SocketClient
from src.actuators.elevenlabs_voice import speak_warning, speak_damage
from src.actuators.chert_agent import chert_warning, chert_damage


def parse_args():
    parser = argparse.ArgumentParser(description="Crew of Ithaca ML Sensor Node")
    parser.add_argument("--player", default=PLAYER_NAME, help="Player nickname")
    parser.add_argument("--room",   default=ROOM_CODE,   help="Room code")
    parser.add_argument("--phone",  default=PLAYER_PHONE, help="Player phone for Chert/ElevenLabs")
    return parser.parse_args()


def main():
    args = parse_args()
    player = args.player
    room   = args.room
    phone  = args.phone

    print(f"\n🚢 Crew of Ithaca — ML Sensor Node")
    print(f"   Player : {player}")
    print(f"   Room   : {room}")
    print(f"   Backend: {BACKEND_URL}\n")

    # Connect to backend
    client = SocketClient()
    client.connect()
    time.sleep(1)  # allow connection handshake

    # Start focus detector
    detector = FocusDetector()

    print("[main] Camera loop started. Press 'q' in the OpenCV window to quit.\n")

    try:
        while True:
            signals = detector.process_frame()
            frame = signals.get("frame")

            if frame is not None:
                cv2.imshow("Crew of Ithaca — Focus Sensor", frame)

            if signals["fire_warning"]:
                reason = signals["reason"]
                print(f"[WARN] {player}: {reason}")
                client.emit_warning(reason)
                speak_warning(player, reason)
                chert_warning(phone, player, reason)

            if signals["fire_damage"]:
                reason = signals["reason"]
                print(f"[DMG]  {player}: {reason}")
                client.emit_damage(reason)
                speak_damage(player, reason)
                chert_damage(phone, player, reason)

            if signals["fire_recovery"]:
                print(f"[OK]   {player} refocused")
                client.emit_recovery()

            # 'q' to quit
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    except KeyboardInterrupt:
        print("\n[main] Interrupted by user")
    finally:
        detector.release()
        client.disconnect()
        print("[main] Sensor node stopped.")


if __name__ == "__main__":
    main()
