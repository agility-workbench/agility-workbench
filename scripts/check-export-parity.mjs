#!/usr/bin/env node
// Declaration-versus-runtime export parity gate for the published packages.
//
// tsup bundles declarations by inlining the referenced declaration into the
// emitted .d.ts. When the inlined declaration is a *class*, the bundler re-emits
// it in the final export list without the `type` modifier — even when the source
// re-exported it as `export type { ... }`. The result is a declaration that
// advertises a runtime value the ESM/CJS builds never export, so TypeScript
// approves an import that throws at execution time.
//
// This script loads each packed-shape build and asserts:
//   1. every value (non-`type`) export in .d.ts / .d.cts exists in the runtime,
//   2. every runtime export is declared,
//   3. the ESM and CJS runtimes expose the same names.
//
// Run after `npm run build`.

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Packages whose declarations and runtime must agree, in build order. */
const TARGETS = [
  { name: "@agility-workbench/grid", dist: "packages/grid/dist" },
  { name: "@agility-workbench/react-grid", dist: "packages/react-grid/dist" },
];

/**
 * Declaration file backing `specifier` when it names another checked package —
 * `export * from "@agility-workbench/grid"` in the React wrapper must contribute
 * the core's value exports, or every re-exported core value looks undeclared.
 * `kind` selects the declaration format so a .d.cts chain stays on .d.cts.
 */
function resolveStarExport(specifier, kind) {
  const target = TARGETS.find(candidate => candidate.name === specifier);
  if (!target) return null;
  const file = path.join(repoRoot, target.dist, kind === "cjs" ? "index.d.cts" : "index.d.ts");
  return existsSync(file) ? file : null;
}

/**
 * Names exported as runtime values by a declaration file, following `export *`
 * into sibling packages. `export type { X }`, `export { type X }`, and bare
 * `interface`/`type` declarations are excluded.
 *
 * Unresolvable `export *` targets are reported rather than ignored: silently
 * skipping one would hide exactly the mismatch this gate exists to catch.
 */
function declaredValueExports(file, kind, unresolved = []) {
  const source = ts.createSourceFile(
    file,
    require("node:fs").readFileSync(file, "utf8"),
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ false,
    ts.ScriptKind.TS,
  );

  const names = new Set();
  const isTypeOnlyDeclaration = node =>
    ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node);
  const hasExportModifier = node =>
    node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

  for (const node of source.statements) {
    // export { a, type b } / export type { c }
    if (ts.isExportDeclaration(node)) {
      if (node.isTypeOnly) continue;
      if (!node.exportClause) {
        // `export * from "..."` — re-exports the target's runtime values.
        const specifier = node.moduleSpecifier?.text;
        const resolved = specifier ? resolveStarExport(specifier, kind) : null;
        if (resolved) {
          for (const name of declaredValueExports(resolved, kind, unresolved)) names.add(name);
        } else if (specifier) {
          unresolved.push(specifier);
        }
        continue;
      }
      if (!ts.isNamedExports(node.exportClause)) continue; // `export * as ns from "..."`
      for (const spec of node.exportClause.elements) {
        if (!spec.isTypeOnly) names.add(spec.name.text);
      }
      continue;
    }
    // export declare class X / export declare const y
    if (!hasExportModifier(node) || isTypeOnlyDeclaration(node)) continue;
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) names.add(decl.name.text);
      }
    } else if (node.name && ts.isIdentifier(node.name)) {
      names.add(node.name.text);
    }
  }
  return names;
}

const sorted = set => [...set].sort();
const missingFrom = (a, b) => sorted(a).filter(name => !b.has(name));

const failures = [];

for (const target of TARGETS) {
  const dist = path.join(repoRoot, target.dist);
  const files = {
    esm: path.join(dist, "index.js"),
    cjs: path.join(dist, "index.cjs"),
    dts: path.join(dist, "index.d.ts"),
    dcts: path.join(dist, "index.d.cts"),
  };

  const absent = Object.values(files).filter(file => !existsSync(file));
  if (absent.length > 0) {
    failures.push(
      `${target.name}: missing build output — run \`npm run build\` first:\n` +
        absent.map(file => `    ${path.relative(repoRoot, file)}`).join("\n"),
    );
    continue;
  }

  const esm = new Set(Object.keys(await import(pathToFileURL(files.esm).href)));
  const cjs = new Set(Object.keys(require(files.cjs)));
  esm.delete("default");
  cjs.delete("default");

  const declarations = [
    { label: "index.d.ts", runtimeLabel: "ESM", file: files.dts, kind: "esm", runtime: esm },
    { label: "index.d.cts", runtimeLabel: "CJS", file: files.dcts, kind: "cjs", runtime: cjs },
  ];

  for (const { label, runtimeLabel, file, kind, runtime } of declarations) {
    const unresolved = [];
    const declared = declaredValueExports(file, kind, unresolved);
    if (unresolved.length > 0) {
      failures.push(
        `${target.name}: ${label} re-exports from module(s) this check cannot resolve, so their ` +
          `exports went unverified: ${[...new Set(unresolved)].join(", ")}`,
      );
    }
    const phantom = missingFrom(declared, runtime);
    if (phantom.length > 0) {
      failures.push(
        `${target.name}: ${label} exports ${phantom.length} name(s) as runtime values that ` +
          `the ${runtimeLabel} build does not export: ${phantom.join(", ")}\n` +
          `    Fix: re-export them through a type alias (see \`Column\` in packages/grid/src/index.ts) ` +
          `or export them at runtime on purpose.`,
      );
    }
    const undeclared = missingFrom(runtime, declared);
    if (undeclared.length > 0) {
      failures.push(
        `${target.name}: the ${runtimeLabel} build exports ${undeclared.length} name(s) absent from ` +
          `${label}: ${undeclared.join(", ")}`,
      );
    }
  }

  const esmOnly = missingFrom(esm, cjs);
  const cjsOnly = missingFrom(cjs, esm);
  if (esmOnly.length > 0 || cjsOnly.length > 0) {
    failures.push(
      `${target.name}: ESM and CJS runtimes disagree — ESM-only: ${esmOnly.join(", ") || "none"}; ` +
        `CJS-only: ${cjsOnly.join(", ") || "none"}`,
    );
  }

  if (!failures.some(message => message.startsWith(`${target.name}:`))) {
    console.log(`✓ ${target.name}: ${esm.size} runtime exports match both declaration formats`);
  }
}

if (failures.length > 0) {
  console.error("\nExport parity check FAILED:\n");
  for (const failure of failures) console.error(`  ✗ ${failure}\n`);
  process.exit(1);
}

console.log("\nExport parity check passed.");
