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
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, safeZoneRadius: 0 });
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

test("a click-to-move order walks the player to the destination and stops", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const player = world.addPlayer("player-1", { archetype: "strider" });
  const destination = { x: player.x + 160, y: player.y - 120 };

  world.handleCommand("player-1", { type: "input", seq: 1, moveTo: destination });
  for (let index = 0; index < 60; index += 1) world.update(0.05);

  assert.ok(Math.hypot(player.x - destination.x, player.y - destination.y) < 6);
  assert.equal(player.moveTarget, null);

  // Manual keyboard movement cancels any standing order.
  world.handleCommand("player-1", { type: "input", seq: 2, moveTo: destination });
  world.handleCommand("player-1", { type: "input", seq: 3, move: { x: 0, y: 1 } });
  world.update(0.05);
  assert.equal(player.moveTarget, null);
});

test("marking an enemy walks the player into range and auto-attacks it down", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, safeZoneRadius: 0 });
  const player = world.addPlayer("player-1", { archetype: "channeler" });
  const enemy = world.spawnMob({
    id: "quarry",
    x: player.x + 700,
    y: player.y,
    maxHp: 30,
    speed: 0.001,
    damage: 0.001,
    xp: 40,
  });

  world.handleCommand("player-1", { type: "input", seq: 1, target: enemy.id });
  for (let index = 0; index < 200 && world.mobs.has(enemy.id); index += 1) {
    world.update(0.05);
  }

  assert.equal(world.mobs.has(enemy.id), false);
  assert.equal(player.xp, 40);
  assert.equal(player.attackTarget, null);
});

test("rebirth requires the unlock level and grants permanent bonuses", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const player = world.addPlayer("player-1", { archetype: "vanguard" });
  const baselineMaxHp = player.maxHp;

  assert.throws(
    () => world.handleCommand("player-1", { type: "rebirth" }),
    (error) => error instanceof WorldError && error.code === "REBIRTH_LEVEL_TOO_LOW",
  );

  world._grantXp(player, 10_000);
  assert.ok(player.level >= 10);
  const statPointsBefore = player.statPoints;

  world.handleCommand("player-1", { type: "rebirth" });

  assert.equal(player.rebirths, 1);
  assert.equal(player.level, 1);
  assert.equal(player.xp, 0);
  assert.equal(player.statPoints, statPointsBefore + 6);
  assert.ok(player.maxHp > baselineMaxHp);
  assert.equal(player.hp, player.maxHp);
  assert.ok(world.drainEvents().some((event) => event.event === "playerReborn"));
});

test("defeated enemies drop equipment that players pick up by walking over it", () => {
  const world = new World({ rng: () => 0.1, spawnMobs: false, mobTargetCount: 0, safeZoneRadius: 0 });
  const player = world.addPlayer("player-1", { archetype: "channeler" });
  const enemy = world.spawnMob({
    id: "carrier",
    x: player.x + 120,
    y: player.y,
    maxHp: 1,
    speed: 0.001,
    damage: 0.001,
    level: 3,
  });

  world.setInput(player.id, { seq: 1, aim: { x: enemy.x, y: enemy.y }, primary: true });
  for (let index = 0; index < 10 && world.mobs.has("carrier"); index += 1) world.update(0.05);

  assert.equal(world.mobs.has("carrier"), false);
  // rng of 0.1 rolls both the potion drop and the gear drop.
  const dropped = world.drops.size;
  assert.ok(dropped >= 1);
  assert.equal(world.getSnapshot().drops.length, dropped);
  const drop = [...world.drops.values()][0];
  assert.ok(drop.item.id);

  world.setInput(player.id, { seq: 2, aim: { x: enemy.x, y: enemy.y }, primary: false });
  world.handleCommand("player-1", { type: "input", seq: 3, moveTo: { x: drop.x, y: drop.y } });
  for (let index = 0; index < 60 && world.drops.size > 0; index += 1) world.update(0.05);

  assert.equal(world.drops.size, 0);
  assert.equal(player.inventory.length, dropped);
  assert.ok(world.drainEvents().some((event) => event.event === "lootPickedUp"));
});

