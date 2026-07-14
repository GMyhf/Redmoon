import assert from "node:assert/strict";
import test from "node:test";

import { INVENTORY_LIMIT, MAX_ITEM_SEQUENCE } from "../src/server/definitions.js";
import { hashSecret } from "../src/server/session.js";
import { World, WorldError, xpRequiredForLevel } from "../src/server/world.js";

function throwsCode(fn, code) {
  assert.throws(fn, (error) => error instanceof WorldError && error.code === code, `expected ${code}`);
}

function junkItem(id) {
  return { id, slot: "weapon", rarity: "common", tier: 1, level: 1, name: "pulse-blade", bonuses: { power: 1 } };
}

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

test("sprint input accelerates movement and map snapshots isolate entities", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, safeZoneRadius: 0 });
  const player = world.addPlayer("runner", { archetype: "strider" });
  const startX = player.x;
  world.setInput(player.id, { seq: 1, move: { x: 1, y: 0 }, sprint: false });
  world.update(0.1);
  const walkingDistance = player.x - startX;
  player.x = startX;
  world.setInput(player.id, { seq: 2, move: { x: 1, y: 0 }, sprint: true });
  world.update(0.1);
  assert.ok(player.x - startX > walkingDistance * 1.3);

  const townMob = world.spawnMob({ id: "town-mob", x: world.width / 2, y: world.height / 2 });
  const desert = world.zones.find((zone) => zone.id === "desert");
  const desertMob = world.spawnMob({ id: "desert-mob", x: desert.x, y: desert.y, mapId: "desert" });
  player.mapId = "desert";
  const snapshot = world.getSnapshot(player.id);
  assert.equal(snapshot.mapId, "desert");
  assert.deepEqual(snapshot.enemies.map((entry) => entry.id), [desertMob.id]);
  assert.equal(snapshot.world.theme, "desert");
  assert.deepEqual(snapshot.world.zones.map((entry) => entry.id), ["desert"]);
  assert.equal(snapshot.world.portals.every((portal) => portal.mapId === "desert"), true);
  assert.equal(world.mobs.has(townMob.id), true);
});

test("stat allocation and both archetype skills can be upgraded", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, autoLevel: false });
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
  world.handleCommand("player-1", { type: "setAuto", enabled: false });
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

  const rawDamage = 27 + 9 + player.stats.spirit * 2.25;
  const expectedDamage = rawDamage * (1 - enemy.defense / (enemy.defense + 80));
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

  world.update(0.7);
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
  const destination = { x: player.x + 120, y: player.y + 90 };

  world.handleCommand("player-1", { type: "input", seq: 1, moveTo: destination });
  for (let index = 0; index < 60; index += 1) world.update(0.05);

  assert.ok(Math.hypot(player.x - destination.x, player.y - destination.y) < 6);
  assert.equal(player.moveTarget, null);

  // Manual keyboard movement cancels any standing order.
  world.handleCommand("player-1", { type: "input", seq: 2, moveTo: destination });
  world.handleCommand("player-1", { type: "input", seq: 3, move: { x: 0, y: 1 } });
  world.update(0.7);
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
    mapId: "town",
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
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false });
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

test("unique and sunset drops use capped ground pools and release slots on expiry", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, safeZoneRadius: 0 });
  const unique = world._rollSpecialDrop("uniq", 8);
  const sunset = world._rollSpecialDrop("sunset", 15);
  const uniqueId = world._placeDrop(300, 300, unique, "backhill");
  const sunsetId = world._placeDrop(600, 300, sunset, "sunset");

  assert.equal(world.specialDropActive.uniq, 1);
  assert.equal(world.specialDropActive.sunset, 1);
  assert.equal(world.getSnapshot().drops.find((drop) => drop.id === uniqueId).dropClass, "uniq");
  assert.equal(world.getSnapshot().drops.find((drop) => drop.id === sunsetId).dropClass, "sunset");

  for (let index = 0; index < 121; index += 1) world.update(0.5);
  assert.equal(world.specialDropActive.uniq, 0);
  assert.equal(world.specialDropActive.sunset, 0);
});

test("special drops auto-equip on pickup and preserve their visible class", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, safeZoneRadius: 0 });
  const player = world.addPlayer("special-hunter", { archetype: "vanguard" });
  const item = world._rollSpecialDrop("uniq", player.level);
  item.level = 1;
  world._placeDrop(player.x, player.y, item, "town");
  world.update(0.05);

  assert.equal(Object.values(player.equipment).some((entry) => entry?.id === item.id && entry.dropClass === "uniq"), true);
  assert.equal(player.inventory.some((entry) => entry.id === item.id), false);
  assert.ok(world.drainEvents().some((event) => event.event === "lootPickedUp" && event.autoEquipped === true));
});

test("mob level rises with distance from town, the boss respawns, and potions heal", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  // Straight below town centre avoids every themed district ellipse, so
  // this exercises the town map's own distance curve.
  const near = world.spawnMob({ id: "near", x: world.width / 2, y: world.height / 2 + 320 });
  const far = world.spawnMob({ id: "far", x: world.width - 100, y: 100 });
  assert.ok(near.level <= 3);
  assert.ok(far.level >= 9);
  // Frontier species are giant and worth several times the experience.
  assert.equal(far.type, "voidmaw");
  assert.ok(far.radius > near.radius);
  assert.ok(far.xp > near.xp * 4);

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
    ["belt", "boots", "chest", "gloves", "helm", "necklace", "pants", "ring1", "ring2", "ring3", "shield", "weapon"],
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

test("heroes begin with four actions and unlock two more skills by level", () => {
  const heroes = ["vanguard", "channeler", "strider", "bulwark", "longshot", "pyre", "moonblade"];
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  heroes.forEach((archetype, index) => {
    const id = `hero-${index}`;
    const player = world.addPlayer(id, { name: `Hero ${index}`, archetype });
    assert.equal(player.archetype, archetype);
    assert.deepEqual(Object.keys(player.skillLevels).sort(), ["c", "e", "f", "q", "r"]);
    assert.throws(
      () => world.handleCommand(id, { type: "upgrade", skill: "r" }),
      (error) => error instanceof WorldError && error.code === "SKILL_LOCKED",
    );
    world._grantXp(player, 20_000);
    assert.ok(player.level >= 10);
    world.setInput(id, {
      seq: 1,
      aim: { x: player.x + 100, y: player.y },
      q: true,
      e: true,
      r: true,
      c: true,
      f: true,
    });
  });
  world.update(0.05);
  const owners = new Set([...world.projectiles.values()].map((projectile) => projectile.ownerId));
  assert.equal(owners.size, heroes.length, "every hero's skills must spawn projectiles");

  // Ultimates go on cooldown independently of Q/E.
  const first = world.players.get("hero-0");
  assert.ok(first.nextSkillAt.f > world.time + 5, "ultimate cooldown must be long");
});

test("monster snapshots expose combat attributes and attacks identify their effect", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, safeZoneRadius: 0 });
  const player = world.addPlayer("player-1", { archetype: "vanguard" });
  const enemy = world.spawnMob({ x: player.x + 20, y: player.y, type: "stonehorn", level: 7, speed: 80 });
  world.update(0.05);
  const serialized = world.getSnapshot().enemies.find((entry) => entry.id === enemy.id);
  assert.ok(serialized.damage > 0);
  assert.ok(serialized.defense > 0);
  assert.equal(serialized.attackStyle, "charge");
  assert.equal(serialized.combatState, "windup");
  assert.ok(serialized.attackRemaining > 0);
  const attack = world.drainEvents().find((event) => event.event === "enemyAttack");
  assert.equal(attack.attackStyle, "charge");
  assert.equal(attack.enemyType, "stonehorn");
});

