import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: true,
  target: "es2022",
  // The core is a separate published package, and React is provided by the host
  // app — none of these are bundled into the React binding.
  external: ["react", "react-dom", "react/jsx-runtime", "@agility-workbench/grid"],
});
