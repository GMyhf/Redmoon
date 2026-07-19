// A hall is a lease, not a keep: it drains gold on a clock and what it buys is
// a footing — an army that holds one returns its dead to the front instead of
// walking back from town. These guard the drain, the footing, and the scarcity
// that a siege will later be fought over.
import assert from "node:assert/strict";
import test from "node:test";

import {
  ARMY_HALL_FLOORS, ARMY_HALL_PERIOD, ARMY_HALL_RENT, ARMY_HONOR, ARMY_LEVEL,
  ARMY_SIEGE_DURATION, ARMY_SIEGE_RANGE, BATTLE_ZONE_MAP, CAMPS, CAMP_HQ, CAMP_STAGING,
} from "../src/server/definitions.js";
import { World, WorldError } from "../src/server/world.js";

const [FREEHOLD, COVENANT] = CAMPS.map((camp) => camp.id);

function throwsCode(fn, code) {
  assert.throws(fn, (error) => error instanceof WorldError && error.code === code, `expected ${code}`);
}

function commanding(camp = FREEHOLD) {
  const clock = { now: 0 };
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, safeZoneRadius: 0, autoLevel: false });
  const commander = world.addPlayer("cmd", { name: "Cmd", archetype: "vanguard" });
  commander.level = ARMY_LEVEL;
  commander.honor = ARMY_HONOR;
  commander.gold = ARMY_HALL_RENT * 4;
  world.handleCommand("cmd", { type: "armyCreate", name: "铁誓军", camp });
  world.now = () => clock.now;
  return { world, commander, advanceWallClock: (seconds) => { clock.now += seconds * 1000; } };
}

test("a hall is leased with a camp, a rank, a free floor and the rent", () => {
  const { world, commander } = commanding();

  throwsCode(() => world.rentArmyHall("cmd", 0), "INVALID_FLOOR");
  throwsCode(() => world.rentArmyHall("cmd", ARMY_HALL_FLOORS + 1), "INVALID_FLOOR");

  const before = commander.gold;
  world.handleCommand("cmd", { type: "armyRentHall", floor: 7 });
  assert.equal(commander.army.hall.floor, 7);
  assert.equal(before - commander.gold, ARMY_HALL_RENT, "the first rent is due on signing");
  assert.equal(commander.army.hall.rentDueAt, ARMY_HALL_PERIOD, "and the wall clock starts");

  throwsCode(() => world.rentArmyHall("cmd", 8), "HALL_HELD");
});

test("sieges expose a periodic window and reject attempts outside it", () => {
  const { world, commander, advanceWallClock } = commanding(FREEHOLD);
  world.eventSchedules.armySiege = { period: 10, duration: 2 };
  const rival = world.addPlayer("riv", { name: "Riv", archetype: "vanguard" });
  rival.level = ARMY_LEVEL;
  rival.honor = ARMY_HONOR;
  rival.gold = ARMY_HALL_RENT * 2;
  world.handleCommand("riv", { type: "armyCreate", name: "契约军", camp: COVENANT });
  world.handleCommand("riv", { type: "armyRentHall", floor: 4 });

  let schedule = world.getSnapshot("cmd").world.schedules.armySiege;
  assert.equal(schedule.active, true);
  assert.equal(schedule.startsAt, 0);
  assert.equal(schedule.endsAt, 2);
  assert.equal(schedule.nextStartsAt, 0);

  commander.mapId = BATTLE_ZONE_MAP;
  commander.x = CAMP_HQ[COVENANT].x;
  commander.y = CAMP_HQ[COVENANT].y;
  advanceWallClock(2);
  schedule = world.getSnapshot("cmd").world.schedules.armySiege;
  assert.equal(schedule.active, false);
  assert.equal(schedule.nextStartsAt, 10);
  throwsCode(() => world.handleCommand("cmd", { type: "armySiege", camp: COVENANT, floor: 4 }), "SIEGE_CLOSED");
});

