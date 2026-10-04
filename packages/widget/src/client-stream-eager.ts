/**
 * Eager stream-processor registration for tests. Test-only since the npm entry stopped registering it: `vitest.setup.ts`
 * imports it so renders stay synchronous. Like
 * `markdown-parsers-eager.ts`, this module must NOT be reachable from
 * `index-global.ts`: the IIFE/CDN build fetches the `client-stream.js` chunk.
 */
import * as clientStream from "./client-stream";
import { provideClientStream } from "./client-stream-loader";

provideClientStream(clientStream);
