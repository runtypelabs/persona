import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * Standalone runner for the built-dist install-method spec
 * (`specs/23-dist-install-methods.spec.ts`). That spec serves
 * `packages/widget/dist` through route interception on a fake origin, so it
 * needs no showcase build or web server:
 *
 *   pnpm build:widget
 *   pnpm exec playwright test --config e2e/playwright.dist.config.ts
 *
 * The spec also runs as part of the main e2e config.
 */
export default defineConfig({
  ...base,
  testMatch: /23-dist-install-methods\.spec\.ts$/,
  webServer: undefined,
});
