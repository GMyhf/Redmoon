export const PROTOCOL_VERSION = 1;
export const TICK_RATE = 20;
export const SNAPSHOT_RATE = 10;

// Soul Barrier: damage is paid from MP before HP. `absorb` is the fraction
// of incoming damage redirected to MP; `mpPerHp` is the conversion price.
export const SOUL_BARRIER = Object.freeze({ absorb: 0.6, mpPerHp: 1.4 });
export const REPUTATION_LIMIT = 1000;

export const REBIRTH_LEVEL = 10;
export const REBIRTH_STAT_BONUS = 6;
export const REBIRTH_HP_BONUS = 0.12;
export const REBIRTH_DAMAGE_BONUS = 0.15;

// Species own combat profiles; these values drive both simulation stats and
// client-side attack presentation.
export const MOB_TYPES = Object.freeze([
  Object.freeze({ type: "riftling", name: "Riftling", hpMul: 1, xpMul: 1, size: 0, speedMul: 1, attack: "claw", defense: 2, range: 44, windup: 0.45, cooldown: 1.25 }),
  Object.freeze({ type: "duskfang", name: "Duskfang", hpMul: 1.1, xpMul: 1.1, size: 0, speedMul: 1.08, attack: "bite", defense: 3, range: 46, windup: 0.38, cooldown: 1.1 }),
  Object.freeze({ type: "ashwing", name: "Ashwing", hpMul: 1.15, xpMul: 1.25, size: 0, speedMul: 1.1, attack: "ember", defense: 3, range: 190, windup: 0.7, cooldown: 1.8 }),
  Object.freeze({ type: "thorncrawler", name: "Thorncrawler", hpMul: 1.3, xpMul: 1.4, size: 3, speedMul: 0.95, attack: "spike", defense: 6, range: 150, windup: 0.65, cooldown: 1.7 }),
  Object.freeze({ type: "stonehorn", name: "Stonehorn", hpMul: 1.5, xpMul: 1.6, size: 6, speedMul: 0.85, attack: "charge", defense: 8, range: 72, windup: 0.8, cooldown: 2 }),
  Object.freeze({ type: "frostseer", name: "Frostseer", hpMul: 1.45, xpMul: 1.8, size: 4, speedMul: 0.82, attack: "frost", defense: 7, range: 220, windup: 0.9, cooldown: 2.1 }),
  Object.freeze({ type: "scraphulk", name: "Scraphulk", hpMul: 2, xpMul: 2.3, size: 10, speedMul: 0.7, attack: "slam", defense: 12, range: 62, windup: 1, cooldown: 2.3 }),
  Object.freeze({ type: "stormeye", name: "Stormeye", hpMul: 1.7, xpMul: 2.5, size: 7, speedMul: 0.9, attack: "lightning", defense: 9, range: 250, windup: 0.75, cooldown: 2 }),
  Object.freeze({ type: "voidmaw", name: "Voidmaw", hpMul: 2.6, xpMul: 3.2, size: 12, speedMul: 0.8, attack: "void", defense: 10, range: 210, windup: 1.1, cooldown: 2.5 }),
]);

// Item slot types; rings occupy three interchangeable equip keys.
export const ITEM_SLOTS = Object.freeze([
  "weapon",
  "shield",
  "helm",
  "necklace",
  "chest",
  "belt",
  "gloves",
  "pants",
  "boots",
  "ring",
]);

export const EQUIP_KEYS = Object.freeze([
  "weapon",
  "shield",
  "helm",
  "necklace",
  "chest",
  "belt",
  "gloves",
  "pants",
  "boots",
  "ring1",
  "ring2",
  "ring3",
]);

export const RING_KEYS = Object.freeze(["ring1", "ring2", "ring3"]);

export const LEVEL_CAP = 1000;

// Currencies: gold drops from every kill and buys basics; revival dew is
// rare, revives you on the spot, and pays the black marketeer.
export const GOLD_PER_MOB_LEVEL = 2;
export const DEW_DROP_CHANCE = 0.02;
export const PARTY_LIMIT = 4;
export const PARTY_XP_SHARE = 0.6;
export const PARTY_XP_RANGE = 1200;

