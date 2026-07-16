// Real-browser interaction tests: headless Chrome drives the production
// client (public/) against a real in-process GameServer. Run with
// `npm run test:browser`; kept out of `npm test` so the fast world suite
// never needs a browser. Server-side state (gold, positions, items) is
// arranged directly on the authoritative World — the browser still has to
// earn every outcome through the real protocol.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";

import { hashSecret } from "../../src/server/session.js";

import {
  joinAs,
  launchBrowser,
  newPage,
  playerByName,
  startPersistentServer,
  startServer,
  waitForServer,
} from "./helpers.mjs";

const browser = await launchBrowser();
after(() => browser.close());

test("joining puts the operator into the world with a live HUD", async (t) => {
  const { server, url } = await startServer(t);
  const page = await newPage(t, browser);
  await joinAs(page, url, "Alpha");

  assert.equal(await page.isHidden("#join-panel"), true, "join panel goes away");
  assert.equal(await page.textContent("#operator-display-name"), "ALPHA");
  await page.waitForFunction(() =>
    document.querySelector("#connection b")?.textContent === "在线");
  await page.waitForFunction(() =>
    document.querySelector("#population")?.textContent.includes("1 在线"));
  const player = playerByName(server, "Alpha");
  assert.ok(player, "the server owns a live player for the session");
  assert.equal(player.archetype, "vanguard");
});

test("switching characters clears the previous party roster", async (t) => {
  const { server, url } = await startServer(t);
  const page = await newPage(t, browser);
  await joinAs(page, url, "Relay-07");

  const oldPlayer = playerByName(server, "Relay-07");
  const oldMembers = ["Relay-03", "Relay-05", "Relay-06"].map((name, index) =>
    server.world.addPlayer(`old-party-${index}`, { name, archetype: "vanguard" }));
  const oldParty = { id: "party-old", members: [oldPlayer.id, ...oldMembers.map((member) => member.id)] };
  server.world.parties.set(oldParty.id, oldParty);
  for (const memberId of oldParty.members) server.world.players.get(memberId).partyId = oldParty.id;
  await page.waitForFunction(() => document.querySelector("#party-state")?.textContent === "队伍 4/4");

  await page.click("#leave-button");
  await page.waitForSelector("#join-panel", { state: "visible" });
  assert.equal(await page.isHidden("#social-panel"), true, "old social panel is cleared on leave");

  await joinAs(page, url, "Relay-tinglan");
  const newPlayer = playerByName(server, "Relay-tinglan");
  const relay08 = server.world.addPlayer("new-party-08", { name: "Relay-08", archetype: "vanguard" });
  const newParty = { id: "party-new", members: [newPlayer.id, relay08.id] };
  server.world.parties.set(newParty.id, newParty);
  newPlayer.partyId = newParty.id;
  relay08.partyId = newParty.id;
  await page.waitForFunction(() => document.querySelector("#party-state")?.textContent === "队伍 2/4");
  const partyRows = await page.$eval("#social-list", (list) => {
    const rows = [];
    let node = list.firstElementChild?.nextElementSibling;
    while (node && !node.classList.contains("social-section")) {
      rows.push(node.textContent);
      node = node.nextElementSibling;
    }
    return rows.join(" ");
  });
  assert.doesNotMatch(partyRows, /Relay-03|Relay-05|Relay-06/);
});

test("HUD panels drag and collapse, and the layout survives a reload", async (t) => {
  const { url } = await startServer(t);
  const page = await newPage(t, browser);
  await joinAs(page, url, "Bravo");

  // Drag the operator panel by its heading (not over its buttons).
  const handle = page.locator(".operator-panel [data-drag-handle]");
  const box = await handle.boundingBox();
  const panelBefore = await page.locator(".operator-panel").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const pressedBox = await page.locator(".operator-panel").boundingBox();
  assert.ok(
    Math.abs(pressedBox.y - panelBefore.y) < 1,
    "pointer-down keeps the panel in the HUD coordinate system instead of jumping by the top bar",
  );
  await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2 + 90, { steps: 6 });
  await page.mouse.up();
  const draggedLeft = await page.$eval(".operator-panel", (el) => el.style.left);
  assert.notEqual(draggedLeft, "", "dragging pins the panel to inline coordinates");

  // Collapse the stats panel.
  await page.click(".stats-panel [data-panel-toggle]");
  assert.equal(
    await page.$eval(".stats-panel", (el) => el.classList.contains("is-collapsed")),
    true,
  );

  // Both survive a reload — applied from localStorage before joining again.
  await page.reload();
  await page.waitForFunction(() =>
    document.querySelector(".operator-panel")?.style.left !== "");
  assert.equal(
    await page.$eval(".operator-panel", (el) => el.style.left),
    draggedLeft,
    "the dragged position is restored",
  );
  assert.equal(
    await page.$eval(".stats-panel", (el) => el.classList.contains("is-collapsed")),
    true,
    "the collapsed state is restored",
  );
});

