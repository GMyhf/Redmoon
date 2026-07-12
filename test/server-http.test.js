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
  assert.deepEqual(healthBody.persistence, {
    enabled: false,
    ok: true,
    lastSavedAt: null,
    lastErrorAt: null,
    consecutiveFailures: 0,
  });

  const ready = await fetch(`http://127.0.0.1:${port}/ready`);
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).ready, true);

  const index = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get("content-type"), /^text\/html/);
  assert.match(await index.text(), /<!doctype html>/i);

  // Code is never cached (a stale client.js against a newer server shows
  // subtly wrong behaviour); images keep a short cache with ?v= busting.
  for (const [asset, expected] of [
    ["/client.js", "no-cache"],
    ["/data.js", "no-cache"],
    ["/styles.css", "no-cache"],
    ["/assets/heroes/vanguard.webp", "public, max-age=300"],
  ]) {
    const response = await fetch(`http://127.0.0.1:${port}${asset}`);
    assert.equal(response.status, 200, `${asset} served`);
    assert.equal(response.headers.get("cache-control"), expected, `${asset} cache policy`);
    await response.arrayBuffer();
  }

  for (const asset of [
    "/assets/heroes/vanguard.webp",
    "/assets/heroes/vanguard-3d.webp",
    "/assets/scenes/crimson-relay-eclipse.webp",
    "/assets/textures/castle.webp",
  ]) {
    const art = await fetch(`http://127.0.0.1:${port}${asset}`);
    assert.equal(art.status, 200, `${asset} is served`);
    assert.match(art.headers.get("content-type"), /^image\/webp/);
    assert.ok((await art.arrayBuffer()).byteLength > 10_000, `${asset} has real content`);
  }
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
  assert.equal(welcome.protocol, 2);
  assert.equal(welcome.world.width, 4800);
  assert.deepEqual(
    Object.keys(welcome.archetypes).sort(),
    ["bulwark", "channeler", "eclipse", "longshot", "moonblade", "pyre", "strider", "vanguard"],
  );
  // The roster UI reads these numbers from the server, not a local copy.
  assert.deepEqual(welcome.archetypes.vanguard.stats, { power: 6, agility: 3, spirit: 2, vitality: 7 });
  assert.equal(welcome.archetypes.vanguard.skills.r.unlockLevel, 5);
  assert.equal(welcome.archetypes.vanguard.skills.c.unlockLevel, 10);

  socket.send(JSON.stringify({ type: "join", protocol: 2, name: "Tester", archetype: "vanguard" }));
  const session = await messages.next("session");
  assert.equal(session.name, "Tester");
  assert.ok(typeof session.token === "string" && session.token.length > 0);
  const snapshot = await messages.next("snapshot");
  assert.equal(snapshot.selfId, welcome.id);
  assert.equal(snapshot.players[0].name, "Tester");
  assert.equal(snapshot.enemies.length, 1);

  socket.send("not-json");
  const error = await messages.next("error");
  assert.equal(error.code, "INVALID_JSON");
});

