import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { WebSocket } from "ws";

import { PROTOCOL_VERSION } from "../src/server/definitions.js";
import { PLAYER_PUBLIC, PLAYER_SELF, PROTOCOL, validate } from "../src/server/protocol.js";
import { createGameServer } from "../src/server/server.js";
import { World } from "../src/server/world.js";

const worldSource = readFileSync(new URL("../src/server/world.js", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("../src/server/server.js", import.meta.url), "utf8");

function assertConformant(problems) {
  assert.deepEqual(problems, []);
}

test("the schema version matches PROTOCOL_VERSION", () => {
  assert.equal(PROTOCOL.version, PROTOCOL_VERSION);
});

test("snapshots conform to the protocol schema, field by field", () => {
  const world = new World({
    rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false,
  });
  const self = world.addPlayer("self-1", { name: "Schema", archetype: "vanguard" });
  world.addPlayer("other-1", { name: "Rival", archetype: "eclipse" });
  world.handleCommand("self-1", { type: "partyInvite", target: "other-1" });
  world.handleCommand("other-1", { type: "partyAccept", from: "self-1" });
  world.addFriend("self-1", "Rival");

  // Bag and body carry every item shape: rolled gear, a relic with an
  // attack formula, a potion, and a worn weapon.
  self.inventory.push(world._rollItem(5), world._rollRelic(20), world._rollPotion(3));
  world.giveItem("self-1", { slot: "weapon", bonuses: { power: 3 } });
  world.equipItem("self-1", self.inventory.at(-1).id);

  // A regular mob, an elite, and a boss-shaped entry on the same map.
  world.spawnMob({ id: "mob-plain", mapId: "town", x: self.x + 600, y: self.y });
  world.spawnMob({ id: "mob-elite", mapId: "town", x: self.x + 650, y: self.y, elite: true });
  world.spawnMob({ id: "mob-boss", mapId: "town", x: self.x + 700, y: self.y, boss: true, level: 40 });

  // Ground drops: gear, a special uniq piece, and a potion (far from the
  // magnet radius so they stay put).
  world._placeDrop(self.x + 600, self.y + 200, world._rollItem(6));
  world._placeDrop(self.x + 650, self.y + 200, world._rollSpecialDrop("uniq", 10));
  world._placeDrop(self.x + 700, self.y + 200, world._rollPotion(4));

  // A projectile in flight.
  world._usePrimary(self, { x: 1, y: 0 });

  const snapshot = world.getSnapshot("self-1");
  assertConformant(validate(snapshot, PROTOCOL.serverMessages.snapshot, "snapshot"));
  assert.equal(snapshot.players.length, 2);
  for (const entry of snapshot.players) {
    const spec = entry.id === snapshot.selfId ? PLAYER_SELF : PLAYER_PUBLIC;
    assertConformant(validate(entry, spec, `players[${entry.id}]`));
  }
  assert.equal(snapshot.enemies.length, 3, "all mob variants serialized");
  assert.equal(snapshot.drops.length, 3, "all drop variants serialized");
  assert.ok(snapshot.projectiles.length >= 1, "projectile serialized");
});

test("emitted events carry documented names and conformant payloads", () => {
  const world = new World({
    rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false, safeZoneRadius: 0,
  });
  const player = world.addPlayer("p-1", { name: "Emitter", archetype: "vanguard" });
  world.allocateStat("p-1", "power");
  world.upgradeSkill("p-1", "q");
  world.setAutoFight("p-1", false);
  world.setAutoEquipMode("p-1", false);
  world._useSkill(player, "q", { x: 1, y: 0 });
  const prey = world.spawnMob({ id: "prey", x: player.x + 300, y: player.y, maxHp: 1, xp: 10 });
  world._damageMob(prey, 10, "p-1");
  world.giveItem("p-1", { slot: "weapon", bonuses: { power: 1 } });
  world.sellItem("p-1", player.inventory.at(-1).id);
  world.detachPlayer("p-1");
  world.resumeDetachedPlayer({ name: player.name, token: player.token });
  world.removePlayer("p-1");

  const events = world.drainEvents();
  assert.ok(events.length >= 6, "the scenario produced a spread of events");
  for (const event of events) {
    assert.ok(
      Object.hasOwn(PROTOCOL.events, event.event),
      `undocumented event emitted: ${event.event}`,
    );
    const payloadSpec = PROTOCOL.events[event.event];
    if (!payloadSpec) continue;
    // `scope` is gateway-internal delivery routing, stripped before the wire.
    const { scope: _scope, ...wireEvent } = event;
    const spec = { event: "string", tick: "number", serverTime: "number", ...payloadSpec };
    assertConformant(validate(wireEvent, spec, `event:${event.event}`));
  }
});

test("gateway messages (welcome/session/roster/error) conform on the wire", async (t) => {
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
  assertConformant(validate(welcome, PROTOCOL.serverMessages.welcome, "welcome"));

  socket.send(JSON.stringify({ type: "join", protocol: PROTOCOL_VERSION, name: "Wire", archetype: "strider" }));
  const session = await messages.next("session");
  assertConformant(validate(session, PROTOCOL.serverMessages.session, "session"));
  const snapshot = await messages.next("snapshot");
  assertConformant(validate(snapshot, PROTOCOL.serverMessages.snapshot, "snapshot"));

  socket.send(JSON.stringify({ type: "recoveryIssue" }));
  const recovery = await messages.next("recovery");
  assertConformant(validate(recovery, PROTOCOL.serverMessages.recovery, "recovery"));
  socket.send(JSON.stringify({ type: "sessionRotate" }));
  const rotated = await messages.next("session");
  assertConformant(validate(rotated, PROTOCOL.serverMessages.session, "rotated-session"));

  socket.send(JSON.stringify({ type: "dance" }));
  const error = await messages.next("error");
  assertConformant(validate(error, PROTOCOL.serverMessages.error, "error"));
  assert.ok(PROTOCOL.errorCodes.includes(error.code));

  const lobby = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);
  t.after(() => lobby.terminate());
  const lobbyMessages = messageQueue(lobby);
  await lobbyMessages.next("welcome");
  const roster = await lobbyMessages.next("roster", 3000);
  assertConformant(validate(roster, PROTOCOL.serverMessages.roster, "roster"));
});

