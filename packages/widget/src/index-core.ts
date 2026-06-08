import {
  initAgentWidget as initAgentWidgetFn,
  type AgentWidgetInitHandle
} from "./runtime/init";

export type {
  AgentWidgetConfig,
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
  // Context provider types (e.g. for config.contextProviders)
  AgentWidgetContextProvider,
  AgentWidgetContextProviderContext,
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
  InjectComponentDirectiveOptions,
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
  // WebMCP — page-discovered tool consumption
  AgentWidgetWebMcpConfig,
  ClientToolDefinition,
  WebMcpConfirmHandler,
  WebMcpConfirmInfo,
  WebMcpToolResult,
  // Event stream types
  SSEEventRecord,
  EventStreamConfig,
  EventStreamBadgeColor,
  EventStreamViewRenderContext,
  EventStreamRowRenderContext,
  EventStreamToolbarRenderContext,
  EventStreamPayloadRenderContext,
  // Controller event map
  AgentWidgetControllerEventMap,
  // Ask-user-question (built-in answer-pill sheet) types
  AskUserQuestionPayload,
  AskUserQuestionPrompt,
  AskUserQuestionOption,
  AgentWidgetAskUserQuestionFeature,
  AgentWidgetAskUserQuestionStyles
} from "./types";

export type {
  RuntypeAgentSSEEvent,
  RuntypeFlowSSEEvent,
  RuntypeDispatchSSEEvent,
  RuntypeStreamEventOf,
  RuntypeAgentTurnCompleteEvent,
  RuntypeStepCompleteEvent,
  RuntypeStopReasonKind,
  RuntypeClientInitRequest,
  RuntypeClientInitResponse,
  RuntypeClientChatRequest,
  RuntypeClientChatStreamEvent,
  RuntypeClientResumeRequest,
  RuntypeClientResumeStreamEvent,
  RuntypeClientFeedbackRequest,
  RuntypeClientFeedbackResponse,
  RuntypeClientFeedbackType,
} from "./generated/runtype-openapi-contract";

export {
  ASK_USER_QUESTION_TOOL_NAME,
  createAskUserQuestionBubble,
  ensureAskUserQuestionSheet,
  removeAskUserQuestionSheet,
  isAskUserQuestionMessage,
  parseAskUserQuestionPayload
} from "./components/ask-user-question-bubble";

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
export {
  WebMcpBridge,
  WEBMCP_TOOL_PREFIX,
  isWebMcpToolName,
  stripWebMcpPrefix
} from "./webmcp-bridge";
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
  createDefaultSanitizer,
  resolveSanitizer
} from "./utils/sanitize";
export type { SanitizeFunction } from "./utils/sanitize";
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
// NOTE: `generateCodeSnippet` (dev/config-tool helper) is intentionally NOT
// re-exported here so it stays out of the IIFE/CDN bundle (index-global.ts
// re-exports from this module). It is re-added to the npm barrel in `index.ts`.
export { VERSION } from "./version";
export type { AgentWidgetInitHandle };

// Plugin system exports
export type { AgentWidgetPlugin } from "./plugins/types";
export { pluginRegistry } from "./plugins/registry";

// Stream animation plugin API — lets consumers register custom animations
// that match the built-in surface (typewriter, pop-bubble) and subpath
// modules (letter-rise, word-fade, wipe, glyph-cycle).
export {
  registerStreamAnimationPlugin,
  unregisterStreamAnimationPlugin,
  listRegisteredStreamAnimations,
} from "./utils/stream-animation";
export type {
  StreamAnimationPlugin,
  StreamAnimationContext,
  AgentWidgetStreamAnimationBuffer,
  AgentWidgetStreamAnimationBuiltinType,
  AgentWidgetStreamAnimationType,
  AgentWidgetStreamAnimationFeature,
  AgentWidgetStreamAnimationPlaceholder,
} from "./types";

// Action system types — needed to type the `actionHandlers` / `actionParsers`
// config options and to author custom handlers/parsers.
export type {
  AgentWidgetActionHandler,
  AgentWidgetActionHandlerResult,
  AgentWidgetActionParser,
  AgentWidgetParsedAction,
  AgentWidgetActionContext,
  AgentWidgetActionEventPayload,
} from "./types";

// Dropdown utility exports
export { createDropdownMenu } from "./utils/dropdown";
export type { DropdownMenuItem, CreateDropdownOptions, DropdownMenuHandle } from "./utils/dropdown";

// Icon utility exports
export { renderLucideIcon } from "./utils/icons";
export type { IconName } from "./utils/icons";

// Button utility exports
export { createIconButton, createLabelButton, createToggleGroup, createComboButton } from "./utils/buttons";
export type {
  CreateIconButtonOptions,
  CreateLabelButtonOptions,
  CreateToggleGroupOptions,
  ToggleGroupItem,
  ToggleGroupHandle,
  CreateComboButtonOptions,
  ComboButtonHandle
} from "./utils/buttons";

// NOTE: `createDemoCarousel` (demo-only component) is intentionally NOT
// re-exported here so it stays out of the IIFE/CDN bundle. It is re-added to
// the npm barrel in `index.ts`.

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
  validateTheme,
  THEME_ZONES
} from "./utils/tokens";
export type { ThemeZone } from "./utils/tokens";
export {
  accessibilityPlugin,
  animationsPlugin,
  brandPlugin,
  reducedMotionPlugin,
  highContrastPlugin,
  createPlugin
} from "./utils/plugins";
export type {
  DeepPartial,
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
  ArtifactToolbarTokens,
  ArtifactTabTokens,
  ArtifactPaneTokens,
  IconButtonTokens,
  LabelButtonTokens,
  ToggleGroupTokens,
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
  DEFAULT_FLOATING_LAUNCHER_MAX_WIDTH,
  DEFAULT_FLOATING_LAUNCHER_WIDTH,
  mergeWithDefaults
} from "./defaults";
export {
  PRESETS,
  getPreset,
  PRESET_SHOP,
  PRESET_MINIMAL,
  PRESET_FULLSCREEN
} from "./presets";
export type { WidgetPreset } from "./presets";

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
