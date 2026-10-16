#!/usr/bin/env node
// Layout probe: drives real grids in a real (headless) Chrome through a width/height ladder and a
// set of runtime transitions, asserting the layout invariants in ./invariants.js after every step.
//
//   npm run probe:layout                      # matrix + smoke pass over every playground page
//   npm run probe:layout -- --only=pinned     # cases whose name matches /pinned/
//   npm run probe:layout -- --skip-smoke --json=artifacts/layout-probe.json
//   npm run probe:layout -- --overlay-scrollbars --dpr=2
//   npm run probe:layout -- --url=http://localhost:5182   # reuse a running vanilla dev server
//   npm run probe:layout -- --shots=artifacts/layout-probe   # PNG of the grid at the first failing step per kind
//
// The happy-dom test suite has no layout engine, so this is the only automated check of what a
// person sees when a grid is resized. It exits 1 when any error-severity violation or page
// exception is recorded; warnings are listed but do not fail the run.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findChrome, freePort, launchBrowser, startViteServer } from "./cdp.mjs";
import { CASES, HEIGHT_STEPS, SMOKE_WIDTHS, WIDTH_LADDER } from "./matrix.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

function parseArgs(argv) {
  const opts = {
    only: null, skipMatrix: false, skipSmoke: false, json: null, url: null, dpr: 1,
    overlayScrollbars: false, widths: WIDTH_LADDER, heights: HEIGHT_STEPS, smokeWidths: SMOKE_WIDTHS,
    verbose: false, list: false, help: false, shots: null,
  };
  for (const arg of argv) {
    const [key, value] = arg.includes("=") ? arg.split(/=(.*)/s) : [arg, true];
    switch (key) {
      case "--only": opts.only = new RegExp(String(value)); break;
      case "--skip-matrix": opts.skipMatrix = true; break;
      case "--skip-smoke": opts.skipSmoke = true; break;
      case "--json": opts.json = String(value); break;
      case "--url": opts.url = String(value).replace(/\/$/, ""); break;
      case "--dpr": opts.dpr = Number(value); break;
      case "--overlay-scrollbars": opts.overlayScrollbars = true; break;
      case "--widths": opts.widths = String(value).split(",").map(Number); break;
      case "--heights": opts.heights = String(value).split(",").map(Number); break;
      case "--smoke-widths": opts.smokeWidths = String(value).split(",").map(Number); break;
      case "--verbose": opts.verbose = true; break;
      case "--shots": opts.shots = String(value); break;
      case "--list": opts.list = true; break;
      case "--help": case "-h": opts.help = true; break;
      default: throw new Error(`Unknown argument ${arg}`);
    }
  }
  return opts;
}

/* ------------------------------------------------------------------ matrix ----------------- */

const BASE_WIDTH = 1400;
const BASE_HEIGHT = 600;
const MID_WIDTH = 1000;
/** The browser window: tall enough for the grow steps to make the grid much taller than at mount. */
const WINDOW = [1600, 1500];

