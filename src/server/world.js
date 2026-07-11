import {
  ARCHETYPES,
  DROP_PICKUP_RADIUS,
  DROP_TTL,
  INVENTORY_LIMIT,
  ITEM_BASES,
  ITEM_SLOTS,
  MOB_TYPES,
  RARITIES,
  REBIRTH_DAMAGE_BONUS,
  REBIRTH_HP_BONUS,
  REBIRTH_LEVEL,
  REBIRTH_STAT_BONUS,
  SKILL_SLOTS,
  STAT_KEYS,
  TICK_RATE,
  publicArchetypes,
} from "./definitions.js";

const DEFAULT_WIDTH = 4800;
const DEFAULT_HEIGHT = 2700;
const PLAYER_RADIUS = 18;
const MOB_RADIUS = 16;
const RESPAWN_DELAY = 3;
const MOB_RESPAWN_DELAY = 2.5;
const DEFAULT_SAFE_ZONE_RADIUS = 220;
const MOVE_ARRIVAL_EPSILON = 4;
const MAX_MOB_LEVEL = 9;
const ELITE_CHANCE = 0.1;
const BOSS_ID = "boss-warden";
const BOSS_RESPAWN_DELAY = 90;
const QUEST_TARGET = 6;
const QUEST_REWARD_XP = 90;

const BASE_STATS = Object.freeze({
  vanguard: Object.freeze({ power: 6, agility: 3, spirit: 2, vitality: 7 }),
  channeler: Object.freeze({ power: 2, agility: 4, spirit: 7, vitality: 4 }),
  strider: Object.freeze({ power: 4, agility: 7, spirit: 3, vitality: 4 }),
});

export class WorldError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WorldError";
    this.code = code;
  }
}

export class World {
  constructor(options = {}) {
    if (options.rng !== undefined && typeof options.rng !== "function") {
      throw new TypeError("rng must be a function");
    }

    this.rng = options.rng ?? Math.random;
    this.name = typeof options.name === "string" && options.name.trim()
      ? options.name.trim().slice(0, 40)
      : "Glassward Outpost";
    this.width = positiveNumber(options.width, DEFAULT_WIDTH);
    this.height = positiveNumber(options.height, DEFAULT_HEIGHT);
    const safeZoneRadius = options.safeZoneRadius === 0
      ? 0
      : positiveNumber(options.safeZoneRadius, DEFAULT_SAFE_ZONE_RADIUS);
    this.safeZone = safeZoneRadius > 0
      ? { x: this.width / 2, y: this.height / 2, radius: safeZoneRadius }
      : null;
    this.mobTargetCount = nonNegativeInteger(options.mobTargetCount, 40);
    this.players = new Map();
    this.mobs = new Map();
    this.projectiles = new Map();
    this.drops = new Map();
    this.pendingMobSpawns = [];
    this.events = [];
    this.time = 0;
    this.tick = 0;
    this._mobSequence = 0;
    this._projectileSequence = 0;
    this._dropSequence = 0;
    this._itemSequence = 0;
    this._nextBossAt = null;

    if (options.spawnMobs !== false) {
      this._maintainMobPopulation();
      if (options.spawnBoss !== false) this.spawnBoss();
    }
  }

  static get archetypes() {
    return publicArchetypes();
  }

