import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * LIVE harness: real Chromium with a WAV file as its microphone, against a real
 * GPT-Live session. Never part of CI (`e2e/playwright.config.ts` only runs
 * `e2e/specs`). See e2e/live/README.md for prerequisites.
 *
 *   ./node_modules/.bin/playwright test --config e2e/live/playwright.live.config.ts
 */

const PORT = Number(process.env.E2E_PORT ?? 4317);
// One directory per invocation, so repeated runs keep every run's artifacts.
const runId = process.env.LIVE_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, "-");
const wav = path.resolve(process.env.LIVE_WAV ?? path.join(__dirname, ".out/question.wav"));

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.live\.spec\.ts$/,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 120_000,
  expect: { timeout: 30_000 },
  outputDir: path.join(__dirname, ".out/results", runId),
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on",
    video: "off",
    permissions: ["microphone"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        // %noloop: play the question once, then silence.
        `--use-file-for-fake-audio-capture=${wav}%noloop`,
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1100, height: 900 } } }],
  webServer: {
    command: `pnpm --filter web exec vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
