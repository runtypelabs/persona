/** Theme Configurator v2 — Entry point */

import '@runtypelabs/persona/widget.css';
import '../index.css';
import '../theme-configurator.css';

import {
  componentRegistry,
  getActiveTheme,
  themeToCssVariables,
} from '@runtypelabs/persona';
import type {
  AgentWidgetConfig,
} from '@runtypelabs/persona';
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
import {
  createPreviewManager,
  type PreviewManager,
  normalizePreviewBackgroundUrl,
} from './preview-manager';
import { ZOOM_MIN, ZOOM_MAX } from '@runtypelabs/persona/theme-editor';

// Re-export test helpers from preview manager
export {
  shouldRenderMockPreviewShell,
  getPreviewBackgroundStatusLabel,
  getPreviewBackgroundBadgeLabel,
  inferPreviewBackgroundStateFromInspection,
} from './preview-manager';

// ─── Register custom components ──────────────────────────────────
componentRegistry.register('dynamic-form', (props, ctx) => {
  return DynamicForm(props, ctx);
});

let allControls: ControlResult[] = [];
type CompareMode = 'off' | 'baseline' | 'themes';

let previewManager: PreviewManager | null = null;
let currentDrilldown: DrilldownView = 'none';
let compareMode: CompareMode = 'off';
let baselineSnapshot: state.ConfiguratorSnapshot | null = null;
let contrastMode = false;
let presetsMenuOpen = false;
let pillDropdownOpen = false;
let pillDropdownWasOpen = false;

const ZOOM_STEP = 0.1;

export function getCurrentScale(): number {
  return previewManager?.getCurrentScale() ?? 1;
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

  previewManager = createPreviewManager(previewStage, state);
  previewManager.mount();

  window.addEventListener('persona-configurator:inject-artifact', () => {
    if (!state.get('features.artifacts.enabled')) {
      state.set('features.artifacts.enabled', true);
      // onChange will trigger previewManager.update() → injectArtifacts
    } else {
      previewManager?.injectArtifacts(true);
    }
  });

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
    previewManager?.update();
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
    previewManager?.setZoom(null);
    previewManager?.resizeFrames();
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
    previewManager?.mount();
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
    const current = previewManager?.getCurrentScale() ?? 1;
    previewManager?.setZoom(Math.min(ZOOM_MAX, current + ZOOM_STEP));
  });

  document.getElementById('zoom-out-btn')?.addEventListener('click', () => {
    const current = previewManager?.getCurrentScale() ?? 1;
    previewManager?.setZoom(Math.max(ZOOM_MIN, current - ZOOM_STEP));
  });

  document.getElementById('zoom-fit-btn')?.addEventListener('click', () => {
    previewManager?.setZoom(null);
  });

  document.getElementById('zoom-level')?.addEventListener('click', () => {
    previewManager?.setZoom(1);
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
  });

  previewBgUrlClear?.addEventListener('click', () => {
    state.setPreviewBackgroundUrl('');
    if (previewBgUrlInput) previewBgUrlInput.value = '';
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
  previewManager?.setCompareMode(compareMode, baselineSnapshot ?? undefined);
}

function toggleContrastMode(): void {
  contrastMode = !contrastMode;
  syncEditorUi();
  previewManager?.setContrastMode(contrastMode);
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
  artifact: 'Artifact',
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
