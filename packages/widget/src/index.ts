import {
  initAgentWidget as initAgentWidgetFn,
  type AgentWidgetInitHandle
} from "./runtime/init";

export type {
  AgentWidgetConfig,
  AgentWidgetTheme,
  AgentWidgetFeatureFlags,
  AgentWidgetArtifactsFeature,
  AgentWidgetArtifactsLayoutConfig,
  PersonaArtifactKind,
  PersonaArtifactRecord,
  PersonaArtifactManualUpsert,
  ArtifactConfigPayload,
  AgentWidgetInitOptions,
  AgentWidgetMessage,
  AgentWidgetLauncherConfig,
  AgentWidgetDockConfig,
  AgentWidgetEvent,
  AgentWidgetStreamParser,
  AgentWidgetStreamParserResult,
  AgentWidgetRequestPayload,
  AgentWidgetCustomFetch,
  AgentWidgetSSEEventParser,
  AgentWidgetSSEEventResult,
  AgentWidgetHeadersFunction,
  // Multi-modal content types
  TextContentPart,
  ImageContentPart,
  ContentPart,
  MessageContent,
  // Attachment config type
  AgentWidgetAttachmentsConfig,
  AgentWidgetComposerConfig,
  // Layout types
  AgentWidgetLayoutConfig,
  AgentWidgetHeaderLayoutConfig,
  AgentWidgetMessageLayoutConfig,
  AgentWidgetAvatarConfig,
  AgentWidgetTimestampConfig,
  WidgetLayoutSlot,
  SlotRenderer,
  SlotRenderContext,
  HeaderRenderContext,
  MessageRenderContext,
  // Markdown types
  AgentWidgetMarkdownConfig,
  AgentWidgetMarkdownOptions,
  AgentWidgetMarkdownRendererOverrides,
  // Message actions types
  AgentWidgetMessageActionsConfig,
  AgentWidgetMessageFeedback,
  // Client token types
  ClientSession,
  ClientInitResponse,
  ClientChatRequest,
  ClientFeedbackRequest,
  ClientFeedbackType,
  // Message injection types
  InjectMessageOptions,
  InjectAssistantMessageOptions,
  InjectUserMessageOptions,
  InjectSystemMessageOptions,
  // Loading indicator types
  LoadingIndicatorRenderContext,
  AgentWidgetLoadingIndicatorConfig,
  // Idle indicator types
  IdleIndicatorRenderContext,
  // Agent execution types
  AgentConfig,
  AgentLoopConfig,
  AgentToolsConfig,
  AgentRequestOptions,
  AgentExecutionState,
  AgentMessageMetadata,
  AgentWidgetAgentRequestPayload,
  // Approval types
  AgentWidgetApproval,
  AgentWidgetApprovalConfig,
  // Event stream types
  SSEEventRecord,
  EventStreamConfig,
  EventStreamBadgeColor,
  EventStreamViewRenderContext,
  EventStreamRowRenderContext,
  EventStreamToolbarRenderContext,
  EventStreamPayloadRenderContext,
  // Controller event map
  AgentWidgetControllerEventMap
} from "./types";

export { initAgentWidgetFn as initAgentWidget };
export {
  createWidgetHostLayout,
  type WidgetHostLayout,
  type WidgetHostLayoutMode
} from "./runtime/host-layout";
export {
  createAgentExperience,
  type AgentWidgetController
} from "./ui";
export {
  AgentWidgetSession,
  type AgentWidgetSessionStatus
} from "./session";
export { AgentWidgetClient } from "./client";
export type { SSEEventCallback } from "./client";
export { createLocalStorageAdapter } from "./utils/storage";
export {
  createActionManager,
  defaultActionHandlers,
  defaultJsonActionParser
} from "./utils/actions";
export {
  markdownPostprocessor,
  escapeHtml,
  directivePostprocessor,
  createMarkdownProcessor,
  createMarkdownProcessorFromConfig,
  createDirectivePostprocessor
} from "./postprocessors";
export type { MarkdownProcessorOptions } from "./postprocessors";
export {
  createPlainTextParser,
  createJsonStreamParser,
  createFlexibleJsonStreamParser,
  createRegexJsonParser,
  createXmlParser
} from "./utils/formatting";
export {
  // Multi-modal content utilities
  normalizeContent,
  getDisplayText,
  hasImages,
  getImageParts,
  createTextPart,
  createImagePart,
  fileToImagePart,
  validateImageFile
} from "./utils/content";
export {
  collectEnrichedPageContext,
  formatEnrichedContext,
  generateStableSelector,
  defaultParseRules
} from "./utils/dom-context";
export type {
  EnrichedPageElement,
  DomContextOptions,
  DomContextMode,
  ParseOptionsConfig,
  ParseRule,
  RuleScoringContext,
  FormatEnrichedContextOptions
} from "./utils/dom-context";
export {
  AttachmentManager,
  type PendingAttachment,
  type AttachmentManagerConfig
} from "./utils/attachment-manager";
export {
  generateMessageId,
  generateUserMessageId,
  generateAssistantMessageId
} from "./utils/message-id";
export { isDockedMountMode, resolveDockConfig } from "./utils/dock";
export { generateCodeSnippet } from "./utils/code-generators";
export type { CodeFormat, CodeGeneratorHooks, CodeGeneratorOptions } from "./utils/code-generators";
export { VERSION } from "./version";
export type { AgentWidgetInitHandle };

