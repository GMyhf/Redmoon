// A hall is a lease, not a keep: it drains gold on a clock and what it buys is
// a footing — an army that holds one returns its dead to the front instead of
// walking back from town. These guard the drain, the footing, and the scarcity
// that a siege will later be fought over.
import assert from "node:assert/strict";
import test from "node:test";

import {
  ARMY_HALL_FLOORS, ARMY_HALL_PERIOD, ARMY_HALL_RENT, ARMY_HONOR, ARMY_LEVEL,
  BATTLE_ZONE_MAP, CAMPS, CAMP_STAGING,
} from "../src/server/definitions.js";
import { World, WorldError } from "../src/server/world.js";

const [FREEHOLD, COVENANT] = CAMPS.map((camp) => camp.id);

function throwsCode(fn, code) {
  assert.throws(fn, (error) => error instanceof WorldError && error.code === code, `expected ${code}`);
}

function commanding(camp = FREEHOLD) {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, safeZoneRadius: 0, autoLevel: false });
  const commander = world.addPlayer("cmd", { name: "Cmd", archetype: "vanguard" });
  commander.level = ARMY_LEVEL;
  commander.honor = ARMY_HONOR;
  commander.gold = ARMY_HALL_RENT * 4;
  world.handleCommand("cmd", { type: "armyCreate", name: "铁誓军", camp });
  return { world, commander };
}

test("a hall is leased with a camp, a rank, a free floor and the rent", () => {
  const { world, commander } = commanding();

  throwsCode(() => world.rentArmyHall("cmd", 0), "INVALID_FLOOR");
  throwsCode(() => world.rentArmyHall("cmd", ARMY_HALL_FLOORS + 1), "INVALID_FLOOR");

  const before = commander.gold;
  world.handleCommand("cmd", { type: "armyRentHall", floor: 7 });
  assert.equal(commander.army.hall.floor, 7);
  assert.equal(before - commander.gold, ARMY_HALL_RENT, "the first rent is due on signing");
  assert.equal(commander.army.hall.rentDueAt, ARMY_HALL_PERIOD, "and the clock starts");

  throwsCode(() => world.rentArmyHall("cmd", 8), "HALL_HELD");
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
  const { world, commander } = commanding();
  world.handleCommand("cmd", { type: "armyRentHall", floor: 2 });
  world.drainEvents();

  // Affordable: charged and rescheduled.
  world.time += ARMY_HALL_PERIOD;
  const before = commander.gold;
  world.update(0.05);
  assert.equal(before - commander.gold, ARMY_HALL_RENT, "rent is taken when it falls due");
  assert.equal(commander.army.hall.floor, 2, "and the lease runs on");
  assert.ok(world.drainEvents().some((event) => event.event === "armyHallRentPaid"));

  // Unaffordable: the lease ends rather than running up a debt.
  commander.gold = ARMY_HALL_RENT - 1;
  world.time += ARMY_HALL_PERIOD;
  world.update(0.05);
  assert.equal(commander.army.hall, undefined, "an unpaid hall is lost");
  assert.equal(commander.gold, ARMY_HALL_RENT - 1, "and nothing is taken on the way out");
  const lost = world.drainEvents().find((event) => event.event === "armyHallLost");
  assert.equal(lost.reason, "unpaid");
  // ...and the floor is free again.
  assert.equal(world._hallHolder(FREEHOLD, 2), null);
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
