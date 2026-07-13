// Shared plumbing for real-browser interaction tests. Each test boots the
// production GameServer on a random port and drives the production client via
// Chrome DevTools Protocol. The tiny wrapper below intentionally covers only
// the interactions used by this suite; it keeps browser validation dependency
// free while still dispatching real mouse and keyboard input to system Chrome.
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { WebSocket } from "ws";

import { GameServer } from "../../src/server/server.js";

const DEFAULT_TIMEOUT = 60_000;

async function chromeBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch (_error) {
      // Try the next common system-Chrome path.
    }
  }
  throw new Error("system Chrome not found; set CHROME_BIN to its executable");
}

class CdpConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.on("message", (raw) => this.#receive(raw));
    socket.on("close", () => {
      for (const { reject } of this.pending.values()) reject(new Error("Chrome CDP connection closed"));
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    return new CdpConnection(socket);
  }

  #receive(raw) {
    const message = JSON.parse(String(raw));
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result || {});
      return;
    }
    for (const listener of this.listeners.get(message.method) || []) {
      Promise.resolve(listener(message.params || {})).catch(() => {});
    }
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }), (error) => {
        if (!error) return;
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(listener);
    return () => this.listeners.get(method)?.delete(listener);
  }

  once(method, timeout = DEFAULT_TIMEOUT) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        remove();
        reject(new Error(`timed out waiting for CDP event ${method}`));
      }, timeout);
      const remove = this.on(method, (params) => {
        clearTimeout(timer);
        remove();
        resolve(params);
      });
    });
  }

  close() {
    if (this.socket.readyState < WebSocket.CLOSING) this.socket.close();
  }
}

function sourceFor(fn, args = []) {
  return `(${fn.toString()})(${args.map((value) => JSON.stringify(value)).join(",")})`;
}

class CdpMouse {
  constructor(page) {
    this.page = page;
    this.x = 0;
    this.y = 0;
    this.buttons = 0;
  }

  async move(x, y, { steps = 1 } = {}) {
    const startX = this.x;
    const startY = this.y;
    for (let step = 1; step <= Math.max(1, steps); step += 1) {
      this.x = startX + ((x - startX) * step) / Math.max(1, steps);
      this.y = startY + ((y - startY) * step) / Math.max(1, steps);
      await this.page.cdp.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: this.x,
        y: this.y,
        buttons: this.buttons,
      });
    }
  }

  async down({ button = "left" } = {}) {
    this.buttons |= button === "left" ? 1 : button === "right" ? 2 : 4;
    await this.page.cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: this.x,
      y: this.y,
      button,
      buttons: this.buttons,
      clickCount: 1,
    });
  }

  async up({ button = "left" } = {}) {
    this.buttons &= ~(button === "left" ? 1 : button === "right" ? 2 : 4);
    await this.page.cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: this.x,
      y: this.y,
      button,
      buttons: this.buttons,
      clickCount: 1,
    });
  }
}

function keyDescription(requested) {
  const named = {
    Enter: ["Enter", "Enter", 13, "\r"],
    Escape: ["Escape", "Escape", 27, ""],
    Space: [" ", "Space", 32, " "],
    ArrowUp: ["ArrowUp", "ArrowUp", 38, ""],
    ArrowDown: ["ArrowDown", "ArrowDown", 40, ""],
    ArrowLeft: ["ArrowLeft", "ArrowLeft", 37, ""],
    ArrowRight: ["ArrowRight", "ArrowRight", 39, ""],
  };
  if (named[requested]) {
    const [key, code, keyCode, text] = named[requested];
    return { key, code, keyCode, text };
  }
  if (/^[a-z]$/i.test(requested)) {
    const upper = requested.toUpperCase();
    return {
      key: requested,
      code: `Key${upper}`,
      keyCode: upper.charCodeAt(0),
      text: requested,
    };
  }
  throw new Error(`unsupported test key: ${requested}`);
}

class CdpKeyboard {
  constructor(page) {
    this.page = page;
  }

  async press(requested) {
    const { key, code, keyCode, text } = keyDescription(requested);
    const params = {
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
      ...(text ? { text, unmodifiedText: text } : {}),
    };
    await this.page.cdp.send("Input.dispatchKeyEvent", {
      type: text ? "keyDown" : "rawKeyDown",
      ...params,
    });
    await this.page.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...params });
  }

  async type(text) {
    await this.page.cdp.send("Input.insertText", { text: String(text) });
  }
}

class CdpLocator {
  constructor(page, selector, options = {}) {
    this.page = page;
    this.selector = selector;
    this.hasText = options.hasText || "";
  }

