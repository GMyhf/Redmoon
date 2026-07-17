// Machine-readable protocol contract, versioned alongside PROTOCOL_VERSION.
// This is the single reference a native client (e.g. Godot) codes against;
// test/protocol-conformance.test.js checks real server output field-by-field
// against these specs and keeps the command/event/error lists in lockstep
// with the implementation.
//
// Spec mini-language:
//   "string" | "number" | "boolean" | "object" | "any"   value type
//   "...?"                                               field may be absent
//   "...|null"                                           value may be null
//   { field: spec, ... }   strict object — undocumented fields are errors
//   { $array: spec }       array of spec
//   { $map: spec }         object with arbitrary keys, values match spec
//     ... $nullable: true  map values may also be null
//   { $optional: spec }    field may be absent
//   { $nullable: spec }    value may be null
import { PROTOCOL_VERSION } from "./definitions.js";

const POINT = { x: "number", y: "number" };

const SAFE_ZONE = { x: "number", y: "number", radius: "number" };

const PORTAL = {
  id: "string",
  zone: "string",
  mapId: "string",
  x: "number",
  y: "number",
  targetId: "string",
};

const ZONE = {
  id: "string",
  theme: "string",
  x: "number",
  y: "number",
  rx: "number",
  ry: "number",
  minLevel: "number",
  maxLevel: "number",
};

const SHOP_GOOD = {
  key: "string",
  label: "string",
  gold: "number?",
  dew: "number?",
  heal: "number?",
  goldPerLevel: "number?",
  healPerLevel: "number?",
  // Present when the good credits a counter instead of yielding an item.
  protection: "number?",
};

const SHOP = {
  id: "string",
  name: "string",
  x: "number",
  y: "number",
  goods: { $array: SHOP_GOOD },
};

const WORLD_META = {
  name: "string",
  width: "number",
  height: "number",
  time: "number?",
  tick: "number?",
  mapId: "string|null",
  theme: "string|null",
  zones: { $array: ZONE },
  portals: { $array: PORTAL },
  shops: { $array: SHOP },
  safeZone: { $optional: { $nullable: SAFE_ZONE } },
};

// Slim item record everyone sees (other players' gear, ground drops carry
// their own shape below).
const ITEM_PUBLIC = {
  id: "string",
  slot: "string",
  rarity: "string",
  tier: "number",
  level: "number",
  name: "string",
  dropClass: "string?",
  // Refine stage rides on the public record so onlookers see a pushed piece.
  refine: "number?",
};

// Full item record: only the owner receives bonuses and formulas.
const ITEM_FULL = {
  ...ITEM_PUBLIC,
  bonuses: "object",
  damageBonus: "number?",
  hpBonus: "number?",
  speedBonus: "number?",
  defenseBonus: "number?",
  attackFormula: "object?",
  heal: "number?",
};

const STATS = {
  power: "number",
  agility: "number",
  spirit: "number",
  vitality: "number",
};

const SKILL_STATE = {
  id: "string",
  name: "string",
  level: "number",
  maxLevel: "number",
  cooldown: "number",
  remaining: "number",
  unlockLevel: "number",
  unlocked: "boolean",
};

const QUEST_STATE = {
  id: "string",
  chainIndex: "number",
  chainLength: "number",
  title: "string",
  description: "string",
  target: "number",
  progress: "number",
  rewardXp: "number",
  rewardGold: "number",
  rewardDew: "number",
};

// Fields every client needs to render any player on screen.
const PLAYER_BASE = {
  id: "string",
  name: "string",
  archetype: "string",
  mapId: "string",
  running: "boolean",
  color: "string",
  x: "number",
  y: "number",
  radius: "number",
  facing: POINT,
  hp: "number",
  maxHp: "number",
  mp: "number",
  maxMp: "number",
  reputation: "number",
  will: "number",
  honor: "number",
  armyName: "string|null",
  armyRank: "string|null",
  attunement: "string",
  barrier: { $nullable: { absorb: "number", mpPerHp: "number", boosted: "boolean" } },
  alive: "boolean",
  respawnIn: "number",
  targetId: "string|null",
  rebirths: "number",
  level: "number",
  moveSpeed: "number",
};