test("idle monsters patrol around their spawn and use species combat profiles", () => {
  const world = new World({ rng: () => 0.25, spawnMobs: false, mobTargetCount: 0, safeZoneRadius: 0 });
  const enemy = world.spawnMob({ x: 200, y: 200, type: "stormeye", level: 15 });
  const start = { x: enemy.x, y: enemy.y };
  for (let index = 0; index < 80; index += 1) world.update(0.05);
  assert.ok(Math.hypot(enemy.x - start.x, enemy.y - start.y) > 5);
  assert.equal(enemy.attackStyle, "lightning");
  assert.ok(enemy.attackRange >= 200);
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

test("the soul barrier spends MP instead of HP at a configurable ratio", () => {
  const world = new World({
    rng: () => 0.5,
    spawnMobs: false,
    mobTargetCount: 0,
    safeZoneRadius: 0,
    soulBarrier: { absorb: 0.5, mpPerHp: 2 },
  });
  const player = world.addPlayer("player-1", { archetype: "eclipse" });
  assert.ok(player.maxMp > 0);
  assert.equal(player.mp, player.maxMp);

  const mitigation = 1 - Math.min(0.38, world._statTotal(player, "vitality") * 0.018);
  const hpBefore = player.hp;
  const mpBefore = player.mp;
  world._damagePlayer(player, 40, "test");
  const mitigated = 40 * mitigation;
  assert.ok(Math.abs((hpBefore - player.hp) - mitigated * 0.5) < 0.000001, "half the hit goes to HP");
  assert.ok(Math.abs((mpBefore - player.mp) - mitigated * 0.5 * 2) < 0.000001, "MP pays double per HP absorbed");

  // With MP drained, the full mitigated hit lands on HP.
  player.mp = 0;
  const hpDrained = player.hp;
  world._damagePlayer(player, 20, "test");
  assert.ok(Math.abs((hpDrained - player.hp) - 20 * mitigation) < 0.000001);

  // Non-eclipse heroes have MP but no active barrier.
  const other = world.addPlayer("player-2", { name: "Sidekick", archetype: "vanguard" });
  const otherMp = other.mp;
  world._damagePlayer(other, 20, "test");
  assert.equal(other.mp, otherMp);
});

test("eclipse skills branch on reputation sign and attunement drags it over", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const player = world.addPlayer("player-1", { archetype: "eclipse" });
  const east = { x: 1, y: 0 };

  // Radiant Q: one piercing lance; reputation drifts +2.
  world._useSkill(player, "q", east);
  assert.equal(world.projectiles.size, 1);
  assert.ok([...world.projectiles.values()][0].hitsRemaining > 1);
  assert.equal(player.reputation, 2);

  // Swear to the abyss and cast until the sign flips.
  world.handleCommand("player-1", { type: "attune", path: "abyss" });
  world.projectiles.clear();
  world.time += 100;
  player.nextSkillAt.q = 0;
  world._useSkill(player, "q", east); // rep 2 -> 0, still radiant
  world.time += 100;
  player.nextSkillAt.q = 0;
  world._useSkill(player, "q", east); // rep 0 -> -2, cast resolved radiant
  assert.equal(player.reputation, -2);
  assert.ok(world.drainEvents().some((event) => event.event === "alignmentShifted"));

  // Now below zero: Q becomes the three-bolt abyssal fan.
  world.projectiles.clear();
  world.time += 100;
  player.nextSkillAt.q = 0;
  world._useSkill(player, "q", east);
  assert.equal(world.projectiles.size, 3);
  assert.equal(player.reputation, -4);

  // Will accrues from kills.
  const prey = world.spawnMob({ id: "prey", x: player.x + 300, y: player.y, maxHp: 1, level: 5 });
  world._damageMob(prey, 10, player.id);
  assert.equal(player.will, 5);

  assert.throws(
    () => world.handleCommand("player-1", { type: "attune", path: "sideways" }),
    (error) => error instanceof WorldError && error.code === "INVALID_MESSAGE",
  );
});

test("idle players auto-attack enemies in reach, and the toggle disables it", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, safeZoneRadius: 0 });
  const player = world.addPlayer("player-1", { archetype: "channeler" });
  const prey = world.spawnMob({
    id: "prey",
    x: player.x + 120,
    y: player.y,
    maxHp: 20,
    speed: 0.001,
    damage: 0.001,
    xp: 10,
  });

  // No input at all: auto-combat should destroy the mob on its own.
  for (let index = 0; index < 40 && world.mobs.has(prey.id); index += 1) world.update(0.05);
  assert.equal(world.mobs.has(prey.id), false);
  assert.equal(player.xp, 10);

  world.handleCommand("player-1", { type: "setAuto", enabled: false });
  assert.equal(player.autoFight, false);
  const second = world.spawnMob({
    id: "second",
    x: player.x + 120,
    y: player.y,
    maxHp: 20,
    speed: 0.001,
    damage: 0.001,
  });
  for (let index = 0; index < 20; index += 1) world.update(0.05);
  assert.equal(second.hp, second.maxHp, "auto-fight off must mean no attacks");
});

test("portals teleport players to their paired gate with a re-entry lock", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const player = world.addPlayer("player-1", { archetype: "strider" });
  const gate = world.portals.find((portal) => portal.id === "portal-desert");
  const exit = world.portals.find((portal) => portal.id === "portal-desert-return");

  player.x = gate.x;
  player.y = gate.y;
  // Teleporting requires standing on the gate briefly (walking across is safe).
  for (let index = 0; index < 16; index += 1) world.update(0.05);

  const arrival = Math.hypot(player.x - exit.x, player.y - exit.y);
  assert.ok(arrival <= 75, `should arrive beside the paired gate (was ${arrival})`);
  assert.ok(arrival > 30, "should not land directly on the gate");
  assert.ok(world.drainEvents().some((event) => event.event === "teleported"));

  // Standing near the exit gate must not bounce the player back.
  const [x, y] = [player.x, player.y];
  for (let index = 0; index < 80; index += 1) world.update(0.05);
  assert.equal(player.x, x);
  assert.equal(player.y, y);
});

test("auto-level spends banked stat and skill points along class weights", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const player = world.addPlayer("player-1", { archetype: "vanguard" });
  assert.equal(player.statPoints, 3, "points bank until the first level-up");

  world._grantXp(player, 80); // one level: +4 stat, +1 skill
  assert.equal(player.statPoints, 0);
  assert.equal(player.skillPoints, 0);
  // 7 points spread by weights (power 3 / vitality 2 / agility 1 / spirit 0.2).
  assert.deepEqual(player.stats, { power: 11, agility: 4, spirit: 2, vitality: 8 });
  assert.equal(player.skillLevels.q, 2);

  world.handleCommand("player-1", { type: "setAutoLevel", enabled: false });
  world._grantXp(player, 200);
  assert.ok(player.statPoints > 0, "manual mode banks points again");
});

test("full bags swap the weakest item for a stronger find; drops magnetise", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const player = world.addPlayer("player-1", { archetype: "strider" });

  // Magnet: loot placed outside pickup reach drifts in on its own.
  world._placeDrop(player.x + 150, player.y, world._rollItem(3));
  for (let index = 0; index < 30 && world.drops.size > 0; index += 1) world.update(0.05);
  assert.equal(world.drops.size, 0);
  assert.equal(player.inventory.length, 1);
  player.inventory.length = 0;

  // Fill the bag with worthless rings, then drop something excellent.
  for (let index = 0; index < INVENTORY_LIMIT; index += 1) {
    world.giveItem("player-1", {
      slot: "ring",
      bonuses: { power: 0, agility: 0, spirit: 0, vitality: 0 },
      damageBonus: 0,
      hpBonus: 0,
      speedBonus: 0,
    });
  }
  assert.equal(player.inventory.length, INVENTORY_LIMIT);
  const prize = world._rollItem(9, 4);
  world._placeDrop(player.x, player.y, prize);
  world.update(0.05);

  assert.equal(player.inventory.length, INVENTORY_LIMIT, "bag stays at capacity");
  assert.ok(player.inventory.some((item) => item.id === prize.id), "stronger find replaces the weakest");
  assert.ok(world.drainEvents().some((event) => event.event === "itemDiscarded"));

  // A worthless, unwearable find is left on the ground. (A wearable one
  // would be worn straight from the ground — that path has its own test.)
  const junk = {
    id: "junk-item", slot: "ring", rarity: "common", tier: 1, level: 999,
    name: "Orbit Band",
    bonuses: { power: 0, agility: 0, spirit: 0, vitality: 0 },
  };
  world._placeDrop(player.x, player.y, junk);
  world.update(0.05);
  assert.equal(world.drops.size, 1, "junk stays on the ground when the bag is full");
});

