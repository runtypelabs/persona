import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * LIVE: the client-session socket against a real Runtype API. Never part of CI.
 * See `realtime-real-api.live.spec.ts` for the target variables.
 *
 *   E2E_PORT=4391 CONTROL_API_SESSION=<name> CORE_DIR=<core worktree> \
 *     ./node_modules/.bin/playwright test --config e2e/live/playwright.realtime.config.ts
 */

const PORT = Number(process.env.E2E_PORT ?? 4317);
const runId = process.env.LIVE_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, "-");

export default defineConfig({
  testDir: ".",
  testMatch: /realtime-real-api\.live\.spec\.ts$/,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 150_000,
  expect: { timeout: 30_000 },
  outputDir: path.join(__dirname, ".out/realtime", runId),
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "on", video: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1100, height: 900 } } }],
  webServer: {
    command: `pnpm --filter web exec vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