/** Transition sequences. Each gets the page, a `record(step)` that checks and stores, and helpers. */
const SEQUENCES = {
  // Scroll the centre to its far right, then shrink and grow; the scroll position has to survive.
  async scrolled({ call, record, size }) {
    await call("scrollCenter", "max");
    await record("scrollMax@1000");
    for (const w of [800, 520, 800, 1000]) {
      await size(w, BASE_HEIGHT);
      await record(`scrollMax@${w}`);
    }
    await call("scrollCenter", 0);
    await record("scroll0@1000");
  },
  // Pin a centre column left, then right, then unpin it, checking at the normal and a tight width.
  async pinToggle({ call, record, size }) {
    for (const pinned of ["left", "right", null]) {
      await call("pin", "account", pinned);
      await record(`pin-${pinned ?? "none"}@1000`);
      await size(520, BASE_HEIGHT);
      await record(`pin-${pinned ?? "none"}@520`);
      await size(MID_WIDTH, BASE_HEIGHT);
    }
  },
  async hideToggle({ call, record }) {
    await call("hide", "country", true);
    await record("hide-country@1000");
    await call("hide", "country", false);
    await record("show-country@1000");
  },
  // Collapse and reopen the column groups that carry an expander (location / people).
  async groupToggle({ call, record }) {
    for (const colId of ["location", "people"]) {
      await call("setGroupOpen", colId, false);
      await record(`collapse-${colId}@1000`);
      await call("setGroupOpen", colId, true);
      await record(`expand-${colId}@1000`);
    }
  },
  async themeSwap({ call, record }) {
    for (const theme of ["dark", "custom", "light"]) {
      await call("setTheme", theme);
      await record(`theme-${theme}@1000`);
    }
  },
  async headerHeight({ call, record, size }) {
    for (const px of [64, 28, null]) {
      await call("setHeaderHeight", px ?? undefined);
      await record(`headerHeight-${px ?? "reset"}@1000`);
    }
    await size(520, BASE_HEIGHT);
    await record("headerHeight-reset@520");
    await size(MID_WIDTH, BASE_HEIGHT);
  },
  // Create the grid inside a display:none frame, then show it — a tabbed host does exactly this.
  async hiddenMount({ page, record, size, config }) {
    await page.evaluate(`window.__layoutMatrix.mount(${JSON.stringify(config)}, { hidden: true })`);
    await page.evaluate(`window.__layoutMatrix.reveal()`);
    await record("reveal@1000");
    await size(520, BASE_HEIGHT);
    await record("reveal@520");
    await size(MID_WIDTH, BASE_HEIGHT);
  },
  async bodyScroll({ call, record }) {
    await call("scrollBody", 2000);
    await record("bodyScroll-2000@1000");
    await call("scrollBody", "max");
    await record("bodyScroll-max@1000");
    await call("scrollBody", 0);
    await record("bodyScroll-0@1000");
  },
  // Mount in a short frame, then make it much taller: the row pool sized at mount must grow with
  // the body or the bottom of the grid stays blank (A3.3).
  async growTall({ page, record, size, config }) {
    await size(MID_WIDTH, 300);
    await page.evaluate(`window.__layoutMatrix.mount(${JSON.stringify(config)})`);
    await record("growTall@300");
    await size(MID_WIDTH, 1300);
    await record("growTall@1300");
    await page.evaluate(`window.__layoutMatrix.scrollBody(2000)`);
    await record("growTall-scrolled@1300");
    await size(MID_WIDTH, BASE_HEIGHT);
  },
  // Resize the window itself (fluid frame) rather than the frame: this is the path that fires the
  // window `resize` listener and invalidates the measured scrollbar gutter.
  async window({ page, record, opts }) {
    await page.evaluate(`window.__layoutMatrix.setHostSize(null, ${BASE_HEIGHT})`);
    for (const w of [900, 600, 1300]) {
      await page.setViewport(w, 800, opts.dpr);
      await page.evaluate(`window.__layoutMatrix.settle()`);
      await record(`window@${w}`);
    }
    await page.setViewport(WINDOW[0], WINDOW[1], opts.dpr);
    await page.evaluate(`window.__layoutMatrix.setHostSize(${MID_WIDTH}, ${BASE_HEIGHT})`);
  },
};

/** Saves a PNG of the first `.pte-root` for the first step a (run, violation id) pair fails on. */
async function captureFailure(page, opts, runName, step, report, seen) {
  if (!opts.shots) return;
  const fresh = report.violations.filter(v => v.severity === "error" && !seen.has(v.id));
  if (!fresh.length) return;
  for (const v of fresh) seen.add(v.id);
  const clip = await page.evaluate(`(() => {
    const root = document.querySelector(".pte-root");
    if (!root) return null;
    const b = root.getBoundingClientRect();
    return { x: Math.max(0, b.x - 1), y: Math.max(0, b.y - 1), width: b.width + 2, height: b.height + 2 };
  })()`).catch(() => null);
  const name = `${runName}__${step}__${fresh.map(v => v.id).join("+")}`.replace(/[^A-Za-z0-9_.+@-]/g, "_");
  await page.screenshot(path.join(opts.shots, `${name}.png`), clip || undefined).catch(() => {});
}