  boundingBox() {
    return this.page.elementBox(this.selector, this.hasText);
  }

  click() {
    return this.page.click(this.selector, { hasText: this.hasText });
  }

  textContent() {
    return this.page.elementText(this.selector, this.hasText);
  }

  waitFor({ state = "visible", timeout } = {}) {
    return this.page.waitForSelector(this.selector, { state, timeout, hasText: this.hasText });
  }
}

class CdpPage {
  constructor(context, targetId, cdp) {
    this.browserContext = context;
    this.targetId = targetId;
    this.cdp = cdp;
    this.currentUrl = "about:blank";
    this.defaultTimeout = context.defaultTimeout;
    this.navigationTimeout = context.navigationTimeout;
    this.mouse = new CdpMouse(this);
    this.keyboard = new CdpKeyboard(this);
    this.runtimeErrors = [];
    this.cdp.on("Runtime.exceptionThrown", ({ exceptionDetails = {} }) => {
      this.runtimeErrors.push(
        exceptionDetails.exception?.description || exceptionDetails.text || "uncaught page exception",
      );
    });
    this.cdp.on("Runtime.consoleAPICalled", ({ type, args = [] }) => {
      if (type !== "error") return;
      this.runtimeErrors.push(args.map((entry) => entry.value ?? entry.description ?? "").join(" "));
    });
  }

  assertNoRuntimeErrors() {
    if (this.runtimeErrors.length === 0) return;
    throw new Error(`browser page reported runtime errors:\n${this.runtimeErrors.join("\n")}`);
  }

