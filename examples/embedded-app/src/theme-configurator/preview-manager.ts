/**
 * Preview Manager — encapsulates all preview-related logic extracted from index.ts.
 *
 * Responsibilities:
 *   - Background URL preview (types, state, embed checking, overlays, message handling)
 *   - Contrast checker (metrics, rendering, summary)
 *   - Zoom UI helpers (display, scroll)
 *   - Scene syncing (stage layout, wrapper shell mode)
 *   - Preview spec generation (layout signatures, frame markup, srcdoc)
 *   - Custom srcdoc builder (with background URLs + embedded inspection scripts)
 *   - Direct controller management using `createAgentExperience` from persona
 *   - Integration with inline editor zones (setup/destroy/refresh)
 *
 * The module composes preview rendering from shared primitives (device dimensions,
 * shell CSS, srcdoc templates) imported from `@runtypelabs/persona/theme-editor`,
 * and uses `createAgentExperience` from `@runtypelabs/persona` for widget mounting.
 * This keeps the test mock boundary intact while eliminating code duplication.
 */

import type { CompareMode, PreviewShellMode } from '@runtypelabs/persona/theme-editor';
import {
  DEVICE_DIMENSIONS,
  ZOOM_MIN,
  ZOOM_MAX,
  SHELL_STYLE_ID,
  MOCK_BROWSER_CONTENT,
  MOCK_WORKSPACE_CONTENT,
  escapeHtml,
  buildShellCss,
  applyShellTheme,
} from '@runtypelabs/persona/theme-editor';
import {
  createAgentExperience,
  createWidgetHostLayout,
  isDockedMountMode,
} from '@runtypelabs/persona';
import type { AgentWidgetConfig, AgentWidgetController } from '@runtypelabs/persona';
import { Idiomorph } from 'idiomorph';
import type * as StateModule from './state';
import { setupInlineZones, destroyInlineZones, refreshInlineZones } from './inline-editor';
import {
  normalizeColorValue,
  isValidHex,
} from './color-utils';

// ─── Preview Background Types ───────────────────────────────────

type PreviewBackgroundState = 'none' | 'checking' | 'loading' | 'loaded' | 'timeout' | 'blocked';
type PreviewEmbedCheckVerdict = 'allowed' | 'blocked' | 'unknown';
type PreviewBackgroundOverlayContent = {
  title: string;
  description?: string;
  tone: 'loading' | 'error';
};
type PreviewBackgroundInspection = {
  accessible: boolean;
  href?: string;
  title?: string;
  text?: string;
  hasBody?: boolean;
  bodyChildCount?: number;
};
type PreviewBackgroundMessage = {
  type: typeof PREVIEW_BG_MESSAGE_TYPE;
  mountId: string;
  renderToken: number;
  status: Exclude<PreviewBackgroundState, 'none'>;
  inspection?: PreviewBackgroundInspection;
};
type PreviewWindow = Window & typeof globalThis & {
  __personaPreviewBackgroundListener?: (event: MessageEvent<PreviewBackgroundMessage>) => void;
};

type PreviewMountSpec = {
  mountId: string;
  label: string;
  subtitle?: string;
  previewConfig: ReturnType<typeof import('./state').buildPreviewConfig>;
  shellMode: import('./state').PreviewShellMode;
  backgroundState: PreviewBackgroundState;
  layoutSignature: string;
};

type ContrastMetric = {
  label: string;
  ratio: string;
  pass: boolean;
};

// ─── Constants ──────────────────────────────────────────────────

const ZOOM_STEP = 0.1;
const PREVIEW_BG_LOAD_TIMEOUT_MS = 4000;
const PREVIEW_BG_ERROR_OVERLAY_TIMEOUT_MS = 3000;
const PREVIEW_BG_MESSAGE_TYPE = 'persona-theme-preview-background-state';
const PREVIEW_BG_EMBED_CHECK_ENDPOINT = '/api/preview/embed-check';
const PREVIEW_IFRAME_SHELL_STYLE_ID = SHELL_STYLE_ID;

// ─── Test Helpers (re-exported) ─────────────────────────────────

/**
 * Whether to render the mock page shell (browser chrome / workspace skeleton)
 * inside the iframe instead of a real background URL.
 */
export function shouldRenderMockPreviewShell(
  hasBackgroundUrl: boolean,
  backgroundState: PreviewBackgroundState
): boolean {
  if (!hasBackgroundUrl) return true;
  return (
    backgroundState === 'checking' ||
    backgroundState === 'timeout' ||
    backgroundState === 'blocked' ||
    backgroundState === 'none'
  );
}

/**
 * Human-readable status label shown above the preview stage.
 */
export function getPreviewBackgroundStatusLabel(
  frameStates: PreviewBackgroundState[],
  hasBackgroundUrl: boolean
): string {
  if (!hasBackgroundUrl || frameStates.length === 0) return '';

  const checkingCount = frameStates.filter((s) => s === 'checking').length;
  if (checkingCount > 0) return 'Checking preview site\u2026';

  const loadingCount = frameStates.filter((s) => s === 'loading').length;
  if (loadingCount > 0) return 'Loading preview site\u2026';

  const blockedCount = frameStates.filter((s) => s === 'blocked').length;
  if (blockedCount > 0) return '';

  const timeoutCount = frameStates.filter((s) => s === 'timeout').length;
  if (timeoutCount === 0) return '';

  if (frameStates.length > 1 && timeoutCount < frameStates.length) {
    return 'Some preview frames could not display this page. Showing mock fallback where needed.';
  }

  return "Couldn't display this page. Showing mock preview.";
}

/**
 * Badge label for the background URL input (e.g. "Blocked by X-Frame-Options").
 * Only shown when ALL frames are blocked.
 */
export function getPreviewBackgroundBadgeLabel(
  frameStates: PreviewBackgroundState[],
  backgroundUrl: string
): string {
  if (!backgroundUrl || frameStates.length === 0) return '';
  if (!frameStates.every((s) => s === 'blocked')) return '';

  const reason = _embedCheckReasonCache.get(backgroundUrl);
  if (reason === 'csp-frame-ancestors') return 'Blocked by site CSP';
  if (reason === 'x-frame-options') return 'Blocked by X-Frame-Options';
  return 'Iframe preview blocked';
}

/**
 * Infer effective background state from a cross-origin iframe inspection.
 * Detects blank pages, error pages, and CSP block markers.
 */
