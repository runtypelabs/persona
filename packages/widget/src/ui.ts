import { escapeHtml, createMarkdownProcessorFromConfig } from "./postprocessors";
import { resolveSanitizer } from "./utils/sanitize";
import { stabilizeStreamingTables } from "./utils/streaming-table";
import { onMarkdownParsersReady, getMarkdownParsersSync } from "./markdown-parsers-loader";
import { AgentWidgetSession, AgentWidgetSessionStatus } from "./session";
import {
  AgentWidgetConfig,
  AgentWidgetApprovalDecisionOptions,
  AgentWidgetMessage,
  AgentWidgetEvent,
  AgentWidgetStorageAdapter,
  AgentWidgetStoredState,
  AgentWidgetControllerEventMap,
  AgentWidgetVoiceStateEvent,
  AgentWidgetStateEvent,
  AgentWidgetStateSnapshot,
  WidgetLayoutSlot,
  SlotRenderer,
  AgentWidgetMessageFeedback,
  ContentPart,
  InjectMessageOptions,
  InjectAssistantMessageOptions,
  InjectUserMessageOptions,
  InjectSystemMessageOptions,
  InjectComponentDirectiveOptions,
  LoadingIndicatorRenderContext,
  IdleIndicatorRenderContext,
  VoiceStatus,
  ReadAloudState,
  PersonaArtifactRecord,
  PersonaArtifactManualUpsert,
  PersonaArtifactFileMeta,
  PersonaArtifactActionContext
} from "./types";
import { AttachmentManager } from "./utils/attachment-manager";
import { createTextPart, ALL_SUPPORTED_MIME_TYPES } from "./utils/content";
import { applyThemeVariables, createThemeObserver, getActiveTheme } from "./utils/theme";
import { resolveTokenValue } from "./utils/tokens";
import { renderLucideIcon } from "./utils/icons";
import { createElement, createElementInDocument } from "./utils/dom";
import { downloadInfoFor } from "./utils/artifact-file";
import { artifactCopyText } from "./components/artifact-preview";
import { morphMessages } from "./utils/morph";
import { normalizeCopiedSelectionText } from "./utils/copy-selection";
import {
  navigateComposerHistory,
  INITIAL_HISTORY_STATE,
  type ComposerHistoryState
} from "./utils/composer-history";
import { computeMessageFingerprint, createMessageCache, getCachedWrapper, setCachedWrapper, pruneCache } from "./utils/message-fingerprint";
import {
  computeAnchorScrollState,
  computeShrunkSpacerHeight,
  createFollowStateController,
  getScrollBottomOffset,
  hasSelectionWithin,
  isElementNearBottom,
  resolveFollowStateFromScroll,
  resolveFollowStateFromWheel
} from "./utils/auto-follow";
import { statusCopy, DEFAULT_OVERLAY_Z_INDEX, PORTALED_OVERLAY_Z_INDEX } from "./utils/constants";
import {
  applyStreamBuffer,
  createSkeletonPlaceholder,
  createStreamCaret,
  detachAllPlugins,
  ensurePluginActive,
  resolveStreamAnimation,
  resolveStreamAnimationPlugin,
  wrapStreamAnimation,
} from "./utils/stream-animation";
import { syncOverlayHostStacking } from "./utils/overlay-host-stacking";
import { acquireScrollLock } from "./utils/scroll-lock";
import { isComposerBarMountMode, isDockedMountMode, resolveDockConfig } from "./utils/dock";
import { LauncherButton } from "./components/launcher";
import { buildHeader, buildComposer, attachHeaderToContainer } from "./components/panel";
import { createWidgetView, resolveLauncher } from "./components/widget-view";
import { HEADER_THEME_CSS } from "./components/header-builder";
import { buildHeaderWithLayout } from "./components/header-layouts";
import { positionMap } from "./utils/positioning";
import type { HeaderElements as _HeaderElements, ComposerElements as _ComposerElements } from "./components/panel";
import { MessageTransform, MessageActionCallbacks, LoadingIndicatorRenderer } from "./components/message-bubble";
import { createStandardBubble, createTypingIndicator } from "./components/message-bubble";
import { createReasoningBubble, reasoningExpansionState, updateReasoningBubbleUI } from "./components/reasoning-bubble";
import { createToolBubble, toolExpansionState, updateToolBubbleUI } from "./components/tool-bubble";
import {
  buildStructuredAnswers,
  ensureAskUserQuestionSheet,
  getCurrentIndex,
  getQuestionCount,
  getSelectedLabels,
  isAskUserQuestionMessage,
  isGroupedSheet,
  navigateToPage,
  parseAskUserQuestionPayload,
  readAnswersFromSheet,
  removeAskUserQuestionSheet,
  setCurrentAnswer,
} from "./components/ask-user-question-bubble";
import {
  isSuggestRepliesMessage,
  latestAgentSuggestions,
} from "./suggest-replies-tool";
import { formatElapsedMs } from "./utils/formatting";
import { approvalDetailsExpansionState, createApprovalBubble, updateApprovalDetailsUI } from "./components/approval-bubble";
import { createBuiltInApprovalPlugin } from "./components/approval-actions";
import { createSuggestions } from "./components/suggestions";
import { EventStreamBuffer } from "./utils/event-stream-buffer";
import { EventStreamStore } from "./utils/event-stream-store";
import { ThroughputTracker } from "./utils/throughput-tracker";
import { createEventStreamView } from "./components/event-stream-view";
import { createArtifactPane, type ArtifactPaneApi } from "./components/artifact-pane";
import { updateInlineArtifactBlocks } from "./components/artifact-inline";
import {
  artifactsSidebarEnabled,
  applyArtifactLayoutCssVars,
  applyArtifactPaneAppearance,
  shouldExpandLauncherForArtifacts
} from "./utils/artifact-gate";
import { resolveArtifactDisplayMode } from "./utils/artifact-display";
import { readFlexGapPx, resolveArtifactPaneWidthPx } from "./utils/artifact-resize";
import { enhanceWithForms } from "./components/forms";
import { pluginRegistry } from "./plugins/registry";
import { mergeWithDefaults, DEFAULT_FLOATING_LAUNCHER_WIDTH } from "./defaults";
import { createEventBus } from "./utils/events";
import {
  createActionManager,
  defaultActionHandlers,
  defaultJsonActionParser
} from "./utils/actions";
import { createLocalStorageAdapter } from "./utils/storage";
import { componentRegistry } from "./components/registry";
import {
  renderComponentDirective,
  extractComponentDirectiveFromMessage,
  hasComponentDirective
} from "./utils/component-middleware";
import {
  createCSATFeedback,
  createNPSFeedback,
  type CSATFeedbackOptions,
  type NPSFeedbackOptions
} from "./components/feedback";

// Default localStorage key for chat history (automatically cleared on clear chat)
const DEFAULT_CHAT_HISTORY_STORAGE_KEY = "persona-chat-history";
const VOICE_STATE_RESTORE_WINDOW = 30 * 1000;

const IMAGE_FILE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/tiff": "tiff"
};

function getClipboardImageFiles(clipboardData: DataTransfer | null): File[] {
  if (!clipboardData) return [];

  const imageFiles: File[] = [];
  const clipboardItems = Array.from(clipboardData.items ?? []);

  for (const item of clipboardItems) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (!file) continue;

    if (file.name) {
      imageFiles.push(file);
      continue;
    }

    const extension = IMAGE_FILE_EXTENSION_BY_MIME_TYPE[file.type] ?? "png";
    imageFiles.push(
      new File(
        [file],
        `clipboard-image-${Date.now()}.${extension}`,
        {
          type: file.type,
          lastModified: Date.now()
        }
      )
    );
  }

  if (imageFiles.length > 0) {
    return imageFiles;
  }

  for (const file of Array.from(clipboardData.files ?? [])) {
    if (file.type.startsWith("image/")) {
      imageFiles.push(file);
    }
  }

  return imageFiles;
}

function dataTransferHasFiles(
  dataTransfer: DataTransfer | null
): dataTransfer is DataTransfer {
  if (!dataTransfer) return false;
  const types = dataTransfer.types;
  if (!types) return false;
  // Real browsers return DOMStringList which has .contains(); test polyfills use plain arrays.
  if (typeof (types as unknown as { contains?: unknown }).contains === "function") {
    return (types as unknown as DOMStringList).contains("Files");
  }
  return Array.from(types).includes("Files");
}

// ============================================================================
// PERSIST STATE HELPERS
// ============================================================================

type NormalizedPersistConfig = {
  storage: 'local' | 'session';
  keyPrefix: string;
  persist: {
    openState: boolean;
    voiceState: boolean;
    focusInput: boolean;
  };
  clearOnChatClear: boolean;
};

/**
 * Normalize persistState config - handles both boolean and object forms
 */
function normalizePersistStateConfig(
  config: boolean | { storage?: 'local' | 'session'; keyPrefix?: string; persist?: { openState?: boolean; voiceState?: boolean; focusInput?: boolean }; clearOnChatClear?: boolean } | undefined
): NormalizedPersistConfig | null {
  if (!config) return null;
  
  if (config === true) {
    // Use defaults
    return {
      storage: 'session',
      keyPrefix: 'persona-',
      persist: {
        openState: true,
        voiceState: true,
        focusInput: true
      },
      clearOnChatClear: true
    };
  }
  
  // Object config - merge with defaults
  return {
    storage: config.storage ?? 'session',
    keyPrefix: config.keyPrefix ?? 'persona-',
    persist: {
      openState: config.persist?.openState ?? true,
      voiceState: config.persist?.voiceState ?? true,
      focusInput: config.persist?.focusInput ?? true
    },
    clearOnChatClear: config.clearOnChatClear ?? true
  };
}

/**
 * Get the storage object based on config
 */
function getPersistStorage(storageType: 'local' | 'session'): Storage | null {
  try {
    const storage = storageType === 'local' ? localStorage : sessionStorage;
    // Test that storage is actually available
    const testKey = '__persist_test__';
    storage.setItem(testKey, '1');
    storage.removeItem(testKey);
    return storage;
  } catch {
    return null;
  }
}

const ensureRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object") {
    return {};
  }
  return { ...(value as Record<string, unknown>) };
};

const stripStreamingFromMessages = (messages: AgentWidgetMessage[]) =>
  messages.map((message) => ({
    ...message,
    streaming: false
  }));

type Controller = {
  update: (config: AgentWidgetConfig) => void;
  destroy: () => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
  clearChat: () => void;
  setMessage: (message: string) => boolean;
  submitMessage: (message?: string) => boolean;
  /**
   * Manually retry a dropped durable stream (e.g. from a "Reconnect" button).
   * No-op unless a resumable durable turn dropped and `reconnectStream` is set.
   */
  reconnect: () => void;
  startVoiceRecognition: () => boolean;
  stopVoiceRecognition: () => boolean;
  /**
   * Inject a message into the conversation with dual-content support.
   * Auto-opens the widget if closed and launcher is enabled.
   */
  injectMessage: (options: InjectMessageOptions) => AgentWidgetMessage;
  /**
   * Convenience method for injecting assistant messages.
   */
  injectAssistantMessage: (options: InjectAssistantMessageOptions) => AgentWidgetMessage;
  /**
   * Convenience method for injecting user messages.
   */
  injectUserMessage: (options: InjectUserMessageOptions) => AgentWidgetMessage;
  /**
   * Convenience method for injecting system messages.
   */
  injectSystemMessage: (options: InjectSystemMessageOptions) => AgentWidgetMessage;
  /**
   * Inject multiple messages in a single batch with one sort and one render pass.
   */
  injectMessageBatch: (optionsList: InjectMessageOptions[]) => AgentWidgetMessage[];
  /**
   * Convenience method for injecting an assistant message that renders as a
   * registered component: same shape Persona produces from a streamed
   * `{ "text": "...", "component": "...", "props": {...} }` payload.
   */
  injectComponentDirective: (
    options: InjectComponentDirectiveOptions
  ) => AgentWidgetMessage;
  /**
   * @deprecated Use injectMessage() instead.
   */
  injectTestMessage: (event: AgentWidgetEvent) => void;
  getMessages: () => AgentWidgetMessage[];
  getStatus: () => AgentWidgetSessionStatus;
  getPersistentMetadata: () => Record<string, unknown>;
  updatePersistentMetadata: (
    updater: (prev: Record<string, unknown>) => Record<string, unknown>
  ) => void;
  on: <K extends keyof AgentWidgetControllerEventMap>(
    event: K,
    handler: (payload: AgentWidgetControllerEventMap[K]) => void
  ) => () => void;
  off: <K extends keyof AgentWidgetControllerEventMap>(
    event: K,
    handler: (payload: AgentWidgetControllerEventMap[K]) => void
  ) => void;
  // State query methods
  isOpen: () => boolean;
  isVoiceActive: () => boolean;
  // Read-aloud (text-to-speech) methods
  toggleReadAloud: (messageId: string) => void;
  stopReadAloud: () => void;
  getReadAloudState: (messageId: string) => ReadAloudState;
  onReadAloudChange: (
    listener: (activeId: string | null, state: ReadAloudState) => void
  ) => () => void;
  getState: () => AgentWidgetStateSnapshot;
  // Feedback methods (CSAT/NPS)
  showCSATFeedback: (options?: Partial<CSATFeedbackOptions>) => void;
  showNPSFeedback: (options?: Partial<NPSFeedbackOptions>) => void;
  submitCSATFeedback: (rating: number, comment?: string) => Promise<void>;
  submitNPSFeedback: (rating: number, comment?: string) => Promise<void>;
  /**
   * Connect an external SSE stream and process it through the SDK's
   * native event pipeline (tools, reasoning, streaming text, etc.).
   */
  connectStream: (
    stream: ReadableStream<Uint8Array>,
    options?: { assistantMessageId?: string }
  ) => Promise<void>;
  /** Push a raw event into the event stream buffer (for testing/debugging) */
  __pushEventStreamEvent: (event: { type: string; payload: unknown }) => void;
  /** Opens the event stream panel */
  showEventStream: () => void;
  /** Closes the event stream panel */
  hideEventStream: () => void;
  /** Returns current visibility state of the event stream panel */
  isEventStreamVisible: () => boolean;
  /** Show artifact sidebar (no-op if features.artifacts.enabled is false) */
  showArtifacts: () => void;
  /** Hide artifact sidebar */
  hideArtifacts: () => void;
  /** Upsert an artifact programmatically */
  upsertArtifact: (manual: PersonaArtifactManualUpsert) => PersonaArtifactRecord | null;
  selectArtifact: (id: string) => void;
  clearArtifacts: () => void;
  /** Read current artifacts (useful on init to rebuild host-side tab state after hydration). */
  getArtifacts: () => PersonaArtifactRecord[];
  /** Read the currently selected artifact id (paired with `getArtifacts`). */
  getSelectedArtifactId: () => string | null;
  /**
   * Focus the chat input. Returns true if focus succeeded, false if panel is closed
   * (launcher mode) or textarea is unavailable.
   */
  focusInput: () => boolean;
  /**
   * Programmatically resolve a pending approval.
   * @param approvalId - The approval ID to resolve
   * @param decision - "approved" or "denied"
   * @param options - Optional decision context (e.g. `{ remember: true }`),
   *   forwarded to `config.approval.onDecision`.
   */
  resolveApproval: (
    approvalId: string,
    decision: 'approved' | 'denied',
    options?: AgentWidgetApprovalDecisionOptions
  ) => Promise<void>;
};

export const buildPostprocessor = (
  cfg: AgentWidgetConfig | undefined,
  actionManager?: ReturnType<typeof createActionManager>,
  onResubmitRequested?: () => void
): MessageTransform => {
  // Create markdown processor from config if markdown config is provided
  // This allows users to enable markdown rendering via config.markdown
  const markdownProcessor = cfg?.markdown
    ? createMarkdownProcessorFromConfig(cfg.markdown)
    : null;

  // Resolve sanitizer: enabled by default, can be disabled or replaced
  const sanitize = resolveSanitizer(cfg?.sanitize);

  // Warn developers when a custom postprocessor is used with the default sanitizer,
  // since DOMPurify will strip any tags/attributes not in the allowlist.
  if (cfg?.postprocessMessage && sanitize && cfg?.sanitize === undefined) {
    console.warn(
      "[Persona] A custom postprocessMessage is active with the default HTML sanitizer. " +
      "Tags or attributes not in the built-in allowlist will be stripped. " +
      "To keep custom HTML, set `sanitize: false` or provide a custom sanitize function."
    );
  }

  return (context) => {
    let nextText = context.text ?? "";
    const rawPayload = context.message.rawContent ?? null;

    if (actionManager) {
      const actionResult = actionManager.process({
        text: nextText,
        raw: rawPayload ?? nextText,
        message: context.message,
        streaming: context.streaming
      });
      if (actionResult !== null) {
        nextText = actionResult.text;
        // Mark message as non-persistable if persist is false
        if (!actionResult.persist) {
          (context.message as any).__skipPersist = true;
        }
        // Request deferred resubmit if handler requested it (and message is complete)
        // The actual resubmit will be triggered when injectAssistantMessage is called
        if (actionResult.resubmit && !context.streaming && onResubmitRequested) {
          onResubmitRequested();
        }
      }
    }

    // Priority: postprocessMessage > markdown config > escapeHtml.
    //
    // Degraded path (IIFE/CDN build before `markdown-parsers.js` resolves, or if
    // it never loads): the markdown processor and the sanitizer BOTH fall back to
    // escapeHtml, so the old `sanitize(markdownProcessor(text))` escaped twice and
    // displayed entities literally (I'll -> &amp;#39;). Only run the sanitizer when
    // it can actually parse HTML; escapeHtml output is already inert. Checked per
    // render (not once at setup): the chunk lands later and the self-heal re-renders.
    const parsersReady = getMarkdownParsersSync() !== null;
    let html: string;
    if (cfg?.postprocessMessage) {
      const out = cfg.postprocessMessage({
        ...context,
        text: nextText,
        raw: rawPayload ?? context.text ?? ""
      });
      // Custom HTML is NOT pre-escaped, so this stays a single pass even via the
      // sanitizer's degraded fallback. Honors `sanitize: false` (pass-through) as before.
      html = sanitize ? sanitize(out) : out;
    } else if (markdownProcessor) {
      // While streaming, normalize tables-in-progress so they render as a real
      // <table> from the first row with a stable column count (Telegram-style
      // space reservation). The final, non-streaming render is left untouched.
      const source = context.streaming ? stabilizeStreamingTables(nextText) : nextText;
      // Already escapeHtml(text) (single, safe) while parsers are not loaded.
      const out = markdownProcessor(source);
      html = sanitize && parsersReady ? sanitize(out) : out;
    } else {
      // Plain text: escapeHtml output is inert — never re-sanitize (the second escape).
      html = escapeHtml(nextText);
    }

    return html;
  };
};

function buildDropOverlay(
  dropCfg?: NonNullable<AgentWidgetConfig["attachments"]>["dropOverlay"]
): HTMLElement {
  const overlay = createElement("div", "persona-attachment-drop-overlay");
  if (dropCfg?.background) overlay.style.setProperty("--persona-drop-overlay-bg", dropCfg.background);
  if (dropCfg?.backdropBlur !== undefined) overlay.style.setProperty("--persona-drop-overlay-blur", dropCfg.backdropBlur);
  if (dropCfg?.border) overlay.style.setProperty("--persona-drop-overlay-border", dropCfg.border);
  if (dropCfg?.borderRadius) overlay.style.setProperty("--persona-drop-overlay-radius", dropCfg.borderRadius);
  if (dropCfg?.inset) overlay.style.setProperty("--persona-drop-overlay-inset", dropCfg.inset);
  if (dropCfg?.labelSize) overlay.style.setProperty("--persona-drop-overlay-label-size", dropCfg.labelSize);
  if (dropCfg?.labelColor) overlay.style.setProperty("--persona-drop-overlay-label-color", dropCfg.labelColor);

  const iconName = dropCfg?.iconName ?? "upload";
  const iconSize = dropCfg?.iconSize ?? "48px";
  const iconColor = dropCfg?.iconColor ?? "rgba(59, 130, 246, 0.6)";
  const iconStrokeWidth = dropCfg?.iconStrokeWidth ?? 0.5;
  const iconSvg = renderLucideIcon(iconName, iconSize, iconColor, iconStrokeWidth);
  if (iconSvg) overlay.appendChild(iconSvg);

  if (dropCfg?.label) {
    const labelEl = createElement("span", "persona-drop-overlay-label");
    labelEl.textContent = dropCfg.label;
    overlay.appendChild(labelEl);
  }
  return overlay;
}

export const createAgentExperience = (
  mount: HTMLElement,
  initialConfig?: AgentWidgetConfig,
  runtimeOptions?: { debugTools?: boolean }
): Controller => {
  if (mount == null) {
    throw new Error(
      "createAgentExperience: mount must be a non-null HTMLElement (e.g. pass document.getElementById(\"my-root\") after the node exists)."
    );
  }
  // Preserve original mount id as data attribute for window event instance scoping
  if (mount.id && !mount.getAttribute("data-persona-instance")) {
    mount.setAttribute("data-persona-instance", mount.id);
  }
  // Ensure root marker is present for Tailwind scoping and DOM traversal
  if (!mount.hasAttribute("data-persona-root")) {
    mount.setAttribute("data-persona-root", "true");
  }

  let config = mergeWithDefaults(initialConfig) as AgentWidgetConfig;
  // Note: applyThemeVariables is called after applyFullHeightStyles() below
  // because applyFullHeightStyles resets mount.style.cssText

  // Get plugins for this instance
  const plugins = pluginRegistry.getForInstance(config.plugins);

  // The built-in approval renderer, shaped as a plugin. Resolved as a FALLBACK
  // (not pushed into `plugins`) so a user `renderApproval` plugin always wins
  // and a later config-update plugin push can't reorder ahead of it.
  const { plugin: builtInApprovalPlugin, teardown: teardownBuiltInApprovals } =
    createBuiltInApprovalPlugin();

  // Register components from config
  if (config.components) {
    componentRegistry.registerAll(config.components);
  }
  const eventBus = createEventBus<AgentWidgetControllerEventMap>();

  // When persistState is explicitly false, message-history persistence is
  // disabled: including any user-supplied storageAdapter. This is the strict
  // kill-switch semantic; pass `persistState: true` (or omit it) to opt in.
  const messagePersistenceDisabled = config.persistState === false;
  const storageAdapter: AgentWidgetStorageAdapter | null =
    messagePersistenceDisabled
      ? null
      : (config.storageAdapter ?? createLocalStorageAdapter());
  let persistentMetadata: Record<string, unknown> = {};
  let pendingStoredState: Promise<AgentWidgetStoredState | null> | null = null;

  let shouldOpenAfterStateLoaded = false;

  // Helper to apply onStateLoaded hook and extract state.
  // Supports both the legacy plain-state return and the new { state, open? } return.
  const applyStateLoadedHook = (state: AgentWidgetStoredState): AgentWidgetStoredState => {
    if (config.onStateLoaded) {
      try {
        const result = config.onStateLoaded(state);
        if (result && typeof result === 'object' && 'state' in result) {
          const { state: processedState, open } = result as { state: AgentWidgetStoredState; open?: boolean };
          if (open) shouldOpenAfterStateLoaded = true;
          return processedState;
        }
        return result as AgentWidgetStoredState;
      } catch (error) {
        if (typeof console !== "undefined") {
          // eslint-disable-next-line no-console
          console.error("[AgentWidget] onStateLoaded hook failed:", error);
        }
      }
    }
    return state;
  };

  if (storageAdapter?.load) {
    try {
      const storedState = storageAdapter.load();
      if (storedState && typeof (storedState as Promise<any>).then === "function") {
        // For async storage, apply hook when promise resolves
        pendingStoredState = (storedState as Promise<AgentWidgetStoredState | null>).then(
          (resolved) => {
            const state = resolved ?? { messages: [], metadata: {} };
            return applyStateLoadedHook(state);
          }
        );
      } else {
        // Apply hook to synchronously loaded state (or empty state if nothing stored)
        const baseState = (storedState as AgentWidgetStoredState) ?? { messages: [], metadata: {} };
        const processedState = applyStateLoadedHook(baseState);
        if (processedState.metadata) {
          persistentMetadata = ensureRecord(processedState.metadata);
        }
        if (processedState.messages?.length) {
          config = { ...config, initialMessages: processedState.messages };
        }
        if (processedState.artifacts?.length) {
          config = {
            ...config,
            initialArtifacts: processedState.artifacts,
            initialSelectedArtifactId: processedState.selectedArtifactId ?? null
          };
        }
      }
    } catch (error) {
      if (typeof console !== "undefined") {
        // eslint-disable-next-line no-console
        console.error("[AgentWidget] Failed to load stored state:", error);
      }
    }
  } else if (config.onStateLoaded) {
    // No storage adapter but hook exists - call with empty state
    try {
      const processedState = applyStateLoadedHook({ messages: [], metadata: {} });
      if (processedState.messages?.length) {
        config = { ...config, initialMessages: processedState.messages };
      }
    } catch (error) {
      if (typeof console !== "undefined") {
        // eslint-disable-next-line no-console
        console.error("[AgentWidget] onStateLoaded hook failed:", error);
      }
    }
  }

  const getSessionMetadata = () => persistentMetadata;
  const updateSessionMetadata = (
    updater: (prev: Record<string, unknown>) => Record<string, unknown>
  ) => {
    const next = updater({ ...persistentMetadata }) ?? {};
    persistentMetadata = next;
    persistState();
  };

  const resolvedActionParsers =
    config.actionParsers && config.actionParsers.length
      ? config.actionParsers
      : [defaultJsonActionParser];

  const resolvedActionHandlers =
    config.actionHandlers && config.actionHandlers.length
      ? config.actionHandlers
      : [defaultActionHandlers.message, defaultActionHandlers.messageAndClick];

  let actionManager = createActionManager({
    parsers: resolvedActionParsers,
    handlers: resolvedActionHandlers,
    getSessionMetadata,
    updateSessionMetadata,
    emit: eventBus.emit,
    documentRef: typeof document !== "undefined" ? document : null
  });
  actionManager.syncFromMetadata();

  let launcherEnabled = config.launcher?.enabled ?? true;
  let autoExpand = config.launcher?.autoExpand ?? false;
  const autoFocusInput = config.autoFocusInput ?? false;
  let prevAutoExpand = autoExpand;
  let prevLauncherEnabled = launcherEnabled;
  let prevHeaderLayout = config.layout?.header?.layout;
  let wasMobileFullscreen = false;
  // Composer-bar mode behaves like a launcher-enabled panel for state/toggle
  // purposes (open/close maps to expand/collapse) but does not render a
  // launcher button. `isPanelToggleable()` covers both modes; checks that
  // gate the launcher button itself stay on the raw `launcherEnabled` flag.
  const isComposerBar = () => isComposerBarMountMode(config);
  const isPanelToggleable = () => launcherEnabled || isComposerBar();
  // Composer-bar starts collapsed (open=false). Inline embed (no launcher)
  // is always open. Launcher mode honors `autoExpand`.
  let open = isComposerBar() ? false : (launcherEnabled ? autoExpand : true);

  // Track pending resubmit state for injection-triggered resubmit
  // When a handler returns resubmit: true, we wait for injectAssistantMessage()
  // to be called before triggering the actual resubmit (to avoid race conditions)
  let pendingResubmit = false;
  let pendingResubmitTimeout: ReturnType<typeof setTimeout> | null = null;

  const handleResubmitRequested = () => {
    pendingResubmit = true;
    // Clear any existing timeout
    if (pendingResubmitTimeout) {
      clearTimeout(pendingResubmitTimeout);
    }
    // Safety timeout - clear flag after 10s if no injection occurs
    pendingResubmitTimeout = setTimeout(() => {
      if (pendingResubmit) {
        if (typeof console !== "undefined") {
          // eslint-disable-next-line no-console
          console.warn("[AgentWidget] Resubmit requested but no injection occurred within 10s");
        }
        pendingResubmit = false;
      }
    }, 10000);
  };

  let postprocess = buildPostprocessor(config, actionManager, handleResubmitRequested);
  let showReasoning = config.features?.showReasoning ?? true;
  let showToolCalls = config.features?.showToolCalls ?? true;
  let showEventStreamToggle = config.features?.showEventStreamToggle ?? false;
  let scrollToBottomFeature = config.features?.scrollToBottom ?? {};
  let scrollBehaviorFeature = config.features?.scrollBehavior ?? {};
  const persistKeyPrefix = (typeof config.persistState === 'object' ? config.persistState?.keyPrefix : undefined) ?? "persona-";
  const eventStreamDbName = `${persistKeyPrefix}event-stream`;
  let eventStreamStore = showEventStreamToggle ? new EventStreamStore(eventStreamDbName) : null;
  const eventStreamMaxEvents = config.features?.eventStream?.maxEvents ?? 2000;
  let eventStreamBuffer = showEventStreamToggle ? new EventStreamBuffer(eventStreamMaxEvents, eventStreamStore) : null;
  // Passive output-throughput tracker, fed from the same SSE tap as the buffer.
  let throughputTracker = showEventStreamToggle ? new ThroughputTracker() : null;
  let eventStreamView: ReturnType<typeof createEventStreamView> | null = null;
  let eventStreamVisible = false;
  let eventStreamRAF: number | null = null;
  let eventStreamLastUpdate = 0;

  // Open IndexedDB store and restore persisted events into the buffer
  eventStreamStore?.open().then(() => {
    return eventStreamBuffer?.restore();
  }).catch(err => {
    if (config.debug) console.warn('[AgentWidget] IndexedDB not available for event stream:', err);
  });

  // Create message action callbacks that emit events and optionally send to API
  const messageActionCallbacks: MessageActionCallbacks = {
    onCopy: (message: AgentWidgetMessage) => {
      eventBus.emit("message:copy", message);
      // Send copy feedback to API if in client token mode
      if (session?.isClientTokenMode()) {
        session.submitMessageFeedback(message.id, 'copy').catch((error) => {
          if (config.debug) {
            // eslint-disable-next-line no-console
            console.error("[AgentWidget] Failed to submit copy feedback:", error);
          }
        });
      }
      // Call user-provided callback
      config.messageActions?.onCopy?.(message);
    },
    onFeedback: (feedback: AgentWidgetMessageFeedback) => {
      eventBus.emit("message:feedback", feedback);
      // Send feedback to API if in client token mode
      if (session?.isClientTokenMode()) {
        session.submitMessageFeedback(feedback.messageId, feedback.type).catch((error) => {
          if (config.debug) {
            // eslint-disable-next-line no-console
            console.error("[AgentWidget] Failed to submit feedback:", error);
          }
        });
      }
      // Call user-provided callback
      config.messageActions?.onFeedback?.(feedback);
    }
  };
  
  // Get status indicator config
  const statusConfig = config.statusIndicator ?? {};
  const _getStatusText = (status: AgentWidgetSessionStatus): string => {
    if (status === "idle") return statusConfig.idleText ?? statusCopy.idle;
    if (status === "connecting") return statusConfig.connectingText ?? statusCopy.connecting;
    if (status === "connected") return statusConfig.connectedText ?? statusCopy.connected;
    if (status === "error") return statusConfig.errorText ?? statusCopy.error;
    if (status === "paused") return statusConfig.pausedText ?? statusCopy.paused;
    if (status === "resuming") return statusConfig.resumingText ?? statusCopy.resuming;
    return statusCopy[status];
  };

  /** Update statusText element, rendering a link for idle status when idleLink is configured. */
  function applyStatusToElement(el: HTMLElement, text: string, statusCfg: typeof statusConfig, status: string): void {
    if (status === "idle" && statusCfg.idleLink) {
      el.textContent = "";
      const link = document.createElement("a");
      link.href = statusCfg.idleLink;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = text;
      link.style.color = "inherit";
      link.style.textDecoration = "none";
      el.appendChild(link);
    } else {
      el.textContent = text;
    }
  }

  // The view layer (`components/widget-view.ts`) owns the one-time structural
  // assembly (shell + panel) and groups the resulting refs into named regions.
  // Behavior stays here in ui.ts; the locals below mirror the grouped refs so
  // the surrounding orchestration code keeps its existing variable names.
  const view = createWidgetView({ config, showClose: isPanelToggleable() });
  const { wrapper, panel, pillRoot } = view.shell;
  const panelElements = view.panelElements;
  let {
    container,
    body,
    messagesWrapper,
    suggestions,
    textarea,
    sendButton,
    sendButtonWrapper,
    composerForm,
    statusText,
    introTitle,
    introSubtitle,
    closeButton,
    iconHolder,
    headerTitle,
    headerSubtitle,
    header,
    footer,
    actionsRow: _actionsRow,
    leftActions,
    rightActions
  } = panelElements;
  let setSendButtonMode = panelElements.setSendButtonMode;

  // Use mutable references for mic button so we can update them dynamically
  let micButton: HTMLButtonElement | null = panelElements.micButton;
  let micButtonWrapper: HTMLElement | null = panelElements.micButtonWrapper;

  // Use mutable references for attachment elements so we can create them dynamically
  let attachmentButton: HTMLButtonElement | null = panelElements.attachmentButton;
  let attachmentButtonWrapper: HTMLElement | null = panelElements.attachmentButtonWrapper;
  let attachmentInput: HTMLInputElement | null = panelElements.attachmentInput;
  let attachmentPreviewsContainer: HTMLElement | null = panelElements.attachmentPreviewsContainer;
  container.classList.add("persona-relative");
  body.classList.add("persona-relative");
  const SCROLL_TO_BOTTOM_EDGE_OFFSET = 12;

  const getScrollToBottomLabel = () => scrollToBottomFeature.label ?? "";
  const getScrollToBottomIconName = () => scrollToBottomFeature.iconName ?? "arrow-down";
  const isScrollToBottomEnabled = () => scrollToBottomFeature.enabled !== false;
  // Default is "anchor-top" (see DEFAULT_WIDGET_CONFIG). This `??` only applies
  // when a partial config sets `scrollBehavior.mode` to undefined explicitly;
  // it must agree with the declared default.
  const getScrollMode = () => scrollBehaviorFeature.mode ?? "anchor-top";
  // "Effectively following the bottom" for streaming auto-scroll: true in
  // follow mode, and in anchor-top when the current turn has no anchor (the
  // no-anchor fallback). Drives `scheduleAutoScroll`, `handleContentResize`,
  // and `isAwayFromLatest` so a no-anchor anchor-top turn behaves like follow.
  const isFollowEffective = () =>
    getScrollMode() === "follow" ||
    (getScrollMode() === "anchor-top" && followFallbackActive);
  const getAnchorTopOffset = () => scrollBehaviorFeature.anchorTopOffset ?? 16;
  const getScrollRestorePosition = () =>
    scrollBehaviorFeature.restorePosition ?? "bottom";
  const isPauseOnInteractionEnabled = () =>
    scrollBehaviorFeature.pauseOnInteraction === true;
  // Defaults on alongside the anchor-top default so the pinned-turn UX keeps the
  // unread count + "streaming below" hint; opt out with `false`.
  const isActivityWhilePinnedEnabled = () =>
    scrollBehaviorFeature.showActivityWhilePinned !== false;
  const isAnnounceEnabled = () => scrollBehaviorFeature.announce === true;
  const scrollToBottomButton = createElement(
    "button",
    "persona-scroll-to-bottom-indicator persona-absolute persona-bottom-3 persona-left-1/2 persona-z-10 persona-flex persona-items-center persona-gap-1 persona-text-xs persona-transform persona--translate-x-1/2 persona-cursor-pointer"
  ) as HTMLButtonElement;
  scrollToBottomButton.type = "button";
  scrollToBottomButton.style.display = "none";
  scrollToBottomButton.setAttribute("data-persona-scroll-to-bottom", "true");
  const scrollToBottomIcon = createElement("span", "persona-flex persona-items-center");
  const scrollToBottomLabel = createElement("span", "");
  // Count of messages that arrived while auto-follow was paused (or, in
  // non-follow scroll modes, while the user was away from the bottom).
  // Rendered as a small badge on the scroll-to-bottom affordance, mirroring
  // the event stream view's "Jump to latest (N)" indicator.
  const scrollToBottomCount = createElement("span", "");
  scrollToBottomCount.setAttribute("data-persona-scroll-to-bottom-count", "");
  scrollToBottomCount.style.display = "none";
  scrollToBottomButton.append(scrollToBottomIcon, scrollToBottomLabel, scrollToBottomCount);
  container.appendChild(scrollToBottomButton);

  // Anchor-top scroll mode: zero-height spacer kept after the messages
  // wrapper. Sized on send so the just-sent user message can be scrolled to
  // the top of the viewport before the streamed response is tall enough to
  // make that position reachable; shrinks as real content fills the space.
  const anchorSpacer = createElement("div", "persona-stream-anchor-spacer");
  anchorSpacer.setAttribute("aria-hidden", "true");
  anchorSpacer.setAttribute("data-persona-anchor-spacer", "");
  anchorSpacer.style.flexShrink = "0";
  anchorSpacer.style.pointerEvents = "none";
  anchorSpacer.style.height = "0px";
  body.appendChild(anchorSpacer);

  // Visually-hidden polite live region for screen-reader announcements
  // (Principle 15: announce important events at a comfortable pace, never
  // token-by-token). Created unconditionally but only written to when
  // `features.scrollBehavior.announce` is opted in.
  const liveRegion = createElement("div", "persona-sr-only");
  liveRegion.setAttribute("aria-live", "polite");
  liveRegion.setAttribute("aria-atomic", "true");
  liveRegion.setAttribute("role", "status");
  liveRegion.setAttribute("data-persona-live-region", "");
  Object.assign(liveRegion.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    margin: "-1px",
    padding: "0",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    border: "0",
  } satisfies Partial<CSSStyleDeclaration>);
  container.appendChild(liveRegion);
  // Debounce announcements so a fast event sequence (e.g. several messages
  // landing while away) collapses into one calm spoken update.
  let announceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingAnnouncement: string | null = null;
  const announce = (message: string) => {
    if (!isAnnounceEnabled() || !message) return;
    pendingAnnouncement = message;
    if (announceTimer !== null) return;
    announceTimer = setTimeout(() => {
      announceTimer = null;
      // Re-check: `update()` may have disabled `announce` within the debounce
      // window, and a stale message must not slip through to the live region.
      if (pendingAnnouncement && isAnnounceEnabled()) {
        liveRegion.textContent = pendingAnnouncement;
      }
      pendingAnnouncement = null;
    }, 400);
  };

  const updateScrollToBottomButtonOffset = () => {
    const footerHidden = footer.style.display === "none";
    const footerHeight = footerHidden ? 0 : footer.offsetHeight;
    scrollToBottomButton.style.bottom = `${footerHeight + SCROLL_TO_BOTTOM_EDGE_OFFSET}px`;
  };
  updateScrollToBottomButtonOffset();

  const renderScrollToBottomButton = () => {
    const hasLabel = Boolean(getScrollToBottomLabel());
    scrollToBottomButton.setAttribute("aria-label", getScrollToBottomLabel() || "Jump to latest");
    scrollToBottomButton.title = getScrollToBottomLabel();
    scrollToBottomButton.setAttribute("data-persona-scroll-to-bottom-has-label", hasLabel ? "true" : "false");
    scrollToBottomIcon.innerHTML = "";
    const icon = renderLucideIcon(getScrollToBottomIconName(), "14px", "currentColor", 2);
    if (icon) {
      scrollToBottomIcon.appendChild(icon);
      scrollToBottomIcon.style.display = "";
    } else {
      scrollToBottomIcon.style.display = "none";
    }
    scrollToBottomLabel.textContent = getScrollToBottomLabel();
    scrollToBottomLabel.style.display = hasLabel ? "" : "none";
  };
  renderScrollToBottomButton();

  // Initialized after composer plugins rebind footer DOM (see `bindComposerRefsFromFooter`)
  let attachmentManager: AttachmentManager | null = null;

  /** Wired after `handleMicButtonClick` is defined; used by `renderComposer` `onVoiceToggle`. */
  let composerVoiceBridge: (() => void) | null = null;

  // Plugin hook: renderHeader - allow plugins to provide custom header
  const headerPlugin = plugins.find(p => p.renderHeader);
  if (headerPlugin?.renderHeader) {
    const customHeader = headerPlugin.renderHeader({
      config,
      defaultRenderer: () => {
        const headerElements = buildHeader({ config, showClose: isPanelToggleable() });
        attachHeaderToContainer(container, headerElements, config);
        return headerElements.header;
      },
      onClose: () => setOpenState(false, "user")
    });
    if (customHeader) {
      // Replace the default header with custom header
      const existingHeader = container.querySelector('.persona-border-b-persona-divider');
      if (existingHeader) {
        existingHeader.replaceWith(customHeader);
        header = customHeader;
        // Keep the view's tracked header element in sync so a later
        // header-layout rebuild (view.replaceHeader) targets the mounted node.
        view.header.element = customHeader;
      }
    }
  }

  // Event stream toggle functions (lifted to outer scope for controller access)
  const toggleEventStreamOn = () => {
    if (!eventStreamBuffer) return;
    eventStreamVisible = true;
    if (!eventStreamView && eventStreamBuffer) {
      eventStreamView = createEventStreamView({
        buffer: eventStreamBuffer,
        getFullHistory: () => eventStreamBuffer!.getAllFromStore(),
        onClose: () => toggleEventStreamOff(),
        config,
        plugins,
        getThroughput: () =>
          throughputTracker?.getMetric() ?? { status: "idle" },
      });
    }
    if (eventStreamView) {
      body.style.display = "none";
      footer.parentNode?.insertBefore(eventStreamView.element, footer);
      eventStreamView.update();
    }
    if (eventStreamToggleBtn) {
      eventStreamToggleBtn.style.boxShadow = `inset 0 0 0 1.5px ${HEADER_THEME_CSS.actionIconColor}`;
      const activeClasses = config.features?.eventStream?.classNames?.toggleButtonActive;
      if (activeClasses) activeClasses.split(/\s+/).forEach(c => c && eventStreamToggleBtn!.classList.add(c));
    }
    // Start RAF-based update loop (throttled to ~200ms)
    const rafLoop = () => {
      if (!eventStreamVisible) return;
      const now = Date.now();
      if (now - eventStreamLastUpdate >= 200) {
        eventStreamView?.update();
        eventStreamLastUpdate = now;
      }
      eventStreamRAF = requestAnimationFrame(rafLoop);
    };
    eventStreamLastUpdate = 0;
    eventStreamRAF = requestAnimationFrame(rafLoop);
    syncScrollToBottomButton();
    eventBus.emit("eventStream:opened", { timestamp: Date.now() });
  };

  const toggleEventStreamOff = () => {
    if (!eventStreamVisible) return;
    eventStreamVisible = false;
    if (eventStreamView) {
      eventStreamView.element.remove();
    }
    body.style.display = "";
    if (eventStreamToggleBtn) {
      eventStreamToggleBtn.style.boxShadow = "";
      const activeClasses = config.features?.eventStream?.classNames?.toggleButtonActive;
      if (activeClasses) activeClasses.split(/\s+/).forEach(c => c && eventStreamToggleBtn!.classList.remove(c));
    }
    // Cancel RAF update loop
    if (eventStreamRAF !== null) {
      cancelAnimationFrame(eventStreamRAF);
      eventStreamRAF = null;
    }
    syncScrollToBottomButton();
    eventBus.emit("eventStream:closed", { timestamp: Date.now() });
  };

  // Event stream toggle button
  let eventStreamToggleBtn: HTMLButtonElement | null = null;
  if (showEventStreamToggle) {
    const esClassNames = config.features?.eventStream?.classNames;
    const toggleBtnClasses = "persona-inline-flex persona-items-center persona-justify-center persona-rounded-full hover:persona-opacity-80 persona-cursor-pointer persona-border-none persona-bg-transparent persona-p-1" + (esClassNames?.toggleButton ? " " + esClassNames.toggleButton : "");
    eventStreamToggleBtn = createElement("button", toggleBtnClasses) as HTMLButtonElement;
    eventStreamToggleBtn.style.width = "28px";
    eventStreamToggleBtn.style.height = "28px";
    eventStreamToggleBtn.style.color = HEADER_THEME_CSS.actionIconColor;
    eventStreamToggleBtn.type = "button";
    eventStreamToggleBtn.setAttribute("aria-label", "Event Stream");
    eventStreamToggleBtn.title = "Event Stream";
    const activityIcon = renderLucideIcon("activity", "18px", "currentColor", 1.5);
    if (activityIcon) eventStreamToggleBtn.appendChild(activityIcon);

    // Insert before clear chat button wrapper or close button wrapper
    const clearChatWrapper = panelElements.clearChatButtonWrapper;
    const closeWrapper = panelElements.closeButtonWrapper;
    const insertBefore = clearChatWrapper || closeWrapper;
    if (insertBefore && insertBefore.parentNode === header) {
      header.insertBefore(eventStreamToggleBtn, insertBefore);
    } else {
      header.appendChild(eventStreamToggleBtn);
    }

    eventStreamToggleBtn.addEventListener("click", () => {
      if (eventStreamVisible) {
        toggleEventStreamOff();
      } else {
        toggleEventStreamOn();
      }
    });
  }

  const ensureComposerAttachmentSurface = (rootFooter: HTMLElement) => {
    const att = config.attachments;
    if (!att?.enabled) return;
    let previews =
      rootFooter.querySelector<HTMLElement>("[data-persona-composer-attachment-previews]") ??
      rootFooter.querySelector<HTMLElement>(".persona-attachment-previews");
    if (!previews) {
      previews = createElement(
        "div",
        "persona-attachment-previews persona-flex persona-flex-wrap persona-gap-2 persona-mb-2"
      );
      previews.setAttribute("data-persona-composer-attachment-previews", "");
      previews.style.display = "none";
      const form = rootFooter.querySelector("[data-persona-composer-form]");
      if (form?.parentNode) {
        form.parentNode.insertBefore(previews, form);
      } else {
        rootFooter.insertBefore(previews, rootFooter.firstChild);
      }
    }
    const hasFileInput =
      rootFooter.querySelector<HTMLInputElement>("[data-persona-composer-attachment-input]") ??
      rootFooter.querySelector<HTMLInputElement>('input[type="file"]');
    if (!hasFileInput) {
      const fileIn = createElement("input") as HTMLInputElement;
      fileIn.type = "file";
      fileIn.setAttribute("data-persona-composer-attachment-input", "");
      fileIn.accept = (att.allowedTypes ?? ALL_SUPPORTED_MIME_TYPES).join(",");
      fileIn.multiple = (att.maxFiles ?? 4) > 1;
      fileIn.style.display = "none";
      fileIn.setAttribute("aria-label", att.buttonTooltipText ?? "Attach files");
      rootFooter.appendChild(fileIn);
    }
  };

  // Plugin hook: renderComposer - allow plugins to provide custom composer
  const composerPlugin = plugins.find(p => p.renderComposer);
  if (composerPlugin?.renderComposer) {
    const composerCfg = config.composer;
    const customComposer = composerPlugin.renderComposer({
      config,
      defaultRenderer: () => {
        const composerElements = buildComposer({ config });
        return composerElements.footer;
      },
      onSubmit: (text: string) => {
        if (!session || session.isStreaming()) return;
        const value = text.trim();
        const hasAttachments = attachmentManager?.hasAttachments() ?? false;
        if (!value && !hasAttachments) return;
        // Mirror the default composer's auto-expand behavior so plugin
        // composers do not silently submit while the panel stays collapsed.
        maybeExpandComposerBar();
        let contentParts: ContentPart[] | undefined;
        if (hasAttachments) {
          contentParts = [];
          contentParts.push(...attachmentManager!.getContentParts());
          if (value) {
            contentParts.push(createTextPart(value));
          }
        }
        session.sendMessage(value, { contentParts });
        if (hasAttachments) {
          attachmentManager!.clearAttachments();
        }
      },
      streaming: false,
      disabled: false,
      openAttachmentPicker: () => {
        attachmentInput?.click();
      },
      models: composerCfg?.models,
      selectedModelId: composerCfg?.selectedModelId,
      onModelChange: (modelId: string) => {
        config.composer = { ...config.composer, selectedModelId: modelId };
        // Sync to agent config so the next request uses the selected model
        if (config.agent) {
          config.agent = { ...config.agent, model: modelId };
        }
      },
      onVoiceToggle:
        config.voiceRecognition?.enabled === true
          ? () => {
              composerVoiceBridge?.();
            }
          : undefined
    });
    if (customComposer) {
      // Replace the default footer with custom composer (keeps view.composer.footer in sync).
      view.replaceComposer(customComposer);
      footer = view.composer.footer;
    }
  }

  const bindComposerRefsFromFooter = (rootFooter: HTMLElement) => {
    // Prefer stable `data-persona-composer-*` refs (set by the default and
    // pill builders); fall back to the legacy class selectors so custom
    // plugin composers built before these refs existed still bind.
    const pick = <T extends HTMLElement>(...selectors: string[]): T | null => {
      for (const selector of selectors) {
        const found = rootFooter.querySelector<T>(selector);
        if (found) return found;
      }
      return null;
    };

    const form = rootFooter.querySelector<HTMLFormElement>("[data-persona-composer-form]");
    const ta = rootFooter.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]");
    const sb = rootFooter.querySelector<HTMLButtonElement>("[data-persona-composer-submit]");
    const mic = rootFooter.querySelector<HTMLButtonElement>("[data-persona-composer-mic]");
    const st = rootFooter.querySelector<HTMLElement>("[data-persona-composer-status]");
    if (form) composerForm = form;
    if (ta) textarea = ta;
    if (sb) sendButton = sb;
    if (mic) {
      micButton = mic;
      micButtonWrapper = mic.parentElement as HTMLElement | null;
    }
    if (st) statusText = st;
    const sug = pick<HTMLElement>(
      "[data-persona-composer-suggestions]",
      ".persona-mb-3.persona-flex.persona-flex-wrap.persona-gap-2"
    );
    if (sug) suggestions = sug;
    const attBtn = pick<HTMLButtonElement>(
      "[data-persona-composer-attachment-button]",
      ".persona-attachment-button"
    );
    if (attBtn) {
      attachmentButton = attBtn;
      attachmentButtonWrapper = attBtn.parentElement as HTMLElement | null;
    }
    attachmentInput = pick<HTMLInputElement>(
      "[data-persona-composer-attachment-input]",
      'input[type="file"]'
    );
    attachmentPreviewsContainer = pick<HTMLElement>(
      "[data-persona-composer-attachment-previews]",
      ".persona-attachment-previews"
    );
    const ar = pick<HTMLElement>(
      "[data-persona-composer-actions]",
      ".persona-widget-composer .persona-flex.persona-items-center.persona-justify-between"
    );
    if (ar) _actionsRow = ar;
  };
  ensureComposerAttachmentSurface(footer);
  bindComposerRefsFromFooter(footer);

  // Apply contentMaxWidth to composer form, suggestions, and attachment
  // previews if configured. In composer-bar mode, fall back to
  // `composerBar.contentMaxWidth` (default `720px`) when no explicit
  // `layout.contentMaxWidth` is set, so the expanded panel's content
  // centers horizontally without the host having to wire it up.
  const contentMaxWidth =
    config.layout?.contentMaxWidth ??
    (isComposerBar() ? config.launcher?.composerBar?.contentMaxWidth ?? "720px" : undefined);
  if (contentMaxWidth) {
    messagesWrapper.style.maxWidth = contentMaxWidth;
    messagesWrapper.style.marginLeft = "auto";
    messagesWrapper.style.marginRight = "auto";
    messagesWrapper.style.width = "100%";
  }
  // The pill IS the composer in composer-bar mode and should match the
  // wrapper's responsive width (50vw / 70vw / 90vw), not be capped by
  // contentMaxWidth (which is a centered-column convention for the
  // expanded panel's body, not the pill input itself).
  if (contentMaxWidth && composerForm && !isComposerBar()) {
    composerForm.style.maxWidth = contentMaxWidth;
    composerForm.style.marginLeft = "auto";
    composerForm.style.marginRight = "auto";
  }
  if (contentMaxWidth && suggestions && !isComposerBar()) {
    suggestions.style.maxWidth = contentMaxWidth;
    suggestions.style.marginLeft = "auto";
    suggestions.style.marginRight = "auto";
  }
  if (contentMaxWidth && attachmentPreviewsContainer && !isComposerBar()) {
    attachmentPreviewsContainer.style.maxWidth = contentMaxWidth;
    attachmentPreviewsContainer.style.marginLeft = "auto";
    attachmentPreviewsContainer.style.marginRight = "auto";
  }

  if (config.attachments?.enabled && attachmentInput && attachmentPreviewsContainer) {
    attachmentManager = AttachmentManager.fromConfig(config.attachments);
    attachmentManager.setPreviewsContainer(attachmentPreviewsContainer);
    attachmentInput.addEventListener("change", (e) => {
      const target = e.target as HTMLInputElement;
      attachmentManager?.handleFileSelect(target.files);
      target.value = "";
    });

    const dropCfg = config.attachments.dropOverlay;
    const overlay = buildDropOverlay(dropCfg);
    container.appendChild(overlay);
  }

  // Slot system: allow custom content injection into specific regions
  const renderSlots = () => {
    const slots = config.layout?.slots ?? {};
    
    // Helper to get default slot content
    const getDefaultSlotContent = (slot: WidgetLayoutSlot): HTMLElement | null => {
      switch (slot) {
        case "body-top":
          // Default: the intro card
          return container.querySelector(".persona-rounded-2xl.persona-bg-persona-surface.persona-p-6") as HTMLElement || null;
        case "messages":
          return messagesWrapper;
        case "footer-top":
          return suggestions;
        case "composer":
          return composerForm;
        case "footer-bottom":
          return statusText;
        default:
          return null;
      }
    };

    // Helper to insert content into slot region
    const insertSlotContent = (slot: WidgetLayoutSlot, element: HTMLElement) => {
      switch (slot) {
        case "header-left":
        case "header-center":
        case "header-right":
          // Header slots - prepend/append to header
          if (slot === "header-left") {
            header.insertBefore(element, header.firstChild);
          } else if (slot === "header-right") {
            header.appendChild(element);
          } else {
            // header-center: insert after icon/title
            const titleSection = header.querySelector(".persona-flex-col");
            if (titleSection) {
              titleSection.parentNode?.insertBefore(element, titleSection.nextSibling);
            } else {
              header.appendChild(element);
            }
          }
          break;
        case "body-top": {
          // Replace or prepend to body
          const introCard = body.querySelector(".persona-rounded-2xl.persona-bg-persona-surface.persona-p-6");
          if (introCard) {
            introCard.replaceWith(element);
          } else {
            body.insertBefore(element, body.firstChild);
          }
          break;
        }
        case "body-bottom":
          // Append after messages wrapper
          body.appendChild(element);
          break;
        case "footer-top":
          // Replace suggestions area
          suggestions.replaceWith(element);
          break;
        case "footer-bottom":
          // Replace or append after status text
          statusText.replaceWith(element);
          break;
        default:
          // For other slots, just append to appropriate container
          break;
      }
    };

    // Process each configured slot
    for (const [slotName, renderer] of Object.entries(slots) as [WidgetLayoutSlot, SlotRenderer][]) {
      if (renderer) {
        try {
          const slotElement = renderer({
            config,
            defaultContent: () => getDefaultSlotContent(slotName)
          });
          if (slotElement) {
            insertSlotContent(slotName, slotElement);
          }
        } catch (error) {
          if (typeof console !== "undefined") {
            // eslint-disable-next-line no-console
            console.error(`[AgentWidget] Error rendering slot "${slotName}":`, error);
          }
        }
      }
    }
  };

  // Render custom slots
  renderSlots();

  // Add event delegation for reasoning and tool bubble expansion
  // This handles clicks even after idiomorph morphs the DOM
  const handleBubbleExpansion = (event: Event) => {
    const target = event.target as HTMLElement;
    
    // Check if the click/keypress is on an expand header button
    const headerButton = target.closest('button[data-expand-header="true"]') as HTMLElement;
    if (!headerButton) return;
    
    // Find the parent bubble element
    const bubble = headerButton.closest('.persona-reasoning-bubble, .persona-tool-bubble, .persona-approval-bubble') as HTMLElement;
    if (!bubble) return;
    
    // Get message ID from bubble
    const messageId = bubble.getAttribute('data-message-id');
    if (!messageId) return;
    
    const bubbleType = headerButton.getAttribute('data-bubble-type');
    
    // Toggle expansion state
    if (bubbleType === 'reasoning') {
      if (reasoningExpansionState.has(messageId)) {
        reasoningExpansionState.delete(messageId);
      } else {
        reasoningExpansionState.add(messageId);
      }
      updateReasoningBubbleUI(messageId, bubble);
    } else if (bubbleType === 'tool') {
      if (toolExpansionState.has(messageId)) {
        toolExpansionState.delete(messageId);
      } else {
        toolExpansionState.add(messageId);
      }
      updateToolBubbleUI(messageId, bubble, config);
    } else if (bubbleType === 'approval') {
      const approvalConfig = config.approval !== false ? config.approval : undefined;
      const defaultExpanded = (approvalConfig?.detailsDisplay ?? 'collapsed') === 'expanded';
      const expanded = approvalDetailsExpansionState.get(messageId) ?? defaultExpanded;
      approvalDetailsExpansionState.set(messageId, !expanded);
      updateApprovalDetailsUI(messageId, bubble, config);
    }
    // Invalidate cached wrapper so next render rebuilds with current expansion state
    messageCache.delete(messageId);
  };

  // Attach event listeners to messagesWrapper for event delegation
  messagesWrapper.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('button[data-expand-header="true"]')) {
      event.preventDefault();
      handleBubbleExpansion(event);
    }
  });

  messagesWrapper.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;
    if ((event.key === 'Enter' || event.key === ' ') && target.closest('button[data-expand-header="true"]')) {
      event.preventDefault();
      handleBubbleExpansion(event);
    }
  });

  // Normalize manual (triple-click + Ctrl/Cmd-C) copies of message text. The
  // browser serializes the DOM selection, and block-level markdown elements
  // (<p>, <li>, <pre>, …) emit surrounding newlines — so a single-message copy
  // arrives with stray trailing/leading blank lines. Rewrite the clipboard's
  // plain text to the trimmed selection so the buffer matches what was visibly
  // highlighted. (The Copy action button is unaffected; it uses message.content.)
  messagesWrapper.addEventListener('copy', (event) => {
    const { clipboardData } = event;
    if (!clipboardData) return;
    const root = messagesWrapper.getRootNode() as { getSelection?: () => Selection | null };
    const selection =
      typeof root.getSelection === 'function' ? root.getSelection() : window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const raw = selection.toString();
    const normalized = normalizeCopiedSelectionText(raw);
    if (!normalized || normalized === raw) return;
    clipboardData.setData('text/plain', normalized);
    event.preventDefault();
  });

  // Add event delegation for message action buttons (upvote, downvote, copy)
  // This handles clicks even after idiomorph morphs the DOM and strips inline listeners
  const messageVoteState = new Map<string, "upvote" | "downvote">();

  // Read-aloud (text-to-speech) button state. The ReadAloudController in the
  // session is the source of truth; these mirror its last-known state so the
  // button visuals can be re-applied after every render/morph (which would
  // otherwise revert the swapped icon to the default "volume-2").
  let readAloudActiveId: string | null = null;
  let readAloudActiveState: ReadAloudState = "idle";

  const READ_ALOUD_ICONS: Record<ReadAloudState, { icon: string; label: string }> = {
    idle: { icon: "volume-2", label: "Read aloud" },
    loading: { icon: "loader-circle", label: "Loading…" },
    playing: { icon: "pause", label: "Pause" },
    paused: { icon: "play", label: "Resume" },
  };

  const applyReadAloudButton = (btn: HTMLElement, state: ReadAloudState) => {
    const { icon, label } = READ_ALOUD_ICONS[state];
    btn.setAttribute("aria-label", label);
    btn.title = label;
    btn.setAttribute("aria-pressed", state === "idle" ? "false" : "true");
    btn.classList.toggle("persona-message-action-active", state !== "idle");
    btn.classList.toggle("persona-message-action-loading", state === "loading");
    const svg = renderLucideIcon(icon, 14, "currentColor", 2);
    if (svg) {
      btn.innerHTML = "";
      btn.appendChild(svg);
    }
  };

  // Re-apply the current read-aloud state to every read-aloud button in the
  // thread. Called on state change and after each render so a button that is
  // playing/paused keeps its icon across DOM morphs.
  const refreshReadAloudButtons = () => {
    const buttons = messagesWrapper.querySelectorAll<HTMLElement>('[data-action="read-aloud"]');
    buttons.forEach((btn) => {
      const container = btn.closest("[data-actions-for]");
      const id = container?.getAttribute("data-actions-for") ?? null;
      const state: ReadAloudState = id && id === readAloudActiveId ? readAloudActiveState : "idle";
      applyReadAloudButton(btn, state);
    });
  };

  messagesWrapper.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const actionBtn = target.closest('.persona-message-action-btn[data-action]') as HTMLElement;
    if (!actionBtn) return;

    event.preventDefault();
    event.stopPropagation();

    const actionsContainer = actionBtn.closest('[data-actions-for]') as HTMLElement;
    if (!actionsContainer) return;

    const messageId = actionsContainer.getAttribute('data-actions-for');
    if (!messageId) return;

    const action = actionBtn.getAttribute('data-action');

    if (action === 'copy') {
      const messages = session.getMessages();
      const message = messages.find(m => m.id === messageId);
      if (message && messageActionCallbacks.onCopy) {
        // Copy to clipboard
        const textToCopy = message.content || "";
        navigator.clipboard.writeText(textToCopy).then(() => {
          // Show success feedback - swap icon temporarily
          actionBtn.classList.add("persona-message-action-success");
          const checkIcon = renderLucideIcon("check", 14, "currentColor", 2);
          if (checkIcon) {
            actionBtn.innerHTML = "";
            actionBtn.appendChild(checkIcon);
          }
          setTimeout(() => {
            actionBtn.classList.remove("persona-message-action-success");
            const originalIcon = renderLucideIcon("copy", 14, "currentColor", 2);
            if (originalIcon) {
              actionBtn.innerHTML = "";
              actionBtn.appendChild(originalIcon);
            }
          }, 2000);
        }).catch((err) => {
          if (typeof console !== "undefined") {
            // eslint-disable-next-line no-console
            console.error("[AgentWidget] Failed to copy message:", err);
          }
        });
        messageActionCallbacks.onCopy(message);
      }
    } else if (action === 'read-aloud') {
      // Toggle play/pause/resume; ReadAloudController drives the engine and
      // notifies onReadAloudChange, which refreshes the button icon.
      session.toggleReadAloud(messageId);
    } else if (action === 'upvote' || action === 'downvote') {
      const currentVote = messageVoteState.get(messageId) ?? null;
      const wasActive = currentVote === action;
      const iconName = action === 'upvote' ? 'thumbs-up' : 'thumbs-down';

      if (wasActive) {
        // Toggle off: revert to outline icon
        messageVoteState.delete(messageId);
        actionBtn.classList.remove("persona-message-action-active");
        const outlineIcon = renderLucideIcon(iconName, 14, "currentColor", 2);
        if (outlineIcon) {
          actionBtn.innerHTML = "";
          actionBtn.appendChild(outlineIcon);
        }
      } else {
        // Clear opposite vote button and revert its icon
        const oppositeAction = action === 'upvote' ? 'downvote' : 'upvote';
        const oppositeBtn = actionsContainer.querySelector(`[data-action="${oppositeAction}"]`);
        if (oppositeBtn) {
          oppositeBtn.classList.remove("persona-message-action-active");
          const oppositeIconName = oppositeAction === 'upvote' ? 'thumbs-up' : 'thumbs-down';
          const outlineIcon = renderLucideIcon(oppositeIconName, 14, "currentColor", 2);
          if (outlineIcon) {
            oppositeBtn.innerHTML = "";
            oppositeBtn.appendChild(outlineIcon);
          }
        }

        messageVoteState.set(messageId, action);
        actionBtn.classList.add("persona-message-action-active");

        // Swap to filled icon
        const filledIcon = renderLucideIcon(iconName, 14, "currentColor", 2);
        if (filledIcon) {
          filledIcon.setAttribute("fill", "currentColor");
          actionBtn.innerHTML = "";
          actionBtn.appendChild(filledIcon);
        }

        // Pop animation
        actionBtn.classList.remove("persona-message-action-pop");
        void actionBtn.offsetWidth; // force reflow to restart animation
        actionBtn.classList.add("persona-message-action-pop");

        // Trigger feedback
        const messages = session.getMessages();
        const message = messages.find(m => m.id === messageId);
        if (message && messageActionCallbacks.onFeedback) {
          messageActionCallbacks.onFeedback({
            type: action,
            messageId: message.id,
            message
          });
        }
      }
    }
  });

  // Add event delegation for approval action buttons (approve/deny)
  messagesWrapper.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const approvalButton = target.closest('button[data-approval-action]') as HTMLElement;
    if (!approvalButton) return;

    event.preventDefault();
    event.stopPropagation();

    const approvalBubble = approvalButton.closest('.persona-approval-bubble') as HTMLElement;
    if (!approvalBubble) return;

    const messageId = approvalBubble.getAttribute('data-message-id');
    if (!messageId) return;

    const action = approvalButton.getAttribute('data-approval-action') as 'approve' | 'deny';
    if (!action) return;

    const decision = action === 'approve' ? 'approved' as const : 'denied' as const;

    // Find the approval message
    const messages = session.getMessages();
    const approvalMessage = messages.find(m => m.id === messageId);
    if (!approvalMessage?.approval) return;

    // Disable buttons immediately for responsive UI
    const buttonsContainer = approvalBubble.querySelector('[data-approval-buttons]') as HTMLElement;
    if (buttonsContainer) {
      const buttons = buttonsContainer.querySelectorAll('button');
      buttons.forEach(btn => {
        (btn as HTMLButtonElement).disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
      });
    }

    // WebMCP gate approvals resolve a local Promise the bridge is parked on
    // (no server round-trip); server-driven approvals call the API. The
    // `toolType` marker set in `requestWebMcpApproval` discriminates the two.
    if (approvalMessage.approval.toolType === "webmcp") {
      session.resolveWebMcpApproval(messageId, decision);
    } else {
      session.resolveApproval(approvalMessage.approval, decision);
    }
  });

  let artifactPaneApi: ArtifactPaneApi | null = null;
  let artifactPanelResizeObs: ResizeObserver | null = null;
  let lastArtifactsState: {
    artifacts: PersonaArtifactRecord[];
    selectedId: string | null;
  } = { artifacts: [], selectedId: null };
  let artifactsPaneUserHidden = false;
  // Runtime-only expand state: pane fills the split root and the chat column
  // hides. Reset whenever the pane stops being visible (syncArtifactPane).
  let artifactPaneExpanded = false;
  // Set when the expansion came from an inline block's Expand button: that is
  // an explicit "fullscreen this file" request, so it survives the
  // showExpandToggle gate below (which otherwise collapses the pane for hosts
  // without the toolbar toggle). Cleared whenever the pane collapses or hides.
  let artifactPaneExpandedPinned = false;
  // Whether the user explicitly opened the pane (card click, inline Expand,
  // showArtifacts(), programmatic upsert). Auto-open is otherwise reserved for
  // artifacts whose resolved display mode is "panel": "card" keeps the card as
  // the only affordance and "inline" renders in the transcript. "inline" no
  // longer *auto*-opens the pane, but its Expand control is a deliberate,
  // user-driven open (setting artifactsPaneUserOpened, same as a card click);
  // every mode still writes the session artifact registry (download /
  // getArtifacts / hydration).
  let artifactsPaneUserOpened = false;
  const artifactPaneCanShow = () =>
    artifactsPaneUserOpened ||
    lastArtifactsState.artifacts.some(
      (a) =>
        resolveArtifactDisplayMode(config.features?.artifacts, a.artifactType) === "panel"
    );
  const artifactPaneVisible = () =>
    lastArtifactsState.artifacts.length > 0 &&
    !artifactsPaneUserHidden &&
    artifactPaneCanShow();
  const sessionRef: { current: AgentWidgetSession | null } = { current: null };

  // Resolve an artifact's content for card actions (download + custom actions).
  // Tries the live session registry first, then falls back to the content
  // persisted in the card message's rawContent props (session state is gone
  // after a page refresh). `fromEl` is the clicked element inside the card.
  const resolveCardArtifactContent = (
    fromEl: HTMLElement,
    artifactId: string
  ): { markdown?: string; title: string; file?: PersonaArtifactFileMeta; artifactType: string } => {
    const artifact = session.getArtifactById(artifactId);
    let markdown = artifact?.markdown;
    let title = artifact?.title || 'artifact';
    let file: PersonaArtifactFileMeta | undefined = artifact?.file;
    let artifactType: string = artifact?.artifactType ?? 'markdown';
    if (!markdown) {
      // Match both reference cards and inline blocks: inline hydration embeds
      // the markdown / file source in the same message rawContent, so the parse
      // below resolves content for inline copy / custom actions after a refresh.
      const cardEl = fromEl.closest('[data-open-artifact], [data-artifact-inline]');
      const msgEl = cardEl?.closest('[data-message-id]');
      const msgId = msgEl?.getAttribute('data-message-id');
      if (msgId) {
        const msgs = session.getMessages();
        const msg = msgs.find(m => m.id === msgId);
        if (msg?.rawContent) {
          try {
            const parsed = JSON.parse(msg.rawContent);
            markdown = parsed?.props?.markdown;
            title = parsed?.props?.title || title;
            if (parsed?.props?.file && typeof parsed.props.file === 'object') {
              file = parsed.props.file as PersonaArtifactFileMeta;
            }
            if (!artifact && typeof parsed?.props?.artifactType === 'string') {
              artifactType = parsed.props.artifactType;
            }
          } catch { /* ignore */ }
        }
      }
    }
    return { markdown, title, file, artifactType };
  };

  // Click delegation for artifact download buttons
  messagesWrapper.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const dlBtn = target.closest('[data-download-artifact]') as HTMLElement;
    if (!dlBtn) return;
    event.preventDefault();
    event.stopPropagation();
    const artifactId = dlBtn.getAttribute('data-download-artifact');
    if (!artifactId) return;
    // Let integrator intercept
    const dlPrevented = config.features?.artifacts?.onArtifactAction?.({ type: 'download', artifactId });
    if (dlPrevented === true) return;
    const { markdown, title, file } = resolveCardArtifactContent(dlBtn, artifactId);
    if (!markdown) return;
    // File artifacts download the raw unfenced source under their real name/MIME;
    // non-file markdown artifacts keep the legacy `<title>.md` / text/markdown path.
    const { filename, mime, content } = downloadInfoFor({ title, markdown, file });
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Click delegation for integrator-supplied card action buttons. Actions are
  // looked up by id from fresh config at click time so live config updates
  // apply. Like the download listener, its stopPropagation() cannot block the
  // card-open listener on the same element, so that listener skips these too.
  messagesWrapper.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const actionBtn = target.closest('[data-artifact-custom-action]') as HTMLElement;
    if (!actionBtn) return;
    event.preventDefault();
    event.stopPropagation();
    const actionId = actionBtn.getAttribute('data-artifact-custom-action');
    if (!actionId) return;
    // The same attribute serves cards and inline chrome; resolve which surface
    // the button lives in so the action comes from the matching config list and
    // the artifact id from the matching container attribute.
    const inlineEl = actionBtn.closest('[data-artifact-inline]');
    const cardEl = inlineEl ? null : actionBtn.closest('[data-open-artifact]');
    const artifactId = inlineEl
      ? inlineEl.getAttribute('data-artifact-inline')
      : cardEl?.getAttribute('data-open-artifact') ?? null;
    const actionList = inlineEl
      ? config.features?.artifacts?.inlineActions
      : config.features?.artifacts?.cardActions;
    const action = actionList?.find((a) => a.id === actionId);
    if (!action) return;
    const { markdown, title, file, artifactType } = resolveCardArtifactContent(actionBtn, artifactId ?? '');
    const ctx: PersonaArtifactActionContext = { artifactId, title, artifactType, markdown, file };
    try {
      void Promise.resolve(action.onClick(ctx)).catch(() => {});
    } catch {
      /* ignore */
    }
  });

  // Click delegation for the inline chrome Copy button. Like the download /
  // custom-action listeners, it resolves content from the live registry first,
  // then falls back to the persisted inline props after a refresh, and its
  // stopPropagation() cannot block a second listener on the same element (there
  // is none here, but the pattern is kept consistent).
  messagesWrapper.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const copyBtn = target.closest('[data-copy-artifact]') as HTMLElement;
    if (!copyBtn) return;
    event.preventDefault();
    event.stopPropagation();
    const artifactId = copyBtn.getAttribute('data-copy-artifact');
    if (!artifactId) return;
    // Prefer the live record (covers component JSON); fall back to the persisted
    // markdown / file source parsed from the inline block's message rawContent.
    const artifact = session.getArtifactById(artifactId);
    let text = '';
    if (artifact) {
      text = artifactCopyText(artifact);
    } else {
      const { markdown, file, artifactType } = resolveCardArtifactContent(copyBtn, artifactId);
      if (artifactType === 'markdown') {
        text = artifactCopyText({
          id: artifactId,
          artifactType: 'markdown',
          status: 'complete',
          markdown: markdown ?? '',
          ...(file ? { file } : {})
        });
      }
    }
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      // Lightweight feedback: swap the copy glyph for a check briefly.
      const checkIcon = renderLucideIcon('check', 16, 'currentColor', 2);
      if (checkIcon) {
        copyBtn.replaceChildren(checkIcon);
        setTimeout(() => {
          const copyIcon = renderLucideIcon('copy', 16, 'currentColor', 2);
          if (copyIcon) copyBtn.replaceChildren(copyIcon);
        }, 1500);
      }
    }).catch(() => { /* ignore */ });
  });

  // Click delegation for the inline chrome Expand button: open this artifact in
  // the pane. Fires onArtifactAction({ type: "open" }) first so hosts can
  // intercept, then mirrors the card-open path — except the pane opens
  // expanded (fullscreen), never split: the inline block already shows the
  // full preview at chat width, so a split pane would only duplicate it, and
  // the click means "expand this file". The pinned flag keeps it expanded
  // even when layout.showExpandToggle is off; Close is the exit there.
  messagesWrapper.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const expandBtn = target.closest('[data-expand-artifact-inline]') as HTMLElement;
    if (!expandBtn) return;
    event.preventDefault();
    event.stopPropagation();
    const artifactId = expandBtn.getAttribute('data-expand-artifact-inline');
    if (!artifactId) return;
    const openPrevented = config.features?.artifacts?.onArtifactAction?.({ type: 'open', artifactId });
    if (openPrevented === true) return;
    artifactsPaneUserHidden = false;
    // Expand is an explicit open: it overrides the "inline" auto-open
    // suppression for as long as artifacts exist (same as a card click).
    artifactsPaneUserOpened = true;
    artifactPaneExpanded = true;
    artifactPaneExpandedPinned = true;
    session.selectArtifact(artifactId);
    syncArtifactPane();
  });

  // Click delegation for artifact reference cards
  messagesWrapper.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    // Download and custom-action clicks are handled by the listeners above;
    // their stopPropagation() cannot block a second listener on the same
    // element, so skip them here explicitly or the card would also open the panel.
    if (target.closest('[data-download-artifact]')) return;
    if (target.closest('[data-artifact-custom-action]')) return;
    const card = target.closest('[data-open-artifact]') as HTMLElement;
    if (!card) return;
    const artifactId = card.getAttribute('data-open-artifact');
    if (!artifactId) return;
    // Let integrator intercept
    const openPrevented = config.features?.artifacts?.onArtifactAction?.({ type: 'open', artifactId });
    if (openPrevented === true) return;
    event.preventDefault();
    event.stopPropagation();
    artifactsPaneUserHidden = false;
    // Card click is an explicit open: it overrides the "card"/"inline"
    // auto-open suppression for as long as artifacts exist.
    artifactsPaneUserOpened = true;
    session.selectArtifact(artifactId);
    syncArtifactPane();
  });

  // Keyboard support for artifact cards
  messagesWrapper.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target as HTMLElement;
    if (!target.hasAttribute('data-open-artifact')) return;
    event.preventDefault();
    target.click();
  });

  // --- ask_user_question sheet interaction ---
  // Event delegation for the answer-pill sheet that mounts in the composer
  // overlay. Handles pill pick (single), multi-select toggle + submit, free-
  // text pill expansion + submit, and dismissal. Selection becomes a regular
  // user message via session.sendMessage so the agent resumes on the next turn.
  const askUserOverlay = panelElements.composerOverlay;

  const submitAskUserAnswer = (
    sheet: HTMLElement,
    text: string,
    meta: {
      source: "pick" | "multi" | "free-text" | "submit-all";
      values?: string[];
      structured?: Record<string, string | string[]>;
    }
  ): void => {
    const trimmed = text.trim();
    if (!trimmed || !sessionRef.current) return;
    const toolCallId = sheet.getAttribute("data-tool-call-id") ?? "";
    const isFreeText = meta.source === "free-text";

    // Dispatch before removing the sheet so listeners can still query DOM state.
    mount.dispatchEvent(
      new CustomEvent("persona:askUserQuestion:answered", {
        detail: {
          toolUseId: toolCallId,
          answer: trimmed,
          answers: meta.structured,
          values: meta.values ?? (meta.source === "multi" ? trimmed.split(", ") : [trimmed]),
          isFreeText,
          source: meta.source,
        },
        bubbles: true,
        composed: true,
      })
    );

    removeAskUserQuestionSheet(askUserOverlay, toolCallId);

    // Branch: LOCAL-tool pause (step_await) resumes via /resume with structured
    // toolOutputs; legacy path sends as a plain user message.
    const sourceMessage = sessionRef.current
      .getMessages()
      .find((m) => m.toolCall?.id === toolCallId);
    if (sourceMessage?.agentMetadata?.awaitingLocalTool) {
      sessionRef.current.resolveAskUserQuestion(sourceMessage, meta.structured ?? trimmed);
    } else {
      sessionRef.current.sendMessage(trimmed);
    }
  };

  /**
   * Persist in-progress grouped-question answers + page index back to the
   * source message so a refresh restores the user's spot.
   */
  const persistGroupedProgress = (sheet: HTMLElement): void => {
    const session = sessionRef.current;
    if (!session) return;
    const toolCallId = sheet.getAttribute("data-tool-call-id") ?? "";
    const sourceMessage = session.getMessages().find((m) => m.toolCall?.id === toolCallId);
    if (!sourceMessage) return;
    session.persistAskUserQuestionProgress(sourceMessage, {
      answers: buildStructuredAnswers(sheet, sourceMessage),
      currentIndex: getCurrentIndex(sheet),
    });
  };

  /**
   * Build a one-line summary string for the legacy `answer` field on the
   * answered event when submit-all fires from a grouped sheet.
   */
  const stringifyStructured = (answers: Record<string, string | string[]>): string => {
    return Object.entries(answers)
      .map(([q, v]) => `${q}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join(" | ");
  };

  /**
   * If `groupedAutoAdvance` is enabled (default) and we're not on the final
   * page, advance one step. The final page never auto-submits: users always
   * confirm with an explicit Submit-all click so they can review.
   */
  const maybeAutoAdvance = (sheet: HTMLElement): void => {
    if (config.features?.askUserQuestion?.groupedAutoAdvance === false) return;
    const idx = getCurrentIndex(sheet);
    const count = getQuestionCount(sheet);
    if (idx >= count - 1) return;
    const sourceMessage = sessionRef.current
      ?.getMessages()
      .find((m) => m.toolCall?.id === sheet.getAttribute("data-tool-call-id"));
    if (!sourceMessage) return;
    navigateToPage(sheet, sourceMessage, config, idx + 1);
    persistGroupedProgress(sheet);
  };

  askUserOverlay.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const trigger = target.closest<HTMLElement>("[data-ask-user-action]");
    if (!trigger) return;
    const sheet = trigger.closest<HTMLElement>("[data-persona-ask-sheet-for]");
    if (!sheet) return;

    const action = trigger.getAttribute("data-ask-user-action");
    event.preventDefault();
    event.stopPropagation();

    if (action === "dismiss") {
      const toolCallId = sheet.getAttribute("data-tool-call-id") ?? "";
      mount.dispatchEvent(
        new CustomEvent("persona:askUserQuestion:dismissed", {
          detail: { toolUseId: toolCallId },
          bubbles: true,
          composed: true,
        })
      );
      removeAskUserQuestionSheet(askUserOverlay, toolCallId);

      // Best-effort: if this sheet corresponds to a LOCAL-awaiting tool,
      // unblock the paused execution with a sentinel answer so the server
      // doesn't sit in waiting_for_local forever. Fire-and-forget: errors
      // are surfaced to the onError callback. Flip the answered flag first
      // so a racing render pass doesn't re-mount the sheet mid-dismissal.
      const sourceMessage = sessionRef.current
        ?.getMessages()
        .find((m) => m.toolCall?.id === toolCallId);
      if (sourceMessage?.agentMetadata?.awaitingLocalTool) {
        sessionRef.current?.markAskUserQuestionResolved(sourceMessage);
        sessionRef.current?.resolveAskUserQuestion(sourceMessage, "(dismissed)");
      }
      return;
    }

    if (action === "pick") {
      const label = trigger.getAttribute("data-option-label");
      if (!label) return;
      const multiSelect = sheet.getAttribute("data-multi-select") === "true";
      const grouped = isGroupedSheet(sheet);

      if (grouped && multiSelect) {
        const stored = readAnswersFromSheet(sheet)[getCurrentIndex(sheet)];
        const set = new Set<string>(Array.isArray(stored) ? stored : []);
        if (set.has(label)) set.delete(label);
        else set.add(label);
        setCurrentAnswer(sheet, Array.from(set));
        persistGroupedProgress(sheet);
        return;
      }

      if (grouped) {
        setCurrentAnswer(sheet, label);
        persistGroupedProgress(sheet);
        maybeAutoAdvance(sheet);
        return;
      }

      // 1-question modes: preserve original UX.
      if (multiSelect) {
        const pressed = trigger.getAttribute("aria-pressed") === "true";
        trigger.setAttribute("aria-pressed", pressed ? "false" : "true");
        trigger.classList.toggle("persona-ask-pill-selected", !pressed);
        const submitBtn = sheet.querySelector<HTMLButtonElement>(
          '[data-ask-user-action="submit-multi"]'
        );
        if (submitBtn) {
          submitBtn.disabled = getSelectedLabels(sheet).length === 0;
        }
        return;
      }
      submitAskUserAnswer(sheet, label, { source: "pick", values: [label] });
      return;
    }

    if (action === "submit-multi") {
      const labels = getSelectedLabels(sheet);
      if (labels.length === 0) return;
      submitAskUserAnswer(sheet, labels.join(", "), {
        source: "multi",
        values: labels,
      });
      return;
    }

    if (action === "open-free-text") {
      const row = sheet.querySelector<HTMLElement>('[data-ask-free-text-row="true"]');
      if (row) {
        row.classList.remove("persona-hidden");
        const input = row.querySelector<HTMLInputElement>('[data-ask-free-text-input="true"]');
        input?.focus();
      }
      return;
    }

    if (action === "focus-free-text") {
      // Rows-layout Other row: input lives inside the row container itself.
      // Native click on the input already focuses it; this branch handles
      // clicks on the badge or row chrome AND digit-shortcut activations.
      const input = sheet.querySelector<HTMLInputElement>('[data-ask-free-text-input="true"]');
      input?.focus();
      return;
    }

    if (action === "submit-free-text") {
      const input = sheet.querySelector<HTMLInputElement>('[data-ask-free-text-input="true"]');
      const text = input?.value ?? "";
      if (!text.trim()) return;
      if (isGroupedSheet(sheet)) {
        setCurrentAnswer(sheet, text.trim());
        persistGroupedProgress(sheet);
        maybeAutoAdvance(sheet);
        return;
      }
      submitAskUserAnswer(sheet, text, { source: "free-text" });
      return;
    }

    if (action === "next" || action === "back") {
      if (!sessionRef.current) return;
      const toolCallId = sheet.getAttribute("data-tool-call-id") ?? "";
      const sourceMessage = sessionRef.current
        .getMessages()
        .find((m) => m.toolCall?.id === toolCallId);
      if (!sourceMessage) return;
      // Flush any unsubmitted free-text input as the current answer.
      const freeInput = sheet.querySelector<HTMLInputElement>('[data-ask-free-text-input="true"]');
      const pending = freeInput?.value?.trim() ?? "";
      if (pending) {
        const stored = readAnswersFromSheet(sheet)[getCurrentIndex(sheet)];
        if (typeof stored !== "string" || stored !== pending) {
          setCurrentAnswer(sheet, pending);
        }
      }
      const direction = action === "next" ? 1 : -1;
      const nextIdx = getCurrentIndex(sheet) + direction;
      navigateToPage(sheet, sourceMessage, config, nextIdx);
      persistGroupedProgress(sheet);
      return;
    }

    if (action === "submit-all") {
      if (!sessionRef.current) return;
      const toolCallId = sheet.getAttribute("data-tool-call-id") ?? "";
      const sourceMessage = sessionRef.current
        .getMessages()
        .find((m) => m.toolCall?.id === toolCallId);
      if (!sourceMessage) return;
      // Flush any pending free-text on the final page first.
      const freeInput = sheet.querySelector<HTMLInputElement>('[data-ask-free-text-input="true"]');
      const pending = freeInput?.value?.trim() ?? "";
      if (pending) setCurrentAnswer(sheet, pending);

      const structured = buildStructuredAnswers(sheet, sourceMessage);
      // Persist final answers to message metadata BEFORE resolving so the
      // answered-state review card (which reads `agentMetadata
      // .askUserQuestionAnswers`) shows the user's actual picks instead of
      // "(skipped)" placeholders. Without this, any answer set only via the
      // pending-flush above (or via paths that bypassed the per-pick persist
      // hook) would be missing from the transcript review even though it
      // landed in the structured payload sent to the agent.
      sessionRef.current.persistAskUserQuestionProgress(sourceMessage, {
        answers: structured,
        currentIndex: getCurrentIndex(sheet),
      });
      const summary = stringifyStructured(structured);
      submitAskUserAnswer(sheet, summary || "(submitted)", {
        source: "submit-all",
        structured,
      });
      return;
    }

    if (action === "skip") {
      if (!sessionRef.current) return;
      const toolCallId = sheet.getAttribute("data-tool-call-id") ?? "";
      const sourceMessage = sessionRef.current
        .getMessages()
        .find((m) => m.toolCall?.id === toolCallId);
      if (!sourceMessage) return;

      const grouped = isGroupedSheet(sheet);
      const idx = getCurrentIndex(sheet);
      const count = getQuestionCount(sheet);
      const isFinal = idx >= count - 1;

      // Single-question payloads behave like dismiss.
      if (!grouped) {
        mount.dispatchEvent(
          new CustomEvent("persona:askUserQuestion:dismissed", {
            detail: { toolUseId: toolCallId },
            bubbles: true,
            composed: true,
          })
        );
        removeAskUserQuestionSheet(askUserOverlay, toolCallId);
        if (sourceMessage.agentMetadata?.awaitingLocalTool) {
          sessionRef.current.markAskUserQuestionResolved(sourceMessage);
          sessionRef.current.resolveAskUserQuestion(sourceMessage, "(dismissed)");
        }
        return;
      }

      // Drop the current question's answer (if any) so it's absent from the
      // resolved Record. setCurrentAnswer with an empty string deletes the
      // index from the in-memory map.
      setCurrentAnswer(sheet, "");
      // Also clear any unsubmitted free-text on this page.
      const freeInput = sheet.querySelector<HTMLInputElement>('[data-ask-free-text-input="true"]');
      if (freeInput) freeInput.value = "";

      if (isFinal) {
        // Submit with whatever has been recorded so far.
        const structured = buildStructuredAnswers(sheet, sourceMessage);
        const summary = stringifyStructured(structured);
        submitAskUserAnswer(sheet, summary || "(skipped)", {
          source: "submit-all",
          structured,
        });
        return;
      }

      // Intermediate page: advance one step without recording.
      navigateToPage(sheet, sourceMessage, config, idx + 1);
      persistGroupedProgress(sheet);
      return;
    }
  });

  // Enter on the free-text input → submit. Stays on the overlay because the
  // event target IS the input, which lives inside the overlay subtree.
  askUserOverlay.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const target = event.target as HTMLElement;
    const input = target as HTMLInputElement;
    if (!input.matches?.('[data-ask-free-text-input="true"]')) return;
    const sheet = input.closest<HTMLElement>("[data-persona-ask-sheet-for]");
    if (!sheet) return;
    event.preventDefault();
    const text = input.value;
    if (!text.trim()) return;
    if (isGroupedSheet(sheet)) {
      setCurrentAnswer(sheet, text.trim());
      persistGroupedProgress(sheet);
      maybeAutoAdvance(sheet);
      return;
    }
    submitAskUserAnswer(sheet, text, { source: "free-text" });
  });

  // Digit 1–9 → pick option N on the current rows-layout single-select page.
  // Listens on `document` so the shortcut fires regardless of where focus
  // currently sits (host page body, panel chrome, anywhere). The handler
  // gates strictly: only fires when an active sheet is mounted in our
  // overlay, and bails when focus is on any input/textarea/contenteditable
  // (covers the free-text input, the chat composer, and any host-page input).
  const handleAskUserDigitKey = (event: KeyboardEvent): void => {
    if (!/^[1-9]$/.test(event.key)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (
      target?.tagName === "INPUT" ||
      target?.tagName === "TEXTAREA" ||
      target?.isContentEditable
    ) {
      return;
    }
    const sheet = askUserOverlay.querySelector<HTMLElement>("[data-persona-ask-sheet-for]");
    if (!sheet) return;
    if (sheet.getAttribute("data-ask-layout") !== "rows") return;
    if (sheet.getAttribute("data-multi-select") === "true") return;
    const n = Number(event.key);
    const pills = sheet.querySelectorAll<HTMLElement>(
      '[data-ask-pill-list="true"] [data-ask-user-action="pick"], [data-ask-pill-list="true"] [data-ask-user-action="focus-free-text"]'
    );
    const target_pill = pills[n - 1];
    if (!target_pill) return;
    event.preventDefault();
    target_pill.click();
  };
  document.addEventListener("keydown", handleAskUserDigitKey);

  let artifactSplitRoot: HTMLElement | null = null;
  let artifactResizeHandle: HTMLElement | null = null;
  let artifactResizeUnbind: (() => void) | null = null;
  let artifactResizeDocEnd: (() => void) | null = null;
  let reconcileArtifactResize: () => void = () => {};
  // Expanded-state transition tracking: stash the resizer's inline width/maxWidth
  // (which would otherwise beat the expanded class) once per enter, restore once
  // per leave.
  let artifactExpandedApplied = false;
  let artifactStashedWidth = "";
  let artifactStashedMaxWidth = "";

  function stopArtifactResizePointer() {
    artifactResizeDocEnd?.();
    artifactResizeDocEnd = null;
  }

  /** Flush split: overlay handle on the seam so it does not consume flex gap (extension + resizable). */
  const positionExtensionArtifactResizeHandle = () => {
    if (!artifactSplitRoot || !artifactResizeHandle) return;
    const ext = mount.classList.contains("persona-artifact-appearance-seamless");
    const ownerWin = mount.ownerDocument.defaultView ?? window;
    const mobile = ownerWin.innerWidth <= 640;
    if (!ext || mount.classList.contains("persona-artifact-narrow-host") || mobile) {
      artifactResizeHandle.style.removeProperty("position");
      artifactResizeHandle.style.removeProperty("left");
      artifactResizeHandle.style.removeProperty("top");
      artifactResizeHandle.style.removeProperty("bottom");
      artifactResizeHandle.style.removeProperty("width");
      artifactResizeHandle.style.removeProperty("z-index");
      return;
    }
    const chat = artifactSplitRoot.firstElementChild as HTMLElement | null;
    if (!chat || chat === artifactResizeHandle) return;
    const hitW = 10;
    artifactResizeHandle.style.position = "absolute";
    artifactResizeHandle.style.top = "0";
    artifactResizeHandle.style.bottom = "0";
    artifactResizeHandle.style.width = `${hitW}px`;
    artifactResizeHandle.style.zIndex = "5";
    const left = chat.offsetWidth - hitW / 2;
    artifactResizeHandle.style.left = `${Math.max(0, left)}px`;
  };

  /** No-op until artifact pane is created; replaced below when artifacts are enabled. */
  let applyLauncherArtifactPanelWidth: () => void = () => {};

  const syncArtifactPane = () => {
    if (!artifactPaneApi || !artifactsSidebarEnabled(config)) return;
    applyArtifactLayoutCssVars(mount, config);
    applyArtifactPaneAppearance(mount, config);
    applyLauncherArtifactPanelWidth();
    const threshold = config.features?.artifacts?.layout?.narrowHostMaxWidth ?? 520;
    const w = panel.getBoundingClientRect().width || 0;
    mount.classList.toggle("persona-artifact-narrow-host", w > 0 && w <= threshold);
    // Thread the single source of truth for "pane surface is shown" into the
    // pane BEFORE update() so it renders lazily: in inline/card display modes
    // the pane stays hidden and must not build a second sandboxed artifact
    // iframe (which would execute artifact scripts twice). The pane records
    // state while hidden and renders on the next reveal. Set first so an
    // update() that arrives while hidden is skipped, not rendered-then-hidden.
    artifactPaneApi.setVisible(artifactPaneVisible());
    artifactPaneApi.update(lastArtifactsState);
    if (artifactsPaneUserHidden) {
      artifactPaneApi.setMobileOpen(false);
      artifactPaneApi.element.classList.add("persona-hidden");
      artifactPaneApi.backdrop?.classList.add("persona-hidden");
      artifactPaneExpanded = false;
      artifactPaneExpandedPinned = false;
    } else if (lastArtifactsState.artifacts.length > 0 && artifactPaneCanShow()) {
      // User chose “show” again (e.g. programmatic showArtifacts): clear dismiss chrome
      // and force drawer open so narrow-host / mobile slide-out is not stuck off-screen.
      // Artifacts whose display mode is "card" or "inline" don't auto-open the
      // pane (artifactPaneCanShow); it stays hidden until an explicit open or
      // until a "panel"-mode artifact arrives.
      artifactPaneApi.element.classList.remove("persona-hidden");
      artifactPaneApi.setMobileOpen(true);
    } else {
      // The pane's own update() unhides itself whenever records exist
      // (applyLayoutVisibility), so re-assert the gate here: card/inline-mode
      // artifacts keep the pane hidden until an explicit open.
      artifactPaneApi.setMobileOpen(false);
      artifactPaneApi.element.classList.add("persona-hidden");
      artifactPaneApi.backdrop?.classList.add("persona-hidden");
      artifactPaneExpanded = false;
      artifactPaneExpandedPinned = false;
    }
    // Re-read the toggle config on every sync so a live config.update() can
    // reveal/remove the button (the pane itself is built once). Disabling the
    // toggle while expanded also collapses the pane — unless the expansion is
    // pinned (inline Expand): that fullscreen request stands on its own and
    // exits via Close.
    const expandToggleEnabled = config.features?.artifacts?.layout?.showExpandToggle === true;
    artifactPaneApi.setExpandToggleVisible(expandToggleEnabled);
    artifactPaneApi.setCopyButtonVisible(
      config.features?.artifacts?.layout?.showCopyButton === true
    );
    artifactPaneApi.setCustomActions(config.features?.artifacts?.toolbarActions ?? []);
    if (!expandToggleEnabled && !artifactPaneExpandedPinned) artifactPaneExpanded = false;
    // Run the resizer stash/restore once per expanded-state transition: the
    // resizer's inline width/maxWidth beats the expanded class, so clear it while
    // expanded and put it back on collapse.
    if (artifactPaneExpanded !== artifactExpandedApplied) {
      const paneEl = artifactPaneApi.element;
      if (artifactPaneExpanded) {
        artifactStashedWidth = paneEl.style.width;
        artifactStashedMaxWidth = paneEl.style.maxWidth;
        paneEl.style.removeProperty("width");
        paneEl.style.removeProperty("max-width");
      } else {
        if (artifactStashedWidth) paneEl.style.width = artifactStashedWidth;
        if (artifactStashedMaxWidth) paneEl.style.maxWidth = artifactStashedMaxWidth;
        artifactStashedWidth = "";
        artifactStashedMaxWidth = "";
      }
      artifactExpandedApplied = artifactPaneExpanded;
    }
    mount.classList.toggle("persona-artifact-expanded", artifactPaneExpanded);
    artifactPaneApi.setExpanded(artifactPaneExpanded);
    reconcileArtifactResize();
  };

  if (artifactsSidebarEnabled(config)) {
    panel.style.position = "relative";
    const chatColumn = createElement(
      "div",
      "persona-flex persona-flex-1 persona-flex-col persona-min-w-0 persona-min-h-0"
    );
    const splitRoot = createElement(
      "div",
      "persona-flex persona-h-full persona-w-full persona-min-h-0 persona-artifact-split-root"
    );
    chatColumn.appendChild(container);
    artifactPaneApi = createArtifactPane(config, {
      onSelect: (id) => sessionRef.current?.selectArtifact(id),
      onDismiss: () => {
        artifactsPaneUserHidden = true;
        syncArtifactPane();
      },
      onToggleExpand: () => {
        const next = !artifactPaneExpanded;
        const artifactId =
          lastArtifactsState.selectedId ??
          lastArtifactsState.artifacts[lastArtifactsState.artifacts.length - 1]?.id ??
          null;
        const prevented = config.features?.artifacts?.onArtifactAction?.({
          type: "expand",
          artifactId,
          expanded: next,
        });
        if (prevented === true) return;
        artifactPaneExpanded = next;
        if (!next) artifactPaneExpandedPinned = false;
        syncArtifactPane();
      }
    });
    artifactPaneApi.element.classList.add("persona-hidden");
    artifactSplitRoot = splitRoot;
    splitRoot.appendChild(chatColumn);
    splitRoot.appendChild(artifactPaneApi.element);
    if (artifactPaneApi.backdrop) {
      panel.appendChild(artifactPaneApi.backdrop);
    }
    panel.appendChild(splitRoot);

    reconcileArtifactResize = () => {
      if (!artifactSplitRoot || !artifactPaneApi) return;
      const want = config.features?.artifacts?.layout?.resizable === true;
      if (!want) {
        artifactResizeUnbind?.();
        artifactResizeUnbind = null;
        stopArtifactResizePointer();
        if (artifactResizeHandle) {
          artifactResizeHandle.remove();
          artifactResizeHandle = null;
        }
        artifactPaneApi.element.style.removeProperty("width");
        artifactPaneApi.element.style.removeProperty("maxWidth");
        return;
      }
      if (!artifactResizeHandle) {
        const handle = createElement(
          "div",
          "persona-artifact-split-handle persona-shrink-0 persona-h-full"
        );
        handle.setAttribute("role", "separator");
        handle.setAttribute("aria-orientation", "vertical");
        handle.setAttribute("aria-label", "Resize artifacts panel");
        handle.tabIndex = 0;

        const doc = mount.ownerDocument;
        const win = doc.defaultView ?? window;

        const onPointerDown = (e: PointerEvent) => {
          if (!artifactPaneApi || e.button !== 0) return;
          if (mount.classList.contains("persona-artifact-narrow-host")) return;
          if (mount.classList.contains("persona-artifact-expanded")) return;
          if (win.innerWidth <= 640) return;
          e.preventDefault();
          stopArtifactResizePointer();
          const startX = e.clientX;
          const startW = artifactPaneApi.element.getBoundingClientRect().width;
          const layout = config.features?.artifacts?.layout;
          const onMove = (ev: PointerEvent) => {
            const splitW = artifactSplitRoot!.getBoundingClientRect().width;
            const extensionChrome = mount.classList.contains("persona-artifact-appearance-seamless");
            const gapPx = extensionChrome ? 0 : readFlexGapPx(artifactSplitRoot!, win);
            const handleW = extensionChrome ? 0 : handle.getBoundingClientRect().width || 6;
            // Handle is left of the artifact: drag left widens artifact, drag right narrows it.
            const next = startW - (ev.clientX - startX);
            const clamped = resolveArtifactPaneWidthPx(
              next,
              splitW,
              gapPx,
              handleW,
              layout?.resizableMinWidth,
              layout?.resizableMaxWidth
            );
            artifactPaneApi!.element.style.width = `${clamped}px`;
            artifactPaneApi!.element.style.maxWidth = "none";
            positionExtensionArtifactResizeHandle();
          };
          const onUp = () => {
            doc.removeEventListener("pointermove", onMove);
            doc.removeEventListener("pointerup", onUp);
            doc.removeEventListener("pointercancel", onUp);
            artifactResizeDocEnd = null;
            try {
              handle.releasePointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
          };
          artifactResizeDocEnd = onUp;
          doc.addEventListener("pointermove", onMove);
          doc.addEventListener("pointerup", onUp);
          doc.addEventListener("pointercancel", onUp);
          try {
            handle.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        };

        handle.addEventListener("pointerdown", onPointerDown);
        artifactResizeHandle = handle;
        artifactSplitRoot.insertBefore(handle, artifactPaneApi.element);
        artifactResizeUnbind = () => {
          handle.removeEventListener("pointerdown", onPointerDown);
        };
      }
      if (artifactResizeHandle) {
        const has = artifactPaneVisible();
        artifactResizeHandle.classList.toggle("persona-hidden", !has);
        positionExtensionArtifactResizeHandle();
      }
    };

    applyLauncherArtifactPanelWidth = () => {
      if (!launcherEnabled || !artifactPaneApi) return;
      const sidebarMode = config.launcher?.sidebarMode ?? false;
      if (sidebarMode) return;
      if (isDockedMountMode(config) && resolveDockConfig(config).reveal === "emerge") return;
      const ownerWindow = mount.ownerDocument.defaultView ?? window;
      const mobileFullscreen = config.launcher?.mobileFullscreen ?? true;
      const mobileBreakpoint = config.launcher?.mobileBreakpoint ?? 640;
      if (mobileFullscreen && ownerWindow.innerWidth <= mobileBreakpoint) return;
      if (!shouldExpandLauncherForArtifacts(config, launcherEnabled)) return;

      const base = config.launcher?.width ?? config.launcherWidth ?? DEFAULT_FLOATING_LAUNCHER_WIDTH;
      const expanded =
        config.features?.artifacts?.layout?.expandedPanelWidth ??
        "min(720px, calc(100vw - 24px))";
      const hasVisible = artifactPaneVisible();
      if (hasVisible) {
        panel.style.width = expanded;
        panel.style.maxWidth = expanded;
      } else {
        panel.style.width = base;
        panel.style.maxWidth = base;
      }
    };

    if (typeof ResizeObserver !== "undefined") {
      artifactPanelResizeObs = new ResizeObserver(() => {
        syncArtifactPane();
      });
      artifactPanelResizeObs.observe(panel);
    }
  } else {
    panel.appendChild(container);
  }

  // Composer-bar mode: the pill (footer) and peek banner live in a
  // viewport-fixed sibling of the wrapper (`pillRoot`) so they're
  // independent of both the wrapper's geometry transitions and the panel's
  // optional artifact split layout. Critical for modal mode: the wrapper
  // there has `transform: translate(-50%, -50%)`, which would establish a
  // containing block trapping any `position: fixed` descendant.
  //
  // Order inside pillRoot: peekBanner (slim row above pill) → footer (pill).
  // pillRoot's `gap` spaces them; the peek is hidden by default until ui.ts
  // toggles `.persona-pill-peek--visible` based on streaming/hover/open state.
  if (isComposerBar() && pillRoot) {
    if (panelElements.peekBanner) {
      pillRoot.appendChild(panelElements.peekBanner);
    }
    pillRoot.appendChild(footer);
  }
  mount.appendChild(wrapper);
  // pillRoot is mounted *after* wrapper so it naturally stacks on top
  // when both share the same z-index (e.g. fullscreen mode where the
  // pill should float above the chat panel chrome).
  if (pillRoot) {
    mount.appendChild(pillRoot);
  }

  // Apply full-height and sidebar styles if enabled
  // This ensures the widget fills its container height with proper flex layout
  const applyFullHeightStyles = () => {
    // Composer-bar mode owns its own sizing/chrome. Geometry comes from
    // `applyComposerBarGeometry()` (per-state inline on the wrapper), the
    // pill carries its own chrome via `.persona-pill-composer`, and the
    // expanded chat panel chrome (border + radius + shadow + bg) is painted
    // inline on the `container` (NOT the panel: the panel is a transparent
    // flex column with a gap so the pill renders as a sibling below the
    // chrome). Same theme contract as floating mode
    // (`theme.components.panel.{shadow,border,borderRadius}`); collapsed
    // clears it (container is hidden via display:none anyway), expanded
    // re-applies it, with the `fullscreen` variant intentionally chrome-less.
    if (isComposerBar()) {
      panel.style.width = "100%";
      panel.style.maxWidth = "100%";
      const cb = config.launcher?.composerBar ?? {};
      const isExpanded = wrapper.dataset.state === "expanded";
      const expandedSize = cb.expandedSize ?? "anchored";
      const wantsChrome = isExpanded && expandedSize !== "fullscreen";
      if (!wantsChrome) {
        container.style.background = "";
        container.style.border = "";
        container.style.borderRadius = "";
        container.style.overflow = "";
        container.style.boxShadow = "";
        return;
      }
      const panelPartial = config.theme?.components?.panel;
      const activeTheme = getActiveTheme(config);
      const resolveCb = (raw: string | undefined, fallback: string): string => {
        if (raw == null || raw === "") return fallback;
        return resolveTokenValue(activeTheme, raw) ?? raw;
      };
      const defaultBorder = "1px solid var(--persona-border)";
      const defaultShadow = "var(--persona-palette-shadows-xl, 0 25px 50px -12px rgba(0, 0, 0, 0.25))";
      const defaultRadius = "var(--persona-panel-radius, var(--persona-radius-xl, 0.75rem))";
      container.style.background = "var(--persona-surface, #ffffff)";
      container.style.border = resolveCb(panelPartial?.border, defaultBorder);
      container.style.borderRadius = resolveCb(panelPartial?.borderRadius, defaultRadius);
      container.style.boxShadow = resolveCb(panelPartial?.shadow, defaultShadow);
      container.style.overflow = "hidden";
      return;
    }
    const dockedMode = isDockedMountMode(config);
    const sidebarMode = config.launcher?.sidebarMode ?? false;
    const fullHeight = dockedMode || sidebarMode || (config.launcher?.fullHeight ?? false);
    /** Script-tag / div embed: launcher off, host supplies a sized mount. */
    const isInlineEmbed = config.launcher?.enabled === false;
    const panelPartial = config.theme?.components?.panel;
    const activeTheme = getActiveTheme(config);
    const resolvePanelChrome = (raw: string | undefined, fallback: string): string => {
      if (raw == null || raw === "") return fallback;
      return resolveTokenValue(activeTheme, raw) ?? raw;
    };

    // Mobile fullscreen detection
    // Use mount's ownerDocument window to get correct viewport width when widget is inside an iframe
    const ownerWindow = mount.ownerDocument.defaultView ?? window;
    const mobileFullscreen = config.launcher?.mobileFullscreen ?? true;
    const mobileBreakpoint = config.launcher?.mobileBreakpoint ?? 640;
    const isMobileViewport = ownerWindow.innerWidth <= mobileBreakpoint;
    const shouldGoFullscreen = mobileFullscreen && isMobileViewport && launcherEnabled;

    // Determine panel styling based on mode, with theme overrides
    const position = config.launcher?.position ?? 'bottom-left';
    const isLeftSidebar = position === 'bottom-left' || position === 'top-left';
    const overlayZIndex = config.launcher?.zIndex ?? DEFAULT_OVERLAY_Z_INDEX;

    // Default values based on mode
    let defaultPanelBorder = (sidebarMode || shouldGoFullscreen) ? 'none' : '1px solid var(--persona-border)';
    let defaultPanelShadow = shouldGoFullscreen
      ? 'none'
      : sidebarMode
        ? (isLeftSidebar ? 'var(--persona-palette-shadows-sidebar-left, 2px 0 12px rgba(0, 0, 0, 0.08))' : 'var(--persona-palette-shadows-sidebar-right, -2px 0 12px rgba(0, 0, 0, 0.08))')
        : 'var(--persona-palette-shadows-xl, 0 25px 50px -12px rgba(0, 0, 0, 0.25))';

    if (dockedMode && !shouldGoFullscreen) {
      defaultPanelShadow = 'none';
      defaultPanelBorder = 'none';
    }
    const defaultPanelBorderRadius = (sidebarMode || shouldGoFullscreen)
      ? '0'
      : 'var(--persona-panel-radius, var(--persona-radius-xl, 0.75rem))';

    // Apply theme overrides or defaults (components.panel.*)
    const panelBorder = resolvePanelChrome(panelPartial?.border, defaultPanelBorder);
    const panelShadow = resolvePanelChrome(panelPartial?.shadow, defaultPanelShadow);
    const panelBorderRadius = resolvePanelChrome(panelPartial?.borderRadius, defaultPanelBorderRadius);

    // Clearing body.style.cssText below wipes the inline `flex: 1 1 0%` /
    // `min-height: 0` / `overflow-y: auto` that make the messages area a
    // scroll container. Between the reset and the mode-specific reapply,
    // the body's clientHeight == scrollHeight momentarily, so the browser
    // clamps scrollTop to 0, and a synchronous restore at the end of this
    // function runs before layout has reflowed, so the write is also
    // clamped. Defer the restore to the next frame, once the reapplied
    // styles have produced a scrollable container again.
    const prevBodyScrollTop = body.scrollTop;

    // Reset all inline styles first to handle mode toggling
    // This ensures styles don't persist when switching between modes
    mount.style.cssText = '';
    wrapper.style.cssText = '';
    panel.style.cssText = '';
    container.style.cssText = '';
    body.style.cssText = '';
    footer.style.cssText = '';

    // Preserve the event-stream takeover across a layout-mode change. The
    // cssText reset above wiped the `display: none` that toggleEventStreamOn
    // set on the messages body, and none of the per-mode reapply branches below
    // touch `display` — so without this the messages would reappear and stack
    // above the event panel when the window crosses the fullscreen breakpoint.
    if (eventStreamVisible) {
      body.style.display = "none";
    }

    const restoreBodyScrollTop = (): void => {
      if (prevBodyScrollTop <= 0) return;
      const ownerWindow = body.ownerDocument.defaultView ?? window;
      ownerWindow.requestAnimationFrame(() => {
        if (body.scrollTop === prevBodyScrollTop) return;
        // If scrollHeight collapsed (content actually shrank), don't fight it
        const maxScrollTop = body.scrollHeight - body.clientHeight;
        if (maxScrollTop <= 0) return;
        body.scrollTop = Math.min(prevBodyScrollTop, maxScrollTop);
      });
    };
    
    // Mobile fullscreen: fill entire viewport with no radius/shadow/margins
    if (shouldGoFullscreen) {
      // Remove position offset classes
      wrapper.classList.remove(
        'persona-bottom-6', 'persona-right-6', 'persona-left-6', 'persona-top-6',
        'persona-bottom-4', 'persona-right-4', 'persona-left-4', 'persona-top-4'
      );

      // Wrapper: fill entire viewport
      wrapper.style.cssText = `
        position: fixed !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        max-height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        z-index: ${overlayZIndex} !important;
        background-color: var(--persona-surface, #ffffff) !important;
      `;

      // Panel: fill wrapper, no radius/shadow
      panel.style.cssText = `
        position: relative !important;
        display: flex !important;
        flex-direction: column !important;
        flex: 1 1 0% !important;
        width: 100% !important;
        max-width: 100% !important;
        height: 100% !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        box-shadow: none !important;
        border-radius: 0 !important;
      `;

      // Container: fill panel, no radius/border
      container.style.cssText = `
        display: flex !important;
        flex-direction: column !important;
        flex: 1 1 0% !important;
        width: 100% !important;
        height: 100% !important;
        min-height: 0 !important;
        max-height: 100% !important;
        overflow: hidden !important;
        border-radius: 0 !important;
        border: none !important;
      `;

      // Body: scrollable messages
      body.style.flex = '1 1 0%';
      body.style.minHeight = '0';
      body.style.overflowY = 'auto';

      // Footer: pinned at bottom
      footer.style.flexShrink = '0';

      wasMobileFullscreen = true;
      restoreBodyScrollTop();
      return; // Skip remaining mode logic
    }

    // Re-apply panel width/maxWidth from initial setup
    const launcherWidth = config?.launcher?.width ?? config?.launcherWidth;
    const width = launcherWidth ?? DEFAULT_FLOATING_LAUNCHER_WIDTH;
    if (!sidebarMode && !dockedMode) {
      if (isInlineEmbed && fullHeight) {
        panel.style.width = "100%";
        panel.style.maxWidth = "100%";
      } else {
        panel.style.width = width;
        panel.style.maxWidth = width;
      }
    } else if (dockedMode) {
      const dockReveal = resolveDockConfig(config).reveal;
      if (dockReveal === "emerge") {
        const dw = resolveDockConfig(config).width;
        panel.style.width = dw;
        panel.style.maxWidth = dw;
      } else {
        panel.style.width = "100%";
        panel.style.maxWidth = "100%";
      }
    }
    applyLauncherArtifactPanelWidth();

    // Apply panel styling
    // Box-shadow is applied to panel (parent) instead of container to avoid
    // rendering artifacts when container has overflow:hidden + border-radius
    // Panel also gets border-radius to make the shadow follow the rounded corners
    panel.style.boxShadow = panelShadow;
    panel.style.borderRadius = panelBorderRadius;
    container.style.border = panelBorder;
    container.style.borderRadius = panelBorderRadius;

    if (dockedMode && !shouldGoFullscreen && panelPartial?.border === undefined) {
      container.style.border = 'none';
      const dockSide = resolveDockConfig(config).side;
      if (dockSide === 'right') {
        container.style.borderLeft = '1px solid var(--persona-border)';
      } else {
        container.style.borderRight = '1px solid var(--persona-border)';
      }
    }

    if (fullHeight) {
      // Mount container
      mount.style.display = 'flex';
      mount.style.flexDirection = 'column';
      mount.style.height = '100%';
      mount.style.minHeight = '0';
      if (isInlineEmbed) {
        mount.style.width = '100%';
      }
      
      // Wrapper
      // - Inline embed: needs overflow:hidden to contain the flex layout
      // - Launcher mode: no overflow:hidden to allow panel's box-shadow to render fully
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.flex = '1 1 0%';
      wrapper.style.minHeight = '0';
      wrapper.style.maxHeight = '100%';
      wrapper.style.height = '100%';
      if (isInlineEmbed) {
        wrapper.style.overflow = 'hidden';
      }
      
      // Panel
      panel.style.display = 'flex';
      panel.style.flexDirection = 'column';
      panel.style.flex = '1 1 0%';
      panel.style.minHeight = '0';
      panel.style.maxHeight = '100%';
      panel.style.height = '100%';
      panel.style.overflow = 'hidden';
      
      // Main container
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.flex = '1 1 0%';
      container.style.minHeight = '0';
      container.style.maxHeight = '100%';
      container.style.overflow = 'hidden';
      
      // Body (scrollable messages area)
      body.style.flex = '1 1 0%';
      body.style.minHeight = '0';
      body.style.overflowY = 'auto';
      
      // Footer (composer) - should not shrink
      footer.style.flexShrink = '0';
    }
    
    // Handle positioning classes based on mode
    // First remove all position classes to reset state
    wrapper.classList.remove(
      'persona-bottom-6', 'persona-right-6', 'persona-left-6', 'persona-top-6',
      'persona-bottom-4', 'persona-right-4', 'persona-left-4', 'persona-top-4'
    );
    
    if (!sidebarMode && !isInlineEmbed && !dockedMode) {
      // Restore positioning classes when not in sidebar mode (launcher mode only)
      const positionClasses = positionMap[position as keyof typeof positionMap] ?? positionMap['bottom-right'];
      positionClasses.split(' ').forEach(cls => wrapper.classList.add(cls));
    }
    
    // Apply sidebar-specific styles
    if (sidebarMode) {
      const sidebarWidth = config.launcher?.sidebarWidth ?? '420px';
      
      // Wrapper - fixed position, flush with edges
      wrapper.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        bottom: 0 !important;
        width: ${sidebarWidth} !important;
        height: 100vh !important;
        max-height: 100vh !important;
        margin: 0 !important;
        padding: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        z-index: ${overlayZIndex} !important;
        ${isLeftSidebar ? 'left: 0 !important; right: auto !important;' : 'left: auto !important; right: 0 !important;'}
      `;
      
      // Panel - fill wrapper (override inline width/max-width from panel.ts)
      // Box-shadow is on panel to avoid rendering artifacts with container's overflow:hidden
      // Border-radius on panel ensures shadow follows rounded corners
      panel.style.cssText = `
        position: relative !important;
        display: flex !important;
        flex-direction: column !important;
        flex: 1 1 0% !important;
        width: 100% !important;
        max-width: 100% !important;
        height: 100% !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        box-shadow: ${panelShadow} !important;
        border-radius: ${panelBorderRadius} !important;
      `;
      // Force override any inline width/maxWidth that may be set elsewhere
      panel.style.setProperty('width', '100%', 'important');
      panel.style.setProperty('max-width', '100%', 'important');
      
      // Container - apply configurable styles with sidebar layout
      // Note: box-shadow is on panel, not container
      container.style.cssText = `
        display: flex !important;
        flex-direction: column !important;
        flex: 1 1 0% !important;
        width: 100% !important;
        height: 100% !important;
        min-height: 0 !important;
        max-height: 100% !important;
        overflow: hidden !important;
        border-radius: ${panelBorderRadius} !important;
        border: ${panelBorder} !important;
      `;
      
      // Remove footer border in sidebar mode
      footer.style.cssText = `
        flex-shrink: 0 !important;
        border-top: none !important;
        padding: 8px 16px 12px 16px !important;
      `;
    }
    
    // Apply max-height constraints to wrapper to prevent expanding past viewport top
    // Use both -moz-available (Firefox) and stretch (standard) for cross-browser support
    // Append to cssText to allow multiple fallback values for the same property
    // Only apply to launcher mode (not sidebar or inline embed)
    if (!isInlineEmbed && !dockedMode) {
      const maxHeightStyles = 'max-height: -moz-available !important; max-height: stretch !important;';
      const paddingStyles = sidebarMode ? '' : 'padding-top: 1.25em !important;';
      const zIndexStyles = !sidebarMode
        ? `z-index: ${config.launcher?.zIndex ?? DEFAULT_OVERLAY_Z_INDEX} !important;`
        : '';
      wrapper.style.cssText += maxHeightStyles + paddingStyles + zIndexStyles;
    }

    restoreBodyScrollTop();
  };
  applyFullHeightStyles();
  // Apply theme variables after applyFullHeightStyles since it resets mount.style.cssText
  applyThemeVariables(mount, config);
  applyArtifactLayoutCssVars(mount, config);
  applyArtifactPaneAppearance(mount, config);

  const destroyCallbacks: Array<() => void> = [];
  // Clean up the document-level digit-key shortcut listener registered earlier.
  destroyCallbacks.push(() => {
    document.removeEventListener("keydown", handleAskUserDigitKey);
  });
  // Clear any pending live-region announcement timer on teardown.
  destroyCallbacks.push(() => {
    if (announceTimer !== null) clearTimeout(announceTimer);
  });

  let teardownHostStacking: (() => void) | null = null;
  let releaseScrollLock: (() => void) | null = null;

  destroyCallbacks.push(() => {
    teardownHostStacking?.();
    teardownHostStacking = null;
    releaseScrollLock?.();
    releaseScrollLock = null;
  });

  if (artifactPanelResizeObs) {
    destroyCallbacks.push(() => {
      artifactPanelResizeObs?.disconnect();
      artifactPanelResizeObs = null;
    });
  }

  destroyCallbacks.push(() => {
    artifactResizeUnbind?.();
    artifactResizeUnbind = null;
    stopArtifactResizePointer();
    if (artifactResizeHandle) {
      artifactResizeHandle.remove();
      artifactResizeHandle = null;
    }
    artifactPaneApi?.element.style.removeProperty("width");
    artifactPaneApi?.element.style.removeProperty("maxWidth");
  });

  // Event stream cleanup
  if (showEventStreamToggle) {
    destroyCallbacks.push(() => {
      if (eventStreamRAF !== null) {
        cancelAnimationFrame(eventStreamRAF);
        eventStreamRAF = null;
      }
      eventStreamView?.destroy();
      eventStreamView = null;
      eventStreamBuffer?.destroy();
      eventStreamBuffer = null;
      eventStreamStore = null;
    });
  }

  // Set up theme observer for auto color scheme detection
  let cleanupThemeObserver: (() => void) | null = null;
  const setupThemeObserver = () => {
    // Clean up existing observer if any
    if (cleanupThemeObserver) {
      cleanupThemeObserver();
      cleanupThemeObserver = null;
    }
    // Set up new observer if colorScheme is 'auto'
    if (config.colorScheme === 'auto') {
      cleanupThemeObserver = createThemeObserver(() => {
        // Re-apply theme when color scheme changes
        applyThemeVariables(mount, config);
      });
    }
  };
  setupThemeObserver();
  destroyCallbacks.push(() => {
    if (cleanupThemeObserver) {
      cleanupThemeObserver();
      cleanupThemeObserver = null;
    }
  });

  // Release this widget's pending built-in approval listeners + "Allow once"
  // popovers if it's destroyed while an approval is still open. Scoped to this
  // instance's state, so other widgets on the page are unaffected.
  destroyCallbacks.push(teardownBuiltInApprovals);

  // Activate the stream-animation plugin for this widget instance. Plugins
  // with `styles` inject their CSS into the widget root once; plugins with
  // `onAttach` (e.g., glyph-cycle's MutationObserver for real glyph tick
  // loops) can register long-lived DOM listeners here. Detach callbacks are
  // deferred to widget destroy.
  const streamAnimationConfig = config.features?.streamAnimation;
  if (streamAnimationConfig?.type && streamAnimationConfig.type !== "none") {
    const plugin = resolveStreamAnimationPlugin(
      streamAnimationConfig.type,
      streamAnimationConfig.plugins
    );
    if (plugin) {
      ensurePluginActive(plugin, mount);
      destroyCallbacks.push(() => detachAllPlugins(mount));
    }
  }

  const suggestionsManager = createSuggestions(suggestions);
  let closeHandler: (() => void) | null = null;
  let session: AgentWidgetSession;

  // Single render rule for the suggestions row, shared by the message-change,
  // initial-paint, and config-update paths: agent-pushed `suggest_replies`
  // chips win when the latest-turn rule yields any (last suggest_replies tool
  // message with no user message after it); otherwise static config chips
  // keep their before-first-user-message behavior. Config updates MUST route
  // through here too: re-rendering with only `config.suggestionChips` would
  // drop a live agent chip row until the next message change.
  const renderSuggestions = (messages?: AgentWidgetMessage[]) => {
    if (!session) return;
    const current = messages ?? session.getMessages();
    const agentChips =
      config.features?.suggestReplies?.enabled !== false
        ? latestAgentSuggestions(current)
        : null;
    if (agentChips) {
      suggestionsManager.render(
        agentChips,
        session,
        textarea,
        current,
        config.suggestionChipsConfig,
        { agentPushed: true }
      );
    } else if (current.some((msg) => msg.role === "user")) {
      // Hide suggestions once a user message exists.
      suggestionsManager.render([], session, textarea, current);
    } else {
      suggestionsManager.render(
        config.suggestionChips,
        session,
        textarea,
        current,
        config.suggestionChipsConfig
      );
    }
  };
  let isStreaming = false;
  const messageCache = createMessageCache();
  // Tracks the last fingerprint we rendered a plugin-rendered ask_user_question
  // bubble for, per message id. Lets us skip unnecessary rebuilds across
  // re-renders so user state inside the plugin (typed text, focus) survives.
  const lastAskBubbleFingerprint = new Map<string, string>();
  // Same idea for component-directive bubbles (registered custom components
  // rendered from JSON directives). The renderer's element is injected into the
  // live DOM post-morph so its event listeners survive; this map gates the
  // expensive rebuild on fingerprint change so user state inside the rendered
  // component (e.g. partially-filled form inputs) is not wiped on every pass.
  const lastComponentDirectiveFingerprint = new Map<string, string>();
  // Same idea for plugin-rendered approval bubbles (`renderApproval`). The
  // custom element is injected into the live DOM post-morph so its event
  // listeners (Approve/Deny, an expandable parameters accordion, etc.) survive;
  // this map gates the rebuild on fingerprint change so interactive state (e.g.
  // a collapsed accordion) is not reset on every pass while the approval is
  // pending.
  const lastApprovalBubbleFingerprint = new Map<string, string>();
  let configVersion = 0;
  // Whether the markdown parsers (marked + dompurify) were already loaded when
  // this widget mounted. False only on the IIFE/CDN lazy path before the
  // `markdown-parsers.js` chunk resolves; in that window messages render as
  // escaped plain text and are re-rendered once the chunk lands (see below).
  const markdownReadyAtInit = getMarkdownParsersSync() !== null;
  const autoFollow = createFollowStateController();
  let lastScrollTop = 0;
  let scrollRAF: number | null = null;
  let isAutoScrolling = false;
  let hasPendingAutoScroll = false;
  // Messages that arrived while the user was away from the latest content;
  // shown as a badge on the scroll-to-bottom affordance.
  let newMessagesSincePause = 0;
  // Live anchor-top state for the current turn (null when not anchored).
  let anchorState: {
    initialSpacerHeight: number;
    contentHeightAtAnchor: number;
    spacerHeight: number;
  } | null = null;
  let anchorRAF: number | null = null;
  // Seeded send-detection so restored history doesn't read as a fresh send.
  let scrollSendSeeded = false;
  let suppressScrollSend = false;
  let lastSentUserMessageId: string | null = null;
  // anchor-top no-anchor fallback: anchor-top pins on a USER send. An assistant
  // message that streams when NO user send has anchored the conversation yet
  // (first-load / proactive-first streaming) has nothing to anchor to, so it
  // falls back to follow-to-bottom — otherwise its content streams in
  // off-screen. `true` by default (nothing anchored yet); a user send clears it
  // and the anchor takes over. Inert in follow/none mode (see
  // `isFollowEffective`).
  let followFallbackActive = true;
  // True once a user send has anchored the current conversation (until the chat
  // is cleared). While anchored, follow-on assistant content — the response, a
  // multi-part reply, an injected embed (tweet/image), a tool result — stays
  // pinned and never re-arms the fallback, so a late-loading embed can't yank
  // the viewport down to the bottom.
  let currentTurnAnchored = false;
  // Dedupes assistant-turn detection across token-by-token re-renders.
  let lastHandledAssistantId: string | null = null;

  // Scroll events caused by layout, scroll anchoring, and smooth-scroll
  // easing can easily move by a couple pixels. Keep manual wheel intent
  // responsive, but require a slightly larger raw scroll delta before we
  // treat a plain scroll event as the user breaking away.
  const USER_SCROLL_THRESHOLD = 4;
  const BOTTOM_THRESHOLD = 24;
  const AUTO_SCROLL_SNAP_THRESHOLD = 80;
  const messageState = new Map<
    string,
    { streaming?: boolean; role: AgentWidgetMessage["role"] }
  >();
  const voiceState = {
    active: false,
    manuallyDeactivated: false,
    lastUserMessageWasVoice: false,
    lastUserMessageId: null as string | null
  };
  const voiceAutoResumeMode = config.voiceRecognition?.autoResume ?? false;
  const emitVoiceState = (source: AgentWidgetVoiceStateEvent["source"]) => {
    eventBus.emit("voice:state", {
      active: voiceState.active,
      source,
      timestamp: Date.now()
    });
  };
  const persistVoiceMetadata = () => {
    updateSessionMetadata((prev) => ({
      ...prev,
      voiceState: {
        active: voiceState.active,
        timestamp: Date.now(),
        manuallyDeactivated: voiceState.manuallyDeactivated
      }
    }));
  };
  const maybeRestoreVoiceFromMetadata = () => {
    if (config.voiceRecognition?.enabled === false) return;
    const rawVoiceState = ensureRecord((persistentMetadata as any).voiceState);
    const wasActive = Boolean(rawVoiceState.active);
    const timestamp = Number(rawVoiceState.timestamp ?? 0);
    voiceState.manuallyDeactivated = Boolean(rawVoiceState.manuallyDeactivated);
    if (wasActive && Date.now() - timestamp < VOICE_STATE_RESTORE_WINDOW) {
      setTimeout(() => {
        if (!voiceState.active) {
          voiceState.manuallyDeactivated = false;
          if (config.voiceRecognition?.provider?.type === 'runtype') {
            session.toggleVoice().then(() => {
              voiceState.active = session.isVoiceActive();
              emitVoiceState("restore");
              if (session.isVoiceActive()) applyRuntypeMicRecordingStyles();
            });
          } else {
            startVoiceRecognition("restore");
          }
        }
      }, 1000);
    }
  };

  const getMessagesForPersistence = () =>
    session 
      ? stripStreamingFromMessages(session.getMessages()).filter(msg => !(msg as any).__skipPersist)
      : [];

  let storageMutationTail: Promise<void> | null = null;

  const reportStorageMutationError = (label: string, error: unknown) => {
    if (typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.error(label, error);
    }
  };

  const runStorageMutation = (
    mutation: () => void | Promise<void>,
    errorLabel: string
  ) => {
    const run = (): Promise<void> | null => {
      try {
        const result = mutation();
        if (!result || typeof (result as PromiseLike<void>).then !== "function") {
          return null;
        }
        return Promise.resolve(result).catch((error) => {
          reportStorageMutationError(errorLabel, error);
        });
      } catch (error) {
        reportStorageMutationError(errorLabel, error);
        return null;
      }
    };

    const prior = storageMutationTail;
    const next = prior
      ? prior.then(() => run() ?? undefined)
      : run();
    if (!next) return;

    const tail = next.finally(() => {
      if (storageMutationTail === tail) {
        storageMutationTail = null;
      }
    });
    storageMutationTail = tail;
  };

  function persistState(messagesOverride?: AgentWidgetMessage[]) {
    if (!storageAdapter?.save) return;

    // Allow saving even if session doesn't exist yet (for metadata during init)
    const messages = messagesOverride
      ? stripStreamingFromMessages(messagesOverride)
      : session
        ? getMessagesForPersistence()
        : [];

    const payload = {
      messages,
      metadata: persistentMetadata,
      artifacts: lastArtifactsState.artifacts,
      selectedArtifactId: lastArtifactsState.selectedId
    };
    runStorageMutation(
      () => storageAdapter.save!(payload),
      "[AgentWidget] Failed to persist state:"
    );
  }

  // Track ongoing smooth scroll animation
  let smoothScrollRAF: number | null = null;

  // Get the scrollable container using its unique ID
  const getScrollableContainer = (): HTMLElement => {
    // Use the unique ID for reliable selection
    const scrollable = wrapper.querySelector('#persona-scroll-container') as HTMLElement;
    // Fallback to body if ID not found (shouldn't happen, but safe fallback)
    return scrollable || body;
  };

  const cancelSmoothScroll = () => {
    if (smoothScrollRAF !== null) {
      cancelAnimationFrame(smoothScrollRAF);
      smoothScrollRAF = null;
    }
    isAutoScrolling = false;
  };

  const cancelAutoScroll = () => {
    if (scrollRAF !== null) {
      cancelAnimationFrame(scrollRAF);
      scrollRAF = null;
    }
    hasPendingAutoScroll = false;
    cancelSmoothScroll();
  };

  // True when a response is streaming in below the reader's current position,
  // i.e. content is arriving out of view. Drives the "still streaming" hint on
  // the scroll-to-bottom affordance (Principle 8: show what's happening out of
  // view). In anchor-top mode this is gated behind `showActivityWhilePinned`
  // so the historical "silent while pinned" behavior is preserved by default.
  const isStreamingOutOfView = () =>
    isStreaming &&
    isAwayFromLatest() &&
    (getScrollMode() !== "anchor-top" || isActivityWhilePinnedEnabled());

  const updateScrollToBottomCountBadge = () => {
    const base = getScrollToBottomLabel() || "Jump to latest";
    const streamingBelow = isStreamingOutOfView();
    scrollToBottomButton.toggleAttribute(
      "data-persona-scroll-to-bottom-streaming",
      streamingBelow
    );
    if (newMessagesSincePause > 0) {
      scrollToBottomCount.textContent = String(newMessagesSincePause);
      scrollToBottomCount.style.display = "";
      scrollToBottomButton.setAttribute(
        "aria-label",
        `${base} (${newMessagesSincePause} new)`
      );
    } else {
      scrollToBottomCount.textContent = "";
      scrollToBottomCount.style.display = "none";
      scrollToBottomButton.setAttribute(
        "aria-label",
        streamingBelow ? `${base} (response streaming below)` : base
      );
    }
  };

  const resetNewMessagesCount = () => {
    if (newMessagesSincePause === 0) return;
    newMessagesSincePause = 0;
    updateScrollToBottomCountBadge();
  };

  // Whether the user is currently away from the latest content: drives both
  // the scroll-to-bottom affordance and the new-messages badge. When following
  // the bottom (follow mode, or a no-anchor anchor-top fallback turn) that's
  // "auto-follow paused"; otherwise it's simply "not near the bottom".
  const isAwayFromLatest = () =>
    isFollowEffective()
      ? !autoFollow.isFollowing()
      : !isElementNearBottom(body, BOTTOM_THRESHOLD);

  const syncScrollToBottomButton = () => {
    if (!isScrollToBottomEnabled() || eventStreamVisible) {
      if (scrollToBottomButton.parentNode) {
        scrollToBottomButton.remove();
      }
      scrollToBottomButton.style.display = "none";
      return;
    }
    if (scrollToBottomButton.parentNode !== container) {
      container.appendChild(scrollToBottomButton);
    }
    updateScrollToBottomButtonOffset();
    const hasOverflow = getScrollBottomOffset(body) > 0;
    const show = hasOverflow && isAwayFromLatest();
    if (!show) {
      resetNewMessagesCount();
    } else {
      // Refresh the streaming-below hint while the affordance is visible.
      updateScrollToBottomCountBadge();
    }
    scrollToBottomButton.style.display = show ? "" : "none";
  };

  const pauseAutoScroll = () => {
    if (!autoFollow.pause()) return;
    cancelAutoScroll();
    syncScrollToBottomButton();
  };

  const resumeAutoScroll = () => {
    autoFollow.resume();
    resetNewMessagesCount();
    syncScrollToBottomButton();
  };

  const scheduleAutoScroll = (force = false) => {
    // Auto-follow applies in "follow" mode, and in anchor-top only for a
    // no-anchor fallback turn (see `isFollowEffective`). Anchored anchor-top
    // turns and "none" never chase the bottom during streaming.
    if (!isFollowEffective()) return;

    if (!autoFollow.isFollowing()) return;

    if (!force && !isStreaming) return;

    // Only cancel the pending schedule rAF: keep the ongoing smooth scroll
    // animation alive so isAutoScrolling stays true.  This prevents scroll
    // events fired by DOM morphing (between cancel and the next rAF) from
    // being misinterpreted as user-initiated upward scrolls that would
    // permanently pause auto-follow during streaming.
    // smoothScrollToBottom() already calls cancelSmoothScroll() internally
    // before starting its new animation.
    if (scrollRAF !== null) {
      cancelAnimationFrame(scrollRAF);
      scrollRAF = null;
    }

    // Treat the render -> next-rAF window as programmatic scrolling too.
    // This prevents layout/scroll-anchoring scroll events fired before the
    // actual smooth scroll starts from being misread as user intent.
    hasPendingAutoScroll = true;
    scrollRAF = requestAnimationFrame(() => {
      scrollRAF = null;
      hasPendingAutoScroll = false;
      if (!autoFollow.isFollowing()) return;
      smoothScrollToBottom(getScrollableContainer(), force ? 220 : 140);
    });
  };

  // Generic eased scroll animation. `resolveTarget` is re-read every frame so
  // a moving target (the bottom of a streaming transcript) stays accurate;
  // `shouldContinue` lets the caller cancel mid-flight (e.g. when auto-follow
  // pauses). Scroll events emitted by the animation are masked from the
  // user-intent detector via `isAutoScrolling`.
  const animateScrollTo = (
    element: HTMLElement,
    resolveTarget: () => number,
    duration: number,
    shouldContinue: () => boolean = () => true
  ) => {
    const start = element.scrollTop;
    let target = resolveTarget();
    let distance = target - start;

    // Cancel any ongoing smooth scroll animation
    cancelSmoothScroll();

    // Nothing to scroll: land exactly on target and skip the rAF loop. Avoids a
    // no-op animation when already in place (e.g. anchoring with zero overflow),
    // which also keeps environments with a synchronous rAF from spinning.
    if (Math.abs(distance) < 1) {
      isAutoScrolling = true;
      element.scrollTop = target;
      lastScrollTop = element.scrollTop;
      isAutoScrolling = false;
      return;
    }

    const startTime = performance.now();
    isAutoScrolling = true;

    // Easing function: ease-out cubic for smooth deceleration
    const easeOutCubic = (t: number): number => {
      return 1 - Math.pow(1 - t, 3);
    };

    const animate = (currentTime: number) => {
      if (!shouldContinue()) {
        cancelSmoothScroll();
        return;
      }

      // Recalculate target each frame in case scrollHeight changed
      const currentTarget = resolveTarget();
      if (currentTarget !== target) {
        target = currentTarget;
        distance = target - start;
      }

      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);

      const currentScroll = start + distance * eased;
      element.scrollTop = currentScroll;
      lastScrollTop = element.scrollTop;

      if (progress < 1) {
        smoothScrollRAF = requestAnimationFrame(animate);
      } else {
        // Ensure we end exactly at the target
        element.scrollTop = target;
        lastScrollTop = element.scrollTop;
        smoothScrollRAF = null;
        isAutoScrolling = false;
      }
    };

    smoothScrollRAF = requestAnimationFrame(animate);
  };

  // Custom smooth scroll animation with easing
  const smoothScrollToBottom = (element: HTMLElement, duration = 500) => {
    const distance = getScrollBottomOffset(element) - element.scrollTop;

    // If already at bottom or very close, skip animation to prevent glitch
    if (Math.abs(distance) < 1) {
      lastScrollTop = element.scrollTop;
      return;
    }

    // If the transcript has fallen noticeably behind, catch up immediately
    // instead of easing over multiple frames. This keeps fast streaming /
    // bursty tool and reasoning updates pinned to the bottom.
    if (Math.abs(distance) >= AUTO_SCROLL_SNAP_THRESHOLD) {
      cancelSmoothScroll();
      isAutoScrolling = true;
      element.scrollTop = getScrollBottomOffset(element);
      lastScrollTop = element.scrollTop;
      isAutoScrolling = false;
      return;
    }

    animateScrollTo(
      element,
      () => getScrollBottomOffset(element),
      duration,
      () => autoFollow.isFollowing()
    );
  };

  // Instant jump used for initial mount / panel open in non-follow scroll
  // modes (where scheduleAutoScroll is inert).
  const jumpToBottomInstant = () => {
    const element = getScrollableContainer();
    isAutoScrolling = true;
    element.scrollTop = getScrollBottomOffset(element);
    lastScrollTop = element.scrollTop;
    isAutoScrolling = false;
    syncScrollToBottomButton();
  };

  // Walk offsetParents up to `body` (the positioned scroll ancestor) to get a
  // node's top relative to the scroll content. offsetTop avoids skew from any
  // in-flight entrance transforms. Mirrors the anchor-top geometry.
  const offsetTopWithinBody = (el: HTMLElement): number => {
    let top = 0;
    let node: HTMLElement | null = el;
    while (node && node !== body) {
      top += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    return top;
  };

  // Principle 11: reopen where the reader left off. When `restorePosition` is
  // "last-user-turn" and there is pre-existing history, land with the last user
  // message pinned near the top of the viewport instead of jumping to the
  // absolute bottom. Returns true when it handled positioning. Opt-in; the
  // default ("bottom") returns false so callers fall back to jump-to-bottom.
  const restoreScrollPosition = (): boolean => {
    if (getScrollRestorePosition() !== "last-user-turn") return false;
    const messages = session?.getMessages() ?? [];
    // A *restore* only makes sense when reopening existing history; a fresh
    // (empty or single-turn) conversation should still start at the latest.
    if (messages.length < 2) return false;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return false;
    const escapedId =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(lastUser.id)
        : lastUser.id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const bubble = body.querySelector<HTMLElement>(
      `[data-message-id="${escapedId}"]`
    );
    if (!bubble) return false;
    const target = Math.min(
      Math.max(0, offsetTopWithinBody(bubble) - getAnchorTopOffset()),
      getScrollBottomOffset(body)
    );
    isAutoScrolling = true;
    body.scrollTop = target;
    lastScrollTop = body.scrollTop;
    isAutoScrolling = false;
    // In follow mode, deliberately landing above the bottom means we are not
    // following; pause so the first streamed token doesn't yank the reader
    // down. (In anchor-top/none there is no follow state to manage.)
    if (
      getScrollMode() === "follow" &&
      !isElementNearBottom(body, BOTTOM_THRESHOLD)
    ) {
      autoFollow.pause();
    }
    syncScrollToBottomButton();
    return true;
  };

  const setAnchorSpacerHeight = (height: number) => {
    anchorSpacer.style.height = `${Math.max(0, Math.round(height))}px`;
    if (anchorState) {
      anchorState.spacerHeight = Math.max(0, height);
    }
  };

  const resetAnchorState = () => {
    if (anchorRAF !== null) {
      cancelAnimationFrame(anchorRAF);
      anchorRAF = null;
    }
    // Also stop an in-flight anchor scroll animation: otherwise its
    // remaining frames keep easing scrollTop toward the stale anchor target
    // after a jump-to-latest, chat clear, or scroll-mode change.
    cancelSmoothScroll();
    anchorState = null;
    anchorSpacer.style.height = "0px";
  };

  // Anchor-top mode: scroll the just-sent user message to rest
  // `anchorTopOffset` px below the viewport top and hold it there while the
  // response streams in beneath it. Deferred one frame so the message bubble
  // has been rendered and laid out.
  const scheduleAnchorToUserMessage = (messageId: string) => {
    if (anchorRAF !== null) {
      cancelAnimationFrame(anchorRAF);
    }
    anchorRAF = requestAnimationFrame(() => {
      anchorRAF = null;
      const escapedId =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(messageId)
          : messageId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const bubble = body.querySelector<HTMLElement>(
        `[data-message-id="${escapedId}"]`
      );
      if (!bubble) return;

      // Bubble top relative to the scroll content. offsetTop is used instead
      // of getBoundingClientRect so in-flight entrance animations (transforms)
      // can't skew the target.
      const anchorOffsetTop = offsetTopWithinBody(bubble);

      const previousSpacerHeight = anchorState?.spacerHeight ?? 0;
      const contentHeight = body.scrollHeight - previousSpacerHeight;
      const { targetScrollTop, spacerHeight } = computeAnchorScrollState({
        anchorOffsetTop,
        topOffset: getAnchorTopOffset(),
        viewportHeight: body.clientHeight,
        contentHeight
      });

      anchorState = {
        initialSpacerHeight: spacerHeight,
        contentHeightAtAnchor: contentHeight,
        spacerHeight
      };
      setAnchorSpacerHeight(spacerHeight);
      animateScrollTo(body, () => targetScrollTop, 220);
    });
  };

  // Content growth handler (ResizeObserver-driven). In follow mode this is
  // what keeps the transcript pinned when content grows *without* a render
  // event: images/embeds finishing loading mid-stream, fonts swapping,
  // the panel or composer resizing. In anchor-top mode it gives spacer room
  // back as the streamed response grows (shrink-only, so total scroll height
  // stays constant and nothing jumps).
  const handleContentResize = () => {
    if (isFollowEffective()) {
      if (!autoFollow.isFollowing()) return;
      if (isElementNearBottom(body, 1)) return;
      scheduleAutoScroll(!isStreaming);
      return;
    }
    if (anchorState && anchorState.initialSpacerHeight > 0) {
      const currentContentHeight = body.scrollHeight - anchorState.spacerHeight;
      const next = computeShrunkSpacerHeight({
        initialSpacerHeight: anchorState.initialSpacerHeight,
        contentHeightAtAnchor: anchorState.contentHeightAtAnchor,
        currentContentHeight
      });
      if (next !== anchorState.spacerHeight) {
        setAnchorSpacerHeight(next);
      }
    }
    syncScrollToBottomButton();
  };

  // Reacts to a user message the user just sent (seeded so restored history
  // never triggers it). Follow mode re-sticks to the bottom even if the user
  // had scrolled up: sending is an unambiguous "take me to the latest"
  // signal. Anchor-top mode pins the sent message near the viewport top.
  const handleUserMessageSent = (messageId: string) => {
    const mode = getScrollMode();
    if (mode === "follow") {
      resumeAutoScroll();
      scheduleAutoScroll(true);
    } else if (mode === "anchor-top") {
      // A real anchor now drives the conversation: disarm the no-anchor
      // fallback. Every follow-on assistant message stays anchored until the
      // next user send.
      followFallbackActive = false;
      currentTurnAnchored = true;
      scheduleAnchorToUserMessage(messageId);
    }
  };

  // Reacts to a new assistant message that arrived without a fresh user send.
  // Only meaningful in anchor-top. While the conversation is anchored (a user
  // has sent at least once), follow-on assistant content — the response, a
  // multi-part reply, an injected embed, a tool result — keeps the anchor so a
  // late-loading embed never yanks the viewport. Only when nothing has anchored
  // yet (first-load / proactive-first streaming) does it fall back to
  // follow-to-bottom so the content isn't stranded off-screen.
  const handleAssistantTurnStarted = () => {
    if (getScrollMode() !== "anchor-top") return;
    if (currentTurnAnchored) {
      followFallbackActive = false;
      return;
    }
    followFallbackActive = true;
    resetAnchorState();
    resumeAutoScroll();
    scheduleAutoScroll(true);
  };

  const trackMessages = (messages: AgentWidgetMessage[]) => {
    const nextState = new Map<
      string,
      { streaming?: boolean; role: AgentWidgetMessage["role"] }
    >();

    messages.forEach((message) => {
      const previous = messageState.get(message.id);
      nextState.set(message.id, {
        streaming: message.streaming,
        role: message.role
      });

      if (!previous && message.role === "assistant") {
        eventBus.emit("assistant:message", message);
        // Count messages the user hasn't seen for the scroll-to-bottom badge.
        // Skipped in anchor-top (the user is already reading the latest turn
        // from its top, so a "new" count would normally mislead) and during
        // history hydration (restored messages aren't "missed"). When
        // `showActivityWhilePinned` is opted in, anchor-top *does* count so the
        // reader is told content is arriving offscreen below (Principle 8).
        if (
          !suppressScrollSend &&
          (getScrollMode() !== "anchor-top" || isActivityWhilePinnedEnabled()) &&
          isAwayFromLatest()
        ) {
          newMessagesSincePause += 1;
          updateScrollToBottomCountBadge();
          syncScrollToBottomButton();
          announce(
            newMessagesSincePause === 1
              ? "1 new message below."
              : `${newMessagesSincePause} new messages below.`
          );
        }
      }

      if (
        message.role === "assistant" &&
        previous?.streaming &&
        message.streaming === false
      ) {
        eventBus.emit("assistant:complete", message);
      }

      // Emit approval events
      if (message.variant === "approval" && message.approval) {
        if (!previous) {
          eventBus.emit("approval:requested", { approval: message.approval, message });
        } else if (message.approval.status !== "pending") {
          eventBus.emit("approval:resolved", { approval: message.approval, decision: message.approval.status });
        }
      }
    });

    messageState.clear();
    nextState.forEach((value, key) => {
      messageState.set(key, value);
    });
  };


  // Message rendering with plugin support (implementation)
  const renderMessagesWithPluginsImpl = (
    container: HTMLElement,
    messages: AgentWidgetMessage[],
    transform: MessageTransform
  ) => {
    // Build new content in a temporary container for morphing
    const tempContainer = document.createElement("div");

    // Create inline loading indicator renderer using priority chain: plugin -> config -> default
    const getInlineLoadingIndicatorRenderer = (): LoadingIndicatorRenderer | undefined => {
      // Check if any plugin has renderLoadingIndicator
      const loadingPlugin = plugins.find(p => p.renderLoadingIndicator);
      if (loadingPlugin?.renderLoadingIndicator) {
        return loadingPlugin.renderLoadingIndicator;
      }

      // Check if config has loadingIndicator.render
      if (config.loadingIndicator?.render) {
        return config.loadingIndicator.render;
      }

      // Return undefined to use default in createStandardBubble
      return undefined;
    };

    const inlineLoadingRenderer = getInlineLoadingIndicatorRenderer();
    const appendRenderedValue = (
      containerEl: HTMLElement,
      value: HTMLElement | string | null | undefined
    ): boolean => {
      if (value == null) return false;
      if (typeof value === "string") {
        containerEl.textContent = value;
        return true;
      }
      containerEl.appendChild(value);
      return true;
    };

    // Track active message IDs for cache pruning
    const activeMessageIds = new Set<string>();
    // Track ask_user_question tool-call ids whose bubbles were rendered this
    // pass: used to prune stale sheets from the composer overlay afterward.
    const liveAskToolIds = new Set<string>();

    // Plugins that render `ask_user_question` typically attach DOM listeners
    // directly to their buttons. The wrapper cache uses `cloneNode(true)` and
    // idiomorph inserts new nodes via `document.importNode`: both strip
    // listeners. For plugin-handled ask messages we therefore append an empty
    // stub during the morph pass and hydrate the live plugin bubble into the
    // morphed wrapper afterward (see post-morph loop below). The stub carries
    // `data-preserve-runtime` so subsequent passes leave the live wrapper
    // (with its listener-bearing bubble) untouched.
    const hasAskPlugin = plugins.some((p) => p.renderAskUserQuestion);
    type AskPluginHydrate = {
      messageId: string;
      fingerprint: string;
      bubble: HTMLElement | null;
    };
    const askPluginHydrate: AskPluginHydrate[] = [];

    // Component-directive bubbles use the same stub-and-hydrate pattern as
    // ask_user_question plugins: the renderer's HTMLElement is built live and
    // injected into the morphed wrapper afterward, so listeners attached via
    // `addEventListener` (e.g. form `submit` handlers) survive transcript
    // morphs. `bubble: null` means the fingerprint matched a previous pass and
    // the live wrapper is reused as-is.
    type ComponentDirectiveHydrate = {
      messageId: string;
      fingerprint: string;
      bubble: HTMLElement | null;
    };
    const componentDirectiveHydrate: ComponentDirectiveHydrate[] = [];
    const componentStreamingEnabled = config.enableComponentStreaming !== false;

    // Plugin-rendered approval bubbles use the same stub-and-hydrate pattern:
    // `renderApproval` may attach listeners (the built-in bubble resolves via
    // delegation on `messagesWrapper`, but a custom element owns its own
    // interactivity), and idiomorph imports nodes via `document.importNode`,
    // which strips them. So we build the live element, append a stub during
    // morph, and inject the live element afterward.
    // The built-in approval renderer is always available (as a fallback plugin),
    // so every approval flows through the stub-and-hydrate path whenever
    // approvals are enabled — a user `renderApproval` plugin just overrides it.
    const hasApprovalPlugin = config.approval !== false;
    type ApprovalPluginHydrate = {
      messageId: string;
      fingerprint: string;
      bubble: HTMLElement | null;
    };
    const approvalPluginHydrate: ApprovalPluginHydrate[] = [];

    messages.forEach((message) => {
      activeMessageIds.add(message.id);

      const askWithPlugin = hasAskPlugin && isAskUserQuestionMessage(message);
      const approvalWithPlugin =
        hasApprovalPlugin && message.variant === "approval" && !!message.approval;
      const hasDirectiveBubble =
        !askWithPlugin &&
        message.role === "assistant" &&
        !message.variant &&
        componentStreamingEnabled &&
        hasComponentDirective(message);

      // If a message stops being an approval-plugin bubble, strip
      // `data-preserve-runtime` so the next morph can replace the live wrapper.
      if (!approvalWithPlugin && lastApprovalBubbleFingerprint.has(message.id)) {
        const existing = container.querySelector<HTMLElement>(`#wrapper-${message.id}`);
        existing?.removeAttribute("data-preserve-runtime");
        lastApprovalBubbleFingerprint.delete(message.id);
      }

      // If a message previously rendered as a directive bubble but no longer
      // does (e.g. content was rewritten), strip `data-preserve-runtime` from
      // the live wrapper so the next morph can replace it.
      if (!hasDirectiveBubble && lastComponentDirectiveFingerprint.has(message.id)) {
        const existing = container.querySelector<HTMLElement>(`#wrapper-${message.id}`);
        existing?.removeAttribute("data-preserve-runtime");
        lastComponentDirectiveFingerprint.delete(message.id);
      }

      // Fingerprint cache: skip re-rendering unchanged messages. Append the
      // ask-user-question answered/answers state so flipping `askUserQuestionAnswered`
      // (or accumulating answers) busts both the wrapper cache and the plugin's
      // `lastAskBubbleFingerprint` check, forcing a re-render of the review UX.
      const askMeta = isAskUserQuestionMessage(message)
        ? `:${message.agentMetadata?.askUserQuestionAnswered ? "a" : "u"}:${
            message.agentMetadata?.askUserQuestionAnswers
              ? Object.keys(message.agentMetadata.askUserQuestionAnswers).length
              : 0
          }`
        : "";
      const fingerprint = computeMessageFingerprint(message, configVersion) + askMeta;
      const cachedWrapper = (askWithPlugin || approvalWithPlugin || hasDirectiveBubble)
        ? null
        : getCachedWrapper(messageCache, message.id, fingerprint);
      if (cachedWrapper) {
        tempContainer.appendChild(cachedWrapper.cloneNode(true));
        // Keep the overlay sheet alive only while the server is actively
        // waiting on the user (awaitingLocalTool === true). Before step_await
        // fires, or after the answer resumes the flow, omit from
        // liveAskToolIds so the prune loop below removes any stale DOM sheet.
        // Guards against lingering skeleton sheets from tool_start events
        // that never get a matching step_await (e.g. LLM-hallucinated trailing
        // ask_user_question calls at end-of-turn).
        if (
          isAskUserQuestionMessage(message) &&
          message.toolCall?.id &&
          message.agentMetadata?.awaitingLocalTool === true &&
          !message.agentMetadata?.askUserQuestionAnswered
        ) {
          liveAskToolIds.add(message.toolCall.id);
          ensureAskUserQuestionSheet(message, config, panelElements.composerOverlay);
        }
        return;
      }

      let bubble: HTMLElement | null = null;

      // Try plugins first
      const matchingPlugin = plugins.find((p) => {
        if (message.variant === "reasoning" && p.renderReasoning) {
          return true;
        }
        if (message.variant === "tool" && p.renderToolCall) {
          return true;
        }
        // Approval plugins are handled via the stub-and-hydrate path below
        // (see `approvalWithPlugin`), not this inline morph path, so their
        // listeners survive, so they are intentionally excluded here.
        if (!message.variant && p.renderMessage) {
          return true;
        }
        return false;
      });

      // Get message layout config
      const messageLayoutConfig = config.layout?.messages;

      // ask_user_question has two rendering modes while waiting for an answer:
      //   1. Plugin `renderAskUserQuestion`: returns an inline transcript
      //      element with its own UI; the composer-overlay sheet is suppressed.
      //   2. Built-in composer-overlay answer-pill sheet: no transcript stub.
      // Plugins win when they return a non-null element; otherwise fall
      // through to the built-in overlay.
      //
      // Once answered, the original tool message is suppressed entirely from
      // the transcript. `session.resolveAskUserQuestion` injects one assistant
      // bubble per question and one user bubble per answer (skipped questions
      // become an italic `*Skipped*` user bubble), so the transcript reads
      // like a normal Q→A conversation. Plugins do not render the answered
      // state.
      if (
        isAskUserQuestionMessage(message) &&
        message.agentMetadata?.askUserQuestionAnswered === true
      ) {
        // Drop any previously-mounted plugin bubble so the morph pass
        // removes the now-stale interactive sheet.
        lastAskBubbleFingerprint.delete(message.id);
        const existing = container.querySelector<HTMLElement>(`#wrapper-${message.id}`);
        existing?.removeAttribute("data-preserve-runtime");
        return;
      }

      // suggest_replies renders no transcript bubble: the chips above the
      // composer are the only UI, and the session auto-resumes the call.
      // When the feature is disabled the message falls through to the generic
      // tool bubble (and is never auto-resumed), keeping the parked execution
      // visible instead of silently swallowed.
      if (
        isSuggestRepliesMessage(message) &&
        config.features?.suggestReplies?.enabled !== false
      ) {
        return;
      }

      if (
        isAskUserQuestionMessage(message) &&
        config.features?.askUserQuestion?.enabled !== false
      ) {
        const askPlugin = plugins.find((p) => typeof p.renderAskUserQuestion === "function");
        if (askPlugin && sessionRef.current) {
          const lastFp = lastAskBubbleFingerprint.get(message.id);
          // Whether to actually call the plugin renderer this pass. We do it
          // on first sight of this message, or when its fingerprint changed
          // (e.g. payload streamed in more options). Otherwise we rely on the
          // already-mounted bubble in `container`.
          const needsRebuild = lastFp !== fingerprint;

          let pluginBubble: HTMLElement | null = null;
          if (needsRebuild) {
            const { payload, complete } = parseAskUserQuestionPayload(message);
            const messageId = message.id;
            const liveMessage = (): AgentWidgetMessage | undefined =>
              sessionRef.current?.getMessages().find((m) => m.id === messageId);
            pluginBubble = askPlugin.renderAskUserQuestion!({
              message,
              payload,
              complete,
              resolve: (answer) => {
                const live = liveMessage();
                if (live) sessionRef.current?.resolveAskUserQuestion(live, answer);
              },
              dismiss: () => {
                const live = liveMessage();
                if (live?.agentMetadata?.awaitingLocalTool) {
                  sessionRef.current?.markAskUserQuestionResolved(live);
                  sessionRef.current?.resolveAskUserQuestion(live, "(dismissed)");
                }
              },
              config,
            });
          }

          // If the plugin opted out (returned null on a fresh build) AND we
          // have no previously-mounted bubble for this message, fall back to
          // the built-in overlay sheet. If we already have a mounted bubble
          // and the plugin didn't run this pass (cached), keep using it.
          const previouslyMounted = lastFp != null;
          if (needsRebuild && pluginBubble === null && !previouslyMounted) {
            if (
              message.agentMetadata?.awaitingLocalTool === true &&
              !message.agentMetadata?.askUserQuestionAnswered
            ) {
              liveAskToolIds.add(message.toolCall!.id);
              ensureAskUserQuestionSheet(message, config, panelElements.composerOverlay);
            }
            return;
          }

          // Append a stub wrapper for the morph pass; hydrate the real bubble
          // into it post-morph so its event listeners survive.
          const stub = document.createElement("div");
          stub.className = "persona-flex";
          stub.id = `wrapper-${message.id}`;
          stub.setAttribute("data-wrapper-id", message.id);
          stub.setAttribute("data-ask-plugin-stub", "true");
          stub.setAttribute("data-preserve-runtime", "true");
          tempContainer.appendChild(stub);
          askPluginHydrate.push({
            messageId: message.id,
            fingerprint,
            bubble: pluginBubble,
          });
          return;
        } else {
          if (
            message.agentMetadata?.awaitingLocalTool === true &&
            !message.agentMetadata?.askUserQuestionAnswered
          ) {
            liveAskToolIds.add(message.toolCall!.id);
            ensureAskUserQuestionSheet(message, config, panelElements.composerOverlay);
          }
          return;
        }
      } else if (approvalWithPlugin) {
        // Plugin-rendered approval bubble. Build the live element with its
        // listeners, append a stub for the morph pass, and hydrate the live
        // element into the morphed wrapper afterward (same trick as
        // `renderAskUserQuestion` / component directives) so Approve/Deny and
        // any accordion listeners survive idiomorph's `importNode`. Gate the
        // rebuild on fingerprint so interactive state (e.g. a collapsed
        // accordion) is preserved while the approval stays pending.
        const approvalPlugin =
          plugins.find((p) => typeof p.renderApproval === "function") ?? builtInApprovalPlugin;
        const lastFp = lastApprovalBubbleFingerprint.get(message.id);
        const needsRebuild = lastFp !== fingerprint;
        let liveBubble: HTMLElement | null = null;

        if (needsRebuild && approvalPlugin?.renderApproval) {
          // Re-find the live message at decision time so we resolve against
          // current state, and route WebMCP gate approvals to the local
          // resolver: mirroring the built-in delegated handler.
          const approvalMessageId = message.id;
          const resolveDecision = (
            decision: "approved" | "denied",
            options?: AgentWidgetApprovalDecisionOptions
          ): void => {
            const live = sessionRef.current
              ?.getMessages()
              .find((m) => m.id === approvalMessageId);
            if (!live?.approval) return;
            if (live.approval.toolType === "webmcp") {
              sessionRef.current?.resolveWebMcpApproval(live.id, decision);
            } else {
              sessionRef.current?.resolveApproval(live.approval, decision, options);
            }
          };
          liveBubble = approvalPlugin.renderApproval({
            message,
            defaultRenderer: () => createApprovalBubble(message, config),
            config,
            approve: (options) => resolveDecision("approved", options),
            deny: (options) => resolveDecision("denied", options)
          });
        }

        if (needsRebuild && liveBubble === null) {
          // Plugin opted out for this state (e.g. a resolved approval, where the
          // demo plugin defers to the built-in approved/denied bubble). Render
          // the built-in bubble: it resolves via the delegated `messagesWrapper`
          // handler and morphs normally, and drop any preserved live wrapper so
          // morph can replace the now-stale pending bubble.
          const existing = container.querySelector<HTMLElement>(`#wrapper-${message.id}`);
          existing?.removeAttribute("data-preserve-runtime");
          lastApprovalBubbleFingerprint.delete(message.id);
          bubble = createApprovalBubble(message, config);
        } else {
          // A fresh live bubble to hydrate (needsRebuild), or fingerprint
          // unchanged so we reuse the preserved live wrapper (`bubble: null`).
          const stub = document.createElement("div");
          stub.className = "persona-flex";
          stub.id = `wrapper-${message.id}`;
          stub.setAttribute("data-wrapper-id", message.id);
          stub.setAttribute("data-approval-plugin-stub", "true");
          stub.setAttribute("data-preserve-runtime", "true");
          tempContainer.appendChild(stub);
          approvalPluginHydrate.push({
            messageId: message.id,
            fingerprint,
            bubble: liveBubble
          });
          return;
        }
      } else if (matchingPlugin) {
        if (message.variant === "reasoning" && message.reasoning && matchingPlugin.renderReasoning) {
          if (!showReasoning) return;
          bubble = matchingPlugin.renderReasoning({
            message,
            defaultRenderer: () => createReasoningBubble(message, config),
            config
          });
        } else if (message.variant === "tool" && message.toolCall && matchingPlugin.renderToolCall) {
          if (!showToolCalls) return;
          bubble = matchingPlugin.renderToolCall({
            message,
            defaultRenderer: () => createToolBubble(message, config),
            config
          });
        } else if (matchingPlugin.renderMessage) {
          bubble = matchingPlugin.renderMessage({
            message,
            defaultRenderer: () => {
              const b = createStandardBubble(
                message,
                transform,
                messageLayoutConfig,
                config.messageActions,
                messageActionCallbacks,
                {
                  loadingIndicatorRenderer: inlineLoadingRenderer,
                  widgetConfig: config
                }
              );
              if (message.role !== "user") {
                enhanceWithForms(b, message, config, session);
              }
              return b;
            },
            config
          });
        }
      }

      // Check for component directive if no plugin handled it. We use the
      // same stub-and-hydrate trick as ask_user_question plugins (see comment
      // above `componentDirectiveHydrate`): build the live element with its
      // listeners, append a stub for the morph pass, then inject the live
      // element into the morphed wrapper afterward.
      if (!bubble && hasDirectiveBubble) {
        const directive = extractComponentDirectiveFromMessage(message);
        if (directive) {
          const lastFp = lastComponentDirectiveFingerprint.get(message.id);
          const needsRebuild = lastFp !== fingerprint;
          // Wrap only when the global default allows it AND the component has
          // not opted out of bubble chrome (e.g. the artifact card carries its
          // own border, so it renders bare).
          const wrapChrome =
            config.wrapComponentDirectiveInBubble !== false &&
            componentRegistry.getOptions(directive.component)?.bubbleChrome !== false;
          let liveBubble: HTMLElement | null = null;

          if (needsRebuild) {
            const componentBubble = renderComponentDirective(directive, {
              config,
              message,
              transform
            });
            if (componentBubble) {
              if (wrapChrome) {
                const componentWrapper = document.createElement("div");
                componentWrapper.className = [
                  "persona-message-bubble",
                  "persona-max-w-[85%]",
                  "persona-rounded-2xl",
                  "persona-bg-persona-surface",
                  "persona-border",
                  "persona-border-persona-message-border",
                  "persona-p-4"
                ].join(" ");
                componentWrapper.id = `bubble-${message.id}`;
                componentWrapper.setAttribute("data-message-id", message.id);

                if (message.content && message.content.trim()) {
                  const textDiv = document.createElement("div");
                  textDiv.className = "persona-mb-3 persona-text-sm persona-leading-relaxed";
                  textDiv.innerHTML = transform({
                    text: message.content,
                    message,
                    streaming: Boolean(message.streaming),
                    raw: message.rawContent
                  });
                  componentWrapper.appendChild(textDiv);
                }

                componentWrapper.appendChild(componentBubble);
                liveBubble = componentWrapper;
              } else {
                const stack = document.createElement("div");
                stack.className =
                  "persona-flex persona-flex-col persona-w-full persona-max-w-full persona-gap-3 persona-items-stretch";
                stack.id = `bubble-${message.id}`;
                stack.setAttribute("data-message-id", message.id);
                stack.setAttribute("data-persona-component-directive", "true");

                if (message.content && message.content.trim()) {
                  const textDiv = document.createElement("div");
                  textDiv.className =
                    "persona-text-sm persona-leading-relaxed persona-text-persona-primary persona-w-full";
                  textDiv.innerHTML = transform({
                    text: message.content,
                    message,
                    streaming: Boolean(message.streaming),
                    raw: message.rawContent
                  });
                  stack.appendChild(textDiv);
                }

                stack.appendChild(componentBubble);
                liveBubble = stack;
              }
            }
          }

          // If the directive is registered (live bubble built or already
          // mounted from a previous pass), use the stub-and-hydrate path.
          // Otherwise fall through to the standard render path so the message
          // text is at least visible.
          if (liveBubble || lastFp != null) {
            const stub = document.createElement("div");
            stub.className = "persona-flex";
            stub.id = `wrapper-${message.id}`;
            stub.setAttribute("data-wrapper-id", message.id);
            stub.setAttribute("data-component-directive-stub", "true");
            stub.setAttribute("data-preserve-runtime", "true");
            if (!wrapChrome) {
              stub.classList.add("persona-w-full");
            }
            tempContainer.appendChild(stub);
            componentDirectiveHydrate.push({
              messageId: message.id,
              fingerprint,
              bubble: liveBubble
            });
            return;
          }
        }
      }

      // Fallback to default rendering if plugin returned null or no plugin matched
      if (!bubble) {
        if (message.variant === "reasoning" && message.reasoning) {
          if (!showReasoning) return;
          bubble = createReasoningBubble(message, config);
        } else if (message.variant === "tool" && message.toolCall) {
          if (!showToolCalls) return;
          bubble = createToolBubble(message, config);
        } else if (message.variant === "approval" && message.approval) {
          if (config.approval === false) return;
          bubble = createApprovalBubble(message, config);
        } else {
          // Check for custom message renderers in layout config
          const messageLayoutConfig = config.layout?.messages;
          if (messageLayoutConfig?.renderUserMessage && message.role === "user") {
            bubble = messageLayoutConfig.renderUserMessage({
              message,
              config,
              streaming: Boolean(message.streaming)
            });
          } else if (messageLayoutConfig?.renderAssistantMessage && message.role === "assistant") {
            bubble = messageLayoutConfig.renderAssistantMessage({
              message,
              config,
              streaming: Boolean(message.streaming)
            });
          } else {
            bubble = createStandardBubble(
              message,
              transform,
              messageLayoutConfig,
              config.messageActions,
              messageActionCallbacks,
              {
                loadingIndicatorRenderer: inlineLoadingRenderer,
                widgetConfig: config
              }
            );
          }
          if (message.role !== "user" && bubble) {
            enhanceWithForms(bubble, message, config, session);
          }
        }
      }

      const wrapper = document.createElement("div");
      wrapper.className = "persona-flex";
      // Set id for idiomorph matching
      wrapper.id = `wrapper-${message.id}`;
      wrapper.setAttribute("data-wrapper-id", message.id);
      if (message.role === "user") {
        wrapper.classList.add("persona-justify-end");
      }
      if (bubble?.getAttribute("data-persona-component-directive") === "true") {
        wrapper.classList.add("persona-w-full");
      }
      wrapper.appendChild(bubble);
      setCachedWrapper(messageCache, message.id, fingerprint, wrapper);
      tempContainer.appendChild(wrapper);
    });

    // Prune any ask_user_question sheets whose source message is no longer in
    // the message list (e.g. after clearChat or a splice).
    if (panelElements.composerOverlay) {
      const sheets = panelElements.composerOverlay.querySelectorAll<HTMLElement>(
        "[data-persona-ask-sheet-for]"
      );
      sheets.forEach((sheet) => {
        const id = sheet.getAttribute("data-persona-ask-sheet-for");
        if (id && !liveAskToolIds.has(id)) {
          removeAskUserQuestionSheet(panelElements.composerOverlay, id);
        }
      });
    }

    if (config.features?.toolCallDisplay?.grouped) {
      const toolGroups: AgentWidgetMessage[][] = [];
      let currentGroup: AgentWidgetMessage[] = [];

      messages.forEach((message) => {
        if (message.variant === "tool" && message.toolCall && showToolCalls) {
          currentGroup.push(message);
          return;
        }
        // A hidden reasoning row does not create a visible break in the
        // transcript, so it should not split an otherwise contiguous tool
        // sequence into separate groups.
        if (message.variant === "reasoning" && !showReasoning) {
          return;
        }
        if (currentGroup.length > 1) {
          toolGroups.push(currentGroup);
        }
        currentGroup = [];
      });
      if (currentGroup.length > 1) {
        toolGroups.push(currentGroup);
      }

      toolGroups.forEach((group, groupIndex) => {
        const wrappers = group
          .map((groupMessage) =>
            Array.from(tempContainer.children).find(
              (child) =>
                child instanceof HTMLElement &&
                child.getAttribute("data-wrapper-id") === groupMessage.id
            ) as HTMLElement | undefined
          )
          .filter((wrapper): wrapper is HTMLElement => Boolean(wrapper));

        if (wrappers.length < 2) {
          return;
        }

        const groupWrapper = document.createElement("div");
        groupWrapper.className = "persona-flex";
        groupWrapper.id = `wrapper-tool-group-${groupIndex}-${group[0].id}`;
        groupWrapper.setAttribute("data-wrapper-id", `tool-group-${groupIndex}-${group[0].id}`);

        const groupContainer = document.createElement("div");
        groupContainer.className =
          "persona-tool-group persona-flex persona-w-full persona-flex-col persona-gap-2";
        groupContainer.setAttribute("data-persona-tool-group", "true");

        const summary = document.createElement("div");
        summary.className =
          "persona-tool-group-summary persona-text-xs persona-text-persona-muted";

        const defaultSummary = `Called ${group.length} tools`;
        const renderedSummary = config.toolCall?.renderGroupedSummary?.({
          messages: group,
          toolCalls: group
            .map((groupMessage) => groupMessage.toolCall)
            .filter((toolCall): toolCall is NonNullable<typeof group[number]["toolCall"]> => Boolean(toolCall)),
          defaultSummary,
          config,
        });
        if (!appendRenderedValue(summary, renderedSummary)) {
          summary.textContent = defaultSummary;
        }

        const stack = document.createElement("div");
        stack.className = "persona-tool-group-stack persona-flex persona-flex-col";

        const summaryOnly = config.features?.toolCallDisplay?.groupedMode === "summary";
        groupContainer.appendChild(summary);
        if (!summaryOnly) {
          groupContainer.appendChild(stack);
        }
        groupWrapper.appendChild(groupContainer);
        wrappers[0].before(groupWrapper);

        wrappers.forEach((wrapper, wrapperIndex) => {
          if (summaryOnly) {
            wrapper.remove();
            return;
          }
          const item = document.createElement("div");
          item.className = "persona-tool-group-item persona-relative";
          item.setAttribute("data-persona-tool-group-item", "true");
          if (wrapperIndex < wrappers.length - 1) {
            item.setAttribute("data-persona-tool-group-connector", "true");
          }
          item.appendChild(wrapper);
          stack.appendChild(item);
        });
      });
    }

    // Remove cache entries for messages that no longer exist
    pruneCache(messageCache, activeMessageIds);

    // Add standalone typing indicator only if streaming but no assistant message is streaming yet
    // (This shows while waiting for the stream to start)
    // Check for ANY streaming assistant message, even if empty (to avoid duplicate bubbles)
    const hasStreamingAssistantMessage = messages.some(
      (msg) => msg.role === "assistant" && msg.streaming
    );
    
    // Also check if there's a recently completed assistant message (streaming just ended)
    // This prevents flicker when the message completes but isStreaming hasn't updated yet
    // Approval-variant messages are UI controls, not content: exclude them so the typing
    // indicator still shows while the agent resumes after approval
    const lastMessage = messages[messages.length - 1];
    const hasRecentAssistantResponse = lastMessage?.role === "assistant" && !lastMessage.streaming && lastMessage.variant !== "approval";

    if (isStreaming && messages.some((msg) => msg.role === "user") && !hasStreamingAssistantMessage && !hasRecentAssistantResponse) {
      // Get loading indicator using priority chain: plugin -> config -> default
      const loadingIndicatorContext: LoadingIndicatorRenderContext = {
        config,
        streaming: true,
        location: 'standalone',
        defaultRenderer: createTypingIndicator
      };

      // Try plugin renderLoadingIndicator first
      const loadingPlugin = plugins.find(p => p.renderLoadingIndicator);
      let typingIndicator: HTMLElement | null = null;

      if (loadingPlugin?.renderLoadingIndicator) {
        typingIndicator = loadingPlugin.renderLoadingIndicator(loadingIndicatorContext);
      }

      // Try config loadingIndicator.render if no plugin handled it
      if (typingIndicator === null && config.loadingIndicator?.render) {
        typingIndicator = config.loadingIndicator.render(loadingIndicatorContext);
      }

      // Fall back to default
      if (typingIndicator === null) {
        typingIndicator = createTypingIndicator();
      }

      // Only render if we have an indicator (allows hiding via returning null)
      if (typingIndicator) {
        // Create a bubble wrapper for the typing indicator (similar to assistant messages)
        const typingBubble = document.createElement("div");
        const showBubble = config.loadingIndicator?.showBubble !== false; // default true
        typingBubble.className = showBubble
          ? [
              "persona-max-w-[85%]",
              "persona-rounded-2xl",
              "persona-text-sm",
              "persona-leading-relaxed",
              "persona-shadow-sm",
              "persona-bg-persona-surface",
              "persona-border",
              "persona-text-persona-primary",
              "persona-px-5",
              "persona-py-3"
            ].join(" ")
          : [
              "persona-max-w-[85%]",
              "persona-text-sm",
              "persona-leading-relaxed",
              "persona-text-persona-primary"
            ].join(" ");
        typingBubble.setAttribute("data-typing-indicator", "true");
        typingBubble.style.borderColor = "var(--persona-message-assistant-border, var(--persona-border, #e5e7eb))";

        typingBubble.appendChild(typingIndicator);

        const typingWrapper = document.createElement("div");
        typingWrapper.className = "persona-flex";
        // Set id for idiomorph matching
        typingWrapper.id = "wrapper-typing-indicator";
        typingWrapper.setAttribute("data-wrapper-id", "typing-indicator");
        typingWrapper.appendChild(typingBubble);
        tempContainer.appendChild(typingWrapper);
      }
    }

    // Render idle state indicator when not streaming and has messages
    if (!isStreaming && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];

      // Create context for idle indicator render functions
      const idleIndicatorContext: IdleIndicatorRenderContext = {
        config,
        lastMessage,
        messageCount: messages.length
      };

      // Get idle indicator using priority chain: plugin -> config -> null (default)
      // Try plugin renderIdleIndicator first
      const idlePlugin = plugins.find(p => p.renderIdleIndicator);
      let idleIndicator: HTMLElement | null = null;

      if (idlePlugin?.renderIdleIndicator) {
        idleIndicator = idlePlugin.renderIdleIndicator(idleIndicatorContext);
      }

      // Try config loadingIndicator.renderIdle if no plugin handled it
      if (idleIndicator === null && config.loadingIndicator?.renderIdle) {
        idleIndicator = config.loadingIndicator.renderIdle(idleIndicatorContext);
      }

      // Only render if we have an indicator (default is null - no idle indicator)
      if (idleIndicator) {
        // Create a wrapper for the idle indicator (similar to typing indicator)
        const idleBubble = document.createElement("div");
        const showBubble = config.loadingIndicator?.showBubble !== false; // default true
        idleBubble.className = showBubble
          ? [
              "persona-max-w-[85%]",
              "persona-rounded-2xl",
              "persona-text-sm",
              "persona-leading-relaxed",
              "persona-shadow-sm",
              "persona-bg-persona-surface",
              "persona-border",
              "persona-border-persona-message-border",
              "persona-text-persona-primary",
              "persona-px-5",
              "persona-py-3"
            ].join(" ")
          : [
              "persona-max-w-[85%]",
              "persona-text-sm",
              "persona-leading-relaxed",
              "persona-text-persona-primary"
            ].join(" ");
        idleBubble.setAttribute("data-idle-indicator", "true");

        idleBubble.appendChild(idleIndicator);

        const idleWrapper = document.createElement("div");
        idleWrapper.className = "persona-flex";
        // Set id for idiomorph matching
        idleWrapper.id = "wrapper-idle-indicator";
        idleWrapper.setAttribute("data-wrapper-id", "idle-indicator");
        idleWrapper.appendChild(idleBubble);
        tempContainer.appendChild(idleWrapper);
      }
    }

    // Use idiomorph to morph the container contents
    morphMessages(container, tempContainer);

    // Hydrate plugin-rendered ask-question bubbles into their stub wrappers.
    // Idiomorph imports new nodes via `document.importNode`, which strips
    // listeners, so we built only an empty stub during morph and now inject
    // the real, listener-bearing bubble directly into the live DOM.
    if (askPluginHydrate.length > 0) {
      for (const { messageId, fingerprint, bubble } of askPluginHydrate) {
        const wrapper = container.querySelector(`#wrapper-${messageId}`);
        if (!wrapper) continue;
        if (bubble === null) {
          // No fresh bubble built this pass: either the plugin opted out
          // and a previously-mounted bubble already lives here (preserved by
          // `data-preserve-runtime`), or we skipped the rebuild because the
          // fingerprint matched. Either way, leave the live wrapper alone.
          continue;
        }
        wrapper.replaceChildren(bubble);
        wrapper.setAttribute("data-bubble-fp", fingerprint);
        lastAskBubbleFingerprint.set(messageId, fingerprint);
      }
    }

    // Drop fingerprints for messages that are no longer present so a future
    // re-appearance triggers a fresh plugin render.
    if (lastAskBubbleFingerprint.size > 0) {
      for (const id of lastAskBubbleFingerprint.keys()) {
        if (!activeMessageIds.has(id)) lastAskBubbleFingerprint.delete(id);
      }
    }

    // Hydrate component-directive bubbles into their stub wrappers, mirroring
    // the ask-question hydration above.
    if (componentDirectiveHydrate.length > 0) {
      for (const { messageId, fingerprint, bubble } of componentDirectiveHydrate) {
        const wrapper = container.querySelector(`#wrapper-${messageId}`);
        if (!wrapper) continue;
        if (bubble === null) {
          // Fingerprint matched the previous pass: the live wrapper (kept
          // alive by `data-preserve-runtime`) still holds the listener-bearing
          // bubble from a prior render. Leave it untouched.
          continue;
        }
        wrapper.replaceChildren(bubble);
        wrapper.setAttribute("data-bubble-fp", fingerprint);
        lastComponentDirectiveFingerprint.set(messageId, fingerprint);
      }
    }

    if (lastComponentDirectiveFingerprint.size > 0) {
      for (const id of lastComponentDirectiveFingerprint.keys()) {
        if (!activeMessageIds.has(id)) lastComponentDirectiveFingerprint.delete(id);
      }
    }

    // Hydrate plugin-rendered approval bubbles into their stub wrappers,
    // mirroring the ask-question / component-directive hydration above.
    if (approvalPluginHydrate.length > 0) {
      for (const { messageId, fingerprint, bubble } of approvalPluginHydrate) {
        const wrapper = container.querySelector(`#wrapper-${messageId}`);
        if (!wrapper) continue;
        if (bubble === null) {
          // Fingerprint matched the previous pass (or the plugin opted out
          // after a prior render): the live wrapper, kept alive by
          // `data-preserve-runtime`, still holds the listener-bearing bubble.
          continue;
        }
        wrapper.replaceChildren(bubble);
        wrapper.setAttribute("data-bubble-fp", fingerprint);
        lastApprovalBubbleFingerprint.set(messageId, fingerprint);
      }
    }

    if (lastApprovalBubbleFingerprint.size > 0) {
      for (const id of lastApprovalBubbleFingerprint.keys()) {
        if (!activeMessageIds.has(id)) lastApprovalBubbleFingerprint.delete(id);
      }
    }
  };

  // Alias for clarity - the implementation handles flicker prevention via typing indicator logic.
  // Re-apply read-aloud button state after each render so a playing/paused
  // message keeps its icon across idiomorph DOM morphs.
  const renderMessagesWithPlugins = (
    container: HTMLElement,
    messages: AgentWidgetMessage[],
    transform: MessageTransform
  ) => {
    renderMessagesWithPluginsImpl(container, messages, transform);
    refreshReadAloudButtons();
  };

  /**
   * Composer-bar outside-click dismiss. While the chat is expanded, clicking
   * anywhere outside the wrapper (i.e. NOT inside the chat panel chrome and
   * NOT inside the pill) collapses back to just the pill. Uses `pointerdown`
   * + capture so we run before host-page click handlers (and before any
   * stop-propagation upstream); composedPath() includes the shadow DOM
   * subtree, so clicks inside the wrapper (which lives in the shadow root)
   * are correctly identified as inside.
   */
  let composerBarOutsideClickListener: ((e: PointerEvent) => void) | null = null;

  const attachComposerBarOutsideClickDismiss = () => {
    if (composerBarOutsideClickListener) return;
    const listener: (e: PointerEvent) => void = (event) => {
      const path = event.composedPath();
      // pillRoot is a viewport-fixed sibling of the wrapper, so a click on
      // the pill or peek wouldn't be in `wrapper`'s composedPath even
      // though it's logically "inside" the widget.
      if (path.includes(wrapper)) return;
      if (pillRoot && path.includes(pillRoot)) return;
      setOpenState(false, "user");
    };
    composerBarOutsideClickListener = listener;
    const targetDoc = mount.ownerDocument ?? document;
    targetDoc.addEventListener("pointerdown", listener, true);
  };

  const detachComposerBarOutsideClickDismiss = () => {
    if (!composerBarOutsideClickListener) return;
    const targetDoc = mount.ownerDocument ?? document;
    targetDoc.removeEventListener(
      "pointerdown",
      composerBarOutsideClickListener,
      true
    );
    composerBarOutsideClickListener = null;
  };

  destroyCallbacks.push(() => detachComposerBarOutsideClickDismiss());

  /**
   * Composer-bar ESC dismiss. While the chat is expanded, pressing Escape
   * collapses back to just the pill: same end state as outside-click.
   * Matches the WAI-ARIA dialog pattern (modal mode is literally a dialog)
   * and the dominant chat-widget convention (Intercom, Drift, Crisp).
   * Guards on `event.isComposing` so dismissing an IME suggestion doesn't
   * also collapse the panel.
   */
  let composerBarEscapeListener: ((e: KeyboardEvent) => void) | null = null;

  const attachComposerBarEscapeDismiss = () => {
    if (composerBarEscapeListener) return;
    const listener: (e: KeyboardEvent) => void = (event) => {
      if (event.key !== "Escape") return;
      if (event.isComposing) return;
      setOpenState(false, "user");
    };
    composerBarEscapeListener = listener;
    const targetDoc = mount.ownerDocument ?? document;
    targetDoc.addEventListener("keydown", listener, true);
  };

  const detachComposerBarEscapeDismiss = () => {
    if (!composerBarEscapeListener) return;
    const targetDoc = mount.ownerDocument ?? document;
    targetDoc.removeEventListener(
      "keydown",
      composerBarEscapeListener,
      true
    );
    composerBarEscapeListener = null;
  };

  destroyCallbacks.push(() => detachComposerBarEscapeDismiss());

  /**
   * Composer-bar "peek" affordance: a chrome-less row above the pill that
   * shows a chat-bubble icon, the trailing 100 chars of the most recent
   * assistant message, and a chevron-up. It is the user's path back into the
   * expanded chat from the collapsed pill.
   *
   * Visible when (collapsed) AND (there is an assistant message with content)
   * AND (`isStreaming` OR `composerHovered`). Otherwise hidden. The hover
   * zone is the whole `panel` (not just the pill) so the cursor moving
   * between the pill and the peek doesn't trigger fade-out.
   *
   * Driven from a single `syncComposerBarPeek()` invoked from
   * `onMessagesChanged`, `onStreamingChanged`, `updateOpenState`, the
   * pointerenter/pointerleave on `panel`, and once at end-of-init.
   */
  let composerHovered = false;
  // Track which peek-plugins we've already attached for this widget root.
  // `ensurePluginActive` is idempotent, but the call is guarded behind a flag
  // so we don't pay the lookup cost on every chunk.
  const peekActivatedPlugins = new Set<string>();

  /**
   * Resolve the effective stream animation feature for the peek surface.
   * `composerBar.peek.streamAnimation` overrides; otherwise the peek inherits
   * `features.streamAnimation` so the surface for devs is consistent across
   * the main bubble and the peek banner.
   */
  const resolvePeekStreamAnimationFeature = () => {
    const peekFeature = config.launcher?.composerBar?.peek?.streamAnimation;
    if (peekFeature) return peekFeature;
    return config.features?.streamAnimation;
  };

  const syncComposerBarPeek = () => {
    if (!isComposerBar()) return;
    const peekBanner = panelElements.peekBanner;
    const peekTextNode = panelElements.peekTextNode;
    if (!peekBanner || !peekTextNode) return;

    if (open) {
      peekBanner.classList.remove("persona-pill-peek--visible");
      return;
    }

    const messages = session?.getMessages() ?? [];
    let lastAssistant: AgentWidgetMessage | undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant" && m.content) {
        lastAssistant = m;
        break;
      }
    }
    if (!lastAssistant) {
      peekBanner.classList.remove("persona-pill-peek--visible");
      return;
    }

    const text = lastAssistant.content;
    const streaming = Boolean(lastAssistant.streaming);

    // Resolve the same animation surface used by the main bubble. The peek
    // ignores `bubbleClass` (carve-out: peek has no bubble) but honors
    // `containerClass`, `wrap`, `useCaret`, `buffer`, `placeholder`,
    // `speed`/`duration`, and custom plugins.
    const feature = resolvePeekStreamAnimationFeature();
    const streamAnimation = resolveStreamAnimation(feature);
    const plugin =
      streamAnimation.type !== "none"
        ? resolveStreamAnimationPlugin(streamAnimation.type, feature?.plugins)
        : null;
    const pluginStillAnimating =
      plugin?.isAnimating?.(lastAssistant) === true;
    const animationActive =
      plugin !== null && (streaming || pluginStillAnimating);

    if (animationActive && plugin && !peekActivatedPlugins.has(plugin.name)) {
      ensurePluginActive(plugin, mount);
      peekActivatedPlugins.add(plugin.name);
    }

    // Manage `containerClass` on the peek text node. We track which class is
    // currently applied so a config swap (or animation deactivating after
    // stream completion) cleans up the previous class instead of stacking.
    const desiredContainerClass =
      animationActive && plugin?.containerClass ? plugin.containerClass : null;
    const currentContainerClass =
      peekTextNode.dataset.personaPeekStreamClass ?? null;
    if (currentContainerClass && currentContainerClass !== desiredContainerClass) {
      peekTextNode.classList.remove(currentContainerClass);
      delete peekTextNode.dataset.personaPeekStreamClass;
    }
    if (desiredContainerClass && currentContainerClass !== desiredContainerClass) {
      peekTextNode.classList.add(desiredContainerClass);
      peekTextNode.dataset.personaPeekStreamClass = desiredContainerClass;
    }

    if (animationActive) {
      peekTextNode.style.setProperty(
        "--persona-stream-step",
        `${streamAnimation.speed}ms`
      );
      peekTextNode.style.setProperty(
        "--persona-stream-duration",
        `${streamAnimation.duration}ms`
      );
    } else {
      peekTextNode.style.removeProperty("--persona-stream-step");
      peekTextNode.style.removeProperty("--persona-stream-duration");
    }

    // Apply buffering (word/line/plugin custom). If the buffer trims content
    // to empty AND the placeholder is "skeleton", show the skeleton: that's
    // the "line buffer between completions" affordance. Otherwise no
    // pre-content placeholder on the peek (a typing-dots indicator inside a
    // 1-line ticker would feel cramped).
    const buffered = animationActive
      ? applyStreamBuffer(text, streamAnimation.buffer, plugin, lastAssistant, streaming)
      : text;

    const skeletonEnabled =
      animationActive && streamAnimation.placeholder === "skeleton";
    const showSkeletonOnly =
      skeletonEnabled && streaming && (!buffered || !buffered.trim());

    if (showSkeletonOnly) {
      // Replace text node contents with just a peek-sized skeleton bar. The
      // bar carries `data-preserve-animation` so idiomorph keeps its shimmer
      // running across morph passes.
      const tempContainer = document.createElement("div");
      const skeleton = createSkeletonPlaceholder();
      skeleton.classList.add("persona-pill-peek__skeleton");
      tempContainer.appendChild(skeleton);
      morphMessages(peekTextNode, tempContainer);
    } else {
      // Trailing 100 chars; for animated modes we keep the slice but use
      // ABSOLUTE indices so per-char/per-word span IDs stay stable as the
      // window shifts each chunk: idiomorph then preserves animations on
      // already-revealed units instead of restarting them. Plain "none" mode
      // keeps the legacy `…` ellipsis prefix for visual continuity with the
      // pre-animation behavior.
      const sliceStart = Math.max(0, buffered.length - 100);
      const slice = buffered.length > 100 ? buffered.slice(-100) : buffered;
      const escaped = escapeHtml(slice);

      if (!animationActive || !plugin) {
        const preview = buffered.length > 100 ? `…${slice}` : slice;
        if (peekTextNode.textContent !== preview) {
          peekTextNode.textContent = preview;
        }
      } else {
        let html = escaped;
        if (plugin.wrap === "char" || plugin.wrap === "word") {
          html = wrapStreamAnimation(
            escaped,
            plugin.wrap,
            // Namespace span IDs to the peek surface so they don't collide
            // with the main bubble's spans for the same message id.
            `peek-${lastAssistant.id}`,
            { skipTags: plugin.skipTags, startIndex: sliceStart }
          );
        }

        const tempContainer = document.createElement("div");
        tempContainer.innerHTML = html;

        if (plugin.useCaret && slice.length > 0) {
          const caret = createStreamCaret();
          const spans = tempContainer.querySelectorAll(
            ".persona-stream-char, .persona-stream-word"
          );
          const lastSpan = spans[spans.length - 1];
          if (lastSpan?.parentNode) {
            lastSpan.parentNode.insertBefore(caret, lastSpan.nextSibling);
          } else {
            tempContainer.appendChild(caret);
          }
        }

        morphMessages(peekTextNode, tempContainer);

        // Fire the plugin's per-render hook so glyph-cycle / wipe / custom
        // plugins get a chance to mutate the peek's spans the same way they
        // mutate the main bubble's. The carve-out: `bubble` here is the peek
        // banner root, not a message bubble: plugins that target
        // `bubbleClass` should no-op on that surface.
        plugin.onAfterRender?.({
          container: peekTextNode,
          bubble: peekBanner,
          messageId: lastAssistant.id,
          message: lastAssistant,
          speed: streamAnimation.speed,
          duration: streamAnimation.duration,
        });
      }
    }

    const shouldShow = isStreaming || composerHovered;
    peekBanner.classList.toggle("persona-pill-peek--visible", shouldShow);
  };

  if (isComposerBar()) {
    const peekBanner = panelElements.peekBanner;
    if (peekBanner) {
      // pointerdown (not click) so this competes correctly with the
      // outside-click listener (also pointerdown, capture phase). The
      // outside-click composedPath check passes for events inside `wrapper`
      // or `pillRoot` (peek's parent), so the peek can stop propagation
      // here without breaking dismissal.
      const onPeekPointerDown = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setOpenState(true, "user");
      };
      peekBanner.addEventListener("pointerdown", onPeekPointerDown);
      destroyCallbacks.push(() => {
        peekBanner.removeEventListener("pointerdown", onPeekPointerDown);
      });
    }

    const onPanelPointerEnter = () => {
      if (composerHovered) return;
      composerHovered = true;
      syncComposerBarPeek();
    };
    const onPanelPointerLeave = () => {
      if (!composerHovered) return;
      composerHovered = false;
      syncComposerBarPeek();
    };
    panel.addEventListener("pointerenter", onPanelPointerEnter);
    panel.addEventListener("pointerleave", onPanelPointerLeave);
    destroyCallbacks.push(() => {
      panel.removeEventListener("pointerenter", onPanelPointerEnter);
      panel.removeEventListener("pointerleave", onPanelPointerLeave);
    });

    // pillRoot now hosts the pill + peek as viewport-level siblings, so the
    // panel's pointerenter/leave above no longer fires when the cursor is
    // over the pill area. Mirror the handlers onto pillRoot so hovering
    // either surface still drives `composerHovered`. Both handlers are
    // idempotent against the shared flag, so cross-traffic between panel
    // and pillRoot doesn't cause spurious flips.
    if (pillRoot) {
      pillRoot.addEventListener("pointerenter", onPanelPointerEnter);
      pillRoot.addEventListener("pointerleave", onPanelPointerLeave);
      destroyCallbacks.push(() => {
        pillRoot.removeEventListener("pointerenter", onPanelPointerEnter);
        pillRoot.removeEventListener("pointerleave", onPanelPointerLeave);
      });
    }
  }

  /**
   * Composer-bar geometry, owned in one place so collapsed → expanded (and
   * back) transitions don't leave stale inline styles from a previous state.
   * `createWrapper` no longer sets any geometry; everything flows through
   * here.
   *
   * Width is expressed as `width: <configured>; max-width: calc(100vw -
   * 32px)`. The two combine such that `width` wins on wide viewports and
   * `max-width` clamps on narrow ones: same effect as `min(...)` but
   * jsdom-compatible. `100vw` is always the viewport, so the containing-
   * block edge case (host with `transform`/`filter` causing `100%` to
   * resolve against the host instead of the viewport) is neutralized.
   */
  const applyComposerBarGeometry = (isOpen: boolean) => {
    const cb = config.launcher?.composerBar ?? {};
    const expandedSize = cb.expandedSize ?? "anchored";
    const bottomOffset = cb.bottomOffset ?? "16px";
    // No hardcoded default: when undefined, CSS media queries provide the
    // responsive width (90vw / 70vw / 50vw at <640 / <1024 / >=1024) on
    // pillRoot.
    const collapsedMaxWidth = cb.collapsedMaxWidth;
    const expandedMaxWidth = cb.expandedMaxWidth ?? "880px";
    const expandedTopOffset = cb.expandedTopOffset ?? "5vh";
    const modalMaxWidth = cb.modalMaxWidth ?? "880px";
    const modalMaxHeight = cb.modalMaxHeight ?? "min(90vh, 800px)";
    const viewportClamp = "calc(100vw - 32px)";
    // Static fallback for the pill area's height (pill + 8px gap + peek
    // slack). Anchored mode uses this to compute the wrapper's bottom edge
    // so the chat panel chrome doesn't overlap the pill below. Defer
    // ResizeObserver-based dynamic sizing until we see a real misalignment.
    const pillAreaClearance = "var(--persona-pill-area-height, 80px)";

    // Reset everything geometry-related so each branch sets exactly what it
    // needs. Using empty strings drops the inline declaration entirely so
    // CSS rules can take over (relevant for fullscreen).
    const s = wrapper.style;
    s.left = "";
    s.right = "";
    s.top = "";
    s.bottom = "";
    s.transform = "";
    s.width = "";
    s.maxWidth = "";
    s.height = "";
    s.maxHeight = "";

    // pillRoot owns its own geometry (bottom offset + collapsed width
    // override). Reset and re-apply per-config every call so config edits
    // (e.g. via the demo's mode-switch) propagate cleanly.
    if (pillRoot) {
      const ps = pillRoot.style;
      ps.bottom = bottomOffset;
      // CSS media queries handle responsive width when no override is set.
      ps.width = collapsedMaxWidth ?? "";
    }

    if (!isOpen) {
      // Collapsed: wrapper has nothing visible to render: the container
      // inside is `display: none` (via CSS keyed on `[data-state="collapsed"]`)
      // and the pill lives in pillRoot. Leave wrapper geometry empty so it
      // collapses to a zero-size positioning frame at the default fixed
      // origin. The container's fade-in keyframe handles the perceptible
      // expand animation, so there's no chrome to lose during this state.
      return;
    }

    if (expandedSize === "fullscreen") {
      // Leave inline styles cleared so the CSS rule for fullscreen takes over.
      return;
    }

    if (expandedSize === "modal") {
      s.top = "50%";
      s.left = "50%";
      s.transform = "translate(-50%, -50%)";
      s.bottom = "auto";
      s.right = "auto";
      s.width = modalMaxWidth;
      s.maxWidth = viewportClamp;
      s.maxHeight = modalMaxHeight;
      s.height = modalMaxHeight;
      return;
    }

    // Default: anchored: pill stays at the viewport bottom (in pillRoot);
    // wrapper's bottom edge clears the pill area so the chrome doesn't
    // overlap it.
    s.left = "50%";
    s.transform = "translateX(-50%)";
    s.bottom = `calc(${bottomOffset} + ${pillAreaClearance})`;
    s.top = expandedTopOffset;
    s.width = expandedMaxWidth;
    s.maxWidth = viewportClamp;
  };

  const updateOpenState = () => {
    if (!isPanelToggleable()) return;

    // Composer-bar mode morphs the wrapper between collapsed pill and
    // expanded panel via data-attrs + per-state inline geometry. The chat
    // body and header are hidden in the collapsed state so only the
    // composer footer remains visible in the pill.
    if (isComposerBar()) {
      const cb = config.launcher?.composerBar ?? {};
      const expandedSize = cb.expandedSize ?? "anchored";
      const nextState = open ? "expanded" : "collapsed";
      wrapper.dataset.state = nextState;
      wrapper.dataset.expandedSize = expandedSize;
      // pillRoot mirrors wrapper's state attributes so CSS rules keyed off
      // [data-state] / [data-expanded-size] cascade to pill + peek even
      // though they live outside the wrapper subtree.
      if (pillRoot) {
        pillRoot.dataset.state = nextState;
        pillRoot.dataset.expandedSize = expandedSize;
      }
      wrapper.style.removeProperty("display");
      wrapper.classList.remove("persona-pointer-events-none", "persona-opacity-0");
      panel.classList.remove(
        "persona-scale-95",
        "persona-opacity-0",
        "persona-scale-100",
        "persona-opacity-100"
      );

      applyComposerBarGeometry(open);

      // Toggle the entire container (chat chrome + body + close button) so
      // the collapsed pill only shows the footer (which lives as a SIBLING
      // of the container in the panel: see panel.appendChild(footer) above).
      // The footer is always visible / interactive.
      container.style.display = open ? "flex" : "none";

      // Re-run chrome application now that data-state has flipped: collapsed
      // clears container chrome (pill stands alone), expanded paints it via
      // the same theme.components.panel.* contract as floating mode.
      applyFullHeightStyles();

      // Outside-click dismiss: while expanded, clicking anywhere outside the
      // wrapper (panel chrome + pill) collapses back to just the pill.
      if (open) {
        attachComposerBarOutsideClickDismiss();
        attachComposerBarEscapeDismiss();
      } else {
        detachComposerBarOutsideClickDismiss();
        detachComposerBarEscapeDismiss();
      }
      // Peek banner is hidden when expanded (`open === true` short-circuits
      // visibility); re-sync so collapsing back re-evaluates immediately.
      syncComposerBarPeek();
      return;
    }

    const dockedMode = isDockedMountMode(config);
    const ownerWindow = mount.ownerDocument.defaultView ?? window;
    const mobileBreakpoint = config.launcher?.mobileBreakpoint ?? 640;
    const mobileFullscreen = config.launcher?.mobileFullscreen ?? true;
    const isMobileViewport = ownerWindow.innerWidth <= mobileBreakpoint;
    const shouldGoFullscreen = mobileFullscreen && isMobileViewport && launcherEnabled;
    const dockReveal = resolveDockConfig(config).reveal;
    const dockRevealUsesTransform =
      dockedMode && (dockReveal === "overlay" || dockReveal === "push") && !shouldGoFullscreen;

    if (open) {
      // Clear any display:none !important from a closed docked state so mobile fullscreen
      // (display:flex !important) and dock layout can apply in recalcPanelHeight.
      wrapper.style.removeProperty("display");
      wrapper.style.display = dockedMode ? "flex" : "";
      wrapper.classList.remove("persona-pointer-events-none", "persona-opacity-0");
      panel.classList.remove("persona-scale-95", "persona-opacity-0");
      panel.classList.add("persona-scale-100", "persona-opacity-100");
      // Hide launcher button when widget is open
      if (launcherButtonInstance) {
        launcherButtonInstance.element.style.display = "none";
      } else if (customLauncherElement) {
        customLauncherElement.style.display = "none";
      }
    } else {
      if (dockedMode) {
        if (dockRevealUsesTransform) {
          // Slide/push reveal: keep the panel painted so host-layout `transform` can animate.
          wrapper.style.removeProperty("display");
          wrapper.style.display = "flex";
          wrapper.classList.remove("persona-pointer-events-none", "persona-opacity-0");
          panel.classList.remove("persona-scale-100", "persona-opacity-100", "persona-scale-95", "persona-opacity-0");
        } else {
          // Must beat applyFullHeightStyles() mobile shell: display:flex !important on wrapper
          wrapper.style.setProperty("display", "none", "important");
          wrapper.classList.remove("persona-pointer-events-none", "persona-opacity-0");
          panel.classList.remove("persona-scale-100", "persona-opacity-100", "persona-scale-95", "persona-opacity-0");
        }
      } else {
        wrapper.style.display = "";
        wrapper.classList.add("persona-pointer-events-none", "persona-opacity-0");
        panel.classList.remove("persona-scale-100", "persona-opacity-100");
        panel.classList.add("persona-scale-95", "persona-opacity-0");
      }
      // Show launcher when closed, except docked mode (0px column: use controller.open()).
      if (launcherButtonInstance) {
        launcherButtonInstance.element.style.display = dockedMode ? "none" : "";
      } else if (customLauncherElement) {
        customLauncherElement.style.display = dockedMode ? "none" : "";
      }
    }
  };

  const setOpenState = (nextOpen: boolean, source: "user" | "auto" | "api" | "system" = "user") => {
    if (!isPanelToggleable()) return;
    if (open === nextOpen) return;
    
    const prevOpen = open;
    open = nextOpen;
    updateOpenState();

    // Sync host stacking and scroll lock for viewport-covering modes
    const isViewportCovering = (() => {
      const sm = config.launcher?.sidebarMode ?? false;
      const ow = mount.ownerDocument.defaultView ?? window;
      const mf = config.launcher?.mobileFullscreen ?? true;
      const mb = config.launcher?.mobileBreakpoint ?? 640;
      const isMobile = ow.innerWidth <= mb;
      const dockedMF = isDockedMountMode(config) && mf && isMobile;
      // Composer-bar in expanded fullscreen mode covers the viewport: lock
      // background scroll and elevate host stacking to match other
      // viewport-covering modes (mobile fullscreen, sidebar).
      const composerBarFS =
        isComposerBar() &&
        (config.launcher?.composerBar?.expandedSize ?? "fullscreen") === "fullscreen";
      return sm || (mf && isMobile && launcherEnabled) || dockedMF || composerBarFS;
    })();

    if (open && isViewportCovering) {
      if (!teardownHostStacking) {
        const root = mount.getRootNode();
        const hostEl = root instanceof ShadowRoot
          ? (root.host as HTMLElement)
          : mount.closest<HTMLElement>(".persona-host");
        if (hostEl) {
          teardownHostStacking = syncOverlayHostStacking(
            hostEl,
            config.launcher?.zIndex ?? DEFAULT_OVERLAY_Z_INDEX
          );
        }
      }
      if (!releaseScrollLock) {
        releaseScrollLock = acquireScrollLock(mount.ownerDocument);
      }
    } else if (!open) {
      teardownHostStacking?.();
      teardownHostStacking = null;
      releaseScrollLock?.();
      releaseScrollLock = null;
    }

    if (open) {
      recalcPanelHeight();
      // Reopen-where-left-off takes precedence when opted in (Principle 11);
      // otherwise fall back to the historical per-mode positioning.
      if (!restoreScrollPosition()) {
        if (getScrollMode() === "follow") {
          scheduleAutoScroll(true);
        } else {
          // Non-follow modes still start at the latest content when the panel
          // opens; they just never chase it during streaming.
          jumpToBottomInstant();
        }
      }
    }

    // Emit widget state events
    const stateEvent: AgentWidgetStateEvent = {
      open,
      source,
      timestamp: Date.now()
    };
    
    if (open && !prevOpen) {
      eventBus.emit("widget:opened", stateEvent);
    } else if (!open && prevOpen) {
      eventBus.emit("widget:closed", stateEvent);
    }
    
    // Emit general state snapshot
    eventBus.emit("widget:state", {
      open,
      launcherEnabled,
      voiceActive: voiceState.active,
      streaming: session.isStreaming()
    });
  };

  const setComposerDisabled = (disabled: boolean) => {
    // The send button stays enabled while streaming: it doubles as a stop
    // button. Ancillary controls (mic, suggestions, opt-in targets) still
    // disable so the user can't race a send against an in-flight stream.
    setSendButtonMode(disabled ? "stop" : "send");
    if (micButton) {
      micButton.disabled = disabled;
    }
    suggestionsManager.buttons.forEach((btn) => {
      btn.disabled = disabled;
    });
    footer.dataset.personaComposerStreaming = disabled ? "true" : "false";
    footer.querySelectorAll<HTMLElement>("[data-persona-composer-disable-when-streaming]").forEach((el) => {
      if (
        el instanceof HTMLButtonElement ||
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      ) {
        el.disabled = disabled;
      }
    });
  };

  const maybeFocusInput = () => {
    if (voiceState.active) return;
    if (!textarea) return;
    textarea.focus();
  };

  eventBus.on("widget:opened", () => {
    if (config.autoFocusInput) setTimeout(() => maybeFocusInput(), 200);
  });

  const updateCopy = () => {
    introTitle.textContent = config.copy?.welcomeTitle ?? "Hello 👋";
    introSubtitle.textContent =
      config.copy?.welcomeSubtitle ??
      "Ask anything about your account or products.";
    textarea.placeholder = config.copy?.inputPlaceholder ?? "How can I help...";

    // Toggle welcome card visibility
    const introCard = body.querySelector("[data-persona-intro-card]") as HTMLElement | null;
    if (introCard) {
      const showCard = config.copy?.showWelcomeCard !== false;
      introCard.style.display = showCard ? "" : "none";
      if (showCard) {
        body.classList.remove("persona-gap-3");
        body.classList.add("persona-gap-6");
      } else {
        body.classList.remove("persona-gap-6");
        body.classList.add("persona-gap-3");
      }
    }

    // Only update send button text if NOT using icon mode. Skip while
    // streaming so we don't stomp on the "Stop" label.
    const useIcon = config.sendButton?.useIcon ?? false;
    if (!useIcon && !session?.isStreaming()) {
      sendButton.textContent = config.copy?.sendButtonLabel ?? "Send";
    }

    textarea.style.fontFamily =
      'var(--persona-input-font-family, var(--persona-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif))';
    textarea.style.fontWeight = "var(--persona-input-font-weight, var(--persona-font-weight, 400))";
  };

  // Add session ID persistence callbacks for client token mode
  // These allow the widget to resume conversations by passing session_id to /client/init
  if (config.clientToken) {
    config = {
      ...config,
      getStoredSessionId: () => {
        const storedId = persistentMetadata['sessionId'];
        return typeof storedId === 'string' ? storedId : null;
      },
      setStoredSessionId: (sessionId: string) => {
        updateSessionMetadata((prev) => ({
          ...prev,
          sessionId: sessionId,
        }));
      },
    };
  }

  // Global timer for live-updating tool elapsed time spans.
  // Runs at 100ms while any [data-tool-elapsed] span exists in the message area,
  // auto-stops when none remain. Operates on real DOM after morph, not temp elements.
  let toolElapsedTimerId: ReturnType<typeof setInterval> | null = null;
  const ensureToolElapsedTimer = () => {
    if (toolElapsedTimerId != null) return;
    toolElapsedTimerId = setInterval(() => {
      const spans = messagesWrapper.querySelectorAll<HTMLElement>("[data-tool-elapsed]");
      if (spans.length === 0) {
        clearInterval(toolElapsedTimerId!);
        toolElapsedTimerId = null;
        return;
      }
      const now = Date.now();
      spans.forEach((span) => {
        const startedAt = Number(span.getAttribute("data-tool-elapsed"));
        if (!startedAt) return;
        span.textContent = formatElapsedMs(now - startedAt);
      });
    }, 100);
  };

  const isDeepEqual = (left: unknown, right: unknown): boolean => {
    if (Object.is(left, right)) return true;
    if (left === null || right === null) return false;
    if (typeof left !== "object" || typeof right !== "object") return false;
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
        return false;
      }
      return left.every((value, index) => isDeepEqual(value, right[index]));
    }
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(rightRecord);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(rightRecord, key) &&
          isDeepEqual(leftRecord[key], rightRecord[key])
      )
    );
  };

  const withoutStreamingText = (message: AgentWidgetMessage) => {
    const { content: _content, rawContent: _rawContent, llmContent: _llmContent, ...rest } = message;
    return rest;
  };

  const isPlainStreamingAssistant = (message: AgentWidgetMessage) =>
    message.role === "assistant" &&
    message.streaming === true &&
    !message.variant &&
    !message.toolCall &&
    !message.tools &&
    !message.approval &&
    !message.reasoning &&
    !message.contentParts &&
    !message.stopReason &&
    !hasComponentDirective(message);

  const isPureStreamingTextProgression = (
    previous: AgentWidgetMessage[],
    next: AgentWidgetMessage[],
    candidate: { index: number; id: string }
  ) => {
    if (previous.length !== next.length) return false;
    const before = previous[candidate.index];
    const after = next[candidate.index];
    if (!before || !after || before.id !== candidate.id || after.id !== candidate.id) {
      return false;
    }
    const textChanged =
      !Object.is(before.content, after.content) ||
      !Object.is(before.rawContent, after.rawContent) ||
      !Object.is(before.llmContent, after.llmContent);
    return (
      textChanged &&
      isPlainStreamingAssistant(before) &&
      isPlainStreamingAssistant(after) &&
      isDeepEqual(withoutStreamingText(before), withoutStreamingText(after))
    );
  };

  let lastAppliedMessages: AgentWidgetMessage[] | null = null;
  let activeStreamingTextCandidate: { index: number; id: string } | null = null;
  let pendingStreamingTextMessages: AgentWidgetMessage[] | null = null;
  let streamingTextRAF: number | null = null;

  const applyMessagesChanged = (messages: AgentWidgetMessage[]) => {
    lastAppliedMessages = messages;
    let lastUserMessage: AgentWidgetMessage | undefined;
    let lastAssistantMessage: AgentWidgetMessage | undefined;
    activeStreamingTextCandidate = null;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (!lastUserMessage && message.role === "user") lastUserMessage = message;
      if (!lastAssistantMessage && message.role === "assistant") {
        lastAssistantMessage = message;
      }
      if (!activeStreamingTextCandidate && isPlainStreamingAssistant(message)) {
        activeStreamingTextCandidate = { index, id: message.id };
      }
      if (lastUserMessage && lastAssistantMessage && activeStreamingTextCandidate) break;
    }
    renderMessagesWithPlugins(messagesWrapper, messages, postprocess);
    // Freshly (re)built inline artifact blocks render from their persisted
    // props; sync them with the live registry so a block created after the
    // last onArtifactsState emission still shows current content.
    updateInlineArtifactBlocks(messagesWrapper, lastArtifactsState.artifacts, {
      suppressTransition: isStreaming,
    });
    ensureToolElapsedTimer();
    renderSuggestions(messages);
    scheduleAutoScroll(!isStreaming);
    trackMessages(messages);

    if (messages.length === 0) {
      resetAnchorState();
      followFallbackActive = true;
      currentTurnAnchored = false;
    }
    if (!scrollSendSeeded || suppressScrollSend) {
      scrollSendSeeded = true;
      lastSentUserMessageId = lastUserMessage?.id ?? null;
      lastHandledAssistantId = lastAssistantMessage?.id ?? null;
    } else if (lastUserMessage && lastUserMessage.id !== lastSentUserMessageId) {
      lastSentUserMessageId = lastUserMessage.id;
      handleUserMessageSent(lastUserMessage.id);
    } else if (
      lastAssistantMessage &&
      lastAssistantMessage.id !== lastHandledAssistantId
    ) {
      handleAssistantTurnStarted();
    }
    if (lastAssistantMessage) lastHandledAssistantId = lastAssistantMessage.id;

    const prevLastUserMessageId = voiceState.lastUserMessageId;
    if (lastUserMessage && lastUserMessage.id !== prevLastUserMessageId) {
      voiceState.lastUserMessageId = lastUserMessage.id;
      eventBus.emit("user:message", lastUserMessage);
    }

    voiceState.lastUserMessageWasVoice = Boolean(lastUserMessage?.viaVoice);
    persistState(messages);
    syncComposerBarPeek();
  };

  const flushPendingStreamingText = () => {
    if (streamingTextRAF !== null) {
      cancelAnimationFrame(streamingTextRAF);
      streamingTextRAF = null;
    }
    const pending = pendingStreamingTextMessages;
    pendingStreamingTextMessages = null;
    if (pending) applyMessagesChanged(pending);
  };

  const discardPendingStreamingText = () => {
    if (streamingTextRAF !== null) cancelAnimationFrame(streamingTextRAF);
    streamingTextRAF = null;
    pendingStreamingTextMessages = null;
  };

  const handleMessagesChanged = (messages: AgentWidgetMessage[]) => {
    const comparison = pendingStreamingTextMessages ?? lastAppliedMessages;
    if (
      isStreaming &&
      comparison &&
      activeStreamingTextCandidate &&
      isPureStreamingTextProgression(
        comparison,
        messages,
        activeStreamingTextCandidate
      )
    ) {
      pendingStreamingTextMessages = messages;
      if (streamingTextRAF === null) {
        streamingTextRAF = requestAnimationFrame(() => {
          streamingTextRAF = null;
          const pending = pendingStreamingTextMessages;
          pendingStreamingTextMessages = null;
          if (pending) applyMessagesChanged(pending);
        });
      }
      return;
    }

    if (messages.length === 0) {
      discardPendingStreamingText();
      applyMessagesChanged(messages);
      return;
    }
    flushPendingStreamingText();
    applyMessagesChanged(messages);
  };

  session = new AgentWidgetSession(config, {
    onMessagesChanged(messages) {
      handleMessagesChanged(messages);
    },
    onStatusChanged(status) {
      const currentStatusConfig = config.statusIndicator ?? {};
      const getCurrentStatusText = (s: AgentWidgetSessionStatus): string => {
        if (s === "idle") return currentStatusConfig.idleText ?? statusCopy.idle;
        if (s === "connecting") return currentStatusConfig.connectingText ?? statusCopy.connecting;
        if (s === "connected") return currentStatusConfig.connectedText ?? statusCopy.connected;
        if (s === "error") return currentStatusConfig.errorText ?? statusCopy.error;
        if (s === "paused") return currentStatusConfig.pausedText ?? statusCopy.paused;
        if (s === "resuming") return currentStatusConfig.resumingText ?? statusCopy.resuming;
        return statusCopy[s];
      };
      applyStatusToElement(statusText, getCurrentStatusText(status), currentStatusConfig, status);
    },
    onStreamingChanged(streaming) {
      if (!streaming) {
        if (session?.getMessages().length === 0) {
          discardPendingStreamingText();
        } else {
          flushPendingStreamingText();
        }
      }
      isStreaming = streaming;
      setComposerDisabled(streaming);
      // Re-render messages to show/hide typing indicator
      if (session) {
        renderMessagesWithPlugins(messagesWrapper, session.getMessages(), postprocess);
      }
      if (!streaming) {
        scheduleAutoScroll(true);
      }
      // Keep the "streaming below" hint and its announcement in sync with the
      // streaming lifecycle (Principles 8 + 15).
      syncScrollToBottomButton();
      announce(streaming ? "Responding…" : "Response complete.");
      // Composer-bar peek: streaming state is one of the two visibility
      // triggers (the other is composer hover), so re-evaluate now.
      syncComposerBarPeek();
    },
    onVoiceStatusChanged(status: VoiceStatus) {
      // Surface the granular status publicly so consumers can render their own
      // per-state UI (e.g. a listening/speaking status dock). Fires for every
      // provider; the mic-button styling below is runtype-specific.
      eventBus.emit("voice:status", { status, timestamp: Date.now() });
      if (config.voiceRecognition?.provider?.type !== 'runtype') return;

      switch (status) {
        case 'listening':
          // A continuous realtime call re-enters `listening` after every spoken
          // reply, so reassert the recording styles here (they were replaced by
          // the `processing`/`speaking` states during the turn). The initial
          // listen is also styled by the toggleVoice()/startVoiceRecognition()
          // flows; reapplying is idempotent.
          removeRuntypeMicStateStyles();
          applyRuntypeMicRecordingStyles();
          break;
        case 'processing':
          removeRuntypeMicStateStyles();
          applyRuntypeMicProcessingStyles();
          break;
        case 'speaking':
          removeRuntypeMicStateStyles();
          applyRuntypeMicSpeakingStyles();
          break;
        default:
          // idle, connected, disconnected, error
          if (status === 'idle' && session.isBargeInActive()) {
            // Barge-in mic is still hot between turns: show it as active
            removeRuntypeMicStateStyles();
            applyRuntypeMicRecordingStyles();
            micButton?.setAttribute("aria-label", "End voice session");
          } else {
            voiceState.active = false;
            removeRuntypeMicStateStyles();
            emitVoiceState("system");
            persistVoiceMetadata();
          }
          break;
      }
    },
    onArtifactsState(state) {
      lastArtifactsState = state;
      // A cleared registry ends any explicit-open override: the next artifact
      // decides pane visibility purely from its own display mode.
      if (state.artifacts.length === 0) {
        artifactsPaneUserOpened = false;
      }
      // Route streaming registry updates (artifact_delta / artifact_complete)
      // into any inline artifact blocks in the transcript. Suppress the
      // streaming→complete View Transition while the session is still
      // streaming: it captures the whole document, and cross-fading a stale
      // snapshot over still-moving message text reads as ghosting/motion blur
      // on the transcript.
      updateInlineArtifactBlocks(messagesWrapper, state.artifacts, {
        suppressTransition: isStreaming,
      });
      syncArtifactPane();
      persistState();
    },
    onReconnect(event) {
      // Map the durable-reconnect lifecycle to public controller events.
      const { executionId, lastEventId } = event.handle;
      if (event.phase === "paused") {
        eventBus.emit("stream:paused", { executionId, after: lastEventId });
      } else if (event.phase === "resuming") {
        eventBus.emit("stream:resuming", {
          executionId,
          after: lastEventId,
          attempt: event.attempt ?? 1,
        });
      } else {
        eventBus.emit("stream:resumed", { executionId, after: lastEventId });
      }
    }
  });

  sessionRef.current = session;

  // On teardown, cancel any in-flight turn/reconnect so a pending durable
  // reconnect's backoff timer and focus/online listeners don't outlive the
  // widget (cancel() → teardownReconnect()).
  destroyCallbacks.push(() => session.cancel());

  // Mirror read-aloud playback state into the action buttons, and surface it as
  // a controller event (parallel to message:copy / message:feedback).
  let lastReadAloudId: string | null = null;
  session.onReadAloudChange((activeId, state) => {
    readAloudActiveId = activeId;
    readAloudActiveState = state;
    refreshReadAloudButtons();

    // On the terminal `idle` transition activeId is null, so fall back to the
    // last active id to identify the message that just finished/stopped.
    const messageId = activeId ?? lastReadAloudId;
    if (activeId) lastReadAloudId = activeId;
    const message = messageId
      ? session.getMessages().find((m) => m.id === messageId) ?? null
      : null;
    eventBus.emit("message:read-aloud", {
      messageId,
      message,
      state,
      timestamp: Date.now(),
    });
    if (state === "idle") lastReadAloudId = null;
  });

  // The constructor only emits onMessagesChanged when it has initial
  // messages, so seed send-detection explicitly for the empty-session case:  // otherwise the user's very first send would be mistaken for the seed.
  scrollSendSeeded = true;

  // Setup Runtype voice provider when configured (connects WebSocket for server-side STT)
  if (config.voiceRecognition?.provider?.type === 'runtype') {
    try {
      session.setupVoice();
    } catch (err) {
      if (typeof console !== 'undefined') {
        // eslint-disable-next-line no-console
        console.warn('[AgentWidget] Runtype voice setup failed:', err);
      }
    }
  }

  // Pre-initialize client session when in client token mode so feedback works
  // before the user sends their first message (e.g. on restored/persisted messages)
  if (config.clientToken) {
    session.initClientSession().catch((err) => {
      if (config.debug) {
        // eslint-disable-next-line no-console
        console.warn("[AgentWidget] Pre-init client session failed:", err);
      }
    });
  }

  // Wire up optional SSE tap (host) + event stream buffer to capture SSE events
  if (eventStreamBuffer || config.onSSEEvent) {
    session.setSSEEventCallback((type: string, payload: unknown) => {
      config.onSSEEvent?.(type, payload);
      throughputTracker?.processEvent(type, payload);
      eventStreamBuffer?.push({
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        timestamp: Date.now(),
        payload: JSON.stringify(payload)
      });
    });
  }

  // Durable-session reconnect boot path: once history is in place,
  // if the host passed a non-terminal resume handle (+ a reconnect transport),
  // immediately re-enter `resuming` and replay everything past the cursor into
  // the restored conversation. Fires AFTER hydration so the trailing partial
  // assistant bubble exists for the replay to append to.
  const maybeBootResume = () => {
    if (config.resume && typeof config.reconnectStream === "function") {
      session.resumeFromHandle(config.resume);
    }
  };

  if (pendingStoredState) {
    pendingStoredState
      .then((state) => {
        if (!state) return;
        if (state.metadata) {
          persistentMetadata = ensureRecord(state.metadata);
          actionManager.syncFromMetadata();
        }
        if (state.messages?.length) {
          // Restored history must not read as a fresh send (scroll-on-send /
          // anchor-top would fire for the last restored user message).
          suppressScrollSend = true;
          try {
            session.hydrateMessages(state.messages);
          } finally {
            suppressScrollSend = false;
          }
        }
        if (state.artifacts?.length) {
          session.hydrateArtifacts(
            state.artifacts,
            state.selectedArtifactId ?? null
          );
        }
      })
      .catch((error) => {
        if (typeof console !== "undefined") {
          // eslint-disable-next-line no-console
          console.error("[AgentWidget] Failed to hydrate stored state:", error);
        }
      })
      .finally(() => maybeBootResume());
  } else {
    maybeBootResume();
  }

  // Centralized so both the default composer (`handleSubmit`) and the plugin
  // composer (`renderComposer.onSubmit`) auto-expand the composer-bar wrapper
  // when a message is sent while the panel is collapsed. Without a single
  // helper the two submit paths drift over time.
  const maybeExpandComposerBar = () => {
    if (!isComposerBar()) return;
    if (open) return;
    const expandOnSubmit = config.launcher?.composerBar?.expandOnSubmit ?? true;
    if (!expandOnSubmit) return;
    setOpenState(true, "auto");
  };

  const handleSubmit = (event: Event) => {
    event.preventDefault();

    // While a response is streaming, the submit button acts as a stop button.
    // Abort the in-flight stream and leave textarea contents / attachments
    // intact so the user can edit and resend without retyping.
    if (session.isStreaming()) {
      session.cancel();
      // Cancelling emits no terminal/error SSE frame, so reset the throughput
      // tracker (as clear-chat does) to avoid a stale `running` row lingering.
      throughputTracker?.reset();
      eventStreamView?.update();
      return;
    }

    const value = textarea.value.trim();
    const hasAttachments = attachmentManager?.hasAttachments() ?? false;

    // Must have text or attachments to send
    if (!value && !hasAttachments) return;

    maybeExpandComposerBar();

    // Build content parts if there are attachments
    let contentParts: ContentPart[] | undefined;
    if (hasAttachments) {
      contentParts = [];
      // Add image parts first
      contentParts.push(...attachmentManager!.getContentParts());
      // Add text part if there's text
      if (value) {
        contentParts.push(createTextPart(value));
      }
    }

    textarea.value = "";
    textarea.style.height = "auto"; // Reset height after clearing
    resetHistoryNavigation();

    // Send message with optional content parts
    session.sendMessage(value, { contentParts });

    // Clear attachments after sending
    if (hasAttachments) {
      attachmentManager!.clearAttachments();
    }
  };

  // --- Composer message-history navigation (Up/Down arrows) ---
  // Lets users recall and edit previously sent messages, shell/Slack style.
  // The pure state machine lives in utils/composer-history.ts; here we feed it
  // caret info and apply the value it returns. Text-only recall: attachments
  // on past messages are not restored.
  const historyNavigationEnabled = () =>
    config.features?.composerHistory !== false;

  let composerHistoryState: ComposerHistoryState = { ...INITIAL_HISTORY_STATE };
  // Guards the reset-on-edit listener so our own programmatic value sets (which
  // dispatch an `input` event for auto-resize) don't exit navigation mode.
  let suppressHistoryReset = false;

  const resetHistoryNavigation = () => {
    composerHistoryState = { ...INITIAL_HISTORY_STATE };
  };

  const getUserMessageHistory = (): string[] =>
    session
      .getMessages()
      .filter((message) => message.role === "user")
      .map((message) => message.content ?? "")
      .filter((text) => text.length > 0);

  const applyHistoryValue = (value: string) => {
    if (!textarea) return;
    suppressHistoryReset = true;
    textarea.value = value;
    // Trigger the auto-resize handler (it listens on `input`).
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    suppressHistoryReset = false;
    // Caret to end for natural editing / appending.
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  };

  const handleComposerInput = () => {
    // A real edit leaves history-navigation mode.
    if (suppressHistoryReset) return;
    resetHistoryNavigation();
  };

  const handleComposerKeydown = (event: KeyboardEvent) => {
    if (!textarea) return;

    // Up/Down: walk through previously sent user messages.
    if (
      historyNavigationEnabled() &&
      (event.key === "ArrowUp" || event.key === "ArrowDown") &&
      !event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.isComposing
    ) {
      const atStart =
        textarea.selectionStart === 0 && textarea.selectionEnd === 0;
      const result = navigateComposerHistory({
        direction: event.key === "ArrowUp" ? "up" : "down",
        history: getUserMessageHistory(),
        currentValue: textarea.value,
        atStart,
        state: composerHistoryState
      });
      composerHistoryState = result.state;
      if (result.handled) {
        event.preventDefault();
        if (result.value !== undefined) {
          applyHistoryValue(result.value);
        }
        return;
      }
      // Not handled: fall through to default cursor movement.
    }

    // Enter: send, unless a response is streaming. While streaming, Enter is
    // inert (never a stop trigger): the visible Stop button / Esc stop it.
    if (event.key === "Enter" && !event.shiftKey) {
      if (session.isStreaming()) {
        event.preventDefault();
        return;
      }
      resetHistoryNavigation();
      event.preventDefault();
      sendButton.click();
    }
  };

  // Esc-to-stop: while a response streams, Escape within this widget aborts it.
  // Capture phase + registered at init so it runs before the composer-bar Esc
  // collapse listener (attached later on open); stopImmediatePropagation keeps
  // a stream-stop from also collapsing the panel. Scoped via composedPath so a
  // page-wide Escape elsewhere doesn't hijack.
  const handleEscStop = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.isComposing) return;
    if (!session.isStreaming()) return;
    if (!event.composedPath().includes(container)) return;
    session.cancel();
    // Cancelling emits no terminal/error SSE frame: reset throughput so the
    // Events row doesn't keep showing a live rate from the stopped stream.
    throughputTracker?.reset();
    eventStreamView?.update();
    resetHistoryNavigation();
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const handleInputPaste = async (event: ClipboardEvent) => {
    if (config.attachments?.enabled !== true || !attachmentManager) return;

    const clipboardImageFiles = getClipboardImageFiles(event.clipboardData);
    if (clipboardImageFiles.length === 0) return;

    // Prevent browser text/html paste when handling clipboard images as attachments.
    event.preventDefault();
    await attachmentManager.handleFiles(clipboardImageFiles);
  };

  // Voice recognition state and logic
  let speechRecognition: any = null;
  let isRecording = false;
  let pauseTimer: number | null = null;
  let originalMicStyles: {
    backgroundColor: string;
    color: string;
    borderColor: string;
    iconName: string;
    iconSize: number;
  } | null = null;

  const getSpeechRecognitionClass = (): any => {
    if (typeof window === 'undefined') return null;
    return (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition || null;
  };

  const startVoiceRecognition = (
    source: AgentWidgetVoiceStateEvent["source"] = "user"
  ) => {
    if (isRecording || session.isStreaming()) return;

    const SpeechRecognitionClass = getSpeechRecognitionClass();
    if (!SpeechRecognitionClass) return;

    speechRecognition = new SpeechRecognitionClass();
    const voiceConfig = config.voiceRecognition ?? {};
    const pauseDuration = voiceConfig.pauseDuration ?? 2000;

    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = 'en-US';

    // Store the initial text that was in the textarea
    const initialText = textarea.value;

    speechRecognition.onresult = (event: any) => {
      // Build the complete transcript from all results
      let fullTranscript = "";
      let interimTranscript = "";
      
      // Process all results from the beginning
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        
        if (result.isFinal) {
          fullTranscript += transcript + " ";
        } else {
          // Only take the last interim result
          interimTranscript = transcript;
        }
      }
      
      // Update textarea with initial text + full transcript + interim
      const newValue = initialText + fullTranscript + interimTranscript;
      textarea.value = newValue;

      // Reset pause timer on each result
      if (pauseTimer) {
        clearTimeout(pauseTimer);
      }

      // Set timer to auto-submit after pause when we have any speech
      if (fullTranscript || interimTranscript) {
        pauseTimer = window.setTimeout(() => {
          const finalValue = textarea.value.trim();
          if (finalValue && speechRecognition && isRecording) {
            stopVoiceRecognition();
            textarea.value = "";
            textarea.style.height = "auto"; // Reset height after clearing
            session.sendMessage(finalValue, { viaVoice: true });
          }
        }, pauseDuration);
      }
    };

    speechRecognition.onerror = (event: any) => {
      // Don't stop on "no-speech" error, just ignore it
      if (event.error !== 'no-speech') {
        stopVoiceRecognition();
      }
    };

    speechRecognition.onend = () => {
      // If recognition ended naturally (not manually stopped), submit if there's text
      if (isRecording) {
        const finalValue = textarea.value.trim();
        if (finalValue && finalValue !== initialText.trim()) {
          textarea.value = "";
          textarea.style.height = "auto"; // Reset height after clearing
          session.sendMessage(finalValue, { viaVoice: true });
        }
        stopVoiceRecognition();
      }
    };

    try {
      speechRecognition.start();
      isRecording = true;
      voiceState.active = true;
      if (source !== "system") {
        voiceState.manuallyDeactivated = false;
      }
      emitVoiceState(source);
      persistVoiceMetadata();
      if (micButton) {
        // Store original styles (including icon info for restoration)
        const voiceConfig = config.voiceRecognition ?? {};
        originalMicStyles = {
          backgroundColor: micButton.style.backgroundColor,
          color: micButton.style.color,
          borderColor: micButton.style.borderColor,
          iconName: voiceConfig.iconName ?? "mic",
          iconSize: parseFloat(voiceConfig.iconSize ?? config.sendButton?.size ?? "40") || 24,
        };

        // Apply recording state styles from config or theme tokens
        const recordingBackgroundColor = voiceConfig.recordingBackgroundColor;
        const recordingIconColor = voiceConfig.recordingIconColor;
        const recordingBorderColor = voiceConfig.recordingBorderColor;

        micButton.classList.add("persona-voice-recording");
        micButton.style.backgroundColor = recordingBackgroundColor ?? "var(--persona-voice-recording-bg, #ef4444)";
        micButton.style.color = recordingIconColor ?? "var(--persona-voice-recording-indicator, #ffffff)";

        if (recordingIconColor) {
          const svg = micButton.querySelector("svg");
          if (svg) {
            svg.setAttribute("stroke", recordingIconColor);
          }
        }
        
        if (recordingBorderColor) {
          micButton.style.borderColor = recordingBorderColor;
        }
        
        micButton.setAttribute("aria-label", "Stop voice recognition");
      }
    } catch (error) {
      stopVoiceRecognition("system");
    }
  };

  const stopVoiceRecognition = (
    source: AgentWidgetVoiceStateEvent["source"] = "user"
  ) => {
    if (!isRecording) return;

    isRecording = false;
    if (pauseTimer) {
      clearTimeout(pauseTimer);
      pauseTimer = null;
    }

    if (speechRecognition) {
      try {
        speechRecognition.stop();
      } catch (error) {
        // Ignore errors when stopping
      }
      speechRecognition = null;
    }

    voiceState.active = false;
    emitVoiceState(source);
    persistVoiceMetadata();

    if (micButton) {
      micButton.classList.remove("persona-voice-recording");
      
      // Restore original styles
      if (originalMicStyles) {
        micButton.style.backgroundColor = originalMicStyles.backgroundColor;
        micButton.style.color = originalMicStyles.color;
        micButton.style.borderColor = originalMicStyles.borderColor;
        
        // Restore SVG stroke color if present
        const svg = micButton.querySelector("svg");
        if (svg) {
          svg.setAttribute("stroke", originalMicStyles.color || "currentColor");
        }
        
        originalMicStyles = null;
      }
      
      micButton.setAttribute("aria-label", "Start voice recognition");
    }
  };

  // Function to create mic button dynamically
  const createMicButton = (voiceConfig: AgentWidgetConfig['voiceRecognition'], sendButtonConfig: AgentWidgetConfig['sendButton']): { micButton: HTMLButtonElement; micButtonWrapper: HTMLElement } | null => {
    const hasSpeechRecognition =
      typeof window !== 'undefined' &&
      (typeof (window as any).webkitSpeechRecognition !== 'undefined' ||
       typeof (window as any).SpeechRecognition !== 'undefined');
    const hasRuntypeProvider = voiceConfig?.provider?.type === 'runtype';
    // Bring-your-own (`custom`) providers own their own input pipeline (cloud
    // STT, etc.), so the mic should render regardless of Web Speech support.
    const hasCustomProvider = voiceConfig?.provider?.type === 'custom';
    const hasVoiceInput = hasSpeechRecognition || hasRuntypeProvider || hasCustomProvider;

    if (!hasVoiceInput) return null;

    const micButtonWrapper = createElement("div", "persona-send-button-wrapper");
    const micButton = createElement(
      "button",
      "persona-rounded-button persona-flex persona-items-center persona-justify-center disabled:persona-opacity-50 persona-cursor-pointer"
    ) as HTMLButtonElement;
    
    micButton.type = "button";
    micButton.setAttribute("aria-label", "Start voice recognition");
    
    const micIconName = voiceConfig?.iconName ?? "mic";
    const buttonSize = sendButtonConfig?.size ?? "40px";
    const micIconSize = voiceConfig?.iconSize ?? buttonSize;
    const micIconSizeNum = parseFloat(micIconSize) || 24;
    
    // Use dedicated colors from voice recognition config, fallback to send button colors
    const backgroundColor = voiceConfig?.backgroundColor ?? sendButtonConfig?.backgroundColor;
    const iconColor = voiceConfig?.iconColor ?? sendButtonConfig?.textColor;
    
    micButton.style.width = micIconSize;
    micButton.style.height = micIconSize;
    micButton.style.minWidth = micIconSize;
    micButton.style.minHeight = micIconSize;
    micButton.style.fontSize = "18px";
    micButton.style.lineHeight = "1";
    
    // Set mic button foreground from config or theme token
    if (iconColor) {
      micButton.style.color = iconColor;
    } else {
      micButton.style.color = "var(--persona-text, #111827)";
    }

    // Use Lucide mic icon (stroke width 1.5 for minimalist outline style)
    const iconColorValue = iconColor || "currentColor";
    const micIconSvg = renderLucideIcon(micIconName, micIconSizeNum, iconColorValue, 1.5);
    if (micIconSvg) {
      micButton.appendChild(micIconSvg);
    } else {
      micButton.textContent = "🎤";
    }

    // Apply background color
    if (backgroundColor) {
      micButton.style.backgroundColor = backgroundColor;
    } else {
      micButton.style.backgroundColor = "";
    }
    
    // Apply border styling
    if (voiceConfig?.borderWidth) {
      micButton.style.borderWidth = voiceConfig.borderWidth;
      micButton.style.borderStyle = "solid";
    }
    if (voiceConfig?.borderColor) {
      micButton.style.borderColor = voiceConfig.borderColor;
    }
    
    // Apply padding styling
    if (voiceConfig?.paddingX) {
      micButton.style.paddingLeft = voiceConfig.paddingX;
      micButton.style.paddingRight = voiceConfig.paddingX;
    }
    if (voiceConfig?.paddingY) {
      micButton.style.paddingTop = voiceConfig.paddingY;
      micButton.style.paddingBottom = voiceConfig.paddingY;
    }
    
    micButtonWrapper.appendChild(micButton);
    
    // Add tooltip if enabled
    const tooltipText = voiceConfig?.tooltipText ?? "Start voice recognition";
    const showTooltip = voiceConfig?.showTooltip ?? false;
    if (showTooltip && tooltipText) {
      const tooltip = createElement("div", "persona-send-button-tooltip");
      tooltip.textContent = tooltipText;
      micButtonWrapper.appendChild(tooltip);
    }
    
    return { micButton, micButtonWrapper };
  };

  // --- Helpers to store/restore original mic button state ---

  const storeOriginalMicStyles = () => {
    if (!micButton || originalMicStyles) return; // Already stored
    const voiceConfig = config.voiceRecognition ?? {};
    originalMicStyles = {
      backgroundColor: micButton.style.backgroundColor,
      color: micButton.style.color,
      borderColor: micButton.style.borderColor,
      iconName: voiceConfig.iconName ?? "mic",
      iconSize: parseFloat(voiceConfig.iconSize ?? config.sendButton?.size ?? "40") || 24,
    };
  };

  /** Swap the mic button's SVG icon */
  const swapMicIcon = (iconName: string, color: string) => {
    if (!micButton) return;
    const existingSvg = micButton.querySelector("svg");
    if (existingSvg) existingSvg.remove();
    const size = originalMicStyles?.iconSize ?? (parseFloat(config.voiceRecognition?.iconSize ?? config.sendButton?.size ?? "40") || 24);
    const newSvg = renderLucideIcon(iconName, size, color, 1.5);
    if (newSvg) micButton.appendChild(newSvg);
  };

  /** Remove all voice state CSS classes */
  const removeAllVoiceStateClasses = () => {
    if (!micButton) return;
    micButton.classList.remove("persona-voice-recording", "persona-voice-processing", "persona-voice-speaking");
  };

  // --- Per-state style application ---

  const applyRuntypeMicRecordingStyles = () => {
    if (!micButton) return;
    storeOriginalMicStyles();
    const voiceConfig = config.voiceRecognition ?? {};
    const recordingBackgroundColor = voiceConfig.recordingBackgroundColor;
    const recordingIconColor = voiceConfig.recordingIconColor;
    const recordingBorderColor = voiceConfig.recordingBorderColor;
    removeAllVoiceStateClasses();
    micButton.classList.add("persona-voice-recording");
    micButton.style.backgroundColor = recordingBackgroundColor ?? "var(--persona-voice-recording-bg, #ef4444)";
    micButton.style.color = recordingIconColor ?? "var(--persona-voice-recording-indicator, #ffffff)";
    if (recordingIconColor) {
      const svg = micButton.querySelector("svg");
      if (svg) svg.setAttribute("stroke", recordingIconColor);
    }
    if (recordingBorderColor) micButton.style.borderColor = recordingBorderColor;
    micButton.setAttribute("aria-label", "Stop voice recognition");
  };

  const applyRuntypeMicProcessingStyles = () => {
    if (!micButton) return;
    storeOriginalMicStyles();
    const voiceConfig = config.voiceRecognition ?? {};
    const interruptionMode = session.getVoiceInterruptionMode();
    const iconName = voiceConfig.processingIconName ?? "loader";
    const iconColor = voiceConfig.processingIconColor ?? originalMicStyles?.color ?? "";
    const bgColor = voiceConfig.processingBackgroundColor ?? originalMicStyles?.backgroundColor ?? "";
    const borderColor = voiceConfig.processingBorderColor ?? originalMicStyles?.borderColor ?? "";

    removeAllVoiceStateClasses();
    micButton.classList.add("persona-voice-processing");
    micButton.style.backgroundColor = bgColor;
    micButton.style.borderColor = borderColor;
    const resolvedColor = iconColor || "currentColor";
    micButton.style.color = resolvedColor;
    swapMicIcon(iconName, resolvedColor);
    micButton.setAttribute("aria-label", "Processing voice input");
    // In "none" mode the button is not actionable during processing
    if (interruptionMode === "none") {
      micButton.style.cursor = "default";
    }
  };

  const applyRuntypeMicSpeakingStyles = () => {
    if (!micButton) return;
    storeOriginalMicStyles();
    const voiceConfig = config.voiceRecognition ?? {};
    const interruptionMode = session.getVoiceInterruptionMode();
    // Default icon depends on interruption mode:
    // "square" for cancel, "mic" for barge-in (hot mic), "volume-2" otherwise
    const defaultSpeakingIcon = interruptionMode === "cancel" ? "square"
      : interruptionMode === "barge-in" ? "mic"
      : "volume-2";
    const iconName = voiceConfig.speakingIconName ?? defaultSpeakingIcon;
    const iconColor = voiceConfig.speakingIconColor
      ?? (interruptionMode === "barge-in" ? (voiceConfig.recordingIconColor ?? originalMicStyles?.color ?? "") : (originalMicStyles?.color ?? ""));
    const bgColor = voiceConfig.speakingBackgroundColor
      ?? (interruptionMode === "barge-in" ? (voiceConfig.recordingBackgroundColor ?? "var(--persona-voice-recording-bg, #ef4444)") : (originalMicStyles?.backgroundColor ?? ""));
    const borderColor = voiceConfig.speakingBorderColor
      ?? (interruptionMode === "barge-in" ? (voiceConfig.recordingBorderColor ?? "") : (originalMicStyles?.borderColor ?? ""));

    removeAllVoiceStateClasses();
    micButton.classList.add("persona-voice-speaking");
    micButton.style.backgroundColor = bgColor;
    micButton.style.borderColor = borderColor;
    const resolvedColor = iconColor || "currentColor";
    micButton.style.color = resolvedColor;
    swapMicIcon(iconName, resolvedColor);

    // aria-label varies by interruption mode
    const ariaLabel = interruptionMode === "cancel"
      ? "Stop playback and re-record"
      : interruptionMode === "barge-in"
      ? "Speak to interrupt"
      : "Agent is speaking";
    micButton.setAttribute("aria-label", ariaLabel);
    // In "none" mode the button is not actionable during speaking
    if (interruptionMode === "none") {
      micButton.style.cursor = "default";
    }
    // In "barge-in" mode, add recording class to show mic is hot
    if (interruptionMode === "barge-in") {
      micButton.classList.add("persona-voice-recording");
    }
  };

  /** Restore mic button to idle state (icon, colors, aria-label, cursor) */
  const removeRuntypeMicStateStyles = () => {
    if (!micButton) return;
    removeAllVoiceStateClasses();
    if (originalMicStyles) {
      micButton.style.backgroundColor = originalMicStyles.backgroundColor ?? "";
      micButton.style.color = originalMicStyles.color ?? "";
      micButton.style.borderColor = originalMicStyles.borderColor ?? "";
      swapMicIcon(originalMicStyles.iconName, originalMicStyles.color || "currentColor");
      originalMicStyles = null;
    }
    micButton.style.cursor = "";
    micButton.setAttribute("aria-label", "Start voice recognition");
  };

  // Wire up mic button click handler
  const handleMicButtonClick = () => {
    // Runtype provider: use session.toggleVoice() (WebSocket-based STT)
    if (config.voiceRecognition?.provider?.type === 'runtype') {
      const voiceStatus = session.getVoiceStatus();
      const interruptionMode = session.getVoiceInterruptionMode();

      // In "none" mode, ignore clicks while processing or speaking
      if (interruptionMode === "none" &&
          (voiceStatus === "processing" || voiceStatus === "speaking")) {
        return;
      }

      // In "cancel" mode during processing/speaking: stop playback only
      if (interruptionMode === "cancel" &&
          (voiceStatus === "processing" || voiceStatus === "speaking")) {
        session.stopVoicePlayback();
        return;
      }

      // In barge-in mode, clicking mic = "hang up" (any state: speaking, idle, etc.)
      // Stops playback if active, tears down the always-on mic.
      if (session.isBargeInActive()) {
        session.stopVoicePlayback();
        session.deactivateBargeIn().then(() => {
          voiceState.active = false;
          voiceState.manuallyDeactivated = true;
          persistVoiceMetadata();
          emitVoiceState("user");
          removeRuntypeMicStateStyles();
        });
        return;
      }

      session.toggleVoice().then(() => {
        voiceState.active = session.isVoiceActive();
        voiceState.manuallyDeactivated = !session.isVoiceActive();
        persistVoiceMetadata();
        emitVoiceState("user");
        if (session.isVoiceActive()) {
          applyRuntypeMicRecordingStyles();
        } else {
          removeRuntypeMicStateStyles();
        }
      });
      return;
    }

    // Browser provider: use SpeechRecognition
    if (isRecording) {
      // Stop recording and submit
      const finalValue = textarea.value.trim();
      voiceState.manuallyDeactivated = true;
      persistVoiceMetadata();
      stopVoiceRecognition("user");
      if (finalValue) {
        textarea.value = "";
        textarea.style.height = "auto"; // Reset height after clearing
        session.sendMessage(finalValue);
      }
    } else {
      // Start recording
      voiceState.manuallyDeactivated = false;
      persistVoiceMetadata();
      startVoiceRecognition("user");
    }
  };

  composerVoiceBridge = handleMicButtonClick;

  if (micButton) {
    micButton.addEventListener("click", handleMicButtonClick);

    destroyCallbacks.push(() => {
      if (config.voiceRecognition?.provider?.type === 'runtype') {
        if (session.isVoiceActive()) session.toggleVoice();
        removeRuntypeMicStateStyles();
      } else {
        stopVoiceRecognition("system");
      }
      if (micButton) {
        micButton.removeEventListener("click", handleMicButtonClick);
      }
    });
  }

  const autoResumeUnsub = eventBus.on("assistant:complete", () => {
    if (!voiceAutoResumeMode) return;
    if (voiceState.active || voiceState.manuallyDeactivated) return;
    if (voiceAutoResumeMode === "assistant" && !voiceState.lastUserMessageWasVoice) {
      return;
    }
    setTimeout(() => {
      if (!voiceState.active && !voiceState.manuallyDeactivated) {
        if (config.voiceRecognition?.provider?.type === 'runtype') {
          session.toggleVoice().then(() => {
            voiceState.active = session.isVoiceActive();
            emitVoiceState("auto");
            if (session.isVoiceActive()) applyRuntypeMicRecordingStyles();
          });
        } else {
          startVoiceRecognition("auto");
        }
      }
    }, 600);
  });
  destroyCallbacks.push(autoResumeUnsub);

  // Handle action:resubmit event - automatically trigger another model call
  // when an action handler needs the model to continue processing (e.g., analyzing search results)
  const resubmitUnsub = eventBus.on("action:resubmit", () => {
    // Short delay to allow UI to update with any injected messages
    // Handlers should call context.triggerResubmit() AFTER their async work completes
    setTimeout(() => {
      if (session && !session.isStreaming()) {
        // Continue conversation without adding a visible user message
        session.continueConversation();
      }
    }, 100);
  });
  destroyCallbacks.push(resubmitUnsub);

  const toggleOpen = () => {
    setOpenState(!open, "user");
  };

  // Plugin hook: renderLauncher - allow plugins to provide custom launcher
  let launcherButtonInstance: LauncherButton | null = null;
  let customLauncherElement: HTMLElement | null = null;
  
  // Composer-bar mode is launcher-less by design: the persistent pill IS the
  // entry point, so skip creating any launcher button (default or plugin).
  if (launcherEnabled && !isComposerBar()) {
    const { instance, element } = resolveLauncher({ config, plugins, onToggle: toggleOpen });
    launcherButtonInstance = instance;
    // A plugin-provided launcher returns no controller instance; track its
    // element separately so the update path can manage it.
    if (!instance) customLauncherElement = element;
  }

  if (launcherButtonInstance) {
    mount.appendChild(launcherButtonInstance.element);
  } else if (customLauncherElement) {
    mount.appendChild(customLauncherElement);
  }
  updateOpenState();
  renderSuggestions();
  updateCopy();
  setComposerDisabled(session.isStreaming());
  // Reopen-where-left-off takes precedence when opted in (Principle 11);
  // otherwise fall back to the historical per-mode positioning.
  if (!restoreScrollPosition()) {
    if (getScrollMode() === "follow") {
      scheduleAutoScroll(true);
    } else {
      jumpToBottomInstant();
    }
  }
  maybeRestoreVoiceFromMetadata();

  if (autoFocusInput) {
    // Composer-bar's pill exposes the textarea immediately, so focus it on
    // init like the inline embed does: even though the panel is collapsed.
    if (!launcherEnabled || isComposerBar()) {
      setTimeout(() => maybeFocusInput(), 0);
    } else if (open) {
      setTimeout(() => maybeFocusInput(), 200);
    }
  }

  const recalcPanelHeight = () => {
    // Composer-bar mode lets CSS own all sizing: collapsed pill is auto-sized
    // by the footer; expanded fullscreen/modal are driven by CSS attribute
    // selectors plus inline maxWidth/maxHeight set in updateOpenState. JS
    // sizing here would fight the morph transitions.
    if (isComposerBar()) {
      updateScrollToBottomButtonOffset();
      updateOpenState();
      return;
    }

    const dockedMode = isDockedMountMode(config);
    const sidebarMode = config.launcher?.sidebarMode ?? false;
    const fullHeight = dockedMode || sidebarMode || (config.launcher?.fullHeight ?? false);

    // Mobile fullscreen: re-apply fullscreen styles on resize (handles orientation changes)
    const ownerWindow = mount.ownerDocument.defaultView ?? window;
    const mobileFullscreen = config.launcher?.mobileFullscreen ?? true;
    const mobileBreakpoint = config.launcher?.mobileBreakpoint ?? 640;
    const isMobileViewport = ownerWindow.innerWidth <= mobileBreakpoint;
    const shouldGoFullscreen = mobileFullscreen && isMobileViewport && launcherEnabled;

    try {
      if (shouldGoFullscreen) {
        applyFullHeightStyles();
        applyThemeVariables(mount, config);
        return;
      }

      // Exiting mobile fullscreen (e.g., orientation change to landscape): reset all styles
      if (wasMobileFullscreen) {
        wasMobileFullscreen = false;
        applyFullHeightStyles();
        applyThemeVariables(mount, config);
      }

      if (!launcherEnabled && !dockedMode) {
        panel.style.height = "";
        panel.style.width = "";
        return;
      }

      // In sidebar/fullHeight mode, don't override the width - it's handled by applyFullHeightStyles
      if (!sidebarMode && !dockedMode) {
        const launcherWidth = config?.launcher?.width ?? config?.launcherWidth;
        const width = launcherWidth ?? DEFAULT_FLOATING_LAUNCHER_WIDTH;
        panel.style.width = width;
        panel.style.maxWidth = width;
      }
      applyLauncherArtifactPanelWidth();

      // In fullHeight mode, don't set a fixed height
      if (!fullHeight) {
        const viewportHeight = ownerWindow.innerHeight;
        const verticalMargin = 64; // leave space for launcher's offset
        const heightOffset = config.launcher?.heightOffset ?? 0;
        const available = Math.max(200, viewportHeight - verticalMargin);
        const clamped = Math.min(640, available);
        const finalHeight = Math.max(200, clamped - heightOffset);
        panel.style.height = `${finalHeight}px`;
      }
    } finally {
      // applyFullHeightStyles() assigns wrapper.style.cssText (e.g. display:flex !important), which
      // overwrites updateOpenState()'s display:none when docked+closed. Re-sync after every recalc.
      updateScrollToBottomButtonOffset();
      updateOpenState();

      // Sync scroll lock and host stacking when viewport mode changes (e.g. orientation change)
      if (open && launcherEnabled) {
        const ow = mount.ownerDocument.defaultView ?? window;
        const isMobile = ow.innerWidth <= (config.launcher?.mobileBreakpoint ?? 640);
        const sm = config.launcher?.sidebarMode ?? false;
        const mf = config.launcher?.mobileFullscreen ?? true;
        const dockedMF = isDockedMountMode(config) && mf && isMobile;
        const isVC = sm || (mf && isMobile && launcherEnabled) || dockedMF;

        if (isVC && !releaseScrollLock) {
          const root = mount.getRootNode();
          const hostEl = root instanceof ShadowRoot
            ? (root.host as HTMLElement)
            : mount.closest<HTMLElement>(".persona-host");
          if (hostEl && !teardownHostStacking) {
            teardownHostStacking = syncOverlayHostStacking(
              hostEl,
              config.launcher?.zIndex ?? DEFAULT_OVERLAY_Z_INDEX
            );
          }
          releaseScrollLock = acquireScrollLock(mount.ownerDocument);
        } else if (!isVC) {
          teardownHostStacking?.();
          teardownHostStacking = null;
          releaseScrollLock?.();
          releaseScrollLock = null;
        }
      }
    }
  };

  recalcPanelHeight();
  const ownerWindow = mount.ownerDocument.defaultView ?? window;
  ownerWindow.addEventListener("resize", recalcPanelHeight);
  destroyCallbacks.push(() => ownerWindow.removeEventListener("resize", recalcPanelHeight));
  if (typeof ResizeObserver !== "undefined") {
    const footerResizeObserver = new ResizeObserver(() => {
      updateScrollToBottomButtonOffset();
    });
    footerResizeObserver.observe(footer);
    destroyCallbacks.push(() => footerResizeObserver.disconnect());
  }

  lastScrollTop = body.scrollTop;
  let lastBottomOffset = getScrollBottomOffset(body);

  const getTranscriptSelection = (): Selection | null => {
    // Selections inside a shadow root are not always reflected by
    // document.getSelection(); prefer the shadow root's view when available
    // (non-standard but supported where it matters).
    const root = body.getRootNode();
    const shadowSelection =
      typeof (root as ShadowRoot & { getSelection?: () => Selection | null })
        .getSelection === "function"
        ? (root as ShadowRoot & { getSelection: () => Selection | null }).getSelection()
        : null;
    return shadowSelection ?? body.ownerDocument.getSelection();
  };
  const hasActiveTranscriptSelection = () =>
    hasSelectionWithin(getTranscriptSelection(), body);

  const handleScroll = () => {
    const scrollTop = body.scrollTop;
    // When content mutates (e.g. stream-animation plugins re-rendering text)
    // or the viewport grows (composer shrinking back), the maximum scroll
    // position can shrink and force the browser to clamp scrollTop downward.
    // That emits a scroll event with a negative delta that would otherwise be
    // misread as the user scrolling up, pausing auto-follow and flashing the
    // scroll-to-bottom button. Treat those as non-user events. Tracking the
    // bottom offset (scrollHeight - clientHeight) rather than scrollHeight
    // alone also covers clientHeight-driven clamps.
    const currentBottomOffset = getScrollBottomOffset(body);
    const bottomOffsetShrank = currentBottomOffset < lastBottomOffset;
    lastBottomOffset = currentBottomOffset;

    if (!isFollowEffective()) {
      // No follow state to manage (anchored anchor-top / none): just keep the
      // scroll-to-bottom affordance in sync with the user's position.
      lastScrollTop = scrollTop;
      syncScrollToBottomButton();
      return;
    }

    const { action, nextLastScrollTop } = resolveFollowStateFromScroll({
      following: autoFollow.isFollowing(),
      currentScrollTop: scrollTop,
      lastScrollTop,
      nearBottom: isElementNearBottom(body, BOTTOM_THRESHOLD),
      userScrollThreshold: USER_SCROLL_THRESHOLD,
      isAutoScrolling: isAutoScrolling || hasPendingAutoScroll || bottomOffsetShrank,
      pauseOnUpwardScroll: true,
      pauseWhenAwayFromBottom: false,
      resumeRequiresDownwardScroll: true
    });
    lastScrollTop = nextLastScrollTop;

    if (action === "resume") {
      // Drag-selecting downward near the bottom edge auto-scrolls down and
      // would otherwise read as a resume gesture; keep follow paused while a
      // transcript selection is active so it isn't yanked mid-drag.
      if (!hasActiveTranscriptSelection()) {
        resumeAutoScroll();
      }
      return;
    }

    if (action === "pause") {
      pauseAutoScroll();
    }
  };

  body.addEventListener("scroll", handleScroll, { passive: true });
  destroyCallbacks.push(() => body.removeEventListener("scroll", handleScroll));

  // Content-growth follow. Render events already schedule auto-scroll, but
  // content can also grow without one: images/embeds finishing loading
  // mid-stream, web fonts swapping, the panel or composer resizing. Observe
  // the messages wrapper (content growth) and the scroll container itself
  // (viewport resize) so the pin survives all of them.
  if (typeof ResizeObserver !== "undefined") {
    const contentResizeObserver = new ResizeObserver(() => {
      handleContentResize();
    });
    contentResizeObserver.observe(messagesWrapper);
    contentResizeObserver.observe(body);
    destroyCallbacks.push(() => contentResizeObserver.disconnect());
  }

  // Pause auto-follow while the user selects transcript text so the
  // streaming scroll doesn't move content out from under the selection.
  // Driven purely by selectionchange (no pointer gating) so keyboard
  // selection (Shift+arrows, select-all) pauses too; a stale selection
  // left in the transcript fires no further events, so it can't re-pause
  // after the user resumes following.
  const handleSelectionChange = () => {
    if (!isFollowEffective()) return;
    if (!autoFollow.isFollowing()) return;
    if (hasActiveTranscriptSelection()) {
      pauseAutoScroll();
    }
  };
  const selectionDocument = body.ownerDocument;
  selectionDocument.addEventListener("selectionchange", handleSelectionChange);
  destroyCallbacks.push(() => {
    selectionDocument.removeEventListener("selectionchange", handleSelectionChange);
  });

  // Principle 3: every interaction is intent. Beyond wheel/scroll/selection,
  // opting into `pauseOnInteraction` also treats keyboard navigation within the
  // transcript and focusing an interactive element (a link, button, etc.) as
  // "the reader is doing something here" — pause auto-follow so the stream
  // doesn't move content out from under them. Opt-in; off by default.
  const NAV_KEYS = new Set([
    "PageUp",
    "PageDown",
    "Home",
    "End",
    "ArrowUp",
    "ArrowDown",
  ]);
  const handleTranscriptKeydown = (event: KeyboardEvent) => {
    if (!isPauseOnInteractionEnabled()) return;
    if (!isFollowEffective()) return;
    if (!autoFollow.isFollowing()) return;
    if (NAV_KEYS.has(event.key)) {
      pauseAutoScroll();
    }
  };
  const handleTranscriptFocusIn = (event: FocusEvent) => {
    if (!isPauseOnInteractionEnabled()) return;
    if (!isFollowEffective()) return;
    if (!autoFollow.isFollowing()) return;
    const target = event.target as Element | null;
    if (target && target.closest("a, button, [tabindex], input, textarea, select")) {
      pauseAutoScroll();
    }
  };
  body.addEventListener("keydown", handleTranscriptKeydown);
  body.addEventListener("focusin", handleTranscriptFocusIn);
  destroyCallbacks.push(() => {
    body.removeEventListener("keydown", handleTranscriptKeydown);
    body.removeEventListener("focusin", handleTranscriptFocusIn);
  });

  const handleWheel = (event: WheelEvent) => {
    if (!isFollowEffective()) return;
    const action = resolveFollowStateFromWheel({
      following: autoFollow.isFollowing(),
      deltaY: event.deltaY,
      nearBottom: isElementNearBottom(body, BOTTOM_THRESHOLD),
      resumeWhenNearBottom: true
    });

    if (action === "pause") {
      pauseAutoScroll();
    } else if (action === "resume" && !hasActiveTranscriptSelection()) {
      resumeAutoScroll();
    }
  };
  body.addEventListener("wheel", handleWheel, { passive: true });
  destroyCallbacks.push(() => body.removeEventListener("wheel", handleWheel));
  scrollToBottomButton.addEventListener("click", () => {
    // Jumping to the latest abandons the current anchor: drop the spacer
    // first so "bottom" means the real end of content, not spacer padding
    // that would keep shrinking underneath the reader.
    resetAnchorState();
    body.scrollTop = body.scrollHeight;
    lastScrollTop = body.scrollTop;
    resumeAutoScroll();
    scheduleAutoScroll(true);
    syncScrollToBottomButton();
  });
  destroyCallbacks.push(() => scrollToBottomButton.remove());
  destroyCallbacks.push(() => {
    cancelAutoScroll();
    resetAnchorState();
  });

  const refreshCloseButton = () => {
    if (!closeButton) return;
    if (closeHandler) {
      closeButton.removeEventListener("click", closeHandler);
      closeHandler = null;
    }
    if (isPanelToggleable()) {
      closeButton.style.display = "";
      closeHandler = () => {
        setOpenState(false, "user");
      };
      closeButton.addEventListener("click", closeHandler);
    } else {
      closeButton.style.display = "none";
    }
  };

  refreshCloseButton();

  // Setup clear chat button click handler
  const setupClearChatButton = () => {
    const { clearChatButton } = panelElements;
    if (!clearChatButton) return;

    clearChatButton.addEventListener("click", () => {
      // Clear messages in session (this will trigger onMessagesChanged which re-renders)
      session.clearMessages();
      messageCache.clear();
      resumeAutoScroll();

      // Drop any open ask_user_question sheets: their source messages are gone.
      removeAskUserQuestionSheet(panelElements.composerOverlay);

      // Always clear the default localStorage key
      try {
        localStorage.removeItem(DEFAULT_CHAT_HISTORY_STORAGE_KEY);
        if (config.debug) {
          console.log(`[AgentWidget] Cleared default localStorage key: ${DEFAULT_CHAT_HISTORY_STORAGE_KEY}`);
        }
      } catch (error) {
        console.error("[AgentWidget] Failed to clear default localStorage:", error);
      }

      // Also clear custom localStorage key if configured
      if (config.clearChatHistoryStorageKey && config.clearChatHistoryStorageKey !== DEFAULT_CHAT_HISTORY_STORAGE_KEY) {
        try {
          localStorage.removeItem(config.clearChatHistoryStorageKey);
          if (config.debug) {
            console.log(`[AgentWidget] Cleared custom localStorage key: ${config.clearChatHistoryStorageKey}`);
          }
        } catch (error) {
          console.error("[AgentWidget] Failed to clear custom localStorage:", error);
        }
      }

      // Dispatch custom event for external handlers (e.g., localStorage clearing in examples)
      const clearEvent = new CustomEvent("persona:clear-chat", {
        detail: { timestamp: new Date().toISOString() }
      });
      window.dispatchEvent(clearEvent);

      if (storageAdapter?.clear) {
        runStorageMutation(
          () => storageAdapter.clear!(),
          "[AgentWidget] Failed to clear storage adapter:"
        );
      }
      persistentMetadata = {};
      actionManager.syncFromMetadata();

      // Clear event stream buffer and store, and reset throughput tracking
      eventStreamBuffer?.clear();
      throughputTracker?.reset();
      eventStreamView?.update();
    });
  };

  setupClearChatButton();

  if (composerForm) {
    composerForm.addEventListener("submit", handleSubmit);
  }
  textarea?.addEventListener("keydown", handleComposerKeydown);
  textarea?.addEventListener("input", handleComposerInput);
  textarea?.addEventListener("paste", handleInputPaste);

  const escStopDoc = mount.ownerDocument ?? document;
  escStopDoc.addEventListener("keydown", handleEscStop, true);

  const ATTACHMENT_DROP_ACTIVE_CLASS = "persona-attachment-drop-active";
  let attachmentFileDragDepth = 0;

  const clearAttachmentDropVisual = () => {
    attachmentFileDragDepth = 0;
    container.classList.remove(ATTACHMENT_DROP_ACTIVE_CLASS);
  };

  const attachmentDropHandlingActive = (): boolean =>
    config.attachments?.enabled === true && attachmentManager !== null;

  // Visual highlight tracked on `container` (the chat column).
  const handleAttachmentDragEnterCapture = (e: DragEvent) => {
    if (!dataTransferHasFiles(e.dataTransfer) || !attachmentDropHandlingActive()) return;
    attachmentFileDragDepth++;
    if (attachmentFileDragDepth === 1) {
      container.classList.add(ATTACHMENT_DROP_ACTIVE_CLASS);
    }
  };

  const handleAttachmentDragLeaveCapture = (e: DragEvent) => {
    if (!dataTransferHasFiles(e.dataTransfer) || !attachmentDropHandlingActive()) return;
    attachmentFileDragDepth--;
    if (attachmentFileDragDepth <= 0) {
      clearAttachmentDropVisual();
    }
  };

  // dragover + drop registered on `mount` so the browser default (open file)
  // is suppressed across the entire widget surface (artifact pane, gaps, etc.).
  const handleAttachmentDragOverCapture = (e: DragEvent) => {
    if (!dataTransferHasFiles(e.dataTransfer) || !attachmentDropHandlingActive()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleAttachmentDropCapture = (e: DragEvent) => {
    if (!dataTransferHasFiles(e.dataTransfer) || !attachmentDropHandlingActive()) return;
    e.preventDefault();
    e.stopPropagation();
    clearAttachmentDropVisual();
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length === 0) return;
    void attachmentManager!.handleFiles(files);
  };

  const attachmentDropCapture = true;
  container.addEventListener("dragenter", handleAttachmentDragEnterCapture, attachmentDropCapture);
  container.addEventListener("dragleave", handleAttachmentDragLeaveCapture, attachmentDropCapture);
  mount.addEventListener("dragover", handleAttachmentDragOverCapture, attachmentDropCapture);
  mount.addEventListener("drop", handleAttachmentDropCapture, attachmentDropCapture);

  // Prevent the browser from navigating to/opening a dropped file anywhere on
  // the page while this widget instance has attachments enabled.  These guards
  // intentionally skip the `dataTransferHasFiles` check because real OS drags
  // may expose `dataTransfer.types` as a DOMStringList or restrict access
  // during certain drag phases.  The cost is minimal: we suppress the native
  // "open file" default for ALL drag-overs while the widget is alive and
  // attachments are on: text drags into the textarea still work because
  // element-level handlers are unaffected (we don't stopPropagation here).
  const ownerDoc = mount.ownerDocument;
  const handleDocDragOver = (e: DragEvent) => {
    if (!attachmentDropHandlingActive()) return;
    e.preventDefault();
  };
  const handleDocDrop = (e: DragEvent) => {
    if (!attachmentDropHandlingActive()) return;
    e.preventDefault();
  };
  ownerDoc.addEventListener("dragover", handleDocDragOver);
  ownerDoc.addEventListener("drop", handleDocDrop);

  destroyCallbacks.push(() => {
    if (composerForm) {
      composerForm.removeEventListener("submit", handleSubmit);
    }
    textarea?.removeEventListener("keydown", handleComposerKeydown);
    textarea?.removeEventListener("input", handleComposerInput);
    textarea?.removeEventListener("paste", handleInputPaste);
    escStopDoc.removeEventListener("keydown", handleEscStop, true);
  });

  destroyCallbacks.push(() => {
    container.removeEventListener("dragenter", handleAttachmentDragEnterCapture, attachmentDropCapture);
    container.removeEventListener("dragleave", handleAttachmentDragLeaveCapture, attachmentDropCapture);
    mount.removeEventListener("dragover", handleAttachmentDragOverCapture, attachmentDropCapture);
    mount.removeEventListener("drop", handleAttachmentDropCapture, attachmentDropCapture);
    ownerDoc.removeEventListener("dragover", handleDocDragOver);
    ownerDoc.removeEventListener("drop", handleDocDrop);
    clearAttachmentDropVisual();
  });

  destroyCallbacks.push(() => {
    session.cancel();
  });

  if (launcherButtonInstance) {
    destroyCallbacks.push(() => {
      launcherButtonInstance?.destroy();
    });
  } else if (customLauncherElement) {
    destroyCallbacks.push(() => {
      customLauncherElement?.remove();
    });
  }

  const controller: Controller = {
    update(nextConfig: AgentWidgetConfig) {
      const previousToolCallConfig = config.toolCall;
      const previousMessageActions = config.messageActions;
      const previousLayoutMessages = config.layout?.messages;
      const previousColorScheme = config.colorScheme;
      const previousLoadingIndicator = config.loadingIndicator;
      const previousIterationDisplay = config.iterationDisplay;
      const previousShowReasoning = config.features?.showReasoning;
      const previousShowToolCalls = config.features?.showToolCalls;
      const previousToolCallDisplay = config.features?.toolCallDisplay;
      const previousReasoningDisplay = config.features?.reasoningDisplay;
      const previousStreamAnimationType = config.features?.streamAnimation?.type;
      config = { ...config, ...nextConfig };
      // applyFullHeightStyles resets mount.style.cssText, so call it before applyThemeVariables
      applyFullHeightStyles();
      applyThemeVariables(mount, config);
      applyArtifactLayoutCssVars(mount, config);
      applyArtifactPaneAppearance(mount, config);
      syncArtifactPane();

      // Re-setup theme observer if colorScheme changed
      if (config.colorScheme !== previousColorScheme) {
        setupThemeObserver();
      }

      // Update plugins
      const newPlugins = pluginRegistry.getForInstance(config.plugins);
      plugins.length = 0;
      plugins.push(...newPlugins);

      launcherEnabled = config.launcher?.enabled ?? true;
      autoExpand = config.launcher?.autoExpand ?? false;
      showReasoning = config.features?.showReasoning ?? true;
      showToolCalls = config.features?.showToolCalls ?? true;
      scrollToBottomFeature = config.features?.scrollToBottom ?? {};
      const prevScrollMode = getScrollMode();
      scrollBehaviorFeature = config.features?.scrollBehavior ?? {};
      if (prevScrollMode !== getScrollMode()) {
        // Leaving anchor-top drops any live spacer; entering a new mode
        // starts from a clean follow state.
        resetAnchorState();
        resumeAutoScroll();
      }
      renderScrollToBottomButton();
      syncScrollToBottomButton();
      const prevShowEventStreamToggle = showEventStreamToggle;
      showEventStreamToggle = config.features?.showEventStreamToggle ?? false;

      // Handle dynamic event stream feature flag toggling
      if (showEventStreamToggle && !prevShowEventStreamToggle) {
        // Flag changed from false to true - create buffer/store if needed
        if (!eventStreamBuffer) {
          eventStreamStore = new EventStreamStore(eventStreamDbName);
          eventStreamBuffer = new EventStreamBuffer(eventStreamMaxEvents, eventStreamStore);
          throughputTracker = throughputTracker ?? new ThroughputTracker();
          eventStreamStore.open().then(() => eventStreamBuffer?.restore()).catch(() => {});
          // Register the SSE event callback (host tap + buffer + throughput)
          session.setSSEEventCallback((type: string, payload: unknown) => {
            config.onSSEEvent?.(type, payload);
            throughputTracker?.processEvent(type, payload);
            eventStreamBuffer!.push({
              id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              type,
              timestamp: Date.now(),
              payload: JSON.stringify(payload)
            });
          });
        }
        // Add header toggle button if not present
        if (!eventStreamToggleBtn && header) {
          const dynEsClassNames = config.features?.eventStream?.classNames;
          const dynToggleBtnClasses = "persona-inline-flex persona-items-center persona-justify-center persona-rounded-full hover:persona-opacity-80 persona-cursor-pointer persona-border-none persona-bg-transparent persona-p-1" + (dynEsClassNames?.toggleButton ? " " + dynEsClassNames.toggleButton : "");
          eventStreamToggleBtn = createElement("button", dynToggleBtnClasses) as HTMLButtonElement;
          eventStreamToggleBtn.style.width = "28px";
          eventStreamToggleBtn.style.height = "28px";
          eventStreamToggleBtn.style.color = HEADER_THEME_CSS.actionIconColor;
          eventStreamToggleBtn.type = "button";
          eventStreamToggleBtn.setAttribute("aria-label", "Event Stream");
          eventStreamToggleBtn.title = "Event Stream";
          const activityIcon = renderLucideIcon("activity", "18px", "currentColor", 1.5);
          if (activityIcon) eventStreamToggleBtn.appendChild(activityIcon);
          const clearChatWrapper = panelElements.clearChatButtonWrapper;
          const closeWrapper = panelElements.closeButtonWrapper;
          const insertBefore = clearChatWrapper || closeWrapper;
          if (insertBefore && insertBefore.parentNode === header) {
            header.insertBefore(eventStreamToggleBtn, insertBefore);
          } else {
            header.appendChild(eventStreamToggleBtn);
          }
          eventStreamToggleBtn.addEventListener("click", () => {
            if (eventStreamVisible) {
              toggleEventStreamOff();
            } else {
              toggleEventStreamOn();
            }
          });
        }
      } else if (!showEventStreamToggle && prevShowEventStreamToggle) {
        // Flag changed from true to false - hide and clean up
        toggleEventStreamOff();
        if (eventStreamToggleBtn) {
          eventStreamToggleBtn.remove();
          eventStreamToggleBtn = null;
        }
        eventStreamBuffer?.clear();
        eventStreamStore?.destroy();
        eventStreamBuffer = null;
        eventStreamStore = null;
        throughputTracker?.reset();
        throughputTracker = null;
      }

      if (config.launcher?.enabled === false && launcherButtonInstance) {
        launcherButtonInstance.destroy();
        launcherButtonInstance = null;
      }
      if (config.launcher?.enabled === false && customLauncherElement) {
        customLauncherElement.remove();
        customLauncherElement = null;
      }

      if (config.launcher?.enabled !== false && !launcherButtonInstance && !customLauncherElement) {
        // Resolve the launcher again when re-enabling (honors renderLauncher plugin).
        const { instance, element } = resolveLauncher({ config, plugins, onToggle: toggleOpen });
        launcherButtonInstance = instance;
        if (!instance) customLauncherElement = element;
        mount.appendChild(element);
      }

      if (launcherButtonInstance) {
        launcherButtonInstance.update(config);
      }
      // Note: Custom launcher updates are handled by the plugin's own logic

      // Update panel header title and subtitle
      if (headerTitle && config.launcher?.title !== undefined) {
        headerTitle.textContent = config.launcher.title;
      }
      if (headerSubtitle && config.launcher?.subtitle !== undefined) {
        headerSubtitle.textContent = config.launcher.subtitle;
      }

      // Update header layout if it changed
      const headerLayoutConfig = config.layout?.header;
      const headerLayoutChanged = headerLayoutConfig?.layout !== prevHeaderLayout;

      if (headerLayoutChanged && header) {
        // Rebuild header with new layout
        const newHeaderElements = headerLayoutConfig
          ? buildHeaderWithLayout(config, headerLayoutConfig, {
              showClose: isPanelToggleable(),
              onClose: () => setOpenState(false, "user")
            })
          : buildHeader({
              config,
              showClose: isPanelToggleable(),
              onClose: () => setOpenState(false, "user")
            });

        // Replace the old header with the new one (keeps view.header in sync).
        view.replaceHeader(newHeaderElements);

        // Mirror the view's refreshed header refs into the local bindings.
        header = view.header.element;
        iconHolder = view.header.iconHolder;
        headerTitle = view.header.headerTitle;
        headerSubtitle = view.header.headerSubtitle;
        closeButton = view.header.closeButton;

        prevHeaderLayout = headerLayoutConfig?.layout;
      } else if (headerLayoutConfig) {
        // Apply visibility settings without rebuilding
        if (iconHolder) {
          iconHolder.style.display = headerLayoutConfig.showIcon === false ? "none" : "";
        }
        if (headerTitle) {
          headerTitle.style.display = headerLayoutConfig.showTitle === false ? "none" : "";
        }
        if (headerSubtitle) {
          headerSubtitle.style.display = headerLayoutConfig.showSubtitle === false ? "none" : "";
        }
        if (closeButton) {
          closeButton.style.display = headerLayoutConfig.showCloseButton === false ? "none" : "";
        }
        if (panelElements.clearChatButtonWrapper) {
          // showClearChat explicitly controls visibility when set
          const showClearChat = headerLayoutConfig.showClearChat;
          if (showClearChat !== undefined) {
            panelElements.clearChatButtonWrapper.style.display = showClearChat ? "" : "none";
            // When clear chat is hidden, close button needs ml-auto to stay right-aligned
            const { closeButtonWrapper } = panelElements;
            if (closeButtonWrapper && !closeButtonWrapper.classList.contains("persona-absolute")) {
              if (showClearChat) {
                closeButtonWrapper.classList.remove("persona-ml-auto");
              } else {
                closeButtonWrapper.classList.add("persona-ml-auto");
              }
            }
          }
        }
      }

      // Update header visibility based on layout.showHeader
      const showHeader = config.layout?.showHeader !== false; // default to true
      if (header) {
        header.style.display = showHeader ? "" : "none";
      }

      // Update footer visibility based on layout.showFooter
      const showFooter = config.layout?.showFooter !== false; // default to true
      if (footer) {
        footer.style.display = showFooter ? "" : "none";
      }
      updateScrollToBottomButtonOffset();
      syncScrollToBottomButton();

      // Only update open state if launcher enabled state changed or autoExpand value changed
      const launcherEnabledChanged = launcherEnabled !== prevLauncherEnabled;
      const autoExpandChanged = autoExpand !== prevAutoExpand;

      if (launcherEnabledChanged) {
        // Launcher was enabled/disabled - update state accordingly
        if (!launcherEnabled) {
          // When launcher is disabled, always keep panel open
          open = true;
          updateOpenState();
        } else {
          // Launcher was just enabled - respect autoExpand setting
          setOpenState(autoExpand, "auto");
        }
      } else if (autoExpandChanged) {
        // autoExpand value changed - update state to match
        setOpenState(autoExpand, "auto");
      }
      // Otherwise, preserve current open state (user may have manually opened/closed)

      // Update previous values for next comparison
      prevAutoExpand = autoExpand;
      prevLauncherEnabled = launcherEnabled;
      recalcPanelHeight();
      refreshCloseButton();

      // Re-render messages if config affecting message rendering changed
      const toolCallConfigChanged = JSON.stringify(nextConfig.toolCall) !== JSON.stringify(previousToolCallConfig);
      const messageActionsChanged = JSON.stringify(config.messageActions) !== JSON.stringify(previousMessageActions);
      const layoutMessagesChanged = JSON.stringify(config.layout?.messages) !== JSON.stringify(previousLayoutMessages);
      const loadingIndicatorChanged = config.loadingIndicator?.render !== previousLoadingIndicator?.render
        || config.loadingIndicator?.renderIdle !== previousLoadingIndicator?.renderIdle
        || config.loadingIndicator?.showBubble !== previousLoadingIndicator?.showBubble;
      const iterationDisplayChanged = config.iterationDisplay !== previousIterationDisplay;
      const featuresChanged = (config.features?.showReasoning ?? true) !== (previousShowReasoning ?? true)
        || (config.features?.showToolCalls ?? true) !== (previousShowToolCalls ?? true)
        || JSON.stringify(config.features?.toolCallDisplay) !== JSON.stringify(previousToolCallDisplay)
        || JSON.stringify(config.features?.reasoningDisplay) !== JSON.stringify(previousReasoningDisplay);
      const messagesConfigChanged = toolCallConfigChanged || messageActionsChanged || layoutMessagesChanged
        || loadingIndicatorChanged || iterationDisplayChanged || featuresChanged;
      if (messagesConfigChanged && session) {
        configVersion++;
        renderMessagesWithPlugins(messagesWrapper, session.getMessages(), postprocess);
      }

      // Re-activate the stream-animation plugin when the type changes via
      // update(). Built-in animations (typewriter, word-fade, letter-rise,
      // pop-bubble) carry their CSS in widget.css, so swapping the type is
      // enough. Plugin animations (wipe, glyph-cycle, and custom plugins
      // registered via registerStreamAnimationPlugin) inject their styles and
      // run onAttach only through ensurePluginActive, which the initial mount
      // calls but update() otherwise skips. Without this, switching to a plugin
      // animation live sets the type but never injects the CSS, so it silently
      // does nothing. ensurePluginActive is idempotent (styles inject once per
      // root), so re-selecting a previously-activated plugin is a no-op.
      const nextStreamAnimationType = config.features?.streamAnimation?.type;
      if (
        nextStreamAnimationType !== previousStreamAnimationType &&
        nextStreamAnimationType &&
        nextStreamAnimationType !== "none"
      ) {
        const streamAnimationPlugin = resolveStreamAnimationPlugin(
          nextStreamAnimationType,
          config.features?.streamAnimation?.plugins
        );
        if (streamAnimationPlugin) ensurePluginActive(streamAnimationPlugin, mount);
      }

      // Update panel icon sizes
      const launcher = config.launcher ?? {};
      const headerIconHidden = launcher.headerIconHidden ?? false;
      const layoutShowIcon = config.layout?.header?.showIcon;
      // Hide icon if either headerIconHidden is true OR layout.header.showIcon is false
      const shouldHideIcon = headerIconHidden || layoutShowIcon === false;
      const headerIconName = launcher.headerIconName;
      const headerIconSize = launcher.headerIconSize ?? "48px";

      if (iconHolder) {
        const headerEl = container.querySelector(".persona-border-b-persona-divider");
        const headerCopy = headerEl?.querySelector(".persona-flex-col");

        // Handle hide/show
        if (shouldHideIcon) {
          // Hide iconHolder
          iconHolder.style.display = "none";
          // Ensure headerCopy is still in header
          if (headerEl && headerCopy && !headerEl.contains(headerCopy)) {
            headerEl.insertBefore(headerCopy, headerEl.firstChild);
          }
        } else {
          // Show iconHolder
          iconHolder.style.display = "";
          iconHolder.style.height = headerIconSize;
          iconHolder.style.width = headerIconSize;
          
          // Ensure iconHolder is before headerCopy in header
          if (headerEl && headerCopy) {
            if (!headerEl.contains(iconHolder)) {
              headerEl.insertBefore(iconHolder, headerCopy);
            } else if (iconHolder.nextSibling !== headerCopy) {
              // Reorder if needed
              iconHolder.remove();
              headerEl.insertBefore(iconHolder, headerCopy);
            }
          }
          
          // Update icon content based on priority: Lucide icon > iconUrl > agentIconText
          if (headerIconName) {
            // Use Lucide icon. Stroke `currentColor` (not a hardcoded white) so the
            // glyph inherits iconHolder's `color: var(--persona-header-icon-fg, …)`,
            // matching the initial render in header-builder.ts. Without this, any
            // controller.update() (e.g. a theme-editor change) re-rendered the icon
            // as white and the configured header icon color "wouldn't stick".
            const iconSize = parseFloat(headerIconSize) || 24;
            const iconSvg = renderLucideIcon(headerIconName, iconSize * 0.6, "currentColor", 1);
            if (iconSvg) {
              iconHolder.replaceChildren(iconSvg);
            } else {
              // Fallback to agentIconText if Lucide icon fails
              iconHolder.textContent = launcher.agentIconText ?? "💬";
            }
          } else if (launcher.iconUrl) {
            // Use image URL
            const img = iconHolder.querySelector("img");
            if (img) {
              img.src = launcher.iconUrl;
              img.style.height = headerIconSize;
              img.style.width = headerIconSize;
            } else {
              // Create new img if it doesn't exist
              const newImg = document.createElement("img");
              newImg.src = launcher.iconUrl;
              newImg.alt = "";
              newImg.className = "persona-rounded-xl persona-object-cover";
              newImg.style.height = headerIconSize;
              newImg.style.width = headerIconSize;
              iconHolder.replaceChildren(newImg);
            }
          } else {
            // Use text/emoji - clear any SVG or img first
            const existingSvg = iconHolder.querySelector("svg");
            const existingImg = iconHolder.querySelector("img");
            if (existingSvg || existingImg) {
              iconHolder.replaceChildren();
            }
            iconHolder.textContent = launcher.agentIconText ?? "💬";
          }
          
          // Update image size if present
          const img = iconHolder.querySelector("img");
          if (img) {
            img.style.height = headerIconSize;
            img.style.width = headerIconSize;
          }
        }
      }

      // Handle title/subtitle visibility from layout config
      const layoutShowTitle = config.layout?.header?.showTitle;
      const layoutShowSubtitle = config.layout?.header?.showSubtitle;
      if (headerTitle) {
        headerTitle.style.display = layoutShowTitle === false ? "none" : "";
      }
      if (headerSubtitle) {
        headerSubtitle.style.display = layoutShowSubtitle === false ? "none" : "";
      }

      if (closeButton) {
        // Handle close button visibility from layout config
        const layoutShowCloseButton = config.layout?.header?.showCloseButton;
        if (layoutShowCloseButton === false) {
          closeButton.style.display = "none";
        } else {
          closeButton.style.display = "";
        }

        const closeButtonSize = launcher.closeButtonSize ?? "32px";
        const closeButtonPlacement = launcher.closeButtonPlacement ?? "inline";
        closeButton.style.height = closeButtonSize;
        closeButton.style.width = closeButtonSize;
        
        // Update placement if changed - move the wrapper (not just the button) to preserve tooltip
        const { closeButtonWrapper } = panelElements;
        const isTopRight = closeButtonPlacement === "top-right";
        const currentlyTopRight = closeButtonWrapper?.classList.contains("persona-absolute");
        
        if (closeButtonWrapper && isTopRight !== currentlyTopRight) {
          // Placement changed - need to move wrapper and update classes
          closeButtonWrapper.remove();
          
          // Update wrapper classes
          if (isTopRight) {
            closeButtonWrapper.className = "persona-absolute persona-top-4 persona-right-4 persona-z-50";
            container.style.position = "relative";
            container.appendChild(closeButtonWrapper);
          } else {
            // Check if clear chat is inline to determine if we need ml-auto
            const clearChatPlacement = launcher.clearChat?.placement ?? "inline";
            const clearChatEnabled = launcher.clearChat?.enabled ?? true;
            closeButtonWrapper.className = (clearChatEnabled && clearChatPlacement === "inline") ? "" : "persona-ml-auto";
            // Find header element
            const header = container.querySelector(".persona-border-b-persona-divider");
            if (header) {
              header.appendChild(closeButtonWrapper);
            }
          }
        }
        
        // Close icon: launcher color wins; else theme.components.header.actionIconForeground
        closeButton.style.color =
          launcher.closeButtonColor || HEADER_THEME_CSS.actionIconColor;
        
        if (launcher.closeButtonBackgroundColor) {
          closeButton.style.backgroundColor = launcher.closeButtonBackgroundColor;
          closeButton.classList.remove("hover:persona-bg-gray-100");
        } else {
          closeButton.style.backgroundColor = "";
          closeButton.classList.add("hover:persona-bg-gray-100");
        }
        
        // Apply border if width and/or color are provided
        if (launcher.closeButtonBorderWidth || launcher.closeButtonBorderColor) {
          const borderWidth = launcher.closeButtonBorderWidth || "0px";
          const borderColor = launcher.closeButtonBorderColor || "transparent";
          closeButton.style.border = `${borderWidth} solid ${borderColor}`;
          closeButton.classList.remove("persona-border-none");
        } else {
          closeButton.style.border = "";
          closeButton.classList.add("persona-border-none");
        }
        
        if (launcher.closeButtonBorderRadius) {
          closeButton.style.borderRadius = launcher.closeButtonBorderRadius;
          closeButton.classList.remove("persona-rounded-full");
        } else {
          closeButton.style.borderRadius = "";
          closeButton.classList.add("persona-rounded-full");
        }

        // Update padding
        if (launcher.closeButtonPaddingX) {
          closeButton.style.paddingLeft = launcher.closeButtonPaddingX;
          closeButton.style.paddingRight = launcher.closeButtonPaddingX;
        } else {
          closeButton.style.paddingLeft = "";
          closeButton.style.paddingRight = "";
        }
        if (launcher.closeButtonPaddingY) {
          closeButton.style.paddingTop = launcher.closeButtonPaddingY;
          closeButton.style.paddingBottom = launcher.closeButtonPaddingY;
        } else {
          closeButton.style.paddingTop = "";
          closeButton.style.paddingBottom = "";
        }

        // Update icon
        const closeButtonIconName = launcher.closeButtonIconName ?? "x";
        const closeButtonIconText = launcher.closeButtonIconText ?? "×";

        // Clear existing content and render new icon.
        // Larger intrinsic size compensates for the X glyph's sparse
        // viewBox so the close button visually matches sibling icons.
        closeButton.innerHTML = "";
        const iconSvg = renderLucideIcon(closeButtonIconName, "28px", "currentColor", 1);
        if (iconSvg) {
          closeButton.appendChild(iconSvg);
        } else {
          closeButton.textContent = closeButtonIconText;
        }

        // Update tooltip
        const closeButtonTooltipText = launcher.closeButtonTooltipText ?? "Close chat";
        const closeButtonShowTooltip = launcher.closeButtonShowTooltip ?? true;

        closeButton.setAttribute("aria-label", closeButtonTooltipText);

        if (closeButtonWrapper) {
          // Clean up old tooltip event listeners if they exist
          if ((closeButtonWrapper as any)._cleanupTooltip) {
            (closeButtonWrapper as any)._cleanupTooltip();
            delete (closeButtonWrapper as any)._cleanupTooltip;
          }

          // Set up new portaled tooltip with event listeners
          if (closeButtonShowTooltip && closeButtonTooltipText) {
            let portaledTooltip: HTMLElement | null = null;

            const showTooltip = () => {
              if (portaledTooltip || !closeButton) return; // Already showing or button doesn't exist

              const tooltipDocument = closeButton.ownerDocument;
              const tooltipContainer = tooltipDocument.body;
              if (!tooltipContainer) return;

              // Create tooltip element
              portaledTooltip = createElementInDocument(
                tooltipDocument,
                "div",
                "persona-clear-chat-tooltip"
              );
              portaledTooltip.textContent = closeButtonTooltipText;

              // Add arrow
              const arrow = createElementInDocument(tooltipDocument, "div");
              arrow.className = "persona-clear-chat-tooltip-arrow";
              portaledTooltip.appendChild(arrow);

              // Get button position
              const buttonRect = closeButton.getBoundingClientRect();

              // Position tooltip above button
              portaledTooltip.style.position = "fixed";
              portaledTooltip.style.zIndex = String(PORTALED_OVERLAY_Z_INDEX);
              portaledTooltip.style.left = `${buttonRect.left + buttonRect.width / 2}px`;
              portaledTooltip.style.top = `${buttonRect.top - 8}px`;
              portaledTooltip.style.transform = "translate(-50%, -100%)";

              // Append to body
              tooltipContainer.appendChild(portaledTooltip);
            };

            const hideTooltip = () => {
              if (portaledTooltip && portaledTooltip.parentNode) {
                portaledTooltip.parentNode.removeChild(portaledTooltip);
                portaledTooltip = null;
              }
            };

            // Add event listeners
            closeButtonWrapper.addEventListener("mouseenter", showTooltip);
            closeButtonWrapper.addEventListener("mouseleave", hideTooltip);
            closeButton.addEventListener("focus", showTooltip);
            closeButton.addEventListener("blur", hideTooltip);

            // Store cleanup function on the wrapper for later use
            (closeButtonWrapper as any)._cleanupTooltip = () => {
              hideTooltip();
              if (closeButtonWrapper) {
                closeButtonWrapper.removeEventListener("mouseenter", showTooltip);
                closeButtonWrapper.removeEventListener("mouseleave", hideTooltip);
              }
              if (closeButton) {
                closeButton.removeEventListener("focus", showTooltip);
                closeButton.removeEventListener("blur", hideTooltip);
              }
            };
          }
        }
      }

      // Update clear chat button styling from config
      const { clearChatButton, clearChatButtonWrapper } = panelElements;
      if (clearChatButton) {
        const clearChatConfig = launcher.clearChat ?? {};
        const clearChatEnabled = clearChatConfig.enabled ?? true;
        const layoutShowClearChat = config.layout?.header?.showClearChat;
        // layout.header.showClearChat takes precedence if explicitly set
        // Otherwise fall back to launcher.clearChat.enabled
        const shouldShowClearChat = layoutShowClearChat !== undefined
          ? layoutShowClearChat
          : clearChatEnabled;
        const clearChatPlacement = clearChatConfig.placement ?? "inline";

        // Show/hide button based on layout config (primary) or launcher config (fallback)
        if (clearChatButtonWrapper) {
          clearChatButtonWrapper.style.display = shouldShowClearChat ? "" : "none";

          // When clear chat is hidden, close button needs ml-auto to stay right-aligned.
          // Composer-bar mode positions the close button absolutely, so the
          // ml-auto layout shim doesn't apply and is skipped below.
          const { closeButtonWrapper } = panelElements;
          if (
            !isComposerBar() &&
            closeButtonWrapper &&
            !closeButtonWrapper.classList.contains("persona-absolute")
          ) {
            if (shouldShowClearChat) {
              closeButtonWrapper.classList.remove("persona-ml-auto");
            } else {
              closeButtonWrapper.classList.add("persona-ml-auto");
            }
          }

          // Update placement if changed. Composer-bar mode owns the clear
          // button's position via panel.ts (absolute, top-right next to ×)
          // and must not get reshuffled into the floating launcher's
          // header strip.
          const isTopRight = clearChatPlacement === "top-right";
          const currentlyTopRight = clearChatButtonWrapper.classList.contains("persona-absolute");

          if (!isComposerBar() && isTopRight !== currentlyTopRight && shouldShowClearChat) {
            clearChatButtonWrapper.remove();

            if (isTopRight) {
              // Don't use persona-clear-chat-button-wrapper class for top-right mode as its
              // display: inline-flex causes alignment issues with the close button
              clearChatButtonWrapper.className = "persona-absolute persona-top-4 persona-z-50";
              // Position to the left of the close button (which is at right: 1rem/16px)
              // Close button is ~32px wide, plus small gap = 48px from right
              clearChatButtonWrapper.style.right = "48px";
              container.style.position = "relative";
              container.appendChild(clearChatButtonWrapper);
            } else {
              clearChatButtonWrapper.className = "persona-relative persona-ml-auto persona-clear-chat-button-wrapper";
              // Clear the inline right style when switching back to inline mode
              clearChatButtonWrapper.style.right = "";
              // Find header and insert before close button
              const header = container.querySelector(".persona-border-b-persona-divider");
              const closeButtonWrapperEl = panelElements.closeButtonWrapper;
              if (header && closeButtonWrapperEl && closeButtonWrapperEl.parentElement === header) {
                header.insertBefore(clearChatButtonWrapper, closeButtonWrapperEl);
              } else if (header) {
                header.appendChild(clearChatButtonWrapper);
              }
            }

            // Also update close button's ml-auto class based on clear chat position
            const closeButtonWrapperEl = panelElements.closeButtonWrapper;
            if (closeButtonWrapperEl && !closeButtonWrapperEl.classList.contains("persona-absolute")) {
              if (isTopRight) {
                // Clear chat moved to top-right, close needs ml-auto
                closeButtonWrapperEl.classList.add("persona-ml-auto");
              } else {
                // Clear chat is inline, close doesn't need ml-auto
                closeButtonWrapperEl.classList.remove("persona-ml-auto");
              }
            }
          }
        }

        if (shouldShowClearChat) {
          // Update size: composer-bar mode owns its sizing (16px to match
          // the close icon), so leave size alone there. Floating-launcher
          // and other modes still honor `launcher.clearChat.size`.
          if (!isComposerBar()) {
            const clearChatSize = clearChatConfig.size ?? "32px";
            clearChatButton.style.height = clearChatSize;
            clearChatButton.style.width = clearChatSize;
          }

          // Update icon
          const clearChatIconName = clearChatConfig.iconName ?? "refresh-cw";
          const clearChatIconColor = clearChatConfig.iconColor ?? "";

          clearChatButton.style.color =
            clearChatIconColor || HEADER_THEME_CSS.actionIconColor;

          // Clear existing icon and render new one. Composer-bar shrinks
          // the icon to match its 16px button.
          clearChatButton.innerHTML = "";
          const clearChatIconSize = isComposerBar() ? "14px" : "20px";
          const iconSvg = renderLucideIcon(clearChatIconName, clearChatIconSize, "currentColor", 2);
          if (iconSvg) {
            clearChatButton.appendChild(iconSvg);
          }

          // Update background color
          if (clearChatConfig.backgroundColor) {
            clearChatButton.style.backgroundColor = clearChatConfig.backgroundColor;
            clearChatButton.classList.remove("hover:persona-bg-gray-100");
          } else {
            clearChatButton.style.backgroundColor = "";
            clearChatButton.classList.add("hover:persona-bg-gray-100");
          }

          // Update border
          if (clearChatConfig.borderWidth || clearChatConfig.borderColor) {
            const borderWidth = clearChatConfig.borderWidth || "0px";
            const borderColor = clearChatConfig.borderColor || "transparent";
            clearChatButton.style.border = `${borderWidth} solid ${borderColor}`;
            clearChatButton.classList.remove("persona-border-none");
          } else {
            clearChatButton.style.border = "";
            clearChatButton.classList.add("persona-border-none");
          }

          // Update border radius
          if (clearChatConfig.borderRadius) {
            clearChatButton.style.borderRadius = clearChatConfig.borderRadius;
            clearChatButton.classList.remove("persona-rounded-full");
          } else {
            clearChatButton.style.borderRadius = "";
            clearChatButton.classList.add("persona-rounded-full");
          }

          // Update padding
          if (clearChatConfig.paddingX) {
            clearChatButton.style.paddingLeft = clearChatConfig.paddingX;
            clearChatButton.style.paddingRight = clearChatConfig.paddingX;
          } else {
            clearChatButton.style.paddingLeft = "";
            clearChatButton.style.paddingRight = "";
          }
          if (clearChatConfig.paddingY) {
            clearChatButton.style.paddingTop = clearChatConfig.paddingY;
            clearChatButton.style.paddingBottom = clearChatConfig.paddingY;
          } else {
            clearChatButton.style.paddingTop = "";
            clearChatButton.style.paddingBottom = "";
          }

          const clearChatTooltipText = clearChatConfig.tooltipText ?? "Clear chat";
          const clearChatShowTooltip = clearChatConfig.showTooltip ?? true;

          clearChatButton.setAttribute("aria-label", clearChatTooltipText);

          if (clearChatButtonWrapper) {
            // Clean up old tooltip event listeners if they exist
            if ((clearChatButtonWrapper as any)._cleanupTooltip) {
              (clearChatButtonWrapper as any)._cleanupTooltip();
              delete (clearChatButtonWrapper as any)._cleanupTooltip;
            }

            // Set up new portaled tooltip with event listeners
            if (clearChatShowTooltip && clearChatTooltipText) {
              let portaledTooltip: HTMLElement | null = null;

              const showTooltip = () => {
                if (portaledTooltip || !clearChatButton) return; // Already showing or button doesn't exist

                const tooltipDocument = clearChatButton.ownerDocument;
                const tooltipContainer = tooltipDocument.body;
                if (!tooltipContainer) return;

                // Create tooltip element
                portaledTooltip = createElementInDocument(
                  tooltipDocument,
                  "div",
                  "persona-clear-chat-tooltip"
                );
                portaledTooltip.textContent = clearChatTooltipText;

                // Add arrow
                const arrow = createElementInDocument(tooltipDocument, "div");
                arrow.className = "persona-clear-chat-tooltip-arrow";
                portaledTooltip.appendChild(arrow);

                // Get button position
                const buttonRect = clearChatButton.getBoundingClientRect();

                // Position tooltip above button
                portaledTooltip.style.position = "fixed";
                portaledTooltip.style.zIndex = String(PORTALED_OVERLAY_Z_INDEX);
                portaledTooltip.style.left = `${buttonRect.left + buttonRect.width / 2}px`;
                portaledTooltip.style.top = `${buttonRect.top - 8}px`;
                portaledTooltip.style.transform = "translate(-50%, -100%)";

                // Append to body
                tooltipContainer.appendChild(portaledTooltip);
              };

              const hideTooltip = () => {
                if (portaledTooltip && portaledTooltip.parentNode) {
                  portaledTooltip.parentNode.removeChild(portaledTooltip);
                  portaledTooltip = null;
                }
              };

              // Add event listeners
              clearChatButtonWrapper.addEventListener("mouseenter", showTooltip);
              clearChatButtonWrapper.addEventListener("mouseleave", hideTooltip);
              clearChatButton.addEventListener("focus", showTooltip);
              clearChatButton.addEventListener("blur", hideTooltip);

              // Store cleanup function on the button for later use
              (clearChatButtonWrapper as any)._cleanupTooltip = () => {
                hideTooltip();
                if (clearChatButtonWrapper) {
                  clearChatButtonWrapper.removeEventListener("mouseenter", showTooltip);
                  clearChatButtonWrapper.removeEventListener("mouseleave", hideTooltip);
                }
                if (clearChatButton) {
                  clearChatButton.removeEventListener("focus", showTooltip);
                  clearChatButton.removeEventListener("blur", hideTooltip);
                }
              };
            }
          }
        }
      }

      const nextParsers =
        config.actionParsers && config.actionParsers.length
          ? config.actionParsers
          : [defaultJsonActionParser];
      const nextHandlers =
        config.actionHandlers && config.actionHandlers.length
          ? config.actionHandlers
          : [defaultActionHandlers.message, defaultActionHandlers.messageAndClick];

      actionManager = createActionManager({
        parsers: nextParsers,
        handlers: nextHandlers,
        getSessionMetadata,
        updateSessionMetadata,
        emit: eventBus.emit,
        documentRef: typeof document !== "undefined" ? document : null
      });

      postprocess = buildPostprocessor(config, actionManager, handleResubmitRequested);
      session.updateConfig(config);
      renderMessagesWithPlugins(
        messagesWrapper,
        session.getMessages(),
        postprocess
      );
      renderSuggestions();
      updateCopy();
      setComposerDisabled(session.isStreaming());
      
      // Update voice recognition mic button visibility
      const voiceRecognitionEnabled = config.voiceRecognition?.enabled === true;
      const hasSpeechRecognition =
        typeof window !== 'undefined' &&
        (typeof (window as any).webkitSpeechRecognition !== 'undefined' ||
         typeof (window as any).SpeechRecognition !== 'undefined');
      const hasRuntypeProvider =
        config.voiceRecognition?.provider?.type === 'runtype';
      const hasVoiceInput = hasSpeechRecognition || hasRuntypeProvider;

      if (voiceRecognitionEnabled && hasVoiceInput) {
        // Create or update mic button
        if (!micButton || !micButtonWrapper) {
          // Create new mic button
          const micButtonResult = createMicButton(config.voiceRecognition, config.sendButton);
          if (micButtonResult) {
            // Update the mutable references
            micButton = micButtonResult.micButton;
            micButtonWrapper = micButtonResult.micButtonWrapper;
            
            // Insert into right actions before send button wrapper
            rightActions.insertBefore(micButtonWrapper, sendButtonWrapper);
            
            // Wire up click handler
            micButton.addEventListener("click", handleMicButtonClick);
            
            // Set disabled state
            micButton.disabled = session.isStreaming();
          }
        } else {
          // Update existing mic button with new config
          const voiceConfig = config.voiceRecognition ?? {};
          const sendButtonConfig = config.sendButton ?? {};
          
          // Update icon name and size
          const micIconName = voiceConfig.iconName ?? "mic";
          const buttonSize = sendButtonConfig.size ?? "40px";
          const micIconSize = voiceConfig.iconSize ?? buttonSize;
          const micIconSizeNum = parseFloat(micIconSize) || 24;
          
          micButton.style.width = micIconSize;
          micButton.style.height = micIconSize;
          micButton.style.minWidth = micIconSize;
          micButton.style.minHeight = micIconSize;
          
          // Update icon
          const iconColor = voiceConfig.iconColor ?? sendButtonConfig.textColor ?? "currentColor";
          micButton.innerHTML = "";
          const micIconSvg = renderLucideIcon(micIconName, micIconSizeNum, iconColor, 2);
          if (micIconSvg) {
            micButton.appendChild(micIconSvg);
          } else {
            micButton.textContent = "🎤";
          }
          
          // Update colors from config or theme tokens
          const backgroundColor = voiceConfig.backgroundColor ?? sendButtonConfig.backgroundColor;
          if (backgroundColor) {
            micButton.style.backgroundColor = backgroundColor;
          } else {
            micButton.style.backgroundColor = "";
          }

          if (iconColor) {
            micButton.style.color = iconColor;
          } else {
            micButton.style.color = "var(--persona-text, #111827)";
          }
          
          // Update border styling
          if (voiceConfig.borderWidth) {
            micButton.style.borderWidth = voiceConfig.borderWidth;
            micButton.style.borderStyle = "solid";
          } else {
            micButton.style.borderWidth = "";
            micButton.style.borderStyle = "";
          }
          if (voiceConfig.borderColor) {
            micButton.style.borderColor = voiceConfig.borderColor;
          } else {
            micButton.style.borderColor = "";
          }
          
          // Update padding styling
          if (voiceConfig.paddingX) {
            micButton.style.paddingLeft = voiceConfig.paddingX;
            micButton.style.paddingRight = voiceConfig.paddingX;
          } else {
            micButton.style.paddingLeft = "";
            micButton.style.paddingRight = "";
          }
          if (voiceConfig.paddingY) {
            micButton.style.paddingTop = voiceConfig.paddingY;
            micButton.style.paddingBottom = voiceConfig.paddingY;
          } else {
            micButton.style.paddingTop = "";
            micButton.style.paddingBottom = "";
          }
          
          // Update tooltip
          const tooltip = micButtonWrapper?.querySelector(".persona-send-button-tooltip") as HTMLElement | null;
          const tooltipText = voiceConfig.tooltipText ?? "Start voice recognition";
          const showTooltip = voiceConfig.showTooltip ?? false;
          if (showTooltip && tooltipText) {
            if (!tooltip) {
              // Create tooltip if it doesn't exist
              const newTooltip = document.createElement("div");
              newTooltip.className = "persona-send-button-tooltip";
              newTooltip.textContent = tooltipText;
              micButtonWrapper?.insertBefore(newTooltip, micButton);
            } else {
              tooltip.textContent = tooltipText;
              tooltip.style.display = "";
            }
          } else if (tooltip) {
            // Hide tooltip if disabled
            tooltip.style.display = "none";
          }
          
          // Show and update disabled state
          micButtonWrapper.style.display = "";
          micButton.disabled = session.isStreaming();
        }
      } else {
        // Hide mic button
        if (micButton && micButtonWrapper) {
          micButtonWrapper.style.display = "none";
          // Stop any active recording if disabling
          if (config.voiceRecognition?.provider?.type === 'runtype') {
            if (session.isVoiceActive()) session.toggleVoice();
          } else if (isRecording) {
            stopVoiceRecognition();
          }
        }
      }

      // Update attachment button visibility based on attachments config
      const attachmentsEnabled = config.attachments?.enabled === true;
      if (attachmentsEnabled) {
        // Create or show attachment button
        if (!attachmentButtonWrapper || !attachmentButton) {
          // Need to create the attachment elements dynamically
          const attachmentsConfig = config.attachments ?? {};
          const sendButtonConfig = config.sendButton ?? {};
          const buttonSize = sendButtonConfig.size ?? "40px";

          // Create previews container if not exists
          if (!attachmentPreviewsContainer) {
            attachmentPreviewsContainer = createElement("div", "persona-attachment-previews persona-flex persona-flex-wrap persona-gap-2 persona-mb-2");
            attachmentPreviewsContainer.style.display = "none";
            composerForm.insertBefore(attachmentPreviewsContainer, textarea);
          }

          // Create file input if not exists
          if (!attachmentInput) {
            attachmentInput = document.createElement("input");
            attachmentInput.type = "file";
            attachmentInput.accept = (attachmentsConfig.allowedTypes ?? ALL_SUPPORTED_MIME_TYPES).join(",");
            attachmentInput.multiple = (attachmentsConfig.maxFiles ?? 4) > 1;
            attachmentInput.style.display = "none";
            attachmentInput.setAttribute("aria-label", "Attach files");
            composerForm.insertBefore(attachmentInput, textarea);
          }

          // Create attachment button wrapper
          attachmentButtonWrapper = createElement("div", "persona-send-button-wrapper");

          // Create attachment button
          attachmentButton = createElement(
            "button",
            "persona-rounded-button persona-flex persona-items-center persona-justify-center disabled:persona-opacity-50 persona-cursor-pointer persona-attachment-button"
          ) as HTMLButtonElement;
          attachmentButton.type = "button";
          attachmentButton.setAttribute("aria-label", attachmentsConfig.buttonTooltipText ?? "Attach file");

          // Default to paperclip icon
          const attachIconName = attachmentsConfig.buttonIconName ?? "paperclip";
          const attachIconSize = buttonSize;
          const buttonSizeNum = parseFloat(attachIconSize) || 40;
          // Icon should be ~60% of button size to match other icons visually
          const attachIconSizeNum = Math.round(buttonSizeNum * 0.6);

          attachmentButton.style.width = attachIconSize;
          attachmentButton.style.height = attachIconSize;
          attachmentButton.style.minWidth = attachIconSize;
          attachmentButton.style.minHeight = attachIconSize;
          attachmentButton.style.fontSize = "18px";
          attachmentButton.style.lineHeight = "1";
          attachmentButton.style.backgroundColor = "transparent";
          attachmentButton.style.color = "var(--persona-primary, #111827)";
          attachmentButton.style.border = "none";
          attachmentButton.style.borderRadius = "6px";
          attachmentButton.style.transition = "background-color 0.15s ease";

          // Add hover effect via mouseenter/mouseleave
          attachmentButton.addEventListener("mouseenter", () => {
            attachmentButton!.style.backgroundColor = "var(--persona-palette-colors-black-alpha-50, rgba(0, 0, 0, 0.05))";
          });
          attachmentButton.addEventListener("mouseleave", () => {
            attachmentButton!.style.backgroundColor = "transparent";
          });

          const attachIconSvg = renderLucideIcon(attachIconName, attachIconSizeNum, "currentColor", 1.5);
          if (attachIconSvg) {
            attachmentButton.appendChild(attachIconSvg);
          } else {
            attachmentButton.textContent = "📎";
          }

          attachmentButton.addEventListener("click", (e) => {
            e.preventDefault();
            attachmentInput?.click();
          });

          attachmentButtonWrapper.appendChild(attachmentButton);

          // Add tooltip
          const attachTooltipText = attachmentsConfig.buttonTooltipText ?? "Attach file";
          const tooltip = createElement("div", "persona-send-button-tooltip");
          tooltip.textContent = attachTooltipText;
          attachmentButtonWrapper.appendChild(tooltip);

          // Insert into left actions container
          leftActions.append(attachmentButtonWrapper);

          // Initialize attachment manager
          if (!attachmentManager && attachmentInput && attachmentPreviewsContainer) {
            attachmentManager = AttachmentManager.fromConfig(attachmentsConfig);
            attachmentManager.setPreviewsContainer(attachmentPreviewsContainer);

            attachmentInput.addEventListener("change", async () => {
              if (attachmentManager && attachmentInput?.files) {
                await attachmentManager.handleFileSelect(attachmentInput.files);
                attachmentInput.value = "";
              }
            });
          }

          // Create drop overlay if missing
          if (!container.querySelector(".persona-attachment-drop-overlay")) {
            container.appendChild(buildDropOverlay(attachmentsConfig.dropOverlay));
          }
        } else {
          // Show existing attachment button and update config
          attachmentButtonWrapper.style.display = "";

          // Update file input accept attribute when config changes
          const attachmentsConfig = config.attachments ?? {};
          if (attachmentInput) {
            attachmentInput.accept = (attachmentsConfig.allowedTypes ?? ALL_SUPPORTED_MIME_TYPES).join(",");
            attachmentInput.multiple = (attachmentsConfig.maxFiles ?? 4) > 1;
          }

          // Update attachment manager config
          if (attachmentManager) {
            attachmentManager.updateConfig({
              allowedTypes: attachmentsConfig.allowedTypes,
              maxFileSize: attachmentsConfig.maxFileSize,
              maxFiles: attachmentsConfig.maxFiles
            });
          }
        }
      } else {
        // Hide attachment button if disabled
        if (attachmentButtonWrapper) {
          attachmentButtonWrapper.style.display = "none";
        }
        // Clear any pending attachments
        if (attachmentManager) {
          attachmentManager.clearAttachments();
        }
        // Remove drop overlay
        container.querySelector(".persona-attachment-drop-overlay")?.remove();
      }

      // Update send button styling
      const sendButtonConfig = config.sendButton ?? {};
      const useIcon = sendButtonConfig.useIcon ?? false;
      const iconText = sendButtonConfig.iconText ?? "↑";
      const iconName = sendButtonConfig.iconName;
      const tooltipText = sendButtonConfig.tooltipText ?? "Send message";
      const showTooltip = sendButtonConfig.showTooltip ?? false;
      const buttonSize = sendButtonConfig.size ?? "40px";
      const backgroundColor = sendButtonConfig.backgroundColor;
      const textColor = sendButtonConfig.textColor;

      // Update button content and styling based on mode
      if (useIcon) {
        // Icon mode: circular button
        sendButton.style.width = buttonSize;
        sendButton.style.height = buttonSize;
        sendButton.style.minWidth = buttonSize;
        sendButton.style.minHeight = buttonSize;
        sendButton.style.fontSize = "18px";
        sendButton.style.lineHeight = "1";
        
        // Clear existing content
        sendButton.innerHTML = "";
        
        // Set foreground color from config or theme token
        if (textColor) {
          sendButton.style.color = textColor;
        } else {
          sendButton.style.color = "var(--persona-button-primary-fg, #ffffff)";
        }

        // Use Lucide icon if iconName is provided, otherwise fall back to iconText
        if (iconName) {
          const iconSize = parseFloat(buttonSize) || 24;
          const iconColor = textColor?.trim() || "currentColor";
          const iconSvg = renderLucideIcon(iconName, iconSize, iconColor, 2);
          if (iconSvg) {
            sendButton.appendChild(iconSvg);
          } else {
            sendButton.textContent = iconText;
          }
        } else {
          sendButton.textContent = iconText;
        }
        
        // Update classes
        sendButton.className = "persona-rounded-button persona-flex persona-items-center persona-justify-center disabled:persona-opacity-50 persona-cursor-pointer";
        
        if (backgroundColor) {
          sendButton.style.backgroundColor = backgroundColor;
          sendButton.classList.remove("persona-bg-persona-primary");
        } else {
          sendButton.style.backgroundColor = "";
          sendButton.classList.add("persona-bg-persona-primary");
        }
      } else {
        // Text mode: existing behavior
        sendButton.textContent = config.copy?.sendButtonLabel ?? "Send";
        sendButton.style.width = "";
        sendButton.style.height = "";
        sendButton.style.minWidth = "";
        sendButton.style.minHeight = "";
        sendButton.style.fontSize = "";
        sendButton.style.lineHeight = "";
        
        // Update classes
        sendButton.className = "persona-rounded-button persona-bg-persona-accent persona-px-4 persona-py-2 persona-text-sm persona-font-semibold persona-text-white disabled:persona-opacity-50 persona-cursor-pointer";
        
        if (backgroundColor) {
          sendButton.style.backgroundColor = backgroundColor;
          sendButton.classList.remove("persona-bg-persona-accent");
        } else {
          sendButton.classList.add("persona-bg-persona-accent");
        }
        
        if (textColor) {
          sendButton.style.color = textColor;
        } else {
          sendButton.classList.add("persona-text-white");
        }
      }

      // Apply border styling
      if (sendButtonConfig.borderWidth) {
        sendButton.style.borderWidth = sendButtonConfig.borderWidth;
        sendButton.style.borderStyle = "solid";
      } else {
        sendButton.style.borderWidth = "";
        sendButton.style.borderStyle = "";
      }
      if (sendButtonConfig.borderColor) {
        sendButton.style.borderColor = sendButtonConfig.borderColor;
      } else {
        sendButton.style.borderColor = "";
      }

      // Apply padding styling (works in both icon and text mode)
      if (sendButtonConfig.paddingX) {
        sendButton.style.paddingLeft = sendButtonConfig.paddingX;
        sendButton.style.paddingRight = sendButtonConfig.paddingX;
      } else {
        sendButton.style.paddingLeft = "";
        sendButton.style.paddingRight = "";
      }
      if (sendButtonConfig.paddingY) {
        sendButton.style.paddingTop = sendButtonConfig.paddingY;
        sendButton.style.paddingBottom = sendButtonConfig.paddingY;
      } else {
        sendButton.style.paddingTop = "";
        sendButton.style.paddingBottom = "";
      }

      // Update tooltip
      const tooltip = sendButtonWrapper?.querySelector(".persona-send-button-tooltip") as HTMLElement | null;
      if (showTooltip && tooltipText) {
        if (!tooltip) {
          // Create tooltip if it doesn't exist
          const newTooltip = document.createElement("div");
          newTooltip.className = "persona-send-button-tooltip";
          newTooltip.textContent = tooltipText;
          sendButtonWrapper?.insertBefore(newTooltip, sendButton);
        } else {
          tooltip.textContent = tooltipText;
          tooltip.style.display = "";
        }
      } else if (tooltip) {
        tooltip.style.display = "none";
      }
      
      // Update contentMaxWidth on messages wrapper and composer. Same
      // composer-bar fallback as the initial read above.
      const updatedContentMaxWidth =
        config.layout?.contentMaxWidth ??
        (isComposerBar()
          ? config.launcher?.composerBar?.contentMaxWidth ?? "720px"
          : undefined);
      if (updatedContentMaxWidth) {
        messagesWrapper.style.maxWidth = updatedContentMaxWidth;
        messagesWrapper.style.marginLeft = "auto";
        messagesWrapper.style.marginRight = "auto";
        messagesWrapper.style.width = "100%";
        if (composerForm) {
          composerForm.style.maxWidth = updatedContentMaxWidth;
          composerForm.style.marginLeft = "auto";
          composerForm.style.marginRight = "auto";
        }
        if (suggestions) {
          suggestions.style.maxWidth = updatedContentMaxWidth;
          suggestions.style.marginLeft = "auto";
          suggestions.style.marginRight = "auto";
        }
      } else {
        messagesWrapper.style.maxWidth = "";
        messagesWrapper.style.marginLeft = "";
        messagesWrapper.style.marginRight = "";
        messagesWrapper.style.width = "";
        if (composerForm) {
          composerForm.style.maxWidth = "";
          composerForm.style.marginLeft = "";
          composerForm.style.marginRight = "";
        }
        if (suggestions) {
          suggestions.style.maxWidth = "";
          suggestions.style.marginLeft = "";
          suggestions.style.marginRight = "";
        }
      }

      // Update status indicator visibility and text
      const statusIndicatorConfig = config.statusIndicator ?? {};
      const isVisible = statusIndicatorConfig.visible ?? true;
      statusText.style.display = isVisible ? "" : "none";
      
      // Update status text if status is currently set
      if (session) {
        const currentStatus = session.getStatus();
        const getCurrentStatusText = (s: AgentWidgetSessionStatus): string => {
          if (s === "idle") return statusIndicatorConfig.idleText ?? statusCopy.idle;
          if (s === "connecting") return statusIndicatorConfig.connectingText ?? statusCopy.connecting;
          if (s === "connected") return statusIndicatorConfig.connectedText ?? statusCopy.connected;
          if (s === "error") return statusIndicatorConfig.errorText ?? statusCopy.error;
          return statusCopy[s];
        };
        applyStatusToElement(statusText, getCurrentStatusText(currentStatus), statusIndicatorConfig, currentStatus);
      }

      // Update status text alignment
      statusText.classList.remove("persona-text-left", "persona-text-center", "persona-text-right");
      const alignClass = statusIndicatorConfig.align === "left" ? "persona-text-left"
        : statusIndicatorConfig.align === "center" ? "persona-text-center"
        : "persona-text-right";
      statusText.classList.add(alignClass);
    },
    open() {
      if (!isPanelToggleable()) return;
      setOpenState(true, "api");
    },
    close() {
      if (!isPanelToggleable()) return;
      setOpenState(false, "api");
    },
    toggle() {
      if (!isPanelToggleable()) return;
      setOpenState(!open, "api");
    },
    reconnect() {
      session.reconnectNow();
    },
    clearChat() {
      // Clear messages in session (this will trigger onMessagesChanged which re-renders)
      artifactsPaneUserHidden = false;
      session.clearMessages();
      messageCache.clear();
      resumeAutoScroll();

      // Always clear the default localStorage key
      try {
        localStorage.removeItem(DEFAULT_CHAT_HISTORY_STORAGE_KEY);
        if (config.debug) {
          console.log(`[AgentWidget] Cleared default localStorage key: ${DEFAULT_CHAT_HISTORY_STORAGE_KEY}`);
        }
      } catch (error) {
        console.error("[AgentWidget] Failed to clear default localStorage:", error);
      }

      // Also clear custom localStorage key if configured
      if (config.clearChatHistoryStorageKey && config.clearChatHistoryStorageKey !== DEFAULT_CHAT_HISTORY_STORAGE_KEY) {
        try {
          localStorage.removeItem(config.clearChatHistoryStorageKey);
          if (config.debug) {
            console.log(`[AgentWidget] Cleared custom localStorage key: ${config.clearChatHistoryStorageKey}`);
          }
        } catch (error) {
          console.error("[AgentWidget] Failed to clear custom localStorage:", error);
        }
      }

      // Dispatch custom event for external handlers (e.g., localStorage clearing in examples)
      const clearEvent = new CustomEvent("persona:clear-chat", {
        detail: { timestamp: new Date().toISOString() }
      });
      window.dispatchEvent(clearEvent);

      if (storageAdapter?.clear) {
        runStorageMutation(
          () => storageAdapter.clear!(),
          "[AgentWidget] Failed to clear storage adapter:"
        );
      }
      persistentMetadata = {};
      actionManager.syncFromMetadata();

      // Clear event stream buffer and store, and reset throughput tracking
      eventStreamBuffer?.clear();
      throughputTracker?.reset();
      eventStreamView?.update();
    },
    setMessage(message: string): boolean {
      if (!textarea) return false;
      if (session.isStreaming()) return false;
      
      // Auto-open widget if closed and the panel is toggleable
      if (!open && isPanelToggleable()) {
        setOpenState(true, "system");
      }
      
      textarea.value = message;
      // Trigger input event for any listeners
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
    submitMessage(message?: string): boolean {
      if (session.isStreaming()) return false;
      
      const valueToSubmit = message?.trim() || textarea.value.trim();
      if (!valueToSubmit) return false;
      
      // Auto-open widget if closed and the panel is toggleable
      if (!open && isPanelToggleable()) {
        setOpenState(true, "system");
      }
      
      textarea.value = "";
      textarea.style.height = "auto"; // Reset height after clearing
      session.sendMessage(valueToSubmit);
      return true;
    },
    startVoiceRecognition(): boolean {
      if (session.isStreaming()) return false;
      if (config.voiceRecognition?.provider?.type === 'runtype') {
        if (session.isVoiceActive()) return true;
        if (!open && isPanelToggleable()) setOpenState(true, "system");
        voiceState.manuallyDeactivated = false;
        persistVoiceMetadata();
        session.toggleVoice().then(() => {
          voiceState.active = session.isVoiceActive();
          emitVoiceState("user");
          if (session.isVoiceActive()) applyRuntypeMicRecordingStyles();
        });
        return true;
      }
      if (isRecording) return true;
      const SpeechRecognitionClass = getSpeechRecognitionClass();
      if (!SpeechRecognitionClass) return false;
      if (!open && isPanelToggleable()) setOpenState(true, "system");
      voiceState.manuallyDeactivated = false;
      persistVoiceMetadata();
      startVoiceRecognition("user");
      return true;
    },
    stopVoiceRecognition(): boolean {
      if (config.voiceRecognition?.provider?.type === 'runtype') {
        if (!session.isVoiceActive()) return false;
        session.toggleVoice().then(() => {
          voiceState.active = false;
          voiceState.manuallyDeactivated = true;
          persistVoiceMetadata();
          emitVoiceState("user");
          removeRuntypeMicStateStyles();
        });
        return true;
      }
      if (!isRecording) return false;

      voiceState.manuallyDeactivated = true;
      persistVoiceMetadata();
      stopVoiceRecognition("user");
      return true;
    },
    injectMessage(options: InjectMessageOptions): AgentWidgetMessage {
      // Auto-open widget if closed and the panel is toggleable
      if (!open && isPanelToggleable()) {
        setOpenState(true, "system");
      }
      return session.injectMessage(options);
    },
    injectAssistantMessage(options: InjectAssistantMessageOptions): AgentWidgetMessage {
      // Auto-open widget if closed and the panel is toggleable
      if (!open && isPanelToggleable()) {
        setOpenState(true, "system");
      }
      const result = session.injectAssistantMessage(options);

      // Check if we should trigger resubmit after injection
      // This handles the case where a handler returned resubmit: true and then
      // injected a message - we wait until after injection to trigger resubmit
      if (pendingResubmit) {
        pendingResubmit = false;
        if (pendingResubmitTimeout) {
          clearTimeout(pendingResubmitTimeout);
          pendingResubmitTimeout = null;
        }
        // Short delay to ensure message is in context
        setTimeout(() => {
          if (session && !session.isStreaming()) {
            session.continueConversation();
          }
        }, 100);
      }

      return result;
    },
    injectUserMessage(options: InjectUserMessageOptions): AgentWidgetMessage {
      // Auto-open widget if closed and the panel is toggleable
      if (!open && isPanelToggleable()) {
        setOpenState(true, "system");
      }
      return session.injectUserMessage(options);
    },
    injectSystemMessage(options: InjectSystemMessageOptions): AgentWidgetMessage {
      // Auto-open widget if closed and the panel is toggleable
      if (!open && isPanelToggleable()) {
        setOpenState(true, "system");
      }
      return session.injectSystemMessage(options);
    },
    injectMessageBatch(optionsList: InjectMessageOptions[]): AgentWidgetMessage[] {
      if (!open && isPanelToggleable()) {
        setOpenState(true, "system");
      }
      return session.injectMessageBatch(optionsList);
    },
    injectComponentDirective(
      options: InjectComponentDirectiveOptions
    ): AgentWidgetMessage {
      // Auto-open widget if closed and the panel is toggleable
      if (!open && isPanelToggleable()) {
        setOpenState(true, "system");
      }
      return session.injectComponentDirective(options);
    },
    /** @deprecated Use injectMessage() instead */
    injectTestMessage(event: AgentWidgetEvent) {
      // Auto-open widget if closed and the panel is toggleable
      if (!open && isPanelToggleable()) {
        setOpenState(true, "system");
      }
      session.injectTestEvent(event);
    },
    async connectStream(
      stream: ReadableStream<Uint8Array>,
      options?: { assistantMessageId?: string }
    ): Promise<void> {
      return session.connectStream(stream, options);
    },
    /** Push a raw event into the event stream buffer (for testing/debugging) */
    __pushEventStreamEvent(event: { type: string; payload: unknown }): void {
      if (eventStreamBuffer) {
        throughputTracker?.processEvent(event.type, event.payload);
        eventStreamBuffer.push({
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: event.type,
          timestamp: Date.now(),
          payload: JSON.stringify(event.payload)
        });
      }
    },
    showEventStream(): void {
      if (!showEventStreamToggle || !eventStreamBuffer) return;
      toggleEventStreamOn();
    },
    hideEventStream(): void {
      if (!eventStreamVisible) return;
      toggleEventStreamOff();
    },
    isEventStreamVisible(): boolean {
      return eventStreamVisible;
    },
    showArtifacts(): void {
      if (!artifactsSidebarEnabled(config)) return;
      artifactsPaneUserHidden = false;
      artifactsPaneUserOpened = true;
      syncArtifactPane();
      artifactPaneApi?.setMobileOpen(true);
    },
    hideArtifacts(): void {
      if (!artifactsSidebarEnabled(config)) return;
      artifactsPaneUserHidden = true;
      syncArtifactPane();
    },
    upsertArtifact(manual: PersonaArtifactManualUpsert): PersonaArtifactRecord | null {
      if (!artifactsSidebarEnabled(config)) return null;
      // Programmatic upserts match the streamed UX: only "panel"-mode
      // artifacts auto-open the pane (overriding a previous Close), while
      // "card"/"inline" stay calm — the injected transcript block is the
      // affordance. Independent of `transcript: false`: pane-only callers
      // (e.g. the theme editor preview) rely on the panel-default surfacing;
      // callers that want the pane in a non-panel mode call showArtifacts().
      const mode = resolveArtifactDisplayMode(
        config.features?.artifacts,
        manual.artifactType
      );
      if (mode === "panel") {
        artifactsPaneUserHidden = false;
        artifactsPaneUserOpened = true;
      }
      return session.upsertArtifact(manual);
    },
    selectArtifact(id: string): void {
      if (!artifactsSidebarEnabled(config)) return;
      session.selectArtifact(id);
    },
    clearArtifacts(): void {
      if (!artifactsSidebarEnabled(config)) return;
      session.clearArtifacts();
    },
    getArtifacts(): PersonaArtifactRecord[] {
      return session?.getArtifacts() ?? [];
    },
    getSelectedArtifactId(): string | null {
      return session?.getSelectedArtifactId() ?? null;
    },
    focusInput(): boolean {
      // Composer-bar's textarea is always reachable in the collapsed pill,
      // so don't gate focus behind `open` for that mode.
      if (launcherEnabled && !open && !isComposerBar()) return false;
      if (!textarea) return false;
      textarea.focus();
      return true;
    },
    async resolveApproval(
      approvalId: string,
      decision: 'approved' | 'denied',
      options?: AgentWidgetApprovalDecisionOptions
    ): Promise<void> {
      const messages = session.getMessages();
      const approvalMessage = messages.find(
        m => m.variant === "approval" && m.approval?.id === approvalId
      );
      if (!approvalMessage?.approval) {
        throw new Error(`Approval not found: ${approvalId}`);
      }
      // Mirror the in-panel click handler: WebMCP gate bubbles resolve a local
      // Promise the bridge is parked on (no server round-trip and they carry an
      // empty executionId/agentId), so they must NOT hit the server approval
      // API. Route by the `toolType` marker set in `requestWebMcpApproval`.
      if (approvalMessage.approval.toolType === "webmcp") {
        session.resolveWebMcpApproval(approvalMessage.id, decision);
        return;
      }
      return session.resolveApproval(approvalMessage.approval, decision, options);
    },
    getMessages() {
      return session.getMessages();
    },
    getStatus() {
      return session.getStatus();
    },
    getPersistentMetadata() {
      return { ...persistentMetadata };
    },
    updatePersistentMetadata(
      updater: (prev: Record<string, unknown>) => Record<string, unknown>
    ) {
      updateSessionMetadata(updater);
    },
    on(event, handler) {
      return eventBus.on(event, handler);
    },
    off(event, handler) {
      eventBus.off(event, handler);
    },
    // State query methods
    isOpen(): boolean {
      return isPanelToggleable() && open;
    },
    isVoiceActive(): boolean {
      return voiceState.active;
    },
    /**
     * Toggle "Read aloud" for an assistant message: play → pause → resume (or
     * play → stop when the engine can't pause). Speaks via the configured
     * speech engine (browser Web Speech API by default).
     */
    toggleReadAloud(messageId: string): void {
      session.toggleReadAloud(messageId);
    },
    /** Stop any in-progress read-aloud / text-to-speech playback. */
    stopReadAloud(): void {
      session.stopSpeaking();
    },
    /** Current read-aloud playback state for a message (`idle` unless active). */
    getReadAloudState(messageId: string): ReadAloudState {
      return session.getReadAloudState(messageId);
    },
    /** Subscribe to read-aloud state changes. Returns an unsubscribe function. */
    onReadAloudChange(
      listener: (activeId: string | null, state: ReadAloudState) => void
    ): () => void {
      return session.onReadAloudChange(listener);
    },
    getState(): AgentWidgetStateSnapshot {
      return {
        open: isPanelToggleable() && open,
        launcherEnabled,
        voiceActive: voiceState.active,
        streaming: session.isStreaming()
      };
    },
    // Feedback methods (CSAT/NPS)
    showCSATFeedback(options?: Partial<CSATFeedbackOptions>) {
      // Auto-open widget if closed and the panel is toggleable
      if (!open && isPanelToggleable()) {
        setOpenState(true, "system");
      }
      
      // Remove any existing feedback forms
      const existingFeedback = messagesWrapper.querySelector('.persona-feedback-container');
      if (existingFeedback) {
        existingFeedback.remove();
      }
      
      const feedbackEl = createCSATFeedback({
        onSubmit: async (rating, comment) => {
          if (session.isClientTokenMode()) {
            await session.submitCSATFeedback(rating, comment);
          }
          options?.onSubmit?.(rating, comment);
        },
        onDismiss: options?.onDismiss,
        ...options,
      });
      
      // Append to messages area at the bottom
      messagesWrapper.appendChild(feedbackEl);
      feedbackEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
    },
    showNPSFeedback(options?: Partial<NPSFeedbackOptions>) {
      // Auto-open widget if closed and the panel is toggleable
      if (!open && isPanelToggleable()) {
        setOpenState(true, "system");
      }
      
      // Remove any existing feedback forms
      const existingFeedback = messagesWrapper.querySelector('.persona-feedback-container');
      if (existingFeedback) {
        existingFeedback.remove();
      }
      
      const feedbackEl = createNPSFeedback({
        onSubmit: async (rating, comment) => {
          if (session.isClientTokenMode()) {
            await session.submitNPSFeedback(rating, comment);
          }
          options?.onSubmit?.(rating, comment);
        },
        onDismiss: options?.onDismiss,
        ...options,
      });
      
      // Append to messages area at the bottom
      messagesWrapper.appendChild(feedbackEl);
      feedbackEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
    },
    async submitCSATFeedback(rating: number, comment?: string): Promise<void> {
      return session.submitCSATFeedback(rating, comment);
    },
    async submitNPSFeedback(rating: number, comment?: string): Promise<void> {
      return session.submitNPSFeedback(rating, comment);
    },
    destroy() {
      // Commit the latest coalesced transcript while the live DOM and storage
      // pipeline still exist, then let the normal teardown cancel any work
      // scheduled by that final apply.
      flushPendingStreamingText();
      if (toolElapsedTimerId != null) {
        clearInterval(toolElapsedTimerId);
        toolElapsedTimerId = null;
      }
      destroyCallbacks.forEach((cb) => cb());
      wrapper.remove();
      pillRoot?.remove();
      launcherButtonInstance?.destroy();
      customLauncherElement?.remove();
      if (closeHandler) {
        closeButton.removeEventListener("click", closeHandler);
      }
    }
  };

  const shouldExposeDebugApi =
    (runtimeOptions?.debugTools ?? false) || Boolean(config.debug);

  if (shouldExposeDebugApi && typeof window !== "undefined") {
    const previousDebug = (window as any).AgentWidgetBrowser;
    const debugApi = {
      controller,
      getMessages: controller.getMessages,
      getStatus: controller.getStatus,
      getMetadata: controller.getPersistentMetadata,
      updateMetadata: controller.updatePersistentMetadata,
      clearHistory: () => controller.clearChat(),
      setVoiceActive: (active: boolean) =>
        active
          ? controller.startVoiceRecognition()
          : controller.stopVoiceRecognition()
    };
    (window as any).AgentWidgetBrowser = debugApi;
    destroyCallbacks.push(() => {
      if ((window as any).AgentWidgetBrowser === debugApi) {
        (window as any).AgentWidgetBrowser = previousDebug;
      }
    });
  }

  // ============================================================================
  // INSTANCE-SCOPED WINDOW EVENTS FOR PROGRAMMATIC CONTROL
  // ============================================================================
  if (typeof window !== "undefined") {
    const instanceId = mount.getAttribute("data-persona-instance") || mount.id || "persona-" + Math.random().toString(36).slice(2, 8);

    const handleFocusInput = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.instanceId || detail.instanceId === instanceId) {
        controller.focusInput();
      }
    };
    window.addEventListener("persona:focusInput", handleFocusInput);
    destroyCallbacks.push(() => {
      window.removeEventListener("persona:focusInput", handleFocusInput);
    });

    if (showEventStreamToggle) {
      const handleShowEvent = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (!detail?.instanceId || detail.instanceId === instanceId) {
          controller.showEventStream();
        }
      };
      const handleHideEvent = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (!detail?.instanceId || detail.instanceId === instanceId) {
          controller.hideEventStream();
        }
      };
      window.addEventListener("persona:showEventStream", handleShowEvent);
      window.addEventListener("persona:hideEventStream", handleHideEvent);
      destroyCallbacks.push(() => {
        window.removeEventListener("persona:showEventStream", handleShowEvent);
        window.removeEventListener("persona:hideEventStream", handleHideEvent);
      });
    }

    const handleShowArtifacts = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.instanceId || detail.instanceId === instanceId) {
        controller.showArtifacts();
      }
    };
    const handleHideArtifacts = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.instanceId || detail.instanceId === instanceId) {
        controller.hideArtifacts();
      }
    };
    const handleUpsertArtifact = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.instanceId && detail.instanceId !== instanceId) return;
      if (detail?.artifact) {
        controller.upsertArtifact(detail.artifact as PersonaArtifactManualUpsert);
      }
    };
    const handleSelectArtifact = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.instanceId && detail.instanceId !== instanceId) return;
      if (typeof detail?.id === "string") {
        controller.selectArtifact(detail.id);
      }
    };
    const handleClearArtifacts = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.instanceId || detail.instanceId === instanceId) {
        controller.clearArtifacts();
      }
    };
    window.addEventListener("persona:showArtifacts", handleShowArtifacts);
    window.addEventListener("persona:hideArtifacts", handleHideArtifacts);
    window.addEventListener("persona:upsertArtifact", handleUpsertArtifact);
    window.addEventListener("persona:selectArtifact", handleSelectArtifact);
    window.addEventListener("persona:clearArtifacts", handleClearArtifacts);
    destroyCallbacks.push(() => {
      window.removeEventListener("persona:showArtifacts", handleShowArtifacts);
      window.removeEventListener("persona:hideArtifacts", handleHideArtifacts);
      window.removeEventListener("persona:upsertArtifact", handleUpsertArtifact);
      window.removeEventListener("persona:selectArtifact", handleSelectArtifact);
      window.removeEventListener("persona:clearArtifacts", handleClearArtifacts);
    });
  }

  // ============================================================================
  // STATE PERSISTENCE ACROSS PAGE NAVIGATIONS
  // ============================================================================
  const persistConfig = normalizePersistStateConfig(config.persistState);
  
  if (persistConfig && isPanelToggleable()) {
    const storage = getPersistStorage(persistConfig.storage!);
    const openKey = `${persistConfig.keyPrefix}widget-open`;
    const voiceKey = `${persistConfig.keyPrefix}widget-voice`;
    const voiceModeKey = `${persistConfig.keyPrefix}widget-voice-mode`;

    if (storage) {
      // Restore state from previous page
      const wasOpen = persistConfig.persist?.openState && storage.getItem(openKey) === 'true';
      const wasVoiceActive = persistConfig.persist?.voiceState && storage.getItem(voiceKey) === 'true';
      // Also check if user was in voice mode (last message was via voice)
      const wasInVoiceMode = persistConfig.persist?.voiceState && storage.getItem(voiceModeKey) === 'true';

      if (wasOpen) {
        // Use setTimeout to ensure DOM is ready
        setTimeout(() => {
          controller.open();

          // After opening, restore input mode
          setTimeout(() => {
            // Restore voice if it was actively recording OR if user was in voice mode
            if (wasVoiceActive || wasInVoiceMode) {
              controller.startVoiceRecognition();
            } else if (persistConfig.persist?.focusInput) {
              const textarea = mount.querySelector('textarea') as HTMLTextAreaElement | null;
              if (textarea) {
                textarea.focus();
              }
            }
          }, 100);
        }, 0);
      }

      // Persist open/close state changes
      if (persistConfig.persist?.openState) {
        eventBus.on('widget:opened', () => {
          storage.setItem(openKey, 'true');
        });
        eventBus.on('widget:closed', () => {
          storage.setItem(openKey, 'false');
        });
      }

      // Persist voice state changes
      if (persistConfig.persist?.voiceState) {
        eventBus.on('voice:state', (event) => {
          storage.setItem(voiceKey, event.active ? 'true' : 'false');
        });

        // Persist whether user is in voice mode based on their messages
        // This allows voice to resume after navigation even when recording was stopped for submission
        eventBus.on('user:message', (message) => {
          storage.setItem(voiceModeKey, message.viaVoice ? 'true' : 'false');
        });
      }

      // Clear persisted state on chat clear
      if (persistConfig.clearOnChatClear) {
        const clearPersistState = () => {
          storage.removeItem(openKey);
          storage.removeItem(voiceKey);
          storage.removeItem(voiceModeKey);
        };

        // Listen for clear chat event
        const handleClearChat = () => clearPersistState();
        window.addEventListener('persona:clear-chat', handleClearChat);

        // Clean up listener on destroy
        destroyCallbacks.push(() => {
          window.removeEventListener('persona:clear-chat', handleClearChat);
        });
      }
    }
  }

  // If onStateLoaded signalled open: true, open the panel after init.
  // Mirrors the same setTimeout(0) pattern used by persistState restore so both
  // can fire independently without interfering with each other.
  if (shouldOpenAfterStateLoaded && isPanelToggleable()) {
    setTimeout(() => { controller.open(); }, 0);
  }

  // Initial sync of the composer-bar peek banner so it reflects any
  // restored history. Subsequent updates flow through `onMessagesChanged`,
  // `onStreamingChanged`, `updateOpenState`, and pointerenter/leave on
  // the panel.
  syncComposerBarPeek();

  // IIFE/CDN lazy path only: the parsers were not ready at mount, so any
  // messages rendered so far (restored history, eager intro/injected messages)
  // were escaped to plain text. Once the `markdown-parsers.js` chunk resolves,
  // bust the message cache and re-render so they pick up real markdown. Bumping
  // `configVersion` + clearing the cache is required because the message
  // content is unchanged, so the fingerprint cache would otherwise reuse the
  // stale escaped wrappers. `onMarkdownParsersReady` no-ops when the parsers are
  // already loaded (the ESM build, and the CDN build after the first load), so
  // the `markdownReadyAtInit` guard is redundant — kept only to skip the
  // subscription bookkeeping on the common eager path.
  if (!markdownReadyAtInit) {
    const unsubscribeParsersReady = onMarkdownParsersReady(() => {
      if (!session) return;
      configVersion++;
      messageCache.clear();
      renderMessagesWithPlugins(messagesWrapper, session.getMessages(), postprocess);
    });
    // Drop the subscription on teardown so a late chunk resolution can't clear
    // the cache and render into a detached `messagesWrapper`.
    destroyCallbacks.push(unsubscribeParsersReady);
  }

  return controller;
};

export type AgentWidgetController = Controller;
