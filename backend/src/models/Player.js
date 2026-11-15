class Player {
  constructor({ name, phone = '' }) {
    this.name = name;
    this.phone = phone;
    this.webSocketId = null;   // the player's browser tab
    this.pySocketId = null;    // the player's ML sensor process
    this.status = 'focused';   // 'focused' | 'warning' | 'damaged'
    this.reason = '';
    this.penalties = 0;
    this.facetimePending = false; // Chert FaceTime verification call in progress
    this.focusedSince = Date.now(); // when the sensor last saw them focused again
  }

  applyWarning(reason) {
    this.focusedSince = null;
    this.status = 'warning';
    this.reason = reason;
  }

  applyDamage(reason) {
    this.focusedSince = null;
    this.status = 'damaged';
    this.reason = reason;
    this.penalties += 1;
  }

  recover() {
    if (this.status !== 'focused' || !this.focusedSince) this.focusedSince = Date.now();
    this.status = 'focused';
    this.reason = '';
  }

  toJSON() {
    return {
      name: this.name, // phone stays server-side; it is not broadcast to the room
      status: this.status,
      reason: this.reason,
      penalties: this.penalties,
      sensorOnline: Boolean(this.pySocketId),
      facetimePending: this.facetimePending,
    };
  }
}

module.exports = Player;
