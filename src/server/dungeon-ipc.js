export const MAX_DUNGEON_FRAME_BYTES = 1024 * 1024;
const FRAME_HEADER_BYTES = 4;

export function encodeDungeonFrame(message, maxFrameBytes = MAX_DUNGEON_FRAME_BYTES) {
  let payload;
  try {
    payload = Buffer.from(JSON.stringify(message), "utf8");
  } catch (error) {
    throw new TypeError(`message is not serializable: ${error.message}`);
  }
  if (payload.length === 0 || payload.length > maxFrameBytes) {
    throw new RangeError(`frame exceeds ${maxFrameBytes} bytes`);
  }
  const frame = Buffer.allocUnsafe(FRAME_HEADER_BYTES + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, FRAME_HEADER_BYTES);
  return frame;
}

export class DungeonFrameDecoder {
  constructor(maxFrameBytes = MAX_DUNGEON_FRAME_BYTES) {
    this.maxFrameBytes = maxFrameBytes;
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    if (!Buffer.isBuffer(chunk) || chunk.length === 0) return [];
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages = [];
    while (this.buffer.length >= FRAME_HEADER_BYTES) {
      const payloadLength = this.buffer.readUInt32BE(0);
      if (payloadLength === 0 || payloadLength > this.maxFrameBytes) {
        throw new RangeError(`frame exceeds ${this.maxFrameBytes} bytes`);
      }
      const frameLength = FRAME_HEADER_BYTES + payloadLength;
      if (this.buffer.length < frameLength) break;
      const payload = this.buffer.subarray(FRAME_HEADER_BYTES, frameLength).toString("utf8");
      this.buffer = this.buffer.subarray(frameLength);
      try {
        messages.push(JSON.parse(payload));
      } catch (error) {
        throw new SyntaxError(`invalid worker JSON frame: ${error.message}`);
      }
    }
    return messages;
  }
}
