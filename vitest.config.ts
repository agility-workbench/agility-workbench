import { defineConfig } from "vitest/config";
import path from "node:path";

const gridSrc = path.resolve(__dirname, "packages/grid/src");
const reactSrc = path.resolve(__dirname, "packages/react-grid/src");

export default defineConfig({
  resolve: {
    alias: {
      // Package-name specifiers used by source and demo.
      "@agility-workbench/grid": gridSrc,
      "@agility-workbench/react-grid": reactSrc,
      // Internal dev aliases: core source and co-located tests deep-import via
      // "@grid/*" (grid package internals). Resolved against the grid src tree.
      "@grid": gridSrc,
      "@react-grid": reactSrc,
    },
  },
  test: {
    // Unit tests live next to the source they cover. The demo app under
    // apps/playground/ is a Vite app, not a test suite, so it is excluded from discovery.
    include: [
      "packages/grid/src/**/*.test.{ts,tsx}",
      "packages/react-grid/src/**/*.test.{ts,tsx}",
    ],
    environment: "node",
  },
});
