import type { AgentWidgetConfig } from './types';

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

/**
 * Shopping / e-commerce preset.
 * Dark header, rounded launchers, shopping-oriented copy.
 */
export const PRESET_SHOP: WidgetPreset = {
  id: 'shop',
  label: 'Shopping Assistant',
  config: {
    theme: {
      primary: '#111827',
      accent: '#1d4ed8',
      surface: '#ffffff',
      muted: '#6b7280',
      container: '#f8fafc',
      border: '#f1f5f9',
      divider: '#f1f5f9',
      messageBorder: '#f1f5f9',
      inputBackground: '#ffffff',
      callToAction: '#000000',
      callToActionBackground: '#ffffff',
      sendButtonBackgroundColor: '#111827',
      sendButtonTextColor: '#ffffff',
      radiusSm: '0.75rem',
      radiusMd: '1rem',
      radiusLg: '1.5rem',
      launcherRadius: '9999px',
      buttonRadius: '9999px',
    },
    launcher: {
      title: 'Shopping Assistant',
      subtitle: 'Here to help you find what you need',
      agentIconText: '🛍️',
      position: 'bottom-right',
      width: 'min(400px, calc(100vw - 24px))',
    },
    copy: {
      welcomeTitle: 'Welcome to our shop!',
      welcomeSubtitle: 'I can help you find products and answer questions',
      inputPlaceholder: 'Ask me anything...',
      sendButtonLabel: 'Send',
    },
    suggestionChips: [
      'What can you help me with?',
      'Tell me about your features',
      'How does this work?',
    ],
  },
};

/**
 * Minimal preset.
 * Stripped-down header, no launcher button, suitable for inline embeds.
 */
export const PRESET_MINIMAL: WidgetPreset = {
  id: 'minimal',
  label: 'Minimal',
  config: {
    launcher: {
      enabled: false,
      fullHeight: true,
    },
    layout: {
      header: {
        layout: 'minimal',
        showCloseButton: false,
      },
      messages: {
        layout: 'minimal',
      },
    },
    theme: {
      panelBorderRadius: '0',
      panelShadow: 'none',
    },
  },
};

/**
 * Fullscreen assistant preset.
 * No launcher, content-max-width constrained, minimal header.
 */
export const PRESET_FULLSCREEN: WidgetPreset = {
  id: 'fullscreen',
  label: 'Fullscreen Assistant',
  config: {
    launcher: {
      enabled: false,
      fullHeight: true,
    },
    layout: {
      header: {
        layout: 'minimal',
        showCloseButton: false,
      },
      contentMaxWidth: '72ch',
    },
    theme: {
      panelBorderRadius: '0',
      panelShadow: 'none',
    },
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