test("three rings stack, relic formulas scale with level, and the cap is 1000", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false });
  const player = world.addPlayer("player-1", { archetype: "vanguard" });

  // Three rings occupy ring1..ring3; a fourth stronger ring displaces the weakest.
  for (const power of [1, 2, 3]) {
    const ring = world.giveItem("player-1", {
      slot: "ring",
      bonuses: { power, agility: 0, spirit: 0, vitality: 0 },
      damageBonus: 0, hpBonus: 0, speedBonus: 0,
    });
    world.handleCommand("player-1", { type: "equip", item: ring.id });
  }
  assert.ok(player.equipment.ring1 && player.equipment.ring2 && player.equipment.ring3);
  const strong = world.giveItem("player-1", {
    slot: "ring",
    bonuses: { power: 9, agility: 0, spirit: 0, vitality: 0 },
    damageBonus: 0, hpBonus: 0, speedBonus: 0,
  });
  world.handleCommand("player-1", { type: "equip", item: strong.id });
  const ringPowers = ["ring1", "ring2", "ring3"].map((key) => player.equipment[key].bonuses.power).sort();
  assert.deepEqual(ringPowers, [2, 3, 9], "weakest ring is displaced");

  // Relic weapon: flat damage follows level × power ÷ divisor and adds defense.
  const relic = world.giveItem("player-1", {
    slot: "weapon",
    level: 1,
    bonuses: { power: 0, agility: 0, spirit: 0, vitality: 0 },
    damageBonus: 0, hpBonus: 0, speedBonus: 0,
    defenseBonus: 0.2,
    attackFormula: { stat: "power", divisor: 55 },
  });
  world.handleCommand("player-1", { type: "equip", item: relic.id });
  player.level = 550;
  world.setInput("player-1", { seq: 1, aim: { x: player.x + 100, y: player.y }, primary: true });
  world.update(0.05);
  const projectile = [...world.projectiles.values()][0];
  const power = world._statTotal(player, "power");
  const flat = 550 * power / 55;
  const base = 13 + power * 1.55 + world._statTotal(player, "spirit") * 0.38;
  assert.ok(Math.abs(projectile.damage - (base + flat)) < 0.000001, "relic adds level×power/55 flat damage");
  assert.equal(player.gearMods.defense, 0.2);

  // Level cap: experience stops at 1000.
  player.level = 999;
  player.xpToNext = 10;
  world._grantXp(player, 1_000_000);
  assert.equal(player.level, 1000);
  const xpAtCap = player.xp;
  world._grantXp(player, 500);
  assert.equal(player.xp, xpAtCap, "no further XP at the cap");
});

test("districts spawn mobs inside their own level band and gear scales up", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const skycity = world.zones.find((zone) => zone.id === "skycity");
  const resident = world.zones.find((zone) => zone.id === "residential");

  const skyMob = world.spawnMob({ id: "sky", x: skycity.x, y: skycity.y });
  assert.ok(skyMob.level >= skycity.minLevel && skyMob.level <= skycity.maxLevel);
  const homeMob = world.spawnMob({ id: "home", x: resident.x, y: resident.y });
  assert.ok(homeMob.level >= resident.minLevel && homeMob.level <= resident.maxLevel);
  assert.ok(skyMob.level > homeMob.level, "the ladder rises across maps");

  // High-level gear carries a real stat budget and level to match.
  const relic = world._rollItem(18, 4);
  assert.equal(relic.level, 21, "item level tracks mob level plus rarity tier");
  const statTotal = Object.values(relic.bonuses).reduce((sum, value) => sum + value, 0);
  assert.equal(statTotal, 4 * 2 + 21, "stat budget grows with item level");
});

test("kills pay gold, dew revives in place, and shops trade goods", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, safeZoneRadius: 0, autoLevel: false });
  const player = world.addPlayer("player-1", { archetype: "vanguard" });

  const prey = world.spawnMob({ id: "prey", x: player.x + 300, y: player.y, maxHp: 1, level: 4 });
  world._damageMob(prey, 10, player.id);
  assert.equal(player.gold, 2 * 4, "gold follows mob level");

  // Dew revive: die, then rise on the spot at full health.
  player.dew = 1;
  world.spawnMob({ id: "brute", x: player.x + player.radius + 14, y: player.y, speed: 0.001, damage: 100000 });
  world.update(0.7);
  assert.equal(player.alive, false);
  world.handleCommand("player-1", { type: "revive" });
  assert.equal(player.alive, true);
  assert.equal(player.hp, player.maxHp);
  assert.equal(player.dew, 0);

  // Shops: buying needs proximity, gold, then delivers goods.
  const grocer = world.shops.find((shop) => shop.id === "grocer");
  player.gold = 500;
  player.x = grocer.x - 600;
  player.y = grocer.y;
  assert.throws(
    () => world.handleCommand("player-1", { type: "buy", shop: "grocer", good: "potion-s" }),
    (error) => error instanceof WorldError && error.code === "TOO_FAR",
  );
  player.x = grocer.x;
  player.y = grocer.y;
  world.handleCommand("player-1", { type: "buy", shop: "grocer", good: "potion-s" });
  assert.equal(player.gold, 470);
  assert.equal(player.inventory[0].heal, 60);

  // Black market relic box costs dew.
  const market = world.shops.find((shop) => shop.id === "blackmarket");
  player.x = market.x;
  player.y = market.y;
  player.dew = 3;
  player.level = 12;
  world.handleCommand("player-1", { type: "buy", shop: "blackmarket", good: "relic-box" });
  assert.equal(player.dew, 0);
  assert.ok(player.inventory.some((item) => item.rarity === "relic"));

  // Selling converts an item back into gold.
  const goldBefore = player.gold;
  world.handleCommand("player-1", { type: "sell", item: player.inventory[0].id });
  assert.ok(player.gold > goldBefore);
});

test("the quest chain advances step by step with rewards", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false });
  const player = world.addPlayer("player-1", { archetype: "vanguard" });
  assert.equal(player.quest.chainIndex, 0);

  // Step 1: six riftlings.
  for (let index = 0; index < 6; index += 1) {
    world._advanceQuest(player, { type: "riftling", boss: false, elite: false });
  }
  assert.equal(player.quest.chainIndex, 1, "chain advances to step two");
  assert.equal(player.gold, 150, "step reward paid");
  assert.equal(player.quest.progress, 0);

  // Duskfangs do not count toward a riftling step and vice versa.
  world._advanceQuest(player, { type: "riftling", boss: false, elite: false });
  assert.equal(player.quest.progress, 0, "wrong species does not count");
  world._advanceQuest(player, { type: "duskfang", boss: false, elite: false });
  assert.equal(player.quest.progress, 1);

  // Serialized quest exposes the chain step details.
  const snapshot = world.getSnapshot("player-1");
  const quest = snapshot.players[0].quest;
  assert.equal(quest.chainIndex, 1);
  assert.equal(quest.title, "暮色狩猎");
  assert.equal(quest.chainLength, 8);
});

test("parties share XP within range and accounts persist across sessions", () => {
  const store = {};
  const world = new World({
    rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false, accountStore: store,
  });
  const host = world.addPlayer("host-1", { name: "Alpha", archetype: "vanguard" });
  const ally = world.addPlayer("ally-1", { name: "Beta", archetype: "strider" });

  world.handleCommand("host-1", { type: "partyInvite", target: "ally-1" });
  const inviteEvent = world.drainEvents().find((event) => event.event === "partyInvited");
  assert.deepEqual(inviteEvent.scope, { players: ["ally-1"] });
  assert.equal(world.getPendingPartyInvite("ally-1").fromName, "Alpha");
  world.handleCommand("ally-1", { type: "partyAccept", from: "host-1" });
  assert.equal(host.partyId, ally.partyId);

  // Shared XP: the ally stands nearby and gets 60%.
  ally.x = host.x + 100;
  ally.y = host.y;
  const prey = world.spawnMob({ id: "prey", x: host.x + 200, y: host.y, maxHp: 1, level: 2, xp: 100 });
  world._damageMob(prey, 10, "host-1");
  // Host took the full 100 XP (levelling once consumes 75); the ally got 60%.
  assert.equal(host.level, 2);
  assert.equal(host.xp, 25);
  assert.equal(ally.level, 1);
  assert.equal(ally.xp, 60);

  // Friends persist along with progress.
  world.handleCommand("host-1", { type: "friendAdd", name: "Beta" });
  host.gold = 777;
  world.removePlayer("host-1");
  assert.ok(store.alpha, "account written on leave");

  const rejoined = world.addPlayer("host-2", { name: "Alpha", archetype: "vanguard", token: host.token });
  assert.equal(rejoined.gold, 777, "gold restored");
  assert.deepEqual(rejoined.friends, ["Beta"], "friends restored");
});

