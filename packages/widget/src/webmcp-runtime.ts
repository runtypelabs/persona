/**
 * Subpath/chunk module for the lazy WebMCP bridge runtime
 * (`@runtypelabs/persona/webmcp-runtime` → `dist/webmcp-runtime.{js,cjs}`).
 *
 * Transport-entry only: re-exports the runtime contract from
 * `./webmcp-runtime-entry`. `client.ts` loads this on demand via
 * `webmcp-runtime-loader.ts` when `config.webmcp.enabled === true` — the IIFE
 * from a sibling URL, ESM/CJS via this external subpath.
 */
export { WebMcpBridge } from "./webmcp-runtime-entry";
export type { WebMcpBridgeDeps } from "./webmcp-runtime-entry";
