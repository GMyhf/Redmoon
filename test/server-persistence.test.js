import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { WebSocket } from "ws";

import { GameServer, createConfiguredGameServer } from "../src/server/server.js";
import { MAX_ITEM_SEQUENCE, PROTOCOL_VERSION } from "../src/server/definitions.js";
import { hashSecret } from "../src/server/session.js";

// These tests drive GameServer's persistence directly — no listen(), no
// network, no timers — following the deterministic-world convention.
const worldOptions = { rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 };

function tempStorePath(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "crimson-accounts-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "accounts.json");
}

test("pending and historically dropped audits stay observable without poisoning readiness", async () => {
  const commits = [];
  const repository = {
    async saveAccounts(accounts, audits) {
      commits.push({ accounts: structuredClone(accounts), audits: structuredClone(audits) });
    },
    async close() {},
  };
  const server = new GameServer({ accountRepository: repository, accountStore: {}, worldOptions });
  server.world.recordSecurityAudit("security_command_rejected", "probe", { code: "INVALID_TOKEN" });
  server.world.auditDropped = 3;

  const status = server._persistenceStatus();
  assert.equal(status.ok, true);
  assert.equal(status.auditPending, 1);
  assert.equal(status.auditDropped, 3);
  await server.close();
  assert.equal(commits.at(-1).audits.length, 1, "shutdown still flushes every pending audit");
});

test("a security-audit watermark schedules one bounded background flush", async () => {
  const commits = [];
  const repository = {
    async saveAccounts(accounts, audits) {
      commits.push({ accounts: structuredClone(accounts), audits: structuredClone(audits) });
    },
    async close() {},
  };
  const server = new GameServer({ accountRepository: repository, accountStore: {}, worldOptions });
  for (let index = 0; index < 250; index += 1) {
    server.world.recordSecurityAudit("security_command_rejected", `probe-${index}`, {
      code: "INVALID_TOKEN",
    });
  }

  server._scheduleAuditFlush();
  server._scheduleAuditFlush();
  await server._savePromise;
  assert.equal(commits.length, 1);
  assert.equal(commits[0].audits.length, 250);
  assert.equal(server.world.auditLog.length, 0);
  await server.close();
});

test("configured servers load, save, and close the PostgreSQL repository", async () => {
  const calls = [];
  const repository = {
    async loadAccounts() {
      calls.push("load");
      return { alpha: { archetype: "vanguard", tokenHash: "a".repeat(64), gold: 9 } };
    },
    async saveAccounts(accounts, audits) {
      calls.push({ accounts: structuredClone(accounts), audits: structuredClone(audits) });
    },
    async close() { calls.push("close"); },
  };
  const server = await createConfiguredGameServer({ accountRepository: repository, worldOptions });
  assert.equal(server.world.accountStore.alpha.gold, 9);
  assert.equal(server._persistenceStatus().backend, "postgresql");
  await server.close();
  assert.equal(calls[0], "load");
  assert.equal(calls.at(-1), "close");
  assert.deepEqual(
    calls.find((call) => call && typeof call === "object")?.accounts,
    {},
    "closing an unchanged repository does not rewrite all historical accounts",
  );
});

test("listen fails closed when an idle persistence preflight cannot reach PostgreSQL", async () => {
  let available = false;
  let closed = false;
  const repository = {
    async saveAccounts() {
      if (!available) throw new Error("database offline");
    },
    async close() { closed = true; },
  };
  const server = new GameServer({
    host: "127.0.0.1", port: 0, accountRepository: repository, accountStore: {}, worldOptions,
  });

  await assert.rejects(() => server.listen(), /database offline/);
  assert.equal(server.httpServer.listening, false, "traffic is never accepted before persistence is healthy");
  assert.equal(server._persistenceStatus().ok, false);
  available = true;
  await server.close();
  assert.equal(closed, true);
});

