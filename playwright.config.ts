import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5186",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      command: "pnpm exec tsx scripts/test-server.ts",
      url: "http://127.0.0.1:4310/health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "pnpm --filter @two-hands/web dev --port 5186",
      url: "http://127.0.0.1:5186",
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
