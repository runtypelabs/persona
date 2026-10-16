/** Declarative section/field definitions for the theme editor (pure data: no DOM, no render logic) */

import type { SectionDef, TabDef, SubGroupDef, FieldDef } from './types';
import {
  DEFAULT_FLOATING_LAUNCHER_MAX_WIDTH,
  DEFAULT_FLOATING_LAUNCHER_WIDTH,
  DEFAULT_INPUT_PLACEHOLDER,
  resolveDefaults,
} from '../defaults';
import {
  DEFAULT_PANEL_CANVAS_BACKGROUND,
  DEFAULT_PANEL_INSET,
  resolveThemeDefaults,
} from '../utils/tokens';
import type { AgentWidgetConfig } from '../types';
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

/** Fresh field objects keep independently scoped editor sections editable. */
const colorTokenField = (id: string, label: string, path: string, defaultValue: unknown, description?: string): FieldDef => ({
  id, label, type: 'token-ref', path, defaultValue, tokenRef: { tokenType: 'color' },
  ...(description === undefined ? {} : { description }),
});

const simpleField = (type: 'toggle' | 'text' | 'color', id: string, label: string, path: string, defaultValue: unknown, description?: string): FieldDef => ({
  id, label, type, path, defaultValue, ...(description === undefined ? {} : { description }),
});

const sliderField = (id: string, label: string, path: string, defaultValue: unknown, slider: FieldDef['slider'], description?: string): FieldDef => ({
  id, label, type: 'slider', path, defaultValue, slider, ...(description === undefined ? {} : { description }),
});

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
    simpleField('color', 'brand-primary', 'Primary', 'theme.palette.colors.primary.500', '#171717', 'Main brand color for buttons, links, and accents'),
    simpleField('color', 'brand-secondary', 'Secondary', 'theme.palette.colors.secondary.500', '#7c3aed', 'Supporting brand color'),
    simpleField('color', 'brand-accent', 'Accent', 'theme.palette.colors.accent.500', '#06b6d4', 'Highlight and decorative color'),
  ],
};

const chatColorsSectionDef: SectionDef = {
  id: 'chat-colors',
  title: 'Chat Colors',
  description: 'Customize the main colors of the chat interface.',
  collapsed: true,
  fields: [
    colorTokenField('chat-header-bg', 'Header Background', 'theme.components.header.background', 'semantic.colors.surface'),
    colorTokenField('chat-header-fg', 'Header Foreground', 'theme.components.header.foreground', '', 'Anchors the header text. The title takes it, the subtitle and button icons take a 72% mix of it over the background'),
    colorTokenField('chat-header-icon-bg', 'Header Icon Background', 'theme.components.header.iconBackground', 'semantic.colors.primary'),
    colorTokenField('chat-header-icon-fg', 'Header Icon Color', 'theme.components.header.iconForeground', 'semantic.colors.textInverse'),
    colorTokenField('chat-header-title-fg', 'Header Title Color', 'theme.components.header.titleForeground', '', 'Blank follows the header foreground'),
    colorTokenField('chat-header-subtitle-fg', 'Header Subtitle Color', 'theme.components.header.subtitleForeground', '', 'Blank follows the 72% foreground mix'),
    colorTokenField('chat-header-action-icons-fg', 'Header Button Icons', 'theme.components.header.actionIconForeground', '', 'Blank follows the 72% foreground mix'),
    colorTokenField('chat-msg-user-bg', 'User Message Background', 'theme.components.message.user.background', 'semantic.colors.primary'),
    colorTokenField('chat-msg-user-text', 'User Message Text', 'theme.components.message.user.text', 'semantic.colors.textInverse'),
    colorTokenField('chat-msg-assistant-bg', 'Assistant Message Background', 'theme.components.message.assistant.background', 'semantic.colors.container'),
    colorTokenField('chat-msg-assistant-text', 'Assistant Message Text', 'theme.components.message.assistant.text', 'semantic.colors.text'),
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
    sliderField('style-launcher-size', 'Launcher Size', 'theme.components.launcher.size', '60px', { min: 32, max: 80, step: 2 }),
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
    sliderField('radius-sm', 'Small', 'theme.palette.radius.sm', '0.125rem', { min: 0, max: 16, step: 1 }),
    sliderField('radius-md', 'Medium', 'theme.palette.radius.md', '0.375rem', { min: 0, max: 24, step: 1 }),
    sliderField('radius-lg', 'Large', 'theme.palette.radius.lg', '0.5rem', { min: 0, max: 32, step: 1 }),
    sliderField('radius-xl', 'Extra Large', 'theme.palette.radius.xl', '0.75rem', { min: 0, max: 48, step: 1 }),
    sliderField('radius-full', 'Full', 'theme.palette.radius.full', '9999px', { min: 0, max: 100, step: 1, isRadiusFull: true }),
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
    simpleField('text', 'shadow-sm', 'Small', 'theme.palette.shadows.sm', '0 1px 2px 0 rgb(0 0 0 / 0.05)'),
    simpleField('text', 'shadow-md', 'Medium', 'theme.palette.shadows.md', '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'),
    simpleField('text', 'shadow-lg', 'Large', 'theme.palette.shadows.lg', '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)'),
    simpleField('text', 'shadow-xl', 'Extra Large', 'theme.palette.shadows.xl', '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)'),
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
    colorTokenField('style-panel-canvas-bg', 'Detached Canvas Background', 'theme.components.panel.canvasBackground', DEFAULT_PANEL_CANVAS_BACKGROUND, 'Fills the region behind a detached panel; defaults to transparent'),
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
    colorTokenField('sem-primary', 'Primary', 'theme.semantic.colors.primary', 'palette.colors.primary.500', 'Main brand/action color'),
    colorTokenField('sem-secondary', 'Secondary', 'theme.semantic.colors.secondary', 'palette.colors.gray.500', 'Secondary actions'),
    colorTokenField('sem-accent', 'Accent', 'theme.semantic.colors.accent', 'palette.colors.primary.600', 'Accent/highlight color'),
    colorTokenField('sem-surface', 'Surface', 'theme.semantic.colors.surface', 'palette.colors.gray.50', 'Primary surface background'),
    colorTokenField('sem-background', 'Background', 'theme.semantic.colors.background', 'palette.colors.gray.50', 'Page/widget background'),
    colorTokenField('sem-container', 'Container', 'theme.semantic.colors.container', 'palette.colors.gray.100', 'Container/card background'),
    colorTokenField('sem-text', 'Text', 'theme.semantic.colors.text', 'palette.colors.gray.900', 'Primary text color'),
    colorTokenField('sem-text-muted', 'Text Muted', 'theme.semantic.colors.textMuted', 'palette.colors.gray.500', 'Secondary/muted text'),
    colorTokenField('sem-text-inverse', 'Text Inverse', 'theme.semantic.colors.textInverse', 'palette.colors.gray.50', 'Text on dark backgrounds'),
    colorTokenField('sem-border', 'Border', 'theme.semantic.colors.border', 'palette.colors.gray.200', 'Default border color'),
    colorTokenField('sem-divider', 'Divider', 'theme.semantic.colors.divider', 'palette.colors.gray.200', 'Divider/separator color'),
    colorTokenField('sem-interactive-default', 'Interactive Default', 'theme.semantic.colors.interactive.default', 'palette.colors.primary.500'),
    colorTokenField('sem-interactive-hover', 'Interactive Hover', 'theme.semantic.colors.interactive.hover', 'palette.colors.primary.600'),
    colorTokenField('sem-interactive-focus', 'Interactive Focus', 'theme.semantic.colors.interactive.focus', 'palette.colors.primary.700'),
    colorTokenField('sem-interactive-active', 'Interactive Active', 'theme.semantic.colors.interactive.active', 'palette.colors.primary.800'),
    colorTokenField('sem-interactive-disabled', 'Interactive Disabled', 'theme.semantic.colors.interactive.disabled', 'palette.colors.gray.300'),
    colorTokenField('sem-feedback-success', 'Success', 'theme.semantic.colors.feedback.success', 'palette.colors.success.500'),
    colorTokenField('sem-feedback-warning', 'Warning', 'theme.semantic.colors.feedback.warning', 'palette.colors.warning.500'),
    colorTokenField('sem-feedback-error', 'Error', 'theme.semantic.colors.feedback.error', 'palette.colors.error.500'),
    colorTokenField('sem-feedback-info', 'Info', 'theme.semantic.colors.feedback.info', 'palette.colors.primary.500'),
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
    simpleField('text', 'panel-width', 'Width', 'theme.components.panel.width', DEFAULT_FLOATING_LAUNCHER_WIDTH),
    simpleField('text', 'panel-max-width', 'Max Width', 'theme.components.panel.maxWidth', DEFAULT_FLOATING_LAUNCHER_MAX_WIDTH),
    simpleField('text', 'panel-height', 'Height', 'theme.components.panel.height', '600px'),
    simpleField('text', 'panel-max-height', 'Max Height', 'theme.components.panel.maxHeight', 'calc(100vh - 80px)'),
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
    simpleField('text', 'panel-inset', 'Detached Inset', 'theme.components.panel.inset', DEFAULT_PANEL_INSET, 'Gap around the card when launcher.detachedPanel is on'),
  ],
};

