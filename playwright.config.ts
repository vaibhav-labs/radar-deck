import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 20_000,
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 390, height: 844 }, // iPhone-ish width, per the 360px-minimum design target
    serviceWorkers: "allow", // the offline-reload test needs the real SW controlling the page
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
