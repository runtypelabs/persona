/** Theme Configurator v2 — Entry point */

import '@runtypelabs/persona/widget.css';
import '../index.css';
import '../theme-configurator.css';

import {
  createAgentExperience,
  componentRegistry,
  getActiveTheme,
  themeToCssVariables,
} from '@runtypelabs/persona';
import type {
  AgentWidgetController,
  AgentWidgetConfig,
} from '@runtypelabs/persona';
import { Idiomorph } from 'idiomorph';
import type { OnChangeCallback, ControlResult } from './types';
import * as state from './state';
import { initSearchUI, pruneSearchIndex, resetSearchIndex } from './search';
import * as styleTab from './sections/appearance';
import type { DrilldownView } from './sections/appearance';
import * as colorsStyleTab from './sections/colors-style';
import * as componentsTab from './sections/components';
import * as configureTab from './sections/widget-config';
import * as exportTab from './sections/export';
import { DynamicForm } from '../components';
import { applyPreset, getAllPresets } from './presets';
import {
  generateColorScale,
  normalizeColorValue,
  isValidHex,
  hexToHsl,
  hslToHex,
} from './color-utils';
import { setupInlineZones, destroyInlineZones, refreshInlineZones } from './inline-editor';

// ─── Register custom components ──────────────────────────────────
componentRegistry.register('dynamic-form', (props, ctx) => {
  return DynamicForm(props, ctx);
});

let allControls: ControlResult[] = [];
let previewControllers: AgentWidgetController[] = [];
type CompareMode = 'off' | 'baseline' | 'themes';

let compareMode: CompareMode = 'off';
let baselineSnapshot: state.ConfiguratorSnapshot | null = null;
let contrastMode = false;
let presetsMenuOpen = false;
let pillDropdownOpen = false;
let pillDropdownWasOpen = false;
let previewResizeObserver: ResizeObserver | null = null;
let zoomOverride: number | null = null;
let lastAutoScale = 1;

const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 1.5;
const PREVIEW_BG_LOAD_TIMEOUT_MS = 4000;
const PREVIEW_BG_ERROR_OVERLAY_TIMEOUT_MS = 3000;
const PREVIEW_BG_MESSAGE_TYPE = 'persona-theme-preview-background-state';
const PREVIEW_BG_EMBED_CHECK_ENDPOINT = '/api/preview/embed-check';

const DEVICE_DIMENSIONS: Record<string, { w: number; h: number }> = {
  desktop: { w: 1280, h: 800 },
  mobile: { w: 390, h: 844 },
};

export function getCurrentScale(): number {
  return zoomOverride ?? lastAutoScale;
}

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

