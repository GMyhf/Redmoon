// v2: join accepts a session token, the server answers with a `session`
// message, and protected names reject NAME_IN_USE / INVALID_TOKEN.
// v3: items carry a `refine` stage and players carry a `protections` count;
// the `refine` command spends will/gold to push gear up the stage ladder.
// v4: `honor` moves onto every player record, not just the recipient's own.
// Standing is meant to be read off the people around you — that is what its
// tiers are for — and the battle zone is where it starts to matter.
// v5: armies carry a camp, and it rides the public record too. In the battle
// zone a camp decides who may be shot at, so it has to be legible before the
// shot rather than after it.
export const PROTOCOL_VERSION = 5;
export const TICK_RATE = 20;
export const SNAPSHOT_RATE = 10;
export const MAX_ITEM_SEQUENCE = 1_000_000_000_000;
export const FRIEND_LIMIT = 32;

// Soul Barrier: damage is paid from MP before HP. `absorb` is the fraction
// of incoming damage redirected to MP; `mpPerHp` is the conversion price.
export const SOUL_BARRIER = Object.freeze({ absorb: 0.6, mpPerHp: 1.4 });
export const REPUTATION_LIMIT = 1000;

export const LEVEL_CAP = 1000;

// Rebirth is the endgame, not an early-game shortcut: it unlocks only at the
// level cap, where XP no longer accrues and the only way forward is to reset.
// The bonuses below are permanent and stack without limit — that is affordable
// precisely because each cycle costs a full 1..LEVEL_CAP climb.
export const REBIRTH_LEVEL = LEVEL_CAP;
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

// ---- Honour ----------------------------------------------------------
// Standing earned by hunting what fights back, and a permission rather than a
// currency: it is never spent, only met. Gates read it, nothing deducts it, so
// it asks a player to have hunted — not to grind a second resource.
//
// Elites and bosses are the only source today. Open-world PvP (the next step)
// is what will push it negative, which is also when the negative tiers below
// start to mean anything.
export const HONOR_LIMIT = 1000;
export const HONOR_PER_ELITE = 1;
export const HONOR_PER_BOSS = 5;

// Thresholds double as display tiers, so a gate can always be explained to a
// player in the same words the HUD uses.
export const HONOR_TIERS = Object.freeze([
  Object.freeze({ at: 800, label: "传颂" }),
  Object.freeze({ at: 600, label: "威名" }),
  Object.freeze({ at: 400, label: "信重" }),
  Object.freeze({ at: 200, label: "闻名" }),
  Object.freeze({ at: 0, label: "无名" }),
]);

// Refinement past +2 asks for standing. The first two rungs stay open to
// everyone: a fresh drop should always be improvable.
export const REFINE_HONOR_GATE = Object.freeze([0, 0, 200, 400]);

// ---- Armies ----------------------------------------------------------
// A persistent company with a name, a commander and ranks. Honour is its
// second reader, exactly as in the reference: "To create army you must be at
// level %u and honor %u." Standing is checked, never spent — founding a
// company asks that you have hunted, not that you pay for it.
//
// An army is derived from the accounts that belong to it rather than kept in
// its own store: every account record is already a free-form JSON blob, so
// this adds no table, no migration and no envelope change. The cost is that
// looking one up scans accounts, which is fine at this scale and would not be
// at a much larger one.
// The two sides the reference splits its world into: `tblArmyList1` carries a
// `Camp` column, and the maps hold two mirrored hideout complexes (a lobby and
// twenty floors each) — one per camp. A camp belongs to an army, not a person.
//
// It is chosen once and never changed. A camp that could be switched would be
// an escape button: hunted in the battle zone, an army would simply defect to
// whoever was chasing it and become unshootable. Defection is a real design
// question, and it belongs with sieges, not here.
export const CAMPS = Object.freeze([
  Object.freeze({ id: "freehold", label: "自由邦", color: "#5aa9e6" }),
  Object.freeze({ id: "covenant", label: "契约同盟", color: "#e0596d" }),
]);

export const ARMY_LEVEL = 30;
export const ARMY_HONOR = 100;
export const ARMY_LIMIT = 40;
export const ARMY_NAME_MAX = 20;
// Commander is singular; lieutenants may recruit and dismiss members below
// them; members do neither. Order matters — it is the authority ladder.
export const ARMY_RANKS = Object.freeze(["commander", "lieutenant", "member"]);
export const ARMY_INVITE_WINDOW = 60;

