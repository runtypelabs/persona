/**
 * Imperative preview renderer for the theme editor.
 * Manages iframe-based widget previews with device frames, zoom, scenes, and compare mode.
 * No external DOM dependencies — only needs a container element to mount into.
 */

import type { AgentWidgetConfig } from '../types';
import type { DeepPartial, PersonaTheme } from '../types/theme';
import type { AgentWidgetController } from '../ui';
import { createAgentExperience } from '../ui';
import { createWidgetHostLayout, type WidgetHostLayout } from '../runtime/host-layout';
import { isDockedMountMode } from '../utils/dock';
import { createTheme } from '../utils/theme';
import { DEFAULT_WIDGET_CONFIG } from '../defaults';
import type { AgentWidgetMessage } from '../types';

// ─── Public Types ───────────────────────────────────────────────

export type PreviewDevice = 'desktop' | 'mobile';
export type PreviewScene = 'home' | 'conversation' | 'minimized' | 'artifact';
export type PreviewShellMode = 'light' | 'dark';
export type CompareMode = 'off' | 'baseline' | 'themes';

export interface ThemePreviewOptions {
  /** Device frame dimensions */
  device?: PreviewDevice;
  /** Widget state */
  scene?: PreviewScene;
  /** Browser chrome appearance */
  shellMode?: PreviewShellMode;
  /** Side-by-side comparison */
  compareMode?: CompareMode;
  /** Widget config */
  config?: Partial<AgentWidgetConfig>;
  /** Light mode theme */
  theme?: DeepPartial<PersonaTheme>;
  /** Dark mode theme */
  darkTheme?: DeepPartial<PersonaTheme>;
  /** Zoom level (0.15–1.5), or undefined for auto-fit */
  zoom?: number;
  /** Path to widget.css (defaults to looking for /widget-dist/widget.css) */
  widgetCssPath?: string;
}

export interface ThemePreviewHandle {
  /** Update the preview (fast path when possible, full remount when needed) */
  update(options: Partial<ThemePreviewOptions>): void;
  /** Destroy preview and clean up */
  destroy(): void;
  /** Get live widget controllers */
  getControllers(): AgentWidgetController[];
  /** Recalculate auto-fit zoom */
  fitToContainer(): void;
}

// ─── Constants ──────────────────────────────────────────────────

const DEVICE_DIMENSIONS: Record<string, { w: number; h: number }> = {
  desktop: { w: 1280, h: 800 },
  mobile: { w: 390, h: 844 },
};

const ZOOM_MIN = 0.15;
const ZOOM_MAX = 1.5;

const SHELL_STYLE_ID = 'persona-preview-shell-theme';

const PREVIEW_STORAGE_ADAPTER = {
  load: () => null,
  save: () => {},
  clear: () => {},
};

const HOME_SUGGESTION_CHIPS = [
  'How do I get started?',
  'Pricing & plans',
  'Talk to support',
];

// ─── Preview Messages ───────────────────────────────────────────

function createPreviewMessages(scene: PreviewScene): AgentWidgetMessage[] {
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
  return [
    { id: 'preview-conv-1', role: 'assistant', content: 'Hello! How can I help you today?', createdAt: new Date(Date.now() - 180000).toISOString() },
    { id: 'preview-conv-2', role: 'user', content: 'I want to customize the theme editor preview.', createdAt: new Date(Date.now() - 120000).toISOString() },
    { id: 'preview-conv-3', role: 'assistant', content: 'Absolutely. Adjust colors, typography, and component tokens to see changes instantly.', createdAt: new Date(Date.now() - 60000).toISOString() },
  ];
}

