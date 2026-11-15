const Player = require('./Player');

const now = () => Math.floor(Date.now() / 1000);

class ShipRoom {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.maxHealth = 100;
    this.hullHealth = 100;
    this.isSunk = false;
    this.players = {}; // name -> Player
    this.lastEvent = null;
    this.startTime = Date.now();
  }

  getOrCreatePlayer({ name, phone }) {
    if (!this.players[name]) {
      this.players[name] = new Player({ name, phone });
    } else if (phone) {
      this.players[name].phone = phone;
    }
    return this.players[name];
  }

  removePlayer(name) {
    delete this.players[name];
  }

  isEmpty() {
    return Object.keys(this.players).length === 0;
  }

  applyWarning({ player, reason }) {
    const p = this.players[player];
    if (!p) return false;
    p.applyWarning(reason);
    this.lastEvent = { type: 'warning', player, reason, timestamp: now() };
    return true;
  }

  applyDamage({ player, damage, reason }) {
    const p = this.players[player];
    if (!p) return false;
    p.applyDamage(reason);
    this.hullHealth = Math.max(0, this.hullHealth - (Number(damage) || 10));
    if (this.hullHealth === 0) this.isSunk = true;
    this.lastEvent = { type: 'damage', player, reason, timestamp: now() };
    return true;
  }

  applyRecovery({ player }) {
    const p = this.players[player];
    if (!p) return false;
    p.recover();
    this.lastEvent = { type: 'recovery', player, timestamp: now() };
    return true;
  }

  // Chert FaceTime: Captain Odysseus saw the student's notebook -> +10 HP
  applyFaceTimeVerified({ player }) {
    const p = this.players[player];
    if (!p) return false;
    this.hullHealth = Math.min(this.maxHealth, this.hullHealth + 10);
    if (this.hullHealth > 0) this.isSunk = false;
    p.status = 'focused';
    p.reason = 'FaceTime Verified: Studying Notebook! (+10 HP)';
    p.facetimePending = false;
    this.lastEvent = {
      type: 'healed',
      player,
      reason: 'FaceTime Camera Verified Study Notes (+10 HP)',
      timestamp: now(),
    };
    return true;
  }

  reset() {
    this.hullHealth = this.maxHealth;
    this.isSunk = false;
    this.lastEvent = null;
    this.startTime = Date.now();
    for (const p of Object.values(this.players)) {
      p.recover();
      p.penalties = 0;
      p.facetimePending = false;
    }
  }

  toJSON() {
    const players = {};
    for (const [name, p] of Object.entries(this.players)) {
      players[name] = p.toJSON();
    }
    return {
      roomCode: this.roomCode,
      hullHealth: this.hullHealth,
      maxHealth: this.maxHealth,
      isSunk: this.isSunk,
      lastEvent: this.lastEvent,
      players,
    };
  }
}

module.exports = ShipRoom;