test("every implemented command is documented, and vice versa", () => {
  const cases = [...worldSource.matchAll(/case "([a-zA-Z]+)":/g)].map((match) => match[1]);
  // join/start and recover are pre-session commands handled before the
  // joined-player switch. clientState is connection metadata handled by the
  // gateway because it controls delivery rather than authoritative gameplay.
  const implemented = new Set([
    ...cases, "join", "start", "recover", "clientState",
  ].map((name) => name.toLowerCase()));
  const documented = new Set(Object.keys(PROTOCOL.clientMessages).map((name) => name.toLowerCase()));
  for (const alias of Object.keys(PROTOCOL.commandAliases)) documented.add(alias.toLowerCase());

  for (const name of implemented) {
    assert.ok(documented.has(name), `implemented but undocumented command: ${name}`);
  }
  for (const name of Object.keys(PROTOCOL.clientMessages)) {
    assert.ok(implemented.has(name.toLowerCase()), `documented but unimplemented command: ${name}`);
  }
});

test("every emitted event name is documented, and vice versa", () => {
  const emitted = new Set([...worldSource.matchAll(/_emit\(\s*"([a-zA-Z]+)"/g)].map((match) => match[1]));
  const documented = new Set(Object.keys(PROTOCOL.events));
  for (const name of emitted) {
    assert.ok(documented.has(name), `emitted but undocumented event: ${name}`);
  }
  for (const name of documented) {
    assert.ok(emitted.has(name), `documented but never emitted event: ${name}`);
  }
});

test("every thrown error code is documented, and vice versa", () => {
  const thrown = new Set([
    ...[...worldSource.matchAll(/WorldError\(\s*"([A-Z_]+)"/g)].map((match) => match[1]),
    ...[...serverSource.matchAll(/WorldError\(\s*"([A-Z_]+)"/g)].map((match) => match[1]),
    ...[...serverSource.matchAll(/sendError\(socket,\s*"([A-Z_]+)"/g)].map((match) => match[1]),
  ]);
  const documented = new Set(PROTOCOL.errorCodes);
  for (const code of thrown) {
    assert.ok(documented.has(code), `thrown but undocumented error code: ${code}`);
  }
  for (const code of documented) {
    assert.ok(thrown.has(code), `documented but never thrown error code: ${code}`);
  }
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
