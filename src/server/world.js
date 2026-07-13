import { randomUUID } from "node:crypto";

import { rollItem, rollPotion, rollRelic, rollSpecialDrop } from "./loot.js";
import {
  ALLOC_WEIGHTS,
  ARCHETYPES,
  BASE_STATS,
  BOSSES,
  DEW_DROP_CHANCE,
  DROP_MAGNET_RADIUS,
  DROP_MAGNET_SPEED,
  DROP_PICKUP_RADIUS,
  DROP_TTL,
  EQUIP_KEYS,
  GOLD_PER_MOB_LEVEL,
  INVENTORY_LIMIT,
  ITEM_SLOTS,
  LEVEL_CAP,
  PARTY_LIMIT,
  PARTY_XP_RANGE,
  PROTOCOL_VERSION,
  PARTY_XP_SHARE,
  QUEST_CHAIN,
  SHOPS,
  SKILL_BEHAVIORS,
  MOB_TYPES,
  PORTAL_DESTINATIONS,
  REPUTATION_LIMIT,
  RING_KEYS,
  SOUL_BARRIER,
  SPECIAL_DROPS,
  ZONES,
  REBIRTH_DAMAGE_BONUS,
  REBIRTH_HP_BONUS,
  REBIRTH_LEVEL,
  REBIRTH_STAT_BONUS,
  SKILL_SLOTS,
  skillDefinition,
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
// Sprint multiplier — the client mirrors this constant to predict its own
// movement; keep the two in sync (public/client.js predictLocalPlayer).
const SPRINT_FACTOR = 1.42;
const SHOP_RANGE = 130;
// Fields copied between live players and their persisted account record.
const ACCOUNT_FIELDS = Object.freeze([
  "archetype", "level", "xp", "xpToNext", "stats", "statPoints",
  "skillLevels", "skillPoints", "rebirths", "reputation", "will",
  "attunement", "gold", "dew", "friends", "inventory", "equipment", "quest",
  // Automation toggles survive relogin — a dev-server restart must not
  // silently flip them back on.
  "autoFight", "autoLevel", "autoEquip",
]);
const MAX_MOB_LEVEL = 18;
const ELITE_CHANCE = 0.1;
const BOSS_RESPAWN_DELAY = 90;
const PORTAL_RADIUS = 30;
const PORTAL_LOCK = 2.5;
const PORTAL_DWELL = 0.6;
const DEFAULT_MAP_MOB_TARGETS = Object.freeze({
  town: 24,
  residential: 16,
  downtown: 18,
  backhill: 20,
  scrapyard: 20,
  desert: 22,
  snowmountain: 22,
  castle: 24,
  starship: 24,
  skycity: 26,
});

const MAP_NAMES = Object.freeze({
  town: "灰港中继站",
  residential: "暮居街区",
  downtown: "旧都核心",
  backhill: "北境回山",
  scrapyard: "锈蚀废料场",
  desert: "赤潮沙海",
  snowmountain: "霜脊山线",
  castle: "坠落城堡",
  starship: "失落星港",
  skycity: "悬空天城",
});

// Highest numeric suffix among persisted "item-N" ids (inventory and
// equipped gear), so a restarted world never re-mints an id in use.
function highestItemSequence(accountStore) {
  let highest = 0;
  const consider = (item) => {
    const match = /^item-(\d+)$/.exec(item?.id ?? "");
    if (match) highest = Math.max(highest, Number(match[1]));
  };
  for (const record of Object.values(accountStore ?? {})) {
    if (!record || typeof record !== "object") continue;
    if (Array.isArray(record.inventory)) record.inventory.forEach(consider);
    for (const item of Object.values(record.equipment ?? {})) consider(item);
  }
  return highest;
}

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
    this.mapMobTargets = options.mobTargetCount === undefined ? DEFAULT_MAP_MOB_TARGETS : null;
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
    this.specialDropActive = { uniq: 0, sunset: 0 };
    this._bossRespawns = new Map();
    this.autoLevelDefault = options.autoLevel !== false;
    // Account store: plain object keyed by lowercase name; the host loads
    // it from disk and writes it back, the world reads/updates entries.
    this.accountStore = options.accountStore ?? {};
    // Persisted items keep their ids across restarts; the sequence must
    // resume past them or fresh drops would mint duplicate ids.
    this._itemSequence = highestItemSequence(this.accountStore);
    this.parties = new Map();
    this._partyInvites = new Map();
    this._partySequence = 0;
    this.shops = SHOPS.map((shop) => ({
      ...shop,
      mapId: "town",
      x: this.width / 2 + shop.dx,
      y: this.height / 2 + shop.dy,
    }));
    this.soulBarrierConfig = { ...SOUL_BARRIER, ...(options.soulBarrier ?? {}) };
    this.zones = ZONES.map((zone) => ({
      ...zone,
      x: zone.x * this.width,
      y: zone.y * this.height,
      rx: zone.rx * this.width,
      ry: zone.ry * this.height,
    }));
    this._buildPortals();

    if (options.spawnMobs !== false) {
      this._maintainMobPopulation();
      if (options.spawnBoss !== false) this.spawnBosses();
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

    // Clients that declare a protocol version must match; joins without one
    // (older clients, scripted tools) are still accepted.
    if (options.protocol !== undefined && options.protocol !== PROTOCOL_VERSION) {
      throw new WorldError(
        "PROTOCOL_MISMATCH",
        `This server speaks protocol ${PROTOCOL_VERSION}; refresh the client.`,
      );
    }

    const archetype = options.archetype ?? "vanguard";
    if (!Object.hasOwn(ARCHETYPES, archetype)) {
      throw new WorldError(
        "INVALID_ARCHETYPE",
        `archetype must be one of: ${Object.keys(ARCHETYPES).join(", ")}`,
      );
    }

    const name = sanitizeName(options.name);
    const accountKey = this._accountKey(name);
    for (const other of this.players.values()) {
      if (this._accountKey(other.name) === accountKey) {
        throw new WorldError("NAME_IN_USE", "A player with this name is already online.");
      }
    }
    // Accounts are claimed by the first join: it mints a session token the
    // client must present to reuse the name. Legacy records without a token
    // stay joinable and are upgraded on the spot.
    const record = this.accountStore[accountKey];
    const offeredToken = typeof options.token === "string" && options.token.length <= 128
      ? options.token
      : null;
    if (record?.token && record.token !== offeredToken) {
      throw new WorldError("INVALID_TOKEN", "This name is registered to another session token.");
    }
    // One name is one character, forever: joining an existing account with
    // a different archetype used to silently restart it at level 1 and
    // overwrite the record on the next save.
    if (record && record.archetype !== archetype) {
      throw new WorldError(
        "NAME_TAKEN",
        "This name already belongs to a different hero; pick another name or the original archetype.",
      );
    }

    const spawn = this._playerSpawn();
    const stats = { ...BASE_STATS[archetype] };
    const player = {
      id: playerId,
      name,
      token: record?.token ?? randomUUID(),
      archetype,
      mapId: "town",
      x: spawn.x,
      y: spawn.y,
      radius: PLAYER_RADIUS,
      facing: { x: 1, y: 0 },
      input: emptyInput(),
      inputSeq: 0,
      hp: 1,
      maxHp: 1,
      mp: 0,
      maxMp: 0,
      // Reputation swings positive (radiant) or negative (abyssal) with use;
      // will is a lifetime resource earned from kills.
      reputation: 0,
      will: 0,
      attunement: "radiant",
      soulBarrier: {
        active: archetype === "eclipse",
        absorb: this.soulBarrierConfig.absorb,
        mpPerHp: this.soulBarrierConfig.mpPerHp,
        boostUntil: 0,
      },
      alive: true,
      respawnAvailableAt: 0,
      moveTarget: null,
      attackTarget: null,
      autoFight: true,
      autoLevel: this.autoLevelDefault,
      autoEquip: true,
      portalLockUntil: 0,
      portalDwell: null,
      rebirths: 0,
      inventory: [],
      equipment: Object.fromEntries(EQUIP_KEYS.map((key) => [key, null])),
      gearStats: zeroStats(),
      gearMods: { damage: 0, maxHp: 0, speed: 0, defense: 0 },
      gearAttacks: [],
      level: 1,
      xp: 0,
      xpToNext: xpRequiredForLevel(1),
      stats,
      statPoints: 3,
      skillLevels: Object.fromEntries(SKILL_SLOTS.map((slot) => [slot, 1])),
      skillPoints: 1,
      nextPrimaryAt: 0,
      nextSkillAt: Object.fromEntries(SKILL_SLOTS.map((slot) => [slot, 0])),
      gold: 0,
      dew: 0,
      friends: [],
      partyId: null,
      quest: { chainIndex: 0, progress: 0 },
    };
    this._restoreAccount(player);
    this._refreshDerivedStats(player, false);
    player.hp = player.maxHp;
    player.mp = player.maxMp;
    this.players.set(playerId, player);
    this._emit("playerJoined", {
      playerId,
      name: player.name,
      archetype: player.archetype,
    });
    return player;
  }

  // ---- Account persistence -------------------------------------------

  _accountKey(name) {
    return String(name).trim().toLowerCase();
  }

  _restoreAccount(player) {
    const record = this.accountStore[this._accountKey(player.name)];
    if (!record || record.archetype !== player.archetype) return;
    for (const field of ACCOUNT_FIELDS) {
      if (record[field] === undefined) continue;
      player[field] = structuredClone(record[field]);
    }
    // Never trust a stale equipment shape after slot reworks.
    for (const key of Object.keys(player.equipment)) {
      if (!EQUIP_KEYS.includes(key)) delete player.equipment[key];
    }
    for (const key of EQUIP_KEYS) {
      if (player.equipment[key] === undefined) player.equipment[key] = null;
    }
    for (const slot of SKILL_SLOTS) {
      if (!Number.isFinite(player.skillLevels?.[slot])) player.skillLevels[slot] = 1;
    }
    this._refreshGear(player);
  }

  _saveAccount(player) {
    const record = { savedAt: round(this.time), token: player.token };
    for (const field of ACCOUNT_FIELDS) record[field] = structuredClone(player[field]);
    this.accountStore[this._accountKey(player.name)] = record;
  }

  syncAccounts() {
    for (const player of this.players.values()) this._saveAccount(player);
    return this.accountStore;
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (!player) return false;
    this._saveAccount(player);
    this.leaveParty(id, true);
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
      case "chat":
        return this.sendChat(id, message.channel, message.text);
      case "leave":
        // Back to the character screen: the account is saved and the seat
        // freed so the same connection can join again.
        this.removePlayer(id);
        return null;
      case "allocate":
        return this.allocateStat(id, message.stat);
      case "upgrade":
      case "upgradeSkill":
        return this.upgradeSkill(id, message.skill);
      case "respawn":
        return this.respawnPlayer(id);
      case "revive":
        return this.revivePlayer(id);
      case "buy":
        return this.buyGood(id, message.shop, message.good);
      case "sell":
        return this.sellItem(id, message.item);
      case "partyInvite":
      case "partyinvite":
        return this.inviteParty(id, message.target);
      case "partyAccept":
      case "partyaccept":
        return this.acceptParty(id, message.from);
      case "partyLeave":
      case "partyleave":
        return this.leaveParty(id);
      case "friendAdd":
      case "friendadd":
        return this.addFriend(id, message.name);
      case "friendRemove":
      case "friendremove":
        return this.removeFriend(id, message.name);
      case "rebirth":
        return this.rebirthPlayer(id);
      case "equip":
        return this.equipItem(id, message.item);
      case "unequip":
        return this.unequipItem(id, message.slot);
      case "use":
        return this.usePotion(id, message.item);
      case "autoEquip":
      case "autoequip":
        return this.autoEquip(id);
      case "setAuto":
      case "setauto":
        return this.setAutoFight(id, message.enabled);
      case "setAutoLevel":
      case "setautolevel":
        return this.setAutoLevel(id, message.enabled);
      case "setAutoEquip":
      case "setautoequip":
        return this.setAutoEquipMode(id, message.enabled);
      case "attune":
        return this.attune(id, message.path);
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
      sprint: input.sprint === true,
      aim: finitePoint(input.aim, player.input.aim),
      primary: input.primary === true,
      q: input.q === true,
      e: input.e === true,
      r: input.r === true,
      c: input.c === true,
      f: input.f === true,
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
      throw new WorldError("INVALID_SKILL", "skill must be q, e, r, c, f, or one of this archetype's skill ids.");
    }
    if (player.skillPoints <= 0) {
      throw new WorldError("NO_SKILL_POINTS", "No unspent skill points are available.");
    }

    const definition = skillDefinition(player.archetype, slot);
    if (player.level < (definition.unlockLevel ?? 1)) {
      throw new WorldError("SKILL_LOCKED", `${definition.name} unlocks at level ${definition.unlockLevel}.`);
    }
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
    for (const slot of SKILL_SLOTS) player.nextSkillAt[slot] = this.time + 0.2;
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
    this._autoAllocate(player);
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
    // Rings fill any of the three ring keys, displacing the weakest.
    const key = item.slot === "ring" ? this._ringKeyFor(player) : item.slot;
    player.inventory.splice(index, 1);
    const previous = player.equipment[key];
    player.equipment[key] = item;
    if (previous) player.inventory.push(previous);
    this._refreshGear(player);
    this._refreshDerivedStats(player, true);
    this._emit("itemEquipped", {
      playerId: id,
      itemId: item.id,
      name: item.name,
      rarity: item.rarity,
      slot: key,
    });
    return player;
  }

  // The equip key this item would land in, but only when the player can
  // wear it and it beats the currently worn piece; null otherwise.
  _upgradeKeyFor(player, item) {
    if (!ITEM_SLOTS.includes(item.slot)) return null;
    if (player.level < (item.level ?? 1)) return null;
    const key = item.slot === "ring" ? this._ringKeyFor(player) : item.slot;
    if (!EQUIP_KEYS.includes(key)) return null;
    const current = player.equipment[key];
    if (current && itemPower(item) <= itemPower(current)) return null;
    return key;
  }

  _ringKeyFor(player) {
    const empty = RING_KEYS.find((key) => !player.equipment[key]);
    if (empty) return empty;
    return RING_KEYS.reduce((worst, key) =>
      itemPower(player.equipment[key]) < itemPower(player.equipment[worst]) ? key : worst,
    RING_KEYS[0]);
  }

  unequipItem(id, key) {
    const player = this._requirePlayer(id);
    if (!EQUIP_KEYS.includes(key)) {
      throw new WorldError("INVALID_SLOT", `slot must be one of: ${EQUIP_KEYS.join(", ")}`);
    }
    if (!player.alive) {
      throw new WorldError("PLAYER_DEAD", "Equipment cannot be changed while defeated.");
    }
    const item = player.equipment[key];
    if (!item) {
      throw new WorldError("INVALID_ITEM", "Nothing is equipped in that slot.");
    }
    if (player.inventory.length >= INVENTORY_LIMIT) {
      throw new WorldError("INVENTORY_FULL", "The inventory is full.");
    }
    player.equipment[key] = null;
    player.inventory.push(item);
    this._refreshGear(player);
    this._refreshDerivedStats(player, true);
    this._emit("itemUnequipped", { playerId: id, itemId: item.id, name: item.name, slot: key });
    return player;
  }

  attune(id, path) {
    const player = this._requirePlayer(id);
    if (path !== "radiant" && path !== "abyss") {
      throw new WorldError("INVALID_MESSAGE", "path must be 'radiant' or 'abyss'.");
    }
    player.attunement = path;
    this._emit("attuned", { playerId: id, path });
    return player;
  }

  setAutoLevel(id, enabled) {
    const player = this._requirePlayer(id);
    if (typeof enabled !== "boolean") {
      throw new WorldError("INVALID_MESSAGE", "enabled must be a boolean.");
    }
    player.autoLevel = enabled;
    if (enabled) this._autoAllocate(player);
    this._emit("autoLevelChanged", { playerId: id, enabled });
    return player;
  }

  // Spend banked stat points along the hero's weight profile and skill
  // points on the lowest skill with headroom.
  _autoAllocate(player) {
    if (!player.autoLevel || !player.alive) return;
    const weights = ALLOC_WEIGHTS[player.archetype]
      ?? { power: 1, agility: 1, spirit: 1, vitality: 1 };
    let statsSpent = 0;
    while (player.statPoints > 0) {
      let best = STAT_KEYS[0];
      let bestScore = Infinity;
      for (const key of STAT_KEYS) {
        const score = player.stats[key] / Math.max(0.05, weights[key] ?? 0.05);
        if (score < bestScore) {
          bestScore = score;
          best = key;
        }
      }
      player.stats[best] += 1;
      player.statPoints -= 1;
      statsSpent += 1;
    }
    if (statsSpent > 0) this._refreshDerivedStats(player, true);

    let skillsSpent = 0;
    while (player.skillPoints > 0) {
      const openSlots = SKILL_SLOTS.filter(
        (slot) => player.level >= (skillDefinition(player.archetype, slot).unlockLevel ?? 1)
          && player.skillLevels[slot] < skillDefinition(player.archetype, slot).maxLevel,
      );
      if (openSlots.length === 0) break;
      const slot = openSlots.sort((a, b) => player.skillLevels[a] - player.skillLevels[b])[0];
      player.skillLevels[slot] += 1;
      player.skillPoints -= 1;
      skillsSpent += 1;
    }
    if (statsSpent > 0 || skillsSpent > 0) {
      this._emit("autoAllocated", { playerId: player.id, stats: statsSpent, skills: skillsSpent });
    }
  }

  setAutoFight(id, enabled) {
    const player = this._requirePlayer(id);
    if (typeof enabled !== "boolean") {
      throw new WorldError("INVALID_MESSAGE", "enabled must be a boolean.");
    }
    player.autoFight = enabled;
    this._emit("autoFightChanged", { playerId: id, enabled });
    return player;
  }

  setAutoEquipMode(id, enabled) {
    const player = this._requirePlayer(id);
    if (typeof enabled !== "boolean") {
      throw new WorldError("INVALID_MESSAGE", "enabled must be a boolean.");
    }
    player.autoEquip = enabled;
    // Switching on runs one immediate best-in-slot pass over the bag.
    if (enabled && player.alive) this.autoEquip(id);
    this._emit("autoEquipChanged", { playerId: id, enabled });
    return player;
  }

  // Equip the strongest eligible item for every slot in one pass.
  autoEquip(id) {
    const player = this._requirePlayer(id);
    if (!player.alive) {
      throw new WorldError("PLAYER_DEAD", "Equipment cannot be changed while defeated.");
    }
    let changed = 0;
    for (const slot of ITEM_SLOTS) {
      // Rings get up to three passes: best-of-bag into each weaker key.
      const passes = slot === "ring" ? RING_KEYS.length : 1;
      for (let pass = 0; pass < passes; pass += 1) {
        let best = null;
        for (const item of player.inventory) {
          if (item.slot !== slot) continue;
          if (player.level < (item.level ?? 1)) continue;
          if (!best || itemPower(item) > itemPower(best)) best = item;
        }
        if (!best) break;
        const key = slot === "ring" ? this._ringKeyFor(player) : slot;
        const current = player.equipment[key];
        if (current && itemPower(best) <= itemPower(current)) break;
        this.equipItem(id, best.id);
        changed += 1;
      }
    }
    if (changed > 0) {
      this._emit("autoEquipped", { playerId: id, changed });
    }
    return player;
  }

  // Revive on the spot for one revival dew — no respawn walk, full health.
  revivePlayer(id) {
    const player = this._requirePlayer(id);
    if (player.alive) {
      throw new WorldError("ALREADY_ALIVE", "The player is already active.");
    }
    if (player.dew < 1) {
      throw new WorldError("NO_DEW", "Reviving in place requires one revival dew.");
    }
    player.dew -= 1;
    player.hp = player.maxHp;
    player.alive = true;
    player.input = emptyInput();
    player.nextPrimaryAt = this.time + 0.2;
    for (const slot of SKILL_SLOTS) player.nextSkillAt[slot] = this.time + 0.2;
    this._emit("playerRevived", { playerId: id, x: round(player.x), y: round(player.y) });
    return player;
  }

  buyGood(id, shopId, goodKey) {
    const player = this._requirePlayer(id);
    const shop = this.shops.find((entry) => entry.id === shopId);
    if (!shop) throw new WorldError("INVALID_SHOP", "No such shopkeeper.");
    // Coordinates alone are not enough: another map can overlap the town
    // shop's x/y, so the buyer must be standing on the shop's map too.
    if (player.mapId !== shop.mapId
      || Math.hypot(player.x - shop.x, player.y - shop.y) > SHOP_RANGE) {
      throw new WorldError("TOO_FAR", "Walk up to the shopkeeper first.");
    }
    const good = shop.goods.find((entry) => entry.key === goodKey);
    if (!good) throw new WorldError("INVALID_GOOD", "That item is not for sale here.");
    // Level-scaled goods: price and potency grow with the buyer.
    const goldPrice = Math.floor((good.gold ?? 0) + (good.goldPerLevel ?? 0) * (player.level - 1));
    if (goldPrice > player.gold) throw new WorldError("NO_GOLD", "Not enough gold.");
    if ((good.dew ?? 0) > player.dew) throw new WorldError("NO_DEW", "Not enough revival dew.");
    if (player.inventory.length >= INVENTORY_LIMIT) {
      throw new WorldError("INVENTORY_FULL", "The inventory is full.");
    }

    player.gold -= goldPrice;
    player.dew -= good.dew ?? 0;
    let item;
    if (good.heal) {
      const heal = Math.floor(good.heal + (good.healPerLevel ?? 0) * (player.level - 1));
      item = { ...this._rollPotion(1), heal, name: "Mending Vial" };
    } else if (good.key === "forge-gear") {
      item = this._rollItem(clamp(player.level, 1, LEVEL_CAP), 2);
    } else {
      item = this._rollRelic(Math.min(player.level, 20));
    }
    player.inventory.push(item);
    this._emit("purchased", {
      playerId: id,
      shopId,
      good: good.key,
      itemId: item.id,
      name: item.name,
      rarity: item.rarity,
    });
    return player;
  }

  sellItem(id, itemId) {
    const player = this._requirePlayer(id);
    const index = player.inventory.findIndex((item) => item.id === itemId);
    if (index < 0) {
      throw new WorldError("INVALID_ITEM", "That item is not in the inventory.");
    }
    const [item] = player.inventory.splice(index, 1);
    const value = Math.max(5, Math.floor(itemPower(item) / 4) + 5);
    player.gold += value;
    this._emit("itemSold", { playerId: id, itemId: item.id, name: item.name, gold: value });
    return player;
  }

  // ---- Party & friends ------------------------------------------------

  inviteParty(id, targetId) {
    const player = this._requirePlayer(id);
    const target = this.players.get(String(targetId));
    if (!target || target.id === id) {
      throw new WorldError("INVALID_TARGET", "No such player to invite.");
    }
    const party = player.partyId ? this.parties.get(player.partyId) : null;
    if (party && party.members.length >= PARTY_LIMIT) {
      throw new WorldError("PARTY_FULL", `Parties hold at most ${PARTY_LIMIT} members.`);
    }
    if (target.partyId) {
      throw new WorldError("ALREADY_IN_PARTY", "That player already has a party.");
    }
    this._partyInvites.set(target.id, { from: id, at: this.time });
    this._emit("partyInvited", {
      playerId: target.id,
      from: id,
      fromName: player.name,
    });
    return player;
  }

  acceptParty(id, fromId) {
    const player = this._requirePlayer(id);
    const invite = this._partyInvites.get(id);
    if (!invite || invite.from !== String(fromId) || this.time - invite.at > 60) {
      throw new WorldError("NO_INVITE", "No standing invitation from that player.");
    }
    const host = this.players.get(invite.from);
    this._partyInvites.delete(id);
    if (!host) throw new WorldError("INVALID_TARGET", "The inviter has left.");
    if (player.partyId) this.leaveParty(id, true);

    let party = host.partyId ? this.parties.get(host.partyId) : null;
    if (!party) {
      party = { id: `party-${++this._partySequence}`, members: [host.id] };
      this.parties.set(party.id, party);
      host.partyId = party.id;
    }
    if (party.members.length >= PARTY_LIMIT) {
      throw new WorldError("PARTY_FULL", `Parties hold at most ${PARTY_LIMIT} members.`);
    }
    party.members.push(player.id);
    player.partyId = party.id;
    this._emit("partyJoined", { playerId: id, partyId: party.id, name: player.name });
    return player;
  }

  leaveParty(id, silent = false) {
    const player = this.players.get(id);
    if (!player?.partyId) return player;
    const party = this.parties.get(player.partyId);
    player.partyId = null;
    if (party) {
      party.members = party.members.filter((memberId) => memberId !== id);
      if (party.members.length <= 1) {
        for (const memberId of party.members) {
          const member = this.players.get(memberId);
          if (member) member.partyId = null;
        }
        this.parties.delete(party.id);
      }
    }
    if (!silent) this._emit("partyLeft", { playerId: id, name: player.name });
    return player;
  }

  // Chat channels: global reaches everyone (lobby included), map stays on
  // the sender's map, party reaches party members only.
  sendChat(id, channel, text) {
    const player = this._requirePlayer(id);
    if (!["global", "map", "party"].includes(channel)) {
      throw new WorldError("INVALID_CHANNEL", "channel must be global, map, or party.");
    }
    if (typeof text !== "string") {
      throw new WorldError("INVALID_MESSAGE", "text must be a string.");
    }
    const cleaned = text.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200);
    if (cleaned.length === 0) {
      throw new WorldError("INVALID_MESSAGE", "text must not be empty.");
    }
    // Resolve the scope before consuming the cadence window, so a rejected
    // party message does not eat the cooldown of the next valid one.
    let scope = null;
    if (channel === "map") {
      scope = { mapId: player.mapId };
    } else if (channel === "party") {
      const party = player.partyId ? this.parties.get(player.partyId) : null;
      if (!party) throw new WorldError("NO_PARTY", "Join a party before using party chat.");
      scope = { players: [...party.members] };
    }
    if (this.time < (player.nextChatAt ?? 0)) {
      throw new WorldError("CHAT_TOO_FAST", "Slow down between messages.");
    }
    player.nextChatAt = this.time + 0.6;
    this._emit("chatMessage", {
      playerId: id,
      name: player.name,
      channel,
      text: cleaned,
    }, scope);
    return player;
  }

  addFriend(id, name) {
    const player = this._requirePlayer(id);
    const friendName = sanitizeName(name);
    if (friendName === player.name) {
      throw new WorldError("INVALID_TARGET", "You are already your own best ally.");
    }
    if (!player.friends.includes(friendName)) {
      if (player.friends.length >= 32) {
        throw new WorldError("FRIENDS_FULL", "The friend list is full.");
      }
      player.friends.push(friendName);
    }
    this._emit("friendAdded", { playerId: id, friend: friendName });
    return player;
  }

  removeFriend(id, name) {
    const player = this._requirePlayer(id);
    const friendName = sanitizeName(name);
    player.friends = player.friends.filter((entry) => entry !== friendName);
    this._emit("friendRemoved", { playerId: id, friend: friendName });
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
      this._updatePortals();
      this._updateMobs(step);
      this._updateProjectiles(step);
      this._updateDrops(step);
      this._processMobSpawns();
    }
    this.tick += 1;
    return this.getSnapshot();
  }

  // The heavy per-map arrays are identical for every recipient on a map, so
  // the gateway passes one Map per broadcast and each map is built once; only
  // the recipient's own full player entry differs per socket.
  getSnapshot(selfId = null, sharedCache = null) {
    const self = selfId ? this.players.get(selfId) : null;
    const mapId = self?.mapId ?? null;
    const shared = this._sharedMapSnapshot(mapId, sharedCache);
    const players = self
      ? shared.players.map((entry) => (
        entry.id === selfId ? this._serializePlayer(self, shared.onlineNames) : entry
      ))
      : shared.players;
    return {
      type: "snapshot",
      tick: this.tick,
      serverTime: round(this.time),
      selfId,
      world: shared.world,
      safeZone: shared.safeZone,
      players,
      enemies: shared.enemies,
      projectiles: shared.projectiles,
      drops: shared.drops,
      mapId,
      // Server-wide head count: the players array only covers this map.
      online: this.players.size,
    };
  }

  _sharedMapSnapshot(mapId, sharedCache) {
    const cacheKey = mapId ?? "*";
    let shared = sharedCache?.get(cacheKey);
    if (!shared) {
      shared = this._buildMapSnapshot(mapId);
      sharedCache?.set(cacheKey, shared);
    }
    return shared;
  }

  // Wire-optimized JSON path: the heavy shared parts (world meta, entity
  // arrays, other players' slim entries) are stringified once per map per
  // broadcast; each recipient stringifies only its own full entry and the
  // pieces are glued. Parses to exactly what getSnapshot() returns — the
  // equivalence is locked by a test. At 50 players on one map this is the
  // difference between saturating a core and idling (see docs/PERFORMANCE.md).
  getSnapshotJson(selfId = null, sharedCache = null) {
    const self = selfId ? this.players.get(selfId) : null;
    const mapId = self?.mapId ?? null;
    const cacheKey = `json:${mapId ?? "*"}`;
    let strings = sharedCache?.get(cacheKey);
    if (!strings) {
      const shared = this._sharedMapSnapshot(mapId, sharedCache);
      strings = {
        head: `"tick":${this.tick},"serverTime":${round(this.time)}`
          + `,"world":${JSON.stringify(shared.world)},"safeZone":${JSON.stringify(shared.safeZone)}`,
        tail: `"enemies":${JSON.stringify(shared.enemies)}`
          + `,"projectiles":${JSON.stringify(shared.projectiles)}`
          + `,"drops":${JSON.stringify(shared.drops)}`
          + `,"mapId":${JSON.stringify(mapId)},"online":${this.players.size}`,
        slimIds: shared.players.map((entry) => entry.id),
        slimJson: shared.players.map((entry) => JSON.stringify(entry)),
        onlineNames: shared.onlineNames,
      };
      sharedCache?.set(cacheKey, strings);
    }
    // The recipient's full entry replaces their slim record in place, so the
    // array order matches getSnapshot() exactly.
    const parts = strings.slimJson.slice();
    if (self) {
      const position = strings.slimIds.indexOf(selfId);
      const selfJson = JSON.stringify(this._serializePlayer(self, strings.onlineNames));
      if (position >= 0) parts[position] = selfJson;
      else parts.push(selfJson);
    }
    return `{"type":"snapshot",${strings.head},"selfId":${JSON.stringify(selfId)}`
      + `,"players":[${parts.join(",")}],${strings.tail}}`;
  }

  _buildMapSnapshot(mapId) {
    const mapTheme = this.zones.find((entry) => entry.id === mapId)?.theme
      ?? ({
        town: "town",
        backhill: "mountain",
        scrapyard: "scrapyard",
        starship: "spaceport",
      }[mapId] ?? mapId);
    const visible = (entity) => !mapId || entity.mapId === mapId;
    const mapZones = mapId === "town"
      ? []
      : this.zones.filter((zone) => zone.id === mapId).map((zone) => ({ ...zone }));
    const enemies = [...this.mobs.values()].filter(visible).map((mob) => ({
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
      damage: round(mob.damage),
      speed: round(mob.speed),
      defense: mob.defense,
      attackStyle: mob.attackStyle,
      combatState: mob.attackTargetId ? "windup" : mob.aggroTargetId ? "chasing" : "patrolling",
      attackTargetId: mob.attackTargetId,
      attackRemaining: round(Math.max(0, mob.attackResolveAt - this.time)),
      attackWindup: mob.attackWindup,
      alive: true,
    }));

    const drops = [...this.drops.values()].filter(visible).map((drop) => ({
      id: drop.id,
      x: round(drop.x),
      y: round(drop.y),
      slot: drop.item.slot,
      rarity: drop.item.rarity,
      dropClass: drop.item.dropClass ?? null,
      name: drop.item.name,
    }));

    const projectiles = [...this.projectiles.values()].filter((projectile) => {
      if (!mapId) return true;
      return projectile.mapId === mapId;
    }).map((projectile) => ({
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

    const onlineNames = this._onlineNames();
    return {
      world: {
        name: MAP_NAMES[mapId] ?? this.name,
        width: this.width,
        height: this.height,
        time: round(this.time),
        tick: this.tick,
        mapId,
        theme: mapTheme,
        zones: mapZones,
        portals: this.portals.filter((portal) => !mapId || portal.mapId === mapId).map((portal) => ({ ...portal })),
        shops: mapId === "town"
          ? this.shops.map((shop) => ({ id: shop.id, name: shop.name, x: shop.x, y: shop.y, goods: shop.goods.map((good) => ({ ...good })) }))
          : [],
      },
      safeZone: mapId === "town" && this.safeZone ? { ...this.safeZone } : null,
      players: [...this.players.values()].filter(visible).map((player) => this._serializePlayerPublic(player)),
      enemies,
      projectiles,
      drops,
      onlineNames,
    };
  }

  // Lobby roster: who is online, at what level, and where — shown on the
  // character screen before joining.
  getRoster() {
    return [...this.players.values()].map((player) => ({
      name: player.name,
      archetype: player.archetype,
      level: player.level,
      mapId: player.mapId,
    }));
  }

  _onlineNames() {
    const names = new Set();
    for (const player of this.players.values()) names.add(player.name);
    return names;
  }

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  spawnMob(overrides = {}) {
    const point = overrides.x === undefined || overrides.y === undefined
      ? this._mobSpawn(overrides.mapId)
      : { x: Number(overrides.x), y: Number(overrides.y) };
    // The level band belongs to the map, not to the legacy district ellipse:
    // an explicit mapId resolves its own zone ("town" has none and uses the
    // distance curve); only zone-less spawns infer the district from the
    // position for backwards compatibility.
    const zone = overrides.mapId !== undefined
      ? this.zones.find((entry) => entry.id === overrides.mapId) ?? null
      : this._zoneAt(point.x, point.y);
    const roll = clamp(this.rng(), 0, 0.999999);
    const rolledLevel = zone
      ? zone.minLevel + Math.floor(roll * (zone.maxLevel - zone.minLevel + 1))
      : clamp(this._levelForPoint(point) + Math.floor(roll * 2), 1, MAX_MOB_LEVEL);
    const level = Math.max(1, nonNegativeInteger(overrides.level, rolledLevel));
    const elite = overrides.elite ?? (overrides.level === undefined && this.rng() < ELITE_CHANCE);
    // Themed maps spread the nine species across the 1-1000 ladder on a
    // square-root curve; the low-level town map keeps its classic
    // two-levels-per-species gradient so the frontier still shows giants.
    const band = zone
      ? Math.min(MOB_TYPES.length - 1, Math.floor(Math.sqrt(level / LEVEL_CAP) * MOB_TYPES.length))
      : Math.min(MOB_TYPES.length - 1, Math.floor((level - 1) / 2));
    const species = MOB_TYPES.find((entry) => entry.type === overrides.type) ?? MOB_TYPES[band];
    const power = elite ? 1.6 : 1;
    const maxHp = positiveNumber(
      overrides.maxHp,
      Math.round((26 + level * 16) * power * species.hpMul),
    );
    const id = overrides.id ?? `mob-${++this._mobSequence}`;
    const mob = {
      id: validateId(id),
      mapId: overrides.mapId ?? zone?.id ?? "town",
      type: overrides.type ?? species.type,
      name: overrides.name ?? species.name,
      x: clamp(point.x, MOB_RADIUS, this.width - MOB_RADIUS),
      y: clamp(point.y, MOB_RADIUS, this.height - MOB_RADIUS),
      radius: positiveNumber(overrides.radius, MOB_RADIUS + species.size + (elite ? 5 : 0)),
      level,
      elite: elite === true,
      boss: overrides.boss === true,
      hp: maxHp,
      maxHp,
      speed: positiveNumber(overrides.speed, (70 + level * 3) * species.speedMul),
      damage: positiveNumber(overrides.damage, (5 + level * 2.5) * power),
      defense: nonNegativeInteger(overrides.defense, species.defense + Math.floor(level * 0.8)),
      attackStyle: overrides.attackStyle ?? species.attack,
      attackRange: positiveNumber(overrides.attackRange, species.range),
      attackWindup: positiveNumber(overrides.attackWindup, species.windup),
      attackCooldown: positiveNumber(overrides.attackCooldown, species.cooldown),
      xp: positiveNumber(overrides.xp, Math.round((22 + level * 9) * (elite ? 2 : 1) * species.xpMul)),
      nextAttackAt: this.time,
      homeX: clamp(point.x, MOB_RADIUS, this.width - MOB_RADIUS),
      homeY: clamp(point.y, MOB_RADIUS, this.height - MOB_RADIUS),
      patrolX: null,
      patrolY: null,
      nextPatrolAt: this.time + this.rng() * 2,
      aggroTargetId: null,
      attackTargetId: null,
      attackResolveAt: 0,
    };
    if (this.mobs.has(mob.id)) {
      throw new WorldError("DUPLICATE_ENTITY", `A mob with id ${mob.id} already exists.`);
    }
    this.mobs.set(mob.id, mob);
    return mob;
  }

  spawnBosses() {
    return BOSSES.map((definition) => this.spawnBoss(definition));
  }

  spawnBoss(definition = BOSSES.find((entry) => entry.id === "boss-warden")) {
    if (this.mobs.has(definition.id)) return this.mobs.get(definition.id);
    const boss = this.spawnMob({
      id: definition.id,
      type: definition.type,
      name: definition.name,
      boss: true,
      elite: false,
      x: this.width * definition.x,
      y: this.height * definition.y,
      level: definition.level,
      maxHp: definition.maxHp,
      radius: definition.radius,
      speed: definition.speed,
      damage: definition.damage,
      xp: definition.xp,
    });
    this._bossRespawns.delete(definition.id);
    this._emit("bossSpawned", {
      enemyId: boss.id,
      type: boss.type,
      name: boss.name,
      level: boss.level,
      x: round(boss.x),
      y: round(boss.y),
    });
    return boss;
  }

  _levelForPoint(point) {
    const dx = point.x - this.width / 2;
    const dy = point.y - this.height / 2;
    const reach = Math.hypot(this.width, this.height) / 2;
    return 1 + Math.floor((Math.hypot(dx, dy) / reach) * (MAX_MOB_LEVEL - 1));
  }

  // Effective walk speed on the player's current terrain, before the sprint
  // multiplier. Sent in snapshots so the client can predict its own motion.
  _moveSpeed(player) {
    const zone = this.zones.find((entry) => entry.id === player.mapId);
    const terrainFactor = zone?.theme === "snow" ? 0.86 : zone?.theme === "desert" ? 0.92 : zone?.theme === "skycity" ? 1.06 : 1;
    return (ARCHETYPES[player.archetype].baseSpeed
      + this._statTotal(player, "agility") * 3.2
      + player.gearMods.speed) * terrainFactor;
  }

  _updatePlayers(dt) {
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      const manualMove = player.input.move.x !== 0 || player.input.move.y !== 0;
      const runFactor = player.input.sprint && manualMove ? SPRINT_FACTOR : 1;
      player.running = runFactor > 1;
      const speed = this._moveSpeed(player) * runFactor;

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
      player.mp = Math.min(
        player.maxMp,
        player.mp + (1.2 + this._statTotal(player, "spirit") * 0.06) * regenBoost * dt,
      );

      if (player.input.primary) this._usePrimary(player, aim);
      if (player.input.q) this._useSkill(player, "q", aim);
      if (player.input.e) this._useSkill(player, "e", aim);
      if (player.input.r) this._useSkill(player, "r", aim);
      if (player.input.c) this._useSkill(player, "c", aim);
      if (player.input.f) this._useSkill(player, "f", aim);
    }
  }

  // Click-driven orders: walk to a point, or close on a marked enemy and
  // keep firing the primary attack until it falls.
  _advanceAutoOrders(player, speed, dt) {
    let destination = null;
    if (player.attackTarget) {
      const mob = this.mobs.get(player.attackTarget);
      if (!mob || mob.mapId !== player.mapId) {
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
    if (!destination) {
      // Idle with auto-combat on: strike back at anything in reach.
      if (player.autoFight && !player.attackTarget) this._autoEngage(player);
      return;
    }

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
      let target = mob.aggroTargetId ? this.players.get(mob.aggroTargetId) : null;
      if (!target?.alive || target.mapId !== mob.mapId || this._inSafeZone(target)
        || Math.hypot(target.x - mob.homeX, target.y - mob.homeY) > (mob.boss ? 780 : 520)) {
        target = this._nearestLivingPlayer(mob, mob.boss ? 520 : 340);
        mob.aggroTargetId = target?.id ?? null;
      }

      if (mob.attackTargetId) {
        const attackTarget = this.players.get(mob.attackTargetId);
        if (this.time < mob.attackResolveAt) continue;
        mob.attackTargetId = null;
        if (attackTarget?.alive && !this._inSafeZone(attackTarget)
          && Math.hypot(attackTarget.x - mob.x, attackTarget.y - mob.y) <= mob.attackRange + attackTarget.radius + 28) {
          this._emit("enemyAttack", {
            enemyId: mob.id, playerId: attackTarget.id,
            fromX: round(mob.x), fromY: round(mob.y),
            toX: round(attackTarget.x), toY: round(attackTarget.y),
            damage: round(mob.damage), boss: mob.boss,
            attackStyle: mob.attackStyle, enemyType: mob.type, phase: "impact",
          }, { mapId: mob.mapId });
          this._damagePlayer(attackTarget, mob.damage, mob.id);
        }
        continue;
      }

      if (target && this._inSafeZone(target)) continue;
      if (!target) {
        this._patrolMob(mob, dt);
        continue;
      }

      const dx = target.x - mob.x;
      const dy = target.y - mob.y;
      const distance = Math.hypot(dx, dy);
      const attackDistance = target.radius + mob.radius + mob.attackRange;
      if (distance > attackDistance) {
        const travel = Math.min(mob.speed * dt, Math.max(0, distance - attackDistance));
        mob.x += (dx / distance) * travel;
        mob.y += (dy / distance) * travel;
      } else if (this.time >= mob.nextAttackAt) {
        mob.nextAttackAt = this.time + mob.attackCooldown;
        mob.attackTargetId = target.id;
        mob.attackResolveAt = this.time + mob.attackWindup;
        this._emit("enemyAttack", {
          enemyId: mob.id, playerId: target.id,
          fromX: round(mob.x), fromY: round(mob.y),
          toX: round(target.x), toY: round(target.y),
          damage: round(mob.damage), boss: mob.boss,
          attackStyle: mob.attackStyle, enemyType: mob.type,
          phase: "windup", duration: mob.attackWindup,
        }, { mapId: mob.mapId });
      }
    }
  }

  _patrolMob(mob, dt) {
    if (mob.boss) return;
    if (mob.patrolX === null || this.time >= mob.nextPatrolAt
      || Math.hypot(mob.patrolX - mob.x, mob.patrolY - mob.y) < 8) {
      const angle = this.rng() * Math.PI * 2;
      const distance = 45 + this.rng() * 105;
      mob.patrolX = clamp(mob.homeX + Math.cos(angle) * distance, MOB_RADIUS, this.width - MOB_RADIUS);
      mob.patrolY = clamp(mob.homeY + Math.sin(angle) * distance, MOB_RADIUS, this.height - MOB_RADIUS);
      mob.nextPatrolAt = this.time + 2.5 + this.rng() * 4;
    }
    const dx = mob.patrolX - mob.x;
    const dy = mob.patrolY - mob.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) return;
    const travel = Math.min(mob.speed * 0.34 * dt, distance);
    mob.x += (dx / distance) * travel;
    mob.y += (dy / distance) * travel;
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
          if (mob.mapId !== projectile.mapId) continue;
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
    const skill = skillDefinition(player.archetype, slot);
    if (player.level < (skill.unlockLevel ?? 1)) return;
    const level = player.skillLevels[slot];
    const cooldownReduction = 1 - Math.min(0.4, (level - 1) * 0.05);
    player.nextSkillAt[slot] = this.time + skill.cooldown * cooldownReduction;

    if (player.archetype === "eclipse" && slot !== "r" && slot !== "c") {
      this._useEclipseSkill(player, slot, direction, level);
    } else {
      const behavior = SKILL_BEHAVIORS[`${player.archetype}:${slot}`]
        ?? SKILL_BEHAVIORS[`shared:${slot}`];
      this._castBehavior(player, behavior, direction, level, archetype.color);
    }

    this._emit("skillUsed", {
      playerId: player.id,
      skill: slot,
      skillId: skill.id,
      level,
    }, { mapId: player.mapId });
  }

  // Eclipse: every skill resolves on the radiant branch while reputation
  // is non-negative and on the abyssal branch below zero. Each cast pulls
  // reputation two points toward the player's chosen attunement, so
  // changing sides is a deliberate climb, not a toggle.
  _useEclipseSkill(player, slot, direction, level) {
    const radiant = player.reputation >= 0;
    const spirit = this._statTotal(player, "spirit");
    if (slot === "q") {
      if (radiant) {
        this._spawnProjectile(player, direction, {
          damage: 24 + level * 8 + spirit * 2,
          speed: 820,
          range: 720,
          radius: 10,
          pierce: 3 + Math.floor(level / 3),
          color: "#ffe9b0",
        });
      } else {
        for (const angle of [-0.2, 0, 0.2]) {
          this._spawnProjectile(player, rotate(direction, angle), {
            damage: 14 + level * 5 + spirit * 1.4,
            speed: 620,
            range: 480,
            radius: 7,
            color: "#7ac8ff",
          });
        }
      }
    } else if (slot === "e") {
      if (radiant) {
        player.hp = Math.min(player.maxHp, player.hp + 12 + level * 4 + spirit);
        player.soulBarrier.boostUntil = this.time + 4 + level * 0.4;
        this._emit("barrierSurged", {
          playerId: player.id,
          until: round(player.soulBarrier.boostUntil),
        });
      } else {
        this._radialBurst(player, 10 + level, {
          damage: 12 + level * 4 + spirit * 1.3,
          speed: 500,
          range: 260 + level * 14,
          radius: 8,
          color: "#7ac8ff",
        });
      }
    } else if (radiant) {
      this._radialBurst(player, 14, {
        damage: 26 + level * 9 + spirit * 2.2,
        speed: 520,
        range: 340 + level * 20,
        radius: 12,
        color: "#ffe9b0",
      });
      player.mp = Math.min(player.maxMp, player.mp + player.maxMp * 0.4);
    } else {
      this._radialBurst(player, 12, {
        damage: 24 + level * 8 + spirit * 1.9,
        speed: 460,
        range: 320 + level * 22,
        radius: 12,
        color: "#7ac8ff",
      });
      this._radialBurst(player, 8, {
        damage: 16 + level * 6 + spirit * 1.2,
        speed: 640,
        range: 220 + level * 14,
        radius: 9,
        color: "#a9d8ff",
      });
    }

    const before = player.reputation;
    const drift = player.attunement === "abyss" ? -2 : 2;
    player.reputation = clamp(before + drift, -REPUTATION_LIMIT, REPUTATION_LIMIT);
    if ((before >= 0) !== (player.reputation >= 0)) {
      this._emit("alignmentShifted", {
        playerId: player.id,
        branch: player.reputation >= 0 ? "radiant" : "abyss",
        reputation: player.reputation,
      });
    }
  }

  // Ultimates: one signature finisher per hero, built from the same
  // authoritative projectile primitives as the rest of the kit.
  // Interprets a SKILL_BEHAVIORS step list (see definitions.js for the
  // schema). Steps execute in order, so a dash moves the caster before its
  // projectiles spawn from the new position.
  _castBehavior(player, steps, direction, level, color) {
    const scale = ([base, perLevel]) => base + perLevel * level;
    for (const step of steps) {
      if (step.act === "dash") {
        const heading = step.back ? { x: -direction.x, y: -direction.y } : direction;
        this._movePlayer(player, heading, scale(step.distance));
        continue;
      }
      const [damageBase, damagePerLevel, stats, statMultiplier] = step.damage;
      const options = {
        damage: damageBase + damagePerLevel * level
          + stats.reduce((sum, stat) => sum + this._statTotal(player, stat), 0) * statMultiplier,
        speed: step.speed,
        range: scale(step.range),
        radius: step.radius,
        color,
        ...(step.pierce ? { pierce: step.pierce[0] + Math.floor(level / 2) * step.pierce[1] } : {}),
      };
      if (step.act === "burst") {
        this._radialBurst(player, scale(step.count), options);
      } else {
        for (const angle of step.angles) {
          this._spawnProjectile(player, rotate(direction, angle), options);
        }
      }
    }
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
      // Pinned at launch so portalling away does not drag shots along.
      mapId: player.mapId,
      x,
      y,
      fromX: x,
      fromY: y,
      vx: unit.x * speed,
      vy: unit.y * speed,
      radius: options.radius ?? 6,
      damage: (options.damage + this._gearAttackFlat(player))
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

  // Flat damage from relic formulas: level × stat ÷ divisor (× multiplier).
  // A divisor pair rolls between the two ends per shot.
  _gearAttackFlat(player) {
    let flat = 0;
    for (const formula of player.gearAttacks ?? []) {
      const stat = this._statTotal(player, formula.stat);
      let divisor = formula.divisor;
      if (formula.maxDivisor) {
        divisor = formula.maxDivisor + this.rng() * (formula.divisor - formula.maxDivisor);
      }
      flat += (player.level * stat / divisor) * (formula.multiplier ?? 1);
    }
    return flat;
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
    const mitigation = Math.min(0.55, mob.defense / (mob.defense + 80));
    mob.hp -= Math.max(1, damage * (1 - mitigation));
    if (mob.hp > 0) return;

    this.mobs.delete(mob.id);
    for (const other of this.players.values()) {
      if (other.attackTarget === mob.id) other.attackTarget = null;
    }
    if (mob.boss) {
      this._dropBossHoard(mob);
      this._bossRespawns.set(mob.id, this.time + BOSS_RESPAWN_DELAY);
      this._emit("bossSlain", {
        enemyId: mob.id,
        type: mob.type,
        name: mob.name,
        playerId: ownerId,
        x: round(mob.x),
        y: round(mob.y),
      });
    } else {
      this._maybeDropLoot(mob);
    }
    const player = this.players.get(ownerId);
    if (player) {
      this._grantXp(player, mob.xp);
      player.will += mob.level;
      player.gold += Math.round(GOLD_PER_MOB_LEVEL * mob.level * (mob.boss ? 10 : mob.elite ? 2 : 1));
      if (mob.boss || this.rng() < DEW_DROP_CHANCE) player.dew += 1;
      this._advanceQuest(player, mob);
      // Party members hunting nearby share in the experience.
      const party = player.partyId ? this.parties.get(player.partyId) : null;
      if (party) {
        for (const memberId of party.members) {
          if (memberId === ownerId) continue;
          const member = this.players.get(memberId);
          if (!member || !member.alive) continue;
          // All maps share one coordinate plane, so range alone is not enough.
          if (member.mapId !== mob.mapId) continue;
          if (Math.hypot(member.x - mob.x, member.y - mob.y) > PARTY_XP_RANGE) continue;
          this._grantXp(member, Math.round(mob.xp * PARTY_XP_SHARE));
          this._advanceQuest(member, mob);
        }
      }
    }
    this.pendingMobSpawns.push({ at: this.time + MOB_RESPAWN_DELAY, mapId: mob.mapId });
    this._emit("enemyDefeated", {
      enemyId: mob.id,
      enemyType: mob.type,
      playerId: ownerId,
      xp: mob.xp,
      x: round(mob.x),
      y: round(mob.y),
    }, { mapId: mob.mapId });
  }

  _damagePlayer(player, damage, sourceId) {
    if (!player.alive) return;
    if (this._inSafeZone(player)) return;
    const mitigation = Math.min(
      0.8,
      Math.min(0.38, this._statTotal(player, "vitality") * 0.018) + (player.gearMods.defense ?? 0),
    );
    let final = Math.max(1, damage * (1 - mitigation));

    // Soul Barrier: pay part of the hit from MP at the configured price.
    const barrier = player.soulBarrier;
    if (barrier?.active && player.mp > 0.01) {
      const boosted = this.time < barrier.boostUntil;
      const absorb = Math.min(0.95, barrier.absorb + (boosted ? 0.2 : 0));
      const mpPerHp = barrier.mpPerHp * (boosted ? 0.6 : 1);
      const absorbed = Math.min(final * absorb, player.mp / mpPerHp);
      player.mp = Math.max(0, player.mp - absorbed * mpPerHp);
      final -= absorbed;
    }

    player.hp -= final;
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
    if (player.level >= LEVEL_CAP) return;
    player.xp += amount;
    let gainedLevels = 0;
    while (player.xp >= player.xpToNext && player.level < LEVEL_CAP) {
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
      this._autoAllocate(player);
    }
  }

  // Quest chain: each kill is matched against the player's current step;
  // completing a step pays out and advances the chain (the last repeats).
  _advanceQuest(player, mob) {
    const step = this._questStep(player);
    const counts =
      (step.type === "killType" && mob.type === step.param && !mob.boss)
      || (step.type === "killElite" && mob.elite)
      || (step.type === "killBoss" && mob.boss && mob.type === step.param)
      || step.type === "kill";
    if (!counts) return;

    player.quest.progress = Math.min(step.target, player.quest.progress + 1);
    this._emit("questProgress", {
      playerId: player.id,
      questId: step.id,
      progress: player.quest.progress,
      target: step.target,
    });
    if (player.quest.progress < step.target) return;

    player.gold += step.rewardGold;
    player.dew += step.rewardDew;
    this._emit("questCompleted", {
      playerId: player.id,
      questId: step.id,
      title: step.title,
      rewardXp: step.rewardXp,
      rewardGold: step.rewardGold,
      rewardDew: step.rewardDew,
    });
    this._grantXp(player, step.rewardXp);
    if (player.quest.chainIndex < QUEST_CHAIN.length - 1) {
      player.quest.chainIndex += 1;
    }
    player.quest.progress = 0;
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
    player.maxMp = Math.round(30 + this._statTotal(player, "spirit") * 6 + (player.level - 1) * 3);
    player.mp = Math.min(player.mp, player.maxMp);
  }

  // Scalar fields every client needs to render any player on screen.
  _serializePlayerBase(player) {
    return {
      id: player.id,
      name: player.name,
      archetype: player.archetype,
      mapId: player.mapId,
      running: player.running === true,
      color: ARCHETYPES[player.archetype].color,
      x: round(player.x),
      y: round(player.y),
      radius: player.radius,
      facing: { x: round(player.facing.x), y: round(player.facing.y) },
      hp: round(player.hp),
      maxHp: player.maxHp,
      mp: round(player.mp),
      maxMp: player.maxMp,
      reputation: player.reputation,
      will: player.will,
      attunement: player.attunement,
      barrier: player.soulBarrier.active
        ? {
          absorb: player.soulBarrier.absorb,
          mpPerHp: player.soulBarrier.mpPerHp,
          boosted: this.time < player.soulBarrier.boostUntil,
        }
        : null,
      alive: player.alive,
      respawnIn: round(Math.max(0, player.respawnAvailableAt - this.time)),
      targetId: player.attackTarget,
      rebirths: player.rebirths,
      level: player.level,
      moveSpeed: round(this._moveSpeed(player)),
    };
  }

  // What other players see: base scalars plus equipment trimmed to the
  // fields the renderer reads (shape by name, glow by rarity/dropClass) —
  // no inventory, wallet, friends, quest, or skill details.
  _serializePlayerPublic(player) {
    return {
      ...this._serializePlayerBase(player),
      equipment: Object.fromEntries(
        EQUIP_KEYS.map((key) => [
          key,
          player.equipment[key] ? publicItem(player.equipment[key]) : null,
        ]),
      ),
    };
  }

  _serializePlayer(player, onlineNames = null) {
    const online = onlineNames ?? this._onlineNames();
    const skills = Object.fromEntries(SKILL_SLOTS.map((slot) => {
      const definition = skillDefinition(player.archetype, slot);
      return [slot, {
        id: definition.id,
        name: definition.name,
        level: player.skillLevels[slot],
        maxLevel: definition.maxLevel,
        cooldown: definition.cooldown,
        remaining: round(Math.max(0, player.nextSkillAt[slot] - this.time)),
        unlockLevel: definition.unlockLevel ?? 1,
        unlocked: player.level >= (definition.unlockLevel ?? 1),
      }];
    }));
    return {
      ...this._serializePlayerBase(player),
      moveTarget: player.moveTarget ? { x: round(player.moveTarget.x), y: round(player.moveTarget.y) } : null,
      autoFight: player.autoFight,
      autoLevel: player.autoLevel,
      autoEquip: player.autoEquip,
      gold: player.gold,
      dew: player.dew,
      friends: player.friends.map((name) => ({
        name,
        online: online.has(name),
      })),
      party: player.partyId
        ? (this.parties.get(player.partyId)?.members ?? [])
          .map((memberId) => this.players.get(memberId)?.name)
          .filter(Boolean)
        : [],
      xp: round(player.xp),
      xpToNext: player.xpToNext,
      quest: (() => {
        const step = this._questStep(player);
        return {
          id: step.id,
          chainIndex: player.quest.chainIndex,
          chainLength: QUEST_CHAIN.length,
          title: step.title,
          description: step.description,
          target: step.target,
          progress: player.quest.progress,
          rewardXp: step.rewardXp,
          rewardGold: step.rewardGold,
          rewardDew: step.rewardDew,
        };
      })(),
      stats: { ...player.stats },
      gearStats: { ...player.gearStats },
      statPoints: player.statPoints,
      equipment: Object.fromEntries(
        EQUIP_KEYS.map((key) => [
          key,
          player.equipment[key] ? serializeItem(player.equipment[key]) : null,
        ]),
      ),
      inventory: player.inventory.map(serializeItem),
      skills,
      skillPoints: player.skillPoints,
      inputSeq: player.inputSeq,
    };
  }

  _nearestLivingPlayer(entity, maximumDistance) {
    let nearest = null;
    let nearestSquared = maximumDistance * maximumDistance;
    for (const player of this.players.values()) {
      if (!player.alive || player.mapId !== entity.mapId) continue;
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
    // Keep spawns well inside the town portal ring so nobody materialises
    // on a gate and gets whisked away while reading the HUD.
    const spread = Math.min(this.width, this.height) * 0.07;
    return {
      x: clamp(this.width / 2 + (this.rng() - 0.5) * spread, PLAYER_RADIUS, this.width - PLAYER_RADIUS),
      y: clamp(this.height / 2 + (this.rng() - 0.5) * spread, PLAYER_RADIUS, this.height - PLAYER_RADIUS),
    };
  }

  _mobSpawn(mapId = null) {
    const zone = this.zones.find((entry) => entry.id === mapId);
    const margin = 70;
    if (zone) {
      // A themed map owns the whole plane, so its population spreads across
      // the entire map — not just the legacy district ellipse. Keep a clear
      // pocket around the map's portals so arrivals are not instantly
      // swarmed.
      const portals = this.portals.filter((portal) => portal.mapId === mapId);
      let candidate = { x: this.width / 2, y: this.height / 2 };
      for (let attempt = 0; attempt < 24; attempt += 1) {
        candidate = {
          x: margin + this.rng() * Math.max(1, this.width - margin * 2),
          y: margin + this.rng() * Math.max(1, this.height - margin * 2),
        };
        if (portals.every((portal) => Math.hypot(portal.x - candidate.x, portal.y - candidate.y) > 320)) {
          break;
        }
      }
      return candidate;
    }
    // Anywhere on the map except inside (or hugging) the town safe zone.
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
      this.spawnMob({ mapId: spawn.mapId });
      spawned = true;
      return false;
    });
    if (spawned) this._maintainMobPopulation();
    for (const [bossId, at] of [...this._bossRespawns]) {
      if (this.time < at) continue;
      const definition = BOSSES.find((entry) => entry.id === bossId);
      if (definition) this.spawnBoss(definition);
      else this._bossRespawns.delete(bossId);
    }
  }

  _maintainMobPopulation() {
    if (this.mapMobTargets) {
      for (const [mapId, targetCount] of Object.entries(this.mapMobTargets)) {
        const current = [...this.mobs.values()].filter((mob) => mob.mapId === mapId).length;
        const pending = this.pendingMobSpawns.filter((spawn) => spawn.mapId === mapId).length;
        for (let index = current + pending; index < targetCount; index += 1) {
          this.spawnMob({ mapId });
        }
      }
      return;
    }
    const reserved = this.mobs.size + this.pendingMobSpawns.length;
    for (let index = reserved; index < this.mobTargetCount; index += 1) {
      this.spawnMob();
    }
  }

  _updateDrops(dt) {
    for (const [id, drop] of [...this.drops]) {
      if (this.time >= drop.expiresAt) {
        this._removeDrop(id);
        continue;
      }
      for (const player of this.players.values()) {
        if (!player.alive || player.mapId !== drop.mapId) continue;
        const dx = player.x - drop.x;
        const dy = player.y - drop.y;
        const distance = Math.hypot(dx, dy);
        // Loose loot drifts toward the nearest hunter on its own.
        if (distance > player.radius + DROP_PICKUP_RADIUS && distance <= DROP_MAGNET_RADIUS) {
          const pull = Math.min(DROP_MAGNET_SPEED * dt, distance);
          drop.x += (dx / distance) * pull;
          drop.y += (dy / distance) * pull;
          continue;
        }
        if (distance > player.radius + DROP_PICKUP_RADIUS) continue;

        if (player.inventory.length >= INVENTORY_LIMIT) {
          // Full bag, first option: wear the find on the spot when it beats
          // the equipped piece — the replaced gear takes its place on the
          // ground, so no bag slot is needed.
          const wearKey = player.autoEquip ? this._upgradeKeyFor(player, drop.item) : null;
          if (wearKey) {
            const replaced = player.equipment[wearKey];
            player.equipment[wearKey] = drop.item;
            this._refreshGear(player);
            this._refreshDerivedStats(player, true);
            this._removeDrop(id);
            if (replaced) this._placeDrop(player.x, player.y, replaced, player.mapId);
            this._emit("lootPickedUp", {
              playerId: player.id,
              itemId: drop.item.id,
              name: drop.item.name,
              rarity: drop.item.rarity,
              dropClass: drop.item.dropClass ?? null,
              slot: drop.item.slot,
              autoEquipped: true,
              ...(replaced ? { replaced: replaced.name } : {}),
            });
            break;
          }
          // Otherwise: swap out the weakest bag piece if the find is stronger.
          let worstIndex = -1;
          let worstPower = Infinity;
          player.inventory.forEach((item, index) => {
            const power = itemPower(item);
            if (power < worstPower) {
              worstPower = power;
              worstIndex = index;
            }
          });
          if (worstIndex < 0 || itemPower(drop.item) <= worstPower) continue;
          const [culled] = player.inventory.splice(worstIndex, 1);
          this._emit("itemDiscarded", {
            playerId: player.id,
            itemId: culled.id,
            name: culled.name,
            replacedBy: drop.item.name,
          });
        }
        player.inventory.push(drop.item);
        // Auto-wear is a server-side toggle now: special drops always equip
        // when allowed, regular finds equip when they beat the worn piece.
        let autoEquipped = false;
        if (player.autoEquip && ITEM_SLOTS.includes(drop.item.slot) && player.level >= (drop.item.level ?? 1)) {
          if (drop.item.dropClass || this._upgradeKeyFor(player, drop.item)) {
            this.equipItem(player.id, drop.item.id);
            autoEquipped = true;
          }
        }
        this._removeDrop(id);
        this._emit("lootPickedUp", {
          playerId: player.id,
          itemId: drop.item.id,
          name: drop.item.name,
          rarity: drop.item.rarity,
          dropClass: drop.item.dropClass ?? null,
          slot: drop.item.slot,
          autoEquipped,
        });
        break;
      }
    }
  }

  _maybeDropLoot(mob) {
    if (this.rng() < 0.22) {
      this._placeDrop(mob.x, mob.y, this._rollPotion(mob.level), mob.mapId);
    }
    const chance = Math.min(0.85, (0.22 + (mob.level - 1) * 0.07) * (mob.elite ? 1.8 : 1));
    if (this.rng() < chance) {
      this._placeDrop(mob.x, mob.y, this._rollItem(mob.level, mob.elite ? 2 : 1), mob.mapId);
    }
    this._trySpecialDrop(mob);
  }

  _dropBossHoard(mob) {
    const pieces = 3 + Math.floor(mob.level / 8);
    for (let index = 0; index < pieces; index += 1) {
      const item = this._rollItem(mob.level, 3);
      this._placeDrop(
        mob.x + (this.rng() - 0.5) * 90,
        mob.y + (this.rng() - 0.5) * 90,
        item,
        mob.mapId,
      );
    }
    // Strong bosses may leave behind a relic.
    if (this.rng() < 0.15 + mob.level * 0.01) {
      this._placeDrop(mob.x, mob.y - 30, this._rollRelic(mob.level), mob.mapId);
    }
    this._trySpecialDrop(mob, true);
    this._placeDrop(mob.x, mob.y + 30, this._rollPotion(mob.level), mob.mapId);
  }

  _placeDrop(x, y, item, mapId = "town") {
    const id = `drop-${++this._dropSequence}`;
    this.drops.set(id, {
      id,
      mapId,
      x: clamp(x, PLAYER_RADIUS, this.width - PLAYER_RADIUS),
      y: clamp(y, PLAYER_RADIUS, this.height - PLAYER_RADIUS),
      expiresAt: this.time + DROP_TTL,
      item,
    });
    if (item.dropClass && Object.hasOwn(this.specialDropActive, item.dropClass)) {
      this.specialDropActive[item.dropClass] += 1;
    }
    this._emit("lootDropped", {
      dropId: id,
      name: item.name,
      rarity: item.rarity,
      dropClass: item.dropClass ?? null,
      slot: item.slot,
      x: round(x),
      y: round(y),
    }, { mapId });
    return id;
  }

  _removeDrop(id) {
    const drop = this.drops.get(id);
    if (!drop) return false;
    this.drops.delete(id);
    if (drop.item.dropClass && Object.hasOwn(this.specialDropActive, drop.item.dropClass)) {
      this.specialDropActive[drop.item.dropClass] = Math.max(0, this.specialDropActive[drop.item.dropClass] - 1);
    }
    return true;
  }

  _trySpecialDrop(mob, boss = false) {
    const candidates = Object.entries(SPECIAL_DROPS)
      .filter(([, pool]) => mob.level >= pool.minLevel)
      .sort(([, left], [, right]) => right.tier - left.tier);
    for (const [kind, pool] of candidates) {
      if (this.specialDropActive[kind] >= pool.maxActive) continue;
      const chance = boss ? Math.min(0.8, pool.chance * 8) : pool.chance;
      if (this.rng() >= chance) continue;
      const item = this._rollSpecialDrop(kind, mob.level);
      this._placeDrop(
        mob.x + (this.rng() - 0.5) * 50,
        mob.y + (this.rng() - 0.5) * 50,
        item,
        mob.mapId,
      );
      return item;
    }
    return null;
  }

  // Thin adapters over src/server/loot.js: the world contributes only its
  // rng stream and the item id sequence.
  _nextItemId() {
    return `item-${++this._itemSequence}`;
  }

  _rollSpecialDrop(kind, level) {
    return rollSpecialDrop(this.rng, () => this._nextItemId(), kind, level);
  }

  _rollPotion(level) {
    return rollPotion(() => this._nextItemId(), level);
  }

  _rollItem(level, minTier = 1) {
    return rollItem(this.rng, () => this._nextItemId(), level, minTier);
  }

  _rollRelic(bossLevel) {
    return rollRelic(this.rng, () => this._nextItemId(), bossLevel);
  }

  _refreshGear(player) {
    const gearStats = zeroStats();
    const mods = { damage: 0, maxHp: 0, speed: 0, defense: 0 };
    const attacks = [];
    for (const item of Object.values(player.equipment)) {
      if (!item) continue;
      for (const key of STAT_KEYS) gearStats[key] += item.bonuses?.[key] ?? 0;
      mods.damage += item.damageBonus ?? 0;
      mods.maxHp += item.hpBonus ?? 0;
      mods.speed += item.speedBonus ?? 0;
      mods.defense += item.defenseBonus ?? 0;
      if (item.attackFormula) attacks.push(item.attackFormula);
    }
    player.gearStats = gearStats;
    player.gearMods = mods;
    player.gearAttacks = attacks;
  }

  _statTotal(player, key) {
    return player.stats[key] + player.gearStats[key];
  }

  _autoEngage(player) {
    const range = ARCHETYPES[player.archetype].primary.range * 0.95;
    let nearest = null;
    let nearestSquared = range * range;
    for (const mob of this.mobs.values()) {
      if (mob.mapId !== player.mapId) continue;
      const dx = mob.x - player.x;
      const dy = mob.y - player.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < nearestSquared) {
        nearest = mob;
        nearestSquared = distanceSquared;
      }
    }
    if (!nearest) return;
    const direction = directionTo(player, nearest, player.facing);
    player.facing = direction;
    this._usePrimary(player, direction);
  }

  _buildPortals() {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const ringRadius = Math.max(60, (this.safeZone?.radius ?? 200) - 20);
    this.portals = [];
    PORTAL_DESTINATIONS.forEach((destination, index) => {
      const angle = (index / PORTAL_DESTINATIONS.length) * Math.PI * 2 - Math.PI / 2;
      this.portals.push(
        {
          id: `portal-${destination.id}`,
          zone: destination.id,
          mapId: "town",
          x: cx + Math.cos(angle) * ringRadius,
          y: cy + Math.sin(angle) * ringRadius,
          targetId: `portal-${destination.id}-return`,
        },
        {
          id: `portal-${destination.id}-return`,
          zone: "town",
          mapId: destination.id,
          // Pulled 45% toward the map centre: the legacy anchor point is
          // also where the map's boss camps, and arrivals must land well
          // outside every boss's 460px aggro radius.
          x: destination.x * this.width + (cx - destination.x * this.width) * 0.45,
          y: destination.y * this.height + (cy - destination.y * this.height) * 0.45,
          targetId: `portal-${destination.id}`,
        },
      );
    });
  }

  _zoneAt(x, y) {
    for (const zone of this.zones) {
      const dx = (x - zone.x) / zone.rx;
      const dy = (y - zone.y) / zone.ry;
      if (dx * dx + dy * dy <= 1) return zone;
    }
    return null;
  }

  _updatePortals() {
    for (const player of this.players.values()) {
      if (!player.alive || this.time < player.portalLockUntil) continue;
      const covering = this.portals.find((portal) => {
        if (portal.mapId !== player.mapId) return false;
        const dx = player.x - portal.x;
        const dy = player.y - portal.y;
        return dx * dx + dy * dy <= PORTAL_RADIUS * PORTAL_RADIUS;
      });
      if (!covering) {
        player.portalDwell = null;
        continue;
      }
      // Walking across a gate must not teleport; standing on it does.
      if (player.portalDwell?.portalId !== covering.id) {
        player.portalDwell = { portalId: covering.id, since: this.time };
        continue;
      }
      if (this.time - player.portalDwell.since < PORTAL_DWELL) continue;
      const destination = this.portals.find((entry) => entry.id === covering.targetId);
      if (!destination) continue;
      // Arrive beside the destination gate (toward map centre), not on it.
      const exit = normalizedVector(
        { x: this.width / 2 - destination.x, y: this.height / 2 - destination.y },
        { x: 0, y: 1 },
      );
      player.x = clamp(destination.x + exit.x * 70, PLAYER_RADIUS, this.width - PLAYER_RADIUS);
      player.y = clamp(destination.y + exit.y * 70, PLAYER_RADIUS, this.height - PLAYER_RADIUS);
      player.mapId = covering.zone === "town" ? "town" : covering.zone;
      player.portalLockUntil = this.time + PORTAL_LOCK;
      player.portalDwell = null;
      player.moveTarget = null;
      player.attackTarget = null;
      this._emit("teleported", {
        playerId: player.id,
        portalId: covering.id,
        zone: covering.zone,
        x: round(player.x),
        y: round(player.y),
      });
    }
  }

  _inSafeZone(entity) {
    if (!this.safeZone || entity.mapId !== "town") return false;
    const dx = entity.x - this.safeZone.x;
    const dy = entity.y - this.safeZone.y;
    return dx * dx + dy * dy <= this.safeZone.radius * this.safeZone.radius;
  }

  _questStep(player) {
    return QUEST_CHAIN[Math.min(player.quest.chainIndex, QUEST_CHAIN.length - 1)];
  }

  _requirePlayer(id) {
    const player = this.players.get(id);
    if (!player) throw new WorldError("NOT_JOINED", "Player is not in the world.");
    return player;
  }

  _emit(event, payload = {}, scope = null) {
    const entry = { event, tick: this.tick, serverTime: round(this.time), ...payload };
    // Delivery scope is gateway-internal routing (never sent on the wire):
    // { mapId } limits to players on that map, { players } to explicit ids.
    if (scope) entry.scope = scope;
    this.events.push(entry);
  }
}

