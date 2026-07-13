import assert from "node:assert/strict";
import test from "node:test";

import { WebSocket } from "ws";

import { decodeSnapshotBinary, encodeSnapshotBinary } from "../src/server/codec.js";
import { createGameServer } from "../src/server/server.js";
import { World } from "../src/server/world.js";

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

test("binary1 snapshots survive an encode/decode round trip", () => {
  const world = new World({
    rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false,
  });
  const self = world.addPlayer("self-1", { name: "Codec", archetype: "vanguard" });
  const other = world.addPlayer("other-1", { name: "Rival", archetype: "eclipse" });
  other.inventory.push({
    id: "blade", slot: "weapon", rarity: "epic", tier: 4, level: 1,
    name: "Pulse Edge", bonuses: { power: 4 },
  });
  world.equipItem("other-1", "blade");
  world.spawnMob({ id: "mob-1", mapId: "town", x: self.x + 400, y: self.y, elite: true });
  world._placeDrop(self.x + 500, self.y + 300, world._rollSpecialDrop("uniq", 10));
  world._usePrimary(self, { x: 1, y: 0 });

  const snapshot = world.getSnapshot("self-1");
  const frame = encodeSnapshotBinary(snapshot);
  assert.equal(frame.readUInt8(0), 0xb1, "frame carries the codec magic");
  const decoded = decodeSnapshotBinary(frame);

  // Meta and self ride as JSON and must match exactly.
  assert.equal(decoded.tick, snapshot.tick);
  assert.equal(decoded.selfId, snapshot.selfId);
  assert.equal(decoded.mapId, snapshot.mapId);
  assert.equal(decoded.online, snapshot.online);
  assert.deepEqual(decoded.world, snapshot.world);
  assert.deepEqual(
    decoded.players.find((entry) => entry.id === "self-1"),
    snapshot.players.find((entry) => entry.id === "self-1"),
    "the recipient's full entry is preserved verbatim",
  );

  // Packed entities keep identity and float32-precision numbers.
  const packedOther = decoded.players.find((entry) => entry.id === "other-1");
  const jsonOther = snapshot.players.find((entry) => entry.id === "other-1");
  assert.equal(packedOther.name, "Rival");
  assert.equal(packedOther.level, jsonOther.level);
  assert.equal(round3(packedOther.x), round3(jsonOther.x));
  assert.equal(packedOther.equipment.weapon.name, "Pulse Edge");
  assert.equal(packedOther.equipment.weapon.rarity, "epic");

  const packedMob = decoded.enemies.find((entry) => entry.id === "mob-1");
  const jsonMob = snapshot.enemies.find((entry) => entry.id === "mob-1");
  assert.equal(packedMob.type, jsonMob.type);
  assert.equal(packedMob.elite, true);
  assert.equal(packedMob.level, jsonMob.level);
  assert.equal(round3(packedMob.maxHp), round3(jsonMob.maxHp));

  assert.equal(decoded.projectiles.length, snapshot.projectiles.length);
  assert.equal(decoded.drops.length, 1);
  assert.equal(decoded.drops[0].dropClass, "uniq");

  const jsonBytes = Buffer.byteLength(JSON.stringify(snapshot));
  assert.ok(frame.length < jsonBytes, `binary (${frame.length}) beats JSON (${jsonBytes})`);
});

test("binary snapshots defensively ignore a non-string equipment drop class", () => {
  const world = new World({
    rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false,
  });
  world.addPlayer("self-1", { name: "Codec", archetype: "vanguard" });
  const other = world.addPlayer("other-1", { name: "Rival", archetype: "eclipse" });
  other.inventory.push({
    id: "blade", slot: "weapon", rarity: "epic", tier: 4, level: 1,
    name: "Pulse Edge", bonuses: { power: 4 },
  });
  world.equipItem("other-1", "blade");
  other.equipment.weapon.dropClass = { toString: null };

  const decoded = decodeSnapshotBinary(encodeSnapshotBinary(world.getSnapshot("self-1")));
  const weapon = decoded.players.find((entry) => entry.id === "other-1").equipment.weapon;
  assert.equal(weapon.dropClass, undefined);
});

test("a client that negotiates binary1 receives binary snapshot frames", async (t) => {
  const server = createGameServer({
    host: "127.0.0.1",
    port: 0,
    persistPath: "",
    tickRate: 20,
    snapshotRate: 20,
    world: new World({ rng: () => 0.5, mobTargetCount: 2, spawnBoss: false }),
  });
  await server.listen();
  t.after(() => server.close());

  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`);
  t.after(() => socket.terminate());
  socket.binaryType = "nodebuffer";

  const binaryFrame = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no binary snapshot")), 3000);
    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        clearTimeout(timer);
        resolve(data);
        return;
      }
      const message = JSON.parse(data.toString());
      if (message.type === "welcome") {
        socket.send(JSON.stringify({
          type: "join", protocol: 2, codec: "binary1", name: "BinPilot", archetype: "vanguard",
        }));
      }
    });
    socket.on("error", reject);
  });

  const decoded = decodeSnapshotBinary(binaryFrame);
  assert.equal(decoded.type, "snapshot");
  assert.equal(decoded.players[0].name, "BinPilot");
  assert.equal(decoded.enemies.length, 2);
});

test("the shared-serialization paths match the canonical snapshot exactly", () => {
  const world = new World({
    rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false,
  });
  const a = world.addPlayer("a-1", { name: "Alpha", archetype: "vanguard" });
  world.addPlayer("b-1", { name: "Beta", archetype: "eclipse" });
  a.inventory.push({ id: "blade", slot: "weapon", rarity: "epic", tier: 4, level: 1, name: "Pulse Edge", bonuses: { power: 4 } });
  world.equipItem("a-1", "blade");
  world.spawnMob({ id: "mob-1", mapId: "town", x: a.x + 400, y: a.y, elite: true });
  world._placeDrop(a.x + 500, a.y + 300, world._rollSpecialDrop("uniq", 10));
  world._usePrimary(a, { x: 1, y: 0 });

  // JSON path: parses to the canonical object for every recipient, with and
  // without a warm cache.
  const cache = new Map();
  for (const id of ["a-1", "b-1"]) {
    assert.deepEqual(JSON.parse(world.getSnapshotJson(id, cache)), world.getSnapshot(id));
    assert.deepEqual(JSON.parse(world.getSnapshotJson(id)), world.getSnapshot(id));
  }

  // Binary path: cached sections decode identically to uncached encodes.
  const binCache = new Map();
  for (const id of ["a-1", "b-1"]) {
    const cached = decodeSnapshotBinary(encodeSnapshotBinary(world.getSnapshot(id), binCache));
    const fresh = decodeSnapshotBinary(encodeSnapshotBinary(world.getSnapshot(id)));
    assert.deepEqual(cached, fresh);
  }
});
