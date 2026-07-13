// Real-browser interaction tests: headless Chrome drives the production
// client (public/) against a real in-process GameServer. Run with
// `npm run test:browser`; kept out of `npm test` so the fast world suite
// never needs a browser. Server-side state (gold, positions, items) is
// arranged directly on the authoritative World — the browser still has to
// earn every outcome through the real protocol.
import assert from "node:assert/strict";
import test, { after } from "node:test";

import {
  joinAs,
  launchBrowser,
  newPage,
  playerByName,
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

test("HUD panels drag and collapse, and the layout survives a reload", async (t) => {
  const { url } = await startServer(t);
  const page = await newPage(t, browser);
  await joinAs(page, url, "Bravo");

  // Drag the operator panel by its heading (not over its buttons).
  const handle = page.locator(".operator-panel [data-drag-handle]");
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
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
  // A desktop session left dragged positions and a collapsed panel behind.
  await page.context().addInitScript(() => {
    localStorage.setItem("crimson-relay-hud-layout", JSON.stringify({
      "operator-panel": { left: 500, top: 400 },
      "stats-panel": { collapsed: true },
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
    "collapse state still applies on mobile",
  );

  // Dragging is disabled: the panel stays CSS-anchored.
  const handle = page.locator(".operator-panel [data-drag-handle]");
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 160, { steps: 4 });
  await page.mouse.up();
  assert.equal(await page.$eval(".operator-panel", (el) => el.style.left), "");
});

test("a party invite sent from one browser is accepted in another", async (t) => {
  const { url } = await startServer(t);
  const hostPage = await newPage(t, browser);
  const guestPage = await newPage(t, browser);
  await joinAs(hostPage, url, "Hostess");
  await joinAs(guestPage, url, "Guest");

  // The social panel lists the other operator once both are in the world.
  await hostPage.click('#social-list button[data-social="invite"]');

  const accept = guestPage.locator(".event-message button", { hasText: "接受" });
  await accept.waitFor({ state: "visible" });
  assert.match(
    await guestPage.textContent(".event-message"),
    /Hostess 邀请你组队/,
  );
  await accept.click();

  for (const page of [hostPage, guestPage]) {
    await page.waitForFunction(() =>
      document.querySelector("#party-state")?.textContent.includes("队伍 2/4"));
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

test("a dropped connection reconnects and resumes the same character", async (t) => {
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
});