// Town shopkeepers (original characters), placed relative to town centre.
export const SHOPS = Object.freeze([
  Object.freeze({
    id: "grocer",
    name: "杂货商·芦婆",
    dx: -310,
    dy: 95,
    goods: Object.freeze([
      Object.freeze({ key: "potion-s", label: "小修复药剂", gold: 30, heal: 60 }),
      Object.freeze({ key: "potion-l", label: "大修复药剂", gold: 90, heal: 200 }),
    ]),
  }),
  Object.freeze({
    id: "smith",
    name: "锻匠·坤铁",
    dx: 310,
    dy: 95,
    goods: Object.freeze([
      Object.freeze({ key: "forge-gear", label: "定制装备（随机部位，精制以上）", gold: 120 }),
    ]),
  }),
  Object.freeze({
    id: "blackmarket",
    name: "黑市商人·影三",
    dx: 0,
    dy: -315,
    goods: Object.freeze([
      Object.freeze({ key: "relic-box", label: "遗物匣（随机遗物）", dew: 3 }),
    ]),
  }),
]);

// The relay's eight-step quest chain; the final hunt repeats forever.
export const QUEST_CHAIN = Object.freeze([
  Object.freeze({ id: "chain-1", title: "稳定边缘区", description: "清除裂隙体", type: "killType", param: "riftling", target: 6, rewardXp: 120, rewardGold: 60, rewardDew: 0 }),
  Object.freeze({ id: "chain-2", title: "暮色狩猎", description: "讨伐暮牙兽", type: "killType", param: "duskfang", target: 8, rewardXp: 240, rewardGold: 100, rewardDew: 0 }),
  Object.freeze({ id: "chain-3", title: "精英试炼", description: "猎杀任意精英怪", type: "killElite", param: null, target: 3, rewardXp: 400, rewardGold: 150, rewardDew: 1 }),
  Object.freeze({ id: "chain-4", title: "草原之主", description: "击败棘颚兽", type: "killBoss", param: "thornmaw", target: 1, rewardXp: 600, rewardGold: 300, rewardDew: 1 }),
  Object.freeze({ id: "chain-5", title: "碎岩行动", description: "讨伐岩角兽", type: "killType", param: "stonehorn", target: 10, rewardXp: 900, rewardGold: 400, rewardDew: 1 }),
  Object.freeze({ id: "chain-6", title: "沙海霸主", description: "击败沙喉", type: "killBoss", param: "sandmaw", target: 1, rewardXp: 1200, rewardGold: 600, rewardDew: 2 }),
  Object.freeze({ id: "chain-7", title: "虚空回响", description: "讨伐虚空吞喉", type: "killType", param: "voidmaw", target: 8, rewardXp: 1800, rewardGold: 800, rewardDew: 2 }),
  Object.freeze({ id: "chain-8", title: "深红的终局", description: "击败深红督军（可重复）", type: "killBoss", param: "warden", target: 1, rewardXp: 4000, rewardGold: 2000, rewardDew: 5 }),
]);

export const RARITIES = Object.freeze([
  Object.freeze({ id: "common", tier: 1, baseWeight: 62, levelWeight: 0 }),
  Object.freeze({ id: "fine", tier: 2, baseWeight: 26, levelWeight: 4 }),
  Object.freeze({ id: "rare", tier: 3, baseWeight: 9, levelWeight: 3 }),
  Object.freeze({ id: "epic", tier: 4, baseWeight: 3, levelWeight: 2 }),
]);

export const ITEM_BASES = Object.freeze({
  weapon: Object.freeze(["Pulse Edge", "Starrift Bow", "Resonant Staff"]),
  shield: Object.freeze(["Aegis Plate", "Wardwall", "Echo Buckler"]),
  chest: Object.freeze(["Weave Plate", "Phase Guard", "Moonthread Robe"]),
  helm: Object.freeze(["Ridge Helm", "Duskwatch Hood", "Lunar Circlet"]),
  necklace: Object.freeze(["Signal Torque", "Emberbead Chain", "Tidebound Pendant"]),
  belt: Object.freeze(["Relay Girdle", "Duneclasp Belt", "Thornloop Sash"]),
  gloves: Object.freeze(["Embergrip Gloves", "Weaver Mitts", "Stonefist Gauntlets"]),
  pants: Object.freeze(["Trail Greaves", "Duskweave Pants", "Plated Leggings"]),
  ring: Object.freeze(["Orbit Band", "Rift Seal", "Dawnspark Ring"]),
  boots: Object.freeze(["Skimmer Boots", "Duneswift Greaves", "Nightpath Treads"]),
});