test("PostgreSQL periodic saves only include online and dirty accounts", async () => {
  const commits = [];
  const accountStore = Object.fromEntries(Array.from({ length: 200 }, (_, index) => [
    `offline-${index}`,
    { archetype: "vanguard", tokenHash: "a".repeat(64), level: 1 },
  ]));
  const repository = {
    async saveAccounts(accounts, audits) {
      commits.push({ accounts: structuredClone(accounts), audits: structuredClone(audits) });
    },
    async close() {},
  };
  const server = new GameServer({ accountRepository: repository, accountStore, worldOptions });
  server.world.addPlayer("online", { name: "Online", archetype: "vanguard" });

  await server._saveAccounts();

  assert.deepEqual(Object.keys(commits[0].accounts), ["online"]);
  assert.equal(Object.hasOwn(commits[0].accounts, "offline-0"), false);
  await server.close();
});

test("failed targeted PostgreSQL saves stay dirty and retry after disconnect", async () => {
  const commits = [];
  let fail = true;
  const repository = {
    async saveAccounts(accounts) {
      commits.push(structuredClone(accounts));
      if (fail) throw new Error("temporary outage");
    },
    async close() {},
  };
  const server = new GameServer({ accountRepository: repository, accountStore: {}, worldOptions });
  server.world.addPlayer("retry", { name: "Retry", archetype: "vanguard" });

  await assert.rejects(
    server._saveAccounts({ accountKeys: ["retry"] }),
    /temporary outage/,
  );
  server.world.removePlayer("retry");
  fail = false;
  await server._saveAccounts();

  assert.deepEqual(Object.keys(commits.at(-1)), ["retry"]);
  assert.equal(server._dirtyAccountVersions.size, 0);
  await server.close();
});

test("queued PostgreSQL writers keep immutable point-in-time account snapshots", async () => {
  let releaseWrite;
  let writeStarted;
  const started = new Promise((resolve) => { writeStarted = resolve; });
  const release = new Promise((resolve) => { releaseWrite = resolve; });
  const commits = [];
  const repository = {
    async saveAccounts(accounts) {
      writeStarted();
      await release;
      commits.push(structuredClone(accounts));
    },
    async close() {},
  };
  const server = new GameServer({ accountRepository: repository, accountStore: {}, worldOptions });
  const player = server.world.addPlayer("snapshot", {
    name: "Snapshot", archetype: "vanguard",
  });
  player.gold = 10;

  const save = server._saveAccounts();
  await started;
  player.gold = 99;
  releaseWrite();
  await save;

  assert.equal(commits[0].snapshot.gold, 10);
  await server.close();
});

test("concurrent saves persist each audit entry only once", async () => {
  let markFirstStarted;
  let releaseFirst;
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  const firstRelease = new Promise((resolve) => { releaseFirst = resolve; });
  const commits = [];
  const repository = {
    async saveAccounts(accounts, audits) {
      commits.push({ accounts: structuredClone(accounts), audits: structuredClone(audits) });
      if (commits.length === 1) {
        markFirstStarted();
        await firstRelease;
      }
    },
    async close() {},
  };
  const server = new GameServer({ accountRepository: repository, accountStore: {}, worldOptions });
  server.world.addPlayer("audit", { name: "Audit", archetype: "vanguard" });

  const first = server._saveAccounts();
  await firstStarted;
  const second = server._saveAccounts();
  releaseFirst();
  await Promise.all([first, second]);

  const persistedIds = commits.flatMap((commit) => commit.audits.map((entry) => entry.id));
  assert.equal(commits.length, 2);
  assert.equal(persistedIds.length, 1);
  assert.equal(new Set(persistedIds).size, persistedIds.length);
  assert.equal(server.world.auditLog.length, 0);
  await server.close();
});

