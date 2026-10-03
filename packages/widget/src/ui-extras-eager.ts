/**
 * Eager `ui-extras` registration for the bundled (ESM / CJS) builds and tests,
 * so the features behind it respond synchronously. Like
 * `markdown-parsers-eager.ts`, this module must NOT be reachable from
 * `index-global.ts`: the IIFE/CDN build fetches the `ui-extras.js` chunk.
 */
import * as uiExtras from "./ui-extras-entry";
import { provideUiExtras } from "./ui-extras-loader";

provideUiExtras(uiExtras);
