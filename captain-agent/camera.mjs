// Keeps the caller's latest FaceTime camera frame and turns it into a small PNG on request.
// The agent SDK in this starter does not stream the caller's video into the model, so the
// Captain takes a snapshot only when it needs to check the notebook.
import { crc32, deflateSync } from 'node:zlib';
import { RoomEvent, TrackKind, VideoBufferType, VideoStream } from '@livekit/rtc-node';

const MAX_WIDTH = 512;

/**
 * Starts reading the caller's camera track. Returns { snapshot(), stop() }.
 * snapshot() gives a PNG data: URL of the newest frame, or null if no video has arrived.
 */
export function watchCallerCamera(room, callerIdentity) {
  let latest = null;
  let reader = null;

  const start = (track, _publication, participant) => {
    if (reader || participant.identity !== callerIdentity || track.kind !== TrackKind.KIND_VIDEO) return;
    reader = new VideoStream(track).getReader();
    (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        latest = value; // { frame, rotation }
      }
    })().catch(() => {});
  };

  room.on(RoomEvent.TrackSubscribed, start);
  const caller = room.remoteParticipants.get(callerIdentity);
  caller?.trackPublications.forEach((pub) => { if (pub.track) start(pub.track, pub, caller); });

  return {
    snapshot: () => (latest ? toPngDataUrl(latest.frame, latest.rotation) : null),
    stop: () => {
      room.off(RoomEvent.TrackSubscribed, start);
      reader?.cancel().catch(() => {});
    },
  };
}

/**
 * VideoFrame -> upright, downscaled RGB PNG as a data: URL.
 * rotation (0-3 = 0/90/180/270 degrees clockwise) is how the phone says to turn the picture.
 */
export function toPngDataUrl(frame, rotation = 0) {
  const rgba = frame.type === VideoBufferType.RGBA ? frame : frame.convert(VideoBufferType.RGBA);
  const sideways = rotation === 1 || rotation === 3;
  const uprightW = sideways ? rgba.height : rgba.width;
  const uprightH = sideways ? rgba.width : rgba.height;
  const scale = Math.min(1, MAX_WIDTH / uprightW);
  const w = Math.max(1, Math.round(uprightW * scale));
  const h = Math.max(1, Math.round(uprightH * scale));
  return `data:image/png;base64,${encodePng(rgba.data, rgba.width, rgba.height, w, h, rotation).toString('base64')}`;
}

/** Minimal PNG encoder (8-bit RGB, nearest-neighbour resize, optional clockwise rotation). */
export function encodePng(rgba, srcW, srcH, w, h, rotation = 0) {
  const sideways = rotation === 1 || rotation === 3;
  const uprightW = sideways ? srcH : srcW;
  const uprightH = sideways ? srcW : srcH;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const uy = Math.min(uprightH - 1, Math.floor((y * uprightH) / h));
    raw[y * (w * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const ux = Math.min(uprightW - 1, Math.floor((x * uprightW) / w));
      // upright pixel (ux, uy) -> where it sits in the stored frame
      let sx = ux, sy = uy;
      if (rotation === 1) { sx = uy; sy = srcH - 1 - ux; }
      else if (rotation === 2) { sx = srcW - 1 - ux; sy = srcH - 1 - uy; }
      else if (rotation === 3) { sx = srcW - 1 - uy; sy = ux; }
      const s = (sy * srcW + sx) * 4;
      const d = y * (w * 3 + 1) + 1 + x * 3;
      raw[d] = rgba[s]; raw[d + 1] = rgba[s + 1]; raw[d + 2] = rgba[s + 2];
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit, RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
