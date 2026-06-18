/**
 * Client-side helper that guarantees a usable `document.modelContext` before we
 * register the theme-editor WebMCP tools.
 *
 * Backed by `@mcp-b/webmcp-polyfill`. `initializeWebMCPPolyfill()` is idempotent
 * and preserves a native `document.modelContext` when the browser ships one, so
 * this is a no-op on supporting browsers. Never throws.
 */

import type { WebMcpTool } from '@runtypelabs/persona/theme-editor';

export interface RegisterToolOptions {
  signal?: AbortSignal;
}

export interface ModelContext {
  registerTool(tool: WebMcpTool, options?: RegisterToolOptions): unknown;
}

/**
 * Returns a `ModelContext` to register tools on, or `null` when WebMCP cannot be
 * used in the current environment (SSR or a polyfill load failure).
 */
export async function ensureModelContext(): Promise<ModelContext | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  try {
    const { initializeWebMCPPolyfill } = await import('@mcp-b/webmcp-polyfill');
    initializeWebMCPPolyfill();
    // Read through `unknown` so our local `ModelContext` shape is the contract,
    // decoupled from the polyfill's published types.
    const doc = document as unknown as { modelContext?: ModelContext };
    const nav = navigator as unknown as { modelContext?: ModelContext };
    return doc.modelContext ?? nav.modelContext ?? null;
  } catch (error) {
    console.warn('[persona] WebMCP polyfill unavailable; theme tools not registered.', error);
    return null;
  }
}