const launcherLayoutSectionDef: SectionDef = {
  id: 'comp-launcher',
  title: 'Launcher',
  collapsed: true,
  fields: [
    sliderField('launcher-size', 'Size', 'theme.components.launcher.size', '60px', { min: 32, max: 80, step: 2 }),
    sliderField('launcher-icon-size', 'Icon Size', 'theme.components.launcher.iconSize', '28px', { min: 16, max: 48, step: 2 }),
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
    colorTokenField('rail-header-bg', 'Background', 'theme.components.history.railHeader.background', 'semantic.colors.container'),
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
    colorTokenField('history-overlay-bg', 'Background', 'theme.components.history.overlay.background', 'semantic.colors.container'),
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
    simpleField('toggle', 'tooltip-arrow', 'Show Arrow', 'theme.components.tooltip.arrow', true, 'The caret pointing at the control'),
  ],
};

const tooltipColorsSectionDef: SectionDef = {
  id: 'comp-tooltip-colors',
  title: 'Tooltip Colors',
  collapsed: true,
  fields: [
    colorTokenField('tooltip-bg', 'Background', 'theme.components.tooltip.background', 'palette.colors.gray.900'),
    colorTokenField('tooltip-fg', 'Label', 'theme.components.tooltip.foreground', 'palette.colors.primary.50'),
    colorTokenField('tooltip-hint-fg', 'Shortcut Hint', 'theme.components.tooltip.hintForeground', 'palette.colors.gray.400'),
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
    simpleField('text', 'composer-padding', 'Padding', 'theme.components.composer.padding', '0.75rem 1rem'),
    simpleField('text', 'composer-expanded-padding', 'Expanded Padding', 'theme.components.composer.expandedPadding', '12px 16px'),
    simpleField('text', 'composer-expanded-radius', 'Expanded Corners', 'theme.components.composer.expandedBorderRadius', '24px'),
    simpleField('text', 'composer-gap', 'Row Gap', 'theme.components.composer.gap', '0.5rem', 'Space between the textarea row and the actions row'),
    simpleField('text', 'composer-control-gap', 'Control Gap', 'theme.components.composer.controlGap', '0.5rem'),
    simpleField('text', 'composer-editor-min-height', 'Editor Minimum Height', 'theme.components.composer.editorMinHeight', '24px'),
    simpleField('text', 'composer-editor-padding', 'Editor Padding', 'theme.components.composer.editorPadding', '2px'),
    simpleField('text', 'composer-suggestions-gap', 'Below Composer Suggestions Gap', 'theme.components.composer.suggestionsGap', '0.5rem'),
    simpleField('text', 'composer-segmented-gap', 'Segment Gap', 'theme.components.composer.segmented.gap', '2px'),
    simpleField('text', 'composer-segmented-font-size', 'Segment Font Size', 'theme.components.composer.segmented.fontSize', '0.875rem'),
    simpleField('text', 'composer-segmented-line-height', 'Segment Line Height', 'theme.components.composer.segmented.lineHeight', '1.25rem'),
    simpleField('text', 'composer-segmented-height', 'Segment Minimum Height', 'theme.components.composer.segmented.minHeight', '0px'),
    simpleField('text', 'composer-segmented-font-weight', 'Segment Font Weight', 'theme.components.composer.segmented.fontWeight', '400'),
    simpleField('text', 'composer-mode-font-size', 'Mode Font Size', 'theme.components.composer.mode.fontSize', '0.875rem'),
    simpleField('text', 'composer-mode-height', 'Mode Height', 'theme.components.composer.mode.height', '40px'),
    simpleField('text', 'composer-mode-padding', 'Mode Horizontal Padding', 'theme.components.composer.mode.paddingInline', '0.625rem'),
    simpleField('text', 'composer-mode-gap', 'Mode Label Gap', 'theme.components.composer.mode.gap', '0.25rem'),
    simpleField('text', 'composer-model-font-size', 'Model Font Size', 'theme.components.composer.modelPicker.fontSize', '0.8125rem'),
    simpleField('text', 'composer-model-font-weight', 'Model Font Weight', 'theme.components.composer.modelPicker.fontWeight', '400'),
    simpleField('text', 'composer-model-height', 'Model Height', 'theme.components.composer.modelPicker.height', '40px'),
    simpleField('text', 'composer-model-width', 'Model Minimum Width', 'theme.components.composer.modelPicker.minWidth', '0px'),
    simpleField('text', 'composer-model-padding', 'Model Horizontal Padding', 'theme.components.composer.modelPicker.paddingInline', '0.625rem 1.75rem'),
    simpleField('text', 'composer-font-size', 'Font Size', 'theme.components.composer.fontSize', '0.875rem'),
    simpleField('text', 'composer-line-height', 'Line Height', 'theme.components.composer.lineHeight', '1.25rem'),
    sliderField('composer-control-size', 'Control Size', 'theme.components.composer.controlSize', '40px', { min: 24, max: 64, step: 2 }, 'Edge of every icon control in the action row'),
    sliderField('composer-control-icon-size', 'Control Icon Size', 'theme.components.composer.controlIconSize', '24px', { min: 12, max: 40, step: 1 }, 'Glyph inside those controls'),
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
    colorTokenField('header-bg', 'Background', 'theme.components.header.background', 'semantic.colors.surface'),
    colorTokenField('header-fg', 'Foreground', 'theme.components.header.foreground', '', 'Anchors the header text. Background and foreground together derive every color left blank below'),
    colorTokenField('header-icon-bg', 'Icon background', 'theme.components.header.iconBackground', 'semantic.colors.primary'),
    colorTokenField('header-icon-fg', 'Icon color', 'theme.components.header.iconForeground', 'semantic.colors.textInverse'),
    colorTokenField('header-title-fg', 'Title color', 'theme.components.header.titleForeground', '', 'Blank follows the header foreground'),
    colorTokenField('header-subtitle-fg', 'Subtitle color', 'theme.components.header.subtitleForeground', '', 'Blank follows a 72% mix of the foreground over the background'),
    colorTokenField('header-action-icons-fg', 'Clear / close icons', 'theme.components.header.actionIconForeground', '', 'Blank follows the same 72% foreground mix as the subtitle'),
    colorTokenField('header-border', 'Border', 'theme.components.header.border', '', 'Border color or token reference; blank follows a 14% mix of foreground over background'),
  ],
};

const messageColorsSectionDef: SectionDef = {
  id: 'comp-message-colors',
  title: 'Message Colors',
  collapsed: true,
  fields: [
    colorTokenField('msg-user-bg', 'User Bubble Background', 'theme.components.message.user.background', 'semantic.colors.primary'),
    colorTokenField('msg-user-text', 'User Bubble Text', 'theme.components.message.user.text', 'semantic.colors.textInverse'),
    colorTokenField('msg-assistant-bg', 'Assistant Bubble Background', 'theme.components.message.assistant.background', 'semantic.colors.container'),
    colorTokenField('msg-assistant-text', 'Assistant Bubble Text', 'theme.components.message.assistant.text', 'semantic.colors.text'),
  ],
};