export function inferPreviewBackgroundStateFromInspection(
  inspection: PreviewBackgroundInspection | undefined,
  fallbackState: Extract<PreviewBackgroundState, 'loaded' | 'timeout'> = 'loaded'
): Extract<PreviewBackgroundState, 'loaded' | 'timeout'> {
  if (fallbackState === 'timeout') return 'timeout';
  if (!inspection || !inspection.accessible) return 'loaded';
  if (inspection.hasBody === false) return 'timeout';

  const href = (inspection.href ?? '').trim().toLowerCase();
  const title = (inspection.title ?? '').trim().toLowerCase();
  const text = (inspection.text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

  if (
    href === '' ||
    href === 'about:blank' ||
    href === 'about:srcdoc' ||
    href.startsWith('chrome-error://') ||
    href.startsWith('edge-error://') ||
    href.startsWith('about:neterror')
  ) {
    return 'timeout';
  }

  const blockedMarkers = [
    'refused to connect',
    'refused to display',
    'blocked by content security policy',
    'blocked by x-frame-options',
    'err_blocked_by_response',
    'cannot be displayed',
    "can't be displayed",
    'site can\u2019t be reached',
    "site can't be reached",
    'this page has been blocked',
  ];

  if (blockedMarkers.some((marker) => text.includes(marker) || title.includes(marker))) {
    return 'timeout';
  }

  if ((inspection.bodyChildCount ?? 0) === 0 && text.length === 0) {
    return 'timeout';
  }

  return 'loaded';
}

// ─── normalizePreviewBackgroundUrl ──────────────────────────────

/**
 * Normalize a user-entered background URL. Returns `null` for invalid input,
 * empty string for empty input, or a fully qualified http(s) URL.
 */
export function normalizePreviewBackgroundUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const candidate = hasProtocol ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return null;
    }

    if (hasProtocol) {
      return trimmed;
    }

    const hostname = parsed.hostname;
    const isBareDomainLike =
      hostname.includes('.') ||
      hostname === 'localhost' ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);

    if (!isBareDomainLike) {
      return null;
    }

    const pathname = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${parsed.protocol}//${parsed.host}${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

// ─── Module-level caches (shared across manager instances) ──────

/**
 * We keep these at module level rather than inside `createPreviewManager` so
 * that `getPreviewBackgroundBadgeLabel` (a re-exported test helper) can read
 * the reason cache without needing a manager reference.
 */
const _embedCheckCache = new Map<string, PreviewEmbedCheckVerdict>();
const _embedCheckReasonCache = new Map<string, string>();

// ─── Public API ─────────────────────────────────────────────────

export { CompareMode };

export interface PreviewManager {
  /** Full mount / remount of the preview (initial or after structural change). */
  mount(): void;
  /** Fast-path update of the preview (config/theme change without structural change). */
  update(): void;
  /** Change compare mode and optionally supply a baseline snapshot. */
  setCompareMode(mode: CompareMode, baseline?: import('./state').ConfiguratorSnapshot): void;
  /** Toggle contrast overlay on/off. */
  setContrastMode(enabled: boolean): void;
  /** Get the current computed scale factor. */
  getCurrentScale(): number;
  /** Inject sample artifacts into all preview controllers. */
  injectArtifacts(force?: boolean): void;
  /** Set explicit zoom (or null for auto-fit). */
  setZoom(zoom: number | null): void;
  /** Reset zoom and resize frames for a device change. */
  resizeFrames(): void;
  /** Highlight a preview zone (e.g. 'header', 'user-message') in all iframes. */
  highlightZone(zone: string): void;
  /** Remove any active zone highlight from all iframes. */
  clearHighlight(): void;
  /** Clean up all resources. */
  destroy(): void;
}

