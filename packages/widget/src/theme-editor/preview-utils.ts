/**
 * Shared preview building blocks for theme editor preview renderers.
 * Used by both `createThemePreview()` (simple API) and the configurator's
 * advanced preview system. Separate file for code-splitting.
 */

import type { AgentWidgetConfig } from '../types';
import type { AgentWidgetMessage } from '../types';
import { createTheme } from '../utils/theme';
import { DEFAULT_WIDGET_CONFIG } from '../defaults';

// ─── Constants ──────────────────────────────────────────────────

export const DEVICE_DIMENSIONS: Record<string, { w: number; h: number }> = {
  desktop: { w: 1280, h: 800 },
  mobile: { w: 390, h: 844 },
};

export const ZOOM_MIN = 0.15;
export const ZOOM_MAX = 1.5;

export const SHELL_STYLE_ID = 'persona-preview-shell-theme';

export const PREVIEW_STORAGE_ADAPTER = {
  load: () => null,
  save: () => {},
  clear: () => {},
};

export const HOME_SUGGESTION_CHIPS = [
  'How do I get started?',
  'Pricing & plans',
  'Talk to support',
];

// ─── HTML Escaping ──────────────────────────────────────────────

export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Shell Theme ────────────────────────────────────────────────

export type PreviewShellPalette = {
  pageBg: string;
  chromeBg: string;
  chromeBorder: string;
  dot: string;
  skeleton: string;
  cardBg: string;
  cardBorder: string;
};

export function getShellPalette(shellMode: 'light' | 'dark'): PreviewShellPalette {
  return shellMode === 'dark'
    ? {
        pageBg: 'linear-gradient(180deg, #0f172a 0%, #020617 100%)',
        chromeBg: '#111827', chromeBorder: '#1f2937', dot: '#475569',
        skeleton: '#334155', cardBg: '#1e293b', cardBorder: 'rgba(148, 163, 184, 0.16)',
      }
    : {
        pageBg: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
        chromeBg: '#ffffff', chromeBorder: '#e5e7eb', dot: '#cbd5e1',
        skeleton: '#e2e8f0', cardBg: '#e2e8f0', cardBorder: 'rgba(148, 163, 184, 0.18)',
      };
}

export function buildShellCss(shellMode: 'light' | 'dark'): string {
  const t = getShellPalette(shellMode);
  return `* { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
    html { color-scheme: ${shellMode}; }
    body { font-family: system-ui, sans-serif; background: ${t.pageBg}; }
    .preview-iframe-mock { min-height: 100%; }
    .preview-iframe-chrome { height: 44px; border-bottom: 1px solid ${t.chromeBorder}; background: ${t.chromeBg}; display: flex; align-items: center; gap: 8px; padding: 0 14px; }
    .preview-iframe-dot { width: 10px; height: 10px; border-radius: 50%; background: ${t.dot}; }
    .preview-iframe-copy { padding: 32px; }
    .preview-iframe-line { border-radius: 999px; background: ${t.skeleton}; margin-bottom: 12px; }
    .preview-iframe-line.hero { width: 48%; height: 16px; }
    .preview-iframe-line.body { width: 72%; height: 10px; }
    .preview-iframe-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 24px 0; }
    .preview-iframe-card { height: 84px; border-radius: 14px; background: ${t.cardBg}; box-shadow: inset 0 0 0 1px ${t.cardBorder}; }
    .preview-workspace-shell { height: 100%; min-height: 100%; display: flex; flex-direction: column; }
    .preview-workspace-topbar { height: 52px; flex-shrink: 0; border-bottom: 1px solid ${t.chromeBorder}; background: ${t.chromeBg}; display: flex; align-items: center; justify-content: space-between; padding: 0 18px; }
    .preview-workspace-topbar-left { display: flex; align-items: center; gap: 12px; }
    .preview-workspace-topbar-badge { width: 18px; height: 18px; border-radius: 6px; background: ${t.cardBg}; box-shadow: inset 0 0 0 1px ${t.cardBorder}; }
    .preview-workspace-topbar-line { width: 180px; height: 10px; border-radius: 999px; background: ${t.skeleton}; }
    .preview-workspace-topbar-pill { width: 64px; height: 28px; border-radius: 999px; background: ${t.cardBg}; box-shadow: inset 0 0 0 1px ${t.cardBorder}; }
    .preview-workspace-body { flex: 1; min-height: 0; display: flex; padding: 20px; }
    .preview-workspace-content { position: relative; display: flex; flex-direction: column; flex: 1; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; border-radius: 24px; background: rgba(255,255,255,0.72); box-shadow: inset 0 0 0 1px ${t.cardBorder}; }
    .preview-workspace-content-shell { position: relative; z-index: 1; flex: 1 1 auto; min-height: 100%; padding: 24px; }
    .preview-workspace-row { display: flex; gap: 16px; margin-top: 20px; }
    .preview-workspace-card { flex: 1; min-width: 0; height: 168px; border-radius: 18px; background: ${t.cardBg}; box-shadow: inset 0 0 0 1px ${t.cardBorder}; }
    .preview-workspace-card.short { height: 96px; }`;
}

