// Bot swarm stress tool. With no thresholds it only reports measurements;
// any --min/--max guard turns the corresponding regression into exit code 1.
//
//   node tools/stress.mjs [bots=50] [seconds=60] [ws-url] [options]
//   node tools/stress.mjs 30 30 ws://127.0.0.1:8080/ws --seed nightly \
//     --min-join-ratio 1 --min-tick-ratio .9 --max-p95-ms 400 \
//     --max-p99-ms 600 --max-errors 0 --require-ready
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { WebSocket } from "ws";

import {
  createSeededRandom,
  evaluateStressThresholds,
  hashSeed,
  parseStressArgs,
} from "./stress-lib.js";

const HELP = `Usage: node tools/stress.mjs [bots] [seconds] [ws-url] [options]

Options:
  --seed VALUE             deterministic per-bot action seed
  --run-id VALUE           optional account-name suffix (max 8 safe characters)
  --min-join-ratio N       fail unless joined/bots reaches N
  --min-tick-ratio N       fail unless actual/expected ticks reaches N
  --min-active-ratio N     fail unless joined bots remain connected at the end
  --max-p95-ms N           fail when sampled snapshot p95 exceeds N
  --max-p99-ms N           fail when sampled snapshot p99 exceeds N
  --max-errors N           fail when protocol errors exceed N
  --require-ready          fail unless /ready returns HTTP 200

The same settings are available as STRESS_* environment variables.`;

let config;
try {
  config = parseStressArgs(process.argv.slice(2), process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(HELP);
  process.exit(2);
}
if (config.help) {
  console.log(HELP);
  process.exit(0);
}

const { bots, seconds, url, seed, thresholds } = config;
const httpBase = url
  .replace(/^ws:/, "http:")
  .replace(/^wss:/, "https:")
  .replace(/\/ws$/, "");
const defaultRunId = `${hashSeed(seed).toString(36).slice(0, 5)}${Date.now().toString(36).slice(-2)}`;
const runId = String(config.runId ?? defaultRunId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 8)
  || defaultRunId;

const stats = {
  joined: 0,
  active: 0,
  errors: {},
  parsedSnapshots: 0,
  gaps: [],
  bytes: 0,
  events: {},
};
const sockets = [];
const PROBE_TIMEOUT_MS = 5_000;
let stopping = false;

function spawnBot(index) {
  const random = createSeededRandom(`${seed}:${index}`);
  const socket = new WebSocket(url);
  const sampled = index % 10 === 0;
  const nextToken = randomBytes(32).toString("base64url");
  let lastSnapshot = 0;
  let seq = 0;
  let mover = null;

  socket.on("open", () => {
    socket.send(JSON.stringify({
      type: "join",
      protocol: 2,
      name: `Bot-${runId}-${index}`,
      archetype: "vanguard",
      nextToken,
    }));
  });
  socket.on("message", (data, isBinary) => {
    stats.bytes += data.length ?? 0;
    if (isBinary) return;
    // Parsing every full snapshot saturates the load generator itself. Once
    // joined, non-sampled bots only inspect event frame heads.
    if (mover && !sampled) {
      const head = data.subarray(0, 32).toString();
      if (head.includes('"type":"event"')) {
        const name = /"event":"([a-zA-Z]+)"/.exec(data.subarray(0, 120).toString());
        if (name) stats.events[name[1]] = (stats.events[name[1]] ?? 0) + 1;
      } else if (head.includes('"type":"error"')) {
        const code = /"code":"([A-Z_]+)"/.exec(data.subarray(0, 180).toString());
        const key = code?.[1] ?? "SERVER_ERROR";
        stats.errors[key] = (stats.errors[key] ?? 0) + 1;
      }
      return;
    }
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      stats.errors.CLIENT_PARSE = (stats.errors.CLIENT_PARSE ?? 0) + 1;
      return;
    }
    if (message.type === "snapshot") {
      stats.parsedSnapshots += 1;
      if (sampled) {
        const now = performance.now();
        if (lastSnapshot > 0) stats.gaps.push(now - lastSnapshot);
        lastSnapshot = now;
      }
      if (!mover) {
        stats.joined += 1;
        stats.active += 1;
        const cadenceMs = 1500 + random() * 1500;
        mover = setInterval(() => {
          if (socket.readyState !== WebSocket.OPEN) return;
          const angle = random() * Math.PI * 2;
          seq += 1;
          socket.send(JSON.stringify({
            type: "input",
            seq,
            move: { x: Math.cos(angle), y: Math.sin(angle) },
            sprint: random() < 0.3,
            aim: { x: 2400, y: 1350 },
            primary: random() < 0.5,
            q: random() < 0.2,
          }));
        }, cadenceMs);
      }
    } else if (message.type === "event") {
      stats.events[message.event] = (stats.events[message.event] ?? 0) + 1;
    } else if (message.type === "error") {
      stats.errors[message.code] = (stats.errors[message.code] ?? 0) + 1;
    }
  });
  socket.on("close", () => {
    clearInterval(mover);
    if (mover) stats.active = Math.max(0, stats.active - 1);
    if (!stopping) stats.errors.UNEXPECTED_CLOSE = (stats.errors.UNEXPECTED_CLOSE ?? 0) + 1;
  });
  socket.on("error", () => {
    if (!stopping) stats.errors.SOCKET_ERROR = (stats.errors.SOCKET_ERROR ?? 0) + 1;
  });
  return socket;
}

