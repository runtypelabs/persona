/**
 * Bidirectional mapping between CSS variable names and theme dot-paths,
 * plus category groupings for the Theme Inspector UI.
 *
 * Derived from packages/widget/src/utils/tokens.ts (themeToCssVariables).
 */

/**
 * CSS var alias -> theme object dot-path.
 * Used for Export: given a set of CSS overrides, produce a PersonaTheme partial.
 */
export const CSS_VAR_TO_THEME_PATH = {
  // Convenience aliases -> semantic
  '--persona-primary': 'semantic.colors.primary',
  '--persona-secondary': 'semantic.colors.secondary',
  '--persona-accent': 'semantic.colors.accent',
  '--persona-surface': 'semantic.colors.surface',
  '--persona-background': 'semantic.colors.background',
  '--persona-container': 'semantic.colors.container',
  '--persona-text': 'semantic.colors.text',
  '--persona-text-muted': 'semantic.colors.textMuted',
  '--persona-text-inverse': 'semantic.colors.textInverse',
  '--persona-border': 'semantic.colors.border',
  '--persona-divider': 'semantic.colors.divider',

  // Typography
  '--persona-font-family': 'semantic.typography.fontFamily',
  '--persona-font-size': 'semantic.typography.fontSize',
  '--persona-font-weight': 'semantic.typography.fontWeight',
  '--persona-line-height': 'semantic.typography.lineHeight',

  // Launcher
  '--persona-launcher-bg': 'components.launcher.background',
  '--persona-launcher-fg': 'components.launcher.foreground',
  '--persona-launcher-border': 'components.launcher.border',
  '--persona-launcher-radius': 'components.launcher.borderRadius',

  // Button
  '--persona-button-primary-bg': 'components.button.primary.background',
  '--persona-button-primary-fg': 'components.button.primary.foreground',
  '--persona-button-radius': 'components.button.primary.borderRadius',

  // Panel
  '--persona-panel-radius': 'components.panel.borderRadius',
  '--persona-panel-border': 'components.panel.border',
  '--persona-panel-shadow': 'components.panel.shadow',

  // Input
  '--persona-input-radius': 'components.input.borderRadius',
  '--persona-input-background': 'components.input.background',
  '--persona-input-placeholder': 'components.input.placeholder',

  // Header
  '--persona-header-bg': 'components.header.background',
  '--persona-header-border': 'components.header.border',
  '--persona-header-icon-bg': 'components.header.iconBackground',
  '--persona-header-icon-fg': 'components.header.iconForeground',
  '--persona-header-title-fg': 'components.header.titleForeground',
  '--persona-header-subtitle-fg': 'components.header.subtitleForeground',
  '--persona-header-action-icon-fg': 'components.header.actionIconForeground',

  // Messages
  '--persona-message-user-bg': 'components.message.user.background',
  '--persona-message-user-text': 'components.message.user.text',
  '--persona-message-user-radius': 'components.message.user.borderRadius',
  '--persona-message-user-shadow': 'components.message.user.shadow',
  '--persona-message-assistant-bg': 'components.message.assistant.background',
  '--persona-message-assistant-text': 'components.message.assistant.text',
  '--persona-message-assistant-radius': 'components.message.assistant.borderRadius',
  '--persona-message-assistant-border': 'components.message.assistant.border',
  '--persona-message-assistant-shadow': 'components.message.assistant.shadow',
  '--persona-message-border': 'components.message.border',

  // Scroll to bottom
  '--persona-scroll-to-bottom-bg': 'components.scrollToBottom.background',
  '--persona-scroll-to-bottom-fg': 'components.scrollToBottom.foreground',
  '--persona-scroll-to-bottom-border': 'components.scrollToBottom.border',
  '--persona-scroll-to-bottom-radius': 'components.scrollToBottom.borderRadius',

  // Bubbles
  '--persona-tool-bubble-shadow': 'components.toolBubble.shadow',
  '--persona-reasoning-bubble-shadow': 'components.reasoningBubble.shadow',
  '--persona-composer-shadow': 'components.composer.shadow',

  // Markdown
  '--persona-md-inline-code-bg': 'components.markdown.inlineCode.background',
  '--persona-md-inline-code-color': 'components.markdown.inlineCode.foreground',
  '--persona-md-link-color': 'components.markdown.link.foreground',
  '--persona-md-code-block-bg': 'components.markdown.codeBlock.background',
  '--persona-md-code-block-border-color': 'components.markdown.codeBlock.borderColor',
  '--persona-md-code-block-text-color': 'components.markdown.codeBlock.textColor',
  '--persona-md-table-header-bg': 'components.markdown.table.headerBackground',
  '--persona-md-table-border-color': 'components.markdown.table.borderColor',
  '--persona-md-hr-color': 'components.markdown.hr.color',
  '--persona-md-blockquote-border-color': 'components.markdown.blockquote.borderColor',
  '--persona-md-blockquote-bg': 'components.markdown.blockquote.background',
  '--persona-md-blockquote-text-color': 'components.markdown.blockquote.textColor',

  // Collapsible widget
  '--cw-container': 'components.collapsibleWidget.container',
  '--cw-surface': 'components.collapsibleWidget.surface',
  '--cw-border': 'components.collapsibleWidget.border',

  // Approval
  '--persona-approval-bg': 'components.approval.requested.background',
  '--persona-approval-border': 'components.approval.requested.border',
  '--persona-approval-text': 'components.approval.requested.text',
  '--persona-approval-approve-bg': 'components.approval.approve.background',
  '--persona-approval-deny-bg': 'components.approval.deny.background',
};

