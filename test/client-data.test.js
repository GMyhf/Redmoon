// The client owns what players read; the server owns the canonical names and
// every rule. These two tables therefore have to agree on which archetypes and
// slots exist. `public/data.js` is pure data with no DOM dependency, so the
// fast suite can hold that contract without booting a browser.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ARCHETYPES as CLIENT_ARCHETYPES } from "../public/data.js";
import { PROTOCOL_VERSION, SKILL_SLOTS, publicArchetypes, skillDefinition } from "../src/server/definitions.js";

const SLOT_FIELDS = { q: "q", e: "e", r: "r", c: "c", f: "f" };

test("the client has a display name and blurb for every archetype the server ships", () => {
  const served = publicArchetypes();
  assert.deepEqual(
    Object.keys(CLIENT_ARCHETYPES).sort(),
    Object.keys(served).sort(),
    "an archetype exists on one side only",
  );

  for (const [key, hero] of Object.entries(CLIENT_ARCHETYPES)) {
    assert.ok(hero.label, `${key} has no display label`);
    assert.ok(hero.primaryName && hero.primaryDesc, `${key} has no primary attack copy`);
    // R and C are class-defining since they stopped sharing one behavior, so a
    // missing entry would silently drop two of six actions from the roster UI.
    for (const slot of SKILL_SLOTS) {
      const field = SLOT_FIELDS[slot];
      assert.ok(hero[field], `${key}.${field} is missing its skill name`);
      assert.ok(hero[`${field}Desc`], `${key}.${field}Desc is missing its blurb`);
    }
  }
});

test("skill copy is localised on the client, canonical on the server", () => {
  const hasHan = (value) => /[一-鿿]/.test(value);
  for (const [key, hero] of Object.entries(CLIENT_ARCHETYPES)) {
    for (const slot of SKILL_SLOTS) {
      const shown = hero[SLOT_FIELDS[slot]];
      assert.ok(hasHan(shown), `${key}.${slot} shows "${shown}", which is not localised copy`);
      // The server name is the id players never see; it must not drift into
      // being the display string again.
      const canonical = skillDefinition(key, slot).name;
      assert.ok(!hasHan(canonical), `${key}:${slot} server name "${canonical}" should stay canonical`);
    }
  }
});

// A client that declares the wrong protocol is refused at join. The fast suite
// imports PROTOCOL_VERSION rather than hard-coding it, so a bump leaves the
// server tests green while both clients quietly stop being able to connect —
// which is exactly what happened when honour went public in v4.
test("both clients declare the protocol version the server speaks", () => {
  const declarations = [
    ["public/client.js", /const CLIENT_PROTOCOL = (\d+);/],
    ["clients/godot/scripts/main.gd", /const CLIENT_PROTOCOL := (\d+)/],
  ];
  for (const [file, pattern] of declarations) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const match = pattern.exec(source);
    assert.ok(match, `${file} declares no CLIENT_PROTOCOL`);
    assert.equal(
      Number(match[1]),
      PROTOCOL_VERSION,
      `${file} speaks protocol ${match[1]} but the server speaks ${PROTOCOL_VERSION}`,
    );
  }
});
