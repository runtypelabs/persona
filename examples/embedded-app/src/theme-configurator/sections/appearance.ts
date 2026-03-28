/** Style tab — curated visual controls for theme mode, brand colors, typography, shape, and widget style */

import type { SectionDef, OnChangeCallback, ControlResult } from '../types';
import { renderSection } from '../controls';
import { setSearchContext } from '../search';
import * as state from '../state';
import {
  generateColorScale,
  normalizeColorValue,
  isValidHex,
  resolveThemeColorPath,
} from '../color-utils';
import { STYLE_SECTIONS, findSection } from '@runtypelabs/persona/theme-editor';

export const TAB_ID = 'style';
export const TAB_LABEL = 'Style';

// ─── Drill-down types ────────────────────────────────────────────

export type DrilldownView = 'none' | 'palette' | 'component-colors' | 'component-shapes';

// ─── Section lookups from core ──────────────────────────────────────

const themeModeSectionDef = findSection(STYLE_SECTIONS, 'theme-mode') as SectionDef;
const brandColorsSectionDef = findSection(STYLE_SECTIONS, 'brand-colors') as SectionDef;
const chatColorsSectionDef = findSection(STYLE_SECTIONS, 'chat-colors') as SectionDef;
const typographySectionDef = findSection(STYLE_SECTIONS, 'typography') as SectionDef;
const launcherStyleSectionDef = findSection(STYLE_SECTIONS, 'launcher-style') as SectionDef;
const shapeSectionDef = findSection(STYLE_SECTIONS, 'shape') as SectionDef;
const shadowsSectionDef = findSection(STYLE_SECTIONS, 'shadows') as SectionDef;
const widgetStyleSectionDef = findSection(STYLE_SECTIONS, 'widget-style') as SectionDef;

// ─── Brand Color Compound Handler ────────────────────────────────

const BRAND_COLOR_PATTERN = /^theme\.palette\.colors\.(primary|secondary|accent)\.500$/;

/**
 * Wraps the base onChange to generate full color scales when a brand color
 * is changed. A single color pick generates all 11 shades (50–950) for both
 * light and dark themes, and updates the relevant semantic references.
 */
function createBrandColorOnChange(baseOnChange: OnChangeCallback): OnChangeCallback {
  return (path: string, value: any) => {
    const match = path.match(BRAND_COLOR_PATTERN);
    if (!match) {
      baseOnChange(path, value);
      return;
    }

    const family = match[1];
    const hex = normalizeColorValue(String(value));
    if (!isValidHex(hex)) {
      baseOnChange(path, value);
      return;
    }

    const scale = generateColorScale(hex);
    const updates: Record<string, string> = {};

    for (const [shade, shadeValue] of Object.entries(scale)) {
      updates[`theme.palette.colors.${family}.${shade}`] = shadeValue!;
      updates[`darkTheme.palette.colors.${family}.${shade}`] = shadeValue!;
    }

    if (family === 'primary') {
      updates['theme.semantic.colors.primary'] = 'palette.colors.primary.500';
      updates['theme.semantic.colors.interactive.default'] = 'palette.colors.primary.500';
      updates['theme.semantic.colors.interactive.hover'] = 'palette.colors.primary.600';
      updates['darkTheme.semantic.colors.primary'] = 'palette.colors.primary.400';
      updates['darkTheme.semantic.colors.interactive.default'] = 'palette.colors.primary.400';
      updates['darkTheme.semantic.colors.interactive.hover'] = 'palette.colors.primary.300';
    }

    if (family === 'secondary') {
      updates['theme.semantic.colors.secondary'] = 'palette.colors.secondary.500';
      updates['darkTheme.semantic.colors.secondary'] = 'palette.colors.secondary.400';
    }

    if (family === 'accent') {
      updates['theme.semantic.colors.accent'] = 'palette.colors.accent.500';
      updates['darkTheme.semantic.colors.accent'] = 'palette.colors.accent.400';
    }

    state.setBatch(updates);
  };
}