/**
 * Category definitions for grouping CSS vars in the Theme Inspector UI.
 * Each section: { id, title, collapsed?, vars: string[] }
 */
export const CSS_VAR_CATEGORIES = [
  {
    id: 'core-colors',
    title: 'Core Colors',
    collapsed: false,
    vars: [
      '--persona-primary', '--persona-secondary', '--persona-accent',
      '--persona-surface', '--persona-background', '--persona-container',
      '--persona-text', '--persona-text-muted', '--persona-text-inverse',
      '--persona-border', '--persona-divider',
    ],
  },
  {
    id: 'header',
    title: 'Header',
    collapsed: true,
    vars: [
      '--persona-header-bg', '--persona-header-border',
      '--persona-header-icon-bg', '--persona-header-icon-fg',
      '--persona-header-title-fg', '--persona-header-subtitle-fg',
      '--persona-header-action-icon-fg',
      '--persona-header-shadow', '--persona-header-border-bottom',
    ],
  },
  {
    id: 'messages',
    title: 'Messages',
    collapsed: true,
    vars: [
      '--persona-message-user-bg', '--persona-message-user-text',
      '--persona-message-user-radius', '--persona-message-user-shadow',
      '--persona-message-assistant-bg', '--persona-message-assistant-text',
      '--persona-message-assistant-radius', '--persona-message-assistant-border',
      '--persona-message-assistant-shadow', '--persona-message-border',
    ],
  },
  {
    id: 'launcher',
    title: 'Launcher & Buttons',
    collapsed: true,
    vars: [
      '--persona-launcher-bg', '--persona-launcher-fg',
      '--persona-launcher-border', '--persona-launcher-radius',
      '--persona-button-primary-bg', '--persona-button-primary-fg',
      '--persona-button-radius',
    ],
  },
  {
    id: 'input',
    title: 'Input & Composer',
    collapsed: true,
    vars: [
      '--persona-input-background', '--persona-input-placeholder',
      '--persona-input-radius', '--persona-composer-shadow',
    ],
  },
  {
    id: 'panel-layout',
    title: 'Panel & Layout',
    collapsed: true,
    vars: [
      '--persona-panel-radius', '--persona-panel-border', '--persona-panel-shadow',
      '--persona-scroll-to-bottom-bg', '--persona-scroll-to-bottom-fg',
      '--persona-scroll-to-bottom-border', '--persona-scroll-to-bottom-radius',
      '--persona-scroll-to-bottom-shadow',
    ],
  },
  {
    id: 'typography',
    title: 'Typography',
    collapsed: true,
    vars: [
      '--persona-font-family', '--persona-font-size',
      '--persona-font-weight', '--persona-line-height',
    ],
  },
  {
    id: 'radius',
    title: 'Border Radius',
    collapsed: true,
    vars: [
      '--persona-radius-sm', '--persona-radius-md', '--persona-radius-lg',
      '--persona-radius-xl', '--persona-radius-full',
    ],
  },
  {
    id: 'markdown',
    title: 'Markdown',
    collapsed: true,
    vars: [
      '--persona-md-inline-code-bg', '--persona-md-inline-code-color',
      '--persona-md-link-color',
      '--persona-md-code-block-bg', '--persona-md-code-block-border-color',
      '--persona-md-code-block-text-color',
      '--persona-md-table-header-bg', '--persona-md-table-border-color',
      '--persona-md-hr-color',
      '--persona-md-blockquote-border-color', '--persona-md-blockquote-bg',
      '--persona-md-blockquote-text-color',
    ],
  },
  {
    id: 'bubbles',
    title: 'Tool & Reasoning Bubbles',
    collapsed: true,
    vars: [
      '--persona-tool-bubble-shadow', '--persona-reasoning-bubble-shadow',
      '--cw-container', '--cw-surface', '--cw-border',
    ],
  },
  {
    id: 'voice-approval',
    title: 'Voice & Approval',
    collapsed: true,
    vars: [
      '--persona-voice-recording-indicator', '--persona-voice-recording-bg',
      '--persona-voice-processing-icon', '--persona-voice-speaking-icon',
      '--persona-approval-bg', '--persona-approval-border', '--persona-approval-text',
      '--persona-approval-approve-bg', '--persona-approval-deny-bg',
    ],
  },
];

/**
 * Heuristic: does this CSS value look like a color?
 * Matches hex, rgb(), rgba(), hsl(), hsla(), named CSS colors, and var() references.
 */
export function looksLikeColor(value) {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return (
    /^#[0-9a-f]{3,8}$/i.test(v) ||
    /^rgba?\(/.test(v) ||
    /^hsla?\(/.test(v) ||
    /^(transparent|currentcolor|inherit)$/.test(v)
  );
}

/**
 * Heuristic: does this CSS value look like a length/size?
 */
export function looksLikeLength(value) {
  if (!value) return false;
  return /^-?[\d.]+\s*(px|rem|em|%)$/.test(value.trim());
}

/**
 * Convert overrides map back to a nested theme object for export.
 */
export function overridesToThemeObject(overrides) {
  const theme = {};
  for (const [varName, value] of Object.entries(overrides)) {
    const path = CSS_VAR_TO_THEME_PATH[varName];
    if (!path) continue;
    setNestedValue(theme, path, value);
  }
  return theme;
}

function setNestedValue(obj, path, value) {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}