test("siege schedule phase survives a world restart", () => {
  const clock = { now: 2_000 };
  const first = new World({ now: () => clock.now, spawnMobs: false, mobTargetCount: 0 });
  first.eventSchedules.armySiege = { period: 10, duration: 2 };
  assert.equal(first.getSnapshot().world.schedules.armySiege.active, false);
  assert.equal(first.getSnapshot().world.schedules.armySiege.nextStartsAt, 10);

  const restarted = new World({ now: () => clock.now, spawnMobs: false, mobTargetCount: 0 });
  restarted.eventSchedules.armySiege = { period: 10, duration: 2 };
  assert.equal(restarted.getSnapshot().world.schedules.armySiege.active, false);
  assert.equal(restarted.getSnapshot().world.schedules.armySiege.nextStartsAt, 10);
});

test("only a commander with a camp and the gold may sign", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false });
  for (const [id, name] of [["cmd", "Cmd"], ["rec", "Rec"]]) {
    const player = world.addPlayer(id, { name, archetype: "vanguard" });
    player.level = ARMY_LEVEL;
    player.honor = ARMY_HONOR;
    player.gold = ARMY_HALL_RENT * 2;
  }
  world.handleCommand("cmd", { type: "armyCreate", name: "铁誓军" });
  world.handleCommand("cmd", { type: "armyInvite", target: "rec" });
  world.handleCommand("rec", { type: "armyAccept", from: "cmd" });

  // No camp yet: a hideout belongs to a side.
  throwsCode(() => world.rentArmyHall("cmd", 3), "NO_CAMP");
  world.handleCommand("cmd", { type: "armySetCamp", camp: FREEHOLD });
  throwsCode(() => world.rentArmyHall("rec", 3), "ARMY_RANK_FORBIDDEN");

  const commander = world.players.get("cmd");
  commander.gold = ARMY_HALL_RENT - 1;
  throwsCode(() => world.rentArmyHall("cmd", 3), "NO_GOLD");
});

test("a floor holds one army, and only within its own camp's hideout", () => {
  const { world } = commanding(FREEHOLD);
  world.handleCommand("cmd", { type: "armyRentHall", floor: 5 });

  const rival = world.addPlayer("riv", { name: "Riv", archetype: "vanguard" });
  rival.level = ARMY_LEVEL;
  rival.honor = ARMY_HONOR;
  rival.gold = ARMY_HALL_RENT * 2;
  world.handleCommand("riv", { type: "armyCreate", name: "宿敌军", camp: FREEHOLD });
  throwsCode(() => world.rentArmyHall("riv", 5), "HALL_TAKEN");
  // The scarcity is per camp: the other side's fifth floor is its own.
  world.handleCommand("riv", { type: "armyDisband" });
  world.handleCommand("riv", { type: "armyCreate", name: "契约军", camp: COVENANT });
  world.handleCommand("riv", { type: "armyRentHall", floor: 5 });
  assert.equal(rival.army.hall.floor, 5, "the two hideouts are separate buildings");
});

test("rent falls due on the clock, and an unpaid lease ends", () => {
  const { world, commander, advanceWallClock } = commanding();
  world.handleCommand("cmd", { type: "armyRentHall", floor: 2 });
  world.drainEvents();

  // Affordable: charged and rescheduled.
  advanceWallClock(ARMY_HALL_PERIOD);
  const before = commander.gold;
  world.update(0.05);
  assert.equal(before - commander.gold, ARMY_HALL_RENT, "rent is taken when it falls due");
  assert.equal(commander.army.hall.floor, 2, "and the lease runs on");
  assert.ok(world.drainEvents().some((event) => event.event === "armyHallRentPaid"));

  // Unaffordable: the lease ends rather than running up a debt.
  commander.gold = ARMY_HALL_RENT - 1;
  advanceWallClock(ARMY_HALL_PERIOD);
  world.update(0.05);
  assert.equal(commander.army.hall, undefined, "an unpaid hall is lost");
  assert.equal(commander.gold, ARMY_HALL_RENT - 1, "and nothing is taken on the way out");
  const lost = world.drainEvents().find((event) => event.event === "armyHallLost");
  assert.equal(lost.reason, "unpaid");
  // ...and the floor is free again.
  assert.equal(world._hallHolder(FREEHOLD, 2), null);
});

