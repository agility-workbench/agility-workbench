#!/usr/bin/env node
// Interaction probe: drives real grids in a real (headless) Chrome with trusted input — mouse,
// wheel, keyboard and touch over the DevTools protocol — and asserts what the interaction did,
// plus the layout invariants of the layout probe after every step.
//
//   npm run probe:interactions                          # every scenario, LTR and RTL variants
//   npm run probe:interactions -- --only=rtl            # scenarios whose name matches /rtl/
//   npm run probe:interactions -- --list
//   npm run probe:interactions -- --json=artifacts/interaction-probe.json --shots=artifacts/interaction-probe
//   npm run probe:interactions -- --url=http://localhost:5182   # reuse a running vanilla dev server
//   npm run probe:interactions -- --verbose            # a line per step, with timings
//
// Scenarios live in ./scenarios.mjs; the harness page is apps/vanilla-playground/layout-matrix.html
// and ./page-helpers.js is injected into it for geometry reads. Exits 1 when any check fails or the
// page throws; benchmark lines are reported, never asserted.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findChrome, freePort, launchBrowser, startViteServer } from "../layout-probe/cdp.mjs";
import { SCENARIOS } from "./scenarios.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const WINDOW = [1600, 1000];
const HELPERS = readFileSync(path.join(here, "page-helpers.js"), "utf8");
const HARNESS_READY = "window.__layoutMatrix && window.__layoutInvariants";

function parseArgs(argv) {
  const opts = { only: null, json: null, url: null, verbose: false, list: false, help: false, shots: null };
  for (const arg of argv) {
    const [key, value] = arg.includes("=") ? arg.split(/=(.*)/s) : [arg, true];
    switch (key) {
      case "--only": opts.only = new RegExp(String(value)); break;
      case "--json": opts.json = String(value); break;
      case "--url": opts.url = String(value).replace(/\/$/, ""); break;
      case "--verbose": opts.verbose = true; break;
      case "--shots": opts.shots = String(value); break;
      case "--list": opts.list = true; break;
      case "--help": case "-h": opts.help = true; break;
      default: throw new Error(`Unknown argument ${arg}`);
    }
  }
  return opts;
}

/** One scenario per declared direction: `name-ltr` / `name-rtl`, with `rtl` set in the config. */
function expandScenarios() {
  return SCENARIOS.flatMap(s => (s.directions || ["ltr"]).map(dir => ({
    ...s,
    name: `${s.name}-${dir}`,
    rtl: dir === "rtl",
    config: { ...s.config, ...(dir === "rtl" ? { rtl: true } : {}) },
  })));
}

/* ------------------------------------------------------------------ context ---------------- */

class ScenarioAbort extends Error {}

/**
 * What a scenario's `run(t)` gets. A scenario is a sequence of `t.step(label, body)`; the body
 * acts (t.page input helpers, harness calls) and asserts with `t.expect`; after the body the
 * layout invariants run on the grid, and their errors count against that step. A thrown body
 * records a `step-error` failure and ends the scenario (the grid's state is unknown after it).
 */
function makeContext(page, scenario, opts, record) {
  const t = {
    page,
    rtl: scenario.rtl,
    config: scenario.config,
    /** +1 towards the inline end in physical x (right in LTR, left in RTL). */
    inl: scenario.rtl ? -1 : 1,
    benchmarks: [],
    call: (method, ...args) => page.evaluate(`window.__layoutMatrix.${method}(${args.map(a => JSON.stringify(a)).join(", ")})`),
    q: (fn, ...args) => page.evaluate(`window.__probe.${fn}(${args.map(a => JSON.stringify(a)).join(", ")})`),
    /** Evaluates `expr` with `api` bound to the harness grid's IGridAPI; returns its JSON value. */
    api: expr => page.evaluate(`(api => (${expr}))(window.__layoutMatrix.api())`),
    settle: () => page.evaluate("window.__layoutMatrix.settle()"),
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    /** Main-thread time counters (ms) from the DevTools Performance domain: Task, Script, Layout, RecalcStyle. */
    async metrics() {
      if (!t.perfEnabled) { await page.send("Performance.enable"); t.perfEnabled = true; }
      const { metrics } = await page.send("Performance.getMetrics");
      const out = {};
      for (const m of metrics) if (/Duration$/.test(m.name)) out[m.name.replace(/Duration$/, "")] = m.value * 1000;
      return out;
    },
    bench(label, values, unit = "ms") {
      t.benchmarks.push({ label, values, unit });
    },
    current: null,
    expect(ok, message, details) {
      t.current.checks++;
      if (!ok) t.current.failures.push({ id: "expect", message, details: details ?? {} });
      return !!ok;
    },
    /** Asserts deep equality of two JSON values. */
    expectEqual(actual, expected, message) {
      const same = JSON.stringify(actual) === JSON.stringify(expected);
      return t.expect(same, message, { actual, expected });
    },
    async step(label, body) {
      const entry = { step: label, checks: 0, failures: [], violations: [], console: [], ms: 0 };
      t.current = entry;
      const started = Date.now();
      let aborted = null;
      try {
        await body();
        await t.settle();
      } catch (error) {
        if (looksLikeReload(error)) throw error;
        entry.failures.push({ id: "step-error", message: String(error.message || error), details: {} });
        aborted = error;
      }
      entry.ms = Date.now() - started;
      try {
        const report = await t.call("check");
        entry.checks++;
        if (!report) entry.failures.push({ id: "no-grid", message: "no .pte-root mounted", details: {} });
        else entry.violations = report.violations.filter(v => v.severity === "error");
      } catch (error) {
        if (looksLikeReload(error)) throw error;
        entry.failures.push({ id: "invariants-error", message: String(error.message || error), details: {} });
      }
      entry.console = page.drainConsole().filter(e => e.level === "exception" || e.level === "error");
      await record(entry);
      if (aborted) throw new ScenarioAbort(aborted.message);
      return entry;
    },
  };
  return t;
}