// Plugin system exports
export type { AgentWidgetPlugin } from "./plugins/types";
export { pluginRegistry } from "./plugins/registry";

// Theme system exports
export {
  createTheme,
  resolveTokens,
  themeToCssVariables,
  applyThemeVariables,
  getActiveTheme,
  getColorScheme,
  detectColorScheme,
  createThemeObserver
} from "./utils/theme";
export {
  DEFAULT_PALETTE,
  DEFAULT_SEMANTIC,
  DEFAULT_COMPONENTS,
  validateTheme
} from "./utils/tokens";
export {
  accessibilityPlugin,
  animationsPlugin,
  brandPlugin,
  reducedMotionPlugin,
  highContrastPlugin,
  createPlugin
} from "./utils/plugins";
export {
  migrateV1Theme,
  validateV1Theme
} from "./utils/migration";
export type {
  PersonaTheme,
  PersonaThemePlugin,
  CreateThemeOptions,
  TokenReference,
  ColorShade,
  ColorPalette,
  SpacingScale,
  TypographyScale,
  ShadowScale,
  BorderScale,
  RadiusScale,
  SemanticColors,
  SemanticSpacing,
  SemanticTypography,
  ComponentTokens,
  ThemeValidationResult,
  ThemeValidationError
} from "./types/theme";

// Component system exports
export { componentRegistry } from "./components/registry";
export type { ComponentRenderer, ComponentContext } from "./components/registry";
export {
  createComponentStreamParser,
  isComponentDirectiveType
} from "./utils/component-parser";
export type { ComponentDirective } from "./utils/component-parser";
export {
  renderComponentDirective,
  createComponentMiddleware,
  hasComponentDirective,
  extractComponentDirectiveFromMessage
} from "./utils/component-middleware";

// Default configuration exports
export {
  DEFAULT_WIDGET_CONFIG,
  DEFAULT_LIGHT_THEME,
  DEFAULT_DARK_THEME,
  mergeWithDefaults
} from "./defaults";

// Layout system exports
export {
  buildHeader,
  buildComposer,
  attachHeaderToContainer
} from "./components/panel";
export type {
  HeaderElements,
  HeaderBuildContext,
  ComposerElements,
  ComposerBuildContext
} from "./components/panel";
export {
  headerLayouts,
  getHeaderLayout,
  buildHeaderWithLayout,
  buildDefaultHeader,
  buildMinimalHeader
} from "./components/header-layouts";
export type {
  HeaderLayoutContext,
  HeaderLayoutRenderer
} from "./components/header-layouts";
export {
  createStandardBubble,
  createBubbleWithLayout,
  createTypingIndicator,
  createMessageActions,
  renderLoadingIndicatorWithFallback
} from "./components/message-bubble";
export type {
  MessageTransform,
  MessageActionCallbacks,
  LoadingIndicatorRenderer,
  CreateStandardBubbleOptions
} from "./components/message-bubble";
export {
  createCSATFeedback,
  createNPSFeedback
} from "./components/feedback";
export type { CSATFeedbackOptions, NPSFeedbackOptions } from "./components/feedback";

// Voice module exports
export {
  createVoiceProvider,
  createBestAvailableVoiceProvider,
  isVoiceSupported
} from "./voice";
export type {
  VoiceProvider,
  VoiceResult,
  VoiceStatus,
  VoiceConfig
} from "./types";

export default initAgentWidgetFn;
