/** Configure tab — content, layout, widget, features, and developer settings */

import type { SectionDef, OnChangeCallback, ControlResult } from '../types';
import { renderSection } from '../controls';
import { setSearchContext } from '../search';
import * as state from '../state';

export const TAB_ID = 'configure';
export const TAB_LABEL = 'Configure';

const MB = 1024 * 1024;
const DEFAULT_SUGGESTION_CHIPS = [
  'What can you help me with?',
  'Tell me about your features',
  'How does this work?',
];

const ATTACHMENT_TYPE_PRESETS: Record<string, string[]> = {
  images: [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
  ],
  'images-pdf': [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'application/pdf',
  ],
  'images-text-pdf': [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
  ],
  all: [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/json',
  ],
};

function parseAttachmentMaxFileSize(value: string): number {
  return Number(value) * MB;
}

function formatAttachmentMaxFileSize(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '10';
  return numeric > 1024 ? String(Math.round(numeric / MB)) : String(numeric);
}

function parseAttachmentAllowedTypes(value: string): string[] {
  return ATTACHMENT_TYPE_PRESETS[value] ?? ATTACHMENT_TYPE_PRESETS.images;
}

function formatAttachmentAllowedTypes(value: unknown): string {
  const allowedTypes = Array.isArray(value) ? value : ATTACHMENT_TYPE_PRESETS.images;
  const normalized = [...new Set(allowedTypes)].sort();

  for (const [presetKey, presetTypes] of Object.entries(ATTACHMENT_TYPE_PRESETS)) {
    const sortedPreset = [...presetTypes].sort();
    if (
      normalized.length === sortedPreset.length &&
      normalized.every((type, index) => type === sortedPreset[index])
    ) {
      return presetKey;
    }
  }

  if (normalized.some(type => type.startsWith('application/vnd') || type === 'application/msword')) {
    return 'all';
  }
  if (normalized.some(type => type === 'text/plain' || type === 'text/markdown' || type === 'text/csv')) {
    return 'images-text-pdf';
  }
  if (normalized.includes('application/pdf')) {
    return 'images-pdf';
  }
  return 'images';
}

// ─── Sub-group: Content ──────────────────────────────────────────

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

const suggestionsSectionDef: SectionDef = {
  id: 'suggestions',
  title: 'Suggestion Chips',
  description: 'Configure chip content and styling.',
  collapsed: true,
  fields: [
    {
      id: 'suggestions-list',
      label: 'Suggestions',
      description: 'Add, edit, and remove chips directly.',
      type: 'chip-list',
      path: 'suggestionChips',
      defaultValue: DEFAULT_SUGGESTION_CHIPS,
    },
  ],
};

// ─── Sub-group: Layout ───────────────────────────────────────────

const headerLayoutSectionDef: SectionDef = {
  id: 'header-layout',
  title: 'Header',
  collapsed: true,
  fields: [
    { id: 'layout-header', label: 'Header Layout', type: 'select', path: 'layout.header.layout', defaultValue: 'default', options: [
      { value: 'default', label: 'Default' },
      { value: 'minimal', label: 'Minimal' },
    ] },
    { id: 'layout-show-icon', label: 'Show Header Icon', type: 'toggle', path: 'layout.header.showIcon', defaultValue: true },
    { id: 'layout-show-title', label: 'Show Header Title', type: 'toggle', path: 'layout.header.showTitle', defaultValue: true },
    { id: 'layout-show-subtitle', label: 'Show Header Subtitle', type: 'toggle', path: 'layout.header.showSubtitle', defaultValue: true },
    { id: 'layout-show-close', label: 'Show Close Button', type: 'toggle', path: 'layout.header.showCloseButton', defaultValue: true },
    { id: 'layout-show-clear', label: 'Show Clear Chat', type: 'toggle', path: 'layout.header.showClearChat', defaultValue: true },
  ],
};

const messagesLayoutSectionDef: SectionDef = {
  id: 'messages-layout',
  title: 'Messages',
  collapsed: true,
  fields: [
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
    { id: 'msg-actions-align', label: 'Alignment', type: 'select', path: 'messageActions.align', defaultValue: 'left', options: [
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
    ] },
    { id: 'msg-actions-layout', label: 'Layout', type: 'select', path: 'messageActions.layout', defaultValue: 'pill-inside', options: [
      { value: 'pill-inside', label: 'Pill' },
      { value: 'row-inside', label: 'Row' },
    ] },
  ],
};

// ─── Sub-group: Widget ───────────────────────────────────────────

