import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  root: "src",
  resolve: {
    alias: {
      "@grid": path.resolve(__dirname, "lib")
    }
  },
  server: { port: 5173 },
  build: {
    outDir: "dist-demo",
    emptyOutDir: true
  }
});