// Superlinear XP curve: with mob XP growing linearly in level, a linear
// requirement made late levels *faster* than mid-game. The extra
// (1 + level/60) factor keeps kills-per-level rising monotonically from
// ~6 at the start to ~35 near the cap (see the pacing table in CHANGELOG).
export function xpRequiredForLevel(level) {
  const base = 75 + Math.max(0, level - 1) * 55;
  return Math.round(base * (1 + Math.max(0, level - 1) / 60));
}

function zeroStats() {
  return Object.fromEntries(STAT_KEYS.map((key) => [key, 0]));
}

// Single-number strength estimate used to rank items of the same slot.
function itemPower(item) {
  let score = 0;
  for (const key of STAT_KEYS) score += (item.bonuses?.[key] ?? 0) * 10;
  score += (item.damageBonus ?? 0) * 400;
  score += item.hpBonus ?? 0;
  score += item.speedBonus ?? 0;
  score += (item.defenseBonus ?? 0) * 600;
  if (item.attackFormula) score += 300;
  return score;
}

// The slim item record other players receive: enough to draw the weapon
// shape, rarity glow, and special-drop halo, nothing about the stats.
function publicItem(item) {
  return {
    id: item.id,
    slot: item.slot,
    rarity: item.rarity,
    tier: item.tier,
    level: item.level ?? 1,
    name: item.name,
    ...(item.dropClass !== undefined ? { dropClass: item.dropClass } : {}),
  };
}

function serializeItem(item) {
  return {
    id: item.id,
    slot: item.slot,
    rarity: item.rarity,
    ...(item.dropClass !== undefined ? { dropClass: item.dropClass } : {}),
    tier: item.tier,
    level: item.level ?? 1,
    name: item.name,
    bonuses: { ...item.bonuses },
    ...(item.damageBonus !== undefined ? { damageBonus: item.damageBonus } : {}),
    ...(item.hpBonus !== undefined ? { hpBonus: item.hpBonus } : {}),
    ...(item.speedBonus !== undefined ? { speedBonus: item.speedBonus } : {}),
    ...(item.defenseBonus !== undefined ? { defenseBonus: item.defenseBonus } : {}),
    ...(item.attackFormula !== undefined ? { attackFormula: { ...item.attackFormula } } : {}),
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
    sprint: false,
    primary: false,
    q: false,
    e: false,
    r: false,
    c: false,
    f: false,
  };
}

function resolveSkillSlot(archetype, requestedSkill) {
  if (SKILL_SLOTS.includes(requestedSkill)) return requestedSkill;
  return SKILL_SLOTS.find((slot) => skillDefinition(archetype, slot).id === requestedSkill) ?? null;
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