const launcherConfigSectionDef: SectionDef = {
  id: 'launcher-config',
  title: 'Launcher',
  collapsed: true,
  fields: [
    { id: 'launch-enabled', label: 'Enabled', type: 'toggle', path: 'launcher.enabled', defaultValue: true },
    { id: 'launch-mount-mode', label: 'Mount Mode', type: 'select', path: 'launcher.mountMode', defaultValue: 'floating', options: [
      { value: 'floating', label: 'Floating' },
      { value: 'docked', label: 'Docked' },
    ] },
    { id: 'launch-dock-side', label: 'Dock Side', type: 'select', path: 'launcher.dock.side', defaultValue: 'right', options: [
      { value: 'right', label: 'Right' },
      { value: 'left', label: 'Left' },
    ] },
    { id: 'launch-dock-width', label: 'Dock Width', type: 'text', path: 'launcher.dock.width', defaultValue: '420px' },
    { id: 'launch-title', label: 'Title', type: 'text', path: 'launcher.title', defaultValue: 'Chat Assistant' },
    { id: 'launch-subtitle', label: 'Subtitle', type: 'text', path: 'launcher.subtitle', defaultValue: 'Here to help you get answers fast' },
    { id: 'launch-text-hidden', label: 'Hide Text', type: 'toggle', path: 'launcher.textHidden', defaultValue: false },
    { id: 'launch-icon-text', label: 'Agent Icon Text', type: 'text', path: 'launcher.agentIconText', defaultValue: '💬' },
    { id: 'launch-icon-name', label: 'Agent Icon Name (Lucide)', type: 'text', path: 'launcher.agentIconName', defaultValue: '' },
    { id: 'launch-icon-hidden', label: 'Hide Agent Icon', type: 'toggle', path: 'launcher.agentIconHidden', defaultValue: false },
    { id: 'launch-icon-size', label: 'Agent Icon Size', type: 'slider', path: 'launcher.agentIconSize', defaultValue: '40px', slider: { min: 16, max: 72, step: 2 } },
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
    { id: 'launch-cta-size', label: 'CTA Icon Size', type: 'slider', path: 'launcher.callToActionIconSize', defaultValue: '32px', slider: { min: 16, max: 64, step: 2 } },
    { id: 'launch-cta-padding', label: 'CTA Icon Padding', type: 'slider', path: 'launcher.callToActionIconPadding', defaultValue: '5px', slider: { min: 0, max: 24, step: 1 } },
    { id: 'launch-cta-bg', label: 'CTA Icon Background', type: 'color', path: 'launcher.callToActionIconBackgroundColor', defaultValue: '#ffffff' },
    { id: 'launch-border', label: 'Border', type: 'text', path: 'launcher.border', defaultValue: '1px solid #e5e7eb' },
    { id: 'launch-shadow', label: 'Shadow', type: 'text', path: 'launcher.shadow', defaultValue: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' },
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
    { id: 'status-idle-text', label: 'Idle Text', type: 'text', path: 'statusIndicator.idleText', defaultValue: 'Online' },
    { id: 'status-connecting-text', label: 'Connecting Text', type: 'text', path: 'statusIndicator.connectingText', defaultValue: 'Connecting…' },
    { id: 'status-connected-text', label: 'Connected Text', type: 'text', path: 'statusIndicator.connectedText', defaultValue: 'Streaming…' },
    { id: 'status-error-text', label: 'Error Text', type: 'text', path: 'statusIndicator.errorText', defaultValue: 'Offline' },
  ],
};

// ─── Sub-group: Features ────────────────────────────────────────

const featuresSectionDef: SectionDef = {
  id: 'features',
  title: 'Features',
  collapsed: true,
  fields: [
    { id: 'feat-voice', label: 'Voice Recognition', description: 'Enable voice input', type: 'toggle', path: 'voiceRecognition.enabled', defaultValue: false },
    { id: 'feat-voice-auto-send', label: 'Voice Auto Send', description: 'Auto-send after speech', type: 'toggle', path: 'voiceRecognition.autoSend', defaultValue: true },
  ],
};

const attachmentsSectionDef: SectionDef = {
  id: 'attachments-config',
  title: 'Attachments',
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
    {
      id: 'attach-max-size',
      label: 'Max File Size (MB)',
      type: 'select',
      path: 'attachments.maxFileSize',
      defaultValue: 10 * MB,
      options: [
        { value: '1', label: '1 MB' },
        { value: '5', label: '5 MB' },
        { value: '10', label: '10 MB' },
        { value: '25', label: '25 MB' },
        { value: '50', label: '50 MB' },
      ],
      formatValue: formatAttachmentMaxFileSize,
      parseValue: parseAttachmentMaxFileSize,
    },
    {
      id: 'attach-types',
      label: 'Allowed File Types',
      type: 'select',
      path: 'attachments.allowedTypes',
      defaultValue: ATTACHMENT_TYPE_PRESETS.images,
      options: [
        { value: 'images', label: 'Images only' },
        { value: 'images-pdf', label: 'Images + PDF' },
        { value: 'images-text-pdf', label: 'Images + text + PDF' },
        { value: 'all', label: 'All supported types' },
      ],
      formatValue: formatAttachmentAllowedTypes,
      parseValue: parseAttachmentAllowedTypes,
    },
  ],
};