function normalizePreviewBackgroundUrl(raw: string): string | null {
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

/** Maps search tabId values to the HTML tab data-tab values */
const TAB_ID_TO_TAB: Record<string, string> = {
  'style': 'style',
  'configure': 'configure',
  // Legacy mappings for localStorage migration
  'appearance': 'style',
  'content': 'configure',
  'behavior': 'configure',
  'design-system': 'style',
  'developer': 'configure',
  'export': 'style',
};

/** Drill-down views that need the light/dark editing toggle */
const DRILLDOWN_NEEDS_EDITING_TOGGLE: Record<DrilldownView, boolean> = {
  'none': false,
  'palette': true,
  'component-colors': true,
  'component-shapes': false,
};

/** Display titles for drill-down views */
const DRILLDOWN_TITLES: Record<DrilldownView, string> = {
  'none': '',
  'palette': 'Brand Palette',
  'component-colors': 'Component Colors',
  'component-shapes': 'Component Shapes',
};

let currentDrilldown: DrilldownView = 'none';

type PreviewMountSpec = {
  mountId: string;
  label: string;
  subtitle?: string;
  previewConfig: ReturnType<typeof state.buildPreviewConfig>;
  shellMode: state.PreviewShellMode;
  backgroundState: PreviewBackgroundState;
};

let previewBackgroundStates = new Map<string, PreviewBackgroundState>();
let previewBackgroundUrlKey = '';
let previewMountSignature = '';
let previewRenderToken = 0;
let previewEmbedCheckRequestId = 0;
const previewEmbedCheckCache = new Map<string, PreviewEmbedCheckVerdict>();
const previewEmbedCheckReasonCache = new Map<string, string>();
const previewEmbedCheckInFlight = new Map<string, number>();
const previewBackgroundOverlayTimers = new Map<string, { timeoutId: number; dismissKey: string }>();
const previewBackgroundOverlayDismissed = new Map<string, string>();

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

export function getPreviewBackgroundStatusLabel(
  frameStates: PreviewBackgroundState[],
  hasBackgroundUrl: boolean
): string {
  if (!hasBackgroundUrl || frameStates.length === 0) return '';

  const checkingCount = frameStates.filter((status) => status === 'checking').length;
  if (checkingCount > 0) {
    return 'Checking preview site…';
  }

  const loadingCount = frameStates.filter((status) => status === 'loading').length;
  if (loadingCount > 0) {
    return 'Loading preview site…';
  }

  const blockedCount = frameStates.filter((status) => status === 'blocked').length;
  if (blockedCount > 0) {
    return '';
  }

  const timeoutCount = frameStates.filter((status) => status === 'timeout').length;
  if (timeoutCount === 0) return '';

  if (frameStates.length > 1 && timeoutCount < frameStates.length) {
    return 'Some preview frames could not display this page. Showing mock fallback where needed.';
  }

  return "Couldn't display this page. Showing mock preview.";
}

export function getPreviewBackgroundBadgeLabel(
  frameStates: PreviewBackgroundState[],
  backgroundUrl: string
): string {
  if (!backgroundUrl || frameStates.length === 0) return '';
  if (!frameStates.every((status) => status === 'blocked')) return '';

  const reason = previewEmbedCheckReasonCache.get(backgroundUrl);
  if (reason === 'csp-frame-ancestors') return 'Blocked by site CSP';
  if (reason === 'x-frame-options') return 'Blocked by X-Frame-Options';
  return 'Iframe preview blocked';
}

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
    'site can’t be reached',
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

function getPreviewMountSignature(mountIds: string[]): string {
  return [...mountIds].sort().join('|');
}

function getPreviewBackgroundState(mountId: string): PreviewBackgroundState {
  return previewBackgroundStates.get(mountId) ?? 'none';
}

function getInitialPreviewBackgroundState(url: string): PreviewBackgroundState {
  if (!url) return 'none';

  const cachedVerdict = previewEmbedCheckCache.get(url);
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

function getPreviewBackgroundOverlayDismissKey(backgroundState: PreviewBackgroundState): string {
  return `${state.getPreviewBackgroundUrl()}::${backgroundState}`;
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
  if (existingTimer?.dismissKey === dismissKey) {
    return;
  }

  clearPreviewBackgroundOverlayTimer(mountId);

  const timeoutId = window.setTimeout(() => {
    previewBackgroundOverlayTimers.delete(mountId);
    previewBackgroundOverlayDismissed.set(mountId, dismissKey);

    const wrapper = document.querySelector<HTMLElement>(`.preview-iframe-wrapper[data-mount-id="${mountId}"]`);
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

function applyPreviewBackgroundStateToWrapper(mountId: string, backgroundState: PreviewBackgroundState): void {
  const wrapper = document.querySelector<HTMLElement>(`.preview-iframe-wrapper[data-mount-id="${mountId}"]`);
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
  const backgroundUrl = state.getPreviewBackgroundUrl();
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
  const backgroundUrl = state.getPreviewBackgroundUrl();
  const hasBackgroundUrl = !!backgroundUrl;
  const mountIds = specs.map((spec) => spec.mountId);
  const nextSignature = getPreviewMountSignature(mountIds);
  const shouldReset =
    !preserveStates || previewBackgroundUrlKey !== backgroundUrl || previewMountSignature !== nextSignature;

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

    const result = (await response.json()) as { verdict?: PreviewEmbedCheckVerdict; reason?: string };
    const verdict = result.verdict === 'blocked' || result.verdict === 'allowed'
      ? result.verdict
      : 'unknown';

    if (requestId !== previewEmbedCheckRequestId || state.getPreviewBackgroundUrl() !== url) {
      return;
    }

    previewEmbedCheckCache.set(url, verdict);
    previewEmbedCheckReasonCache.set(url, result.reason ?? verdict);
    if (verdict === 'blocked') {
      const shouldRemount = Array.from(previewBackgroundStates.values()).some(
        (currentState) => currentState !== 'blocked'
      );
      setAllPreviewBackgroundStates('blocked');
      if (shouldRemount) {
        mountPreviewWidgets(true);
      } else {
        updatePreviewStatusLabel();
      }
      return;
    }

    setAllPreviewBackgroundStates('loading', (currentState) => currentState === 'checking');
    mountPreviewWidgets(true);
  } catch {
    if (requestId !== previewEmbedCheckRequestId || state.getPreviewBackgroundUrl() !== url) {
      return;
    }

    previewEmbedCheckCache.set(url, 'unknown');
    previewEmbedCheckReasonCache.set(url, 'network-error');
    setAllPreviewBackgroundStates('loading', (currentState) => currentState === 'checking');
    mountPreviewWidgets(true);
  } finally {
    if (previewEmbedCheckInFlight.get(url) === requestId) {
      previewEmbedCheckInFlight.delete(url);
    }
  }
}

function ensurePreviewEmbedCheck(): void {
  const backgroundUrl = state.getPreviewBackgroundUrl();
  if (!backgroundUrl) return;
  if (!Array.from(previewBackgroundStates.values()).some((status) => status === 'checking')) return;
  if (previewEmbedCheckCache.has(backgroundUrl)) return;
  if (previewEmbedCheckInFlight.has(backgroundUrl)) return;

  const requestId = ++previewEmbedCheckRequestId;
  previewEmbedCheckInFlight.set(backgroundUrl, requestId);
  void checkPreviewBackgroundEmbeddable(backgroundUrl, requestId);
}

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

  const hasBackgroundUrl = !!state.getPreviewBackgroundUrl();
  if (shouldRebuildPreviewForBackgroundStateChange(previousState, nextState, hasBackgroundUrl)) {
    mountPreviewWidgets(true);
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

// ─── Mobile form drawer (≤767px) ─────────────────────────────────

const CONFIG_DRAWER_FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function listConfigDrawerFocusables(panel: Element): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(CONFIG_DRAWER_FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  });
}

function initMobileConfigDrawer(): void {
  const backdrop = document.getElementById('config-drawer-backdrop');
  const openBtn = document.getElementById('mobile-form-open-btn') as HTMLButtonElement | null;
  const closeBtn = document.getElementById('config-drawer-close') as HTMLButtonElement | null;
  const panel = document.querySelector('.config-panel');
  if (!backdrop || !openBtn || !panel) return;

  let trapKeydown: ((e: KeyboardEvent) => void) | null = null;

  const setOpen = (open: boolean): void => {
    document.body.classList.toggle('config-drawer-open', open);
    backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
    openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');

    if (trapKeydown) {
      document.removeEventListener('keydown', trapKeydown, true);
      trapKeydown = null;
    }

    if (open) {
      trapKeydown = (e: KeyboardEvent) => {
        if (e.key !== 'Tab' || !document.body.classList.contains('config-drawer-open')) return;
        const list = listConfigDrawerFocusables(panel);
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (!panel.contains(active)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
          return;
        }
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      };
      document.addEventListener('keydown', trapKeydown, true);

      window.setTimeout(() => {
        closeBtn?.focus();
      }, 0);
    } else {
      window.setTimeout(() => openBtn.focus(), 0);
    }
  };

  openBtn.addEventListener('click', () => setOpen(true));
  backdrop.addEventListener('click', () => setOpen(false));
  closeBtn?.addEventListener('click', () => setOpen(false));

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (!document.body.classList.contains('config-drawer-open')) return;
    e.preventDefault();
    setOpen(false);
  });
}

// ─── Initialize ─────────────────────────────────────────────────

function init(): void {
  const styleGroup = document.getElementById('style-group');
  const configureGroup = document.getElementById('configure-group');
  const previewStage = document.getElementById('preview-stage');

  if (!styleGroup || !configureGroup || !previewStage) {
    throw new Error('Theme editor mount elements not found');
  }

  state.initStore();

  initToolbarControls();
  initTabs();
  initDrilldownNavigation();
  initSearch();
  initWizard();
  initPillDropdown();
  rebuildEditorSurface();
  syncEditorUi();
  bindPreviewBackgroundMessageListener();
  window.addEventListener('persona-configurator:inject-artifact', () => {
    if (!state.get('features.artifacts.enabled')) {
      state.set('features.artifacts.enabled', true);
      // onChange will trigger updatePreviewWidgets → injectPreviewArtifacts
    } else {
      injectPreviewArtifacts(true);
    }
  });
  mountPreviewWidgets();
  setupPreviewResizeObserver();
  initMobileConfigDrawer();

  state.onChange(() => {
    syncEditorUi();
    syncAllControls();
    if (styleGroup) {
      styleTab.refreshSectionMetadata(styleGroup);
    }
    if (configureGroup) {
      configureTab.refreshSectionMetadata(configureGroup);
    }
    updatePreviewWidgets();
    updateContrastSummary();
  });
}

// ─── Tabs ────────────────────────────────────────────────────────

function initTabs(): void {
  const tabNav = document.getElementById('editor-tabs');
  if (!tabNav) return;

  tabNav.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.editor-tab[data-tab]');
    if (!button) return;

    const tabId = button.dataset.tab!;
    switchTab(tabId);
  });
}

function switchTab(tabId: string): void {
  // If switching to style tab, reset drill-down to summary view
  if (tabId === 'style' && currentDrilldown !== 'none') {
    navigateBackToStyle();
  }

  document.querySelectorAll('.editor-tab').forEach((tab) => {
    tab.classList.toggle('active', (tab as HTMLElement).dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', (panel as HTMLElement).dataset.tabPanel === tabId);
  });
}

// ─── Drill-down navigation ──────────────────────────────────────

function initDrilldownNavigation(): void {
  // Back button
  const backBtn = document.getElementById('drilldown-back-btn');
  backBtn?.addEventListener('click', navigateBackToStyle);

  // Delegate drill-down link clicks from Style tab
  const stylePanel = document.querySelector('[data-tab-panel="style"]');
  stylePanel?.addEventListener('click', (event) => {
    const link = (event.target as HTMLElement).closest<HTMLButtonElement>('.drilldown-link[data-drilldown-target]');
    if (!link) return;
    const target = link.dataset.drilldownTarget as DrilldownView;
    if (target && target !== 'none') {
      navigateToDrilldown(target);
    }
  });

  document.addEventListener('click', (event) => {
    const link = (event.target as HTMLElement).closest<HTMLButtonElement>('.section-header-action[data-crosslink-tab]');
    if (!link) return;

    const tabId = link.dataset.crosslinkTab;
    const sectionId = link.dataset.crosslinkSection;
    if (!tabId || !sectionId) return;

    switchTab(tabId);
    requestAnimationFrame(() => expandAndScrollToSection(sectionId));
  });

  // Export button
  const exportBtn = document.getElementById('export-btn');
  exportBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    exportTab.toggleExport();
  });

  // Close export dropdown on outside click
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (!target.closest('#export-dropdown') && !target.closest('#export-btn')) {
      exportTab.closeExport();
    }
  });
}

