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
    backend: "disabled",
    ok: true,
    lastSavedAt: null,
    lastErrorAt: null,
    consecutiveFailures: 0,
    auditPending: 0,
    auditDropped: 0,
    auditErrorAt: null,
    backupErrorAt: null,
    durabilityErrorAt: null,
  });
  assert.equal(healthBody.runtime.tickRate, 20);
  assert.equal(healthBody.runtime.websocket.connections, 0);
  assert.equal(healthBody.runtime.websocket.backgroundConnections, 0);
  assert.equal(healthBody.runtime.websocket.pausedConnections, 0);
  assert.ok(healthBody.runtime.memory.rssBytes > 0);
  assert.ok(healthBody.runtime.memory.heapUsedBytes > 0);
  assert.ok(healthBody.runtime.tickAgeMs === null || healthBody.runtime.tickAgeMs >= 0);

  let ready;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    ready = await fetch(`http://127.0.0.1:${port}/ready`);
    if (ready.status === 200) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).ready, true);

  const metrics = await fetch(`http://127.0.0.1:${port}/metrics`);
  assert.equal(metrics.status, 200);
  assert.match(metrics.headers.get("content-type"), /^text\/plain; version=0\.0\.4/);
  const metricText = await metrics.text();
  assert.match(metricText, /crimson_event_loop_lag_seconds\{quantile="0\.99"\}/);
  assert.match(metricText, /crimson_audit_pending 0/);
  assert.match(metricText, /crimson_process_resident_memory_bytes [1-9]\d*/);
  assert.match(metricText, /crimson_process_heap_used_bytes [1-9]\d*/);

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
    reconnectGraceMs: 0,
    world: new World({ rng: () => 0.5, mobTargetCount: 0, spawnMobs: false }),
  });
  await server.listen();
  t.after(() => server.close());
  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);
  t.after(() => socket.terminate());
  const messages = messageQueue(socket);
  await messages.next("welcome");

  // Valid JSON must still be an object, and a rejected frame must not poison
  // this connection's command queue.
  socket.send("null");
  assert.equal((await messages.next("error")).code, "INVALID_MESSAGE");
  socket.send(JSON.stringify({ type: { toString: null } }));
  assert.equal((await messages.next("error")).code, "INVALID_MESSAGE");

  // Commands before join are refused.
  socket.send(JSON.stringify({ type: "input", seq: 1, move: { x: 1, y: 0 } }));
  assert.equal((await messages.next("error")).code, "NOT_JOINED");

  socket.send(JSON.stringify({ type: "join", protocol: 2, name: "Probe", archetype: "vanguard" }));
  await messages.next("snapshot");

  // Unknown commands and double joins are refused.
  socket.send(JSON.stringify({ type: "dance" }));
  assert.equal((await messages.next("error")).code, "UNKNOWN_MESSAGE");
  server.world.players.values().next().value.skillPoints = 0;
  socket.send(JSON.stringify({ type: "upgradeskill", skill: "q" }));
  assert.equal((await messages.next("error")).code, "NO_SKILL_POINTS");
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

test("snapshot backpressure pauses droppable delivery and retains a hard disconnect limit", () => {
  const world = new World({ rng: () => 0.5, mobTargetCount: 0, spawnMobs: false });
  const server = createGameServer({
    persistPath: "",
    world,
    backpressure: { skipBytes: 100, disconnectBytes: 1_000, maxSkippedFrames: 2 },
  });
  let serialized = 0;
  world.getSnapshotJson = () => {
    serialized += 1;
    return "{}";
  };
  const socket = {
    readyState: WebSocket.OPEN,
    playerId: "slow-player",
    bufferedAmount: 100,
    backpressureSkips: 0,
    send() {
      this.sent = true;
    },
    terminate() {
      this.terminated = true;
    },
  };

  assert.equal(server._sendSnapshot(socket), "skipped");
  assert.equal(serialized, 0, "the expensive snapshot is not built while the socket is backed up");
  assert.equal(server._sendSnapshot(socket), "skipped");
  assert.equal(socket.deliveryPaused, true);
  assert.equal(socket.terminated, undefined);
  assert.equal(server._runtime.snapshotsSkipped, 2);
  socket.bufferedAmount = 0;
  assert.equal(server._sendSnapshot(socket), "sent");
  assert.equal(socket.sent, true);
  assert.equal(socket.deliveryPaused, false, "delivery resumes as soon as the backlog drains");
  assert.equal(serialized, 1);
  socket.bufferedAmount = 1_000;
  assert.equal(server._sendSnapshot(socket), "disconnected");
  assert.equal(socket.terminated, true);
  assert.equal(server._runtime.backpressureDisconnects, 1, "the hard limit remains");
});