const inputColorsSectionDef: SectionDef = {
  id: 'comp-input-colors',
  title: 'Input Colors',
  collapsed: true,
  fields: [
    colorTokenField('input-bg', 'Background', 'theme.components.input.background', 'semantic.colors.surface'),
    colorTokenField('input-placeholder', 'Placeholder Color', 'theme.components.input.placeholder', 'semantic.colors.textMuted'),
    colorTokenField('input-focus-border', 'Focus Border', 'theme.components.input.focus.border', 'semantic.colors.interactive.focus'),
    colorTokenField('input-focus-ring', 'Focus Ring', 'theme.components.input.focus.ring', 'semantic.colors.interactive.focus'),
  ],
};

const buttonColorsSectionDef: SectionDef = {
  id: 'comp-button-colors',
  title: 'Button Colors',
  collapsed: true,
  fields: [
    colorTokenField('btn-primary-bg', 'Primary Background', 'theme.components.button.primary.background', 'semantic.colors.primary'),
    colorTokenField('btn-primary-fg', 'Primary Foreground', 'theme.components.button.primary.foreground', 'semantic.colors.textInverse'),
    colorTokenField('btn-secondary-bg', 'Secondary Background', 'theme.components.button.secondary.background', 'semantic.colors.surface'),
    colorTokenField('btn-secondary-fg', 'Secondary Foreground', 'theme.components.button.secondary.foreground', 'semantic.colors.text'),
    simpleField('color', 'btn-ghost-bg', 'Ghost Background', 'theme.components.button.ghost.background', 'transparent'),
    colorTokenField('btn-ghost-fg', 'Ghost Foreground', 'theme.components.button.ghost.foreground', 'semantic.colors.text'),
  ],
};

const scrollToBottomSectionDef: SectionDef = {
  id: 'scroll-to-bottom-style',
  title: 'Scroll To Bottom',
  description: 'Style the floating jump-to-latest affordance.',
  collapsed: true,
  fields: [
    colorTokenField('scroll-bottom-bg', 'Background', 'theme.components.scrollToBottom.background', 'components.button.primary.background'),
    colorTokenField('scroll-bottom-fg', 'Foreground', 'theme.components.scrollToBottom.foreground', 'components.button.primary.foreground'),
    colorTokenField('scroll-bottom-border', 'Border', 'theme.components.scrollToBottom.border', 'semantic.colors.primary'),
    simpleField('text', 'scroll-bottom-size', 'Size', 'theme.components.scrollToBottom.size', '40px'),
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
    simpleField('text', 'scroll-bottom-padding', 'Padding', 'theme.components.scrollToBottom.padding', '0.5rem 0.875rem'),
    simpleField('text', 'scroll-bottom-gap', 'Gap', 'theme.components.scrollToBottom.gap', '0.5rem'),
    simpleField('text', 'scroll-bottom-font-size', 'Font Size', 'theme.components.scrollToBottom.fontSize', '0.875rem'),
    simpleField('text', 'scroll-bottom-icon-size', 'Icon Size', 'theme.components.scrollToBottom.iconSize', '14px'),
  ],
};

