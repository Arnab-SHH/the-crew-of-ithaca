const Player = require('./Player');

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

  getOrCreatePlayer({ name, phone, avatar, socketId }) {
    if (!this.players[name]) {
      this.players[name] = new Player({ name, phone, avatar, socketId });
    } else {
      // Update socketId; preserve existing phone/avatar unless new values provided
      this.players[name].socketId = socketId;
      if (phone) this.players[name].phone = phone;
      if (avatar) this.players[name].avatar = avatar;
    }
    return this.players[name];
  }

  applyWarning({ player, phone, reason }) {
    const p = this.players[player];
    if (!p) return;
    p.applyWarning(reason);
    this.lastEvent = { type: 'warning', player, reason, timestamp: Math.floor(Date.now() / 1000) };
  }

  applyDamage({ player, phone, damage, reason }) {
    const p = this.players[player];
    if (!p) return;
    p.applyDamage(reason);
    this.hullHealth = Math.max(0, this.hullHealth - damage);
    if (this.hullHealth === 0) this.isSunk = true;
    this.lastEvent = { type: 'damage', player, reason, timestamp: Math.floor(Date.now() / 1000) };
  }

  applyRecovery({ player }) {
    const p = this.players[player];
    if (!p) return;
    p.recover();
    this.lastEvent = { type: 'recovery', player, timestamp: Math.floor(Date.now() / 1000) };
  }

  reset() {
    this.hullHealth = this.maxHealth;
    this.isSunk = false;
    this.lastEvent = null;
    this.startTime = Date.now();
    for (const p of Object.values(this.players)) {
      p.recover();
      p.penalties = 0;
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