  addPlayer(id, options = {}) {
    const playerId = validateId(id);
    if (this.players.has(playerId)) {
      throw new WorldError("ALREADY_JOINED", "This connection already joined the world.");
    }

    const archetype = options.archetype ?? "vanguard";
    if (!Object.hasOwn(ARCHETYPES, archetype)) {
      throw new WorldError(
        "INVALID_ARCHETYPE",
        `archetype must be one of: ${Object.keys(ARCHETYPES).join(", ")}`,
      );
    }

    const spawn = this._playerSpawn();
    const stats = { ...BASE_STATS[archetype] };
    const player = {
      id: playerId,
      name: sanitizeName(options.name),
      archetype,
      x: spawn.x,
      y: spawn.y,
      radius: PLAYER_RADIUS,
      facing: { x: 1, y: 0 },
      input: emptyInput(),
      inputSeq: 0,
      hp: 1,
      maxHp: 1,
      alive: true,
      respawnAvailableAt: 0,
      moveTarget: null,
      attackTarget: null,
      rebirths: 0,
      inventory: [],
      equipment: Object.fromEntries(ITEM_SLOTS.map((slot) => [slot, null])),
      gearStats: zeroStats(),
      gearMods: { damage: 0, maxHp: 0, speed: 0 },
      level: 1,
      xp: 0,
      xpToNext: xpRequiredForLevel(1),
      stats,
      statPoints: 3,
      skillLevels: { q: 1, e: 1 },
      skillPoints: 1,
      nextPrimaryAt: 0,
      nextSkillAt: { q: 0, e: 0 },
      quest: {
        id: "stabilize-the-fringe",
        title: "Stabilize the Fringe",
        description: `Defeat ${QUEST_TARGET} Riftlings.`,
        target: QUEST_TARGET,
        progress: 0,
        complete: false,
        claimed: false,
        rewardXp: QUEST_REWARD_XP,
      },
    };
    this._refreshDerivedStats(player, false);
    player.hp = player.maxHp;
    this.players.set(playerId, player);
    this._emit("playerJoined", {
      playerId,
      name: player.name,
      archetype: player.archetype,
    });
    return player;
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) return false;
    this.players.delete(id);
    for (const [projectileId, projectile] of this.projectiles) {
      if (projectile.ownerId === id) this.projectiles.delete(projectileId);
    }
    this._emit("playerLeft", { playerId: id, name: player.name });
    return true;
  }

  handleCommand(id, message) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw new WorldError("INVALID_MESSAGE", "Message must be a JSON object.");
    }

    const type = message.type;
    if (type === "join" || type === "start") {
      return this.addPlayer(id, message);
    }

    const player = this.players.get(id);
    if (!player) {
      throw new WorldError("NOT_JOINED", "Send a join message before playing.");
    }

    switch (type) {
      case "input":
        return this.setInput(id, message);
      case "allocate":
        return this.allocateStat(id, message.stat);
      case "upgrade":
      case "upgradeSkill":
        return this.upgradeSkill(id, message.skill);
      case "respawn":
        return this.respawnPlayer(id);
      case "rebirth":
        return this.rebirthPlayer(id);
      case "equip":
        return this.equipItem(id, message.item);
      case "unequip":
        return this.unequipItem(id, message.slot);
      case "use":
        return this.usePotion(id, message.item);
      case "discard":
        return this.discardItem(id, message.item);
      default:
        throw new WorldError("UNKNOWN_MESSAGE", `Unknown message type: ${String(type)}`);
    }
  }

  setInput(id, input) {
    const player = this._requirePlayer(id);
    const seq = Number.isSafeInteger(input.seq) && input.seq >= 0
      ? input.seq
      : player.inputSeq + 1;
    if (seq < player.inputSeq) return player;

    player.inputSeq = seq;
    player.input = {
      move: normalizedVector(input.move),
      aim: finitePoint(input.aim, player.input.aim),
      primary: input.primary === true,
      q: input.q === true,
      e: input.e === true,
    };

    // Click-to-move and click-to-attack persist between input messages;
    // an absent field keeps the current order, an explicit null clears it.
    if (input.moveTo !== undefined) {
      const point = optionalFinitePoint(input.moveTo);
      player.moveTarget = point
        ? {
          x: clamp(point.x, PLAYER_RADIUS, this.width - PLAYER_RADIUS),
          y: clamp(point.y, PLAYER_RADIUS, this.height - PLAYER_RADIUS),
        }
        : null;
      if (point) player.attackTarget = null;
    }
    if (input.target !== undefined) {
      player.attackTarget = typeof input.target === "string"
        && input.target.length >= 1
        && input.target.length <= 80
        ? input.target
        : null;
      if (player.attackTarget) player.moveTarget = null;
    }
    return player;
  }

  allocateStat(id, stat) {
    const player = this._requirePlayer(id);
    if (!STAT_KEYS.includes(stat)) {
      throw new WorldError("INVALID_STAT", `stat must be one of: ${STAT_KEYS.join(", ")}`);
    }
    if (player.statPoints <= 0) {
      throw new WorldError("NO_STAT_POINTS", "No unspent stat points are available.");
    }
    if (!player.alive) {
      throw new WorldError("PLAYER_DEAD", "Stats cannot be allocated while defeated.");
    }

    player.stats[stat] += 1;
    player.statPoints -= 1;
    this._refreshDerivedStats(player, true);
    this._emit("statAllocated", { playerId: id, stat, value: player.stats[stat] });
    return player;
  }

  upgradeSkill(id, requestedSkill) {
    const player = this._requirePlayer(id);
    const slot = resolveSkillSlot(player.archetype, requestedSkill);
    if (!slot) {
      throw new WorldError("INVALID_SKILL", "skill must be q, e, or one of this archetype's skill ids.");
    }
    if (player.skillPoints <= 0) {
      throw new WorldError("NO_SKILL_POINTS", "No unspent skill points are available.");
    }

    const definition = ARCHETYPES[player.archetype].skills[slot];
    if (player.skillLevels[slot] >= definition.maxLevel) {
      throw new WorldError("SKILL_MAX_LEVEL", `${definition.name} is already at maximum level.`);
    }

    player.skillLevels[slot] += 1;
    player.skillPoints -= 1;
    this._emit("skillUpgraded", {
      playerId: id,
      skill: slot,
      skillId: definition.id,
      level: player.skillLevels[slot],
    });
    return player;
  }

  respawnPlayer(id) {
    const player = this._requirePlayer(id);
    if (player.alive) {
      throw new WorldError("ALREADY_ALIVE", "The player is already active.");
    }
    if (this.time < player.respawnAvailableAt) {
      throw new WorldError(
        "RESPAWN_PENDING",
        `Respawn is available in ${Math.ceil(player.respawnAvailableAt - this.time)} seconds.`,
      );
    }

    const spawn = this._playerSpawn();
    player.x = spawn.x;
    player.y = spawn.y;
    player.hp = player.maxHp;
    player.alive = true;
    player.input = emptyInput();
    player.moveTarget = null;
    player.attackTarget = null;
    player.nextPrimaryAt = this.time + 0.2;
    player.nextSkillAt.q = this.time + 0.2;
    player.nextSkillAt.e = this.time + 0.2;
    this._emit("playerRespawned", { playerId: id, x: player.x, y: player.y });
    return player;
  }

  rebirthPlayer(id) {
    const player = this._requirePlayer(id);
    if (!player.alive) {
      throw new WorldError("PLAYER_DEAD", "Rebirth is not possible while defeated.");
    }
    if (player.level < REBIRTH_LEVEL) {
      throw new WorldError(
        "REBIRTH_LEVEL_TOO_LOW",
        `Rebirth unlocks at level ${REBIRTH_LEVEL}.`,
      );
    }

    player.rebirths += 1;
    player.level = 1;
    player.xp = 0;
    player.xpToNext = xpRequiredForLevel(1);
    player.statPoints += REBIRTH_STAT_BONUS;
    player.skillPoints += 1;
    this._refreshDerivedStats(player, false);
    player.hp = player.maxHp;
    this._emit("playerReborn", {
      playerId: id,
      rebirths: player.rebirths,
      x: round(player.x),
      y: round(player.y),
    });
    return player;
  }

  equipItem(id, itemId) {
    const player = this._requirePlayer(id);
    if (!player.alive) {
      throw new WorldError("PLAYER_DEAD", "Equipment cannot be changed while defeated.");
    }
    const index = player.inventory.findIndex((item) => item.id === itemId);
    if (index < 0) {
      throw new WorldError("INVALID_ITEM", "That item is not in the inventory.");
    }

    const item = player.inventory[index];
    if (!ITEM_SLOTS.includes(item.slot)) {
      throw new WorldError("INVALID_ITEM", "That item cannot be equipped.");
    }
    if (player.level < (item.level ?? 1)) {
      throw new WorldError(
        "ITEM_LEVEL_TOO_HIGH",
        `This item requires level ${item.level}.`,
      );
    }
    player.inventory.splice(index, 1);
    const previous = player.equipment[item.slot];
    player.equipment[item.slot] = item;
    if (previous) player.inventory.push(previous);
    this._refreshGear(player);
    this._refreshDerivedStats(player, true);
    this._emit("itemEquipped", {
      playerId: id,
      itemId: item.id,
      name: item.name,
      rarity: item.rarity,
      slot: item.slot,
    });
    return player;
  }

  unequipItem(id, slot) {
    const player = this._requirePlayer(id);
    if (!ITEM_SLOTS.includes(slot)) {
      throw new WorldError("INVALID_SLOT", `slot must be one of: ${ITEM_SLOTS.join(", ")}`);
    }
    const item = player.equipment[slot];
    if (!item) {
      throw new WorldError("INVALID_ITEM", "Nothing is equipped in that slot.");
    }
    if (player.inventory.length >= INVENTORY_LIMIT) {
      throw new WorldError("INVENTORY_FULL", "The inventory is full.");
    }
    player.equipment[slot] = null;
    player.inventory.push(item);
    this._refreshGear(player);
    this._refreshDerivedStats(player, true);
    this._emit("itemUnequipped", { playerId: id, itemId: item.id, name: item.name, slot });
    return player;
  }

  usePotion(id, itemId) {
    const player = this._requirePlayer(id);
    if (!player.alive) {
      throw new WorldError("PLAYER_DEAD", "Potions cannot be used while defeated.");
    }
    const index = player.inventory.findIndex((item) => item.id === itemId);
    if (index < 0 || !Number.isFinite(player.inventory[index].heal)) {
      throw new WorldError("INVALID_ITEM", "That item cannot be consumed.");
    }
    const [potion] = player.inventory.splice(index, 1);
    const healed = Math.min(player.maxHp - player.hp, potion.heal);
    player.hp = Math.min(player.maxHp, player.hp + potion.heal);
    this._emit("potionUsed", {
      playerId: id,
      itemId: potion.id,
      heal: round(healed),
      x: round(player.x),
      y: round(player.y),
    });
    return player;
  }

  discardItem(id, itemId) {
    const player = this._requirePlayer(id);
    const index = player.inventory.findIndex((item) => item.id === itemId);
    if (index < 0) {
      throw new WorldError("INVALID_ITEM", "That item is not in the inventory.");
    }
    const [item] = player.inventory.splice(index, 1);
    this._emit("itemDiscarded", { playerId: id, itemId: item.id, name: item.name });
    return player;
  }

  giveItem(id, overrides = {}) {
    const player = this._requirePlayer(id);
    if (player.inventory.length >= INVENTORY_LIMIT) {
      throw new WorldError("INVENTORY_FULL", "The inventory is full.");
    }
    const rolled = this._rollItem(Math.max(1, nonNegativeInteger(overrides.level, 1)));
    const item = { ...rolled, ...overrides, id: overrides.id ?? rolled.id };
    player.inventory.push(item);
    return item;
  }

  update(dt = 1 / TICK_RATE) {
    if (!Number.isFinite(dt) || dt <= 0) {
      throw new TypeError("dt must be a positive finite number");
    }

    // Keep large scheduling stalls from tunnelling entities across the map.
    const steps = Math.max(1, Math.ceil(dt / 0.05));
    const step = Math.min(dt, 0.5) / steps;
    for (let index = 0; index < steps; index += 1) {
      this.time += step;
      this._updatePlayers(step);
      this._updateMobs(step);
      this._updateProjectiles(step);
      this._updateDrops();
      this._processMobSpawns();
    }
    this.tick += 1;
    return this.getSnapshot();
  }

  getSnapshot(selfId = null) {
    const enemies = [...this.mobs.values()].map((mob) => ({
      id: mob.id,
      type: mob.type,
      name: mob.name,
      x: round(mob.x),
      y: round(mob.y),
      radius: mob.radius,
      hp: round(mob.hp),
      maxHp: mob.maxHp,
      level: mob.level,
      elite: mob.elite === true,
      boss: mob.boss === true,
      alive: true,
    }));

    const drops = [...this.drops.values()].map((drop) => ({
      id: drop.id,
      x: round(drop.x),
      y: round(drop.y),
      slot: drop.item.slot,
      rarity: drop.item.rarity,
      name: drop.item.name,
    }));

    const projectiles = [...this.projectiles.values()].map((projectile) => ({
      id: projectile.id,
      ownerId: projectile.ownerId,
      team: projectile.team,
      x: round(projectile.x),
      y: round(projectile.y),
      fromX: round(projectile.fromX),
      fromY: round(projectile.fromY),
      radius: projectile.radius,
      color: projectile.color,
    }));

    return {
      type: "snapshot",
      tick: this.tick,
      serverTime: round(this.time),
      selfId,
      world: {
        name: this.name,
        width: this.width,
        height: this.height,
        time: round(this.time),
        tick: this.tick,
      },
      safeZone: this.safeZone ? { ...this.safeZone } : null,
      players: [...this.players.values()].map((player) => this._serializePlayer(player)),
      enemies,
      mobs: enemies,
      projectiles,
      drops,
    };
  }

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  spawnMob(overrides = {}) {
    const point = overrides.x === undefined || overrides.y === undefined
      ? this._mobSpawn()
      : { x: Number(overrides.x), y: Number(overrides.y) };
    // Danger scales with distance from the town at the map centre.
    const jitter = Math.floor(clamp(this.rng(), 0, 0.999999) * 2);
    const rolledLevel = clamp(this._levelForPoint(point) + jitter, 1, MAX_MOB_LEVEL);
    const level = Math.max(1, nonNegativeInteger(overrides.level, rolledLevel));
    const elite = overrides.elite ?? (overrides.level === undefined && this.rng() < ELITE_CHANCE);
    const band = Math.min(MOB_TYPES.length - 1, Math.floor((level - 1) / 3));
    const species = MOB_TYPES[band];
    const power = elite ? 1.6 : 1;
    const maxHp = positiveNumber(overrides.maxHp, Math.round((26 + level * 16) * power));
    const id = overrides.id ?? `mob-${++this._mobSequence}`;
    const mob = {
      id: validateId(id),
      type: overrides.type ?? species.type,
      name: overrides.name ?? species.name,
      x: clamp(point.x, MOB_RADIUS, this.width - MOB_RADIUS),
      y: clamp(point.y, MOB_RADIUS, this.height - MOB_RADIUS),
      radius: positiveNumber(overrides.radius, elite ? MOB_RADIUS + 5 : MOB_RADIUS),
      level,
      elite: elite === true,
      boss: overrides.boss === true,
      hp: maxHp,
      maxHp,
      speed: positiveNumber(overrides.speed, 70 + level * 3),
      damage: positiveNumber(overrides.damage, (5 + level * 2.5) * power),
      xp: positiveNumber(overrides.xp, Math.round((22 + level * 9) * (elite ? 2 : 1))),
      nextAttackAt: this.time,
    };
    if (this.mobs.has(mob.id)) {
      throw new WorldError("DUPLICATE_ENTITY", `A mob with id ${mob.id} already exists.`);
    }
    this.mobs.set(mob.id, mob);
    return mob;
  }

  spawnBoss() {
    if (this.mobs.has(BOSS_ID)) return this.mobs.get(BOSS_ID);
    const boss = this.spawnMob({
      id: BOSS_ID,
      type: "warden",
      name: "Crimson Warden",
      boss: true,
      elite: false,
      x: this.width * 0.9,
      y: this.height * 0.14,
      level: 12,
      maxHp: 1500,
      radius: 30,
      speed: 92,
      damage: 34,
      xp: 650,
    });
    this._nextBossAt = null;
    this._emit("bossSpawned", { enemyId: boss.id, x: round(boss.x), y: round(boss.y) });
    return boss;
  }

  _levelForPoint(point) {
    const dx = point.x - this.width / 2;
    const dy = point.y - this.height / 2;
    const reach = Math.hypot(this.width, this.height) / 2;
    return 1 + Math.floor((Math.hypot(dx, dy) / reach) * (MAX_MOB_LEVEL - 1));
  }

  _updatePlayers(dt) {
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      const speed = ARCHETYPES[player.archetype].baseSpeed
        + this._statTotal(player, "agility") * 3.2
        + player.gearMods.speed;
      const manualMove = player.input.move.x !== 0 || player.input.move.y !== 0;

      if (manualMove) {
        player.moveTarget = null;
        player.attackTarget = null;
        player.x = clamp(player.x + player.input.move.x * speed * dt, PLAYER_RADIUS, this.width - PLAYER_RADIUS);
        player.y = clamp(player.y + player.input.move.y * speed * dt, PLAYER_RADIUS, this.height - PLAYER_RADIUS);
      } else {
        this._advanceAutoOrders(player, speed, dt);
      }

      const aim = directionTo(player, player.input.aim, player.facing);
      if (aim.x !== 0 || aim.y !== 0) player.facing = aim;
      const regenBoost = this._inSafeZone(player) ? 4 : 1;
      player.hp = Math.min(
        player.maxHp,
        player.hp + (0.35 + this._statTotal(player, "vitality") * 0.04) * regenBoost * dt,
      );

      if (player.input.primary) this._usePrimary(player, aim);
      if (player.input.q) this._useSkill(player, "q", aim);
      if (player.input.e) this._useSkill(player, "e", aim);
    }
  }

  // Click-driven orders: walk to a point, or close on a marked enemy and
  // keep firing the primary attack until it falls.
  _advanceAutoOrders(player, speed, dt) {
    let destination = null;
    if (player.attackTarget) {
      const mob = this.mobs.get(player.attackTarget);
      if (!mob) {
        player.attackTarget = null;
      } else {
        const range = ARCHETYPES[player.archetype].primary.range;
        const distance = Math.hypot(mob.x - player.x, mob.y - player.y);
        if (distance <= range * 0.85) {
          const direction = directionTo(player, mob, player.facing);
          player.facing = direction;
          this._usePrimary(player, direction);
          return;
        }
        destination = { x: mob.x, y: mob.y };
      }
    }
    if (!destination && player.moveTarget) destination = player.moveTarget;
    if (!destination) return;

    const dx = destination.x - player.x;
    const dy = destination.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= MOVE_ARRIVAL_EPSILON) {
      if (!player.attackTarget) player.moveTarget = null;
      return;
    }
    const travel = Math.min(speed * dt, distance);
    player.x = clamp(player.x + (dx / distance) * travel, PLAYER_RADIUS, this.width - PLAYER_RADIUS);
    player.y = clamp(player.y + (dy / distance) * travel, PLAYER_RADIUS, this.height - PLAYER_RADIUS);
    player.facing = { x: dx / distance, y: dy / distance };
    if (!player.attackTarget && distance - travel <= MOVE_ARRIVAL_EPSILON) {
      player.moveTarget = null;
    }
  }

  _updateMobs(dt) {
    for (const mob of [...this.mobs.values()]) {
      const target = this._nearestLivingPlayer(mob, mob.boss ? 460 : 300);
      if (!target || this._inSafeZone(target)) continue;

      const dx = target.x - mob.x;
      const dy = target.y - mob.y;
      const distance = Math.hypot(dx, dy);
      const contactDistance = target.radius + mob.radius + 5;
      if (distance > contactDistance) {
        const travel = Math.min(mob.speed * dt, Math.max(0, distance - contactDistance));
        mob.x += (dx / distance) * travel;
        mob.y += (dy / distance) * travel;
      } else if (this.time >= mob.nextAttackAt) {
        mob.nextAttackAt = this.time + 1.15;
        this._damagePlayer(target, mob.damage, mob.id);
      }
    }
  }

  _updateProjectiles(dt) {
    for (const [id, projectile] of [...this.projectiles]) {
      const oldX = projectile.x;
      const oldY = projectile.y;
      projectile.fromX = oldX;
      projectile.fromY = oldY;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.ttl -= dt;

      if (projectile.team === "players") {
        for (const mob of [...this.mobs.values()]) {
          if (projectile.hitIds.has(mob.id)) continue;
          if (!segmentHitsCircle(oldX, oldY, projectile.x, projectile.y, mob.x, mob.y, mob.radius + projectile.radius)) {
            continue;
          }
          projectile.hitIds.add(mob.id);
          this._damageMob(mob, projectile.damage, projectile.ownerId);
          projectile.hitsRemaining -= 1;
          if (projectile.hitsRemaining <= 0) break;
        }
      }

      const outside = projectile.x < -40
        || projectile.y < -40
        || projectile.x > this.width + 40
        || projectile.y > this.height + 40;
      if (projectile.hitsRemaining <= 0 || projectile.ttl <= 0 || outside) {
        this.projectiles.delete(id);
      }
    }
  }

  _usePrimary(player, direction) {
    if (this.time < player.nextPrimaryAt) return;
    const definition = ARCHETYPES[player.archetype];
    const haste = 1 + this._statTotal(player, "agility") * 0.018;
    player.nextPrimaryAt = this.time + definition.primary.cooldown / haste;
    const scaling = this._statTotal(player, "power") * 1.55 + this._statTotal(player, "spirit") * 0.38;
    this._spawnProjectile(player, direction, {
      damage: definition.primary.damage + scaling,
      speed: definition.primary.speed,
      range: definition.primary.range,
      radius: player.archetype === "vanguard" ? 9 : 6,
      color: definition.primary.color,
    });
  }

  _useSkill(player, slot, direction) {
    if (this.time < player.nextSkillAt[slot]) return;
    const archetype = ARCHETYPES[player.archetype];
    const skill = archetype.skills[slot];
    const level = player.skillLevels[slot];
    const cooldownReduction = 1 - Math.min(0.28, (level - 1) * 0.07);
    player.nextSkillAt[slot] = this.time + skill.cooldown * cooldownReduction;

    if (player.archetype === "vanguard" && slot === "q") {
      this._movePlayer(player, direction, 94 + level * 10);
      this._spawnProjectile(player, direction, {
        damage: 25 + level * 8 + this._statTotal(player, "power") * 2.1,
        speed: 560,
        range: 250 + level * 15,
        radius: 15,
        color: archetype.color,
      });
    } else if (player.archetype === "vanguard") {
      this._radialBurst(player, 8 + level, {
        damage: 12 + level * 5 + this._statTotal(player, "power") * 1.25,
        speed: 440,
        range: 180 + level * 16,
        radius: 10,
        color: archetype.color,
      });
    } else if (player.archetype === "channeler" && slot === "q") {
      this._spawnProjectile(player, direction, {
        damage: 27 + level * 9 + this._statTotal(player, "spirit") * 2.25,
        speed: 750,
        range: 760,
        radius: 11,
        pierce: 2 + Math.floor(level / 2),
        color: archetype.color,
      });
    } else if (player.archetype === "channeler") {
      this._radialBurst(player, 8 + level * 2, {
        damage: 13 + level * 5 + this._statTotal(player, "spirit") * 1.35,
        speed: 520,
        range: 360 + level * 20,
        radius: 7,
        color: archetype.color,
      });
    } else if (player.archetype === "strider" && slot === "q") {
      for (const angle of [-0.16, 0, 0.16]) {
        this._spawnProjectile(player, rotate(direction, angle), {
          damage: 17 + level * 6 + this._statTotal(player, "agility") * 1.45,
          speed: 820,
          range: 680,
          radius: 6,
          color: archetype.color,
        });
      }
    } else {
      this._movePlayer(player, direction, 130 + level * 15);
      for (const angle of [-0.1, 0.1]) {
        this._spawnProjectile(player, rotate(direction, angle), {
          damage: 19 + level * 7 + this._statTotal(player, "agility") * 1.6,
          speed: 780,
          range: 500,
          radius: 7,
          color: archetype.color,
        });
      }
    }

    this._emit("skillUsed", {
      playerId: player.id,
      skill: slot,
      skillId: skill.id,
      level,
    });
  }

  _spawnProjectile(player, direction, options) {
    const unit = normalizedVector(direction, player.facing);
    const speed = options.speed;
    const ttl = options.range / speed;
    const id = `projectile-${++this._projectileSequence}`;
    const offset = player.radius + (options.radius ?? 6) + 2;
    const x = player.x + unit.x * offset;
    const y = player.y + unit.y * offset;
    const projectile = {
      id,
      ownerId: player.id,
      team: "players",
      x,
      y,
      fromX: x,
      fromY: y,
      vx: unit.x * speed,
      vy: unit.y * speed,
      radius: options.radius ?? 6,
      damage: options.damage
        * (1 + player.rebirths * REBIRTH_DAMAGE_BONUS)
        * (1 + player.gearMods.damage),
      ttl,
      hitsRemaining: options.pierce ?? 1,
      hitIds: new Set(),
      color: options.color,
    };
    this.projectiles.set(id, projectile);
    return projectile;
  }

  _radialBurst(player, count, options) {
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      this._spawnProjectile(player, { x: Math.cos(angle), y: Math.sin(angle) }, options);
    }
  }

  _movePlayer(player, direction, distance) {
    player.x = clamp(player.x + direction.x * distance, PLAYER_RADIUS, this.width - PLAYER_RADIUS);
    player.y = clamp(player.y + direction.y * distance, PLAYER_RADIUS, this.height - PLAYER_RADIUS);
  }

  _damageMob(mob, damage, ownerId) {
    if (!this.mobs.has(mob.id)) return;
    mob.hp -= Math.max(0, damage);
    if (mob.hp > 0) return;

    this.mobs.delete(mob.id);
    for (const other of this.players.values()) {
      if (other.attackTarget === mob.id) other.attackTarget = null;
    }
    if (mob.boss) {
      this._dropBossHoard(mob);
      this._nextBossAt = this.time + BOSS_RESPAWN_DELAY;
      this._emit("bossSlain", { enemyId: mob.id, playerId: ownerId, x: round(mob.x), y: round(mob.y) });
    } else {
      this._maybeDropLoot(mob);
    }
    const player = this.players.get(ownerId);
    if (player) {
      this._grantXp(player, mob.xp);
      this._advanceQuest(player);
    }
    this.pendingMobSpawns.push({ at: this.time + MOB_RESPAWN_DELAY });
    this._emit("enemyDefeated", {
      enemyId: mob.id,
      enemyType: mob.type,
      playerId: ownerId,
      xp: mob.xp,
      x: round(mob.x),
      y: round(mob.y),
    });
  }

  _damagePlayer(player, damage, sourceId) {
    if (!player.alive) return;
    if (this._inSafeZone(player)) return;
    const mitigation = Math.min(0.38, this._statTotal(player, "vitality") * 0.018);
    player.hp -= Math.max(1, damage * (1 - mitigation));
    if (player.hp > 0) return;

    player.hp = 0;
    player.alive = false;
    player.respawnAvailableAt = this.time + RESPAWN_DELAY;
    player.input = emptyInput();
    this._emit("playerDefeated", {
      playerId: player.id,
      sourceId,
      respawnDelay: RESPAWN_DELAY,
      x: round(player.x),
      y: round(player.y),
    });
  }

  _grantXp(player, amount) {
    player.xp += amount;
    let gainedLevels = 0;
    while (player.xp >= player.xpToNext) {
      player.xp -= player.xpToNext;
      player.level += 1;
      gainedLevels += 1;
      player.statPoints += 4;
      player.skillPoints += 1;
      player.xpToNext = xpRequiredForLevel(player.level);
      this._refreshDerivedStats(player, true);
    }
    if (gainedLevels > 0) {
      this._emit("levelUp", {
        playerId: player.id,
        level: player.level,
        levelsGained: gainedLevels,
      });
    }
  }

  _advanceQuest(player) {
    if (player.quest.complete) return;
    player.quest.progress = Math.min(player.quest.target, player.quest.progress + 1);
    this._emit("questProgress", {
      playerId: player.id,
      questId: player.quest.id,
      progress: player.quest.progress,
      target: player.quest.target,
    });
    if (player.quest.progress < player.quest.target) return;

    player.quest.complete = true;
    player.quest.claimed = true;
    this._emit("questCompleted", {
      playerId: player.id,
      questId: player.quest.id,
      rewardXp: player.quest.rewardXp,
    });
    this._grantXp(player, player.quest.rewardXp);
  }

  _refreshDerivedStats(player, preserveHealth) {
    const oldMax = player.maxHp;
    const ratio = oldMax > 0 ? player.hp / oldMax : 1;
    player.maxHp = Math.round(
      (ARCHETYPES[player.archetype].baseHp
        + this._statTotal(player, "vitality") * 11
        + (player.level - 1) * 7
        + player.gearMods.maxHp)
        * (1 + player.rebirths * REBIRTH_HP_BONUS),
    );
    if (preserveHealth) {
      player.hp = Math.min(player.maxHp, Math.max(1, player.maxHp * ratio));
    }
  }

  _serializePlayer(player) {
    const archetype = ARCHETYPES[player.archetype];
    const skills = Object.fromEntries(SKILL_SLOTS.map((slot) => {
      const definition = archetype.skills[slot];
      return [slot, {
        id: definition.id,
        name: definition.name,
        level: player.skillLevels[slot],
        maxLevel: definition.maxLevel,
        cooldown: definition.cooldown,
        remaining: round(Math.max(0, player.nextSkillAt[slot] - this.time)),
      }];
    }));
    return {
      id: player.id,
      name: player.name,
      archetype: player.archetype,
      color: archetype.color,
      x: round(player.x),
      y: round(player.y),
      radius: player.radius,
      facing: { x: round(player.facing.x), y: round(player.facing.y) },
      hp: round(player.hp),
      maxHp: player.maxHp,
      alive: player.alive,
      respawnIn: round(Math.max(0, player.respawnAvailableAt - this.time)),
      moveTarget: player.moveTarget ? { x: round(player.moveTarget.x), y: round(player.moveTarget.y) } : null,
      targetId: player.attackTarget,
      rebirths: player.rebirths,
      level: player.level,
      xp: round(player.xp),
      xpToNext: player.xpToNext,
      stats: { ...player.stats },
      gearStats: { ...player.gearStats },
      statPoints: player.statPoints,
      equipment: Object.fromEntries(
        ITEM_SLOTS.map((slot) => [
          slot,
          player.equipment[slot] ? serializeItem(player.equipment[slot]) : null,
        ]),
      ),
      inventory: player.inventory.map(serializeItem),
      skills,
      skillPoints: player.skillPoints,
      quest: { ...player.quest },
      inputSeq: player.inputSeq,
    };
  }

  _nearestLivingPlayer(entity, maximumDistance) {
    let nearest = null;
    let nearestSquared = maximumDistance * maximumDistance;
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      const dx = player.x - entity.x;
      const dy = player.y - entity.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < nearestSquared) {
        nearest = player;
        nearestSquared = distanceSquared;
      }
    }
    return nearest;
  }

  _playerSpawn() {
    const spread = Math.min(this.width, this.height) * 0.12;
    return {
      x: clamp(this.width / 2 + (this.rng() - 0.5) * spread, PLAYER_RADIUS, this.width - PLAYER_RADIUS),
      y: clamp(this.height / 2 + (this.rng() - 0.5) * spread, PLAYER_RADIUS, this.height - PLAYER_RADIUS),
    };
  }

  _mobSpawn() {
    // Anywhere on the map except inside (or hugging) the town safe zone.
    const margin = 70;
    const buffer = (this.safeZone?.radius ?? 0) + 120;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const x = margin + this.rng() * Math.max(1, this.width - margin * 2);
      const y = margin + this.rng() * Math.max(1, this.height - margin * 2);
      if (!this.safeZone) return { x, y };
      const dx = x - this.safeZone.x;
      const dy = y - this.safeZone.y;
      if (dx * dx + dy * dy > buffer * buffer) return { x, y };
    }
    return { x: margin, y: margin };
  }

  _processMobSpawns() {
    let spawned = false;
    this.pendingMobSpawns = this.pendingMobSpawns.filter((spawn) => {
      if (spawn.at > this.time) return true;
      this.spawnMob();
      spawned = true;
      return false;
    });
    if (spawned) this._maintainMobPopulation();
    if (this._nextBossAt !== null && this.time >= this._nextBossAt) {
      this.spawnBoss();
    }
  }

  _maintainMobPopulation() {
    const reserved = this.mobs.size + this.pendingMobSpawns.length;
    for (let index = reserved; index < this.mobTargetCount; index += 1) {
      this.spawnMob();
    }
  }

  _updateDrops() {
    for (const [id, drop] of [...this.drops]) {
      if (this.time >= drop.expiresAt) {
        this.drops.delete(id);
        continue;
      }
      for (const player of this.players.values()) {
        if (!player.alive || player.inventory.length >= INVENTORY_LIMIT) continue;
        const reach = player.radius + DROP_PICKUP_RADIUS;
        const dx = player.x - drop.x;
        const dy = player.y - drop.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        player.inventory.push(drop.item);
        this.drops.delete(id);
        this._emit("lootPickedUp", {
          playerId: player.id,
          itemId: drop.item.id,
          name: drop.item.name,
          rarity: drop.item.rarity,
          slot: drop.item.slot,
        });
        break;
      }
    }
  }

  _maybeDropLoot(mob) {
    if (this.rng() < 0.22) {
      this._placeDrop(mob.x, mob.y, this._rollPotion(mob.level));
    }
    const chance = Math.min(0.85, (0.22 + (mob.level - 1) * 0.07) * (mob.elite ? 1.8 : 1));
    if (this.rng() >= chance) return;
    this._placeDrop(mob.x, mob.y, this._rollItem(mob.level, mob.elite ? 2 : 1));
  }

  _dropBossHoard(mob) {
    for (let index = 0; index < 3; index += 1) {
      const item = this._rollItem(MAX_MOB_LEVEL, 3);
      this._placeDrop(
        mob.x + (this.rng() - 0.5) * 90,
        mob.y + (this.rng() - 0.5) * 90,
        item,
      );
    }
    this._placeDrop(mob.x, mob.y + 30, this._rollPotion(MAX_MOB_LEVEL));
  }

  _placeDrop(x, y, item) {
    const id = `drop-${++this._dropSequence}`;
    this.drops.set(id, {
      id,
      x: clamp(x, PLAYER_RADIUS, this.width - PLAYER_RADIUS),
      y: clamp(y, PLAYER_RADIUS, this.height - PLAYER_RADIUS),
      expiresAt: this.time + DROP_TTL,
      item,
    });
    this._emit("lootDropped", {
      dropId: id,
      name: item.name,
      rarity: item.rarity,
      slot: item.slot,
      x: round(x),
      y: round(y),
    });
    return id;
  }

  _rollPotion(level) {
    return {
      id: `item-${++this._itemSequence}`,
      slot: "potion",
      rarity: "common",
      tier: 1,
      level: 1,
      name: "Mending Vial",
      bonuses: zeroStats(),
      heal: 30 + level * 8,
    };
  }

  _rollItem(level, minTier = 1) {
    const slot = ITEM_SLOTS[Math.floor(clamp(this.rng(), 0, 0.999999) * ITEM_SLOTS.length)];
    const pool = RARITIES.filter((entry) => entry.tier >= minTier);
    const weights = pool.map((rarity) => rarity.baseWeight + rarity.levelWeight * (level - 1));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = clamp(this.rng(), 0, 0.999999) * totalWeight;
    let rarity = pool[0];
    for (let index = 0; index < pool.length; index += 1) {
      roll -= weights[index];
      if (roll < 0) {
        rarity = pool[index];
        break;
      }
    }

    const bases = ITEM_BASES[slot];
    const name = bases[Math.floor(clamp(this.rng(), 0, 0.999999) * bases.length)];
    const bonuses = zeroStats();
    let budget = rarity.tier * 2 + Math.floor((level - 1) / 2);
    while (budget > 0) {
      bonuses[STAT_KEYS[Math.floor(clamp(this.rng(), 0, 0.999999) * STAT_KEYS.length)]] += 1;
      budget -= 1;
    }

    const item = {
      id: `item-${++this._itemSequence}`,
      slot,
      rarity: rarity.id,
      tier: rarity.tier,
      level: Math.max(1, level + rarity.tier - 1),
      name,
      bonuses,
    };
    if (slot === "weapon") item.damageBonus = rarity.tier * 0.06;
    if (slot === "necklace") item.damageBonus = rarity.tier * 0.03;
    if (slot === "ring") {
      item.damageBonus = rarity.tier * 0.02;
      item.hpBonus = rarity.tier * 4;
    }
    if (slot === "armor") item.hpBonus = rarity.tier * 14;
    if (slot === "helm") item.hpBonus = rarity.tier * 8;
    if (slot === "boots") item.speedBonus = rarity.tier * 7;
    if (slot === "charm") {
      item.speedBonus = rarity.tier * 3;
      item.hpBonus = rarity.tier * 5;
    }
    return item;
  }

  _refreshGear(player) {
    const gearStats = zeroStats();
    const mods = { damage: 0, maxHp: 0, speed: 0 };
    for (const item of Object.values(player.equipment)) {
      if (!item) continue;
      for (const key of STAT_KEYS) gearStats[key] += item.bonuses?.[key] ?? 0;
      mods.damage += item.damageBonus ?? 0;
      mods.maxHp += item.hpBonus ?? 0;
      mods.speed += item.speedBonus ?? 0;
    }
    player.gearStats = gearStats;
    player.gearMods = mods;
  }

  _statTotal(player, key) {
    return player.stats[key] + player.gearStats[key];
  }

  _inSafeZone(entity) {
    if (!this.safeZone) return false;
    const dx = entity.x - this.safeZone.x;
    const dy = entity.y - this.safeZone.y;
    return dx * dx + dy * dy <= this.safeZone.radius * this.safeZone.radius;
  }

  _requirePlayer(id) {
    const player = this.players.get(id);
    if (!player) throw new WorldError("NOT_JOINED", "Player is not in the world.");
    return player;
  }

  _emit(event, payload = {}) {
    this.events.push({ event, tick: this.tick, serverTime: round(this.time), ...payload });
  }
}

