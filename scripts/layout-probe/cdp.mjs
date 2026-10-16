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
