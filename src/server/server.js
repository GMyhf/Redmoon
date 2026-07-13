import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { chmod, copyFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { WebSocket, WebSocketServer } from "ws";

import {
  INVENTORY_LIMIT,
  PROTOCOL_VERSION,
  REBIRTH_LEVEL,
  SNAPSHOT_RATE,
  TICK_RATE,
  publicArchetypes,
} from "./definitions.js";
import { BINARY_CODEC, encodeSnapshotBinary } from "./codec.js";
import { World, WorldError } from "./world.js";

const DEFAULT_PUBLIC_DIR = fileURLToPath(new URL("../../public/", import.meta.url));
const MAX_MESSAGE_BYTES = 16 * 1024;
// accounts.json format version. Bump on any breaking layout change and
// teach migrateAccountStore() how to read the previous shape.
const ACCOUNT_SCHEMA = 1;
// Account files hold session tokens; keep them owner-only.
const STORE_FILE_MODE = 0o600;
const STORE_DIR_MODE = 0o700;

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
    // Account persistence: a JSON file keyed by character name. Set
    // PERSIST_PATH ("" disables) — progress survives restarts.
    this.persistPath = options.persistPath !== undefined
      ? options.persistPath
      : (process.env.PERSIST_PATH ?? path.resolve("data/accounts.json"));
    const accountStore = loadAccountStore(this.persistPath);
    this.world = options.world ?? new World({ ...options.worldOptions, accountStore });
    this._persistTimer = null;
    this._savePromise = Promise.resolve();
    this._lastPersistError = null;
    this._lastPersistAt = null;
    this._persistFailureCount = 0;
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
    this._snapshotCounter = 0;
    this._rosterCounter = 0;
    this._closed = false;

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
      this.wss.handleUpgrade(request, socket, head, (websocket) => {
        this.wss.emit("connection", websocket, request);
      });
    });
    this.wss.on("connection", (socket) => this._handleConnection(socket));
  }

  async listen(port = this.port, host = this.host) {
    if (this.httpServer.listening) return this.address();
    this.port = parsePort(port);
    this.host = host;
    this._closed = false;
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
    if (this.persistPath && !this._persistTimer) {
      this._persistTimer = setInterval(() => {
        this._saveAccounts().catch((error) => console.error("Account save failed", error));
      }, 30_000);
      this._persistTimer.unref?.();
    }
    return this.address();
  }

  async _saveAccounts() {
    if (!this.persistPath) return;
    // Serialize writers so the timer, disconnect flushes, and close cannot
    // interleave on the same temp file.
    this._savePromise = this._savePromise.catch(() => {}).then(() => this._writeAccounts()).catch((error) => {
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
        path: this.persistPath,
        message: this._lastPersistError.message,
      }));
      throw error;
    });
    return this._savePromise;
  }

  async _writeAccounts() {
    const payload = JSON.stringify({
      schema: ACCOUNT_SCHEMA,
      savedAt: new Date().toISOString(),
      accounts: this.world.syncAccounts(),
    });
    mkdirSync(path.dirname(this.persistPath), { recursive: true, mode: STORE_DIR_MODE });
    // Write-then-rename keeps the store intact if the process dies mid-flush;
    // the previous good copy survives as .bak.
    const tempPath = `${this.persistPath}.tmp`;
    await writeFile(tempPath, payload, { encoding: "utf8", mode: STORE_FILE_MODE });
    // mkdir/writeFile modes only apply on creation and pass through umask;
    // chmod pins pre-existing files to the expected permissions too.
    await chmod(tempPath, STORE_FILE_MODE);
    if (existsSync(this.persistPath)) {
      const bakPath = `${this.persistPath}.bak`;
      await copyFile(this.persistPath, bakPath);
      await chmod(bakPath, STORE_FILE_MODE);
    }
    await rename(tempPath, this.persistPath);
    this._lastPersistError = null;
    this._persistFailureCount = 0;
    this._lastPersistAt = new Date().toISOString();
    await this._rotateBackups();
  }

  async _rotateBackups() {
    const now = Date.now();
    if (now - this._lastBackupAt < this.backup.intervalMs) return;
    this._lastBackupAt = now;
    const directory = `${this.persistPath}.backups`;
    mkdirSync(directory, { recursive: true, mode: STORE_DIR_MODE });
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
  }

  _persistenceStatus() {
    return {
      enabled: Boolean(this.persistPath),
      ok: !this.persistPath || !this._lastPersistError,
      lastSavedAt: this._lastPersistAt,
      lastErrorAt: this._lastPersistError?.at ?? null,
      consecutiveFailures: this._persistFailureCount,
    };
  }

  address() {
    return this.httpServer.address();
  }

  async close() {
    if (this._closed) return;
    this._closed = true;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (this._persistTimer) {
      clearInterval(this._persistTimer);
      this._persistTimer = null;
    }
    await this._saveAccounts().catch((error) => console.error("Final account save failed", error));
    for (const socket of this.wss.clients) socket.terminate();
    const httpClosed = this.httpServer.listening
      ? new Promise((resolve) => {
        this.httpServer.close(() => resolve());
        this.httpServer.closeIdleConnections?.();
        this.httpServer.closeAllConnections?.();
      })
      : Promise.resolve();
    await Promise.all([
      new Promise((resolve) => this.wss.close(() => resolve())),
      httpClosed,
    ]);
  }

  _startLoop() {
    if (this._timer) return;
    const interval = 1000 / this.tickRate;
    // Time-accumulator stepping: when the event loop is busy and the timer
    // fires late, the world catches up with extra fixed steps instead of
    // silently running in slow motion. Capped to avoid a death spiral.
    let lastTime = performance.now();
    let backlog = 0;
    this._timer = setInterval(() => {
      try {
        const now = performance.now();
        backlog = Math.min(backlog + (now - lastTime), interval * 5);
        lastTime = now;
        while (backlog >= interval) {
          backlog -= interval;
          this.world.update(1 / this.tickRate);
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
          const sharedCache = new Map();
          for (const socket of this.wss.clients) {
            if (socket.readyState !== WebSocket.OPEN || !this.world.players.has(socket.playerId)) continue;
            this._sendSnapshot(socket, sharedCache);
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
            socket.send(payload);
          }
        }
      } catch (error) {
        console.error("World tick failed", error);
      }
    }, interval);
    this._timer.unref?.();
  }

  _handleConnection(socket) {
    socket.playerId = randomUUID();
    send(socket, {
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
    socket.on("message", (data, isBinary) => {
      if (!this._takeRateToken(socket)) {
        // Answer at most once a second so the throttle itself cannot be
        // used to amplify the flood.
        const now = Date.now();
        if (now - (socket.rateWarnedAt ?? 0) >= 1000) {
          socket.rateWarnedAt = now;
          sendError(socket, "RATE_LIMITED", "Too many messages; slow down.");
        }
        return;
      }
      if (isBinary) {
        sendError(socket, "INVALID_MESSAGE", "Binary messages are not supported.");
        return;
      }
      if (data.byteLength > MAX_MESSAGE_BYTES) {
        sendError(socket, "MESSAGE_TOO_LARGE", "Message exceeds 16 KiB.");
        return;
      }

      let message;
      try {
        message = JSON.parse(data.toString("utf8"));
      } catch {
        sendError(socket, "INVALID_JSON", "Message is not valid JSON.");
        return;
      }

      try {
        const result = this.world.handleCommand(socket.playerId, message);
        if (message.type === "join" || message.type === "start") {
          // Binary snapshots are opt-in per connection; everything else
          // stays JSON regardless of codec.
          socket.codec = message.codec === BINARY_CODEC ? BINARY_CODEC : null;
          if (result?.token) {
            send(socket, { type: "session", token: result.token, name: result.name });
          }
          this._sendSnapshot(socket);
        } else if (message.type === "leave") {
          // Same flush guarantee as a disconnect, plus an immediate roster
          // so the character screen fills without waiting for the timer.
          if (this.persistPath) {
            this._saveAccounts().catch((error) => console.error("Account save failed", error));
          }
          send(socket, { type: "roster", players: this.world.getRoster() });
        }
      } catch (error) {
        if (error instanceof WorldError) {
          sendError(socket, error.code, error.message, message?.type);
          return;
        }
        console.error("WebSocket command failed", error);
        sendError(socket, "INTERNAL_ERROR", "The command could not be processed.", message?.type);
      }
    });

    socket.once("close", () => {
      // Flush right away so a crash costs at most the autosave interval of
      // still-connected players, never a departed one.
      if (this.world.removePlayer(socket.playerId) && this.persistPath) {
        this._saveAccounts().catch((error) => console.error("Account save failed", error));
      }
    });
    socket.on("error", () => {
      // A close event follows; command errors are sent through the protocol.
    });
  }

  // Shared-serialization send: heavy per-map strings/bytes are built once
  // per broadcast via the cache; only the recipient's own entry is fresh.
  _sendSnapshot(socket, sharedCache = null) {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.codec === BINARY_CODEC) {
      socket.send(encodeSnapshotBinary(this.world.getSnapshot(socket.playerId, sharedCache), sharedCache));
      return;
    }
    socket.send(this.world.getSnapshotJson(socket.playerId, sharedCache));
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
    for (const socket of this.wss.clients) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (scope) {
        const player = this.world.players.get(socket.playerId);
        if (!player) continue;
        if (scope.mapId && player.mapId !== scope.mapId) continue;
        if (scope.players && !scope.players.includes(socket.playerId)) continue;
      }
      socket.send(message);
    }
  }

  _broadcast(message) {
    const payload = JSON.stringify(message);
    for (const socket of this.wss.clients) {
      if (socket.readyState === WebSocket.OPEN) socket.send(payload);
    }
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
      // Liveness: the process runs and ticks. Persistence state is reported
      // for diagnostics but never fails this endpoint — use /ready for that.
      sendJson(response, 200, {
        ok: true,
        tick: this.world.tick,
        players: this.world.players.size,
        enemies: this.world.mobs.size,
        persistence: this._persistenceStatus(),
      }, method === "HEAD");
      return;
    }

    if (pathname === "/ready" || pathname === "/api/ready") {
      // Readiness: refuses traffic while account saves are failing, so a
      // monitor alerts before players lose progress.
      const persistence = this._persistenceStatus();
      sendJson(response, persistence.ok ? 200 : 503, {
        ready: persistence.ok,
        persistence,
      }, method === "HEAD");
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

function loadAccountStore(persistPath) {
  if (!persistPath) return {};
  // Try the live file first, then the last good backup. A corrupt file is
  // quarantined for manual recovery instead of being overwritten later.
  for (const candidate of [persistPath, `${persistPath}.bak`]) {
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
  if (typeof parsed.schema !== "number") return parsed;
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
  return accounts;
}

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function sendError(socket, code, message, requestType) {
  send(socket, {
    type: "error",
    code,
    message,
    ...(requestType ? { requestType } : {}),
  });
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

const isEntryPoint = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntryPoint) {
  const gameServer = createGameServer();
  try {
    const address = await gameServer.listen();
    const shownHost = address.address === "::" ? "0.0.0.0" : address.address;
    console.log(`Crimson Relay listening on http://${shownHost}:${address.port}`);
  } catch (error) {
    console.error("Unable to start server", error);
    process.exitCode = 1;
  }

  const shutdown = async () => {
    await gameServer.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
