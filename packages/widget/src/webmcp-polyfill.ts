/**
 * Standalone WebMCP fallback chunk (`dist/webmcp-polyfill.js`): the upstream
 * WebMCP polyfill as distributed by `@mcp-b/webmcp-polyfill` v6. Host pages
 * that install an older runtime themselves (v3-v5, or a JSON-string facade)
 * keep working through the bridge's dual-contract argument adapter; this file
 * only matters when the page has no `document.modelContext` at all.
 *
 * The IIFE/CDN widget bundle marks `@mcp-b/webmcp-polyfill` external so the
 * polyfill never ships to consumers who don't enable WebMCP. When
 * `config.webmcp.enabled` is true and no `document.modelContext` exists yet,
 * the bridge dynamically imports this chunk from a URL derived from the widget
 * script's own `src` (see the loader registered in `index-global.ts`).
 *
 * Built self-contained (`--no-external`): it must work standalone on a CDN
 * with no module resolution. npm/bundler consumers never load this file;
 * their bundlers resolve the bare `import("@mcp-b/webmcp-polyfill")` in
 * `webmcp-bridge.ts` directly.
 */
import { installWebMCP } from "@mcp-b/webmcp-polyfill";

export { installWebMCP };

/**
 * @deprecated v5's initializer name, kept so pages that import it from this
 * chunk (e.g. to install before Persona's first dispatch) still link. It is
 * an alias of `installWebMCP()`; v6 has no cleanup counterpart.
 */
export const initializeWebMCPPolyfill = (): void => installWebMCP();
