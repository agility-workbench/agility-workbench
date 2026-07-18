import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  // `clean` is handled by the build script before `generate` runs, so tsup must
  // NOT wipe dist here — otherwise it would delete the dist/index.css that
  // `generate` emits.
  clean: false,
  minify: true,
  target: "es2022",
});