const suggestionStyleSectionDef: SectionDef = {
  id: 'comp-suggestions',
  title: 'Suggestions',
  description: 'Style starter cards, follow-up chips, and list rows.',
  collapsed: true,
  fields: [
    colorTokenField('suggestion-chip-bg', 'Chip Background', 'theme.components.suggestion.chip.background', 'semantic.colors.surface'),
    colorTokenField('suggestion-chip-fg', 'Chip Text', 'theme.components.suggestion.chip.foreground', 'semantic.colors.text'),
    colorTokenField('suggestion-chip-border', 'Chip Border', 'theme.components.suggestion.chip.border', 'semantic.colors.border'),
    colorTokenField('suggestion-chip-hover', 'Chip Hover', 'theme.components.suggestion.chip.hoverBackground', 'palette.colors.gray.100'),
    colorTokenField('suggestion-chip-focus', 'Chip Focus Ring', 'theme.components.suggestion.chip.focusRing', 'semantic.colors.interactive.focus'),
    colorTokenField('suggestion-card-bg', 'Card Background', 'theme.components.suggestion.card.background', 'semantic.colors.surface'),
    colorTokenField('suggestion-card-fg', 'Card Text', 'theme.components.suggestion.card.foreground', 'semantic.colors.text'),
    colorTokenField('suggestion-card-border', 'Card Border', 'theme.components.suggestion.card.border', 'semantic.colors.border'),
    colorTokenField('suggestion-card-hover', 'Card Hover', 'theme.components.suggestion.card.hoverBackground', 'palette.colors.gray.100'),
    { id: 'suggestion-card-shadow', label: 'Card Shadow', type: 'select', path: 'theme.components.suggestion.card.shadow', defaultValue: 'palette.shadows.sm', options: [
      { value: 'palette.shadows.none', label: 'None' },
      { value: 'palette.shadows.sm', label: 'Small' },
      { value: 'palette.shadows.md', label: 'Medium' },
      { value: 'palette.shadows.lg', label: 'Large' },
    ] },
    simpleField('color', 'suggestion-list-bg', 'List Background', 'theme.components.suggestion.list.background', 'transparent'),
    colorTokenField('suggestion-list-border', 'List Border', 'theme.components.suggestion.list.border', 'semantic.colors.border'),
    simpleField('text', 'suggestion-chip-item-gap', 'Chip Spacing', 'theme.components.suggestion.chip.itemGap', '8px', 'Space between chips'),
    simpleField('text', 'suggestion-card-item-gap', 'Card Spacing', 'theme.components.suggestion.card.itemGap', '8px', 'Space between cards'),
    simpleField('text', 'suggestion-list-item-gap', 'List Spacing', 'theme.components.suggestion.list.itemGap', '8px', 'Space between list rows'),
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

/** Optional component overrides: clearing a field restores its renderer fallback. */
const optionalComponentFields = (group: string, leaves: string, color = false): FieldDef[] =>
  leaves.split(' ').map(leaf => ({
    id: `component-${group.replace(/\./g, '-')}-${leaf.replace(/\./g, '-')}`,
    label: leaf.replace(/\./g, ' / ').replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()),
    path: `theme.components.${group}.${leaf}`,
    type: color ? 'token-ref' : 'text',
    ...(color ? { tokenRef: { tokenType: 'color' as const } } : {}),
    defaultValue: '',
    parseValue: parseOptionalCssValue,
    unsettable: true,
    description: color ? 'Color or token reference (border fields here are colors). Unset restores the component fallback.' : 'CSS value; use lengths for sizes/padding, unitless stroke width, and ms/s for duration. Unset restores the component fallback.',
  }));
const independentControlGroups = [
  ['header.close', 'Close Control'], ['header.clear', 'Clear Chat Control'],
  ['composer.send', 'Submit Control'], ['voice.control', 'Microphone Control'],
] as const;
const independentControlShapeSections: SectionDef[] = independentControlGroups.map(([group, title]) => ({
  id: `comp-${group.replace('.', '-')}-shape`, title, collapsed: true,
  description: group === 'composer.send' ? 'Submit only. Size applies to icon mode; theme padding also supports text mode.' : group === 'voice.control' ? 'Idle mic only. Set both box and glyph size to migrate legacy voiceRecognition.iconSize.' : 'This header control only; Messages and trailing actions keep their own styling.',
  fields: optionalComponentFields(group, 'size iconSize iconStrokeWidth borderWidth borderRadius padding'),
}));
const independentControlColorSections: SectionDef[] = [...independentControlGroups, ['button.stop', 'Stop Control'] as const].map(([group, title]) => ({
  id: `comp-${group.replace('.', '-')}-colors`, title: `${title} Colors`, collapsed: true,
  fields: optionalComponentFields(group, group === 'button.stop' ? 'background foreground' : 'background foreground borderColor', true),
}));
const replacementShapeSections: SectionDef[] = [
  { id: 'comp-composer-menu-shape', title: 'More Menu Shape', collapsed: true, fields: optionalComponentFields('composer.overflowMenu', 'borderRadius padding rowGap rowPadding rowBorderRadius fontSize lineHeight iconSize iconGap descriptionFontSize dividerSpacing minWidth maxHeight shadow') },
  { id: 'comp-attachment-shape', title: 'Attachment Preview Shape', collapsed: true, fields: optionalComponentFields('attachment.composer', 'gap image.width image.height image.borderRadius image.chip.width image.chip.minHeight image.chip.borderRadius image.chip.padding image.chip.gap image.chip.fontSize file.width file.minHeight file.borderRadius file.padding file.gap file.iconSize file.fontSize remove.size remove.iconSize remove.borderRadius remove.inset remove.borderWidth image.remove.size image.remove.iconSize image.remove.borderRadius image.remove.inset image.remove.borderWidth file.remove.size file.remove.iconSize file.remove.borderRadius file.remove.inset file.remove.borderWidth') },
  { id: 'comp-tool-chrome', title: 'Tool Card & Row Chrome', collapsed: true, fields: optionalComponentFields('toolBubble', 'borderWidth borderRadius header.padding content.padding loading.duration') },
  { id: 'comp-question-chrome', title: 'Question Sheet Chrome', collapsed: true, fields: optionalComponentFields('askUserQuestion', 'sheet.shadow pill.borderRadius') },
  { id: 'comp-artifact-chrome', title: 'Artifact Chrome', collapsed: true, description: 'pane.border and pane.borderLeft accept full CSS border shorthands; padding/radius/fadeSize are CSS lengths and shadows are CSS box-shadow values.', fields: optionalComponentFields('artifact', 'pane.padding pane.borderRadius pane.shadow pane.border pane.borderLeft chat.shadow split.outerRadius tab.fadeSize') },
  { id: 'comp-suggestion-chip-type', title: 'Suggestion Chip Type & Padding', collapsed: true, fields: optionalComponentFields('suggestion.chip', 'fontWeight padding') },
];
const replacementColorSections: SectionDef[] = [
  { id: 'comp-composer-menu-colors', title: 'More Menu Colors', collapsed: true, fields: optionalComponentFields('composer.overflowMenu', 'background foreground borderColor hoverBackground focusBackground descriptionColor dividerColor', true) },
  { id: 'comp-attachment-colors', title: 'Attachment Preview Colors', collapsed: true, fields: optionalComponentFields('attachment.composer', 'image.background image.borderColor image.chip.background image.chip.borderColor image.chip.foreground file.background file.borderColor file.foreground file.mutedForeground file.iconBackground file.iconForeground remove.background remove.foreground remove.hoverBackground remove.hoverForeground remove.borderColor image.remove.background image.remove.foreground image.remove.hoverBackground image.remove.hoverForeground image.remove.borderColor file.remove.background file.remove.foreground file.remove.hoverBackground file.remove.hoverForeground file.remove.borderColor', true) },
  { id: 'comp-voice-states', title: 'Voice State Colors', collapsed: true, description: 'Explicit values activate state colors. Unset preserves historical provider/browser defaults.', fields: optionalComponentFields('voice', 'recording.indicator recording.background recording.border processing.icon processing.background processing.border speaking.icon speaking.background speaking.border', true) },
  { id: 'comp-tool-colors', title: 'Tool Card & Row Colors', collapsed: true, fields: optionalComponentFields('toolBubble', 'background borderColor header.background header.foreground content.background content.foreground codeBlock.background codeBlock.foreground codeBlock.borderColor toggleForeground labelForeground loading.primary loading.secondary', true) },
  { id: 'comp-approval-colors', title: 'Approval Colors', collapsed: true, fields: optionalComponentFields('approval', 'requested.background requested.border requested.text requested.titleColor requested.descriptionColor requested.reasonColor requested.parameters.background requested.parameters.foreground approve.background approve.foreground deny.background deny.foreground', true) },
  { id: 'comp-question-colors', title: 'Question Sheet Colors', collapsed: true, fields: optionalComponentFields('askUserQuestion', 'sheet.background sheet.border pill.background pill.foreground pill.selectedBackground pill.selectedForeground customInput.background', true) },
  { id: 'comp-artifact-colors', title: 'Artifact Chrome Colors', collapsed: true, fields: optionalComponentFields('artifact', 'pane.background toolbar.iconColor toolbar.toggleActiveBackground toolbar.toggleActiveBorderColor toolbar.toggleActiveColor', true) },
];

export const COMPONENT_SHAPE_SECTIONS: SectionDef[] = [
  ...independentControlShapeSections,
  ...replacementShapeSections,
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
  ...independentControlColorSections,
  ...replacementColorSections,
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
    { id: 'copy-show-welcome-card', label: 'Welcome Surface', description: 'Choose a welcome layout, or hide it.', type: 'select', path: 'welcome.variant', defaultValue: 'card', options: [{ value: 'card', label: 'Card' }, { value: 'hero', label: 'Hero' }, { value: 'none', label: 'Hidden' }] },
    simpleField('text', 'copy-welcome-title', 'Welcome Title', 'welcome.title', 'Hello 👋'),
    simpleField('text', 'copy-welcome-subtitle', 'Welcome Subtitle', 'welcome.subtitle', 'I can answer questions and help you get things done here.'),
    simpleField('text', 'copy-placeholder', 'Input Placeholder', 'copy.inputPlaceholder', DEFAULT_INPUT_PLACEHOLDER),
    simpleField('text', 'copy-send-label', 'Send Button Label', 'copy.sendButtonLabel', 'Send'),
  ],
};

const suggestionsSectionDef: SectionDef = {
  id: 'suggestions', title: 'Suggestions', description: 'Choose the suggested prompts, where they appear, and what happens when selected. Remove all prompts to hide them.', collapsed: true,
  fields: [
    { id: 'suggestions-list', label: 'Starter Prompts', description: 'Add, edit, and remove starter prompts directly.', type: 'chip-list', path: 'suggestions.starters.items', defaultValue: DEFAULT_SUGGESTION_CHIPS },
    { id: 'suggestions-starter-variant', label: 'Starter Style', type: 'select', path: 'suggestions.starters.variant', defaultValue: 'card', options: [{ value: 'card', label: 'Cards' }, { value: 'chip', label: 'Chips' }, { value: 'list', label: 'List' }] },
    { id: 'suggestions-starter-placement', label: 'Starter Placement', type: 'select', path: 'suggestions.starters.placement', defaultValue: 'auto', options: [{ value: 'auto', label: 'Automatic' }, { value: 'welcome', label: 'Welcome Surface' }, { value: 'composer', label: 'Above Composer' }, { value: 'below-composer', label: 'Below Composer' }] },
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
    simpleField('toggle', 'layout-show-header', 'Show Header', 'layout.showHeader', true),
    simpleField('toggle', 'layout-show-footer', 'Show Footer', 'layout.showFooter', true),
    simpleField('text', 'layout-content-max-width', 'Content Max Width', 'layout.contentMaxWidth', '', 'Max width for messages + composer'),
  ],
};

