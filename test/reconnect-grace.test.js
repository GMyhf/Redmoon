import assert from "node:assert/strict";
import test from "node:test";

import { WebSocket } from "ws";

import { PROTOCOL_VERSION } from "../src/server/definitions.js";
import { createGameServer } from "../src/server/server.js";
import { World, WorldError } from "../src/server/world.js";

test("a detached player keeps its party and dungeon seat until resumed or removed", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const host = world.addPlayer("host", { name: "GraceHost", archetype: "vanguard" });
  const guest = world.addPlayer("guest", { name: "GraceGuest", archetype: "strider" });
  world.inviteParty(host.id, guest.id);
  world.acceptParty(guest.id, host.id);
  world.enterDungeon(host.id);

  const partyId = guest.partyId;
  const dungeon = [...world.dungeons.values()][0];
  const mapId = guest.mapId;
  const position = { x: guest.x, y: guest.y };
  world.setInput(guest.id, { seq: 100, move: { x: 1, y: 0 } });

  assert.equal(world.detachPlayer(guest.id), true);
  assert.equal(guest.connectionDetached, true);
  assert.equal(guest.inputSeq, 0, "a fresh client input sequence starts cleanly after resume");
  assert.equal(world.onlinePlayerCount(), 1);
  assert.deepEqual(world.getRoster().map((entry) => entry.name), ["GraceHost"]);
  assert.deepEqual(world.parties.get(partyId).members, [host.id, guest.id]);
  assert.equal(dungeon.members.has(guest.id), true);
  assert.equal(guest.mapId, mapId);

  world.update(0.1);
  assert.deepEqual({ x: guest.x, y: guest.y }, position, "detached players do not keep moving");
  assert.throws(
    () => world.resumeDetachedPlayer({ name: guest.name, token: "not-the-token" }),
    (error) => error instanceof WorldError && error.code === "INVALID_TOKEN",
  );
  assert.equal(guest.connectionDetached, true, "a rejected bearer cannot claim the seat");

  const resumed = world.resumeDetachedPlayer({
    name: guest.name,
    archetype: "vanguard",
    token: guest.token,
  });
  assert.equal(resumed, guest, "resume preserves the exact player object and id");
  assert.equal(resumed.connectionDetached, false);
  assert.equal(resumed.partyId, partyId);
  assert.equal(resumed.mapId, mapId);
  assert.equal(dungeon.members.has(resumed.id), true);
  assert.equal(world.onlinePlayerCount(), 2);
  world.setInput(resumed.id, { seq: 1, move: { x: 0, y: 1 } });
  assert.equal(resumed.inputSeq, 1);
  assert.deepEqual(resumed.input.move, { x: 0, y: 1 });

  world.detachPlayer(guest.id);
  world.removePlayer(guest.id);
  assert.equal(world.players.has(guest.id), false, "expiry performs the normal removal");
  assert.equal(dungeon.members.has(guest.id), false);
  assert.equal(world.parties.has(partyId), false);
  assert.equal(host.partyId, null);
});

