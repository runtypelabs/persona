/**
 * Eager stream-processor registration for the bundled (ESM / CJS) builds.
 *
 * npm consumers bundle `client-stream.ts` anyway, so providing it up front
 * keeps streaming free of the async chunk hop. Like
 * `markdown-parsers-eager.ts`, this module must NOT be reachable from
 * `index-global.ts`: the IIFE/CDN build fetches the `client-stream.js` chunk.
 */
import * as clientStream from "./client-stream";
import { provideClientStream } from "./client-stream-loader";

provideClientStream(clientStream);