test("party XP and quest credit only reach members on the killer's map", () => {
  const world = new World({
    rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false,
  });
  const host = world.addPlayer("host-1", { name: "Alpha", archetype: "vanguard" });
  const ally = world.addPlayer("ally-1", { name: "Beta", archetype: "strider" });
  world.handleCommand("host-1", { type: "partyInvite", target: "ally-1" });
  world.handleCommand("ally-1", { type: "partyAccept", from: "host-1" });

  // Maps share one coordinate plane: the ally is in shared-XP range by
  // distance but hunting on another map, so nothing may leak across.
  ally.x = host.x + 100;
  ally.y = host.y;
  ally.mapId = "desert";
  const afar = world.spawnMob({
    id: "afar", type: "riftling", x: host.x + 200, y: host.y, maxHp: 1, level: 2, xp: 100,
  });
  world._damageMob(afar, 10, "host-1");
  assert.equal(ally.xp, 0, "no XP across maps");
  assert.equal(ally.quest.progress, 0, "no quest credit across maps");

  // A grace-period seat and a not-yet-committed auth object are not active
  // hunters, even if their preserved coordinates remain nearby.
  ally.mapId = host.mapId;
  world.detachPlayer(ally.id);
  const detached = world.spawnMob({
    id: "detached", type: "riftling", x: host.x + 200, y: host.y, maxHp: 1, level: 2, xp: 100,
  });
  world._damageMob(detached, 10, "host-1");
  assert.equal(ally.xp, 0, "detached members do not earn shared XP");
  assert.equal(ally.quest.progress, 0, "detached members do not earn quest credit");

  ally.connectionDetached = false;
  ally.pendingAuth = true;
  const pending = world.spawnMob({
    id: "pending-auth", type: "riftling", x: host.x + 200, y: host.y, maxHp: 1, level: 2, xp: 100,
  });
  world._damageMob(pending, 10, "host-1");
  assert.equal(ally.xp, 0, "uncommitted sessions do not earn shared XP");
  delete ally.pendingAuth;

  // Back online on the killer's map, the usual share applies.
  const nearby = world.spawnMob({
    id: "nearby", type: "riftling", x: host.x + 200, y: host.y, maxHp: 1, level: 2, xp: 100,
  });
  world._damageMob(nearby, 10, "host-1");
  assert.equal(ally.xp, 60, "same-map share still works");
  assert.equal(ally.quest.progress, 1);
});

test("projectiles stay on the map where they were fired", () => {
  const world = new World({
    rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, safeZoneRadius: 0,
  });
  const player = world.addPlayer("player-1", { archetype: "channeler" });
  world.setInput("player-1", {
    seq: 1,
    aim: { x: player.x + 200, y: player.y },
    primary: true,
  });
  world.update(0.05);
  const projectile = [...world.projectiles.values()][0];
  assert.ok(projectile, "primary fire spawned a projectile");
  assert.equal(projectile.mapId, "town");

  // Stop firing so only the in-flight shot matters from here on.
  world.setInput("player-1", { seq: 2, primary: false });
  world.setAutoFight("player-1", false);

  // The owner hops through a portal; the shot must stay behind.
  player.mapId = "desert";
  const awaySnapshot = world.getSnapshot("player-1");
  assert.equal(awaySnapshot.projectiles.length, 0, "shot is not visible on the new map");

  // A mob on the new map sitting right on the projectile's path is safe.
  const bystander = world.spawnMob({
    id: "bystander", mapId: "desert", x: projectile.x + 30, y: projectile.y, maxHp: 50,
  });
  world.update(0.05);
  assert.equal(bystander.hp, bystander.maxHp, "no cross-map collision");
});

test("snapshots share per-map arrays and only send full detail to the owner", () => {
  const world = new World({
    rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false,
  });
  const alpha = world.addPlayer("alpha-1", { name: "Alpha", archetype: "vanguard" });
  world.addPlayer("beta-1", { name: "Beta", archetype: "strider" });
  world.handleCommand("alpha-1", { type: "friendAdd", name: "Beta" });
  world.spawnMob({ id: "shared-mob", x: alpha.x + 400, y: alpha.y });
  alpha.inventory.push({
    id: "item-secret", slot: "weapon", rarity: "common", tier: 1, level: 1,
    name: "pulse-blade", bonuses: { power: 3 },
  });

  // With a broadcast cache, both recipients reuse the same map build.
  const cache = new Map();
  const forAlpha = world.getSnapshot("alpha-1", cache);
  const forBeta = world.getSnapshot("beta-1", cache);
  assert.equal(forAlpha.enemies, forBeta.enemies, "enemy array built once per map");
  assert.equal(forAlpha.drops, forBeta.drops);
  assert.equal(forAlpha.world, forBeta.world);

  // Redundant duplicate fields are gone from the payload.
  assert.equal(forAlpha.mobs, undefined, "mobs duplicate removed");
  assert.equal(forAlpha.portals, undefined, "top-level portals duplicate removed");
  assert.ok(forAlpha.world.portals.length > 0, "portals still ship inside world");

  // Alpha's own entry is full; Beta's view of Alpha is slim.
  const selfEntry = forAlpha.players.find((entry) => entry.id === "alpha-1");
  assert.equal(selfEntry.inventory.length, 1);
  assert.deepEqual(selfEntry.friends, [{ name: "Beta", online: true, id: "beta-1" }]);
  assert.ok(selfEntry.skills, "self entry keeps skill details");
  const alphaSeenByBeta = forBeta.players.find((entry) => entry.id === "alpha-1");
  assert.equal(alphaSeenByBeta.inventory, undefined, "no inventory for other players");
  assert.equal(alphaSeenByBeta.gold, undefined, "no wallet for other players");
  assert.equal(alphaSeenByBeta.friends, undefined, "no friend list for other players");
  assert.equal(alphaSeenByBeta.skills, undefined, "no skill details for other players");
  assert.equal(alphaSeenByBeta.hp, selfEntry.hp, "render scalars still present");
  assert.ok(alphaSeenByBeta.equipment, "equipment shape data still present");

  // Equipped items are trimmed to render fields for other players.
  alpha.inventory.push({
    id: "item-blade", slot: "weapon", rarity: "resonant", tier: 3, level: 1,
    name: "pulse-blade", bonuses: { power: 5 }, damageBonus: 0.12,
  });
  world.equipItem("alpha-1", "item-blade");
  const refreshed = world.getSnapshot("beta-1", new Map());
  const weapon = refreshed.players.find((entry) => entry.id === "alpha-1").equipment.weapon;
  assert.equal(weapon.rarity, "resonant", "rarity glow data kept");
  assert.equal(weapon.name, "pulse-blade", "weapon shape data kept");
  assert.equal(weapon.bonuses, undefined, "stat details stripped for others");

  // Without a cache each call still builds a fresh, correct snapshot.
  const fresh = world.getSnapshot("alpha-1");
  assert.equal(fresh.players.find((entry) => entry.id === "alpha-1").inventory.length, 1);
});

