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

// Species ladder: two mob levels per band; later species are bigger,
// tougher, and worth far more experience.
export const MOB_TYPES = Object.freeze([
  Object.freeze({ type: "riftling", name: "Riftling", hpMul: 1, xpMul: 1, size: 0, speedMul: 1 }),
  Object.freeze({ type: "duskfang", name: "Duskfang", hpMul: 1.1, xpMul: 1.1, size: 0, speedMul: 1.05 }),
  Object.freeze({ type: "ashwing", name: "Ashwing", hpMul: 1.15, xpMul: 1.25, size: 0, speedMul: 1.1 }),
  Object.freeze({ type: "stonehorn", name: "Stonehorn", hpMul: 1.5, xpMul: 1.6, size: 6, speedMul: 0.85 }),
  Object.freeze({ type: "scraphulk", name: "Scraphulk", hpMul: 2, xpMul: 2.3, size: 10, speedMul: 0.7 }),
  Object.freeze({ type: "voidmaw", name: "Voidmaw", hpMul: 2.6, xpMul: 3.2, size: 12, speedMul: 0.8 }),
]);

export const ITEM_SLOTS = Object.freeze([
  "weapon",
  "armor",
  "helm",
  "necklace",
  "ring",
  "boots",
  "charm",
]);

export const RARITIES = Object.freeze([
  Object.freeze({ id: "common", tier: 1, baseWeight: 62, levelWeight: 0 }),
  Object.freeze({ id: "fine", tier: 2, baseWeight: 26, levelWeight: 4 }),
  Object.freeze({ id: "rare", tier: 3, baseWeight: 9, levelWeight: 3 }),
  Object.freeze({ id: "epic", tier: 4, baseWeight: 3, levelWeight: 2 }),
]);

export const ITEM_BASES = Object.freeze({
  weapon: Object.freeze(["Pulse Edge", "Starrift Bow", "Resonant Staff"]),
  armor: Object.freeze(["Weave Plate", "Phase Guard", "Moonthread Robe"]),
  helm: Object.freeze(["Ridge Helm", "Duskwatch Hood", "Lunar Circlet"]),
  necklace: Object.freeze(["Signal Torque", "Emberbead Chain", "Tidebound Pendant"]),
  ring: Object.freeze(["Orbit Band", "Rift Seal", "Dawnspark Ring"]),
  boots: Object.freeze(["Skimmer Boots", "Duneswift Greaves", "Nightpath Treads"]),
  charm: Object.freeze(["Crimson Locket", "Echo Halo", "Stardust Sigil"]),
});

export const INVENTORY_LIMIT = 24;
export const DROP_TTL = 60;
export const DROP_PICKUP_RADIUS = 26;

export const STAT_KEYS = Object.freeze([
  "power",
  "agility",
  "spirit",
  "vitality",
]);

export const SKILL_SLOTS = Object.freeze(["q", "e", "f"]);

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
        maxLevel: 10,
      }),
      e: Object.freeze({
        id: "resonant-ring",
        name: "Resonant Ring",
        description: "Release a ring of short-range force projectiles.",
        cooldown: 7,
        maxLevel: 10,
      }),
      f: Object.freeze({
        id: "skybreaker",
        name: "Skybreaker",
        description: "Bring the blade down hard enough to crack the field itself.",
        cooldown: 16,
        maxLevel: 5,
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
        maxLevel: 10,
      }),
      e: Object.freeze({
        id: "orbit-bloom",
        name: "Orbit Bloom",
        description: "Cast stellar bolts in every direction.",
        cooldown: 7.5,
        maxLevel: 10,
      }),
      f: Object.freeze({
        id: "startide",
        name: "Startide",
        description: "Release a colossal orb of starfire that rolls through everything.",
        cooldown: 18,
        maxLevel: 5,
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
        maxLevel: 10,
      }),
      e: Object.freeze({
        id: "phase-vault",
        name: "Phase Vault",
        description: "Vault forward and fire a wake of energy.",
        cooldown: 6,
        maxLevel: 10,
      }),
      f: Object.freeze({
        id: "storm-of-edges",
        name: "Storm of Edges",
        description: "Dash through the fray inside a storm of spinning blades.",
        cooldown: 15,
        maxLevel: 5,
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
        maxLevel: 10,
      }),
      e: Object.freeze({
        id: "iron-charge",
        name: "Iron Charge",
        description: "Charge forward behind a crushing ram wave.",
        cooldown: 6.5,
        maxLevel: 10,
      }),
      f: Object.freeze({
        id: "mountainfall",
        name: "Mountainfall",
        description: "Shatter the ground in a devastating full-circle quake.",
        cooldown: 20,
        maxLevel: 5,
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
        maxLevel: 10,
      }),
      e: Object.freeze({
        id: "disengage-volley",
        name: "Disengage Volley",
        description: "Leap back while loosing a spread of bolts.",
        cooldown: 6,
        maxLevel: 10,
      }),
      f: Object.freeze({
        id: "meteor-volley",
        name: "Meteor Volley",
        description: "Loose five piercing lances that cross the entire field.",
        cooldown: 17,
        maxLevel: 5,
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
        maxLevel: 10,
      }),
      e: Object.freeze({
        id: "ember-fan",
        name: "Ember Fan",
        description: "Sweep a wide fan of embers forward.",
        cooldown: 4.4,
        maxLevel: 10,
      }),
      f: Object.freeze({
        id: "skyfire",
        name: "Skyfire",
        description: "Ignite the air itself in a vast double ring of flame.",
        cooldown: 19,
        maxLevel: 5,
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
        maxLevel: 10,
      }),
      e: Object.freeze({
        id: "soulguard-surge",
        name: "Soulguard Surge",
        description: "Mend and harden the soul barrier, or vent a ring of deep frost.",
        cooldown: 7,
        maxLevel: 10,
      }),
      f: Object.freeze({
        id: "zenith-and-nadir",
        name: "Zenith and Nadir",
        description: "The full weight of dawn, or the deepest cold of night.",
        cooldown: 17,
        maxLevel: 5,
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
        maxLevel: 10,
      }),
      e: Object.freeze({
        id: "lunar-rush",
        name: "Lunar Rush",
        description: "Dash through and cut twice on the way.",
        cooldown: 5.2,
        maxLevel: 10,
      }),
      f: Object.freeze({
        id: "eclipse-waltz",
        name: "Eclipse Waltz",
        description: "Dance through the enemy line in a whirl of crescent light.",
        cooldown: 15,
        maxLevel: 5,
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
              id: archetype.skills[slot].id,
              name: archetype.skills[slot].name,
              description: archetype.skills[slot].description,
              cooldown: archetype.skills[slot].cooldown,
              maxLevel: archetype.skills[slot].maxLevel,
            },
          ]),
        ),
      },
    ]),
  );
}
