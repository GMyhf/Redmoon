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

class SlowDungeonWorker extends ScriptedDungeonWorker {
  constructor(options) {
    super(options);
    this.tickCalls = 0;
    this.tickResolvers = [];
  }

  tick() {
    this.tickCalls += 1;
    return new Promise((resolve) => this.tickResolvers.push(resolve));
  }

  releaseTick() {
    const resolve = this.tickResolvers.shift();
    resolve?.({
      type: "tickResult",
      stateVersion: this.tickCalls,
      events: [],
      snapshot: { players: [], enemies: [], projectiles: [], drops: [] },
    });
  }
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

test("slow dungeon workers coalesce ticks instead of growing an async chain", async () => {
  let worker;
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const server = createGameServer({
    persistPath: "",
    world,
    dungeonWorkerFactory: (options) => {
      worker = new SlowDungeonWorker(options);
      return worker;
    },
  });
  const player = world.addPlayer("backpressure-player", {
    name: "BackpressureDelver", archetype: "vanguard",
  });
  const socket = {
    playerId: player.id,
    readyState: 1,
    clientVisible: true,
    deliveryPaused: false,
    backpressureSkips: 0,
    bufferedAmount: 0,
    send() {},
  };
  await server._processCommandNow(socket, { type: "dungeonEnter" });
  const dungeon = [...world.dungeons.values()][0];

  server._queueDungeonTick(0.05);
  for (let index = 0; index < 100; index += 1) server._queueDungeonTick(0.05);
  const state = server._dungeonTickStates.get(dungeon.id);
  assert.equal(worker.tickCalls, 1);
  assert.equal(state.inFlight, true);
  assert.ok(Math.abs(state.pendingDt - 5) < 1e-9);
  assert.equal(server._runtime.dungeonTicksCoalesced, 100);

  worker.releaseTick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(worker.tickCalls, 2, "one coalesced tick follows the in-flight request");
  assert.equal(state.pendingDt, 0);
  worker.releaseTick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(server._runtime.dungeonTickBacklogSeconds, 0);
  await server.close();
});

test("multiple slow dungeon workers keep bounded in-flight pressure independently", async () => {
  const workers = new Map();
  const world = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  const server = createGameServer({
    persistPath: "",
    world,
    dungeonWorkerFactory: (options) => {
      const worker = new SlowDungeonWorker(options);
      workers.set(options.instanceId, worker);
      return worker;
    },
  });

  for (let index = 0; index < 8; index += 1) {
    const player = world.addPlayer(`pressure-player-${index}`, {
      name: `PressureDelver${index}`,
      archetype: "vanguard",
    });
    await server._processCommandNow({
      playerId: player.id,
      readyState: 1,
      clientVisible: true,
      deliveryPaused: false,
      backpressureSkips: 0,
      bufferedAmount: 0,
      send() {},
    }, { type: "dungeonEnter" });
  }

  server._queueDungeonTick(0.05);
  for (let index = 0; index < 20; index += 1) server._queueDungeonTick(0.05);
  assert.equal(workers.size, 8);
  assert.equal([...workers.values()].every((worker) => worker.tickCalls === 1), true);
  assert.equal(server._runtime.dungeonTicksCoalesced, 160);
  assert.ok(Math.abs(server._runtime.dungeonTickBacklogSeconds - 8) < 1e-9);

  for (const worker of workers.values()) worker.releaseTick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal([...workers.values()].every((worker) => worker.tickCalls === 2), true);
  assert.equal(server._runtime.dungeonTickBacklogSeconds, 0);

  for (const worker of workers.values()) worker.releaseTick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal([...workers.values()].every((worker) => worker.tickResolvers.length === 0), true);
  assert.equal(server._runtime.dungeonTickBacklogSeconds, 0);
  await server.close();
});
