/**
 * Eager history-shell registration for the bundled (ESM / CJS) builds.
 *
 * npm consumers bundle `history-shell.ts` anyway, so providing it up front
 * keeps history setup synchronous at mount. Like `client-stream-eager.ts`,
 * this module must NOT be reachable from `index-global.ts`: the IIFE/CDN build
 * fetches the `history-shell.js` chunk only when history is used.
 */
import * as historyShell from "./history-shell";
import { provideHistoryShell } from "./history-shell-loader";

provideHistoryShell(historyShell);