async function screenshotRoot(page, file) {
  const clip = await page.evaluate(`(() => {
    const root = document.querySelector(".pte-root");
    if (!root) return null;
    const b = root.getBoundingClientRect();
    return { x: Math.max(0, b.x - 1), y: Math.max(0, b.y - 1), width: Math.min(b.width + 2, innerWidth), height: Math.min(b.height + 2, innerHeight) };
  })()`).catch(() => null);
  await page.screenshot(file, clip || undefined).catch(() => {});
}

function stepFailed(entry) {
  return entry.failures.length > 0 || entry.violations.length > 0 || entry.console.length > 0;
}

async function runScenario(page, scenario, opts, steps) {
  let shot = false;
  const record = async entry => {
    steps.push(entry);
    const failed = stepFailed(entry);
    if (failed && opts.shots && !shot) {
      shot = true;
      await screenshotRoot(page, path.join(opts.shots, `${scenario.name}__${entry.step}.png`.replace(/[^A-Za-z0-9_.+@-]/g, "_")));
    }
    if (opts.verbose) {
      const what = failed ? [...entry.failures.map(f => f.id), ...entry.violations.map(v => v.id), ...(entry.console.length ? ["console"] : [])].join(",") : "ok";
      console.log(`    ${entry.step.padEnd(44)} ${String(entry.ms).padStart(5)}ms  ${what}`);
    }
  };
  const t = makeContext(page, scenario, opts, record);
  const [w, h] = scenario.host || [1000, 600];
  await t.call("setHostSize", w, h);
  await t.call("mount", scenario.config);
  page.drainConsole();
  try {
    await scenario.run(t);
  } catch (error) {
    if (!(error instanceof ScenarioAbort)) throw error;
  }
  return t.benchmarks;
}

/* ------------------------------------------------------------------ recovery --------------- */

function looksLikeReload(error) {
  const text = String(error?.message || error);
  return /__layoutMatrix|__probe|__layoutInvariants|navigated or closed|Inspected target|no response after|Execution context was destroyed|Cannot find context/i.test(text);
}

async function ensureHarness(page, harnessUrl) {
  const ready = await page.evaluate(`!!(${HARNESS_READY} && window.__probe)`, { timeout: 5000 }).catch(() => false);
  if (ready) return;
  await page.navigate(harnessUrl);
  await page.waitForFunction(HARNESS_READY, { timeout: 30000 });
  await page.evaluate(`${HELPERS}\n;true`);
}

async function freshPage(browser, old) {
  if (old) old.close().catch(() => {});
  const page = await browser.newPage();
  await page.setViewport(WINDOW[0], WINDOW[1]);
  return page;
}

/**
 * Every scenario starts on a fresh harness page (input state — a held button, an open menu, focus
 * — must never leak between scenarios). A scenario that lost its page (a dev-server reload, a dead
 * target) is retried on a new page, up to three attempts; any other throw is reported.
 */
async function runScenarioSafely(browser, pages, scenario, opts, harnessUrl) {
  for (let attempt = 1; ; attempt++) {
    const steps = [];
    try {
      pages.current = await freshPage(browser, pages.current);
      await ensureHarness(pages.current, harnessUrl);
      const benchmarks = await runScenario(pages.current, scenario, opts, steps);
      return { name: scenario.name, config: scenario.config, steps, benchmarks };
    } catch (error) {
      if (attempt < 3 && looksLikeReload(error)) {
        console.log(`    (page lost under ${scenario.name}; retrying on a fresh page, attempt ${attempt + 1})`);
        continue;
      }
      steps.push({
        step: "harness", checks: 1, failures: [{ id: "harness-error", message: String(error.message || error), details: {} }],
        violations: [], console: pages.current ? pages.current.drainConsole() : [], ms: 0,
      });
      return { name: scenario.name, config: scenario.config, steps, benchmarks: [] };
    }
  }
}

