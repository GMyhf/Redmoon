// Item generation: every drop, shop good, and boss hoard rolls through
// these functions. They take the world's rng and an id allocator, so the
// World stays the single owner of randomness and item identity while the
// roll tables live in one place.
import {
  ITEM_BASES,
  ITEM_SLOTS,
  RARITIES,
  RELIC_JEWELRY,
  RELIC_WEAPONS,
  SPECIAL_DROPS,
  STAT_KEYS,
} from "./definitions.js";

export const MAX_ITEM_LEVEL = 20;

function roll01(rng) {
  return Math.min(0.999999, Math.max(0, rng()));
}

function pick(rng, list) {
  return list[Math.floor(roll01(rng) * list.length)];
}

function zeroStats() {
  return Object.fromEntries(STAT_KEYS.map((key) => [key, 0]));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

export function rollSpecialDrop(rng, nextId, kind, level) {
  const pool = SPECIAL_DROPS[kind];
  const template = pick(rng, pool.templates);
  const itemLevel = Math.min(MAX_ITEM_LEVEL, Math.max(pool.minLevel, level + 1));
  const bonuses = zeroStats();
  bonuses[template.stat] = kind === "sunset" ? 30 + itemLevel * 3 : 16 + itemLevel * 2;
  return {
    id: nextId(),
    slot: template.slot,
    rarity: pool.rarity,
    dropClass: kind,
    tier: pool.tier,
    level: itemLevel,
    name: template.name,
    bonuses,
    ...(template.damage ? { damageBonus: template.damage } : {}),
    ...(template.hp ? { hpBonus: template.hp + itemLevel * 4 } : {}),
    ...(template.speed ? { speedBonus: template.speed } : {}),
    ...(template.defense ? { defenseBonus: template.defense } : {}),
  };
}

export function rollPotion(nextId, level) {
  return {
    id: nextId(),
    slot: "potion",
    rarity: "common",
    tier: 1,
    level: 1,
    name: "Mending Vial",
    bonuses: zeroStats(),
    heal: 30 + level * 8,
  };
}

export function rollItem(rng, nextId, level, minTier = 1) {
  const slot = pick(rng, ITEM_SLOTS);
  const pool = RARITIES.filter((entry) => entry.tier >= minTier);
  const weights = pool.map((rarity) => rarity.baseWeight + rarity.levelWeight * (level - 1));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = roll01(rng) * totalWeight;
  let rarity = pool[0];
  for (let index = 0; index < pool.length; index += 1) {
    roll -= weights[index];
    if (roll < 0) {
      rarity = pool[index];
      break;
    }
  }

  const name = pick(rng, ITEM_BASES[slot]);
  const itemLevel = Math.min(MAX_ITEM_LEVEL, Math.max(1, level + rarity.tier - 1));
  const bonuses = zeroStats();
  // Stat budget grows with item level, so late gear meaningfully raises
  // 力量/敏捷/精神/体魄 alongside its slot bonus.
  let budget = rarity.tier * 2 + itemLevel;
  while (budget > 0) {
    bonuses[pick(rng, STAT_KEYS)] += 1;
    budget -= 1;
  }

  const item = {
    id: nextId(),
    slot,
    rarity: rarity.id,
    tier: rarity.tier,
    level: itemLevel,
    name,
    bonuses,
  };
  if (slot === "weapon") item.damageBonus = round(rarity.tier * 0.05 + itemLevel * 0.004);
  if (slot === "necklace") item.damageBonus = round(rarity.tier * 0.025 + itemLevel * 0.002);
  if (slot === "ring") {
    item.damageBonus = round(rarity.tier * 0.015 + itemLevel * 0.0015);
    item.hpBonus = Math.round(rarity.tier * 3 + itemLevel * 1.5);
  }
  if (slot === "shield") {
    item.defenseBonus = round(rarity.tier * 0.02 + itemLevel * 0.002);
    item.hpBonus = Math.round(rarity.tier * 5 + itemLevel * 2);
  }
  if (slot === "chest") item.hpBonus = Math.round(rarity.tier * 10 + itemLevel * 4);
  if (slot === "helm") item.hpBonus = Math.round(rarity.tier * 6 + itemLevel * 2.5);
  if (slot === "belt") item.hpBonus = Math.round(rarity.tier * 4 + itemLevel * 2);
  if (slot === "gloves") item.damageBonus = round(rarity.tier * 0.02 + itemLevel * 0.002);
  if (slot === "pants") item.hpBonus = Math.round(rarity.tier * 5 + itemLevel * 3);
  if (slot === "boots") item.speedBonus = Math.round(rarity.tier * 5 + itemLevel);
  return item;
}

// Relic drops: legendary weapons whose strike scales with the wearer's
// level and attributes, and jewellery with massive stat bundles.
export function rollRelic(rng, nextId, bossLevel) {
  const wantJewelry = rng() < 0.3;
  if (wantJewelry) {
    const template = pick(rng, RELIC_JEWELRY);
    return {
      id: nextId(),
      slot: template.slot,
      rarity: "relic",
      tier: 5,
      level: Math.max(10, bossLevel),
      name: template.name,
      bonuses: { ...zeroStats(), ...(template.bonuses ?? {}) },
      defenseBonus: template.defense,
      ...(template.attack ? { attackFormula: { ...template.attack } } : {}),
    };
  }
  const template = pick(rng, RELIC_WEAPONS);
  return {
    id: nextId(),
    slot: "weapon",
    rarity: "relic",
    tier: 5,
    level: Math.max(10, bossLevel),
    name: template.name,
    bonuses: zeroStats(),
    defenseBonus: template.defense,
    attackFormula: {
      stat: template.stat,
      divisor: template.divisor,
      ...(template.maxDivisor ? { maxDivisor: template.maxDivisor } : {}),
      ...(template.multiplier ? { multiplier: template.multiplier } : {}),
    },
  };
}
