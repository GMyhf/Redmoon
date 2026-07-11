import assert from "node:assert/strict";
import test from "node:test";

import { World, WorldError } from "../src/server/world.js";

test("World is deterministic with an injected RNG and applies authoritative input", () => {
  const first = new World({ rng: () => 0.5, mobTargetCount: 2 });
  const second = new World({ rng: () => 0.5, mobTargetCount: 2 });

  first.handleCommand("player-1", { type: "join", name: "Nova", archetype: "strider" });
  second.handleCommand("player-1", { type: "join", name: "Nova", archetype: "strider" });
  first.handleCommand("player-1", {
    type: "input",
    seq: 7,
    move: { x: 2, y: 0 },
    aim: { x: 1200, y: 450 },
  });
  second.handleCommand("player-1", {
    type: "input",
    seq: 7,
    move: { x: 2, y: 0 },
    aim: { x: 1200, y: 450 },
  });

  first.update(0.05);
  second.update(0.05);

  assert.deepEqual(first.getSnapshot("player-1"), second.getSnapshot("player-1"));
  const player = first.players.get("player-1");
  assert.ok(player.x > 800);
  assert.equal(player.inputSeq, 7);

  // Older sequence numbers cannot overwrite newer client input.
  first.setInput("player-1", { type: "input", seq: 6, move: { x: -1, y: 0 } });
  assert.equal(first.players.get("player-1").input.move.x, 1);
});

test("stat allocation and both archetype skills can be upgraded", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false });
  const player = world.addPlayer("player-1", { name: "  Relay   One  ", archetype: "channeler" });
  const oldMaxHp = player.maxHp;

  world.handleCommand("player-1", { type: "allocate", stat: "vitality" });
  world.handleCommand("player-1", { type: "upgrade", skill: "arc-lance" });

  assert.equal(player.name, "Relay One");
  assert.equal(player.stats.vitality, 5);
  assert.equal(player.statPoints, 2);
  assert.ok(player.maxHp > oldMaxHp);
  assert.equal(player.skillLevels.q, 2);
  assert.equal(player.skillPoints, 0);
  assert.throws(
    () => world.handleCommand("player-1", { type: "allocate", stat: "luck" }),
    (error) => error instanceof WorldError && error.code === "INVALID_STAT",
  );
});

test("projectiles defeat enemies, award XP, and advance the kill quest", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const player = world.addPlayer("player-1", { archetype: "channeler" });
  const enemy = world.spawnMob({
    id: "target",
    x: player.x + 90,
    y: player.y,
    maxHp: 1,
    speed: 0.001,
    xp: 31,
  });

  world.setInput(player.id, {
    seq: 1,
    move: { x: 0, y: 0 },
    aim: { x: enemy.x, y: enemy.y },
    primary: true,
  });
  for (let index = 0; index < 8 && world.mobs.has(enemy.id); index += 1) {
    world.update(0.05);
  }

  assert.equal(world.mobs.has(enemy.id), false);
  assert.equal(player.xp, 31);
  assert.equal(player.quest.progress, 1);
  assert.ok(world.drainEvents().some((event) => event.event === "enemyDefeated"));
});

test("piercing projectiles cannot damage the same enemy more than once", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const player = world.addPlayer("player-1", { archetype: "channeler" });
  const enemy = world.spawnMob({
    id: "durable-target",
    x: player.x + 90,
    y: player.y,
    maxHp: 1_000,
    speed: 0.001,
  });

  world.setInput(player.id, {
    seq: 1,
    move: { x: 0, y: 0 },
    aim: { x: enemy.x, y: enemy.y },
    q: true,
  });
  for (let index = 0; index < 12; index += 1) world.update(0.05);

  const expectedDamage = 27 + 9 + player.stats.spirit * 2.25;
  assert.equal(enemy.hp, 1_000 - expectedDamage);
});

test("a defeated player observes the respawn delay and can return at full health", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const player = world.addPlayer("player-1", { archetype: "strider" });
  world.spawnMob({
    id: "brute",
    x: player.x + player.radius + 14,
    y: player.y,
    speed: 0.001,
    damage: 10_000,
  });

  world.update(0.05);
  assert.equal(player.alive, false);
  assert.throws(
    () => world.respawnPlayer(player.id),
    (error) => error instanceof WorldError && error.code === "RESPAWN_PENDING",
  );

  for (let index = 0; index < 61; index += 1) world.update(0.05);
  world.respawnPlayer(player.id);
  assert.equal(player.alive, true);
  assert.equal(player.hp, player.maxHp);
});
