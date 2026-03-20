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

export const TAB_ID = 'style';
export const TAB_LABEL = 'Style';

// ─── Drill-down types ────────────────────────────────────────────

export type DrilldownView = 'none' | 'palette' | 'component-colors' | 'component-shapes';

// ─── Section Definitions ──────────────────────────────────────────

const themeModeSectionDef: SectionDef = {
  id: 'theme-mode',
  title: 'Runtime Theme',
  description: 'Controls how the shipped widget picks light or dark mode. Brand colors still generate both token sets.',
  collapsed: false,
  fields: [
    {
      id: 'theme-mode',
      label: 'Runtime Theme',
      description: 'Always Light, Always Dark, or follow the visitor system preference',
      type: 'select',
      path: 'colorScheme',
      defaultValue: 'auto',
      options: [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
        { value: 'auto', label: 'Follow System' },
      ],
    },
  ],
};

const brandColorsSectionDef: SectionDef = {
  id: 'brand-colors',
  title: 'Brand Colors',
  description: 'Pick your brand colors. A full shade scale is generated automatically for both light and dark themes.',
  collapsed: false,
  fields: [
    { id: 'brand-primary', label: 'Primary', description: 'Main brand color for buttons, links, and accents', type: 'color', path: 'theme.palette.colors.primary.500', defaultValue: '#2563eb' },
    { id: 'brand-secondary', label: 'Secondary', description: 'Supporting brand color', type: 'color', path: 'theme.palette.colors.secondary.500', defaultValue: '#7c3aed' },
    { id: 'brand-accent', label: 'Accent', description: 'Highlight and decorative color', type: 'color', path: 'theme.palette.colors.accent.500', defaultValue: '#06b6d4' },
  ],
};

const chatColorsSectionDef: SectionDef = {
  id: 'chat-colors',
  title: 'Chat Colors',
  description: 'Customize the main colors of the chat interface.',
  collapsed: true,
  fields: [
    { id: 'chat-header-bg', label: 'Header Background', type: 'token-ref', path: 'theme.components.header.background', defaultValue: 'semantic.colors.surface', tokenRef: { tokenType: 'color' } },
    { id: 'chat-msg-user-bg', label: 'User Message Background', type: 'token-ref', path: 'theme.components.message.user.background', defaultValue: 'semantic.colors.primary', tokenRef: { tokenType: 'color' } },
    { id: 'chat-msg-user-text', label: 'User Message Text', type: 'token-ref', path: 'theme.components.message.user.text', defaultValue: 'semantic.colors.textInverse', tokenRef: { tokenType: 'color' } },
    { id: 'chat-msg-assistant-bg', label: 'Assistant Message Background', type: 'token-ref', path: 'theme.components.message.assistant.background', defaultValue: 'semantic.colors.container', tokenRef: { tokenType: 'color' } },
    { id: 'chat-msg-assistant-text', label: 'Assistant Message Text', type: 'token-ref', path: 'theme.components.message.assistant.text', defaultValue: 'semantic.colors.text', tokenRef: { tokenType: 'color' } },
  ],
};