// ---- Army halls ------------------------------------------------------
// Each camp keeps a hideout of numbered floors, mirroring the reference's two
// twenty-storey complexes. An army leases one floor; a floor holds one army,
// and that scarcity is what a siege will later be fought over.
//
// A lease is rent, not property: "The army hall rent hall is due %d-%d-%d.
// You must pay %u." It is a standing gold drain, and what it buys is a footing
// — an army with a hall respawns its dead at its camp's staging ground inside
// the battle zone instead of walking back from town.
export const ARMY_HALL_FLOORS = 20;
export const ARMY_HALL_RENT = 4000;
export const ARMY_HALL_PERIOD = 1800;
// Where each camp's fallen return. The battle zone sits on the full world
// plane (only duel arenas carry their own bounds), so these are opposite ends
// of it — far enough apart that neither side spawns on the other's guns.
export const CAMP_STAGING = Object.freeze({
  freehold: Object.freeze({ x: 700, y: 700 }),
  covenant: Object.freeze({ x: 4100, y: 2000 }),
});
// The HQ is a separate siege objective from the rented floors. A commander
// must hold the enemy HQ for the assault window; defenders can contest it in
// the battle zone, and only an uncontested window evicts one lease.
export const CAMP_HQ = Object.freeze({
  freehold: Object.freeze({ x: 520, y: 520 }),
  covenant: Object.freeze({ x: 4280, y: 2180 }),
});
export const ARMY_SIEGE_RANGE = 220;
export const ARMY_SIEGE_DURATION = 30;
export const ARMY_SIEGE_COOLDOWN = 60;

// ---- Battle zone -----------------------------------------------------
// The one map where anyone can attack anyone. It is opted into by walking
// through a gate, and it is a hunting ground as much as an arena: honour comes
// from the elites in it, and honour is what other players can take from you
// there. Source and risk in the same place.
//
// Only gold and honour are at stake. Gear is not: the battle zone never drops
// equipment or experience. Mail and the used-goods market are separate town
// delivery/economy flows and do not change that battle-zone rule. The town bank
// protects gold only; it does not recover equipment.
export const BATTLE_ZONE_MAP = "battlezone";
export const BATTLE_GOLD_SHARE = 0.1;

// The killer takes standing, but never more than the loser actually has. An
// alt holds none, so farming one yields nothing; two friends trading kills
// move the same points back and forth and net zero. The only way up is to beat
// someone who has standing to lose.
export const BATTLE_HONOR_TAKE = 10;

// ---- Duels -----------------------------------------------------------
// The first place a player's attack can land on another player. Consent is
// explicit, the arena is its own map, and nothing is at stake: no experience,
// no gold, no drops, no honour. It exists to prove one link — that damage can
// route player-to-player under server authority — before open-world PvP is
// built on top of it.
export const DUEL_LIMIT = 16;
export const DUEL_INVITE_WINDOW = 60;
// A draw beats a stalemate: two cautious duellists must not hold an arena open.
export const DUEL_DURATION = 180;
export const DUEL_ARENA = Object.freeze({ width: 1200, height: 900 });

// ---- Gear refinement -------------------------------------------------
// The long-term sink the economy was missing: gold and will flow out here.
// Chance to advance FROM the indexed stage, so index 0 is the 0 -> 1 attempt
// and the array length is the number of rungs on the ladder.
export const REFINE_CHANCES = Object.freeze([0.9, 0.7, 0.5, 0.3]);
export const REFINE_MAX_STAGE = REFINE_CHANCES.length;

// Each stage scales an item's stored bonuses. Rolled numbers are never
// re-rolled by refining — that would turn the forge into a stat re-roller —
// they are only scaled by this deterministic multiplier.
export const REFINE_STEP = 0.15;

// Rare and above. Sunset alone (tier 7, 0.9% drop, one on the ground at a
// time) would lock the whole system behind content almost nobody reaches.
export const REFINE_MIN_TIER = 3;

// An attempt costs will (earned from kills) and gold, both scaled by the
// item's level and by how far up the ladder it already is.
export const REFINE_WILL_PER_LEVEL = 4;
export const REFINE_GOLD_PER_LEVEL = 6;

// Currencies: gold drops from every kill and buys basics; revival dew is
// rare, revives you on the spot, and pays the black marketeer.
export const GOLD_PER_MOB_LEVEL = 2;
export const DEW_DROP_CHANCE = 0.02;
export const PARTY_LIMIT = 4;
export const PARTY_XP_SHARE = 0.6;
export const PARTY_XP_RANGE = 1200;
export const MAIL_LIMIT = 100;
export const MAIL_ITEM_LIMIT = 20;
export const MARKET_LISTING_LIMIT = 20;
export const MARKET_LISTING_FEE = 100;
export const MARKET_TAX = 0.05;
export const MARKET_LISTING_DURATION = 7 * 24 * 60 * 60;

