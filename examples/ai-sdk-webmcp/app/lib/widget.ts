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

// --- Switchback brand theme (mirrors globals.css; both follow the OS
//     light/dark preference via colorScheme:'auto').
//
//     "Pine & Blaze" — deep pine green primary + trail-blaze orange accent on
//     warm granite paper; dark mode is a night forest where lichen green takes
//     over as the interactive primary and the blaze glows brighter.
//
//     This block is intentionally a tour of Persona's three theming layers:
//       1. palette   — raw brand scales + the fonts the page already loads
//       2. semantic  — role colors (surface/text/interactive/feedback) derived
//                      from the palette
//       3. components — per-surface overrides where the brand needs a specific
//                       read (header bar, bubbles, the approval gate, markdown)
//     Everything below is plain config — no custom CSS, no plugins.
//
//     Contrast anchors: paper on pine #1f3d2b ≈ 11:1; blaze #d9531e fails AA
//     for small text on white, so text-safe #a63a14 (~6:1) carries links and
//     #d9531e is reserved for fills (header icon chip). In dark mode the pine
//     ink #15291d on lichen #7fb594 ≈ 7:1. ---
const shopTheme: NonNullable<AgentWidgetConfig["theme"]> = {
  palette: {
    colors: {
      // Pine ladder: 500 is the brand fill; 600/700 step lighter for
      // hover/focus (the widget's interactive states walk up the scale).
      primary: {
        50: "#eef4ef",
        100: "#d8e6dc",
        500: "#1f3d2b",
        600: "#2a5240",
        700: "#35654e",
        900: "#0f2015",
      },
      // Blaze: 500 for fills, 600 is the text-safe deep blaze.
      accent: { 500: "#d9531e", 600: "#a63a14" },
      // Warm granite neutrals (greens hiding in the grays).
      gray: {
        50: "#ffffff",
        100: "#f4f3ee",
        200: "#e2e1d6",
        300: "#d2d2c4",
        500: "#5f675e",
        700: "#3a463b",
        900: "#1d211c",
      },
      // Feedback anchors so success/warn/error chrome stays on-brand.
      success: { 500: "#2f7d4f" },
      warning: { 500: "#8a6508" },
      error: { 500: "#c0392b" },
      info: { 500: "#31708f" },
    },
    typography: {
      // Reuse the same font variables as the storefront shell; the widget
      // inherits them through its mount point, so no extra font requests are
      // needed in this standalone Next app.
      fontFamily: {
        sans: "var(--font-label)",
        serif: "var(--font-display)",
        mono: "var(--font-mono)",
      },
    },
    radius: { md: "0.5rem", lg: "0.75rem", xl: "1rem" },
  },
  semantic: {
    colors: {
      primary: "#1f3d2b",
      accent: "#d9531e",
      surface: "#ffffff",
      background: "#ffffff",
      container: "#efeee7",
      text: "#1d211c",
      textMuted: "#5f675e",
      textInverse: "#f4f3ee",
      border: "#e2e1d6",
      divider: "#e2e1d6",
      interactive: {
        default: "#1f3d2b",
        hover: "#2a5240",
        focus: "#35654e",
        active: "#15291d",
        disabled: "#aab3a8",
      },
      feedback: {
        success: "#2f7d4f",
        warning: "#8a6508",
        error: "#c0392b",
        info: "#31708f",
      },
    },
  },
  components: {
    // Square the panel's outer edges so it sits flush in the inline/fullscreen
    // stage instead of letting the page show through rounded corners.
    panel: { borderRadius: "0" },
    // Keep the header a deep pine bar with a blaze icon chip in BOTH schemes
    // (decoupled from `primary`, which flips to lichen green in dark mode and
    // would otherwise leave light header text on a light green bar).
    header: {
      borderRadius: "0",
      background: "#1f3d2b",
      titleForeground: "#f4f3ee",
      subtitleForeground: "#b9c8bc",
      iconBackground: "#d9531e",
      iconForeground: "#ffffff",
      actionIconForeground: "#cfd8cc",
    },
    // User turns are pine; assistant turns are paper cards on the thread.
    message: {
      user: { background: "#1f3d2b", text: "#f4f3ee" },
      assistant: {
        background: "#ffffff",
        text: "#1d211c",
        border: "#e2e1d6",
        shadow: "0 1px 2px rgba(29, 33, 28, 0.06)",
      },
    },
    // Welcome card: a quiet granite-tint slab, no drop shadow.
    introCard: { background: "#efeee7", borderRadius: "0.75rem", shadow: "none" },
    input: {
      background: "#ffffff",
      placeholder: "#8b9286",
      focus: { border: "#1f3d2b", ring: "rgba(31, 61, 43, 0.25)" },
    },
    // The approval gate is this demo's headline surface — every mutating
    // page-tool call (add_to_cart, apply_promo, …) lands here. Parchment
    // bubble with a blaze-tinted frame; approve is a solid pine button, deny
    // stays a neutral ghost.
    approval: {
      requested: {
        background: "#faf9f3",
        border: "#e9c4a8",
        text: "#1d211c",
        shadow: "0 1px 3px rgba(29, 33, 28, 0.08)",
      },
      approve: { background: "#1f3d2b", foreground: "#f4f3ee", border: "#1f3d2b" },
      deny: { background: "transparent", foreground: "#5f675e", border: "#d2d2c4" },
    },
    markdown: {
      link: { foreground: "#a63a14" }, // text-safe blaze
      inlineCode: { background: "#edece3", foreground: "#1d211c" },
      // Fenced code renders as a deep-pine terminal panel, echoing the
      // page's wire-log instrument look.
      codeBlock: { background: "#15291d", borderColor: "#2a5240", textColor: "#d8e6dc" },
      blockquote: { borderColor: "#1f3d2b" },
    },
    // Tool / reasoning / approval bubble chrome: parchment container with a
    // matching parchment inset for streamed args.
    collapsibleWidget: { container: "#faf9f3", surface: "#f1f0e6", border: "#e2e1d6" },
    toolBubble: { shadow: "0 1px 2px rgba(29, 33, 28, 0.05)" },
    reasoningBubble: { shadow: "0 1px 2px rgba(29, 33, 28, 0.05)" },
    composer: { shadow: "0 2px 8px rgba(29, 33, 28, 0.06)" },
    scrollToBottom: { background: "#1f3d2b", foreground: "#f4f3ee", border: "#1f3d2b" },
  },
};