const typographySectionDef: SectionDef = {
  id: 'typography',
  title: 'Typography',
  collapsed: true,
  fields: [
    {
      id: 'typo-font-family',
      label: 'Font Family',
      type: 'select',
      path: 'theme.semantic.typography.fontFamily',
      defaultValue: 'palette.typography.fontFamily.sans',
      options: [
        { value: 'palette.typography.fontFamily.sans', label: 'Sans Serif' },
        { value: 'palette.typography.fontFamily.serif', label: 'Serif' },
        { value: 'palette.typography.fontFamily.mono', label: 'Monospace' },
      ],
    },
    {
      id: 'typo-font-size',
      label: 'Base Font Size',
      type: 'select',
      path: 'theme.semantic.typography.fontSize',
      defaultValue: 'palette.typography.fontSize.base',
      options: [
        { value: 'palette.typography.fontSize.xs', label: 'Extra Small (0.75rem)' },
        { value: 'palette.typography.fontSize.sm', label: 'Small (0.875rem)' },
        { value: 'palette.typography.fontSize.base', label: 'Base (1rem)' },
        { value: 'palette.typography.fontSize.lg', label: 'Large (1.125rem)' },
        { value: 'palette.typography.fontSize.xl', label: 'Extra Large (1.25rem)' },
      ],
    },
    {
      id: 'typo-font-weight',
      label: 'Font Weight',
      type: 'select',
      path: 'theme.semantic.typography.fontWeight',
      defaultValue: 'palette.typography.fontWeight.normal',
      options: [
        { value: 'palette.typography.fontWeight.normal', label: 'Normal (400)' },
        { value: 'palette.typography.fontWeight.medium', label: 'Medium (500)' },
        { value: 'palette.typography.fontWeight.semibold', label: 'Semibold (600)' },
        { value: 'palette.typography.fontWeight.bold', label: 'Bold (700)' },
      ],
    },
    {
      id: 'typo-line-height',
      label: 'Line Height',
      type: 'select',
      path: 'theme.semantic.typography.lineHeight',
      defaultValue: 'palette.typography.lineHeight.normal',
      options: [
        { value: 'palette.typography.lineHeight.tight', label: 'Tight (1.25)' },
        { value: 'palette.typography.lineHeight.normal', label: 'Normal (1.5)' },
        { value: 'palette.typography.lineHeight.relaxed', label: 'Relaxed (1.625)' },
      ],
    },
  ],
};

const launcherStyleSectionDef: SectionDef = {
  id: 'launcher-style',
  title: 'Launcher',
  description: 'Control launcher appearance while launcher content and behavior stay in Configure.',
  collapsed: true,
  fields: [
    { id: 'style-launcher-size', label: 'Launcher Size', type: 'slider', path: 'theme.components.launcher.size', defaultValue: '60px', slider: { min: 32, max: 80, step: 2 } },
    { id: 'style-launcher-shape', label: 'Launcher Shape', type: 'select', path: 'theme.components.launcher.borderRadius', defaultValue: 'palette.radius.full', options: [
      { value: 'palette.radius.md', label: 'Rounded Square' },
      { value: 'palette.radius.lg', label: 'Rounded' },
      { value: 'palette.radius.xl', label: 'Very Rounded' },
      { value: 'palette.radius.full', label: 'Circle' },
    ] },
    { id: 'style-launcher-shadow', label: 'Launcher Shadow', type: 'select', path: 'theme.components.launcher.shadow', defaultValue: 'palette.shadows.lg', options: [
      { value: 'palette.shadows.none', label: 'None' },
      { value: 'palette.shadows.sm', label: 'Small' },
      { value: 'palette.shadows.md', label: 'Medium' },
      { value: 'palette.shadows.lg', label: 'Large' },
      { value: 'palette.shadows.xl', label: 'Extra Large' },
    ] },
  ],
};

const shapeSectionDef: SectionDef = {
  id: 'shape',
  title: 'Shape',
  description: 'Control the corner roundness across the widget.',
  collapsed: true,
  fields: [
    { id: 'radius-sm', label: 'Small', type: 'slider', path: 'theme.palette.radius.sm', defaultValue: '0.125rem', slider: { min: 0, max: 16, step: 1 } },
    { id: 'radius-md', label: 'Medium', type: 'slider', path: 'theme.palette.radius.md', defaultValue: '0.375rem', slider: { min: 0, max: 24, step: 1 } },
    { id: 'radius-lg', label: 'Large', type: 'slider', path: 'theme.palette.radius.lg', defaultValue: '0.5rem', slider: { min: 0, max: 32, step: 1 } },
    { id: 'radius-xl', label: 'Extra Large', type: 'slider', path: 'theme.palette.radius.xl', defaultValue: '0.75rem', slider: { min: 0, max: 48, step: 1 } },
    { id: 'radius-full', label: 'Full', type: 'slider', path: 'theme.palette.radius.full', defaultValue: '9999px', slider: { min: 0, max: 100, step: 1, isRadiusFull: true } },
  ],
  presets: [
    { id: 'radius-default', label: 'Default', values: { 'theme.palette.radius.sm': '0.125rem', 'theme.palette.radius.md': '0.375rem', 'theme.palette.radius.lg': '0.5rem', 'theme.palette.radius.xl': '0.75rem', 'theme.palette.radius.full': '9999px' } },
    { id: 'radius-sharp', label: 'Sharp', values: { 'theme.palette.radius.sm': '1px', 'theme.palette.radius.md': '2px', 'theme.palette.radius.lg': '3px', 'theme.palette.radius.xl': '4px', 'theme.palette.radius.full': '4px' } },
    { id: 'radius-rounded', label: 'Rounded', values: { 'theme.palette.radius.sm': '0.5rem', 'theme.palette.radius.md': '0.75rem', 'theme.palette.radius.lg': '1rem', 'theme.palette.radius.xl': '1.5rem', 'theme.palette.radius.full': '9999px' } },
  ],
};

