export const PROTOCOL_VERSION = 1;
export const TICK_RATE = 20;
export const SNAPSHOT_RATE = 10;

export const REBIRTH_LEVEL = 10;
export const REBIRTH_STAT_BONUS = 6;
export const REBIRTH_HP_BONUS = 0.12;
export const REBIRTH_DAMAGE_BONUS = 0.15;

export const MOB_TYPES = Object.freeze([
  Object.freeze({ type: "riftling", name: "Riftling" }),
  Object.freeze({ type: "duskfang", name: "Duskfang" }),
  Object.freeze({ type: "ashwing", name: "Ashwing" }),
]);

export const STAT_KEYS = Object.freeze([
  "power",
  "agility",
  "spirit",
  "vitality",
]);

export const SKILL_SLOTS = Object.freeze(["q", "e"]);

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
        maxLevel: 5,
      }),
      e: Object.freeze({
        id: "resonant-ring",
        name: "Resonant Ring",
        description: "Release a ring of short-range force projectiles.",
        cooldown: 7,
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
        maxLevel: 5,
      }),
      e: Object.freeze({
        id: "orbit-bloom",
        name: "Orbit Bloom",
        description: "Cast stellar bolts in every direction.",
        cooldown: 7.5,
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
        maxLevel: 5,
      }),
      e: Object.freeze({
        id: "phase-vault",
        name: "Phase Vault",
        description: "Vault forward and fire a wake of energy.",
        cooldown: 6,
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
