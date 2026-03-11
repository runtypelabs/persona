/** Tab 3: Settings — features, copy, layout, suggestions, markdown, form styling, other */

import type { SectionDef, OnChangeCallback, ControlResult } from '../types';
import { renderSection } from '../controls';
import { setSearchContext } from '../search';

export const TAB_ID = 'settings';
export const TAB_LABEL = 'Settings';

// ─── Section Definitions ──────────────────────────────────────────

const copySectionDef: SectionDef = {
  id: 'copy',
  title: 'Welcome & Copy',
  collapsed: false,
  fields: [
    { id: 'copy-welcome-title', label: 'Welcome Title', type: 'text', path: 'copy.welcomeTitle', defaultValue: 'Hello 👋' },
    { id: 'copy-welcome-subtitle', label: 'Welcome Subtitle', type: 'text', path: 'copy.welcomeSubtitle', defaultValue: 'Ask anything about your account or products.' },
    { id: 'copy-placeholder', label: 'Input Placeholder', type: 'text', path: 'copy.inputPlaceholder', defaultValue: 'Type your message…' },
    { id: 'copy-send-label', label: 'Send Button Label', type: 'text', path: 'copy.sendButtonLabel', defaultValue: 'Send' },
  ],
};

const featuresSectionDef: SectionDef = {
  id: 'features',
  title: 'Features',
  collapsed: true,
  fields: [
    { id: 'feat-reasoning', label: 'Show Reasoning', description: 'Display AI reasoning steps', type: 'toggle', path: 'features.showReasoning', defaultValue: false },
    { id: 'feat-tool-calls', label: 'Show Tool Calls', description: 'Display tool call details', type: 'toggle', path: 'features.showToolCalls', defaultValue: false },
    { id: 'feat-debug', label: 'Debug Mode', description: 'Show debug information', type: 'toggle', path: 'features.debugMode', defaultValue: false },
    { id: 'feat-voice', label: 'Voice Recognition', description: 'Enable voice input', type: 'toggle', path: 'voiceRecognition.enabled', defaultValue: false },
    { id: 'feat-voice-auto-send', label: 'Voice Auto Send', description: 'Auto-send after speech', type: 'toggle', path: 'voiceRecognition.autoSend', defaultValue: true },
  ],
};