test("a queued normal save cannot observe a later uncommitted credential", async () => {
  let markBlockerStarted;
  let releaseBlocker;
  const blockerStarted = new Promise((resolve) => { markBlockerStarted = resolve; });
  const blockerRelease = new Promise((resolve) => { releaseBlocker = resolve; });
  const commits = [];
  const repository = {
    async saveAccounts(accounts, audits) {
      commits.push({ accounts: structuredClone(accounts), audits: structuredClone(audits) });
      if (commits.length === 1) {
        markBlockerStarted();
        await blockerRelease;
      }
    },
    async close() {},
  };
  const server = new GameServer({ accountRepository: repository, accountStore: {}, worldOptions });
  const player = server.world.addPlayer("credential", {
    name: "Credential", archetype: "vanguard",
  });
  const oldTokenHash = hashSecret(player.token);
  const nextToken = "n".repeat(43);
  const messages = [];
  const socket = {
    playerId: "credential",
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
    send(payload) { messages.push(JSON.parse(payload)); },
  };

  const blocker = server._saveAccounts();
  await blockerStarted;
  const earlierSave = server._saveAccounts();
  const rotation = server._processCommand(socket, { type: "sessionRotate", nextToken });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(player.token, nextToken, "rotation has mutated memory but is still waiting to commit");
  releaseBlocker();
  await Promise.all([blocker, earlierSave, rotation]);

  assert.equal(commits.length, 3);
  assert.equal(commits[1].accounts.credential.tokenHash, oldTokenHash);
  assert.equal(
    commits[1].audits.some((entry) => entry.action === "session_rotated"),
    false,
  );
  assert.equal(commits[2].accounts.credential.tokenHash, hashSecret(nextToken));
  assert.equal(
    commits[2].audits.some((entry) => entry.action === "session_rotated"),
    true,
  );
  assert.equal(messages.at(-1).type, "session");
  await server.close();
});

test("security mutations serialize rollback and never leak a failed credential", async () => {
  let markFirstStarted;
  let releaseFirst;
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  const firstRelease = new Promise((resolve) => { releaseFirst = resolve; });
  const commits = [];
  let writes = 0;
  const repository = {
    async saveAccounts(accounts, audits) {
      writes += 1;
      commits.push({ accounts: structuredClone(accounts), audits: structuredClone(audits) });
      if (writes === 1) {
        markFirstStarted();
        await firstRelease;
        throw new Error("first transaction failed");
      }
    },
    async close() {},
  };
  const server = new GameServer({ accountRepository: repository, accountStore: {}, worldOptions });
  const fakeSocket = (playerId, origin) => {
    const messages = [];
    return {
      playerId,
      auditOrigin: origin,
      readyState: WebSocket.OPEN,
      bufferedAmount: 0,
      send(payload) { messages.push(JSON.parse(payload)); },
      messages,
    };
  };
  const alpha = fakeSocket("correlation-alpha", "https://alpha.example");
  const beta = fakeSocket("correlation-beta", "https://beta.example");
  const failedToken = "a".repeat(43);

  const first = server._processCommand(alpha, {
    type: "join", protocol: PROTOCOL_VERSION, name: "Alpha", archetype: "vanguard", nextToken: failedToken,
  });
  await firstStarted;
  const second = server._processCommand(beta, {
    type: "join", protocol: PROTOCOL_VERSION, name: "Beta", archetype: "vanguard", nextToken: "b".repeat(43),
  });
  releaseFirst();
  await Promise.all([first, second]);

  assert.equal(server.world.players.has("correlation-alpha"), false);
  assert.equal(server.world.players.has("correlation-beta"), true);
  assert.deepEqual(Object.keys(commits[1].accounts), ["beta"]);
  assert.equal(
    commits[1].audits.some((entry) => (
      entry.accountKey === "alpha" && entry.action === "session_joined"
    )),
    false,
    "the failed transaction's success audit is rolled back",
  );
  const rollback = commits[1].audits.find((entry) => (
    entry.accountKey === "alpha" && entry.action === "security_persistence_rolled_back"
  ));
  assert.equal(rollback.detail.correlationId, "correlation-alpha");
  assert.equal(rollback.detail.origin, "https://alpha.example");
  assert.doesNotMatch(JSON.stringify(rollback), new RegExp(failedToken));
  await server.close();
});