test("重置界面 restores default positions and clears the stored layout", async (t) => {
  const { url } = await startServer(t);
  const page = await newPage(t, browser);
  await joinAs(page, url, "Charlie");

  const handle = page.locator(".operator-panel [data-drag-handle]");
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 120, { steps: 4 });
  await page.mouse.up();
  await page.click(".stats-panel [data-panel-toggle]");

  await page.click("#reset-hud-button");
  assert.equal(await page.$eval(".operator-panel", (el) => el.style.left), "");
  assert.equal(
    await page.$eval(".stats-panel", (el) => el.classList.contains("is-collapsed")),
    false,
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("crimson-relay-hud-layout")),
    null,
    "the stored layout is gone",
  );
});

test("mobile keeps its docked layout independent of desktop drag positions", async (t) => {
  const { url } = await startServer(t);
  const page = await newPage(t, browser, {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  // Desktop and phone profiles deliberately disagree. The client must use
  // only the profile selected by the current media-query breakpoint.
  await page.context().addInitScript(() => {
    localStorage.setItem("crimson-relay-hud-layout", JSON.stringify({
      version: 2,
      desktop: {
        "operator-panel": { left: 500, top: 400 },
        "stats-panel": { collapsed: false },
      },
      mobile: {
        "stats-panel": { collapsed: true },
      },
    }));
  });
  await joinAs(page, url, "Delta");

  assert.equal(
    await page.$eval(".operator-panel", (el) => el.style.left),
    "",
    "stored desktop coordinates do not apply on a phone",
  );
  assert.equal(
    await page.$eval(".stats-panel", (el) => el.classList.contains("is-collapsed")),
    true,
    "the phone uses its own collapse state",
  );

  // Dragging is disabled: the panel stays CSS-anchored.
  const handle = page.locator(".operator-panel [data-drag-handle]");
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 160, { steps: 4 });
  await page.mouse.up();
  assert.equal(await page.$eval(".operator-panel", (el) => el.style.left), "");

  await page.setViewportSize({ width: 960, height: 600 });
  await page.waitForFunction(() => document.querySelector(".operator-panel")?.style.left !== "");
  assert.equal(await page.$eval(".stats-panel", (el) => el.classList.contains("is-collapsed")), false);
  assert.equal(await page.$eval(".operator-panel", (el) => el.style.left), "500px");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector(".operator-panel")?.style.left === "");
  await page.click("#reset-hud-button");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("crimson-relay-hud-layout")));
  assert.deepEqual(stored.mobile, {}, "mobile reset clears only the phone profile");
  assert.equal(stored.desktop["operator-panel"].left, 500, "desktop layout survives a phone reset");
});

