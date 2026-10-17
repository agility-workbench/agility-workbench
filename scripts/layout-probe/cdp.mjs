// Minimal DevTools-protocol driver for the layout probe: launches a cached Chrome, opens pages,
// evaluates scripts, captures console output. No Playwright/Puppeteer dependency — Node 22 ships a
// global WebSocket, and the probe needs five protocol methods.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** First Chrome binary found: $CHROME_BIN, Playwright's cached headless shell / chromium, a system Chrome. */
export function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const candidates = [];
  const cache = path.join(os.homedir(), ".cache", "ms-playwright");
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).sort().reverse()) {
      if (dir.startsWith("chromium_headless_shell-")) {
        candidates.push(path.join(cache, dir, "chrome-headless-shell-linux64", "chrome-headless-shell"));
        candidates.push(path.join(cache, dir, "chrome-headless-shell-mac-arm64", "chrome-headless-shell"));
        candidates.push(path.join(cache, dir, "chrome-headless-shell-mac-x64", "chrome-headless-shell"));
      } else if (dir.startsWith("chromium-")) {
        candidates.push(path.join(cache, dir, "chrome-linux", "chrome"));
        candidates.push(path.join(cache, dir, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"));
      }
    }
  }
  candidates.push(
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  );
  return candidates.find(candidate => existsSync(candidate));
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

class Connection {
  static async open(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error(`WebSocket connection to ${url} failed`));
    });
    return new Connection(ws);
  }

  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    ws.onmessage = event => this.handle(JSON.parse(String(event.data)));
    ws.onclose = () => {
      for (const entry of this.pending.values()) entry.reject(new Error("DevTools connection closed"));
      this.pending.clear();
    };
  }

  handle(message) {
    if (message.id) {
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
      else entry.resolve(message.result);
      return;
    }
    const key = `${message.sessionId || ""}:${message.method}`;
    for (const fn of this.listeners.get(key) || []) fn(message.params);
  }

  /**
   * One protocol call. Every call is bounded: a session that died mid-navigation (renderer crash,
   * target closed while a command was in flight) can leave a command with no response at all, and
   * an unbounded await there froze a whole run once. The default is generous because screenshots
   * and big evaluates are slow on a loaded machine.
   */
  send(method, params = {}, sessionId, { timeout = 30000 } = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`${method}: no response after ${timeout}ms (target gone?)`));
      }, timeout);
      this.pending.set(id, {
        method,
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  on(method, fn, sessionId) {
    const key = `${sessionId || ""}:${method}`;
    const list = this.listeners.get(key) || [];
    list.push(fn);
    this.listeners.set(key, list);
    return () => {
      const current = this.listeners.get(key) || [];
      this.listeners.set(key, current.filter(candidate => candidate !== fn));
    };
  }

  close() {
    this.ws.close();
  }
}

function describeArg(arg) {
  if (arg.value !== undefined) return typeof arg.value === "string" ? arg.value : JSON.stringify(arg.value);
  return arg.description || arg.type;
}

const MODIFIER_BITS = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };

const NAMED_KEYS = {
  ArrowLeft: ["ArrowLeft", 37], ArrowUp: ["ArrowUp", 38], ArrowRight: ["ArrowRight", 39], ArrowDown: ["ArrowDown", 40],
  Home: ["Home", 36], End: ["End", 35], PageUp: ["PageUp", 33], PageDown: ["PageDown", 34],
  Enter: ["Enter", 13, "\r"], Escape: ["Escape", 27], Tab: ["Tab", 9], Backspace: ["Backspace", 8],
  Delete: ["Delete", 46], F2: ["F2", 113], " ": ["Space", 32, " "], ContextMenu: ["ContextMenu", 93],
};

/** DOM key → { key, code, keyCode, text } for the keys the probes press. */
export function keyInfo(key) {
  const named = NAMED_KEYS[key];
  if (named) return { key, code: named[0], keyCode: named[1], text: named[2] };
  if (key.length !== 1) throw new Error(`keyInfo: no mapping for "${key}"`);
  const upper = key.toUpperCase();
  if (/[A-Z]/.test(upper)) return { key, code: `Key${upper}`, keyCode: upper.charCodeAt(0), text: key };
  if (/[0-9]/.test(key)) return { key, code: `Digit${key}`, keyCode: key.charCodeAt(0), text: key };
  const punct = { ".": ["Period", 190], ",": ["Comma", 188], "-": ["Minus", 189], "=": ["Equal", 187], "/": ["Slash", 191] };
  const p = punct[key];
  return { key, code: p ? p[0] : "", keyCode: p ? p[1] : 0, text: key };
}