test("a hidden browser pauses world traffic and receives a fresh snapshot when visible", async (t) => {
  const server = createGameServer({
    host: "127.0.0.1",
    port: 0,
    persistPath: "",
    tickRate: 20,
    snapshotRate: 20,
    world: new World({ rng: () => 0.5, mobTargetCount: 0, spawnMobs: false }),
  });
  assert.equal(server.reconnectGraceMs, 300_000);
  await server.listen();
  t.after(() => server.close());

  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);
  t.after(() => socket.terminate());
  const messages = messageQueue(socket);
  await messages.next("welcome");
  socket.send(JSON.stringify({
    type: "join", protocol: 2, name: "Background", archetype: "vanguard",
  }));
  await messages.next("session");
  await messages.next("snapshot");
  const serverSocket = [...server.wss.clients][0];

  socket.send(JSON.stringify({ type: "clientState", visible: false }));
  for (let attempt = 0; attempt < 50 && serverSocket.clientVisible !== false; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(serverSocket.clientVisible, false);
  const sentWhileHidden = server._runtime.snapshotsSent;
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(
    server._runtime.snapshotsSent,
    sentWhileHidden,
    "background tabs do not accumulate snapshots while server-side play continues",
  );
  assert.equal(server._runtimeStatus().websocket.backgroundConnections, 1);

  socket.send(JSON.stringify({ type: "clientState", visible: true }));
  for (let attempt = 0; attempt < 50 && serverSocket.clientVisible !== true; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(serverSocket.clientVisible, true);
  assert.ok(server._runtime.snapshotsSent > sentWhileHidden, "foregrounding pushes a fresh snapshot");
});

test("heartbeat terminates a connection that does not answer ping frames", async (t) => {
  const server = createGameServer({
    host: "127.0.0.1",
    port: 0,
    persistPath: "",
    heartbeat: { intervalMs: 25 },
    world: new World({ rng: () => 0.5, mobTargetCount: 0, spawnMobs: false }),
  });
  await server.listen();
  t.after(() => server.close());
  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`, { autoPong: false });
  t.after(() => socket.terminate());
  await messageQueue(socket).next("welcome");
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("heartbeat did not close the socket")), 1_000);
    socket.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  assert.equal(server._runtime.heartbeatDisconnects, 1);
});

test("configured browser origins are enforced without blocking native clients", async (t) => {
  const server = createGameServer({
    host: "127.0.0.1",
    port: 0,
    persistPath: "",
    allowedOrigins: ["https://play.example.com"],
    world: new World({ rng: () => 0.5, mobTargetCount: 0, spawnMobs: false }),
  });
  await server.listen();
  t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.address().port}/ws`;

  const rejectedStatus = await new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { origin: "https://evil.example" });
    socket.once("unexpected-response", (_request, response) => {
      response.resume();
      resolve(response.statusCode);
    });
    socket.once("open", () => reject(new Error("an unlisted Origin was accepted")));
    socket.once("error", () => {});
  });
  assert.equal(rejectedStatus, 403);

  for (const options of [{ origin: "https://play.example.com" }, {}]) {
    const socket = new WebSocket(url, options);
    t.after(() => socket.terminate());
    assert.equal((await messageQueue(socket).next("welcome")).type, "welcome");
  }
});