const headerLayoutSectionDef: SectionDef = {
  id: 'header-layout', title: 'Header', collapsed: true,
  fields: [
    { id: 'layout-header', label: 'Header Layout', type: 'select', path: 'layout.header.layout', defaultValue: 'default', options: [{ value: 'default', label: 'Default' }, { value: 'minimal', label: 'Minimal' }] },
    simpleField('toggle', 'layout-show-icon', 'Show Header Icon', 'layout.header.showIcon', true),
    simpleField('toggle', 'layout-show-title', 'Show Header Title', 'layout.header.showTitle', true),
    simpleField('toggle', 'layout-show-subtitle', 'Show Header Subtitle', 'layout.header.showSubtitle', true),
    simpleField('toggle', 'layout-show-close', 'Show Close Button', 'layout.header.showCloseButton', true),
    simpleField('toggle', 'layout-show-clear', 'Show Clear Chat', 'layout.header.showClearChat', true),
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
    simpleField('toggle', 'layout-group', 'Group Consecutive', 'layout.messages.groupConsecutive', false),
    simpleField('toggle', 'layout-avatar-show', 'Show Avatars', 'layout.messages.avatar.show', false),
    { id: 'layout-avatar-pos', label: 'Avatar Position', type: 'select', path: 'layout.messages.avatar.position', defaultValue: 'left', options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }] },
    simpleField('text', 'layout-avatar-user', 'User Avatar URL', 'layout.messages.avatar.userAvatar', ''),
    simpleField('text', 'layout-avatar-assistant', 'Assistant Avatar URL', 'layout.messages.avatar.assistantAvatar', ''),
    simpleField('toggle', 'layout-timestamp-show', 'Show Timestamps', 'layout.messages.timestamp.show', false),
    { id: 'layout-timestamp-pos', label: 'Timestamp Position', type: 'select', path: 'layout.messages.timestamp.position', defaultValue: 'inline', options: [{ value: 'inline', label: 'Inline' }, { value: 'below', label: 'Below' }] },
  ],
};

const messageActionsSectionDef: SectionDef = {
  id: 'message-actions', title: 'Message Actions', collapsed: true,
  fields: [
    simpleField('toggle', 'msg-actions-enabled', 'Enabled', 'messageActions.enabled', true),
    simpleField('toggle', 'msg-actions-copy', 'Show Copy', 'messageActions.showCopy', true),
    simpleField('toggle', 'msg-actions-upvote', 'Show Upvote', 'messageActions.showUpvote', true),
    simpleField('toggle', 'msg-actions-downvote', 'Show Downvote', 'messageActions.showDownvote', true),
    simpleField('toggle', 'msg-actions-read-aloud', 'Show Read Aloud', 'messageActions.showReadAloud', false),
    { id: 'msg-actions-visibility', label: 'Visibility', type: 'select', path: 'messageActions.visibility', defaultValue: 'hover', options: [{ value: 'hover', label: 'On Hover' }, { value: 'always', label: 'Always Visible' }] },
    { id: 'msg-actions-align', label: 'Alignment', type: 'select', path: 'messageActions.align', defaultValue: 'right', options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }] },
    { id: 'msg-actions-layout', label: 'Layout', type: 'select', path: 'messageActions.layout', defaultValue: 'pill-inside', options: [{ value: 'pill-inside', label: 'Pill' }, { value: 'row-inside', label: 'Row' }] },
  ],
};

const launcherBasicsSectionDef: SectionDef = {
  id: 'launcher-basics', title: 'Launcher', collapsed: true,
  fields: [
    simpleField('toggle', 'launch-enabled', 'Enabled', 'launcher.enabled', true),
    { id: 'launch-mount-mode', label: 'Mount Mode', type: 'select', path: 'launcher.mountMode', defaultValue: 'floating', options: [{ value: 'floating', label: 'Floating' }, { value: 'docked', label: 'Docked' }] },
    { id: 'launch-position', label: 'Position', type: 'select', path: 'launcher.position', defaultValue: 'bottom-right', options: [{ value: 'bottom-right', label: 'Bottom Right' }, { value: 'bottom-left', label: 'Bottom Left' }, { value: 'top-right', label: 'Top Right' }, { value: 'top-left', label: 'Top Left' }] },
    simpleField('text', 'launch-width', 'Width', 'launcher.width', DEFAULT_FLOATING_LAUNCHER_WIDTH),
    simpleField('toggle', 'launch-auto-expand', 'Auto Expand', 'launcher.autoExpand', false),
    simpleField('text', 'launch-title', 'Title', 'launcher.title', 'Chat Assistant'),
    simpleField('text', 'launch-subtitle', 'Subtitle', 'launcher.subtitle', 'Here to help you get answers fast'),
  ],
};

const launcherAdvancedSectionDef: SectionDef = {
  id: 'launcher-advanced', title: 'Launcher Advanced', collapsed: true,
  fields: [
    { id: 'launch-dock-side', label: 'Dock Side', type: 'select', path: 'launcher.dock.side', defaultValue: 'right', options: [{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }] },
    simpleField('text', 'launch-dock-width', 'Dock Width', 'launcher.dock.width', '420px'),
    simpleField('toggle', 'launch-dock-animate', 'Dock Animate', 'launcher.dock.animate', true),
    { id: 'launch-dock-reveal', label: 'Dock Reveal', type: 'select', path: 'launcher.dock.reveal', defaultValue: 'resize', options: [{ value: 'resize', label: 'Resize' }, { value: 'overlay', label: 'Overlay' }, { value: 'push', label: 'Push' }, { value: 'emerge', label: 'Emerge' }] },
    simpleField('toggle', 'launch-text-hidden', 'Hide Text', 'launcher.textHidden', false),
    simpleField('text', 'launch-icon-text', 'Agent Icon Text', 'launcher.agentIconText', '💬'),
    simpleField('text', 'launch-icon-name', 'Agent Icon Name (Lucide)', 'launcher.agentIconName', 'bot'),
    simpleField('toggle', 'launch-icon-hidden', 'Hide Agent Icon', 'launcher.agentIconHidden', false),
    sliderField('launch-icon-size', 'Agent Icon Size', 'launcher.agentIconSize', '40px', { min: 16, max: 72, step: 2 }),
    simpleField('text', 'launch-icon-url', 'Icon Image URL', 'launcher.iconUrl', '', 'Custom image URL (overrides emoji/lucide)'),
    simpleField('text', 'launch-header-icon-name', 'Header Icon Name (Lucide)', 'launcher.headerIconName', 'bot'),
    sliderField('launch-header-icon-size', 'Header Icon Size', 'launcher.headerIconSize', '48px', { min: 24, max: 80, step: 2 }),
    simpleField('toggle', 'launch-header-icon-hidden', 'Hide Header Icon', 'launcher.headerIconHidden', false),
    simpleField('toggle', 'launch-full-height', 'Full Height', 'launcher.fullHeight', false),
    simpleField('toggle', 'launch-sidebar', 'Sidebar Mode', 'launcher.sidebarMode', false),
    simpleField('text', 'launch-sidebar-width', 'Sidebar Width', 'launcher.sidebarWidth', '420px'),
    simpleField('toggle', 'launch-mobile-fullscreen', 'Mobile Fullscreen', 'launcher.mobileFullscreen', true, 'Fullscreen on mobile devices'),
    { id: 'launch-mobile-breakpoint', label: 'Mobile Breakpoint (px)', type: 'text', path: 'launcher.mobileBreakpoint', defaultValue: 640, formatValue: (v: unknown) => String(v ?? 640), parseValue: (v: unknown) => Number(v) },
    { id: 'launch-height-offset', label: 'Height Offset (px)', type: 'text', path: 'launcher.heightOffset', defaultValue: 0, formatValue: (v: unknown) => String(v ?? 0), parseValue: (v: unknown) => Number(v) },
    simpleField('text', 'launch-collapsed-max-width', 'Collapsed Max Width', 'launcher.collapsedMaxWidth', '', 'Max width of launcher pill when closed'),
    simpleField('text', 'launch-cta-text', 'CTA Icon Text', 'launcher.callToActionIconText', '↗'),
    simpleField('text', 'launch-cta-name', 'CTA Icon Name', 'launcher.callToActionIconName', ''),
    simpleField('toggle', 'launch-cta-hidden', 'Hide CTA Icon', 'launcher.callToActionIconHidden', false),
    sliderField('launch-cta-size', 'CTA Icon Size', 'launcher.callToActionIconSize', '32px', { min: 16, max: 64, step: 2 }),
    sliderField('launch-cta-padding', 'CTA Icon Padding', 'launcher.callToActionIconPadding', '5px', { min: 0, max: 24, step: 1 }),
    simpleField('color', 'launch-cta-bg', 'CTA Icon Background', 'launcher.callToActionIconBackgroundColor', ''),
  ],
};

