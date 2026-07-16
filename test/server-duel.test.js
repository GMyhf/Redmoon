// Duels are the first place one player's attack can land on another, so these
// tests care less about the happy path than about the blast radius: damage must
// reach a player inside a consented arena and nowhere else, and losing must
// cost nothing but the match.
import assert from "node:assert/strict";
import test from "node:test";

import { DUEL_ARENA } from "../src/server/definitions.js";
import { World, WorldError } from "../src/server/world.js";

function throwsCode(fn, code) {
  assert.throws(fn, (error) => error instanceof WorldError && error.code === code, `expected ${code}`);
}

function duelWorld() {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false });
  const host = world.addPlayer("host", { name: "Host", archetype: "vanguard" });
  const guest = world.addPlayer("guest", { name: "Guest", archetype: "vanguard" });
  return { world, host, guest };
}

function startedDuel() {
  const { world, host, guest } = duelWorld();
  world.handleCommand("host", { type: "duelInvite", target: "guest" });
  world.handleCommand("guest", { type: "duelAccept", from: "host" });
  return { world, host, guest, duel: world._duelOf("host") };
}

test("a duel needs both an invite and an acceptance from the invited player", () => {
  const { world, guest } = duelWorld();

  throwsCode(() => world.handleCommand("guest", { type: "duelAccept", from: "host" }), "NO_DUEL_INVITE");
  throwsCode(() => world.handleCommand("host", { type: "duelInvite", target: "ghost" }), "INVALID_TARGET");
  throwsCode(() => world.handleCommand("host", { type: "duelInvite", target: "host" }), "INVALID_TARGET");

  world.handleCommand("host", { type: "duelInvite", target: "guest" });
  // The challenge is addressed: a third party cannot claim it.
  const outsider = world.addPlayer("outsider", { name: "Outsider", archetype: "strider" });
  throwsCode(() => world.handleCommand(outsider.id, { type: "duelAccept", from: "host" }), "NO_DUEL_INVITE");
  assert.equal(world.duels.size, 0, "no arena opens without the invited player's consent");

  world.handleCommand("guest", { type: "duelAccept", from: "host" });
  assert.equal(world.duels.size, 1);
  assert.equal(guest.mapId, world._duelOf("guest").mapId);
});

test("an expired challenge cannot be accepted", () => {
  const { world } = duelWorld();
  world.handleCommand("host", { type: "duelInvite", target: "guest" });
  world.time += 61;
  throwsCode(() => world.handleCommand("guest", { type: "duelAccept", from: "host" }), "NO_DUEL_INVITE");
  assert.equal(world.duels.size, 0);
});

test("declining clears the challenge and tells the challenger", () => {
  const { world } = duelWorld();
  world.handleCommand("host", { type: "duelInvite", target: "guest" });
  world.drainEvents();

  world.handleCommand("guest", { type: "duelDecline", from: "host" });
  assert.ok(world.drainEvents().some((event) => event.event === "duelDeclined"));
  assert.equal(world.duels.size, 0);
  throwsCode(() => world.handleCommand("guest", { type: "duelAccept", from: "host" }), "NO_DUEL_INVITE");
});

test("both duellists enter their own arena whole and apart", () => {
  const { world, host, guest, duel } = startedDuel();

  assert.equal(host.mapId, duel.mapId);
  assert.equal(guest.mapId, duel.mapId);
  assert.match(duel.mapId, /^duel:arena-\d+$/);
  assert.equal(host.hp, host.maxHp, "a duel decided by who was mid-regen proves nothing");
  assert.equal(guest.hp, guest.maxHp);
  assert.ok(Math.hypot(host.x - guest.x, host.y - guest.y) > 900, "they start apart");
  // The arena is not the world plane.
  for (const side of [host, guest]) {
    assert.ok(side.x <= DUEL_ARENA.width && side.y <= DUEL_ARENA.height);
  }
});

test("the arena has walls: duellists cannot walk out onto the world plane", () => {
  const { world, host } = startedDuel();
  world.setInput("host", { seq: 1, move: { x: 1, y: 1 }, aim: { x: 1, y: 0 } });
  for (let step = 0; step < 200; step += 1) world.update(0.05);

  assert.ok(host.x < DUEL_ARENA.width, `${host.x} escaped the arena width`);
  assert.ok(host.y < DUEL_ARENA.height, `${host.y} escaped the arena height`);
  assert.ok(host.x < world.width - 100, "and is nowhere near the world edge");
});

test("a shot lands on the opponent inside the arena", () => {
  const { world, host, guest } = startedDuel();
  // Stand them next to each other so the primary reaches.
  guest.x = host.x + 90;
  guest.y = host.y;
  const before = guest.hp;

  world.setInput("host", { seq: 1, aim: { x: guest.x, y: guest.y }, primary: true });
  for (let step = 0; step < 12; step += 1) world.update(0.05);

  assert.ok(guest.hp < before, "the opponent took the hit");
  assert.equal(host.hp, host.maxHp, "and the attacker did not hit themselves");
});

