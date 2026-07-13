import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  assert.equal(JSON.parse(readFileSync(persistPath, "utf8")).accounts.alpha.gold, 321);

  player.gold = 654;
  await server._saveAccounts();
  assert.equal(JSON.parse(readFileSync(persistPath, "utf8")).accounts.alpha.gold, 654);
  assert.equal(
    JSON.parse(readFileSync(`${persistPath}.bak`, "utf8")).accounts.alpha.gold,
    321,
    "the previous store survives as .bak",
  );

  // Overlapping flushes must serialize instead of clobbering the temp file.
  player.gold = 999;
  await Promise.all([server._saveAccounts(), server._saveAccounts()]);
  assert.equal(JSON.parse(readFileSync(persistPath, "utf8")).accounts.alpha.gold, 999);
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
  assert.equal(JSON.parse(readFileSync(persistPath, "utf8")).accounts.alpha.gold, 42);
});

test("a persistence failure is visible to health diagnostics", async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "crimson-accounts-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const blockedParent = path.join(dir, "blocked");
  writeFileSync(blockedParent, "not a directory", "utf8");
  const server = new GameServer({
    persistPath: path.join(blockedParent, "accounts.json"),
    worldOptions,
  });

  await assert.rejects(server._saveAccounts());
  assert.equal(server._lastPersistError !== null, true);
  assert.equal(typeof server._lastPersistError.at, "string");
  assert.equal(server._lastPersistAt, null);
});

test("successful saves rotate timestamped backups with retention", async (t) => {
  const persistPath = tempStorePath(t);
  const server = new GameServer({
    persistPath, worldOptions,
    backup: { intervalMs: 1, keep: 2 },
  });
  const player = server.world.addPlayer("conn-1", { name: "Alpha", archetype: "vanguard" });
  for (let round = 0; round < 4; round += 1) {
    player.gold = round;
    await server._saveAccounts();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const backupDir = `${persistPath}.backups`;
  const backups = readdirSync(backupDir).filter((name) => name.endsWith(".json")).sort();
  assert.equal(backups.length, 2, "retention prunes to the configured count");
  const newest = JSON.parse(readFileSync(path.join(backupDir, backups.at(-1)), "utf8"));
  assert.equal(newest.accounts.alpha.gold, 3, "the newest backup carries the latest save");
});

test("readiness flips to 503 while persistence fails and recovers after", async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "crimson-accounts-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const blockedParent = path.join(dir, "blocked");
  writeFileSync(blockedParent, "not a directory", "utf8");
  const server = new GameServer({
    host: "127.0.0.1",
    port: 0,
    persistPath: path.join(blockedParent, "accounts.json"),
    worldOptions,
  });
  await server.listen();
  t.after(() => server.close());
  const { port } = server.address();

  assert.equal((await fetch(`http://127.0.0.1:${port}/ready`)).status, 200, "healthy at boot");
  server.world.addPlayer("conn-1", { name: "Alpha", archetype: "vanguard" });
  await assert.rejects(server._saveAccounts());
  const failing = await fetch(`http://127.0.0.1:${port}/ready`);
  assert.equal(failing.status, 503);
  const body = await failing.json();
  assert.equal(body.ready, false);
  assert.ok(body.persistence.consecutiveFailures >= 1);
  assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200, "liveness stays green");

  // Unblock the directory: the next save recovers readiness.
  rmSync(blockedParent);
  await server._saveAccounts();
  assert.equal((await fetch(`http://127.0.0.1:${port}/ready`)).status, 200, "recovered");
});

test("saves carry a schema version envelope", async (t) => {
  const persistPath = tempStorePath(t);
  const server = new GameServer({ persistPath, worldOptions });
  const player = server.world.addPlayer("conn-1", { name: "Alpha", archetype: "vanguard" });
  player.gold = 7;
  await server._saveAccounts();
  const written = JSON.parse(readFileSync(persistPath, "utf8"));
  assert.equal(written.schema, 1);
  assert.equal(typeof written.savedAt, "string");
  assert.equal(written.accounts.alpha.gold, 7);
});

test("a legacy flat accounts file migrates to the envelope", async (t) => {
  const persistPath = tempStorePath(t);
  writeFileSync(
    persistPath,
    JSON.stringify({ alpha: { archetype: "vanguard", gold: 55, level: 3 } }),
    "utf8",
  );
  const server = new GameServer({ persistPath, worldOptions });
  assert.equal(server.world.accountStore.alpha.gold, 55, "legacy records load as-is");
  await server._saveAccounts();
  const rewritten = JSON.parse(readFileSync(persistPath, "utf8"));
  assert.equal(rewritten.schema, 1, "the next save upgrades the file in place");
  assert.equal(rewritten.accounts.alpha.gold, 55);
});

test("a store written by a newer schema refuses to boot", (t) => {
  const persistPath = tempStorePath(t);
  writeFileSync(persistPath, JSON.stringify({ schema: 99, accounts: {} }), "utf8");
  assert.throws(() => new GameServer({ persistPath, worldOptions }), /schema 99/);
  assert.equal(existsSync(persistPath), true, "the file is neither quarantined nor rewritten");
  assert.equal(existsSync(`${persistPath}.corrupt`), false);
});

test("valid JSON with the wrong shape is quarantined like corruption", (t) => {
  const persistPath = tempStorePath(t);
  writeFileSync(persistPath, JSON.stringify([1, 2, 3]), "utf8");
  const server = new GameServer({ persistPath, worldOptions });
  assert.deepEqual(server.world.accountStore, {});
  assert.equal(existsSync(`${persistPath}.corrupt`), true);
});

test("the store, its backups, and their directories stay owner-only", async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "crimson-accounts-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const persistPath = path.join(dir, "store", "accounts.json");
  const server = new GameServer({
    persistPath, worldOptions,
    backup: { intervalMs: 1, keep: 2 },
  });
  server.world.addPlayer("conn-1", { name: "Alpha", archetype: "vanguard" });
  await server._saveAccounts();
  await new Promise((resolve) => setTimeout(resolve, 5));
  await server._saveAccounts(); // second save creates .bak and another backup

  const mode = (target) => statSync(target).mode & 0o777;
  assert.equal(mode(persistPath), 0o600, "live store is 0600");
  assert.equal(mode(`${persistPath}.bak`), 0o600, ".bak is 0600");
  assert.equal(mode(path.dirname(persistPath)), 0o700, "data directory is 0700");
  const backupDir = `${persistPath}.backups`;
  assert.equal(mode(backupDir), 0o700, "backups directory is 0700");
  const backups = readdirSync(backupDir).filter((name) => name.endsWith(".json"));
  assert.ok(backups.length >= 1);
  for (const name of backups) {
    assert.equal(mode(path.join(backupDir, name)), 0o600, `${name} is 0600`);
  }
});