const sendButtonSectionDef: SectionDef = {
  id: 'send-button', title: 'Send Button', collapsed: true,
  fields: [
    simpleField('toggle', 'send-use-icon', 'Use Icon', 'sendButton.useIcon', false),
    simpleField('text', 'send-icon-text', 'Icon Text', 'sendButton.iconText', '↑'),
    simpleField('text', 'send-icon-name', 'Icon Name (Lucide)', 'sendButton.iconName', ''),
    simpleField('toggle', 'send-show-tooltip', 'Show Tooltip', 'sendButton.showTooltip', false),
    simpleField('text', 'send-tooltip-text', 'Tooltip Text', 'sendButton.tooltipText', 'Send message'),
  ],
};

const closeButtonSectionDef: SectionDef = {
  id: 'close-button', title: 'Close Button', collapsed: true,
  fields: [
    { id: 'close-placement', label: 'Placement', type: 'select', path: 'launcher.closeButtonPlacement', defaultValue: 'inline', options: [{ value: 'inline', label: 'Inline' }, { value: 'top-right', label: 'Top Right' }] },
    simpleField('text', 'close-icon-name', 'Icon Name', 'launcher.closeButtonIconName', 'x'),
    simpleField('text', 'close-icon-text', 'Icon Text', 'launcher.closeButtonIconText', '×'),
    simpleField('toggle', 'close-show-tooltip', 'Show Tooltip', 'launcher.closeButtonShowTooltip', true),
    simpleField('text', 'close-tooltip-text', 'Tooltip Text', 'launcher.closeButtonTooltipText', 'Close chat'),
  ],
};

const clearChatSectionDef: SectionDef = {
  id: 'clear-chat', title: 'Clear Chat Button', collapsed: true,
  fields: [
    simpleField('toggle', 'clear-enabled', 'Enabled', 'launcher.clearChat.enabled', true),
    { id: 'clear-placement', label: 'Placement', type: 'select', path: 'launcher.clearChat.placement', defaultValue: 'inline', options: [{ value: 'inline', label: 'Inline' }, { value: 'top-right', label: 'Top Right' }] },
    simpleField('text', 'clear-icon-name', 'Icon Name', 'launcher.clearChat.iconName', 'refresh-cw'),
    simpleField('toggle', 'clear-show-tooltip', 'Show Tooltip', 'launcher.clearChat.showTooltip', true),
    simpleField('text', 'clear-tooltip-text', 'Tooltip Text', 'launcher.clearChat.tooltipText', 'Clear chat'),
  ],
};

const statusIndicatorSectionDef: SectionDef = {
  id: 'status-indicator', title: 'Status Indicator', collapsed: true,
  fields: [
    simpleField('toggle', 'status-visible', 'Visible', 'statusIndicator.visible', true),
    { id: 'status-align', label: 'Alignment', type: 'select', path: 'statusIndicator.align', defaultValue: 'right', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }] },
    simpleField('text', 'status-idle-text', 'Idle Text', 'statusIndicator.idleText', 'Online'),
    simpleField('text', 'status-connecting-text', 'Connecting Text', 'statusIndicator.connectingText', 'Connecting…'),
    simpleField('text', 'status-connected-text', 'Connected Text', 'statusIndicator.connectedText', 'Streaming…'),
    simpleField('text', 'status-error-text', 'Error Text', 'statusIndicator.errorText', 'Offline'),
  ],
};

const featuresSectionDef: SectionDef = {
  id: 'features', title: 'Features', collapsed: true,
  fields: [
    simpleField('toggle', 'feat-voice', 'Voice Recognition', 'voiceRecognition.enabled', false, 'Enable voice input'),
    simpleField('toggle', 'feat-auto-focus', 'Auto Focus Input', 'autoFocusInput', false, 'Focus input after panel opens'),
    simpleField('toggle', 'feat-scroll-bottom-enabled', 'Scroll To Bottom', 'features.scrollToBottom.enabled', true, 'Show a button to return to the latest messages.'),
    simpleField('text', 'feat-scroll-bottom-icon', 'Scroll To Bottom Icon', 'features.scrollToBottom.iconName', 'arrow-down'),
    simpleField('text', 'feat-scroll-bottom-label', 'Scroll To Bottom Label', 'features.scrollToBottom.label', '', 'Leave empty for icon-only mode'),
    { id: 'feat-scroll-bottom-streaming', label: 'Streaming Below', type: 'select', path: 'features.scrollToBottom.streamingIndicator', defaultValue: 'arrow', options: [{ value: 'arrow', label: 'Arrow' }, { value: 'dots', label: 'Dots' }] },
    { id: 'feat-scroll-bottom-behavior', label: 'Jump To Latest Motion', description: 'How the conversation scrolls when you click the jump button.', type: 'select', path: 'features.scrollToBottom.scrollBehavior', defaultValue: 'instant', options: [{ value: 'instant', label: 'Instant' }, { value: 'smooth', label: 'Smooth' }] },
    { id: 'feat-scroll-bottom-duration', label: 'Jump Duration (ms)', description: 'How long smooth scrolling takes. Set to 0 for an instant jump.', type: 'text', path: 'features.scrollToBottom.scrollDurationMs', defaultValue: 220, formatValue: (v: unknown) => String(v ?? 220), parseValue: (v: unknown) => String(v).trim() === '' ? undefined : Number(v) },
    { id: 'feat-scroll-bottom-transition', label: 'Scroll Button Transition', type: 'select', path: 'features.scrollToBottom.transition', defaultValue: 'none', options: [{ value: 'none', label: 'None' }, { value: 'fade', label: 'Fade' }] },
  ],
};

