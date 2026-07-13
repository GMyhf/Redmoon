// Deterministic first-party dungeon plan. Runtime state lives in World; this
// module is deliberately pure so layout, scaling, and rewards are easy to
// test and can later move into a dedicated instance worker unchanged.

export const DUNGEON_ID = "relay-vault";
export const DUNGEON_NAME = "深红中继密库";
export const DUNGEON_THEME = "castle";

const FORMATION = Object.freeze([
  Object.freeze({ type: "riftling", x: -360, y: -180, elite: false }),
  Object.freeze({ type: "duskfang", x: -180, y: 160, elite: false }),
  Object.freeze({ type: "ashwing", x: 20, y: -220, elite: true }),
  Object.freeze({ type: "stonehorn", x: 220, y: 150, elite: true }),
  Object.freeze({ type: "voidmaw", x: 390, y: -60, elite: false }),
]);

export function createDungeonPlan({ instanceId, averageLevel, width, height }) {
  if (!instanceId) throw new TypeError("instanceId is required");
  const level = clampInteger(averageLevel, 1, 1000);
  const centerX = Number(width) / 2;
  const centerY = Number(height) / 2;
  const mapId = `dungeon:${instanceId}`;
  const enemies = FORMATION.map((entry, index) => ({
    id: `${instanceId}-wave-${index + 1}`,
    dungeonId: instanceId,
    mapId,
    type: entry.type,
    name: `密库守卫 ${index + 1}`,
    level: Math.max(1, level + index - 2),
    elite: entry.elite,
    x: centerX + entry.x,
    y: centerY + entry.y,
  }));
  enemies.push({
    id: `${instanceId}-boss`,
    dungeonId: instanceId,
    mapId,
    type: "warden",
    name: "密库监察者",
    level: Math.min(1000, level + 5),
    elite: true,
    boss: true,
    maxHp: Math.round((800 + level * 95) * 2.5),
    damage: Math.round(20 + level * 4.2),
    defense: Math.round(20 + level * 1.1),
    xp: Math.round(500 + level * 110),
    x: centerX + 520,
    y: centerY,
  });
  return Object.freeze({
    id: instanceId,
    definitionId: DUNGEON_ID,
    name: DUNGEON_NAME,
    theme: DUNGEON_THEME,
    mapId,
    level,
    spawn: Object.freeze({ x: centerX - 560, y: centerY }),
    enemies: Object.freeze(enemies.map(Object.freeze)),
    reward: Object.freeze({
      xp: Math.round(900 + level * 175),
      gold: Math.round(250 + level * 45),
      dew: 1 + Math.floor(level / 500),
    }),
  });
}

function clampInteger(value, minimum, maximum) {
  const number = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : minimum;
  return Math.min(maximum, Math.max(minimum, number));
}