function expandAndScrollToSection(sectionId: string): void {
  const section = document.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`);
  if (!section) return;

  section.classList.remove('collapsed');
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function navigateToDrilldown(view: DrilldownView): void {
  const summary = document.getElementById('style-summary');
  const drilldown = document.getElementById('style-drilldown');
  const drilldownContent = document.getElementById('drilldown-content');
  const drilldownTitle = document.getElementById('drilldown-title');
  const editingToggle = document.getElementById('drilldown-editing-toggle');

  if (!summary || !drilldown || !drilldownContent || !drilldownTitle || !editingToggle) return;

  currentDrilldown = view;

  // Clear previous drill-down content and prune associated search entries
  const oldControls = drilldownContent.querySelectorAll('[data-section-id]');
  if (oldControls.length > 0) {
    pruneSearchIndex((entry) => !drilldownContent.contains(entry.element));
  }
  drilldownContent.innerHTML = '';

  // Set title
  drilldownTitle.textContent = DRILLDOWN_TITLES[view] ?? '';

  // Show/hide editing toggle
  if (DRILLDOWN_NEEDS_EDITING_TOGGLE[view]) {
    editingToggle.classList.remove('hidden');
  } else {
    editingToggle.classList.add('hidden');
  }

  // Render drill-down content
  const newControls: ControlResult[] = [];
  switch (view) {
    case 'palette':
      newControls.push(...colorsStyleTab.render(drilldownContent, handleChange));
      break;
    case 'component-colors':
      newControls.push(...componentsTab.renderColorSections(drilldownContent, handleChange));
      break;
    case 'component-shapes':
      newControls.push(...componentsTab.renderShapeSections(drilldownContent, handleChange));
      break;
  }

  allControls.push(...newControls.filter((c) => c.element.isConnected));

  // Toggle visibility
  summary.classList.add('hidden');
  drilldown.classList.remove('hidden');

  syncEditingTargetVisibility();
}

function navigateBackToStyle(): void {
  const summary = document.getElementById('style-summary');
  const drilldown = document.getElementById('style-drilldown');
  const drilldownContent = document.getElementById('drilldown-content');

  if (!summary || !drilldown || !drilldownContent) return;

  currentDrilldown = 'none';

  // Prune controls from drill-down
  pruneSearchIndex((entry) => !drilldownContent.contains(entry.element));
  allControls = allControls.filter((c) => !drilldownContent.contains(c.element));
  drilldownContent.innerHTML = '';

  // Toggle visibility
  drilldown.classList.add('hidden');
  summary.classList.remove('hidden');
}

// ─── Toolbar + shell interactions ────────────────────────────────

function initToolbarControls(): void {
  const editingToggle = document.getElementById('editing-theme-toggle');
  const previewDeviceToggle = document.getElementById('preview-device-toggle');
  const previewThemeToggle = document.getElementById('preview-theme-toggle');
  const previewSceneSelect = document.getElementById('preview-scene-select') as HTMLSelectElement | null;
  const updateBaselineBtn = document.getElementById('update-baseline-btn');
  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');
  const contrastBtn = document.getElementById('contrast-btn');
  const presetsBtn = document.getElementById('presets-btn');

  editingToggle?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.segment-btn[data-value]');
    if (!button) return;
    state.setEditingTheme(button.dataset.value as state.EditingTheme);
  });

  previewDeviceToggle?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.segment-btn[data-value]');
    if (!button) return;
    state.setPreviewDevice(button.dataset.value as state.PreviewDevice);
    zoomOverride = null;
    resizePreviewFrames();
  });

  previewSceneSelect?.addEventListener('change', () => {
    state.setPreviewScene(previewSceneSelect.value as state.PreviewScene);
    // Preview updates via state.onChange → updatePreviewWidgets (no srcdoc remount).
  });

  previewThemeToggle?.addEventListener('click', (event) => {
    if (compareMode === 'themes') return;
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.segment-btn[data-value]');
    if (!button) return;
    state.setPreviewMode(button.dataset.value as state.PreviewMode);
    // Shell theme applied in updatePreviewWidgets without reloading iframe srcdoc.
  });

  undoBtn?.addEventListener('click', () => {
    state.undo();
    syncAllControls();
  });

  redoBtn?.addEventListener('click', () => {
    state.redo();
    syncAllControls();
  });

  document.getElementById('compare-mode-toggle')?.addEventListener('click', (event) => {
    const compareBtn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-compare]');
    if (!compareBtn) return;
    setCompareMode(compareBtn.dataset.compare as CompareMode);
  });

  updateBaselineBtn?.addEventListener('click', () => {
    updateBaselineSnapshot();
    syncEditorUi();
    mountPreviewWidgets();
    showToast('Baseline updated.');
  });

  contrastBtn?.addEventListener('click', () => {
    toggleContrastMode();
  });

  document.getElementById('preview-pill-contrast-btn')?.addEventListener('click', () => {
    toggleContrastMode();
  });

  presetsBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    presetsMenuOpen = !presetsMenuOpen;
    closePillDropdown();
    exportTab.closeExport();
    renderPresetsMenu();
  });

  document.getElementById('zoom-in-btn')?.addEventListener('click', () => {
    const current = zoomOverride ?? lastAutoScale;
    zoomOverride = Math.min(ZOOM_MAX, current + ZOOM_STEP);
    applyPreviewScale();
  });

  document.getElementById('zoom-out-btn')?.addEventListener('click', () => {
    const current = zoomOverride ?? lastAutoScale;
    zoomOverride = Math.max(ZOOM_MIN, current - ZOOM_STEP);
    applyPreviewScale();
  });

  document.getElementById('zoom-fit-btn')?.addEventListener('click', () => {
    zoomOverride = null;
    applyPreviewScale();
  });

  document.getElementById('zoom-level')?.addEventListener('click', () => {
    zoomOverride = 1;
    applyPreviewScale();
  });

  const previewBgUrlInput = document.getElementById('preview-bg-url') as HTMLInputElement | null;
  const previewBgUrlClear = document.getElementById('preview-bg-url-clear');

  previewBgUrlInput?.addEventListener('change', () => {
    const normalized = normalizePreviewBackgroundUrl(previewBgUrlInput.value);
    if (normalized === null) {
      previewBgUrlInput.value = state.getPreviewBackgroundUrl();
      return;
    }
    previewBgUrlInput.value = normalized;
    state.setPreviewBackgroundUrl(normalized);
    mountPreviewWidgets();
  });

  previewBgUrlClear?.addEventListener('click', () => {
    state.setPreviewBackgroundUrl('');
    if (previewBgUrlInput) previewBgUrlInput.value = '';
    mountPreviewWidgets();
  });

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const insideToolbarDropdown = target.closest('.toolbar-dropdown-group');
    const insidePresetsMenu = target.closest('#presets-menu');
    if (!insideToolbarDropdown && !insidePresetsMenu) {
      presetsMenuOpen = false;
      renderPresetsMenu();
      exportTab.closeExport();
    }
  });
}

function syncEditingTargetVisibility(): void {
  const editing = state.getEditingTheme();
  document.querySelectorAll('.editing-target-group').forEach((el) => {
    const group = el as HTMLElement;
    const target = group.dataset.editingTarget;
    group.style.display = target === editing ? '' : 'none';
  });
}

function isCompareActive(): boolean {
  return compareMode !== 'off';
}

function updateBaselineSnapshot(): void {
  baselineSnapshot = state.exportSnapshot();
}

function setCompareMode(nextMode: CompareMode): void {
  compareMode = nextMode;

  if (compareMode === 'baseline' && !baselineSnapshot) {
    updateBaselineSnapshot();
  }

  syncEditorUi();
  mountPreviewWidgets();
}

function toggleContrastMode(): void {
  contrastMode = !contrastMode;
  syncEditorUi();
  updateContrastSummary();
  syncPillDropdown();
}

function syncContrastToggle(): void {
  const contrastBtn = document.getElementById('contrast-btn') as HTMLButtonElement | null;
  if (contrastBtn) {
    contrastBtn.classList.toggle('active', contrastMode);
    contrastBtn.setAttribute('aria-pressed', contrastMode ? 'true' : 'false');
  }
  const pillContrast = document.getElementById('preview-pill-contrast-btn') as HTMLButtonElement | null;
  if (pillContrast) {
    pillContrast.classList.toggle('active', contrastMode);
    pillContrast.setAttribute('aria-pressed', contrastMode ? 'true' : 'false');
  }
}

function syncEditorUi(): void {
  syncEditingTargetVisibility();

  const syncSegmentGroup = (selector: string, value: string) => {
    document.querySelectorAll(`${selector} .segment-btn`).forEach((button) => {
      button.classList.toggle('active', (button as HTMLElement).dataset.value === value);
    });
  };

  syncSegmentGroup('#editing-theme-toggle', state.getEditingTheme());
  syncSegmentGroup('#preview-device-toggle', state.getPreviewDevice());
  syncSegmentGroup('#preview-theme-toggle', state.getPreviewMode());
  syncContrastToggle();

  const previewSceneSelect = document.getElementById('preview-scene-select') as HTMLSelectElement | null;
  const updateBaselineBtn = document.getElementById('update-baseline-btn') as HTMLButtonElement | null;
  const previewThemeToggle = document.getElementById('preview-theme-toggle') as HTMLElement | null;
  const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement | null;
  const redoBtn = document.getElementById('redo-btn') as HTMLButtonElement | null;

  if (previewSceneSelect) previewSceneSelect.value = state.getPreviewScene();
  if (undoBtn) undoBtn.disabled = !state.canUndo();
  if (redoBtn) redoBtn.disabled = !state.canRedo();
  if (updateBaselineBtn) {
    updateBaselineBtn.classList.toggle('hidden', compareMode !== 'baseline');
  }
  if (previewThemeToggle) {
    const previewThemeDisabled = compareMode === 'themes';
    previewThemeToggle.classList.toggle('is-disabled', previewThemeDisabled);
    previewThemeToggle
      .querySelectorAll<HTMLButtonElement>('.segment-btn')
      .forEach((button) => {
        button.disabled = previewThemeDisabled;
      });
  }

  const bgUrlInput = document.getElementById('preview-bg-url') as HTMLInputElement | null;
  const bgUrlClear = document.getElementById('preview-bg-url-clear') as HTMLElement | null;
  const bgUrl = state.getPreviewBackgroundUrl();
  if (bgUrlInput && bgUrlInput.value !== bgUrl) bgUrlInput.value = bgUrl;
  if (bgUrlClear) bgUrlClear.style.display = bgUrl ? '' : 'none';

  syncPillDropdown();
}

function syncGroupVisibility(groupId: string): void {
  const group = document.getElementById(groupId);
  const section = group?.closest('.tab-panel, .group-section') as HTMLElement | null;
  if (!group || !section) return;
  // Hide the corresponding tab button if the panel has no content
  const tabId = section.dataset.tabPanel;
  if (tabId) {
    const hasContent = !!group.querySelector('[data-section-id], .export-section, .subgroup-divider');
    const tabBtn = document.querySelector(`.editor-tab[data-tab="${tabId}"]`) as HTMLElement | null;
    if (tabBtn) tabBtn.style.display = hasContent ? '' : 'none';
  }
}

function rebuildEditorSurface(): void {
  const styleGroup = document.getElementById('style-group');
  const configureGroup = document.getElementById('configure-group');

  if (!styleGroup || !configureGroup) return;

  allControls.forEach((control) => control.destroy());
  resetSearchIndex();

  styleGroup.innerHTML = '';
  configureGroup.innerHTML = '';

  // Reset drill-down state
  currentDrilldown = 'none';
  const summary = document.getElementById('style-summary');
  const drilldown = document.getElementById('style-drilldown');
  const drilldownContent = document.getElementById('drilldown-content');
  if (summary) summary.classList.remove('hidden');
  if (drilldown) drilldown.classList.add('hidden');
  if (drilldownContent) drilldownContent.innerHTML = '';

  const nextControls: ControlResult[] = [];

  // Style tab: theme mode, brand colors, chat colors, typography, shape, shadows, widget style
  nextControls.push(...styleTab.render(styleGroup, handleChange));

  // Configure tab: content, layout, widget, features, developer (with sub-group dividers)
  nextControls.push(...configureTab.render(configureGroup, handleChange));

  styleTab.refreshSectionMetadata(styleGroup);
  configureTab.refreshSectionMetadata(configureGroup);

  allControls = nextControls.filter((control) => control.element.isConnected);
  pruneSearchIndex((entry) => entry.element.isConnected);

  syncGroupVisibility('style-group');
  syncGroupVisibility('configure-group');
}

function getPresetPreviewColors(preset: ReturnType<typeof getAllPresets>[number]): Record<string, string> {
  const config = {
    ...state.getDefaultConfig(),
    ...preset.config,
    theme: preset.theme as AgentWidgetConfig['theme'],
    colorScheme: 'light',
  } as AgentWidgetConfig;

  return themeToCssVariables(getActiveTheme(config));
}

function createPresetCard(preset: ReturnType<typeof getAllPresets>[number]): HTMLButtonElement {
  const colors = getPresetPreviewColors(preset);
  const card = document.createElement('button');
  card.type = 'button';
  card.className = `preset-visual-card${preset.builtIn ? '' : ' preset-visual-card-custom'}`;
  card.innerHTML = `
    <span class="preset-visual-preview">
      <span class="preset-visual-shell" style="background:${colors['--persona-background'] ?? '#f8fafc'};">
        <span class="preset-visual-header" style="background:${colors['--persona-header-bg'] ?? colors['--persona-surface'] ?? '#ffffff'};"></span>
        <span class="preset-visual-body">
          <span class="preset-visual-bubble preset-visual-bubble-assistant" style="background:${colors['--persona-message-assistant-bg'] ?? '#ffffff'}; color:${colors['--persona-message-assistant-text'] ?? '#111827'};"></span>
          <span class="preset-visual-bubble preset-visual-bubble-user" style="background:${colors['--persona-message-user-bg'] ?? colors['--persona-primary'] ?? '#2563eb'}; color:${colors['--persona-message-user-text'] ?? '#ffffff'};"></span>
        </span>
        <span class="preset-visual-launcher" style="background:${colors['--persona-primary'] ?? '#2563eb'};"></span>
      </span>
    </span>
    <span class="preset-visual-copy">
      <span class="preset-visual-title-row">
        <span class="preset-visual-title">${preset.label}</span>
        ${preset.builtIn ? '' : '<span class="preset-visual-badge">Custom</span>'}
      </span>
      <span class="preset-visual-description">${preset.description}</span>
    </span>
  `;
  card.addEventListener('click', () => {
    applyPreset(preset);
    syncAllControls();
    presetsMenuOpen = false;
    renderPresetsMenu();
    showToast(`Applied preset: ${preset.label}`);
  });
  return card;
}

function renderPresetsMenu(): void {
  const menu = document.getElementById('presets-menu');
  if (!menu) return;

  if (!presetsMenuOpen) {
    menu.classList.add('hidden');
    menu.innerHTML = '';
    return;
  }

  const presets = getAllPresets();
  menu.classList.remove('hidden');
  menu.innerHTML = '';

  const presetsGrid = document.createElement('div');
  presetsGrid.className = 'preset-visual-grid';

  for (const preset of presets) {
    presetsGrid.appendChild(createPresetCard(preset));
  }
  menu.appendChild(presetsGrid);

  const generateButton = document.createElement('button');
  generateButton.type = 'button';
  generateButton.className = 'menu-item preset-generate-cta';
  generateButton.innerHTML = `
    <span class="menu-item-label">Generate From Brand Color</span>
    <span class="menu-item-description">Create a primary, secondary, and accent scale from one brand color.</span>
  `;
  generateButton.addEventListener('click', () => {
    presetsMenuOpen = false;
    renderPresetsMenu();
    openWizard();
  });
  menu.appendChild(generateButton);
}

// ─── Search ───────────────────────────────────────────────────────

/** Map section IDs to the drill-down view they belong to (if any) */
const SECTION_TO_DRILLDOWN: Record<string, DrilldownView> = {
  'light-brand-palette': 'palette',
  'dark-brand-palette': 'palette',
  'light-semantic-colors': 'palette',
  'dark-semantic-colors': 'palette',
  'light-comp-header-colors': 'component-colors',
  'dark-comp-header-colors': 'component-colors',
  'light-comp-message-colors': 'component-colors',
  'dark-comp-message-colors': 'component-colors',
  'light-comp-input-colors': 'component-colors',
  'dark-comp-input-colors': 'component-colors',
  'light-comp-button-colors': 'component-colors',
  'dark-comp-button-colors': 'component-colors',
  'comp-panel': 'component-shapes',
  'comp-launcher': 'component-shapes',
  'comp-message-shape': 'component-shapes',
  'comp-input-shape': 'component-shapes',
  'comp-button-shape': 'component-shapes',
};

function initSearch(): void {
  initSearchUI((tabId, sectionId, fieldId) => {
    // Switch to the correct tab for this field
    const targetTab = TAB_ID_TO_TAB[tabId];
    if (targetTab) {
      switchTab(targetTab);
    }

    // Check if this field is in a drill-down view
    const drilldownTarget = SECTION_TO_DRILLDOWN[sectionId];
    if (drilldownTarget && targetTab === 'style') {
      navigateToDrilldown(drilldownTarget);
    }

    if (fieldId.startsWith('dark-') || sectionId.startsWith('dark-')) {
      state.setEditingTheme('dark');
    } else {
      state.setEditingTheme('light');
    }

    // Wait for drill-down content to render, then expand section
    requestAnimationFrame(() => {
      const section = document.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`);
      if (section?.classList.contains('collapsed')) {
        section.classList.remove('collapsed');
      }
    });

    syncEditorUi();
  });
}