test("the same shot never touches a player outside a duel", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false, safeZoneRadius: 0 });
  const shooter = world.addPlayer("shooter", { name: "Shooter", archetype: "vanguard" });
  const bystander = world.addPlayer("bystander", { name: "Bystander", archetype: "vanguard" });
  bystander.x = shooter.x + 90;
  bystander.y = shooter.y;
  const before = bystander.hp;

  world.setInput("shooter", { seq: 1, aim: { x: bystander.x, y: bystander.y }, primary: true });
  for (let step = 0; step < 12; step += 1) world.update(0.05);

  assert.equal(bystander.hp, before, "PvE maps stay PvE");
});

test("a duel shot cannot reach a player standing on the same spot on another map", () => {
  const { world, host, guest } = startedDuel();
  // The opponent is deliberately out of the line of fire, so the only body in
  // the projectile's path is a bystander who shares the arena's coordinates
  // but stands in town. An implementation that collides with every player and
  // forgets to compare mapId hits them; the real one hits nothing.
  guest.x = host.x;
  guest.y = host.y + 600;
  const bystander = world.addPlayer("bystander", { name: "Bystander", archetype: "vanguard" });
  bystander.mapId = "town";
  bystander.x = host.x + 90;
  bystander.y = host.y;
  const before = bystander.hp;

  world.setInput("host", { seq: 1, aim: { x: bystander.x, y: bystander.y }, primary: true });
  for (let step = 0; step < 12; step += 1) world.update(0.05);

  assert.equal(bystander.hp, before, "the bystander on another map was not hit");
  assert.equal(guest.hp, guest.maxHp, "and the opponent, out of the line, was not either");
});

test("defeat ends the duel, and costs the loser nothing but the match", () => {
  const { world, host, guest, duel } = startedDuel();
  guest.gold = 500;
  guest.xp = 100;
  const inventoryBefore = guest.inventory.length;
  world.drainEvents();

  world._damagePlayer(guest, 1_000_000, host.id);

  const events = world.drainEvents();
  const ended = events.find((event) => event.event === "duelEnded");
  assert.ok(ended, "the duel settled");
  assert.equal(ended.winner, "host");
  assert.equal(ended.loser, "guest");
  assert.equal(ended.reason, "defeat");

  assert.equal(world.duels.size, 0);
  assert.equal(guest.alive, true, "the loser is not left dead");
  assert.equal(guest.hp, guest.maxHp, "and is restored");
  assert.equal(guest.gold, 500, "no gold was lost");
  assert.equal(guest.xp, 100, "no experience was lost");
  assert.equal(guest.inventory.length, inventoryBefore, "nothing dropped");
  assert.equal(host.xp, 0, "and the winner earned nothing for the kill");
  for (const side of [host, guest]) {
    assert.equal(side.mapId, "town", "both are sent back where they came from");
    assert.ok(!world.projectiles.has(duel.mapId));
  }
});

test("the clock ends a stalemate as a draw", () => {
  const { world, host, guest } = startedDuel();
  world.time += 181;
  world.update(0.05);

  const ended = world.drainEvents().find((event) => event.event === "duelEnded");
  assert.equal(ended.reason, "timeout");
  assert.equal(ended.winner, null, "nobody wins a stalemate");
  assert.equal(world.duels.size, 0);
  for (const side of [host, guest]) assert.equal(side.mapId, "town");
});

test("forfeiting and disconnecting both hand the match over", () => {
  const forfeit = startedDuel();
  forfeit.world.drainEvents();
  forfeit.world.handleCommand("guest", { type: "duelForfeit" });
  const forfeited = forfeit.world.drainEvents().find((event) => event.event === "duelEnded");
  assert.equal(forfeited.reason, "forfeit");
  assert.equal(forfeited.winner, "host");
  throwsCode(() => forfeit.world.handleCommand("guest", { type: "duelForfeit" }), "NO_DUEL");

  const dropped = startedDuel();
  dropped.world.detachPlayer("guest");
  dropped.world.drainEvents();
  dropped.world.update(0.05);
  const settled = dropped.world.drainEvents().find((event) => event.event === "duelEnded");
  assert.equal(settled.reason, "disconnect");
  assert.equal(settled.winner, "host");
  assert.equal(dropped.host.mapId, "town", "the remaining duellist is not stranded in the arena");
});

test("a duellist cannot be in two places at once", () => {
  const { world } = startedDuel();
  const third = world.addPlayer("third", { name: "Third", archetype: "strider" });

  throwsCode(() => world.handleCommand("third", { type: "duelInvite", target: "host" }), "DUEL_ACTIVE");
  throwsCode(() => world.handleCommand("host", { type: "duelInvite", target: "third" }), "DUEL_ACTIVE");
  throwsCode(() => world.handleCommand("host", { type: "dungeonEnter" }), "DUEL_ACTIVE");
  assert.equal(third.mapId, "town");
});

test("arenas are capped so duels cannot exhaust the server", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false, maxDuels: 1 });
  for (const [id, name] of [["a", "A"], ["b", "B"], ["c", "C"], ["d", "D"]]) {
    world.addPlayer(id, { name, archetype: "vanguard" });
  }
  world.handleCommand("a", { type: "duelInvite", target: "b" });
  world.handleCommand("b", { type: "duelAccept", from: "a" });

  throwsCode(() => world.handleCommand("c", { type: "duelInvite", target: "d" }), "DUEL_CAPACITY");
  assert.equal(world.duels.size, 1);
});
