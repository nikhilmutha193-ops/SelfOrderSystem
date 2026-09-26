import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/globalSetup.ts"],
    setupFiles: ["tests/setup.ts"],
    pool: "forks",
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
