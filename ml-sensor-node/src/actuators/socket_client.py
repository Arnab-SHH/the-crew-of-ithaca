"""
Socket.io client: the only way the sensor talks to the world.
Python never calls ElevenLabs or Chert - the Node backend does that.
"""
import socketio

from src.config import DAMAGE_AMOUNT


class SocketClient:
    def __init__(self, server, room, player, phone):
        self.server = server
        self.room = room
        self.player = player
        self.phone = phone
        self.sio = socketio.Client(reconnection=True, reconnection_delay=2)
        self._setup_events()

    def _setup_events(self):
        @self.sio.event
        def connect():
            print(f"[socket] Connected to backend at {self.server}")
            self.join_room()

        @self.sio.event
        def disconnect():
            print("[socket] Disconnected from backend")

        @self.sio.on("join_error")
        def on_join_error(data):
            print(f"[socket] join_error: {data.get('message')}")

        @self.sio.on("room_state_update")
        def on_room_state(data):
            print(f"[room_state] Hull: {data.get('hullHealth', '?')} HP | isSunk: {data.get('isSunk', False)}")

    @property
    def connected(self):
        return self.sio.connected

    def connect(self):
        try:
            self.sio.connect(self.server, transports=["websocket", "polling"])
        except Exception as e:
            print(f"[socket] Connection failed (will keep running): {e}")

    def _emit(self, event, payload):
        if self.sio.connected:
            self.sio.emit(event, payload)

    def join_room(self):
        # Called from the connect handler, where `connected` may not be True yet
        self.sio.emit("join_room", {"room": self.room, "player": self.player,
                                    "phone": self.phone, "source": "python"})

    def emit_warning(self, reason):
        self._emit("siren_warning", {"room": self.room, "player": self.player,
                                     "phone": self.phone, "reason": reason})

    def emit_damage(self, reason):
        self._emit("take_damage", {"room": self.room, "player": self.player, "phone": self.phone,
                                   "damage": DAMAGE_AMOUNT, "reason": reason})

    def emit_recovery(self):
        self._emit("player_recovered", {"room": self.room, "player": self.player})

    def emit_frame(self, image_b64, state, reason):
        self._emit("webcam_frame", {"room": self.room, "player": self.player,
                                    "image": image_b64, "state": state, "reason": reason})

    def disconnect(self):
        if self.sio.connected:
            self.sio.disconnect()
