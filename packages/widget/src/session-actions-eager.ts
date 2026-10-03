/**
 * Eager registration of the session resolve paths for the bundled (ESM / CJS)
 * builds and tests, so approvals and local-tool resumes never take the async
 * chunk hop there. Like `client-stream-eager.ts`, this module must NOT be
 * reachable from `index-global.ts`: the IIFE/CDN build fetches the
 * `session-actions.js` chunk.
 */
import * as sessionActions from "./session-actions";
import { provideSessionActions } from "./session-actions-loader";

provideSessionActions(sessionActions);
