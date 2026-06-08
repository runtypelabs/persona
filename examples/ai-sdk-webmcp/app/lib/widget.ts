// Persona widget configuration for the Switchback storefront, pointed at the
// local AI-SDK shim instead of Runtype.
//
// Proxy mode: `apiUrl` is the full dispatch URL and resume is POSTed to
// `${apiUrl}/resume`. We point both at this app's own API routes
// (app/api/chat/dispatch/route.ts + .../resume/route.ts), which speak Runtype's
// proxy wire protocol on top of the Vercel AI SDK. No clientToken, no Runtype.

import {
  DEFAULT_WIDGET_CONFIG,
  markdownPostprocessor,
  type AgentWidgetConfig,
  type WebMcpConfirmInfo,
} from "@runtypelabs/persona";
import { logWire, esc } from "./store";
import { READ_ONLY_TOOLS } from "./webmcp-tools";

// --- Switchback brand theme (ported from the embedded-app demo; mirrors
//     globals.css). Warm artisan palette: espresso primary + caramel accent on
//     cream; both follow the OS light/dark preference via colorScheme:'auto'. ---
const shopTheme: NonNullable<AgentWidgetConfig["theme"]> = {
  palette: {
    colors: {
      primary: { 500: "#1c1917", 600: "#292524", 700: "#44403c" },
      accent: { 500: "#b8814b", 600: "#8a5a2b" },
      gray: {
        50: "#ffffff",
        100: "#f6f4f0",
        200: "#e7e5e4",
        500: "#78716c",
        900: "#1c1917",
      },
    },
    radius: { md: "0.5rem", lg: "0.75rem", xl: "1rem" },
  },
  semantic: {
    colors: {
      primary: "#1c1917",
      accent: "#b8814b",
      surface: "#ffffff",
      background: "#ffffff",
      container: "#f6f4f0",
      text: "#1c1917",
      textMuted: "#78716c",
      border: "#e7e5e4",
      divider: "#e7e5e4",
      interactive: {
        default: "#1c1917",
        hover: "#292524",
        focus: "#44403c",
        active: "#0c0a09",
      },
      feedback: { info: "#1c1917" },
    },
  },
  components: {
    panel: { borderRadius: "0" },
    header: {
      borderRadius: "0",
      background: "#1c1917",
      titleForeground: "#fafaf9",
      subtitleForeground: "#d6d3d1",
      iconBackground: "#b8814b",
      iconForeground: "#1c1917",
      actionIconForeground: "#e7e5e4",
    },
  },
};

const shopDarkTheme: NonNullable<AgentWidgetConfig["darkTheme"]> = {
  palette: {
    colors: {
      primary: { 500: "#d4a574", 600: "#e0b787", 700: "#ecd3b0" },
      accent: { 500: "#d4a574", 600: "#e0b787" },
      gray: {
        50: "#f5f5f4",
        100: "#292524",
        200: "#44403c",
        500: "#a8a29e",
        900: "#1c1917",
        950: "#141110",
      },
    },
  },
  semantic: {
    colors: {
      primary: "#d4a574",
      accent: "#d4a574",
      surface: "#292524",
      background: "#1c1917",
      container: "#2c2724",
      text: "#f5f5f4",
      textMuted: "#a8a29e",
      textInverse: "#1c1917",
      border: "#44403c",
      divider: "#44403c",
      interactive: {
        default: "#d4a574",
        hover: "#e0b787",
        focus: "#ecd3b0",
        active: "#f0e0c8",
        disabled: "#57534e",
      },
      feedback: { info: "#d4a574" },
    },
  },
  components: {
    panel: { borderRadius: "0" },
    header: {
      borderRadius: "0",
      background: "#292524",
      titleForeground: "#f5f5f4",
      subtitleForeground: "#a8a29e",
      iconBackground: "#d4a574",
      iconForeground: "#1c1917",
      actionIconForeground: "#d6d3d1",
    },
    message: {
      assistant: { background: "#292524", text: "#f5f5f4", border: "#3a3530" },
    },
    input: { background: "#2c2724", placeholder: "#a8a29e" },
    collapsibleWidget: {
      container: "#292524",
      surface: "#141110",
      border: "#3a3530",
    },
    markdown: {
      inlineCode: { background: "#44403c", foreground: "#f5f5f4" },
    },
  },
};

export function buildWidgetConfig(): AgentWidgetConfig {
  return {
    ...DEFAULT_WIDGET_CONFIG,
    // Proxy mode → our own Next.js route. resume hits `${apiUrl}/resume`.
    apiUrl: "/api/chat/dispatch",
    features: {
      ...DEFAULT_WIDGET_CONFIG.features,
      showEventStreamToggle: true,
    },
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
    theme: shopTheme,
    darkTheme: shopDarkTheme,
    colorScheme: "auto",
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: "Switchback Assistant",
      welcomeSubtitle:
        "I can search the catalog, pull up a product, and manage your cart — using this page's own tools. Try one of the prompts below.",
      inputPlaceholder: "Find me a trail shoe…",
    },
    suggestionChips: [
      "Find a waterproof trail shoe under $170",
      "Tell me about SHOE-005",
      "Add SHOE-001 and SHOE-007 at the same time",
      "Apply code TRAIL10 and show my cart total",
    ],
    webmcp: {
      enabled: true,
      // Auto-approve the storefront's read-only tools; route mutating calls to
      // Persona's native in-panel approval bubble. Name-based because the
      // polyfill's getTools() does not echo annotations to consumers.
      autoApprove: (info: WebMcpConfirmInfo): boolean => {
        const readOnly = READ_ONLY_TOOLS.has(info.toolName);
        logWire(
          "gate",
          "gate",
          `${esc(info.toolName)} — ${readOnly ? "read-only → <b>auto-approve</b>" : "mutating → <b>approval bubble</b>"}`,
        );
        return readOnly;
      },
    },
    launcher: {
      title: "Switchback",
      subtitle: "Trail & road running assistant",
      enabled: false,
      autoExpand: true,
      width: "100%",
      fullHeight: true,
    },
  };
}