test("an offline commander still pays rent from the account record", () => {
  const clock = { now: Date.now() };
  const store = {};
  const world = new World({
    rng: () => 0.5, now: () => clock.now, spawnMobs: false, mobTargetCount: 0,
    safeZoneRadius: 0, autoLevel: false, accountStore: store,
  });
  const commander = world.addPlayer("cmd", { name: "Cmd", archetype: "vanguard" });
  commander.level = ARMY_LEVEL;
  commander.honor = ARMY_HONOR;
  commander.gold = ARMY_HALL_RENT * 2;
  world.handleCommand("cmd", { type: "armyCreate", name: "铁誓军", camp: FREEHOLD });
  world.handleCommand("cmd", { type: "armyRentHall", floor: 2 });
  const dueAt = commander.army.hall.rentDueAt;
  world.removePlayer("cmd");
  clock.now = (dueAt + ARMY_HALL_PERIOD + 1) * 1000;
  world.update(0.05);
  assert.equal(store.cmd.gold, 0, "offline rent is charged from the persisted commander");
  assert.equal(store.cmd.army.hall, undefined, "the unpaid offline lease is released");
});

test("a hall brings the fallen back to the front; without one they walk", () => {
  const { world, commander } = commanding(FREEHOLD);
  const fall = () => {
    commander.mapId = BATTLE_ZONE_MAP;
    commander.x = 3000;
    commander.y = 1500;
    world._damagePlayer(commander, 1_000_000, "some-mob");
    world.time += 10;
    world.respawnPlayer("cmd");
  };

  // No lease: the zone sends you home, which is the walk a hall pays to skip.
  fall();
  assert.equal(commander.mapId, "town", "no hall, no footing");

  world.handleCommand("cmd", { type: "armyRentHall", floor: 4 });
  fall();
  assert.equal(commander.mapId, BATTLE_ZONE_MAP, "a lease keeps you at the front");
  assert.equal(commander.x, CAMP_STAGING[FREEHOLD].x, "at your own camp's staging ground");
  assert.equal(commander.y, CAMP_STAGING[FREEHOLD].y);
});

test("the whole company shares the footing, not just the one who signs", () => {
  const { world, commander } = commanding(FREEHOLD);
  world.handleCommand("cmd", { type: "armyRentHall", floor: 6 });
  const soldier = world.addPlayer("sol", { name: "Sol", archetype: "vanguard" });
  soldier.level = ARMY_LEVEL;
  soldier.honor = ARMY_HONOR;
  world.handleCommand("cmd", { type: "armyInvite", target: "sol" });
  world.handleCommand("sol", { type: "armyAccept", from: "cmd" });

  soldier.mapId = BATTLE_ZONE_MAP;
  soldier.x = 3000;
  soldier.y = 1500;
  world._damagePlayer(soldier, 1_000_000, "some-mob");
  world.time += 10;
  world.respawnPlayer("sol");

  assert.equal(soldier.mapId, BATTLE_ZONE_MAP, "a member rides the army's lease");
  assert.equal(soldier.x, CAMP_STAGING[FREEHOLD].x);
  assert.equal(commander.army.hall.floor, 6, "and the commander still holds it");
});

test("the lease follows the office when the army changes hands", () => {
  const { world, commander } = commanding(FREEHOLD);
  world.handleCommand("cmd", { type: "armyRentHall", floor: 9 });
  const heir = world.addPlayer("heir", { name: "Heir", archetype: "vanguard" });
  heir.level = ARMY_LEVEL;
  heir.honor = ARMY_HONOR;
  world.handleCommand("cmd", { type: "armyInvite", target: "heir" });
  world.handleCommand("heir", { type: "armyAccept", from: "cmd" });

  world.handleCommand("cmd", { type: "armyTransfer", target: "heir" });
  world.handleCommand("heir", { type: "armyTransferAccept", from: "cmd" });

  assert.equal(heir.army.hall.floor, 9, "the new commander inherits the lease");
  assert.equal(commander.army.hall, undefined, "and the old one stops holding it");
  // The floor is still the army's, not orphaned on a lieutenant.
  assert.equal(world._hallHolder(FREEHOLD, 9), "铁誓军");
  assert.equal(world._armyHall("铁誓军").floor, 9);
});

