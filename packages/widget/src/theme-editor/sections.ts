/** Declarative section/field definitions for the theme editor (pure data: no DOM, no render logic) */

import type { SectionDef, TabDef, SubGroupDef, FieldDef } from './types';
import {
  DEFAULT_FLOATING_LAUNCHER_MAX_WIDTH,
  DEFAULT_FLOATING_LAUNCHER_WIDTH,
} from '../defaults';
import {
  DEFAULT_PANEL_CANVAS_BACKGROUND,
  DEFAULT_PANEL_INSET,
} from '../utils/tokens';
import { COLOR_FAMILIES } from './color-utils';
import {
  ROLE_SURFACES,
  ROLE_HEADER,
  ROLE_USER_MESSAGES,
  ROLE_ASSISTANT_MESSAGES,
  ROLE_PRIMARY_ACTIONS,
  ROLE_SCROLL_TO_BOTTOM,
  ROLE_INPUT,
  ROLE_LINKS_FOCUS,
  ROLE_BORDERS,
} from './role-mappings';

const parseOptionalCssValue = (value: unknown): string | undefined => {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
};

// Slider controls emit CSS strings, but the WebMCP escape hatch coerces a
// slider to a raw number and token resolution only walks string values.
const parseSliderPxLength = (value: unknown): string =>
  typeof value === 'number' ? `${value}px` : String(value ?? '').trim();

const parseSliderUnitless = (value: unknown): string => String(value ?? '').trim();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STYLE TAB: brand colors, chat colors, typography, shape, etc.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const themeModeSectionDef: SectionDef = {
  id: 'theme-mode',
  title: 'Runtime Theme',
  description: 'Controls how the shipped widget picks light or dark mode.',
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
    { id: 'brand-primary', label: 'Primary', description: 'Main brand color for buttons, links, and accents', type: 'color', path: 'theme.palette.colors.primary.500', defaultValue: '#171717' },
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
    { id: 'chat-header-fg', label: 'Header Foreground', description: 'Anchors the header text. The title takes it, the subtitle and button icons take a 72% mix of it over the background', type: 'token-ref', path: 'theme.components.header.foreground', defaultValue: '', tokenRef: { tokenType: 'color' } },
    { id: 'chat-header-icon-bg', label: 'Header Icon Background', type: 'token-ref', path: 'theme.components.header.iconBackground', defaultValue: 'semantic.colors.primary', tokenRef: { tokenType: 'color' } },
    { id: 'chat-header-icon-fg', label: 'Header Icon Color', type: 'token-ref', path: 'theme.components.header.iconForeground', defaultValue: 'semantic.colors.textInverse', tokenRef: { tokenType: 'color' } },
    { id: 'chat-header-title-fg', label: 'Header Title Color', description: 'Blank follows the header foreground', type: 'token-ref', path: 'theme.components.header.titleForeground', defaultValue: '', tokenRef: { tokenType: 'color' } },
    { id: 'chat-header-subtitle-fg', label: 'Header Subtitle Color', description: 'Blank follows the 72% foreground mix', type: 'token-ref', path: 'theme.components.header.subtitleForeground', defaultValue: '', tokenRef: { tokenType: 'color' } },
    { id: 'chat-header-action-icons-fg', label: 'Header Button Icons', description: 'Blank follows the 72% foreground mix', type: 'token-ref', path: 'theme.components.header.actionIconForeground', defaultValue: '', tokenRef: { tokenType: 'color' } },
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
    { id: 'typo-font-family', label: 'Font Family', type: 'select', path: 'theme.semantic.typography.fontFamily', defaultValue: 'palette.typography.fontFamily.sans', options: [
      { value: 'palette.typography.fontFamily.sans', label: 'Sans Serif' },
      { value: 'palette.typography.fontFamily.serif', label: 'Serif' },
      { value: 'palette.typography.fontFamily.mono', label: 'Monospace' },
    ] },
    { id: 'typo-font-size', label: 'Base Font Size', type: 'select', path: 'theme.semantic.typography.fontSize', defaultValue: 'palette.typography.fontSize.base', options: [
      { value: 'palette.typography.fontSize.xs', label: 'Extra Small (0.75rem)' },
      { value: 'palette.typography.fontSize.sm', label: 'Small (0.875rem)' },
      { value: 'palette.typography.fontSize.base', label: 'Base (1rem)' },
      { value: 'palette.typography.fontSize.lg', label: 'Large (1.125rem)' },
      { value: 'palette.typography.fontSize.xl', label: 'Extra Large (1.25rem)' },
    ] },
    { id: 'typo-font-weight', label: 'Font Weight', type: 'select', path: 'theme.semantic.typography.fontWeight', defaultValue: 'palette.typography.fontWeight.normal', options: [
      { value: 'palette.typography.fontWeight.normal', label: 'Normal (400)' },
      { value: 'palette.typography.fontWeight.medium', label: 'Medium (500)' },
      { value: 'palette.typography.fontWeight.semibold', label: 'Semibold (600)' },
      { value: 'palette.typography.fontWeight.bold', label: 'Bold (700)' },
    ] },
    { id: 'typo-line-height', label: 'Line Height', type: 'select', path: 'theme.semantic.typography.lineHeight', defaultValue: 'palette.typography.lineHeight.normal', options: [
      { value: 'palette.typography.lineHeight.tight', label: 'Tight (1.25)' },
      { value: 'palette.typography.lineHeight.normal', label: 'Normal (1.5)' },
      { value: 'palette.typography.lineHeight.relaxed', label: 'Relaxed (1.625)' },
    ] },
  ],
};

