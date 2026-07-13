import test from "node:test";
import assert from "node:assert/strict";

import { createDungeonPlan } from "../src/server/dungeon.js";

test("the relay vault plan is deterministic and isolated by instance id", () => {
  const options = { instanceId: "vault-7", averageLevel: 42, width: 4800, height: 2700 };
  const first = createDungeonPlan(options);
  const second = createDungeonPlan(options);

  assert.deepEqual(first, second);
  assert.equal(first.mapId, "dungeon:vault-7");
  assert.equal(first.enemies.length, 6);
  assert.equal(new Set(first.enemies.map((enemy) => enemy.id)).size, first.enemies.length);
  assert.ok(first.enemies.every((enemy) => enemy.mapId === first.mapId));
  assert.equal(first.enemies.at(-1).boss, true);
});

test("the relay vault clamps levels and scales deterministic completion rewards", () => {
  const low = createDungeonPlan({ instanceId: "low", averageLevel: -20, width: 4800, height: 2700 });
  const high = createDungeonPlan({ instanceId: "high", averageLevel: 5000, width: 4800, height: 2700 });

  assert.equal(low.level, 1);
  assert.equal(high.level, 1000);
  assert.ok(high.reward.xp > low.reward.xp);
  assert.ok(high.reward.gold > low.reward.gold);
  assert.equal(low.reward.dew, 1);
  assert.equal(high.reward.dew, 3);
});
