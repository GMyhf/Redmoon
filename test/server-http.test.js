import assert from "node:assert/strict";
import test from "node:test";

import { WebSocket } from "ws";

import { createGameServer } from "../src/server/server.js";
import { World } from "../src/server/world.js";

test("HTTP serves the client and health status", async (t) => {
  const server = createGameServer({
    host: "127.0.0.1",
    port: 0,
    persistPath: "",
    world: new World({ rng: () => 0.5, mobTargetCount: 1, spawnBoss: false }),
  });
  await server.listen();
  t.after(() => server.close());
  const { port } = server.address();

  const health = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.players, 0);
  assert.equal(healthBody.enemies, 1);
  assert.ok(Number.isSafeInteger(healthBody.tick));

  const index = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get("content-type"), /^text\/html/);
  assert.match(await index.text(), /<!doctype html>/i);
});

test("WebSocket emits welcome, accepts join, and reports protocol errors", async (t) => {
  const server = createGameServer({
    host: "127.0.0.1",
    port: 0,
    persistPath: "",
    tickRate: 20,
    snapshotRate: 20,
    world: new World({ rng: () => 0.5, mobTargetCount: 1, spawnBoss: false }),
  });
  await server.listen();
  t.after(() => server.close());
  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);
  t.after(() => socket.terminate());
  const messages = messageQueue(socket);

  const welcome = await messages.next("welcome");
  assert.equal(welcome.protocol, 1);
  assert.equal(welcome.world.width, 4800);
  assert.deepEqual(
    Object.keys(welcome.archetypes).sort(),
    ["bulwark", "channeler", "eclipse", "longshot", "moonblade", "pyre", "strider", "vanguard"],
  );

  socket.send(JSON.stringify({ type: "join", name: "Tester", archetype: "vanguard" }));
  const snapshot = await messages.next("snapshot");
  assert.equal(snapshot.selfId, welcome.id);
  assert.equal(snapshot.players[0].name, "Tester");
  assert.equal(snapshot.enemies.length, 1);

  socket.send("not-json");
  const error = await messages.next("error");
  assert.equal(error.code, "INVALID_JSON");
});

function messageQueue(socket) {
  const buffered = [];
  const waiters = [];
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString());
    const matchingIndex = waiters.findIndex((waiter) => waiter.type === message.type);
    if (matchingIndex >= 0) {
      const [waiter] = waiters.splice(matchingIndex, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    } else {
      buffered.push(message);
    }
  });

  return {
    next(type, timeout = 1500) {
      const matchingIndex = buffered.findIndex((message) => message.type === type);
      if (matchingIndex >= 0) return Promise.resolve(buffered.splice(matchingIndex, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { type, resolve, reject, timer: null };
        waiter.timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error(`Timed out waiting for ${type}`));
        }, timeout);
        waiters.push(waiter);
      });
    },
  };
}