const launcherStyleSectionDef: SectionDef = {
  id: 'launcher-style',
  title: 'Launcher',
  description: 'Control launcher appearance.',
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
    { id: 'style-panel-canvas-bg', label: 'Detached Canvas Background', description: 'Fills the region behind a detached panel; defaults to transparent', type: 'token-ref', path: 'theme.components.panel.canvasBackground', defaultValue: DEFAULT_PANEL_CANVAS_BACKGROUND, tokenRef: { tokenType: 'color' } },
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

export const STYLE_SECTIONS: SectionDef[] = [
  brandColorsSectionDef,
  chatColorsSectionDef,
  launcherStyleSectionDef,
  typographySectionDef,
  themeModeSectionDef,
  shapeSectionDef,
  shadowsSectionDef,
  widgetStyleSectionDef,
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COLORS & STYLE TAB: palette scales, semantic tokens
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
  description: 'Map intents to palette colors.',
  collapsed: true,
  fields: [
    { id: 'sem-primary', label: 'Primary', description: 'Main brand/action color', type: 'token-ref', path: 'theme.semantic.colors.primary', defaultValue: 'palette.colors.primary.500', tokenRef: { tokenType: 'color' } },
    { id: 'sem-secondary', label: 'Secondary', description: 'Secondary actions', type: 'token-ref', path: 'theme.semantic.colors.secondary', defaultValue: 'palette.colors.gray.500', tokenRef: { tokenType: 'color' } },
    { id: 'sem-accent', label: 'Accent', description: 'Accent/highlight color', type: 'token-ref', path: 'theme.semantic.colors.accent', defaultValue: 'palette.colors.primary.600', tokenRef: { tokenType: 'color' } },
    { id: 'sem-surface', label: 'Surface', description: 'Primary surface background', type: 'token-ref', path: 'theme.semantic.colors.surface', defaultValue: 'palette.colors.gray.50', tokenRef: { tokenType: 'color' } },
    { id: 'sem-background', label: 'Background', description: 'Page/widget background', type: 'token-ref', path: 'theme.semantic.colors.background', defaultValue: 'palette.colors.gray.50', tokenRef: { tokenType: 'color' } },
    { id: 'sem-container', label: 'Container', description: 'Container/card background', type: 'token-ref', path: 'theme.semantic.colors.container', defaultValue: 'palette.colors.gray.100', tokenRef: { tokenType: 'color' } },
    { id: 'sem-text', label: 'Text', description: 'Primary text color', type: 'token-ref', path: 'theme.semantic.colors.text', defaultValue: 'palette.colors.gray.900', tokenRef: { tokenType: 'color' } },
    { id: 'sem-text-muted', label: 'Text Muted', description: 'Secondary/muted text', type: 'token-ref', path: 'theme.semantic.colors.textMuted', defaultValue: 'palette.colors.gray.500', tokenRef: { tokenType: 'color' } },
    { id: 'sem-text-inverse', label: 'Text Inverse', description: 'Text on dark backgrounds', type: 'token-ref', path: 'theme.semantic.colors.textInverse', defaultValue: 'palette.colors.gray.50', tokenRef: { tokenType: 'color' } },
    { id: 'sem-border', label: 'Border', description: 'Default border color', type: 'token-ref', path: 'theme.semantic.colors.border', defaultValue: 'palette.colors.gray.200', tokenRef: { tokenType: 'color' } },
    { id: 'sem-divider', label: 'Divider', description: 'Divider/separator color', type: 'token-ref', path: 'theme.semantic.colors.divider', defaultValue: 'palette.colors.gray.200', tokenRef: { tokenType: 'color' } },
    { id: 'sem-interactive-default', label: 'Interactive Default', type: 'token-ref', path: 'theme.semantic.colors.interactive.default', defaultValue: 'palette.colors.primary.500', tokenRef: { tokenType: 'color' } },
    { id: 'sem-interactive-hover', label: 'Interactive Hover', type: 'token-ref', path: 'theme.semantic.colors.interactive.hover', defaultValue: 'palette.colors.primary.600', tokenRef: { tokenType: 'color' } },
    { id: 'sem-interactive-focus', label: 'Interactive Focus', type: 'token-ref', path: 'theme.semantic.colors.interactive.focus', defaultValue: 'palette.colors.primary.700', tokenRef: { tokenType: 'color' } },
    { id: 'sem-interactive-active', label: 'Interactive Active', type: 'token-ref', path: 'theme.semantic.colors.interactive.active', defaultValue: 'palette.colors.primary.800', tokenRef: { tokenType: 'color' } },
    { id: 'sem-interactive-disabled', label: 'Interactive Disabled', type: 'token-ref', path: 'theme.semantic.colors.interactive.disabled', defaultValue: 'palette.colors.gray.300', tokenRef: { tokenType: 'color' } },
    { id: 'sem-feedback-success', label: 'Success', type: 'token-ref', path: 'theme.semantic.colors.feedback.success', defaultValue: 'palette.colors.success.500', tokenRef: { tokenType: 'color' } },
    { id: 'sem-feedback-warning', label: 'Warning', type: 'token-ref', path: 'theme.semantic.colors.feedback.warning', defaultValue: 'palette.colors.warning.500', tokenRef: { tokenType: 'color' } },
    { id: 'sem-feedback-error', label: 'Error', type: 'token-ref', path: 'theme.semantic.colors.feedback.error', defaultValue: 'palette.colors.error.500', tokenRef: { tokenType: 'color' } },
    { id: 'sem-feedback-info', label: 'Info', type: 'token-ref', path: 'theme.semantic.colors.feedback.info', defaultValue: 'palette.colors.primary.500', tokenRef: { tokenType: 'color' } },
  ],
};

export const PALETTE_SECTION: SectionDef = buildPaletteSectionDef();
export const SEMANTIC_COLORS_SECTION: SectionDef = semanticColorsSectionDef;

export const COLORS_SECTIONS: SectionDef[] = [
  buildPaletteSectionDef(),
  semanticColorsSectionDef,
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DESIGN SYSTEM TAB: component shapes, colors, layout
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const panelLayoutSectionDef: SectionDef = {
  id: 'comp-panel',
  title: 'Panel',
  collapsed: false,
  fields: [
    { id: 'panel-width', label: 'Width', type: 'text', path: 'theme.components.panel.width', defaultValue: DEFAULT_FLOATING_LAUNCHER_WIDTH },
    { id: 'panel-max-width', label: 'Max Width', type: 'text', path: 'theme.components.panel.maxWidth', defaultValue: DEFAULT_FLOATING_LAUNCHER_MAX_WIDTH },
    { id: 'panel-height', label: 'Height', type: 'text', path: 'theme.components.panel.height', defaultValue: '600px' },
    { id: 'panel-max-height', label: 'Max Height', type: 'text', path: 'theme.components.panel.maxHeight', defaultValue: 'calc(100vh - 80px)' },
    { id: 'panel-border-radius', label: 'Border Radius', type: 'select', path: 'theme.components.panel.borderRadius', defaultValue: 'palette.radius.xl', options: [
      { value: 'palette.radius.none', label: 'None' },
      { value: 'palette.radius.sm', label: 'Small' },
      { value: 'palette.radius.md', label: 'Medium' },
      { value: 'palette.radius.lg', label: 'Large' },
      { value: 'palette.radius.xl', label: 'Extra Large' },
    ] },
    { id: 'panel-shadow', label: 'Shadow', type: 'select', path: 'theme.components.panel.shadow', defaultValue: 'palette.shadows.xl', options: [
      { value: 'palette.shadows.none', label: 'None' },
      { value: 'palette.shadows.sm', label: 'Small' },
      { value: 'palette.shadows.md', label: 'Medium' },
      { value: 'palette.shadows.lg', label: 'Large' },
      { value: 'palette.shadows.xl', label: 'Extra Large' },
    ] },
    { id: 'panel-inset', label: 'Detached Inset', description: 'Gap around the card when launcher.detachedPanel is on', type: 'text', path: 'theme.components.panel.inset', defaultValue: DEFAULT_PANEL_INSET },
  ],
};

const launcherLayoutSectionDef: SectionDef = {
  id: 'comp-launcher',
  title: 'Launcher',
  collapsed: true,
  fields: [
    { id: 'launcher-size', label: 'Size', type: 'slider', path: 'theme.components.launcher.size', defaultValue: '60px', slider: { min: 32, max: 80, step: 2 } },
    { id: 'launcher-icon-size', label: 'Icon Size', type: 'slider', path: 'theme.components.launcher.iconSize', defaultValue: '28px', slider: { min: 16, max: 48, step: 2 } },
    { id: 'launcher-icon-stroke-width', label: 'Icon Stroke Width', description: 'Unitless line weight for the agent glyph and the call-to-action arrow', type: 'slider', path: 'theme.components.launcher.iconStrokeWidth', defaultValue: '1.5', slider: { min: 1, max: 2.5, step: 0.25, unit: 'none' }, parseValue: parseSliderUnitless },
    { id: 'launcher-border-radius', label: 'Border Radius', type: 'select', path: 'theme.components.launcher.borderRadius', defaultValue: 'palette.radius.full', options: [
      { value: 'palette.radius.md', label: 'Medium' },
      { value: 'palette.radius.lg', label: 'Large' },
      { value: 'palette.radius.xl', label: 'Extra Large' },
      { value: 'palette.radius.full', label: 'Full (Circle)' },
    ] },
    { id: 'launcher-shadow', label: 'Shadow', type: 'select', path: 'theme.components.launcher.shadow', defaultValue: 'palette.shadows.lg', options: [
      { value: 'palette.shadows.none', label: 'None' },
      { value: 'palette.shadows.sm', label: 'Small' },
      { value: 'palette.shadows.md', label: 'Medium' },
      { value: 'palette.shadows.lg', label: 'Large' },
      { value: 'palette.shadows.xl', label: 'Extra Large' },
    ] },
  ],
};

const headerControlsSectionDef: SectionDef = {
  id: 'comp-header-controls',
  title: 'Header Controls',
  description:
    'One box, glyph, and stroke shared by every header icon button: close, clear chat, trailing actions, and Messages, plus the strip height.',
  collapsed: true,
  fields: [
    { id: 'header-min-height', label: 'Header Min Height', description: 'CSS length, e.g. 65px. Blank stays at the natural height', type: 'text', path: 'theme.components.header.minHeight', defaultValue: '', parseValue: parseOptionalCssValue },
    { id: 'header-control-size', label: 'Control Size', description: 'The button box. Coarse pointers still floor the hit area at 40px', type: 'slider', path: 'theme.components.header.controlSize', defaultValue: '32px', slider: { min: 24, max: 64, step: 2 }, parseValue: parseSliderPxLength },
    { id: 'header-control-icon-size', label: 'Icon Size', description: 'The glyph inside the button', type: 'slider', path: 'theme.components.header.controlIconSize', defaultValue: '20px', slider: { min: 12, max: 40, step: 1 }, parseValue: parseSliderPxLength },
    { id: 'header-control-stroke-width', label: 'Icon Stroke Width', description: 'Unitless line weight. The close X renders at 0.7 of it so its sparser glyph matches', type: 'slider', path: 'theme.components.header.controlStrokeWidth', defaultValue: '1.5', slider: { min: 1, max: 2.5, step: 0.25, unit: 'none' }, parseValue: parseSliderUnitless },
  ],
};

// The Messages rail's own top strip, beside the widget header in rail
// presentation. Its color lives in COMPONENT_COLOR_SECTIONS.
const historyRailHeaderShapeSectionDef: SectionDef = {
  id: 'comp-history-rail-header',
  title: 'Messages Rail Header',
  description:
    'The Messages rail top strip. Match its height to the header so both read as one band.',
  collapsed: true,
  fields: [
    { id: 'rail-header-min-height', label: 'Min Height', description: 'CSS length. Blank follows the header min height', type: 'text', path: 'theme.components.history.railHeader.minHeight', defaultValue: '', parseValue: parseOptionalCssValue },
    { id: 'rail-header-border', label: 'Bottom Border', description: 'Full border-bottom shorthand, e.g. 1px solid #333', type: 'text', path: 'theme.components.history.railHeader.border', defaultValue: '', parseValue: parseOptionalCssValue },
  ],
};

const historyRailHeaderColorsSectionDef: SectionDef = {
  id: 'comp-history-rail-header-colors',
  title: 'Messages Rail Header Colors',
  collapsed: true,
  fields: [
    { id: 'rail-header-bg', label: 'Background', type: 'token-ref', path: 'theme.components.history.railHeader.background', defaultValue: 'semantic.colors.container', tokenRef: { tokenType: 'color' } },
  ],
};

// The floating rail a collapsed overlay rail opens on hover. Its width and
// edge stay features.history.rail config; only the surface is themeable.
const historyOverlayShapeSectionDef: SectionDef = {
  id: 'comp-history-overlay',
  title: 'Messages Floating Rail',
  description:
    'The Messages rail floating over the conversation, when a collapsed rail opens on hover.',
  collapsed: true,
  fields: [
    { id: 'history-overlay-margin', label: 'Margin', description: 'Gap from the trigger, the docked edge and the bottom', type: 'text', path: 'theme.components.history.overlay.margin', defaultValue: '', parseValue: parseOptionalCssValue },
    { id: 'history-overlay-radius', label: 'Corner Radius', description: 'CSS length on all four corners. Blank keeps 16px', type: 'text', path: 'theme.components.history.overlay.borderRadius', defaultValue: '', parseValue: parseOptionalCssValue },
    { id: 'history-overlay-shadow', label: 'Shadow', description: 'Full box-shadow shorthand. Blank keeps the built-in elevation', type: 'text', path: 'theme.components.history.overlay.shadow', defaultValue: '', parseValue: parseOptionalCssValue },
  ],
};

const historyOverlayColorsSectionDef: SectionDef = {
  id: 'comp-history-overlay-colors',
  title: 'Messages Floating Rail Colors',
  collapsed: true,
  fields: [
    { id: 'history-overlay-bg', label: 'Background', type: 'token-ref', path: 'theme.components.history.overlay.background', defaultValue: 'semantic.colors.container', tokenRef: { tokenType: 'color' } },
  ],
};

// Enter/exit motion of the Messages surface. Durations, not colors, so it
// stays a shape section and never forks per scheme.
const historyMotionSectionDef: SectionDef = {
  id: 'comp-history-motion',
  title: 'Messages Motion',
  description:
    'Enter and exit animation of the Messages body. The bar is persistent chrome and never animates; reduced-motion preferences always win.',
  collapsed: true,
  fields: [
    { id: 'history-motion-enter-ms', label: 'Enter Duration', description: 'Milliseconds, e.g. 180. 0 disables the entrance. Blank keeps 180', type: 'text', path: 'theme.components.history.motion.enterDurationMs', defaultValue: '', parseValue: parseOptionalCssValue },
    { id: 'history-motion-enter-easing', label: 'Enter Easing', description: 'CSS easing, e.g. ease-out or cubic-bezier(0, 0, 0.2, 1)', type: 'text', path: 'theme.components.history.motion.enterEasing', defaultValue: '', parseValue: parseOptionalCssValue },
    { id: 'history-motion-exit-ms', label: 'Exit Duration', description: 'Milliseconds, e.g. 160. 0 disables the exit. Blank keeps 160', type: 'text', path: 'theme.components.history.motion.exitDurationMs', defaultValue: '', parseValue: parseOptionalCssValue },
    { id: 'history-motion-exit-easing', label: 'Exit Easing', description: 'CSS easing, e.g. ease-in or cubic-bezier(0.4, 0, 1, 1)', type: 'text', path: 'theme.components.history.motion.exitEasing', defaultValue: '', parseValue: parseOptionalCssValue },
  ],
};

// The portaled tooltip on icon controls. Its colors live in
// COMPONENT_COLOR_SECTIONS.
const tooltipShapeSectionDef: SectionDef = {
  id: 'comp-tooltip',
  title: 'Tooltip',
  description:
    'The hover and focus tooltip on icon controls, including its shortcut hint chip.',
  collapsed: true,
  fields: [
    { id: 'tooltip-radius', label: 'Corner Radius', type: 'select', path: 'theme.components.tooltip.borderRadius', defaultValue: 'palette.radius.sm', options: [
      { value: 'palette.radius.none', label: 'None' },
      { value: 'palette.radius.sm', label: 'Small' },
      { value: 'palette.radius.md', label: 'Medium' },
      { value: 'palette.radius.lg', label: 'Large' },
      { value: 'palette.radius.xl', label: 'Extra Large' },
    ] },
    { id: 'tooltip-font-size', label: 'Font Size', description: 'CSS length. Blank stays at 12px', type: 'text', path: 'theme.components.tooltip.fontSize', defaultValue: '', parseValue: parseOptionalCssValue },
    { id: 'tooltip-arrow', label: 'Show Arrow', description: 'The caret pointing at the control', type: 'toggle', path: 'theme.components.tooltip.arrow', defaultValue: true },
  ],
};

const tooltipColorsSectionDef: SectionDef = {
  id: 'comp-tooltip-colors',
  title: 'Tooltip Colors',
  collapsed: true,
  fields: [
    { id: 'tooltip-bg', label: 'Background', type: 'token-ref', path: 'theme.components.tooltip.background', defaultValue: 'palette.colors.gray.900', tokenRef: { tokenType: 'color' } },
    { id: 'tooltip-fg', label: 'Label', type: 'token-ref', path: 'theme.components.tooltip.foreground', defaultValue: 'palette.colors.primary.50', tokenRef: { tokenType: 'color' } },
    { id: 'tooltip-hint-fg', label: 'Shortcut Hint', type: 'token-ref', path: 'theme.components.tooltip.hintForeground', defaultValue: 'palette.colors.gray.400', tokenRef: { tokenType: 'color' } },
  ],
};

const messageShapeSectionDef: SectionDef = {
  id: 'comp-message-shape',
  title: 'Message Shape',
  collapsed: true,
  fields: [
    { id: 'msg-user-radius', label: 'User Bubble Radius', type: 'select', path: 'theme.components.message.user.borderRadius', defaultValue: 'palette.radius.lg', options: [
      { value: 'palette.radius.none', label: 'None' },
      { value: 'palette.radius.sm', label: 'Small' },
      { value: 'palette.radius.md', label: 'Medium' },
      { value: 'palette.radius.lg', label: 'Large' },
      { value: 'palette.radius.xl', label: 'Extra Large' },
    ] },
    { id: 'msg-assistant-radius', label: 'Assistant Bubble Radius', type: 'select', path: 'theme.components.message.assistant.borderRadius', defaultValue: 'palette.radius.lg', options: [
      { value: 'palette.radius.none', label: 'None' },
      { value: 'palette.radius.sm', label: 'Small' },
      { value: 'palette.radius.md', label: 'Medium' },
      { value: 'palette.radius.lg', label: 'Large' },
      { value: 'palette.radius.xl', label: 'Extra Large' },
    ] },
  ],
};

const inputShapeSectionDef: SectionDef = {
  id: 'comp-input-shape',
  title: 'Input Shape',
  collapsed: true,
  fields: [
    { id: 'input-radius', label: 'Border Radius', type: 'select', path: 'theme.components.input.borderRadius', defaultValue: 'palette.radius.lg', options: [
      { value: 'palette.radius.none', label: 'None' },
      { value: 'palette.radius.sm', label: 'Small' },
      { value: 'palette.radius.md', label: 'Medium' },
      { value: 'palette.radius.lg', label: 'Large' },
      { value: 'palette.radius.xl', label: 'Extra Large' },
    ] },
  ],
};

const composerSpacingSectionDef: SectionDef = {
  id: 'comp-composer-spacing',
  title: 'Composer Spacing',
  collapsed: true,
  fields: [
    { id: 'composer-padding', label: 'Padding', type: 'text', path: 'theme.components.composer.padding', defaultValue: '0.75rem 1rem' },
    { id: 'composer-gap', label: 'Row Gap', description: 'Space between the textarea row and the actions row', type: 'text', path: 'theme.components.composer.gap', defaultValue: '0.5rem' },
    { id: 'composer-font-size', label: 'Font Size', type: 'text', path: 'theme.components.composer.fontSize', defaultValue: '0.875rem' },
    { id: 'composer-line-height', label: 'Line Height', type: 'text', path: 'theme.components.composer.lineHeight', defaultValue: '1.25rem' },
  ],
};

const buttonShapeSectionDef: SectionDef = {
  id: 'comp-button-shape',
  title: 'Button Shape',
  collapsed: true,
  fields: [
    { id: 'btn-primary-radius', label: 'Primary Radius', type: 'select', path: 'theme.components.button.primary.borderRadius', defaultValue: 'palette.radius.lg', options: [
      { value: 'palette.radius.sm', label: 'Small' },
      { value: 'palette.radius.md', label: 'Medium' },
      { value: 'palette.radius.lg', label: 'Large' },
      { value: 'palette.radius.full', label: 'Full' },
    ] },
  ],
};

const headerColorsSectionDef: SectionDef = {
  id: 'comp-header-colors',
  title: 'Header Colors',
  collapsed: true,
  fields: [
    { id: 'header-bg', label: 'Background', type: 'token-ref', path: 'theme.components.header.background', defaultValue: 'semantic.colors.surface', tokenRef: { tokenType: 'color' } },
    { id: 'header-fg', label: 'Foreground', description: 'Anchors the header text. Background and foreground together derive every color left blank below', type: 'token-ref', path: 'theme.components.header.foreground', defaultValue: '', tokenRef: { tokenType: 'color' } },
    { id: 'header-icon-bg', label: 'Icon background', type: 'token-ref', path: 'theme.components.header.iconBackground', defaultValue: 'semantic.colors.primary', tokenRef: { tokenType: 'color' } },
    { id: 'header-icon-fg', label: 'Icon color', type: 'token-ref', path: 'theme.components.header.iconForeground', defaultValue: 'semantic.colors.textInverse', tokenRef: { tokenType: 'color' } },
    { id: 'header-title-fg', label: 'Title color', description: 'Blank follows the header foreground', type: 'token-ref', path: 'theme.components.header.titleForeground', defaultValue: '', tokenRef: { tokenType: 'color' } },
    { id: 'header-subtitle-fg', label: 'Subtitle color', description: 'Blank follows a 72% mix of the foreground over the background', type: 'token-ref', path: 'theme.components.header.subtitleForeground', defaultValue: '', tokenRef: { tokenType: 'color' } },
    { id: 'header-action-icons-fg', label: 'Clear / close icons', description: 'Blank follows the same 72% foreground mix as the subtitle', type: 'token-ref', path: 'theme.components.header.actionIconForeground', defaultValue: '', tokenRef: { tokenType: 'color' } },
    { id: 'header-border', label: 'Border', description: 'Blank follows a 14% mix of the foreground over the background', type: 'token-ref', path: 'theme.components.header.border', defaultValue: '', tokenRef: { tokenType: 'color' } },
  ],
};

const messageColorsSectionDef: SectionDef = {
  id: 'comp-message-colors',
  title: 'Message Colors',
  collapsed: true,
  fields: [
    { id: 'msg-user-bg', label: 'User Bubble Background', type: 'token-ref', path: 'theme.components.message.user.background', defaultValue: 'semantic.colors.primary', tokenRef: { tokenType: 'color' } },
    { id: 'msg-user-text', label: 'User Bubble Text', type: 'token-ref', path: 'theme.components.message.user.text', defaultValue: 'semantic.colors.textInverse', tokenRef: { tokenType: 'color' } },
    { id: 'msg-assistant-bg', label: 'Assistant Bubble Background', type: 'token-ref', path: 'theme.components.message.assistant.background', defaultValue: 'semantic.colors.container', tokenRef: { tokenType: 'color' } },
    { id: 'msg-assistant-text', label: 'Assistant Bubble Text', type: 'token-ref', path: 'theme.components.message.assistant.text', defaultValue: 'semantic.colors.text', tokenRef: { tokenType: 'color' } },
  ],
};

const inputColorsSectionDef: SectionDef = {
  id: 'comp-input-colors',
  title: 'Input Colors',
  collapsed: true,
  fields: [
    { id: 'input-bg', label: 'Background', type: 'token-ref', path: 'theme.components.input.background', defaultValue: 'semantic.colors.surface', tokenRef: { tokenType: 'color' } },
    { id: 'input-placeholder', label: 'Placeholder Color', type: 'token-ref', path: 'theme.components.input.placeholder', defaultValue: 'semantic.colors.textMuted', tokenRef: { tokenType: 'color' } },
    { id: 'input-focus-border', label: 'Focus Border', type: 'token-ref', path: 'theme.components.input.focus.border', defaultValue: 'semantic.colors.interactive.focus', tokenRef: { tokenType: 'color' } },
    { id: 'input-focus-ring', label: 'Focus Ring', type: 'token-ref', path: 'theme.components.input.focus.ring', defaultValue: 'semantic.colors.interactive.focus', tokenRef: { tokenType: 'color' } },
  ],
};

const buttonColorsSectionDef: SectionDef = {
  id: 'comp-button-colors',
  title: 'Button Colors',
  collapsed: true,
  fields: [
    { id: 'btn-primary-bg', label: 'Primary Background', type: 'token-ref', path: 'theme.components.button.primary.background', defaultValue: 'semantic.colors.primary', tokenRef: { tokenType: 'color' } },
    { id: 'btn-primary-fg', label: 'Primary Foreground', type: 'token-ref', path: 'theme.components.button.primary.foreground', defaultValue: 'semantic.colors.textInverse', tokenRef: { tokenType: 'color' } },
    { id: 'btn-secondary-bg', label: 'Secondary Background', type: 'token-ref', path: 'theme.components.button.secondary.background', defaultValue: 'semantic.colors.surface', tokenRef: { tokenType: 'color' } },
    { id: 'btn-secondary-fg', label: 'Secondary Foreground', type: 'token-ref', path: 'theme.components.button.secondary.foreground', defaultValue: 'semantic.colors.text', tokenRef: { tokenType: 'color' } },
    { id: 'btn-ghost-bg', label: 'Ghost Background', type: 'color', path: 'theme.components.button.ghost.background', defaultValue: 'transparent' },
    { id: 'btn-ghost-fg', label: 'Ghost Foreground', type: 'token-ref', path: 'theme.components.button.ghost.foreground', defaultValue: 'semantic.colors.text', tokenRef: { tokenType: 'color' } },
  ],
};

const scrollToBottomSectionDef: SectionDef = {
  id: 'scroll-to-bottom-style',
  title: 'Scroll To Bottom',
  description: 'Style the floating jump-to-latest affordance.',
  collapsed: true,
  fields: [
    { id: 'scroll-bottom-bg', label: 'Background', type: 'token-ref', path: 'theme.components.scrollToBottom.background', defaultValue: 'components.button.primary.background', tokenRef: { tokenType: 'color' } },
    { id: 'scroll-bottom-fg', label: 'Foreground', type: 'token-ref', path: 'theme.components.scrollToBottom.foreground', defaultValue: 'components.button.primary.foreground', tokenRef: { tokenType: 'color' } },
    { id: 'scroll-bottom-border', label: 'Border', type: 'token-ref', path: 'theme.components.scrollToBottom.border', defaultValue: 'semantic.colors.primary', tokenRef: { tokenType: 'color' } },
    { id: 'scroll-bottom-size', label: 'Size', type: 'text', path: 'theme.components.scrollToBottom.size', defaultValue: '40px' },
    { id: 'scroll-bottom-radius', label: 'Border Radius', type: 'select', path: 'theme.components.scrollToBottom.borderRadius', defaultValue: 'palette.radius.full', options: [
      { value: 'palette.radius.md', label: 'Medium' },
      { value: 'palette.radius.lg', label: 'Large' },
      { value: 'palette.radius.xl', label: 'Extra Large' },
      { value: 'palette.radius.full', label: 'Full' },
    ] },
    { id: 'scroll-bottom-shadow', label: 'Shadow', type: 'select', path: 'theme.components.scrollToBottom.shadow', defaultValue: 'palette.shadows.sm', options: [
      { value: 'palette.shadows.none', label: 'None' },
      { value: 'palette.shadows.sm', label: 'Small' },
      { value: 'palette.shadows.md', label: 'Medium' },
      { value: 'palette.shadows.lg', label: 'Large' },
      { value: 'palette.shadows.xl', label: 'Extra Large' },
    ] },
    { id: 'scroll-bottom-padding', label: 'Padding', type: 'text', path: 'theme.components.scrollToBottom.padding', defaultValue: '0.5rem 0.875rem' },
    { id: 'scroll-bottom-gap', label: 'Gap', type: 'text', path: 'theme.components.scrollToBottom.gap', defaultValue: '0.5rem' },
    { id: 'scroll-bottom-font-size', label: 'Font Size', type: 'text', path: 'theme.components.scrollToBottom.fontSize', defaultValue: '0.875rem' },
    { id: 'scroll-bottom-icon-size', label: 'Icon Size', type: 'text', path: 'theme.components.scrollToBottom.iconSize', defaultValue: '14px' },
  ],
};

const suggestionStyleSectionDef: SectionDef = {
  id: 'comp-suggestions',
  title: 'Suggestions',
  description: 'Style starter cards, follow-up chips, and list rows.',
  collapsed: true,
  fields: [
    { id: 'suggestion-chip-bg', label: 'Chip Background', type: 'token-ref', path: 'theme.components.suggestion.chip.background', defaultValue: 'semantic.colors.surface', tokenRef: { tokenType: 'color' } },
    { id: 'suggestion-chip-fg', label: 'Chip Text', type: 'token-ref', path: 'theme.components.suggestion.chip.foreground', defaultValue: 'semantic.colors.text', tokenRef: { tokenType: 'color' } },
    { id: 'suggestion-chip-border', label: 'Chip Border', type: 'token-ref', path: 'theme.components.suggestion.chip.border', defaultValue: 'semantic.colors.border', tokenRef: { tokenType: 'color' } },
    { id: 'suggestion-chip-hover', label: 'Chip Hover', type: 'token-ref', path: 'theme.components.suggestion.chip.hoverBackground', defaultValue: 'palette.colors.gray.100', tokenRef: { tokenType: 'color' } },
    { id: 'suggestion-chip-focus', label: 'Chip Focus Ring', type: 'token-ref', path: 'theme.components.suggestion.chip.focusRing', defaultValue: 'semantic.colors.interactive.focus', tokenRef: { tokenType: 'color' } },
    { id: 'suggestion-card-bg', label: 'Card Background', type: 'token-ref', path: 'theme.components.suggestion.card.background', defaultValue: 'semantic.colors.surface', tokenRef: { tokenType: 'color' } },
    { id: 'suggestion-card-fg', label: 'Card Text', type: 'token-ref', path: 'theme.components.suggestion.card.foreground', defaultValue: 'semantic.colors.text', tokenRef: { tokenType: 'color' } },
    { id: 'suggestion-card-border', label: 'Card Border', type: 'token-ref', path: 'theme.components.suggestion.card.border', defaultValue: 'semantic.colors.border', tokenRef: { tokenType: 'color' } },
    { id: 'suggestion-card-hover', label: 'Card Hover', type: 'token-ref', path: 'theme.components.suggestion.card.hoverBackground', defaultValue: 'palette.colors.gray.100', tokenRef: { tokenType: 'color' } },
    { id: 'suggestion-card-shadow', label: 'Card Shadow', type: 'select', path: 'theme.components.suggestion.card.shadow', defaultValue: 'palette.shadows.sm', options: [
      { value: 'palette.shadows.none', label: 'None' },
      { value: 'palette.shadows.sm', label: 'Small' },
      { value: 'palette.shadows.md', label: 'Medium' },
      { value: 'palette.shadows.lg', label: 'Large' },
    ] },
    { id: 'suggestion-list-bg', label: 'List Background', type: 'color', path: 'theme.components.suggestion.list.background', defaultValue: 'transparent' },
    { id: 'suggestion-list-border', label: 'List Border', type: 'token-ref', path: 'theme.components.suggestion.list.border', defaultValue: 'semantic.colors.border', tokenRef: { tokenType: 'color' } },
    { id: 'suggestion-chip-item-gap', label: 'Chip Spacing', description: 'Space between chips', type: 'text', path: 'theme.components.suggestion.chip.itemGap', defaultValue: '8px' },
    { id: 'suggestion-card-item-gap', label: 'Card Spacing', description: 'Space between cards', type: 'text', path: 'theme.components.suggestion.card.itemGap', defaultValue: '8px' },
    { id: 'suggestion-list-item-gap', label: 'List Spacing', description: 'Space between list rows', type: 'text', path: 'theme.components.suggestion.list.itemGap', defaultValue: '8px' },
  ],
};

// Reusable shadow-scale options matching the launcher / panel / scroll-to-bottom selects.
const SHADOW_SCALE_OPTIONS: { value: string; label: string }[] = [
  { value: 'palette.shadows.none', label: 'None' },
  { value: 'palette.shadows.sm', label: 'Small' },
  { value: 'palette.shadows.md', label: 'Medium' },
  { value: 'palette.shadows.lg', label: 'Large' },
  { value: 'palette.shadows.xl', label: 'Extra Large' },
];

// The approval default is a bespoke "card" shadow rather than a palette step,
// so expose it as a leading "Default" option users can keep.
const CARD_SHADOW = '0 5px 15px rgba(15, 23, 42, 0.08)';
const CARD_SHADOW_OPTIONS = [{ value: CARD_SHADOW, label: 'Default' }, ...SHADOW_SCALE_OPTIONS];

const componentShadowsSectionDef: SectionDef = {
  id: 'comp-shadows',
  title: 'Component Shadows',
  description: 'Box-shadow for chat bubbles and surfaces.',
  collapsed: true,
  fields: [
    { id: 'shadow-msg-user', label: 'User Message', type: 'select', path: 'theme.components.message.user.shadow', defaultValue: 'palette.shadows.sm', options: SHADOW_SCALE_OPTIONS },
    { id: 'shadow-msg-assistant', label: 'Assistant Message', type: 'select', path: 'theme.components.message.assistant.shadow', defaultValue: 'palette.shadows.sm', options: SHADOW_SCALE_OPTIONS },
    { id: 'shadow-tool-bubble', label: 'Tool Call Bubble', type: 'select', path: 'theme.components.toolBubble.shadow', defaultValue: 'palette.shadows.sm', options: SHADOW_SCALE_OPTIONS },
    { id: 'shadow-reasoning-bubble', label: 'Reasoning Bubble', type: 'select', path: 'theme.components.reasoningBubble.shadow', defaultValue: 'palette.shadows.sm', options: SHADOW_SCALE_OPTIONS },
    { id: 'shadow-approval', label: 'Approval Bubble', type: 'select', path: 'theme.components.approval.requested.shadow', defaultValue: CARD_SHADOW, options: CARD_SHADOW_OPTIONS },
    { id: 'shadow-intro-card', label: 'Intro Card', type: 'select', path: 'theme.components.introCard.shadow', defaultValue: 'palette.shadows.none', options: CARD_SHADOW_OPTIONS },
    { id: 'shadow-composer', label: 'Composer', type: 'select', path: 'theme.components.composer.shadow', defaultValue: 'palette.shadows.none', options: SHADOW_SCALE_OPTIONS },
  ],
};

/** Shared shape sections (not scoped to light/dark) */
// Blank keeps the built-in fallback: parseOptionalCssValue drops the path so
// the CSS variable never emits.
const TEXT_FONT_WEIGHT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Default' },
  { value: '400', label: 'Normal (400)' },
  { value: '500', label: 'Medium (500)' },
  { value: '600', label: 'Semibold (600)' },
  { value: '700', label: 'Bold (700)' },
];

const textStylesSectionDef: SectionDef = {
  id: 'comp-text-styles',
  title: 'Header & Welcome Text',
  description: 'Typography for the header title and the welcome greeting. Leave blank to keep the built-in defaults.',
  collapsed: true,
  fields: [
    { id: 'header-title-font-family', label: 'Header Title Font', description: 'CSS font-family, e.g. Georgia, serif', type: 'text', path: 'theme.components.header.title.fontFamily', defaultValue: '', parseValue: parseOptionalCssValue },
    { id: 'header-title-font-size', label: 'Header Title Size', description: 'CSS length, e.g. 1.125rem', type: 'text', path: 'theme.components.header.title.fontSize', defaultValue: '', parseValue: parseOptionalCssValue },
    { id: 'header-title-font-weight', label: 'Header Title Weight', type: 'select', path: 'theme.components.header.title.fontWeight', defaultValue: '', options: TEXT_FONT_WEIGHT_OPTIONS, parseValue: parseOptionalCssValue },
    { id: 'welcome-title-font-family', label: 'Welcome Title Font', description: 'CSS font-family, e.g. Georgia, serif', type: 'text', path: 'theme.components.introCard.title.fontFamily', defaultValue: '', parseValue: parseOptionalCssValue },
    { id: 'welcome-title-font-size', label: 'Welcome Title Size', description: 'CSS length, e.g. 1.5rem', type: 'text', path: 'theme.components.introCard.title.fontSize', defaultValue: '', parseValue: parseOptionalCssValue },
    { id: 'welcome-title-font-weight', label: 'Welcome Title Weight', type: 'select', path: 'theme.components.introCard.title.fontWeight', defaultValue: '', options: TEXT_FONT_WEIGHT_OPTIONS, parseValue: parseOptionalCssValue },
  ],
};

export const COMPONENT_SHAPE_SECTIONS: SectionDef[] = [
  panelLayoutSectionDef,
  launcherLayoutSectionDef,
  // Sizes, not colors: kept out of COMPONENT_COLOR_SECTIONS so scopeSection
  // never forks them per light/dark.
  headerControlsSectionDef,
  historyRailHeaderShapeSectionDef,
  historyOverlayShapeSectionDef,
  historyMotionSectionDef,
  tooltipShapeSectionDef,
  messageShapeSectionDef,
  inputShapeSectionDef,
  composerSpacingSectionDef,
  buttonShapeSectionDef,
  textStylesSectionDef,
  componentShadowsSectionDef,
];

/** Component color sections (can be scoped for light/dark) */
export const COMPONENT_COLOR_SECTIONS: SectionDef[] = [
  headerColorsSectionDef,
  historyRailHeaderColorsSectionDef,
  historyOverlayColorsSectionDef,
  tooltipColorsSectionDef,
  messageColorsSectionDef,
  inputColorsSectionDef,
  buttonColorsSectionDef,
  scrollToBottomSectionDef,
  suggestionStyleSectionDef,
];

export const COMPONENTS_SECTIONS: SectionDef[] = [
  ...COMPONENT_SHAPE_SECTIONS,
  ...COMPONENT_COLOR_SECTIONS,
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONFIGURE TAB: content, layout, widget, features, developer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MB = 1024 * 1024;
const DEFAULT_SUGGESTION_CHIPS = [
  'Show me what you can help with',
  'Walk me through getting started',
  'Answer a question about this page',
];

const ATTACHMENT_TYPE_PRESETS: Record<string, string[]> = {
  images: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'],
  'images-pdf': ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'application/pdf'],
  'images-text-pdf': ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json'],
  all: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/json'],
};

function parseAttachmentMaxFileSize(value: unknown): number {
  return Number(value) * MB;
}
function formatAttachmentMaxFileSize(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '10';
  return numeric > 1024 ? String(Math.round(numeric / MB)) : String(numeric);
}
function parseAttachmentAllowedTypes(value: unknown): string[] {
  return ATTACHMENT_TYPE_PRESETS[String(value)] ?? ATTACHMENT_TYPE_PRESETS.images;
}
function formatAttachmentAllowedTypes(value: unknown): string {
  const allowedTypes = Array.isArray(value) ? value : ATTACHMENT_TYPE_PRESETS.images;
  const normalized = [...new Set(allowedTypes)].sort();
  for (const [presetKey, presetTypes] of Object.entries(ATTACHMENT_TYPE_PRESETS)) {
    const sortedPreset = [...presetTypes].sort();
    if (normalized.length === sortedPreset.length && normalized.every((type, index) => type === sortedPreset[index])) {
      return presetKey;
    }
  }
  if (normalized.some(type => type.startsWith('application/vnd') || type === 'application/msword')) return 'all';
  if (normalized.some(type => type === 'text/plain' || type === 'text/markdown' || type === 'text/csv')) return 'images-text-pdf';
  if (normalized.includes('application/pdf')) return 'images-pdf';
  return 'images';
}

const copySectionDef: SectionDef = {
  id: 'copy', title: 'Content & Copy', collapsed: false,
  fields: [
    { id: 'copy-show-welcome-card', label: 'Show Welcome Card', type: 'toggle', path: 'copy.showWelcomeCard', defaultValue: true },
    { id: 'copy-welcome-title', label: 'Welcome Title', type: 'text', path: 'copy.welcomeTitle', defaultValue: 'Hello 👋' },
    { id: 'copy-welcome-subtitle', label: 'Welcome Subtitle', type: 'text', path: 'copy.welcomeSubtitle', defaultValue: 'I can answer questions and help you get things done here.' },
    { id: 'copy-placeholder', label: 'Input Placeholder', type: 'text', path: 'copy.inputPlaceholder', defaultValue: 'Type your message…' },
    { id: 'copy-send-label', label: 'Send Button Label', type: 'text', path: 'copy.sendButtonLabel', defaultValue: 'Send' },
  ],
};

const suggestionsSectionDef: SectionDef = {
  id: 'suggestions', title: 'Suggestions', description: 'Configure starter prompts and agent follow-ups.', collapsed: true,
  fields: [
    { id: 'suggestions-list', label: 'Starter Prompts', description: 'Add, edit, and remove starter prompts directly.', type: 'chip-list', path: 'suggestionChips', defaultValue: DEFAULT_SUGGESTION_CHIPS },
    { id: 'suggestions-starter-variant', label: 'Starter Style', type: 'select', path: 'suggestions.starters.variant', defaultValue: 'card', options: [{ value: 'card', label: 'Cards' }, { value: 'chip', label: 'Chips' }, { value: 'list', label: 'List' }] },
    { id: 'suggestions-starter-placement', label: 'Starter Placement', type: 'select', path: 'suggestions.starters.placement', defaultValue: 'auto', options: [{ value: 'auto', label: 'Automatic' }, { value: 'welcome', label: 'Welcome Surface' }, { value: 'composer', label: 'Above Composer' }] },
    { id: 'suggestions-starter-behavior', label: 'Starter Click', type: 'select', path: 'suggestions.starters.behavior', defaultValue: 'send', options: [{ value: 'send', label: 'Send Immediately' }, { value: 'fill', label: 'Fill Composer' }] },
    { id: 'suggestions-starter-overflow', label: 'Starter Overflow', type: 'select', path: 'suggestions.starters.overflow', defaultValue: 'wrap', options: [{ value: 'wrap', label: 'Wrap Rows' }, { value: 'scroll', label: 'Horizontal Scroll' }] },
    { id: 'suggestions-followup-variant', label: 'Follow-up Style', type: 'select', path: 'suggestions.followUps.variant', defaultValue: 'chip', options: [{ value: 'chip', label: 'Chips' }, { value: 'card', label: 'Cards' }, { value: 'list', label: 'List' }] },
    { id: 'suggestions-followup-placement', label: 'Follow-up Placement', type: 'select', path: 'suggestions.followUps.placement', defaultValue: 'auto', options: [{ value: 'auto', label: 'Automatic' }, { value: 'after-message', label: 'After Messages' }, { value: 'composer', label: 'Above Composer' }] },
    { id: 'suggestions-followup-behavior', label: 'Follow-up Click', type: 'select', path: 'suggestions.followUps.behavior', defaultValue: 'send', options: [{ value: 'send', label: 'Send Immediately' }, { value: 'fill', label: 'Fill Composer' }] },
    { id: 'suggestions-followup-overflow', label: 'Follow-up Overflow', type: 'select', path: 'suggestions.followUps.overflow', defaultValue: 'scroll', options: [{ value: 'scroll', label: 'Horizontal Scroll' }, { value: 'wrap', label: 'Wrap Rows' }] },
  ],
};

const generalLayoutSectionDef: SectionDef = {
  id: 'general-layout', title: 'Layout Basics', collapsed: true,
  fields: [
    { id: 'layout-show-header', label: 'Show Header', type: 'toggle', path: 'layout.showHeader', defaultValue: true },
    { id: 'layout-show-footer', label: 'Show Footer', type: 'toggle', path: 'layout.showFooter', defaultValue: true },
    { id: 'layout-content-max-width', label: 'Content Max Width', description: 'Max width for messages + composer', type: 'text', path: 'layout.contentMaxWidth', defaultValue: '' },
  ],
};

const headerLayoutSectionDef: SectionDef = {
  id: 'header-layout', title: 'Header', collapsed: true,
  fields: [
    { id: 'layout-header', label: 'Header Layout', type: 'select', path: 'layout.header.layout', defaultValue: 'default', options: [{ value: 'default', label: 'Default' }, { value: 'minimal', label: 'Minimal' }] },
    { id: 'layout-show-icon', label: 'Show Header Icon', type: 'toggle', path: 'layout.header.showIcon', defaultValue: true },
    { id: 'layout-show-title', label: 'Show Header Title', type: 'toggle', path: 'layout.header.showTitle', defaultValue: true },
    { id: 'layout-show-subtitle', label: 'Show Header Subtitle', type: 'toggle', path: 'layout.header.showSubtitle', defaultValue: true },
    { id: 'layout-show-close', label: 'Show Close Button', type: 'toggle', path: 'layout.header.showCloseButton', defaultValue: true },
    { id: 'layout-show-clear', label: 'Show Clear Chat', type: 'toggle', path: 'layout.header.showClearChat', defaultValue: true },
  ],
};

const messagesLayoutSectionDef: SectionDef = {
  id: 'messages-layout', title: 'Messages', collapsed: true,
  fields: [
    { id: 'layout-messages', label: 'Message Style', description: 'Minimal uses a user bubble with an open assistant response', type: 'select', path: 'layout.messages.layout', defaultValue: 'bubble', options: [{ value: 'bubble', label: 'Bubble — bubbles for both' }, { value: 'minimal', label: 'Minimal — user bubble, open assistant' }, { value: 'flat', label: 'Flat — open messages for both' }] },
    { id: 'layout-message-user-width', label: 'User Width', description: 'Content hugs the message; Full fills the transcript track', type: 'select', path: 'layout.messages.user.width', defaultValue: 'content', options: [{ value: 'content', label: 'Content' }, { value: 'full', label: 'Full' }] },
    { id: 'layout-message-user-max-width', label: 'User Max Width', description: 'Optional CSS width such as 80%, 42rem, or 72ch; blank uses the width mode default', type: 'text', path: 'layout.messages.user.maxWidth', defaultValue: '', parseValue: parseOptionalCssValue },
    { id: 'layout-message-assistant-width', label: 'Assistant Width', description: 'Content hugs the message; Full fills the transcript track', type: 'select', path: 'layout.messages.assistant.width', defaultValue: 'content', options: [{ value: 'content', label: 'Content' }, { value: 'full', label: 'Full' }] },
    { id: 'layout-message-assistant-max-width', label: 'Assistant Max Width', description: 'Optional CSS width such as 80%, 42rem, or 72ch; blank uses the width mode default', type: 'text', path: 'layout.messages.assistant.maxWidth', defaultValue: '', parseValue: parseOptionalCssValue },
    { id: 'layout-group', label: 'Group Consecutive', type: 'toggle', path: 'layout.messages.groupConsecutive', defaultValue: false },
    { id: 'layout-avatar-show', label: 'Show Avatars', type: 'toggle', path: 'layout.messages.avatar.show', defaultValue: false },
    { id: 'layout-avatar-pos', label: 'Avatar Position', type: 'select', path: 'layout.messages.avatar.position', defaultValue: 'left', options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }] },
    { id: 'layout-avatar-user', label: 'User Avatar URL', type: 'text', path: 'layout.messages.avatar.userAvatar', defaultValue: '' },
    { id: 'layout-avatar-assistant', label: 'Assistant Avatar URL', type: 'text', path: 'layout.messages.avatar.assistantAvatar', defaultValue: '' },
    { id: 'layout-timestamp-show', label: 'Show Timestamps', type: 'toggle', path: 'layout.messages.timestamp.show', defaultValue: false },
    { id: 'layout-timestamp-pos', label: 'Timestamp Position', type: 'select', path: 'layout.messages.timestamp.position', defaultValue: 'inline', options: [{ value: 'inline', label: 'Inline' }, { value: 'below', label: 'Below' }] },
  ],
};

