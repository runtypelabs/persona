import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * Standalone runner for install methods and activity-panel CSS specs.
 * Install methods serve `packages/widget/dist` through route interception on
 * a fake origin; activity panels inject the source stylesheet into a fixture.
 * Neither needs a showcase build or web server:
 *
 *   pnpm build:widget
 *   pnpm exec playwright test --config e2e/playwright.dist.config.ts
 *
 * Both specs also run as part of the main e2e config.
 */
export default defineConfig({
  ...base,
  testMatch: /(?:23-dist-install-methods|24-activity-panels)\.spec\.ts$/,
  webServer: undefined,
});
