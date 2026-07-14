import {
  DungeonFrameDecoder,
  encodeDungeonFrame,
  MAX_DUNGEON_FRAME_BYTES,
} from "./dungeon-ipc.js";
import { PROTOCOL_VERSION } from "./definitions.js";
import { DungeonSimulation } from "./dungeon-simulation.js";

const SUPPORTED_MESSAGES = new Set(["open", "attach", "detach", "input", "tick", "restore", "settle", "heartbeat", "recycle"]);
const decoder = new DungeonFrameDecoder(MAX_DUNGEON_FRAME_BYTES);
let opened = false;
let identity = null;
let simulation = null;
let messageQueue = Promise.resolve();

process.stdin.resume();

process.stdin.on("data", (chunk) => {
  let messages;
  try {
    messages = decoder.push(chunk);
  } catch (error) {
    protocolFailure(error);
    return;
  }
  for (const message of messages) {
    messageQueue = messageQueue.then(() => handleMessage(message)).catch((error) => protocolFailure(error));
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
    try {
      simulation = new DungeonSimulation(message);
      if (message.checkpoint) simulation.restoreCheckpoint(message.checkpoint);
    } catch (error) {
      await sendError(message, "INVALID_OPEN", error.message, false);
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
      stateHash: simulation.stateHash(),
      stateVersion: simulation.stateVersion,
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

  if (message.type === "attach") {
    try {
      const snapshot = simulation.attach(message.playerId, message.playerState, message.lastInputSeq);
      await send({ ...responseFields(message), type: "attached", snapshot, stateVersion: simulation.stateVersion });
    } catch (error) {
      await sendError(message, "ATTACH_INVALID", error.message, false);
    }
    return;
  }

  if (message.type === "detach") {
    const detached = simulation.detach(message.playerId);
    await send({ ...responseFields(message), type: "detached", playerId: message.playerId, detached, stateVersion: simulation.stateVersion });
    return;
  }

  if (message.type === "input") {
    const accepted = simulation.queueInput(message.playerId, message.seq, message.intent);
    await send({ ...responseFields(message), type: "inputAck", playerId: message.playerId, seq: message.seq, accepted, stateVersion: simulation.stateVersion });
    return;
  }

  if (message.type === "tick") {
    try {
      const result = simulation.tick(message.dt, message.inputs, message.tickId);
      await send({ ...responseFields(message), type: "tickResult", tickId: message.tickId, ...result });
    } catch (error) {
      await sendError(message, "TICK_INVALID", error.message, false);
    }
    return;
  }

  if (message.type === "restore") {
    try {
      const snapshot = simulation.restoreCheckpoint(message.checkpoint);
      await send({
        ...responseFields(message),
        type: "restored",
        snapshot,
        stateHash: simulation.stateHash(),
        stateVersion: simulation.stateVersion,
      });
    } catch (error) {
      await sendError(message, "RESTORE_INVALID", error.message, false);
    }
    return;
  }

  if (message.type === "settle") {
    try {
      await send({ ...responseFields(message), ...simulation.requestSettlement(message.settlementId) });
    } catch (error) {
      await sendError(message, "SETTLE_INVALID", error.message, false);
    }
    return;
  }

  if (message.type === "heartbeat") {
    await send({
      ...responseFields(message),
      type: "heartbeat",
      lastTickId: simulation.lastTickId,
      stateVersion: simulation.stateVersion,
    });
    return;
  }

  await send({
    ...responseFields(message),
    type: "recycleAck",
    stateVersion: simulation.stateVersion,
  });
  process.exitCode = 0;
  setImmediate(() => process.exit(0));
}

async function sendError(message, code, detail, retryable) {
  await send({ ...responseFields(message), type: "error", code, detail, retryable, stateVersion: simulation?.stateVersion ?? 0 });
}

function protocolFailure(error) {
  process.stderr.write(`dungeon worker protocol failure: ${error.message}\n`);
  process.exitCode = 1;
  process.stdin.pause();
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

function send(message) {
  return new Promise((resolve, reject) => {
    const frame = encodeDungeonFrame(message);
    process.stdout.write(frame, (error) => (error ? reject(error) : resolve()));
  });
}
