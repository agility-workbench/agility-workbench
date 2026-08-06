import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  // No sourcemaps in the published build. esbuild inlines `sourcesContent`, so a
  // map ships the entire TypeScript source inside the tarball — and `files` does
  // not publish src/, so a map without it would only yield unresolvable paths.
  // Local development never reads these: both playgrounds alias
  // @agility-workbench/grid to packages/grid/src (see vite*.config.ts).
  sourcemap: false,
  // `clean` is handled by the build script before `generate` runs, so tsup must
  // NOT wipe dist here — otherwise it would delete the dist/index.css that
  // `generate` emits.
  clean: false,
  minify: true,
  target: "es2022",
});
