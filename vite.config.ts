import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const gridSrc = path.resolve(__dirname, "packages/grid/src");
const reactSrc = path.resolve(__dirname, "packages/react-grid/src");

export default defineConfig({
  plugins: [react()],
  root: "apps/playground",
  resolve: {
    alias: {
      "@agility-workbench/grid": gridSrc,
      "@agility-workbench/react-grid": reactSrc,
      // Internal dev aliases used by package source (grid internals).
      "@grid": gridSrc,
      "@react-grid": reactSrc,
    },
  },
  server: {
    port: 5176,
    watch: {
      usePolling: true,
      interval: 500,
      ignored: [
        "**/.git/**",
        "**/node_modules/**",
        "**/dist/**",
        "**/dist-demo/**"
      ]
    }
  },
  build: {
    outDir: "dist-demo",
    emptyOutDir: true
  }
});
