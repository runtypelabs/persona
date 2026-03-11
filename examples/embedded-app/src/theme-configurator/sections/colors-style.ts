/** Tab 1: Colors & Style — palette, semantic tokens, typography, radius, shadows */

import type { SectionDef, OnChangeCallback } from '../types';
import type { ControlResult } from '../types';
import { COLOR_FAMILIES, SHADE_KEYS } from '../color-utils';
import { renderSection } from '../controls';
import { setSearchContext } from '../search';
import * as state from '../state';

export const TAB_ID = 'colors-style';
export const TAB_LABEL = 'Colors & Style';

// ─── Section Definitions ──────────────────────────────────────────

const colorSchemeSectionDef: SectionDef = {
  id: 'color-scheme',
  title: 'Color Scheme',
  collapsed: false,
  fields: [
    {
      id: 'color-scheme',
      label: 'Color Scheme',
      description: 'Light, dark, or auto (follows system)',
      type: 'select',
      path: 'colorScheme',
      defaultValue: 'light',
      options: [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
        { value: 'auto', label: 'Auto (System)' },
      ],
    },
  ],
};

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

const radiusSectionDef: SectionDef = {
  id: 'radius',
  title: 'Border Radius',
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

// ─── Render ───────────────────────────────────────────────────────

export function render(
  container: HTMLElement,
  onChange: OnChangeCallback
): ControlResult[] {
  const allControls: ControlResult[] = [];

  const sections = [
    colorSchemeSectionDef,
    buildPaletteSectionDef(),
    semanticColorsSectionDef,
    typographySectionDef,
    radiusSectionDef,
    shadowsSectionDef,
  ];

  for (const section of sections) {
    setSearchContext(TAB_ID, section.id);
    const { element, controls } = renderSection(section, onChange);

    // Add preset buttons if defined
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
            // Refresh control values
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
