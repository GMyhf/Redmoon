// Bot swarm stress tool: joins N bots that wander and fight, then reports
// server tick health, snapshot cadence jitter, and process CPU/RSS.
//
//   node tools/stress.mjs [bots=50] [seconds=60] [url=ws://127.0.0.1:8080/ws]
//
// Bots use fresh names per run (persisted account stores stay clean of
// token conflicts) and negotiate JSON snapshots so the measured cadence
// matches the browser client path.
import { readFileSync } from "node:fs";

import { WebSocket } from "ws";

const bots = Number(process.argv[2] ?? 50);
const seconds = Number(process.argv[3] ?? 60);
const url = process.argv[4] ?? "ws://127.0.0.1:8080/ws";
const httpBase = url.replace("ws://", "http://").replace("wss://", "https://").replace(/\/ws$/, "");
const runId = Math.random().toString(36).slice(2, 7);

const stats = {
  joined: 0,
  errors: {},
  snapshots: 0,
  gaps: [],       // inter-snapshot gaps on sampled bots (ms)
  bytes: 0,
  events: {},     // event name -> count (across all bots)
};

function spawnBot(index) {
  const socket = new WebSocket(url);
  const sampled = index % 10 === 0; // cadence sampling on every 10th bot
  let lastSnapshot = 0;
  let seq = 0;
  let mover = null;

  socket.on("open", () => {
    socket.send(JSON.stringify({
      type: "join", protocol: 2, name: `Bot-${runId}-${index}`, archetype: "vanguard",
    }));
  });
  socket.on("message", (data, isBinary) => {
    stats.bytes += data.length ?? 0;
    if (isBinary) return;
    // Parsing 50 bots' full snapshots saturates this tool's own event loop
    // and pollutes the latency numbers: after joining, non-sampled bots
    // sniff the type from the frame head instead of parsing.
    if (mover && !sampled) {
      const head = data.subarray(0, 32).toString();
      if (head.includes('"type":"event"')) {
        const name = /"event":"([a-zA-Z]+)"/.exec(data.subarray(0, 120).toString());
        if (name) stats.events[name[1]] = (stats.events[name[1]] ?? 0) + 1;
      }
      return;
    }
    const message = JSON.parse(data.toString());
    if (message.type === "snapshot") {
      stats.snapshots += 1;
      if (sampled) {
        const now = performance.now();
        if (lastSnapshot > 0) stats.gaps.push(now - lastSnapshot);
        lastSnapshot = now;
      }
      if (!mover) {
        stats.joined += 1;
        // Wander: new random heading every 1.5-3s, always fighting (autoFight).
        mover = setInterval(() => {
          const angle = Math.random() * Math.PI * 2;
          seq += 1;
          socket.send(JSON.stringify({
            type: "input", seq,
            move: { x: Math.cos(angle), y: Math.sin(angle) },
            sprint: Math.random() < 0.3,
            aim: { x: 2400, y: 1350 },
            primary: Math.random() < 0.5,
            q: Math.random() < 0.2,
          }));
        }, 1500 + Math.random() * 1500);
      }
    } else if (message.type === "event") {
      stats.events[message.event] = (stats.events[message.event] ?? 0) + 1;
    } else if (message.type === "error") {
      stats.errors[message.code] = (stats.errors[message.code] ?? 0) + 1;
    }
  });
  socket.on("close", () => clearInterval(mover));
  socket.on("error", () => {});
  return socket;
}

function readCpu(pid) {
  const parts = readFileSync(`/proc/${pid}/stat`, "utf8").split(" ");
  const ticks = Number(parts[13]) + Number(parts[14]);
  const rssPages = Number(readFileSync(`/proc/${pid}/statm`, "utf8").split(" ")[1]);
  return { ticks, rssMb: (rssPages * 4096) / 1048576 };
}

async function health() {
  return (await fetch(`${httpBase}/health`)).json();
}

const before = await health();
let pid = null;
try {
  const { execSync } = await import("node:child_process");
  pid = Number(execSync("systemctl --user show crimson-relay -p MainPID --value").toString().trim()) || null;
} catch { /* not under systemd; CPU sampling skipped */ }
const cpuStart = pid ? readCpu(pid) : null;
const wallStart = performance.now();

console.log(`spawning ${bots} bots against ${url} for ${seconds}s...`);
const sockets = [];
for (let index = 0; index < bots; index += 1) {
  sockets.push(spawnBot(index));
  await new Promise((resolve) => setTimeout(resolve, 25)); // staggered joins
}

await new Promise((resolve) => setTimeout(resolve, seconds * 1000));

const after = await health();
const cpuEnd = pid ? readCpu(pid) : null;
const wallMs = performance.now() - wallStart;
for (const socket of sockets) socket.terminate();

const gaps = stats.gaps.sort((a, b) => a - b);
const percentile = (p) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))] ?? 0;
const ready = await fetch(`${httpBase}/ready`);

console.log(JSON.stringify({
  joined: `${stats.joined}/${bots}`,
  errors: stats.errors,
  serverPlayers: after.players,
  ticksAdvanced: after.tick - before.tick,
  expectedTicks: Math.round(wallMs / 50),
  snapshotGapMs: gaps.length
    ? { p50: Math.round(percentile(0.5)), p95: Math.round(percentile(0.95)), p99: Math.round(percentile(0.99)), max: Math.round(gaps.at(-1)) }
    : null,
  downlinkMbps: Number(((stats.bytes * 8) / wallMs / 1000).toFixed(1)),
  serverCpuPercent: cpuStart ? Number((((cpuEnd.ticks - cpuStart.ticks) / 100) / (wallMs / 1000) * 100).toFixed(1)) : null,
  serverRssMb: cpuEnd ? Number(cpuEnd.rssMb.toFixed(0)) : null,
  eventsPerSecond: Math.round(Object.values(stats.events).reduce((a, b) => a + b, 0) / (wallMs / 1000)),
  topEvents: Object.fromEntries(Object.entries(stats.events).sort((a, b) => b[1] - a[1]).slice(0, 6)),
  readyStatus: ready.status,
  persistence: after.persistence,
}, null, 1));
process.exit(0);
