/**
 * Eager history-REST registration for tests. Test-only since the npm entry stopped registering it: `vitest.setup.ts`
 * imports it so renders stay synchronous. Like `markdown-parsers-eager.ts`, this module must NOT be reachable
 * from `index-global.ts`: the IIFE/CDN build fetches `client-history.js`.
 */
import * as clientHistory from "./client-history";
import { provideClientHistory } from "./client-history-loader";

provideClientHistory(clientHistory);