function applySceneConfig(base: AgentWidgetConfig, scene: PreviewScene): AgentWidgetConfig {
  const launcher = { ...base.launcher, enabled: true, autoExpand: scene !== 'minimized' };
  const config = {
    ...base,
    launcher,
    suggestionChips: scene === 'home' ? (base.suggestionChips?.length ? base.suggestionChips : HOME_SUGGESTION_CHIPS) : base.suggestionChips,
    initialMessages: createPreviewMessages(scene),
    storageAdapter: PREVIEW_STORAGE_ADAPTER,
  } as AgentWidgetConfig;

  if (scene === 'artifact') {
    config.features = { ...config.features, artifacts: { ...config.features?.artifacts, enabled: true } };
  }
  return config;
}

// ─── Shell Theme ────────────────────────────────────────────────

function getShellPalette(shellMode: PreviewShellMode) {
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

function buildShellCss(shellMode: PreviewShellMode): string {
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

function applyShellTheme(iframe: HTMLIFrameElement, shellMode: PreviewShellMode): void {
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

// ─── Iframe Srcdoc ──────────────────────────────────────────────

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildSrcdoc(mountId: string, shellMode: PreviewShellMode, docked: boolean, widgetCssPath: string): string {
  const mockContent = `
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
          </div>
        </div>
      </div>
    </div>`;

  const floatingContent = `
    ${mockContent}
    <div style="position:fixed;inset:0;z-index:9999;"><div id="${mountId}" data-mount-id="${mountId}"></div></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="${esc(widgetCssPath)}">
  <style id="${SHELL_STYLE_ID}">${buildShellCss(shellMode)}</style>
</head>
<body>
  ${docked ? dockedContent : floatingContent}
</body>
</html>`;
}

// ─── Preview Spec ───────────────────────────────────────────────

interface PreviewSpec {
  mountId: string;
  label: string;
  config: AgentWidgetConfig;
  shellMode: PreviewShellMode;
}

function buildPreviewConfig(
  options: ThemePreviewOptions,
  shellModeOverride?: PreviewShellMode | 'light' | 'dark'
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

  return applySceneConfig(base, scene);
}

function buildSpecs(options: ThemePreviewOptions): PreviewSpec[] {
  const compare = options.compareMode ?? 'off';
  const shellMode = options.shellMode ?? 'light';

  if (compare === 'themes') {
    return [
      { mountId: 'preview-light', label: 'Light', config: buildPreviewConfig(options, 'light'), shellMode: 'light' },
      { mountId: 'preview-dark', label: 'Dark', config: buildPreviewConfig(options, 'dark'), shellMode: 'dark' },
    ];
  }

  return [
    { mountId: 'preview-current', label: 'Current', config: buildPreviewConfig(options, shellMode), shellMode },
  ];
}

// ─── Main ───────────────────────────────────────────────────────

export function createThemePreview(
  container: HTMLElement,
  initialOptions: ThemePreviewOptions
): ThemePreviewHandle {
  let options = { ...initialOptions };
  let controllers: AgentWidgetController[] = [];
  let layoutCleanups: (() => void)[] = [];
  let resizeObserver: ResizeObserver | null = null;
  let destroyed = false;
  let lastAutoScale = 1;

  function getDevice(): PreviewDevice {
    return options.device ?? 'desktop';
  }

  function getZoom(): number {
    return options.zoom ?? lastAutoScale;
  }

  function computeFitScale(): number {
    const style = getComputedStyle(container);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const margin = 40;
    const compare = (options.compareMode ?? 'off') !== 'off';
    const availW = (container.clientWidth - padX - margin) / (compare ? 2 : 1);
    const availH = container.clientHeight - padY - margin;
    if (availW <= 0 || availH <= 0) return 1;

    const dims = DEVICE_DIMENSIONS[getDevice()] ?? DEVICE_DIMENSIONS.desktop;
    return Math.min(availW / dims.w, availH / dims.h, 1);
  }

  function applyScale(): void {
    lastAutoScale = computeFitScale();
    const scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, getZoom()));

    const wrappers = Array.from(container.querySelectorAll<HTMLElement>('.preview-iframe-wrapper'));
    for (const wrapper of wrappers) {
      const device = wrapper.dataset.device ?? 'desktop';
      const dims = DEVICE_DIMENSIONS[device] ?? DEVICE_DIMENSIONS.desktop;

      wrapper.style.width = `${dims.w * scale}px`;
      wrapper.style.height = `${dims.h * scale}px`;
      if (device === 'mobile') wrapper.style.borderRadius = `${32 * scale}px`;

      const iframe = wrapper.querySelector('iframe') as HTMLIFrameElement | null;
      if (iframe) {
        iframe.style.width = `${dims.w}px`;
        iframe.style.height = `${dims.h}px`;
        iframe.style.transformOrigin = 'top left';
        iframe.style.transition = 'none';
        iframe.style.transform = `scale(${scale})`;
      }
    }
  }

  function destroyControllers(): void {
    for (const c of controllers) c.destroy();
    for (const fn of layoutCleanups) fn();
    controllers = [];
    layoutCleanups = [];
  }

  function mountWidgets(): void {
    if (destroyed) return;
    destroyControllers();

    const specs = buildSpecs(options);
    const device = getDevice();
    const compare = (options.compareMode ?? 'off') !== 'off';
    const isMinimized = (options.scene ?? 'conversation') === 'minimized';
    const widgetCssPath = options.widgetCssPath ?? '/widget-dist/widget.css';

    // Build container HTML
    const wrapperClass = device === 'mobile' ? 'preview-iframe-wrapper preview-iframe-wrapper-mobile' : 'preview-iframe-wrapper';
    const frameMarkup = (spec: PreviewSpec) =>
      `<div class="${wrapperClass}" data-mount-id="${spec.mountId}" data-device="${device}" data-shell-mode="${spec.shellMode}">
        ${compare ? `<div class="preview-frame-meta"><span class="preview-frame-label">${esc(spec.label)}</span></div>` : ''}
        <iframe class="preview-iframe" sandbox="allow-scripts allow-same-origin" data-mount-id="${spec.mountId}"></iframe>
      </div>`;

    container.innerHTML = compare
      ? `<div class="preview-compare-grid">${specs.map(s => `<div class="preview-compare-cell">${frameMarkup(s)}</div>`).join('')}</div>`
      : `<div class="preview-single">${frameMarkup(specs[0])}</div>`;

    applyScale();

    // Mount widgets inside iframes after they load
    const iframes = Array.from(container.querySelectorAll<HTMLIFrameElement>('iframe[data-mount-id]'));
    let loaded = 0;
    const total = iframes.length;

    const mountAll = (): void => {
      if (destroyed) return;

      for (const iframe of iframes) {
        const mountId = iframe.dataset.mountId;
        if (!mountId || !iframe.contentDocument) continue;
        const spec = specs.find(s => s.mountId === mountId);
        if (!spec) continue;

        let cleanup = () => {};
        const docked = isDockedMountMode(spec.config);

        const mount = docked
          ? (() => {
              const contentRoot = iframe.contentDocument?.getElementById(`preview-content-${mountId}`) as HTMLElement | null;
              if (!contentRoot) return null;
              const hostLayout = createWidgetHostLayout(contentRoot, spec.config);
              const m = iframe.contentDocument!.createElement('div');
              m.id = mountId;
              m.style.height = '100%';
              m.style.display = 'flex';
              m.style.flexDirection = 'column';
              m.style.flex = '1';
              m.style.minHeight = '0';
              hostLayout.host.appendChild(m);
              const syncDock = () => hostLayout.syncWidgetState(controller.getState());
              const prevCleanup = cleanup;
              cleanup = () => { hostLayout.destroy(); prevCleanup(); };
              // Will be set after controller is created
              (m as any).__syncDock = syncDock;
              (m as any).__hostLayout = hostLayout;
              return m;
            })()
          : iframe.contentDocument.getElementById(mountId);

        if (!mount) continue;

        const controller = createAgentExperience(mount, spec.config);
        controllers.push(controller);

        if (docked && (mount as any).__syncDock) {
          const syncDock = (mount as any).__syncDock as () => void;
          const openUnsub = controller.on('widget:opened', syncDock);
          const closeUnsub = controller.on('widget:closed', syncDock);
          const prevCleanup = cleanup;
          cleanup = () => { openUnsub(); closeUnsub(); prevCleanup(); };
          syncDock();
        }

        layoutCleanups.push(cleanup);

        if (isMinimized) controller.close();
      }

      // Inject artifacts if needed
      const scene = options.scene ?? 'conversation';
      if (scene === 'artifact' || options.config?.features?.artifacts?.enabled) {
        for (const c of controllers) {
          c.upsertArtifact({
            id: 'preview-sample',
            artifactType: 'markdown',
            title: 'Sample Document',
            content: '# Sample Artifact\n\nThis is a preview of the artifact sidebar.\n\n## Features\n\n- Markdown rendering\n- Document toolbar\n- Resizable panes',
          });
        }
      }
    };

    for (const iframe of iframes) {
      const mountId = iframe.dataset.mountId;
      if (!mountId) continue;
      const spec = specs.find(s => s.mountId === mountId);
      if (!spec) continue;

      iframe.addEventListener('load', () => {
        loaded++;
        if (loaded >= total) mountAll();
      }, { once: true });
      iframe.srcdoc = buildSrcdoc(mountId, spec.shellMode, isDockedMountMode(spec.config), widgetCssPath);
    }

    if (total === 0) mountAll();
  }

  function updateWidgets(): void {
    if (destroyed) return;

    const specs = buildSpecs(options);

    // Check if we can do a fast update (no structural changes)
    if (controllers.length !== specs.length) {
      mountWidgets();
      return;
    }

    // Check shell mode changes
    const hasShellMismatch = specs.some(spec => {
      const wrapper = container.querySelector<HTMLElement>(`.preview-iframe-wrapper[data-mount-id="${spec.mountId}"]`);
      return !wrapper || wrapper.dataset.shellMode !== spec.shellMode;
    });

    if (hasShellMismatch) {
      mountWidgets();
      return;
    }

    // Fast path: update controllers in place
    controllers.forEach((controller, index) => {
      controller.update(specs[index].config);
      if ((options.scene ?? 'conversation') === 'minimized') {
        controller.close();
      }
    });

    // Update shell themes
    for (const spec of specs) {
      const iframe = container.querySelector<HTMLIFrameElement>(`iframe[data-mount-id="${spec.mountId}"]`);
      if (iframe) applyShellTheme(iframe, spec.shellMode);
    }
  }

  // ─── Setup ──────────────────────────────────────────────────

  // Auto-fit on resize
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (!destroyed) applyScale();
    });
    resizeObserver.observe(container);
  }

  // Initial mount
  mountWidgets();

  // ─── Handle ─────────────────────────────────────────────────

  return {
    update(newOptions: Partial<ThemePreviewOptions>): void {
      if (destroyed) return;

      const needsRemount =
        newOptions.device !== undefined && newOptions.device !== options.device ||
        newOptions.scene !== undefined && newOptions.scene !== options.scene ||
        newOptions.compareMode !== undefined && newOptions.compareMode !== options.compareMode ||
        newOptions.widgetCssPath !== undefined && newOptions.widgetCssPath !== options.widgetCssPath;

      options = { ...options, ...newOptions };

      if (needsRemount) {
        mountWidgets();
      } else {
        updateWidgets();
      }
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      destroyControllers();
      resizeObserver?.disconnect();
      container.innerHTML = '';
    },

    getControllers(): AgentWidgetController[] {
      return [...controllers];
    },

    fitToContainer(): void {
      if (destroyed) return;
      options = { ...options, zoom: undefined };
      applyScale();
    },
  };
}
