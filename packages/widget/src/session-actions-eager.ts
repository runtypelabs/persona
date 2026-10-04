/**
 * Eager registration of the session resolve paths for tests, so approvals and
 * local-tool resumes never take the async chunk hop there. Test-only since the npm entry stopped registering it: `vitest.setup.ts`
 * imports it so renders stay synchronous. Like `client-stream-eager.ts`, this module must NOT be
 * reachable from `index-global.ts`: the IIFE/CDN build fetches the
 * `session-actions.js` chunk.
 */
import * as sessionActions from "./session-actions";
import { provideSessionActions } from "./session-actions-loader";

provideSessionActions(sessionActions);