const messageActionsSectionDef: SectionDef = {
  id: 'message-actions', title: 'Message Actions', collapsed: true,
  fields: [
    { id: 'msg-actions-enabled', label: 'Enabled', type: 'toggle', path: 'messageActions.enabled', defaultValue: true },
    { id: 'msg-actions-copy', label: 'Show Copy', type: 'toggle', path: 'messageActions.showCopy', defaultValue: true },
    { id: 'msg-actions-upvote', label: 'Show Upvote', type: 'toggle', path: 'messageActions.showUpvote', defaultValue: true },
    { id: 'msg-actions-downvote', label: 'Show Downvote', type: 'toggle', path: 'messageActions.showDownvote', defaultValue: true },
    { id: 'msg-actions-read-aloud', label: 'Show Read Aloud', type: 'toggle', path: 'messageActions.showReadAloud', defaultValue: false },
    { id: 'msg-actions-visibility', label: 'Visibility', type: 'select', path: 'messageActions.visibility', defaultValue: 'hover', options: [{ value: 'hover', label: 'On Hover' }, { value: 'always', label: 'Always Visible' }] },
    { id: 'msg-actions-align', label: 'Alignment', type: 'select', path: 'messageActions.align', defaultValue: 'right', options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }] },
    { id: 'msg-actions-layout', label: 'Layout', type: 'select', path: 'messageActions.layout', defaultValue: 'pill-inside', options: [{ value: 'pill-inside', label: 'Pill' }, { value: 'row-inside', label: 'Row' }] },
  ],
};

