/**
 * Eager history-REST registration for the bundled (ESM / CJS) builds and
 * tests. Like `markdown-parsers-eager.ts`, this module must NOT be reachable
 * from `index-global.ts`: the IIFE/CDN build fetches `client-history.js`.
 */
import * as clientHistory from "./client-history";
import { provideClientHistory } from "./client-history-loader";

provideClientHistory(clientHistory);
