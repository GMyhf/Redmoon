// PostgreSQL persistence for public/long-running deployments. The live World
// still owns the tick and keeps a hot in-memory account map; this adapter
// loads that map at boot and flushes versioned JSON records transactionally.

const STORE_SCHEMA = 2;
const DEFAULT_CONNECTION_TIMEOUT_MS = 5_000;
const DEFAULT_QUERY_TIMEOUT_MS = 8_000;
const DEFAULT_STATEMENT_TIMEOUT_MS = 7_000;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;

export class PostgresAccountStore {
  constructor(pool, options = {}) {
    if (!pool || typeof pool.query !== "function") {
      throw new TypeError("PostgresAccountStore requires a pg-compatible pool");
    }
    this.pool = pool;
    this.ownsPool = options.ownsPool === true;
  }

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS crimson_schema_migrations (
        version integer PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const migrationResult = await this.pool.query(
      "SELECT COALESCE(MAX(version), 0) AS version FROM crimson_schema_migrations",
    );
    const databaseVersion = Number(migrationResult.rows?.[0]?.version ?? 0);
    if (databaseVersion > STORE_SCHEMA) {
      throw new Error(
        `PostgreSQL store uses schema ${databaseVersion}; this server supports ${STORE_SCHEMA}`,
      );
    }

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS crimson_accounts (
        account_key text PRIMARY KEY,
        schema_version integer NOT NULL,
        record jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS crimson_audit_log (
        id bigserial PRIMARY KEY,
        event_id text,
        account_key text,
        action text NOT NULL,
        detail jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE crimson_audit_log
        ADD COLUMN IF NOT EXISTS event_id text;
      CREATE UNIQUE INDEX IF NOT EXISTS crimson_audit_event_id_idx
        ON crimson_audit_log (event_id);
      CREATE INDEX IF NOT EXISTS crimson_audit_account_created_idx
        ON crimson_audit_log (account_key, created_at DESC);
    `);
    await this.pool.query(
      "INSERT INTO crimson_schema_migrations(version) VALUES ($1) ON CONFLICT DO NOTHING",
      [STORE_SCHEMA],
    );
  }

  async loadAccounts() {
    const result = await this.pool.query(
      "SELECT account_key, schema_version, record FROM crimson_accounts ORDER BY account_key",
    );
    const accounts = [];
    for (const row of result.rows ?? []) {
      if (Number(row.schema_version) > STORE_SCHEMA) {
        throw new Error(
          `PostgreSQL account ${row.account_key} uses schema ${row.schema_version}; `
          + `this server supports ${STORE_SCHEMA}`,
        );
      }
      accounts.push([String(row.account_key), structuredClone(row.record)]);
    }
    return Object.fromEntries(accounts);
  }

  async saveAccounts(accounts, audits = []) {
    const accountRows = Object.entries(accounts).map(([accountKey, record]) => ({
      accountKey,
      record,
    }));
    const auditRows = audits.map((audit) => {
      if (typeof audit?.id !== "string" || audit.id.trim().length === 0) {
        throw new TypeError("PostgreSQL audit entries require a stable non-empty id");
      }
      return {
        eventId: audit.id,
        accountKey: audit.accountKey ?? null,
        action: String(audit.action),
        detail: audit.detail ?? {},
        at: audit.at ?? null,
      };
    });
    if (accountRows.length === 0 && auditRows.length === 0) {
      // Periodic empty flushes are still the idle-backend health check. They
      // avoid a transaction, but must contact PostgreSQL so readiness cannot
      // stay green through an outage until the next player mutation.
      await this.pool.query("SELECT 1");
      return;
    }
    const client = typeof this.pool.connect === "function" ? await this.pool.connect() : this.pool;
    try {
      await client.query("BEGIN");
      if (accountRows.length > 0) {
        await client.query(`
          INSERT INTO crimson_accounts(account_key, schema_version, record, updated_at)
          SELECT
            entry->>'accountKey',
            $2,
            entry->'record',
            now()
          FROM jsonb_array_elements($1::jsonb) AS payload(entry)
          ON CONFLICT (account_key) DO UPDATE SET
            schema_version = EXCLUDED.schema_version,
            record = EXCLUDED.record,
            updated_at = now()
        `, [JSON.stringify(accountRows), STORE_SCHEMA]);
      }
      if (auditRows.length > 0) {
        await client.query(`
          INSERT INTO crimson_audit_log(event_id, account_key, action, detail, created_at)
          SELECT
            entry->>'eventId',
            entry->>'accountKey',
            entry->>'action',
            COALESCE(entry->'detail', '{}'::jsonb),
            COALESCE((entry->>'at')::timestamptz, now())
          FROM jsonb_array_elements($1::jsonb) AS payload(entry)
          WHERE true
          ON CONFLICT (event_id) DO NOTHING
        `, [JSON.stringify(auditRows)]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release?.();
    }
  }

  async close() {
    if (this.ownsPool) await this.pool.end?.();
  }
}

export function postgresPoolOptions(connectionString, options = {}) {
  if (typeof connectionString !== "string" || connectionString.length === 0) {
    throw new TypeError("DATABASE_URL must be a non-empty PostgreSQL connection string");
  }
  return {
    connectionString,
    max: options.maxConnections ?? 4,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? DEFAULT_CONNECTION_TIMEOUT_MS,
    query_timeout: options.queryTimeoutMillis ?? DEFAULT_QUERY_TIMEOUT_MS,
    statement_timeout: options.statementTimeoutMillis ?? DEFAULT_STATEMENT_TIMEOUT_MS,
    idleTimeoutMillis: options.idleTimeoutMillis ?? DEFAULT_IDLE_TIMEOUT_MS,
    ...(options.ssl === true ? { ssl: { rejectUnauthorized: true } } : {}),
  };
}

export async function connectPostgresAccountStore(connectionString, options = {}) {
  const { Pool } = await import("pg");
  const pool = new Pool(postgresPoolOptions(connectionString, options));
  const store = new PostgresAccountStore(pool, { ownsPool: true });
  try {
    await store.initialize();
    return store;
  } catch (error) {
    await pool.end().catch(() => {});
    throw error;
  }
}

export { STORE_SCHEMA as POSTGRES_STORE_SCHEMA };
