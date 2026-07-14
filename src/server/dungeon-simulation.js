import { createHash } from "node:crypto";

import { World } from "./world.js";

export class DungeonSimulation {
  constructor({ plan, rngState, width, height }) {
    if (!plan || typeof plan !== "object" || !Array.isArray(plan.enemies)) {
      throw new TypeError("dungeon plan is required");
    }
    if (!rngState || typeof rngState !== "object") throw new TypeError("dungeon rngState is required");
    this.plan = plan;
    this.world = new World({
      width: positiveNumber(width, 4800),
      height: positiveNumber(height, 2700),
      rngState,
      spawnMobs: false,
      spawnBoss: false,
      safeZoneRadius: 0,
      mobTargetCount: 0,
    });
    for (const enemy of plan.enemies) {
      this.world.spawnMob({
        ...enemy,
        dungeonId: undefined,
        mapId: plan.mapId,
        x: enemy.x,
        y: enemy.y,
      });
    }
    this.players = new Set();
    this.pendingInputs = new Map();
    this.lastInputSeq = new Map();
    this.stateVersion = 0;
    this.lastTickId = 0;
  }

  attach(playerId, playerState = {}, lastInputSeq = 0) {
    if (typeof playerId !== "string" || !playerId) throw new TypeError("playerId is required");
    let player = this.world.players.get(playerId);
    if (!player) {
      player = this.world.addPlayer(playerId, {
        name: playerState.name ?? playerId,
        archetype: playerState.archetype ?? "vanguard",
      });
    }
    if (!this.players.has(playerId)) copyPlayerState(player, playerState, this.plan.mapId);
    player.connectionDetached = false;
    this.players.add(playerId);
    const currentSeq = Number.isSafeInteger(lastInputSeq) && lastInputSeq >= 0 ? lastInputSeq : 0;
    this.lastInputSeq.set(playerId, Math.max(this.lastInputSeq.get(playerId) ?? 0, currentSeq));
    return this.snapshot(playerId);
  }

  detach(playerId) {
    const player = this.world.players.get(playerId);
    if (!player) return false;
    player.connectionDetached = true;
    player.input = emptyInput();
    player.moveTarget = null;
    player.attackTarget = null;
    for (const mob of this.world.mobs.values()) {
      if (mob.aggroTargetId === playerId) mob.aggroTargetId = null;
      if (mob.attackTargetId === playerId) {
        mob.attackTargetId = null;
        mob.attackResolveAt = 0;
      }
    }
    return true;
  }

  queueInput(playerId, seq, intent = {}) {
    if (!this.players.has(playerId) || this.world.players.get(playerId)?.connectionDetached) return false;
    if (!Number.isSafeInteger(seq) || seq < 0 || !intent || typeof intent !== "object") return false;
    const last = this.lastInputSeq.get(playerId) ?? 0;
    const pending = this.pendingInputs.get(playerId);
    if (seq <= last || (pending && seq <= pending.seq)) return false;
    this.pendingInputs.set(playerId, { seq, intent: structuredClone(intent) });
    return true;
  }

  tick(dt, inputs = [], tickId = this.lastTickId + 1) {
    const batch = new Map();
    for (const [playerId, input] of this.pendingInputs) batch.set(playerId, input);
    this.pendingInputs.clear();
    for (const input of Array.isArray(inputs) ? inputs : []) {
      if (!input || typeof input !== "object") continue;
      const current = batch.get(input.playerId);
      if (typeof input.playerId !== "string" || !Number.isSafeInteger(input.seq)) continue;
      if (!current || input.seq > current.seq) {
        batch.set(input.playerId, { seq: input.seq, intent: structuredClone(input.intent ?? {}) });
      }
    }
    for (const [playerId, input] of [...batch.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      if (!this.players.has(playerId) || this.world.players.get(playerId)?.connectionDetached) continue;
      const last = this.lastInputSeq.get(playerId) ?? 0;
      if (input.seq <= last) continue;
      this.world.setInput(playerId, { ...input.intent, seq: input.seq });
      this.lastInputSeq.set(playerId, input.seq);
    }
    this.world.update(dt);
    this.lastTickId = tickId;
    this.stateVersion += 1;
    return {
      stateVersion: this.stateVersion,
      snapshot: this.snapshot(),
      events: this.world.drainEvents(),
      checkpoint: {
        stateVersion: this.stateVersion,
        rngState: this.world.getRandomState(),
      },
    };
  }

  snapshot(playerId = null) {
    const firstPlayerId = playerId ?? [...this.players].find((id) => !this.world.players.get(id)?.connectionDetached);
    return this.world.getSnapshot(firstPlayerId ?? null);
  }

  stateHash() {
    return createHash("sha256")
      .update(JSON.stringify({
        stateVersion: this.stateVersion,
        rngState: this.world.getRandomState(),
        mobs: [...this.world.mobs.values()].map((mob) => [mob.id, mob.x, mob.y, mob.hp]),
        players: [...this.world.players.values()].map((player) => [player.id, player.x, player.y, player.hp]),
      }))
      .digest("hex")
      .slice(0, 16);
  }
}

function copyPlayerState(player, state, mapId) {
  for (const field of ["level", "x", "y", "hp", "mp", "alive", "facing"]) {
    if (state[field] !== undefined) player[field] = structuredClone(state[field]);
  }
  player.mapId = mapId;
  player.input = emptyInput();
  player.moveTarget = null;
  player.attackTarget = null;
}

function emptyInput() {
  return {
    move: { x: 0, y: 0 },
    sprint: false,
    aim: { x: 0, y: 0 },
    primary: false,
    q: false,
    e: false,
    r: false,
    c: false,
    f: false,
  };
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