test("320px mobile keeps primary controls in bounds without panel overlap", async (t) => {
  const { url } = await startServer(t);
  const page = await newPage(t, browser, {
    viewport: { width: 320, height: 568 },
    isMobile: true,
    hasTouch: true,
  });
  await joinAs(page, url, "Narrow");

  const layout = await page.evaluate(() => {
    const rect = (selector) => {
      const bounds = document.querySelector(selector).getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
      };
    };
    return {
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      brand: rect(".brand-lockup"),
      readout: rect(".server-readout"),
      operator: rect(".operator-panel"),
      tabs: [".stats-panel", ".gear-panel", ".quest-panel"]
        .map((selector) => rect(selector)),
      chat: rect(".chat-form"),
      action: rect(".action-bar"),
      abilities: [...document.querySelectorAll(".action-bar .ability")].flatMap((button) => {
        const bounds = button.getBoundingClientRect();
        return bounds.width > 0 ? [{ left: bounds.left, right: bounds.right }] : [];
      }),
    };
  });

  assert.equal(layout.width, 320);
  assert.ok(layout.scrollWidth <= layout.width, "the HUD creates no horizontal overflow");
  assert.ok(layout.brand.right <= layout.readout.left, "brand and server controls do not overlap");
  assert.ok(
    layout.operator.bottom <= Math.min(...layout.tabs.map((tab) => tab.top)) + 1,
    `operator stays above mobile tabs: ${JSON.stringify(layout)}`,
  );
  assert.ok(
    Math.max(...layout.tabs.map((tab) => tab.bottom)) <= layout.chat.top,
    `mobile tabs stay above chat: ${JSON.stringify(layout)}`,
  );
  assert.ok(
    layout.chat.bottom <= layout.action.top,
    `chat stays above the action bar: ${JSON.stringify({ chat: layout.chat, action: layout.action })}`,
  );
  for (const box of [layout.brand, layout.readout, layout.operator, layout.chat, layout.action, ...layout.tabs]) {
    assert.ok(box.left >= 0 && box.right <= layout.width, "a primary mobile control stays in bounds");
  }
  for (let index = 1; index < layout.abilities.length; index += 1) {
    assert.ok(layout.abilities[index - 1].right <= layout.abilities[index].left + 1);
  }

  await page.click(".gear-panel [data-panel-toggle]");
  const expanded = await page.locator(".gear-panel").boundingBox();
  const chat = await page.locator(".chat-form").boundingBox();
  assert.ok(expanded.x >= 0 && expanded.x + expanded.width <= 320);
  assert.ok(expanded.y + expanded.height <= chat.y + 1, "expanded mobile panel stays above chat");
});

test("a party invite sent from one browser is accepted in another", async (t) => {
  const { server, url } = await startServer(t);
  const hostPage = await newPage(t, browser);
  const guestPage = await newPage(t, browser);
  await joinAs(hostPage, url, "HostLongOperator");
  await joinAs(guestPage, url, "GuestLngOperator");

  // A friend remains invitable, but now carries an explicit online label
  // instead of relying on green text alone.
  await hostPage.click('#social-list button[data-social="friend-add"]');
  await hostPage.waitForFunction(() =>
    document.querySelector("#social-list")?.textContent.includes("● 在线"));
  assert.match(await hostPage.textContent("#social-list"), /GuestLngOperator/);

  const guest = playerByName(server, "GuestLngOperator");
  guest.mapId = "desert";
  await hostPage.evaluate(() =>
    document.querySelector('#social-list button[data-social="invite"]')?.remove());
  await hostPage.waitForSelector('#social-list button[data-social="invite"]', { state: "visible" });
  assert.equal(
    await hostPage.evaluate(() =>
      document.querySelector('#social-list button[data-social="invite"]')?.dataset.target),
    guest.id,
    "an online friend remains invitable after leaving the current map",
  );

  await guestPage.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await waitForServer(() => [...server.wss.clients]
    .find((socket) => socket.playerId === guest.id)?.clientVisible === false);
  await hostPage.click('#social-list button[data-social="invite"]');

  const accept = guestPage.locator(".event-message button", { hasText: "接受" });
  await accept.waitFor({ state: "visible" });
  assert.match(
    await guestPage.textContent(".event-message"),
    /HostLongOperator 邀请你组队/,
  );

  await guestPage.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await waitForServer(() => [...server.wss.clients]
    .find((socket) => socket.playerId === guest.id)?.clientVisible === true);
  assert.equal(
    await guestPage.evaluate(() =>
      document.querySelectorAll("[data-party-invite-from] button").length),
    1,
    "foreground reminder is deduplicated",
  );
  await accept.click();

  for (const page of [hostPage, guestPage]) {
    await page.waitForFunction(() =>
      document.querySelector("#party-state")?.textContent.includes("队伍 2/4"));
    const partyRows = await page.evaluate(() => [...document.querySelectorAll(".social-row")]
      .filter((row) => row.querySelector(".social-status.is-party"))
      .map((row) => ({
        name: row.querySelector(".social-name")?.textContent,
        status: row.querySelector(".social-status")?.textContent,
        whiteSpace: getComputedStyle(row.querySelector(".social-name")).whiteSpace,
      })));
    assert.deepEqual(
      partyRows.map((row) => row.name).sort(),
      ["GuestLngOperator", "HostLongOperator"],
    );
    assert.equal(partyRows.every((row) => row.whiteSpace !== "nowrap"), true);
    assert.equal(partyRows.some((row) => row.status === "本人"), true);
    assert.equal(partyRows.some((row) => row.status === "队友"), true);
  }
});

