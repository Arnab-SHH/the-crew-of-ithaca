import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import cors from 'cors';
import { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import {createRoom,joinRoom,getRoom,updateFocus,setVoyage,leaveRoom} from './rooms.js';

const app=express(); app.use(cors({origin:process.env.CLIENT_ORIGIN||'http://localhost:5173'})); app.use(express.json({limit:'32kb'}));
const server=http.createServer(app); const io=new Server(server,{cors:{origin:process.env.CLIENT_ORIGIN||'http://localhost:5173'}});
app.get('/health',(_req,res)=>res.json({ok:true,service:'crew-of-ithaca'}));
app.post('/api/voice',async(req,res)=>{
  const {text}=req.body||{}; if(typeof text!=='string'||!text.trim()) return res.status(400).json({error:'text is required'});
  if(!process.env.ELEVENLABS_API_KEY) return res.status(204).end();
  try {const response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID||''}`,{method:'POST',headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY,'Content-Type':'application/json','Accept':'audio/mpeg'},body:JSON.stringify({text:text.slice(0,400),model_id:'eleven_flash_v2_5'})}); if(!response.ok) throw new Error(`ElevenLabs returned ${response.status}`); res.set('Content-Type','audio/mpeg'); res.send(Buffer.from(await response.arrayBuffer()));} catch(e){console.error('voice adapter:',e.message);res.status(502).json({error:'Voice provider unavailable'});}
});
// Deliberate opt-in only. The browser UI never calls this endpoint unless the player enables Chert alerts.
app.post('/api/chert/alert',async(req,res)=>{
  const secret=process.env.CHERT_WEBHOOK_SECRET;
  const {roomCode,playerName,phone,consented}=req.body||{}; if(consented!==true)return res.status(400).json({error:'explicit consent required'});
  if(typeof phone!=='string'||!/^\+[1-9]\d{7,14}$/.test(phone))return res.status(400).json({error:'valid E.164 phone required'});
  const text=`Your study crew is checking in. Ready to return to the voyage, ${String(playerName||'Crewmate').slice(0,24)}?`;
  try {
    let r;
    if(process.env.CHERT_API_KEY&&process.env.CHERT_PROJECT_ID&&process.env.CHERT_LINE_ID) {
      r=await fetch('https://app.trychert.com/api/v1/shared-messages',{method:'POST',headers:{Authorization:`Bearer ${process.env.CHERT_API_KEY}`,'X-Chert-Project-Id':process.env.CHERT_PROJECT_ID,'Idempotency-Key':randomUUID(),'Content-Type':'application/json'},body:JSON.stringify({line_id:process.env.CHERT_LINE_ID,recipient:phone,text})});
    } else if(process.env.CHERT_WEBHOOK_URL) {
      r=await fetch(process.env.CHERT_WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json',...(secret?{'Authorization':`Bearer ${secret}`}:{})},body:JSON.stringify({event:'focus_warning',roomCode:String(roomCode||'').slice(0,12),playerName:String(playerName||'Crewmate').slice(0,24),phone,message:text})});
    } else return res.status(503).json({error:'Chert is not configured'});
    if(!r.ok)throw new Error(`provider returned ${r.status}`);res.json({ok:true});
  } catch(e){console.error('Chert adapter:',e.message);res.status(502).json({error:'Chert delivery unavailable'});}
});
// FaceTime is a separate, explicit opt-in from text alerts. It requires a
// published managed assistant and only calls the participant's verified phone.
app.post('/api/chert/call',async(req,res)=>{
  const {phone,consented}=req.body||{};
  if(consented!==true)return res.status(400).json({error:'explicit FaceTime consent required'});
  if(typeof phone!=='string'||!/^\+[1-9]\d{7,14}$/.test(phone))return res.status(400).json({error:'valid E.164 phone required'});
  const {CHERT_API_KEY,CHERT_PROJECT_ID,CHERT_LINE_ID,CHERT_ASSISTANT_ID}=process.env;
  if(!CHERT_API_KEY||!CHERT_PROJECT_ID||!CHERT_LINE_ID||!CHERT_ASSISTANT_ID)return res.status(503).json({error:'Chert FaceTime assistant is not configured'});
  try {
    const r=await fetch('https://app.trychert.com/api/v1/calls',{method:'POST',headers:{Authorization:`Bearer ${CHERT_API_KEY}`,'X-Chert-Project-Id':CHERT_PROJECT_ID,'Idempotency-Key':randomUUID(),'Content-Type':'application/json'},body:JSON.stringify({direction:'outbound',mode:'managed',line_id:CHERT_LINE_ID,destination:phone,media:{audio:true,video:true},assistant_id:CHERT_ASSISTANT_ID})});
    if(!r.ok)throw new Error(`Chert returned ${r.status}`);res.json({ok:true,call:await r.json()});
  } catch(e){console.error('Chert call adapter:',e.message);res.status(502).json({error:'Chert FaceTime call could not be started'});}
});
io.on('connection',socket=>{
  socket.on('create_room',(payload,ack=()=>{})=>{try{const state=createRoom(payload?.name,socket.id);socket.join(state.code);ack({ok:true,state});io.to(state.code).emit('room_state',state);}catch(e){ack({ok:false,error:e.message});}});
  socket.on('join_room',(payload,ack=()=>{})=>{try{const state=joinRoom(payload?.code,payload?.name,socket.id);socket.join(state.code);ack({ok:true,state});io.to(state.code).emit('room_state',state);}catch(e){ack({ok:false,error:e.message});}});
  socket.on('sensor_join',({code}={},ack=()=>{})=>{const state=getRoom(String(code||'').toUpperCase());if(!state){ack({ok:false,error:'Room not found.'});return;}socket.join(state.code);ack({ok:true});});
  socket.on('get_room',(code,ack=()=>{})=>{const state=getRoom(String(code||'').toUpperCase());ack(state?{ok:true,state}:{ok:false,error:'Room not found.'});});
  socket.on('focus_event',({code,status,warningId,playerName}={})=>{const state=updateFocus(String(code||'').toUpperCase(),socket.id,{status,warningId,playerName});if(state)io.to(state.code).emit('room_state',state);});
  socket.on('voyage_toggle',({code,started}={})=>{const state=setVoyage(String(code||'').toUpperCase(),started);if(state)io.to(state.code).emit('room_state',state);});
  socket.on('disconnect',()=>leaveRoom(socket.id));
});
const port=Number(process.env.PORT||4000); server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Ithaca backend listening on http://localhost:${port}`));
