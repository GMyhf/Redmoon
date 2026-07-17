// A camp is an army's allegiance, and in the battle zone it is the difference
// between a comrade and a target. So these guard two things: that it shields
// exactly the people it should, and that it cannot be switched — a camp you
// could change mid-hunt would be an escape button, not a choice.
import assert from "node:assert/strict";
import test from "node:test";

import {
  ARMY_HONOR, ARMY_LEVEL, BATTLE_ZONE_MAP, CAMPS,
} from "../src/server/definitions.js";
import { World, WorldError } from "../src/server/world.js";

const [FREEHOLD, COVENANT] = CAMPS.map((camp) => camp.id);

function throwsCode(fn, code) {
  assert.throws(fn, (error) => error instanceof WorldError && error.code === code, `expected ${code}`);
}

// Two players standing in the battle zone, each commanding their own army.
function warfront(leftCamp, rightCamp) {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, safeZoneRadius: 0, autoLevel: false });
  const make = (id, name, camp) => {
    const player = world.addPlayer(id, { name, archetype: "vanguard" });
    player.level = ARMY_LEVEL;
    player.honor = ARMY_HONOR;
    if (camp !== undefined) world.handleCommand(id, { type: "armyCreate", name: `${name}军`, camp });
    player.mapId = BATTLE_ZONE_MAP;
    return player;
  };
  const left = make("left", "Left", leftCamp);
  const right = make("right", "Right", rightCamp);
  right.x = left.x + 90;
  right.y = left.y;
  return { world, left, right };
}

function shoot(world, fromId, target) {
  world.setInput(fromId, { seq: 1, aim: { x: target.x, y: target.y }, primary: true });
  for (let step = 0; step < 12; step += 1) world.update(0.05);
}

test("a shared camp shields comrades from each other", () => {
  const { world, left, right } = warfront(FREEHOLD, FREEHOLD);
  const before = right.hp;
  shoot(world, "left", right);
  assert.equal(right.hp, before, "the battle zone is no longer a free-for-all");
});

test("opposing camps may still fight", () => {
  const { world, right } = warfront(FREEHOLD, COVENANT);
  const before = right.hp;
  shoot(world, "left", right);
  assert.ok(right.hp < before, "crossing camps is the point of the place");
});

test("without a camp there is nothing to hide behind", () => {
  // No army at all on either side: the old free-for-all still applies.
  const loose = warfront(undefined, undefined);
  const looseBefore = loose.right.hp;
  shoot(loose.world, "left", loose.right);
  assert.ok(loose.right.hp < looseBefore, "the campless are fair game");

  // An army that has not declared shields nobody either.
  const undeclared = warfront(null, null);
  assert.equal(undeclared.left.army.camp, null);
  const undeclaredBefore = undeclared.right.hp;
  shoot(undeclared.world, "left", undeclared.right);
  assert.ok(undeclared.right.hp < undeclaredBefore, "an undeclared army is not a shield");

  // And a camp shields only against a matching one, not against nothing.
  const mixed = warfront(FREEHOLD, undefined);
  const mixedBefore = mixed.right.hp;
  shoot(mixed.world, "left", mixed.right);
  assert.ok(mixed.right.hp < mixedBefore, "a camp does not protect the campless");
});

test("a camp is declared once and kept", () => {
  const { world, left } = warfront(null, null);

  world.handleCommand("left", { type: "armySetCamp", camp: FREEHOLD });
  assert.equal(left.army.camp, FREEHOLD);

  // The escape button this exists to prevent: hunted, switch sides, become
  // unshootable.
  throwsCode(() => world.setArmyCamp("left", COVENANT), "CAMP_SETTLED");
  throwsCode(() => world.setArmyCamp("left", FREEHOLD), "CAMP_SETTLED");
  assert.equal(left.army.camp, FREEHOLD);
});

test("only a commander declares, and only a real camp", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false });
  for (const [id, name] of [["cmd", "Cmd"], ["rec", "Rec"]]) {
    const player = world.addPlayer(id, { name, archetype: "vanguard" });
    player.level = ARMY_LEVEL;
    player.honor = ARMY_HONOR;
  }
  world.handleCommand("cmd", { type: "armyCreate", name: "铁誓军" });
  world.handleCommand("cmd", { type: "armyInvite", target: "rec" });
  world.handleCommand("rec", { type: "armyAccept", from: "cmd" });

  throwsCode(() => world.setArmyCamp("rec", FREEHOLD), "ARMY_RANK_FORBIDDEN");
  throwsCode(() => world.setArmyCamp("cmd", "atlantis"), "INVALID_CAMP");

  // A founder without an army yet, so the camp check is what answers.
  const loner = world.addPlayer("lone", { name: "Lone", archetype: "vanguard" });
  loner.level = ARMY_LEVEL;
  loner.honor = ARMY_HONOR;
  throwsCode(() => world.createArmy("lone", "别的军", "atlantis"), "INVALID_CAMP");
  assert.equal(loner.army, null, "a bad camp founds nothing");
});

test("a camp belongs to the army, so it reaches every member", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false });
  for (const [id, name] of [["cmd", "Cmd"], ["here", "Here"], ["away", "Away"]]) {
    const player = world.addPlayer(id, { name, archetype: "vanguard" });
    player.level = ARMY_LEVEL;
    player.honor = ARMY_HONOR;
  }
  world.handleCommand("cmd", { type: "armyCreate", name: "铁誓军" });
  for (const id of ["here", "away"]) {
    world.handleCommand("cmd", { type: "armyInvite", target: id });
    world.handleCommand(id, { type: "armyAccept", from: "cmd" });
  }
  const away = world.players.get("away");
  const token = away.token;
  world.syncAccounts();
  world.removePlayer("away");

  world.handleCommand("cmd", { type: "armySetCamp", camp: COVENANT });

  assert.equal(world.players.get("here").army.camp, COVENANT, "members present follow the army");
  const rejoined = world.addPlayer("away-2", { name: "Away", archetype: "vanguard", token });
  assert.equal(rejoined.army.camp, COVENANT, "and so do the ones who were not");
});

test("a recruit inherits the army's camp", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false });
  for (const [id, name] of [["cmd", "Cmd"], ["rec", "Rec"]]) {
    const player = world.addPlayer(id, { name, archetype: "vanguard" });
    player.level = ARMY_LEVEL;
    player.honor = ARMY_HONOR;
  }
  world.handleCommand("cmd", { type: "armyCreate", name: "铁誓军", camp: COVENANT });
  world.handleCommand("cmd", { type: "armyInvite", target: "rec" });
  world.handleCommand("rec", { type: "armyAccept", from: "cmd" });

  const recruit = world.players.get("rec");
  assert.equal(recruit.army.camp, COVENANT, "allegiance is the army's, not a personal choice");
});

test("a camp is legible before the shot, not after", () => {
  const { world } = warfront(FREEHOLD, COVENANT);
  const seen = world.getSnapshot("right").players.find((entry) => entry.id === "left");
  assert.equal(seen.armyCamp, FREEHOLD, "you can tell a comrade from a target on sight");
});
