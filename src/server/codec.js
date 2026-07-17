// Optional binary snapshot codec ("binary1"), negotiated per connection via
// the join message's `codec` field. High-frequency entity arrays are packed
// as little-endian binary; low-frequency or deeply nested parts (world
// metadata, the recipient's own full entry) ride as an embedded JSON block.
// Everything other than snapshots stays JSON regardless of codec.
//
// Frame layout (little-endian):
//   u8   magic 0xB1 (codec version tag)
//   u32  jsonLength, then jsonLength bytes of UTF-8 JSON:
//        { tick, serverTime, selfId, mapId, online, world, safeZone, self }
//        (`self` is the recipient's full player entry, or null)
//   u16  playerCount, then per public player (recipient excluded):
//        str id, name, archetype, color, attunement, targetId ("" = null)
//        str armyName, armyRank, armyCamp ("" = null)
//        u8  running, alive
//        f32 x, y, facingX, facingY, hp, maxHp, mp, maxMp, respawnIn, moveSpeed
//        i32 reputation, honor; u32 will
//        u16 radius, rebirths, level
//        u8  equipCount, then per equipped piece:
//            str key, name, rarity, dropClass ("" = none); u16 level; u8 refine
//        (soul-barrier detail is omitted in binary1; per-player mapId is
//         implied by the frame's own mapId, since a snapshot covers one map)
//   u16  enemyCount, then per enemy:
//        str id, type, name, attackStyle, combatState, attackTargetId ("" = null)
//        u8  flags (bit0 elite, bit1 boss, bit2 alive)
//        f32 x, y, hp, maxHp, damage, speed, attackRemaining, attackWindup
//        u16 radius, level, defense
//   u16  projectileCount, then per projectile:
//        str id, ownerId, team, color
//        f32 x, y, fromX, fromY; u16 radius
//   u16  dropCount, then per drop:
//        str id, slot, rarity, dropClass ("" = null), name
//        f32 x, y
// str = u16 byte length + UTF-8 bytes.

export const BINARY_CODEC = "binary1";
const MAGIC = 0xb1;

// Preallocated sequential writer: one growing buffer, offset writes. The
// naive one-Buffer-per-field + concat approach benchmarked slower than
// JSON.stringify at scale; this one is an order of magnitude faster.
class Writer {
  constructor(initial = 64 * 1024) {
    this.buffer = Buffer.allocUnsafe(initial);
    this.offset = 0;
  }

  _ensure(bytes) {
    if (this.offset + bytes <= this.buffer.length) return;
    const grown = Buffer.allocUnsafe(Math.max(this.buffer.length * 2, this.offset + bytes));
    this.buffer.copy(grown, 0, 0, this.offset);
    this.buffer = grown;
  }

  u8(value) {
    this._ensure(1);
    this.buffer.writeUInt8(value & 0xff, this.offset);
    this.offset += 1;
  }

  u16(value) {
    this._ensure(2);
    this.buffer.writeUInt16LE(value & 0xffff, this.offset);
    this.offset += 2;
  }

  u32(value) {
    this._ensure(4);
    this.buffer.writeUInt32LE(value >>> 0, this.offset);
    this.offset += 4;
  }

  i32(value) {
    this._ensure(4);
    this.buffer.writeInt32LE(value | 0, this.offset);
    this.offset += 4;
  }

  f32(value) {
    this._ensure(4);
    this.buffer.writeFloatLE(Number(value) || 0, this.offset);
    this.offset += 4;
  }

  str(value) {
    const text = String(value ?? "");
    const length = Buffer.byteLength(text, "utf8");
    this._ensure(2 + length);
    this.buffer.writeUInt16LE(length, this.offset);
    this.offset += 2;
    this.buffer.write(text, this.offset, "utf8");
    this.offset += length;
  }

  _push(bytes) {
    this._ensure(bytes.length);
    bytes.copy(this.buffer, this.offset);
    this.offset += bytes.length;
  }

  toBuffer() {
    // Each encode uses a fresh Writer, so sharing the backing store is safe.
    return this.buffer.subarray(0, this.offset);
  }
}

