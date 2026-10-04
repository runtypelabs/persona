/**
 * Eager history-shell registration for tests. Test-only since the npm entry stopped registering it: `vitest.setup.ts`
 * imports it so renders stay synchronous. Like `client-stream-eager.ts`,
 * this module must NOT be reachable from `index-global.ts`: the IIFE/CDN build
 * fetches the `history-shell.js` chunk only when history is used.
 */
import * as historyShell from "./history-shell";
import { provideHistoryShell } from "./history-shell-loader";

provideHistoryShell(historyShell);
