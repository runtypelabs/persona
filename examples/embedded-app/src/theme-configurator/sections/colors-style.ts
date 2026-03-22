/** Colors & Style — palette scales and semantic tokens for drill-down views */

import type { FieldDef, SectionDef, SectionPreset, OnChangeCallback } from '../types';
import type { ControlResult } from '../types';
import { COLOR_FAMILIES, SHADE_KEYS } from '../color-utils';
import { renderSection } from '../controls';
import { setSearchContext } from '../search';
import * as state from '../state';

export const TAB_ID = 'style';
export const TAB_LABEL = 'Style';

// ─── Section Definitions ──────────────────────────────────────────

function buildPaletteSectionDef(): SectionDef {
  const fields = COLOR_FAMILIES.map(family => ({
    id: `palette-${family}`,
    label: `${family.charAt(0).toUpperCase() + family.slice(1)}`,
    description: `${family} color palette (edit shade 500, auto-generate scale)`,
    type: 'color-scale' as const,
    path: `theme.palette.colors.${family}`,
    colorScale: { colorFamily: family },
  }));

  return {
    id: 'brand-palette',
    title: 'Brand Palette',
    description: 'Define your color palette. Edit the base color (500) to auto-generate the full scale.',
    collapsed: false,
    fields,
  };
}

const semanticColorsSectionDef: SectionDef = {
  id: 'semantic-colors',
  title: 'Semantic Colors',
  description: 'Map intents to palette colors. These define the meaning of colors across the widget.',
  collapsed: true,
  fields: [
    // Main colors
    { id: 'sem-primary', label: 'Primary', description: 'Main brand/action color', type: 'token-ref', path: 'theme.semantic.colors.primary', defaultValue: 'palette.colors.primary.500', tokenRef: { tokenType: 'color' } },
    { id: 'sem-secondary', label: 'Secondary', description: 'Secondary actions', type: 'token-ref', path: 'theme.semantic.colors.secondary', defaultValue: 'palette.colors.gray.500', tokenRef: { tokenType: 'color' } },
    { id: 'sem-accent', label: 'Accent', description: 'Accent/highlight color', type: 'token-ref', path: 'theme.semantic.colors.accent', defaultValue: 'palette.colors.primary.600', tokenRef: { tokenType: 'color' } },
    // Surfaces
    { id: 'sem-surface', label: 'Surface', description: 'Primary surface background', type: 'token-ref', path: 'theme.semantic.colors.surface', defaultValue: 'palette.colors.gray.50', tokenRef: { tokenType: 'color' } },
    { id: 'sem-background', label: 'Background', description: 'Page/widget background', type: 'token-ref', path: 'theme.semantic.colors.background', defaultValue: 'palette.colors.gray.50', tokenRef: { tokenType: 'color' } },
    { id: 'sem-container', label: 'Container', description: 'Container/card background', type: 'token-ref', path: 'theme.semantic.colors.container', defaultValue: 'palette.colors.gray.100', tokenRef: { tokenType: 'color' } },
    // Text
    { id: 'sem-text', label: 'Text', description: 'Primary text color', type: 'token-ref', path: 'theme.semantic.colors.text', defaultValue: 'palette.colors.gray.900', tokenRef: { tokenType: 'color' } },
    { id: 'sem-text-muted', label: 'Text Muted', description: 'Secondary/muted text', type: 'token-ref', path: 'theme.semantic.colors.textMuted', defaultValue: 'palette.colors.gray.500', tokenRef: { tokenType: 'color' } },
    { id: 'sem-text-inverse', label: 'Text Inverse', description: 'Text on dark backgrounds', type: 'token-ref', path: 'theme.semantic.colors.textInverse', defaultValue: 'palette.colors.gray.50', tokenRef: { tokenType: 'color' } },
    // Borders
    { id: 'sem-border', label: 'Border', description: 'Default border color', type: 'token-ref', path: 'theme.semantic.colors.border', defaultValue: 'palette.colors.gray.200', tokenRef: { tokenType: 'color' } },
    { id: 'sem-divider', label: 'Divider', description: 'Divider/separator color', type: 'token-ref', path: 'theme.semantic.colors.divider', defaultValue: 'palette.colors.gray.200', tokenRef: { tokenType: 'color' } },
    // Interactive states
    { id: 'sem-interactive-default', label: 'Interactive Default', description: 'Default interactive state', type: 'token-ref', path: 'theme.semantic.colors.interactive.default', defaultValue: 'palette.colors.primary.500', tokenRef: { tokenType: 'color' } },
    { id: 'sem-interactive-hover', label: 'Interactive Hover', description: 'Hover state', type: 'token-ref', path: 'theme.semantic.colors.interactive.hover', defaultValue: 'palette.colors.primary.600', tokenRef: { tokenType: 'color' } },
    { id: 'sem-interactive-focus', label: 'Interactive Focus', description: 'Focus state', type: 'token-ref', path: 'theme.semantic.colors.interactive.focus', defaultValue: 'palette.colors.primary.700', tokenRef: { tokenType: 'color' } },
    { id: 'sem-interactive-active', label: 'Interactive Active', description: 'Active/pressed state', type: 'token-ref', path: 'theme.semantic.colors.interactive.active', defaultValue: 'palette.colors.primary.800', tokenRef: { tokenType: 'color' } },
    { id: 'sem-interactive-disabled', label: 'Interactive Disabled', description: 'Disabled state', type: 'token-ref', path: 'theme.semantic.colors.interactive.disabled', defaultValue: 'palette.colors.gray.300', tokenRef: { tokenType: 'color' } },
    // Feedback
    { id: 'sem-feedback-success', label: 'Success', description: 'Success feedback', type: 'token-ref', path: 'theme.semantic.colors.feedback.success', defaultValue: 'palette.colors.success.500', tokenRef: { tokenType: 'color' } },
    { id: 'sem-feedback-warning', label: 'Warning', description: 'Warning feedback', type: 'token-ref', path: 'theme.semantic.colors.feedback.warning', defaultValue: 'palette.colors.warning.500', tokenRef: { tokenType: 'color' } },
    { id: 'sem-feedback-error', label: 'Error', description: 'Error feedback', type: 'token-ref', path: 'theme.semantic.colors.feedback.error', defaultValue: 'palette.colors.error.500', tokenRef: { tokenType: 'color' } },
    { id: 'sem-feedback-info', label: 'Info', description: 'Info feedback', type: 'token-ref', path: 'theme.semantic.colors.feedback.info', defaultValue: 'palette.colors.primary.500', tokenRef: { tokenType: 'color' } },
  ],
};