function readCpu(pid) {
  const parts = readFileSync(`/proc/${pid}/stat`, "utf8").split(" ");
  const ticks = Number(parts[13]) + Number(parts[14]);
  const rssPages = Number(readFileSync(`/proc/${pid}/statm`, "utf8").split(" ")[1]);
  return { ticks, rssMb: (rssPages * 4096) / 1048576 };
}

async function health() {
  const response = await fetch(`${httpBase}/health`, {
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`/health returned HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const before = await health();
  let pid = null;
  try {
    pid = Number(execFileSync(
      "systemctl",
      ["--user", "show", "crimson-relay", "-p", "MainPID", "--value"],
      { stdio: ["ignore", "pipe", "ignore"] },
    ).toString().trim()) || null;
  } catch {
    // Not managed by the expected user unit; CPU/RSS sampling is optional.
  }
  const cpuStart = pid ? readCpu(pid) : null;
  const wallStart = performance.now();

  console.log(`spawning ${bots} bots against ${url} for ${seconds}s (seed=${seed})...`);
  for (let index = 0; index < bots; index += 1) {
    sockets.push(spawnBot(index));
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));

  const after = await health();
  const readyResponse = await fetch(`${httpBase}/ready`, {
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  const readyBody = await readyResponse.json().catch(() => null);
  const cpuEnd = pid ? readCpu(pid) : null;
  const wallMs = performance.now() - wallStart;
  const gaps = stats.gaps.sort((left, right) => left - right);
  const percentile = (fraction) => (
    gaps[Math.max(0, Math.ceil(gaps.length * fraction) - 1)] ?? 0
  );
  const expectedTicks = Math.max(
    1,
    Math.round((wallMs / 1000) * (before.runtime?.tickRate ?? 20)),
  );
  const ticksAdvanced = after.tick - before.tick;
  const errorCount = Object.values(stats.errors).reduce((sum, count) => sum + count, 0);
  const result = {
    seed,
    joined: `${stats.joined}/${bots}`,
    joinedCount: stats.joined,
    joinRatio: Number((stats.joined / bots).toFixed(4)),
    activeCount: stats.active,
    activeRatio: Number((stats.active / bots).toFixed(4)),
    errors: stats.errors,
    errorCount,
    serverPlayers: after.players,
    ticksAdvanced,
    expectedTicks,
    tickRatio: Number((ticksAdvanced / expectedTicks).toFixed(4)),
    snapshotGapMs: gaps.length
      ? {
        p50: Math.round(percentile(0.5)),
        p95: Math.round(percentile(0.95)),
        p99: Math.round(percentile(0.99)),
        max: Math.round(gaps.at(-1)),
      }
      : null,
    downlinkMbps: Number(((stats.bytes * 8) / wallMs / 1000).toFixed(1)),
    serverCpuPercent: cpuStart
      ? Number((((cpuEnd.ticks - cpuStart.ticks) / 100) / (wallMs / 1000) * 100).toFixed(1))
      : null,
    serverRssMb: cpuEnd ? Number(cpuEnd.rssMb.toFixed(0)) : null,
    eventsPerSecond: Math.round(
      Object.values(stats.events).reduce((sum, count) => sum + count, 0) / (wallMs / 1000),
    ),
    topEvents: Object.fromEntries(
      Object.entries(stats.events).sort((left, right) => right[1] - left[1]).slice(0, 6),
    ),
    readyStatus: readyResponse.status,
    readinessChecks: readyBody?.checks ?? null,
    persistence: after.persistence,
    runtime: after.runtime,
    thresholds,
  };
  const failures = evaluateStressThresholds(result, thresholds);
  console.log(JSON.stringify({ ...result, failures }, null, 1));
  if (failures.length > 0) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 2;
} finally {
  stopping = true;
  for (const socket of sockets) socket.terminate();
}