// Relic gear (original designs): weapon damage follows level×stat/divisor,
// some pieces trade nothing for raw output, others add a defense rider.
// A divisor pair means the shot rolls between the two.
export const RELIC_WEAPONS = Object.freeze([
  Object.freeze({ name: "霜月刀·霁澜", stat: "power", divisor: 55, defense: 0.2 }),
  Object.freeze({ name: "曦阳剑·灼金", stat: "power", divisor: 50, defense: 0.2 }),
  Object.freeze({ name: "潮汐叉·沧浪", stat: "power", divisor: 50, defense: 0.2 }),
  Object.freeze({ name: "幽渊矛·噬暗", stat: "power", divisor: 55, defense: 0.2 }),
  Object.freeze({ name: "流星铳·掠火", stat: "power", divisor: 55, defense: 0 }),
  Object.freeze({ name: "蚀夜铳·吞辉", stat: "power", divisor: 50, defense: 0 }),
  Object.freeze({ name: "虹弦弓·析光", stat: "agility", divisor: 85, maxDivisor: 60, defense: 0 }),
  Object.freeze({ name: "风暴弓·涡澜", stat: "agility", divisor: 85, maxDivisor: 50, defense: 0 }),
  Object.freeze({ name: "星祷杖·引冥", stat: "spirit", divisor: 55, multiplier: 0.8, defense: 0 }),
  Object.freeze({ name: "献辉杖·燃愿", stat: "spirit", divisor: 50, multiplier: 0.8, defense: 0 }),
]);

// Relic jewellery: huge flat attribute bundles with a defense rider; the
// two attuned pieces trade stats for a spirit-scaled strike.
export const RELIC_JEWELRY = Object.freeze([
  Object.freeze({ name: "凝神之戒", slot: "ring", bonuses: Object.freeze({ power: 400, spirit: 1500, agility: 500, vitality: 500 }), defense: 0.05 }),
  Object.freeze({ name: "长明之链", slot: "necklace", bonuses: Object.freeze({ power: 400, spirit: 1500, agility: 500, vitality: 500 }), defense: 0.1 }),
  Object.freeze({ name: "无衰之戒", slot: "ring", bonuses: Object.freeze({ power: 900, spirit: 1700, agility: 800, vitality: 600 }), defense: 0.05 }),
  Object.freeze({ name: "无衰之链", slot: "necklace", bonuses: Object.freeze({ power: 600, spirit: 1700, agility: 800, vitality: 700 }), defense: 0.1 }),
  Object.freeze({ name: "心焰之戒", slot: "ring", attack: Object.freeze({ stat: "spirit", divisor: 60, multiplier: 0.4 }), defense: 0.05 }),
  Object.freeze({ name: "心焰之链", slot: "necklace", bonuses: Object.freeze({ power: 1200, spirit: 1200, agility: 1500, vitality: 1000 }), defense: 0.1 }),
  Object.freeze({ name: "回澜之戒", slot: "ring", attack: Object.freeze({ stat: "spirit", divisor: 60, multiplier: 0.5 }), defense: 0.05 }),
  Object.freeze({ name: "回澜之链", slot: "necklace", bonuses: Object.freeze({ power: 1400, spirit: 1400, agility: 2000, vitality: 1200 }), defense: 0.1 }),
]);

export const INVENTORY_LIMIT = 48;
export const DROP_TTL = 60;
export const DROP_PICKUP_RADIUS = 26;
// Drops within this range drift toward the nearest player on their own.
export const DROP_MAGNET_RADIUS = 180;
export const DROP_MAGNET_SPEED = 320;