export class Page {
  static async create(connection) {
    const { targetId } = await connection.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await connection.send("Target.attachToTarget", { targetId, flatten: true });
    const page = new Page(connection, sessionId, targetId);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Log.enable");
    page.bindConsole();
    return page;
  }

  constructor(connection, sessionId, targetId) {
    this.connection = connection;
    this.sessionId = sessionId;
    this.targetId = targetId;
    this.console = [];
  }

  send(method, params) {
    return this.connection.send(method, params, this.sessionId);
  }

  bindConsole() {
    this.connection.on("Runtime.consoleAPICalled", params => {
      if (params.type === "error" || params.type === "warning" || params.type === "assert") {
        this.console.push({ level: params.type, text: params.args.map(describeArg).join(" ") });
      }
    }, this.sessionId);
    this.connection.on("Runtime.exceptionThrown", params => {
      const details = params.exceptionDetails;
      this.console.push({ level: "exception", text: details.exception?.description || details.text });
    }, this.sessionId);
    this.connection.on("Log.entryAdded", params => {
      const entry = params.entry;
      if (entry.level !== "error") return;
      this.console.push({
        level: entry.source === "network" ? "network" : "error",
        text: entry.text + (entry.url ? ` (${entry.url})` : ""),
      });
    }, this.sessionId);
  }

  /** Console errors, warnings, exceptions and failed requests since the last drain. */
  drainConsole() {
    const entries = this.console;
    this.console = [];
    return entries;
  }

