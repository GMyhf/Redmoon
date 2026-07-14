import { randomUUID } from "node:crypto";
import {
  chmodSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { appendFile, chmod, copyFile, open, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { WebSocket, WebSocketServer } from "ws";

import {
  BASE_STATS,
  EQUIP_KEYS,
  FRIEND_LIMIT,
  INVENTORY_LIMIT,
  ITEM_SLOTS,
  LEVEL_CAP,
  MAX_ITEM_SEQUENCE,
  PROTOCOL_VERSION,
  QUEST_CHAIN,
  REBIRTH_LEVEL,
  REPUTATION_LIMIT,
  SNAPSHOT_RATE,
  SKILL_SLOTS,
  STAT_KEYS,
  TICK_RATE,
  publicArchetypes,
} from "./definitions.js";
import { BINARY_CODEC, encodeSnapshotBinary } from "./codec.js";
import { connectPostgresAccountStore } from "./postgres-store.js";
import { hashSecret } from "./session.js";
import { createSeededRandom } from "./random.js";
import { DungeonWorkerTransport } from "./dungeon-transport.js";
import { sanitizeName, World, WorldError } from "./world.js";

const DEFAULT_PUBLIC_DIR = fileURLToPath(new URL("../../public/", import.meta.url));
const MAX_MESSAGE_BYTES = 16 * 1024;
// accounts.json format version. Bump on any breaking layout change and
// teach migrateAccountStore() how to read the previous shape.
const ACCOUNT_SCHEMA = 1;
// Account files hold credential digests and recovery metadata; keep them owner-only.
const STORE_FILE_MODE = 0o600;
const STORE_DIR_MODE = 0o700;
const RUNTIME_SAMPLE_LIMIT = 600;
const AUDIT_FLUSH_THRESHOLD = 250;
const AUDIT_FLUSH_COOLDOWN_MS = 5_000;
const MAX_PERSISTED_POINTS = 1_000_000;
const MAX_PERSISTED_COUNTER = 1_000_000_000;
const MAX_PERSISTED_CURRENCY = 1_000_000_000_000;
const MAX_PERSISTED_STAT = 1_000_000;
const MAX_ITEM_MODIFIER = 1_000_000;
const DURABLE_SECURITY_COMMANDS = new Set([
  "join", "start", "recover", "sessionRotate", "recoveryIssue",
]);
const RELIABLE_BACKGROUND_EVENTS = new Set(["partyInvited"]);
const COMMAND_TYPE_ALIASES = Object.freeze({
  start: "join",
  upgradeSkill: "upgrade",
  upgradeskill: "upgrade",
  sessionrotate: "sessionRotate",
  recoveryissue: "recoveryIssue",
  dungeonenter: "dungeonEnter",
  dungeonleave: "dungeonLeave",
});

const CONTENT_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
});

