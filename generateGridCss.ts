// Regenerate the CSS-derived modules, for the test configs to call at load time.
//
// packages/grid/src/theme/{styles,cssVars}.generated.ts are build artifacts (gitignored), derived
// from table.css by packages/grid/scripts/build-css.mjs. Tests import them directly, so a missing
// copy breaks the whole suite on a fresh clone, and a stale one fails — or silently passes —
// against CSS that no longer matches the source. Generating from the test configs keeps `vitest`
// self-contained: there is no `npm run generate` step to remember first, in CI, watch mode or an
// IDE runner. (The build and typecheck scripts run the generator themselves.)
//
// Called at config-evaluation time rather than from a vitest `globalSetup`, which runs too late
// for the Angular suite: the analog compiler plugin expands its tsconfig program from an include
// glob when the plugin initialises, so a file that appears after that is not in the program and
// gets AOT-compiled to *empty output* — GRID_STYLES silently becomes "" instead of failing to
// resolve. Generating before the config object is built keeps the file there from the start.

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const generator = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "packages/grid/scripts/build-css.mjs",
);

export function generateGridCss(): void {
  try {
    execFileSync(process.execPath, [generator], { stdio: "pipe" });
  } catch (err) {
    // Relay the generator's own diagnostics. Without them this surfaces as an unresolved import,
    // or an empty stylesheet, in every test that touches the generated modules — pointing nowhere.
    const { stdout, stderr } = err as { stdout?: Buffer; stderr?: Buffer };
    process.stderr.write(stdout?.toString() ?? "");
    process.stderr.write(stderr?.toString() ?? "");
    throw new Error("generateGridCss: CSS generation failed — see build-css output above");
  }
}
