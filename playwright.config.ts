import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against a real dev server and the real Neon database — this is a
 * single-user app, so there is no fixture database to swap in. The specs are
 * written to be idempotent and to clean up the rows they create.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // shared single-user state
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: {
    command: "npm run dev -- --port 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
