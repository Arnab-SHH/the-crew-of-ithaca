import { fileURLToPath } from 'node:url';
import { AutoSubscribe, defineAgent, voice } from '@livekit/agents';
import { realtime } from '@livekit/agents-plugin-openai';
import * as google from '@livekit/agents-plugin-google';
import { LocalVideoTrack, TrackSource, VideoBufferType, VideoFrame, VideoSource } from '@livekit/rtc-node';
import { drawFace, FPS, HEIGHT, WIDTH } from './face.mjs';
import { runAgent } from './chert-rooms.mjs';
import { greetOnBridgeReady } from './greet.mjs';
import { writeFile } from 'node:fs/promises';
import { checkNotes, checkTrueFact, focusState, tellGame } from './game.mjs';
import { watchCallerCamera } from './camera.mjs';

// Captain Odysseus, for The Crew of Ithaca study game.
// No tools: Gemini Live drops the call when it moves into a tool call. The code below does the checks
// (the phone camera and a spoken fact with separate Gemini requests, the desk with the webcam sensor)
// and tells the Captain what to say.
const instructions = `You are Captain Odysseus, the AI captain of the ship in "The Crew of Ithaca", a co-op study game.
A student (a "sailor") is on a FaceTime call with you because the Sirens distracted them and the ship's hull was damaged.
Your job: get them back to studying.
- First ask them to hold their notebook or study notes up to the phone camera (the back camera works best).
- You cannot see the camera yourself. The ship's lookout will tell you what the camera shows. Never say you can see
  the notes, or that they are not there, until the lookout tells you. While you wait, keep any reply very short.
- Only if you asked them to tell you something true: when what they say is true, say "True!" and tell them to put the
  phone down and look at their laptop screen. When it is false, say so in a few words and ask again.
- Never say the hull is repaired yourself: the ship's log will tell you when it is.
- After the hull is repaired, stay on the call and chat kindly if they want to talk.
Speak like a warm but commanding sea captain from Homer's Odyssey. Keep replies to one or two short sentences,
unless you are told to say more. Be clear that you are an AI if asked.`;
// Said once, as soon as FaceTime is ready. Keep it short: it is the first thing the caller hears.
const greeting = 'Greet the caller in one short sentence as Captain Odysseus, and ask them to hold their study notes up to the phone camera.';

