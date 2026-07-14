import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DungeonFrameDecoder,
  encodeDungeonFrame,
} from "../src/server/dungeon-ipc.js";
import { createDungeonPlan } from "../src/server/dungeon.js";
import { createSeededRandom } from "../src/server/random.js";
import { DungeonWorkerTransport } from "../src/server/dungeon-transport.js";

const silentWorker = fileURLToPath(new URL("./fixtures/dungeon-worker-silent.mjs", import.meta.url));
const corruptWorker = fileURLToPath(new URL("./fixtures/dungeon-worker-corrupt.mjs", import.meta.url));

function openPayload() {
  const rng = createSeededRandom("transport-test");
  return {
    plan: createDungeonPlan({ instanceId: "vault-transport", averageLevel: 10, width: 4800, height: 2700 }),
    rngState: rng.getState(),
    width: 4800,
    height: 2700,
    checkpointIntervalTicks: 1,
  };
}

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
  const ready = await transport.open(openPayload());
  assert.equal(ready.type, "ready");
  assert.equal(ready.workerEpoch, 4);
  assert.match(ready.stateHash, /^[0-9a-f]{16}$/);

  const heartbeat = await transport.heartbeat();
  assert.equal(heartbeat.type, "heartbeat");
  await assert.rejects(
    transport._request("unknown", {}, "unknownAck"),
    /worker UNSUPPORTED_MESSAGE/,
  );
  await transport.recycle("test");
});

test("child transport attaches, detaches, ticks and deduplicates input sequences", async () => {
  const transport = new DungeonWorkerTransport({
    instanceId: "vault-transport",
    workerEpoch: 5,
    heartbeatIntervalMs: 50,
  });
  await transport.open(openPayload());
  const playerState = {
    name: "WorkerHero",
    archetype: "vanguard",
    x: 1_000,
    y: 1_000,
    hp: 100,
    mp: 100,
  };
  const attached = await transport.attach("worker-player", {}, playerState, 0);
  assert.equal(attached.type, "attached");
  assert.equal(attached.snapshot.players.some((player) => player.id === "worker-player"), true);

  const firstInput = await transport.input("worker-player", 1, { move: { x: 1, y: 0 } });
  assert.equal(firstInput.accepted, true);
  const duplicateInput = await transport.input("worker-player", 1, { move: { x: -1, y: 0 } });
  assert.equal(duplicateInput.accepted, false, "a duplicate pending sequence is rejected");
  const result = await transport.tick(1, 0.1, 0, [
    { playerId: "worker-player", seq: 1, intent: { move: { x: 1, y: 0 } } },
  ]);
  assert.equal(result.type, "tickResult");
  assert.equal(result.tickId, 1);
  assert.equal((await transport.heartbeat()).lastTickId, 1);
  assert.equal(result.snapshot.enemies.length, 6);
  assert.ok(result.snapshot.players.find((player) => player.id === "worker-player").x > playerState.x);

  const detached = await transport.detach("worker-player", 10_000);
  assert.equal(detached.detached, true);
  const detachedInput = await transport.input("worker-player", 2, { move: { x: -1, y: 0 } });
  assert.equal(detachedInput.accepted, false, "detached players cannot queue input");
  await transport.tick(2, 0.1, 100, []);
  const reattached = await transport.attach("worker-player", {}, playerState, 1);
  assert.equal(reattached.type, "attached");
  assert.equal(reattached.snapshot.players.find((player) => player.id === "worker-player").x,
    result.snapshot.players.find((player) => player.id === "worker-player").x,
    "reattach preserves worker-authoritative state");
  await transport.recycle("test");
});

test("checkpoint restore resumes a new worker with identical state and RNG", async () => {
  const first = new DungeonWorkerTransport({ instanceId: "vault-restore", workerEpoch: 10 });
  const payload = {
    ...openPayload(),
    plan: createDungeonPlan({ instanceId: "vault-restore", averageLevel: 10, width: 4800, height: 2700 }),
  };
  await first.open(payload);
  const playerState = { name: "RestoreHero", archetype: "vanguard", x: 1_000, y: 1_000, hp: 100, mp: 100 };
  await first.attach("restore-player", {}, playerState, 0);
  const beforeRestore = await first.tick(1, 0.1, 0, [
    { playerId: "restore-player", seq: 1, intent: { move: { x: 1, y: 0 } } },
  ]);
  assert.equal(beforeRestore.checkpoint.rngState.algorithm, payload.rngState.algorithm);
  assert.notEqual(beforeRestore.checkpoint.rngState.state, payload.rngState.state,
    "the checkpoint must capture the advanced worker RNG state");

  const second = new DungeonWorkerTransport({ instanceId: "vault-restore", workerEpoch: 11 });
  const ready = await second.open({ ...payload, checkpoint: beforeRestore.checkpoint });
  assert.equal(ready.stateVersion, 1);
  const restored = await second.attach("restore-player", {}, playerState, 1);
  assert.deepEqual(restored.snapshot, beforeRestore.snapshot);

  for (let tickId = 2; tickId <= 30; tickId += 1) {
    const firstNext = await first.tick(tickId, 0.1, 100, []);
    const secondNext = await second.tick(tickId, 0.1, 100, []);
    assert.deepEqual(secondNext.snapshot, firstNext.snapshot, `snapshot diverged at tick ${tickId}`);
    assert.deepEqual(secondNext.events, firstNext.events, `events diverged at tick ${tickId}`);
    assert.deepEqual(secondNext.checkpoint, firstNext.checkpoint, `checkpoint diverged at tick ${tickId}`);
  }
  await first.recycle("test");
  await second.recycle("test");
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
    handshakeTimeoutMs: 2_000,
  });
  const stderr = [];
  corrupt.onStderr = (message) => stderr.push(message);
  await assert.rejects(corrupt.open(), /invalid worker frame/);
  assert.deepEqual(stderr, ["worker diagnostic\n"]);
  await corrupt.close();
});