export const PLAYER_PUBLIC = {
  ...PLAYER_BASE,
  equipment: { $map: ITEM_PUBLIC, $nullable: true },
};

export const PLAYER_SELF = {
  ...PLAYER_BASE,
  moveTarget: { $nullable: POINT },
  autoFight: "boolean",
  autoLevel: "boolean",
  autoEquip: "boolean",
  gold: "number",
  dew: "number",
  protections: "number",
  // The roster the owner sees: every member, online or not.
  army: { $nullable: { name: "string", rank: "string", members: { $array: { name: "string", rank: "string", online: "boolean", level: "number" } } } },
  friends: { $array: { name: "string", online: "boolean", id: "string|null" } },
  party: { $array: "string" },
  xp: "number",
  xpToNext: "number",
  quest: QUEST_STATE,
  stats: STATS,
  gearStats: STATS,
  statPoints: "number",
  equipment: { $map: ITEM_FULL, $nullable: true },
  inventory: { $array: ITEM_FULL },
  skills: { $map: SKILL_STATE },
  skillPoints: "number",
  inputSeq: "number",
};

export const ENEMY = {
  id: "string",
  type: "string",
  name: "string",
  x: "number",
  y: "number",
  radius: "number",
  hp: "number",
  maxHp: "number",
  level: "number",
  elite: "boolean",
  boss: "boolean",
  damage: "number",
  speed: "number",
  defense: "number",
  attackStyle: "string",
  combatState: "string",
  attackTargetId: "string|null",
  attackRemaining: "number",
  attackWindup: "number",
  alive: "boolean",
};

export const DROP = {
  id: "string",
  x: "number",
  y: "number",
  slot: "string",
  rarity: "string",
  dropClass: "string|null",
  name: "string",
};

export const PROJECTILE = {
  id: "string",
  ownerId: "string",
  team: "string",
  x: "number",
  y: "number",
  fromX: "number",
  fromY: "number",
  radius: "number",
  color: "string",
};

const ARCHETYPE_PUBLIC = {
  id: "string",
  name: "string",
  description: "string",
  color: "string",
  stats: STATS,
  primary: { name: "string" },
  skills: {
    $map: {
      id: "string",
      name: "string",
      description: "string",
      cooldown: "number",
      maxLevel: "number",
      unlockLevel: "number",
    },
  },
};

const ROSTER_ENTRY = {
  name: "string",
  archetype: "string",
  level: "number",
  mapId: "string",
};

// ---- The contract ----------------------------------------------------

