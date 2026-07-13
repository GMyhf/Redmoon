// Shared plumbing for the browser interaction tests: each test boots the
// real GameServer in-process (random port, persistence off) and drives the
// real client in headless Chrome via Playwright. Servers are per-test for
// isolation; the Chrome instance is shared per test file (launch is the
// expensive part) with fresh contexts per test.
import { chromium } from "playwright";

import { GameServer } from "../../src/server/server.js";

export function launchBrowser() {
  // System Chrome via the "chrome" channel: no browser download required,
  // both locally and on GitHub's ubuntu-latest runners.
  return chromium.launch({ channel: "chrome" });
}

export async function startServer(t, worldOptions = {}) {
  const server = new GameServer({
    host: "127.0.0.1",
    port: 0,
    persistPath: "",
    worldOptions: { spawnMobs: false, mobTargetCount: 0, ...worldOptions },
  });
  await server.listen();
  t.after(() => server.close());
  const { port } = server.address();
  return { server, url: `http://127.0.0.1:${port}` };
}

export async function newPage(t, browser, contextOptions = {}) {
  const context = await browser.newContext({
    // A modest viewport keeps canvas rasterisation cheap on software-only
    // runners while staying above the 760px mobile-layout breakpoint.
    viewport: { width: 960, height: 600 },
    ...contextOptions,
  });
  t.after(() => context.close());
  // Headless software rendering makes long tasks of work a GPU absorbs;
  // generous timeouts keep loaded runners from flaking the suite.
  context.setDefaultTimeout(60_000);
  context.setDefaultNavigationTimeout(60_000);
  // Scene art and ground textures are the biggest decode cost and purely
  // cosmetic — none of the interactions under test look at them.
  await context.route(/\/assets\/(scenes|textures)\//, (route) => route.abort());
  return context.newPage();
}

// Walks the real join flow: pick a name, submit, wait for the HUD.
export async function joinAs(page, url, name) {
  if (!page.url().startsWith(url)) {
    await page.goto(`${url}/`, { waitUntil: "domcontentloaded" });
  }
  await page.fill("#operator-name", name);
  await page.click("#join-button");
  await page.waitForSelector("#hud", { state: "visible" });
}

export function playerByName(server, name) {
  const wanted = String(name).toLowerCase();
  for (const player of server.world.players.values()) {
    if (player.name.toLowerCase() === wanted) return player;
  }
  return null;
}

// Polls a server-side condition; browser tests cannot step world time, so
// asserting on authoritative state needs a small real-time window.
export async function waitForServer(condition, { timeout = 5000, interval = 50 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = condition();
    if (value) return value;
    if (Date.now() > deadline) throw new Error("timed out waiting for server condition");
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
