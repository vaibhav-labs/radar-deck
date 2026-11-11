import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"], // e2e/ holds Playwright specs, not Vitest ones
  },
});