// ─── Preview rendering ───────────────────────────────────────────

function getPreviewSpecs(preserveBackgroundStates = false): PreviewMountSpec[] {
  const currentSnapshot = state.exportSnapshot();
  const activeBaselineSnapshot = baselineSnapshot ?? currentSnapshot;
  const previewScene = state.getPreviewScene();
  const rawSpecs =
    compareMode === 'baseline'
      ? [
          {
            mountId: 'preview-baseline',
            label: 'Baseline',
            subtitle: 'Captured comparison state',
            snapshot: activeBaselineSnapshot,
            previewMode: state.getPreviewMode(),
          },
          {
            mountId: 'preview-current',
            label: 'Current',
            subtitle: 'Live editor state',
            snapshot: currentSnapshot,
            previewMode: state.getPreviewMode(),
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
              previewMode: state.getPreviewMode(),
            },
          ];

  syncPreviewBackgroundStates(rawSpecs, preserveBackgroundStates);

  return rawSpecs.map(({ mountId, label, subtitle, snapshot, previewMode }) => ({
    mountId,
    label,
    subtitle,
    previewConfig: state.buildPreviewConfig(snapshot, previewMode, previewScene),
    shellMode: state.resolvePreviewShellMode(snapshot, previewMode, previewScene),
    backgroundState: getPreviewBackgroundState(mountId),
  }));
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const PREVIEW_IFRAME_SHELL_STYLE_ID = 'persona-preview-shell-theme';

function getShellThemePalette(shellMode: state.PreviewShellMode): {
  pageBg: string;
  chromeBg: string;
  chromeBorder: string;
  dot: string;
  skeleton: string;
  cardBg: string;
  cardBorder: string;
} {
  return shellMode === 'dark'
    ? {
        pageBg: 'linear-gradient(180deg, #0f172a 0%, #020617 100%)',
        chromeBg: '#111827',
        chromeBorder: '#1f2937',
        dot: '#475569',
        skeleton: '#334155',
        cardBg: '#1e293b',
        cardBorder: 'rgba(148, 163, 184, 0.16)',
      }
    : {
        pageBg: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
        chromeBg: '#ffffff',
        chromeBorder: '#e5e7eb',
        dot: '#cbd5e1',
        skeleton: '#e2e8f0',
        cardBg: '#e2e8f0',
        cardBorder: 'rgba(148, 163, 184, 0.18)',
      };
}

/** Inline shell CSS for srcdoc and for live theme updates without reloading srcdoc */
function buildPreviewIframeShellStyleText(shellMode: state.PreviewShellMode): string {
  const shellTheme = getShellThemePalette(shellMode);
  return `* { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
    html { color-scheme: ${shellMode}; }
    body { font-family: system-ui, sans-serif; background: ${shellTheme.pageBg}; }
    .preview-iframe-mock { min-height: 100%; }
    .preview-iframe-chrome { height: 44px; border-bottom: 1px solid ${shellTheme.chromeBorder}; background: ${shellTheme.chromeBg}; display: flex; align-items: center; gap: 8px; padding: 0 14px; }
    .preview-iframe-dot { width: 10px; height: 10px; border-radius: 50%; background: ${shellTheme.dot}; }
    .preview-iframe-copy { padding: 32px; }
    .preview-iframe-line { border-radius: 999px; background: ${shellTheme.skeleton}; margin-bottom: 12px; }
    .preview-iframe-line.hero { width: 48%; height: 16px; }
    .preview-iframe-line.body { width: 72%; height: 10px; }
    .preview-iframe-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 24px 0; }
    .preview-iframe-card { height: 84px; border-radius: 14px; background: ${shellTheme.cardBg}; box-shadow: inset 0 0 0 1px ${shellTheme.cardBorder}; }`;
}

function applyShellThemeToPreviewIframe(iframe: HTMLIFrameElement, shellMode: state.PreviewShellMode): void {
  const doc = iframe.contentDocument;
  if (!doc?.documentElement) return;
  let style = doc.getElementById(PREVIEW_IFRAME_SHELL_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = PREVIEW_IFRAME_SHELL_STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = buildPreviewIframeShellStyleText(shellMode);
}

function syncPreviewStageLayoutForScene(): void {
  const previewStage = document.getElementById('preview-stage');
  if (!previewStage) return;
  const isMinimized = state.getPreviewScene() === 'minimized';
  const launcherClass = 'preview-launcher-canvas';
  previewStage.querySelectorAll('.preview-single, .preview-compare-cell').forEach((el) => {
    el.classList.toggle(launcherClass, isMinimized);
  });
}

function syncPreviewWrapperShellAndShellMode(specs: PreviewMountSpec[]): void {
  const previewStage = document.getElementById('preview-stage');
  if (!previewStage) return;
  for (const spec of specs) {
    const wrapper = previewStage.querySelector<HTMLElement>(
      `.preview-iframe-wrapper[data-mount-id="${spec.mountId}"]`
    );
    if (!wrapper) continue;
    const next = spec.shellMode;
    if (wrapper.dataset.shellMode !== next) {
      wrapper.dataset.shellMode = next;
    }
    const iframe = wrapper.querySelector<HTMLIFrameElement>('iframe[data-mount-id]');
    if (iframe) {
      applyShellThemeToPreviewIframe(iframe, next);
    }
  }
}

/** Generate the full HTML document for iframe srcdoc (mock page + widget mount) */
function getIframeSrcdoc(
  mountId: string,
  shellMode: state.PreviewShellMode,
  backgroundState: PreviewBackgroundState,
  renderToken: number
): string {
  const bgUrl = state.getPreviewBackgroundUrl();
  const hasBgUrl = !!bgUrl;
  const showMockShell = shouldRenderMockPreviewShell(hasBgUrl, backgroundState);
  const showBackgroundFrame = hasBgUrl && (backgroundState === 'loading' || backgroundState === 'loaded');

  const backgroundFrameId = `preview-background-${mountId}`;
  const mockContent = showMockShell
    ? `
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
    </div>`
    : '';
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
    ${buildPreviewIframeShellStyleText(shellMode)}
  </style>
</head>
<body>
  ${bgIframe}
  ${mockContent}
  <div style="position:fixed;inset:0;z-index:9999;"><div id="${mountId}" data-mount-id="${mountId}"></div></div>
  ${bgScript}
</body>
</html>`;
}

function getPreviewFrameMarkup(spec: PreviewMountSpec, renderToken: number): string {
  const device = state.getPreviewDevice();
  const wrapperClass = device === 'mobile'
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

  return `
    <div class="${wrapperClass}" data-mount-id="${spec.mountId}" data-device="${device}" data-shell-mode="${spec.shellMode}" data-background-state="${spec.backgroundState}" data-render-token="${renderToken}">
      ${
        isCompareActive()
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

function destroyPreviewControllers(): void {
  destroyInlineZones();
  for (const controller of previewControllers) {
    controller.destroy();
  }
  previewControllers = [];
}

function mountPreviewWidgets(preserveBackgroundStates = false): void {
  const previewStage = document.getElementById('preview-stage');
  if (!previewStage) return;

  destroyPreviewControllers();

  const specs = getPreviewSpecs(preserveBackgroundStates);
  const renderToken = ++previewRenderToken;
  const isMinimized = state.getPreviewScene() === 'minimized';
  const singleClass = isMinimized ? 'preview-single preview-launcher-canvas' : 'preview-single';
  const cellClass = isMinimized ? 'preview-compare-cell preview-launcher-canvas' : 'preview-compare-cell';
  const markup = isCompareActive()
    ? `<div class="preview-compare-grid">${specs
        .map((spec) => `<div class="${cellClass}">${getPreviewFrameMarkup(spec, renderToken)}</div>`)
        .join('')}</div>`
    : `<div class="${singleClass}">${getPreviewFrameMarkup(specs[0], renderToken)}</div>`;

  Idiomorph.morph(previewStage, markup, { morphStyle: 'innerHTML' });
  specs.forEach((spec) => applyPreviewBackgroundStateToWrapper(spec.mountId, spec.backgroundState));
  updatePreviewStatusLabel();
  ensurePreviewEmbedCheck();

  const iframes = Array.from(previewStage.querySelectorAll<HTMLIFrameElement>('iframe[data-mount-id]'));
  let loadedCount = 0;
  const totalToLoad = iframes.length;
  let mounted = false;

  const mountAllWidgets = (): void => {
    if (mounted) return;
    mounted = true;

    for (const iframe of iframes) {
      const mountId = iframe.dataset.mountId;
      if (!mountId) continue;
      const spec = specs.find((s) => s.mountId === mountId);
      if (!spec || !iframe.contentDocument) continue;

      const mount = iframe.contentDocument.getElementById(mountId);
      if (!mount) continue;

      const controller = createAgentExperience(mount, spec.previewConfig);
      previewControllers.push(controller);

      if (state.getPreviewScene() === 'minimized') {
        controller.close();
      }
    }

    previewStage.scrollTop = 0;
    updateContrastSummary();
    injectPreviewArtifacts();

    // Set up inline editing zones on the preview iframes
    setupInlineZones(iframes, getCurrentScale);
    // Widget layout + /widget-dist/widget.css often apply after the iframe "load" event;
    // without a deferred refresh, overlays can get 0×0 rects and clicks appear "dead" until
    // a later updatePreviewWidgets → refreshInlineZones() (e.g. after editing a token).
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
        loadedCount += 1;
        if (loadedCount >= totalToLoad) mountAllWidgets();
      },
      { once: true }
    );
    iframe.srcdoc = getIframeSrcdoc(
      mountId,
      spec?.shellMode ?? 'light',
      spec?.backgroundState ?? 'none',
      renderToken
    );
  }

  if (totalToLoad === 0) {
    updateContrastSummary();
  }
}

function computeFitScale(): number {
  const previewStage = document.getElementById('preview-stage');
  if (!previewStage) return 1;

  const stageStyle = getComputedStyle(previewStage);
  const stagePadX = parseFloat(stageStyle.paddingLeft) + parseFloat(stageStyle.paddingRight);
  const stagePadY = parseFloat(stageStyle.paddingTop) + parseFloat(stageStyle.paddingBottom);
  const shadowMargin = 40;
  const availW = (previewStage.clientWidth - stagePadX - shadowMargin) / (isCompareActive() ? 2 : 1);
  const availH = previewStage.clientHeight - stagePadY - shadowMargin;
  if (availW <= 0 || availH <= 0) return 1;

  const device = state.getPreviewDevice();
  const dims = DEVICE_DIMENSIONS[device] ?? DEVICE_DIMENSIONS.desktop;
  return Math.min(availW / dims.w, availH / dims.h, 1);
}

function applyPreviewScale(): void {
  const previewStage = document.getElementById('preview-stage');
  if (!previewStage) return;

  const wrappers = Array.from(previewStage.querySelectorAll('.preview-iframe-wrapper')) as HTMLElement[];
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
      // Always top-left: other origins (e.g. bottom-right) pin the opposite corner and leave a
      // blank wedge inside the device frame on both desktop and narrow editor layouts.
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

/** Resize existing preview iframes without rebuilding them (avoids flash). */
function resizePreviewFrames(): void {
  const previewStage = document.getElementById('preview-stage');
  if (!previewStage) return;

  const device = state.getPreviewDevice();
  const wrappers = Array.from(previewStage.querySelectorAll('.preview-iframe-wrapper')) as HTMLElement[];

  for (const wrapper of wrappers) {
    wrapper.dataset.device = device;
    if (device === 'mobile') {
      wrapper.classList.add('preview-iframe-wrapper-mobile');
    } else {
      wrapper.classList.remove('preview-iframe-wrapper-mobile');
    }
  }

  applyPreviewScale();

  // The widget's recalcPanelHeight listens on the parent window's resize event
  // but reads ownerWindow.innerWidth from the iframe. Dispatch resize so the
  // widget re-evaluates its mobile/desktop layout after the iframe is resized.
  window.dispatchEvent(new Event('resize'));
}

function scrollToWidgetArea(scale: number): void {
  if (scale <= lastAutoScale) return;

  const stage = document.getElementById('preview-stage');
  if (!stage) return;

  const position = (state.getConfig() as any).launcher?.position ?? 'bottom-right';

  const doScroll = (): void => {
    stage.scrollLeft = position.includes('right') ? stage.scrollWidth : 0;
    stage.scrollTop = position.includes('bottom') ? stage.scrollHeight : 0;
  };

  // Try immediately after reflow
  void stage.offsetHeight;
  doScroll();

  // Retry after paint in case layout wasn't ready
  requestAnimationFrame(() => doScroll());
}

function updateZoomDisplay(scale: number): void {
  const zoomLevel = document.getElementById('zoom-level');
  if (zoomLevel) {
    zoomLevel.textContent = `${Math.round(scale * 100)}%`;
  }
}

function setupPreviewResizeObserver(): void {
  const previewStage = document.getElementById('preview-stage');
  if (!previewStage || typeof ResizeObserver === 'undefined') return;

  if (previewResizeObserver) {
    previewResizeObserver.disconnect();
  }

  previewResizeObserver = new ResizeObserver(() => applyPreviewScale());
  previewResizeObserver.observe(previewStage);
}

function injectPreviewArtifacts(force = false): void {
  if (!force) {
    const artifactsEnabled = state.get('features.artifacts.enabled');
    if (!artifactsEnabled) return;
  }
  for (const controller of previewControllers) {
    controller.upsertArtifact({
      id: 'configurator-sample',
      artifactType: 'markdown',
      title: 'Sample Document',
      content: '# Sample Artifact\n\nThis is a preview of the artifact sidebar.\n\n## Features\n\n- Markdown rendering\n- Document toolbar\n- Resizable panes',
    });
  }
}

function updatePreviewWidgets(): void {
  // Preserve iframe background load state across config edits; default false would reset
  // previewBackgroundStates to "loading" every call → wrapper vs spec mismatch → full remount.
  const specs = getPreviewSpecs(true);
  const previewStage = document.getElementById('preview-stage');
  const hasShellMismatch = specs.some((spec) => {
    const wrapper = previewStage?.querySelector<HTMLElement>(
      `.preview-iframe-wrapper[data-mount-id="${spec.mountId}"]`
    );
    return (
      !wrapper ||
      wrapper.dataset.shellMode !== spec.shellMode ||
      wrapper.dataset.backgroundState !== spec.backgroundState
    );
  });

  if (previewControllers.length !== specs.length || hasShellMismatch) {
    mountPreviewWidgets();
    return;
  }

  previewControllers.forEach((controller, index) => {
    controller.update(specs[index].previewConfig);
    applyPreviewBackgroundStateToWrapper(specs[index].mountId, specs[index].backgroundState);
    if (state.getPreviewScene() === 'minimized') {
      controller.close();
    }
  });
  syncPreviewStageLayoutForScene();
  syncPreviewWrapperShellAndShellMode(specs);
  updatePreviewStatusLabel();
  refreshInlineZones();
  injectPreviewArtifacts();
}

// ─── Contrast summary ────────────────────────────────────────────

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

type ContrastMetric = {
  label: string;
  ratio: string;
  pass: boolean;
};

function getPreviewRootByMountId(mountId: string): HTMLElement | null {
  const previewStage = document.getElementById('preview-stage');
  const iframe = previewStage?.querySelector<HTMLIFrameElement>(`iframe[data-mount-id="${mountId}"]`);
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
    .filter((pair): pair is { label: string; foreground: string; background: string } => !!pair.foreground && !!pair.background)
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
        ${metrics.map((metric) => `
          <div class="contrast-metric">
            <span class="contrast-metric-label">${escapeHtml(metric.label)}</span>
            <span class="contrast-metric-value">${metric.ratio}:1</span>
            <span class="contrast-metric-badge" data-pass="${metric.pass ? 'true' : 'false'}">
              ${metric.pass ? 'AA pass' : 'AA fail'}
            </span>
          </div>
        `).join('')}
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
            title: state.getEditingTheme() === 'dark' ? 'Editing dark tokens' : 'Editing light tokens',
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

  summary.innerHTML = validGroups.map((group) => renderContrastGroup(group.title, group.metrics)).join('');
  summary.classList.remove('hidden');
}

// ─── Wizard + preset generation ──────────────────────────────────

function initWizard(): void {
  const colorInput = document.getElementById('wizard-color-input') as HTMLInputElement | null;
  const colorText = document.getElementById('wizard-color-text') as HTMLInputElement | null;
  const cancelBtn = document.getElementById('wizard-cancel-btn');
  const applyBtn = document.getElementById('wizard-apply-btn');
  const overlay = document.getElementById('wizard-overlay');

  colorInput?.addEventListener('input', () => {
    if (colorText) colorText.value = colorInput.value;
  });

  colorText?.addEventListener('input', () => {
    const normalized = normalizeColorValue(colorText.value);
    if (isValidHex(normalized) && colorInput) {
      colorInput.value = normalized;
    }
  });

  cancelBtn?.addEventListener('click', closeWizard);
  overlay?.addEventListener('click', (event) => {
    if (event.target === overlay) closeWizard();
  });

  applyBtn?.addEventListener('click', () => {
    const source = colorText?.value ?? colorInput?.value ?? '#2563eb';
    const base = normalizeColorValue(source);
    if (!isValidHex(base)) {
      showToast('Enter a valid 6-digit hex color.');
      return;
    }

    const { h, s, l } = hexToHsl(base);
    const secondary = generateColorScale(hslToHex(h + 26, Math.min(1, s * 0.92), l));
    const accent = generateColorScale(hslToHex(h - 24, Math.min(1, s * 1.04), Math.min(0.72, l + 0.04)));
    const primary = generateColorScale(base);

    const updates: Record<string, string> = {};
    for (const [shade, value] of Object.entries(primary)) {
      updates[`theme.palette.colors.primary.${shade}`] = value!;
      updates[`darkTheme.palette.colors.primary.${shade}`] = value!;
    }
    for (const [shade, value] of Object.entries(secondary)) {
      updates[`theme.palette.colors.secondary.${shade}`] = value!;
      updates[`darkTheme.palette.colors.secondary.${shade}`] = value!;
    }
    for (const [shade, value] of Object.entries(accent)) {
      updates[`theme.palette.colors.accent.${shade}`] = value!;
      updates[`darkTheme.palette.colors.accent.${shade}`] = value!;
    }

    updates['theme.semantic.colors.primary'] = 'palette.colors.primary.500';
    updates['theme.semantic.colors.accent'] = 'palette.colors.accent.500';
    updates['theme.semantic.colors.interactive.default'] = 'palette.colors.primary.500';
    updates['theme.semantic.colors.interactive.hover'] = 'palette.colors.primary.600';
    updates['darkTheme.semantic.colors.primary'] = 'palette.colors.primary.400';
    updates['darkTheme.semantic.colors.accent'] = 'palette.colors.accent.400';
    updates['darkTheme.semantic.colors.interactive.default'] = 'palette.colors.primary.400';
    updates['darkTheme.semantic.colors.interactive.hover'] = 'palette.colors.primary.300';

    state.setBatch(updates);
    syncAllControls();
    closeWizard();
    showToast('Generated new theme from brand color.');
  });
}

function openWizard(): void {
  const overlay = document.getElementById('wizard-overlay');
  overlay?.classList.remove('hidden');
}

function closeWizard(): void {
  const overlay = document.getElementById('wizard-overlay');
  overlay?.classList.add('hidden');
}

function showToast(message: string): void {
  const toast = document.getElementById('editor-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  window.setTimeout(() => {
    toast.classList.add('hidden');
  }, 2200);
}

function syncAllControls(): void {
  for (const control of allControls) {
    const value = state.get(control.fieldDef.path);
    if (value !== undefined) {
      control.setValue(value);
    }
  }
}

// ─── Pill Dropdown ──────────────────────────────────────────────

const SCENE_LABELS: Record<string, string> = {
  conversation: 'Conversation',
  home: 'Home',
  minimized: 'Minimized',
};

const THEME_ICONS: Record<string, string> = {
  system: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2"></path><path d="M14.837 16.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715"></path><path d="M16 12a4 4 0 0 0-4-4"></path><path d="m19 5-1.256 1.256"></path><path d="M20 12h2"></path></svg>',
  light: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  dark: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10.96 2.36A5.5 5.5 0 1 0 13.64 9c-.72.36-1.54.56-2.41.56A5.5 5.5 0 0 1 6.44 4.77c0-.87.2-1.69.56-2.41.94-.2 2.04-.2 3.96 0Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
};

const PILL_DROPDOWN_VIEWPORT_MARGIN = 8;
const PILL_DROPDOWN_GAP = 6;

let pillDropdownViewportListenersBound = false;

function resetPreviewPillDropdownPlacement(dropdown: HTMLElement): void {
  dropdown.style.position = '';
  dropdown.style.left = '';
  dropdown.style.top = '';
  dropdown.style.right = '';
  dropdown.style.bottom = '';
  dropdown.style.width = '';
  dropdown.style.minWidth = '';
  dropdown.style.maxWidth = '';
  dropdown.style.maxHeight = '';
}

/** Keeps the pill menu inside the visual viewport (fixed positioning + clamp). */
function positionPreviewPillDropdown(): void {
  const pillBtn = document.getElementById('preview-pill-btn');
  const dropdown = document.getElementById('preview-pill-dropdown');
  if (!pillBtn || !dropdown || !pillDropdownOpen || dropdown.classList.contains('hidden')) return;

  const pill = pillBtn.getBoundingClientRect();
  const margin = PILL_DROPDOWN_VIEWPORT_MARGIN;
  const gap = PILL_DROPDOWN_GAP;
  const vv = window.visualViewport;
  const vw = vv?.width ?? window.innerWidth;
  const vh = vv?.height ?? window.innerHeight;
  const maxPanelW = Math.min(400, vw - 2 * margin);

  dropdown.style.position = 'fixed';
  dropdown.style.right = 'auto';
  dropdown.style.bottom = 'auto';
  dropdown.style.maxWidth = `${maxPanelW}px`;
  dropdown.style.minWidth = '';
  dropdown.style.width = '';
  dropdown.style.left = '-10000px';
  dropdown.style.top = '0';
  dropdown.style.maxHeight = 'none';

  void dropdown.offsetWidth;
  const dw = dropdown.offsetWidth;
  const naturalDh = dropdown.offsetHeight;

  let left = pill.right - dw;
  left = Math.min(left, vw - margin - dw);
  left = Math.max(margin, left);

  let top = pill.bottom + gap;
  if (top + naturalDh > vh - margin) {
    const aboveTop = pill.top - gap - naturalDh;
    if (aboveTop >= margin) {
      top = aboveTop;
    } else {
      top = Math.max(margin, vh - margin - naturalDh);
    }
  }

  const maxH = Math.min(0.7 * vh, vh - margin - top);

  dropdown.style.left = `${left}px`;
  dropdown.style.top = `${top}px`;
  dropdown.style.maxHeight = `${Math.max(120, maxH)}px`;
}

function bindPreviewPillDropdownViewportListeners(): void {
  if (pillDropdownViewportListenersBound) return;
  pillDropdownViewportListenersBound = true;

  const onViewportChange = (): void => {
    if (pillDropdownOpen) {
      window.requestAnimationFrame(() => positionPreviewPillDropdown());
    }
  };

  window.addEventListener('resize', onViewportChange);
  window.addEventListener('scroll', onViewportChange, true);
  window.visualViewport?.addEventListener('resize', onViewportChange);
  window.visualViewport?.addEventListener('scroll', onViewportChange);
}

function initPillDropdown(): void {
  const pillBtn = document.getElementById('preview-pill-btn');
  const dropdown = document.getElementById('preview-pill-dropdown');
  const pillBackdrop = document.getElementById('preview-pill-backdrop');

  if (!pillBtn || !dropdown) return;

  bindPreviewPillDropdownViewportListeners();

  pillBackdrop?.addEventListener('click', () => {
    if (pillDropdownOpen) {
      pillDropdownOpen = false;
      syncPillDropdown();
    }
  });

  pillBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    pillDropdownOpen = !pillDropdownOpen;
    presetsMenuOpen = false;
    renderPresetsMenu();
    exportTab.closeExport();
    syncPillDropdown();
  });

  // Scene buttons inside dropdown
  dropdown.addEventListener('click', (e) => {
    const sceneBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('.preview-pill-scene-btn[data-scene]');
    if (sceneBtn) {
      const scene = sceneBtn.dataset.scene as state.PreviewScene;
      state.setPreviewScene(scene);
      // Update the hidden select as well for compatibility
      const hiddenSelect = document.getElementById('preview-scene-select') as HTMLSelectElement | null;
      if (hiddenSelect) hiddenSelect.value = scene;
      syncPillDropdown();
    }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.preview-pill-wrapper')) {
      if (pillDropdownOpen) {
        pillDropdownOpen = false;
        syncPillDropdown();
      }
    }
  });
}