test("a JSON directory fsync failure rejects the credential and keeps it retryable", async (t) => {
  const persistPath = tempStorePath(t);
  let failSync = true;
  const server = new GameServer({
    persistPath,
    syncDirectory: async () => {
      if (failSync) throw new Error("directory fsync failed");
    },
    worldOptions,
  });
  const messages = [];
  const socket = {
    playerId: "fsync-credential",
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
    send(payload) { messages.push(JSON.parse(payload)); },
  };
  const nextToken = "f".repeat(43);

  await server._processCommand(socket, {
    type: "join", protocol: PROTOCOL_VERSION, name: "FsyncGuard", archetype: "vanguard", nextToken,
  });
  assert.equal(messages.at(-1).type, "error", "the server does not acknowledge an uncertain rename");
  assert.equal(messages.at(-1).code, "INTERNAL_ERROR");
  assert.equal(server.world.players.has(socket.playerId), false);
  assert.equal(Object.hasOwn(server.world.accountStore, "fsyncguard"), false);

  failSync = false;
  await server._processCommand(socket, {
    type: "join", protocol: PROTOCOL_VERSION, name: "FsyncGuard", archetype: "vanguard", nextToken,
  });
  const retrySession = messages.findLast((message) => message.type === "session");
  assert.ok(retrySession, "the preserved pending token can retry");
  assert.equal(retrySession.token, nextToken);
  await server.close();
});

test("shutdown skips durable commands that have not started", async () => {
  let markFirstStarted;
  let releaseFirst;
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  const firstRelease = new Promise((resolve) => { releaseFirst = resolve; });
  const commits = [];
  const repository = {
    async saveAccounts(accounts, audits) {
      commits.push({ accounts: structuredClone(accounts), audits: structuredClone(audits) });
      if (commits.length === 1) {
        markFirstStarted();
        await firstRelease;
      }
    },
    async close() {},
  };
  const server = new GameServer({ accountRepository: repository, accountStore: {}, worldOptions });
  const socket = (playerId) => ({
    playerId,
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
    messages: [],
    send(payload) { this.messages.push(JSON.parse(payload)); },
  });
  const firstSocket = socket("shutdown-first");
  const secondSocket = socket("shutdown-second");
  const first = server._processCommand(firstSocket, {
    type: "join", protocol: PROTOCOL_VERSION, name: "ShutdownFirst", archetype: "vanguard", nextToken: "a".repeat(43),
  });
  await firstStarted;
  const second = server._processCommand(secondSocket, {
    type: "join", protocol: PROTOCOL_VERSION, name: "ShutdownSecond", archetype: "vanguard", nextToken: "b".repeat(43),
  });
  const closing = server.close();
  releaseFirst();
  await Promise.all([first, second, closing]);

  assert.equal(server.world.players.has("shutdown-first"), true);
  assert.equal(server.world.players.has("shutdown-second"), false);
  assert.equal(secondSocket.messages.some((message) => message.type === "session"), false);
  assert.equal(commits.length, 2, "only the active command and final save reached storage");
});

test("rejected security commands are audited without bearer secrets", async () => {
  const commits = [];
  const repository = {
    async saveAccounts(accounts, audits) {
      commits.push({ accounts: structuredClone(accounts), audits: structuredClone(audits) });
    },
    async close() {},
  };
  const accountStore = {
    secure: { archetype: "vanguard", tokenHash: hashSecret("right-token"), level: 1 },
  };
  const server = new GameServer({ accountRepository: repository, accountStore, worldOptions });
  const messages = [];
  const socket = {
    playerId: "security-correlation",
    auditOrigin: "https://play.example",
    readyState: WebSocket.OPEN,
    bufferedAmount: 0,
    send(payload) { messages.push(JSON.parse(payload)); },
  };
  const wrongToken = "wrong-token-must-not-be-audited";

  await server._processCommand(socket, {
    type: "join",
    protocol: PROTOCOL_VERSION,
    name: "Secure",
    archetype: "vanguard",
    token: wrongToken,
  });

  assert.equal(messages.at(-1).code, "INVALID_TOKEN");
  const rejected = server.world.auditLog.at(-1);
  assert.equal(rejected.action, "security_command_rejected");
  assert.equal(rejected.accountKey, "secure");
  assert.deepEqual(rejected.detail, {
    command: "join",
    code: "INVALID_TOKEN",
    correlationId: "security-correlation",
    origin: "https://play.example",
  });
  assert.equal(JSON.stringify(rejected).includes(wrongToken), false);
  await server.close();
  assert.equal(commits.at(-1).audits.some((entry) => entry.id === rejected.id), true);
});