// Packs one player's public wire record. Full self entries carry a
// superset of these fields with identical values, so cached bytes are
// valid for every recipient.
function packPlayer(writer, player) {
  writer.str(player.id);
    writer.str(player.name);
    writer.str(player.archetype);
    writer.str(player.color);
    writer.str(player.attunement);
    writer.str(player.armyName ?? "");
    writer.str(player.armyRank ?? "");
    writer.str(player.armyCamp ?? "");
    writer.str(player.targetId ?? "");
    writer.u8(player.running ? 1 : 0);
    writer.u8(player.alive ? 1 : 0);
    writer.f32(player.x);
    writer.f32(player.y);
    writer.f32(player.facing.x);
    writer.f32(player.facing.y);
    writer.f32(player.hp);
    writer.f32(player.maxHp);
    writer.f32(player.mp);
    writer.f32(player.maxMp);
    writer.f32(player.respawnIn);
    writer.f32(player.moveSpeed);
    writer.i32(player.reputation);
    writer.i32(player.honor ?? 0);
    writer.u32(player.will);
    writer.u16(player.radius);
    writer.u16(player.rebirths);
    writer.u16(player.level);
  const equipped = Object.entries(player.equipment ?? {}).filter(([, item]) => item);
  writer.u8(equipped.length);
  for (const [key, item] of equipped) {
    writer.str(key);
    writer.str(item.name);
    writer.str(item.rarity);
    writer.str(typeof item.dropClass === "string" ? item.dropClass : "");
    writer.u16(item.level ?? 1);
    writer.u8(item.refine ?? 0);
  }
}

function packEnemy(writer, enemy) {
  writer.str(enemy.id);
    writer.str(enemy.type);
    writer.str(enemy.name);
    writer.str(enemy.attackStyle);
    writer.str(enemy.combatState);
    writer.str(enemy.attackTargetId ?? "");
    writer.u8((enemy.elite ? 1 : 0) | (enemy.boss ? 2 : 0) | (enemy.alive ? 4 : 0));
    writer.f32(enemy.x);
    writer.f32(enemy.y);
    writer.f32(enemy.hp);
    writer.f32(enemy.maxHp);
    writer.f32(enemy.damage);
    writer.f32(enemy.speed);
    writer.f32(enemy.attackRemaining);
    writer.f32(enemy.attackWindup);
  writer.u16(enemy.radius);
  writer.u16(enemy.level);
  writer.u16(enemy.defense);
}

function buildSections(snapshot) {
  const playerBytes = snapshot.players.map((player) => {
    const writer = new Writer(768);
    packPlayer(writer, player);
    return { id: player.id, bytes: writer.toBuffer() };
  });
  const entities = new Writer(32 * 1024);
  entities.u16(snapshot.enemies.length);
  for (const enemy of snapshot.enemies) packEnemy(entities, enemy);
  entities.u16(snapshot.projectiles.length);
  for (const projectile of snapshot.projectiles) {
    entities.str(projectile.id);
    entities.str(projectile.ownerId);
    entities.str(projectile.team);
    entities.str(projectile.color);
    entities.f32(projectile.x);
    entities.f32(projectile.y);
    entities.f32(projectile.fromX);
    entities.f32(projectile.fromY);
    entities.u16(projectile.radius);
  }
  entities.u16(snapshot.drops.length);
  for (const drop of snapshot.drops) {
    entities.str(drop.id);
    entities.str(drop.slot);
    entities.str(drop.rarity);
    entities.str(typeof drop.dropClass === "string" ? drop.dropClass : "");
    entities.str(drop.name);
    entities.f32(drop.x);
    entities.f32(drop.y);
  }
  return {
    playerBytes,
    entities: entities.toBuffer(),
    metaHead: `"tick":${snapshot.tick},"serverTime":${snapshot.serverTime}`
      + `,"mapId":${JSON.stringify(snapshot.mapId)},"online":${snapshot.online}`
      + `,"world":${JSON.stringify(snapshot.world)},"safeZone":${JSON.stringify(snapshot.safeZone)}`,
  };
}

// The per-map sections (packed entities, per-player public records, world
// meta string) are built once per broadcast via sectionCache; per recipient
// only the meta JSON (with their full self entry) is fresh.
export function encodeSnapshotBinary(snapshot, sectionCache = null) {
  const cacheKey = `bin:${snapshot.mapId ?? "*"}`;
  let sections = sectionCache?.get(cacheKey);
  if (!sections) {
    sections = buildSections(snapshot);
    sectionCache?.set(cacheKey, sections);
  }

  const selfEntry = snapshot.players.find((entry) => entry.id === snapshot.selfId) ?? null;
  const meta = `{${sections.metaHead},"selfId":${JSON.stringify(snapshot.selfId)}`
    + `,"self":${selfEntry ? JSON.stringify(selfEntry) : "null"}}`;
  const metaBytes = Buffer.from(meta, "utf8");

  const writer = new Writer(metaBytes.length + sections.entities.length + 4096);
  writer.u8(MAGIC);
  writer.u32(metaBytes.length);
  writer._push(metaBytes);
  const others = sections.playerBytes.filter((entry) => entry.id !== snapshot.selfId);
  writer.u16(others.length);
  for (const entry of others) writer._push(entry.bytes);
  writer._push(sections.entities);
  return writer.toBuffer();
}

