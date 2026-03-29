/** Style tab — outcome-oriented controls: Theme, Brand Palette, Interface Roles, Status Colors, Advanced Tokens */

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
import {
  STYLE_SECTIONS,
  STYLE_SECTIONS_V2,
  THEME_SECTION,
  BRAND_PALETTE_SECTION,
  STATUS_PALETTE_SECTION,
  INTERFACE_ROLES_SECTION,
  STATUS_COLORS_SECTION,
  ADVANCED_TOKENS_SECTION,
  findSection,
} from '@runtypelabs/persona/theme-editor';

export const TAB_ID = 'style';
export const TAB_LABEL = 'Style';

// ─── Drill-down types ────────────────────────────────────────────

export type DrilldownView = 'none' | 'palette' | 'component-colors' | 'component-shapes' | 'advanced-tokens';

// ─── V1 section lookups (used in Advanced Tokens drilldown) ─────

const chatColorsSectionDef = findSection(STYLE_SECTIONS, 'chat-colors') as SectionDef;
const typographySectionDef = findSection(STYLE_SECTIONS, 'typography') as SectionDef;
const launcherStyleSectionDef = findSection(STYLE_SECTIONS, 'launcher-style') as SectionDef;
const shapeSectionDef = findSection(STYLE_SECTIONS, 'shape') as SectionDef;
const shadowsSectionDef = findSection(STYLE_SECTIONS, 'shadows') as SectionDef;
const widgetStyleSectionDef = findSection(STYLE_SECTIONS, 'widget-style') as SectionDef;

/** Sections rendered inside the Advanced Tokens drilldown */
export const ADVANCED_TOKENS_DRILLDOWN_SECTIONS: SectionDef[] = [
  chatColorsSectionDef,
  typographySectionDef,
  launcherStyleSectionDef,
  shapeSectionDef,
  shadowsSectionDef,
  widgetStyleSectionDef,
];

// ─── Brand Color Compound Handler ────────────────────────────────

const BRAND_COLOR_PATTERN = /^theme\.palette\.colors\.(primary|secondary|accent|gray)\.500$/;

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
  // Theme mode
  const themeHeader = ensureHeaderMeta(container, THEME_SECTION.id);
  if (themeHeader) {
    const value = String(state.get('colorScheme') ?? 'auto');
    themeHeader.summary.replaceChildren(
      createSummaryPill(
        value === 'auto' ? 'Auto' : value === 'dark' ? 'Dark' : 'Light'
      )
    );
    themeHeader.actions.replaceChildren();
  }

  // Brand Palette
  const brandHeader = ensureHeaderMeta(container, BRAND_PALETTE_SECTION.id);
  if (brandHeader) {
    brandHeader.summary.replaceChildren(
      createSummarySwatch('Primary', String(state.get('theme.palette.colors.primary.500') ?? '#171717')),
      createSummarySwatch('Secondary', String(state.get('theme.palette.colors.secondary.500') ?? '#8b5cf6')),
      createSummarySwatch('Accent', String(state.get('theme.palette.colors.accent.500') ?? '#06b6d4')),
      createSummarySwatch('Neutral', String(state.get('theme.palette.colors.gray.500') ?? '#6b7280'))
    );
    brandHeader.actions.replaceChildren(createDrilldownLink('Full palette', 'palette'));
  }

  // Advanced Tokens
  const advancedHeader = ensureHeaderMeta(container, ADVANCED_TOKENS_SECTION.id);
  if (advancedHeader) {
    advancedHeader.summary.replaceChildren();
    advancedHeader.actions.replaceChildren(
      createDrilldownLink('Semantic & component tokens', 'advanced-tokens'),
      createDrilldownLink('Component shapes', 'component-shapes'),
      createDrilldownLink('Component colors', 'component-colors')
    );
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

/** Render the Style tab V2 summary view */
export function render(
  container: HTMLElement,
  onChange: OnChangeCallback
): ControlResult[] {
  const allControls: ControlResult[] = [];

  // Theme mode
  allControls.push(...renderSections(container, onChange, [THEME_SECTION as SectionDef]));

  // Brand Palette (uses compound onChange for auto-generating scales)
  const brandOnChange = createBrandColorOnChange(onChange);
  allControls.push(...renderSections(container, brandOnChange, [
    BRAND_PALETTE_SECTION as SectionDef,
    STATUS_PALETTE_SECTION as SectionDef,
  ]));

  // Interface Roles
  allControls.push(...renderSections(container, onChange, [INTERFACE_ROLES_SECTION as SectionDef]));

  // Status Colors
  allControls.push(...renderSections(container, onChange, [STATUS_COLORS_SECTION as SectionDef]));

  // Advanced Tokens (entry point — no fields, just drilldown links)
  allControls.push(...renderSections(container, onChange, [ADVANCED_TOKENS_SECTION as SectionDef]));

  renderSectionHeaderMetadata(container);

  return allControls;
}

/** Render the Advanced Tokens drilldown content */
export function renderAdvancedTokensDrilldown(
  container: HTMLElement,
  onChange: OnChangeCallback
): ControlResult[] {
  return renderSections(container, onChange, ADVANCED_TOKENS_DRILLDOWN_SECTIONS);
}

export function refreshSectionMetadata(container: HTMLElement): void {
  renderSectionHeaderMetadata(container);
}
