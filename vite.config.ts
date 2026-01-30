import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  root: "test",
  resolve: {
    alias: {
      "@grid": path.resolve(__dirname, "src"),
      "@grid-react": path.resolve(__dirname, "grid-react")
    }
  },
  server: { port: 5173 },
  build: {
    outDir: "dist-demo",
    emptyOutDir: true
  }
});
