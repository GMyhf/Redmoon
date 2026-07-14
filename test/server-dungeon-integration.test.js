import assert from "node:assert/strict";
import test from "node:test";

import { World } from "../src/server/world.js";
import { createGameServer } from "../src/server/server.js";

class ScriptedDungeonWorker {
  constructor(options = {}) {
    this.instanceId = options.instanceId;
    this.settleCalls = 0;
    this.attached = [];
  }

  async open(payload) {
    this.reward = { ...payload.plan.reward };
    return { type: "ready", stateVersion: 0 };
  }

  async attach(playerId) {
    this.attached.push(playerId);
    return {
      type: "attached",
      stateVersion: 0,
      snapshot: { players: [], enemies: [], projectiles: [], drops: [] },
    };
  }

  async tick() {
    return {
      type: "tickResult",
      stateVersion: 1,
      events: [
        ...this.enemyIds.map((enemyId) => ({ event: "enemyDefeated", enemyId })),
      ],
      snapshot: { players: [], enemies: [], projectiles: [], drops: [] },
    };
  }

  async settle(settlementId) {
    this.settleCalls += 1;
    return {
      type: "settle",
      settlementId,
      instanceId: this.instanceId,
      members: this.attached,
      reward: this.reward,
      stateVersion: 1,
    };
  }

  async recycle() {}
  async detach() {}
}

test("worker completion flows through server settlement and rewards once", async () => {
  let worker;
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const server = createGameServer({
    persistPath: "",
    world,
    dungeonWorkerFactory: (options) => {
      worker = new ScriptedDungeonWorker(options);
      return worker;
    },
  });
  const host = world.addPlayer("integration-host", { name: "IntegrationHost", archetype: "vanguard" });
  const guest = world.addPlayer("integration-guest", { name: "IntegrationGuest", archetype: "strider" });
  world.inviteParty(host.id, guest.id);
  world.acceptParty(guest.id, host.id);

  const socket = {
    playerId: host.id,
    readyState: 1,
    clientVisible: true,
    deliveryPaused: false,
    backpressureSkips: 0,
    bufferedAmount: 0,
    send() {},
  };
  await server._processCommandNow(socket, { type: "dungeonEnter" });
  const dungeon = [...world.dungeons.values()][0];
  worker.enemyIds = dungeon.plan.enemies.map((enemy) => enemy.id);
  const hostGold = host.gold;
  const guestGold = guest.gold;

  await server._tickDungeonWorkers(0.05);

  assert.equal(dungeon.stateVersion, 1);
  assert.equal(dungeon.settlement.status, "completed");
  assert.equal(worker.settleCalls, 1);
  assert.equal(host.gold, hostGold + dungeon.plan.reward.gold);
  assert.equal(guest.gold, guestGold + dungeon.plan.reward.gold);
  assert.equal(world.drainEvents().filter((event) => event.event === "dungeonCompleted").length, 1);
  await server.close();
});