test("mob level rises with distance from town, the boss respawns, and potions heal", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const near = world.spawnMob({ id: "near", x: world.width / 2 + 320, y: world.height / 2 });
  const far = world.spawnMob({ id: "far", x: world.width - 100, y: 100 });
  assert.ok(near.level <= 3);
  assert.ok(far.level >= 7);

  const player = world.addPlayer("player-1", { archetype: "vanguard" });
  const boss = world.spawnBoss();
  assert.equal(boss.boss, true);
  world._damageMob(boss, 1_000_000, player.id);
  assert.equal(world.mobs.has(boss.id), false);
  const drops = [...world.drops.values()];
  const gearDrops = drops.filter((drop) => drop.item.tier >= 3);
  assert.ok(gearDrops.length >= 3, "boss must drop rare-or-better gear");
  assert.ok(drops.some((drop) => drop.item.slot === "potion"));
  assert.ok(world.drainEvents().some((event) => event.event === "bossSlain"));

  // The boss respawns on a timer.
  for (let index = 0; index < 1801 && !world.mobs.has("boss-warden"); index += 1) world.update(0.05);
  assert.equal(world.mobs.has("boss-warden"), true);

  // Potions heal and are consumed; they cannot be equipped.
  const potion = world.giveItem("player-1", { slot: "potion", heal: 40, name: "Mending Vial" });
  player.hp = player.maxHp - 60;
  world.handleCommand("player-1", { type: "use", item: potion.id });
  assert.equal(player.hp, player.maxHp - 20);
  assert.equal(player.inventory.length, 0);
  const flask = world.giveItem("player-1", { slot: "potion", heal: 40 });
  assert.throws(
    () => world.handleCommand("player-1", { type: "equip", item: flask.id }),
    (error) => error instanceof WorldError && error.code === "INVALID_ITEM",
  );
});

test("equipping gear raises combat power and swaps the old piece back to the bag", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const player = world.addPlayer("player-1", { archetype: "vanguard" });
  const oldMaxHp = player.maxHp;
  const sword = world.giveItem("player-1", {
    slot: "weapon",
    bonuses: { power: 4, agility: 0, spirit: 0, vitality: 2 },
    damageBonus: 0.12,
  });

  world.handleCommand("player-1", { type: "equip", item: sword.id });
  assert.equal(player.equipment.weapon.id, sword.id);
  assert.equal(player.inventory.length, 0);
  assert.ok(player.maxHp > oldMaxHp);

  world.setInput(player.id, { seq: 1, aim: { x: player.x + 100, y: player.y }, primary: true });
  world.update(0.05);
  const projectile = [...world.projectiles.values()][0];
  const expected = (13 + (6 + 4) * 1.55 + 2 * 0.38) * 1.12;
  assert.ok(Math.abs(projectile.damage - expected) < 0.000001);

  const spare = world.giveItem("player-1", { slot: "weapon", bonuses: { power: 1, agility: 0, spirit: 0, vitality: 0 } });
  world.handleCommand("player-1", { type: "equip", item: spare.id });
  assert.equal(player.equipment.weapon.id, spare.id);
  assert.deepEqual(player.inventory.map((item) => item.id), [sword.id]);

  world.handleCommand("player-1", { type: "discard", item: sword.id });
  assert.equal(player.inventory.length, 0);
  assert.throws(
    () => world.handleCommand("player-1", { type: "equip", item: "missing" }),
    (error) => error instanceof WorldError && error.code === "INVALID_ITEM",
  );
});