async function runCase(page, testCase, opts, steps = []) {
  const seenShots = new Set();
  const call = (method, ...args) =>
    page.evaluate(`window.__layoutMatrix.${method}(${args.map(a => JSON.stringify(a)).join(", ")})`);
  const size = (w, h) => call("setHostSize", w, h);
  const record = async step => {
    const report = await call("check");
    const consoleEntries = page.drainConsole();
    if (!report) {
      steps.push({ step, violations: [{ id: "no-grid", severity: "error", message: "no .pte-root mounted", details: {} }], summary: {}, console: consoleEntries });
      return;
    }
    // A violation the case declares as known (a filed finding) is kept in the report but does not
    // count as a failure.
    for (const v of report.violations) {
      const known = (testCase.known || []).find(k => k.ids.includes(v.id) && k.steps.test(step));
      if (known) {
        v.severity = "known";
        v.message = `${v.message} (known: ${known.reason})`;
      }
    }
    steps.push({ step, violations: report.violations, summary: report.summary, console: consoleEntries });
    await captureFailure(page, opts, testCase.name, step, report, seenShots);
    if (opts.verbose) {
      const errors = report.violations.filter(v => v.severity === "error").map(v => v.id);
      console.log(`    ${step.padEnd(28)} ${errors.length ? errors.join(",") : "ok"}  ${JSON.stringify(report.summary.sections)} rows=${report.summary.rowsRendered} strip=${report.summary.strip}`);
    }
  };

  await size(BASE_WIDTH, BASE_HEIGHT);
  await page.evaluate(`window.__layoutMatrix.mount(${JSON.stringify(testCase.config)})`);
  page.drainConsole(); // creation noise is not a layout finding; exceptions still surface below
  await record(`mount@${BASE_WIDTH}`);
  const ladder = opts.widths;
  for (const w of ladder.slice(1)) {
    await size(w, BASE_HEIGHT);
    await record(`shrink@${w}`);
  }
  for (const w of [...ladder].reverse().slice(1)) {
    await size(w, BASE_HEIGHT);
    await record(`grow@${w}`);
  }
  for (const h of opts.heights) {
    await size(MID_WIDTH, h);
    await record(`height@${h}`);
  }
  // Grow well past the mount height: the row pool must follow (A3.3).
  for (const h of [900, 1300]) {
    await size(MID_WIDTH, h);
    await record(`height@${h}`);
  }
  await size(MID_WIDTH, BASE_HEIGHT);
  for (const name of testCase.sequences || []) {
    const sequence = SEQUENCES[name];
    if (!sequence) throw new Error(`Unknown sequence "${name}" in case ${testCase.name}`);
    await sequence({ page, call, record, size, config: testCase.config, opts });
  }
  return { name: testCase.name, config: testCase.config, steps };
}

const HARNESS_READY = "window.__layoutMatrix && window.__layoutInvariants";

/**
 * Makes sure the harness page is loaded and its globals exist. A dev server reload (a stylesheet
 * regenerated by a build in another terminal, an edit under the probe) replaces the page and takes
 * `window.__layoutMatrix` with it; re-navigating is the recovery.
 */
async function ensureHarness(page, harnessUrl) {
  const ready = await page.evaluate(`!!(${HARNESS_READY})`, { timeout: 5000 }).catch(() => false);
  if (ready) return false;
  await page.navigate(harnessUrl);
  await page.waitForFunction(HARNESS_READY, { timeout: 30000 });
  return true;
}

function looksLikeReload(error) {
  const text = String(error?.message || error);
  return /__layoutMatrix|__layoutInvariants|reading '(check|mount|setHostSize|settle|scroll|pin|hide|set|reveal|destroy)|navigated or closed|Inspected target/i.test(text);
}

/**
 * A case that throws (a hung evaluate, a page exception) is reported, not fatal to the matrix. A
 * case that lost the page under it (dev-server reload) is retried on a fresh harness, up to three
 * attempts — reloads tend to come in bursts while files are being saved.
 */
async function runCaseSafely(page, testCase, opts, harnessUrl, attempt = 1) {
  const partial = { name: testCase.name, config: testCase.config, steps: [] };
  try {
    await ensureHarness(page, harnessUrl);
    return await runCase(page, testCase, opts, partial.steps);
  } catch (error) {
    if (attempt < 3 && looksLikeReload(error)) {
      console.log(`    (page reloaded under ${testCase.name}; re-attaching to the harness and retrying, attempt ${attempt + 1})`);
      return runCaseSafely(page, testCase, opts, harnessUrl, attempt + 1);
    }
    partial.steps.push({
      step: "harness",
      violations: [{ id: "harness-error", severity: "error", message: String(error.message || error), details: {} }],
      summary: {},
      console: page.drainConsole(),
    });
    // Leave the page in a known state for the next case.
    await page.evaluate("window.__layoutMatrix.destroy(); true", { timeout: 5000 }).catch(() => {});
    return partial;
  }
}