const launcherBasicsSectionDef: SectionDef = {
  id: 'launcher-basics', title: 'Launcher', collapsed: true,
  fields: [
    { id: 'launch-enabled', label: 'Enabled', type: 'toggle', path: 'launcher.enabled', defaultValue: true },
    { id: 'launch-mount-mode', label: 'Mount Mode', type: 'select', path: 'launcher.mountMode', defaultValue: 'floating', options: [{ value: 'floating', label: 'Floating' }, { value: 'docked', label: 'Docked' }] },
    { id: 'launch-position', label: 'Position', type: 'select', path: 'launcher.position', defaultValue: 'bottom-right', options: [{ value: 'bottom-right', label: 'Bottom Right' }, { value: 'bottom-left', label: 'Bottom Left' }, { value: 'top-right', label: 'Top Right' }, { value: 'top-left', label: 'Top Left' }] },
    { id: 'launch-width', label: 'Width', type: 'text', path: 'launcher.width', defaultValue: DEFAULT_FLOATING_LAUNCHER_WIDTH },
    { id: 'launch-auto-expand', label: 'Auto Expand', type: 'toggle', path: 'launcher.autoExpand', defaultValue: false },
    { id: 'launch-title', label: 'Title', type: 'text', path: 'launcher.title', defaultValue: 'Chat Assistant' },
    { id: 'launch-subtitle', label: 'Subtitle', type: 'text', path: 'launcher.subtitle', defaultValue: 'Here to help you get answers fast' },
  ],
};