const sendButtonSectionDef: SectionDef = {
  id: 'send-button',
  title: 'Send Button',
  collapsed: true,
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

const launcherConfigSectionDef: SectionDef = {
  id: 'launcher-config',
  title: 'Launcher Config',
  collapsed: true,
  fields: [
    { id: 'launch-enabled', label: 'Enabled', type: 'toggle', path: 'launcher.enabled', defaultValue: true },
    { id: 'launch-title', label: 'Title', type: 'text', path: 'launcher.title', defaultValue: 'Chat Assistant' },
    { id: 'launch-subtitle', label: 'Subtitle', type: 'text', path: 'launcher.subtitle', defaultValue: 'Here to help you get answers fast' },
    { id: 'launch-text-hidden', label: 'Hide Text', type: 'toggle', path: 'launcher.textHidden', defaultValue: false },
    { id: 'launch-icon-text', label: 'Agent Icon Text', type: 'text', path: 'launcher.agentIconText', defaultValue: '💬' },
    { id: 'launch-icon-name', label: 'Agent Icon Name (Lucide)', type: 'text', path: 'launcher.agentIconName', defaultValue: '' },
    { id: 'launch-icon-hidden', label: 'Hide Agent Icon', type: 'toggle', path: 'launcher.agentIconHidden', defaultValue: false },
    { id: 'launch-position', label: 'Position', type: 'select', path: 'launcher.position', defaultValue: 'bottom-right', options: [
      { value: 'bottom-right', label: 'Bottom Right' },
      { value: 'bottom-left', label: 'Bottom Left' },
      { value: 'top-right', label: 'Top Right' },
      { value: 'top-left', label: 'Top Left' },
    ] },
    { id: 'launch-width', label: 'Width', type: 'text', path: 'launcher.width', defaultValue: 'min(400px, calc(100vw - 24px))' },
    { id: 'launch-auto-expand', label: 'Auto Expand', type: 'toggle', path: 'launcher.autoExpand', defaultValue: false },
    { id: 'launch-full-height', label: 'Full Height', type: 'toggle', path: 'launcher.fullHeight', defaultValue: false },
    { id: 'launch-sidebar', label: 'Sidebar Mode', type: 'toggle', path: 'launcher.sidebarMode', defaultValue: false },
    { id: 'launch-sidebar-width', label: 'Sidebar Width', type: 'text', path: 'launcher.sidebarWidth', defaultValue: '420px' },
    { id: 'launch-cta-text', label: 'CTA Icon Text', type: 'text', path: 'launcher.callToActionIconText', defaultValue: '↗' },
    { id: 'launch-cta-name', label: 'CTA Icon Name', type: 'text', path: 'launcher.callToActionIconName', defaultValue: '' },
    { id: 'launch-cta-hidden', label: 'Hide CTA Icon', type: 'toggle', path: 'launcher.callToActionIconHidden', defaultValue: false },
    { id: 'launch-border', label: 'Border', type: 'text', path: 'launcher.border', defaultValue: '1px solid #e5e7eb' },
    { id: 'launch-shadow', label: 'Shadow', type: 'text', path: 'launcher.shadow', defaultValue: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' },
  ],
};

const closeButtonSectionDef: SectionDef = {
  id: 'close-button',
  title: 'Close Button',
  collapsed: true,
  fields: [
    { id: 'close-size', label: 'Size', type: 'slider', path: 'launcher.closeButtonSize', defaultValue: '32px', slider: { min: 16, max: 64, step: 1 } },
    { id: 'close-placement', label: 'Placement', type: 'select', path: 'launcher.closeButtonPlacement', defaultValue: 'inline', options: [
      { value: 'inline', label: 'Inline' },
      { value: 'top-right', label: 'Top Right' },
    ] },
    { id: 'close-border-width', label: 'Border Width', type: 'slider', path: 'launcher.closeButtonBorderWidth', defaultValue: '0px', slider: { min: 0, max: 8, step: 1 } },
    { id: 'close-border-radius', label: 'Border Radius', type: 'slider', path: 'launcher.closeButtonBorderRadius', defaultValue: '50%', slider: { min: 0, max: 100, step: 1, isRadiusFull: true } },
    { id: 'close-icon-name', label: 'Icon Name', type: 'text', path: 'launcher.closeButtonIconName', defaultValue: 'x' },
    { id: 'close-icon-text', label: 'Icon Text', type: 'text', path: 'launcher.closeButtonIconText', defaultValue: '×' },
    { id: 'close-show-tooltip', label: 'Show Tooltip', type: 'toggle', path: 'launcher.closeButtonShowTooltip', defaultValue: true },
    { id: 'close-tooltip-text', label: 'Tooltip Text', type: 'text', path: 'launcher.closeButtonTooltipText', defaultValue: 'Close chat' },
  ],
};

const clearChatSectionDef: SectionDef = {
  id: 'clear-chat',
  title: 'Clear Chat Button',
  collapsed: true,
  fields: [
    { id: 'clear-enabled', label: 'Enabled', type: 'toggle', path: 'launcher.clearChat.enabled', defaultValue: true },
    { id: 'clear-placement', label: 'Placement', type: 'select', path: 'launcher.clearChat.placement', defaultValue: 'inline', options: [
      { value: 'inline', label: 'Inline' },
      { value: 'top-right', label: 'Top Right' },
    ] },
    { id: 'clear-icon-name', label: 'Icon Name', type: 'text', path: 'launcher.clearChat.iconName', defaultValue: 'refresh-cw' },
    { id: 'clear-size', label: 'Size', type: 'slider', path: 'launcher.clearChat.size', defaultValue: '32px', slider: { min: 16, max: 64, step: 1 } },
    { id: 'clear-show-tooltip', label: 'Show Tooltip', type: 'toggle', path: 'launcher.clearChat.showTooltip', defaultValue: true },
    { id: 'clear-tooltip-text', label: 'Tooltip Text', type: 'text', path: 'launcher.clearChat.tooltipText', defaultValue: 'Clear chat' },
  ],
};

const statusIndicatorSectionDef: SectionDef = {
  id: 'status-indicator',
  title: 'Status Indicator',
  collapsed: true,
  fields: [
    { id: 'status-visible', label: 'Visible', type: 'toggle', path: 'statusIndicator.visible', defaultValue: false },
    { id: 'status-online-text', label: 'Online Text', type: 'text', path: 'statusIndicator.onlineText', defaultValue: 'Online' },
    { id: 'status-offline-text', label: 'Offline Text', type: 'text', path: 'statusIndicator.offlineText', defaultValue: 'Offline' },
    { id: 'status-connecting-text', label: 'Connecting Text', type: 'text', path: 'statusIndicator.connectingText', defaultValue: 'Connecting...' },
  ],
};

const messageActionsSectionDef: SectionDef = {
  id: 'message-actions',
  title: 'Message Actions',
  collapsed: true,
  fields: [
    { id: 'msg-actions-enabled', label: 'Enabled', type: 'toggle', path: 'messageActions.enabled', defaultValue: false },
    { id: 'msg-actions-copy', label: 'Show Copy', type: 'toggle', path: 'messageActions.showCopy', defaultValue: true },
    { id: 'msg-actions-upvote', label: 'Show Upvote', type: 'toggle', path: 'messageActions.showUpvote', defaultValue: true },
    { id: 'msg-actions-downvote', label: 'Show Downvote', type: 'toggle', path: 'messageActions.showDownvote', defaultValue: true },
    { id: 'msg-actions-visibility', label: 'Visibility', type: 'select', path: 'messageActions.visibility', defaultValue: 'hover', options: [
      { value: 'hover', label: 'On Hover' },
      { value: 'always', label: 'Always Visible' },
    ] },
    { id: 'msg-actions-align', label: 'Alignment', type: 'select', path: 'messageActions.alignment', defaultValue: 'left', options: [
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
    ] },
    { id: 'msg-actions-layout', label: 'Layout', type: 'select', path: 'messageActions.layout', defaultValue: 'horizontal', options: [
      { value: 'horizontal', label: 'Horizontal' },
      { value: 'vertical', label: 'Vertical' },
    ] },
  ],
};

const suggestionsSectionDef: SectionDef = {
  id: 'suggestions',
  title: 'Suggestion Chips',
  description: 'Configure suggestion chips using the JSON editor below',
  collapsed: true,
  fields: [
    { id: 'suggestions-json', label: 'Chips (JSON array)', description: '["Hi!", "Tell me more", "Help"]', type: 'text', path: 'suggestionChips.chips', defaultValue: '' },
  ],
};

const layoutSectionDef: SectionDef = {
  id: 'layout',
  title: 'Layout',
  collapsed: true,
  fields: [
    { id: 'layout-header', label: 'Header Layout', type: 'select', path: 'layout.header.layout', defaultValue: 'default', options: [
      { value: 'default', label: 'Default' },
      { value: 'minimal', label: 'Minimal' },
      { value: 'expanded', label: 'Expanded' },
    ] },
    { id: 'layout-show-icon', label: 'Show Header Icon', type: 'toggle', path: 'layout.header.showIcon', defaultValue: true },
    { id: 'layout-show-title', label: 'Show Header Title', type: 'toggle', path: 'layout.header.showTitle', defaultValue: true },
    { id: 'layout-show-subtitle', label: 'Show Header Subtitle', type: 'toggle', path: 'layout.header.showSubtitle', defaultValue: true },
    { id: 'layout-show-close', label: 'Show Close Button', type: 'toggle', path: 'layout.header.showCloseButton', defaultValue: true },
    { id: 'layout-show-clear', label: 'Show Clear Chat', type: 'toggle', path: 'layout.header.showClearChat', defaultValue: true },
    { id: 'layout-messages', label: 'Messages Layout', type: 'select', path: 'layout.messages.layout', defaultValue: 'bubble', options: [
      { value: 'bubble', label: 'Bubble' },
      { value: 'flat', label: 'Flat' },
      { value: 'minimal', label: 'Minimal' },
    ] },
    { id: 'layout-group', label: 'Group Consecutive', type: 'toggle', path: 'layout.messages.groupConsecutive', defaultValue: false },
    { id: 'layout-avatar-show', label: 'Show Avatars', type: 'toggle', path: 'layout.messages.avatar.show', defaultValue: false },
    { id: 'layout-avatar-pos', label: 'Avatar Position', type: 'select', path: 'layout.messages.avatar.position', defaultValue: 'left', options: [
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
    ] },
    { id: 'layout-avatar-user', label: 'User Avatar URL', type: 'text', path: 'layout.messages.avatar.userAvatar', defaultValue: '' },
    { id: 'layout-avatar-assistant', label: 'Assistant Avatar URL', type: 'text', path: 'layout.messages.avatar.assistantAvatar', defaultValue: '' },
    { id: 'layout-timestamp-show', label: 'Show Timestamps', type: 'toggle', path: 'layout.messages.timestamp.show', defaultValue: false },
    { id: 'layout-timestamp-pos', label: 'Timestamp Position', type: 'select', path: 'layout.messages.timestamp.position', defaultValue: 'inline', options: [
      { value: 'inline', label: 'Inline' },
      { value: 'below', label: 'Below' },
    ] },
  ],
};

const markdownSectionDef: SectionDef = {
  id: 'markdown',
  title: 'Markdown Options',
  collapsed: true,
  fields: [
    { id: 'md-gfm', label: 'GitHub Flavored Markdown', type: 'toggle', path: 'markdown.options.gfm', defaultValue: true },
    { id: 'md-breaks', label: 'Line Breaks', type: 'toggle', path: 'markdown.options.breaks', defaultValue: true },
    { id: 'md-header-ids', label: 'Header IDs', type: 'toggle', path: 'markdown.options.headerIds', defaultValue: false },
    { id: 'md-pedantic', label: 'Pedantic Mode', type: 'toggle', path: 'markdown.options.pedantic', defaultValue: false },
    { id: 'md-mangle', label: 'Mangle', type: 'toggle', path: 'markdown.options.mangle', defaultValue: true },
    { id: 'md-silent', label: 'Silent', type: 'toggle', path: 'markdown.options.silent', defaultValue: false },
    { id: 'md-disable-styles', label: 'Disable Default Styles', type: 'toggle', path: 'markdown.disableDefaultStyles', defaultValue: false },
  ],
};

const attachmentsSectionDef: SectionDef = {
  id: 'attachments-config',
  title: 'Attachments Config',
  collapsed: true,
  fields: [
    { id: 'attach-enabled', label: 'Enabled', type: 'toggle', path: 'attachments.enabled', defaultValue: false },
    { id: 'attach-max-files', label: 'Max Files', type: 'select', path: 'attachments.maxFiles', defaultValue: '4', options: [
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '4', label: '4' },
      { value: '6', label: '6' },
      { value: '8', label: '8' },
      { value: '10', label: '10' },
    ] },
    { id: 'attach-max-size', label: 'Max File Size (MB)', type: 'select', path: 'attachments.maxFileSize', defaultValue: '10', options: [
      { value: '1', label: '1 MB' },
      { value: '5', label: '5 MB' },
      { value: '10', label: '10 MB' },
      { value: '25', label: '25 MB' },
      { value: '50', label: '50 MB' },
    ] },
  ],
};

const otherOptionsSectionDef: SectionDef = {
  id: 'other-options',
  title: 'Other Options',
  collapsed: true,
  fields: [
    { id: 'opt-api-url', label: 'API URL', type: 'text', path: 'apiUrl', defaultValue: '' },
    { id: 'opt-flow', label: 'Flow ID', type: 'text', path: 'flowId', defaultValue: '' },
    { id: 'opt-parser', label: 'Stream Parser', type: 'select', path: 'parserType', defaultValue: 'plain', options: [
      { value: 'plain', label: 'Plain Text' },
      { value: 'json', label: 'JSON' },
      { value: 'regex-json', label: 'Regex JSON' },
      { value: 'xml', label: 'XML' },
    ] },
  ],
};

// ─── Render ───────────────────────────────────────────────────────

export function render(
  container: HTMLElement,
  onChange: OnChangeCallback
): ControlResult[] {
  const allControls: ControlResult[] = [];

  const sections = [
    copySectionDef,
    featuresSectionDef,
    sendButtonSectionDef,
    launcherConfigSectionDef,
    closeButtonSectionDef,
    clearChatSectionDef,
    statusIndicatorSectionDef,
    messageActionsSectionDef,
    suggestionsSectionDef,
    layoutSectionDef,
    markdownSectionDef,
    attachmentsSectionDef,
    otherOptionsSectionDef,
  ];

  for (const section of sections) {
    setSearchContext(TAB_ID, section.id);
    const { element, controls } = renderSection(section, onChange);
    container.appendChild(element);
    allControls.push(...controls);
  }

  return allControls;
}