export function xpRequiredForLevel(level) {
  return 75 + Math.max(0, level - 1) * 55;
}

function zeroStats() {
  return Object.fromEntries(STAT_KEYS.map((key) => [key, 0]));
}

function serializeItem(item) {
  return {
    id: item.id,
    slot: item.slot,
    rarity: item.rarity,
    tier: item.tier,
    level: item.level ?? 1,
    name: item.name,
    bonuses: { ...item.bonuses },
    ...(item.damageBonus !== undefined ? { damageBonus: item.damageBonus } : {}),
    ...(item.hpBonus !== undefined ? { hpBonus: item.hpBonus } : {}),
    ...(item.speedBonus !== undefined ? { speedBonus: item.speedBonus } : {}),
    ...(item.heal !== undefined ? { heal: item.heal } : {}),
  };
}

function sanitizeName(value) {
  if (typeof value !== "string") return "Wayfarer";
  const name = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ");
  return name.slice(0, 20) || "Wayfarer";
}

function validateId(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 80) {
    throw new WorldError("INVALID_ID", "Entity id must be a non-empty string of at most 80 characters.");
  }
  return value;
}

function emptyInput() {
  return {
    move: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    primary: false,
    q: false,
    e: false,
  };
}

function resolveSkillSlot(archetype, requestedSkill) {
  if (SKILL_SLOTS.includes(requestedSkill)) return requestedSkill;
  return SKILL_SLOTS.find((slot) => ARCHETYPES[archetype].skills[slot].id === requestedSkill) ?? null;
}

