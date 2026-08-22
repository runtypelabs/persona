/**
 * Global test setup.
 *
 * Registers `marked` + `dompurify` synchronously so widget renders and the
 * synchronous markdown/sanitize helpers behave like the bundled npm build,
 * where `index.ts` imports `markdown-parsers-eager`. Without this, tests would
 * exercise the IIFE/CDN lazy-load fallback (async chunk import), and the first
 * synchronous render would escape markdown to plain text.
 */
import { afterEach } from "vitest";
import { resetTooltipTiming } from "./src/utils/tooltip";
import "./src/markdown-parsers-eager";

// Isolated attachTooltip tests should not wait on the product 200ms default.
// Widget mounts re-apply `config.tooltip` (200 / 300) on create/update.
const silenceTooltipDelay = (): void => {
  resetTooltipTiming({ delayMs: 0, skipDelayMs: 0 });
};
silenceTooltipDelay();
afterEach(silenceTooltipDelay);
