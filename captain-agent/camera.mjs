// The caller's phone camera, as the Captain sees it on the FaceTime call.
// Chert's Mac sends a 1280x720 picture of its FaceTime window: the phone camera is a strip
// in the middle, with black bars beside it and FaceTime's caller bar and buttons on top of it.
// snapshot() crops to the camera strip and returns a PNG data URL (null while black or missing).
import { crc32, deflateSync } from 'node:zlib';
import { RoomEvent, TrackKind, VideoBufferType, VideoStream } from '@livekit/rtc-node';

const MAX_WIDTH = 720;      // enough to read a page; keeps each vision request small
const TOP_CROP = 0.08;      // FaceTime's caller bar (it shows the phone number)
const BOTTOM_CROP = 0.12;   // FaceTime's buttons

/** Starts reading the caller's camera. Returns { snapshot(), stop() } and logs when the picture changes. */
export function watchCallerCamera(room, callerIdentity) {
  let latest = null, reader = null, frames = 0, lastStatus = null;

  const start = (track, _publication, participant) => {
    if (reader || participant.identity !== callerIdentity || track.kind !== TrackKind.KIND_VIDEO) return;
    reader = new VideoStream(track).getReader();
    (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        frames++;
        latest = value; // { frame, rotation }
      }
    })().catch((err) => console.error('[camera] phone camera stream stopped:', err.message));
  };

  // Log only when the picture changes: no frames / black / real.
  const timer = setInterval(() => {
    const status = !latest || frames === 0 ? 'NO PICTURE' : isBlack(latest.frame) ? 'BLACK' : 'REAL PICTURE';
    if (status !== lastStatus) console.log(`[camera] phone camera: ${status}`);
    lastStatus = status;
    frames = 0;
  }, 3000);

  room.on(RoomEvent.TrackSubscribed, start);
  const caller = room.remoteParticipants.get(callerIdentity);
  caller?.trackPublications.forEach((pub) => { if (pub.track) start(pub.track, pub, caller); });

  return {
    snapshot: () => (latest && !isBlack(latest.frame) ? cropToPng(latest.frame, latest.rotation) : null),
    stop: () => {
      clearInterval(timer);
      room.off(RoomEvent.TrackSubscribed, start);
      reader?.cancel().catch(() => {});
    },
  };
}

/** Average brightness on the raw frame (I420/NV12 keep brightness first; black is about 16). */
export function isBlack(frame) {
  if (frame.type === VideoBufferType.I420 || frame.type === VideoBufferType.NV12 || frame.type === VideoBufferType.I420A) {
    const n = frame.width * frame.height;
    let sum = 0, count = 0;
    for (let i = 0; i < n; i += 97) { sum += frame.data[i]; count++; }
    return sum / count < 20;
  }
  const rgba = frame.type === VideoBufferType.RGBA ? frame : frame.convert(VideoBufferType.RGBA);
  let sum = 0, count = 0;
  for (let i = 0; i < rgba.data.length; i += 4 * 97) { sum += (rgba.data[i] + rgba.data[i + 1] + rgba.data[i + 2]) / 3; count++; }
  return sum / count < 20;
}

/** Upright frame -> crop the non-black middle strip, trim FaceTime's bars -> downscaled RGB PNG data URL. */
export function cropToPng(frame, rotation = 0) {
  const rgba = frame.type === VideoBufferType.RGBA ? frame : frame.convert(VideoBufferType.RGBA);
  const { width: W, height: H, data } = rgba;
  const sideways = rotation === 1 || rotation === 3;
  const uw = sideways ? H : W, uh = sideways ? W : H; // upright size
  const at = (x, y) => { // upright (x, y) -> index in the stored frame
    let sx = x, sy = y;
    if (rotation === 1) { sx = y; sy = H - 1 - x; }
    else if (rotation === 2) { sx = W - 1 - x; sy = H - 1 - y; }
    else if (rotation === 3) { sx = W - 1 - y; sy = x; }
    return (sy * W + sx) * 4;
  };
  // Columns that are not black bars
  const lit = (x) => {
    let sum = 0;
    for (let y = 0; y < uh; y += 8) { const i = at(x, y); sum += data[i] + data[i + 1] + data[i + 2]; }
    return sum / (3 * Math.ceil(uh / 8)) > 12;
  };
  let left = 0, right = uw - 1;
  while (left < right && !lit(left)) left++;
  while (right > left && !lit(right)) right--;
  if (right - left < uw * 0.1) { left = 0; right = uw - 1; } // no clear strip: keep everything
  const top = Math.round(uh * TOP_CROP), bottom = Math.round(uh * (1 - BOTTOM_CROP));
  const cw = right - left + 1, ch = bottom - top;
  const scale = Math.min(1, MAX_WIDTH / cw);
  const w = Math.max(1, Math.round(cw * scale)), h = Math.max(1, Math.round(ch * scale));

  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0; // PNG filter: none
    const uy = top + Math.min(ch - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const i = at(left + Math.min(cw - 1, Math.floor(x / scale)), uy);
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = data[i]; raw[o + 1] = data[i + 1]; raw[o + 2] = data[i + 2];
    }
  }
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([len, typed, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}
