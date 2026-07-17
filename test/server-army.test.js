// An army has no store of its own — it is the set of accounts that name it.
// That choice buys us no migration and costs us a scan, and it is what most of
// these guard: an army has to hold together across members being offline,
// relogging, and being dismissed while away.
import assert from "node:assert/strict";
import test from "node:test";

import { ARMY_HONOR, ARMY_LEVEL, ARMY_RANKS } from "../src/server/definitions.js";
import { World, WorldError } from "../src/server/world.js";

function throwsCode(fn, code) {
  assert.throws(fn, (error) => error instanceof WorldError && error.code === code, `expected ${code}`);
}

function qualified(world, id, name) {
  const player = world.addPlayer(id, { name, archetype: "vanguard" });
  player.level = ARMY_LEVEL;
  player.honor = ARMY_HONOR;
  return player;
}

function founded() {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false });
  const commander = qualified(world, "cmd", "Commander");
  const recruit = qualified(world, "rec", "Recruit");
  world.handleCommand("cmd", { type: "armyCreate", name: "铁誓军" });
  world.handleCommand("cmd", { type: "armyInvite", target: "rec" });
  world.handleCommand("rec", { type: "armyAccept", from: "cmd" });
  return { world, commander, recruit };
}

test("founding an army asks for level and standing, and spends neither", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false });
  const player = world.addPlayer("p-1", { name: "Hopeful", archetype: "vanguard" });

  player.level = ARMY_LEVEL - 1;
  player.honor = ARMY_HONOR;
  throwsCode(() => world.createArmy("p-1", "铁誓军"), "ARMY_LEVEL_TOO_LOW");

  player.level = ARMY_LEVEL;
  player.honor = ARMY_HONOR - 1;
  throwsCode(() => world.createArmy("p-1", "铁誓军"), "NOT_ENOUGH_HONOR_FOR_ARMY");

  player.honor = ARMY_HONOR;
  world.handleCommand("p-1", { type: "armyCreate", name: "铁誓军" });
  assert.equal(player.army.name, "铁誓军");
  assert.equal(player.army.rank, "commander", "the founder commands");
  // Honour is a threshold everywhere it is read, refinement included.
  assert.equal(player.honor, ARMY_HONOR, "standing is checked, not charged");
});

test("an army name is claimed once, whatever its casing", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false });
  qualified(world, "a", "Alpha");
  const bravo = qualified(world, "b", "Bravo");
  world.handleCommand("a", { type: "armyCreate", name: "Ironsworn" });

  throwsCode(() => world.createArmy("b", "Ironsworn"), "ARMY_NAME_TAKEN");
  throwsCode(() => world.createArmy("b", "IRONSWORN"), "ARMY_NAME_TAKEN");
  throwsCode(() => world.createArmy("b", "  ironsworn  "), "ARMY_NAME_TAKEN");
  assert.equal(bravo.army, null);
});

test("recruiting needs an invitation the recruit accepts", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false });
  qualified(world, "cmd", "Commander");
  const recruit = qualified(world, "rec", "Recruit");
  world.handleCommand("cmd", { type: "armyCreate", name: "铁誓军" });

  throwsCode(() => world.acceptArmy("rec", "cmd"), "NO_ARMY_INVITE");
  world.handleCommand("cmd", { type: "armyInvite", target: "rec" });
  assert.equal(recruit.army, null, "an invitation alone enlists nobody");

  world.handleCommand("rec", { type: "armyAccept", from: "cmd" });
  assert.equal(recruit.army.name, "铁誓军");
  assert.equal(recruit.army.rank, "member");
  throwsCode(() => world.inviteArmy("cmd", "rec"), "ARMY_ACTIVE");
});

