import assert from "node:assert/strict";
import test from "node:test";

import { createRandomFromState, createSeededRandom } from "../src/server/random.js";
import { World } from "../src/server/world.js";

test("seeded random streams repeat and expose a portable state", () => {
  const first = createSeededRandom("dungeon-phase-0");
  const second = createSeededRandom("dungeon-phase-0");
  const sequence = Array.from({ length: 8 }, () => first());

  assert.deepEqual(sequence, Array.from({ length: 8 }, () => second()));
  assert.equal(sequence.every((value) => value >= 0 && value < 1), true);
  const state = first.getState();
  assert.equal(state.algorithm, "mulberry32");
  assert.equal(Number.isInteger(state.state), true);
});

test("restoring random state resumes the exact stream", () => {
  const original = createSeededRandom("restore-me");
  original();
  original();
  const checkpoint = original.getState();
  const expected = Array.from({ length: 6 }, () => original());

  const restored = createRandomFromState(checkpoint);
  assert.deepEqual(Array.from({ length: 6 }, () => restored()), expected);
  assert.throws(() => createRandomFromState({ algorithm: "unknown", state: 1 }), /invalid random state/);
  assert.throws(() => restored.setState({ algorithm: "mulberry32", state: -1 }), /invalid random state/);
});

test("World defaults to a stateful RNG while preserving function injection", () => {
  const first = new World({ randomSeed: "world-seed", spawnMobs: false, mobTargetCount: 0 });
  const second = new World({ randomSeed: "world-seed", spawnMobs: false, mobTargetCount: 0 });
  assert.deepEqual(
    Array.from({ length: 5 }, () => first.rng()),
    Array.from({ length: 5 }, () => second.rng()),
  );

  const checkpoint = first.getRandomState();
  const expected = Array.from({ length: 4 }, () => first.rng());
  const resumed = new World({ rngState: checkpoint, spawnMobs: false, mobTargetCount: 0 });
  assert.deepEqual(Array.from({ length: 4 }, () => resumed.rng()), expected);

  const injected = new World({ rng: () => 0.5, spawnMobs: false, mobTargetCount: 0 });
  assert.equal(injected.getRandomState(), null);
  assert.throws(() => injected.restoreRandomState(checkpoint), /not stateful/);
  assert.throws(() => new World({ rng: () => 0.5, rngState: checkpoint }), /mutually exclusive/);
});