test("friend snapshots expose an online target id across maps", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const owner = world.addPlayer("owner-1", { name: "Owner", archetype: "vanguard" });
  const friend = world.addPlayer("friend-1", { name: "RelayFriend", archetype: "strider" });
  world.addFriend(owner.id, "relayfriend");
  friend.mapId = "desert";

  assert.deepEqual(
    world.getSnapshot(owner.id).players.find((entry) => entry.id === owner.id).friends,
    [{ name: "relayfriend", online: true, id: friend.id }],
    "friend lookup is case-insensitive and independent of the current map",
  );

  world.detachPlayer(friend.id);
  assert.deepEqual(
    world.getSnapshot(owner.id).players.find((entry) => entry.id === owner.id).friends,
    [{ name: "relayfriend", online: false, id: null }],
  );
});

test("join rejects a mismatched declared protocol but accepts legacy joins", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  assert.throws(
    () => world.addPlayer("old-client", { name: "Stale", archetype: "vanguard", protocol: 1 }),
    (error) => error instanceof WorldError && error.code === "PROTOCOL_MISMATCH",
  );
  const current = world.addPlayer("new-client", { name: "Fresh", archetype: "vanguard", protocol: 2 });
  assert.equal(current.name, "Fresh");
  // Joins that do not declare a protocol (scripted tools, older clients)
  // still work.
  const legacy = world.addPlayer("silent-client", { name: "Quiet", archetype: "vanguard" });
  assert.equal(legacy.name, "Quiet");
});

test("snapshots carry the authoritative move speed for client prediction", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const player = world.addPlayer("player-1", { name: "Pacer", archetype: "strider" });

  const entry = world.getSnapshot("player-1").players[0];
  assert.equal(entry.moveSpeed, Math.round(world._moveSpeed(player) * 1000) / 1000);
  assert.ok(entry.moveSpeed > 0);

  // Terrain modifiers flow into the advertised speed (snow slows to 0.86x).
  const townSpeed = world._moveSpeed(player);
  player.mapId = "snowmountain";
  const snowSpeed = world._moveSpeed(player);
  assert.ok(Math.abs(snowSpeed - townSpeed * 0.86) < 0.0001);
});

test("accounts are claimed by a session token on first join", () => {
  const store = {};
  const world = new World({
    rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, accountStore: store,
  });
  const original = world.addPlayer("conn-1", { name: "Alpha", archetype: "vanguard" });
  assert.ok(original.token, "a token is minted on first join");

  // The same name cannot be online twice, regardless of casing.
  assert.throws(
    () => world.addPlayer("conn-2", { name: "alpha", archetype: "vanguard" }),
    (error) => error instanceof WorldError && error.code === "NAME_IN_USE",
  );

  original.gold = 555;
  world.removePlayer("conn-1");
  assert.equal(store.alpha.token, undefined, "the bearer token is never persisted in plaintext");
  assert.equal(store.alpha.tokenHash, hashSecret(original.token), "only the token hash persists");

  // A missing or wrong token cannot load the protected account.
  assert.throws(
    () => world.addPlayer("conn-3", { name: "Alpha", archetype: "vanguard" }),
    (error) => error instanceof WorldError && error.code === "INVALID_TOKEN",
  );
  assert.throws(
    () => world.addPlayer("conn-3", { name: "Alpha", archetype: "vanguard", token: "wrong" }),
    (error) => error instanceof WorldError && error.code === "INVALID_TOKEN",
  );

  // The right token restores progress.
  const rejoined = world.addPlayer("conn-4", { name: "Alpha", archetype: "vanguard", token: original.token });
  assert.equal(rejoined.gold, 555, "token holder gets the account back");

  // Legacy records saved before tokens existed stay joinable and get one.
  world.removePlayer("conn-4");
  delete store.alpha.tokenHash;
  const migrated = world.addPlayer("conn-5", { name: "Alpha", archetype: "vanguard" });
  assert.equal(migrated.gold, 555, "legacy account restored without a token");
  assert.ok(migrated.token, "legacy account is upgraded with a token");
  world.removePlayer("conn-5");
  assert.equal(store.alpha.tokenHash, hashSecret(migrated.token));
});

test("account names cannot collide with Object prototype properties", () => {
  const store = {};
  const world = new World({
    rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, accountStore: store,
  });
  const proto = world.addPlayer("proto", { name: "__proto__", archetype: "vanguard" });
  const constructor = world.addPlayer("constructor", { name: "constructor", archetype: "strider" });
  world.removePlayer(proto.id);
  world.removePlayer(constructor.id);

  assert.equal(Object.hasOwn(store, "__proto__"), true);
  assert.equal(Object.hasOwn(store, "constructor"), true);
  assert.equal(Object.getPrototypeOf(store), Object.prototype);
  assert.equal(store.__proto__.archetype, "vanguard");
  assert.equal(store.constructor.archetype, "strider");
});

test("every biome has a boss with rising level and experience", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const bosses = world.spawnBosses();
  assert.equal(bosses.length, 8);
  const levels = bosses.map((boss) => boss.level);
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b), "boss levels rise across biomes");
  const warden = bosses.find((boss) => boss.id === "boss-warden");
  assert.equal(warden.level, 1000);
  assert.equal(warden.xp, 400000);

  const player = world.addPlayer("player-1", { archetype: "vanguard" });
  const thornmaw = bosses.find((boss) => boss.id === "boss-thornmaw");
  world._damageMob(thornmaw, 1_000_000, player.id);
  assert.equal(world.mobs.has("boss-thornmaw"), false);
  assert.ok([...world.drops.values()].filter((drop) => drop.item.tier >= 3).length >= 3);

  for (let index = 0; index < 1801 && !world.mobs.has("boss-thornmaw"); index += 1) world.update(0.05);
  assert.equal(world.mobs.has("boss-thornmaw"), true, "biome bosses respawn on their own timers");
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

test("shop purchases enforce currency, stock, and inventory guards without charging", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false });
  const player = world.addPlayer("buyer-1", { name: "Buyer", archetype: "vanguard" });
  const grocer = world.shops.find((shop) => shop.id === "grocer");
  player.x = grocer.x;
  player.y = grocer.y;

  throwsCode(() => world.buyGood("buyer-1", "nobody", "potion-s"), "INVALID_SHOP");
  throwsCode(() => world.buyGood("buyer-1", "grocer", "moon-cake"), "INVALID_GOOD");

  player.gold = 29;
  throwsCode(() => world.buyGood("buyer-1", "grocer", "potion-s"), "NO_GOLD");
  assert.equal(player.gold, 29, "failed purchase charges nothing");

  const blackmarket = world.shops.find((shop) => shop.id === "blackmarket");
  player.x = blackmarket.x;
  player.y = blackmarket.y;
  player.dew = 2;
  throwsCode(() => world.buyGood("buyer-1", "blackmarket", "relic-box"), "NO_DEW");
  assert.equal(player.dew, 2, "failed purchase keeps the dew");

  player.x = grocer.x;
  player.y = grocer.y;
  player.gold = 500;
  player.inventory = Array.from({ length: INVENTORY_LIMIT }, (_, index) => junkItem(`junk-${index}`));
  throwsCode(() => world.buyGood("buyer-1", "grocer", "potion-s"), "INVENTORY_FULL");
  assert.equal(player.gold, 500, "full-bag purchase charges nothing");

  player.inventory = [];
  world.buyGood("buyer-1", "grocer", "potion-s");
  assert.equal(player.gold, 470);
  assert.equal(player.inventory.length, 1);

  throwsCode(() => world.sellItem("buyer-1", "not-owned"), "INVALID_ITEM");
  const goldBefore = player.gold;
  world.sellItem("buyer-1", player.inventory[0].id);
  assert.ok(player.gold > goldBefore, "selling pays out");
  assert.equal(player.inventory.length, 0);
});