  setViewport(width, height, deviceScaleFactor = 1) {
    return this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor, mobile: false });
  }

  waitForEvent(method, timeout) {
    return new Promise((resolve, reject) => {
      const off = this.connection.on(method, params => {
        off();
        clearTimeout(timer);
        resolve(params);
      }, this.sessionId);
      const timer = setTimeout(() => {
        off();
        reject(new Error(`Timed out after ${timeout}ms waiting for ${method}`));
      }, timeout);
    });
  }

  async navigate(url, { timeout = 30000 } = {}) {
    // Both legs are awaited together so a navigate command that never answers, or a load event
    // that never fires, surfaces as a rejection instead of a hang or an unhandled rejection.
    const loaded = this.waitForEvent("Page.loadEventFired", timeout);
    await Promise.all([this.send("Page.navigate", { url }), loaded]);
  }

  /**
   * Evaluates `expression` in the page, awaiting a returned promise, and returns its JSON value.
   * The protocol's own `timeout` only bounds synchronous execution, so a promise that never settles
   * (a frame that stops firing rAF, a mount that never finishes) is cut off here instead.
   */
  async evaluate(expression, { timeout = 30000 } = {}) {
    let timer;
    const watchdog = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out after ${timeout}ms evaluating: ${expression.slice(0, 120)}`)), timeout);
    });
    const result = await Promise.race([
      this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, timeout }),
      watchdog,
    ]).finally(() => clearTimeout(timer));
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      throw new Error(`Page script threw: ${details.exception?.description || details.text}`);
    }
    return result.result.value;
  }

  async waitForFunction(expression, { timeout = 15000, interval = 100 } = {}) {
    const start = Date.now();
    for (;;) {
      const ok = await this.evaluate(`!!(${expression})`).catch(() => false);
      if (ok) return;
      if (Date.now() - start > timeout) throw new Error(`Timed out after ${timeout}ms waiting for ${expression}`);
      await sleep(interval);
    }
  }

  /** PNG of the viewport, or of `clip` ({x, y, width, height} in CSS px) when given. */
  async screenshot(file, clip) {
    const params = { format: "png", captureBeyondViewport: false };
    if (clip) params.clip = { x: clip.x, y: clip.y, width: Math.max(1, clip.width), height: Math.max(1, clip.height), scale: 1 };
    const { data } = await this.send("Page.captureScreenshot", params);
    const buffer = Buffer.from(data, "base64");
    if (file) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, buffer);
    }
    return buffer;
  }

  /* ---------------------------------------------------------------- input ----------------- */
  // Trusted input through the DevTools protocol: these go through the browser's input pipeline,
  // so they fire pointer, mouse, touch, keyboard and wheel events exactly as a person's would
  // (hit-testing, focus, default actions, compatibility mouse events) — unlike dispatchEvent.

  /** The bounding rect of the first element matching `selector` (CSS px), or null. */
  rect(selector) {
    return this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height, left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    })()`);
  }

  /** The centre of `target` (a selector, or a rect / {x, y} point), offset by `dx`/`dy`. */
  async point(target, { dx = 0, dy = 0, fx = 0.5, fy = 0.5 } = {}) {
    if (typeof target === "string") {
      const r = await this.rect(target);
      if (!r) throw new Error(`No element for ${target}`);
      target = r;
    }
    if (target.width !== undefined) return { x: target.x + target.width * fx + dx, y: target.y + target.height * fy + dy };
    return { x: target.x + dx, y: target.y + dy };
  }

  /** One `Input.dispatchMouseEvent`. `buttons` is derived from `button` for presses and drags. */
  mouse(type, x, y, { button = "none", buttons, clickCount = 0, modifiers = 0, deltaX = 0, deltaY = 0 } = {}) {
    const mask = { none: 0, left: 1, right: 2, middle: 4 };
    const params = { type, x, y, button, modifiers, clickCount, buttons: buttons ?? mask[button] ?? 0 };
    if (type === "mouseWheel") Object.assign(params, { deltaX, deltaY, button: "none", buttons: 0 });
    return this.send("Input.dispatchMouseEvent", params);
  }

  /** Moves to the point, presses and releases; `clickCount: 2` sends the double-click pair. */
  async click(target, { button = "left", clickCount = 1, modifiers = 0, ...offset } = {}) {
    const { x, y } = await this.point(target, offset);
    await this.mouse("mouseMoved", x, y, { modifiers });
    for (let n = 1; n <= clickCount; n++) {
      await this.mouse("mousePressed", x, y, { button, clickCount: n, modifiers });
      await this.mouse("mouseReleased", x, y, { button, clickCount: n, modifiers });
    }
    return { x, y };
  }

  dblclick(target, opts = {}) {
    return this.click(target, { ...opts, clickCount: 2 });
  }

  rightClick(target, opts = {}) {
    return this.click(target, { ...opts, button: "right" });
  }

  /**
   * Presses at `from`, moves to `to` in `steps` intermediate moves, releases. `from`/`to` are
   * selectors, rects or points; `hold` keeps the button down at the end (call `mouse("mouseReleased")`
   * yourself) so a caller can inspect mid-drag state.
   */
  async drag(from, to, { steps = 8, button = "left", modifiers = 0, hold = false, pause = 0, fromOffset = {}, toOffset = {} } = {}) {
    const a = await this.point(from, fromOffset);
    const b = await this.point(to, toOffset);
    await this.mouse("mouseMoved", a.x, a.y, { modifiers });
    await this.mouse("mousePressed", a.x, a.y, { button, clickCount: 1, modifiers });
    for (let i = 1; i <= steps; i++) {
      const x = a.x + ((b.x - a.x) * i) / steps;
      const y = a.y + ((b.y - a.y) * i) / steps;
      await this.mouse("mouseMoved", x, y, { button, modifiers });
      if (pause) await sleep(pause);
    }
    if (!hold) await this.mouse("mouseReleased", b.x, b.y, { button, clickCount: 1, modifiers });
    return { from: a, to: b };
  }

  /** A wheel tick at the point (positive deltaX scrolls towards the physical right). */
  async wheel(target, { deltaX = 0, deltaY = 0, modifiers = 0, ...offset } = {}) {
    const { x, y } = await this.point(target, offset);
    await this.mouse("mouseMoved", x, y);
    await this.mouse("mouseWheel", x, y, { deltaX, deltaY, modifiers });
    return { x, y };
  }

  /**
   * Presses a key: keyDown (rawKeyDown for keys that produce no text) then keyUp. `key` is a DOM
   * key name ("ArrowRight", "Enter", "a"); modifiers is an array of "Alt" | "Control" | "Meta" |
   * "Shift" or the protocol bitmask. Modifier keys themselves are not pressed: the bitmask is what
   * the page's KeyboardEvent carries.
   */
  async press(key, { modifiers = [], text } = {}) {
    const info = keyInfo(key);
    const mask = Array.isArray(modifiers) ? modifiers.reduce((m, name) => m | (MODIFIER_BITS[name] || 0), 0) : modifiers;
    const typed = text ?? (info.text && !(mask & (MODIFIER_BITS.Control | MODIFIER_BITS.Meta | MODIFIER_BITS.Alt)) ? info.text : undefined);
    const base = { key: info.key, code: info.code, windowsVirtualKeyCode: info.keyCode, nativeVirtualKeyCode: info.keyCode, modifiers: mask };
    await this.send("Input.dispatchKeyEvent", { ...base, type: typed ? "keyDown" : "rawKeyDown", ...(typed ? { text: typed, unmodifiedText: typed } : {}) });
    await this.send("Input.dispatchKeyEvent", { ...base, type: "keyUp" });
  }

  /** Types `text` as key presses (printable ASCII) so keydown-driven start-editing paths see it. */
  async type(text) {
    for (const ch of text) await this.press(ch);
  }

  /** Inserts text into the focused element as an IME commit would (no key events). */
  insertText(text) {
    return this.send("Input.insertText", { text });
  }

  /** One `Input.dispatchTouchEvent`; `points` are {x, y, id?}. touchEnd/touchCancel take []. */
  touch(type, points = [], { modifiers = 0 } = {}) {
    return this.send("Input.dispatchTouchEvent", {
      type,
      modifiers,
      touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i, radiusX: 1, radiusY: 1, force: 1 })),
    });
  }

  /** A tap at the target; `hold` (ms) keeps the finger down — 500+ is a long press. */
  async tap(target, { hold = 0, ...offset } = {}) {
    const p = await this.point(target, offset);
    await this.touch("touchStart", [p]);
    if (hold) await sleep(hold);
    await this.touch("touchEnd", []);
    return p;
  }

  /** Touch emulation makes the page report touch support and route touches as pointerType "touch". */
  enableTouch(enabled = true) {
    return this.send("Emulation.setTouchEmulationEnabled", { enabled, maxTouchPoints: enabled ? 5 : 1 });
  }

  async close() {
    try {
      await this.connection.send("Target.closeTarget", { targetId: this.targetId });
    } catch {
      // The browser is going away anyway.
    }
  }
}

