import { defineConfig } from "vite";
import angular from "@analogjs/vite-plugin-angular";
import path from "node:path";

const gridSrc = path.resolve(__dirname, "packages/grid/src");
const ngSrc = path.resolve(__dirname, "packages/angular-grid/src");

// Angular playground dev server. Separate from vite.config.ts (the React playground) because the
// analog Angular compiler plugin must not transform the React app, and vice versa.
export default defineConfig({
  plugins: [
    angular({
      // The plugin emits empty output for .ts files outside this tsconfig's program — the
      // playground tsconfig therefore includes the aliased package sources too.
      tsconfig: path.resolve(__dirname, "apps/angular-playground/tsconfig.json"),
    }),
  ],
  root: "apps/angular-playground",
  resolve: {
    alias: {
      "@agility-workbench/grid": gridSrc,
      // The angular package's entry is public-api.ts (APF convention), not index.ts, so the
      // package-name alias must point at the file.
      "@agility-workbench/angular-grid": path.resolve(ngSrc, "public-api.ts"),
      // Internal dev alias used for the raw stylesheet import (see main.ts).
      "@grid": gridSrc,
    },
  },
  server: {
    port: 5180,
    watch: {
      usePolling: true,
      interval: 500,
      ignored: ["**/.git/**", "**/node_modules/**", "**/dist/**", "**/dist-demo/**"],
    },
  },
  build: {
    outDir: "dist-demo",
    emptyOutDir: true,
  },
});
