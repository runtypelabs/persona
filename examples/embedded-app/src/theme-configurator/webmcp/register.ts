/**
 * Registers the theme-editor WebMCP tools against the live editor `state`
 * singleton, so an agent's tool calls update the preview, the form controls, and
 * localStorage exactly like a human edit.
 *
 * Vanilla analog of the React `useEffect` cleanup pattern: returns an unmount
 * function that aborts the registration signal (unregistering all tools).
 */

import { createThemeEditorTools } from '@runtypelabs/persona/theme-editor';
import type { ThemeEditorLike } from '@runtypelabs/persona/theme-editor';
import { ensureModelContext } from './install';

export function mountThemeEditorMcp(state: ThemeEditorLike): () => void {
  const controller = new AbortController();

  void (async () => {
    const modelContext = await ensureModelContext();
    if (!modelContext || controller.signal.aborted) return;

    const tools = createThemeEditorTools(state);
    for (const tool of tools) {
      modelContext.registerTool(tool, { signal: controller.signal });
    }
    console.info(`[persona] Registered ${tools.length} theme-editor WebMCP tools.`);
  })();

  return () => controller.abort();
}
