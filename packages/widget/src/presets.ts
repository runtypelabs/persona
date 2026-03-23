import type { AgentWidgetConfig } from "./types";
import type { DeepPartial, PersonaTheme } from "./types/theme";

/**
 * A named preset containing partial widget configuration.
 * Apply with: `createAgentExperience(el, { ...PRESET_SHOP.config, apiUrl: '...' })`
 * or via IIFE: `{ ...AgentWidget.PRESETS.shop.config, apiUrl: '...' }`
 */
export interface WidgetPreset {
  id: string;
  label: string;
  config: Partial<AgentWidgetConfig>;
}

/** Shopping palette + semantic roles (matches prior shop preset visuals). */
const SHOP_THEME: DeepPartial<PersonaTheme> = {
  palette: {
    colors: {
      primary: { 500: "#111827" },
      accent: { 600: "#1d4ed8" },
      gray: {
        50: "#ffffff",
        100: "#f8fafc",
        200: "#f1f5f9",
        500: "#6b7280",
        900: "#000000",
      },
    },
    radius: {
      sm: "0.75rem",
      md: "1rem",
      lg: "1.5rem",
      launcher: "9999px",
      button: "9999px",
    },
  },
  semantic: {
    colors: {
      primary: "palette.colors.primary.500",
      textInverse: "palette.colors.gray.50",
    },
  },
};

const PANEL_EDGELESS_THEME: DeepPartial<PersonaTheme> = {
  components: {
    panel: {
      borderRadius: "0",
      shadow: "none",
    },
  },
};

/**
 * Shopping / e-commerce preset.
 * Dark header, rounded launchers, shopping-oriented copy.
 */
export const PRESET_SHOP: WidgetPreset = {
  id: "shop",
  label: "Shopping Assistant",
  config: {
    theme: SHOP_THEME,
    launcher: {
      title: "Shopping Assistant",
      subtitle: "Here to help you find what you need",
      agentIconText: "🛍️",
      position: "bottom-right",
      width: "min(400px, calc(100vw - 24px))",
    },
    copy: {
      welcomeTitle: "Welcome to our shop!",
      welcomeSubtitle: "I can help you find products and answer questions",
      inputPlaceholder: "Ask me anything...",
      sendButtonLabel: "Send",
    },
    suggestionChips: [
      "What can you help me with?",
      "Tell me about your features",
      "How does this work?",
    ],
  },
};

/**
 * Minimal preset.
 * Stripped-down header, no launcher button, suitable for inline embeds.
 */
export const PRESET_MINIMAL: WidgetPreset = {
  id: "minimal",
  label: "Minimal",
  config: {
    launcher: {
      enabled: false,
      fullHeight: true,
    },
    layout: {
      header: {
        layout: "minimal",
        showCloseButton: false,
      },
      messages: {
        layout: "minimal",
      },
    },
    theme: PANEL_EDGELESS_THEME,
  },
};

/**
 * Fullscreen assistant preset.
 * No launcher, content-max-width constrained, minimal header.
 */
export const PRESET_FULLSCREEN: WidgetPreset = {
  id: "fullscreen",
  label: "Fullscreen Assistant",
  config: {
    launcher: {
      enabled: false,
      fullHeight: true,
    },
    layout: {
      header: {
        layout: "minimal",
        showCloseButton: false,
      },
      contentMaxWidth: "72ch",
    },
    theme: PANEL_EDGELESS_THEME,
  },
};

/** All named presets keyed by ID. */
export const PRESETS: Record<string, WidgetPreset> = {
  shop: PRESET_SHOP,
  minimal: PRESET_MINIMAL,
  fullscreen: PRESET_FULLSCREEN,
};

/** Look up a preset by ID. */
export function getPreset(id: string): WidgetPreset | undefined {
  return PRESETS[id];
}