test("the gateway reattaches a valid bearer during grace and expires it deterministically", async (t) => {
  const server = createGameServer({
    host: "127.0.0.1",
    port: 0,
    persistPath: "",
    reconnectGraceMs: 60_000,
    tickRate: 20,
    snapshotRate: 20,
    world: new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 }),
  });
  await server.listen();
  t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.address().port}/ws`;

  const hostSocket = new WebSocket(url);
  t.after(() => hostSocket.terminate());
  const hostMessages = messageQueue(hostSocket);
  await hostMessages.next("welcome");
  hostSocket.send(JSON.stringify({
    type: "join", protocol: PROTOCOL_VERSION, name: "SocketHost", archetype: "vanguard",
  }));
  await hostMessages.next("session");
  const hostSnapshot = await hostMessages.next("snapshot");

  const guestSocket = new WebSocket(url);
  const guestMessages = messageQueue(guestSocket);
  await guestMessages.next("welcome");
  guestSocket.send(JSON.stringify({
    type: "join", protocol: PROTOCOL_VERSION, name: "SocketGuest", archetype: "strider",
  }));
  const guestSession = await guestMessages.next("session");
  const guestSnapshot = await guestMessages.next("snapshot");
  const guestId = guestSnapshot.selfId;
  const guest = server.world.players.get(guestId);

  server.world.inviteParty(hostSnapshot.selfId, guestId);
  server.world.acceptParty(guestId, hostSnapshot.selfId);
  server.world.enterDungeon(hostSnapshot.selfId);
  const partyId = guest.partyId;
  const dungeon = [...server.world.dungeons.values()][0];
  const dungeonMap = guest.mapId;

  guestSocket.terminate();
  await waitFor(() => guest.connectionDetached);
  assert.deepEqual(server.world.parties.get(partyId).members, [hostSnapshot.selfId, guestId]);
  assert.equal(dungeon.members.has(guestId), true);
  assert.equal(guest.mapId, dungeonMap);

  hostSocket.send(JSON.stringify({
    type: "join",
    protocol: PROTOCOL_VERSION,
    name: "SocketGuest",
    archetype: "strider",
    token: guestSession.token,
  }));
  assert.equal((await hostMessages.next("error")).code, "ALREADY_JOINED");
  assert.equal(server.world.players.get(hostSnapshot.selfId).connectionDetached, false);
  assert.equal(guest.connectionDetached, true, "a joined socket cannot steal another reserved seat");

  const rejectedSocket = new WebSocket(url);
  t.after(() => rejectedSocket.terminate());
  const rejectedMessages = messageQueue(rejectedSocket);
  await rejectedMessages.next("welcome");
  rejectedSocket.send(JSON.stringify({
    type: "join",
    protocol: PROTOCOL_VERSION,
    name: "SocketGuest",
    archetype: "strider",
    token: "wrong-bearer",
  }));
  assert.equal((await rejectedMessages.next("error")).code, "INVALID_TOKEN");
  assert.equal(guest.connectionDetached, true);

  const resumedSocket = new WebSocket(url);
  t.after(() => resumedSocket.terminate());
  const resumedMessages = messageQueue(resumedSocket);
  const welcome = await resumedMessages.next("welcome");
  assert.deepEqual(
    welcome.roster.map((entry) => entry.name),
    ["SocketHost"],
    "the reserved seat is not counted as online",
  );
  resumedSocket.send(JSON.stringify({
    type: "join",
    protocol: 1,
    name: "SocketGuest",
    archetype: "vanguard",
    token: guestSession.token,
  }));
  assert.equal((await resumedMessages.next("error")).code, "PROTOCOL_MISMATCH");
  assert.equal(guest.connectionDetached, true, "a stale client cannot claim the reserved seat");
  resumedSocket.send(JSON.stringify({
    type: "join",
    protocol: PROTOCOL_VERSION,
    name: "SocketGuest",
    archetype: "vanguard",
    token: guestSession.token,
  }));
  const resumedSession = await resumedMessages.next("session");
  const resumedSnapshot = await resumedMessages.next("snapshot");
  assert.equal(resumedSession.archetype, "strider", "the stored character wins over stale UI state");
  assert.equal(resumedSnapshot.selfId, guestId, "the new socket takes over the original world id");
  assert.equal(server.world.players.get(guestId), guest);
  assert.equal(guest.connectionDetached, false);
  assert.equal(guest.partyId, partyId);
  assert.equal(guest.mapId, dungeonMap);
  assert.equal(server._reconnectTimers.has(guestId), false, "resume cancels the old expiry");

  resumedSocket.terminate();
  await waitFor(() => guest.connectionDetached);
  assert.equal(await server._expireDetachedPlayer(guestId), true);
  assert.equal(server.world.players.has(guestId), false);
  assert.equal(dungeon.members.has(guestId), false);
  assert.equal(server.world.parties.has(partyId), false);

  hostSocket.send(JSON.stringify({ type: "leave" }));
  await hostMessages.next("roster");
  assert.equal(server.world.players.has(hostSnapshot.selfId), false, "explicit leave skips grace");
  assert.equal(server.world.dungeons.size, 0);
});

test("a recovery response lost after commit retries through the detached seat", async (t) => {
  const server = createGameServer({
    host: "127.0.0.1",
    port: 0,
    persistPath: "",
    reconnectGraceMs: 60_000,
    tickRate: 20,
    snapshotRate: 20,
    world: new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 }),
  });
  await server.listen();
  t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.address().port}/ws`;

  const ownerSocket = new WebSocket(url);
  const ownerMessages = messageQueue(ownerSocket);
  await ownerMessages.next("welcome");
  ownerSocket.send(JSON.stringify({
    type: "join", protocol: PROTOCOL_VERSION, name: "RecoveryGrace", archetype: "eclipse",
  }));
  await ownerMessages.next("session");
  await ownerMessages.next("snapshot");
  ownerSocket.send(JSON.stringify({ type: "recoveryIssue" }));
  const recovery = await ownerMessages.next("recovery");
  ownerSocket.send(JSON.stringify({ type: "leave" }));
  await ownerMessages.next("roster");
  ownerSocket.close();

  const nextToken = "r".repeat(43);
  const firstRecovery = new WebSocket(url);
  const firstMessages = messageQueue(firstRecovery);
  await firstMessages.next("welcome");
  firstRecovery.send(JSON.stringify({
    type: "recover",
    protocol: PROTOCOL_VERSION,
    name: "RecoveryGrace",
    code: recovery.code,
    nextToken,
  }));
  await firstMessages.next("session");
  const firstSnapshot = await firstMessages.next("snapshot");
  firstRecovery.terminate();
  await waitFor(() => server.world.players.get(firstSnapshot.selfId)?.connectionDetached);

  const retrySocket = new WebSocket(url);
  t.after(() => retrySocket.terminate());
  const retryMessages = messageQueue(retrySocket);
  await retryMessages.next("welcome");
  retrySocket.send(JSON.stringify({
    type: "recover",
    protocol: PROTOCOL_VERSION,
    name: "RecoveryGrace",
    code: recovery.code,
    nextToken,
  }));
  const retrySession = await retryMessages.next("session");
  const retrySnapshot = await retryMessages.next("snapshot");
  assert.equal(retrySession.token, nextToken);
  assert.equal(retrySession.archetype, "eclipse");
  assert.equal(retrySnapshot.selfId, firstSnapshot.selfId);
  assert.equal(server.world.players.get(firstSnapshot.selfId).connectionDetached, false);
});

function messageQueue(socket) {
  const buffered = [];
  const waiters = [];
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString());
    const index = waiters.findIndex((waiter) => waiter.type === message.type);
    if (index >= 0) {
      const [waiter] = waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    } else {
      buffered.push(message);
    }
  });
  return {
    next(type, timeout = 1500) {
      const index = buffered.findIndex((message) => message.type === type);
      if (index >= 0) return Promise.resolve(buffered.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { type, resolve, timer: null };
        waiter.timer = setTimeout(() => {
          const waiterIndex = waiters.indexOf(waiter);
          if (waiterIndex >= 0) waiters.splice(waiterIndex, 1);
          reject(new Error(`Timed out waiting for ${type}`));
        }, timeout);
        waiters.push(waiter);
      });
    },
  };
}

async function waitFor(predicate, timeout = 1500) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