test("runtime thresholds gate readiness and expose the failing measurements", () => {
  const server = createGameServer({
    persistPath: "",
    readiness: {
      tickStaleMs: 50,
      maxConsecutiveTickErrors: 2,
      eventLoopLagP99Ms: 10,
      snapshotP99Ms: 20,
      wsBacklogBytes: 75,
    },
    world: new World({ rng: () => 0.5, mobTargetCount: 0, spawnMobs: false }),
  });
  assert.equal(server._readinessStatus().checks.tickFresh.ok, false, "boot is unready before its first tick");
  server._runtime.hasSuccessfulTick = true;
  server._runtime.lastTickAtMonotonic = performance.now() - 100;
  server._runtime.consecutiveTickErrors = 2;
  server._runtime.eventLoopLagMs.add(11);
  server._runtime.snapshotDurationMs.add(21);
  const slowSocket = { readyState: WebSocket.OPEN, bufferedAmount: 75 };
  server.wss.clients.add(slowSocket);

  const status = server._readinessStatus();
  server.wss.clients.delete(slowSocket);
  assert.equal(status.ready, false);
  assert.equal(status.checks.persistence.ok, true);
  assert.equal(status.checks.tickFresh.ok, false);
  assert.equal(status.checks.tickErrors.ok, false);
  assert.equal(status.checks.eventLoopLag.ok, false);
  assert.equal(status.checks.snapshotDuration.ok, false);
  assert.equal(status.checks.websocketBacklog.ok, false);
  slowSocket.deliveryPaused = true;
  assert.equal(
    server._readinessStatus().checks.websocketBacklog.ok,
    true,
    "an isolated slow client does not withdraw the whole server from traffic",
  );
  assert.match(server._prometheusMetrics(), /crimson_ready 0/);
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


test("map chat never leaks outside its scope; global reaches everyone", async (t) => {
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
  const port = server.address().port;

  const open = (name) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    t.after(() => socket.terminate());
    const queue = messageQueue(socket);
    socket.on("open", () => socket.send(JSON.stringify({ type: "join", protocol: 2, name, archetype: "vanguard" })));
    return { socket, queue };
  };
  const alice = open("Alice");
  const bob = open("Bob");
  await alice.queue.next("snapshot");
  await bob.queue.next("snapshot");

  // Bob moves to another map; Alice's map chat must not reach him.
  const bobPlayer = [...server.world.players.values()].find((player) => player.name === "Bob");
  bobPlayer.mapId = "skycity";
  const nextChat = async (queue, timeout = 2000) => {
    for (;;) {
      const event = await queue.next("event", timeout);
      if (event.event === "chatMessage") return event;
    }
  };
  const assertNoChat = async (queue, windowMs) => {
    try {
      for (;;) {
        const event = await queue.next("event", windowMs);
        assert.notEqual(event.event, "chatMessage", "chat leaked outside its scope");
      }
    } catch (error) {
      assert.match(String(error), /Timed out/);
    }
  };

  alice.socket.send(JSON.stringify({ type: "chat", channel: "map", text: "town only" }));
  const aliceEcho = await nextChat(alice.queue);
  assert.equal(aliceEcho.text, "town only");
  assert.equal(aliceEcho.scope, undefined, "scope never reaches the wire");
  await assertNoChat(bob.queue, 700);

  // Global chat reaches everyone after the cadence window.
  await new Promise((resolve) => setTimeout(resolve, 700));
  alice.socket.send(JSON.stringify({ type: "chat", channel: "global", text: "hello all" }));
  const bobGlobal = await nextChat(bob.queue);
  assert.equal(bobGlobal.text, "hello all");
});

test("gateway durably returns recovery and rotated sessions", async (t) => {
  const commits = [];
  const repository = {
    async saveAccounts(accounts, audits) {
      commits.push({ accounts: structuredClone(accounts), audits: structuredClone(audits) });
    },
    async close() {},
  };
  const server = createGameServer({
    host: "127.0.0.1",
    port: 0,
    accountRepository: repository,
    accountStore: {},
    worldOptions: { rng: () => 0.5, mobTargetCount: 0, spawnMobs: false },
  });
  await server.listen();
  t.after(() => server.close());
  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);
  t.after(() => socket.terminate());
  const messages = messageQueue(socket);
  await messages.next("welcome");

  socket.send(JSON.stringify({
    type: "join",
    protocol: 2,
    name: "Durable",
    archetype: "vanguard",
    nextToken: "a".repeat(43),
  }));
  const original = await messages.next("session");
  await messages.next("snapshot");
  assert.ok(commits.at(-1).accounts.durable.tokenHash);
  assert.equal(commits.at(-1).accounts.durable.token, undefined);

  socket.send(JSON.stringify({ type: "recoveryIssue" }));
  const recovery = await messages.next("recovery");
  assert.equal(recovery.name, "Durable");
  assert.ok(recovery.code.length >= 20);
  assert.ok(commits.at(-1).accounts.durable.recovery.hash);

  socket.send(JSON.stringify({ type: "sessionRotate", nextToken: "b".repeat(43) }));
  const rotated = await messages.next("session");
  assert.notEqual(rotated.token, original.token);
  assert.ok(commits.at(-1).audits.some((entry) => entry.action === "session_rotated"));

  socket.send(JSON.stringify({ type: "leave" }));
  await messages.next("roster");
  socket.send(JSON.stringify({
    type: "recover",
    protocol: 2,
    name: "Durable",
    code: recovery.code,
    nextToken: "c".repeat(43),
  }));
  const recovered = await messages.next("session");
  await messages.next("snapshot");
  assert.notEqual(recovered.token, rotated.token);
  assert.equal(commits.at(-1).accounts.durable.recovery, undefined);

  socket.send(JSON.stringify({ type: "leave" }));
  await messages.next("roster");
  socket.send(JSON.stringify({
    type: "join",
    protocol: 2,
    name: "Durable",
    archetype: "vanguard",
    token: rotated.token,
  }));
  const error = await messages.next("error");
  assert.equal(error.code, "INVALID_TOKEN", "rotation and recovery both revoke the older bearer");
});