const shadowsSectionDef: SectionDef = {
  id: 'shadows',
  title: 'Shadows',
  collapsed: true,
  fields: [
    { id: 'shadow-sm', label: 'Small', type: 'text', path: 'theme.palette.shadows.sm', defaultValue: '0 1px 2px 0 rgb(0 0 0 / 0.05)' },
    { id: 'shadow-md', label: 'Medium', type: 'text', path: 'theme.palette.shadows.md', defaultValue: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' },
    { id: 'shadow-lg', label: 'Large', type: 'text', path: 'theme.palette.shadows.lg', defaultValue: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)' },
    { id: 'shadow-xl', label: 'Extra Large', type: 'text', path: 'theme.palette.shadows.xl', defaultValue: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' },
  ],
};

const widgetStyleSectionDef: SectionDef = {
  id: 'widget-style',
  title: 'Widget Surface',
  description: 'Adjust the main panel and message bubble treatment.',
  collapsed: true,
  fields: [
    { id: 'style-panel-radius', label: 'Panel Corner Radius', type: 'select', path: 'theme.components.panel.borderRadius', defaultValue: 'palette.radius.xl', options: [
      { value: 'palette.radius.none', label: 'None' },
      { value: 'palette.radius.sm', label: 'Small' },
      { value: 'palette.radius.md', label: 'Medium' },
      { value: 'palette.radius.lg', label: 'Large' },
      { value: 'palette.radius.xl', label: 'Extra Large' },
    ] },
    { id: 'style-panel-shadow', label: 'Panel Shadow', type: 'select', path: 'theme.components.panel.shadow', defaultValue: 'palette.shadows.xl', options: [
      { value: 'palette.shadows.none', label: 'None' },
      { value: 'palette.shadows.sm', label: 'Small' },
      { value: 'palette.shadows.md', label: 'Medium' },
      { value: 'palette.shadows.lg', label: 'Large' },
      { value: 'palette.shadows.xl', label: 'Extra Large' },
    ] },
    { id: 'style-msg-user-radius', label: 'User Message Radius', type: 'select', path: 'theme.components.message.user.borderRadius', defaultValue: 'palette.radius.lg', options: [
      { value: 'palette.radius.none', label: 'None' },
      { value: 'palette.radius.sm', label: 'Small' },
      { value: 'palette.radius.md', label: 'Medium' },
      { value: 'palette.radius.lg', label: 'Large' },
      { value: 'palette.radius.xl', label: 'Extra Large' },
    ] },
    { id: 'style-msg-assistant-radius', label: 'Assistant Message Radius', type: 'select', path: 'theme.components.message.assistant.borderRadius', defaultValue: 'palette.radius.lg', options: [
      { value: 'palette.radius.none', label: 'None' },
      { value: 'palette.radius.sm', label: 'Small' },
      { value: 'palette.radius.md', label: 'Medium' },
      { value: 'palette.radius.lg', label: 'Large' },
      { value: 'palette.radius.xl', label: 'Extra Large' },
    ] },
  ],
};

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
