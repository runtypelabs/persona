import { escapeHtml, createMarkdownProcessorFromConfig } from "./postprocessors";
import { resolveSanitizer } from "./utils/sanitize";
import { AgentWidgetSession, AgentWidgetSessionStatus } from "./session";
import {
  AgentWidgetConfig,
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
  LoadingIndicatorRenderContext,
  IdleIndicatorRenderContext,
  VoiceStatus,
  PersonaArtifactRecord,
  PersonaArtifactManualUpsert
} from "./types";
import { AttachmentManager } from "./utils/attachment-manager";
import { createTextPart, ALL_SUPPORTED_MIME_TYPES } from "./utils/content";
import { applyThemeVariables, createThemeObserver, getActiveTheme } from "./utils/theme";
import { resolveTokenValue } from "./utils/tokens";
import { renderLucideIcon } from "./utils/icons";
import { createElement, createElementInDocument } from "./utils/dom";
import { morphMessages } from "./utils/morph";
import { computeMessageFingerprint, createMessageCache, getCachedWrapper, setCachedWrapper, pruneCache } from "./utils/message-fingerprint";
import { statusCopy } from "./utils/constants";
import { isDockedMountMode, resolveDockConfig } from "./utils/dock";
import { createLauncherButton } from "./components/launcher";
import { createWrapper, buildPanel, buildHeader, buildComposer, attachHeaderToContainer } from "./components/panel";
import { HEADER_THEME_CSS } from "./components/header-builder";
import { buildHeaderWithLayout } from "./components/header-layouts";
import { positionMap } from "./utils/positioning";
import type { HeaderElements as _HeaderElements, ComposerElements as _ComposerElements } from "./components/panel";
import { MessageTransform, MessageActionCallbacks, LoadingIndicatorRenderer } from "./components/message-bubble";
import { createStandardBubble, createTypingIndicator } from "./components/message-bubble";
import { createReasoningBubble, reasoningExpansionState, updateReasoningBubbleUI } from "./components/reasoning-bubble";
import { createToolBubble, toolExpansionState, updateToolBubbleUI } from "./components/tool-bubble";
import { createApprovalBubble } from "./components/approval-bubble";
import { createSuggestions } from "./components/suggestions";
import { EventStreamBuffer } from "./utils/event-stream-buffer";
import { EventStreamStore } from "./utils/event-stream-store";
import { createEventStreamView } from "./components/event-stream-view";
import { createArtifactPane, type ArtifactPaneApi } from "./components/artifact-pane";
import {
  artifactsSidebarEnabled,
  applyArtifactLayoutCssVars,
  applyArtifactPaneAppearance,
  shouldExpandLauncherForArtifacts
} from "./utils/artifact-gate";
import { readFlexGapPx, resolveArtifactPaneWidthPx } from "./utils/artifact-resize";
import { enhanceWithForms } from "./components/forms";
import { pluginRegistry } from "./plugins/registry";
import { mergeWithDefaults } from "./defaults";
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
  /**
   * Focus the chat input. Returns true if focus succeeded, false if panel is closed
   * (launcher mode) or textarea is unavailable.
   */
  focusInput: () => boolean;
  /**
   * Programmatically resolve a pending approval.
   * @param approvalId - The approval ID to resolve
   * @param decision - "approved" or "denied"
   */
  resolveApproval: (approvalId: string, decision: 'approved' | 'denied') => Promise<void>;
};

const buildPostprocessor = (
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

    // Priority: postprocessMessage > markdown config > escapeHtml
    let html: string;
    if (cfg?.postprocessMessage) {
      html = cfg.postprocessMessage({
        ...context,
        text: nextText,
        raw: rawPayload ?? context.text ?? ""
      });
    } else if (markdownProcessor) {
      html = markdownProcessor(nextText);
    } else {
      html = escapeHtml(nextText);
    }

    return sanitize ? sanitize(html) : html;
  };
};