export class GameServer {
  constructor(options = {}) {
    this.host = options.host ?? process.env.HOST ?? "127.0.0.1";
    this.port = parsePort(options.port ?? process.env.PORT ?? 3000);
    this.tickRate = positiveRate(options.tickRate, TICK_RATE);
    this.snapshotRate = positiveRate(options.snapshotRate, SNAPSHOT_RATE);
    this.publicDir = path.resolve(options.publicDir ?? DEFAULT_PUBLIC_DIR);
    // Per-connection token bucket: the client legitimately peaks around the
    // 20 Hz input rate plus a burst of UI commands, so the defaults leave
    // ample headroom while starving a flooding socket.
    this.rateLimit = {
      capacity: positiveRate(options.rateLimit?.capacity, 120),
      refillPerSecond: positiveRate(options.rateLimit?.refillPerSecond, 60),
    };
    const skipBytes = positiveInteger(
      options.backpressure?.skipBytes ?? process.env.WS_BACKPRESSURE_SKIP_BYTES,
      256 * 1024,
    );
    this.backpressure = {
      skipBytes,
      disconnectBytes: Math.max(skipBytes + 1, positiveInteger(
        options.backpressure?.disconnectBytes ?? process.env.WS_BACKPRESSURE_DISCONNECT_BYTES,
        2 * 1024 * 1024,
      )),
      maxSkippedFrames: positiveInteger(
        options.backpressure?.maxSkippedFrames ?? process.env.WS_BACKPRESSURE_MAX_SKIPS,
        50,
      ),
    };
    this.heartbeat = {
      intervalMs: positiveRate(
        options.heartbeat?.intervalMs ?? process.env.WS_HEARTBEAT_INTERVAL_MS,
        15_000,
      ),
    };
    this.reconnectGraceMs = nonNegativeRate(
      options.reconnectGraceMs ?? process.env.WS_RECONNECT_GRACE_MS,
      300_000,
    );
    this.readinessLimits = {
      tickStaleMs: positiveRate(
        options.readiness?.tickStaleMs ?? process.env.READY_TICK_STALE_MS,
        Math.max(1_000, (10_000 / this.tickRate)),
      ),
      maxConsecutiveTickErrors: positiveInteger(
        options.readiness?.maxConsecutiveTickErrors
          ?? process.env.READY_MAX_CONSECUTIVE_TICK_ERRORS,
        3,
      ),
      eventLoopLagP99Ms: nonNegativeRate(
        options.readiness?.eventLoopLagP99Ms ?? process.env.READY_EVENT_LOOP_LAG_P99_MS,
        250,
      ),
      snapshotP99Ms: nonNegativeRate(
        options.readiness?.snapshotP99Ms ?? process.env.READY_SNAPSHOT_P99_MS,
        250,
      ),
      wsBacklogBytes: positiveInteger(
        options.readiness?.wsBacklogBytes ?? process.env.READY_WS_BACKLOG_BYTES,
        skipBytes,
      ),
    };
    this.allowedOrigins = parseAllowedOrigins(
      options.allowedOrigins ?? process.env.ALLOWED_ORIGINS,
    );
    // PostgreSQL is the long-running deployment backend. The owner-only JSON
    // store remains the zero-setup local/default backend.
    this.accountRepository = options.accountRepository ?? null;
    const hasConfiguredPersistPath = options.persistPath !== undefined
      || process.env.PERSIST_PATH !== undefined;
    this.persistPath = this.accountRepository
      ? ""
      : (options.persistPath !== undefined
        ? options.persistPath
        : (process.env.PERSIST_PATH ?? path.resolve("data/accounts.json")));
    this.managePersistDirectory = options.managePersistDirectory !== undefined
      ? options.managePersistDirectory === true
      : environmentFlag(process.env.PERSIST_MANAGE_DIRECTORY, !hasConfiguredPersistPath);
    const accountStore = options.accountStore
      ?? (this.accountRepository ? {} : loadAccountStore(this.persistPath, {
        manageDirectory: this.managePersistDirectory,
      }));
    this.world = options.world ?? new World({ ...options.worldOptions, accountStore });
    this.enableDungeonWorkers = options.enableDungeonWorkers !== false;
    this.dungeonWorkerFactory = options.dungeonWorkerFactory
      ?? ((workerOptions) => new DungeonWorkerTransport(workerOptions));
    this.world.dungeonWorkerEnabled = this.enableDungeonWorkers;
    this._dungeonWorkers = new Map();
    this._dungeonTickPromise = Promise.resolve();
    this._persistTimer = null;
    this._savePromise = Promise.resolve();
    this._securityQueue = Promise.resolve();
    this._securityActive = false;
    // PostgreSQL only needs records that changed since the last successful
    // flush. Values are generations so an older in-flight save cannot clear a
    // newer mutation of the same account.
    this._dirtyAccountVersions = new Map();
    this._dirtyAccountSequence = 0;
    this._lastPersistError = null;
    this._lastPersistAt = null;
    this._persistFailureCount = 0;
    this._lastAuditError = null;
    this._lastBackupError = null;
    this._lastDurabilityError = null;
    this._syncDirectory = options.syncDirectory ?? syncDirectory;
    // Rotated backups beside the live store: at most one per interval,
    // pruned to `keep` files (defaults: hourly, keep 48 ≈ two days).
    this.backup = {
      intervalMs: positiveRate(
        options.backup?.intervalMs ?? process.env.PERSIST_BACKUP_INTERVAL_MS, 3_600_000),
      keep: Math.max(1, Math.floor(positiveRate(
        options.backup?.keep ?? process.env.PERSIST_BACKUP_KEEP, 48))),
    };
    this._lastBackupAt = 0;
    this.httpServer = createHttpServer((request, response) => {
      this._handleHttp(request, response).catch((error) => {
        console.error("HTTP request failed", error);
        if (!response.headersSent) {
          sendJson(response, 500, { error: "Internal server error" });
        } else {
          response.destroy();
        }
      });
    });
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
    this._timer = null;
    this._heartbeatTimer = null;
    this._snapshotCounter = 0;
    this._rosterCounter = 0;
    this._closed = false;
    this._auditFlushScheduled = false;
    this._nextAuditFlushAt = 0;
    this._connectionCleanup = new Set();
    this._reconnectTimers = new Map();
    this._runtime = {
      startedAt: new Date().toISOString(),
      hasSuccessfulTick: false,
      lastTickAt: null,
      lastTickAtMonotonic: null,
      consecutiveTickErrors: 0,
      totalTickErrors: 0,
      lastTickError: null,
      eventLoopLagMs: new SampleWindow(RUNTIME_SAMPLE_LIMIT),
      snapshotDurationMs: new SampleWindow(RUNTIME_SAMPLE_LIMIT),
      snapshotsSent: 0,
      snapshotsSkipped: 0,
      droppableFramesSkipped: 0,
      backpressureDisconnects: 0,
      heartbeatDisconnects: 0,
      maxWsBacklogBytes: 0,
    };

    this.httpServer.on("upgrade", (request, socket, head) => {
      let pathname;
      try {
        pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      } catch {
        socket.destroy();
        return;
      }
      if (pathname !== "/ws") {
        socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      if (!this._originAllowed(request.headers.origin)) {
        socket.write(
          "HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\nVary: Origin\r\n\r\n",
        );
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (websocket) => {
        this.wss.emit("connection", websocket, request);
      });
    });
    this.wss.on("connection", (socket, request) => this._handleConnection(socket, request));
  }

  async listen(port = this.port, host = this.host) {
    if (this.httpServer.listening) return this.address();
    this.port = parsePort(port);
    this.host = host;
    this._closed = false;
    // Fail closed before accepting HTTP/WebSocket traffic when the configured
    // store cannot complete a real durability check. PostgreSQL empty saves
    // issue SELECT 1; JSON writes and fsyncs the current account snapshot.
    if (this._persistenceEnabled()) await this._saveAccounts({ accountKeys: [] });
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        this.httpServer.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.httpServer.off("error", onError);
        resolve();
      };
      this.httpServer.once("error", onError);
      this.httpServer.once("listening", onListening);
      this.httpServer.listen(this.port, this.host);
    });
    this._startLoop();
    this._startHeartbeat();
    if (this._persistenceEnabled() && !this._persistTimer) {
      this._persistTimer = setInterval(() => {
        this._saveAccounts().catch((error) => console.error("Account save failed", error));
      }, 30_000);
      this._persistTimer.unref?.();
    }
    return this.address();
  }

  async _saveAccounts(options = {}) {
    if (!this._persistenceEnabled()) return;
    if (this._securityActive && options.allowDuringSecurity !== true) {
      await this._securityQueue;
      return this._saveAccounts(options);
    }
    let accountKeys = null;
    let dirtyVersions = null;
    if (this.accountRepository) {
      const requestedKeys = Array.isArray(options.accountKeys)
        ? options.accountKeys
        : [...this._dirtyAccountVersions.keys(), ...this._activeAccountKeys()];
      accountKeys = [...new Set(requestedKeys.filter((accountKey) => (
        typeof accountKey === "string" && accountKey.length > 0
      )))];
      this._markAccountsDirty(accountKeys);
      dirtyVersions = Object.fromEntries(accountKeys.map((accountKey) => [
        accountKey,
        this._dirtyAccountVersions.get(accountKey),
      ]));
    }
    // Keep account records at the call boundary: a normal save may already be
    // queued when another connection starts an uncommitted credential change.
    // Cloning those records later could leak that credential into the older
    // transaction. Audit IDs establish the same boundary without cloning the
    // entries yet; the writer filters the current queue after prior writes
    // acknowledge their IDs, so concurrent saves cannot append duplicates.
    const auditIds = new Set(this.world.auditLog.map((entry) => entry.id));
    const accountSnapshot = {
      accounts: structuredClone(this.world.syncAccounts(accountKeys)),
      dirtyVersions,
    };
    // Serialize writers so the timer, disconnect flushes, and close cannot
    // interleave on the same temp file.
    this._savePromise = this._savePromise.catch(() => {}).then(
      () => this._writeAccounts({
        ...accountSnapshot,
        audits: this.world.peekAuditLog().filter((entry) => auditIds.has(entry.id)),
      }),
    ).catch((error) => {
      this._persistFailureCount += 1;
      this._lastPersistError = {
        message: error instanceof Error ? error.message : String(error),
        at: new Date().toISOString(),
      };
      // One structured line per failure: greppable in journald and easy to
      // wire into log-based alerting.
      console.error(JSON.stringify({
        event: "persistence_failure",
        at: this._lastPersistError.at,
        consecutiveFailures: this._persistFailureCount,
        backend: this.accountRepository ? "postgresql" : "json",
        ...(this.persistPath ? { path: this.persistPath } : {}),
        message: this._lastPersistError.message,
      }));
      throw error;
    });
    return this._savePromise;
  }

  async _writeAccounts({ accounts, audits, dirtyVersions }) {
    if (this.accountRepository) {
      await this.accountRepository.saveAccounts(accounts, audits);
      this.world.acknowledgeAuditLog(audits);
      this._acknowledgeDirtyAccounts(dirtyVersions);
      this._lastAuditError = null;
      this._markPersistSuccess();
      return;
    }

    const payload = JSON.stringify({
      schema: ACCOUNT_SCHEMA,
      savedAt: new Date().toISOString(),
      accounts,
    });
    const storeDirectory = path.dirname(this.persistPath);
    const createdDirectory = mkdirSync(storeDirectory, { recursive: true, mode: STORE_DIR_MODE });
    if (createdDirectory || this.managePersistDirectory) {
      await chmod(storeDirectory, STORE_DIR_MODE);
    }
    // Write-then-rename keeps the store intact if the process dies mid-flush;
    // the previous good copy survives as .bak.
    const tempPath = `${this.persistPath}.tmp`;
    await writeFile(tempPath, payload, { encoding: "utf8", mode: STORE_FILE_MODE });
    // mkdir/writeFile modes only apply on creation and pass through umask;
    // chmod pins pre-existing files to the expected permissions too.
    await chmod(tempPath, STORE_FILE_MODE);
    await syncFile(tempPath);
    if (existsSync(this.persistPath)) {
      const bakPath = `${this.persistPath}.bak`;
      await copyFile(this.persistPath, bakPath);
      await chmod(bakPath, STORE_FILE_MODE);
      await syncFile(bakPath);
    }
    await rename(tempPath, this.persistPath);
    try {
      await this._syncDirectory(storeDirectory);
      this._lastDurabilityError = null;
    } catch (error) {
      this._lastDurabilityError = persistenceSubError(error);
      console.error(JSON.stringify({
        event: "persistence_fsync_failure",
        at: this._lastDurabilityError.at,
        path: storeDirectory,
        message: this._lastDurabilityError.message,
      }));
      throw error;
    }
    // The account store is already durable here. Audit append failures stay
    // queued and make readiness fail, but must not hide a newly durable token
    // from the client and lock that account out.
    if (audits.length > 0) {
      try {
        const auditPath = `${this.persistPath}.audit.jsonl`;
        await appendFile(
          auditPath,
          `${audits.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
          { encoding: "utf8", mode: STORE_FILE_MODE },
        );
        await chmod(auditPath, STORE_FILE_MODE);
        await syncFile(auditPath);
        // The first append may create the audit file. Sync its parent before
        // acknowledging entries so a power loss cannot drop that directory
        // entry after readiness reported the audit queue as durable.
        await this._syncDirectory(storeDirectory);
        this.world.acknowledgeAuditLog(audits);
        this._lastAuditError = null;
      } catch (error) {
        this._lastAuditError = {
          message: error instanceof Error ? error.message : String(error),
          at: new Date().toISOString(),
        };
        console.error(JSON.stringify({
          event: "audit_persistence_failure",
          at: this._lastAuditError.at,
          path: `${this.persistPath}.audit.jsonl`,
          pending: this.world.auditLog.length,
          message: this._lastAuditError.message,
        }));
      }
    }
    this._markPersistSuccess();
    try {
      await this._rotateBackups();
      this._lastBackupError = null;
    } catch (error) {
      this._lastBackupError = persistenceSubError(error);
      console.error(JSON.stringify({
        event: "backup_persistence_failure",
        at: this._lastBackupError.at,
        path: `${this.persistPath}.backups`,
        message: this._lastBackupError.message,
      }));
    }
  }

  _markPersistSuccess() {
    this._lastPersistError = null;
    this._persistFailureCount = 0;
    this._lastPersistAt = new Date().toISOString();
  }

  _persistenceEnabled() {
    return Boolean(this.accountRepository || this.persistPath);
  }

  _scheduleAuditFlush() {
    const now = Date.now();
    if (this._closed || !this._persistenceEnabled() || this._auditFlushScheduled
      || this.world.auditLog.length < AUDIT_FLUSH_THRESHOLD || now < this._nextAuditFlushAt) {
      return;
    }
    this._auditFlushScheduled = true;
    this._nextAuditFlushAt = now + AUDIT_FLUSH_COOLDOWN_MS;
    this._saveAccounts({ allowDuringSecurity: true, accountKeys: [] })
      .catch(() => {})
      .finally(() => {
        this._auditFlushScheduled = false;
      });
  }

  _activeAccountKeys() {
    return [...new Set([...this.world.players.values()]
      .map((player) => this.world._accountKey(player.name))
      .filter(Boolean))];
  }

  _markAccountsDirty(accountKeys) {
    if (!this.accountRepository) return;
    for (const accountKey of accountKeys ?? []) {
      if (typeof accountKey !== "string" || accountKey.length === 0) continue;
      this._dirtyAccountVersions.set(accountKey, ++this._dirtyAccountSequence);
    }
  }

  _acknowledgeDirtyAccounts(versions) {
    if (!versions) return;
    for (const [accountKey, version] of Object.entries(versions)) {
      if (this._dirtyAccountVersions.get(accountKey) === version) {
        this._dirtyAccountVersions.delete(accountKey);
      }
    }
  }

  async _rotateBackups() {
    const now = Date.now();
    if (now - this._lastBackupAt < this.backup.intervalMs) return;
    const directory = `${this.persistPath}.backups`;
    mkdirSync(directory, { recursive: true, mode: STORE_DIR_MODE });
    await chmod(directory, STORE_DIR_MODE);
    const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(directory, `accounts-${stamp}.json`);
    await copyFile(this.persistPath, backupPath);
    await chmod(backupPath, STORE_FILE_MODE);
    const entries = (await readdir(directory))
      .filter((name) => name.startsWith("accounts-") && name.endsWith(".json"))
      .sort();
    for (const stale of entries.slice(0, Math.max(0, entries.length - this.backup.keep))) {
      await unlink(path.join(directory, stale));
    }
    this._lastBackupAt = now;
  }

  _persistenceStatus() {
    return {
      enabled: this._persistenceEnabled(),
      backend: this.accountRepository ? "postgresql" : (this.persistPath ? "json" : "disabled"),
      ok: !this._persistenceEnabled()
        || (!this._lastPersistError
          && !this._lastAuditError
          && !this._lastBackupError
          && !this._lastDurabilityError),
      lastSavedAt: this._lastPersistAt,
      lastErrorAt: this._lastPersistError?.at ?? null,
      consecutiveFailures: this._persistFailureCount,
      auditPending: this.world.auditLog.length,
      auditDropped: this.world.auditDropped,
      auditErrorAt: this._lastAuditError?.at ?? null,
      backupErrorAt: this._lastBackupError?.at ?? null,
      durabilityErrorAt: this._lastDurabilityError?.at ?? null,
    };
  }

  address() {
    return this.httpServer.address();
  }

  async close() {
    if (this._closed) return;
    this._closed = true;
    this._markAccountsDirty(this._activeAccountKeys());
    for (const timer of this._reconnectTimers.values()) clearTimeout(timer);
    this._reconnectTimers.clear();
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    if (this._persistTimer) {
      clearInterval(this._persistTimer);
      this._persistTimer = null;
    }
    await Promise.allSettled([...this._dungeonWorkers.values()].map((transport) => transport.recycle("server_shutdown")));
    this._dungeonWorkers.clear();
    const httpClosed = this.httpServer.listening
      ? new Promise((resolve) => {
        this.httpServer.close(() => resolve());
        this.httpServer.closeIdleConnections?.();
        this.httpServer.closeAllConnections?.();
      })
      : Promise.resolve();
    for (const socket of this.wss.clients) socket.terminate();
    await Promise.all([
      new Promise((resolve) => this.wss.close(() => resolve())),
      httpClosed,
    ]);
    await Promise.allSettled([...this._connectionCleanup]);
    await this._securityQueue.catch(() => {});
    for (const player of [...this.world.players.values()]) {
      if (player.connectionDetached) this.world.removePlayer(player.id);
    }
    let finalSaveError = null;
    try {
      await this._saveAccounts();
      await this._savePromise;
      const finalStatus = this._persistenceStatus();
      if (!finalStatus.ok) {
        const reasons = [
          finalStatus.auditPending > 0 ? `${finalStatus.auditPending} pending audit entries` : null,
          finalStatus.auditErrorAt ? "audit persistence failure" : null,
          finalStatus.backupErrorAt ? "backup persistence failure" : null,
          finalStatus.durabilityErrorAt ? "filesystem durability failure" : null,
        ].filter(Boolean);
        throw new Error(`Final persistence health check failed: ${reasons.join(", ")}`);
      }
    } catch (error) {
      finalSaveError = error;
      console.error("Final account save failed", error);
    } finally {
      await this.accountRepository?.close?.();
    }
    if (finalSaveError) throw finalSaveError;
  }

  _startLoop() {
    if (this._timer) return;
    const interval = 1000 / this.tickRate;
    // Time-accumulator stepping: when the event loop is busy and the timer
    // fires late, the world catches up with extra fixed steps instead of
    // silently running in slow motion. Capped to avoid a death spiral.
    let lastTime = performance.now();
    let backlog = 0;
    this._runtime.startedAt = new Date().toISOString();
    this._runtime.hasSuccessfulTick = false;
    this._runtime.lastTickAt = null;
    this._runtime.lastTickAtMonotonic = null;
    this._timer = setInterval(() => {
      const now = performance.now();
      const elapsed = Math.max(0, now - lastTime);
      this._runtime.eventLoopLagMs.add(Math.max(0, elapsed - interval));
      lastTime = now;
      let tickAdvanced = false;
      try {
        backlog = Math.min(backlog + elapsed, interval * 5);
        while (backlog >= interval) {
          backlog -= interval;
          this.world.update(1 / this.tickRate);
          this._queueDungeonTick(1 / this.tickRate);
          tickAdvanced = true;
          this._runtime.hasSuccessfulTick = true;
          this._runtime.lastTickAt = new Date().toISOString();
          this._runtime.lastTickAtMonotonic = performance.now();
        }
        for (const event of this.world.drainEvents()) {
          this._broadcastEvent(event);
        }
        this._snapshotCounter += 1;
        const snapshotEvery = Math.max(1, Math.round(this.tickRate / this.snapshotRate));
        if (this._snapshotCounter >= snapshotEvery) {
          this._snapshotCounter = 0;
          // One shared per-map build for the whole broadcast; only the
          // recipient's own full entry is serialized per socket.
          const recipients = [...this.wss.clients].filter((socket) => (
            socket.readyState === WebSocket.OPEN
            && socket.clientVisible !== false
            && this.world.players.has(socket.playerId)
            && !this.world.players.get(socket.playerId).pendingAuth
            && !this.world.players.get(socket.playerId).connectionDetached
          ));
          if (recipients.length > 0) {
            const snapshotStartedAt = performance.now();
            const sharedCache = new Map();
            try {
              for (const socket of recipients) this._sendSnapshot(socket, sharedCache);
            } finally {
              this._runtime.snapshotDurationMs.add(performance.now() - snapshotStartedAt);
            }
          }
        }
        // Lobby sockets (connected, not joined) get a light roster once a
        // second so the character screen shows who is online where.
        this._rosterCounter += 1;
        if (this._rosterCounter >= this.tickRate) {
          this._rosterCounter = 0;
          let payload = null;
          for (const socket of this.wss.clients) {
            if (socket.readyState !== WebSocket.OPEN || this.world.players.has(socket.playerId)) continue;
            payload ??= JSON.stringify({ type: "roster", players: this.world.getRoster() });
            this._sendPayload(socket, payload, { droppable: true });
          }
        }
        if (tickAdvanced) this._runtime.consecutiveTickErrors = 0;
      } catch (error) {
        this._runtime.consecutiveTickErrors += 1;
        this._runtime.totalTickErrors += 1;
        this._runtime.lastTickError = {
          at: new Date().toISOString(),
          message: error instanceof Error ? error.message : String(error),
        };
        console.error("World tick failed", error);
      }
    }, interval);
    this._timer.unref?.();
  }

  _dungeonForPlayer(playerId) {
    const player = this.world.players.get(playerId);
    if (!player) return null;
    return [...this.world.dungeons.values()].find((dungeon) => dungeon.members.has(playerId)) ?? null;
  }

  async _startDungeonWorker(dungeon) {
    if (!this.enableDungeonWorkers || dungeon.workerTransport) return;
    const epoch = (dungeon.workerEpoch ?? 0) + 1;
    const transport = this.dungeonWorkerFactory({
      instanceId: dungeon.id,
      workerEpoch: epoch,
    });
    try {
      await transport.open({
        plan: dungeon.plan,
        rngState: this.world.getRandomState() ?? createSeededRandom(dungeon.id).getState(),
        width: this.world.width,
        height: this.world.height,
        checkpointIntervalTicks: 20,
      });
      dungeon.workerEpoch = epoch;
      dungeon.workerTransport = transport;
      this._dungeonWorkers.set(dungeon.id, transport);
      for (const memberId of dungeon.members) {
        const player = this.world.players.get(memberId);
        if (!player) continue;
        const attached = await transport.attach(memberId, dungeon.ticket, player, player.inputSeq);
        this.world.applyDungeonWorkerSnapshot(dungeon.id, attached.snapshot, attached.stateVersion);
      }
    } catch (error) {
      await transport.close().catch(() => {});
      this._dungeonWorkers.delete(dungeon.id);
      if (this.world.dungeons.has(dungeon.id)) this.world.failDungeon(dungeon.id, "worker_lost");
      throw new WorldError("DUNGEON_WORKER_UNAVAILABLE", `Dungeon worker failed to start: ${error.message}`);
    }
  }

  async _attachDungeonPlayer(dungeon, playerId) {
    const transport = dungeon?.workerTransport;
    const player = this.world.players.get(playerId);
    if (!transport || !player) throw new WorldError("DUNGEON_WORKER_UNAVAILABLE", "Dungeon worker is unavailable.");
    const attached = await transport.attach(playerId, dungeon.ticket, player, player.inputSeq);
    this.world.applyDungeonWorkerSnapshot(dungeon.id, attached.snapshot, attached.stateVersion);
  }

  async _routeDungeonInput(dungeon, playerId, message) {
    if (!dungeon?.workerTransport) throw new WorldError("DUNGEON_WORKER_UNAVAILABLE", "Dungeon worker is unavailable.");
    const player = this.world.players.get(playerId);
    await dungeon.workerTransport.input(playerId, player.inputSeq, message);
  }

  async _detachDungeonPlayer(dungeon, playerId) {
    if (!dungeon?.workerTransport) return;
    await dungeon.workerTransport.detach(playerId, this.world.time + this.world.dungeonDuration).catch(() => {});
    if (!this.world.dungeons.has(dungeon.id)) await this._recycleDungeonWorker(dungeon.id, "empty");
  }

  async _recycleDungeonWorker(id, reason = "normal") {
    const transport = this._dungeonWorkers.get(id);
    this._dungeonWorkers.delete(id);
    const dungeon = this.world.dungeons.get(id);
    if (dungeon) dungeon.workerTransport = null;
    await transport?.recycle(reason).catch(() => {});
  }

  _queueDungeonTick(dt) {
    this._dungeonTickPromise = this._dungeonTickPromise
      .catch(() => {})
      .then(() => this._tickDungeonWorkers(dt));
  }

  async _tickDungeonWorkers(dt) {
    for (const dungeon of [...this.world.dungeons.values()]) {
      const transport = dungeon.workerTransport;
      if (!transport) continue;
      try {
        const result = await transport.tick(this.world.tick, dt, this.world.time, []);
        await this._applyDungeonTickResult(dungeon, result);
      } catch (error) {
        await this._handleDungeonWorkerFailure(dungeon, error);
      }
    }
    for (const id of [...this._dungeonWorkers.keys()]) {
      if (!this.world.dungeons.has(id)) await this._recycleDungeonWorker(id, "instance_closed");
    }
  }

  async _applyDungeonTickResult(dungeon, result) {
    if (!this.world.dungeons.has(dungeon.id)) return;
    for (const event of result.events ?? []) {
      if (event.event === "enemyDefeated" && typeof event.enemyId === "string") {
        dungeon.remaining.delete(event.enemyId);
      }
      this.world.events.push({
        ...event,
        tick: this.world.tick,
        serverTime: this.world.time,
      });
    }
    this.world.applyDungeonWorkerSnapshot(dungeon.id, result.snapshot, result.stateVersion);
    if (dungeon.remaining.size === 0 && !dungeon.settlement) {
      dungeon.settlementRequestId ??= `${dungeon.id}:state-${result.stateVersion}`;
      const settlement = await dungeon.workerTransport.settle(dungeon.settlementRequestId);
      this.world.settleDungeon(dungeon.id, {
        ...settlement,
        instanceId: dungeon.id,
      });
    }
  }

  async _handleDungeonWorkerFailure(dungeon, error) {
    if (this.world.dungeons.has(dungeon.id)) {
      try {
        this.world.failDungeon(dungeon.id, "worker_lost", dungeon.stateVersion);
      } catch (failure) {
        console.error("Dungeon worker failure handling failed", failure);
      }
    }
    await this._recycleDungeonWorker(dungeon.id, "worker_lost");
    if (error) console.error("Dungeon worker failed", error);
  }

  _startHeartbeat() {
    if (this._heartbeatTimer) return;
    this._heartbeatTimer = setInterval(() => {
      for (const socket of this.wss.clients) {
        if (socket.readyState !== WebSocket.OPEN) continue;
        if (!socket.isAlive) {
          this._terminateSocket(socket, "heartbeat");
          continue;
        }
        socket.isAlive = false;
        try {
          socket.ping();
        } catch {
          this._terminateSocket(socket, "heartbeat");
        }
      }
    }, this.heartbeat.intervalMs);
    this._heartbeatTimer.unref?.();
  }

  _handleConnection(socket, request = null) {
    socket.playerId = randomUUID();
    socket.auditOrigin = typeof request?.headers?.origin === "string"
      ? request.headers.origin.slice(0, 256)
      : null;
    socket.isAlive = true;
    socket.clientVisible = true;
    socket.deliveryPaused = false;
    socket.backpressureSkips = 0;
    socket.on("pong", () => {
      socket.isAlive = true;
    });
    this._sendMessage(socket, {
      type: "welcome",
      protocol: PROTOCOL_VERSION,
      id: socket.playerId,
      clientId: socket.playerId,
      playerId: socket.playerId,
      tickRate: this.tickRate,
      snapshotRate: this.snapshotRate,
      world: {
        name: this.world.name,
        width: this.world.width,
        height: this.world.height,
        mapId: "town",
        theme: "town",
        safeZone: this.world.safeZone ? { ...this.world.safeZone } : null,
        portals: this.world.portals.filter((portal) => portal.mapId === "town").map((portal) => ({ ...portal })),
        zones: [],
        shops: this.world.shops.map((shop) => ({ id: shop.id, name: shop.name, x: shop.x, y: shop.y, goods: shop.goods.map((good) => ({ ...good })) })),
      },
      rebirthLevel: REBIRTH_LEVEL,
      inventoryLimit: INVENTORY_LIMIT,
      archetypes: publicArchetypes(),
      roster: this.world.getRoster(),
    });

    socket.rateBucket = { tokens: this.rateLimit.capacity, refilledAt: Date.now() };
    socket.commandQueue = Promise.resolve();
    socket.on("message", (data, isBinary) => {
      if (this._closed) return;
      if (!this._takeRateToken(socket)) {
        // Answer at most once a second so the throttle itself cannot be
        // used to amplify the flood.
        const now = Date.now();
        if (now - (socket.rateWarnedAt ?? 0) >= 1000) {
          socket.rateWarnedAt = now;
          this._sendError(socket, "RATE_LIMITED", "Too many messages; slow down.");
        }
        return;
      }
      if (isBinary) {
        this._sendError(socket, "INVALID_MESSAGE", "Binary messages are not supported.");
        return;
      }
      if (data.byteLength > MAX_MESSAGE_BYTES) {
        this._sendError(socket, "MESSAGE_TOO_LARGE", "Message exceeds 16 KiB.");
        return;
      }

      let message;
      try {
        message = JSON.parse(data.toString("utf8"));
      } catch {
        this._sendError(socket, "INVALID_JSON", "Message is not valid JSON.");
        return;
      }

      if (!message || typeof message !== "object" || Array.isArray(message)) {
        this._sendError(socket, "INVALID_MESSAGE", "Message must be a JSON object.");
        return;
      }
      if (typeof message.type !== "string" || message.type.length < 1 || message.type.length > 64) {
        this._sendError(socket, "INVALID_MESSAGE", "Message type must be a string of 1-64 characters.");
        return;
      }

      // Preserve client command order while durable account writes are in
      // flight. In particular, never acknowledge a new credential before it
      // is committed to the configured store.
      socket.commandQueue = socket.commandQueue.catch(() => {}).then(
        () => this._processCommand(socket, message),
      );
    });

    socket.once("close", () => {
      // Flush right away so a crash costs at most the autosave interval of
      // still-connected players, never a departed one.
      const cleanup = socket.commandQueue.catch(() => {}).then(async () => {
        const player = this.world.players.get(socket.playerId);
        const dungeon = this._dungeonForPlayer(socket.playerId);
        const accountKey = player ? this.world._accountKey(player.name) : null;
        this._markAccountsDirty(accountKey ? [accountKey] : []);
        const changed = !this._closed && this.reconnectGraceMs > 0
          ? this.world.detachPlayer(socket.playerId)
          : this.world.removePlayer(socket.playerId);
        if (changed && !this._closed && this.reconnectGraceMs > 0) {
          this._scheduleReconnectExpiry(socket.playerId);
        }
        if (changed) await this._detachDungeonPlayer(dungeon, socket.playerId);
        if (changed && this._persistenceEnabled() && !this._closed) {
          await this._saveAccounts({ accountKeys: accountKey ? [accountKey] : null });
        }
      });
      this._connectionCleanup.add(cleanup);
      cleanup.catch((error) => console.error("Account save failed", error)).finally(() => {
        this._connectionCleanup.delete(cleanup);
      });
    });
    socket.on("error", () => {
      // A close event follows; command errors are sent through the protocol.
    });
  }

  _scheduleReconnectExpiry(playerId) {
    this._cancelReconnectExpiry(playerId);
    const timer = setTimeout(() => {
      this._expireDetachedPlayer(playerId, timer).catch((error) => {
        console.error("Reconnect grace cleanup failed", error);
      });
    }, this.reconnectGraceMs);
    timer.unref?.();
    this._reconnectTimers.set(playerId, timer);
  }

  _cancelReconnectExpiry(playerId) {
    const timer = this._reconnectTimers.get(playerId);
    if (!timer) return;
    clearTimeout(timer);
    this._reconnectTimers.delete(playerId);
  }

  async _expireDetachedPlayer(playerId, expectedTimer = null) {
    const timer = this._reconnectTimers.get(playerId);
    if (expectedTimer && timer !== expectedTimer) return false;
    if (timer) clearTimeout(timer);
    this._reconnectTimers.delete(playerId);

    const player = this.world.players.get(playerId);
    if (!player?.connectionDetached) return false;
    const accountKey = this.world._accountKey(player.name);
    this._markAccountsDirty([accountKey]);
    const removed = this.world.removePlayer(playerId);
    if (removed && this._persistenceEnabled() && !this._closed) {
      await this._saveAccounts({ accountKeys: [accountKey] });
    }
    return removed;
  }

  async _processCommand(socket, message) {
    if (this._closed) return null;
    const canonicalType = Object.hasOwn(COMMAND_TYPE_ALIASES, message.type)
      ? COMMAND_TYPE_ALIASES[message.type]
      : message.type;
    if (canonicalType !== message.type) message = { ...message, type: canonicalType };
    if (!DURABLE_SECURITY_COMMANDS.has(message.type)) {
      return this._processCommandNow(socket, message);
    }
    const operation = this._securityQueue.catch(() => {}).then(async () => {
      // SIGTERM terminates sockets before draining queues. Commands that had
      // not started by then must not extend shutdown with another durable
      // transaction; the client keeps its pending credential and retries.
      if (this._closed) return null;
      this._securityActive = true;
      try {
        return await this._processCommandNow(socket, message);
      } finally {
        this._securityActive = false;
      }
    });
    this._securityQueue = operation.catch(() => {});
    return operation;
  }

  async _processCommandNow(socket, message) {
    const commandPlayer = this.world.players.get(socket.playerId);
    const dungeonBeforeCommand = this._dungeonForPlayer(socket.playerId);
    const commandAccountKey = commandPlayer
      ? this.world._accountKey(commandPlayer.name)
      : null;
    let securityCheckpoint = DURABLE_SECURITY_COMMANDS.has(message.type)
      ? this._securityCheckpoint(socket, message)
      : null;
    try {
      if (message.type === "clientState") {
        if (typeof message.visible !== "boolean") {
          throw new WorldError("INVALID_MESSAGE", "clientState.visible must be a boolean.");
        }
        const becameVisible = socket.clientVisible === false && message.visible;
        socket.clientVisible = message.visible;
        socket.backpressureSkips = 0;
        if (becameVisible && commandPlayer && !commandPlayer.connectionDetached) {
          this._sendSnapshot(socket);
          this._sendPendingPartyInvite(socket, commandPlayer.id);
        }
        return null;
      }
      let result = null;
      if (!commandPlayer && ["join", "start", "recover"].includes(message.type)) {
        const resumed = this.world.resumeDetachedPlayer(message);
        if (resumed) {
          socket.playerId = resumed.id;
          this._cancelReconnectExpiry(resumed.id);
          const credentialPromoted = Boolean(
            securityCheckpoint && resumed.token !== securityCheckpoint.token,
          );
          if (!credentialPromoted) securityCheckpoint = null;
          result = resumed;
        }
      }
      if (securityCheckpoint && this._persistenceEnabled()) {
        const joinCreatesCredential = ["join", "start"].includes(message.type)
          && !securityCheckpoint.record?.tokenHash
          && !securityCheckpoint.record?.token;
        if ((joinCreatesCredential || ["recover", "sessionRotate"].includes(message.type))
          && typeof message.nextToken !== "string") {
          throw new WorldError(
            "INVALID_MESSAGE",
            "This credential-changing command requires a client-generated nextToken.",
          );
        }
      }
      result ??= this.world.handleCommand(socket.playerId, message);
      if (message.type === "dungeonEnter") {
        await this._startDungeonWorker(this._dungeonForPlayer(result.id));
      } else if (message.type === "input") {
        const inputDungeon = this._dungeonForPlayer(socket.playerId);
        if (inputDungeon) await this._routeDungeonInput(inputDungeon, socket.playerId, message);
      } else if (message.type === "dungeonLeave" || message.type === "leave") {
        await this._detachDungeonPlayer(dungeonBeforeCommand, socket.playerId);
      } else if (["join", "start", "recover"].includes(message.type)) {
        const resumedDungeon = this._dungeonForPlayer(result?.id);
        if (resumedDungeon?.workerTransport) await this._attachDungeonPlayer(resumedDungeon, result.id);
      }
      const resultAccountKey = result?.name ? this.world._accountKey(result.name) : null;
      this._markAccountsDirty([commandAccountKey, resultAccountKey].filter(Boolean));
      if (securityCheckpoint && !securityCheckpoint.hadPlayer && result) result.pendingAuth = true;
      if (securityCheckpoint) this._captureSecurityEffects(securityCheckpoint);
      if (securityCheckpoint && this._persistenceEnabled()) {
        await this._saveAccounts({
          allowDuringSecurity: true,
          accountKeys: [securityCheckpoint.accountKey],
        });
      }
      if (securityCheckpoint) securityCheckpoint.committed = true;
      if (result?.pendingAuth) delete result.pendingAuth;
      if (securityCheckpoint) this._releaseSecurityEvents(securityCheckpoint);

      if (["join", "start", "recover"].includes(message.type)) {
        // Binary snapshots are opt-in per connection; everything else stays
        // JSON regardless of codec.
        socket.codec = message.codec === BINARY_CODEC ? BINARY_CODEC : null;
        this._sendMessage(socket, {
          type: "session",
          token: result.token,
          name: result.name,
          archetype: result.archetype,
        });
        this._sendSnapshot(socket);
        this._sendPendingPartyInvite(socket, result.id);
      } else if (message.type === "sessionRotate") {
        this._sendMessage(socket, {
          type: "session",
          token: result.token,
          name: result.name,
          archetype: result.archetype,
        });
      } else if (message.type === "recoveryIssue") {
        this._sendMessage(socket, { type: "recovery", ...result });
      } else if (message.type === "dungeonEnter" || message.type === "dungeonLeave") {
        this._sendSnapshot(socket);
      } else if (message.type === "leave") {
        // Same flush guarantee as a disconnect, plus an immediate roster so
        // the character screen fills without waiting for the timer.
        if (this._persistenceEnabled()) {
          await this._saveAccounts({
            accountKeys: commandAccountKey ? [commandAccountKey] : null,
          });
        }
        this._sendMessage(socket, { type: "roster", players: this.world.getRoster() });
      }
    } catch (error) {
      let rolledBack = false;
      if (securityCheckpoint && !securityCheckpoint.committed) {
        if (!securityCheckpoint.captured) this._captureSecurityEffects(securityCheckpoint);
        this._restoreSecurityCheckpoint(socket, securityCheckpoint);
        rolledBack = true;
      }
      if (rolledBack) {
        if (securityCheckpoint.connectionDetached && !this._closed
          && this.world.players.has(securityCheckpoint.playerId)) {
          this._scheduleReconnectExpiry(securityCheckpoint.playerId);
        }
        this.world.recordSecurityAudit(
          error instanceof WorldError
            ? "security_command_rejected"
            : "security_persistence_rolled_back",
          securityCheckpoint.accountKey || null,
          {
            command: String(message?.type ?? "unknown").slice(0, 64),
            code: error instanceof WorldError ? error.code : "INTERNAL_ERROR",
            correlationId: socket.playerId,
            ...(socket.auditOrigin ? { origin: socket.auditOrigin } : {}),
          },
        );
        this._scheduleAuditFlush();
      }
      if (error instanceof WorldError) {
        this._sendError(socket, error.code, error.message, message?.type);
        return;
      }
      console.error("WebSocket command failed", error);
      this._sendError(socket, "INTERNAL_ERROR", "The command could not be processed.", message?.type);
    }
  }

  _securityCheckpoint(socket, message) {
    const socketPlayer = this.world.players.get(socket.playerId);
    const normalizedName = socketPlayer?.name ?? sanitizeName(message.name);
    const accountKey = this.world._accountKey(normalizedName);
    const player = socketPlayer ?? [...this.world.players.values()].find((candidate) => (
      this.world._accountKey(candidate.name) === accountKey
    ));
    const hadRecord = accountKey.length > 0 && Object.hasOwn(this.world.accountStore, accountKey);
    return {
      accountKey,
      socketPlayerId: socket.playerId,
      playerId: player?.id ?? socket.playerId,
      hadRecord,
      record: hadRecord ? structuredClone(this.world.accountStore[accountKey]) : null,
      hadPlayer: Boolean(player),
      token: player?.token ?? null,
      recovery: player?.recovery ? structuredClone(player.recovery) : null,
      connectionDetached: player?.connectionDetached === true,
      eventsBefore: new Set(this.world.events),
      auditBefore: this.world.peekAuditLog(),
      auditDropped: this.world.auditDropped,
      captured: false,
      heldEvents: [],
      addedAuditIds: new Set(),
      evictedAuditEntries: [],
      auditDroppedDelta: 0,
      committed: false,
    };
  }

  _captureSecurityEffects(checkpoint) {
    if (checkpoint.captured) return;
    checkpoint.captured = true;
    checkpoint.heldEvents = this.world.events.filter((event) => !checkpoint.eventsBefore.has(event));
    const heldEvents = new Set(checkpoint.heldEvents);
    this.world.events = this.world.events.filter((event) => !heldEvents.has(event));

    const beforeIds = new Set(checkpoint.auditBefore.map((entry) => entry.id));
    const currentIds = new Set(this.world.auditLog.map((entry) => entry.id));
    checkpoint.addedAuditIds = new Set(
      this.world.auditLog.filter((entry) => !beforeIds.has(entry.id)).map((entry) => entry.id),
    );
    checkpoint.evictedAuditEntries = checkpoint.auditBefore.filter(
      (entry) => !currentIds.has(entry.id),
    );
    checkpoint.auditDroppedDelta = Math.max(0, this.world.auditDropped - checkpoint.auditDropped);
  }

  _releaseSecurityEvents(checkpoint) {
    if (checkpoint.heldEvents.length > 0) this.world.events.push(...checkpoint.heldEvents);
    checkpoint.heldEvents = [];
  }

  _restoreSecurityCheckpoint(socket, checkpoint) {
    const player = this.world.players.get(checkpoint.playerId);
    if (!checkpoint.hadPlayer && player) {
      // Security joins/recovery start in town and cannot own a party. Delete
      // directly so rollback itself cannot emit or audit another mutation.
      this.world.players.delete(socket.playerId);
      for (const [projectileId, projectile] of this.world.projectiles) {
        if (projectile.ownerId === socket.playerId) this.world.projectiles.delete(projectileId);
      }
    } else if (checkpoint.hadPlayer && player) {
      player.token = checkpoint.token;
      player.recovery = checkpoint.recovery ? structuredClone(checkpoint.recovery) : null;
      player.connectionDetached = checkpoint.connectionDetached;
    }
    if (checkpoint.accountKey) {
      if (checkpoint.hadRecord) {
        Object.defineProperty(this.world.accountStore, checkpoint.accountKey, {
          value: structuredClone(checkpoint.record),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      } else {
        delete this.world.accountStore[checkpoint.accountKey];
      }
    }
    this.world.auditLog = this.world.auditLog.filter(
      (entry) => !checkpoint.addedAuditIds.has(entry.id),
    );
    if (checkpoint.evictedAuditEntries.length > 0) {
      const currentIds = new Set(this.world.auditLog.map((entry) => entry.id));
      const restored = checkpoint.evictedAuditEntries.filter((entry) => !currentIds.has(entry.id));
      this.world.auditLog.unshift(...restored.map((entry) => structuredClone(entry)));
    }
    this.world.auditDropped = Math.max(
      checkpoint.auditDropped,
      this.world.auditDropped - checkpoint.auditDroppedDelta,
    );
    socket.playerId = checkpoint.socketPlayerId;
  }

  // Shared-serialization send: heavy per-map strings/bytes are built once
  // per broadcast via the cache; only the recipient's own entry is fresh.
  _sendSnapshot(socket, sharedCache = null) {
    if (socket.codec === BINARY_CODEC) {
      return this._sendPayload(socket, () => encodeSnapshotBinary(
        this.world.getSnapshot(socket.playerId, sharedCache),
        sharedCache,
      ), { droppable: true, kind: "snapshot" });
    }
    return this._sendPayload(
      socket,
      () => this.world.getSnapshotJson(socket.playerId, sharedCache),
      { droppable: true, kind: "snapshot" },
    );
  }

  _sendMessage(socket, message, options = {}) {
    return this._sendPayload(socket, JSON.stringify(message), options);
  }

  _sendError(socket, code, message, requestType) {
    return this._sendMessage(socket, {
      type: "error",
      code,
      message,
      ...(requestType ? { requestType } : {}),
    });
  }

  _sendPendingPartyInvite(socket, playerId) {
    const invite = this.world.getPendingPartyInvite(playerId);
    if (!invite) return "missing";
    return this._sendMessage(socket, { type: "event", ...invite });
  }

  _sendPayload(socket, payload, { droppable = false, kind = "message" } = {}) {
    if (socket.readyState !== WebSocket.OPEN) return "closed";
    const bufferedBytes = Math.max(0, Number(socket.bufferedAmount) || 0);
    this._runtime.maxWsBacklogBytes = Math.max(
      this._runtime.maxWsBacklogBytes,
      bufferedBytes,
    );
    if (bufferedBytes >= this.backpressure.disconnectBytes) {
      this._terminateSocket(socket, "backpressure");
      return "disconnected";
    }
    if (droppable && bufferedBytes >= this.backpressure.skipBytes) {
      socket.backpressureSkips = (socket.backpressureSkips ?? 0) + 1;
      this._runtime.droppableFramesSkipped += 1;
      if (kind === "snapshot") this._runtime.snapshotsSkipped += 1;
      if (socket.backpressureSkips >= this.backpressure.maxSkippedFrames) {
        socket.deliveryPaused = true;
      }
      return "skipped";
    }

    if (bufferedBytes < this.backpressure.skipBytes) {
      socket.backpressureSkips = 0;
      socket.deliveryPaused = false;
    }
    const serialized = typeof payload === "function" ? payload() : payload;
    try {
      socket.send(serialized);
      if (kind === "snapshot") this._runtime.snapshotsSent += 1;
      return "sent";
    } catch {
      this._terminateSocket(socket);
      return "disconnected";
    }
  }

  _terminateSocket(socket, reason) {
    if (socket.crimsonTerminated) return;
    socket.crimsonTerminated = true;
    if (reason === "backpressure") this._runtime.backpressureDisconnects += 1;
    if (reason === "heartbeat") this._runtime.heartbeatDisconnects += 1;
    socket.terminate?.();
  }

  _originAllowed(origin) {
    if (!this.allowedOrigins || origin === undefined) return true;
    const value = Array.isArray(origin) ? origin[0] : origin;
    return this.allowedOrigins.has(value);
  }

  _takeRateToken(socket) {
    const bucket = socket.rateBucket;
    const now = Date.now();
    bucket.tokens = Math.min(
      this.rateLimit.capacity,
      bucket.tokens + ((now - bucket.refilledAt) / 1000) * this.rateLimit.refillPerSecond,
    );
    bucket.refilledAt = now;
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  // Scoped event delivery: `scope` is world-internal routing and never hits
  // the wire — { mapId } reaches players on that map, { players } explicit
  // ids; unscoped events (chat global, boss announcements, roster changes)
  // go to every connection including the lobby.
  _broadcastEvent(event) {
    const { scope, ...payload } = event;
    const message = JSON.stringify({ type: "event", ...payload });
    const reliableInBackground = RELIABLE_BACKGROUND_EVENTS.has(event.event);
    for (const socket of this.wss.clients) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (!reliableInBackground && socket.clientVisible === false) continue;
      if (!reliableInBackground && socket.deliveryPaused) continue;
      if (scope) {
        const player = this.world.players.get(socket.playerId);
        if (!player) continue;
        if (scope.mapId && player.mapId !== scope.mapId) continue;
        if (scope.players && !scope.players.includes(socket.playerId)) continue;
      }
      this._sendPayload(socket, message);
    }
  }

  _broadcast(message) {
    const payload = JSON.stringify(message);
    for (const socket of this.wss.clients) {
      this._sendPayload(socket, payload);
    }
  }

  _runtimeStatus(now = performance.now()) {
    let connections = 0;
    let backgroundConnections = 0;
    let pausedConnections = 0;
    let backlogBytes = 0;
    let maxBacklogBytes = 0;
    let activeMaxBacklogBytes = 0;
    let slowConnections = 0;
    for (const socket of this.wss.clients) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      connections += 1;
      if (socket.clientVisible === false) backgroundConnections += 1;
      if (socket.deliveryPaused) pausedConnections += 1;
      const bufferedBytes = Math.max(0, Number(socket.bufferedAmount) || 0);
      backlogBytes += bufferedBytes;
      maxBacklogBytes = Math.max(maxBacklogBytes, bufferedBytes);
      if (socket.clientVisible !== false && !socket.deliveryPaused) {
        activeMaxBacklogBytes = Math.max(activeMaxBacklogBytes, bufferedBytes);
      }
      if (bufferedBytes >= this.backpressure.skipBytes) slowConnections += 1;
    }
    this._runtime.maxWsBacklogBytes = Math.max(
      this._runtime.maxWsBacklogBytes,
      maxBacklogBytes,
    );
    const memory = process.memoryUsage();
    return {
      startedAt: this._runtime.startedAt,
      tickRate: this.tickRate,
      snapshotRate: this.snapshotRate,
      lastTickAt: this._runtime.lastTickAt,
      hasSuccessfulTick: this._runtime.hasSuccessfulTick,
      tickAgeMs: this._runtime.hasSuccessfulTick
        ? roundMetric(Math.max(0, now - this._runtime.lastTickAtMonotonic))
        : null,
      consecutiveTickErrors: this._runtime.consecutiveTickErrors,
      totalTickErrors: this._runtime.totalTickErrors,
      lastTickError: this._runtime.lastTickError,
      memory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        externalBytes: memory.external,
        arrayBuffersBytes: memory.arrayBuffers,
      },
      eventLoopLagMs: this._runtime.eventLoopLagMs.summary(),
      snapshotDurationMs: this._runtime.snapshotDurationMs.summary(),
      websocket: {
        connections,
        backgroundConnections,
        pausedConnections,
        backlogBytes,
        maxBacklogBytes,
        activeMaxBacklogBytes,
        historicalMaxBacklogBytes: this._runtime.maxWsBacklogBytes,
        slowConnections,
        snapshotsSent: this._runtime.snapshotsSent,
        snapshotsSkipped: this._runtime.snapshotsSkipped,
        droppableFramesSkipped: this._runtime.droppableFramesSkipped,
        backpressureDisconnects: this._runtime.backpressureDisconnects,
        heartbeatDisconnects: this._runtime.heartbeatDisconnects,
      },
    };
  }

  _readinessStatus() {
    const persistence = this._persistenceStatus();
    const runtime = this._runtimeStatus();
    const checks = {
      persistence: { ok: persistence.ok },
      tickFresh: {
        ok: runtime.hasSuccessfulTick
          && runtime.tickAgeMs <= this.readinessLimits.tickStaleMs,
        actualMs: runtime.tickAgeMs,
        limitMs: this.readinessLimits.tickStaleMs,
      },
      tickErrors: {
        ok: runtime.consecutiveTickErrors < this.readinessLimits.maxConsecutiveTickErrors,
        consecutive: runtime.consecutiveTickErrors,
        limit: this.readinessLimits.maxConsecutiveTickErrors,
      },
      eventLoopLag: {
        ok: runtime.eventLoopLagMs.p99 <= this.readinessLimits.eventLoopLagP99Ms,
        p99Ms: runtime.eventLoopLagMs.p99,
        limitMs: this.readinessLimits.eventLoopLagP99Ms,
      },
      snapshotDuration: {
        ok: runtime.snapshotDurationMs.p99 <= this.readinessLimits.snapshotP99Ms,
        p99Ms: runtime.snapshotDurationMs.p99,
        limitMs: this.readinessLimits.snapshotP99Ms,
      },
      websocketBacklog: {
        ok: runtime.websocket.activeMaxBacklogBytes < this.readinessLimits.wsBacklogBytes,
        actualBytes: runtime.websocket.activeMaxBacklogBytes,
        limitBytes: this.readinessLimits.wsBacklogBytes,
      },
    };
    return {
      ready: Object.values(checks).every((check) => check.ok),
      checks,
      persistence,
      runtime,
    };
  }

  _prometheusMetrics() {
    const status = this._readinessStatus();
    const { runtime } = status;
    return [
      "# HELP crimson_ready Whether the server passes all readiness checks.",
      "# TYPE crimson_ready gauge",
      `crimson_ready ${status.ready ? 1 : 0}`,
      "# HELP crimson_persistence_ok Whether account and audit persistence are healthy.",
      "# TYPE crimson_persistence_ok gauge",
      `crimson_persistence_ok ${status.persistence.ok ? 1 : 0}`,
      "# HELP crimson_audit_pending Security audit entries waiting for durable storage.",
      "# TYPE crimson_audit_pending gauge",
      `crimson_audit_pending ${status.persistence.auditPending}`,
      "# HELP crimson_audit_dropped_total Audit entries discarded after the in-memory queue filled.",
      "# TYPE crimson_audit_dropped_total counter",
      `crimson_audit_dropped_total ${status.persistence.auditDropped}`,
      "# HELP crimson_world_tick Current authoritative world tick.",
      "# TYPE crimson_world_tick gauge",
      `crimson_world_tick ${this.world.tick}`,
      "# HELP crimson_tick_age_seconds Seconds since the last successful world tick.",
      "# TYPE crimson_tick_age_seconds gauge",
      `crimson_tick_age_seconds ${(runtime.tickAgeMs ?? 0) / 1000}`,
      "# HELP crimson_tick_errors_total World loop errors since process start.",
      "# TYPE crimson_tick_errors_total counter",
      `crimson_tick_errors_total ${runtime.totalTickErrors}`,
      "# HELP crimson_tick_errors_consecutive Consecutive failed world loop iterations.",
      "# TYPE crimson_tick_errors_consecutive gauge",
      `crimson_tick_errors_consecutive ${runtime.consecutiveTickErrors}`,
      "# HELP crimson_event_loop_lag_seconds Recent event-loop scheduling lag.",
      "# TYPE crimson_event_loop_lag_seconds gauge",
      `crimson_event_loop_lag_seconds{quantile="0.95"} ${runtime.eventLoopLagMs.p95 / 1000}`,
      `crimson_event_loop_lag_seconds{quantile="0.99"} ${runtime.eventLoopLagMs.p99 / 1000}`,
      "# HELP crimson_snapshot_duration_seconds Recent full snapshot broadcast duration.",
      "# TYPE crimson_snapshot_duration_seconds gauge",
      `crimson_snapshot_duration_seconds{quantile="0.95"} ${runtime.snapshotDurationMs.p95 / 1000}`,
      `crimson_snapshot_duration_seconds{quantile="0.99"} ${runtime.snapshotDurationMs.p99 / 1000}`,
      "# HELP crimson_ws_connections Open WebSocket connections.",
      "# TYPE crimson_ws_connections gauge",
      `crimson_ws_connections ${runtime.websocket.connections}`,
      "# HELP crimson_ws_background_connections WebSockets whose browser page is hidden.",
      "# TYPE crimson_ws_background_connections gauge",
      `crimson_ws_background_connections ${runtime.websocket.backgroundConnections}`,
      "# HELP crimson_ws_paused_connections WebSockets isolated after sustained backpressure.",
      "# TYPE crimson_ws_paused_connections gauge",
      `crimson_ws_paused_connections ${runtime.websocket.pausedConnections}`,
      "# HELP crimson_process_resident_memory_bytes Resident memory used by the Node.js process.",
      "# TYPE crimson_process_resident_memory_bytes gauge",
      `crimson_process_resident_memory_bytes ${runtime.memory.rssBytes}`,
      "# HELP crimson_process_heap_used_bytes V8 heap memory currently in use.",
      "# TYPE crimson_process_heap_used_bytes gauge",
      `crimson_process_heap_used_bytes ${runtime.memory.heapUsedBytes}`,
      "# HELP crimson_ws_backlog_bytes Bytes queued across WebSocket connections.",
      "# TYPE crimson_ws_backlog_bytes gauge",
      `crimson_ws_backlog_bytes{scope="total"} ${runtime.websocket.backlogBytes}`,
      `crimson_ws_backlog_bytes{scope="max_connection"} ${runtime.websocket.maxBacklogBytes}`,
      `crimson_ws_backlog_bytes{scope="active_max_connection"} ${runtime.websocket.activeMaxBacklogBytes}`,
      "# HELP crimson_ws_snapshot_frames_total Snapshot frames sent or skipped.",
      "# TYPE crimson_ws_snapshot_frames_total counter",
      `crimson_ws_snapshot_frames_total{result="sent"} ${runtime.websocket.snapshotsSent}`,
      `crimson_ws_snapshot_frames_total{result="skipped"} ${runtime.websocket.snapshotsSkipped}`,
      "# HELP crimson_ws_disconnects_total WebSockets terminated by runtime guards.",
      "# TYPE crimson_ws_disconnects_total counter",
      `crimson_ws_disconnects_total{reason="backpressure"} ${runtime.websocket.backpressureDisconnects}`,
      `crimson_ws_disconnects_total{reason="heartbeat"} ${runtime.websocket.heartbeatDisconnects}`,
      "",
    ].join("\n");
  }

  async _handleHttp(request, response) {
    const method = request.method ?? "GET";
    if (method !== "GET" && method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      sendJson(response, 405, { error: "Method not allowed" }, method === "HEAD");
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    } catch {
      sendJson(response, 400, { error: "Invalid URL" }, method === "HEAD");
      return;
    }

    if (pathname === "/health" || pathname === "/api/health") {
      // Liveness stays green while the process can answer HTTP. Runtime and
      // persistence diagnostics are included, but only /ready fails on them.
      sendJson(response, 200, {
        ok: true,
        tick: this.world.tick,
        players: this.world.onlinePlayerCount(),
        enemies: this.world.mobs.size,
        persistence: this._persistenceStatus(),
        runtime: this._runtimeStatus(),
      }, method === "HEAD");
      return;
    }

    if (pathname === "/ready" || pathname === "/api/ready") {
      const readiness = this._readinessStatus();
      sendJson(response, readiness.ready ? 200 : 503, readiness, method === "HEAD");
      return;
    }

    if (pathname === "/metrics" || pathname === "/api/metrics") {
      sendText(
        response,
        200,
        this._prometheusMetrics(),
        "text/plain; version=0.0.4; charset=utf-8",
        method === "HEAD",
      );
      return;
    }

    const requestedPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = path.resolve(this.publicDir, requestedPath);
    if (!isInside(this.publicDir, filePath)) {
      sendJson(response, 403, { error: "Forbidden" }, method === "HEAD");
      return;
    }

    const served = await serveFile(filePath, method, response);
    if (served) return;

    // Extensionless browser routes fall back to the client shell.
    if (!path.extname(requestedPath) && request.headers.accept?.includes("text/html")) {
      const fallback = path.join(this.publicDir, "index.html");
      if (await serveFile(fallback, method, response)) return;
    }
    sendJson(response, 404, { error: "Not found" }, method === "HEAD");
  }
}

export function createGameServer(options = {}) {
  return new GameServer(options);
}

export const createServer = createGameServer;

export async function createConfiguredGameServer(options = {}) {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl && !options.accountRepository) return createGameServer(options);

  const accountRepository = options.accountRepository
    ?? await connectPostgresAccountStore(databaseUrl, options.postgres);
  try {
    const loaded = options.accountStore ?? await accountRepository.loadAccounts();
    const accountStore = validateAccountRecords(loaded, null, true);
    return new GameServer({
      ...options,
      persistPath: "",
      accountRepository,
      accountStore,
    });
  } catch (error) {
    await accountRepository.close?.().catch(() => {});
    throw error;
  }
}

async function serveFile(filePath, method, response) {
  let metadata;
  try {
    metadata = await stat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return false;
    throw error;
  }
  if (!metadata.isFile()) return false;

  // Code (HTML/JS/CSS) iterates fast and must never be stale — a cached
  // client.js against a newer server shows subtle wrong behaviour. Images
  // keep a short cache and use ?v= busting.
  const extension = path.extname(filePath).toLowerCase();
  const isCode = extension === ".html" || extension === ".js" || extension === ".css";
  response.writeHead(200, {
    "Cache-Control": isCode ? "no-cache" : "public, max-age=300",
    "Content-Length": metadata.size,
    "Content-Type": CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
  if (method === "HEAD") {
    response.end();
    return true;
  }
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.once("error", reject);
    stream.once("end", resolve);
    stream.pipe(response);
  });
  return true;
}

// A store written by a newer server version must stop the boot instead of
// being quarantined or silently rewritten in the old format.
class UnsupportedSchemaError extends Error {}

export function loadAccountStore(persistPath, options = {}) {
  if (!persistPath) return {};
  const candidates = [persistPath, `${persistPath}.bak`];
  // Tighten stores left by an older release before reading any token. The
  // configured parent is the dedicated persistence directory (data/ or the
  // systemd StateDirectory), so it must not remain group/world traversable.
  if (options.manageDirectory === true && existsSync(path.dirname(persistPath))) {
    chmodSync(path.dirname(persistPath), STORE_DIR_MODE);
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) chmodSync(candidate, STORE_FILE_MODE);
  }
  // Try the live file first, then the last good backup. A corrupt file is
  // quarantined for manual recovery instead of being overwritten later.
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      return migrateAccountStore(JSON.parse(readFileSync(candidate, "utf8")), candidate);
    } catch (error) {
      if (error instanceof UnsupportedSchemaError) throw error;
      const quarantine = `${candidate}.corrupt`;
      try {
        renameSync(candidate, quarantine);
        console.error(`Account file ${candidate} is corrupt; moved to ${quarantine}:`, error.message);
      } catch {
        console.error(`Account file ${candidate} is corrupt and could not be quarantined:`, error.message);
      }
    }
  }
  return {};
}

function migrateAccountStore(parsed, source) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("account store must be a JSON object");
  }
  // Schema 0 (pre-envelope) files are the bare name→record map; a literal
  // "schema" account name would be an object here, never a number.
  if (typeof parsed.schema !== "number") return validateAccountRecords(parsed, source);
  if (!Number.isInteger(parsed.schema) || parsed.schema < 1) {
    throw new TypeError("account store schema must be a positive integer");
  }
  if (parsed.schema > ACCOUNT_SCHEMA) {
    throw new UnsupportedSchemaError(
      `${source} uses account schema ${parsed.schema}, but this server only knows `
      + `schema ${ACCOUNT_SCHEMA}. Upgrade the server or restore an older store.`,
    );
  }
  const accounts = parsed.accounts;
  if (!accounts || typeof accounts !== "object" || Array.isArray(accounts)) {
    throw new TypeError("account store envelope is missing its accounts map");
  }
  return validateAccountRecords(accounts, source);
}

function validateAccountRecords(accounts, source, strict = false) {
  const accepted = [];
  const rejectedEntries = [];
  for (const [accountKey, record] of Object.entries(accounts)) {
    try {
      validateAccountRecord(accountKey, record);
      const normalized = structuredClone(record);
      if (normalized.token !== undefined) {
        normalized.tokenHash ??= hashSecret(normalized.token);
        delete normalized.token;
      }
      accepted.push([accountKey, normalized]);
    } catch (error) {
      rejectedEntries.push([accountKey, {
        reason: error instanceof Error ? error.message : String(error),
        record,
      }]);
    }
  }
  const rejected = Object.fromEntries(rejectedEntries);
  if (Object.keys(rejected).length > 0) {
    if (source) quarantineInvalidRecords(source, rejected);
    else if (strict) {
      throw new TypeError(
        `PostgreSQL contains ${Object.keys(rejected).length} invalid account record(s); repair them before boot.`,
      );
    }
  }
  // Object.fromEntries defines even names such as "__proto__" as own data
  // properties instead of invoking Object.prototype's legacy setter.
  return Object.fromEntries(accepted);
}

function validateAccountRecord(accountKey, record) {
  // Unicode lower-casing can expand a sanitized 20-code-unit display name
  // (for example U+0130). Bound the canonical key without rejecting names
  // the live World itself can legitimately create.
  if (!accountKey || accountKey.length > 80 || /[\u0000-\u001f\u007f]/.test(accountKey)) {
    throw new TypeError("account key must be 1-80 printable characters");
  }
  if (!isPlainObject(record)) throw new TypeError("record must be an object");
  if (!Object.hasOwn(BASE_STATS, record.archetype)) {
    throw new TypeError("record has an unknown archetype");
  }
  if (record.token !== undefined
    && (typeof record.token !== "string" || record.token.length < 1 || record.token.length > 128)) {
    throw new TypeError("token must be a non-empty string of at most 128 characters");
  }
  if (record.tokenHash !== undefined
    && (typeof record.tokenHash !== "string" || !/^[0-9a-f]{64}$/i.test(record.tokenHash))) {
    throw new TypeError("tokenHash must be a 64-character SHA-256 hex digest");
  }
  if (record.recovery !== undefined) {
    if (!isPlainObject(record.recovery)
      || typeof record.recovery.hash !== "string"
      || !/^[0-9a-f]{64}$/i.test(record.recovery.hash)
      || typeof record.recovery.expiresAt !== "string"
      || !Number.isFinite(Date.parse(record.recovery.expiresAt))) {
      throw new TypeError("recovery must contain a SHA-256 hash and valid expiresAt timestamp");
    }
  }

  optionalInteger(record, "level", 1, LEVEL_CAP);
  optionalInteger(record, "xp", 0, MAX_PERSISTED_COUNTER);
  optionalInteger(record, "xpToNext", 1, MAX_PERSISTED_COUNTER);
  optionalInteger(record, "statPoints", 0, MAX_PERSISTED_POINTS);
  optionalInteger(record, "skillPoints", 0, MAX_PERSISTED_POINTS);
  optionalInteger(record, "rebirths", 0, 0xffff);
  optionalInteger(record, "reputation", -REPUTATION_LIMIT, REPUTATION_LIMIT);
  optionalInteger(record, "will", 0, MAX_PERSISTED_COUNTER);
  optionalInteger(record, "gold", 0, MAX_PERSISTED_CURRENCY);
  optionalInteger(record, "dew", 0, MAX_PERSISTED_CURRENCY);
  for (const field of ["autoFight", "autoLevel", "autoEquip"]) {
    if (record[field] !== undefined && typeof record[field] !== "boolean") {
      throw new TypeError(`${field} must be a boolean`);
    }
  }
  if (record.attunement !== undefined && !["radiant", "abyss"].includes(record.attunement)) {
    throw new TypeError("attunement must be radiant or abyss");
  }

  if (record.stats !== undefined) {
    validateNumberMap(record.stats, STAT_KEYS, "stats", true, 0, MAX_PERSISTED_STAT);
  }
  if (record.skillLevels !== undefined) {
    validateNumberMap(record.skillLevels, SKILL_SLOTS, "skillLevels", true, 1, LEVEL_CAP);
  }
  if (record.friends !== undefined
    && (!Array.isArray(record.friends) || record.friends.length > FRIEND_LIMIT
      || record.friends.some((name) => typeof name !== "string" || name.length < 1 || name.length > 20))) {
    throw new TypeError(`friends must be an array of at most ${FRIEND_LIMIT} player names`);
  }

  const itemIds = new Set();
  if (record.inventory !== undefined) {
    if (!Array.isArray(record.inventory) || record.inventory.length > INVENTORY_LIMIT) {
      throw new TypeError(`inventory must be an array of at most ${INVENTORY_LIMIT} items`);
    }
    record.inventory.forEach((item, index) => validateItem(item, `inventory[${index}]`, itemIds));
  }
  if (record.equipment !== undefined) {
    if (!isPlainObject(record.equipment)) throw new TypeError("equipment must be an object");
    for (const [slot, item] of Object.entries(record.equipment)) {
      if (!EQUIP_KEYS.includes(slot)) continue; // stale slots are removed by World migration
      if (item === null) continue;
      validateItem(item, `equipment.${slot}`, itemIds);
      const expectedSlot = slot.startsWith("ring") ? "ring" : slot;
      if (item.slot !== expectedSlot) throw new TypeError(`equipment.${slot} contains the wrong item slot`);
    }
  }
  if (record.quest !== undefined) {
    const chainIndex = record.quest?.chainIndex;
    const progress = record.quest?.progress;
    if (!isPlainObject(record.quest) || !Number.isSafeInteger(chainIndex)
      || chainIndex < 0 || chainIndex >= QUEST_CHAIN.length
      || !Number.isSafeInteger(progress) || progress < 0
      || progress > QUEST_CHAIN[chainIndex].target) {
      throw new TypeError("quest must contain bounded chainIndex and progress values");
    }
  }
}

function validateItem(item, location, itemIds) {
  if (!isPlainObject(item)) throw new TypeError(`${location} must be an item object`);
  if (typeof item.id !== "string" || item.id.length < 1 || item.id.length > 80) {
    throw new TypeError(`${location}.id must be a non-empty string`);
  }
  if (itemIds.has(item.id)) throw new TypeError(`duplicate item id ${item.id}`);
  itemIds.add(item.id);
  const generatedId = /^item-(\d+)$/.exec(item.id);
  if (generatedId) {
    const sequence = Number(generatedId[1]);
    if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence >= MAX_ITEM_SEQUENCE
      || String(sequence) !== generatedId[1]) {
      throw new TypeError(`${location}.id has an unsafe generated item sequence`);
    }
  }
  if (![...ITEM_SLOTS, "potion"].includes(item.slot)) {
    throw new TypeError(`${location}.slot is unknown`);
  }
  if (typeof item.name !== "string" || item.name.length < 1 || item.name.length > 120) {
    throw new TypeError(`${location}.name must be a non-empty string`);
  }
  if (typeof item.rarity !== "string" || item.rarity.length < 1 || item.rarity.length > 40) {
    throw new TypeError(`${location}.rarity must be a non-empty string`);
  }
  if (item.dropClass !== undefined && !["uniq", "sunset"].includes(item.dropClass)) {
    throw new TypeError(`${location}.dropClass must be uniq or sunset when present`);
  }
  if (!Number.isSafeInteger(item.tier) || item.tier < 1 || item.tier > LEVEL_CAP
    || !Number.isSafeInteger(item.level ?? 1)
    || (item.level ?? 1) < 1 || (item.level ?? 1) > LEVEL_CAP) {
    throw new TypeError(`${location} has an invalid tier or level`);
  }
  validateNumberMap(item.bonuses, STAT_KEYS, `${location}.bonuses`, false, 0, MAX_ITEM_MODIFIER);
  for (const field of ["damageBonus", "hpBonus", "speedBonus", "defenseBonus", "heal"]) {
    optionalNumber(item, field, 0, `${location}.${field}`, MAX_ITEM_MODIFIER);
  }
  if (item.attackFormula !== undefined) {
    const formula = item.attackFormula;
    if (!isPlainObject(formula) || !STAT_KEYS.includes(formula.stat)
      || !Number.isFinite(formula.divisor) || formula.divisor < 0.001
      || formula.divisor > MAX_ITEM_MODIFIER
      || (formula.maxDivisor !== undefined
        && (!Number.isFinite(formula.maxDivisor) || formula.maxDivisor < 0.001
          || formula.maxDivisor > MAX_ITEM_MODIFIER))
      || (formula.multiplier !== undefined
        && (!Number.isFinite(formula.multiplier) || formula.multiplier < 0
          || formula.multiplier > MAX_ITEM_MODIFIER))) {
      throw new TypeError(`${location}.attackFormula is invalid`);
    }
  }
}

function validateNumberMap(
  value,
  keys,
  label,
  integers = false,
  minimum = 0,
  maximum = MAX_PERSISTED_COUNTER,
) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be an object`);
  for (const key of keys) {
    const entry = value[key];
    if (!Number.isFinite(entry) || entry < minimum || entry > maximum
      || (integers && !Number.isSafeInteger(entry))) {
      throw new TypeError(
        `${label}.${key} must be ${integers ? "a safe integer" : "a number"} between ${minimum} and ${maximum}`,
      );
    }
  }
}

function optionalInteger(record, field, minimum, maximum = Infinity) {
  if (record[field] === undefined) return;
  if (!Number.isSafeInteger(record[field]) || record[field] < minimum || record[field] > maximum) {
    throw new TypeError(`${field} must be a safe integer between ${minimum} and ${maximum}`);
  }
}

function optionalNumber(record, field, minimum, label = field, maximum = MAX_PERSISTED_COUNTER) {
  if (record[field] !== undefined
    && (!Number.isFinite(record[field]) || record[field] < minimum || record[field] > maximum)) {
    throw new TypeError(`${label} must be a finite number between ${minimum} and ${maximum}`);
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function quarantineInvalidRecords(source, rejected) {
  const invalidPath = `${source}.invalid-records.json`;
  try {
    writeFileSync(invalidPath, JSON.stringify({
      schema: ACCOUNT_SCHEMA,
      rejectedAt: new Date().toISOString(),
      accounts: rejected,
    }, null, 2), { encoding: "utf8", mode: STORE_FILE_MODE });
    chmodSync(invalidPath, STORE_FILE_MODE);
    console.error(
      `Ignored ${Object.keys(rejected).length} invalid account record(s) from ${source}; `
      + `saved them to ${invalidPath}.`,
    );
  } catch (error) {
    console.error(
      `Ignored ${Object.keys(rejected).length} invalid account record(s) from ${source}, `
      + `but could not write ${invalidPath}:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function sendJson(response, status, body, head = false) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(head ? undefined : payload);
}

function sendText(response, status, payload, contentType, head = false) {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(head ? undefined : payload);
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new TypeError("port must be an integer between 0 and 65535");
  }
  return port;
}

function positiveRate(value, fallback) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : fallback;
}

function nonNegativeRate(value, fallback) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 ? rate : fallback;
}

function positiveInteger(value, fallback) {
  const integer = Number(value);
  return Number.isSafeInteger(integer) && integer > 0 ? integer : fallback;
}

function parseAllowedOrigins(value) {
  if (value === undefined || value === null || value === "") return null;
  const entries = value instanceof Set
    ? [...value]
    : (Array.isArray(value) ? value : String(value).split(","));
  const origins = new Set();
  for (const entry of entries) {
    const candidate = String(entry).trim();
    if (!candidate) continue;
    if (candidate === "null") {
      origins.add(candidate);
      continue;
    }
    const parsed = new URL(candidate);
    if (!/^https?:$/.test(parsed.protocol)) {
      throw new TypeError("allowed origins must use http or https");
    }
    origins.add(parsed.origin);
  }
  return origins.size > 0 ? origins : null;
}

function environmentFlag(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

async function syncFile(filePath) {
  const handle = await open(filePath, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncDirectory(directoryPath) {
  const handle = await open(directoryPath, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function persistenceSubError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    at: new Date().toISOString(),
  };
}

function roundMetric(value) {
  return Number(value.toFixed(3));
}

class SampleWindow {
  constructor(limit) {
    this.limit = limit;
    this.values = [];
  }

  add(value) {
    if (!Number.isFinite(value) || value < 0) return;
    this.values.push(value);
    if (this.values.length > this.limit) this.values.shift();
  }

  summary() {
    if (this.values.length === 0) {
      return { count: 0, latest: 0, p50: 0, p95: 0, p99: 0, max: 0 };
    }
    const sorted = [...this.values].sort((left, right) => left - right);
    const percentile = (fraction) => {
      const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
      return roundMetric(sorted[index]);
    };
    return {
      count: sorted.length,
      latest: roundMetric(this.values.at(-1)),
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      max: roundMetric(sorted.at(-1)),
    };
  }
}

const isEntryPoint = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntryPoint) {
  let gameServer = null;
  try {
    gameServer = await createConfiguredGameServer();
    const address = await gameServer.listen();
    const shownHost = address.address === "::" ? "0.0.0.0" : address.address;
    console.log(`Crimson Relay listening on http://${shownHost}:${address.port}`);
  } catch (error) {
    console.error("Unable to start server", error);
    try {
      await gameServer?.close();
    } catch (cleanupError) {
      console.error("Startup cleanup failed", cleanupError);
    }
    gameServer = null;
    process.exitCode = 1;
  }

  let shutdownPromise = null;
  const shutdown = () => {
    shutdownPromise ??= (async () => {
      try {
        await gameServer?.close();
        process.exit(0);
      } catch (error) {
        console.error("Graceful shutdown failed", error);
        process.exit(1);
      }
    })();
    return shutdownPromise;
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