test("giving a hall up frees the floor", () => {
  const { world, commander } = commanding();
  world.handleCommand("cmd", { type: "armyRentHall", floor: 11 });
  world.drainEvents();

  world.handleCommand("cmd", { type: "armyReleaseHall" });
  assert.equal(commander.army.hall, undefined);
  assert.equal(world._hallHolder(FREEHOLD, 11), null);
  const lost = world.drainEvents().find((event) => event.event === "armyHallLost");
  assert.equal(lost.reason, "released");
  throwsCode(() => world.releaseArmyHall("cmd"), "NO_HALL");
});

test("the company can see the lease it is paying for", () => {
  const { world } = commanding(FREEHOLD);
  world.handleCommand("cmd", { type: "armyRentHall", floor: 3 });
  const own = world.getSnapshot("cmd").players.find((entry) => entry.id === "cmd");
  assert.equal(own.army.hall.floor, 3);
  assert.ok(own.army.hall.rentDueAt > 0, "including when the next rent lands");
});

test("a commander must reach the enemy HQ before evicting one rented floor", () => {
  const { world, commander } = commanding(FREEHOLD);
  world.handleCommand("cmd", { type: "armyRentHall", floor: 4 });
  const rival = world.addPlayer("riv", { name: "Riv", archetype: "vanguard" });
  rival.level = ARMY_LEVEL;
  rival.honor = ARMY_HONOR;
  rival.gold = ARMY_HALL_RENT * 2;
  world.handleCommand("riv", { type: "armyCreate", name: "契约军", camp: COVENANT });
  world.handleCommand("riv", { type: "armyRentHall", floor: 4 });

  commander.mapId = BATTLE_ZONE_MAP;
  commander.x = CAMP_HQ[COVENANT].x;
  commander.y = CAMP_HQ[COVENANT].y;
  throwsCode(() => world.handleCommand("cmd", { type: "armySiege", camp: FREEHOLD, floor: 4 }), "SIEGE_FRIENDLY_HQ");
  world.handleCommand("cmd", { type: "armySiege", camp: COVENANT, floor: 4 });
  assert.ok(world._armySieges.size === 1, "the siege remains active during its assault window");
  assert.equal(rival.army.hall.floor, 4, "the defender keeps the hall until the assault is resolved");
  world.update(0.05);
  assert.equal(rival.army.hall.floor, 4, "the window must elapse before the lease can change hands");
  world.time += ARMY_SIEGE_DURATION;
  world.update(0.05);
  assert.equal(rival.army.hall, undefined, "the enemy floor is evicted");
  assert.equal(world._hallHolder(COVENANT, 4), null);
  assert.ok(world.drainEvents().some((event) => event.event === "armyHallEvicted"));
});

test("a defender holding the HQ repels the siege at the deadline", () => {
  const { world, commander } = commanding(FREEHOLD);
  world.handleCommand("cmd", { type: "armyRentHall", floor: 4 });
  const rival = world.addPlayer("riv", { name: "Riv", archetype: "vanguard" });
  rival.level = ARMY_LEVEL;
  rival.honor = ARMY_HONOR;
  rival.gold = ARMY_HALL_RENT * 2;
  world.handleCommand("riv", { type: "armyCreate", name: "契约军", camp: COVENANT });
  world.handleCommand("riv", { type: "armyRentHall", floor: 4 });

  commander.mapId = BATTLE_ZONE_MAP;
  commander.x = CAMP_HQ[COVENANT].x;
  commander.y = CAMP_HQ[COVENANT].y;
  rival.mapId = BATTLE_ZONE_MAP;
  rival.x = CAMP_HQ[COVENANT].x;
  rival.y = CAMP_HQ[COVENANT].y;
  world.handleCommand("cmd", { type: "armySiege", camp: COVENANT, floor: 4 });
  world.time += ARMY_SIEGE_DURATION;
  world.update(0.05);

  assert.equal(rival.army.hall.floor, 4, "a live defender at HQ keeps the lease");
  assert.equal(world._armySieges.size, 0, "the resolved siege is removed");
  const ended = world.drainEvents().find((event) => event.event === "armySiegeEnded");
  assert.equal(ended.result, "defender");
  assert.equal(ended.reason, "defenders_present");
});

