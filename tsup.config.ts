import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["grid-react/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: true,
  target: "es2022",
  external: ["react", "react-dom"]
});