const shopDarkTheme: NonNullable<AgentWidgetConfig["darkTheme"]> = {
  palette: {
    colors: {
      // Night forest: lichen green is the interactive primary; the ladder
      // steps lighter for hover/focus, same convention as the light theme.
      primary: {
        50: "#15291d",
        100: "#1d3527",
        500: "#7fb594",
        600: "#94c7a8",
        700: "#a9d4ba",
        900: "#d8e6dc",
      },
      accent: { 500: "#ff7a3d", 600: "#ff9a62" },
      gray: {
        50: "#e8eee7",
        100: "#1d2420",
        200: "#3a463b",
        500: "#9fab9d",
        900: "#141915",
        950: "#0e120f",
      },
      success: { 500: "#7fd4a0" },
      warning: { 500: "#e3b341" },
      error: { 500: "#e07856" },
      info: { 500: "#7dd3fc" },
    },
    typography: {
      // Keep custom storefront fonts in dark mode too; darkTheme does not
      // inherit shopTheme.palette.typography when colorScheme:'auto' rebuilds
      // tokens.
      fontFamily: {
        sans: "var(--font-label)",
        serif: "var(--font-display)",
        mono: "var(--font-mono)",
      },
    },
  },
  semantic: {
    colors: {
      primary: "#7fb594",
      accent: "#ff7a3d",
      surface: "#1d2420",
      background: "#141915",
      container: "#212a24",
      text: "#e8eee7",
      textMuted: "#9fab9d",
      textInverse: "#15291d",
      border: "#3a463b",
      divider: "#3a463b",
      interactive: {
        default: "#7fb594",
        hover: "#94c7a8",
        focus: "#a9d4ba",
        active: "#c0e2cd",
        disabled: "#4a564b",
      },
      feedback: {
        success: "#7fd4a0",
        warning: "#e3b341",
        error: "#e07856",
        info: "#7dd3fc",
      },
    },
  },
  components: {
    panel: { borderRadius: "0" },
    // Header stays a pine bar at night too — deepest pine instead of flipping
    // to lichen, with the blaze chip glowing against it.
    header: {
      borderRadius: "0",
      background: "#15291d",
      titleForeground: "#e8eee7",
      subtitleForeground: "#9fab9d",
      iconBackground: "#ff7a3d",
      iconForeground: "#15291d",
      actionIconForeground: "#b9c8bc",
    },
    // The widget's component defaults back these surfaces with `gray.50`, which
    // this dark palette keeps light (#e8eee7) — so without explicit overrides
    // the assistant bubbles, composer input, tool-call chrome, and inline code
    // would render as bright chalk cards on the night-forest panel. Pin them to
    // the dark surface set (and flip their default dark `gray.900` text to light).
    message: {
      user: { background: "#2a5240", text: "#e8eee7" },
      assistant: { background: "#1d2420", text: "#e8eee7", border: "#2c352d" },
    },
    introCard: { background: "#1d2420", borderRadius: "0.75rem", shadow: "none" },
    input: {
      background: "#212a24",
      placeholder: "#9fab9d",
      focus: { border: "#7fb594", ring: "rgba(127, 181, 148, 0.3)" },
    },
    approval: {
      requested: {
        background: "#1d2420",
        border: "#7a4426", // blaze-tinted frame, dimmed for the dark panel
        text: "#e8eee7",
        shadow: "none",
      },
      approve: { background: "#7fb594", foreground: "#15291d", border: "#7fb594" },
      deny: { background: "transparent", foreground: "#9fab9d", border: "#3a463b" },
    },
    markdown: {
      link: { foreground: "#ff9a62" },
      inlineCode: { background: "#2c352d", foreground: "#e8eee7" },
      codeBlock: { background: "#0e120f", borderColor: "#2c352d", textColor: "#d8e6dc" },
      blockquote: { borderColor: "#7fb594" },
    },
    collapsibleWidget: {
      container: "#1d2420", // tool/reasoning bubble chrome
      surface: "#0e120f", // inset args/code box — reads as a dark terminal panel
      border: "#2c352d",
    },
    toolBubble: { shadow: "none" },
    reasoningBubble: { shadow: "none" },
    composer: { shadow: "none" },
    scrollToBottom: { background: "#7fb594", foreground: "#15291d", border: "#7fb594" },
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
