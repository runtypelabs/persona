/**
 * Standalone WebMCP fallback chunk (`dist/webmcp-polyfill.js`): the official
 * WebMCP polyfill, `@w3c/webmcp-polyfill`. Host pages that install an older
 * runtime themselves (`@mcp-b/webmcp-polyfill` v3-v6, or a JSON-string facade)
 * keep working through the bridge's dual-contract argument adapter; this file
 * only matters when the page has no `document.modelContext` at all.
 *
 * The IIFE/CDN widget bundle marks `@w3c/webmcp-polyfill` external so the
 * polyfill never ships to consumers who don't enable WebMCP. When
 * `config.webmcp.enabled` is true and no `document.modelContext` exists yet,
 * the bridge dynamically imports this chunk from a URL derived from the widget
 * script's own `src` (see the loader registered in `index-global.ts`).
 *
 * Built self-contained (`--no-external`): it must work standalone on a CDN
 * with no module resolution. npm/bundler consumers never load this file;
 * their bundlers resolve the bare `import("@w3c/webmcp-polyfill")` in
 * `webmcp-bridge.ts` directly.
 *
 * The bundled polyfill is Apache-2.0 (see `LICENSE.webmcp-polyfill` in the
 * package root); the rest of Persona is MIT.
 */
import { installWebMCP as installUpstreamWebMCP } from "@w3c/webmcp-polyfill";
import { hasWebMcpPolyfillBaseline } from "./webmcp-polyfill-baseline";

// Keep the chunk's declarations local: upstream's declaration file re-exports
// a namespace that webmcp-types declares globally rather than as a module
// export. Forwarding the function directly makes declaration bundlers follow
// that edge.
/**
 * Install `document.modelContext`. Does nothing when a context already
 * exists, on an insecure page, or on an engine without the APIs the polyfill
 * needs (Chrome/Firefox 126+, Safari 18+).
 */
export function installWebMCP(): void {
  if (!hasWebMcpPolyfillBaseline()) return;
  installUpstreamWebMCP();
}

/**
 * @deprecated The `@mcp-b/webmcp-polyfill` v5 initializer name, kept so pages
 * that import it from this chunk (e.g. to install before Persona's first
 * dispatch) still link. It is an alias of `installWebMCP()`; the official
 * polyfill has no cleanup counterpart.
 */
export const initializeWebMCPPolyfill = (): void => installWebMCP();