// Reference decoder. The Godot client implements the same layout in
// GDScript; this mirror keeps the format executable and testable in JS.
class Reader {
  constructor(buffer) {
    this.buffer = buffer;
    this.offset = 0;
  }

  u8() {
    return this.buffer.readUInt8(this.offset++);
  }

  u16() {
    const value = this.buffer.readUInt16LE(this.offset);
    this.offset += 2;
    return value;
  }

  u32() {
    const value = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  i32() {
    const value = this.buffer.readInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  f32() {
    const value = this.buffer.readFloatLE(this.offset);
    this.offset += 4;
    // Round to keep float32 round-trips readable in comparisons.
    return Math.round(value * 1000) / 1000;
  }

  str() {
    const length = this.u16();
    const value = this.buffer.toString("utf8", this.offset, this.offset + length);
    this.offset += length;
    return value;
  }
}

export function decodeSnapshotBinary(buffer) {
  const reader = new Reader(buffer);
  if (reader.u8() !== MAGIC) throw new Error("not a binary1 snapshot frame");
  const metaLength = reader.u32();
  const meta = JSON.parse(reader.buffer.toString("utf8", reader.offset, reader.offset + metaLength));
  reader.offset += metaLength;

  const players = [];
  if (meta.self) players.push(meta.self);
  const playerCount = reader.u16();
  for (let index = 0; index < playerCount; index += 1) {
    const player = {
      id: reader.str(),
      name: reader.str(),
      archetype: reader.str(),
      color: reader.str(),
      attunement: reader.str(),
      armyName: reader.str() || null,
      armyRank: reader.str() || null,
      armyCamp: reader.str() || null,
      targetId: reader.str() || null,
      running: reader.u8() === 1,
      alive: reader.u8() === 1,
      x: reader.f32(),
      y: reader.f32(),
      facing: { x: reader.f32(), y: reader.f32() },
      hp: reader.f32(),
      maxHp: reader.f32(),
      mp: reader.f32(),
      maxMp: reader.f32(),
      respawnIn: reader.f32(),
      moveSpeed: reader.f32(),
      reputation: reader.i32(),
      honor: reader.i32(),
      will: reader.u32(),
      radius: reader.u16(),
      rebirths: reader.u16(),
      level: reader.u16(),
      equipment: {},
    };
    const equipCount = reader.u8();
    for (let piece = 0; piece < equipCount; piece += 1) {
      const key = reader.str();
      player.equipment[key] = {
        name: reader.str(),
        rarity: reader.str(),
        dropClass: reader.str() || undefined,
        level: reader.u16(),
        // Stage 0 is the absence of the field on the JSON path; keep the two
        // encodings byte-for-byte comparable by decoding it back to undefined.
        refine: reader.u8() || undefined,
      };
    }
    players.push(player);
  }

  const enemies = [];
  const enemyCount = reader.u16();
  for (let index = 0; index < enemyCount; index += 1) {
    const enemy = {
      id: reader.str(),
      type: reader.str(),
      name: reader.str(),
      attackStyle: reader.str(),
      combatState: reader.str(),
      attackTargetId: reader.str() || null,
    };
    const flags = reader.u8();
    enemy.elite = (flags & 1) !== 0;
    enemy.boss = (flags & 2) !== 0;
    enemy.alive = (flags & 4) !== 0;
    enemy.x = reader.f32();
    enemy.y = reader.f32();
    enemy.hp = reader.f32();
    enemy.maxHp = reader.f32();
    enemy.damage = reader.f32();
    enemy.speed = reader.f32();
    enemy.attackRemaining = reader.f32();
    enemy.attackWindup = reader.f32();
    enemy.radius = reader.u16();
    enemy.level = reader.u16();
    enemy.defense = reader.u16();
    enemies.push(enemy);
  }

  const projectiles = [];
  const projectileCount = reader.u16();
  for (let index = 0; index < projectileCount; index += 1) {
    projectiles.push({
      id: reader.str(),
      ownerId: reader.str(),
      team: reader.str(),
      color: reader.str(),
      x: reader.f32(),
      y: reader.f32(),
      fromX: reader.f32(),
      fromY: reader.f32(),
      radius: reader.u16(),
    });
  }

  const drops = [];
  const dropCount = reader.u16();
  for (let index = 0; index < dropCount; index += 1) {
    drops.push({
      id: reader.str(),
      slot: reader.str(),
      rarity: reader.str(),
      dropClass: reader.str() || null,
      name: reader.str(),
      x: reader.f32(),
      y: reader.f32(),
    });
  }

  return {
    type: "snapshot",
    tick: meta.tick,
    serverTime: meta.serverTime,
    selfId: meta.selfId,
    mapId: meta.mapId,
    online: meta.online,
    world: meta.world,
    safeZone: meta.safeZone,
    players,
    enemies,
    projectiles,
    drops,
  };
}
