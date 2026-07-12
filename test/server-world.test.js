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

test("mob level rises with distance from town, the boss respawns, and potions heal", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const near = world.spawnMob({ id: "near", x: world.width / 2 + 320, y: world.height / 2 });
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
    const player = world.addPlayer(id, { archetype });
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
  const other = world.addPlayer("player-2", { archetype: "vanguard" });
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
  for (let index = 0; index < 48; index += 1) {
    world.giveItem("player-1", {
      slot: "ring",
      bonuses: { power: 0, agility: 0, spirit: 0, vitality: 0 },
      damageBonus: 0,
      hpBonus: 0,
      speedBonus: 0,
    });
  }
  assert.equal(player.inventory.length, 48);
  const prize = world._rollItem(9, 4);
  world._placeDrop(player.x, player.y, prize);
  world.update(0.05);

  assert.equal(player.inventory.length, 48, "bag stays at capacity");
  assert.ok(player.inventory.some((item) => item.id === prize.id), "stronger find replaces the weakest");
  assert.ok(world.drainEvents().some((event) => event.event === "itemDiscarded"));

  // A worthless find is left on the ground.
  const junk = {
    id: "junk-item", slot: "ring", rarity: "common", tier: 1, level: 1,
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
  assert.ok(homeMob.level >= 1 && homeMob.level <= 3);

  // High-level gear carries a real stat budget and level to match.
  const relic = world._rollItem(18, 4);
  assert.equal(relic.level, 20, "item level tracks mob level plus rarity, capped at 20");
  const statTotal = Object.values(relic.bonuses).reduce((sum, value) => sum + value, 0);
  assert.equal(statTotal, 4 * 2 + 20, "stat budget grows with item level");
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
  assert.equal(player.gold, 60, "step reward paid");
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
  assert.ok(world.drainEvents().some((event) => event.event === "partyInvited"));
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

  const rejoined = world.addPlayer("host-2", { name: "Alpha", archetype: "vanguard" });
  assert.equal(rejoined.gold, 777, "gold restored");
  assert.deepEqual(rejoined.friends, ["Beta"], "friends restored");
});

test("every biome has a boss with rising level and experience", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const bosses = world.spawnBosses();
  assert.equal(bosses.length, 8);
  const levels = bosses.map((boss) => boss.level);
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b), "boss levels rise across biomes");
  const warden = bosses.find((boss) => boss.id === "boss-warden");
  assert.equal(warden.level, 20);
  assert.equal(warden.xp, 2600);

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