/* ------------------------------------------------------------------ smoke ------------------ */

function playgroundPageIds() {
  const source = readFileSync(path.join(repoRoot, "apps", "vanilla-playground", "main.ts"), "utf8");
  const block = source.slice(source.indexOf("const PAGES"), source.indexOf("];", source.indexOf("const PAGES")));
  return [...block.matchAll(/id:\s*"([^"]+)"/g)].map(match => match[1]);
}

async function runSmoke(page, baseUrl, id, invariantsSource, opts) {
  const steps = [];
  const seenShots = new Set();
  // A query string per page forces a real navigation; the app only reads the hash.
  await page.navigate(`${baseUrl}/?page=${id}#${id}`);
  await page.waitForFunction(
    'document.querySelector(".pte-root .pte-row, .pte-root .pte-norows-overlay, .pte-root .pte-loading-overlay")',
    { timeout: 8000 },
  ).catch(() => {});
  await page.evaluate(`${invariantsSource}\n;true`);
  // The page's nav wraps to many rows at narrow widths and would squeeze the grid to a few pixels;
  // the smoke pass is about the grid, so give it the page.
  await page.evaluate('document.querySelectorAll("nav").forEach(n => { n.style.display = "none"; }); true');
  for (const w of opts.smokeWidths) {
    await page.setViewport(w, 800, opts.dpr);
    await page.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))))");
    const reports = await page.evaluate("window.__layoutInvariants.checkAll()");
    const violations = reports.flatMap((report, grid) =>
      report.violations.map(v => (reports.length > 1 ? { ...v, details: { ...v.details, grid } } : v)));
    steps.push({ step: `width@${w}`, grids: reports.length, violations, summary: reports.map(r => r.summary), console: page.drainConsole() });
    await captureFailure(page, opts, `page-${id}`, `width@${w}`, { violations }, seenShots);
  }
  await page.setViewport(WINDOW[0], WINDOW[1], opts.dpr);
  return { name: id, steps };
}

/**
 * The smoke pass gets the same recovery as the matrix: a page that navigated under an in-flight
 * evaluate (a Vite dependency re-optimisation reloads the page the first time it meets a new
 * import; a stylesheet regeneration does the same) is retried up to three times, and any other
 * failure is reported as a `harness-error` step for that page instead of aborting the run.
 */
async function runSmokeSafely(page, baseUrl, id, invariantsSource, opts, attempt = 1) {
  try {
    return await runSmoke(page, baseUrl, id, invariantsSource, opts);
  } catch (error) {
    if (attempt < 3 && looksLikeReload(error)) {
      console.log(`    (page reloaded under ${id}; retrying, attempt ${attempt + 1})`);
      return runSmokeSafely(page, baseUrl, id, invariantsSource, opts, attempt + 1);
    }
    return {
      name: id,
      steps: [{
        step: "harness",
        grids: 0,
        violations: [{ id: "harness-error", severity: "error", message: String(error.message || error), details: {} }],
        summary: [],
        console: page.drainConsole(),
      }],
    };
  }
}

/* ------------------------------------------------------------------ report ----------------- */

function isFailure(entry) {
  return entry.level === "exception" || entry.level === "error";
}

function summarize(run) {
  // id -> { message, steps[] }
  const errors = new Map();
  const warnings = new Map();
  const known = new Map();
  for (const step of run.steps) {
    for (const v of step.violations) {
      const bucket = v.severity === "error" ? errors : v.severity === "known" ? known : warnings;
      const entry = bucket.get(v.id) || { message: v.message, details: v.details, steps: [] };
      entry.steps.push(step.step);
      bucket.set(v.id, entry);
    }
    for (const entry of step.console.filter(isFailure)) {
      const current = errors.get("console") || { message: entry.text, details: {}, steps: [] };
      current.steps.push(step.step);
      errors.set("console", current);
    }
  }
  return { errors, warnings, known };
}