test("buying from a shopkeeper spends gold and lands in the bag", async (t) => {
  const { server, url } = await startServer(t);
  const page = await newPage(t, browser);
  await joinAs(page, url, "Shopper");

  const player = playerByName(server, "Shopper");
  const grocer = server.world.shops.find((shop) => shop.id === "grocer");
  player.gold = 500;
  player.x = grocer.x;
  player.y = grocer.y;

  await page.waitForSelector("#shop-panel", { state: "visible" });
  await page.click('#shop-goods button[data-good="potion-s"]');

  await waitForServer(() => player.inventory.length === 1);
  assert.equal(player.gold, 470, "the server debited the scaled price");
  assert.ok(Number.isFinite(player.inventory[0].heal), "a potion arrived in the bag");
  await page.waitForFunction(() =>
    document.querySelector("#gold-amount")?.textContent.includes("470"));
  await page.waitForFunction(() =>
    [...document.querySelectorAll("#event-feed .event-message")]
      .some((entry) => entry.textContent.includes("购入")));
});

test("equipping from the bag fills the paper-doll slot", async (t) => {
  const { server, url } = await startServer(t);
  const page = await newPage(t, browser);
  await joinAs(page, url, "Squire");

  const player = playerByName(server, "Squire");
  player.inventory.push({
    id: "item-e2e-1",
    slot: "weapon",
    rarity: "common",
    tier: 1,
    level: 1,
    name: "pulse-blade",
    bonuses: { power: 2 },
  });

  await page.click('#inventory-list button[data-action="equip"]');
  await page.waitForSelector(".slot-box.slot-weapon.is-filled");
  await waitForServer(() => player.equipment.weapon);
  assert.equal(player.equipment.weapon.id, "item-e2e-1");
  assert.equal(player.inventory.length, 0, "the item left the bag");
});

test("focused controls keep native keys and V consumes the shown potion", async (t) => {
  const { server, url } = await startServer(t);
  const page = await newPage(t, browser);
  await joinAs(page, url, "Keysafe");

  const player = playerByName(server, "Keysafe");
  player.inventory.push({
    id: "item-e2e-potion",
    slot: "potion",
    rarity: "common",
    tier: 1,
    level: 1,
    name: "Mending Vial",
    bonuses: {},
    heal: 60,
  });
  player.hp = player.maxHp - 50;
  await page.waitForSelector('#inventory-list button[data-action="use"]');
  assert.match(
    await page.$eval('#inventory-list button[data-action="use"]', (button) => button.title),
    /快捷键 V/,
  );

  await page.focus("#chat-channel");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "chat-channel");
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await page.$eval("#chat-channel", (select) => select.value),
    "map",
    "ArrowDown changes the focused select instead of moving the character",
  );
  await page.keyboard.press("Enter");

  await page.click("#reset-hud-button");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "reset-hud-button");
  await page.keyboard.press("t");
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(player.autoFight, true, "T on a focused button does not toggle auto-fight");

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("v");
  await waitForServer(() => player.inventory.length === 0);
  assert.equal(player.hp, player.maxHp, "V used and consumed the potion");
});