test("party membership enforces invite, capacity, and cleanup rules", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false });
  const names = ["Ana", "Bo", "Cyd", "Dee", "Eve", "Fox"];
  for (const [index, name] of names.entries()) {
    world.addPlayer(`p-${index}`, { name, archetype: "vanguard" });
  }

  throwsCode(() => world.inviteParty("p-0", "p-0"), "INVALID_TARGET");
  throwsCode(() => world.inviteParty("p-0", "ghost"), "INVALID_TARGET");
  throwsCode(() => world.acceptParty("p-1", "p-0"), "NO_INVITE");

  // Host fills the party to the cap of four.
  for (const member of ["p-1", "p-2", "p-3"]) {
    world.inviteParty("p-0", member);
    world.acceptParty(member, "p-0");
  }
  const partyId = world.players.get("p-0").partyId;
  assert.equal(world.parties.get(partyId).members.length, 4);
  throwsCode(() => world.inviteParty("p-0", "p-4"), "PARTY_FULL");
  throwsCode(() => world.inviteParty("p-4", "p-1"), "ALREADY_IN_PARTY");

  // Leaving trims the roster; a disconnect cleans up the same way.
  world.leaveParty("p-3");
  assert.equal(world.parties.get(partyId).members.length, 3);
  world.removePlayer("p-2");
  assert.equal(world.parties.get(partyId).members.length, 2);

  // When only one member would remain the party dissolves entirely.
  world.leaveParty("p-1");
  assert.equal(world.parties.has(partyId), false);
  assert.equal(world.players.get("p-0").partyId, null);
});

test("the friend list refuses self-adds and enforces its capacity", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const player = world.addPlayer("p-1", { name: "Loner", archetype: "vanguard" });

  throwsCode(() => world.addFriend("p-1", "Loner"), "INVALID_TARGET");

  for (let index = 0; index < 32; index += 1) world.addFriend("p-1", `Friend ${index}`);
  assert.equal(player.friends.length, 32);
  throwsCode(() => world.addFriend("p-1", "One Too Many"), "FRIENDS_FULL");

  // Duplicates are ignored rather than rejected.
  world.addFriend("p-1", "Friend 0");
  assert.equal(player.friends.length, 32);

  world.removeFriend("p-1", "Friend 0");
  assert.equal(player.friends.length, 31);
  assert.equal(player.friends.includes("Friend 0"), false);
});

test("stat and skill point spending is fully guarded", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false });
  const player = world.addPlayer("p-1", { name: "Scholar", archetype: "vanguard" });

  // Burn the three starting stat points, then the well is dry.
  for (let index = 0; index < 3; index += 1) world.allocateStat("p-1", "power");
  throwsCode(() => world.allocateStat("p-1", "power"), "NO_STAT_POINTS");

  throwsCode(() => world.upgradeSkill("p-1", "banana"), "INVALID_SKILL");

  // One starting skill point, then dry.
  world.upgradeSkill("p-1", "q");
  throwsCode(() => world.upgradeSkill("p-1", "q"), "NO_SKILL_POINTS");

  // A maxed skill refuses further points even when points are available.
  const maxLevel = world.getSnapshot("p-1").players[0].skills.q.maxLevel;
  player.skillLevels.q = maxLevel;
  player.skillPoints = 5;
  throwsCode(() => world.upgradeSkill("p-1", "q"), "SKILL_MAX_LEVEL");
});

test("defeat gates actions and in-place revival needs dew", () => {
  const world = new World({
    rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, safeZoneRadius: 0, autoLevel: false,
  });
  const player = world.addPlayer("p-1", { name: "Fallen", archetype: "vanguard" });
  player.inventory.push(junkItem("blade-1"));

  throwsCode(() => world.revivePlayer("p-1"), "ALREADY_ALIVE");
  throwsCode(() => world.respawnPlayer("p-1"), "ALREADY_ALIVE");

  world._damagePlayer(player, 1_000_000, "test");
  assert.equal(player.alive, false);

  throwsCode(() => world.equipItem("p-1", "blade-1"), "PLAYER_DEAD");
  throwsCode(() => world.unequipItem("p-1", "weapon"), "PLAYER_DEAD");
  throwsCode(() => world.allocateStat("p-1", "power"), "PLAYER_DEAD");
  throwsCode(() => world.rebirthPlayer("p-1"), "PLAYER_DEAD");
  throwsCode(() => world.usePotion("p-1", "blade-1"), "PLAYER_DEAD");

  player.dew = 0;
  throwsCode(() => world.revivePlayer("p-1"), "NO_DEW");
  player.dew = 1;
  world.revivePlayer("p-1");
  assert.equal(player.alive, true);
  assert.equal(player.hp, player.maxHp);
  assert.equal(player.dew, 0);
});

test("unequip refuses a full bag and keeps the piece equipped", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const player = world.addPlayer("p-1", { name: "Packrat", archetype: "vanguard" });

  throwsCode(() => world.unequipItem("p-1", "hat"), "INVALID_SLOT");

  player.inventory.push(junkItem("blade-1"));
  world.equipItem("p-1", "blade-1");
  assert.equal(player.equipment.weapon.id, "blade-1");

  player.inventory = Array.from({ length: INVENTORY_LIMIT }, (_, index) => junkItem(`junk-${index}`));
  throwsCode(() => world.unequipItem("p-1", "weapon"), "INVENTORY_FULL");
  assert.equal(player.equipment.weapon.id, "blade-1", "the piece stays equipped, not destroyed");

  player.inventory.pop();
  world.unequipItem("p-1", "weapon");
  assert.equal(player.equipment.weapon, null);
  assert.ok(player.inventory.some((item) => item.id === "blade-1"), "the piece lands in the bag");
});

test("automation toggles persist across relogin", () => {
  const store = {};
  const world = new World({
    rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, accountStore: store,
  });
  const player = world.addPlayer("conn-1", { name: "Auto", archetype: "vanguard" });
  assert.equal(player.autoEquip, true, "auto-equip defaults on");
  world.handleCommand("conn-1", { type: "setAuto", enabled: false });
  world.handleCommand("conn-1", { type: "setAutoLevel", enabled: false });
  world.handleCommand("conn-1", { type: "setAutoEquip", enabled: false });
  const token = player.token;
  world.removePlayer("conn-1");

  const back = world.addPlayer("conn-2", { name: "Auto", archetype: "vanguard", token });
  assert.equal(back.autoFight, false, "auto-fight stays off after relogin");
  assert.equal(back.autoLevel, false, "auto-level stays off after relogin");
  assert.equal(back.autoEquip, false, "auto-equip stays off after relogin");
  const entry = world.getSnapshot("conn-2").players[0];
  assert.equal(entry.autoFight, false);
  assert.equal(entry.autoEquip, false);
});

test("a full bag still upgrades worn gear straight from the ground", () => {
  const world = new World({
    rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false,
  });
  const player = world.addPlayer("p-1", { name: "Looter", archetype: "vanguard" });
  player.inventory.push(junkItem("weak-blade"));
  world.equipItem("p-1", "weak-blade");
  // The bag is stuffed with treasure too high-level to wear.
  player.inventory = Array.from({ length: INVENTORY_LIMIT }, (_, index) => ({
    ...junkItem(`hoard-${index}`), level: 900, bonuses: { power: 500 },
  }));

  const upgrade = {
    id: "upgrade-blade", slot: "weapon", rarity: "epic", tier: 4, level: 1,
    name: "Pulse Edge", bonuses: { power: 50 },
  };
  world._placeDrop(player.x, player.y, upgrade, player.mapId);
  world.update(0.05);
  assert.equal(player.equipment.weapon.id, "upgrade-blade", "the find is worn on the spot");
  assert.equal(player.inventory.length, INVENTORY_LIMIT, "no bag slot was consumed");
  assert.ok(
    [...world.drops.values()].some((drop) => drop.item.id === "weak-blade"),
    "the replaced piece waits on the ground",
  );

  // With auto-equip off the same kind of find stays on the ground.
  world.setAutoEquipMode("p-1", false);
  const second = { ...upgrade, id: "upgrade-2", bonuses: { power: 60 } };
  world._placeDrop(player.x, player.y, second, player.mapId);
  world.update(0.05);
  assert.equal(player.equipment.weapon.id, "upgrade-blade", "toggle off leaves worn gear alone");
  assert.ok(
    [...world.drops.values()].some((drop) => drop.item.id === "upgrade-2"),
    "the find stays on the ground",
  );
});