function optionalFinitePoint(value) {
  if (!value || typeof value !== "object" || !Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    return null;
  }
  return {
    x: clamp(value.x, -100_000, 100_000),
    y: clamp(value.y, -100_000, 100_000),
  };
}

function finitePoint(value, fallback = { x: 1, y: 0 }) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return { ...fallback };
  return {
    x: clamp(value.x, -100_000, 100_000),
    y: clamp(value.y, -100_000, 100_000),
  };
}

function normalizedVector(value, fallback = { x: 0, y: 0 }) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return { ...fallback };
  const length = Math.hypot(value.x, value.y);
  if (length <= 0.000001) return { x: 0, y: 0 };
  if (length <= 1) return { x: value.x, y: value.y };
  return { x: value.x / length, y: value.y / length };
}

function directionTo(origin, target, fallback) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0.000001) return { ...fallback };
  return { x: dx / length, y: dy / length };
}

function rotate(vector, radians) {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine,
  };
}

function segmentHitsCircle(x1, y1, x2, y2, cx, cy, radius) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0
    ? 0
    : clamp(((cx - x1) * dx + (cy - y1) * dy) / lengthSquared, 0, 1);
  const closestX = x1 + dx * t;
  const closestY = y1 + dy * t;
  const offsetX = cx - closestX;
  const offsetY = cy - closestY;
  return offsetX * offsetX + offsetY * offsetY <= radius * radius;
}

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeInteger(value, fallback) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