// Town shopkeepers (original characters), placed relative to town centre.
export const SHOPS = Object.freeze([
  Object.freeze({
    id: "grocer",
    name: "杂货商·芦婆",
    dx: -310,
    dy: 95,
    goods: Object.freeze([
      // Potions scale with the buyer's level (price and healing), so they
      // stay relevant across the whole 1-1000 ladder.
      Object.freeze({ key: "potion-s", label: "小修复药剂", gold: 30, heal: 60, goldPerLevel: 2, healPerLevel: 7 }),
      Object.freeze({ key: "potion-l", label: "大修复药剂", gold: 90, heal: 200, goldPerLevel: 5, healPerLevel: 22 }),
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
      // Failure insurance costs the scarce currency on purpose: bought with
      // gold it would be a permanent no-brainer and refining would stop
      // being a gamble at all.
      Object.freeze({ key: "ward-sigil", label: "护炉印（精炼失败不掉阶）", dew: 1, protection: 1 }),
    ]),
  }),
  Object.freeze({
    id: "bank",
    name: "灰港金库·守门人",
    dx: 0,
    dy: 315,
    goods: Object.freeze([]),
  }),
  Object.freeze({
    id: "market",
    name: "中古商店·回收处",
    dx: 0,
    dy: 450,
    goods: Object.freeze([]),
  }),
]);

