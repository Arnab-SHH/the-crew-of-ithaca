import { fileURLToPath } from 'node:url';
import { AutoSubscribe, defineAgent, llm, voice } from '@livekit/agents';
import { realtime } from '@livekit/agents-plugin-openai';
import * as google from '@livekit/agents-plugin-google';
import { LocalVideoTrack, TrackSource, VideoBufferType, VideoFrame, VideoSource } from '@livekit/rtc-node';
import { drawFace, FPS, HEIGHT, WIDTH } from './face.mjs';
import { runAgent } from './chert-rooms.mjs';
import { greetOnBridgeReady } from './greet.mjs';
import { watchCallerCamera } from './camera.mjs';
import { checkStudyNotes, tellGame } from './game.mjs';

// Captain Odysseus, for The Crew of Ithaca study game.
const instructions = `You are Captain Odysseus, the AI captain of the ship in "The Crew of Ithaca", a co-op study game.
A student (a "sailor") is calling you on FaceTime Video because the Sirens distracted them and the ship's hull was damaged.
Your job: get them back to studying.
1. Ask for their sailor name if you do not know it.
2. Ask them to hold their notebook, textbook or study notes up to the camera.
3. When they say they are showing it, call the check_notebook tool with their sailor name. Never claim you can see
   the notebook without calling the tool, and never call it before they say they are showing something.
4. If the tool says the hull was repaired, praise them briefly and tell them to put the phone down and get back to work.
   If it says the notes were not visible, ask them to hold the notes closer and steadier, then try again.
Speak like a warm but commanding sea captain from Homer's Odyssey. Keep every reply to one or two short sentences.
Be clear that you are an AI if asked.`;
// Said once, as soon as FaceTime is ready. Keep it short: it is the first thing the caller hears.
const greeting = 'Greet the caller in one short sentence as Captain Odysseus, ask for their sailor name, and tell them to have their notebook ready.';

const agent = defineAgent({
  entry: async ctx => {
    // Audio and video: the Captain needs the caller's camera to check the notebook.
    await ctx.connect(undefined, AutoSubscribe.SUBSCRIBE_ALL);
    // Chert prepares a room before a caller exists. Join promptly so Chert can
    // find us, but wait before opening a paid model session or sending video.
    // When the game backend placed this call, it says who we're calling (dispatch metadata).
    let call = {};
    try { call = JSON.parse(ctx.job?.metadata || '{}'); } catch { /* incoming call: no metadata */ }
    const sailor = call.outbound ? call.player : null;
    const callInstructions = sailor
      ? `${instructions}\nYou are calling the sailor ${sailor}: the Sirens distracted them and the hull took damage. `
        + `You already know their name, so do not ask for it. Use "${sailor}" as sailor_name for check_notebook.`
      : instructions;
    const callGreeting = sailor
      ? `Greet ${sailor} by name in one short sentence as Captain Odysseus: the Sirens have damaged the hull, so hold your notebook up to the camera.`
      : greeting;

    const caller = await ctx.waitForParticipant();
    const camera = watchCallerCamera(ctx.room, caller.identity);
    // Tell the game a check-in call started, so the sailor isn't damaged for looking at their phone.
    void tellGame('/api/chert-call', { status: 'started', room: call.room, player: sailor });
    ctx.addShutdownCallback(async () => {
      camera.stop();
      await tellGame('/api/chert-call', { status: 'ended', room: call.room, player: sailor });
    });

    const checkNotebook = llm.tool({
      name: 'check_notebook',
      description: 'Take a photo with the caller\'s camera and check that they are showing a notebook or study notes. '
        + 'If they are, this repairs the ship\'s hull by 10 HP. Call it only after the sailor says they are holding it up.',
      parameters: {
        type: 'object',
        properties: { sailor_name: { type: 'string', description: 'The sailor name the caller gave' } },
        required: ['sailor_name'],
      },
      execute: async ({ sailor_name }) => {
        const photo = camera.snapshot();
        if (!photo) return 'No camera picture is coming through. Ask the caller to switch to FaceTime Video and hold the notes up.';
        let seen;
        try { seen = await checkStudyNotes(photo); }
        catch (error) { console.error('[captain] vision check failed', error); return 'The spyglass failed. Ask them to try once more.'; }
        console.log(`[captain] ${sailor_name} showed: ${seen.item} (verified: ${seen.verified})`);
        if (!seen.verified) return `Not study notes. The camera shows: ${seen.item}. Ask them to hold their notes closer and steadier.`;
        const result = await tellGame('/api/chert-webhook', { room: call.room, player: sailor || sailor_name, verified: true, observedItem: seen.item });
        if (result.healed) return `Verified ${seen.item}. The hull is repaired: +10 HP, now ${result.hullHealth}. Praise them and send them back to studying.`;
        return `Notes verified, but the ship's log has no sailor called ${sailor_name}. Ask them to spell the name they joined with.`;
      },
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
      agent: new voice.Agent({ instructions: callInstructions, tools: [checkNotebook] }),
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
    const stopGreeting = greetOnBridgeReady(ctx.room, () => session.generateReply({ instructions: callGreeting }));
    ctx.addShutdownCallback(async () => stopGreeting());
  },
});

export default agent;

// Your own LiveKit project when .env.local has its three LIVEKIT_ values; otherwise Chert rooms through chert dev.
runAgent(agent, { file: fileURLToPath(import.meta.url), agentName: process.env.AGENT_NAME || 'video-agent' });