test("gateway rolls back a credential mutation when durable storage fails", async (t) => {
  const accountStore = {};
  let failWrites = false;
  const repository = {
    async saveAccounts() {
      if (failWrites) throw new Error("database offline");
    },
    async close() {},
  };
  const server = createGameServer({
    host: "127.0.0.1",
    port: 0,
    accountRepository: repository,
    accountStore,
    worldOptions: { rng: () => 0.5, mobTargetCount: 0, spawnMobs: false },
  });
  await server.listen();
  failWrites = true;
  t.after(() => server.close());
  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);
  t.after(() => socket.terminate());
  const messages = messageQueue(socket);
  await messages.next("welcome");

  socket.send(JSON.stringify({
    type: "join",
    protocol: 2,
    name: "Rollback",
    archetype: "vanguard",
    nextToken: "d".repeat(43),
  }));
  const error = await messages.next("error");
  failWrites = false;
  assert.equal(error.code, "INTERNAL_ERROR");
  assert.equal(server.world.players.size, 0);
  assert.equal(Object.hasOwn(accountStore, "rollback"), false);
  assert.equal(server.world.auditLog.length, 1);
  const rollbackAudit = server.world.auditLog[0];
  assert.equal(rollbackAudit.action, "security_persistence_rolled_back");
  assert.equal(rollbackAudit.accountKey, "rollback");
  assert.equal(rollbackAudit.detail.command, "join");
  assert.equal(typeof rollbackAudit.detail.correlationId, "string");
  assert.equal(JSON.stringify(rollbackAudit).includes("d".repeat(43)), false);
  assert.equal(server._persistenceStatus().ok, false);
});
