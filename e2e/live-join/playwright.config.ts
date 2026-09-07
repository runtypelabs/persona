import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
const port = Number(process.env.PERSONA_JOIN_PORT || 4318);
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1100, height: 900 },
  },
  webServer: {
    cwd: resolve(__dirname, "../.."),
    command: "node e2e/live-join/server.mjs",
    url: `http://127.0.0.1:${port}`,
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