// Themed districts layered over the base terrain. Positions and radii are
// fractions of the map size; mobs inside spawn within the level range.
export const ZONES = Object.freeze([
  Object.freeze({ id: "residential", theme: "residential", x: 0.4, y: 0.42, rx: 0.09, ry: 0.1, minLevel: 1, maxLevel: 3 }),
  Object.freeze({ id: "downtown", theme: "downtown", x: 0.615, y: 0.44, rx: 0.09, ry: 0.1, minLevel: 2, maxLevel: 4 }),
  Object.freeze({ id: "backhill", theme: "mountain", x: 0.5, y: 0.14, rx: 0.14, ry: 0.12, minLevel: 4, maxLevel: 7 }),
  Object.freeze({ id: "scrapyard", theme: "scrapyard", x: 0.87, y: 0.5, rx: 0.12, ry: 0.14, minLevel: 6, maxLevel: 9 }),
  Object.freeze({ id: "desert", theme: "desert", x: 0.26, y: 0.78, rx: 0.17, ry: 0.17, minLevel: 8, maxLevel: 11 }),
  Object.freeze({ id: "snowmountain", theme: "snow", x: 0.19, y: 0.19, rx: 0.16, ry: 0.16, minLevel: 10, maxLevel: 13 }),
  Object.freeze({ id: "castle", theme: "castle", x: 0.09, y: 0.52, rx: 0.085, ry: 0.11, minLevel: 12, maxLevel: 14 }),
  Object.freeze({ id: "starship", theme: "spaceport", x: 0.445, y: 0.85, rx: 0.14, ry: 0.12, minLevel: 12, maxLevel: 16 }),
  Object.freeze({ id: "skycity", theme: "skycity", x: 0.875, y: 0.14, rx: 0.135, ry: 0.13, minLevel: 14, maxLevel: 18 }),
]);

// Gate ring around town: one portal per hunting ground, paired with a
// return gate at the district hub.
export const PORTAL_DESTINATIONS = Object.freeze([
  Object.freeze({ id: "residential", x: 0.4, y: 0.42 }),
  Object.freeze({ id: "downtown", x: 0.615, y: 0.44 }),
  Object.freeze({ id: "backhill", x: 0.5, y: 0.14 }),
  Object.freeze({ id: "scrapyard", x: 0.87, y: 0.5 }),
  Object.freeze({ id: "desert", x: 0.26, y: 0.78 }),
  Object.freeze({ id: "snowmountain", x: 0.19, y: 0.19 }),
  Object.freeze({ id: "castle", x: 0.09, y: 0.52 }),
  Object.freeze({ id: "starship", x: 0.445, y: 0.85 }),
  Object.freeze({ id: "skycity", x: 0.875, y: 0.14 }),
]);

// One boss per hunting ground, in rising order of level and experience.
export const BOSSES = Object.freeze([
  Object.freeze({ id: "boss-thornmaw", type: "thornmaw", name: "Thornmaw", level: 7, maxHp: 900, damage: 20, speed: 96, xp: 400, radius: 24, x: 0.13, y: 0.5 }),
  Object.freeze({ id: "boss-cragfather", type: "cragfather", name: "Cragfather", level: 9, maxHp: 1300, damage: 26, speed: 80, xp: 600, radius: 27, x: 0.5, y: 0.12 }),
  Object.freeze({ id: "boss-sandmaw", type: "sandmaw", name: "Sandmaw", level: 11, maxHp: 1700, damage: 30, speed: 84, xp: 900, radius: 28, x: 0.26, y: 0.78 }),
  Object.freeze({ id: "boss-rustking", type: "rustking", name: "Rustking", level: 12, maxHp: 1900, damage: 32, speed: 70, xp: 1100, radius: 30, x: 0.9, y: 0.5 }),
  Object.freeze({ id: "boss-rimehorn", type: "rimehorn", name: "Rimehorn", level: 14, maxHp: 2300, damage: 34, speed: 78, xp: 1400, radius: 29, x: 0.19, y: 0.19 }),
  Object.freeze({ id: "boss-gravemarch", type: "gravemarch", name: "Gravemarch", level: 15, maxHp: 2600, damage: 36, speed: 74, xp: 1700, radius: 30, x: 0.09, y: 0.52 }),
  Object.freeze({ id: "boss-hullwraith", type: "hullwraith", name: "Hullwraith", level: 17, maxHp: 3000, damage: 38, speed: 100, xp: 2000, radius: 28, x: 0.42, y: 0.86 }),
  Object.freeze({ id: "boss-warden", type: "warden", name: "Crimson Warden", level: 20, maxHp: 3600, damage: 44, speed: 92, xp: 2600, radius: 30, x: 0.9, y: 0.14 }),
]);

