import { createHash } from "node:crypto";

import { World } from "./world.js";

export class DungeonSimulation {
  constructor({ instanceId, plan, rngState, width, height, checkpointIntervalTicks }) {
    if (!plan || typeof plan !== "object" || !Array.isArray(plan.enemies)) {
      throw new TypeError("dungeon plan is required");
    }
    if (!rngState || typeof rngState !== "object") throw new TypeError("dungeon rngState is required");
    this.instanceId = typeof instanceId === "string" && instanceId ? instanceId : plan.id;
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
    this.checkpointIntervalTicks = positiveInteger(checkpointIntervalTicks, 20);
    this.remaining = new Set(plan.enemies.map((enemy) => enemy.id));
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
    const result = {
      stateVersion: this.stateVersion,
      snapshot: this.snapshot(),
      events: this._drainEvents(),
    };
    if (this.stateVersion % this.checkpointIntervalTicks === 0) {
      result.checkpoint = this.createCheckpoint();
    }
    return result;
  }

  requestSettlement(settlementId) {
    if (typeof settlementId !== "string" || !settlementId) {
      throw new TypeError("settlementId is required");
    }
    return {
      type: "settle",
      settlementId,
      instanceId: this.instanceId,
      members: [...this.players],
      reward: { ...this.plan.reward },
      stateVersion: this.stateVersion,
    };
  }

  createCheckpoint() {
    return {
      schemaVersion: 1,
      instanceId: this.instanceId,
      plan: this.plan,
      width: this.world.width,
      height: this.world.height,
      rngState: this.world.getRandomState(),
      stateVersion: this.stateVersion,
      lastTickId: this.lastTickId,
      checkpointIntervalTicks: this.checkpointIntervalTicks,
      remaining: [...this.remaining],
      attachedPlayerIds: [...this.players],
      pendingInputs: encodeValue([...this.pendingInputs.entries()]),
      lastInputSeq: encodeValue([...this.lastInputSeq.entries()]),
      world: encodeValue({
        players: this.world.players,
        mobs: this.world.mobs,
        projectiles: this.world.projectiles,
        drops: this.world.drops,
        pendingMobSpawns: this.world.pendingMobSpawns,
        events: this.world.events,
        auditLog: this.world.auditLog,
        auditDropped: this.world.auditDropped,
        time: this.world.time,
        tick: this.world.tick,
        mobSequence: this.world._mobSequence,
        projectileSequence: this.world._projectileSequence,
        dropSequence: this.world._dropSequence,
        itemSequence: this.world._itemSequence,
        specialDropActive: this.world.specialDropActive,
        bossRespawns: this.world._bossRespawns,
        accountStore: this.world.accountStore,
        parties: this.world.parties,
        partyInvites: this.world._partyInvites,
        partySequence: this.world._partySequence,
      }),
    };
  }

  restoreCheckpoint(checkpoint) {
    validateCheckpoint(checkpoint, this.instanceId);
    const state = decodeValue(checkpoint.world);
    if (!state || typeof state !== "object") throw new TypeError("checkpoint world state is required");
    for (const field of ["players", "mobs", "projectiles", "drops", "bossRespawns", "parties", "partyInvites"]) {
      if (!(state[field] instanceof Map)) throw new TypeError(`checkpoint ${field} must be a Map`);
    }
    this.world.players = state.players;
    this.world.mobs = state.mobs;
    this.world.projectiles = state.projectiles;
    this.world.drops = state.drops;
    this.world.pendingMobSpawns = state.pendingMobSpawns;
    this.world.events = state.events;
    this.world.auditLog = state.auditLog;
    this.world.auditDropped = state.auditDropped;
    this.world.time = state.time;
    this.world.tick = state.tick;
    this.world._mobSequence = state.mobSequence;
    this.world._projectileSequence = state.projectileSequence;
    this.world._dropSequence = state.dropSequence;
    this.world._itemSequence = state.itemSequence;
    this.world.specialDropActive = state.specialDropActive;
    this.world._bossRespawns = state.bossRespawns;
    this.world.accountStore = state.accountStore;
    this.world.parties = state.parties;
    this.world._partyInvites = state.partyInvites;
    this.world._partySequence = state.partySequence;
    this.world.restoreRandomState(checkpoint.rngState);
    this.stateVersion = checkpoint.stateVersion;
    this.lastTickId = checkpoint.lastTickId;
    this.checkpointIntervalTicks = positiveInteger(checkpoint.checkpointIntervalTicks, 20);
    this.remaining = new Set(checkpoint.remaining);
    this.players = new Set(checkpoint.attachedPlayerIds);
    this.pendingInputs = new Map(decodeValue(checkpoint.pendingInputs));
    this.lastInputSeq = new Map(decodeValue(checkpoint.lastInputSeq));
    return this.snapshot();
  }

  snapshot(playerId = null) {
    const firstPlayerId = playerId ?? [...this.players].find((id) => !this.world.players.get(id)?.connectionDetached);
    return this.world.getSnapshot(firstPlayerId ?? null);
  }

  stateHash() {
    return createHash("sha256")
      .update(JSON.stringify(this.createCheckpoint()))
      .digest("hex")
      .slice(0, 16);
  }

  _drainEvents() {
    const events = this.world.drainEvents();
    for (const event of events) {
      if (event.type === "enemyDefeated" && typeof event.enemyId === "string") {
        this.remaining.delete(event.enemyId);
      }
    }
    return events;
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

function positiveInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function encodeValue(value) {
  if (value === undefined) return ["$undefined"];
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Set) return ["$set", [...value].map(encodeValue)];
  if (value instanceof Map) return ["$map", [...value].map(([key, entry]) => [encodeValue(key), encodeValue(entry)])];
  if (Array.isArray(value)) return value.map(encodeValue);
  return ["$object", Object.entries(value).map(([key, entry]) => [key, encodeValue(entry)])];
}

function decodeValue(value) {
  if (!Array.isArray(value)) return value;
  if (value[0] === "$undefined") return undefined;
  if (value[0] === "$set") return new Set(value[1].map(decodeValue));
  if (value[0] === "$map") return new Map(value[1].map(([key, entry]) => [decodeValue(key), decodeValue(entry)]));
  if (value[0] === "$object") return Object.fromEntries(value[1].map(([key, entry]) => [key, decodeValue(entry)]));
  return value.map(decodeValue);
}

function validateCheckpoint(checkpoint, instanceId) {
  if (!checkpoint || checkpoint.schemaVersion !== 1) throw new TypeError("unsupported dungeon checkpoint");
  if (checkpoint.instanceId !== instanceId) throw new TypeError("checkpoint instance mismatch");
  if (!Number.isSafeInteger(checkpoint.stateVersion) || checkpoint.stateVersion < 0) {
    throw new TypeError("checkpoint stateVersion is required");
  }
  if (!Number.isSafeInteger(checkpoint.lastTickId) || checkpoint.lastTickId < 0) {
    throw new TypeError("checkpoint lastTickId is required");
  }
  if (!Array.isArray(checkpoint.remaining) || !Array.isArray(checkpoint.attachedPlayerIds)) {
    throw new TypeError("checkpoint membership state is required");
  }
}
