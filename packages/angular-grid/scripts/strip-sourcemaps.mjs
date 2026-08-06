// Post-build cleanup for the published Angular package.
//
// ng-packagr always emits a sourcemap for the FESM bundle, and there is no
// ng-package.json / tsconfig switch to turn it off (tsconfig `sourceMap` only
// governs the intermediate tsc output). That map inlines `sourcesContent`, so
// leaving it in place would publish the wrapper's TypeScript source inside the
// tarball. Declaration maps are disabled in tsconfig.lib.json for the same
// reason; neither affects IDE tooltips or autocomplete, which come from
// index.d.ts and its JSDoc.
//
// This removes every .map under dist/ and drops the now-dangling
// `//# sourceMappingURL=` reference, which would otherwise make consumers'
// bundlers warn about a missing file.

import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(distDir);
let removed = 0;
let stripped = 0;

for (const file of files) {
  if (file.endsWith(".map")) {
    rmSync(file);
    removed++;
  }
}

for (const file of files) {
  if (file.endsWith(".map")) continue;
  const text = readFileSync(file, "utf8");
  // Match the trailing annotation in both comment styles, with or without a
  // final newline.
  const cleaned = text.replace(/\n?(?:\/\/|\/\*)[#@] sourceMappingURL=[^\n*]*(?:\*\/)?[ \t]*(?=\n|$)/g, "");
  if (cleaned !== text) {
    writeFileSync(file, cleaned);
    stripped++;
  }
}

console.log(`strip-sourcemaps: removed ${removed} map file(s), cleaned ${stripped} reference(s).`);
