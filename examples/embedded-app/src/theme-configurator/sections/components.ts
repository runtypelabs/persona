/** Tab 2: Components — panel, header, messages, input, launcher, buttons, voice, approval */

import type { SectionDef, OnChangeCallback, ControlResult } from '../types';
import { renderSection } from '../controls';
import { setSearchContext } from '../search';

export const TAB_ID = 'components';
export const TAB_LABEL = 'Components';

// ─── Section Definitions ──────────────────────────────────────────

const panelSectionDef: SectionDef = {
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

const headerSectionDef: SectionDef = {
  id: 'comp-header',
  title: 'Header',
  collapsed: true,
  fields: [
    { id: 'header-bg', label: 'Background', type: 'token-ref', path: 'theme.components.header.background', defaultValue: 'semantic.colors.surface', tokenRef: { tokenType: 'color' } },
    { id: 'header-border', label: 'Border', type: 'token-ref', path: 'theme.components.header.border', defaultValue: 'semantic.colors.border', tokenRef: { tokenType: 'color' } },
    { id: 'header-border-radius', label: 'Border Radius', type: 'select', path: 'theme.components.header.borderRadius', defaultValue: 'palette.radius.xl palette.radius.xl 0 0', options: [
      { value: 'palette.radius.none', label: 'None' },
      { value: 'palette.radius.md palette.radius.md 0 0', label: 'Medium (top only)' },
      { value: 'palette.radius.lg palette.radius.lg 0 0', label: 'Large (top only)' },
      { value: 'palette.radius.xl palette.radius.xl 0 0', label: 'Extra Large (top only)' },
    ] },
  ],
};

const messagesSectionDef: SectionDef = {
  id: 'comp-messages',
  title: 'Messages',
  collapsed: true,
  fields: [
    // User messages
    { id: 'msg-user-bg', label: 'User Bubble Background', type: 'token-ref', path: 'theme.components.message.user.background', defaultValue: 'semantic.colors.primary', tokenRef: { tokenType: 'color' } },
    { id: 'msg-user-text', label: 'User Bubble Text', type: 'token-ref', path: 'theme.components.message.user.text', defaultValue: 'semantic.colors.textInverse', tokenRef: { tokenType: 'color' } },
    { id: 'msg-user-radius', label: 'User Bubble Radius', type: 'select', path: 'theme.components.message.user.borderRadius', defaultValue: 'palette.radius.lg', options: [
      { value: 'palette.radius.none', label: 'None' },
      { value: 'palette.radius.sm', label: 'Small' },
      { value: 'palette.radius.md', label: 'Medium' },
      { value: 'palette.radius.lg', label: 'Large' },
      { value: 'palette.radius.xl', label: 'Extra Large' },
    ] },
    // Assistant messages
    { id: 'msg-assistant-bg', label: 'Assistant Bubble Background', type: 'token-ref', path: 'theme.components.message.assistant.background', defaultValue: 'semantic.colors.container', tokenRef: { tokenType: 'color' } },
    { id: 'msg-assistant-text', label: 'Assistant Bubble Text', type: 'token-ref', path: 'theme.components.message.assistant.text', defaultValue: 'semantic.colors.text', tokenRef: { tokenType: 'color' } },
    { id: 'msg-assistant-radius', label: 'Assistant Bubble Radius', type: 'select', path: 'theme.components.message.assistant.borderRadius', defaultValue: 'palette.radius.lg', options: [
      { value: 'palette.radius.none', label: 'None' },
      { value: 'palette.radius.sm', label: 'Small' },
      { value: 'palette.radius.md', label: 'Medium' },
      { value: 'palette.radius.lg', label: 'Large' },
      { value: 'palette.radius.xl', label: 'Extra Large' },
    ] },
  ],
};

const inputSectionDef: SectionDef = {
  id: 'comp-input',
  title: 'Input',
  collapsed: true,
  fields: [
    { id: 'input-bg', label: 'Background', type: 'token-ref', path: 'theme.components.input.background', defaultValue: 'semantic.colors.surface', tokenRef: { tokenType: 'color' } },
    { id: 'input-placeholder', label: 'Placeholder Color', type: 'token-ref', path: 'theme.components.input.placeholder', defaultValue: 'semantic.colors.textMuted', tokenRef: { tokenType: 'color' } },
    { id: 'input-focus-border', label: 'Focus Border', type: 'token-ref', path: 'theme.components.input.focus.border', defaultValue: 'semantic.colors.interactive.focus', tokenRef: { tokenType: 'color' } },
    { id: 'input-focus-ring', label: 'Focus Ring', type: 'token-ref', path: 'theme.components.input.focus.ring', defaultValue: 'semantic.colors.interactive.focus', tokenRef: { tokenType: 'color' } },
    { id: 'input-radius', label: 'Border Radius', type: 'select', path: 'theme.components.input.borderRadius', defaultValue: 'palette.radius.lg', options: [
      { value: 'palette.radius.none', label: 'None' },
      { value: 'palette.radius.sm', label: 'Small' },
      { value: 'palette.radius.md', label: 'Medium' },
      { value: 'palette.radius.lg', label: 'Large' },
      { value: 'palette.radius.xl', label: 'Extra Large' },
    ] },
  ],
};

const buttonsSectionDef: SectionDef = {
  id: 'comp-buttons',
  title: 'Buttons',
  collapsed: true,
  fields: [
    // Primary
    { id: 'btn-primary-bg', label: 'Primary Background', type: 'token-ref', path: 'theme.components.button.primary.background', defaultValue: 'semantic.colors.primary', tokenRef: { tokenType: 'color' } },
    { id: 'btn-primary-fg', label: 'Primary Foreground', type: 'token-ref', path: 'theme.components.button.primary.foreground', defaultValue: 'semantic.colors.textInverse', tokenRef: { tokenType: 'color' } },
    { id: 'btn-primary-radius', label: 'Primary Radius', type: 'select', path: 'theme.components.button.primary.borderRadius', defaultValue: 'palette.radius.lg', options: [
      { value: 'palette.radius.sm', label: 'Small' },
      { value: 'palette.radius.md', label: 'Medium' },
      { value: 'palette.radius.lg', label: 'Large' },
      { value: 'palette.radius.full', label: 'Full' },
    ] },
    // Secondary
    { id: 'btn-secondary-bg', label: 'Secondary Background', type: 'token-ref', path: 'theme.components.button.secondary.background', defaultValue: 'semantic.colors.surface', tokenRef: { tokenType: 'color' } },
    { id: 'btn-secondary-fg', label: 'Secondary Foreground', type: 'token-ref', path: 'theme.components.button.secondary.foreground', defaultValue: 'semantic.colors.text', tokenRef: { tokenType: 'color' } },
    // Ghost
    { id: 'btn-ghost-bg', label: 'Ghost Background', type: 'color', path: 'theme.components.button.ghost.background', defaultValue: 'transparent' },
    { id: 'btn-ghost-fg', label: 'Ghost Foreground', type: 'token-ref', path: 'theme.components.button.ghost.foreground', defaultValue: 'semantic.colors.text', tokenRef: { tokenType: 'color' } },
  ],
};

const launcherSectionDef: SectionDef = {
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

const voiceSectionDef: SectionDef = {
  id: 'comp-voice',
  title: 'Voice',
  collapsed: true,
  fields: [
    { id: 'voice-rec-indicator', label: 'Recording Indicator', type: 'token-ref', path: 'theme.components.voice.recording.indicator', defaultValue: 'palette.colors.error.500', tokenRef: { tokenType: 'color' } },
    { id: 'voice-rec-bg', label: 'Recording Background', type: 'token-ref', path: 'theme.components.voice.recording.background', defaultValue: 'palette.colors.error.50', tokenRef: { tokenType: 'color' } },
    { id: 'voice-rec-border', label: 'Recording Border', type: 'token-ref', path: 'theme.components.voice.recording.border', defaultValue: 'palette.colors.error.200', tokenRef: { tokenType: 'color' } },
    { id: 'voice-proc-icon', label: 'Processing Icon', type: 'token-ref', path: 'theme.components.voice.processing.icon', defaultValue: 'palette.colors.primary.500', tokenRef: { tokenType: 'color' } },
    { id: 'voice-proc-bg', label: 'Processing Background', type: 'token-ref', path: 'theme.components.voice.processing.background', defaultValue: 'palette.colors.primary.50', tokenRef: { tokenType: 'color' } },
    { id: 'voice-speak-icon', label: 'Speaking Icon', type: 'token-ref', path: 'theme.components.voice.speaking.icon', defaultValue: 'palette.colors.success.500', tokenRef: { tokenType: 'color' } },
  ],
};

const approvalSectionDef: SectionDef = {
  id: 'comp-approval',
  title: 'Approval',
  collapsed: true,
  fields: [
    { id: 'approval-req-bg', label: 'Requested Background', type: 'token-ref', path: 'theme.components.approval.requested.background', defaultValue: 'palette.colors.warning.50', tokenRef: { tokenType: 'color' } },
    { id: 'approval-req-border', label: 'Requested Border', type: 'token-ref', path: 'theme.components.approval.requested.border', defaultValue: 'palette.colors.warning.200', tokenRef: { tokenType: 'color' } },
    { id: 'approval-req-text', label: 'Requested Text', type: 'token-ref', path: 'theme.components.approval.requested.text', defaultValue: 'palette.colors.gray.900', tokenRef: { tokenType: 'color' } },
    { id: 'approval-approve-bg', label: 'Approve Background', type: 'token-ref', path: 'theme.components.approval.approve.background', defaultValue: 'palette.colors.success.500', tokenRef: { tokenType: 'color' } },
    { id: 'approval-approve-fg', label: 'Approve Foreground', type: 'token-ref', path: 'theme.components.approval.approve.foreground', defaultValue: 'palette.colors.gray.50', tokenRef: { tokenType: 'color' } },
    { id: 'approval-deny-bg', label: 'Deny Background', type: 'token-ref', path: 'theme.components.approval.deny.background', defaultValue: 'palette.colors.error.500', tokenRef: { tokenType: 'color' } },
    { id: 'approval-deny-fg', label: 'Deny Foreground', type: 'token-ref', path: 'theme.components.approval.deny.foreground', defaultValue: 'palette.colors.gray.50', tokenRef: { tokenType: 'color' } },
  ],
};

const attachmentSectionDef: SectionDef = {
  id: 'comp-attachment',
  title: 'Attachments',
  collapsed: true,
  fields: [
    { id: 'attach-img-bg', label: 'Image Background', type: 'token-ref', path: 'theme.components.attachment.image.background', defaultValue: 'palette.colors.gray.100', tokenRef: { tokenType: 'color' } },
    { id: 'attach-img-border', label: 'Image Border', type: 'token-ref', path: 'theme.components.attachment.image.border', defaultValue: 'palette.colors.gray.200', tokenRef: { tokenType: 'color' } },
  ],
};

// ─── Render ───────────────────────────────────────────────────────

export function render(
  container: HTMLElement,
  onChange: OnChangeCallback
): ControlResult[] {
  const allControls: ControlResult[] = [];

  const sections = [
    panelSectionDef,
    headerSectionDef,
    messagesSectionDef,
    inputSectionDef,
    buttonsSectionDef,
    launcherSectionDef,
    voiceSectionDef,
    approvalSectionDef,
    attachmentSectionDef,
  ];

  for (const section of sections) {
    setSearchContext(TAB_ID, section.id);
    const { element, controls } = renderSection(section, onChange);
    container.appendChild(element);
    allControls.push(...controls);
  }

  return allControls;
}
