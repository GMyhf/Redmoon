import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DungeonFrameDecoder,
  encodeDungeonFrame,
} from "../src/server/dungeon-ipc.js";
import { DungeonWorkerTransport } from "../src/server/dungeon-transport.js";

const silentWorker = fileURLToPath(new URL("./fixtures/dungeon-worker-silent.mjs", import.meta.url));
const corruptWorker = fileURLToPath(new URL("./fixtures/dungeon-worker-corrupt.mjs", import.meta.url));

test("dungeon frames handle split messages and reject oversized payloads", () => {
  const first = encodeDungeonFrame({ type: "one", value: 1 });
  const second = encodeDungeonFrame({ type: "two", value: 2 });
  const decoder = new DungeonFrameDecoder(1024);

  assert.deepEqual(decoder.push(Buffer.concat([first.subarray(0, 2)])), []);
  assert.deepEqual(decoder.push(Buffer.concat([first.subarray(2), second])), [
    { type: "one", value: 1 },
    { type: "two", value: 2 },
  ]);
  assert.throws(() => encodeDungeonFrame({ value: "x".repeat(20) }, 8), /exceeds 8 bytes/);
  assert.throws(() => new DungeonFrameDecoder(8).push(Buffer.from([0, 0, 0, 9])), /exceeds 8 bytes/);
});

test("child transport opens, heartbeats, rejects unsupported messages, and recycles", async () => {
  const transport = new DungeonWorkerTransport({
    instanceId: "vault-transport",
    workerEpoch: 4,
    heartbeatIntervalMs: 20,
  });
  const ready = await transport.open({ ticket: {}, plan: {}, rngState: { algorithm: "mulberry32", state: 1 } });
  assert.equal(ready.type, "ready");
  assert.equal(ready.workerEpoch, 4);
  assert.match(ready.stateHash, /^[0-9a-f]{16}$/);

  const heartbeat = await transport.heartbeat();
  assert.equal(heartbeat.type, "heartbeat");
  await assert.rejects(
    transport._request("tick", {}, "tickResult"),
    /worker UNSUPPORTED_MESSAGE/,
  );
  await transport.recycle("test");
});

test("child transport supervises handshake timeout and corrupt frames", async () => {
  const silent = new DungeonWorkerTransport({
    instanceId: "vault-silent",
    entrypoint: silentWorker,
    handshakeTimeoutMs: 30,
  });
  await assert.rejects(silent.open(), /worker open timed out after 30ms/);
  await silent.close();

  const corrupt = new DungeonWorkerTransport({
    instanceId: "vault-corrupt",
    entrypoint: corruptWorker,
    handshakeTimeoutMs: 100,
  });
  const stderr = [];
  corrupt.onStderr = (message) => stderr.push(message);
  await assert.rejects(corrupt.open(), /invalid worker frame/);
  assert.deepEqual(stderr, ["worker diagnostic\n"]);
  await corrupt.close();
});
