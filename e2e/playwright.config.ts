import { defineConfig, devices } from "@playwright/test";

/**
 * Narrowly scoped browser suite for per-visitor conversation history
 * (docs/visitor-history-implementation-plan.md Phase 5, gates 9-10).
 *
 * Only behaviours jsdom cannot establish live here: real Web Locks, real
 * `storage` events between two same-origin pages, real lazy-chunk loading,
 * real inertness/focus, and real scroll geometry. Protocol and error-state
 * breadth stays in the Vitest suites.
 *
 * The deterministic server is the `apps/web` preview build: the in-memory
 * history provider for UI scenarios, and Playwright route interception of
 * `/v1/client/*` for transport scenarios.
 */

const PORT = Number(process.env.E2E_PORT ?? 4317);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./specs",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // Deterministic by construction: a retry would hide a real race regression.
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    command: `pnpm --filter web exec vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
