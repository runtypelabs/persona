/**
 * `screenshot_preview`: example-local WebMCP tool that captures the rendered
 * theme preview and returns it to the agent as MCP image content blocks.
 *
 * Lives in the example (not the widget package's tool factory) on purpose: the
 * factory is headless and DOM-free, while this tool needs the live preview
 * manager and the `modern-screenshot` dependency. It closes the visual loop
 * for the Theme Copilot: apply theme tools, screenshot, compare against the
 * user's reference image, refine.
 */

import type { WebMcpTool, ToolContent } from '@runtypelabs/persona/theme-editor';
import type { PreviewManager } from '../preview-manager';

export function createScreenshotPreviewTool(
  getPreviewManager: () => PreviewManager | null
): WebMcpTool {
  return {
    name: 'screenshot_preview',
    title: 'Screenshot the preview',
    description:
      'Capture the current rendered state of the theme preview as an image: exactly what the user sees. ' +
      'Returns one JPEG per visible preview frame (two when a compare mode is active, labeled e.g. Light/Dark). ' +
      'Call after applying a batch of theme changes to verify the visual result, especially when matching a reference image.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    async execute() {
      const previewManager = getPreviewManager();
      if (!previewManager) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: 'Preview is not mounted; nothing to capture.' }],
        };
      }

      const frames = await previewManager.capturePreview();
      if (frames.length === 0) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: 'No preview frames available to capture.' }],
        };
      }

      // Built by hand rather than via the `toolResult()` helper: that helper
      // mirrors the payload into `structuredContent`, which would double
      // ~100KB of base64 in the /resume round-trip.
      const content: ToolContent[] = [
        {
          type: 'text',
          text: `Captured ${frames.map((f) => `${f.label} (${f.width}x${f.height})`).join(', ')}.`,
        },
        ...frames.map((f) => ({
          type: 'image' as const,
          data: f.dataUrl.slice(f.dataUrl.indexOf(',') + 1),
          mimeType: 'image/jpeg',
        })),
      ];
      return { content };
    },
  };
}