test("chat reaches other browsers on the global and map channels", async (t) => {
  const { url } = await startServer(t);
  const pageA = await newPage(t, browser);
  const pageB = await newPage(t, browser);
  await joinAs(pageA, url, "EchoOne");
  await joinAs(pageB, url, "EchoTwo");

  // Enter focuses the chat box from gameplay, typing sends on submit.
  await pageA.keyboard.press("Enter");
  await pageA.waitForFunction(() => document.activeElement?.id === "chat-input");
  await pageA.keyboard.type("hello relay");
  await pageA.keyboard.press("Enter");
  for (const page of [pageA, pageB]) {
    await page.waitForFunction(() =>
      [...document.querySelectorAll("#chat-feed .chat-global")]
        .some((entry) => entry.textContent.includes("hello relay")));
  }

  // Map channel: both players stand in town, so both receive it.
  await new Promise((resolve) => setTimeout(resolve, 700)); // server chat cooldown
  await pageA.selectOption("#chat-channel", "map");
  await pageA.keyboard.press("Enter");
  await pageA.keyboard.type("town only");
  await pageA.keyboard.press("Enter");
  for (const page of [pageA, pageB]) {
    await page.waitForFunction(() =>
      [...document.querySelectorAll("#chat-feed .chat-map")]
        .some((entry) => entry.textContent.includes("town only")));
  }
});

test("a dropped connection resumes play but explicit leave survives later reconnects", async (t) => {
  const { server, url } = await startServer(t);
  const page = await newPage(t, browser);
  await joinAs(page, url, "Phoenix");

  const before = playerByName(server, "Phoenix");
  before.gold = 123;

  // Kill every socket server-side: the client must notice, retry, and
  // rejoin with its stored session token — no user action involved.
  for (const socket of server.wss.clients) socket.terminate();
  await page.waitForFunction(() =>
    document.querySelector("#connection b")?.textContent !== "在线");

  await page.waitForFunction(() =>
    document.querySelector("#connection b")?.textContent === "在线");
  const revived = await waitForServer(() => playerByName(server, "Phoenix"));
  assert.equal(revived.gold, 123, "progress carried across the reconnect");
  assert.equal(await page.isVisible("#hud"), true, "the HUD never fell back to the join screen");

  await page.click("#leave-button");
  await page.waitForSelector("#join-panel", { state: "visible" });
  await waitForServer(() => !playerByName(server, "Phoenix"));
  await page.evaluate(() => {
    localStorage.setItem("crimson-relay-pending-token:phoenix", "z".repeat(43));
  });
  for (const socket of server.wss.clients) socket.terminate();
  await page.waitForFunction(() =>
    document.querySelector("#connection b")?.textContent !== "在线");
  await page.waitForFunction(() =>
    document.querySelector("#connection b")?.textContent === "在线");
  await new Promise((resolve) => setTimeout(resolve, 900));
  assert.equal(playerByName(server, "Phoenix"), null, "stored pending data is not entry intent");
  assert.equal(await page.isVisible("#join-panel"), true);
});

test("a pending credential survives errors and can recover an ambiguous commit", async (t) => {
  const { server, url } = await startServer(t);
  const page = await newPage(t, browser);
  await joinAs(page, url, "PendingGuard");
  const oldToken = await page.evaluate(() =>
    localStorage.getItem("crimson-relay-token:pendingguard"));
  assert.ok(oldToken);

  await page.click("#leave-button");
  await page.waitForSelector("#join-panel", { state: "visible" });
  await waitForServer(() => !playerByName(server, "PendingGuard"));
  const pendingToken = "b".repeat(43);
  await page.evaluate((token) => {
    localStorage.setItem("crimson-relay-pending-token:pendingguard", token);
  }, pendingToken);
  server.world.accountStore.pendingguard.tokenHash = hashSecret(pendingToken);
  for (const socket of server.wss.clients) {
    socket.send(JSON.stringify({
      type: "session", token: oldToken, name: "PendingGuard", archetype: "vanguard",
    }));
  }
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(
    await page.evaluate(() => localStorage.getItem("crimson-relay-pending-token:pendingguard")),
    pendingToken,
    "an old official session response cannot erase a distinct pending bearer",
  );
  for (const socket of server.wss.clients) {
    socket.send(JSON.stringify({
      type: "error",
      code: "PROTOCOL_MISMATCH",
      message: "refresh client",
      requestType: "join",
    }));
  }
  await page.waitForFunction(() =>
    document.querySelector("#join-error")?.textContent.includes("强制刷新"));
  assert.equal(
    await page.evaluate(() => localStorage.getItem("crimson-relay-pending-token:pendingguard")),
    pendingToken,
    "a business error cannot prove that the credential commit did not land",
  );

  await page.reload();
  await page.fill("#operator-name", "PendingGuard");
  await page.click("#join-button");
  await page.waitForSelector("#hud", { state: "visible" });
  assert.equal(playerByName(server, "PendingGuard").token, pendingToken);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("crimson-relay-token:pendingguard")),
    pendingToken,
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("crimson-relay-pending-token:pendingguard")),
    null,
  );
});