const launcherAdvancedSectionDef: SectionDef = {
  id: 'launcher-advanced', title: 'Launcher Advanced', collapsed: true,
  fields: [
    { id: 'launch-dock-side', label: 'Dock Side', type: 'select', path: 'launcher.dock.side', defaultValue: 'right', options: [{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }] },
    { id: 'launch-dock-width', label: 'Dock Width', type: 'text', path: 'launcher.dock.width', defaultValue: '420px' },
    { id: 'launch-dock-animate', label: 'Dock Animate', type: 'toggle', path: 'launcher.dock.animate', defaultValue: true },
    { id: 'launch-dock-reveal', label: 'Dock Reveal', type: 'select', path: 'launcher.dock.reveal', defaultValue: 'resize', options: [{ value: 'resize', label: 'Resize' }, { value: 'overlay', label: 'Overlay' }, { value: 'push', label: 'Push' }, { value: 'emerge', label: 'Emerge' }] },
    { id: 'launch-text-hidden', label: 'Hide Text', type: 'toggle', path: 'launcher.textHidden', defaultValue: false },
    { id: 'launch-icon-text', label: 'Agent Icon Text', type: 'text', path: 'launcher.agentIconText', defaultValue: '💬' },
    { id: 'launch-icon-name', label: 'Agent Icon Name (Lucide)', type: 'text', path: 'launcher.agentIconName', defaultValue: 'bot' },
    { id: 'launch-icon-hidden', label: 'Hide Agent Icon', type: 'toggle', path: 'launcher.agentIconHidden', defaultValue: false },
    { id: 'launch-icon-size', label: 'Agent Icon Size', type: 'slider', path: 'launcher.agentIconSize', defaultValue: '40px', slider: { min: 16, max: 72, step: 2 } },
    { id: 'launch-icon-url', label: 'Icon Image URL', description: 'Custom image URL (overrides emoji/lucide)', type: 'text', path: 'launcher.iconUrl', defaultValue: '' },
    { id: 'launch-header-icon-name', label: 'Header Icon Name (Lucide)', type: 'text', path: 'launcher.headerIconName', defaultValue: 'bot' },
    { id: 'launch-header-icon-size', label: 'Header Icon Size', type: 'slider', path: 'launcher.headerIconSize', defaultValue: '48px', slider: { min: 24, max: 80, step: 2 } },
    { id: 'launch-header-icon-hidden', label: 'Hide Header Icon', type: 'toggle', path: 'launcher.headerIconHidden', defaultValue: false },
    { id: 'launch-full-height', label: 'Full Height', type: 'toggle', path: 'launcher.fullHeight', defaultValue: false },
    { id: 'launch-sidebar', label: 'Sidebar Mode', type: 'toggle', path: 'launcher.sidebarMode', defaultValue: false },
    { id: 'launch-sidebar-width', label: 'Sidebar Width', type: 'text', path: 'launcher.sidebarWidth', defaultValue: '420px' },
    { id: 'launch-mobile-fullscreen', label: 'Mobile Fullscreen', description: 'Fullscreen on mobile devices', type: 'toggle', path: 'launcher.mobileFullscreen', defaultValue: true },
    { id: 'launch-mobile-breakpoint', label: 'Mobile Breakpoint (px)', type: 'text', path: 'launcher.mobileBreakpoint', defaultValue: 640, formatValue: (v: unknown) => String(v ?? 640), parseValue: (v: unknown) => Number(v) },
    { id: 'launch-height-offset', label: 'Height Offset (px)', type: 'text', path: 'launcher.heightOffset', defaultValue: 0, formatValue: (v: unknown) => String(v ?? 0), parseValue: (v: unknown) => Number(v) },
    { id: 'launch-collapsed-max-width', label: 'Collapsed Max Width', description: 'Max width of launcher pill when closed', type: 'text', path: 'launcher.collapsedMaxWidth', defaultValue: '' },
    { id: 'launch-cta-text', label: 'CTA Icon Text', type: 'text', path: 'launcher.callToActionIconText', defaultValue: '↗' },
    { id: 'launch-cta-name', label: 'CTA Icon Name', type: 'text', path: 'launcher.callToActionIconName', defaultValue: '' },
    { id: 'launch-cta-hidden', label: 'Hide CTA Icon', type: 'toggle', path: 'launcher.callToActionIconHidden', defaultValue: false },
    { id: 'launch-cta-size', label: 'CTA Icon Size', type: 'slider', path: 'launcher.callToActionIconSize', defaultValue: '32px', slider: { min: 16, max: 64, step: 2 } },
    { id: 'launch-cta-padding', label: 'CTA Icon Padding', type: 'slider', path: 'launcher.callToActionIconPadding', defaultValue: '5px', slider: { min: 0, max: 24, step: 1 } },
    { id: 'launch-cta-bg', label: 'CTA Icon Background', type: 'color', path: 'launcher.callToActionIconBackgroundColor', defaultValue: '' },
  ],
};