// Auto point-allocation weights per hero: stats are filled so that
// allocated/weight stays balanced (higher weight = more points).
export const ALLOC_WEIGHTS = Object.freeze({
  vanguard: Object.freeze({ power: 3, agility: 1, spirit: 0.2, vitality: 2 }),
  channeler: Object.freeze({ power: 0.2, agility: 1, spirit: 3, vitality: 1.5 }),
  strider: Object.freeze({ power: 1.5, agility: 3, spirit: 0.2, vitality: 1 }),
  bulwark: Object.freeze({ power: 2, agility: 0.5, spirit: 0.2, vitality: 3 }),
  longshot: Object.freeze({ power: 1, agility: 3, spirit: 0.5, vitality: 1 }),
  pyre: Object.freeze({ power: 0.2, agility: 0.5, spirit: 3, vitality: 1.5 }),
  moonblade: Object.freeze({ power: 2, agility: 3, spirit: 0.2, vitality: 1 }),
  eclipse: Object.freeze({ power: 0.2, agility: 1, spirit: 3, vitality: 1.5 }),
});

export const STAT_KEYS = Object.freeze([
  "power",
  "agility",
  "spirit",
  "vitality",
]);

export const SKILL_SLOTS = Object.freeze(["q", "e", "r", "c", "f"]);

const EXTRA_SKILL_NAMES = Object.freeze({
  vanguard: ["裂阵重斩", "赤钢回旋"], channeler: ["星核坠落", "潮汐跃迁"],
  strider: ["追风连星", "残影回刃"], bulwark: ["震岳壁击", "守望铁环"],
  longshot: ["猎隼标记", "折光箭雨"], pyre: ["灼地火柱", "焰影穿行"],
  eclipse: ["暮光裁决", "双魂轮转"], moonblade: ["银月交叉", "镜花回舞"],
});

export function skillDefinition(archetype, slot) {
  const native = ARCHETYPES[archetype]?.skills?.[slot];
  if (native) return native;
  const names = EXTRA_SKILL_NAMES[archetype];
  if (!names || (slot !== "r" && slot !== "c")) return null;
  return Object.freeze({
    id: `${archetype}-${slot}-technique`,
    name: names[slot === "r" ? 0 : 1],
    description: slot === "r" ? "Concentrate power into a heavy five-point assault." : "Reposition and release a defensive ring.",
    cooldown: slot === "r" ? 8.5 : 10,
    maxLevel: 15,
    unlockLevel: slot === "r" ? 5 : 10,
  });
}

