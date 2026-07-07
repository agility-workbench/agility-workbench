import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@grid": path.resolve(__dirname, "src"),
      "@grid-react": path.resolve(__dirname, "grid-react"),
    },
  },
  test: {
    // Unit tests live next to the source they cover (src/**/*.test.ts). The demo app under
    // test/ is a Vite app, not a test suite, so it is excluded from discovery.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