test("the gateway rejects out-of-order, unknown, binary, and oversized traffic", async (t) => {
  const server = createGameServer({
    host: "127.0.0.1",
    port: 0,
    persistPath: "",
    world: new World({ rng: () => 0.5, mobTargetCount: 0, spawnMobs: false }),
  });
  await server.listen();
  t.after(() => server.close());
  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);
  t.after(() => socket.terminate());
  const messages = messageQueue(socket);
  await messages.next("welcome");

  // Commands before join are refused.
  socket.send(JSON.stringify({ type: "input", seq: 1, move: { x: 1, y: 0 } }));
  assert.equal((await messages.next("error")).code, "NOT_JOINED");

  socket.send(JSON.stringify({ type: "join", protocol: 2, name: "Probe", archetype: "vanguard" }));
  await messages.next("snapshot");

  // Unknown commands and double joins are refused.
  socket.send(JSON.stringify({ type: "dance" }));
  assert.equal((await messages.next("error")).code, "UNKNOWN_MESSAGE");
  socket.send(JSON.stringify({ type: "join", protocol: 2, name: "Probe2", archetype: "vanguard" }));
  assert.equal((await messages.next("error")).code, "ALREADY_JOINED");

  // Binary frames are refused.
  socket.send(Buffer.from([1, 2, 3]), { binary: true });
  assert.equal((await messages.next("error")).code, "INVALID_MESSAGE");

  // A frame beyond the 16 KiB cap terminates the connection (ws maxPayload).
  const closed = new Promise((resolve) => socket.once("close", resolve));
  socket.send(`{"type":"input","padding":"${"x".repeat(17 * 1024)}"}`);
  await closed;
  assert.ok(socket.readyState >= WebSocket.CLOSING, "oversized frame closes the socket");
  // The server-side close handler may land a beat after the client sees it.
  for (let waited = 0; waited < 50 && server.world.players.size > 0; waited += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(server.world.players.size, 0, "the closed player is removed from the world");
});

test("leave returns to the lobby and lobby sockets receive the roster", async (t) => {
  const server = createGameServer({
    host: "127.0.0.1",
    port: 0,
    persistPath: "",
    tickRate: 20,
    snapshotRate: 20,
    world: new World({ rng: () => 0.5, mobTargetCount: 0, spawnMobs: false }),
  });
  await server.listen();
  t.after(() => server.close());

  const alice = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);
  t.after(() => alice.terminate());
  const aliceMessages = messageQueue(alice);
  await aliceMessages.next("welcome");
  alice.send(JSON.stringify({ type: "join", protocol: 2, name: "Alice", archetype: "vanguard" }));
  const session = await aliceMessages.next("session");
  await aliceMessages.next("snapshot");

  // A lobby-only socket sees Alice in the welcome roster and gets updates.
  const lobby = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);
  t.after(() => lobby.terminate());
  const lobbyMessages = messageQueue(lobby);
  const welcome = await lobbyMessages.next("welcome");
  assert.equal(welcome.roster.length, 1);
  assert.equal(welcome.roster[0].name, "Alice");
  assert.equal(welcome.roster[0].mapId, "town");
  assert.ok(welcome.roster[0].level >= 1);
  const broadcast = await lobbyMessages.next("roster", 3000);
  assert.equal(broadcast.players.length, 1, "lobby sockets receive periodic rosters");

  // Leaving frees the seat and the same connection can join again.
  alice.send(JSON.stringify({ type: "leave" }));
  const afterLeave = await aliceMessages.next("roster");
  assert.equal(afterLeave.players.length, 0);
  assert.equal(server.world.players.size, 0);
  alice.send(JSON.stringify({ type: "join", protocol: 2, name: "Alice", archetype: "vanguard", token: session.token }));
  const rejoined = await aliceMessages.next("snapshot");
  assert.equal(rejoined.players[0].name, "Alice");
});

test("a flooding connection is rate limited without stalling the world", async (t) => {
  const server = createGameServer({
    host: "127.0.0.1",
    port: 0,
    persistPath: "",
    rateLimit: { capacity: 5, refillPerSecond: 1 },
    world: new World({ rng: () => 0.5, mobTargetCount: 0, spawnMobs: false }),
  });
  await server.listen();
  t.after(() => server.close());
  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);
  t.after(() => socket.terminate());
  const messages = messageQueue(socket);
  await messages.next("welcome");

  socket.send(JSON.stringify({ type: "join", name: "Flooder", archetype: "vanguard" }));
  await messages.next("snapshot");
  for (let index = 0; index < 30; index += 1) {
    socket.send(JSON.stringify({ type: "input", seq: index, move: { x: 1, y: 0 } }));
  }
  const limited = await messages.next("error");
  assert.equal(limited.code, "RATE_LIMITED");
  assert.equal(server.world.players.size, 1, "the world keeps running for joined players");
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