test("configured servers fail closed on malformed PostgreSQL account records", async () => {
  let closed = false;
  const repository = {
    async loadAccounts() {
      return { alpha: { archetype: "vanguard", tokenHash: "not-a-digest" } };
    },
    async saveAccounts() {},
    async close() { closed = true; },
  };
  await assert.rejects(
    () => createConfiguredGameServer({ accountRepository: repository, worldOptions }),
    /invalid account record/,
  );
  assert.equal(closed, true, "a rejected startup releases the database pool");
});

test("PostgreSQL startup applies the same bounded item schema as JSON", async () => {
  for (const record of [
    {
      archetype: "vanguard",
      inventory: [{
        id: "unsafe-drop", slot: "weapon", rarity: "common", tier: 1, level: 1,
        name: "Unsafe Drop", bonuses: {}, dropClass: { toString: null },
      }],
    },
    { archetype: "vanguard", statPoints: 1e300 },
    { archetype: "vanguard", bankGold: "vault" },
    { archetype: "vanguard", army: { name: "Siege", rank: "commander", siegeAt: "now" } },
  ]) {
    let closed = false;
    const repository = {
      async loadAccounts() { return { alpha: record }; },
      async saveAccounts() {},
      async close() { closed = true; },
    };
    await assert.rejects(
      () => createConfiguredGameServer({ accountRepository: repository, worldOptions }),
      /invalid account record/,
    );
    assert.equal(closed, true, "a rejected bounded record releases the database pool");
  }
});

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

test("close rejects when the final audit append is not durable", async (t) => {
  const persistPath = tempStorePath(t);
  const server = new GameServer({ persistPath, worldOptions });
  server.world.addPlayer("conn-1", { name: "Audited", archetype: "vanguard" });
  mkdirSync(`${persistPath}.audit.jsonl`);

  await assert.rejects(server.close(), /Final persistence health check failed.*pending audit/);

  assert.equal(server._persistenceStatus().ok, false);
  assert.equal(server._persistenceStatus().auditPending, 1);
  assert.equal(existsSync(persistPath), true, "the account record itself still committed");
});

