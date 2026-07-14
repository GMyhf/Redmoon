import { createHash } from "node:crypto";

import {
  DungeonFrameDecoder,
  encodeDungeonFrame,
  MAX_DUNGEON_FRAME_BYTES,
} from "./dungeon-ipc.js";
import { PROTOCOL_VERSION } from "./definitions.js";

const SUPPORTED_MESSAGES = new Set(["open", "heartbeat", "recycle"]);
const decoder = new DungeonFrameDecoder(MAX_DUNGEON_FRAME_BYTES);
let opened = false;
let identity = null;

process.stdin.on("data", (chunk) => {
  try {
    for (const message of decoder.push(chunk)) handleMessage(message);
  } catch (error) {
    process.stderr.write(`dungeon worker protocol failure: ${error.message}\n`);
    process.exitCode = 1;
    process.stdin.pause();
  }
});

process.stdin.on("end", () => {
  process.exitCode = 0;
});

async function handleMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new TypeError("worker message must be an object");
  }
  validateEnvelope(message);
  if (!SUPPORTED_MESSAGES.has(message.type)) {
    await send({
      ...responseFields(message),
      type: "error",
      code: "UNSUPPORTED_MESSAGE",
      retryable: false,
      stateVersion: 0,
    });
    return;
  }

  if (message.type === "open") {
    if (message.protocolVersion !== PROTOCOL_VERSION) {
      await send({
        ...responseFields(message),
        type: "error",
        code: "PROTOCOL_MISMATCH",
        retryable: false,
        stateVersion: 0,
      });
      return;
    }
    identity = {
      instanceId: message.instanceId,
      workerEpoch: message.workerEpoch,
    };
    opened = true;
    await send({
      ...responseFields(message),
      type: "ready",
      stateHash: stateHash(identity),
      stateVersion: 0,
    });
    return;
  }

  if (!opened) {
    await send({
      ...responseFields(message),
      type: "error",
      code: "NOT_OPEN",
      retryable: true,
      stateVersion: 0,
    });
    return;
  }

  if (message.type === "heartbeat") {
    await send({
      ...responseFields(message),
      type: "heartbeat",
      lastTickId: 0,
      stateVersion: 0,
    });
    return;
  }

  await send({
    ...responseFields(message),
    type: "recycleAck",
    stateVersion: 0,
  });
  process.exitCode = 0;
  setImmediate(() => process.exit(0));
}

function validateEnvelope(message) {
  if (typeof message.type !== "string" || !message.type) throw new TypeError("worker message type is required");
  if (!Number.isSafeInteger(message.protocolVersion)) throw new TypeError("worker protocolVersion is required");
  if (typeof message.instanceId !== "string" || !message.instanceId) throw new TypeError("worker instanceId is required");
  if (!Number.isSafeInteger(message.workerEpoch) || message.workerEpoch < 0) {
    throw new TypeError("worker workerEpoch is required");
  }
  if (typeof message.requestId !== "string" || !message.requestId) throw new TypeError("worker requestId is required");
}

function responseFields(message) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    instanceId: message.instanceId,
    requestId: message.requestId,
    workerEpoch: message.workerEpoch,
  };
}

function stateHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function send(message) {
  return new Promise((resolve, reject) => {
    const frame = encodeDungeonFrame(message);
    process.stdout.write(frame, (error) => (error ? reject(error) : resolve()));
  });
}
