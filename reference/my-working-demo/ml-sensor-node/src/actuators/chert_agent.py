"""
Chert iMessage & FaceTime agent integration.
Spec reference: https://app.trychert.com/skills.md

Chert provides real Apple identities for AI agents to send iMessages
and trigger FaceTime calls to distracted players via the official Chert Cloud API.
"""

import threading
import uuid
import requests
from src.config import ENABLE_CHERT, CHERT_SECRET, PLAYER_PHONE, PLAYER_NAME

CHERT_API_KEY = CHERT_SECRET

# [PREVIOUS LOCAL MACOS APPLESCRIPT FALLBACK - COMMENTED OUT]
# import subprocess
# def _send_local_mac_imessage(phone: str, player_name: str, message: str):
#     ...
# def _trigger_local_mac_facetime(phone: str, player_name: str):
#     ...


def _send_imessage_threaded(phone: str, player_name: str, message: str):
    if not ENABLE_CHERT or not CHERT_API_KEY:
        print(f"[Chert MOCK iMessage] To: {player_name} ({phone}) -> \"{message}\"")
        return

    try:
        resp = requests.post(
            "https://app.trychert.com/api/v1/shared-messages",
            json={
                "recipient": phone,
                "text": message,
            },
            headers={
                "Authorization": f"Bearer {CHERT_API_KEY}",
                "Idempotency-Key": str(uuid.uuid4()),
                "Content-Type": "application/json",
            },
            timeout=5,
        )
        print(f"[Chert Cloud iMessage] Sent to {player_name}: HTTP {resp.status_code}")
    except Exception as e:
        print(f"[Chert Cloud iMessage Error] {e}")


def _send_call_threaded(phone: str, player_name: str, reason: str):
    if not ENABLE_CHERT or not CHERT_API_KEY:
        print(f"[Chert MOCK FaceTime Call] Dialed {player_name} ({phone})")
        return

    try:
        resp = requests.post(
            "https://app.trychert.com/api/v1/calls",
            json={
                "direction": "outbound",
                "mode": "managed",
                "destination": phone,
                "media": {"audio": True, "video": False},
            },
            headers={
                "Authorization": f"Bearer {CHERT_API_KEY}",
                "Idempotency-Key": str(uuid.uuid4()),
                "Content-Type": "application/json",
            },
            timeout=5,
        )
        print(f"[Chert Cloud FaceTime] Call placed to {player_name}: HTTP {resp.status_code}")
    except Exception as e:
        print(f"[Chert Cloud FaceTime Error] {e}")


def chert_warning(phone: str, player_name: str, reason: str):
    """Non-blocking iMessage warning via Chert Cloud API."""
    message = f"⚠️ Siren Warning! {player_name}, stop {reason}. Your crew needs you focused!"
    threading.Thread(
        target=_send_imessage_threaded,
        args=(phone, player_name, message),
        daemon=True,
    ).start()


def chert_damage(phone: str, player_name: str, reason: str):
    """Non-blocking iMessage + FaceTime call escalation on damage via Chert Cloud API."""
    message = f"🚨 Ship Damage! {player_name} — {reason} caused -10 HP damage!"
    threading.Thread(
        target=_send_imessage_threaded,
        args=(phone, player_name, message),
        daemon=True,
    ).start()
    threading.Thread(
        target=_send_call_threaded,
        args=(phone, player_name, reason),
        daemon=True,
    ).start()
