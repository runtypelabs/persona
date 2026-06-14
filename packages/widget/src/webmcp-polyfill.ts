/**
 * Standalone WebMCP polyfill chunk (`dist/webmcp-polyfill.js`).
 *
 * The IIFE/CDN widget bundle marks `@mcp-b/webmcp-polyfill` external so the
 * ~35 kB (minified) polyfill + its transitive `@cfworker/json-schema` never
 * ship to consumers who don't enable WebMCP. When `config.webmcp.enabled` is
 * true and no `document.modelContext` exists yet, the bridge dynamically
 * imports this chunk from a URL derived from the widget script's own `src`
 * (see the loader registered in `index-global.ts`).
 *
 * Built self-contained (`--no-external`): it must work standalone on a CDN
 * with no module resolution. npm/bundler consumers never load this file;
 * their bundlers resolve the bare `import("@mcp-b/webmcp-polyfill")` in
 * `webmcp-bridge.ts` directly.
 */
export { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";