test("close rejects when the final backup cannot be completed", async (t) => {
  const persistPath = tempStorePath(t);
  const server = new GameServer({ persistPath, worldOptions });
  server.world.addPlayer("conn-1", { name: "Backup", archetype: "vanguard" });
  server._rotateBackups = async () => { throw new Error("backup volume offline"); };

  await assert.rejects(server.close(), /Final persistence health check failed.*backup/);

  assert.equal(server._persistenceStatus().backupErrorAt !== null, true);
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

test("JSON listen fails closed on an unwritable store and can recover after repair", async (t) => {
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
  await assert.rejects(() => server.listen());
  assert.equal(server.httpServer.listening, false);
  assert.equal(server._persistenceStatus().ok, false);

  // Unblock the directory: a second preflight succeeds before binding.
  rmSync(blockedParent);
  await server.listen();
  t.after(() => server.close());
  const { port } = server.address();
  let ready;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    ready = await fetch(`http://127.0.0.1:${port}/ready`);
    if (ready.status === 200) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(ready.status, 200, "repaired persistence becomes ready after the first tick");
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

test("legacy plaintext session tokens are upgraded to digests during load", async (t) => {
  const persistPath = tempStorePath(t);
  writeFileSync(persistPath, JSON.stringify({
    schema: 1,
    accounts: {
      alpha: { archetype: "vanguard", token: "legacy-browser-token", gold: 12 },
    },
  }), "utf8");

  const server = new GameServer({ persistPath, worldOptions });
  assert.equal(server.world.accountStore.alpha.token, undefined);
  assert.equal(server.world.accountStore.alpha.tokenHash, hashSecret("legacy-browser-token"));
  const player = server.world.addPlayer("legacy", {
    name: "Alpha", archetype: "vanguard", token: "legacy-browser-token",
  });
  assert.equal(player.gold, 12, "the existing browser token remains valid after hashing");
  await server._saveAccounts();
  assert.equal(JSON.parse(readFileSync(persistPath, "utf8")).accounts.alpha.token, undefined);
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

test("invalid account records are isolated without discarding healthy accounts", async (t) => {
  const persistPath = tempStorePath(t);
  writeFileSync(persistPath, JSON.stringify({
    schema: 1,
    savedAt: "2026-07-13T00:00:00.000Z",
    accounts: {
      alpha: { archetype: "vanguard", level: 3, gold: 55 },
      broken: {
        archetype: "strider",
        token: "keep-this-for-recovery",
        inventory: { id: "item-9" },
      },
      badhash: {
        archetype: "vanguard",
        tokenHash: "z".repeat(64),
      },
      badrecovery: {
        archetype: "vanguard",
        recovery: { hash: "a".repeat(64), expiresAt: "not-a-date" },
      },
      baddrop: {
        archetype: "vanguard",
        inventory: [{
          id: "unsafe-drop", slot: "weapon", rarity: "common", tier: 1, level: 1,
          name: "Unsafe Drop", bonuses: { power: 0, agility: 0, spirit: 0, vitality: 0 },
          dropClass: { toString: null },
        }],
      },
      badpoints: { archetype: "vanguard", statPoints: 1e300 },
      badrefine: {
        archetype: "vanguard",
        inventory: [{
          id: "over-refined", slot: "weapon", rarity: "rare", tier: 3, level: 10,
          name: "Over Refined", bonuses: { power: 0, agility: 0, spirit: 0, vitality: 0 },
          refine: 99,
        }],
      },
      baditemid: {
        archetype: "vanguard",
        inventory: [{
          id: "item-999999999999999999999", slot: "weapon", rarity: "common",
          tier: 1, level: 1, name: "Unsafe Sequence",
          bonuses: { power: 0, agility: 0, spirit: 0, vitality: 0 },
        }],
      },
      baditemboundary: {
        archetype: "vanguard",
        inventory: [{
          id: `item-${MAX_ITEM_SEQUENCE}`, slot: "weapon", rarity: "common",
          tier: 1, level: 1, name: "Exhausted Sequence",
          bonuses: { power: 0, agility: 0, spirit: 0, vitality: 0 },
        }],
      },
    },
  }), "utf8");

  const server = new GameServer({ persistPath, worldOptions });
  assert.deepEqual(Object.keys(server.world.accountStore), ["alpha"]);
  const player = server.world.addPlayer("conn-1", { name: "Alpha", archetype: "vanguard" });
  assert.equal(player.gold, 55);
  assert.doesNotThrow(() => server.world.getSnapshot("conn-1"), "healthy records remain playable");
  assert.equal(existsSync(`${persistPath}.corrupt`), false, "one bad record does not quarantine the store");

  const invalidPath = `${persistPath}.invalid-records.json`;
  const rejected = JSON.parse(readFileSync(invalidPath, "utf8"));
  assert.match(rejected.accounts.badrefine.reason, /refine/);
  assert.match(rejected.accounts.broken.reason, /inventory/);
  assert.equal(rejected.accounts.broken.record.token, "keep-this-for-recovery");
  assert.match(rejected.accounts.badhash.reason, /tokenHash/);
  assert.match(rejected.accounts.badrecovery.reason, /recovery/);
  assert.match(rejected.accounts.baddrop.reason, /dropClass/);
  assert.match(rejected.accounts.badpoints.reason, /statPoints/);
  assert.match(rejected.accounts.baditemid.reason, /unsafe generated item sequence/);
  assert.match(rejected.accounts.baditemboundary.reason, /unsafe generated item sequence/);
  assert.equal(statSync(invalidPath).mode & 0o777, 0o600, "recovery data remains owner-only");

  await server._saveAccounts();
  const rewritten = JSON.parse(readFileSync(persistPath, "utf8"));
  assert.deepEqual(Object.keys(rewritten.accounts), ["alpha"], "the next save drops the bad live record");
});

test("an invalid __proto__ account is preserved safely in the rejection file", (t) => {
  const persistPath = tempStorePath(t);
  const accounts = Object.fromEntries([
    ["healthy", { archetype: "vanguard", level: 2 }],
    ["__proto__", { archetype: "not-an-archetype", token: "recovery-evidence" }],
  ]);
  writeFileSync(persistPath, JSON.stringify({ schema: 1, accounts }), "utf8");

  const server = new GameServer({ persistPath, worldOptions });
  const rejected = JSON.parse(readFileSync(`${persistPath}.invalid-records.json`, "utf8"));

  assert.deepEqual(Object.keys(server.world.accountStore), ["healthy"]);
  assert.equal(Object.hasOwn(rejected.accounts, "__proto__"), true);
  assert.match(rejected.accounts["__proto__"].reason, /unknown archetype/);
  assert.equal(rejected.accounts["__proto__"].record.token, "recovery-evidence");
  assert.equal({}.archetype, undefined);
});

test("Unicode account keys that expand during lower-casing survive reload", async (t) => {
  const persistPath = tempStorePath(t);
  const displayName = "İ".repeat(20);
  const accountKey = displayName.toLowerCase();
  const first = new GameServer({ persistPath, worldOptions });
  const original = first.world.addPlayer("first", {
    name: displayName, archetype: "vanguard",
  });
  original.gold = 73;
  await first._saveAccounts();

  const second = new GameServer({ persistPath, worldOptions });
  const restored = second.world.addPlayer("second", {
    name: displayName,
    archetype: "vanguard",
    token: original.token,
  });

  assert.equal(accountKey.length, 40);
  assert.equal(Object.hasOwn(second.world.accountStore, accountKey), true);
  assert.equal(restored.gold, 73);
  await second.close();
});

test("loading a legacy store tightens existing file and directory permissions", (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "crimson-accounts-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const storeDir = path.join(dir, "store");
  const persistPath = path.join(storeDir, "accounts.json");
  mkdirSync(storeDir, { mode: 0o755 });
  writeFileSync(persistPath, JSON.stringify({ schema: 1, accounts: {} }), { mode: 0o644 });
  writeFileSync(`${persistPath}.bak`, JSON.stringify({ schema: 1, accounts: {} }), { mode: 0o644 });
  // Make this deterministic even when the test runner itself uses a strict umask.
  chmodSync(storeDir, 0o755);
  chmodSync(persistPath, 0o644);
  chmodSync(`${persistPath}.bak`, 0o644);

  new GameServer({ persistPath, worldOptions, managePersistDirectory: true });

  assert.equal(statSync(storeDir).mode & 0o777, 0o700);
  assert.equal(statSync(persistPath).mode & 0o777, 0o600);
  assert.equal(statSync(`${persistPath}.bak`).mode & 0o777, 0o600);
});

test("a custom store never chmods an existing shared parent directory", (t) => {
  const sharedDir = mkdtempSync(path.join(os.tmpdir(), "crimson-shared-"));
  t.after(() => rmSync(sharedDir, { recursive: true, force: true }));
  const persistPath = path.join(sharedDir, "redmoon-accounts.json");
  chmodSync(sharedDir, 0o755);
  writeFileSync(persistPath, JSON.stringify({ schema: 1, accounts: {} }), { mode: 0o644 });

  new GameServer({ persistPath, worldOptions });

  assert.equal(statSync(sharedDir).mode & 0o777, 0o755, "shared parent permissions stay intact");
  assert.equal(statSync(persistPath).mode & 0o777, 0o600, "the owned store file is still tightened");
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
  assert.equal(mode(`${persistPath}.audit.jsonl`), 0o600, "audit log is 0600");
  assert.equal(mode(path.dirname(persistPath)), 0o700, "data directory is 0700");
  const backupDir = `${persistPath}.backups`;
  assert.equal(mode(backupDir), 0o700, "backups directory is 0700");
  const backups = readdirSync(backupDir).filter((name) => name.endsWith(".json"));
  assert.ok(backups.length >= 1);
  for (const name of backups) {
    assert.equal(mode(path.join(backupDir, name)), 0o600, `${name} is 0600`);
  }
});