test("rank decides who may recruit and who may dismiss", () => {
  const { world, recruit } = founded();
  const third = qualified(world, "third", "Third");

  // A plain member recruits nobody.
  throwsCode(() => world.inviteArmy("rec", "third"), "ARMY_RANK_FORBIDDEN");

  world.handleCommand("cmd", { type: "armyPromote", name: "Recruit", rank: "lieutenant" });
  assert.equal(recruit.army.rank, "lieutenant");
  world.handleCommand("rec", { type: "armyInvite", target: "third" });
  world.handleCommand("third", { type: "armyAccept", from: "rec" });
  assert.equal(third.army.rank, "member", "a lieutenant recruits");

  // ...but never above their own station.
  throwsCode(() => world.kickArmy("rec", "Commander"), "ARMY_RANK_FORBIDDEN");
  throwsCode(() => world.kickArmy("third", "Recruit"), "ARMY_RANK_FORBIDDEN");
  world.handleCommand("rec", { type: "armyKick", name: "Third" });
  assert.equal(third.army, null);
  // Only the commander sets ranks or disbands, and never ranks themselves.
  throwsCode(() => world.disbandArmy("rec"), "ARMY_RANK_FORBIDDEN");
  throwsCode(() => world.promoteArmy("rec", "Commander", "member"), "ARMY_RANK_FORBIDDEN");
  throwsCode(() => world.promoteArmy("cmd", "Commander", "member"), "ARMY_RANK_FORBIDDEN");
  throwsCode(() => world.promoteArmy("cmd", "Recruit", "commander"), "INVALID_MESSAGE");
});

test("a company is never left leaderless", () => {
  const { world, commander, recruit } = founded();

  throwsCode(() => world.leaveArmy("cmd"), "ARMY_RANK_FORBIDDEN");
  world.handleCommand("rec", { type: "armyLeave" });
  assert.equal(recruit.army, null);
  // Last one out may go.
  world.handleCommand("cmd", { type: "armyLeave" });
  assert.equal(commander.army, null);
});

test("handing over the army is an offer, not an order", () => {
  const { world, commander, recruit } = founded();

  throwsCode(() => world.acceptArmyTransfer("rec", "cmd"), "NO_ARMY_INVITE");
  throwsCode(() => world.transferArmy("rec", "cmd"), "ARMY_RANK_FORBIDDEN");

  world.handleCommand("cmd", { type: "armyTransfer", target: "rec" });
  assert.equal(recruit.army.rank, "member", "an offer alone changes nothing");

  world.handleCommand("rec", { type: "armyTransferAccept", from: "cmd" });
  assert.equal(recruit.army.rank, "commander");
  assert.equal(commander.army.rank, "lieutenant", "the old commander stays on, one rank down");
});

test("the roster keeps members who are offline", () => {
  const { world, recruit } = founded();
  world.syncAccounts();
  world.removePlayer("rec");

  const roster = world._armyRoster("铁誓军");
  assert.equal(roster.length, 2, "an offline member still belongs");
  const offline = roster.find((member) => member.name === "Recruit");
  assert.equal(offline.online, false);
  assert.equal(offline.rank, "member");

  // And they are still there when they come back.
  const rejoined = world.addPlayer("rec-2", { name: "Recruit", archetype: "vanguard", token: recruit.token });
  assert.equal(rejoined.army.name, "铁誓军");
  assert.equal(rejoined.army.rank, "member");
});

test("an offline member can be dismissed, and finds out on return", () => {
  const { world, recruit } = founded();
  world.syncAccounts();
  world.removePlayer("rec");

  world.handleCommand("cmd", { type: "armyKick", name: "Recruit" });
  assert.equal(world._armyRoster("铁誓军").length, 1);

  const rejoined = world.addPlayer("rec-2", { name: "Recruit", archetype: "vanguard", token: recruit.token });
  assert.equal(rejoined.army, null, "the dismissal held while they were away");
});

test("disbanding clears everyone, present or not", () => {
  const { world, commander, recruit } = founded();
  world.syncAccounts();
  world.removePlayer("rec");

  world.handleCommand("cmd", { type: "armyDisband" });

  assert.equal(commander.army, null);
  assert.equal(world._armyRoster("铁誓军").length, 0);
  assert.equal(world._armyExists("铁誓军"), false, "and the name is free again");

  const rejoined = world.addPlayer("rec-2", { name: "Recruit", archetype: "vanguard", token: recruit.token });
  assert.equal(rejoined.army, null, "an absent member is disbanded too");
});