test("a malformed local pending credential is repaired before join", async (t) => {
  const { url } = await startServer(t);
  const page = await newPage(t, browser);
  await page.goto(`${url}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("crimson-relay-pending-token:repair", "short");
  });
  await page.fill("#operator-name", "Repair");
  await page.click("#join-button");
  await page.waitForSelector("#hud", { state: "visible" });
  const token = await page.evaluate(() => localStorage.getItem("crimson-relay-token:repair"));
  assert.match(token, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("crimson-relay-pending-token:repair")),
    null,
  );
});

test("browser credential creation, rotation, and recovery commit through JSON persistence", async (t) => {
  const { server, url, persistPath } = await startPersistentServer(t);
  const page = await newPage(t, browser);
  await joinAs(page, url, "DurableBrowser");
  const initialToken = await page.evaluate(() =>
    localStorage.getItem("crimson-relay-token:durablebrowser"));
  let stored = JSON.parse(await readFile(persistPath, "utf8"));
  assert.equal(stored.accounts.durablebrowser.tokenHash, hashSecret(initialToken));
  assert.equal(Object.hasOwn(stored.accounts.durablebrowser, "token"), false);

  await page.click("#session-rotate-button");
  await page.waitForFunction((before) =>
    localStorage.getItem("crimson-relay-token:durablebrowser") !== before, {}, initialToken);
  const rotatedToken = await page.evaluate(() =>
    localStorage.getItem("crimson-relay-token:durablebrowser"));
  stored = JSON.parse(await readFile(persistPath, "utf8"));
  assert.equal(stored.accounts.durablebrowser.tokenHash, hashSecret(rotatedToken));

  await page.click("#recovery-issue-button");
  await page.waitForSelector("#recovery-dialog", { state: "visible" });
  const code = await page.textContent("#recovery-code-value");
  await page.click("#recovery-dialog button");
  await page.click("#leave-button");
  await page.waitForSelector("#join-panel", { state: "visible" });
  await waitForServer(() => !playerByName(server, "DurableBrowser"));
  await page.evaluate(() => {
    localStorage.removeItem("crimson-relay-token:durablebrowser");
    localStorage.removeItem("crimson-relay-pending-token:durablebrowser");
  });
  await page.fill("#operator-name", "DurableBrowser");
  await page.fill("#recovery-code", code);
  await page.click("#recover-button");
  await page.waitForSelector("#hud", { state: "visible" });
  const recoveredToken = await page.evaluate(() =>
    localStorage.getItem("crimson-relay-token:durablebrowser"));
  assert.notEqual(recoveredToken, rotatedToken);
  stored = JSON.parse(await readFile(persistPath, "utf8"));
  assert.equal(stored.accounts.durablebrowser.tokenHash, hashSecret(recoveredToken));
});

test("recovery restores the saved archetype even when another hero is selected", async (t) => {
  const { server, url } = await startServer(t);
  const page = await newPage(t, browser);
  await page.goto(`${url}/`, { waitUntil: "domcontentloaded" });
  await page.click('.archetype[data-archetype="eclipse"]');
  await page.fill("#operator-name", "Recovered");
  await page.click("#join-button");
  await page.waitForSelector("#hud", { state: "visible" });

  await page.click("#recovery-issue-button");
  await page.waitForSelector("#recovery-dialog", { state: "visible" });
  const code = await page.textContent("#recovery-code-value");
  assert.ok(code.length >= 20, "the one-time recovery code is displayed");
  await page.click("#recovery-dialog button");
  await page.click("#leave-button");
  await page.waitForSelector("#join-panel", { state: "visible" });
  await waitForServer(() => !playerByName(server, "Recovered"));

  await page.evaluate(() => {
    localStorage.removeItem("crimson-relay-token:recovered");
    localStorage.removeItem("crimson-relay-pending-token:recovered");
  });
  await page.evaluate(() =>
    document.querySelector('.archetype[data-archetype="vanguard"]')?.click());
  await page.fill("#operator-name", "Recovered");
  await page.fill("#recovery-code", code);
  await page.click("#recover-button");
  await page.waitForSelector("#hud", { state: "visible" });

  const restored = playerByName(server, "Recovered");
  assert.equal(restored.archetype, "eclipse");
  await page.waitForFunction(() =>
    document.querySelector("#operator-class")?.textContent.includes("玄晓"));
  assert.match(await page.textContent("#operator-class"), /玄晓 · 明暗行者/);
});

test("session rotation persists the replacement token and survives reconnect", async (t) => {
  const { server, url } = await startServer(t);
  const page = await newPage(t, browser);
  await joinAs(page, url, "Rotator");
  const oldToken = await page.evaluate(() =>
    localStorage.getItem("crimson-relay-token:rotator"));
  assert.ok(oldToken, "the initial session token is persisted before rotation");

  await page.click("#session-rotate-button");
  await page.waitForFunction((previous) => {
    const current = localStorage.getItem("crimson-relay-token:rotator");
    return current && current !== previous
      && !localStorage.getItem("crimson-relay-pending-token:rotator");
  }, { args: [oldToken] });
  const newToken = await page.evaluate(() =>
    localStorage.getItem("crimson-relay-token:rotator"));
  assert.notEqual(newToken, oldToken);

  const player = playerByName(server, "Rotator");
  player.gold = 321;
  for (const socket of server.wss.clients) socket.terminate();
  await page.waitForFunction(() =>
    document.querySelector("#connection b")?.textContent !== "在线");
  await page.waitForFunction(() =>
    document.querySelector("#connection b")?.textContent === "在线");
  const resumed = await waitForServer(() => playerByName(server, "Rotator"));
  assert.equal(resumed.gold, 321);
});

test("growth, automation, and rebirth controls mutate authoritative state", async (t) => {
  const { server, url } = await startServer(t);
  const page = await newPage(t, browser);
  await joinAs(page, url, "Builder");
  const player = playerByName(server, "Builder");
  player.autoLevel = false;
  player.statPoints = 1;
  player.skillPoints = 1;

  await page.waitForFunction(() =>
    document.querySelector("#stat-points")?.textContent.includes("1"));
  const powerBefore = player.stats.power;
  await page.click('.stat-row[data-stat="power"] .allocate-button');
  await waitForServer(() => player.stats.power === powerBefore + 1);
  await page.click('#skill-upgrades button[data-upgrade="q"]');
  await waitForServer(() => player.skillLevels.q === 2);

  await page.click("#auto-fight-toggle");
  await page.click("#auto-level-toggle");
  await page.click("#auto-equip-button");
  await waitForServer(() => !player.autoFight && player.autoLevel && !player.autoEquip);

  player.level = 1000;
  await page.waitForSelector("#rebirth-button", { state: "visible" });
  await page.click("#rebirth-button");
  await waitForServer(() => player.rebirths === 1);
  assert.equal(player.level, 1);
});

test("the browser can enter and explicitly leave the deterministic dungeon", async (t) => {
  const { server, url } = await startServer(t);
  const page = await newPage(t, browser);
  await joinAs(page, url, "Delver");
  const player = playerByName(server, "Delver");

  await page.click("#dungeon-enter-button");
  await waitForServer(() => String(player.mapId).startsWith("dungeon:vault-"));
  await page.waitForSelector("#dungeon-leave-button", { state: "visible" });
  assert.equal(server.world.dungeons.size, 1);
  const dungeon = [...server.world.dungeons.values()][0];
  // The leave button only tracks mapId, which flips synchronously; spawning the
  // worker child process and completing its handshake takes ~250ms more. Wait
  // for it like every other async step here instead of racing it.
  await waitForServer(() => Boolean(dungeon.workerTransport));
  assert.ok(dungeon.workerTransport, "dungeon entry starts the child worker");
  await waitForServer(() => dungeon.workerSnapshot?.enemies?.length === 6);

  await page.click("#dungeon-leave-button");
  await waitForServer(() => player.mapId === "town");
  assert.equal(server.world.dungeons.size, 0);
});