// The relay's eight-step quest chain; the final hunt repeats forever.
// Rewards scale with each step's content level on the 1-1000 ladder
// (roughly one level's worth of XP at that stage), so the chain stays
// meaningful instead of fossilizing at early-game numbers.
export const QUEST_CHAIN = Object.freeze([
  Object.freeze({ id: "chain-1", title: "稳定边缘区", description: "清除裂隙体", type: "killType", param: "riftling", target: 6, rewardXp: 400, rewardGold: 150, rewardDew: 0 }),
  Object.freeze({ id: "chain-2", title: "暮色狩猎", description: "讨伐暮牙兽", type: "killType", param: "duskfang", target: 8, rewardXp: 2600, rewardGold: 500, rewardDew: 1 }),
  Object.freeze({ id: "chain-3", title: "精英试炼", description: "猎杀任意精英怪", type: "killElite", param: null, target: 3, rewardXp: 9000, rewardGold: 1200, rewardDew: 1 }),
  Object.freeze({ id: "chain-4", title: "草原之主", description: "击败棘颚兽", type: "killBoss", param: "thornmaw", target: 1, rewardXp: 90000, rewardGold: 9000, rewardDew: 2 }),
  Object.freeze({ id: "chain-5", title: "碎岩行动", description: "讨伐岩角兽", type: "killType", param: "stonehorn", target: 10, rewardXp: 130000, rewardGold: 12000, rewardDew: 2 }),
  Object.freeze({ id: "chain-6", title: "沙海霸主", description: "击败沙喉", type: "killBoss", param: "sandmaw", target: 1, rewardXp: 210000, rewardGold: 18000, rewardDew: 3 }),
  Object.freeze({ id: "chain-7", title: "虚空回响", description: "讨伐虚空吞喉", type: "killType", param: "voidmaw", target: 8, rewardXp: 620000, rewardGold: 45000, rewardDew: 3 }),
  Object.freeze({ id: "chain-8", title: "深红的终局", description: "击败深红督军（可重复）", type: "killBoss", param: "warden", target: 1, rewardXp: 950000, rewardGold: 90000, rewardDew: 5 }),
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

// Server-wide special drop pools inspired by Redmoon unique/sunset drops.
// Pool limits count items waiting on the ground; pickup or expiry frees a slot.
export const SPECIAL_DROPS = Object.freeze({
  uniq: Object.freeze({
    rarity: "unique",
    tier: 6,
    maxActive: 2,
    minLevel: 5,
    chance: 0.028,
    templates: Object.freeze([
      Object.freeze({ name: "裂界·逐风刃", slot: "weapon", stat: "agility", damage: 0.18, speed: 22 }),
      Object.freeze({ name: "赤潮·守望盾", slot: "shield", stat: "vitality", hp: 180, defense: 0.12 }),
      Object.freeze({ name: "星痕·永燃项链", slot: "necklace", stat: "spirit", damage: 0.14, hp: 90 }),
      Object.freeze({ name: "暮影·猎行靴", slot: "boots", stat: "agility", speed: 38, hp: 60 }),
    ]),
  }),
  sunset: Object.freeze({
    rarity: "sunset",
    tier: 7,
    maxActive: 1,
    minLevel: 12,
    chance: 0.009,
    templates: Object.freeze([
      Object.freeze({ name: "日蚀终焉·天穹刃", slot: "weapon", stat: "power", damage: 0.34 }),
      Object.freeze({ name: "日蚀终焉·无光甲", slot: "chest", stat: "vitality", hp: 420, defense: 0.2 }),
      Object.freeze({ name: "日蚀终焉·双星戒", slot: "ring", stat: "spirit", damage: 0.24, hp: 220 }),
    ]),
  }),
});

export const INVENTORY_LIMIT = 240;
export const DROP_TTL = 60;
export const DROP_PICKUP_RADIUS = 26;
// Drops within this range drift toward the nearest player on their own.
export const DROP_MAGNET_RADIUS = 180;
export const DROP_MAGNET_SPEED = 320;

// Themed districts layered over the base terrain. Positions and radii are
// fractions of the map size; mobs inside spawn within the level range.
export const ZONES = Object.freeze([
  // Level bands ladder the nine hunting grounds across the full 1-1000
  // journey; the town map keeps its own low-level distance curve.
  Object.freeze({ id: "residential", theme: "residential", x: 0.4, y: 0.42, rx: 0.09, ry: 0.1, minLevel: 1, maxLevel: 25 }),
  Object.freeze({ id: "downtown", theme: "downtown", x: 0.615, y: 0.44, rx: 0.09, ry: 0.1, minLevel: 15, maxLevel: 45 }),
  Object.freeze({ id: "backhill", theme: "mountain", x: 0.5, y: 0.14, rx: 0.14, ry: 0.12, minLevel: 40, maxLevel: 110 }),
  Object.freeze({ id: "scrapyard", theme: "scrapyard", x: 0.87, y: 0.5, rx: 0.12, ry: 0.14, minLevel: 90, maxLevel: 210 }),
  Object.freeze({ id: "desert", theme: "desert", x: 0.26, y: 0.78, rx: 0.17, ry: 0.17, minLevel: 180, maxLevel: 360 }),
  Object.freeze({ id: "snowmountain", theme: "snow", x: 0.19, y: 0.19, rx: 0.16, ry: 0.16, minLevel: 330, maxLevel: 520 }),
  Object.freeze({ id: "castle", theme: "castle", x: 0.09, y: 0.52, rx: 0.085, ry: 0.11, minLevel: 480, maxLevel: 680 }),
  Object.freeze({ id: "starship", theme: "spaceport", x: 0.445, y: 0.85, rx: 0.14, ry: 0.12, minLevel: 650, maxLevel: 860 }),
  Object.freeze({ id: "skycity", theme: "skycity", x: 0.875, y: 0.14, rx: 0.135, ry: 0.13, minLevel: 820, maxLevel: 1000 }),
  // Contested ground: a wide late band, because honour is what veterans carry.
  Object.freeze({ id: "battlezone", theme: "battle", x: 0.72, y: 0.78, rx: 0.12, ry: 0.12, minLevel: 300, maxLevel: 1000 }),
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
  Object.freeze({ id: "battlezone", x: 0.72, y: 0.78 }),
]);

// One boss per hunting ground, in rising order of level and experience.
// Boss levels track the 1-1000 map ladder and stay monotonic along the
// quest chain (thornmaw → sandmaw → warden). HP ≈ (26+16×level)×7.5,
// damage ≈ (5+2.5×level)×0.8, XP ≈ 400×level.
export const BOSSES = Object.freeze([
  Object.freeze({ id: "boss-cragfather", type: "cragfather", name: "Cragfather", level: 130, maxHp: 16000, damage: 270, speed: 80, xp: 52000, radius: 27, x: 0.5, y: 0.12 }),
  Object.freeze({ id: "boss-rustking", type: "rustking", name: "Rustking", level: 240, maxHp: 29000, damage: 490, speed: 70, xp: 96000, radius: 30, x: 0.9, y: 0.5 }),
  Object.freeze({ id: "boss-thornmaw", type: "thornmaw", name: "Thornmaw", level: 260, maxHp: 32000, damage: 530, speed: 96, xp: 104000, radius: 24, x: 0.2, y: 0.68 }),
  Object.freeze({ id: "boss-sandmaw", type: "sandmaw", name: "Sandmaw", level: 380, maxHp: 46000, damage: 770, speed: 84, xp: 152000, radius: 28, x: 0.31, y: 0.86 }),
  Object.freeze({ id: "boss-rimehorn", type: "rimehorn", name: "Rimehorn", level: 550, maxHp: 66000, damage: 1110, speed: 78, xp: 220000, radius: 29, x: 0.19, y: 0.19 }),
  Object.freeze({ id: "boss-gravemarch", type: "gravemarch", name: "Gravemarch", level: 700, maxHp: 84000, damage: 1400, speed: 74, xp: 280000, radius: 30, x: 0.09, y: 0.52 }),
  Object.freeze({ id: "boss-hullwraith", type: "hullwraith", name: "Hullwraith", level: 870, maxHp: 105000, damage: 1750, speed: 100, xp: 348000, radius: 28, x: 0.42, y: 0.86 }),
  Object.freeze({ id: "boss-warden", type: "warden", name: "Crimson Warden", level: 1000, maxHp: 120000, damage: 2000, speed: 92, xp: 400000, radius: 30, x: 0.9, y: 0.14 }),
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

// Starting attribute spread per archetype. Shipped to clients through
// publicArchetypes() so the roster UI never hardcodes these numbers.
export const BASE_STATS = Object.freeze({
  vanguard: Object.freeze({ power: 6, agility: 3, spirit: 2, vitality: 7 }),
  channeler: Object.freeze({ power: 2, agility: 4, spirit: 7, vitality: 4 }),
  strider: Object.freeze({ power: 4, agility: 7, spirit: 3, vitality: 4 }),
  bulwark: Object.freeze({ power: 7, agility: 2, spirit: 2, vitality: 8 }),
  longshot: Object.freeze({ power: 4, agility: 8, spirit: 3, vitality: 3 }),
  pyre: Object.freeze({ power: 2, agility: 3, spirit: 8, vitality: 5 }),
  moonblade: Object.freeze({ power: 5, agility: 7, spirit: 3, vitality: 3 }),
  eclipse: Object.freeze({ power: 3, agility: 4, spirit: 7, vitality: 4 }),
});

// R and C keep their roles across the roster — R is the heavy committed
// strike, C repositions and releases a ring — but each archetype expresses
// them in its own shape and, crucially, scales them off the stat it actually
// invests in (see ALLOC_WEIGHTS). Behaviors live in SKILL_BEHAVIORS below.
const EXTRA_SKILLS = Object.freeze({
  vanguard: Object.freeze({
    r: Object.freeze({ name: "Line Cleaver", description: "Step into the line and break it open with a wide cleave." }),
    c: Object.freeze({ name: "Crimson Spin", description: "Spin crimson steel into a tight ring of shrapnel." }),
  }),
  channeler: Object.freeze({
    r: Object.freeze({ name: "Starfall Core", description: "Drop a slow, heavy star core that punches through a line." }),
    c: Object.freeze({ name: "Tidal Blink", description: "Blink with the tide and leave a wave ring behind." }),
  }),
  strider: Object.freeze({
    r: Object.freeze({ name: "Windchase Volley", description: "Chain wind-fast darts along a narrow lane." }),
    c: Object.freeze({ name: "Afterimage Edge", description: "Slip back behind an afterimage as the blades fan out." }),
  }),
  bulwark: Object.freeze({
    r: Object.freeze({ name: "Mountain Slam", description: "Slam the wall forward; short reach, mountain weight." }),
    c: Object.freeze({ name: "Iron Vigil", description: "Hold the ground and throw a wide iron ring — no retreat." }),
  }),
  longshot: Object.freeze({
    r: Object.freeze({ name: "Falcon Mark", description: "Mark the target and drive one shot through the column." }),
    c: Object.freeze({ name: "Refracted Rain", description: "Give ground and scatter refracted arrows all around." }),
  }),
  pyre: Object.freeze({
    r: Object.freeze({ name: "Scorch Pillar", description: "Raise a slow pillar of fire on scorched ground." }),
    c: Object.freeze({ name: "Flamewalk", description: "Pass through as flame and leave the burn behind." }),
  }),
  eclipse: Object.freeze({
    r: Object.freeze({ name: "Twilight Verdict", description: "Pass twilight judgement through everything in the lane." }),
    c: Object.freeze({ name: "Twin Soul Turn", description: "Step aside and turn twin souls in two staggered rings." }),
  }),
  moonblade: Object.freeze({
    r: Object.freeze({ name: "Silver Cross", description: "Cross two silver arcs through everything at close range." }),
    c: Object.freeze({ name: "Mirrorbloom Dance", description: "Dance out and scatter mirrored petals in a dense ring." }),
  }),
});

// Declarative skill behaviors, interpreted by World._castBehavior. Every
// non-eclipse skill is a sequence of four primitives:
//   dash  — move the caster: distance [base, perLevel]; back: reverse aim
//   fan   — one projectile per angle (radians relative to aim)
//   burst — a full radial ring: count [base, perLevel]
// Projectile steps share: damage [base, perLevel, [stats...], statMultiplier]
// (damage = base + perLevel×level + Σstat × multiplier), speed, range
// [base, perLevel], radius, and optional pierce [base, perTwoLevels]
// (pierce = base + ⌊level/2⌋ × perTwoLevels). Eclipse q/e/f branch on
// reputation and stay hand-written in World._useEclipseSkill.
export const SKILL_BEHAVIORS = Object.freeze({
  // Fallback only. Every shipped archetype overrides r and c below; these stay
  // as the safety net for an archetype added without its own pair, and are
  // deliberately stat-neutral rather than favouring one build.
  "shared:r": [
    { act: "fan", angles: [-0.26, -0.13, 0, 0.13, 0.26], damage: [18, 7, ["power", "spirit"], 0.9], speed: 690, range: [470, 0], radius: 8 },
  ],
  "shared:c": [
    { act: "dash", distance: [90, 8] },
    { act: "burst", count: [8, 0], damage: [12, 5, ["agility"], 1.2], speed: 500, range: [170, 9], radius: 8 },
  ],
  // Line Cleaver（裂阵重斩）— walk into the line, wide power cleave at short reach.
  "vanguard:r": [
    { act: "dash", distance: [44, 4] },
    { act: "fan", angles: [-0.34, -0.17, 0, 0.17, 0.34], damage: [22, 8, ["power"], 1.6], speed: 600, range: [300, 10], radius: 13 },
  ],
  // Crimson Spin（赤钢回旋）— a short step and a tight ring; the durable class does not flee.
  "vanguard:c": [
    { act: "dash", distance: [58, 5] },
    { act: "burst", count: [10, 1], damage: [16, 6, ["power"], 1.5], speed: 460, range: [190, 10], radius: 12 },
  ],
  // Starfall Core（星核坠落）— one slow heavy core that keeps going through a line.
  "channeler:r": [
    { act: "fan", angles: [0], damage: [34, 11, ["spirit"], 2.1], speed: 420, range: [560, 10], radius: 20, pierce: [3, 1] },
  ],
  // Tidal Blink（潮汐跃迁）— the long blink of the roster's ranged caster.
  "channeler:c": [
    { act: "dash", distance: [124, 10] },
    { act: "burst", count: [10, 1], damage: [14, 5, ["spirit"], 1.3], speed: 520, range: [220, 12], radius: 9 },
  ],
  // Windchase Volley（追风连星）— narrow, fastest projectiles in the game, piercing.
  "strider:r": [
    { act: "fan", angles: [-0.08, 0, 0.08], damage: [20, 7, ["agility"], 1.5], speed: 900, range: [600, 0], radius: 6, pierce: [2, 1] },
  ],
  // Afterimage Edge（残影回刃）— disengage backwards, blades cover the retreat.
  "strider:c": [
    { act: "dash", distance: [140, 12], back: true },
    { act: "burst", count: [9, 1], damage: [15, 5, ["agility"], 1.35], speed: 560, range: [200, 10], radius: 8 },
  ],
  // Mountain Slam（震岳壁击）— shortest reach, heaviest single arc.
  "bulwark:r": [
    { act: "fan", angles: [-0.4, -0.2, 0, 0.2, 0.4], damage: [24, 9, ["power"], 1.7], speed: 400, range: [200, 10], radius: 16 },
  ],
  // Iron Vigil（守望铁环）— the one C with no dash at all: the tank trades the escape for
  // the widest, densest ring on the roster. Holding ground is the fantasy.
  "bulwark:c": [
    { act: "burst", count: [14, 1], damage: [15, 6, ["power"], 1.4], speed: 420, range: [175, 11], radius: 12 },
  ],
  // Falcon Mark（猎隼标记）— the sniper's R: one shot, longest reach, deepest pierce.
  "longshot:r": [
    { act: "fan", angles: [0], damage: [32, 11, ["agility"], 1.9], speed: 1150, range: [950, 0], radius: 6, pierce: [5, 1] },
  ],
  // Refracted Rain（折光箭雨）— give ground, then rain arrows in every direction.
  "longshot:c": [
    { act: "dash", distance: [130, 11], back: true },
    { act: "burst", count: [12, 1], damage: [13, 5, ["agility"], 1.2], speed: 600, range: [260, 14], radius: 7 },
  ],
  // Scorch Pillar（灼地火柱）— slowest projectile, largest radius; a pillar, not a bolt.
  "pyre:r": [
    { act: "fan", angles: [0], damage: [30, 10, ["spirit"], 1.9], speed: 360, range: [400, 12], radius: 22 },
  ],
  // Flamewalk（焰影穿行）— dash through and leave the burn where you were.
  "pyre:c": [
    { act: "dash", distance: [150, 12] },
    { act: "burst", count: [12, 1], damage: [14, 5, ["spirit"], 1.3], speed: 400, range: [180, 10], radius: 10 },
  ],
  // Twilight Verdict（暮光裁决）— r/c do not branch on reputation; only q/e/f do.
  "eclipse:r": [
    { act: "fan", angles: [-0.2, 0, 0.2], damage: [24, 8, ["spirit"], 1.7], speed: 680, range: [520, 0], radius: 9, pierce: [2, 1] },
  ],
  // Twin Soul Turn（双魂轮转）— two staggered rings, one per soul.
  "eclipse:c": [
    { act: "dash", distance: [110, 9] },
    { act: "burst", count: [8, 1], damage: [13, 5, ["spirit"], 1.2], speed: 520, range: [210, 11], radius: 9 },
    { act: "burst", count: [6, 0], damage: [10, 4, ["spirit"], 0.9], speed: 660, range: [150, 8], radius: 7 },
  ],
  // Silver Cross（银月交叉）— two crossing arcs, closest range, agility.
  "moonblade:r": [
    { act: "fan", angles: [-0.5, 0.5], damage: [26, 9, ["agility"], 1.8], speed: 700, range: [260, 8], radius: 12 },
  ],
  // Mirrorbloom Dance（镜花回舞）— the densest close ring, matching the fastest attacker.
  "moonblade:c": [
    { act: "dash", distance: [150, 13] },
    { act: "burst", count: [12, 1], damage: [13, 5, ["agility"], 1.3], speed: 560, range: [170, 9], radius: 8 },
  ],
  "vanguard:q": [
    { act: "dash", distance: [94, 10] },
    { act: "fan", angles: [0], damage: [25, 8, ["power"], 2.1], speed: 560, range: [250, 15], radius: 15 },
  ],
  "vanguard:e": [
    { act: "burst", count: [8, 1], damage: [12, 5, ["power"], 1.25], speed: 440, range: [180, 16], radius: 10 },
  ],
  "vanguard:f": [
    { act: "burst", count: [16, 0], damage: [34, 12, ["power"], 2.4], speed: 460, range: [260, 24], radius: 14 },
  ],
  "channeler:q": [
    { act: "fan", angles: [0], damage: [27, 9, ["spirit"], 2.25], speed: 750, range: [760, 0], radius: 11, pierce: [2, 1] },
  ],
  "channeler:e": [
    { act: "burst", count: [8, 2], damage: [13, 5, ["spirit"], 1.35], speed: 520, range: [360, 20], radius: 7 },
  ],
  "channeler:f": [
    { act: "fan", angles: [0], damage: [55, 18, ["spirit"], 3], speed: 380, range: [900, 0], radius: 26, pierce: [40, 0] },
  ],
  "strider:q": [
    { act: "fan", angles: [-0.16, 0, 0.16], damage: [17, 6, ["agility"], 1.45], speed: 820, range: [680, 0], radius: 6 },
  ],
  "strider:e": [
    { act: "dash", distance: [130, 15] },
    { act: "fan", angles: [-0.1, 0.1], damage: [19, 7, ["agility"], 1.6], speed: 780, range: [500, 0], radius: 7 },
  ],
  "strider:f": [
    { act: "dash", distance: [200, 20] },
    { act: "burst", count: [12, 0], damage: [24, 9, ["agility"], 2], speed: 720, range: [380, 0], radius: 8 },
  ],
  "bulwark:q": [
    { act: "burst", count: [10, 0], damage: [16, 6, ["power"], 1.6], speed: 420, range: [150, 12], radius: 11 },
  ],
  "bulwark:e": [
    { act: "dash", distance: [110, 12] },
    { act: "fan", angles: [0], damage: [30, 9, ["power"], 2.2], speed: 520, range: [220, 14], radius: 16 },
  ],
  "bulwark:f": [
    { act: "burst", count: [20, 0], damage: [30, 11, ["power"], 2.6], speed: 400, range: [230, 20], radius: 13 },
  ],
  "longshot:q": [
    { act: "fan", angles: [0], damage: [30, 10, ["agility"], 1.8], speed: 1100, range: [900, 0], radius: 7, pierce: [4, 1] },
  ],
  "longshot:e": [
    { act: "dash", distance: [120, 10], back: true },
    { act: "fan", angles: [-0.18, 0, 0.18], damage: [14, 5, ["agility"], 1.3], speed: 800, range: [480, 0], radius: 6 },
  ],
  "longshot:f": [
    { act: "fan", angles: [-0.12, -0.06, 0, 0.06, 0.12], damage: [36, 12, ["agility"], 2.2], speed: 1100, range: [1100, 0], radius: 7, pierce: [8, 0] },
  ],
  "pyre:q": [
    { act: "burst", count: [12, 1], damage: [15, 6, ["spirit"], 1.5], speed: 480, range: [240, 18], radius: 9 },
  ],
  "pyre:e": [
    { act: "fan", angles: [-0.3, -0.15, 0, 0.15, 0.3], damage: [16, 6, ["spirit"], 1.7], speed: 600, range: [420, 0], radius: 8 },
  ],
  "pyre:f": [
    { act: "burst", count: [14, 0], damage: [26, 10, ["spirit"], 2], speed: 420, range: [320, 26], radius: 11 },
    { act: "burst", count: [10, 0], damage: [20, 8, ["spirit"], 1.4], speed: 620, range: [200, 16], radius: 9 },
  ],
  "moonblade:q": [
    { act: "burst", count: [10, 0], damage: [13, 5, ["agility"], 1.5], speed: 520, range: [120, 10], radius: 9 },
  ],
  "moonblade:e": [
    { act: "dash", distance: [150, 15] },
    { act: "fan", angles: [-0.08, 0.08], damage: [20, 7, ["agility"], 1.7], speed: 820, range: [320, 0], radius: 7 },
  ],
  "moonblade:f": [
    { act: "dash", distance: [180, 18] },
    { act: "burst", count: [12, 0], damage: [22, 9, ["agility"], 2.1], speed: 640, range: [240, 0], radius: 9 },
    { act: "fan", angles: [-0.1, 0.1], damage: [28, 10, ["agility"], 1.8], speed: 860, range: [420, 0], radius: 8 },
  ],
});

export function skillDefinition(archetype, slot) {
  const native = ARCHETYPES[archetype]?.skills?.[slot];
  if (native) return native;
  const extra = EXTRA_SKILLS[archetype]?.[slot];
  if (!extra) return null;
  return Object.freeze({
    id: `${archetype}-${slot}-technique`,
    name: extra.name,
    description: extra.description,
    // Cooldowns stay uniform across the roster on purpose: this change is
    // about shape and scaling, and per-class cooldowns would move the balance
    // surface too in one step.
    cooldown: slot === "r" ? 8.5 : 10,
    maxLevel: 1000,
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
        maxLevel: 1000,
      }),
      e: Object.freeze({
        id: "resonant-ring",
        name: "Resonant Ring",
        description: "Release a ring of short-range force projectiles.",
        cooldown: 7,
        maxLevel: 1000,
      }),
      f: Object.freeze({
        id: "skybreaker",
        name: "Skybreaker",
        description: "Bring the blade down hard enough to crack the field itself.",
        cooldown: 16,
        maxLevel: 1000,
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
        maxLevel: 1000,
      }),
      e: Object.freeze({
        id: "orbit-bloom",
        name: "Orbit Bloom",
        description: "Cast stellar bolts in every direction.",
        cooldown: 7.5,
        maxLevel: 1000,
      }),
      f: Object.freeze({
        id: "startide",
        name: "Startide",
        description: "Release a colossal orb of starfire that rolls through everything.",
        cooldown: 18,
        maxLevel: 1000,
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
        maxLevel: 1000,
      }),
      e: Object.freeze({
        id: "phase-vault",
        name: "Phase Vault",
        description: "Vault forward and fire a wake of energy.",
        cooldown: 6,
        maxLevel: 1000,
      }),
      f: Object.freeze({
        id: "storm-of-edges",
        name: "Storm of Edges",
        description: "Dash through the fray inside a storm of spinning blades.",
        cooldown: 15,
        maxLevel: 1000,
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
        maxLevel: 1000,
      }),
      e: Object.freeze({
        id: "iron-charge",
        name: "Iron Charge",
        description: "Charge forward behind a crushing ram wave.",
        cooldown: 6.5,
        maxLevel: 1000,
      }),
      f: Object.freeze({
        id: "mountainfall",
        name: "Mountainfall",
        description: "Shatter the ground in a devastating full-circle quake.",
        cooldown: 20,
        maxLevel: 1000,
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
        maxLevel: 1000,
      }),
      e: Object.freeze({
        id: "disengage-volley",
        name: "Disengage Volley",
        description: "Leap back while loosing a spread of bolts.",
        cooldown: 6,
        maxLevel: 1000,
      }),
      f: Object.freeze({
        id: "meteor-volley",
        name: "Meteor Volley",
        description: "Loose five piercing lances that cross the entire field.",
        cooldown: 17,
        maxLevel: 1000,
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
        maxLevel: 1000,
      }),
      e: Object.freeze({
        id: "ember-fan",
        name: "Ember Fan",
        description: "Sweep a wide fan of embers forward.",
        cooldown: 4.4,
        maxLevel: 1000,
      }),
      f: Object.freeze({
        id: "skyfire",
        name: "Skyfire",
        description: "Ignite the air itself in a vast double ring of flame.",
        cooldown: 19,
        maxLevel: 1000,
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
        maxLevel: 1000,
      }),
      e: Object.freeze({
        id: "soulguard-surge",
        name: "Soulguard Surge",
        description: "Mend and harden the soul barrier, or vent a ring of deep frost.",
        cooldown: 7,
        maxLevel: 1000,
      }),
      f: Object.freeze({
        id: "zenith-and-nadir",
        name: "Zenith and Nadir",
        description: "The full weight of dawn, or the deepest cold of night.",
        cooldown: 17,
        maxLevel: 1000,
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
        maxLevel: 1000,
      }),
      e: Object.freeze({
        id: "lunar-rush",
        name: "Lunar Rush",
        description: "Dash through and cut twice on the way.",
        cooldown: 5.2,
        maxLevel: 1000,
      }),
      f: Object.freeze({
        id: "eclipse-waltz",
        name: "Eclipse Waltz",
        description: "Dance through the enemy line in a whirl of crescent light.",
        cooldown: 15,
        maxLevel: 1000,
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
        stats: { ...BASE_STATS[id] },
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