const sendButtonSectionDef: SectionDef = {
  id: 'send-button', title: 'Send Button', collapsed: true,
  fields: [
    { id: 'send-use-icon', label: 'Use Icon', type: 'toggle', path: 'sendButton.useIcon', defaultValue: false },
    { id: 'send-icon-text', label: 'Icon Text', type: 'text', path: 'sendButton.iconText', defaultValue: '↑' },
    { id: 'send-icon-name', label: 'Icon Name (Lucide)', type: 'text', path: 'sendButton.iconName', defaultValue: '' },
    { id: 'send-size', label: 'Size', type: 'slider', path: 'sendButton.size', defaultValue: '40px', slider: { min: 24, max: 64, step: 2 } },
    { id: 'send-border-width', label: 'Border Width', type: 'slider', path: 'sendButton.borderWidth', defaultValue: '0px', slider: { min: 0, max: 10, step: 1 } },
    { id: 'send-padding-x', label: 'Padding X', type: 'slider', path: 'sendButton.paddingX', defaultValue: '10px', slider: { min: 0, max: 32, step: 1 } },
    { id: 'send-padding-y', label: 'Padding Y', type: 'slider', path: 'sendButton.paddingY', defaultValue: '6px', slider: { min: 0, max: 32, step: 1 } },
    { id: 'send-show-tooltip', label: 'Show Tooltip', type: 'toggle', path: 'sendButton.showTooltip', defaultValue: false },
    { id: 'send-tooltip-text', label: 'Tooltip Text', type: 'text', path: 'sendButton.tooltipText', defaultValue: 'Send message' },
  ],
};

const closeButtonSectionDef: SectionDef = {
  id: 'close-button', title: 'Close Button', collapsed: true,
  fields: [
    { id: 'close-size', label: 'Size', type: 'slider', path: 'launcher.closeButtonSize', defaultValue: '32px', slider: { min: 16, max: 64, step: 1 } },
    { id: 'close-placement', label: 'Placement', type: 'select', path: 'launcher.closeButtonPlacement', defaultValue: 'inline', options: [{ value: 'inline', label: 'Inline' }, { value: 'top-right', label: 'Top Right' }] },
    { id: 'close-border-width', label: 'Border Width', type: 'slider', path: 'launcher.closeButtonBorderWidth', defaultValue: '0px', slider: { min: 0, max: 8, step: 1 } },
    { id: 'close-border-radius', label: 'Border Radius', type: 'slider', path: 'launcher.closeButtonBorderRadius', defaultValue: '50%', slider: { min: 0, max: 100, step: 1, isRadiusFull: true } },
    { id: 'close-icon-name', label: 'Icon Name', type: 'text', path: 'launcher.closeButtonIconName', defaultValue: 'x' },
    { id: 'close-icon-text', label: 'Icon Text', type: 'text', path: 'launcher.closeButtonIconText', defaultValue: '×' },
    { id: 'close-show-tooltip', label: 'Show Tooltip', type: 'toggle', path: 'launcher.closeButtonShowTooltip', defaultValue: true },
    { id: 'close-tooltip-text', label: 'Tooltip Text', type: 'text', path: 'launcher.closeButtonTooltipText', defaultValue: 'Close chat' },
  ],
};

const clearChatSectionDef: SectionDef = {
  id: 'clear-chat', title: 'Clear Chat Button', collapsed: true,
  fields: [
    { id: 'clear-enabled', label: 'Enabled', type: 'toggle', path: 'launcher.clearChat.enabled', defaultValue: true },
    { id: 'clear-placement', label: 'Placement', type: 'select', path: 'launcher.clearChat.placement', defaultValue: 'inline', options: [{ value: 'inline', label: 'Inline' }, { value: 'top-right', label: 'Top Right' }] },
    { id: 'clear-icon-name', label: 'Icon Name', type: 'text', path: 'launcher.clearChat.iconName', defaultValue: 'refresh-cw' },
    { id: 'clear-size', label: 'Size', type: 'slider', path: 'launcher.clearChat.size', defaultValue: '32px', slider: { min: 16, max: 64, step: 1 } },
    { id: 'clear-show-tooltip', label: 'Show Tooltip', type: 'toggle', path: 'launcher.clearChat.showTooltip', defaultValue: true },
    { id: 'clear-tooltip-text', label: 'Tooltip Text', type: 'text', path: 'launcher.clearChat.tooltipText', defaultValue: 'Clear chat' },
  ],
};

const statusIndicatorSectionDef: SectionDef = {
  id: 'status-indicator', title: 'Status Indicator', collapsed: true,
  fields: [
    { id: 'status-visible', label: 'Visible', type: 'toggle', path: 'statusIndicator.visible', defaultValue: true },
    { id: 'status-align', label: 'Alignment', type: 'select', path: 'statusIndicator.align', defaultValue: 'right', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }] },
    { id: 'status-idle-text', label: 'Idle Text', type: 'text', path: 'statusIndicator.idleText', defaultValue: 'Online' },
    { id: 'status-connecting-text', label: 'Connecting Text', type: 'text', path: 'statusIndicator.connectingText', defaultValue: 'Connecting…' },
    { id: 'status-connected-text', label: 'Connected Text', type: 'text', path: 'statusIndicator.connectedText', defaultValue: 'Streaming…' },
    { id: 'status-error-text', label: 'Error Text', type: 'text', path: 'statusIndicator.errorText', defaultValue: 'Offline' },
  ],
};

const featuresSectionDef: SectionDef = {
  id: 'features', title: 'Features', collapsed: true,
  fields: [
    { id: 'feat-voice', label: 'Voice Recognition', description: 'Enable voice input', type: 'toggle', path: 'voiceRecognition.enabled', defaultValue: false },
    { id: 'feat-auto-focus', label: 'Auto Focus Input', description: 'Focus input after panel opens', type: 'toggle', path: 'autoFocusInput', defaultValue: false },
    { id: 'feat-scroll-bottom-enabled', label: 'Scroll To Bottom', description: 'Show a jump-to-latest affordance when the user scrolls away from new content', type: 'toggle', path: 'features.scrollToBottom.enabled', defaultValue: true },
    { id: 'feat-scroll-bottom-icon', label: 'Scroll To Bottom Icon', type: 'text', path: 'features.scrollToBottom.iconName', defaultValue: 'arrow-down' },
    { id: 'feat-scroll-bottom-label', label: 'Scroll To Bottom Label', description: 'Leave empty for icon-only mode', type: 'text', path: 'features.scrollToBottom.label', defaultValue: '' },
  ],
};