// ─── Drill-down link helper ─────────────────────────────────────

function createDrilldownLink(text: string, view: DrilldownView): HTMLElement {
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'drilldown-link section-header-action';
  link.dataset.drilldownTarget = view;
  link.innerHTML = `${text} <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;
  return link;
}

function createCrossLinkAction(text: string, tabId: 'style' | 'configure', sectionId: string): HTMLElement {
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'drilldown-link section-header-action';
  link.dataset.crosslinkTab = tabId;
  link.dataset.crosslinkSection = sectionId;
  link.innerHTML = `${text} <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;
  return link;
}

function createSummarySwatch(label: string, color: string): HTMLElement {
  const item = document.createElement('span');
  item.className = 'accordion-summary-item accordion-summary-item-color';
  item.innerHTML = `
    <span class="accordion-summary-swatch" style="background:${color}"></span>
    <span class="accordion-summary-copy">${label}</span>
  `;
  return item;
}

function createSummaryPill(text: string): HTMLElement {
  const item = document.createElement('span');
  item.className = 'accordion-summary-item accordion-summary-item-text';
  item.textContent = text;
  return item;
}

function getTokenTail(path: string): string {
  const parts = path.split('.');
  return parts[parts.length - 1] || path;
}

function resolveThemeColor(path: string): string {
  return resolveThemeColorPath((p) => state.get(p), path);
}

