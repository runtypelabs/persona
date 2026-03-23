/** Tab 2: Components — panel, header, messages, input, launcher, buttons, voice, approval */

import type { FieldDef, SectionDef, OnChangeCallback, ControlResult } from '../types';
import { renderSection } from '../controls';
import { setSearchContext } from '../search';

export const TAB_ID = 'design-system';
export const TAB_LABEL = 'Design System';

// ─── Section Definitions ──────────────────────────────────────────

const panelLayoutSectionDef: SectionDef = {
  id: 'comp-panel',
  title: 'Panel',
  collapsed: false,
  fields: [
    { id: 'panel-width', label: 'Width', type: 'text', path: 'theme.components.panel.width', defaultValue: 'min(400px, calc(100vw - 24px))' },
    { id: 'panel-max-width', label: 'Max Width', type: 'text', path: 'theme.components.panel.maxWidth', defaultValue: '400px' },
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
  ],
};

const launcherLayoutSectionDef: SectionDef = {
  id: 'comp-launcher',
  title: 'Launcher',
  collapsed: true,
  fields: [
    { id: 'launcher-size', label: 'Size', type: 'slider', path: 'theme.components.launcher.size', defaultValue: '60px', slider: { min: 32, max: 80, step: 2 } },
    { id: 'launcher-icon-size', label: 'Icon Size', type: 'slider', path: 'theme.components.launcher.iconSize', defaultValue: '28px', slider: { min: 16, max: 48, step: 2 } },
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
    { id: 'header-icon-bg', label: 'Icon background', type: 'token-ref', path: 'theme.components.header.iconBackground', defaultValue: 'semantic.colors.primary', tokenRef: { tokenType: 'color' } },
    { id: 'header-icon-fg', label: 'Icon color', type: 'token-ref', path: 'theme.components.header.iconForeground', defaultValue: 'semantic.colors.textInverse', tokenRef: { tokenType: 'color' } },
    { id: 'header-title-fg', label: 'Title color', type: 'token-ref', path: 'theme.components.header.titleForeground', defaultValue: 'semantic.colors.primary', tokenRef: { tokenType: 'color' } },
    { id: 'header-subtitle-fg', label: 'Subtitle color', type: 'token-ref', path: 'theme.components.header.subtitleForeground', defaultValue: 'semantic.colors.textMuted', tokenRef: { tokenType: 'color' } },
    { id: 'header-action-icons-fg', label: 'Clear / close icons', type: 'token-ref', path: 'theme.components.header.actionIconForeground', defaultValue: 'semantic.colors.textMuted', tokenRef: { tokenType: 'color' } },
    { id: 'header-border', label: 'Border', type: 'token-ref', path: 'theme.components.header.border', defaultValue: 'semantic.colors.border', tokenRef: { tokenType: 'color' } },
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
  };
}

function buildScopedColorSections(scope: ThemeScope, variant: ThemeVariant, collapseAll = false): SectionDef[] {
  return [
    scopeSection(headerColorsSectionDef, scope, variant, collapseAll ? true : false),
    scopeSection(messageColorsSectionDef, scope, variant, true),
    scopeSection(inputColorsSectionDef, scope, variant, true),
    scopeSection(buttonColorsSectionDef, scope, variant, true),
  ];
}

function buildSharedSections(): SectionDef[] {
  return [
    panelLayoutSectionDef,
    launcherLayoutSectionDef,
    messageShapeSectionDef,
    inputShapeSectionDef,
    buttonShapeSectionDef,
  ];
}

// ─── Render ───────────────────────────────────────────────────────

/** Render shared shape/layout sections for the component-shapes drill-down */
export function renderShapeSections(
  container: HTMLElement,
  onChange: OnChangeCallback
): ControlResult[] {
  const allControls: ControlResult[] = [];

  for (const section of buildSharedSections()) {
    setSearchContext('style', section.id);
    const { element, controls } = renderSection(section, onChange);
    container.appendChild(element);
    allControls.push(...controls);
  }

  return allControls;
}

/** Render scoped color sections (light + dark) for the component-colors drill-down */
export function renderColorSections(
  container: HTMLElement,
  onChange: OnChangeCallback
): ControlResult[] {
  const allControls: ControlResult[] = [];

  const lightSections = buildScopedColorSections('theme', 'light');
  const darkSections = buildScopedColorSections('darkTheme', 'dark', true);

  for (const [variant, sections] of [
    ['light', lightSections] as const,
    ['dark', darkSections] as const,
  ]) {
    const wrapper = document.createElement('div');
    wrapper.className = 'editing-target-group';
    wrapper.dataset.editingTarget = variant;

    for (const section of sections) {
      setSearchContext('style', section.id);
      const { element, controls } = renderSection(section, onChange);
      wrapper.appendChild(element);
      allControls.push(...controls);
    }

    container.appendChild(wrapper);
  }

  return allControls;
}

/** Render all component sections (shared + scoped) */
export function render(
  container: HTMLElement,
  onChange: OnChangeCallback
): ControlResult[] {
  const allControls: ControlResult[] = [];
  allControls.push(...renderShapeSections(container, onChange));
  allControls.push(...renderColorSections(container, onChange));
  return allControls;
}