const streamAnimationSectionDef: SectionDef = {
  id: 'stream-animation', title: 'Stream Animation', description: 'Control how assistant text appears while streaming.', collapsed: true,
  fields: [
    {
      id: 'stream-anim-type',
      label: 'Animation',
      description: 'Reveal effect applied to each assistant reply as it streams.',
      type: 'select',
      path: 'features.streamAnimation.type',
      defaultValue: 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: 'typewriter', label: 'Typewriter' },
        { value: 'word-fade', label: 'Word fade' },
        { value: 'letter-rise', label: 'Letter rise' },
        { value: 'glyph-cycle', label: 'Glyph cycle' },
        { value: 'wipe', label: 'Wipe' },
        { value: 'pop-bubble', label: 'Pop bubble' },
      ],
    },
    {
      id: 'stream-anim-placeholder',
      label: 'Pre-first-token Placeholder',
      description: 'What to show before the first token arrives.',
      type: 'select',
      path: 'features.streamAnimation.placeholder',
      defaultValue: 'none',
      options: [
        { value: 'none', label: 'Typing indicator (default)' },
        { value: 'skeleton', label: 'Skeleton shimmer' },
      ],
    },
    {
      id: 'stream-anim-buffer',
      label: 'Content Buffering',
      description: 'Trim in-progress units so only complete words/lines reveal.',
      type: 'select',
      path: 'features.streamAnimation.buffer',
      defaultValue: 'none',
      options: [
        { value: 'none', label: 'None: stream every character' },
        { value: 'word', label: 'Word: hold until whitespace' },
        { value: 'line', label: 'Line: hold until newline' },
      ],
    },
    {
      id: 'stream-anim-speed',
      label: 'Per-unit Duration (ms)',
      description: 'Animation length for each character or word.',
      type: 'select',
      path: 'features.streamAnimation.speed',
      defaultValue: 120,
      options: [
        { value: '40', label: '40ms: snappy' },
        { value: '80', label: '80ms' },
        { value: '120', label: '120ms (default)' },
        { value: '200', label: '200ms' },
        { value: '320', label: '320ms' },
        { value: '480', label: '480ms: slow' },
      ],
      formatValue: (v: unknown) => String(v ?? 120),
      parseValue: (v: unknown) => Number(v),
    },
    {
      id: 'stream-anim-duration',
      label: 'Container Duration (ms)',
      description: 'Length of container-level effects (pop-bubble, custom plugins).',
      type: 'select',
      path: 'features.streamAnimation.duration',
      defaultValue: 1800,
      options: [
        { value: '600', label: '600ms' },
        { value: '1200', label: '1200ms' },
        { value: '1800', label: '1800ms (default)' },
        { value: '2400', label: '2400ms' },
        { value: '3600', label: '3600ms: slow' },
      ],
      formatValue: (v: unknown) => String(v ?? 1800),
      parseValue: (v: unknown) => Number(v),
    },
  ],
};

const attachmentsSectionDef: SectionDef = {
  id: 'attachments-config', title: 'Attachments', collapsed: true,
  fields: [
    { id: 'attach-enabled', label: 'Enabled', type: 'toggle', path: 'attachments.enabled', defaultValue: false },
    { id: 'attach-max-files', label: 'Max Files', type: 'select', path: 'attachments.maxFiles', defaultValue: 4, options: [{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '4', label: '4' }, { value: '6', label: '6' }, { value: '8', label: '8' }, { value: '10', label: '10' }], formatValue: (v: unknown) => String(v ?? 4), parseValue: (v: unknown) => Number(v) },
    { id: 'attach-max-size', label: 'Max File Size (MB)', type: 'select', path: 'attachments.maxFileSize', defaultValue: 10 * MB, options: [{ value: '1', label: '1 MB' }, { value: '5', label: '5 MB' }, { value: '10', label: '10 MB' }, { value: '25', label: '25 MB' }, { value: '50', label: '50 MB' }], formatValue: formatAttachmentMaxFileSize, parseValue: parseAttachmentMaxFileSize },
    { id: 'attach-types', label: 'Allowed File Types', type: 'select', path: 'attachments.allowedTypes', defaultValue: ATTACHMENT_TYPE_PRESETS.images, options: [{ value: 'images', label: 'Images only' }, { value: 'images-pdf', label: 'Images + PDF' }, { value: 'images-text-pdf', label: 'Images + text + PDF' }, { value: 'all', label: 'All supported types' }], formatValue: formatAttachmentAllowedTypes, parseValue: parseAttachmentAllowedTypes },
  ],
};

const artifactsSectionDef: SectionDef = {
  id: 'artifacts-config', title: 'Artifacts', collapsed: true,
  fields: [
    { id: 'art-enabled', label: 'Enabled', description: 'Show artifact sidebar for documents and components', type: 'toggle', path: 'features.artifacts.enabled', defaultValue: false },
    { id: 'art-appearance', label: 'Pane Appearance', type: 'select', path: 'features.artifacts.layout.paneAppearance', defaultValue: 'panel', options: [{ value: 'panel', label: 'Panel (bordered)' }, { value: 'seamless', label: 'Seamless' }] },
  ],
};

const artifactCustomizationSectionDef: SectionDef = {
  id: 'artifacts-customization', title: 'Artifact Customization', collapsed: true,
  fields: [
    { id: 'art-toolbar', label: 'Toolbar Preset', type: 'select', path: 'features.artifacts.layout.toolbarPreset', defaultValue: 'default', options: [{ value: 'default', label: 'Default' }, { value: 'document', label: 'Document' }] },
    { id: 'art-toolbar-title', label: 'Toolbar Title', type: 'text', path: 'features.artifacts.layout.toolbarTitle', defaultValue: 'Artifacts' },
    { id: 'art-close-label', label: 'Close Button Label', type: 'text', path: 'features.artifacts.layout.closeButtonLabel', defaultValue: 'Close' },
    { id: 'art-pane-width', label: 'Pane Width', description: 'CSS width (e.g. 40%, 28rem)', type: 'text', path: 'features.artifacts.layout.paneWidth', defaultValue: '40%' },
    { id: 'art-pane-max-width', label: 'Pane Max Width', type: 'text', path: 'features.artifacts.layout.paneMaxWidth', defaultValue: '28rem' },
    { id: 'art-split-gap', label: 'Split Gap', type: 'text', path: 'features.artifacts.layout.splitGap', defaultValue: '0' },
    { id: 'art-pane-bg', label: 'Pane Background', type: 'color', path: 'features.artifacts.layout.paneBackground', defaultValue: '' },
    { id: 'art-resizable', label: 'Resizable', description: 'Allow dragging the pane divider', type: 'toggle', path: 'features.artifacts.layout.resizable', defaultValue: false },
    { id: 'art-expand-panel', label: 'Expand Panel When Open', description: 'Widen the launcher panel to fit artifacts', type: 'toggle', path: 'features.artifacts.layout.expandLauncherPanelWhenOpen', defaultValue: true },
  ],
};

const apiIntegrationSectionDef: SectionDef = {
  id: 'api-integration', title: 'API & Integration', description: 'Runtime and integration options.', collapsed: true,
  fields: [
    { id: 'dev-api-url', label: 'API URL', type: 'text', path: 'apiUrl', defaultValue: '' },
    { id: 'dev-flow', label: 'Flow ID', type: 'text', path: 'flowId', defaultValue: '' },
    { id: 'dev-parser', label: 'Stream Parser', type: 'select', path: 'parserType', defaultValue: 'plain', options: [{ value: 'plain', label: 'Plain Text' }, { value: 'json', label: 'JSON' }, { value: 'regex-json', label: 'Regex JSON' }, { value: 'xml', label: 'XML' }] },
  ],
};

const DISPLAY_MODE_OPTIONS = [
  { value: 'collapsed', label: 'Collapsed card' },
  { value: 'panel', label: 'Side panel' },
  { value: 'inline', label: 'In conversation' },
];

const INHERITABLE_DISPLAY_FIELD = {
  type: 'select' as const,
  defaultValue: 'panel',
  options: DISPLAY_MODE_OPTIONS,
  unsettable: true,
  unsetLabel: 'Use default',
  requiresCapability: 'artifacts' as const,
};

export const ARTIFACT_DISPLAY_PREFERENCE_SECTION: SectionDef = {
  id: 'artifact-display-preferences',
  title: 'Artifact display',
  description: 'Choose where recognizable artifact groups appear.',
  requiresCapability: 'artifacts',
  fields: [
    { ...INHERITABLE_DISPLAY_FIELD, id: 'artifact-display-files', label: 'Generated files', description: 'Default for HTML, CSV, documents, and code files.', path: 'features.artifacts.display.files' },
    { ...INHERITABLE_DISPLAY_FIELD, id: 'artifact-display-components', label: 'Registered UI components', description: 'Charts, forms, cards, and custom UI rendered by the host.', path: 'features.artifacts.display.byKind.component' },
    { ...INHERITABLE_DISPLAY_FIELD, id: 'artifact-display-default', label: 'Other artifacts', description: 'Plain documents and anything without a narrower rule.', path: 'features.artifacts.display.default' },
    {
      id: 'artifact-file-preview',
      label: 'Render supported file previews',
      type: 'toggle',
      path: 'features.artifacts.filePreview.enabled',
      defaultValue: true,
      unsettable: true,
      unsetLabel: 'Use default',
      requiresCapability: 'artifacts',
    },
  ],
};

const streamDisplayPreferencesSectionDef: SectionDef = {
  id: 'stream-display-preferences',
  title: 'Tool calls and reasoning',
  description: 'Control how agent activity appears in the conversation.',
  fields: [
    { id: 'pref-show-tools', label: 'Show tool calls', type: 'toggle', path: 'features.showToolCalls', defaultValue: true, unsettable: true, requiresCapability: 'tools' },
    { id: 'pref-tool-collapsed-mode', label: 'Tool call summary', type: 'select', path: 'features.toolCallDisplay.collapsedMode', defaultValue: 'tool-call', options: [{ value: 'tool-call', label: 'Tool call' }, { value: 'tool-name', label: 'Tool name' }, { value: 'tool-preview', label: 'Tool preview' }], unsettable: true, requiresCapability: 'tools' },
    { id: 'pref-tool-expandable', label: 'Tool calls expandable', type: 'toggle', path: 'features.toolCallDisplay.expandable', defaultValue: true, unsettable: true, requiresCapability: 'tools' },
    { id: 'pref-tool-grouped', label: 'Group sequential tool calls', type: 'toggle', path: 'features.toolCallDisplay.grouped', defaultValue: false, unsettable: true, requiresCapability: 'tools' },
    { id: 'pref-tool-grouped-mode', label: 'Grouped tool detail', type: 'select', path: 'features.toolCallDisplay.groupedMode', defaultValue: 'stack', options: [{ value: 'stack', label: 'Show steps' }, { value: 'summary', label: 'Summary only' }], unsettable: true, requiresCapability: 'tools' },
    { id: 'pref-tool-loading-animation', label: 'Tool loading animation', type: 'select', path: 'features.toolCallDisplay.loadingAnimation', defaultValue: 'none', options: [{ value: 'none', label: 'None' }, { value: 'pulse', label: 'Pulse' }, { value: 'shimmer', label: 'Shimmer' }, { value: 'shimmer-color', label: 'Color shimmer' }, { value: 'rainbow', label: 'Rainbow' }], unsettable: true, requiresCapability: 'tools' },
    { id: 'pref-show-reasoning', label: 'Show reasoning', type: 'toggle', path: 'features.showReasoning', defaultValue: true, unsettable: true, requiresCapability: 'reasoning' },
    { id: 'pref-reasoning-expandable', label: 'Reasoning expandable', type: 'toggle', path: 'features.reasoningDisplay.expandable', defaultValue: true, unsettable: true, requiresCapability: 'reasoning' },
    { id: 'pref-reasoning-active-preview', label: 'Reasoning preview while active', type: 'toggle', path: 'features.reasoningDisplay.activePreview', defaultValue: false, unsettable: true, requiresCapability: 'reasoning' },
  ],
};