test("a name is one character forever: another archetype cannot overwrite it", () => {
  const store = {};
  const world = new World({
    rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, accountStore: store,
  });
  const original = world.addPlayer("conn-1", { name: "Alpha", archetype: "vanguard" });
  original.gold = 888;
  original.level = 42;
  const token = original.token;
  world.removePlayer("conn-1");

  // Even the rightful token holder cannot restart the name as another hero.
  throwsCode(
    () => world.addPlayer("conn-2", { name: "Alpha", archetype: "strider", token }),
    "NAME_TAKEN",
  );
  assert.equal(store.alpha.archetype, "vanguard", "the record is untouched");
  assert.equal(store.alpha.gold, 888);
  assert.equal(store.alpha.level, 42);

  // The original hero still comes back intact.
  const back = world.addPlayer("conn-3", { name: "Alpha", archetype: "vanguard", token });
  assert.equal(back.level, 42);
  assert.equal(back.gold, 888);
});


test("chat validates channel, text, cadence, and party membership", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  world.addPlayer("p-1", { name: "Talker", archetype: "vanguard" });

  throwsCode(() => world.sendChat("p-1", "yell", "hi"), "INVALID_CHANNEL");
  throwsCode(() => world.sendChat("p-1", "global", 42), "INVALID_MESSAGE");
  throwsCode(() => world.sendChat("p-1", "global", "   "), "INVALID_MESSAGE");
  throwsCode(() => world.sendChat("p-1", "party", "anyone?"), "NO_PARTY");

  world.sendChat("p-1", "global", "  hello\u0007 world  ");
  throwsCode(() => world.sendChat("p-1", "global", "too fast"), "CHAT_TOO_FAST");
  world.update(0.4);
  world.update(0.4);
  world.sendChat("p-1", "map", "a".repeat(500));

  const chats = world.drainEvents().filter((event) => event.event === "chatMessage");
  assert.equal(chats.length, 2);
  assert.equal(chats[0].text, "hello world", "control chars stripped, trimmed");
  assert.equal(chats[0].scope, undefined, "global chat is unscoped");
  assert.equal(chats[1].text.length, 200, "long text truncated");
  assert.deepEqual(chats[1].scope, { mapId: "town" }, "map chat scoped to the sender's map");
});


test("the XP curve keeps kills-per-level rising toward the cap", () => {
  // Mob XP grows ~linearly in level; the requirement must outgrow it.
  const mobXp = (level) => (22 + level * 9) * 2;
  let previous = 0;
  for (const level of [1, 50, 150, 300, 500, 700, 900, 1000]) {
    const kills = xpRequiredForLevel(level) / mobXp(level);
    assert.ok(kills > previous, `kills/level must rise (L${level})`);
    previous = kills;
  }
  assert.equal(xpRequiredForLevel(1), 75, "the first level is untouched");
});

test("shop potions scale price and healing with the buyer's level", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false });
  const player = world.addPlayer("p-1", { name: "Buyer", archetype: "vanguard" });
  const grocer = world.shops.find((shop) => shop.id === "grocer");
  player.x = grocer.x;
  player.y = grocer.y;

  player.gold = 10000;
  world.buyGood("p-1", "grocer", "potion-s");
  assert.equal(player.gold, 10000 - 30, "level 1 pays the base price");
  assert.equal(player.inventory.at(-1).heal, 60, "level 1 gets the base healing");

  player.level = 101;
  world.buyGood("p-1", "grocer", "potion-s");
  assert.equal(player.gold, 10000 - 30 - (30 + 2 * 100), "price scales with level");
  assert.equal(player.inventory.at(-1).heal, 60 + 7 * 100, "healing scales with level");

  // The affordability guard uses the scaled price.
  player.gold = 100;
  throwsCode(() => world.buyGood("p-1", "grocer", "potion-s"), "NO_GOLD");
});

test("session rotation and one-time recovery replace the persisted bearer hash", () => {
  let now = Date.parse("2026-07-13T00:00:00Z");
  const store = {};
  const world = new World({
    rng: () => 0.5, now: () => now, spawnMobs: false, mobTargetCount: 0, accountStore: store,
  });
  const original = world.addPlayer("session-1", { name: "Recoverable", archetype: "vanguard" });
  const firstToken = original.token;
  const issued = world.issueRecoveryCode("session-1");
  assert.ok(issued.code.length >= 20);
  assert.equal(store.recoverable.recovery.expiresAt, issued.expiresAt);

  const rotationToken = "r".repeat(43);
  const rotated = world.rotateSession("session-1", rotationToken);
  assert.equal(rotated.token, rotationToken);
  assert.notEqual(rotated.token, firstToken);
  assert.equal(store.recoverable.tokenHash, hashSecret(rotated.token));
  assert.throws(
    () => world.recoverAccount("session-online", { name: "Recoverable", code: issued.code }),
    (error) => error instanceof WorldError && error.code === "NAME_IN_USE",
  );
  assert.equal(store.recoverable.tokenHash, hashSecret(rotated.token), "failed recovery keeps current credentials");
  assert.ok(store.recoverable.recovery, "failed recovery does not consume the one-time code");
  world.removePlayer("session-1");

  assert.throws(
    () => world.recoverAccount("session-2", { name: "Recoverable", code: "wrong" }),
    (error) => error instanceof WorldError && error.code === "INVALID_RECOVERY",
  );
  const recoveryToken = "s".repeat(43);
  const recovered = world.recoverAccount("session-2", {
    name: "Recoverable", code: issued.code, nextToken: recoveryToken,
  });
  assert.notEqual(recovered.token, rotated.token);
  assert.equal(store.recoverable.recovery, undefined, "the recovery code is consumed");
  world.removePlayer("session-2");
  const retried = world.recoverAccount("session-retry", {
    name: "Recoverable", code: issued.code, nextToken: recoveryToken,
  });
  assert.equal(retried.token, recoveryToken, "a lost response can replay the client-known credential");
  world.removePlayer("session-retry");
  assert.throws(
    () => world.recoverAccount("session-3", { name: "Recoverable", code: issued.code }),
    (error) => error instanceof WorldError && error.code === "INVALID_RECOVERY",
  );
  assert.ok(world.drainAuditLog().some((entry) => entry.action === "account_recovered"));
  now += 1000;
});

test("the in-memory audit queue is bounded while persistence is unavailable", () => {
  const world = new World({
    rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, auditLimit: 2,
  });
  world.addPlayer("audit", { name: "Audited", archetype: "vanguard" });
  world.issueRecoveryCode("audit");
  world.rotateSession("audit");
  assert.equal(world.auditLog.length, 2);
  assert.equal(world.auditDropped, 1);
  assert.deepEqual(world.auditLog.map((entry) => entry.action), ["recovery_issued", "session_rotated"]);
});

