/**
 * Registers the theme-editor WebMCP tools against the live editor `state`
 * singleton, so an agent's tool calls update the preview, the form controls, and
 * localStorage exactly like a human edit.
 *
 * Vanilla analog of the React `useEffect` cleanup pattern: returns an unmount
 * function that aborts the registration signal (unregistering all tools).
 */

import { createThemeEditorTools } from '@runtypelabs/persona/theme-editor';
import type { ThemeEditorLike, WebMcpTool } from '@runtypelabs/persona/theme-editor';
import { ensureModelContext } from './install';

export interface MountThemeEditorMcpOptions {
  /** Page-level tools registered alongside the theme tools (e.g. screenshot_preview). */
  extraTools?: WebMcpTool[];
}

export interface ThemeEditorMcpHandle {
  /**
   * Resolves once every tool is registered on `document.modelContext` (or
   * registration was skipped: no model context / already unmounted). Gate
   * agent mounting on this so a first dispatch never races the registration
   * and ships an empty clientTools list.
   */
  ready: Promise<void>;
  /** Abort the registration signal, unregistering all tools. */
  unmount: () => void;
}

export function mountThemeEditorMcp(
  state: ThemeEditorLike,
  options?: MountThemeEditorMcpOptions
): ThemeEditorMcpHandle {
  const controller = new AbortController();

  const ready = (async () => {
    const modelContext = await ensureModelContext();
    if (!modelContext || controller.signal.aborted) return;

    const tools = [...createThemeEditorTools(state), ...(options?.extraTools ?? [])];
    for (const tool of tools) {
      // `registerTool()` is async since `@mcp-b/webmcp-polyfill` v5 and
      // REJECTS with the abort reason when the registration signal fires
      // before it settles. Fire-and-forget turned every prompt unmount into
      // one unhandled AbortError per tool; await each and treat abort as the
      // expected unmount path.
      try {
        await modelContext.registerTool(tool, { signal: controller.signal });
      } catch (error) {
        if (controller.signal.aborted) return;
        throw error;
      }
    }
    console.info(`[persona] Registered ${tools.length} theme-editor WebMCP tools.`);
  })();

  return { ready, unmount: () => controller.abort() };
}
