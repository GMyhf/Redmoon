import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { PROTOCOL_VERSION } from "./definitions.js";
import {
  DungeonFrameDecoder,
  encodeDungeonFrame,
  MAX_DUNGEON_FRAME_BYTES,
} from "./dungeon-ipc.js";

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 2_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 1_000;
const WORKER_ENTRYPOINT = fileURLToPath(new URL("./dungeon-worker.js", import.meta.url));

export class DungeonWorkerTransport {
  constructor(options = {}) {
    this.instanceId = requiredString(options.instanceId, "instanceId");
    this.workerEpoch = nonNegativeInteger(options.workerEpoch ?? 0, "workerEpoch");
    this.entrypoint = options.entrypoint ?? WORKER_ENTRYPOINT;
    this.maxFrameBytes = positiveInteger(options.maxFrameBytes ?? MAX_DUNGEON_FRAME_BYTES, "maxFrameBytes");
    this.handshakeTimeoutMs = positiveInteger(
      options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS,
      "handshakeTimeoutMs",
    );
    this.heartbeatIntervalMs = positiveInteger(
      options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
      "heartbeatIntervalMs",
    );
    this.onStderr = options.onStderr;
    this.child = null;
    this.decoder = new DungeonFrameDecoder(this.maxFrameBytes);
    this.pending = new Map();
    this.sequence = 0;
    this.opened = false;
    this.closed = false;
    this.heartbeatTimer = null;
    this.exitPromise = null;
    this.exited = false;
  }

  async open(payload = {}) {
    if (this.child || this.closed) throw new Error("worker transport is already started or closed");
    this._spawn();
    const response = await this._request("open", payload, "ready", this.handshakeTimeoutMs);
    this.opened = true;
    this._startHeartbeat();
    return response;
  }

  heartbeat() {
    if (!this.opened) return Promise.reject(new Error("worker transport is not open"));
    return this._request("heartbeat", {}, "heartbeat", this.handshakeTimeoutMs);
  }

  async recycle(reason = "normal") {
    if (!this.child) return;
    if (!this.opened) {
      this._terminate();
      return;
    }
    try {
      await this._request("recycle", { reason, finalSequence: this.sequence }, "recycleAck");
    } finally {
      await this.close();
    }
  }

  async close() {
    this._stopHeartbeat();
    const child = this.child;
    if (!child) {
      this.closed = true;
      return;
    }
    this.closed = true;
    this._rejectPending(new Error("worker transport closed"));
    if (!child.killed) child.kill();
    if (!this.exited) await this.exitPromise;
    this.child = null;
  }

  _spawn() {
    this.child = spawn(process.execPath, [this.entrypoint], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.exited = false;
    this.exitPromise = new Promise((resolve) => this.child.once("exit", resolve));
    this.child.stdout.on("data", (chunk) => this._onData(chunk));
    this.child.stderr.on("data", (chunk) => this.onStderr?.(chunk.toString("utf8")));
    this.child.on("error", (error) => this._fail(error));
    this.child.on("exit", (code, signal) => {
      this.exited = true;
      this._stopHeartbeat();
      if (!this.closed) this._fail(new Error(`worker exited (${code ?? "signal " + signal})`));
    });
  }

  _request(type, payload, expectedType, timeoutMs = this.handshakeTimeoutMs) {
    const requestId = `${this.instanceId}:${++this.sequence}`;
    const message = {
      ...payload,
      type,
      protocolVersion: PROTOCOL_VERSION,
      instanceId: this.instanceId,
      requestId,
      workerEpoch: this.workerEpoch,
    };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`worker ${type} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(requestId, { expectedType, resolve, reject, timer });
      try {
        this.child.stdin.write(encodeDungeonFrame(message, this.maxFrameBytes));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error);
      }
    });
  }

  _onData(chunk) {
    try {
      for (const message of this.decoder.push(chunk)) this._resolve(message);
    } catch (error) {
      this._fail(new Error(`invalid worker frame: ${error.message}`));
    }
  }

  _resolve(message) {
    const pending = this.pending.get(message?.requestId);
    if (!pending) return;
    this.pending.delete(message.requestId);
    clearTimeout(pending.timer);
    if (message.protocolVersion !== PROTOCOL_VERSION
      || message.instanceId !== this.instanceId || message.workerEpoch !== this.workerEpoch) {
      pending.reject(new Error("worker response identity mismatch"));
      return;
    }
    if (message.type === "error") {
      pending.reject(new Error(`worker ${message.code ?? "error"}`));
      return;
    }
    if (message.type !== pending.expectedType) {
      pending.reject(new Error(`expected worker ${pending.expectedType}, got ${message.type}`));
      return;
    }
    pending.resolve(message);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.heartbeat().catch((error) => this._fail(error));
    }, this.heartbeatIntervalMs);
    this.heartbeatTimer.unref?.();
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  _fail(error) {
    this._stopHeartbeat();
    this._rejectPending(error);
    if (this.child && !this.child.killed) this.child.kill();
  }

  _rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  _terminate() {
    this.closed = true;
    this._stopHeartbeat();
    this._rejectPending(new Error("worker transport terminated"));
    if (this.child && !this.child.killed) this.child.kill();
  }
}

function requiredString(value, name) {
  if (typeof value !== "string" || !value) throw new TypeError(`${name} is required`);
  return value;
}

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

function nonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative integer`);
  return value;
}
