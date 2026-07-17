// The battle zone is the first place a player can be attacked without saying
// yes to that particular fight. So these care about two things above all: that
// it cannot happen anywhere else, and that losing there costs only what was
// agreed — gold and standing, never gear.
import assert from "node:assert/strict";
import test from "node:test";

import {
  BATTLE_GOLD_SHARE, BATTLE_HONOR_TAKE, BATTLE_ZONE_MAP,
} from "../src/server/definitions.js";
import { World } from "../src/server/world.js";

function arena(mapId = BATTLE_ZONE_MAP) {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, safeZoneRadius: 0, autoLevel: false });
  const killer = world.addPlayer("killer", { name: "Killer", archetype: "vanguard" });
  const victim = world.addPlayer("victim", { name: "Victim", archetype: "vanguard" });
  for (const side of [killer, victim]) side.mapId = mapId;
  victim.x = killer.x + 90;
  victim.y = killer.y;
  return { world, killer, victim };
}

function shoot(world, fromId, target) {
  world.setInput(fromId, { seq: 1, aim: { x: target.x, y: target.y }, primary: true });
  for (let step = 0; step < 12; step += 1) world.update(0.05);
}

test("anyone can be attacked in the battle zone", () => {
  const { world, killer, victim } = arena();
  const before = victim.hp;
  shoot(world, "killer", victim);
  assert.ok(victim.hp < before, "no consent is needed past the gate");
  assert.equal(killer.hp, killer.maxHp, "and the shooter does not hit themselves");
});

test("the same shot lands on nobody outside the battle zone", () => {
  for (const mapId of ["town", "desert", "skycity"]) {
    const { world, victim } = arena(mapId);
    const before = victim.hp;
    shoot(world, "killer", victim);
    assert.equal(victim.hp, before, `${mapId} must stay free of open PvP`);
  }
});

test("a battle-zone shot cannot reach the same spot on another map", () => {
  const { world, killer, victim } = arena();
  // The only body in the line of fire stands in town, on the arena's own
  // coordinates. An implementation that skips the mapId comparison hits them.
  victim.mapId = "town";
  const before = victim.hp;
  shoot(world, "killer", victim);
  assert.equal(before, victim.hp, "a bystander on another map is untouchable");
});

test("a kill moves gold and standing, and nothing else", () => {
  const { world, killer, victim } = arena();
  victim.gold = 1000;
  victim.bankGold = 777;
  victim.honor = 500;
  victim.xp = 4242;
  victim.inventory.push({
    id: "keepsake", slot: "weapon", rarity: "rare", tier: 3, level: 10,
    name: "test-blade", bonuses: { power: 10, agility: 0, spirit: 0, vitality: 0 }, refine: 4,
  });
  killer.gold = 0;
  killer.honor = 0;

  world._damagePlayer(victim, 1_000_000, killer.id);

  assert.equal(killer.gold, Math.floor(1000 * BATTLE_GOLD_SHARE), "the killer takes a share of gold");
  assert.equal(victim.gold, 1000 - Math.floor(1000 * BATTLE_GOLD_SHARE));
  assert.equal(victim.bankGold, 777, "banked gold is protected from battle-zone kills");
  assert.equal(killer.honor, BATTLE_HONOR_TAKE, "and standing");
  assert.equal(victim.honor, 500 - BATTLE_HONOR_TAKE);
  // The line that has to hold: gear survives. Mail and trade do not exist yet,
  // so anything dropped here would be gone for good.
  assert.equal(victim.inventory.length, 1, "gear is not dropped");
  assert.equal(victim.inventory[0].refine, 4, "least of all a refined piece");
  assert.equal(victim.xp, 4242, "and no experience is lost");
});

test("standing cannot be farmed from someone who has none", () => {
  const { world, killer, victim } = arena();
  victim.honor = 0;
  killer.honor = 100;

  world._damagePlayer(victim, 1_000_000, killer.id);

  assert.equal(killer.honor, 100, "an alt with no standing is worth nothing");
  assert.equal(victim.honor, 0, "and cannot be pushed below what they hold");
});

test("a killer takes only what the loser actually holds", () => {
  const { world, killer, victim } = arena();
  victim.honor = 3; // less than BATTLE_HONOR_TAKE
  killer.honor = 0;

  world._damagePlayer(victim, 1_000_000, killer.id);

  assert.equal(killer.honor, 3, "the take is capped by the loser's standing");
  assert.equal(victim.honor, 0, "which leaves them at nothing, not in debt");
});

test("two players trading kills end where they started", () => {
  const { world, killer, victim } = arena();
  killer.honor = 300;
  victim.honor = 300;

  world._damagePlayer(victim, 1_000_000, killer.id);
  victim.alive = true;
  victim.hp = victim.maxHp;
  world._damagePlayer(killer, 1_000_000, victim.id);

  assert.equal(killer.honor, 300, "feeding each other nets zero");
  assert.equal(victim.honor, 300);
});

test("falling to a mob in the battle zone costs nothing extra", () => {
  const { world, victim } = arena();
  victim.gold = 1000;
  victim.honor = 500;

  world._damagePlayer(victim, 1_000_000, "some-mob-id");

  assert.equal(victim.gold, 1000, "a mob takes no gold");
  assert.equal(victim.honor, 500, "and no standing");
});

test("the kill is announced to both sides", () => {
  const { world, killer, victim } = arena();
  victim.gold = 1000;
  victim.honor = 500;
  world.drainEvents();

  world._damagePlayer(victim, 1_000_000, killer.id);

  const event = world.drainEvents().find((entry) => entry.event === "battleKill");
  assert.ok(event, "both sides learn what changed hands");
  assert.equal(event.killerId, "killer");
  assert.equal(event.victimId, "victim");
  assert.equal(event.honor, BATTLE_HONOR_TAKE);
  assert.equal(event.gold, Math.floor(1000 * BATTLE_GOLD_SHARE));
});

test("standing is visible on every player, not just your own", () => {
  const { world, killer } = arena();
  killer.honor = 250;
  // The tiers exist to be read off the people around you; that is the whole
  // reason honour became public in v4.
  const seen = world.getSnapshot("victim").players.find((entry) => entry.id === "killer");
  assert.equal(seen.honor, 250);
});