const agent = defineAgent({
  entry: async ctx => {
    // Audio and video: the Captain listens, and checks the caller's phone camera for study notes.
    await ctx.connect(undefined, AutoSubscribe.SUBSCRIBE_ALL);
    // Chert prepares a room before a caller exists. Join promptly so Chert can
    // find us, but wait before opening a paid model session or sending video.
    // When the game backend placed this call, it says who we're calling (dispatch metadata).
    let call = {};
    try { call = JSON.parse(ctx.job?.metadata || '{}'); } catch { /* incoming call: no metadata */ }
    const sailor = call.outbound ? call.player : null;
    const callInstructions = sailor
      ? `${instructions}\nYou are calling the sailor ${sailor}: the Sirens distracted them and the hull took damage. `
        + 'You already know their name, so do not ask for it.'
      : instructions;
    const callGreeting = sailor
      ? `Greet ${sailor} by name as Captain Odysseus: in one short sentence say the Sirens damaged the hull, then ask them to hold their study notes up to the phone camera.`
      : greeting;

    const caller = await ctx.waitForParticipant();
    const camera = watchCallerCamera(ctx.room, caller.identity);
    ctx.addShutdownCallback(async () => camera.stop());
    // Tell the game a check-in call started, so the sailor isn't damaged for looking at their phone.
    void tellGame('/api/chert-call', { status: 'started', room: call.room, player: sailor });
    ctx.addShutdownCallback(async () => {
      await tellGame('/api/chert-call', { status: 'ended', room: call.room, player: sailor });
    });

    // Video: one camera track, published by this agent. The Mac shows video only
    // from the participant that speaks, so the picture and the voice stay together.
    const source = new VideoSource(WIDTH, HEIGHT);
    const track = LocalVideoTrack.createVideoTrack('agent-video', source);
    let tick = 0, speaking = false;
    const frame = () => source.captureFrame(new VideoFrame(drawFace(tick++, speaking), WIDTH, HEIGHT, VideoBufferType.RGBA));
    frame();
    await ctx.room.localParticipant.publishTrack(track, { source: TrackSource.SOURCE_CAMERA });
    const timer = setInterval(frame, 1000 / FPS);

    // Gemini (free tier) when GOOGLE_API_KEY is set, otherwise OpenAI Realtime.
    const model = process.env.GOOGLE_API_KEY
      ? new google.realtime.RealtimeModel({ voice: 'Charon', ...(process.env.GEMINI_LIVE_MODEL ? { model: process.env.GEMINI_LIVE_MODEL } : {}) })
      : new realtime.RealtimeModel({ model: 'gpt-realtime', voice: 'marin' });
    const session = new voice.AgentSession({ llm: model });
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, event => { speaking = event.newState === 'speaking'; });
    ctx.addShutdownCallback(async () => {
      clearInterval(timer);
      await session.close();
      await track.close();
      await source.close();
    });
    await session.start({
      room: ctx.room,
      agent: new voice.Agent({ instructions: callInstructions }),
      record: false,
      inputOptions: {
        participantIdentity: caller.identity,
        audioEnabled: true,
        videoEnabled: false,
        textEnabled: false,
        closeOnDisconnect: true,
        deleteRoomOnClose: false,
      },
      outputOptions: { audioEnabled: true, transcriptionEnabled: false },
    });
    // Greet once when chert dev reports that FaceTime is ready (bridge_ready in the
    // room metadata): the Mac ends the call if it hears nothing within 10 seconds
    // of that. Participant arrival alone is not readiness, so there is no greeting
    // on it. Without the signal there is no greeting, and the caller speaks first.
    const stopGreeting = greetOnBridgeReady(ctx.room, () => {
      session.generateReply({ instructions: callGreeting });
      setTimeout(() => void watchNotes(), 4000); // start looking once the greeting has asked for the notes
    });
    ctx.addShutdownCallback(async () => stopGreeting());
    setTimeout(() => void watchNotes(), 20000); // in case the ready signal never comes

    // The check-in:
    // 1. notes: the phone camera shows study notes (checked every 4 s by a Gemini vision request).
    //    Backup after about 35 s: the sailor says something true (a Gemini text request).
    // 2. desk: the webcam sensor sees them focused on the laptop for 3 s, counted after step 1.
    // 3. done: +10 HP; the Captain praises them, encourages them, and stays on the call.
    let step = 'notes', closed = false, notesStarted = false;
    ctx.addShutdownCallback(async () => { closed = true; });
    const say = (text) => { try { session.generateReply({ instructions: text }); } catch { /* the call ended */ } };
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));

    async function watchNotes() {
      if (step !== 'notes' || notesStarted) return;
      notesStarted = true;
      const end = Date.now() + 35000;
      let tries = 0;
      while (!closed && step === 'notes' && Date.now() < end) {
        const photo = camera.snapshot();
        if (photo) {
          tries++;
          // Saved so you can see exactly what the Captain checked
          await writeFile(new URL('./last-check.png', import.meta.url), Buffer.from(photo.split(',')[1], 'base64')).catch(() => {});
          const seen = await checkNotes(photo);
          if (seen) console.log(`[captain] camera check ${tries}: ${seen.item} (notes: ${seen.verified}) - see captain-agent/last-check.png`);
          if (seen?.verified && step === 'notes') {
            step = 'desk';
            say(`The ship's lookout sees: ${seen.item}. In one or two short sentences, tell the sailor what you see on their `
              + 'notes, then tell them to put the phone down and look at their laptop screen.');
            void watchDesk(`Notes on camera: ${seen.item}`);
            return;
          }
        }
        await pause(4000);
      }
      if (closed || step !== 'notes') return;
      console.log(`[captain] no notes seen after ${tries} camera checks; asking for something true instead`);
      step = 'truth';
      say('The ship\'s lookout could not make out any notes. In one short sentence, say no matter, and ask the sailor to tell you something true instead.');
    }

    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, async (event) => {
      if (!event.isFinal || step !== 'truth' || !event.transcript.trim()) return;
      const heard = event.transcript.trim();
      const result = await checkTrueFact(heard);
      console.log(`[captain] heard "${heard}" -> true fact: ${result.true_fact}${result.fact ? ` (${result.fact})` : ''}`);
      if (!result.true_fact || step !== 'truth') return;
      step = 'desk';
      void watchDesk(`True fact: ${result.fact || heard}`);
    });

    async function watchDesk(proof) {
      const started = Date.now();
      let nudged = Date.now();
      while (!closed) {
        const state = await focusState(call.room, sailor);
        if (!state) {
          console.log('[captain] the game has no sailor to heal: is the game open with someone joined?');
          return;
        }
        // 3 s of focus, counted only from now (no sensor running: step 1 is enough)
        const focusedNow = Math.min(state.focusedForMs, Date.now() - started);
        if (!state.sensorOnline || focusedNow >= 3000) {
          console.log(`[captain] ${state.player} at desk (sensor ${state.sensorOnline ? 'on' : 'off'}) after ${Math.round((Date.now() - started) / 1000)}s`);
          const healed = await tellGame('/api/chert-webhook', { room: call.room, player: state.player, verified: true, observedItem: proof });
          step = 'done';
          if (!healed.healed) { console.log('[captain] the game did not heal:', healed.error || healed); return; }
          say(`The ship's log says the hull is repaired: +10 HP, now ${healed.hullHealth} HP. Tell ${state.player} warmly in one sentence. `
            + 'Then, in three or four sentences, give them a heartfelt message of encouragement that anyone in the world would '
            + 'appreciate: that every page they study is a step forward, that focus is a skill they are building, that '
            + 'setbacks are part of every great voyage, and that they are capable of more than they think. Speak from the heart, '
            + 'not like a slogan. End by wishing them fair winds, and stay on the call.');
          return;
        }
        if (Date.now() - nudged > 15000) {
          nudged = Date.now();
          say('The sailor is not looking at their laptop screen yet. In one short sentence, tell them to put the phone down and look at the screen.');
        }
        await pause(500);
      }
    }
  },
});

export default agent;

// Your own LiveKit project when .env.local has its three LIVEKIT_ values; otherwise Chert rooms through chert dev.
runAgent(agent, { file: fileURLToPath(import.meta.url), agentName: process.env.AGENT_NAME || 'video-agent' });