export const PROTOCOL = Object.freeze({
  version: PROTOCOL_VERSION,

  // Client → server commands. `type` selects the command; the spec lists
  // the remaining fields a well-formed client sends. The server aliases
  // `start`→`join`, `upgradeSkill`→`upgrade`, and accepts all-lowercase
  // spellings of camelCase names.
  clientMessages: {
    join: { name: "string?", archetype: "string?", token: "string?", nextToken: "string?", protocol: "number?", codec: "string?" },
    recover: { name: "string", code: "string", nextToken: "string?", protocol: "number?", codec: "string?" },
    input: {
      seq: "number?",
      move: { $optional: POINT },
      aim: { $optional: POINT },
      sprint: "boolean?",
      moveTo: { $optional: { $nullable: POINT } },
      target: "string?|null",
      primary: "boolean?",
      q: "boolean?",
      e: "boolean?",
      r: "boolean?",
      c: "boolean?",
      f: "boolean?",
    },
    allocate: { stat: "string" },
    upgrade: { skill: "string" },
    respawn: {},
    revive: {},
    rebirth: {},
    buy: { shop: "string", good: "string" },
    refine: { item: "string", useProtection: "boolean?" },
    sell: { item: "string" },
    equip: { item: "string" },
    unequip: { slot: "string" },
    use: { item: "string" },
    discard: { item: "string" },
    autoEquip: {},
    setAuto: { enabled: "boolean" },
    setAutoLevel: { enabled: "boolean" },
    setAutoEquip: { enabled: "boolean" },
    partyInvite: { target: "string" },
    partyAccept: { from: "string" },
    partyLeave: {},
    armyCreate: { name: "string" },
    armyInvite: { target: "string" },
    armyAccept: { from: "string" },
    armyLeave: {},
    armyKick: { name: "string" },
    armyPromote: { name: "string", rank: "string" },
    armyTransfer: { target: "string" },
    armyTransferAccept: { from: "string" },
    armyDisband: {},
    duelInvite: { target: "string" },
    duelAccept: { from: "string" },
    duelDecline: { from: "string" },
    duelForfeit: {},
    friendAdd: { name: "string" },
    friendRemove: { name: "string" },
    attune: { path: "string" },
    chat: { channel: "string", text: "string" },
    sessionRotate: { nextToken: "string?" },
    recoveryIssue: {},
    dungeonEnter: {},
    dungeonLeave: {},
    clientState: { visible: "boolean" },
    leave: {},
  },
  commandAliases: {
    start: "join",
    upgradeSkill: "upgrade",
    upgradeskill: "upgrade",
    sessionrotate: "sessionRotate",
    recoveryissue: "recoveryIssue",
    dungeonenter: "dungeonEnter",
    dungeonleave: "dungeonLeave",
  },

  // Server → client messages, validated strictly (undocumented fields fail).
  serverMessages: {
    welcome: {
      type: "string",
      protocol: "number",
      id: "string",
      clientId: "string",
      playerId: "string",
      tickRate: "number",
      snapshotRate: "number",
      world: WORLD_META,
      rebirthLevel: "number",
      inventoryLimit: "number",
      archetypes: { $map: ARCHETYPE_PUBLIC },
      roster: { $array: ROSTER_ENTRY },
    },
    session: { type: "string", token: "string", name: "string", archetype: "string" },
    recovery: { type: "string", name: "string", code: "string", expiresAt: "string" },
    roster: { type: "string", players: { $array: ROSTER_ENTRY } },
    snapshot: {
      type: "string",
      tick: "number",
      serverTime: "number",
      selfId: "string|null",
      world: WORLD_META,
      safeZone: { $nullable: SAFE_ZONE },
      // Entries are PLAYER_SELF for the recipient, PLAYER_PUBLIC otherwise;
      // the conformance test switches on selfId.
      players: { $array: "object" },
      enemies: { $array: ENEMY },
      projectiles: { $array: PROJECTILE },
      drops: { $array: DROP },
      mapId: "string|null",
      online: "number",
    },
    event: null, // envelope below + per-event payloads in `events`
    error: { type: "string", code: "string", message: "string", requestType: "string?" },
  },

  // Every event name the world emits; payload specs (beyond the envelope
  // event/tick/serverTime) are filled in as they harden. A null payload
  // means "documented name, payload not yet pinned".
  events: {
    alignmentShifted: null,
    attuned: null,
    autoAllocated: null,
    autoEquipChanged: { playerId: "string", enabled: "boolean" },
    autoEquipped: { playerId: "string", changed: "number" },
    autoFightChanged: { playerId: "string", enabled: "boolean" },
    autoLevelChanged: { playerId: "string", enabled: "boolean" },
    barrierSurged: null,
    chatMessage: { playerId: "string", name: "string", channel: "string", text: "string" },
    dungeonCompleted: null,
    dungeonFailed: null,
    dungeonLeft: null,
    dungeonStarted: null,
    bossSlain: { enemyId: "string", type: "string", name: "string", playerId: "string", x: "number", y: "number" },
    bossSpawned: { enemyId: "string", type: "string", name: "string", level: "number", x: "number", y: "number" },
    enemyAttack: null,
    enemyDefeated: { enemyId: "string", enemyType: "string", playerId: "string", xp: "number", x: "number", y: "number" },
    friendAdded: { playerId: "string", friend: "string" },
    friendRemoved: { playerId: "string", friend: "string" },
    itemDiscarded: null,
    itemEquipped: null,
    itemSold: { playerId: "string", itemId: "string", name: "string", gold: "number" },
    itemUnequipped: null,
    levelUp: null,
    lootDropped: null,
    lootPickedUp: {
      playerId: "string",
      itemId: "string",
      name: "string",
      rarity: "string",
      dropClass: "string|null",
      slot: "string",
      autoEquipped: "boolean",
      replaced: "string?",
    },
    partyInvited: { playerId: "string", from: "string", fromName: "string" },
    honorChanged: { playerId: "string", honor: "number", delta: "number" },
    armyCreated: { playerId: "string", name: "string" },
    armyInvited: { playerId: "string", from: "string", fromName: "string", army: "string" },
    armyJoined: { playerId: "string", name: "string", army: "string" },
    armyLeft: { playerId: "string", name: "string", army: "string", kicked: "boolean" },
    armyRankChanged: { playerId: "string", name: "string", army: "string", rank: "string" },
    armyTransferOffered: { playerId: "string", from: "string", fromName: "string", army: "string" },
    armyDisbanded: { playerId: "string", army: "string" },
    battleKill: { killerId: "string", killerName: "string", victimId: "string", victimName: "string", gold: "number", honor: "number" },
    duelInvited: { playerId: "string", from: "string", fromName: "string" },
    duelDeclined: { playerId: "string", from: "string", fromName: "string" },
    duelStarted: { duelId: "string", mapId: "string", players: { $array: "string" }, names: { $array: "string" }, endsAt: "number" },
    // `winner` is null on a draw (the clock ran out) — both sides survive.
    duelEnded: { duelId: "string", winner: "string|null", loser: "string|null", reason: "string" },
    itemRefined: {
      playerId: "string",
      itemId: "string",
      name: "string",
      success: "boolean",
      stage: "number",
      previousStage: "number",
      warded: "boolean",
      willSpent: "number",
      goldSpent: "number",
    },
    partyJoined: { playerId: "string", partyId: "string", name: "string" },
    partyLeft: { playerId: "string", name: "string" },
    playerDefeated: { playerId: "string", sourceId: "string", respawnDelay: "number", x: "number", y: "number" },
    playerJoined: { playerId: "string", name: "string", archetype: "string" },
    playerLeft: { playerId: "string", name: "string" },
    playerReconnected: { playerId: "string", name: "string" },
    playerReborn: null,
    playerRespawned: null,
    playerRevived: { playerId: "string", x: "number", y: "number" },
    potionUsed: null,
    // Item fields are absent when the good is a counter (ward sigils) rather
    // than something that materialises in the inventory.
    purchased: { playerId: "string", shopId: "string", good: "string", itemId: "string?", name: "string?", rarity: "string?", protections: "number?" },
    questCompleted: null,
    questProgress: null,
    skillUpgraded: null,
    skillUsed: { playerId: "string", skill: "string", skillId: "string", level: "number" },
    statAllocated: null,
    teleported: null,
  },
  eventEnvelope: { type: "string", event: "string", tick: "number", serverTime: "number" },

  errorCodes: [
    "ALREADY_ALIVE", "ALREADY_IN_PARTY", "ALREADY_JOINED", "CHAT_TOO_FAST",
    "DUPLICATE_ENTITY", "DUNGEON_ACTIVE", "DUNGEON_CAPACITY", "DUNGEON_LEADER_ONLY",
    "DUNGEON_PARTY_NOT_READY", "DUNGEON_INSTANCE_UNKNOWN", "DUNGEON_MEMBER_INVALID",
    "DUNGEON_NOT_COMPLETE", "DUNGEON_REWARD_INVALID", "DUNGEON_SETTLEMENT_INVALID",
    "ARMY_ACTIVE", "ARMY_FULL", "ARMY_LEVEL_TOO_LOW", "ARMY_NAME_TAKEN",
    "ARMY_RANK_FORBIDDEN", "NO_ARMY", "NO_ARMY_INVITE", "NOT_ENOUGH_HONOR_FOR_ARMY",
        "DUEL_ACTIVE", "DUEL_CAPACITY", "DUEL_NOT_READY", "NO_DUEL", "NO_DUEL_INVITE",
    "DUNGEON_STATE_STALE", "DUNGEON_WORKER_UNAVAILABLE", "INVALID_CHANNEL",
    "FRIENDS_FULL", "INTERNAL_ERROR", "INVALID_ARCHETYPE", "INVALID_GOOD",
    "INVALID_ID", "INVALID_ITEM", "INVALID_JSON", "INVALID_MESSAGE",
    "INVALID_SHOP", "INVALID_SKILL", "INVALID_SLOT", "INVALID_STAT",
    "INVALID_RECOVERY", "INVALID_TARGET", "INVALID_TOKEN", "INVENTORY_FULL", "ITEM_LEVEL_TOO_HIGH",
    "MESSAGE_TOO_LARGE", "NAME_IN_USE", "NAME_TAKEN", "NO_DEW", "NO_GOLD",
    "NO_INVITE", "NO_PARTY", "NO_PROTECTION", "NO_SKILL_POINTS", "NO_STAT_POINTS",
    "NOT_ENOUGH_HONOR", "NOT_ENOUGH_WILL", "NOT_JOINED",
    "PARTY_FULL", "PLAYER_DEAD", "PROTOCOL_MISMATCH", "RATE_LIMITED",
    "REBIRTH_LEVEL_TOO_LOW", "REFINE_MAX_STAGE", "REFINE_TIER_TOO_LOW",
    "RESPAWN_PENDING", "SKILL_LOCKED",
    "SKILL_MAX_LEVEL", "TOO_FAR", "UNKNOWN_MESSAGE",
  ],
});