export const ARCHETYPES = Object.freeze({
  vanguard: Object.freeze({
    id: "vanguard",
    name: "Vanguard",
    description: "A durable close-range fighter who turns momentum into shockwaves.",
    color: "#ef6a4c",
    baseHp: 116,
    baseSpeed: 176,
    primary: Object.freeze({
      name: "Impulse Shot",
      cooldown: 0.48,
      damage: 13,
      speed: 540,
      range: 190,
      color: "#ff9a64",
    }),
    skills: Object.freeze({
      q: Object.freeze({
        id: "ram-drive",
        name: "Ram Drive",
        description: "Surge forward and launch a heavy kinetic wave.",
        cooldown: 4.5,
        maxLevel: 20,
      }),
      e: Object.freeze({
        id: "resonant-ring",
        name: "Resonant Ring",
        description: "Release a ring of short-range force projectiles.",
        cooldown: 7,
        maxLevel: 20,
      }),
      f: Object.freeze({
        id: "skybreaker",
        name: "Skybreaker",
        description: "Bring the blade down hard enough to crack the field itself.",
        cooldown: 16,
        maxLevel: 10,
      }),
    }),
  }),
  channeler: Object.freeze({
    id: "channeler",
    name: "Channeler",
    description: "A ranged specialist who shapes volatile stellar energy.",
    color: "#45b8a7",
    baseHp: 84,
    baseSpeed: 184,
    primary: Object.freeze({
      name: "Flux Spark",
      cooldown: 0.55,
      damage: 11,
      speed: 610,
      range: 540,
      color: "#69e0cf",
    }),
    skills: Object.freeze({
      q: Object.freeze({
        id: "arc-lance",
        name: "Arc Lance",
        description: "Fire a piercing lance that crosses the battlefield.",
        cooldown: 3.8,
        maxLevel: 20,
      }),
      e: Object.freeze({
        id: "orbit-bloom",
        name: "Orbit Bloom",
        description: "Cast stellar bolts in every direction.",
        cooldown: 7.5,
        maxLevel: 20,
      }),
      f: Object.freeze({
        id: "startide",
        name: "Startide",
        description: "Release a colossal orb of starfire that rolls through everything.",
        cooldown: 18,
        maxLevel: 10,
      }),
    }),
  }),
  strider: Object.freeze({
    id: "strider",
    name: "Strider",
    description: "A swift skirmisher built around precision and repositioning.",
    color: "#e3bc4f",
    baseHp: 94,
    baseSpeed: 204,
    primary: Object.freeze({
      name: "Needle Dart",
      cooldown: 0.38,
      damage: 10,
      speed: 760,
      range: 600,
      color: "#f8d86c",
    }),
    skills: Object.freeze({
      q: Object.freeze({
        id: "split-volley",
        name: "Split Volley",
        description: "Fire three precision darts in a narrow fan.",
        cooldown: 3.4,
        maxLevel: 20,
      }),
      e: Object.freeze({
        id: "phase-vault",
        name: "Phase Vault",
        description: "Vault forward and fire a wake of energy.",
        cooldown: 6,
        maxLevel: 20,
      }),
      f: Object.freeze({
        id: "storm-of-edges",
        name: "Storm of Edges",
        description: "Dash through the fray inside a storm of spinning blades.",
        cooldown: 15,
        maxLevel: 10,
      }),
    }),
  }),
  bulwark: Object.freeze({
    id: "bulwark",
    name: "Bulwark",
    description: "An unbreakable line-holder who answers force with force.",
    color: "#9aa7b8",
    baseHp: 128,
    baseSpeed: 168,
    primary: Object.freeze({
      name: "Bastion Break",
      cooldown: 0.6,
      damage: 15,
      speed: 500,
      range: 170,
      color: "#c3d0e2",
    }),
    skills: Object.freeze({
      q: Object.freeze({
        id: "quake-ring",
        name: "Quake Ring",
        description: "Slam the ground and shatter everything nearby.",
        cooldown: 5,
        maxLevel: 20,
      }),
      e: Object.freeze({
        id: "iron-charge",
        name: "Iron Charge",
        description: "Charge forward behind a crushing ram wave.",
        cooldown: 6.5,
        maxLevel: 20,
      }),
      f: Object.freeze({
        id: "mountainfall",
        name: "Mountainfall",
        description: "Shatter the ground in a devastating full-circle quake.",
        cooldown: 20,
        maxLevel: 10,
      }),
    }),
  }),
  longshot: Object.freeze({
    id: "longshot",
    name: "Longshot",
    description: "A patient marksman who ends fights before they start.",
    color: "#7fb4e6",
    baseHp: 80,
    baseSpeed: 178,
    primary: Object.freeze({
      name: "Longshot Bolt",
      cooldown: 0.7,
      damage: 14,
      speed: 900,
      range: 760,
      color: "#a9d0f5",
    }),
    skills: Object.freeze({
      q: Object.freeze({
        id: "rail-lance",
        name: "Rail Lance",
        description: "A piercing shot that crosses half the field.",
        cooldown: 4.2,
        maxLevel: 20,
      }),
      e: Object.freeze({
        id: "disengage-volley",
        name: "Disengage Volley",
        description: "Leap back while loosing a spread of bolts.",
        cooldown: 6,
        maxLevel: 20,
      }),
      f: Object.freeze({
        id: "meteor-volley",
        name: "Meteor Volley",
        description: "Loose five piercing lances that cross the entire field.",
        cooldown: 17,
        maxLevel: 10,
      }),
    }),
  }),
  pyre: Object.freeze({
    id: "pyre",
    name: "Pyre",
    description: "A flame-shaper who burns the field clean around her.",
    color: "#e07a4f",
    baseHp: 88,
    baseSpeed: 180,
    primary: Object.freeze({
      name: "Cinder Bolt",
      cooldown: 0.5,
      damage: 10,
      speed: 560,
      range: 480,
      color: "#ffab72",
    }),
    skills: Object.freeze({
      q: Object.freeze({
        id: "flame-nova",
        name: "Flame Nova",
        description: "Erupt in a ring of fire.",
        cooldown: 5.5,
        maxLevel: 20,
      }),
      e: Object.freeze({
        id: "ember-fan",
        name: "Ember Fan",
        description: "Sweep a wide fan of embers forward.",
        cooldown: 4.4,
        maxLevel: 20,
      }),
      f: Object.freeze({
        id: "skyfire",
        name: "Skyfire",
        description: "Ignite the air itself in a vast double ring of flame.",
        cooldown: 19,
        maxLevel: 10,
      }),
    }),
  }),
  eclipse: Object.freeze({
    id: "eclipse",
    name: "Eclipse",
    description: "A twin-souled adept whose own deeds tip him between radiance and the abyss.",
    color: "#9d8fe0",
    baseHp: 92,
    baseSpeed: 190,
    primary: Object.freeze({
      name: "Twin Veil Bolt",
      cooldown: 0.45,
      damage: 11,
      speed: 640,
      range: 460,
      color: "#cbbcf5",
    }),
    skills: Object.freeze({
      q: Object.freeze({
        id: "rift-of-two-lights",
        name: "Rift of Two Lights",
        description: "A radiant lance — or a fan of frost-dark bolts. Reputation decides.",
        cooldown: 4,
        maxLevel: 20,
      }),
      e: Object.freeze({
        id: "soulguard-surge",
        name: "Soulguard Surge",
        description: "Mend and harden the soul barrier, or vent a ring of deep frost.",
        cooldown: 7,
        maxLevel: 20,
      }),
      f: Object.freeze({
        id: "zenith-and-nadir",
        name: "Zenith and Nadir",
        description: "The full weight of dawn, or the deepest cold of night.",
        cooldown: 17,
        maxLevel: 10,
      }),
    }),
  }),
  moonblade: Object.freeze({
    id: "moonblade",
    name: "Moonblade",
    description: "A dancer of crescent steel who fights at heartbeat range.",
    color: "#cfd8ec",
    baseHp: 96,
    baseSpeed: 208,
    primary: Object.freeze({
      name: "Crescent Cut",
      cooldown: 0.34,
      damage: 9,
      speed: 700,
      range: 210,
      color: "#e8eefc",
    }),
    skills: Object.freeze({
      q: Object.freeze({
        id: "moon-whirl",
        name: "Moon Whirl",
        description: "Spin with blades out, shredding all around.",
        cooldown: 3.6,
        maxLevel: 20,
      }),
      e: Object.freeze({
        id: "lunar-rush",
        name: "Lunar Rush",
        description: "Dash through and cut twice on the way.",
        cooldown: 5.2,
        maxLevel: 20,
      }),
      f: Object.freeze({
        id: "eclipse-waltz",
        name: "Eclipse Waltz",
        description: "Dance through the enemy line in a whirl of crescent light.",
        cooldown: 15,
        maxLevel: 10,
      }),
    }),
  }),
});

export function publicArchetypes() {
  return Object.fromEntries(
    Object.entries(ARCHETYPES).map(([id, archetype]) => [
      id,
      {
        id,
        name: archetype.name,
        description: archetype.description,
        color: archetype.color,
        primary: { name: archetype.primary.name },
        skills: Object.fromEntries(
          SKILL_SLOTS.map((slot) => [
            slot,
            {
              id: skillDefinition(id, slot).id,
              name: skillDefinition(id, slot).name,
              description: skillDefinition(id, slot).description,
              cooldown: skillDefinition(id, slot).cooldown,
              maxLevel: skillDefinition(id, slot).maxLevel,
              unlockLevel: skillDefinition(id, slot).unlockLevel ?? 1,
            },
          ]),
        ),
      },
    ]),
  );
}
