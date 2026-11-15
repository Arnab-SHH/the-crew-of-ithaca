import { randomBytes } from 'node:crypto';

const rooms = new Map();
const makeCode = () => randomBytes(3).toString('hex').toUpperCase();
export function createRoom(name, socketId) {
  let code=makeCode(); while (rooms.has(code)) code=makeCode();
  const room={code, started:false, createdAt:Date.now(), endsAt:null, hull:100, warning:null, players:[]};
  rooms.set(code,room); return joinRoom(code,name,socketId);
}
export function joinRoom(code,name,socketId) {
  const room=rooms.get(String(code||'').trim().toUpperCase()); if(!room) throw new Error('Room code not found.');
  const player={id:socketId,name:String(name||'Crewmate').trim().slice(0,24)||'Crewmate',status:'focused',joinedAt:Date.now()};
  room.players=room.players.filter(p=>p.id!==socketId); room.players.push(player); return snapshot(room);
}
export function getRoom(code) { const room=rooms.get(code); return room?snapshot(room):null; }
export function updateFocus(code,socketId,{status='focused',warningId=null,playerName=null}={}) {
  const room=rooms.get(code); if(!room) return null;
  const player=room.players.find(p=>p.id===socketId) || (playerName ? room.players.find(p=>p.name.toLowerCase()===String(playerName).toLowerCase()) : null); if(!player) return null;
  player.status=['focused','warning','distracted'].includes(status)?status:'focused';
  room.warning=player.status==='warning'||player.status==='distracted'?{playerId:player.id,playerName:player.name,status:player.status,warningId,at:Date.now()}:null;
  if(player.status==='distracted') room.hull=Math.max(0,room.hull-10);
  return snapshot(room);
}
export function setVoyage(code,started) { const r=rooms.get(code); if(!r)return null; r.started=!!started; r.endsAt=started?Date.now()+25*60*1000:null; return snapshot(r); }
export function leaveRoom(socketId) { for(const [code,r] of rooms){r.players=r.players.filter(p=>p.id!==socketId); if(!r.players.length) rooms.delete(code); else if(r.warning?.playerId===socketId) r.warning=null;} }
export function resetRoomsForTest(){rooms.clear();}
function snapshot(r){return {code:r.code,started:r.started,endsAt:r.endsAt,hull:r.hull,warning:r.warning,players:r.players.map(p=>({...p}))};}
