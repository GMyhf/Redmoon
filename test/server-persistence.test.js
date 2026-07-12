import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { GameServer } from "../src/server/server.js";

// These tests drive GameServer's persistence directly — no listen(), no
// network, no timers — following the deterministic-world convention.
const worldOptions = { rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 };

function tempStorePath(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "crimson-accounts-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "accounts.json");
}

test("account saves are atomic and keep the previous good copy", async (t) => {
  const persistPath = tempStorePath(t);
  const server = new GameServer({ persistPath, worldOptions });
  const player = server.world.addPlayer("conn-1", { name: "Alpha", archetype: "vanguard" });

  player.gold = 321;
  await server._saveAccounts();
  assert.equal(existsSync(`${persistPath}.tmp`), false, "temp file is renamed into place");
  assert.equal(JSON.parse(readFileSync(persistPath, "utf8")).alpha.gold, 321);

  player.gold = 654;
  await server._saveAccounts();
  assert.equal(JSON.parse(readFileSync(persistPath, "utf8")).alpha.gold, 654);
  assert.equal(
    JSON.parse(readFileSync(`${persistPath}.bak`, "utf8")).alpha.gold,
    321,
    "the previous store survives as .bak",
  );

  // Overlapping flushes must serialize instead of clobbering the temp file.
  player.gold = 999;
  await Promise.all([server._saveAccounts(), server._saveAccounts()]);
  assert.equal(JSON.parse(readFileSync(persistPath, "utf8")).alpha.gold, 999);
});

test("a corrupt store falls back to the backup and is quarantined", async (t) => {
  const persistPath = tempStorePath(t);
  const first = new GameServer({ persistPath, worldOptions });
  const player = first.world.addPlayer("conn-1", { name: "Alpha", archetype: "vanguard" });
  player.gold = 111;
  await first._saveAccounts();
  player.gold = 222;
  await first._saveAccounts();

  writeFileSync(persistPath, "{ this is not json", "utf8");
  const second = new GameServer({ persistPath, worldOptions });
  assert.equal(second.world.accountStore.alpha.gold, 111, "backup copy restored");
  assert.equal(existsSync(`${persistPath}.corrupt`), true, "broken file kept for recovery");

  // With both copies unreadable the server still boots, with empty accounts.
  writeFileSync(persistPath, "also broken", "utf8");
  writeFileSync(`${persistPath}.bak`, "broken too", "utf8");
  const third = new GameServer({ persistPath, worldOptions });
  assert.deepEqual(third.world.accountStore, {});
});

test("closing the server flushes accounts to disk", async (t) => {
  const persistPath = tempStorePath(t);
  const server = new GameServer({ persistPath, worldOptions });
  const player = server.world.addPlayer("conn-1", { name: "Alpha", archetype: "vanguard" });
  player.gold = 42;
  await server.close();
  assert.equal(JSON.parse(readFileSync(persistPath, "utf8")).alpha.gold, 42);
});
