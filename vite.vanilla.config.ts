import { defineConfig } from "vite";
import path from "node:path";

const gridSrc = path.resolve(__dirname, "packages/grid/src");

// Framework-free playground. Separate from vite.config.ts (React) and vite.angular.config.ts so no
// framework plugin ever touches this app: it is plain TypeScript + DOM against the core package.
export default defineConfig({
  root: "apps/vanilla-playground",
  resolve: {
    alias: {
      "@agility-workbench/grid": gridSrc,
      // Internal dev alias used by package source (grid internals) and the raw stylesheet import.
      "@grid": gridSrc,
    },
  },
  server: {
    port: 5182,
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
