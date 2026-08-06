import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const directory = path.dirname(fileURLToPath(import.meta.url));
const angularPackageDirectory = path.resolve(directory, "..");
const repositoryRoot = path.resolve(angularPackageDirectory, "..", "..");

describe("@agility-workbench/angular-grid package resolution", () => {
  it("does not alias the core package to source or build output", () => {
    const raw = readFileSync(path.join(angularPackageDirectory, "tsconfig.lib.json"), "utf8");
    const active = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n");
    const compilerPaths = active.match(/"paths"\s*:\s*\{[\s\S]*?\}/);
    expect(compilerPaths?.[0] ?? "").not.toMatch(
      /["']@agility-workbench\/grid(\/\*)?["']\s*:/,
    );
    expect(active).not.toMatch(
      /["']@agility-workbench\/grid["']\s*:\s*\[[^\]]*\.\.\/grid\/(dist|src)/,
    );
  });

  it("declares the core package as a publishable semver dependency", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(angularPackageDirectory, "package.json"), "utf8"),
    );
    const dependency: string | undefined = manifest.dependencies?.["@agility-workbench/grid"];
    expect(dependency).toMatch(/^[\^~]?\d+\.\d+\.\d+/);
    expect(dependency).not.toMatch(/^(file:|link:|workspace:|portal:)/);
  });

  it("resolves the core through its published manifest and declaration exports", () => {
    const require = createRequire(path.join(repositoryRoot, "package.json"));
    const manifestPath = require.resolve("@agility-workbench/grid/package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    expect(manifest.name).toBe("@agility-workbench/grid");
    expect(manifest.types).toMatch(/\.d\.ts$/);
    expect(manifest.exports?.["."]?.import?.types).toMatch(/\.d\.ts$/);
    expect(manifest.exports?.["."]?.require?.types).toMatch(/\.d\.cts$/);
    expect(manifest.exports?.["./styles.css"]).toBeTruthy();
  });
});
