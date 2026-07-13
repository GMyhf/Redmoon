import test from "node:test";
import assert from "node:assert/strict";

import {
  POSTGRES_STORE_SCHEMA,
  PostgresAccountStore,
  postgresPoolOptions,
} from "../src/server/postgres-store.js";

function fakePool({ rows = [], migrationVersion = 0, failOn = null } = {}) {
  const calls = [];
  const client = {
    async query(text, params = []) {
      const sql = String(text).replace(/\s+/g, " ").trim();
      calls.push({ sql, params });
      if (failOn && sql.includes(failOn)) throw new Error("forced database failure");
      if (sql.startsWith("SELECT COALESCE(MAX(version)")) {
        return { rows: [{ version: migrationVersion }] };
      }
      if (sql.startsWith("SELECT account_key")) return { rows };
      return { rows: [] };
    },
    release() {
      calls.push({ sql: "RELEASE", params: [] });
    },
  };
  return {
    calls,
    query: client.query.bind(client),
    async connect() { return client; },
  };
}

test("PostgreSQL store initializes its versioned account and audit schema", async () => {
  const pool = fakePool();
  const store = new PostgresAccountStore(pool);
  await store.initialize();

  assert.match(pool.calls[0].sql, /CREATE TABLE IF NOT EXISTS crimson_schema_migrations/);
  assert.doesNotMatch(pool.calls[0].sql, /crimson_accounts|crimson_audit_log/);
  assert.match(pool.calls[1].sql, /SELECT COALESCE\(MAX\(version\), 0\)/);
  assert.match(pool.calls[2].sql, /CREATE TABLE IF NOT EXISTS crimson_accounts/);
  assert.match(pool.calls[2].sql, /CREATE TABLE IF NOT EXISTS crimson_audit_log/);
  assert.match(pool.calls[2].sql, /ADD COLUMN IF NOT EXISTS event_id text/);
  assert.match(pool.calls[2].sql, /CREATE UNIQUE INDEX IF NOT EXISTS crimson_audit_event_id_idx/);
  assert.deepEqual(pool.calls[3].params, [2]);
  assert.equal(POSTGRES_STORE_SCHEMA, 2);
});

test("PostgreSQL store refuses a database created by a newer server", async () => {
  const pool = fakePool({ migrationVersion: 3 });
  const store = new PostgresAccountStore(pool);

  await assert.rejects(() => store.initialize(), /uses schema 3; this server supports 2/);
  assert.equal(pool.calls.length, 2, "future schemas fail before any business-table mutation");
  assert.equal(
    pool.calls.some((call) => /crimson_accounts|crimson_audit_log/.test(call.sql)),
    false,
  );
  assert.equal(
    pool.calls.some((call) => call.sql.startsWith("INSERT INTO crimson_schema_migrations")),
    false,
  );
});

test("PostgreSQL store loads records and rejects future schemas", async () => {
  const account = { archetype: "vanguard", tokenHash: "abc", level: 7 };
  const pool = fakePool({ rows: [{ account_key: "alpha", schema_version: 1, record: account }] });
  const store = new PostgresAccountStore(pool);
  assert.deepEqual(await store.loadAccounts(), { alpha: account });

  const future = new PostgresAccountStore(fakePool({
    rows: [{ account_key: "future", schema_version: 99, record: {} }],
  }));
  await assert.rejects(() => future.loadAccounts(), /supports 2/);
});

test("PostgreSQL store loads special account keys without prototype pollution", async () => {
  const prototypeRecord = { archetype: "vanguard", level: 3 };
  const constructorRecord = { archetype: "warlock", level: 5 };
  const pool = fakePool({
    rows: [
      { account_key: "__proto__", schema_version: 1, record: prototypeRecord },
      { account_key: "constructor", schema_version: 1, record: constructorRecord },
    ],
  });
  const store = new PostgresAccountStore(pool);

  const accounts = await store.loadAccounts();

  assert.equal(Object.getPrototypeOf(accounts), Object.prototype);
  assert.equal(Object.hasOwn(accounts, "__proto__"), true);
  assert.equal(Object.hasOwn(accounts, "constructor"), true);
  assert.deepEqual(accounts["__proto__"], prototypeRecord);
  assert.deepEqual(accounts.constructor, constructorRecord);
  assert.equal({}.archetype, undefined);
});

