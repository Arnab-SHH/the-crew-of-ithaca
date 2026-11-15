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
        latest = value.frame;
      }
    })().catch(() => {});
  };

  room.on(RoomEvent.TrackSubscribed, start);
  const caller = room.remoteParticipants.get(callerIdentity);
  caller?.trackPublications.forEach((pub) => { if (pub.track) start(pub.track, pub, caller); });

  return {
    snapshot: () => (latest ? toPngDataUrl(latest) : null),
    stop: () => {
      room.off(RoomEvent.TrackSubscribed, start);
      reader?.cancel().catch(() => {});
    },
  };
}

/** VideoFrame -> downscaled RGB PNG as a data: URL. */
export function toPngDataUrl(frame) {
  const rgba = frame.type === VideoBufferType.RGBA ? frame : frame.convert(VideoBufferType.RGBA);
  const scale = Math.min(1, MAX_WIDTH / rgba.width);
  const w = Math.max(1, Math.round(rgba.width * scale));
  const h = Math.max(1, Math.round(rgba.height * scale));
  return `data:image/png;base64,${encodePng(rgba.data, rgba.width, rgba.height, w, h).toString('base64')}`;
}

/** Minimal PNG encoder (8-bit RGB, nearest-neighbour resize). */
export function encodePng(rgba, srcW, srcH, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / h));
    raw[y * (w * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / w));
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