function ensureHeaderMeta(
  container: HTMLElement,
  sectionId: string
): { summary: HTMLElement; actions: HTMLElement } | null {
  const section = container.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`);
  const header = section?.querySelector<HTMLElement>('.accordion-header');
  if (!section || !header) return null;

  let meta = header.querySelector<HTMLElement>('.accordion-header-meta');
  if (!meta) {
    meta = document.createElement('div');
    meta.className = 'accordion-header-meta';
    meta.innerHTML = `
      <div class="accordion-summary"></div>
      <div class="section-header-actions"></div>
    `;
    header.appendChild(meta);
  }

  return {
    summary: meta.querySelector<HTMLElement>('.accordion-summary')!,
    actions: meta.querySelector<HTMLElement>('.section-header-actions')!,
  };
}

function renderSectionHeaderMetadata(container: HTMLElement): void {
  const runtimeHeader = ensureHeaderMeta(container, themeModeSectionDef.id);
  if (runtimeHeader) {
    const runtimeValue = String(state.get('colorScheme') ?? 'auto');
    runtimeHeader.summary.replaceChildren(
      createSummaryPill(
        runtimeValue === 'auto'
          ? 'Follow system'
          : runtimeValue === 'dark'
            ? 'Always dark'
            : 'Always light'
      )
    );
    runtimeHeader.actions.replaceChildren();
  }

  const brandHeader = ensureHeaderMeta(container, brandColorsSectionDef.id);
  if (brandHeader) {
    brandHeader.summary.replaceChildren(
      createSummarySwatch('Primary', String(state.get('theme.palette.colors.primary.500') ?? '#2563eb')),
      createSummarySwatch('Secondary', String(state.get('theme.palette.colors.secondary.500') ?? '#7c3aed')),
      createSummarySwatch('Accent', String(state.get('theme.palette.colors.accent.500') ?? '#06b6d4'))
    );
    brandHeader.actions.replaceChildren(createDrilldownLink('Full palette', 'palette'));
  }

  const chatHeader = ensureHeaderMeta(container, chatColorsSectionDef.id);
  if (chatHeader) {
    chatHeader.summary.replaceChildren(
      createSummarySwatch('Header', resolveThemeColor('theme.components.header.background')),
      createSummarySwatch('User', resolveThemeColor('theme.components.message.user.background')),
      createSummarySwatch('Assistant', resolveThemeColor('theme.components.message.assistant.background'))
    );
    chatHeader.actions.replaceChildren(createDrilldownLink('Component colors', 'component-colors'));
  }

  const launcherHeader = ensureHeaderMeta(container, launcherStyleSectionDef.id);
  if (launcherHeader) {
    launcherHeader.summary.replaceChildren(
      createSummaryPill(`Shape: ${getTokenTail(String(state.get('theme.components.launcher.borderRadius') ?? 'palette.radius.full'))}`),
      createSummaryPill(`Size: ${String(state.get('theme.components.launcher.size') ?? '60px')}`),
      createSummaryPill(`Position: ${String(state.get('launcher.position') ?? 'bottom-right')}`)
    );
    launcherHeader.actions.replaceChildren(createCrossLinkAction('Configure behavior', 'configure', 'launcher-config'));
  }

  const typographyHeader = ensureHeaderMeta(container, typographySectionDef.id);
  if (typographyHeader) {
    typographyHeader.summary.replaceChildren(
      createSummaryPill(`Family: ${getTokenTail(String(state.get('theme.semantic.typography.fontFamily') ?? 'palette.typography.fontFamily.sans'))}`),
      createSummaryPill(`Base size: ${getTokenTail(String(state.get('theme.semantic.typography.fontSize') ?? 'palette.typography.fontSize.base'))}`)
    );
    typographyHeader.actions.replaceChildren();
  }

  const widgetHeader = ensureHeaderMeta(container, widgetStyleSectionDef.id);
  if (widgetHeader) {
    widgetHeader.summary.replaceChildren(
      createSummaryPill(`Panel: ${getTokenTail(String(state.get('theme.components.panel.borderRadius') ?? 'palette.radius.xl'))}`),
      createSummaryPill(`Messages: ${getTokenTail(String(state.get('theme.components.message.user.borderRadius') ?? 'palette.radius.lg'))}`)
    );
    widgetHeader.actions.replaceChildren(createDrilldownLink('Component shapes', 'component-shapes'));
  }
}

// ─── Render ───────────────────────────────────────────────────────

function renderSections(
  container: HTMLElement,
  onChange: OnChangeCallback,
  sections: SectionDef[],
): ControlResult[] {
  const allControls: ControlResult[] = [];

  for (const section of sections) {
    setSearchContext(TAB_ID, section.id);
    const { element, controls } = renderSection(section, onChange);

    if (section.presets) {
      const header = element.querySelector('.accordion-header');
      if (header) {
        const presetsDiv = document.createElement('div');
        presetsDiv.className = 'accordion-presets';
        for (const preset of section.presets) {
          const btn = document.createElement('button');
          btn.className = 'preset-btn';
          btn.textContent = preset.label;
          btn.type = 'button';
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            state.setBatch(preset.values);
            for (const control of controls) {
              const val = state.get(control.fieldDef.path);
              if (val !== undefined) control.setValue(val);
            }
          });
          presetsDiv.appendChild(btn);
        }
        header.appendChild(presetsDiv);
      }
    }

    container.appendChild(element);
    allControls.push(...controls);
  }

  return allControls;
}

/** Render the Style tab summary view */
export function render(
  container: HTMLElement,
  onChange: OnChangeCallback
): ControlResult[] {
  const allControls: ControlResult[] = [];

  // Brand colors use compound onChange (auto-generates full scale)
  const brandOnChange = createBrandColorOnChange(onChange);
  allControls.push(...renderSections(container, brandOnChange, [brandColorsSectionDef]));

  allControls.push(...renderSections(container, onChange, [chatColorsSectionDef]));

  allControls.push(...renderSections(container, onChange, [launcherStyleSectionDef]));

  allControls.push(...renderSections(container, onChange, [
    typographySectionDef,
    themeModeSectionDef,
    shapeSectionDef,
    shadowsSectionDef,
  ]));

  allControls.push(...renderSections(container, onChange, [widgetStyleSectionDef]));
  renderSectionHeaderMetadata(container);

  return allControls;
}

export function refreshSectionMetadata(container: HTMLElement): void {
  renderSectionHeaderMetadata(container);
}