export const STREAM_AND_ARTIFACTS_SUB_GROUP: SubGroupDef = {
  label: 'Stream and artifacts',
  sections: [streamDisplayPreferencesSectionDef, ARTIFACT_DISPLAY_PREFERENCE_SECTION],
};

const debugSectionDef: SectionDef = {
  id: 'debug-inspection', title: 'Debug & Inspection', collapsed: true,
  fields: [
    { id: 'dev-tool-active-preview', label: 'Tool Preview While Active', description: 'Show a lightweight preview in collapsed active tool rows', type: 'toggle', path: 'features.toolCallDisplay.activePreview', defaultValue: false },
    { id: 'dev-tool-preview-lines', label: 'Tool Preview Lines', type: 'select', path: 'features.toolCallDisplay.previewMaxLines', defaultValue: 3, options: [{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }, { value: '5', label: '5' }], formatValue: (v: unknown) => String(v ?? 3), parseValue: (v: unknown) => Number(v) },
    { id: 'dev-tool-active-min-height', label: 'Tool Active Min Height', description: 'CSS min-height for collapsed active tool rows (e.g. 5rem)', type: 'text', path: 'features.toolCallDisplay.activeMinHeight', defaultValue: '' },
    { id: 'dev-reasoning-preview-lines', label: 'Reasoning Preview Lines', type: 'select', path: 'features.reasoningDisplay.previewMaxLines', defaultValue: 3, options: [{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }, { value: '5', label: '5' }], formatValue: (v: unknown) => String(v ?? 3), parseValue: (v: unknown) => Number(v) },
    { id: 'dev-reasoning-active-min-height', label: 'Reasoning Active Min Height', description: 'CSS min-height for collapsed active reasoning rows (e.g. 5rem)', type: 'text', path: 'features.reasoningDisplay.activeMinHeight', defaultValue: '' },
    { id: 'dev-debug', label: 'Debug Mode', description: 'Show debug information', type: 'toggle', path: 'debug', defaultValue: false },
  ],
};

const markdownSectionDef: SectionDef = {
  id: 'markdown', title: 'Markdown Options', collapsed: true,
  fields: [
    { id: 'md-gfm', label: 'GitHub Flavored Markdown', type: 'toggle', path: 'markdown.options.gfm', defaultValue: true },
    { id: 'md-breaks', label: 'Line Breaks', type: 'toggle', path: 'markdown.options.breaks', defaultValue: true },
    { id: 'md-header-ids', label: 'Header IDs', type: 'toggle', path: 'markdown.options.headerIds', defaultValue: false },
    { id: 'md-pedantic', label: 'Pedantic Mode', type: 'toggle', path: 'markdown.options.pedantic', defaultValue: false },
    { id: 'md-silent', label: 'Silent', type: 'toggle', path: 'markdown.options.silent', defaultValue: false },
    { id: 'md-disable-styles', label: 'Disable Default Styles', type: 'toggle', path: 'markdown.disableDefaultStyles', defaultValue: false },
  ],
};

export const CONFIGURE_SUB_GROUPS: SubGroupDef[] = [
  { label: 'Content', sections: [copySectionDef, suggestionsSectionDef] },
  { label: 'Layout', sections: [generalLayoutSectionDef, headerLayoutSectionDef, messagesLayoutSectionDef, messageActionsSectionDef] },
  { label: 'Widget', sections: [launcherBasicsSectionDef, launcherAdvancedSectionDef, sendButtonSectionDef, closeButtonSectionDef, clearChatSectionDef, statusIndicatorSectionDef] },
  { label: 'Features', sections: [featuresSectionDef, streamAnimationSectionDef, attachmentsSectionDef, artifactsSectionDef, artifactCustomizationSectionDef] },
  STREAM_AND_ARTIFACTS_SUB_GROUP,
  { label: 'Developer', collapsedByDefault: true, sections: [apiIntegrationSectionDef, debugSectionDef, markdownSectionDef] },
];

export const CONFIGURE_SECTIONS: SectionDef[] = CONFIGURE_SUB_GROUPS.flatMap(g => g.sections);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STYLE TAB V2: outcome-oriented editor structure
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Section 1: Theme: color mode selection */
export const THEME_SECTION: SectionDef = {
  id: 'theme-mode-v2',
  title: 'Theme',
  description: 'Choose how the interface adapts across light and dark mode.',
  collapsed: false,
  fields: [
    {
      id: 'color-mode',
      label: 'Color Mode',
      type: 'select',
      path: 'colorScheme',
      defaultValue: 'auto',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
    },
  ],
};

/** Section 2: Brand Palette: primary colors + collapsed status colors */
export const BRAND_PALETTE_SECTION: SectionDef = {
  id: 'brand-palette-v2',
  title: 'Brand Palette',
  description: 'Set your brand, accent, and neutral colors. These are used to generate the interface theme.',
  collapsed: false,
  fields: [
    { id: 'bp-primary', label: 'Primary', description: 'Main brand color', type: 'color', path: 'theme.palette.colors.primary.500', defaultValue: '#171717' },
    { id: 'bp-secondary', label: 'Secondary', description: 'Supporting brand color', type: 'color', path: 'theme.palette.colors.secondary.500', defaultValue: '#8b5cf6' },
    { id: 'bp-accent', label: 'Accent', description: 'Highlight and decorative color', type: 'color', path: 'theme.palette.colors.accent.500', defaultValue: '#06b6d4' },
    { id: 'bp-neutral', label: 'Neutral', description: 'Backgrounds, text, and borders', type: 'color', path: 'theme.palette.colors.gray.500', defaultValue: '#6b7280' },
  ],
};

/** Section 2b: Status palette: collapsed under Brand Palette */
export const STATUS_PALETTE_SECTION: SectionDef = {
  id: 'status-palette',
  title: 'Status Palette',
  description: 'Colors for system feedback states.',
  collapsed: true,
  fields: [
    { id: 'sp-success', label: 'Success', type: 'color', path: 'theme.palette.colors.success.500', defaultValue: '#22c55e' },
    { id: 'sp-warning', label: 'Warning', type: 'color', path: 'theme.palette.colors.warning.500', defaultValue: '#eab308' },
    { id: 'sp-error', label: 'Error', type: 'color', path: 'theme.palette.colors.error.500', defaultValue: '#ef4444' },
    { id: 'sp-notice', label: 'Notice', description: 'Info and notice states', type: 'color', path: 'theme.semantic.colors.feedback.info', defaultValue: 'palette.colors.primary.500' },
  ],
};

/** Section 3: Interface Roles: the main theming surface */
export const INTERFACE_ROLES_SECTION: SectionDef = {
  id: 'interface-roles',
  title: 'Interface Roles',
  description: 'Control where brand and neutral colors appear across the interface.',
  collapsed: false,
  fields: [
    {
      id: 'role-surfaces',
      label: 'Background Surfaces',
      type: 'role-assignment',
      path: 'theme.semantic.colors.background', // primary target for detection
      roleAssignment: ROLE_SURFACES,
    },
    {
      id: 'role-header',
      label: 'Header',
      type: 'role-assignment',
      path: 'theme.components.header.background',
      roleAssignment: ROLE_HEADER,
    },
    {
      id: 'role-user-messages',
      label: 'User Messages',
      type: 'role-assignment',
      path: 'theme.components.message.user.background',
      roleAssignment: ROLE_USER_MESSAGES,
    },
    {
      id: 'role-assistant-messages',
      label: 'Assistant Messages',
      type: 'role-assignment',
      path: 'theme.components.message.assistant.background',
      roleAssignment: ROLE_ASSISTANT_MESSAGES,
    },
    {
      id: 'role-primary-actions',
      label: 'Primary Actions',
      type: 'role-assignment',
      path: 'theme.components.button.primary.background',
      roleAssignment: ROLE_PRIMARY_ACTIONS,
    },
    {
      id: 'role-scroll-to-bottom',
      label: 'Scroll To Bottom',
      type: 'role-assignment',
      path: 'theme.components.scrollToBottom.background',
      roleAssignment: ROLE_SCROLL_TO_BOTTOM,
    },
    {
      id: 'role-input',
      label: 'Input Field',
      type: 'role-assignment',
      path: 'theme.components.input.background',
      roleAssignment: ROLE_INPUT,
    },
    {
      id: 'role-links-focus',
      label: 'Links & Focus',
      type: 'role-assignment',
      path: 'theme.semantic.colors.accent',
      roleAssignment: ROLE_LINKS_FOCUS,
    },
    {
      id: 'role-borders',
      label: 'Borders & Dividers',
      type: 'role-assignment',
      path: 'theme.semantic.colors.border',
      roleAssignment: ROLE_BORDERS,
    },
  ],
};

/** Section 4: Status Colors: feedback semantic tokens */
export const STATUS_COLORS_SECTION: SectionDef = {
  id: 'status-colors',
  title: 'Status Colors',
  description: 'Used for system states like success, warning, notice, and error.',
  collapsed: true,
  fields: [
    { id: 'sc-notice', label: 'Notice', type: 'token-ref', path: 'theme.semantic.colors.feedback.info', defaultValue: 'palette.colors.primary.500', tokenRef: { tokenType: 'color' } },
    { id: 'sc-success', label: 'Success', type: 'token-ref', path: 'theme.semantic.colors.feedback.success', defaultValue: 'palette.colors.success.500', tokenRef: { tokenType: 'color' } },
    { id: 'sc-warning', label: 'Warning', type: 'token-ref', path: 'theme.semantic.colors.feedback.warning', defaultValue: 'palette.colors.warning.500', tokenRef: { tokenType: 'color' } },
    { id: 'sc-error', label: 'Error', type: 'token-ref', path: 'theme.semantic.colors.feedback.error', defaultValue: 'palette.colors.error.500', tokenRef: { tokenType: 'color' } },
  ],
};

/** Section 5: Advanced Tokens: entry point for drill-downs (no fields) */
export const ADVANCED_TOKENS_SECTION: SectionDef = {
  id: 'advanced-tokens',
  title: 'Advanced Tokens',
  description: 'Override individual semantic and component values when you need precise control.',
  collapsed: true,
  fields: [],
};

/** V2 Style tab sections: outcome-oriented editor */
export const STYLE_SECTIONS_V2: SectionDef[] = [
  THEME_SECTION,
  BRAND_PALETTE_SECTION,
  STATUS_PALETTE_SECTION,
  INTERFACE_ROLES_SECTION,
  STATUS_COLORS_SECTION,
  ADVANCED_TOKENS_SECTION,
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ALL TABS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const ALL_TABS: TabDef[] = [
  { id: 'style', label: 'Style', sections: STYLE_SECTIONS },
  { id: 'design-system', label: 'Design System', sections: COMPONENTS_SECTIONS },
  { id: 'configure', label: 'Configure', sections: CONFIGURE_SECTIONS },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS: light/dark scoping for dual-mode editing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

/** Look up a section by ID from an array of sections */
export function findSection(sections: SectionDef[], id: string): SectionDef {
  const found = sections.find(s => s.id === id);
  if (!found) throw new Error(`Section "${id}" not found in definitions`);
  return found;
}

/** Create a light/dark scoped copy of a section */
export function scopeSection(
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
    presets: section.presets?.map(preset => ({
      ...preset,
      id: `${variant}-${preset.id}`,
      values: Object.fromEntries(
        Object.entries(preset.values).map(([path, value]) => [scopePath(path as string, scope), value])
      ),
    })),
  };
}
