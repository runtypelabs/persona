/**
 * Theme Copilot — the docked sidebar agent that styles the theme preview.
 *
 * The copilot is a second, independent Persona widget on the editor page (the
 * preview widgets inside the iframes stay a passive showcase). It dispatches to
 * the theme-assistant flow, discovers the editor's WebMCP theme tools from the
 * parent page's `document.modelContext`, and restyles the preview live while
 * its own panel keeps Persona defaults — theming is per-mount, so the user
 * watches the preview change, not the copilot.
 *
 * Multi-modal loop: attachments are enabled so the user can paste a screenshot
 * of another site's chat widget; the agent extracts a style spec, applies it
 * via theme tools, then calls the page-level `screenshot_preview` tool to see
 * the rendered result and refine.
 */

import {
  DEFAULT_WIDGET_CONFIG,
  initAgentWidget,
  createLocalStorageAdapter,
  markdownPostprocessor,
} from '@runtypelabs/persona';
import type {
  AgentWidgetConfig,
  AgentWidgetInitHandle,
  WebMcpConfirmInfo,
} from '@runtypelabs/persona';

const MB = 1024 * 1024;

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl = import.meta.env.VITE_PROXY_URL
  ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-theme`
  : `http://localhost:${proxyPort}/api/chat/dispatch-theme`;

// Two wiring modes, same as the WebMCP demo:
//   1. Client-token mode — set VITE_PERSONA_CLIENT_TOKEN (+ VITE_PERSONA_API_URL,
//      the API base) to dispatch straight to a Runtype surface/agent whose prompt
//      is the theme copilot. This is the path proven to round-trip webmcp tools.
//   2. Proxy mode (default fallback) — dispatch to the local theme-assistant flow.
const clientToken = import.meta.env.VITE_PERSONA_CLIENT_TOKEN as string | undefined;
const clientApiBase = import.meta.env.VITE_PERSONA_API_URL as string | undefined;
const connectionConfig: Pick<AgentWidgetConfig, 'apiUrl' | 'clientToken'> = clientToken
  ? { clientToken, ...(clientApiBase ? { apiUrl: clientApiBase } : {}) }
  : { apiUrl: proxyUrl };

// The editor registers its controls as WebMCP tools on the parent page's
// `document.modelContext` (theme-configurator/webmcp/register.ts), which is
// exactly where the copilot's bridge looks — no cross-frame transport needed.
// Every tool is a safe, local, undoable edit to the preview (and
// screenshot_preview is a pure read), so all are auto-approved for a
// frictionless "chat to restyle" loop instead of a confirm per color change.
const AUTO_APPROVED_TOOLS = new Set([
  'get_theme_overview',
  'set_brand_colors',
  'assign_color_role',
  'set_typography',
  'set_roundness',
  'set_color_scheme',
  'apply_preset',
  'configure_widget',
  'set_copy_and_suggestions',
  'set_theme_fields',
  'check_contrast',
  'manage_session',
  'screenshot_preview',
]);

export function initThemeCopilot(): AgentWidgetInitHandle | null {
  const target = document.getElementById('theme-copilot-dock-target');
  if (!target) {
    console.warn('[theme-editor] Theme Copilot dock target not found.');
    return null;
  }

  const widget = initAgentWidget({
    target,
    useShadowDom: false,
    config: {
      ...DEFAULT_WIDGET_CONFIG,
      ...connectionConfig,
      storageAdapter: createLocalStorageAdapter('persona-state-theme-copilot'),
      postprocessMessage: ({ text }) => markdownPostprocessor(text),
      colorScheme: 'light',
      copy: {
        ...DEFAULT_WIDGET_CONFIG.copy,
        welcomeTitle: 'Theme Copilot',
        welcomeSubtitle:
          'Describe a look — or paste a screenshot of a chat widget you like — and I will restyle the preview to match.',
        inputPlaceholder: 'e.g. "Deep teal, rounded corners, friendly tone"',
      },
      suggestionChips: [
        'Make it feel like a banking app',
        'Warm, rounded, and friendly',
        'Switch the preview to dark mode',
        'Check the contrast ratios',
      ],
      // Image paste/upload for the reference-matching loop.
      attachments: {
        enabled: true,
        allowedTypes: ['image/png', 'image/jpeg', 'image/webp'],
        maxFiles: 1,
        maxFileSize: 5 * MB,
      },
      launcher: {
        ...DEFAULT_WIDGET_CONFIG.launcher,
        mountMode: 'docked',
        dock: {
          side: 'right',
          width: '440px',
          reveal: 'emerge',
          animate: true,
        },
        autoExpand: false,
        fullHeight: true,
        mobileBreakpoint: 1024,
        title: 'Theme Copilot',
        subtitle: 'Styles the live preview',
      },
      webmcp: {
        enabled: true,
        autoApprove: (info: WebMcpConfirmInfo) => AUTO_APPROVED_TOOLS.has(info.toolName),
      },
      approval: {
        ...DEFAULT_WIDGET_CONFIG.approval,
        title: 'Run theme tool?',
        approveLabel: 'Run tool',
        denyLabel: 'Cancel',
        detailsDisplay: 'collapsed',
      },
      statusIndicator: {
        ...DEFAULT_WIDGET_CONFIG.statusIndicator,
        visible: true,
        idleText: 'Copilot edits the preview — undo anytime (or ask it to undo).',
        connectedText: 'Copilot edits the preview — undo anytime (or ask it to undo).',
        connectingText: 'Connecting Theme Copilot…',
        errorText: 'Theme Copilot connection error',
      },
    },
  });

  const toggle = document.getElementById('theme-copilot-toggle');
  const syncToggle = () => {
    const open = widget.getState().open;
    toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle?.classList.toggle('active', open);
  };
  toggle?.addEventListener('click', () => {
    widget.toggle();
    window.setTimeout(syncToggle, 80);
  });
  widget.on('widget:opened', syncToggle);
  widget.on('widget:closed', syncToggle);
  syncToggle();

  return widget;
}
