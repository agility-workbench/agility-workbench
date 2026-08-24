#!/usr/bin/env node
// Packed-artifact contents gate for the published packages.
//
// `npm pack` ships whatever the manifest's `files` list resolves to at pack
// time, and for the Angular package `publishConfig.directory: "dist"` does NOT
// redirect packing — targeting the workspace root instead of
// `packages/angular-grid/dist` produces a 52-file artifact full of source,
// tests, and tooling. This script dry-run-packs each release target and
// asserts its file list matches an exact allowlist: any extra, missing, or
// renamed file fails, so an accidental root pack (or a build change that
// leaks new files into an artifact) is caught before anything is published.
//
// Run after `npm run build`.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Release targets and the exact files each artifact must contain. */
const TARGETS = [
  {
    name: "@agility-workbench/grid",
    dir: "packages/grid",
    files: [
      "LICENSE",
      "README.md",
      "dist/index.cjs",
      "dist/index.css",
      "dist/index.d.cts",
      "dist/index.d.ts",
      "dist/index.js",
      "package.json",
    ],
  },
  {
    name: "@agility-workbench/react-grid",
    dir: "packages/react-grid",
    files: [
      "LICENSE",
      "README.md",
      "dist/index.cjs",
      "dist/index.d.cts",
      "dist/index.d.ts",
      "dist/index.js",
      "package.json",
    ],
  },
  {
    // The generated APF package — the ONLY valid Angular release artifact.
    name: "@agility-workbench/angular-grid",
    dir: "packages/angular-grid/dist",
    files: [
      "LICENSE",
      "README.md",
      "fesm2022/agility-workbench-angular-grid.mjs",
      "index.d.ts",
      "package.json",
    ],
  },
];

const result = spawnSync(
  "npm",
  [
    "pack",
    "--dry-run",
    "--json",
    "--ignore-scripts",
    ...TARGETS.map(target => `./${target.dir}`),
  ],
  { cwd: repoRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
);

if (result.status !== 0) {
  console.error("npm pack --dry-run failed:\n" + (result.stderr || result.stdout));
  process.exit(1);
}

let packed;
try {
  packed = JSON.parse(result.stdout);
} catch {
  console.error("Could not parse `npm pack --json` output:\n" + result.stdout);
  process.exit(1);
}

const failures = [];

for (const target of TARGETS) {
  const artifact = packed.find(entry => entry.name === target.name);
  if (!artifact) {
    failures.push(`${target.name}: no artifact produced for ./${target.dir}`);
    continue;
  }

  const actual = artifact.files.map(file => file.path).sort();
  const expected = [...target.files].sort();
  const extra = actual.filter(file => !expected.includes(file));
  const missing = expected.filter(file => !actual.includes(file));

  if (extra.length === 0 && missing.length === 0) {
    console.log(`✓ ${target.name}: ${actual.length} files match the allowlist (./${target.dir})`);
    continue;
  }
  if (extra.length > 0) {
    failures.push(
      `${target.name}: artifact contains ${extra.length} file(s) outside the allowlist:\n` +
        extra.map(file => `    ${file}`).join("\n") +
        (extra.length > 10
          ? "\n    (a large overflow usually means the Angular workspace root was packed instead of its dist/)"
          : ""),
    );
  }
  if (missing.length > 0) {
    failures.push(
      `${target.name}: artifact is missing ${missing.length} required file(s):\n` +
        missing.map(file => `    ${file}`).join("\n") +
        "\n    Run `npm run build` first, or update the allowlist if the change is intentional.",
    );
  }
}

if (failures.length > 0) {
  console.error("\nPack contents check FAILED:\n");
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  process.exit(1);
}

console.log("\nPack contents check passed.");