/**
 * Launches Chrome with a throwaway profile and returns `{ connection, newPage, close }`.
 * `overlayScrollbars` switches Chromium to overlay scrollbars (gutter 0, like macOS defaults) so
 * the probe can run both scrollbar regimes on one machine.
 */
export async function launchBrowser({ bin = findChrome(), dpr = 1, overlayScrollbars = false, windowSize = [1600, 900] } = {}) {
  if (!bin) {
    throw new Error("No Chrome binary found. Set CHROME_BIN to a Chrome/Chromium/chrome-headless-shell binary.");
  }
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), "layout-probe-"));
  const args = [
    "--headless",
    "--remote-debugging-port=0",
    "--no-sandbox",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-dev-shm-usage",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-features=TranslateUI",
    `--user-data-dir=${userDataDir}`,
    `--window-size=${windowSize[0]},${windowSize[1]}`,
    `--force-device-scale-factor=${dpr}`,
  ];
  if (overlayScrollbars) args.push("--enable-features=OverlayScrollbar");
  const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buffer = "";
    const onData = chunk => {
      buffer += chunk;
      const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        child.stderr.off("data", onData);
        resolve(match[1]);
      }
    };
    child.stderr.on("data", onData);
    child.on("exit", code => reject(new Error(`Chrome exited with ${code} before DevTools came up:\n${buffer}`)));
    setTimeout(() => reject(new Error(`Timed out waiting for Chrome's DevTools endpoint:\n${buffer}`)), 20000);
  });
  child.stderr.on("data", () => {});
  const connection = await Connection.open(wsUrl);
  return {
    bin,
    connection,
    newPage: () => Page.create(connection),
    async close() {
      const exited = new Promise(resolve => {
        if (child.exitCode !== null) resolve();
        else child.once("exit", resolve);
      });
      try {
        await Promise.race([connection.send("Browser.close"), sleep(2000)]);
      } catch {
        // Already gone.
      }
      connection.close();
      await Promise.race([exited, sleep(3000)]);
      if (child.exitCode === null) {
        child.kill("SIGKILL");
        await Promise.race([exited, sleep(2000)]);
      }
      // Chrome may still be flushing its profile when the process winds down; a leftover temp
      // profile is not worth failing a run over.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          rmSync(userDataDir, { recursive: true, force: true });
          break;
        } catch {
          await sleep(200);
        }
      }
    },
  };
}

/** Starts the vanilla playground's Vite dev server and resolves once `probePath` is served. */
export async function startViteServer({ repoRoot, config = "vite.vanilla.config.ts", port, probePath = "/layout-matrix.html", timeout = 90000 }) {
  const viteBin = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(viteBin)) throw new Error(`Vite not installed at ${viteBin}; run npm install first.`);
  const child = spawn(process.execPath, [viteBin, "-c", config, "--port", String(port), "--strictPort", "--force"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    env: { ...process.env, CHOKIDAR_USEPOLLING: "0", BROWSER: "none" },
  });
  let log = "";
  child.stdout.on("data", chunk => { log += chunk; });
  child.stderr.on("data", chunk => { log += chunk; });
  const url = `http://127.0.0.1:${port}`;
  const stop = () => {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  };
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (child.exitCode !== null) throw new Error(`Vite exited with ${child.exitCode}:\n${log}`);
    try {
      const response = await fetch(url + probePath);
      if (response.ok && (await response.text()).includes("layout-matrix")) return { url, stop, child };
    } catch {
      // Not up yet.
    }
    await sleep(250);
  }
  stop();
  throw new Error(`Vite did not serve ${probePath} within ${timeout}ms:\n${log}`);
}
