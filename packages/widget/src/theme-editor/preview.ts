/**
 * Imperative preview renderer for the theme editor.
 * Manages iframe-based widget previews with device frames, zoom, scenes, and compare mode.
 * No external DOM dependencies — only needs a container element to mount into.
 *
 * For advanced preview needs (background URLs, inline editing, contrast checking),
 * import the shared building blocks from `./preview-utils` directly.
 */

import type { AgentWidgetConfig } from '../types';
import type { DeepPartial, PersonaTheme } from '../types/theme';
import type { AgentWidgetController } from '../ui';
import { createAgentExperience } from '../ui';
import { createWidgetHostLayout } from '../runtime/host-layout';
import { isDockedMountMode } from '../utils/dock';

import {
  DEVICE_DIMENSIONS,
  ZOOM_MIN,
  ZOOM_MAX,
  escapeHtml,
  buildShellCss,
  applyShellTheme,
  buildSrcdoc,
  buildPreviewConfig as buildPreviewConfigFromOptions,
  type PreviewScene,
} from './preview-utils';

// ─── Public Types ───────────────────────────────────────────────

export type PreviewDevice = 'desktop' | 'mobile';
export type { PreviewScene } from './preview-utils';
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

// ─── Preview Spec ───────────────────────────────────────────────

interface PreviewSpec {
  mountId: string;
  label: string;
  config: AgentWidgetConfig;
  shellMode: PreviewShellMode;
}

function buildSpecs(options: ThemePreviewOptions): PreviewSpec[] {
  const compare = options.compareMode ?? 'off';
  const shellMode = options.shellMode ?? 'light';

  if (compare === 'themes') {
    return [
      { mountId: 'preview-light', label: 'Light', config: buildPreviewConfigFromOptions(options, 'light'), shellMode: 'light' },
      { mountId: 'preview-dark', label: 'Dark', config: buildPreviewConfigFromOptions(options, 'dark'), shellMode: 'dark' },
    ];
  }

  return [
    { mountId: 'preview-current', label: 'Current', config: buildPreviewConfigFromOptions(options, shellMode), shellMode },
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
        ${compare ? `<div class="preview-frame-meta"><span class="preview-frame-label">${escapeHtml(spec.label)}</span></div>` : ''}
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