test("leaving the enemy HQ aborts the assault before its window ends", () => {
  const { world, commander } = commanding(FREEHOLD);
  world.handleCommand("cmd", { type: "armyRentHall", floor: 4 });
  const rival = world.addPlayer("riv", { name: "Riv", archetype: "vanguard" });
  rival.level = ARMY_LEVEL;
  rival.honor = ARMY_HONOR;
  rival.gold = ARMY_HALL_RENT * 2;
  world.handleCommand("riv", { type: "armyCreate", name: "契约军", camp: COVENANT });
  world.handleCommand("riv", { type: "armyRentHall", floor: 4 });

  commander.mapId = BATTLE_ZONE_MAP;
  commander.x = CAMP_HQ[COVENANT].x;
  commander.y = CAMP_HQ[COVENANT].y;
  world.handleCommand("cmd", { type: "armySiege", camp: COVENANT, floor: 4 });
  commander.x += ARMY_SIEGE_RANGE + 1;
  world.update(0.05);

  assert.equal(rival.army.hall.floor, 4, "leaving HQ abandons the assault");
  assert.equal(world._armySieges.size, 0);
});

test("leaving the battle zone aborts the assault before its window ends", () => {
  const { world, commander } = commanding(FREEHOLD);
  world.handleCommand("cmd", { type: "armyRentHall", floor: 4 });
  const rival = world.addPlayer("riv", { name: "Riv", archetype: "vanguard" });
  rival.level = ARMY_LEVEL;
  rival.honor = ARMY_HONOR;
  rival.gold = ARMY_HALL_RENT * 2;
  world.handleCommand("riv", { type: "armyCreate", name: "契约军", camp: COVENANT });
  world.handleCommand("riv", { type: "armyRentHall", floor: 4 });

  commander.mapId = BATTLE_ZONE_MAP;
  commander.x = CAMP_HQ[COVENANT].x;
  commander.y = CAMP_HQ[COVENANT].y;
  world.handleCommand("cmd", { type: "armySiege", camp: COVENANT, floor: 4 });
  commander.mapId = "town";
  world.update(0.05);

  assert.equal(rival.army.hall.floor, 4, "leaving the battle zone abandons the assault");
  assert.equal(world._armySieges.size, 0);
});

test("killing the defending force leaves the HQ undefended", () => {
  const { world, commander } = commanding(FREEHOLD);
  world.handleCommand("cmd", { type: "armyRentHall", floor: 4 });
  const rival = world.addPlayer("riv", { name: "Riv", archetype: "vanguard" });
  rival.level = ARMY_LEVEL;
  rival.honor = ARMY_HONOR;
  rival.gold = ARMY_HALL_RENT * 2;
  world.handleCommand("riv", { type: "armyCreate", name: "契约军", camp: COVENANT });
  world.handleCommand("riv", { type: "armyRentHall", floor: 4 });

  commander.mapId = BATTLE_ZONE_MAP;
  commander.x = CAMP_HQ[COVENANT].x;
  commander.y = CAMP_HQ[COVENANT].y;
  rival.mapId = BATTLE_ZONE_MAP;
  rival.x = CAMP_HQ[COVENANT].x;
  rival.y = CAMP_HQ[COVENANT].y;
  world.handleCommand("cmd", { type: "armySiege", camp: COVENANT, floor: 4 });
  world._damagePlayer(rival, 1_000_000, commander.id);
  world.time += ARMY_SIEGE_DURATION;
  world.update(0.05);

  assert.equal(rival.army.hall, undefined, "killing the defender clears the HQ");
  const ended = world.drainEvents().find((event) => event.event === "armySiegeEnded");
  assert.equal(ended.result, "attacker");
  assert.equal(ended.reason, "hq_captured");
});

