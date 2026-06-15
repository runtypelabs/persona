/**
 * Eager markdown-parser registration for the bundled (ESM / CJS) builds.
 *
 * npm consumers bundle `marked` and `dompurify` directly anyway, so there is no
 * benefit to deferring them — and the public `markdownPostprocessor()` /
 * `createDefaultSanitizer()` API is synchronous. Importing this module for its
 * side effect registers both parsers up front so `getMarkdownParsersSync()`
 * resolves them on the first render.
 *
 * This module is intentionally NOT reachable from `index-global.ts` (the IIFE
 * entry): it statically imports `marked` + `dompurify`, so pulling it into the
 * CDN bundle would defeat the lazy `markdown-parsers.js` chunk. It is imported
 * only from `index.ts` (the npm barrel) and from unit tests that exercise the
 * synchronous parsers directly.
 */
import { Marked } from "marked";
import DOMPurify from "dompurify";
import { provideMarkdownParsers } from "./markdown-parsers-loader";

provideMarkdownParsers({ Marked, DOMPurify });