test("PostgreSQL store commits accounts and idempotent audit entries in one transaction", async () => {
  const pool = fakePool();
  const store = new PostgresAccountStore(pool);
  await store.saveAccounts({
    alpha: { archetype: "vanguard", tokenHash: "hash", gold: 30 },
  }, [{
    id: "16530274-a82f-4c9e-a074-c5122bab9154",
    accountKey: "alpha",
    action: "session_rotated",
    detail: { source: "client" },
  }]);

  assert.equal(pool.calls[0].sql, "BEGIN");
  assert.match(pool.calls[1].sql, /INSERT INTO crimson_accounts/);
  assert.equal(pool.calls[1].params[1], 2);
  assert.deepEqual(JSON.parse(pool.calls[1].params[0]), [{
    accountKey: "alpha",
    record: { archetype: "vanguard", tokenHash: "hash", gold: 30 },
  }]);
  assert.match(pool.calls[2].sql, /INSERT INTO crimson_audit_log/);
  assert.match(pool.calls[2].sql, /ON CONFLICT \(event_id\) DO NOTHING/);
  assert.deepEqual(JSON.parse(pool.calls[2].params[0]), [{
    eventId: "16530274-a82f-4c9e-a074-c5122bab9154",
    accountKey: "alpha",
    action: "session_rotated",
    detail: { source: "client" },
    at: null,
  }]);
  assert.equal(pool.calls[3].sql, "COMMIT");
  assert.equal(pool.calls.at(-1).sql, "RELEASE");
});

test("PostgreSQL audit retries reuse the stable event id", async () => {
  const pool = fakePool();
  const store = new PostgresAccountStore(pool);
  const audit = {
    id: "b50c9556-75d2-47b5-a59a-f7bf85e9cfa0",
    accountKey: "alpha",
    action: "recovery_issued",
    at: "2026-07-13T00:00:00.000Z",
  };

  await store.saveAccounts({}, [audit]);
  await store.saveAccounts({}, [structuredClone(audit)]);

  const inserts = pool.calls.filter((call) => call.sql.includes("INSERT INTO crimson_audit_log"));
  assert.equal(inserts.length, 2);
  assert.deepEqual(inserts[0].params, inserts[1].params);
  assert.equal(JSON.parse(inserts[0].params[0])[0].eventId, audit.id);
  assert.match(inserts[0].sql, /ON CONFLICT \(event_id\) DO NOTHING/);
});

test("PostgreSQL audit entries require a stable id before opening a transaction", async () => {
  const pool = fakePool();
  const store = new PostgresAccountStore(pool);

  await assert.rejects(
    () => store.saveAccounts({}, [{ action: "session_rotated" }]),
    /require a stable non-empty id/,
  );
  assert.deepEqual(pool.calls, []);
});

test("PostgreSQL pool options bound each database call within the service stop budget", () => {
  assert.deepEqual(postgresPoolOptions("postgresql://localhost/crimson"), {
    connectionString: "postgresql://localhost/crimson",
    max: 4,
    connectionTimeoutMillis: 5_000,
    query_timeout: 8_000,
    statement_timeout: 7_000,
    idleTimeoutMillis: 30_000,
  });
  assert.deepEqual(postgresPoolOptions("postgresql://localhost/crimson", {
    maxConnections: 8,
    connectionTimeoutMillis: 1_000,
    queryTimeoutMillis: 4_000,
    statementTimeoutMillis: 3_000,
    idleTimeoutMillis: 12_000,
    ssl: true,
  }), {
    connectionString: "postgresql://localhost/crimson",
    max: 8,
    connectionTimeoutMillis: 1_000,
    query_timeout: 4_000,
    statement_timeout: 3_000,
    idleTimeoutMillis: 12_000,
    ssl: { rejectUnauthorized: true },
  });
  assert.throws(() => postgresPoolOptions(""), /DATABASE_URL/);
});

test("PostgreSQL store batches any number of account rows into one upsert", async () => {
  const pool = fakePool();
  const store = new PostgresAccountStore(pool);
  const accounts = Object.fromEntries(Array.from({ length: 250 }, (_, index) => [
    `account-${index}`,
    { archetype: "vanguard", level: index + 1 },
  ]));

  await store.saveAccounts(accounts);

  const upserts = pool.calls.filter((call) => call.sql.includes("INSERT INTO crimson_accounts"));
  assert.equal(upserts.length, 1, "batch size does not create serial database round trips");
  assert.equal(JSON.parse(upserts[0].params[0]).length, 250);
});

test("an empty PostgreSQL flush pings the backend without opening a transaction", async () => {
  const pool = fakePool();
  const store = new PostgresAccountStore(pool);

  await store.saveAccounts({}, []);

  assert.deepEqual(pool.calls, [{ sql: "SELECT 1", params: [] }]);
  const offline = new PostgresAccountStore(fakePool({ failOn: "SELECT 1" }));
  await assert.rejects(() => offline.saveAccounts({}, []), /forced database failure/);
});

test("PostgreSQL store rolls back a failed transaction", async () => {
  const pool = fakePool({ failOn: "INSERT INTO crimson_accounts" });
  const store = new PostgresAccountStore(pool);
  await assert.rejects(() => store.saveAccounts({ alpha: {} }), /forced database failure/);

  assert.ok(pool.calls.some((call) => call.sql === "ROLLBACK"));
  assert.equal(pool.calls.at(-1).sql, "RELEASE");
});
