// Honour is standing, not a currency and not a build axis. These pin the three
// things that make it either: where it comes from, that gates read it without
// deducting it, and that it stays clear of Eclipse's reputation.
import assert from "node:assert/strict";
import test from "node:test";

import {
  HONOR_LIMIT, HONOR_PER_BOSS, HONOR_PER_ELITE, REFINE_HONOR_GATE,
} from "../src/server/definitions.js";
import { World, WorldError } from "../src/server/world.js";

function throwsCode(fn, code) {
  assert.throws(fn, (error) => error instanceof WorldError && error.code === code, `expected ${code}`);
}

function hunter() {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, safeZoneRadius: 0, autoLevel: false });
  const player = world.addPlayer("p-1", { name: "Hunter", archetype: "vanguard" });
  return { world, player };
}

test("only what fights back grants standing", () => {
  const { world, player } = hunter();
  assert.equal(player.honor, 0, "everyone starts unknown");

  const trash = world.spawnMob({ id: "trash", x: player.x + 300, y: player.y, maxHp: 1, level: 5 });
  world._damageMob(trash, 10, player.id);
  assert.equal(player.honor, 0, "trash mobs are not worth standing");

  const elite = world.spawnMob({ id: "elite", x: player.x + 300, y: player.y, maxHp: 1, level: 5, elite: true });
  world._damageMob(elite, 10, player.id);
  assert.equal(player.honor, HONOR_PER_ELITE);

  const boss = world.spawnMob({ id: "boss", x: player.x + 300, y: player.y, maxHp: 1, level: 5, boss: true });
  world._damageMob(boss, 10, player.id);
  assert.equal(player.honor, HONOR_PER_ELITE + HONOR_PER_BOSS, "a boss is worth more than an elite");
});

test("standing is announced and bounded", () => {
  const { world, player } = hunter();
  world.drainEvents();

  const elite = world.spawnMob({ id: "elite", x: player.x + 300, y: player.y, maxHp: 1, level: 5, elite: true });
  world._damageMob(elite, 10, player.id);
  const event = world.drainEvents().find((entry) => entry.event === "honorChanged");
  assert.ok(event, "the player is told their standing moved");
  assert.equal(event.honor, HONOR_PER_ELITE);
  assert.equal(event.delta, HONOR_PER_ELITE);

  player.honor = HONOR_LIMIT;
  world._grantHonor(player, 50);
  assert.equal(player.honor, HONOR_LIMIT, "standing is capped");
  player.honor = -HONOR_LIMIT;
  world._grantHonor(player, -50);
  assert.equal(player.honor, -HONOR_LIMIT, "in both directions, ready for PvP to push it down");
});

test("refining past +2 asks for standing, and never spends it", () => {
  // 0.1 clears every rung: this case is about the gate, not the odds.
  const world = new World({ rng: () => 0.1, spawnMobs: false, mobTargetCount: 0, safeZoneRadius: 0, autoLevel: false });
  const player = world.addPlayer("p-1", { name: "Hunter", archetype: "vanguard" });
  const smith = world.shops.find((shop) => shop.id === "smith");
  player.x = smith.x;
  player.y = smith.y;
  player.will = 1_000_000;
  player.gold = 1_000_000;
  const item = {
    id: "blade-1", slot: "weapon", rarity: "rare", tier: 3, level: 10,
    name: "test-blade", bonuses: { power: 10, agility: 0, spirit: 0, vitality: 0 },
  };
  player.inventory.push(item);

  // The first two rungs are open to everyone: a fresh drop is always improvable.
  assert.equal(REFINE_HONOR_GATE[0], 0);
  assert.equal(REFINE_HONOR_GATE[1], 0);
  world.handleCommand("p-1", { type: "refine", item: "blade-1" });
  world.handleCommand("p-1", { type: "refine", item: "blade-1" });
  assert.equal(item.refine, 2, "an unknown hunter can still reach +2");

  throwsCode(() => world.refineItem("p-1", "blade-1"), "NOT_ENOUGH_HONOR");

  player.honor = REFINE_HONOR_GATE[2];
  const honorBefore = player.honor;
  world.handleCommand("p-1", { type: "refine", item: "blade-1" });
  assert.equal(item.refine, 3);
  assert.equal(player.honor, honorBefore, "standing is a threshold, not a price");

  // The last rung asks for more than the one before it.
  assert.ok(REFINE_HONOR_GATE[3] > REFINE_HONOR_GATE[2]);
  throwsCode(() => world.refineItem("p-1", "blade-1"), "NOT_ENOUGH_HONOR");
  player.honor = REFINE_HONOR_GATE[3];
  world.handleCommand("p-1", { type: "refine", item: "blade-1" });
  assert.equal(item.refine, 4);
  assert.equal(player.honor, REFINE_HONOR_GATE[3], "still not spent");
});

test("honour and Eclipse's reputation are different numbers", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, safeZoneRadius: 0, autoLevel: false });
  const player = world.addPlayer("e-1", { name: "Dusk", archetype: "eclipse" });

  // Reputation is a build axis the player steers on purpose: its sign flips
  // the whole Eclipse kit. Standing must not drag it around.
  world.handleCommand("e-1", { type: "attune", path: "abyss" });
  const east = { x: player.x + 100, y: player.y };
  player.nextSkillAt.q = 0;
  world._useSkill(player, "q", east);
  assert.ok(player.reputation < 0, "casting steered reputation toward the chosen path");
  assert.equal(player.honor, 0, "and left standing alone");

  const elite = world.spawnMob({ id: "elite", x: player.x + 300, y: player.y, maxHp: 1, level: 5, elite: true });
  const reputationBefore = player.reputation;
  world._damageMob(elite, 10, player.id);
  assert.equal(player.honor, HONOR_PER_ELITE, "the kill granted standing");
  assert.equal(player.reputation, reputationBefore, "and did not flip the player's chosen attunement");
});

test("standing survives a relogin", () => {
  const { world, player } = hunter();
  player.honor = 321;
  world.syncAccounts();
  world.removePlayer("p-1");

  const restored = world.addPlayer("p-2", { name: "Hunter", archetype: "vanguard", token: player.token });
  assert.equal(restored.honor, 321);
});