const artifactsSectionDef: SectionDef = {
  id: 'artifacts-config',
  title: 'Artifacts',
  collapsed: true,
  fields: [
    { id: 'art-enabled', label: 'Enabled', description: 'Show artifact sidebar for documents and components', type: 'toggle', path: 'features.artifacts.enabled', defaultValue: false },
    { id: 'art-appearance', label: 'Pane Appearance', type: 'select', path: 'features.artifacts.layout.paneAppearance', defaultValue: 'panel', options: [
      { value: 'panel', label: 'Panel (bordered)' },
      { value: 'seamless', label: 'Seamless' },
    ] },
    { id: 'art-toolbar', label: 'Toolbar Preset', type: 'select', path: 'features.artifacts.layout.toolbarPreset', defaultValue: 'default', options: [
      { value: 'default', label: 'Default' },
      { value: 'document', label: 'Document' },
    ] },
    { id: 'art-pane-width', label: 'Pane Width', description: 'CSS width (e.g. 40%, 28rem)', type: 'text', path: 'features.artifacts.layout.paneWidth', defaultValue: '40%' },
    { id: 'art-pane-max-width', label: 'Pane Max Width', type: 'text', path: 'features.artifacts.layout.paneMaxWidth', defaultValue: '28rem' },
    { id: 'art-split-gap', label: 'Split Gap', type: 'text', path: 'features.artifacts.layout.splitGap', defaultValue: '0.5rem' },
    { id: 'art-pane-bg', label: 'Pane Background', type: 'color', path: 'features.artifacts.layout.paneBackground', defaultValue: '' },
    { id: 'art-pane-padding', label: 'Pane Padding', type: 'text', path: 'features.artifacts.layout.panePadding', defaultValue: '' },
    { id: 'art-unified', label: 'Unified Split Chrome', description: 'Wrap chat and artifact in a single container', type: 'toggle', path: 'features.artifacts.layout.unifiedSplitChrome', defaultValue: false },
    { id: 'art-resizable', label: 'Resizable', description: 'Allow dragging the pane divider', type: 'toggle', path: 'features.artifacts.layout.resizable', defaultValue: false },
    { id: 'art-expand-panel', label: 'Expand Panel When Open', description: 'Widen the launcher panel to fit artifacts', type: 'toggle', path: 'features.artifacts.layout.expandLauncherPanelWhenOpen', defaultValue: true },
    { id: 'art-doc-copy-label', label: 'Show Copy Label', description: 'Document toolbar: show "Copy" text', type: 'toggle', path: 'features.artifacts.layout.documentToolbarShowCopyLabel', defaultValue: false },
    { id: 'art-doc-copy-chevron', label: 'Show Copy Chevron', description: 'Document toolbar: show dropdown arrow on copy', type: 'toggle', path: 'features.artifacts.layout.documentToolbarShowCopyChevron', defaultValue: false },
    { id: 'art-doc-icon-color', label: 'Toolbar Icon Color', description: 'Document toolbar icon color', type: 'color', path: 'features.artifacts.layout.documentToolbarIconColor', defaultValue: '' },
  ],
};

// ─── Sub-group: Developer ────────────────────────────────────────

const apiIntegrationSectionDef: SectionDef = {
  id: 'api-integration',
  title: 'API & Integration',
  description: 'Runtime and integration options.',
  collapsed: true,
  fields: [
    { id: 'dev-api-url', label: 'API URL', type: 'text', path: 'apiUrl', defaultValue: '' },
    { id: 'dev-flow', label: 'Flow ID', type: 'text', path: 'flowId', defaultValue: '' },
    { id: 'dev-parser', label: 'Stream Parser', type: 'select', path: 'parserType', defaultValue: 'plain', options: [
      { value: 'plain', label: 'Plain Text' },
      { value: 'json', label: 'JSON' },
      { value: 'regex-json', label: 'Regex JSON' },
      { value: 'xml', label: 'XML' },
    ] },
  ],
};