export function applyShellTheme(iframe: HTMLIFrameElement, shellMode: 'light' | 'dark'): void {
  const doc = iframe.contentDocument;
  if (!doc?.documentElement) return;
  let style = doc.getElementById(SHELL_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = SHELL_STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = buildShellCss(shellMode);
}

// ─── Mock HTML Templates ────────────────────────────────────────

/** Browser chrome mock with skeleton content cards */
export const MOCK_BROWSER_CONTENT = `
    <div class="preview-iframe-mock" aria-hidden="true">
      <div class="preview-iframe-chrome">
        <span class="preview-iframe-dot"></span>
        <span class="preview-iframe-dot"></span>
        <span class="preview-iframe-dot"></span>
      </div>
      <div class="preview-iframe-copy">
        <div class="preview-iframe-line hero"></div>
        <div class="preview-iframe-line body"></div>
        <div class="preview-iframe-line body"></div>
        <div class="preview-iframe-grid">
          <div class="preview-iframe-card"></div>
          <div class="preview-iframe-card"></div>
          <div class="preview-iframe-card"></div>
        </div>
        <div class="preview-iframe-line body"></div>
        <div class="preview-iframe-line body"></div>
      </div>
    </div>`;

/** Docked workspace skeleton (cards + rows inside content area) */
export const MOCK_WORKSPACE_CONTENT = `
    <div class="preview-workspace-content-shell" aria-hidden="true">
      <div class="preview-iframe-line hero"></div>
      <div class="preview-iframe-line body"></div>
      <div class="preview-workspace-row">
        <div class="preview-workspace-card"></div>
        <div class="preview-workspace-card"></div>
      </div>
      <div class="preview-workspace-row">
        <div class="preview-workspace-card short"></div>
        <div class="preview-workspace-card short"></div>
        <div class="preview-workspace-card short"></div>
      </div>
    </div>`;

// ─── Srcdoc Builder ─────────────────────────────────────────────

/**
 * Build a basic iframe srcdoc with mock page chrome and widget mount point.
 * For advanced use cases (background URLs, embed detection), build custom srcdoc
 * using the exported templates and shell CSS utilities.
 */
export function buildSrcdoc(
  mountId: string,
  shellMode: 'light' | 'dark',
  docked: boolean,
  widgetCssPath: string
): string {
  const floatingContent = `
    ${MOCK_BROWSER_CONTENT}
    <div style="position:fixed;inset:0;z-index:9999;"><div id="${mountId}" data-mount-id="${mountId}"></div></div>`;

  const dockedContent = `
    <div class="preview-workspace-shell">
      <div class="preview-workspace-topbar">
        <div class="preview-workspace-topbar-left">
          <span class="preview-workspace-topbar-badge"></span>
          <span class="preview-workspace-topbar-line"></span>
        </div>
        <span class="preview-workspace-topbar-pill"></span>
      </div>
      <div class="preview-workspace-body">
        <div id="preview-content-${mountId}" class="preview-workspace-content" data-mount-id="${mountId}">
          ${MOCK_WORKSPACE_CONTENT}
        </div>
      </div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="${escapeHtml(widgetCssPath)}">
  <style id="${SHELL_STYLE_ID}">${buildShellCss(shellMode)}</style>
</head>
<body>
  ${docked ? dockedContent : floatingContent}
</body>
</html>`;
}

// ─── Preview Messages ───────────────────────────────────────────

export type PreviewScene = 'home' | 'conversation' | 'minimized' | 'artifact';

export type PreviewTranscriptEntryPreset =
  | 'user-message'
  | 'assistant-message'
  | 'reasoning-streaming'
  | 'reasoning-complete'
  | 'tool-running'
  | 'tool-complete';

const PREVIEW_TRANSCRIPT_PRESET_LABELS: Record<PreviewTranscriptEntryPreset, string> = {
  'user-message': 'User message',
  'assistant-message': 'Assistant message',
  'reasoning-streaming': 'Reasoning (streaming)',
  'reasoning-complete': 'Reasoning (complete)',
  'tool-running': 'Tool call (running)',
  'tool-complete': 'Tool call (complete)',
};

export function getPreviewTranscriptPresetLabel(preset: PreviewTranscriptEntryPreset): string {
  return PREVIEW_TRANSCRIPT_PRESET_LABELS[preset];
}

export function createPreviewTranscriptEntry(
  preset: PreviewTranscriptEntryPreset,
  index = 0
): AgentWidgetMessage {
  const createdAt = new Date(Date.now() - Math.max(0, 60 - index) * 1000).toISOString();
  const suffix = `${preset}-${index}`;

  switch (preset) {
    case 'user-message':
      return {
        id: `preview-seq-user-${suffix}`,
        role: 'user',
        content: 'Can you continue with the next step?',
        createdAt,
      };
    case 'assistant-message':
      return {
        id: `preview-seq-assistant-${suffix}`,
        role: 'assistant',
        content: 'Absolutely. I can keep going and explain what happens next.',
        createdAt,
      };
    case 'reasoning-streaming':
      return {
        id: `preview-seq-reasoning-stream-${suffix}`,
        role: 'assistant',
        content: '',
        createdAt,
        streaming: true,
        variant: 'reasoning',
        reasoning: {
          id: `preview-reasoning-stream-${suffix}`,
          status: 'streaming',
          chunks: ['Thinking through the next step in the workflow...'],
        },
      };
    case 'reasoning-complete':
      return {
        id: `preview-seq-reasoning-complete-${suffix}`,
        role: 'assistant',
        content: '',
        createdAt,
        streaming: false,
        variant: 'reasoning',
        reasoning: {
          id: `preview-reasoning-complete-${suffix}`,
          status: 'complete',
          chunks: ['Reviewed the requirements and finalized the reasoning output.'],
          durationMs: 1200,
        },
      };
    case 'tool-complete':
      return {
        id: `preview-seq-tool-complete-${suffix}`,
        role: 'assistant',
        content: '',
        createdAt,
        streaming: false,
        variant: 'tool',
        toolCall: {
          id: `preview-tool-complete-${suffix}`,
          name: 'Create build instructions',
          status: 'complete',
          chunks: ['Prepared the build instructions and validated the inputs.'],
          result: { ok: true },
          duration: 420,
        },
      };
    case 'tool-running':
    default:
      return {
        id: `preview-seq-tool-running-${suffix}`,
        role: 'assistant',
        content: '',
        createdAt,
        streaming: true,
        variant: 'tool',
        toolCall: {
          id: `preview-tool-running-${suffix}`,
          name: 'Get platform documentation',
          status: 'running',
          chunks: ['Fetching the relevant platform documentation...'],
        },
      };
  }
}

export function appendPreviewTranscriptEntry(
  messages: AgentWidgetMessage[],
  preset: PreviewTranscriptEntryPreset
): AgentWidgetMessage[] {
  return [...messages, createPreviewTranscriptEntry(preset, messages.length)];
}

const createAdvancedTranscriptPreviewMessages = (): AgentWidgetMessage[] => [
  {
    id: "preview-adv-1",
    role: "user",
    content: "Can you create the product and gather the docs?",
    createdAt: new Date(Date.now() - 180000).toISOString(),
  },
  {
    id: "preview-adv-2",
    role: "assistant",
    content: "",
    createdAt: new Date(Date.now() - 150000).toISOString(),
    streaming: true,
    variant: "reasoning",
    reasoning: {
      id: "preview-reasoning",
      status: "streaming",
      chunks: [
        "Now let me get the Persona embed documentation and builtin tools catalog.",
      ],
    },
  },
  {
    id: "preview-adv-3",
    role: "assistant",
    content: "",
    createdAt: new Date(Date.now() - 120000).toISOString(),
    streaming: true,
    variant: "tool",
    toolCall: {
      id: "preview-tool-1",
      name: "Load tools",
      status: "running",
      chunks: ["Loaded tools, used Runtype integration"],
    },
  },
  {
    id: "preview-adv-4",
    role: "assistant",
    content: "",
    createdAt: new Date(Date.now() - 90000).toISOString(),
    streaming: true,
    variant: "tool",
    toolCall: {
      id: "preview-tool-2",
      name: "Get platform documentation",
      status: "running",
      chunks: ["Get platform documentation"],
    },
  },
  {
    id: "preview-adv-5",
    role: "assistant",
    content: "I loaded the tools and fetched the docs. Next I can assemble the product details.",
    createdAt: new Date(Date.now() - 30000).toISOString(),
  },
];

const shouldSeedAdvancedTranscriptPreview = (
  config?: Partial<AgentWidgetConfig>
): boolean =>
  Boolean(
    config?.features?.toolCallDisplay?.activePreview ||
      config?.features?.toolCallDisplay?.grouped ||
      (config?.features?.toolCallDisplay?.collapsedMode &&
        config.features.toolCallDisplay.collapsedMode !== "tool-call") ||
      config?.features?.reasoningDisplay?.activePreview
  );

export function createPreviewMessages(
  scene: PreviewScene,
  config?: Partial<AgentWidgetConfig>,
  appendedMessages: AgentWidgetMessage[] = []
): AgentWidgetMessage[] {
  if (scene === 'home') {
    return [{ id: 'preview-home-1', role: 'assistant', content: 'Hi there! How can we help today?', createdAt: new Date().toISOString() }];
  }
  if (scene === 'minimized') {
    return [{ id: 'preview-min-1', role: 'assistant', content: 'We are here whenever you are ready.', createdAt: new Date().toISOString() }];
  }
  if (scene === 'artifact') {
    return [
      { id: 'preview-art-1', role: 'user', content: 'Can you draft a quick overview of the project?', createdAt: new Date(Date.now() - 120000).toISOString() },
      { id: 'preview-art-2', role: 'assistant', content: 'Here\u2019s a project overview document for you.', createdAt: new Date(Date.now() - 60000).toISOString() },
    ];
  }
  if (scene === 'conversation' && shouldSeedAdvancedTranscriptPreview(config)) {
    return [...createAdvancedTranscriptPreviewMessages(), ...appendedMessages];
  }
  return [
    { id: 'preview-conv-1', role: 'assistant', content: 'Hello! How can I help you today?', createdAt: new Date(Date.now() - 180000).toISOString() },
    { id: 'preview-conv-2', role: 'user', content: 'I want to customize the theme editor preview.', createdAt: new Date(Date.now() - 120000).toISOString() },
    { id: 'preview-conv-3', role: 'assistant', content: 'Absolutely. Check out the [getting started guide](https://example.com) to see what\u2019s possible, then adjust colors and tokens to match your brand.', createdAt: new Date(Date.now() - 60000).toISOString() },
    ...appendedMessages,
  ];
}

// ─── Scene Config ───────────────────────────────────────────────

export function applySceneConfig(
  base: AgentWidgetConfig,
  scene: PreviewScene,
  appendedMessages: AgentWidgetMessage[] = []
): AgentWidgetConfig {
  const launcher = { ...base.launcher, enabled: true, autoExpand: scene !== 'minimized' };
  const config = {
    ...base,
    launcher,
    suggestionChips: scene === 'home' ? (base.suggestionChips?.length ? base.suggestionChips : HOME_SUGGESTION_CHIPS) : base.suggestionChips,
    initialMessages: createPreviewMessages(scene, base, appendedMessages),
    storageAdapter: PREVIEW_STORAGE_ADAPTER,
  } as AgentWidgetConfig;

  if (scene === 'artifact') {
    config.features = { ...config.features, artifacts: { ...config.features?.artifacts, enabled: true } };
  }
  return config;
}

// ─── Preview Config Builder ─────────────────────────────────────

import type { DeepPartial, PersonaTheme } from '../types/theme';

export interface PreviewConfigOptions {
  config?: Partial<AgentWidgetConfig>;
  theme?: DeepPartial<PersonaTheme>;
  darkTheme?: DeepPartial<PersonaTheme>;
  scene?: PreviewScene;
  appendedMessages?: AgentWidgetMessage[];
}

export function buildPreviewConfig(
  options: PreviewConfigOptions,
  shellModeOverride?: 'light' | 'dark'
): AgentWidgetConfig {
  const theme = options.theme ? createTheme(options.theme, { validate: false }) : createTheme();
  const scene = options.scene ?? 'conversation';

  const base = {
    ...DEFAULT_WIDGET_CONFIG,
    ...options.config,
    theme,
    darkTheme: options.darkTheme,
    colorScheme: shellModeOverride ?? (options.config?.colorScheme as string) ?? 'light',
  } as AgentWidgetConfig;

  return applySceneConfig(base, scene, options.appendedMessages ?? []);
}

export function buildPreviewConfigWithMessages(
  options: PreviewConfigOptions,
  messages: AgentWidgetMessage[],
  shellModeOverride?: 'light' | 'dark'
): AgentWidgetConfig {
  const theme = options.theme ? createTheme(options.theme, { validate: false }) : createTheme();
  const scene = options.scene ?? 'conversation';

  const base = {
    ...DEFAULT_WIDGET_CONFIG,
    ...options.config,
    theme,
    darkTheme: options.darkTheme,
    colorScheme: shellModeOverride ?? (options.config?.colorScheme as string) ?? 'light',
  } as AgentWidgetConfig;

  return applySceneConfig(base, scene, messages);
}