  async initialize() {
    await Promise.all([
      this.cdp.send("Page.enable"),
      this.cdp.send("Runtime.enable"),
      this.cdp.send("DOM.enable"),
    ]);
    const viewport = this.browserContext.options.viewport || { width: 960, height: 600 };
    await this.cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
      deviceScaleFactor: 1,
      mobile: Boolean(this.browserContext.options.isMobile),
    });
    if (this.browserContext.options.hasTouch) {
      await this.cdp.send("Emulation.setTouchEmulationEnabled", {
        enabled: true,
        maxTouchPoints: 1,
      });
    }
    if (this.browserContext.routes.length) {
      await this.cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*/assets/*" }] });
      this.cdp.on("Fetch.requestPaused", async (request) => {
        let handled = false;
        const route = {
          abort: async () => {
            handled = true;
            await this.cdp.send("Fetch.failRequest", {
              requestId: request.requestId,
              errorReason: "BlockedByClient",
            });
          },
        };
        for (const entry of this.browserContext.routes) {
          entry.matcher.lastIndex = 0;
          if (!entry.matcher.test(request.request.url)) continue;
          await entry.handler(route);
          if (handled) return;
        }
        await this.cdp.send("Fetch.continueRequest", { requestId: request.requestId });
      });
    }
  }

  url() {
    return this.currentUrl;
  }

  context() {
    return this.browserContext;
  }

  locator(selector, options) {
    return new CdpLocator(this, selector, options);
  }

  async goto(url, { waitUntil = "domcontentloaded" } = {}) {
    const ready = waitUntil === "domcontentloaded"
      ? this.cdp.once("Page.domContentEventFired", this.navigationTimeout)
      : Promise.resolve();
    const result = await this.cdp.send("Page.navigate", { url });
    if (result.errorText) throw new Error(`navigation failed: ${result.errorText}`);
    this.currentUrl = url;
    await ready;
  }

  async reload() {
    const ready = this.cdp.once("Page.domContentEventFired", this.navigationTimeout);
    await this.cdp.send("Page.reload", { ignoreCache: true });
    await ready;
  }

  async setViewportSize({ width, height }) {
    this.browserContext.options.viewport = { width, height };
    await this.cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      screenWidth: width,
      screenHeight: height,
      deviceScaleFactor: 1,
      mobile: Boolean(this.browserContext.options.isMobile),
    });
  }

  async evaluate(fn, ...args) {
    return this.evaluateSource(sourceFor(fn, args));
  }

  async $eval(selector, fn) {
    return this.evaluateSource(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error("element not found: ${selector.replaceAll('"', '\\"')}");
      return (${fn.toString()})(element);
    })()`);
  }

  async evaluateSource(expression) {
    const response = await this.cdp.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      const detail = response.exceptionDetails.exception?.description
        || response.exceptionDetails.text
        || "browser evaluation failed";
      throw new Error(detail);
    }
    return response.result?.value;
  }

  async waitForSelector(selector, {
    state = "visible",
    timeout = this.defaultTimeout,
    hasText = "",
  } = {}) {
    return this.waitForFunction((wantedSelector, wantedText, wantedState) => {
      const element = [...document.querySelectorAll(wantedSelector)]
        .find((candidate) => !wantedText || candidate.textContent.includes(wantedText));
      const visible = Boolean(element
        && !element.hidden
        && getComputedStyle(element).display !== "none"
        && getComputedStyle(element).visibility !== "hidden"
        && element.getBoundingClientRect().width > 0
        && element.getBoundingClientRect().height > 0);
      return wantedState === "hidden" ? !visible : visible;
    }, { timeout, args: [selector, hasText, state] });
  }

  async waitForFunction(fn, options = {}, ...providedArgs) {
    const timeout = options.timeout ?? this.defaultTimeout;
    const interval = options.interval ?? 25;
    const args = options.args || providedArgs;
    const deadline = Date.now() + timeout;
    let lastError = null;
    for (;;) {
      try {
        const value = await this.evaluate(fn, ...args);
        if (value) return value;
      } catch (error) {
        lastError = error;
      }
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for browser condition${lastError ? `: ${lastError.message}` : ""}`);
      }
      await delay(interval);
    }
  }

  async elementBox(selector, hasText = "") {
    await this.waitForSelector(selector, { hasText });
    return this.evaluate((wantedSelector, wantedText) => {
      const element = [...document.querySelectorAll(wantedSelector)]
        .find((candidate) => !wantedText || candidate.textContent.includes(wantedText));
      element.scrollIntoView({ block: "nearest", inline: "nearest" });
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }, selector, hasText);
  }

  async elementText(selector, hasText = "") {
    return this.evaluate((wantedSelector, wantedText) => {
      const element = [...document.querySelectorAll(wantedSelector)]
        .find((candidate) => !wantedText || candidate.textContent.includes(wantedText));
      return element?.textContent ?? null;
    }, selector, hasText);
  }

  async click(selector, { hasText = "" } = {}) {
    const box = await this.elementBox(selector, hasText);
    await this.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await this.mouse.down();
    await this.mouse.up();
  }

  async fill(selector, value) {
    await this.waitForSelector(selector);
    await this.evaluate((wantedSelector, nextValue) => {
      const element = document.querySelector(wantedSelector);
      element.focus();
      element.value = nextValue;
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }, selector, String(value));
  }

  async focus(selector) {
    await this.waitForSelector(selector);
    await this.evaluate((wantedSelector) => document.querySelector(wantedSelector).focus(), selector);
  }

  async selectOption(selector, value) {
    await this.waitForSelector(selector);
    await this.evaluate((wantedSelector, nextValue) => {
      const element = document.querySelector(wantedSelector);
      element.value = nextValue;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, selector, String(value));
  }

  async textContent(selector) {
    return this.elementText(selector);
  }

  async isVisible(selector) {
    return this.evaluate((wantedSelector) => {
      const element = document.querySelector(wantedSelector);
      if (!element || element.hidden) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }, selector);
  }

  async isHidden(selector) {
    return !(await this.isVisible(selector));
  }

  async close() {
    this.cdp.close();
  }
}

class BrowserContext {
  constructor(browser, id, options) {
    this.browser = browser;
    this.id = id;
    this.options = options;
    this.defaultTimeout = DEFAULT_TIMEOUT;
    this.navigationTimeout = DEFAULT_TIMEOUT;
    this.routes = [];
    this.pages = new Set();
    this.initScripts = [];
  }

  setDefaultTimeout(timeout) {
    this.defaultTimeout = timeout;
  }

  setDefaultNavigationTimeout(timeout) {
    this.navigationTimeout = timeout;
  }

  async route(matcher, handler) {
    this.routes.push({ matcher, handler });
  }

  async addInitScript(fn) {
    this.initScripts.push(fn);
    for (const page of this.pages) {
      await page.cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: sourceFor(fn) });
    }
  }

  async newPage() {
    const { targetId } = await this.browser.cdp.send("Target.createTarget", {
      url: "about:blank",
      browserContextId: this.id,
    });
    let target = null;
    for (let attempt = 0; attempt < 100 && !target; attempt += 1) {
      const response = await fetch(`${this.browser.httpUrl}/json/list`);
      const targets = await response.json();
      target = targets.find((candidate) => candidate.id === targetId);
      if (!target) await delay(20);
    }
    if (!target?.webSocketDebuggerUrl) throw new Error("Chrome page target did not become available");
    const cdp = await CdpConnection.connect(target.webSocketDebuggerUrl);
    const page = new CdpPage(this, targetId, cdp);
    this.pages.add(page);
    await page.initialize();
    for (const fn of this.initScripts) {
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: sourceFor(fn) });
    }
    return page;
  }

  async close() {
    for (const page of this.pages) await page.close();
    this.pages.clear();
    await this.browser.cdp.send("Target.disposeBrowserContext", { browserContextId: this.id });
    this.browser.contexts.delete(this);
  }
}

class SystemChrome {
  constructor(process, profilePath, httpUrl, cdp) {
    this.process = process;
    this.profilePath = profilePath;
    this.httpUrl = httpUrl;
    this.cdp = cdp;
    this.contexts = new Set();
  }

  async newContext(options = {}) {
    const { browserContextId } = await this.cdp.send("Target.createBrowserContext");
    const context = new BrowserContext(this, browserContextId, options);
    this.contexts.add(context);
    return context;
  }

  async close() {
    for (const context of [...this.contexts]) await context.close();
    const exited = this.process.exitCode === null
      ? new Promise((resolve) => this.process.once("exit", resolve))
      : Promise.resolve();
    await this.cdp.send("Browser.close").catch(() => {});
    await Promise.race([
      exited,
      delay(1500),
    ]);
    if (this.process.exitCode === null) {
      this.process.kill("SIGTERM");
      await Promise.race([exited, delay(1000)]);
    }
    if (this.process.exitCode === null) this.process.kill("SIGKILL");
    this.cdp.close();
    await rm(this.profilePath, { recursive: true, force: true });
  }
}

export async function launchBrowser() {
  const binary = await chromeBinary();
  const profilePath = await mkdtemp(join(tmpdir(), "crimson-relay-chrome-"));
  const chrome = spawn(binary, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-breakpad",
    "--disable-crash-reporter",
    "--disable-background-networking",
    "--disable-component-update",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0",
    `--user-data-dir=${profilePath}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  chrome.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-4000);
  });
  const exited = new Promise((resolve) => chrome.once("exit", resolve));
  let port = null;
  let browserPath = null;
  for (let attempt = 0; attempt < 200 && !port; attempt += 1) {
    try {
      const active = (await readFile(join(profilePath, "DevToolsActivePort"), "utf8")).trim().split(/\s+/);
      [port, browserPath] = active;
    } catch (_error) {
      if (chrome.exitCode !== null) throw new Error(`Chrome exited before CDP started:\n${stderr}`);
      await Promise.race([delay(25), exited]);
    }
  }
  if (!port || !browserPath) {
    chrome.kill("SIGKILL");
    throw new Error(`timed out starting system Chrome:\n${stderr}`);
  }
  const httpUrl = `http://127.0.0.1:${port}`;
  const cdp = await CdpConnection.connect(`ws://127.0.0.1:${port}${browserPath}`);
  return new SystemChrome(chrome, profilePath, httpUrl, cdp);
}

export async function startServer(t, worldOptions = {}, serverOptions = {}) {
  const server = new GameServer({
    host: "127.0.0.1",
    port: 0,
    persistPath: "",
    ...serverOptions,
    worldOptions: { spawnMobs: false, mobTargetCount: 0, ...worldOptions },
  });
  await server.listen();
  t.after(() => server.close());
  const { port } = server.address();
  return { server, url: `http://127.0.0.1:${port}` };
}

export async function startPersistentServer(t, worldOptions = {}) {
  const directory = await mkdtemp(join(tmpdir(), "crimson-browser-store-"));
  const persistPath = join(directory, "accounts.json");
  const started = await startServer(t, worldOptions, { persistPath });
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { ...started, persistPath };
}

export async function newPage(t, browser, contextOptions = {}) {
  const context = await browser.newContext({
    // A modest viewport keeps canvas rasterisation cheap on software-only
    // runners while staying above the 760px mobile-layout breakpoint.
    viewport: { width: 960, height: 600 },
    ...contextOptions,
  });
  t.after(() => context.close());
  context.setDefaultTimeout(DEFAULT_TIMEOUT);
  context.setDefaultNavigationTimeout(DEFAULT_TIMEOUT);
  // Scene art and ground textures are the biggest decode cost and purely
  // cosmetic; none of the interactions under test inspect them.
  await context.route(/\/assets\/(scenes|textures)\//, (route) => route.abort());
  const page = await context.newPage();
  t.after(() => page.assertNoRuntimeErrors());
  return page;
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
    await delay(interval);
  }
}
