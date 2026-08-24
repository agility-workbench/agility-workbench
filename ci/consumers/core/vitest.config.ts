import { defineConfig } from "vitest/config";

// A local config is required: without one, vitest walks up and loads the
// monorepo root's vite config, whose include patterns match nothing here.
export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
  },
});