// ---- Validator ---------------------------------------------------------

function typeOk(value, base) {
  if (base === "any") return true;
  if (base === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  return typeof value === base;
}

function walk(value, spec, path, problems) {
  if (typeof spec === "string") {
    const nullable = spec.includes("|null");
    const base = spec.replace("|null", "").replace("?", "");
    if (value === null) {
      if (!nullable) problems.push(`${path}: null is not allowed (${spec})`);
      return;
    }
    if (!typeOk(value, base)) problems.push(`${path}: expected ${base}, got ${typeof value}`);
    return;
  }
  if (spec.$optional) {
    walk(value, spec.$optional, path, problems);
    return;
  }
  // ($nullable: true is the map-values modifier, handled in the $map branch.)
  if (spec.$nullable && spec.$nullable !== true) {
    if (value === null) return;
    walk(value, spec.$nullable, path, problems);
    return;
  }
  if (spec.$array) {
    if (!Array.isArray(value)) {
      problems.push(`${path}: expected array`);
      return;
    }
    value.forEach((entry, index) => walk(entry, spec.$array, `${path}[${index}]`, problems));
    return;
  }
  if (spec.$map) {
    if (!typeOk(value, "object")) {
      problems.push(`${path}: expected object map`);
      return;
    }
    for (const [key, entry] of Object.entries(value)) {
      if (entry === null) {
        if (!spec.$nullable) problems.push(`${path}.${key}: null is not allowed`);
        continue;
      }
      walk(entry, spec.$map, `${path}.${key}`, problems);
    }
    return;
  }
  // Strict object: every present field must be documented, every
  // non-optional documented field must be present.
  if (!typeOk(value, "object")) {
    problems.push(`${path}: expected object`);
    return;
  }
  for (const [key, fieldSpec] of Object.entries(spec)) {
    const optional = typeof fieldSpec === "string" ? fieldSpec.includes("?") : Boolean(fieldSpec.$optional);
    if (!(key in value)) {
      if (!optional) problems.push(`${path}.${key}: missing required field`);
      continue;
    }
    walk(value[key], fieldSpec, `${path}.${key}`, problems);
  }
  for (const key of Object.keys(value)) {
    if (!(key in spec)) problems.push(`${path}.${key}: undocumented field`);
  }
}

// Validates a value against a spec; returns a list of human-readable
// problems (empty when conformant).
export function validate(value, spec, path = "message") {
  const problems = [];
  walk(value, spec, path, problems);
  return problems;
}