export const createAgentExperience = (
  mount: HTMLElement,
  initialConfig?: AgentWidgetConfig,
  runtimeOptions?: { debugTools?: boolean }
): Controller => {
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
  
  // Register components from config
  if (config.components) {
    componentRegistry.registerAll(config.components);
  }
  const eventBus = createEventBus<AgentWidgetControllerEventMap>();

  const storageAdapter: AgentWidgetStorageAdapter =
    config.storageAdapter ?? createLocalStorageAdapter();
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
  let open = launcherEnabled ? autoExpand : true;

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
  const persistKeyPrefix = (typeof config.persistState === 'object' ? config.persistState?.keyPrefix : undefined) ?? "persona-";
  const eventStreamDbName = `${persistKeyPrefix}event-stream`;
  let eventStreamStore = showEventStreamToggle ? new EventStreamStore(eventStreamDbName) : null;
  const eventStreamMaxEvents = config.features?.eventStream?.maxEvents ?? 2000;
  let eventStreamBuffer = showEventStreamToggle ? new EventStreamBuffer(eventStreamMaxEvents, eventStreamStore) : null;
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
    return statusCopy[status];
  };

  const { wrapper, panel } = createWrapper(config);
  const panelElements = buildPanel(config, launcherEnabled);
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

  // Use mutable references for mic button so we can update them dynamically
  let micButton: HTMLButtonElement | null = panelElements.micButton;
  let micButtonWrapper: HTMLElement | null = panelElements.micButtonWrapper;

  // Use mutable references for attachment elements so we can create them dynamically
  let attachmentButton: HTMLButtonElement | null = panelElements.attachmentButton;
  let attachmentButtonWrapper: HTMLElement | null = panelElements.attachmentButtonWrapper;
  let attachmentInput: HTMLInputElement | null = panelElements.attachmentInput;
  let attachmentPreviewsContainer: HTMLElement | null = panelElements.attachmentPreviewsContainer;

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
        const headerElements = buildHeader({ config, showClose: launcherEnabled });
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
      });
    }
    if (eventStreamView) {
      body.style.display = "none";
      footer.parentNode?.insertBefore(eventStreamView.element, footer);
      eventStreamView.update();
    }
    if (eventStreamToggleBtn) {
      eventStreamToggleBtn.classList.remove("persona-text-persona-muted");
      eventStreamToggleBtn.classList.add("persona-text-persona-accent");
      eventStreamToggleBtn.style.boxShadow = "inset 0 0 0 1.5px var(--persona-accent, #3b82f6)";
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
      eventStreamToggleBtn.classList.remove("persona-text-persona-accent");
      eventStreamToggleBtn.classList.add("persona-text-persona-muted");
      eventStreamToggleBtn.style.boxShadow = "";
      const activeClasses = config.features?.eventStream?.classNames?.toggleButtonActive;
      if (activeClasses) activeClasses.split(/\s+/).forEach(c => c && eventStreamToggleBtn!.classList.remove(c));
    }
    // Cancel RAF update loop
    if (eventStreamRAF !== null) {
      cancelAnimationFrame(eventStreamRAF);
      eventStreamRAF = null;
    }
    eventBus.emit("eventStream:closed", { timestamp: Date.now() });
  };

  // Event stream toggle button
  let eventStreamToggleBtn: HTMLButtonElement | null = null;
  if (showEventStreamToggle) {
    const esClassNames = config.features?.eventStream?.classNames;
    const toggleBtnClasses = "persona-inline-flex persona-items-center persona-justify-center persona-rounded-full persona-text-persona-muted hover:persona-bg-gray-100 persona-cursor-pointer persona-border-none persona-bg-transparent persona-p-1" + (esClassNames?.toggleButton ? " " + esClassNames.toggleButton : "");
    eventStreamToggleBtn = createElement("button", toggleBtnClasses) as HTMLButtonElement;
    eventStreamToggleBtn.style.width = "28px";
    eventStreamToggleBtn.style.height = "28px";
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
    let previews = rootFooter.querySelector<HTMLElement>(".persona-attachment-previews");
    if (!previews) {
      previews = createElement(
        "div",
        "persona-attachment-previews persona-flex persona-flex-wrap persona-gap-2 persona-mb-2"
      );
      previews.style.display = "none";
      const form = rootFooter.querySelector("[data-persona-composer-form]");
      if (form?.parentNode) {
        form.parentNode.insertBefore(previews, form);
      } else {
        rootFooter.insertBefore(previews, rootFooter.firstChild);
      }
    }
    if (!rootFooter.querySelector<HTMLInputElement>('input[type="file"]')) {
      const fileIn = createElement("input") as HTMLInputElement;
      fileIn.type = "file";
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
        if (session && !session.isStreaming()) {
          session.sendMessage(text);
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
      },
      onVoiceToggle:
        config.voiceRecognition?.enabled === true
          ? () => {
              composerVoiceBridge?.();
            }
          : undefined
    });
    if (customComposer) {
      // Replace the default footer with custom composer
      footer.replaceWith(customComposer);
      footer = customComposer;
    }
  }

  const bindComposerRefsFromFooter = (rootFooter: HTMLElement) => {
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
    const sug = rootFooter.querySelector<HTMLElement>(
      ".persona-mb-3.persona-flex.persona-flex-wrap.persona-gap-2"
    );
    if (sug) suggestions = sug;
    const attBtn = rootFooter.querySelector<HTMLButtonElement>(".persona-attachment-button");
    if (attBtn) {
      attachmentButton = attBtn;
      attachmentButtonWrapper = attBtn.parentElement as HTMLElement | null;
    }
    attachmentInput = rootFooter.querySelector<HTMLInputElement>('input[type="file"]');
    attachmentPreviewsContainer = rootFooter.querySelector<HTMLElement>(".persona-attachment-previews");
    const ar = rootFooter.querySelector<HTMLElement>(".persona-widget-composer .persona-flex.persona-items-center.persona-justify-between");
    if (ar) _actionsRow = ar;
  };
  ensureComposerAttachmentSurface(footer);
  bindComposerRefsFromFooter(footer);

  // Apply contentMaxWidth to composer form if configured
  const contentMaxWidth = config.layout?.contentMaxWidth;
  if (contentMaxWidth && composerForm) {
    composerForm.style.maxWidth = contentMaxWidth;
    composerForm.style.marginLeft = "auto";
    composerForm.style.marginRight = "auto";
  }

  if (config.attachments?.enabled && attachmentInput && attachmentPreviewsContainer) {
    attachmentManager = AttachmentManager.fromConfig(config.attachments);
    attachmentManager.setPreviewsContainer(attachmentPreviewsContainer);
    attachmentInput.addEventListener("change", (e) => {
      const target = e.target as HTMLInputElement;
      attachmentManager?.handleFileSelect(target.files);
      target.value = "";
    });
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
    const bubble = headerButton.closest('.vanilla-reasoning-bubble, .vanilla-tool-bubble') as HTMLElement;
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
    }
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

  // Add event delegation for message action buttons (upvote, downvote, copy)
  // This handles clicks even after idiomorph morphs the DOM and strips inline listeners
  const messageVoteState = new Map<string, "upvote" | "downvote">();

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
    } else if (action === 'upvote' || action === 'downvote') {
      const currentVote = messageVoteState.get(messageId) ?? null;
      const wasActive = currentVote === action;

      if (wasActive) {
        // Toggle off
        messageVoteState.delete(messageId);
        actionBtn.classList.remove("persona-message-action-active");
      } else {
        // Clear opposite vote button
        const oppositeAction = action === 'upvote' ? 'downvote' : 'upvote';
        const oppositeBtn = actionsContainer.querySelector(`[data-action="${oppositeAction}"]`);
        if (oppositeBtn) {
          oppositeBtn.classList.remove("persona-message-action-active");
        }

        messageVoteState.set(messageId, action);
        actionBtn.classList.add("persona-message-action-active");

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

    const approvalBubble = approvalButton.closest('.vanilla-approval-bubble') as HTMLElement;
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

    // Resolve the approval
    session.resolveApproval(approvalMessage.approval, decision);
  });

  let artifactPaneApi: ArtifactPaneApi | null = null;
  let artifactPanelResizeObs: ResizeObserver | null = null;
  let lastArtifactsState: {
    artifacts: PersonaArtifactRecord[];
    selectedId: string | null;
  } = { artifacts: [], selectedId: null };
  let artifactsPaneUserHidden = false;
  const sessionRef: { current: AgentWidgetSession | null } = { current: null };

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
    // Try session state first, fall back to content stored in the card's rawContent props
    const artifact = session.getArtifactById(artifactId);
    let markdown = artifact?.markdown;
    let title = artifact?.title || 'artifact';
    if (!markdown) {
      // After page refresh, session state is gone — read from the persisted card message
      const cardEl = dlBtn.closest('[data-open-artifact]');
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
          } catch { /* ignore */ }
        }
      }
    }
    if (!markdown) return;
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.md`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Click delegation for artifact reference cards
  messagesWrapper.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const card = target.closest('[data-open-artifact]') as HTMLElement;
    if (!card) return;
    const artifactId = card.getAttribute('data-open-artifact');
    if (!artifactId) return;
    // Let integrator intercept
    const openPrevented = config.features?.artifacts?.onArtifactAction?.({ type: 'open', artifactId });
    if (openPrevented === true) return;
    event.preventDefault();
    event.stopPropagation();
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

  let artifactSplitRoot: HTMLElement | null = null;
  let artifactResizeHandle: HTMLElement | null = null;
  let artifactResizeUnbind: (() => void) | null = null;
  let artifactResizeDocEnd: (() => void) | null = null;
  let reconcileArtifactResize: () => void = () => {};

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
    artifactPaneApi.update(lastArtifactsState);
    if (artifactsPaneUserHidden) {
      artifactPaneApi.setMobileOpen(false);
      artifactPaneApi.element.classList.add("persona-hidden");
      artifactPaneApi.backdrop?.classList.add("persona-hidden");
    } else if (lastArtifactsState.artifacts.length > 0) {
      // User chose “show” again (e.g. programmatic showArtifacts): clear dismiss chrome
      // and force drawer open so narrow-host / mobile slide-out is not stuck off-screen.
      artifactPaneApi.element.classList.remove("persona-hidden");
      artifactPaneApi.setMobileOpen(true);
    }
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
        const has =
          lastArtifactsState.artifacts.length > 0 && !artifactsPaneUserHidden;
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

      const base = config.launcher?.width ?? config.launcherWidth ?? "min(400px, calc(100vw - 24px))";
      const expanded =
        config.features?.artifacts?.layout?.expandedPanelWidth ??
        "min(720px, calc(100vw - 24px))";
      const hasVisible =
        lastArtifactsState.artifacts.length > 0 && !artifactsPaneUserHidden;
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
  mount.appendChild(wrapper);

  // Apply full-height and sidebar styles if enabled
  // This ensures the widget fills its container height with proper flex layout
  const applyFullHeightStyles = () => {
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
    const overlayZIndex = config.launcher?.zIndex ?? 9999;

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

    // Reset all inline styles first to handle mode toggling
    // This ensures styles don't persist when switching between modes
    mount.style.cssText = '';
    wrapper.style.cssText = '';
    panel.style.cssText = '';
    container.style.cssText = '';
    body.style.cssText = '';
    footer.style.cssText = '';
    
    // Mobile fullscreen: fill entire viewport with no radius/shadow/margins
    if (shouldGoFullscreen) {
      // Remove position offset classes
      wrapper.classList.remove(
        'persona-bottom-6', 'persona-right-6', 'persona-left-6', 'persona-top-6',
        'persona-bottom-4', 'persona-right-4', 'persona-left-4', 'persona-top-4'
      );

      // Wrapper — fill entire viewport
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

      // Panel — fill wrapper, no radius/shadow
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

      // Container — fill panel, no radius/border
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

      // Body — scrollable messages
      body.style.flex = '1 1 0%';
      body.style.minHeight = '0';
      body.style.overflowY = 'auto';

      // Footer — pinned at bottom
      footer.style.flexShrink = '0';

      wasMobileFullscreen = true;
      return; // Skip remaining mode logic
    }

    // Re-apply panel width/maxWidth from initial setup
    const launcherWidth = config?.launcher?.width ?? config?.launcherWidth;
    const width = launcherWidth ?? "min(400px, calc(100vw - 24px))";
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
      // Override z-index only when explicitly configured; otherwise the persona-z-50 class applies
      const zIndexStyles = !sidebarMode && config.launcher?.zIndex != null
        ? `z-index: ${config.launcher.zIndex} !important;`
        : '';
      wrapper.style.cssText += maxHeightStyles + paddingStyles + zIndexStyles;
    }
  };
  applyFullHeightStyles();
  // Apply theme variables after applyFullHeightStyles since it resets mount.style.cssText
  applyThemeVariables(mount, config);
  applyArtifactLayoutCssVars(mount, config);
  applyArtifactPaneAppearance(mount, config);

  const destroyCallbacks: Array<() => void> = [];

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

  const suggestionsManager = createSuggestions(suggestions);
  let closeHandler: (() => void) | null = null;
  let session: AgentWidgetSession;
  let isStreaming = false;
  const messageCache = createMessageCache();
  let configVersion = 0;
  let shouldAutoScroll = true;
  let lastScrollTop = 0;
  let lastAutoScrollTime = 0;
  let scrollRAF: number | null = null;
  let isAutoScrollBlocked = false;
  let blockUntilTime = 0;
  let isAutoScrolling = false;

  const AUTO_SCROLL_THROTTLE = 125;
  const AUTO_SCROLL_BLOCK_TIME = 2000;
  const USER_SCROLL_THRESHOLD = 5;
  const BOTTOM_THRESHOLD = 50;
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
      metadata: persistentMetadata
    };
    try {
      const result = storageAdapter.save(payload);
      if (result instanceof Promise) {
        result.catch((error) => {
          if (typeof console !== "undefined") {
            // eslint-disable-next-line no-console
            console.error("[AgentWidget] Failed to persist state:", error);
          }
        });
      }
    } catch (error) {
      if (typeof console !== "undefined") {
        // eslint-disable-next-line no-console
        console.error("[AgentWidget] Failed to persist state:", error);
      }
    }
  }

  const scheduleAutoScroll = (force = false) => {
    if (!shouldAutoScroll) return;

    const now = Date.now();

    if (isAutoScrollBlocked && now < blockUntilTime) {
      if (!force) return;
    }

    if (isAutoScrollBlocked && now >= blockUntilTime) {
      isAutoScrollBlocked = false;
    }

    if (!force && !isStreaming) return;

    if (now - lastAutoScrollTime < AUTO_SCROLL_THROTTLE) return;
    lastAutoScrollTime = now;

    if (scrollRAF) {
      cancelAnimationFrame(scrollRAF);
    }

    scrollRAF = requestAnimationFrame(() => {
      if (isAutoScrollBlocked || !shouldAutoScroll) return;
      isAutoScrolling = true;
      body.scrollTop = body.scrollHeight;
      lastScrollTop = body.scrollTop;
      requestAnimationFrame(() => {
        isAutoScrolling = false;
      });
      scrollRAF = null;
    });
  };

  // Track ongoing smooth scroll animation
  let smoothScrollRAF: number | null = null;

  // Get the scrollable container using its unique ID
  const getScrollableContainer = (): HTMLElement => {
    // Use the unique ID for reliable selection
    const scrollable = wrapper.querySelector('#persona-scroll-container') as HTMLElement;
    // Fallback to body if ID not found (shouldn't happen, but safe fallback)
    return scrollable || body;
  };

  // Custom smooth scroll animation with easing
  const smoothScrollToBottom = (element: HTMLElement, duration = 500) => {
    const start = element.scrollTop;
    const clientHeight = element.clientHeight;
    // Recalculate target dynamically to handle layout changes
    let target = element.scrollHeight;
    let distance = target - start;

    // Check if already at bottom: scrollTop + clientHeight should be >= scrollHeight
    // Add a small threshold (2px) to account for rounding/subpixel differences
    const isAtBottom = start + clientHeight >= target - 2;
    
    // If already at bottom or very close, skip animation to prevent glitch
    if (isAtBottom || Math.abs(distance) < 5) {
      return;
    }

    // Cancel any ongoing smooth scroll animation
    if (smoothScrollRAF !== null) {
      cancelAnimationFrame(smoothScrollRAF);
      smoothScrollRAF = null;
    }

    const startTime = performance.now();

    // Easing function: ease-out cubic for smooth deceleration
    const easeOutCubic = (t: number): number => {
      return 1 - Math.pow(1 - t, 3);
    };

    const animate = (currentTime: number) => {
      // Recalculate target each frame in case scrollHeight changed
      const currentTarget = element.scrollHeight;
      if (currentTarget !== target) {
        target = currentTarget;
        distance = target - start;
      }

      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      
      const currentScroll = start + distance * eased;
      element.scrollTop = currentScroll;

      if (progress < 1) {
        smoothScrollRAF = requestAnimationFrame(animate);
      } else {
        // Ensure we end exactly at the target
        element.scrollTop = element.scrollHeight;
        smoothScrollRAF = null;
      }
    };

    smoothScrollRAF = requestAnimationFrame(animate);
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

    // Track active message IDs for cache pruning
    const activeMessageIds = new Set<string>();

    messages.forEach((message) => {
      activeMessageIds.add(message.id);

      // Fingerprint cache: skip re-rendering unchanged messages
      const fingerprint = computeMessageFingerprint(message, configVersion);
      const cachedWrapper = getCachedWrapper(messageCache, message.id, fingerprint);
      if (cachedWrapper) {
        tempContainer.appendChild(cachedWrapper.cloneNode(true));
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
        if (message.variant === "approval" && p.renderApproval) {
          return true;
        }
        if (!message.variant && p.renderMessage) {
          return true;
        }
        return false;
      });

      // Get message layout config
      const messageLayoutConfig = config.layout?.messages;

      if (matchingPlugin) {
        if (message.variant === "reasoning" && message.reasoning && matchingPlugin.renderReasoning) {
          if (!showReasoning) return;
          bubble = matchingPlugin.renderReasoning({
            message,
            defaultRenderer: () => createReasoningBubble(message),
            config
          });
        } else if (message.variant === "tool" && message.toolCall && matchingPlugin.renderToolCall) {
          if (!showToolCalls) return;
          bubble = matchingPlugin.renderToolCall({
            message,
            defaultRenderer: () => createToolBubble(message, config),
            config
          });
        } else if (message.variant === "approval" && message.approval && matchingPlugin.renderApproval) {
          if (config.approval === false) return;
          bubble = matchingPlugin.renderApproval({
            message,
            defaultRenderer: () => createApprovalBubble(message, config),
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

      // Check for component directive if no plugin handled it
      if (!bubble && message.role === "assistant" && !message.variant) {
        const enableComponentStreaming = config.enableComponentStreaming !== false; // Default to true
        if (enableComponentStreaming && hasComponentDirective(message)) {
          const directive = extractComponentDirectiveFromMessage(message);
          if (directive) {
            const componentBubble = renderComponentDirective(directive, {
              config,
              message,
              transform
            });
            if (componentBubble) {
              const wrapChrome = config.wrapComponentDirectiveInBubble !== false;
              if (wrapChrome) {
                const componentWrapper = document.createElement("div");
                componentWrapper.className = [
                  "vanilla-message-bubble",
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
                bubble = componentWrapper;
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
                bubble = stack;
              }
            }
          }
        }
      }

      // Fallback to default rendering if plugin returned null or no plugin matched
      if (!bubble) {
        if (message.variant === "reasoning" && message.reasoning) {
          if (!showReasoning) return;
          bubble = createReasoningBubble(message);
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
    // Approval-variant messages are UI controls, not content — exclude them so the typing
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
        typingBubble.setAttribute("data-typing-indicator", "true");

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
    // Defer scroll to next frame for smoother animation and to prevent jolt
    // This allows the browser to update layout (e.g., typing indicator removal) before scrolling
    // Use double RAF to ensure layout has fully settled before starting scroll animation
    // Get the scrollable container using its unique ID (#persona-scroll-container)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const scrollableContainer = getScrollableContainer();
        smoothScrollToBottom(scrollableContainer);
      });
    });
  };

  // Alias for clarity - the implementation handles flicker prevention via typing indicator logic
  const renderMessagesWithPlugins = renderMessagesWithPluginsImpl;

  const updateOpenState = () => {
    if (!launcherEnabled) return;
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
      // Show launcher when closed, except docked mode (0px column — use controller.open()).
      if (launcherButtonInstance) {
        launcherButtonInstance.element.style.display = dockedMode ? "none" : "";
      } else if (customLauncherElement) {
        customLauncherElement.style.display = dockedMode ? "none" : "";
      }
    }
  };

  const setOpenState = (nextOpen: boolean, source: "user" | "auto" | "api" | "system" = "user") => {
    if (!launcherEnabled) return;
    if (open === nextOpen) return;
    
    const prevOpen = open;
    open = nextOpen;
    updateOpenState();
    
    if (open) {
      recalcPanelHeight();
      scheduleAutoScroll(true);
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
    // Keep textarea always enabled so users can type while streaming
    // Only disable submit controls to prevent sending during streaming
    sendButton.disabled = disabled;
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

    // Only update send button text if NOT using icon mode
    const useIcon = config.sendButton?.useIcon ?? false;
    if (!useIcon) {
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

  session = new AgentWidgetSession(config, {
    onMessagesChanged(messages) {
      renderMessagesWithPlugins(messagesWrapper, messages, postprocess);
      // Re-render suggestions to hide them after first user message
      // Pass messages directly to avoid calling session.getMessages() during construction
      if (session) {
        const hasUserMessage = messages.some((msg) => msg.role === "user");
        if (hasUserMessage) {
          // Hide suggestions if user message exists
          suggestionsManager.render([], session, textarea, messages);
        } else {
          // Show suggestions if no user message yet
          suggestionsManager.render(config.suggestionChips, session, textarea, messages, config.suggestionChipsConfig);
        }
      }
      scheduleAutoScroll(!isStreaming);
      trackMessages(messages);

      const lastUserMessage = [...messages]
        .reverse()
        .find((msg) => msg.role === "user");

      // Emit user:message event when a new user message is detected
      const prevLastUserMessageId = voiceState.lastUserMessageId;
      if (lastUserMessage && lastUserMessage.id !== prevLastUserMessageId) {
        voiceState.lastUserMessageId = lastUserMessage.id;
        eventBus.emit("user:message", lastUserMessage);
      }

      voiceState.lastUserMessageWasVoice = Boolean(lastUserMessage?.viaVoice);
      persistState(messages);
    },
    onStatusChanged(status) {
      const currentStatusConfig = config.statusIndicator ?? {};
      const getCurrentStatusText = (status: AgentWidgetSessionStatus): string => {
        if (status === "idle") return currentStatusConfig.idleText ?? statusCopy.idle;
        if (status === "connecting") return currentStatusConfig.connectingText ?? statusCopy.connecting;
        if (status === "connected") return currentStatusConfig.connectedText ?? statusCopy.connected;
        if (status === "error") return currentStatusConfig.errorText ?? statusCopy.error;
        return statusCopy[status];
      };
      statusText.textContent = getCurrentStatusText(status);
    },
    onStreamingChanged(streaming) {
      isStreaming = streaming;
      setComposerDisabled(streaming);
      // Re-render messages to show/hide typing indicator
      if (session) {
        renderMessagesWithPlugins(messagesWrapper, session.getMessages(), postprocess);
      }
      if (!streaming) {
        scheduleAutoScroll(true);
      }
    },
    onVoiceStatusChanged(status: VoiceStatus) {
      if (config.voiceRecognition?.provider?.type !== 'runtype') return;

      switch (status) {
        case 'listening':
          // Recording styles are applied by toggleVoice() / startVoiceRecognition() flows
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
            // Barge-in mic is still hot between turns — show it as active
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
      syncArtifactPane();
    }
  });

  sessionRef.current = session;

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

  // Wire up event stream buffer to capture SSE events
  if (eventStreamBuffer) {
    session.setSSEEventCallback((type: string, payload: unknown) => {
      eventStreamBuffer?.push({
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        timestamp: Date.now(),
        payload: JSON.stringify(payload)
      });
    });
  }

  if (pendingStoredState) {
    pendingStoredState
      .then((state) => {
        if (!state) return;
        if (state.metadata) {
          persistentMetadata = ensureRecord(state.metadata);
          actionManager.syncFromMetadata();
        }
        if (state.messages?.length) {
          session.hydrateMessages(state.messages);
        }
      })
      .catch((error) => {
        if (typeof console !== "undefined") {
          // eslint-disable-next-line no-console
          console.error("[AgentWidget] Failed to hydrate stored state:", error);
        }
      });
  }

  const handleSubmit = (event: Event) => {
    event.preventDefault();
    const value = textarea.value.trim();
    const hasAttachments = attachmentManager?.hasAttachments() ?? false;

    // Must have text or attachments to send
    if (!value && !hasAttachments) return;

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

    // Send message with optional content parts
    session.sendMessage(value, { contentParts });

    // Clear attachments after sending
    if (hasAttachments) {
      attachmentManager!.clearAttachments();
    }
  };

  const handleInputEnter = (event: KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendButton.click();
    }
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

        // Apply recording state styles from config
        const recordingBackgroundColor = voiceConfig.recordingBackgroundColor ?? "#ef4444";
        const recordingIconColor = voiceConfig.recordingIconColor;
        const recordingBorderColor = voiceConfig.recordingBorderColor;
        
        micButton.classList.add("persona-voice-recording");
        micButton.style.backgroundColor = recordingBackgroundColor;
        
        if (recordingIconColor) {
          micButton.style.color = recordingIconColor;
          // Update SVG stroke color if present
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
    const hasVoiceInput = hasSpeechRecognition || hasRuntypeProvider;

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
    
    // Use Lucide mic icon with configured color (stroke width 1.5 for minimalist outline style)
    const iconColorValue = iconColor || "currentColor";
    const micIconSvg = renderLucideIcon(micIconName, micIconSizeNum, iconColorValue, 1.5);
    if (micIconSvg) {
      micButton.appendChild(micIconSvg);
      micButton.style.color = iconColorValue;
    } else {
      // Fallback to text if icon fails
      micButton.textContent = "🎤";
      micButton.style.color = iconColorValue;
    }
    
    // Apply background color
    if (backgroundColor) {
      micButton.style.backgroundColor = backgroundColor;
    } else {
      micButton.classList.add("persona-bg-persona-primary");
    }
    
    // Apply icon/text color
    if (iconColor) {
      micButton.style.color = iconColor;
    } else if (!iconColor && !sendButtonConfig?.textColor) {
      micButton.classList.add("persona-text-white");
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
    const recordingBackgroundColor = voiceConfig.recordingBackgroundColor ?? "#ef4444";
    const recordingIconColor = voiceConfig.recordingIconColor;
    const recordingBorderColor = voiceConfig.recordingBorderColor;
    removeAllVoiceStateClasses();
    micButton.classList.add("persona-voice-recording");
    micButton.style.backgroundColor = recordingBackgroundColor;
    if (recordingIconColor) {
      micButton.style.color = recordingIconColor;
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
      ?? (interruptionMode === "barge-in" ? (voiceConfig.recordingBackgroundColor ?? "#ef4444") : (originalMicStyles?.backgroundColor ?? ""));
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
  let launcherButtonInstance: ReturnType<typeof createLauncherButton> | null = null;
  let customLauncherElement: HTMLElement | null = null;
  
  if (launcherEnabled) {
    const launcherPlugin = plugins.find(p => p.renderLauncher);
    if (launcherPlugin?.renderLauncher) {
      const customLauncher = launcherPlugin.renderLauncher({
        config,
        defaultRenderer: () => {
          const btn = createLauncherButton(config, toggleOpen);
          return btn.element;
        },
        onToggle: toggleOpen
      });
      if (customLauncher) {
        customLauncherElement = customLauncher;
      }
    }
    
    // Use custom launcher if provided, otherwise use default
    if (!customLauncherElement) {
      launcherButtonInstance = createLauncherButton(config, toggleOpen);
    }
  }

  if (launcherButtonInstance) {
    mount.appendChild(launcherButtonInstance.element);
  } else if (customLauncherElement) {
    mount.appendChild(customLauncherElement);
  }
  updateOpenState();
  suggestionsManager.render(config.suggestionChips, session, textarea, undefined, config.suggestionChipsConfig);
  updateCopy();
  setComposerDisabled(session.isStreaming());
  scheduleAutoScroll(true);
  maybeRestoreVoiceFromMetadata();

  if (autoFocusInput) {
    if (!launcherEnabled) {
      setTimeout(() => maybeFocusInput(), 0);
    } else if (open) {
      setTimeout(() => maybeFocusInput(), 200);
    }
  }

  const recalcPanelHeight = () => {
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

      // Exiting mobile fullscreen (e.g., orientation change to landscape) — reset all styles
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
        const width = launcherWidth ?? "min(400px, calc(100vw - 24px))";
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
      updateOpenState();
    }
  };

  recalcPanelHeight();
  const ownerWindow = mount.ownerDocument.defaultView ?? window;
  ownerWindow.addEventListener("resize", recalcPanelHeight);
  destroyCallbacks.push(() => ownerWindow.removeEventListener("resize", recalcPanelHeight));

  lastScrollTop = body.scrollTop;

  const handleScroll = () => {
    const scrollTop = body.scrollTop;
    const scrollHeight = body.scrollHeight;
    const clientHeight = body.clientHeight;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const delta = Math.abs(scrollTop - lastScrollTop);
    lastScrollTop = scrollTop;

    if (isAutoScrolling) return;
    if (delta <= USER_SCROLL_THRESHOLD) return;

    if (!shouldAutoScroll && distanceFromBottom < BOTTOM_THRESHOLD) {
      isAutoScrollBlocked = false;
      shouldAutoScroll = true;
      return;
    }

    if (shouldAutoScroll && distanceFromBottom > BOTTOM_THRESHOLD) {
      isAutoScrollBlocked = true;
      blockUntilTime = Date.now() + AUTO_SCROLL_BLOCK_TIME;
      shouldAutoScroll = false;
    }
  };

  body.addEventListener("scroll", handleScroll, { passive: true });
  destroyCallbacks.push(() => body.removeEventListener("scroll", handleScroll));
  destroyCallbacks.push(() => {
    if (scrollRAF) cancelAnimationFrame(scrollRAF);
  });

  const refreshCloseButton = () => {
    if (!closeButton) return;
    if (closeHandler) {
      closeButton.removeEventListener("click", closeHandler);
      closeHandler = null;
    }
    if (launcherEnabled) {
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
        try {
          const result = storageAdapter.clear();
          if (result instanceof Promise) {
            result.catch((error) => {
              if (typeof console !== "undefined") {
                // eslint-disable-next-line no-console
                console.error("[AgentWidget] Failed to clear storage adapter:", error);
              }
            });
          }
        } catch (error) {
          if (typeof console !== "undefined") {
            // eslint-disable-next-line no-console
            console.error("[AgentWidget] Failed to clear storage adapter:", error);
          }
        }
      }
      persistentMetadata = {};
      actionManager.syncFromMetadata();

      // Clear event stream buffer and store
      eventStreamBuffer?.clear();
      eventStreamView?.update();
    });
  };

  setupClearChatButton();

  if (composerForm) {
    composerForm.addEventListener("submit", handleSubmit);
  }
  textarea?.addEventListener("keydown", handleInputEnter);
  textarea?.addEventListener("paste", handleInputPaste);

  destroyCallbacks.push(() => {
    if (composerForm) {
      composerForm.removeEventListener("submit", handleSubmit);
    }
    textarea?.removeEventListener("keydown", handleInputEnter);
    textarea?.removeEventListener("paste", handleInputPaste);
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
      const prevShowEventStreamToggle = showEventStreamToggle;
      showEventStreamToggle = config.features?.showEventStreamToggle ?? false;

      // Handle dynamic event stream feature flag toggling
      if (showEventStreamToggle && !prevShowEventStreamToggle) {
        // Flag changed from false to true - create buffer/store if needed
        if (!eventStreamBuffer) {
          eventStreamStore = new EventStreamStore(eventStreamDbName);
          eventStreamBuffer = new EventStreamBuffer(eventStreamMaxEvents, eventStreamStore);
          eventStreamStore.open().then(() => eventStreamBuffer?.restore()).catch(() => {});
          // Register the SSE event callback
          session.setSSEEventCallback((type: string, payload: unknown) => {
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
          const dynToggleBtnClasses = "persona-inline-flex persona-items-center persona-justify-center persona-rounded-full persona-text-persona-muted hover:persona-bg-gray-100 persona-cursor-pointer persona-border-none persona-bg-transparent persona-p-1" + (dynEsClassNames?.toggleButton ? " " + dynEsClassNames.toggleButton : "");
          eventStreamToggleBtn = createElement("button", dynToggleBtnClasses) as HTMLButtonElement;
          eventStreamToggleBtn.style.width = "28px";
          eventStreamToggleBtn.style.height = "28px";
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
        // Check for launcher plugin when re-enabling
        const launcherPlugin = plugins.find(p => p.renderLauncher);
        if (launcherPlugin?.renderLauncher) {
          const customLauncher = launcherPlugin.renderLauncher({
            config,
            defaultRenderer: () => {
              const btn = createLauncherButton(config, toggleOpen);
              return btn.element;
            },
            onToggle: toggleOpen
          });
          if (customLauncher) {
            customLauncherElement = customLauncher;
            mount.appendChild(customLauncherElement);
          }
        }
        if (!customLauncherElement) {
          launcherButtonInstance = createLauncherButton(config, toggleOpen);
          mount.appendChild(launcherButtonInstance.element);
        }
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
              showClose: launcherEnabled,
              onClose: () => setOpenState(false, "user")
            })
          : buildHeader({
              config,
              showClose: launcherEnabled,
              onClose: () => setOpenState(false, "user")
            });

        // Replace the old header with the new one
        header.replaceWith(newHeaderElements.header);

        // Update references
        header = newHeaderElements.header;
        iconHolder = newHeaderElements.iconHolder;
        headerTitle = newHeaderElements.headerTitle;
        headerSubtitle = newHeaderElements.headerSubtitle;
        closeButton = newHeaderElements.closeButton;

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
      const messagesConfigChanged = toolCallConfigChanged || messageActionsChanged || layoutMessagesChanged
        || loadingIndicatorChanged || iterationDisplayChanged;
      if (messagesConfigChanged && session) {
        configVersion++;
        renderMessagesWithPlugins(messagesWrapper, session.getMessages(), postprocess);
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
            // Use Lucide icon
            const iconSize = parseFloat(headerIconSize) || 24;
            const iconSvg = renderLucideIcon(headerIconName, iconSize * 0.6, "#ffffff", 2);
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

        // Clear existing content and render new icon
        closeButton.innerHTML = "";
        const iconSvg = renderLucideIcon(closeButtonIconName, "20px", "currentColor", 2);
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

          // When clear chat is hidden, close button needs ml-auto to stay right-aligned
          const { closeButtonWrapper } = panelElements;
          if (closeButtonWrapper && !closeButtonWrapper.classList.contains("persona-absolute")) {
            if (shouldShowClearChat) {
              closeButtonWrapper.classList.remove("persona-ml-auto");
            } else {
              closeButtonWrapper.classList.add("persona-ml-auto");
            }
          }

          // Update placement if changed
          const isTopRight = clearChatPlacement === "top-right";
          const currentlyTopRight = clearChatButtonWrapper.classList.contains("persona-absolute");

          if (isTopRight !== currentlyTopRight && shouldShowClearChat) {
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
          // Update size
          const clearChatSize = clearChatConfig.size ?? "32px";
          clearChatButton.style.height = clearChatSize;
          clearChatButton.style.width = clearChatSize;

          // Update icon
          const clearChatIconName = clearChatConfig.iconName ?? "refresh-cw";
          const clearChatIconColor = clearChatConfig.iconColor ?? "";

          clearChatButton.style.color =
            clearChatIconColor || HEADER_THEME_CSS.actionIconColor;

          // Clear existing icon and render new one
          clearChatButton.innerHTML = "";
          const iconSvg = renderLucideIcon(clearChatIconName, "20px", "currentColor", 2);
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
      suggestionsManager.render(config.suggestionChips, session, textarea, undefined, config.suggestionChipsConfig);
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
          
          // Update colors
          const backgroundColor = voiceConfig.backgroundColor ?? sendButtonConfig.backgroundColor;
          if (backgroundColor) {
            micButton.style.backgroundColor = backgroundColor;
            micButton.classList.remove("persona-bg-persona-primary");
          } else {
            micButton.style.backgroundColor = "";
            micButton.classList.add("persona-bg-persona-primary");
          }
          
          if (iconColor) {
            micButton.style.color = iconColor;
            micButton.classList.remove("persona-text-white");
          } else if (!iconColor && !sendButtonConfig.textColor) {
            micButton.style.color = "";
            micButton.classList.add("persona-text-white");
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
        
        // Use Lucide icon if iconName is provided, otherwise fall back to iconText
        if (iconName) {
          const iconSize = parseFloat(buttonSize) || 24;
          const iconColor = textColor && typeof textColor === 'string' && textColor.trim() ? textColor.trim() : "currentColor";
          const iconSvg = renderLucideIcon(iconName, iconSize, iconColor, 2);
          if (iconSvg) {
            sendButton.appendChild(iconSvg);
            sendButton.style.color = iconColor;
          } else {
            // Fallback to text if icon fails to render
            sendButton.textContent = iconText;
            if (textColor) {
              sendButton.style.color = textColor;
            } else {
              sendButton.classList.add("persona-text-white");
            }
          }
        } else {
          sendButton.textContent = iconText;
          if (textColor) {
            sendButton.style.color = textColor;
          } else {
            sendButton.classList.add("persona-text-white");
          }
        }
        
        // Update classes
        sendButton.className = "persona-rounded-button persona-flex persona-items-center persona-justify-center disabled:persona-opacity-50 persona-cursor-pointer";
        
        if (backgroundColor) {
          sendButton.style.backgroundColor = backgroundColor;
          sendButton.classList.remove("persona-bg-persona-primary");
        } else {
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
      
      // Update status indicator visibility and text
      const statusIndicatorConfig = config.statusIndicator ?? {};
      const isVisible = statusIndicatorConfig.visible ?? true;
      statusText.style.display = isVisible ? "" : "none";
      
      // Update status text if status is currently set
      if (session) {
        const currentStatus = session.getStatus();
        const getCurrentStatusText = (status: AgentWidgetSessionStatus): string => {
          if (status === "idle") return statusIndicatorConfig.idleText ?? statusCopy.idle;
          if (status === "connecting") return statusIndicatorConfig.connectingText ?? statusCopy.connecting;
          if (status === "connected") return statusIndicatorConfig.connectedText ?? statusCopy.connected;
          if (status === "error") return statusIndicatorConfig.errorText ?? statusCopy.error;
          return statusCopy[status];
        };
        statusText.textContent = getCurrentStatusText(currentStatus);
      }
    },
    open() {
      if (!launcherEnabled) return;
      setOpenState(true, "api");
    },
    close() {
      if (!launcherEnabled) return;
      setOpenState(false, "api");
    },
    toggle() {
      if (!launcherEnabled) return;
      setOpenState(!open, "api");
    },
    clearChat() {
      // Clear messages in session (this will trigger onMessagesChanged which re-renders)
      artifactsPaneUserHidden = false;
      session.clearMessages();
      messageCache.clear();

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
        try {
          const result = storageAdapter.clear();
          if (result instanceof Promise) {
            result.catch((error) => {
              if (typeof console !== "undefined") {
                // eslint-disable-next-line no-console
                console.error("[AgentWidget] Failed to clear storage adapter:", error);
              }
            });
          }
        } catch (error) {
          if (typeof console !== "undefined") {
            // eslint-disable-next-line no-console
            console.error("[AgentWidget] Failed to clear storage adapter:", error);
          }
        }
      }
      persistentMetadata = {};
      actionManager.syncFromMetadata();

      // Clear event stream buffer and store
      eventStreamBuffer?.clear();
      eventStreamView?.update();
    },
    setMessage(message: string): boolean {
      if (!textarea) return false;
      if (session.isStreaming()) return false;
      
      // Auto-open widget if closed and launcher is enabled
      if (!open && launcherEnabled) {
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
      
      // Auto-open widget if closed and launcher is enabled
      if (!open && launcherEnabled) {
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
        if (!open && launcherEnabled) setOpenState(true, "system");
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
      if (!open && launcherEnabled) setOpenState(true, "system");
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
      // Auto-open widget if closed and launcher is enabled
      if (!open && launcherEnabled) {
        setOpenState(true, "system");
      }
      return session.injectMessage(options);
    },
    injectAssistantMessage(options: InjectAssistantMessageOptions): AgentWidgetMessage {
      // Auto-open widget if closed and launcher is enabled
      if (!open && launcherEnabled) {
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
      // Auto-open widget if closed and launcher is enabled
      if (!open && launcherEnabled) {
        setOpenState(true, "system");
      }
      return session.injectUserMessage(options);
    },
    injectSystemMessage(options: InjectSystemMessageOptions): AgentWidgetMessage {
      // Auto-open widget if closed and launcher is enabled
      if (!open && launcherEnabled) {
        setOpenState(true, "system");
      }
      return session.injectSystemMessage(options);
    },
    injectMessageBatch(optionsList: InjectMessageOptions[]): AgentWidgetMessage[] {
      if (!open && launcherEnabled) {
        setOpenState(true, "system");
      }
      return session.injectMessageBatch(optionsList);
    },
    /** @deprecated Use injectMessage() instead */
    injectTestMessage(event: AgentWidgetEvent) {
      // Auto-open widget if closed and launcher is enabled
      if (!open && launcherEnabled) {
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
      // Programmatic adds should surface the pane even if the user previously hit Close.
      artifactsPaneUserHidden = false;
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
    focusInput(): boolean {
      if (launcherEnabled && !open) return false;
      if (!textarea) return false;
      textarea.focus();
      return true;
    },
    async resolveApproval(approvalId: string, decision: 'approved' | 'denied'): Promise<void> {
      const messages = session.getMessages();
      const approvalMessage = messages.find(
        m => m.variant === "approval" && m.approval?.id === approvalId
      );
      if (!approvalMessage?.approval) {
        throw new Error(`Approval not found: ${approvalId}`);
      }
      return session.resolveApproval(approvalMessage.approval, decision);
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
      return launcherEnabled && open;
    },
    isVoiceActive(): boolean {
      return voiceState.active;
    },
    getState(): AgentWidgetStateSnapshot {
      return {
        open: launcherEnabled && open,
        launcherEnabled,
        voiceActive: voiceState.active,
        streaming: session.isStreaming()
      };
    },
    // Feedback methods (CSAT/NPS)
    showCSATFeedback(options?: Partial<CSATFeedbackOptions>) {
      // Auto-open widget if closed and launcher is enabled
      if (!open && launcherEnabled) {
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
      // Auto-open widget if closed and launcher is enabled
      if (!open && launcherEnabled) {
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
      destroyCallbacks.forEach((cb) => cb());
      wrapper.remove();
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
  
  if (persistConfig && launcherEnabled) {
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
  if (shouldOpenAfterStateLoaded && launcherEnabled) {
    setTimeout(() => { controller.open(); }, 0);
  }

  return controller;
};

export type AgentWidgetController = Controller;
