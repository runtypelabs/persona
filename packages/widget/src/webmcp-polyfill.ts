/**
 * Standalone WebMCP v5 fallback chunk (`dist/webmcp-polyfill.js`).
 * Keep this fallback on v5 so upgrades do not change existing consumers'
 * browser requirements or callback-result semantics. Host-installed v6 is
 * supported separately by the bridge's dual-contract argument adapter.
 *
 * The IIFE/CDN widget bundle marks `@mcp-b/webmcp-polyfill` external so the
 * polyfill never ships to consumers who don't enable WebMCP. When
 * `config.webmcp.enabled` is true and no `document.modelContext` exists yet,
 * the bridge dynamically
 * imports this chunk from a URL derived from the widget script's own `src`
 * (see the loader registered in `index-global.ts`).
 *
 * Built self-contained (`--no-external`): it must work standalone on a CDN
 * with no module resolution. npm/bundler consumers never load this file;
 * their bundlers resolve the bare `import("@mcp-b/webmcp-polyfill")` in
 * `webmcp-bridge.ts` directly.
 */
export { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";