test("losing the attacking commander aborts the siege without evicting the hall", () => {
  const { world, commander } = commanding(FREEHOLD);
  world.handleCommand("cmd", { type: "armyRentHall", floor: 4 });
  const rival = world.addPlayer("riv", { name: "Riv", archetype: "vanguard" });
  rival.level = ARMY_LEVEL;
  rival.honor = ARMY_HONOR;
  rival.gold = ARMY_HALL_RENT * 2;
  world.handleCommand("riv", { type: "armyCreate", name: "契约军", camp: COVENANT });
  world.handleCommand("riv", { type: "armyRentHall", floor: 4 });

  commander.mapId = BATTLE_ZONE_MAP;
  commander.x = CAMP_HQ[COVENANT].x;
  commander.y = CAMP_HQ[COVENANT].y;
  world.handleCommand("cmd", { type: "armySiege", camp: COVENANT, floor: 4 });
  world._damagePlayer(commander, 1_000_000, "defender");
  world.update(0.05);

  assert.equal(rival.army.hall.floor, 4, "a broken assault cannot evict the lease");
  const ended = world.drainEvents().find((event) => event.event === "armySiegeEnded");
  assert.equal(ended.result, "defender");
  assert.equal(ended.reason, "commander_lost_position");
});

test("siege guards location, range, floor, rank, and cooldown independently", () => {
  const { world, commander } = commanding(FREEHOLD);
  const rival = world.addPlayer("riv", { name: "Riv", archetype: "vanguard" });
  rival.level = ARMY_LEVEL;
  rival.honor = ARMY_HONOR;
  rival.gold = ARMY_HALL_RENT * 3;
  world.handleCommand("riv", { type: "armyCreate", name: "契约军", camp: COVENANT });
  world.handleCommand("riv", { type: "armyRentHall", floor: 4 });

  commander.mapId = "town";
  commander.x = CAMP_HQ[COVENANT].x;
  commander.y = CAMP_HQ[COVENANT].y;
  throwsCode(() => world.handleCommand("cmd", { type: "armySiege", camp: COVENANT, floor: 4 }), "SIEGE_LOCATION");

  commander.mapId = BATTLE_ZONE_MAP;
  commander.x = CAMP_HQ[COVENANT].x + ARMY_SIEGE_RANGE + 1;
  throwsCode(() => world.handleCommand("cmd", { type: "armySiege", camp: COVENANT, floor: 4 }), "SIEGE_TOO_FAR");
  commander.x = CAMP_HQ[COVENANT].x;
  throwsCode(() => world.handleCommand("cmd", { type: "armySiege", camp: COVENANT, floor: 0 }), "INVALID_FLOOR");

  const recruit = world.addPlayer("rec", { name: "Rec", archetype: "vanguard" });
  world.handleCommand("cmd", { type: "armyInvite", target: "rec" });
  world.handleCommand("rec", { type: "armyAccept", from: "cmd" });
  world.handleCommand("cmd", { type: "armyPromote", name: "Rec", rank: "lieutenant" });
  recruit.mapId = BATTLE_ZONE_MAP;
  recruit.x = CAMP_HQ[COVENANT].x;
  recruit.y = CAMP_HQ[COVENANT].y;
  throwsCode(() => world.handleCommand("rec", { type: "armySiege", camp: COVENANT, floor: 4 }), "ARMY_RANK_FORBIDDEN");

  world.handleCommand("cmd", { type: "armySiege", camp: COVENANT, floor: 4 });
  world.time += ARMY_SIEGE_DURATION;
  world.update(0.05);
  rival.gold = ARMY_HALL_RENT;
  world.handleCommand("riv", { type: "armyRentHall", floor: 4 });
  throwsCode(() => world.handleCommand("cmd", { type: "armySiege", camp: COVENANT, floor: 4 }), "SIEGE_COOLDOWN");
});