function syncPillDropdown(): void {
  const pillBtn = document.getElementById('preview-pill-btn');
  const dropdown = document.getElementById('preview-pill-dropdown');
  const pillScene = document.getElementById('preview-pill-scene');
  const pillThemeIcon = document.getElementById('preview-pill-theme-icon');
  const pillBadges = document.getElementById('preview-pill-badges');

  if (pillBtn) {
    pillBtn.classList.toggle('open', pillDropdownOpen);
  }
  if (dropdown) {
    if (!pillDropdownOpen) {
      pillDropdownWasOpen = false;
      dropdown.classList.remove('preview-pill-dropdown--placement-pending');
      dropdown.classList.add('hidden');
      resetPreviewPillDropdownPlacement(dropdown);
    } else {
      const justOpened = !pillDropdownWasOpen;
      pillDropdownWasOpen = true;
      if (justOpened) {
        dropdown.classList.add('preview-pill-dropdown--placement-pending');
      }
      dropdown.classList.remove('hidden');
      window.requestAnimationFrame(() => {
        positionPreviewPillDropdown();
        if (justOpened) {
          dropdown.classList.remove('preview-pill-dropdown--placement-pending');
        }
      });
    }
  }

  const pillBackdrop = document.getElementById('preview-pill-backdrop');
  if (pillBackdrop) {
    pillBackdrop.classList.toggle('preview-pill-backdrop--visible', pillDropdownOpen);
    pillBackdrop.setAttribute('aria-hidden', pillDropdownOpen ? 'false' : 'true');
  }

  // Sync pill scene label
  if (pillScene) {
    pillScene.textContent = SCENE_LABELS[state.getPreviewScene()] ?? 'Conversation';
  }

  // Sync pill theme icon
  if (pillThemeIcon) {
    pillThemeIcon.innerHTML = THEME_ICONS[state.getPreviewMode()] ?? THEME_ICONS.system;
  }

  // Sync pill badges
  if (pillBadges) {
    const badges: string[] = [];
    if (compareMode !== 'off') {
      badges.push('<span class="preview-pill-badge">CMP</span>');
    }
    if (contrastMode) {
      badges.push('<span class="preview-pill-badge">A11y</span>');
    }
    pillBadges.innerHTML = badges.join('');
  }

  // Sync scene buttons in dropdown
  const sceneButtons = document.querySelectorAll<HTMLButtonElement>('.preview-pill-scene-btn[data-scene]');
  sceneButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.scene === state.getPreviewScene());
  });

  document.querySelectorAll<HTMLButtonElement>('.preview-pill-scene-btn[data-compare]').forEach((btn) => {
    const active = btn.dataset.compare === compareMode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-checked', active ? 'true' : 'false');
  });
}

function closePillDropdown(): void {
  if (!pillDropdownOpen) return;
  pillDropdownOpen = false;
  syncPillDropdown();
}

// ─── Change handler ─────────────────────────────────────────────

function handleChange(path: string, value: any): void {
  state.set(path, value);
}

// ─── Boot ───────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