function printRun(run, kind) {
  const { errors, warnings, known } = summarize(run);
  const status = errors.size ? "✘" : warnings.size ? "△" : "✔";
  const counts = `${run.steps.length} step${run.steps.length === 1 ? "" : "s"}`;
  console.log(`${status} ${kind} ${run.name} (${counts})`);
  const show = (bucket, mark) => {
    for (const [id, entry] of bucket) {
      const steps = entry.steps.length > 6 ? `${entry.steps.slice(0, 6).join(", ")} … (${entry.steps.length} steps)` : entry.steps.join(", ");
      console.log(`    ${mark} ${id}  [${steps}]`);
      console.log(`      ${entry.message}${Object.keys(entry.details).length ? "  " + JSON.stringify(entry.details) : ""}`);
    }
  };
  show(errors, "error");
  show(warnings, "warn ");
  show(known, "known");
  return { errors: errors.size, warnings: warnings.size };
}

/* ------------------------------------------------------------------ main ------------------- */

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 14).map(l => l.replace(/^\/\/ ?/, "")).join("\n"));
    return;
  }
  const cases = CASES.filter(c => !opts.only || opts.only.test(c.name));
  if (opts.list) {
    for (const c of cases) console.log(`${c.name.padEnd(32)} ${JSON.stringify(c.config)}  ${(c.sequences || []).join(",")}`);
    return;
  }
  const invariantsSource = readFileSync(path.join(here, "invariants.js"), "utf8");
  const chrome = findChrome();
  console.log(`layout probe · chrome: ${chrome ?? "not found"} · dpr ${opts.dpr} · ${opts.overlayScrollbars ? "overlay" : "classic"} scrollbars`);

  const server = opts.url ? { url: opts.url, stop() {} } : await startViteServer({ repoRoot, port: await freePort() });
  const browser = await launchBrowser({ bin: chrome, dpr: opts.dpr, overlayScrollbars: opts.overlayScrollbars, windowSize: WINDOW });
  // A killed run (Ctrl-C, a CI timeout) must not leave a dev server and a Chrome behind.
  const onSignal = signal => {
    server.stop();
    browser.close().finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  const report = {
    meta: { date: new Date().toISOString(), chrome, dpr: opts.dpr, overlayScrollbars: opts.overlayScrollbars, widths: opts.widths, heights: opts.heights },
    cases: [],
    smoke: [],
  };
  let failed = 0;
  let warned = 0;
  try {
    const page = await browser.newPage();
    await page.setViewport(WINDOW[0], WINDOW[1], opts.dpr);
    if (!opts.skipMatrix) {
      const harnessUrl = `${server.url}/layout-matrix.html`;
      await page.navigate(harnessUrl);
      await page.waitForFunction(HARNESS_READY, { timeout: 30000 });
      console.log(`\nmatrix: ${cases.length} cases · widths ${opts.widths.join("/")} · heights ${opts.heights.join("/")}`);
      for (const testCase of cases) {
        if (opts.verbose) console.log(`\n▶ ${testCase.name} ${JSON.stringify(testCase.config)}`);
        const run = await runCaseSafely(page, testCase, opts, harnessUrl);
        report.cases.push(run);
        const { errors, warnings } = printRun(run, "case");
        if (errors) failed++;
        if (warnings) warned++;
      }
    }
    if (!opts.skipSmoke) {
      const ids = playgroundPageIds();
      console.log(`\nsmoke: ${ids.length} playground pages × widths ${opts.smokeWidths.join("/")}`);
      for (const id of ids) {
        const run = await runSmokeSafely(page, server.url, id, invariantsSource, opts);
        report.smoke.push(run);
        const { errors, warnings } = printRun(run, "page");
        if (errors) failed++;
        if (warnings) warned++;
      }
    }
  } finally {
    await browser.close();
    server.stop();
  }
  const checks = [...report.cases, ...report.smoke].reduce((n, run) => n + run.steps.length, 0);
  if (opts.json) {
    mkdirSync(path.dirname(path.resolve(opts.json)), { recursive: true });
    writeFileSync(opts.json, JSON.stringify(report, null, 2));
    console.log(`\nreport written to ${opts.json}`);
  }
  console.log(`\n${checks} checks · ${failed} run(s) with errors · ${warned} run(s) with warnings only`);
  process.exitCode = failed ? 1 : 0;
}

main().catch(error => {
  console.error(error.stack || String(error));
  process.exitCode = 2;
});