test("a party leader opens one deterministic dungeon and rewards every member once", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const host = world.addPlayer("dungeon-host", { name: "VaultHost", archetype: "vanguard" });
  const guest = world.addPlayer("dungeon-guest", { name: "VaultGuest", archetype: "strider" });
  host.level = 40;
  guest.level = 44;
  host.xpToNext = xpRequiredForLevel(host.level);
  guest.xpToNext = xpRequiredForLevel(guest.level);
  world.inviteParty(host.id, guest.id);
  world.acceptParty(guest.id, host.id);

  assert.throws(
    () => world.enterDungeon(guest.id),
    (error) => error instanceof WorldError && error.code === "DUNGEON_LEADER_ONLY",
  );
  const hostGold = host.gold;
  const guestGold = guest.gold;
  world.enterDungeon(host.id);
  assert.equal(host.mapId, guest.mapId);
  assert.match(host.mapId, /^dungeon:vault-/);
  const dungeon = [...world.dungeons.values()][0];
  const dungeonMobs = [...dungeon.mobs.values()];
  assert.equal(dungeonMobs.length, 6);
  assert.equal([...world.mobs.values()].some((mob) => mob.dungeonId === dungeon.id), false);
  assert.equal(world.getSnapshot(host.id).enemies.length, 6, "extracted dungeon mobs remain visible on their map");
  throwsCode(
    () => world.settleDungeon(dungeon.id, { settlementId: "too-early", stateVersion: 0 }),
    "DUNGEON_NOT_COMPLETE",
  );
  const positions = dungeonMobs.map((mob) => ({ id: mob.id, x: mob.x, y: mob.y }));
  world.update(0.25);
  assert.deepEqual(
    dungeonMobs.map((mob) => ({ id: mob.id, x: mob.x, y: mob.y })),
    positions,
    "the main World tick does not advance extracted dungeon mobs",
  );
  const projectile = world._spawnProjectile(host, { x: 1, y: 0 }, {
    damage: 1,
    speed: 100,
    range: 100,
  });
  assert.equal(dungeon.projectiles.has(projectile.id), true);
  assert.equal(world.projectiles.has(projectile.id), false);
  const dungeonDropId = world._placeDrop(host.x, host.y, junkItem("dungeon-drop"), dungeon.plan.mapId);
  assert.equal(dungeon.drops.has(dungeonDropId), true);
  assert.equal(world.drops.has(dungeonDropId), false);

  for (const mob of dungeonMobs) world._damageMob(mob, 1e12, host.id);
  assert.equal(dungeon.completed, true);
  assert.equal(dungeon.rewarded.size, 2);
  assert.equal(dungeon.settlement.status, "completed");
  const settlement = world.settleDungeon(dungeon.id, {
    settlementId: dungeon.settlement.settlementId,
    members: [...dungeon.members],
    reward: dungeon.plan.reward,
    stateVersion: dungeon.stateVersion,
  });
  assert.equal(settlement.duplicate, true, "a repeated settlement returns the reserved result");
  assert.deepEqual(settlement.rewardedMembers, [...dungeon.rewarded]);
  assert.equal(host.gold, hostGold + dungeon.plan.reward.gold);
  assert.equal(guest.gold, guestGold + dungeon.plan.reward.gold);
  assert.ok(host.level > 40 || host.xp > 0);
  assert.ok(guest.level > 44 || guest.xp > 0);
  assert.equal(
    world.pendingMobSpawns.some((spawn) => spawn.mapId === dungeon.plan.mapId),
    false,
    "completed dungeon enemies never enter the normal respawn queue",
  );
  const completionEvents = world.drainEvents().filter((event) => event.event === "dungeonCompleted");
  assert.equal(completionEvents.length, 1);

  world.leaveDungeon(host.id);
  world.leaveDungeon(guest.id);
  assert.equal(world.dungeons.size, 0);
  assert.equal(host.mapId, "town");
  assert.equal(guest.mapId, "town");
});

test("dungeon entry enforces same-map parties, capacity, respawn cleanup, and timeout", () => {
  const world = new World({
    rng: () => 0.5,
    spawnMobs: false,
    mobTargetCount: 0,
    maxDungeons: 1,
    dungeonDuration: 0.2,
  });
  const host = world.addPlayer("host", { name: "Host", archetype: "vanguard" });
  const guest = world.addPlayer("guest", { name: "Guest", archetype: "strider" });
  world.inviteParty(host.id, guest.id);
  world.acceptParty(guest.id, host.id);
  world.detachPlayer(guest.id);
  throwsCode(() => world.enterDungeon(host.id), "DUNGEON_PARTY_NOT_READY");
  guest.connectionDetached = false;
  guest.pendingAuth = true;
  throwsCode(() => world.enterDungeon(host.id), "DUNGEON_PARTY_NOT_READY");
  delete guest.pendingAuth;
  guest.mapId = "desert";
  throwsCode(() => world.enterDungeon(host.id), "DUNGEON_PARTY_NOT_READY");
  guest.mapId = "town";
  world.enterDungeon(host.id);

  const outsider = world.addPlayer("outsider", { name: "Outsider", archetype: "pyre" });
  throwsCode(() => world.enterDungeon(outsider.id), "DUNGEON_CAPACITY");

  host.alive = false;
  host.respawnAvailableAt = 0;
  world.respawnPlayer(host.id);
  assert.equal(host.mapId, "town", "a normal respawn leaves the instance");
  assert.equal(world.dungeons.size, 1, "the remaining member keeps the instance alive");

  world.update(0.25);
  assert.equal(world.dungeons.size, 0, "expired instances are reclaimed");
  assert.equal(guest.mapId, "town", "remaining members return to town on timeout");
  assert.equal(
    [...world.mobs.values()].some((mob) => mob.dungeonId),
    false,
    "timeout removes all dungeon enemies",
  );
  assert.ok(world.drainEvents().some((event) => event.event === "dungeonFailed"));
});

test("shops refuse buyers standing on another map", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false });
  const player = world.addPlayer("p-1", { name: "Buyer", archetype: "vanguard" });
  const grocer = world.shops.find((shop) => shop.id === "grocer");
  player.x = grocer.x;
  player.y = grocer.y;
  player.gold = 10000;

  // Same coordinates, different map: map coordinates overlap across zones.
  player.mapId = "residential";
  throwsCode(() => world.buyGood("p-1", "grocer", "potion-s"), "TOO_FAR");
  assert.equal(player.gold, 10000, "no gold is taken");
  assert.equal(player.inventory.length, 0);

  player.mapId = "town";
  world.buyGood("p-1", "grocer", "potion-s");
  assert.equal(player.inventory.length, 1, "the same spot works on the shop's own map");
});

test("the item id sequence resumes past persisted inventory and equipment", () => {
  const world = new World({
    rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false,
    accountStore: {
      ghost: {
        archetype: "vanguard",
        inventory: [{ id: "item-7" }],
        equipment: { weapon: { id: "item-31" } },
      },
    },
  });
  assert.equal(world._nextItemId(), "item-32", "the sequence starts past the highest persisted id");
});

test("item ids switch to UUIDs before the numeric persistence boundary", () => {
  const world = new World({
    rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false,
    accountStore: {
      ghost: {
        archetype: "vanguard",
        inventory: [{ id: `item-${MAX_ITEM_SEQUENCE - 1}` }],
      },
    },
  });

  const first = world._nextItemId();
  const second = world._nextItemId();
  assert.match(first, /^item-[0-9a-f]{8}-[0-9a-f-]{27}$/);
  assert.notEqual(second, first, "fallback ids remain unique after numeric exhaustion");
});

test("a valid official token is not blocked by a corrupt optional pending token", () => {
  const official = "o".repeat(43);
  const world = new World({
    rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false,
    accountStore: {
      protected: { archetype: "vanguard", tokenHash: hashSecret(official) },
    },
  });

  const player = world.addPlayer("p-1", {
    name: "Protected", archetype: "vanguard", token: official, nextToken: "broken",
  });
  assert.equal(player.token, official);
  world.detachPlayer("p-1");
  assert.equal(world.resumeDetachedPlayer({
    name: "Protected", token: official, nextToken: "broken", protocol: 2,
  }), player);
});

test("a restarted world never re-mints ids held by restored items", () => {
  const options = { rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false };
  const first = new World(options);
  const alpha = first.addPlayer("p-1", { name: "Keeper", archetype: "vanguard" });
  const token = alpha.token;
  const grocer = first.shops.find((shop) => shop.id === "grocer");
  const smith = first.shops.find((shop) => shop.id === "smith");
  alpha.gold = 1_000_000;
  alpha.x = smith.x;
  alpha.y = smith.y;
  first.buyGood("p-1", "smith", "forge-gear");
  alpha.level = 100; // forged gear rolls slightly above the buyer's level
  first.equipItem("p-1", alpha.inventory[0].id);
  alpha.x = grocer.x;
  alpha.y = grocer.y;
  first.buyGood("p-1", "grocer", "potion-s");
  first.removePlayer("p-1");

  // Simulate a restart: a fresh world loads the same store from "disk".
  const second = new World({ ...options, accountStore: structuredClone(first.syncAccounts()) });
  const restored = second.addPlayer("p-2", { name: "Keeper", archetype: "vanguard", token });
  const held = new Set([
    ...restored.inventory.map((item) => item.id),
    ...Object.values(restored.equipment).filter(Boolean).map((item) => item.id),
  ]);
  assert.ok(held.size >= 2, "the restored character kept its items");

  restored.x = grocer.x;
  restored.y = grocer.y;
  second.buyGood("p-2", "grocer", "potion-s");
  const fresh = restored.inventory.at(-1);
  assert.equal(held.has(fresh.id), false, "a fresh drop does not collide with restored items");
});
