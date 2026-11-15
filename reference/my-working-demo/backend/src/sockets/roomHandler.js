const ShipRoom = require('../models/ShipRoom');
const { triggerWarning, triggerDamage } = require('../services/chertService');

// In-memory store: roomCode -> ShipRoom
const rooms = {};

function getOrCreateRoom(roomCode) {
  if (!rooms[roomCode]) {
    rooms[roomCode] = new ShipRoom(roomCode);
  }
  return rooms[roomCode];
}

function broadcastRoomState(io, roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  io.to(roomCode).emit('room_state_update', room.toJSON());
}

function registerRoomHandlers(io, socket) {
  // join_room: { room, player, phone, avatar }
  socket.on('join_room', ({ room, player, phone, avatar }) => {
    socket.join(room);
    const shipRoom = getOrCreateRoom(room);
    shipRoom.getOrCreatePlayer({ name: player, phone, avatar, socketId: socket.id });
    console.log(`[join_room] ${player} joined ${room} (phone: ${phone}, avatar: ${avatar})`);
    broadcastRoomState(io, room);
  });

  // siren_warning: { room, player, phone, reason }
  socket.on('siren_warning', ({ room, player, phone, reason }) => {
    const shipRoom = getOrCreateRoom(room);
    shipRoom.applyWarning({ player, phone, reason });
    console.log(`[siren_warning] ${player} in ${room}: ${reason}`);
    // Chert iMessage warning
    const p = shipRoom.players[player];
    const playerPhone = (p && p.phone) || phone;
    triggerWarning({ phone: playerPhone, playerName: player, reason });
    broadcastRoomState(io, room);
  });

  // take_damage: { room, player, phone, damage, reason }
  socket.on('take_damage', ({ room, player, phone, damage, reason }) => {
    const shipRoom = getOrCreateRoom(room);
    shipRoom.applyDamage({ player, phone, damage, reason });
    console.log(`[take_damage] ${player} in ${room}: -${damage} HP (${reason})`);
    // Chert escalation
    const p = shipRoom.players[player];
    const playerPhone = (p && p.phone) || phone;
    triggerDamage({ phone: playerPhone, playerName: player, reason });
    broadcastRoomState(io, room);
  });

  // player_recovered: { room, player }
  socket.on('player_recovered', ({ room, player }) => {
    const shipRoom = getOrCreateRoom(room);
    shipRoom.applyRecovery({ player });
    console.log(`[player_recovered] ${player} in ${room} is focused again`);
    broadcastRoomState(io, room);
  });

  // reset_voyage: { room }
  socket.on('reset_voyage', ({ room }) => {
    const shipRoom = getOrCreateRoom(room);
    shipRoom.reset();
    console.log(`[reset_voyage] Room ${room} reset`);
    broadcastRoomState(io, room);
  });
}

module.exports = { registerRoomHandlers };
