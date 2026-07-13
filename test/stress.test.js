import assert from "node:assert/strict";
import test from "node:test";

import {
  createSeededRandom,
  evaluateStressThresholds,
  parseStressArgs,
} from "../tools/stress-lib.js";

test("stress bot random streams are repeatable per seed", () => {
  const first = createSeededRandom("nightly:7");
  const second = createSeededRandom("nightly:7");
  const other = createSeededRandom("nightly:8");
  const sequence = Array.from({ length: 8 }, () => first());
  assert.deepEqual(sequence, Array.from({ length: 8 }, () => second()));
  assert.notDeepEqual(sequence, Array.from({ length: 8 }, () => other()));
  assert.equal(sequence.every((value) => value >= 0 && value < 1), true);
});

test("stress arguments preserve positional compatibility and accept CI thresholds", () => {
  const parsed = parseStressArgs([
    "30",
    "20",
    "ws://127.0.0.1:3000/ws",
    "--seed",
    "ci-seed",
    "--min-join-ratio",
    "1",
    "--min-tick-ratio",
    "0.9",
    "--min-active-ratio",
    "1",
    "--max-p95-ms",
    "400",
    "--max-errors",
    "0",
    "--require-ready",
  ]);
  assert.equal(parsed.bots, 30);
  assert.equal(parsed.seconds, 20);
  assert.equal(parsed.seed, "ci-seed");
  assert.deepEqual(parsed.thresholds, {
    minJoinRatio: 1,
    minTickRatio: 0.9,
    minActiveRatio: 1,
    maxP95Ms: 400,
    maxP99Ms: undefined,
    maxErrors: 0,
    requireReady: true,
  });
  assert.throws(() => parseStressArgs(["0"]), /positive integer/);
  assert.throws(() => parseStressArgs(["1", "1", "http://example.test"]), /ws:\/\//);
});

test("stress thresholds report every regression and allow observation-only runs", () => {
  const result = {
    joinRatio: 0.8,
    tickRatio: 0.75,
    activeRatio: 0.7,
    snapshotGapMs: { p95: 450, p99: 700 },
    errorCount: 2,
    readyStatus: 503,
  };
  assert.deepEqual(evaluateStressThresholds(result, {}), []);
  const failures = evaluateStressThresholds(result, {
    minJoinRatio: 1,
    minTickRatio: 0.9,
    minActiveRatio: 1,
    maxP95Ms: 400,
    maxP99Ms: 600,
    maxErrors: 0,
    requireReady: true,
  });
  assert.equal(failures.length, 7);
  assert.match(failures.join("\n"), /readiness returned HTTP 503/);
});