const streamAnimationSectionDef: SectionDef = {
  id: 'stream-animation', title: 'Stream Animation', description: 'Choose how text appears as the assistant responds.', collapsed: true,
  fields: [
    {
      id: 'stream-anim-type',
      label: 'Animation',
      description: 'The visual effect used to reveal a reply.',
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
      label: 'Before the Reply Starts',
      description: 'What to show while waiting for a reply.',
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
      label: 'Reveal Text By',
      description: 'Show text as it arrives, or wait for a complete word or line.',
      type: 'select',
      path: 'features.streamAnimation.buffer',
      defaultValue: 'none',
      options: [
        { value: 'none', label: 'Each character' },
        { value: 'word', label: 'Complete words' },
        { value: 'line', label: 'Complete lines' },
      ],
    },
    {
      id: 'stream-anim-speed',
      label: 'Text Animation Duration (ms)',
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
      label: 'Bubble Animation Duration (ms)',
      description: 'How long effects on the whole reply bubble take.',
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

const composerMenuSectionDef: SectionDef = {
  id: 'composer-menu-config', title: 'More Menu', collapsed: true,
  fields: [
    simpleField('toggle', 'composer-menu-enabled', 'Show More Menu', 'composer.actionOverflow.enabled', false),
    { id: 'composer-menu-width', label: 'Menu Width', type: 'select', path: 'composer.actionOverflow.menu.width', defaultValue: 'content', options: [{ value: 'content', label: 'Fit contents' }, { value: 'composer', label: 'Match message box' }, { value: '240px', label: 'Compact (240px)' }, { value: '320px', label: 'Wide (320px)' }] },
    { id: 'composer-menu-placement', label: 'Open Menu', description: 'Moves to fit the available space.', type: 'select', path: 'composer.actionOverflow.menu.placement', defaultValue: 'above', options: [{ value: 'above', label: 'Above message box' }, { value: 'below', label: 'Below message box' }] },
    { id: 'composer-menu-descriptions', label: 'Menu Descriptions', type: 'select', path: 'composer.actionOverflow.menu.descriptionLayout', defaultValue: 'stacked', options: [{ value: 'stacked', label: 'Below labels' }, { value: 'inline', label: 'Beside labels' }] },
    simpleField('text', 'composer-menu-icon', 'Menu Icon', 'composer.actionOverflow.menu.triggerIconName', 'plus'),
    { id: 'composer-menu-open-icon', label: 'Open Menu Icon', type: 'select', path: 'composer.actionOverflow.menu.openTriggerIconName', defaultValue: 'plus', options: [{ value: 'plus', label: 'Plus' }, { value: 'x', label: 'Close' }] },
  ],
};

const attachmentsSectionDef: SectionDef = {
  id: 'attachments-config', title: 'Attachments', collapsed: true,
  fields: [
    simpleField('toggle', 'attach-enabled', 'Enabled', 'attachments.enabled', false),
    { id: 'attach-max-files', label: 'Max Files', type: 'select', path: 'attachments.maxFiles', defaultValue: 4, options: [{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '4', label: '4' }, { value: '6', label: '6' }, { value: '8', label: '8' }, { value: '10', label: '10' }], formatValue: (v: unknown) => String(v ?? 4), parseValue: (v: unknown) => Number(v) },
    { id: 'attach-max-size', label: 'Max File Size (MB)', type: 'select', path: 'attachments.maxFileSize', defaultValue: 10 * MB, options: [{ value: '1', label: '1 MB' }, { value: '5', label: '5 MB' }, { value: '10', label: '10 MB' }, { value: '25', label: '25 MB' }, { value: '50', label: '50 MB' }], formatValue: formatAttachmentMaxFileSize, parseValue: parseAttachmentMaxFileSize },
    { id: 'attach-types', label: 'Allowed File Types', type: 'select', path: 'attachments.allowedTypes', defaultValue: ATTACHMENT_TYPE_PRESETS.images, options: [{ value: 'images', label: 'Images only' }, { value: 'images-pdf', label: 'Images + PDF' }, { value: 'images-text-pdf', label: 'Images + text + PDF' }, { value: 'all', label: 'All supported types' }], formatValue: formatAttachmentAllowedTypes, parseValue: parseAttachmentAllowedTypes },
    { id: 'attach-file-layout', label: 'File Card Layout', type: 'select', path: 'attachments.preview.file.layout', defaultValue: 'tile', options: [{ value: 'tile', label: 'Compact tile' }, { value: 'horizontal', label: 'Horizontal card' }, { value: 'vertical', label: 'Vertical card' }] },
    simpleField('toggle', 'attach-file-icon', 'Show File Icon', 'attachments.preview.file.icon', true),
    { id: 'attach-file-icon-name', label: 'File Icon', type: 'text', path: 'attachments.preview.file.iconName', defaultValue: '', unsettable: true },
    { id: 'attach-file-icon-placement', label: 'File Icon Position', type: 'select', path: 'attachments.preview.file.iconPlacement', defaultValue: 'start', options: [{ value: 'start', label: 'At the start' }, { value: 'center', label: 'Centered' }] },
    { id: 'attach-file-name', label: 'File Name', type: 'select', path: 'attachments.preview.file.name', defaultValue: 'hidden', options: [{ value: 'hidden', label: 'Hidden' }, { value: 'full', label: 'Full name' }, { value: 'basename', label: 'Without extension' }] },
    { id: 'attach-file-metadata', label: 'File Details', description: 'Line count is available for supported text files.', type: 'select', path: 'attachments.preview.file.metadata', defaultValue: 'none', options: [{ value: 'none', label: 'None' }, { value: 'size', label: 'File size' }, { value: 'line-count', label: 'Line count' }] },
    { id: 'attach-file-badge', label: 'File Badge', type: 'select', path: 'attachments.preview.file.badge', defaultValue: 'type', options: [{ value: 'none', label: 'None' }, { value: 'extension', label: 'Extension' }, { value: 'type', label: 'File type' }] },
    { id: 'attach-image-layout', label: 'Image Preview', type: 'select', path: 'attachments.preview.image.layout', defaultValue: 'thumbnail', options: [{ value: 'thumbnail', label: 'Thumbnail' }, { value: 'chip', label: 'Compact chip' }] },
    { id: 'attach-image-name', label: 'Image File Name', type: 'select', path: 'attachments.preview.image.name', defaultValue: 'hidden', options: [{ value: 'hidden', label: 'Hidden' }, { value: 'full', label: 'Full name' }, { value: 'basename', label: 'Without extension' }] },
    { id: 'attach-image-fit', label: 'Image Fit', type: 'select', path: 'attachments.preview.image.fit', defaultValue: 'cover', options: [{ value: 'cover', label: 'Fill thumbnail' }, { value: 'contain', label: 'Show whole image' }] },
    { id: 'attach-file-remove-visibility', label: 'File Remove Button', description: 'Always visible on touch devices.', type: 'select', path: 'attachments.preview.file.remove.visibility', defaultValue: 'always', options: [{ value: 'always', label: 'Always visible' }, { value: 'hover', label: 'On hover or focus' }] },
    { id: 'attach-file-remove-placement', label: 'File Remove Position', type: 'select', path: 'attachments.preview.file.remove.placement', defaultValue: 'overlap', options: [{ value: 'overlap', label: 'Overlapping corner' }, { value: 'inside', label: 'Inside corner' }, { value: 'inline', label: 'Beside content' }] },
    { id: 'attach-image-remove-visibility', label: 'Image Remove Button', description: 'Always visible on touch devices.', type: 'select', path: 'attachments.preview.image.remove.visibility', defaultValue: 'always', options: [{ value: 'always', label: 'Always visible' }, { value: 'hover', label: 'On hover or focus' }] },
    { id: 'attach-image-remove-placement', label: 'Image Remove Position', type: 'select', path: 'attachments.preview.image.remove.placement', defaultValue: 'overlap', options: [{ value: 'overlap', label: 'Overlapping corner' }, { value: 'inside', label: 'Inside corner' }, { value: 'inline', label: 'Beside content' }] },
    { id: 'attach-composer-layout', label: 'Input Below Attachments', description: 'Uses separate rows when space is limited.', type: 'select', path: 'composer.attachmentLayout', defaultValue: 'stacked', options: [{ value: 'stacked', label: 'Text above controls' }, { value: 'single-row', label: 'Text beside controls' }] },
  ],
};

const artifactsSectionDef: SectionDef = {
  id: 'artifacts-config', title: 'Artifacts', collapsed: true,
  fields: [
    simpleField('toggle', 'art-enabled', 'Enabled', 'features.artifacts.enabled', false, 'Show artifact sidebar for documents and components'),
    { id: 'art-appearance', label: 'Pane Appearance', type: 'select', path: 'features.artifacts.layout.paneAppearance', defaultValue: 'panel', options: [{ value: 'panel', label: 'Panel (bordered)' }, { value: 'seamless', label: 'Seamless' }] },
  ],
};

const artifactCustomizationSectionDef: SectionDef = {
  id: 'artifacts-customization', title: 'Artifact Customization', collapsed: true,
  fields: [
    { id: 'art-toolbar', label: 'Toolbar Preset', type: 'select', path: 'features.artifacts.layout.toolbarPreset', defaultValue: 'default', options: [{ value: 'default', label: 'Default' }, { value: 'document', label: 'Document' }] },
    simpleField('text', 'art-toolbar-title', 'Toolbar Title', 'features.artifacts.layout.toolbarTitle', 'Artifacts'),
    simpleField('text', 'art-close-label', 'Close Button Label', 'features.artifacts.layout.closeButtonLabel', 'Close'),
    simpleField('text', 'art-pane-width', 'Pane Width', 'features.artifacts.layout.paneWidth', '40%', 'CSS width (e.g. 40%, 28rem)'),
    simpleField('text', 'art-pane-max-width', 'Pane Max Width', 'features.artifacts.layout.paneMaxWidth', '28rem'),
    simpleField('text', 'art-split-gap', 'Split Gap', 'features.artifacts.layout.splitGap', '0'),
    simpleField('toggle', 'art-resizable', 'Resizable', 'features.artifacts.layout.resizable', false, 'Allow dragging the pane divider'),
    simpleField('toggle', 'art-expand-panel', 'Expand Panel When Open', 'features.artifacts.layout.expandLauncherPanelWhenOpen', true, 'Widen the launcher panel to fit artifacts'),
  ],
};

const apiIntegrationSectionDef: SectionDef = {
  id: 'api-integration', title: 'API & Integration', description: 'Runtime and integration options.', collapsed: true,
  fields: [
    simpleField('text', 'dev-api-url', 'API URL', 'apiUrl', ''),
    simpleField('text', 'dev-flow', 'Flow ID', 'flowId', ''),
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
  description: 'Choose where generated files and other content appear.',
  requiresCapability: 'artifacts',
  fields: [
    { ...INHERITABLE_DISPLAY_FIELD, id: 'artifact-display-files', label: 'Generated files', description: 'Default for HTML, CSV, documents, and code files.', path: 'features.artifacts.display.files' },
    { ...INHERITABLE_DISPLAY_FIELD, id: 'artifact-display-components', label: 'Interactive content', description: 'Charts, forms, cards, and other interactive content.', path: 'features.artifacts.display.byKind.component' },
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
    simpleField('toggle', 'dev-tool-active-preview', 'Tool Preview While Active', 'features.toolCallDisplay.activePreview', false, 'Show a lightweight preview in collapsed active tool rows'),
    { id: 'dev-tool-preview-lines', label: 'Tool Preview Lines', type: 'select', path: 'features.toolCallDisplay.previewMaxLines', defaultValue: 3, options: [{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }, { value: '5', label: '5' }], formatValue: (v: unknown) => String(v ?? 3), parseValue: (v: unknown) => Number(v) },
    simpleField('text', 'dev-tool-active-min-height', 'Tool Active Min Height', 'features.toolCallDisplay.activeMinHeight', '', 'CSS min-height for collapsed active tool rows (e.g. 5rem)'),
    { id: 'dev-reasoning-preview-lines', label: 'Reasoning Preview Lines', type: 'select', path: 'features.reasoningDisplay.previewMaxLines', defaultValue: 3, options: [{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }, { value: '5', label: '5' }], formatValue: (v: unknown) => String(v ?? 3), parseValue: (v: unknown) => Number(v) },
    simpleField('text', 'dev-reasoning-active-min-height', 'Reasoning Active Min Height', 'features.reasoningDisplay.activeMinHeight', '', 'CSS min-height for collapsed active reasoning rows (e.g. 5rem)'),
    simpleField('toggle', 'dev-debug', 'Debug Mode', 'debug', false, 'Show debug information'),
  ],
};

const markdownSectionDef: SectionDef = {
  id: 'markdown', title: 'Markdown Options', collapsed: true,
  fields: [
    simpleField('toggle', 'md-gfm', 'GitHub Flavored Markdown', 'markdown.options.gfm', true),
    simpleField('toggle', 'md-breaks', 'Line Breaks', 'markdown.options.breaks', true),
    simpleField('toggle', 'md-header-ids', 'Header IDs', 'markdown.options.headerIds', false),
    simpleField('toggle', 'md-pedantic', 'Pedantic Mode', 'markdown.options.pedantic', false),
    simpleField('toggle', 'md-silent', 'Silent', 'markdown.options.silent', false),
    simpleField('toggle', 'md-disable-styles', 'Disable Default Styles', 'markdown.disableDefaultStyles', false),
  ],
};

export const CONFIGURE_SUB_GROUPS: SubGroupDef[] = [
  { label: 'Content', sections: [copySectionDef, suggestionsSectionDef] },
  { label: 'Layout', sections: [generalLayoutSectionDef, headerLayoutSectionDef, messagesLayoutSectionDef, messageActionsSectionDef] },
  { label: 'Widget', sections: [launcherBasicsSectionDef, launcherAdvancedSectionDef, sendButtonSectionDef, closeButtonSectionDef, clearChatSectionDef, statusIndicatorSectionDef] },
  { label: 'Features', sections: [featuresSectionDef, streamAnimationSectionDef, composerMenuSectionDef, attachmentsSectionDef, artifactsSectionDef, artifactCustomizationSectionDef] },
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
    simpleField('color', 'bp-primary', 'Primary', 'theme.palette.colors.primary.500', '#171717', 'Main brand color'),
    simpleField('color', 'bp-secondary', 'Secondary', 'theme.palette.colors.secondary.500', '#8b5cf6', 'Supporting brand color'),
    simpleField('color', 'bp-accent', 'Accent', 'theme.palette.colors.accent.500', '#06b6d4', 'Highlight and decorative color'),
    simpleField('color', 'bp-neutral', 'Neutral', 'theme.palette.colors.gray.500', '#6b7280', 'Backgrounds, text, and borders'),
  ],
};

/** Section 2b: Status palette: collapsed under Brand Palette */
export const STATUS_PALETTE_SECTION: SectionDef = {
  id: 'status-palette',
  title: 'Status Palette',
  description: 'Colors for system feedback states.',
  collapsed: true,
  fields: [
    simpleField('color', 'sp-success', 'Success', 'theme.palette.colors.success.500', '#22c55e'),
    simpleField('color', 'sp-warning', 'Warning', 'theme.palette.colors.warning.500', '#eab308'),
    simpleField('color', 'sp-error', 'Error', 'theme.palette.colors.error.500', '#ef4444'),
    simpleField('color', 'sp-notice', 'Notice', 'theme.semantic.colors.feedback.info', 'palette.colors.primary.500', 'Info and notice states'),
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
    colorTokenField('sc-notice', 'Notice', 'theme.semantic.colors.feedback.info', 'palette.colors.primary.500'),
    colorTokenField('sc-success', 'Success', 'theme.semantic.colors.feedback.success', 'palette.colors.success.500'),
    colorTokenField('sc-warning', 'Warning', 'theme.semantic.colors.feedback.warning', 'palette.colors.warning.500'),
    colorTokenField('sc-error', 'Error', 'theme.semantic.colors.feedback.error', 'palette.colors.error.500'),
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

const ALL_TABS_BASE: TabDef[] = [
  { id: 'style', label: 'Style', sections: STYLE_SECTIONS },
  { id: 'design-system', label: 'Design System', sections: COMPONENTS_SECTIONS },
  { id: 'configure', label: 'Configure', sections: CONFIGURE_SECTIONS },
];

const getByPath = (value: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((current, key) =>
    current && typeof current === 'object'
      ? (current as Record<string, unknown>)[key]
      : undefined, value);

/**
 * Resolves editor field metadata from the same versioned config and token
 * defaults as the widget. The static field value remains the fallback for
 * presentation-only values (such as intentionally blank optional tokens).
 */
export function resolveEditorFieldDefault(
  field: FieldDef,
  future?: AgentWidgetConfig['future']
): unknown {
  const configDefaults = resolveDefaults({ future });
  const themeDefaults = resolveThemeDefaults(future);
  const path = field.path;
  const themePath = path.startsWith('theme.')
    ? path.slice('theme.'.length)
    : path.startsWith('darkTheme.')
      ? path.slice('darkTheme.'.length)
      : undefined;
  const resolved = themePath
    ? getByPath(themeDefaults, themePath)
    : getByPath(configDefaults, path);
  return resolved === undefined ? field.defaultValue : resolved;
}

/**
 * Returns editor tabs with default metadata resolved for the selected defaults
 * version. Callers keep authored values separate; this only drives UI hints.
 */
export function getThemeEditorTabs(
  future?: AgentWidgetConfig['future']
): TabDef[] {
  return ALL_TABS_BASE.map((tab) => ({
    ...tab,
    sections: tab.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => ({
        ...field,
        defaultValue: resolveEditorFieldDefault(field, future),
      })),
    })),
  }));
}

/** Legacy editor metadata, resolved through the v4 defaults tree. */
export const ALL_TABS: TabDef[] = getThemeEditorTabs();

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