/* ------------------------------------------------------------------ report ----------------- */

function printRun(run) {
  const failed = run.steps.filter(stepFailed);
  const checks = run.steps.reduce((n, s) => n + s.checks, 0);
  console.log(`${failed.length ? "✘" : "✔"} ${run.name} (${run.steps.length} steps, ${checks} checks)`);
  for (const step of failed) {
    console.log(`    ✘ ${step.step}`);
    for (const f of step.failures) console.log(`      ${f.id}: ${f.message}${f.details && Object.keys(f.details).length ? "  " + JSON.stringify(f.details).slice(0, 400) : ""}`);
    for (const v of step.violations.slice(0, 4)) console.log(`      layout ${v.id}: ${v.message}  ${JSON.stringify(v.details).slice(0, 300)}`);
    if (step.violations.length > 4) console.log(`      … ${step.violations.length - 4} more layout violations`);
    for (const c of step.console.slice(0, 3)) console.log(`      console ${c.level}: ${c.text.split("\n")[0]}`);
  }
  return { failedSteps: failed.length, checks, failedChecks: failed.reduce((n, s) => n + s.failures.length + s.violations.length + s.console.length, 0) };
}

function fmtBench(b) {
  const v = b.values;
  if (!Array.isArray(v)) return `${b.label}: ${v}${b.unit}`;
  const sorted = [...v].sort((x, y) => x - y);
  const pct = p => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
  const mean = v.reduce((a, x) => a + x, 0) / v.length;
  return `${b.label}: n=${v.length} mean ${mean.toFixed(1)}${b.unit} · p50 ${pct(0.5).toFixed(1)} · p95 ${pct(0.95).toFixed(1)} · max ${sorted[sorted.length - 1].toFixed(1)}`;
}

/* ------------------------------------------------------------------ main ------------------- */

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 16).map(l => l.replace(/^\/\/ ?/, "")).join("\n"));
    return;
  }
  const scenarios = expandScenarios().filter(s => !opts.only || opts.only.test(s.name));
  if (opts.list) {
    for (const s of scenarios) console.log(`${s.name.padEnd(36)} ${JSON.stringify(s.config)}`);
    return;
  }
  const chrome = findChrome();
  console.log(`interaction probe · chrome: ${chrome ?? "not found"} · ${scenarios.length} scenarios`);

  let server = null;
  let browser = null;
  const cleanup = async () => {
    const b = browser;
    browser = null;
    if (b) await b.close().catch(() => {});
    if (server) { server.stop(); server = null; }
  };
  // A killed run (Ctrl-C, a CI timeout) must not leave a dev server and a Chrome behind.
  const onSignal = signal => { cleanup().finally(() => process.exit(signal === "SIGINT" ? 130 : 143)); };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  // A stray rejection from a protocol listener must not exit past the cleanup with Chrome alive.
  process.on("unhandledRejection", error => {
    console.error("unhandled rejection:", error?.stack || error);
    cleanup().finally(() => process.exit(2));
  });

  const report = { meta: { date: new Date().toISOString(), chrome, window: WINDOW }, scenarios: [] };
  let failedScenarios = 0;
  let checks = 0;
  let failedChecks = 0;
  try {
    server = opts.url ? { url: opts.url, stop() {} } : await startViteServer({ repoRoot, port: await freePort() });
    browser = await launchBrowser({ bin: chrome, windowSize: WINDOW });
    const harnessUrl = `${server.url}/layout-matrix.html`;
    const pages = { current: null };
    for (const scenario of scenarios) {
      if (opts.verbose) console.log(`\n▶ ${scenario.name} ${JSON.stringify(scenario.config)}`);
      const run = await runScenarioSafely(browser, pages, scenario, opts, harnessUrl);
      report.scenarios.push(run);
      const r = printRun(run);
      checks += r.checks;
      failedChecks += r.failedChecks;
      if (r.failedSteps) failedScenarios++;
    }
  } finally {
    await cleanup();
  }
  const benches = report.scenarios.flatMap(run => run.benchmarks.map(b => ({ ...b, label: `${run.name} · ${b.label}` })));
  if (benches.length) {
    console.log("\nbenchmarks (reported, not asserted):");
    for (const b of benches) console.log(`  ${fmtBench(b)}`);
  }
  if (opts.json) {
    mkdirSync(path.dirname(path.resolve(opts.json)), { recursive: true });
    writeFileSync(opts.json, JSON.stringify(report, null, 2));
    console.log(`\nreport written to ${opts.json}`);
  }
  console.log(`\n${checks} checks · ${failedChecks} failed · ${failedScenarios} of ${report.scenarios.length} scenario(s) with failures · ${benches.length} benchmark(s)`);
  process.exitCode = failedScenarios ? 1 : 0;
}

main().catch(error => {
  console.error(error.stack || String(error));
  process.exitCode = 2;
});