test("army chat reaches the company and nobody else", () => {
  const { world } = founded();
  const outsider = qualified(world, "out", "Outsider");
  world.drainEvents();

  world.handleCommand("cmd", { type: "chat", channel: "army", text: "集合" });
  const message = world.drainEvents().find((event) => event.event === "chatMessage");
  assert.equal(message.channel, "army");
  const recipients = message.scope?.players ?? [];
  assert.ok(recipients.includes("cmd") && recipients.includes("rec"));
  assert.ok(!recipients.includes(outsider.id), "an outsider never hears it");
});

test("army chat needs an army", () => {
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0, autoLevel: false });
  world.addPlayer("lone", { name: "Lone", archetype: "vanguard" });
  throwsCode(() => world.sendChat("lone", "army", "有人吗"), "NO_ARMY");
});

test("an army is visible on its members to everyone", () => {
  const { world } = founded();
  qualified(world, "watcher", "Watcher");

  const seen = world.getSnapshot("watcher").players.find((entry) => entry.id === "cmd");
  assert.equal(seen.armyName, "铁誓军", "a company is meant to be seen");
  assert.equal(seen.armyRank, "commander");
  // The full roster stays with the owner.
  const own = world.getSnapshot("cmd").players.find((entry) => entry.id === "cmd");
  assert.equal(own.army.members.length, 2);
  assert.deepEqual(ARMY_RANKS.includes(own.army.members[0].rank), true);
});

// An invitation is a delegation of authority, and authority can be taken away
// inside the window it stays open in. Duels re-check both sides on accept;
// this did not, so a dismissed recruiter's invitation still worked.
test("an invitation dies with the recruiter's authority", () => {
  const { world } = founded();
  const outsider = qualified(world, "out", "Outsider");
  world.handleCommand("cmd", { type: "armyPromote", name: "Recruit", rank: "lieutenant" });
  world.handleCommand("rec", { type: "armyInvite", target: "out" });

  // The commander dismisses the lieutenant while their invitation is pending.
  world.handleCommand("cmd", { type: "armyKick", name: "Recruit" });

  throwsCode(() => world.acceptArmy("out", "rec"), "NO_ARMY_INVITE");
  assert.equal(outsider.army, null, "a dismissed recruiter enlists nobody");
});

test("an invitation dies with the recruiter's rank", () => {
  const { world } = founded();
  const outsider = qualified(world, "out", "Outsider");
  world.handleCommand("cmd", { type: "armyPromote", name: "Recruit", rank: "lieutenant" });
  world.handleCommand("rec", { type: "armyInvite", target: "out" });

  // Demoted mid-window: a plain member may not recruit, so neither may their
  // outstanding invitation.
  world.handleCommand("cmd", { type: "armyPromote", name: "Recruit", rank: "member" });

  throwsCode(() => world.acceptArmy("out", "rec"), "NO_ARMY_INVITE");
  assert.equal(outsider.army, null);
});

// A dropped connection is not a departure: detachPlayer keeps the player for
// five minutes of grace, so a recruiter who vanishes mid-window still has a
// live record. Authority has to notice that too.
test("an invitation dies with the recruiter's connection", () => {
  const { world } = founded();
  const outsider = qualified(world, "out", "Outsider");
  world.handleCommand("cmd", { type: "armyPromote", name: "Recruit", rank: "lieutenant" });
  world.handleCommand("rec", { type: "armyInvite", target: "out" });

  world.detachPlayer("rec");

  throwsCode(() => world.acceptArmy("out", "rec"), "NO_ARMY_INVITE");
  assert.equal(outsider.army, null, "a recruiter who dropped enlists nobody");
});

test("a handover dies with the commander's connection", () => {
  const { world, recruit } = founded();
  world.handleCommand("cmd", { type: "armyTransfer", target: "rec" });

  world.detachPlayer("cmd");

  throwsCode(() => world.acceptArmyTransfer("rec", "cmd"), "INVALID_TARGET");
  assert.equal(recruit.army.rank, "member", "the army is not handed over by a ghost");
});