test("gear slots cover the whole body and items can be unequipped", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const player = world.addPlayer("player-1", { archetype: "strider" });
  assert.deepEqual(
    Object.keys(player.equipment).sort(),
    ["armor", "boots", "charm", "helm", "necklace", "ring", "weapon"],
  );

  const boots = world.giveItem("player-1", {
    slot: "boots",
    bonuses: { power: 0, agility: 2, spirit: 0, vitality: 0 },
    speedBonus: 14,
  });
  world.handleCommand("player-1", { type: "equip", item: boots.id });
  assert.equal(player.equipment.boots.id, boots.id);
  assert.equal(player.gearMods.speed, 14);
  assert.equal(player.gearStats.agility, 2);

  world.handleCommand("player-1", { type: "unequip", slot: "boots" });
  assert.equal(player.equipment.boots, null);
  assert.equal(player.gearMods.speed, 0);
  assert.deepEqual(player.inventory.map((item) => item.id), [boots.id]);
  assert.throws(
    () => world.handleCommand("player-1", { type: "unequip", slot: "boots" }),
    (error) => error instanceof WorldError && error.code === "INVALID_ITEM",
  );
});

test("items carry a level requirement that gates equipping", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const player = world.addPlayer("player-1", { archetype: "vanguard" });
  const relic = world.giveItem("player-1", { slot: "helm", level: 5 });

  assert.throws(
    () => world.handleCommand("player-1", { type: "equip", item: relic.id }),
    (error) => error instanceof WorldError && error.code === "ITEM_LEVEL_TOO_HIGH",
  );

  world._grantXp(player, 2_000);
  assert.ok(player.level >= 5);
  world.handleCommand("player-1", { type: "equip", item: relic.id });
  assert.equal(player.equipment.helm.id, relic.id);
});

test("all seven heroes can join and fire both of their skills", () => {
  const heroes = ["vanguard", "channeler", "strider", "bulwark", "longshot", "pyre", "moonblade"];
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  heroes.forEach((archetype, index) => {
    const id = `hero-${index}`;
    const player = world.addPlayer(id, { archetype });
    assert.equal(player.archetype, archetype);
    world.setInput(id, {
      seq: 1,
      aim: { x: player.x + 100, y: player.y },
      q: true,
      e: true,
    });
  });
  world.update(0.05);
  const owners = new Set([...world.projectiles.values()].map((projectile) => projectile.ownerId));
  assert.equal(owners.size, heroes.length, "every hero's skills must spawn projectiles");
});

test("autoEquip dresses the strongest eligible item in every slot", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const player = world.addPlayer("player-1", { archetype: "vanguard" });
  const weak = world.giveItem("player-1", {
    slot: "weapon",
    bonuses: { power: 1, agility: 0, spirit: 0, vitality: 0 },
    damageBonus: 0.03,
  });
  const strong = world.giveItem("player-1", {
    slot: "weapon",
    bonuses: { power: 5, agility: 0, spirit: 0, vitality: 0 },
    damageBonus: 0.12,
  });
  const tooHigh = world.giveItem("player-1", {
    slot: "helm",
    level: 9,
    bonuses: { power: 0, agility: 0, spirit: 0, vitality: 9 },
  });
  const boots = world.giveItem("player-1", {
    slot: "boots",
    bonuses: { power: 0, agility: 1, spirit: 0, vitality: 0 },
    speedBonus: 7,
  });

  world.handleCommand("player-1", { type: "autoEquip" });

  assert.equal(player.equipment.weapon.id, strong.id);
  assert.equal(player.equipment.boots.id, boots.id);
  assert.equal(player.equipment.helm, null, "over-level gear must stay in the bag");
  assert.deepEqual(
    player.inventory.map((item) => item.id).sort(),
    [weak.id, tooHigh.id].sort(),
  );
  assert.ok(world.drainEvents().some((event) => event.event === "autoEquipped"));

  // A second pass with nothing better changes nothing.
  world.handleCommand("player-1", { type: "autoEquip" });
  assert.equal(player.equipment.weapon.id, strong.id);
});

test("the town safe zone blocks enemy damage and keeps mobs from advancing", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const player = world.addPlayer("player-1", { archetype: "channeler" });
  const brute = world.spawnMob({
    id: "brute",
    x: player.x + player.radius + 14,
    y: player.y,
    speed: 200,
    damage: 10_000,
  });
  const bruteX = brute.x;

  for (let index = 0; index < 20; index += 1) world.update(0.05);

  assert.equal(player.alive, true);
  assert.equal(player.hp, player.maxHp);
  assert.equal(brute.x, bruteX);
});
