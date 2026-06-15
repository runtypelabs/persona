/**
 * Global test setup.
 *
 * Registers `marked` + `dompurify` synchronously so widget renders and the
 * synchronous markdown/sanitize helpers behave like the bundled npm build,
 * where `index.ts` imports `markdown-parsers-eager`. Without this, tests would
 * exercise the IIFE/CDN lazy-load fallback (async chunk import), and the first
 * synchronous render would escape markdown to plain text.
 */
import "./src/markdown-parsers-eager";