type ThemeScope = 'theme' | 'darkTheme';
type ThemeVariant = 'light' | 'dark';

function scopePath(path: string, scope: ThemeScope): string {
  return path.startsWith('theme.') ? path.replace(/^theme\./, `${scope}.`) : path;
}

function scopeField(field: FieldDef, scope: ThemeScope, variant: ThemeVariant): FieldDef {
  return {
    ...field,
    id: `${variant}-${field.id}`,
    path: scopePath(field.path, scope),
  };
}

function scopePreset(preset: SectionPreset, scope: ThemeScope, variant: ThemeVariant): SectionPreset {
  return {
    ...preset,
    id: `${variant}-${preset.id}`,
    values: Object.fromEntries(
      Object.entries(preset.values).map(([path, value]) => [scopePath(path, scope), value])
    ),
  };
}

function scopeSection(
  section: SectionDef,
  scope: ThemeScope,
  variant: ThemeVariant,
  collapsed = section.collapsed
): SectionDef {
  const themeLabel = variant === 'light' ? 'Light' : 'Dark';
  const descriptionPrefix =
    variant === 'light'
      ? 'Applies when the widget is in light mode.'
      : 'Applies when the widget is in dark mode.';

  return {
    ...section,
    id: `${variant}-${section.id}`,
    title: `${themeLabel} ${section.title}`,
    description: section.description
      ? `${descriptionPrefix} ${section.description}`
      : descriptionPrefix,
    collapsed,
    fields: section.fields.map(field => scopeField(field, scope, variant)),
    presets: section.presets?.map(preset => scopePreset(preset, scope, variant)),
  };
}

function buildScopedThemeSections(scope: ThemeScope, variant: ThemeVariant, darkCollapsed = false): SectionDef[] {
  return [scopeSection(buildPaletteSectionDef(), scope, variant, darkCollapsed ? true : false)];
}

function buildScopedSemanticSections(
  scope: ThemeScope,
  variant: ThemeVariant,
  collapsed = true
): SectionDef[] {
  return [scopeSection(semanticColorsSectionDef, scope, variant, collapsed)];
}

function renderScopedSections(
  container: HTMLElement,
  onChange: OnChangeCallback,
  scopedSections: Record<ThemeVariant, SectionDef[]>,
  searchTabId: string
): ControlResult[] {
  const allControls: ControlResult[] = [];

  for (const [variant, sections] of Object.entries(scopedSections) as [ThemeVariant, SectionDef[]][]) {
    const wrapper = document.createElement('div');
    wrapper.className = 'editing-target-group';
    wrapper.dataset.editingTarget = variant;

    for (const section of sections) {
      setSearchContext(searchTabId, section.id);
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

      wrapper.appendChild(element);
      allControls.push(...controls);
    }

    container.appendChild(wrapper);
  }

  return allControls;
}

/** Render palette scale editors (light + dark) for the palette drill-down */
export function renderPaletteScales(
  container: HTMLElement,
  onChange: OnChangeCallback
): ControlResult[] {
  return renderScopedSections(container, onChange, {
    light: buildScopedThemeSections('theme', 'light'),
    dark: buildScopedThemeSections('darkTheme', 'dark', true),
  }, 'style');
}

/** Render semantic color groups (light + dark) for the palette drill-down */
export function renderSemanticGroup(
  container: HTMLElement,
  onChange: OnChangeCallback
): ControlResult[] {
  return renderScopedSections(container, onChange, {
    light: buildScopedSemanticSections('theme', 'light'),
    dark: buildScopedSemanticSections('darkTheme', 'dark'),
  }, 'style');
}

/** Render the full palette drill-down: palette scales + semantic colors */
export function render(
  container: HTMLElement,
  onChange: OnChangeCallback
): ControlResult[] {
  const allControls: ControlResult[] = [];
  allControls.push(...renderPaletteScales(container, onChange));
  allControls.push(...renderSemanticGroup(container, onChange));
  return allControls;
}
