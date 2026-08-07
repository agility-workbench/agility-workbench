import { defineConfig } from "vitest/config";
import angular from "@analogjs/vite-plugin-angular";
import path from "node:path";
import { generateGridCss } from "../../generateGridCss";

// These tests resolve the core against its source, including its gitignored CSS-derived modules.
// Must happen before the analog plugin below initialises — see generateGridCss.ts for why.
generateGridCss();

const gridSrc = path.resolve(__dirname, "../grid/src");

// Angular tests need the analog compiler plugin (components in test files are AOT-compiled at
// build time), so they run as their own vitest config instead of joining the root suite's include
// list. Invoked from the repo root via `npm run test:angular`.
export default defineConfig({
  plugins: [
    angular({
      tsconfig: path.resolve(__dirname, "tsconfig.spec.json"),
    }),
  ],
  resolve: {
    // Same dev-loop convenience as the root config: tests resolve the core against its source.
    alias: {
      "@agility-workbench/grid": gridSrc,
      "@grid": gridSrc,
    },
  },
  test: {
    root: __dirname,
    include: ["src/**/*.{test,spec}.ts"],
    environment: "happy-dom",
    setupFiles: ["src/test-setup.ts"],
  },
});