export function createPreviewManager(
  container: HTMLElement,
  stateModule: typeof StateModule
): PreviewManager {
  // ─── Local state ────────────────────────────────────────────

  let compareMode: CompareMode = 'off';
  let baselineSnapshot: import('./state').ConfiguratorSnapshot | null = null;
  let contrastMode = false;
  let zoomOverride: number | null = null;
  let lastAutoScale = 1;
  let lastMountedScene: import('./state').PreviewScene | null = null;
  let previewRenderToken = 0;
  let previewEmbedCheckRequestId = 0;
  let previewBackgroundStates = new Map<string, PreviewBackgroundState>();
  let previewBackgroundUrlKey = '';
  let previewMountSignature = '';
  let previewControllers: AgentWidgetController[] = [];
  let previewLayoutCleanups: Array<() => void> = [];
  let previewResizeObserver: ResizeObserver | null = null;
  let activeHighlightZone: string | null = null;

  const previewEmbedCheckInFlight = new Map<string, number>();
  const previewBackgroundOverlayTimers = new Map<string, { timeoutId: number; dismissKey: string }>();
  const previewBackgroundOverlayDismissed = new Map<string, string>();

  // ─── Background state helpers ───────────────────────────────

  function getPreviewBackgroundState(mountId: string): PreviewBackgroundState {
    return previewBackgroundStates.get(mountId) ?? 'none';
  }

  function getInitialPreviewBackgroundState(url: string): PreviewBackgroundState {
    if (!url) return 'none';
    const cachedVerdict = _embedCheckCache.get(url);
    if (cachedVerdict === 'blocked') return 'blocked';
    if (cachedVerdict === 'allowed' || cachedVerdict === 'unknown') return 'loading';
    return 'checking';
  }

  function setPreviewBackgroundState(mountId: string, backgroundState: PreviewBackgroundState): void {
    previewBackgroundStates.set(mountId, backgroundState);
  }

  function setAllPreviewBackgroundStates(
    nextState: PreviewBackgroundState,
    predicate?: (currentState: PreviewBackgroundState, mountId: string) => boolean
  ): void {
    for (const [mountId, currentState] of previewBackgroundStates.entries()) {
      if (!predicate || predicate(currentState, mountId)) {
        previewBackgroundStates.set(mountId, nextState);
        applyPreviewBackgroundStateToWrapper(mountId, nextState);
      }
    }
  }

  function getPreviewMountSignature(mountIds: string[]): string {
    return [...mountIds].sort().join('|');
  }

  function getPreviewBackgroundOverlayDismissKey(backgroundState: PreviewBackgroundState): string {
    return `${stateModule.getPreviewBackgroundUrl()}::${backgroundState}`;
  }

  function clearPreviewBackgroundOverlayTimer(mountId: string): void {
    const existingTimer = previewBackgroundOverlayTimers.get(mountId);
    if (!existingTimer) return;
    window.clearTimeout(existingTimer.timeoutId);
    previewBackgroundOverlayTimers.delete(mountId);
  }

  function schedulePreviewBackgroundOverlayDismiss(
    mountId: string,
    backgroundState: Extract<PreviewBackgroundState, 'blocked' | 'timeout'>
  ): void {
    const dismissKey = getPreviewBackgroundOverlayDismissKey(backgroundState);
    const existingTimer = previewBackgroundOverlayTimers.get(mountId);
    if (existingTimer?.dismissKey === dismissKey) return;

    clearPreviewBackgroundOverlayTimer(mountId);

    const timeoutId = window.setTimeout(() => {
      previewBackgroundOverlayTimers.delete(mountId);
      previewBackgroundOverlayDismissed.set(mountId, dismissKey);

      const wrapper = document.querySelector<HTMLElement>(
        `.preview-iframe-wrapper[data-mount-id="${mountId}"]`
      );
      if (!wrapper) return;
      if (wrapper.dataset.backgroundState !== backgroundState) return;
      wrapper.querySelector<HTMLElement>('.preview-background-overlay')?.remove();
    }, PREVIEW_BG_ERROR_OVERLAY_TIMEOUT_MS);

    previewBackgroundOverlayTimers.set(mountId, { timeoutId, dismissKey });
  }

  function getPreviewBackgroundOverlayContent(
    backgroundState: PreviewBackgroundState
  ): PreviewBackgroundOverlayContent | null {
    if (backgroundState === 'checking') {
      return { title: 'Checking preview site...', tone: 'loading' };
    }
    if (backgroundState === 'loading') {
      return { title: 'Loading preview site...', tone: 'loading' };
    }
    if (backgroundState === 'blocked') {
      return {
        title: 'Preview unavailable',
        description: 'This site blocks iframe previews. Showing mock preview instead.',
        tone: 'error',
      };
    }
    if (backgroundState === 'timeout') {
      return {
        title: 'Preview unavailable',
        description: 'We could not load this page. Showing mock preview instead.',
        tone: 'error',
      };
    }
    return null;
  }

  function ensurePreviewBackgroundOverlay(
    mountId: string,
    wrapper: HTMLElement,
    backgroundState: PreviewBackgroundState
  ): void {
    const content = getPreviewBackgroundOverlayContent(backgroundState);
    const existingOverlay = wrapper.querySelector<HTMLElement>('.preview-background-overlay');

    if (!content) {
      clearPreviewBackgroundOverlayTimer(mountId);
      previewBackgroundOverlayDismissed.delete(mountId);
      existingOverlay?.remove();
      return;
    }

    if (content.tone !== 'error') {
      clearPreviewBackgroundOverlayTimer(mountId);
      previewBackgroundOverlayDismissed.delete(mountId);
    } else {
      const dismissKey = getPreviewBackgroundOverlayDismissKey(backgroundState);
      if (previewBackgroundOverlayDismissed.get(mountId) === dismissKey) {
        existingOverlay?.remove();
        return;
      }
    }

    const overlay = existingOverlay ?? document.createElement('div');
    overlay.className = 'preview-background-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.dataset.tone = content.tone;
    overlay.innerHTML = `
      <div class="preview-background-overlay-card">
        ${
          content.tone === 'loading'
            ? '<span class="preview-background-overlay-spinner"></span>'
            : '<span class="preview-background-overlay-icon">!</span>'
        }
        <span class="preview-background-overlay-copy">
          <span class="preview-background-overlay-label">${escapeHtml(content.title)}</span>
          ${
            content.description
              ? `<span class="preview-background-overlay-description">${escapeHtml(content.description)}</span>`
              : ''
          }
        </span>
      </div>
    `;

    if (!existingOverlay) {
      wrapper.appendChild(overlay);
    }

    if (content.tone === 'error') {
      schedulePreviewBackgroundOverlayDismiss(
        mountId,
        backgroundState as Extract<PreviewBackgroundState, 'blocked' | 'timeout'>
      );
    }
  }

  function applyPreviewBackgroundStateToWrapper(
    mountId: string,
    backgroundState: PreviewBackgroundState
  ): void {
    const wrapper = document.querySelector<HTMLElement>(
      `.preview-iframe-wrapper[data-mount-id="${mountId}"]`
    );
    if (wrapper) {
      if (wrapper.dataset.backgroundState !== backgroundState) {
        clearPreviewBackgroundOverlayTimer(mountId);
      }
      wrapper.dataset.backgroundState = backgroundState;
      ensurePreviewBackgroundOverlay(mountId, wrapper, backgroundState);
    }
  }

  function updatePreviewStatusLabel(): void {
    const label = document.querySelector<HTMLElement>('.preview-status-label');
    const badge = document.getElementById('preview-url-badge');
    const backgroundUrl = stateModule.getPreviewBackgroundUrl();
    const hasBackgroundUrl = !!backgroundUrl;
    const frameStates = Array.from(previewBackgroundStates.values());

    if (label) {
      label.textContent = getPreviewBackgroundStatusLabel(frameStates, hasBackgroundUrl);
    }

    if (badge) {
      const badgeLabel = getPreviewBackgroundBadgeLabel(frameStates, backgroundUrl);
      badge.textContent = badgeLabel;
      badge.hidden = badgeLabel === '';
      if (badgeLabel) {
        badge.setAttribute('title', badgeLabel);
      } else {
        badge.removeAttribute('title');
      }
    }
  }

  function syncPreviewBackgroundStates(
    specs: Array<Pick<PreviewMountSpec, 'mountId'>>,
    preserveStates: boolean
  ): void {
    const backgroundUrl = stateModule.getPreviewBackgroundUrl();
    const mountIds = specs.map((spec) => spec.mountId);
    const nextSignature = getPreviewMountSignature(mountIds);
    const shouldReset =
      !preserveStates ||
      previewBackgroundUrlKey !== backgroundUrl ||
      previewMountSignature !== nextSignature;

    if (shouldReset) {
      const initialState = getInitialPreviewBackgroundState(backgroundUrl);
      previewBackgroundStates = new Map(
        mountIds.map((mountId) => [mountId, initialState] as const)
      );
    } else {
      for (const mountId of mountIds) {
        if (!previewBackgroundStates.has(mountId)) {
          previewBackgroundStates.set(mountId, getInitialPreviewBackgroundState(backgroundUrl));
        }
      }
    }

    previewBackgroundUrlKey = backgroundUrl;
    previewMountSignature = nextSignature;
  }

  function shouldRebuildPreviewForBackgroundStateChange(
    previousState: PreviewBackgroundState,
    nextState: PreviewBackgroundState,
    hasBackgroundUrl: boolean
  ): boolean {
    return (
      shouldRenderMockPreviewShell(hasBackgroundUrl, previousState) !==
      shouldRenderMockPreviewShell(hasBackgroundUrl, nextState)
    );
  }

  // ─── Embed check ────────────────────────────────────────────

  async function checkPreviewBackgroundEmbeddable(
    url: string,
    requestId: number
  ): Promise<void> {
    try {
      const response = await fetch(
        `${PREVIEW_BG_EMBED_CHECK_ENDPOINT}?url=${encodeURIComponent(url)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!response.ok) {
        throw new Error(`Preview embed check failed with ${response.status}`);
      }

      const result = (await response.json()) as {
        verdict?: PreviewEmbedCheckVerdict;
        reason?: string;
      };
      const verdict =
        result.verdict === 'blocked' || result.verdict === 'allowed'
          ? result.verdict
          : 'unknown';

      if (
        requestId !== previewEmbedCheckRequestId ||
        stateModule.getPreviewBackgroundUrl() !== url
      ) {
        return;
      }

      _embedCheckCache.set(url, verdict);
      _embedCheckReasonCache.set(url, result.reason ?? verdict);
      if (verdict === 'blocked') {
        const shouldRemount = Array.from(previewBackgroundStates.values()).some(
          (currentState) => currentState !== 'blocked'
        );
        setAllPreviewBackgroundStates('blocked');
        if (shouldRemount) {
          doMount(true);
        } else {
          updatePreviewStatusLabel();
        }
        return;
      }

      setAllPreviewBackgroundStates('loading', (currentState) => currentState === 'checking');
      doMount(true);
    } catch {
      if (
        requestId !== previewEmbedCheckRequestId ||
        stateModule.getPreviewBackgroundUrl() !== url
      ) {
        return;
      }

      _embedCheckCache.set(url, 'unknown');
      _embedCheckReasonCache.set(url, 'network-error');
      setAllPreviewBackgroundStates('loading', (currentState) => currentState === 'checking');
      doMount(true);
    } finally {
      if (previewEmbedCheckInFlight.get(url) === requestId) {
        previewEmbedCheckInFlight.delete(url);
      }
    }
  }

  function ensurePreviewEmbedCheck(): void {
    const backgroundUrl = stateModule.getPreviewBackgroundUrl();
    if (!backgroundUrl) return;
    if (!Array.from(previewBackgroundStates.values()).some((s) => s === 'checking')) return;
    if (_embedCheckCache.has(backgroundUrl)) return;
    if (previewEmbedCheckInFlight.has(backgroundUrl)) return;

    const requestId = ++previewEmbedCheckRequestId;
    previewEmbedCheckInFlight.set(backgroundUrl, requestId);
    void checkPreviewBackgroundEmbeddable(backgroundUrl, requestId);
  }

  // ─── Background message handler ─────────────────────────────

  function handlePreviewBackgroundMessage(event: MessageEvent<PreviewBackgroundMessage>): void {
    const data = event.data;
    if (!data || data.type !== PREVIEW_BG_MESSAGE_TYPE) return;
    if (data.renderToken !== previewRenderToken) return;
    if (!previewBackgroundStates.has(data.mountId)) return;

    const nextState =
      data.status === 'loaded'
        ? inferPreviewBackgroundStateFromInspection(data.inspection, 'loaded')
        : data.status;

    const previousState = getPreviewBackgroundState(data.mountId);
    if (previousState === nextState) return;

    setPreviewBackgroundState(data.mountId, nextState);
    applyPreviewBackgroundStateToWrapper(data.mountId, nextState);
    updatePreviewStatusLabel();

    const hasBackgroundUrl = !!stateModule.getPreviewBackgroundUrl();
    if (shouldRebuildPreviewForBackgroundStateChange(previousState, nextState, hasBackgroundUrl)) {
      doMount(true);
    }
  }

  function bindPreviewBackgroundMessageListener(): void {
    const previewWindow = window as PreviewWindow;
    if (previewWindow.__personaPreviewBackgroundListener) {
      window.removeEventListener('message', previewWindow.__personaPreviewBackgroundListener);
    }
    previewWindow.__personaPreviewBackgroundListener = handlePreviewBackgroundMessage;
    window.addEventListener('message', handlePreviewBackgroundMessage);
  }

  function unbindPreviewBackgroundMessageListener(): void {
    const previewWindow = window as PreviewWindow;
    if (previewWindow.__personaPreviewBackgroundListener) {
      window.removeEventListener('message', previewWindow.__personaPreviewBackgroundListener);
      delete previewWindow.__personaPreviewBackgroundListener;
    }
  }

  // ─── Preview spec generation ────────────────────────────────

  function getPreviewLayoutSignature(config: AgentWidgetConfig): string {
    const initialMessagesSignature = (config.initialMessages ?? [])
      .map((message) => {
        const toolStatus = message.toolCall?.status ?? '';
        const reasoningStatus = message.reasoning?.status ?? '';
        return [message.id, message.variant ?? '', message.role, toolStatus, reasoningStatus].join(':');
      })
      .join('|');

    const featureSignature = [
      config.features?.showReasoning ? '1' : '0',
      config.features?.showToolCalls ? '1' : '0',
      config.features?.toolCallDisplay?.collapsedMode ?? '',
      config.features?.toolCallDisplay?.activePreview ? '1' : '0',
      config.features?.toolCallDisplay?.grouped ? '1' : '0',
      config.features?.toolCallDisplay?.previewMaxLines ?? '',
      config.features?.toolCallDisplay?.activeMinHeight ?? '',
      config.features?.reasoningDisplay?.activePreview ? '1' : '0',
      config.features?.reasoningDisplay?.previewMaxLines ?? '',
      config.features?.reasoningDisplay?.activeMinHeight ?? '',
    ].join(',');

    const mode = isDockedMountMode(config) ? `docked:${(config.launcher?.dock ?? {}).side ?? 'right'}:${(config.launcher?.dock ?? {}).width ?? '420px'}` : 'floating';
    return [mode, featureSignature, initialMessagesSignature].join('::');
  }

  function getPreviewSpecs(preserveBackgroundStates = false): PreviewMountSpec[] {
    const currentSnapshot = stateModule.exportSnapshot();
    const activeBaselineSnapshot = baselineSnapshot ?? currentSnapshot;
    const previewScene = stateModule.getPreviewScene();
    const rawSpecs =
      compareMode === 'baseline'
        ? [
            {
              mountId: 'preview-baseline',
              label: 'Baseline',
              subtitle: 'Captured comparison state',
              snapshot: activeBaselineSnapshot,
              previewMode: stateModule.getPreviewMode(),
            },
            {
              mountId: 'preview-current',
              label: 'Current',
              subtitle: 'Live editor state',
              snapshot: currentSnapshot,
              previewMode: stateModule.getPreviewMode(),
            },
          ]
        : compareMode === 'themes'
          ? [
              {
                mountId: 'preview-light',
                label: 'Light',
                subtitle: 'Current config in light mode',
                snapshot: currentSnapshot,
                previewMode: 'light' as const,
              },
              {
                mountId: 'preview-dark',
                label: 'Dark',
                subtitle: 'Current config in dark mode',
                snapshot: currentSnapshot,
                previewMode: 'dark' as const,
              },
            ]
          : [
              {
                mountId: 'preview-current',
                label: 'Current',
                subtitle: 'Live editor state',
                snapshot: currentSnapshot,
                previewMode: stateModule.getPreviewMode(),
              },
            ];

    syncPreviewBackgroundStates(rawSpecs, preserveBackgroundStates);

    return rawSpecs.map(({ mountId, label, subtitle, snapshot, previewMode }) => {
      const previewConfig = stateModule.buildPreviewConfig(snapshot, previewMode, previewScene);
      return {
        mountId,
        label,
        subtitle,
        previewConfig,
        shellMode: stateModule.resolvePreviewShellMode(snapshot, previewMode, previewScene),
        backgroundState: getPreviewBackgroundState(mountId),
        layoutSignature: getPreviewLayoutSignature(previewConfig),
      };
    });
  }

  // ─── Preview frame markup ───────────────────────────────────

  function getPreviewFrameMarkup(spec: PreviewMountSpec, renderToken: number): string {
    const device = stateModule.getPreviewDevice();
    const wrapperClass =
      device === 'mobile'
        ? 'preview-iframe-wrapper preview-iframe-wrapper-mobile'
        : 'preview-iframe-wrapper';
    const overlayContent = getPreviewBackgroundOverlayContent(spec.backgroundState);
    const overlayMarkup = overlayContent
      ? `
        <div class="preview-background-overlay" data-tone="${overlayContent.tone}" aria-hidden="true">
          <div class="preview-background-overlay-card">
            ${
              overlayContent.tone === 'loading'
                ? '<span class="preview-background-overlay-spinner"></span>'
                : '<span class="preview-background-overlay-icon">!</span>'
            }
            <span class="preview-background-overlay-copy">
              <span class="preview-background-overlay-label">${escapeHtml(overlayContent.title)}</span>
              ${
                overlayContent.description
                  ? `<span class="preview-background-overlay-description">${escapeHtml(overlayContent.description)}</span>`
                  : ''
              }
            </span>
          </div>
        </div>`
      : '';

    const isCompare = compareMode !== 'off';
    return `
      <div class="${wrapperClass}" data-mount-id="${spec.mountId}" data-device="${device}" data-shell-mode="${spec.shellMode}" data-background-state="${spec.backgroundState}" data-layout-signature="${escapeHtml(spec.layoutSignature)}" data-render-token="${renderToken}">
        ${
          isCompare
            ? `
              <div class="preview-frame-meta">
                <span class="preview-frame-label">${escapeHtml(spec.label)}</span>
                ${spec.subtitle ? `<span class="preview-frame-subtitle">${escapeHtml(spec.subtitle)}</span>` : ''}
              </div>
            `
            : ''
        }
        <iframe class="preview-iframe" sandbox="allow-scripts allow-same-origin" data-mount-id="${spec.mountId}"></iframe>
        ${overlayMarkup}
      </div>
    `;
  }

  // ─── Custom srcdoc builder (with background URL support) ────

  function getIframeSrcdoc(
    spec: PreviewMountSpec,
    renderToken: number
  ): string {
    const { mountId, shellMode, backgroundState, previewConfig } = spec;
    const dockedMode = isDockedMountMode(previewConfig);
    const bgUrl = stateModule.getPreviewBackgroundUrl();
    const hasBgUrl = !!bgUrl;
    const showMockShell = shouldRenderMockPreviewShell(hasBgUrl, backgroundState);
    const showBackgroundFrame = hasBgUrl && (backgroundState === 'loading' || backgroundState === 'loaded');

    const backgroundFrameId = `preview-background-${mountId}`;
    const mockContent = showMockShell ? MOCK_BROWSER_CONTENT : '';
    const dockedWorkspaceContent = showMockShell ? MOCK_WORKSPACE_CONTENT : '';
    const bgIframe = showBackgroundFrame
      ? `<iframe id="${backgroundFrameId}" src="${escapeHtml(bgUrl)}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;z-index:0;" aria-hidden="true"></iframe>`
      : '';
    const bgScript = showBackgroundFrame
      ? `<script>
      (function() {
        var frame = document.getElementById(${JSON.stringify(backgroundFrameId)});
        if (!frame || !window.parent || !window.parent.postMessage) return;
        var resolved = false;
        var buildInspection = function() {
          try {
            var doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document) || null;
            if (!doc) {
              return { accessible: false };
            }
            var body = doc.body || null;
            var href = '';
            try {
              href = String((doc.location && doc.location.href) || '');
            } catch (error) {}
            var title = '';
            try {
              title = String(doc.title || '');
            } catch (error) {}
            var text = '';
            if (body) {
              text = String(body.innerText || body.textContent || '').slice(0, 500);
            }
            return {
              accessible: true,
              href: href,
              title: title,
              text: text,
              hasBody: !!body,
              bodyChildCount: body ? body.children.length : 0
            };
          } catch (error) {
            return { accessible: false };
          }
        };
        var message = function(status, inspection) {
          if (resolved) return;
          if (status !== 'loading') {
            resolved = true;
          }
          var payload = {
            type: ${JSON.stringify(PREVIEW_BG_MESSAGE_TYPE)},
            mountId: ${JSON.stringify(mountId)},
            renderToken: ${renderToken},
            status: status
          };
          if (inspection) {
            payload.inspection = inspection;
          }
          window.parent.postMessage(payload, '*');
        };
        var handleViolation = function(event) {
          var directive = String((event && (event.effectiveDirective || event.violatedDirective)) || '');
          if (directive.indexOf('frame-ancestors') !== 0) return;
          if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
          }
          message('timeout', {
            accessible: true,
            href: '',
            title: '',
            text: directive,
            hasBody: false,
            bodyChildCount: 0
          });
        };
        window.addEventListener('securitypolicyviolation', handleViolation, { once: true });
        frame.addEventListener('load', function() {
          if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
          }
          message('loaded', buildInspection());
        }, { once: true });
        var timeoutId = null;
        if (${JSON.stringify(backgroundState)} === 'loading') {
          timeoutId = window.setTimeout(function() {
            message('timeout');
          }, ${PREVIEW_BG_LOAD_TIMEOUT_MS});
          message('loading');
        }
      })();
    </script>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/widget-dist/widget.css">
  <style id="${PREVIEW_IFRAME_SHELL_STYLE_ID}">
    ${buildShellCss(shellMode)}
  </style>
</head>
<body>
  ${
    dockedMode
      ? `
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
              ${bgIframe}
              ${dockedWorkspaceContent}
            </div>
          </div>
        </div>
      `
      : `
        ${bgIframe}
        ${mockContent}
        <div style="position:fixed;inset:0;z-index:9999;"><div id="${mountId}" data-mount-id="${mountId}"></div></div>
      `
  }
  ${bgScript}
</body>
</html>`;
  }

  // ─── Scene + shell syncing ──────────────────────────────────

  function syncPreviewStageLayoutForScene(): void {
    const isMinimized = stateModule.getPreviewScene() === 'minimized';
    const launcherClass = 'preview-launcher-canvas';
    container.querySelectorAll('.preview-single, .preview-compare-cell').forEach((el) => {
      el.classList.toggle(launcherClass, isMinimized);
    });
  }

  function syncPreviewWrapperShellAndShellMode(specs: PreviewMountSpec[]): void {
    for (const spec of specs) {
      const wrapper = container.querySelector<HTMLElement>(
        `.preview-iframe-wrapper[data-mount-id="${spec.mountId}"]`
      );
      if (!wrapper) continue;
      const next = spec.shellMode;
      if (wrapper.dataset.shellMode !== next) {
        wrapper.dataset.shellMode = next;
      }
      const iframe = wrapper.querySelector<HTMLIFrameElement>('iframe[data-mount-id]');
      if (iframe) {
        applyShellTheme(iframe, next);
      }
    }
  }

  // ─── Zoom UI helpers ────────────────────────────────────────

  function updateZoomDisplay(scale: number): void {
    const zoomLevel = document.getElementById('zoom-level');
    if (zoomLevel) {
      zoomLevel.textContent = `${Math.round(scale * 100)}%`;
    }
  }

  function scrollToWidgetArea(scale: number): void {
    if (scale <= lastAutoScale) return;

    const position = (stateModule.getConfig() as any).launcher?.position ?? 'bottom-right';

    const doScroll = (): void => {
      container.scrollLeft = position.includes('right') ? container.scrollWidth : 0;
      container.scrollTop = position.includes('bottom') ? container.scrollHeight : 0;
    };

    // Try immediately after reflow
    void container.offsetHeight;
    doScroll();

    // Retry after paint in case layout wasn't ready
    requestAnimationFrame(() => doScroll());
  }

  // ─── Contrast checker ───────────────────────────────────────

  function colorToHex(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('#')) {
      return isValidHex(normalizeColorValue(trimmed)) ? normalizeColorValue(trimmed) : null;
    }

    const rgb = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!rgb) return null;
    return `#${[rgb[1], rgb[2], rgb[3]]
      .map((part) => Number(part).toString(16).padStart(2, '0'))
      .join('')}`;
  }

  function contrastRatio(foreground: string, background: string): string {
    const luminance = (hex: string) => {
      const channels = [1, 3, 5].map((index) => {
        const value = parseInt(hex.slice(index, index + 2), 16) / 255;
        return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };

    const l1 = luminance(foreground);
    const l2 = luminance(background);
    return ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(1);
  }

  function getPreviewRootByMountId(mountId: string): HTMLElement | null {
    const iframe = container.querySelector<HTMLIFrameElement>(
      `iframe[data-mount-id="${mountId}"]`
    );
    return iframe?.contentDocument?.getElementById('persona-root') ?? null;
  }

  function getContrastMetrics(root: HTMLElement): ContrastMetric[] {
    const styles = getComputedStyle(root);
    const pairs = [
      {
        label: 'Text / background',
        foreground: colorToHex(styles.getPropertyValue('--persona-text')),
        background: colorToHex(styles.getPropertyValue('--persona-background')),
      },
      {
        label: 'Text / surface',
        foreground: colorToHex(styles.getPropertyValue('--persona-text')),
        background: colorToHex(styles.getPropertyValue('--persona-surface')),
      },
      {
        label: 'User bubble',
        foreground: colorToHex(styles.getPropertyValue('--persona-message-user-text')),
        background: colorToHex(styles.getPropertyValue('--persona-message-user-bg')),
      },
      {
        label: 'Assistant bubble',
        foreground: colorToHex(styles.getPropertyValue('--persona-message-assistant-text')),
        background: colorToHex(styles.getPropertyValue('--persona-message-assistant-bg')),
      },
    ];

    return pairs
      .filter(
        (pair): pair is { label: string; foreground: string; background: string } =>
          !!pair.foreground && !!pair.background
      )
      .map((pair) => {
        const ratio = contrastRatio(pair.foreground, pair.background);
        return {
          label: pair.label,
          ratio,
          pass: Number(ratio) >= 4.5,
        };
      });
  }

  function getContrastMetricsForMount(mountId: string): ContrastMetric[] {
    const root = getPreviewRootByMountId(mountId);
    return root ? getContrastMetrics(root) : [];
  }

  function renderContrastGroup(title: string, metrics: ContrastMetric[]): string {
    if (metrics.length === 0) return '';

    return `
      <div class="contrast-group">
        <div class="contrast-group-title">${escapeHtml(title)}</div>
        <div class="contrast-metric-list">
          ${metrics
            .map(
              (metric) => `
            <div class="contrast-metric">
              <span class="contrast-metric-label">${escapeHtml(metric.label)}</span>
              <span class="contrast-metric-value">${metric.ratio}:1</span>
              <span class="contrast-metric-badge" data-pass="${metric.pass ? 'true' : 'false'}">
                ${metric.pass ? 'AA pass' : 'AA fail'}
              </span>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  function updateContrastSummary(): void {
    const summary = document.getElementById('contrast-summary');
    if (!summary) return;

    if (!contrastMode) {
      summary.classList.add('hidden');
      summary.innerHTML = '';
      return;
    }

    const groups =
      compareMode === 'themes'
        ? [
            { title: 'Light', metrics: getContrastMetricsForMount('preview-light') },
            { title: 'Dark', metrics: getContrastMetricsForMount('preview-dark') },
          ]
        : [
            {
              title:
                stateModule.getEditingTheme() === 'dark'
                  ? 'Editing dark tokens'
                  : 'Editing light tokens',
              metrics:
                getContrastMetricsForMount('preview-current').length > 0
                  ? getContrastMetricsForMount('preview-current')
                  : getContrastMetricsForMount('preview-baseline'),
            },
          ];

    const validGroups = groups.filter((group) => group.metrics.length > 0);
    if (validGroups.length === 0) {
      summary.classList.add('hidden');
      summary.innerHTML = '';
      return;
    }

    summary.innerHTML = validGroups
      .map((group) => renderContrastGroup(group.title, group.metrics))
      .join('');
    summary.classList.remove('hidden');
  }

  // ─── Artifact injection ─────────────────────────────────────

  function injectPreviewArtifacts(force = false): void {
    const controllers = previewControllers;
    if (!force) {
      const artifactsEnabled =
        stateModule.get('features.artifacts.enabled') ||
        stateModule.getPreviewScene() === 'artifact';
      if (!artifactsEnabled) return;
    }
    for (const controller of controllers) {
      controller.upsertArtifact({
        id: 'configurator-sample',
        artifactType: 'markdown',
        title: 'Sample Document',
        content:
          '# Sample Artifact\n\nThis is a preview of the artifact sidebar.\n\n## Features\n\n- Markdown rendering\n- Document toolbar\n- Resizable panes',
      });
    }
  }


  // ─── Direct controller management ─────────────────────────────

  function createPreviewMount(host: HTMLElement, mountId: string, config: AgentWidgetConfig): HTMLElement {
    const mount = host.ownerDocument.createElement('div');
    mount.id = mountId;

    if (config.launcher?.enabled === false || isDockedMountMode(config)) {
      mount.style.height = '100%';
      mount.style.display = 'flex';
      mount.style.flexDirection = 'column';
      mount.style.flex = '1';
      mount.style.minHeight = '0';
    }

    host.appendChild(mount);
    return mount;
  }

  function destroyPreviewControllers(): void {
    destroyInlineZones();
    for (const controller of previewControllers) {
      controller.destroy();
    }
    for (const cleanup of previewLayoutCleanups) {
      cleanup();
    }
    previewControllers = [];
    previewLayoutCleanups = [];
  }

  function isCompareActive(): boolean {
    return compareMode !== 'off';
  }

  function computeFitScale(): number {
    const stageStyle = getComputedStyle(container);
    const stagePadX = parseFloat(stageStyle.paddingLeft) + parseFloat(stageStyle.paddingRight);
    const stagePadY = parseFloat(stageStyle.paddingTop) + parseFloat(stageStyle.paddingBottom);
    const shadowMargin = 40;
    const availW = (container.clientWidth - stagePadX - shadowMargin) / (isCompareActive() ? 2 : 1);
    const availH = container.clientHeight - stagePadY - shadowMargin;
    if (availW <= 0 || availH <= 0) return 1;

    const device = stateModule.getPreviewDevice();
    const dims = DEVICE_DIMENSIONS[device] ?? DEVICE_DIMENSIONS.desktop;
    return Math.min(availW / dims.w, availH / dims.h, 1);
  }

  function applyPreviewScale(): void {
    const wrappers = Array.from(container.querySelectorAll('.preview-iframe-wrapper')) as HTMLElement[];
    if (wrappers.length === 0) return;

    lastAutoScale = computeFitScale();
    const scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomOverride ?? lastAutoScale));

    for (const wrapper of wrappers) {
      const device = wrapper.dataset.device ?? 'desktop';
      const dims = DEVICE_DIMENSIONS[device] ?? DEVICE_DIMENSIONS.desktop;

      wrapper.style.width = `${dims.w * scale}px`;
      wrapper.style.height = `${dims.h * scale}px`;

      if (device === 'mobile') {
        wrapper.style.borderRadius = `${32 * scale}px`;
      }

      const iframe = wrapper.querySelector('iframe') as HTMLIFrameElement | null;
      if (iframe) {
        iframe.style.width = `${dims.w}px`;
        iframe.style.height = `${dims.h}px`;
        iframe.style.transformOrigin = 'top left';
        iframe.style.transition = 'none';
        iframe.style.transform = `scale(${scale})`;
      }
    }

    updateZoomDisplay(scale);
    scrollToWidgetArea(scale);
    if (previewControllers.length > 0) {
      refreshInlineZones();
    }
  }

  function doMount(preserveBackgroundStates = false): void {
    destroyPreviewControllers();
    lastMountedScene = stateModule.getPreviewScene();

    const specs = getPreviewSpecs(preserveBackgroundStates);
    const renderToken = ++previewRenderToken;
    const isMinimized = stateModule.getPreviewScene() === 'minimized';
    const singleClass = isMinimized ? 'preview-single preview-launcher-canvas' : 'preview-single';
    const cellClass = isMinimized ? 'preview-compare-cell preview-launcher-canvas' : 'preview-compare-cell';
    const markup = isCompareActive()
      ? `<div class="preview-compare-grid">${specs
          .map((spec) => `<div class="${cellClass}">${getPreviewFrameMarkup(spec, renderToken)}</div>`)
          .join('')}</div>`
      : `<div class="${singleClass}">${getPreviewFrameMarkup(specs[0], renderToken)}</div>`;

    Idiomorph.morph(container, markup, { morphStyle: 'innerHTML' });
    specs.forEach((spec) => applyPreviewBackgroundStateToWrapper(spec.mountId, spec.backgroundState));
    updatePreviewStatusLabel();
    ensurePreviewEmbedCheck();

    const iframes = Array.from(container.querySelectorAll<HTMLIFrameElement>('iframe[data-mount-id]'));
    let loadedCount = 0;
    const totalToLoad = iframes.length;
    let mounted = false;
    const isCurrentRenderToken = (iframe: HTMLIFrameElement): boolean => {
      const wrapper = iframe.closest<HTMLElement>('.preview-iframe-wrapper');
      return (
        wrapper?.dataset.renderToken === String(renderToken) &&
        renderToken === previewRenderToken
      );
    };

    const mountAllWidgets = (): void => {
      if (mounted || renderToken !== previewRenderToken) return;
      mounted = true;

      for (const iframe of iframes) {
        if (!isCurrentRenderToken(iframe)) continue;
        const mountId = iframe.dataset.mountId;
        if (!mountId) continue;
        const spec = specs.find((s) => s.mountId === mountId);
        if (!spec || !iframe.contentDocument) continue;

        let layoutCleanup = () => {};
        let syncDockState: (() => void) | null = null;
        const mount = isDockedMountMode(spec.previewConfig)
          ? (() => {
              const contentRoot = iframe.contentDocument?.getElementById(`preview-content-${mountId}`) as HTMLElement | null;
              if (!contentRoot) return null;
              const hostLayout = createWidgetHostLayout(contentRoot, spec.previewConfig);
              syncDockState = () => hostLayout.syncWidgetState(controller.getState());
              layoutCleanup = () => hostLayout.destroy();
              return createPreviewMount(hostLayout.host, mountId, spec.previewConfig);
            })()
          : iframe.contentDocument.getElementById(mountId);
        if (!mount) continue;

        const controller = createAgentExperience(mount, spec.previewConfig);
        previewControllers.push(controller);
        if (syncDockState) {
          const openUnsub = controller.on('widget:opened', syncDockState);
          const closeUnsub = controller.on('widget:closed', syncDockState);
          const previousCleanup = layoutCleanup;
          layoutCleanup = () => {
            openUnsub();
            closeUnsub();
            previousCleanup();
          };
          syncDockState();
        }

        // Inline edit overlays use getBoundingClientRect() inside the iframe. Reflow on open/close.
        {
          let reflowAfterTransition: ReturnType<typeof setTimeout> | null = null;
          const scheduleInlineZoneReflow = (): void => {
            refreshInlineZones();
            if (reflowAfterTransition !== null) {
              clearTimeout(reflowAfterTransition);
            }
            reflowAfterTransition = setTimeout(() => {
              reflowAfterTransition = null;
              refreshInlineZones();
            }, 200);
          };
          const openUnsub = controller.on('widget:opened', scheduleInlineZoneReflow);
          const closeUnsub = controller.on('widget:closed', scheduleInlineZoneReflow);
          const previousCleanup = layoutCleanup;
          layoutCleanup = () => {
            openUnsub();
            closeUnsub();
            if (reflowAfterTransition !== null) {
              clearTimeout(reflowAfterTransition);
            }
            previousCleanup();
          };
        }

        previewLayoutCleanups.push(layoutCleanup);

        if (stateModule.getPreviewScene() === 'minimized') {
          controller.close();
        }
      }

      container.scrollTop = 0;
      updateContrastSummary();
      injectPreviewArtifacts();

      setupInlineZones(iframes, getCurrentScale);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          refreshInlineZones();
        });
      });
    };

    applyPreviewScale();

    for (const iframe of iframes) {
      const mountId = iframe.dataset.mountId;
      if (!mountId) continue;

      const spec = specs.find((entry) => entry.mountId === mountId);
      iframe.addEventListener(
        'load',
        () => {
          if (!isCurrentRenderToken(iframe)) return;
          loadedCount += 1;
          if (loadedCount >= totalToLoad) mountAllWidgets();
        },
        { once: true }
      );
      iframe.srcdoc = getIframeSrcdoc(spec ?? {
        mountId,
        label: '',
        previewConfig: stateModule.buildPreviewConfig(),
        shellMode: 'light',
        backgroundState: 'none',
        layoutSignature: 'floating',
      }, renderToken);
    }

    if (totalToLoad === 0) {
      updateContrastSummary();
    }
  }

  function doUpdate(): void {
    const specs = getPreviewSpecs(true);
    const hasShellMismatch = specs.some((spec) => {
      const wrapper = container.querySelector<HTMLElement>(
        `.preview-iframe-wrapper[data-mount-id="${spec.mountId}"]`
      );
      return (
        !wrapper ||
        wrapper.dataset.shellMode !== spec.shellMode ||
        wrapper.dataset.backgroundState !== spec.backgroundState ||
        wrapper.dataset.layoutSignature !== spec.layoutSignature
      );
    });

    const sceneChanged = stateModule.getPreviewScene() !== lastMountedScene;
    if (previewControllers.length !== specs.length || hasShellMismatch || sceneChanged) {
      doMount();
      return;
    }

    previewControllers.forEach((controller, index) => {
      controller.update(specs[index].previewConfig);
      applyPreviewBackgroundStateToWrapper(specs[index].mountId, specs[index].backgroundState);
      if (stateModule.getPreviewScene() === 'minimized') {
        controller.close();
      }
    });
    syncPreviewStageLayoutForScene();
    syncPreviewWrapperShellAndShellMode(specs);
    updatePreviewStatusLabel();
    refreshInlineZones();

    if (stateModule.get('features.artifacts.enabled') || stateModule.getPreviewScene() === 'artifact') {
      injectPreviewArtifacts();
    } else {
      for (const controller of previewControllers) {
        controller.clearArtifacts();
      }
    }
  }

  function resizePreviewFrames(): void {
    const device = stateModule.getPreviewDevice();
    const wrappers = Array.from(container.querySelectorAll('.preview-iframe-wrapper')) as HTMLElement[];

    for (const wrapper of wrappers) {
      wrapper.dataset.device = device;
      if (device === 'mobile') {
        wrapper.classList.add('preview-iframe-wrapper-mobile');
      } else {
        wrapper.classList.remove('preview-iframe-wrapper-mobile');
      }
    }

    applyPreviewScale();

    const iframes = Array.from(container.querySelectorAll<HTMLIFrameElement>('iframe[data-mount-id]'));
    for (const iframe of iframes) {
      iframe.contentWindow?.dispatchEvent(new Event('resize'));
    }
  }

  function setupResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;

    if (previewResizeObserver) {
      previewResizeObserver.disconnect();
    }

    previewResizeObserver = new ResizeObserver(() => applyPreviewScale());
    previewResizeObserver.observe(container);
  }

  function getCurrentScale(): number {
    return zoomOverride ?? lastAutoScale;
  }

  // ─── Zone highlighting ──────────────────────────────────────

  const HIGHLIGHT_STYLE_ID = 'persona-zone-highlight';
  const HIGHLIGHT_CSS = `
    .persona-zone-active {
      outline: 2px dashed #4F6EF7 !important;
      outline-offset: -2px;
      transition: outline 0.15s ease;
    }
  `;

  function ensureHighlightStylesheet(doc: Document): void {
    if (doc.getElementById(HIGHLIGHT_STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = HIGHLIGHT_STYLE_ID;
    style.textContent = HIGHLIGHT_CSS;
    doc.head.appendChild(style);
  }

  function applyHighlightZone(zone: string | null): void {
    activeHighlightZone = zone;
    const iframes = container.querySelectorAll<HTMLIFrameElement>('iframe[data-mount-id]');
    for (const iframe of iframes) {
      const doc = iframe.contentDocument;
      if (!doc?.body) continue;
      ensureHighlightStylesheet(doc);

      if (!zone) {
        doc.querySelectorAll('.persona-zone-active').forEach((el) =>
          el.classList.remove('persona-zone-active')
        );
        continue;
      }

      // Clear previous active markers
      doc.querySelectorAll('.persona-zone-active').forEach((el) =>
        el.classList.remove('persona-zone-active')
      );
      // Mark matching zones as active
      doc.querySelectorAll(`[data-persona-theme-zone="${zone}"]`).forEach((el) =>
        el.classList.add('persona-zone-active')
      );
    }
  }

  // ─── Initialize ───────────────────────────────────────────────

  bindPreviewBackgroundMessageListener();
  setupResizeObserver();

  // ─── Public interface ─────────────────────────────────────────

  return {
    mount(): void {
      doMount();
    },

    update(): void {
      doUpdate();
    },

    setCompareMode(mode: CompareMode, baseline?: import('./state').ConfiguratorSnapshot): void {
      compareMode = mode;
      if (mode === 'baseline') {
        if (baseline) {
          baselineSnapshot = baseline;
        } else if (!baselineSnapshot) {
          baselineSnapshot = stateModule.exportSnapshot();
        }
      }
      doMount();
    },

    setContrastMode(enabled: boolean): void {
      contrastMode = enabled;
      updateContrastSummary();
    },

    getCurrentScale,

    injectArtifacts(force = false): void {
      injectPreviewArtifacts(force);
    },

    setZoom(zoom: number | null): void {
      zoomOverride = zoom;
      applyPreviewScale();
    },

    resizeFrames(): void {
      resizePreviewFrames();
    },

    highlightZone(zone: string): void {
      applyHighlightZone(zone);
    },

    clearHighlight(): void {
      applyHighlightZone(null);
    },

    destroy(): void {
      unbindPreviewBackgroundMessageListener();

      for (const [mountId] of previewBackgroundOverlayTimers) {
        clearPreviewBackgroundOverlayTimer(mountId);
      }

      destroyPreviewControllers();

      if (previewResizeObserver) {
        previewResizeObserver.disconnect();
        previewResizeObserver = null;
      }
    },
  };
}
