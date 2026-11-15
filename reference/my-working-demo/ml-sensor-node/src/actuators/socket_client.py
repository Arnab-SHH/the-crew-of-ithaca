"""
Socket.io client wrapper for communicating with the backend.
"""

import socketio
import threading

from src.config import BACKEND_URL, PLAYER_NAME, ROOM_CODE, PLAYER_PHONE, DAMAGE_AMOUNT


class SocketClient:
    def __init__(self):
        self.sio = socketio.Client(reconnection=True, reconnection_delay=2)
        self._connected = False
        self._setup_events()

    def _setup_events(self):
        @self.sio.event
        def connect():
            self._connected = True
            print(f"[socket] Connected to backend at {BACKEND_URL}")
            self.join_room()

        @self.sio.event
        def disconnect():
            self._connected = False
            print("[socket] Disconnected from backend")

        @self.sio.on('room_state_update')
        def on_room_state(data):
            hull = data.get('hullHealth', '?')
            print(f"[room_state] Hull: {hull} HP | isSunk: {data.get('isSunk', False)}")

    def connect(self):
        try:
            self.sio.connect(BACKEND_URL, transports=['websocket', 'polling'])
        except Exception as e:
            print(f"[socket] Connection failed: {e}")

    def join_room(self):
        self.sio.emit('join_room', {
            'room': ROOM_CODE,
            'player': PLAYER_NAME,
            'phone': PLAYER_PHONE,
            'avatar': 'helmet',
        })

    def emit_warning(self, reason: str):
        self.sio.emit('siren_warning', {
            'room': ROOM_CODE,
            'player': PLAYER_NAME,
            'phone': PLAYER_PHONE,
            'reason': reason,
        })

    def emit_damage(self, reason: str):
        self.sio.emit('take_damage', {
            'room': ROOM_CODE,
            'player': PLAYER_NAME,
            'phone': PLAYER_PHONE,
            'damage': DAMAGE_AMOUNT,
            'reason': reason,
        })

    def emit_recovery(self):
        self.sio.emit('player_recovered', {
            'room': ROOM_CODE,
            'player': PLAYER_NAME,
        })

    def disconnect(self):
        if self._connected:
            self.sio.disconnect()
