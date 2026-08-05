import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reactPkgDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(reactPkgDir, "..", "..");

describe("@agility-workbench/grid package resolution (regression guard)", () => {
  it("react-grid tsconfig has NO alias to grid source or dist declarations", () => {
    // Scan the raw text: this tsconfig carries comments (JSONC), and the point of
    // the guard is that the brittle alias never reappears in ANY form — including a
    // commented-out example someone might later uncomment.
    const raw = readFileSync(path.join(reactPkgDir, "tsconfig.json"), "utf8");

    // Strip comments so the assertions below reflect ACTIVE config, but keep `raw`
    // for the "no such string anywhere" belt-and-braces check.
    const active = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");

    // The exact brittle alias we removed, and any equivalent into grid src/dist.
    const forbidden = /["']@agility-workbench\/grid["']\s*:\s*\[[^\]]*\.\.\/grid\/(dist|src)/;
    expect(
      forbidden.test(active),
      "react-grid/tsconfig.json must not alias @agility-workbench/grid into ../grid/dist or ../grid/src",
    ).toBe(false);

    // Stronger: the grid package must not be aliased at all in active config — it is
    // resolved as a normal workspace dependency through its package.json.
    const anyGridPathKey = /["']@agility-workbench\/grid(\/\*)?["']\s*:/;
    const compilerPaths = active.match(/"paths"\s*:\s*\{[\s\S]*?\}/);
    if (compilerPaths) {
      expect(
        anyGridPathKey.test(compilerPaths[0]),
        "react-grid/tsconfig.json must not declare a compilerOptions.paths entry for @agility-workbench/grid",
      ).toBe(false);
    }
  });

  it("react-grid declares grid as a real registry semver dependency", () => {
    const pkg = JSON.parse(readFileSync(path.join(reactPkgDir, "package.json"), "utf8"));
    const dep: string | undefined = pkg.dependencies?.["@agility-workbench/grid"];
    expect(dep, "react-grid must depend on @agility-workbench/grid").toBeTruthy();
    // A publishable registry range — not a file:/link:/workspace: specifier (npm
    // workspaces links the local package automatically for a plain semver range).
    expect(dep).toMatch(/^[\^~]?\d+\.\d+\.\d+/);
    expect(dep).not.toMatch(/^(file:|link:|workspace:|portal:)/);
  });

  it("grid resolves as an installed workspace package via its manifest, not a file alias", () => {
    // node's resolver walks node_modules; the workspace symlink puts the real
    // package.json there. If this throws, the workspace link is broken.
    const require = createRequire(path.join(repoRoot, "package.json"));
    const manifestPath = require.resolve("@agility-workbench/grid/package.json");
    const gridPkg = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(gridPkg.name).toBe("@agility-workbench/grid");

    // The types/exports a consumer resolves must be declaration files, not source.
    expect(gridPkg.types).toMatch(/\.d\.ts$/);
    expect(gridPkg.exports?.["."]?.import?.types).toMatch(/\.d\.ts$/);
    expect(gridPkg.exports?.["."]?.require?.types).toMatch(/\.d\.cts$/);
    expect(gridPkg.exports?.["./styles.css"]).toBeTruthy();
  });
});
