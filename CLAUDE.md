# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

CRIMSON RELAY — a server-authoritative online action RPG prototype. Node.js 20+ server (Linux), browser client, JSON-over-WebSocket protocol. World state is in-memory only; nothing persists across restarts. README.md and docs/ARCHITECTURE.md are written in Chinese.

## Commands

```bash
npm start                          # run the server (HOST/PORT env vars, default 127.0.0.1:3000)
npm run dev                        # run with auto-restart on file changes
npm test                           # run all tests (node:test runner)
node --test test/server-world.test.js                 # run one test file
node --test --test-name-pattern="respawn"             # run tests matching a name
npm run check                      # syntax-check server and client scripts
```

There is no lint, build, or bundler step. The only dependency is `ws`. ESM throughout (`"type": "module"`).

## Architecture

The core constraint is **server authority**: the client sends intents (`join`, `input`, `allocate`, `upgrade`, `respawn`); the server validates everything and owns all outcomes — hits, damage, XP, positions. Never let the client decide game results.

- `src/server/server.js` — `GameServer`: HTTP static file serving from `public/` (with path-traversal guard and SPA fallback to `index.html`), `GET /health`, WebSocket upgrade restricted to `/ws`, message validation (UTF-8 JSON only, 16 KiB cap, known `type` required), and the fixed tick loop that calls `world.update()`, broadcasts drained events, and sends per-player snapshots. Also runnable directly as the entry point.
- `src/server/world.js` — `World`: the authoritative simulation (players, mobs, projectiles, XP/levels, quests, respawn). Consumes queued inputs at tick boundaries; input `seq` numbers are monotonic — older seqs cannot overwrite newer input. Throws `WorldError(code, message)` for rejected commands, which the gateway converts to protocol `error` messages.
- `src/server/definitions.js` — single source of gameplay rules: `PROTOCOL_VERSION`, `TICK_RATE` (20), `SNAPSHOT_RATE` (10), archetypes, skills, stats. `publicArchetypes()` deliberately strips server-only numbers (damage, ranges) before sending to clients.
- `src/server/index.js` — barrel re-exporting the public API.
- `public/client.js` — browser client: captures input, sends intents, renders server snapshots on Canvas. Contains no gameplay rules.

Server→client messages: `welcome` (carries `protocol: 1`), `snapshot` (full replaceable state), `event` (discrete results), `error` (`code`, `message`, `requestType?`). Any breaking protocol field change must increment `PROTOCOL_VERSION` in definitions.js. The full protocol tables are in docs/ARCHITECTURE.md.

## Testing conventions

Tests use `node:test` + `node:assert/strict` and drive the `World` directly — no network, no real timers. Construct deterministic worlds via options: `new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 })`, place entities with `addPlayer`/`spawnMob`, feed input with `setInput`, and step time manually with `world.update(dt)`. Follow this pattern; don't add tests that depend on real time or network latency.
