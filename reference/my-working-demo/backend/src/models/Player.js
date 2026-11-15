class Player {
  constructor({ name, phone = '', avatar = 'helmet', socketId = '' }) {
    this.name = name;
    this.phone = phone;
    this.avatar = avatar;
    this.socketId = socketId;
    this.status = 'focused'; // 'focused' | 'warning' | 'damaged'
    this.reason = '';
    this.penalties = 0;
  }

  applyWarning(reason) {
    this.status = 'warning';
    this.reason = reason;
  }

  applyDamage(reason) {
    this.status = 'damaged';
    this.reason = reason;
    this.penalties += 1;
  }

  recover() {
    this.status = 'focused';
    this.reason = '';
  }

  toJSON() {
    return {
      name: this.name,
      phone: this.phone,
      avatar: this.avatar,
      status: this.status,
      reason: this.reason,
      penalties: this.penalties,
    };
  }
}

module.exports = Player;