const debugSectionDef: SectionDef = {
  id: 'debug-inspection',
  title: 'Debug & Inspection',
  collapsed: true,
  fields: [
    { id: 'dev-reasoning', label: 'Show Reasoning', description: 'Display AI reasoning steps', type: 'toggle', path: 'features.showReasoning', defaultValue: false },
    { id: 'dev-tool-calls', label: 'Show Tool Calls', description: 'Display tool call details', type: 'toggle', path: 'features.showToolCalls', defaultValue: false },
    { id: 'dev-debug', label: 'Debug Mode', description: 'Show debug information', type: 'toggle', path: 'debug', defaultValue: false },
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
    { id: 'md-header-prefix', label: 'Header Prefix', type: 'text', path: 'markdown.options.headerPrefix', defaultValue: '' },
    { id: 'md-pedantic', label: 'Pedantic Mode', type: 'toggle', path: 'markdown.options.pedantic', defaultValue: false },
    { id: 'md-mangle', label: 'Mangle', type: 'toggle', path: 'markdown.options.mangle', defaultValue: true },
    { id: 'md-silent', label: 'Silent', type: 'toggle', path: 'markdown.options.silent', defaultValue: false },
    { id: 'md-disable-styles', label: 'Disable Default Styles', type: 'toggle', path: 'markdown.disableDefaultStyles', defaultValue: false },
  ],
};

// ─── Sub-group definitions ───────────────────────────────────────

interface SubGroup {
  label: string;
  sections: SectionDef[];
}

const SUB_GROUPS: SubGroup[] = [
  { label: 'Content', sections: [copySectionDef, suggestionsSectionDef] },
  { label: 'Layout', sections: [headerLayoutSectionDef, messagesLayoutSectionDef, messageActionsSectionDef] },
  { label: 'Widget', sections: [launcherConfigSectionDef, sendButtonSectionDef, closeButtonSectionDef, clearChatSectionDef, statusIndicatorSectionDef] },
  { label: 'Features', sections: [featuresSectionDef, attachmentsSectionDef, artifactsSectionDef] },
  { label: 'Developer', sections: [apiIntegrationSectionDef, debugSectionDef, markdownSectionDef] },
];

// ─── Render ───────────────────────────────────────────────────────

function renderSections(
  container: HTMLElement,
  onChange: OnChangeCallback,
  sections: SectionDef[],
  searchTabId: string
): ControlResult[] {
  const allControls: ControlResult[] = [];

  for (const section of sections) {
    setSearchContext(searchTabId, section.id);
    const { element, controls } = renderSection(section, onChange);
    container.appendChild(element);
    allControls.push(...controls);

    // Add "Show Sample Artifact" button to the artifacts section
    if (section.id === 'artifacts-config') {
      const content = element.querySelector('.accordion-content');
      if (content) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Show Sample Artifact';
        btn.className = 'config-action-btn';
        btn.style.cssText = 'margin-top:8px;width:100%;padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);font-size:12px;cursor:pointer;';
        btn.addEventListener('click', () => {
          window.dispatchEvent(new CustomEvent('persona-configurator:inject-artifact'));
        });
        content.appendChild(btn);
      }
    }
  }

  return allControls;
}

function refreshLauncherSectionMetadata(container: HTMLElement): void {
  const section = container.querySelector<HTMLElement>('[data-section-id="launcher-config"]');
  const header = section?.querySelector<HTMLElement>('.accordion-header');
  if (!section || !header) return;

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

  const summary = meta.querySelector<HTMLElement>('.accordion-summary');
  const actions = meta.querySelector<HTMLElement>('.section-header-actions');
  if (!summary || !actions) return;

  summary.innerHTML = '';

  const position = document.createElement('span');
  position.className = 'accordion-summary-item accordion-summary-item-text';
  position.textContent = `Position: ${String(state.get('launcher.position') ?? 'bottom-right')}`;
  summary.appendChild(position);

  actions.innerHTML = `
    <button
      type="button"
      class="drilldown-link section-header-action"
      data-crosslink-tab="style"
      data-crosslink-section="launcher-style"
    >
      Edit appearance
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
    </button>
  `;
}

/** Render the full Configure tab with sub-group dividers */
export function render(
  container: HTMLElement,
  onChange: OnChangeCallback
): ControlResult[] {
  const allControls: ControlResult[] = [];

  for (const group of SUB_GROUPS) {
    const divider = document.createElement('div');
    divider.className = 'subgroup-divider';
    divider.innerHTML = `<span class="subgroup-label">${group.label}</span>`;
    container.appendChild(divider);

    allControls.push(...renderSections(container, onChange, group.sections, TAB_ID));
  }

  refreshSectionMetadata(container);
  return allControls;
}

export function refreshSectionMetadata(container: HTMLElement): void {
  refreshLauncherSectionMetadata(container);
}
