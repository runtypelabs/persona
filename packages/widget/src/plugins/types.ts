import type { ResolvedWelcomeConfig } from "../welcome";
import type { AgentWidgetPluginStorage } from "../utils/plugin-storage";
import {
  AgentWidgetMessage,
  AgentWidgetConfig,
  AgentWidgetApprovalDecisionOptions,
  AskUserQuestionPayload,
  LoadingIndicatorRenderContext,
  IdleIndicatorRenderContext,
  EventStreamViewRenderContext,
  EventStreamRowRenderContext,
  EventStreamToolbarRenderContext,
  EventStreamPayloadRenderContext,
  AgentWidgetSuggestion,
  AgentWidgetResolvedSuggestion,
  AgentWidgetSuggestionSource,
  AgentWidgetSuggestionSurface,
  AgentWidgetSuggestionVariant,
  AgentWidgetWelcomeVariant,
  AgentWidgetRenderHistoryViewContext,
  AgentWidgetRenderHistoryHeaderContext,
  AgentWidgetRenderHistoryConversationContext,
  AgentWidgetRenderHistoryStateContext,
  AgentWidgetHistoryRailSection,
  AgentWidgetHistoryRenderActions,
  ResolvedHistoryPresentation
} from "../types";

export type AgentWidgetTransformSuggestionsContext = {
  /**
   * Fresh copy of the suggestions entering this plugin, already normalized:
   * shorthand strings expanded and the effective send/fill behavior resolved.
   */
  suggestions: AgentWidgetResolvedSuggestion[];
  surface: AgentWidgetSuggestionSurface;
  source: AgentWidgetSuggestionSource;
  config: AgentWidgetConfig;
};

export type AgentWidgetRenderSuggestionContext = {
  /** Fully normalized suggestion, including the effective send/fill behavior. */
  suggestion: AgentWidgetResolvedSuggestion;
  index: number;
  surface: AgentWidgetSuggestionSurface;
  source: AgentWidgetSuggestionSource;
  variant: AgentWidgetSuggestionVariant;
  streaming: boolean;
  config: AgentWidgetConfig;
  /** Build Persona's standard chip, card, or list item. */
  defaultRenderer: () => HTMLElement;
  /**
   * Run the normal selection pipeline: DOM event, plugin selection hooks, then
   * send or fill. Custom renderers should call this instead of sending directly.
   */
  select: () => void;
};

export type AgentWidgetRenderWelcomeContext = {
  /** Alias-resolved welcome config; never the raw `copy.welcome*` shape. */
  config: ResolvedWelcomeConfig;
  variant: AgentWidgetWelcomeVariant;
  /** Derived visibility for this render; governs the default renderer only. */
  visible: boolean;
  /** The core-owned welcome card, live-updated by `controller.update()`. */
  defaultRenderer: () => HTMLElement;
  sendMessage: (text: string) => void;
  /** Re-run welcome arbitration: cleanups run, previous content is removed. */
  requestRender: () => void;
  /**
   * Persona's starter renderer, wired through the full select pipeline:
   * `onSuggestionSelect`, cancelable `persona:suggestion:*` events, send/fill.
   */
  renderStarter: (suggestion: AgentWidgetSuggestion) => HTMLElement;
  /** Sync store namespaced by `persistState.keyPrefix` plus the plugin id. */
  storage: AgentWidgetPluginStorage;
  /** Teardown for this render; runs before the next one and on destroy. */
  onCleanup: (fn: () => void) => void;
};

/** Context for one `railSections` entry. Frozen per invocation. */
export type AgentWidgetRailSectionContext = {
  /** Current rail width state. The section re-renders whenever this flips. */
  collapsed: boolean;
  presentation: ResolvedHistoryPresentation;
  /** The same frozen action path the default rows and `renderHistoryView` use. */
  actions: AgentWidgetHistoryRenderActions;
};

/** A plugin-contributed navigation section in the history rail. */
export type AgentWidgetRailSection = {
  /** Stable identity, stamped as `data-persona-rail-section`. */
  id: string;
  /** Default `"above-conversations"`. */
  placement?: AgentWidgetHistoryRailSection["placement"];
  /** Optional heading, styled like a conversation date-group heading. */
  title?: string;
  /** Section body. Null renders nothing for the current state. */
  render: (context: AgentWidgetRailSectionContext) => Element | null;
};

export type AgentWidgetSuggestionSelectContext = {
  suggestion: AgentWidgetResolvedSuggestion;
  surface: AgentWidgetSuggestionSurface;
  source: AgentWidgetSuggestionSource;
  variant: AgentWidgetSuggestionVariant;
  config: AgentWidgetConfig;
};

/**
 * Plugin interface for customizing widget components
 */
export interface AgentWidgetPlugin {
  /**
   * Unique identifier for the plugin
   */
  id: string;

  /**
   * Optional priority (higher = runs first). Default: 0
   */
  priority?: number;

  /**
   * Transform, filter, enrich, or reorder suggestions. Hooks receive normalized
   * items and compose in plugin priority order; the return value may use the
   * loose shape (string shorthand included) and is re-normalized before the next
   * hook. A per-item `behavior` set here survives. `maxItems` caps the list
   * after the full chain. Return an empty array to hide the surface.
   */
  transformSuggestions?: (
    context: AgentWidgetTransformSuggestionsContext
  ) => AgentWidgetSuggestion[];

  /**
   * Render one starter or follow-up suggestion. Return null to use Persona's
   * default chip/card/list renderer. Call `select()` from custom interaction
   * controls to preserve events, selection hooks, and send/fill behavior.
   */
  renderSuggestion?: (
    context: AgentWidgetRenderSuggestionContext
  ) => HTMLElement | null;

  /**
   * Observe or intercept a suggestion selection. Return false to cancel the
   * built-in send/fill action. Hooks run in plugin priority order.
   */
  onSuggestionSelect?: (
    context: AgentWidgetSuggestionSelectContext
  ) => void | boolean;

  /**
   * Custom renderer for message bubbles
   * Return null to use default renderer
   */
  renderMessage?: (context: {
    message: AgentWidgetMessage;
    defaultRenderer: () => HTMLElement;
    config: AgentWidgetConfig;
  }) => HTMLElement | null;

  /**
   * Custom renderer for launcher button
   * Return null to use default renderer
   */
  renderLauncher?: (context: {
    config: AgentWidgetConfig;
    defaultRenderer: () => HTMLElement;
    onToggle: () => void;
  }) => HTMLElement | null;

  /**
   * Custom renderer for the welcome surface (card, hero, greeting stack).
   * First plugin returning an element wins; null falls through to the default,
   * same contract as `renderSuggestion`.
   *
   * The core owns the welcome host: it stays mounted for the panel's lifetime
   * and content is swapped inside it. A plugin element renders regardless of
   * `ctx.visible` (derived visibility governs the default renderer only) and
   * the host overlays the transcript while that element is active, so a home
   * screen can return over an existing conversation. Return null again to
   * clear the overlay.
   *
   * The ctx carries no controller: plugins are host-instantiated, so close a
   * factory over the init handle (`plugin.attach(controller)`).
   *
   * @example
   * ```typescript
   * renderWelcome: ({ config, renderStarter, requestRender, onCleanup }) => {
   *   const root = document.createElement("div");
   *   root.textContent = config.title;
   *   root.appendChild(renderStarter({ label: "Track my order" }));
   *   const timer = setInterval(requestRender, 60_000);
   *   onCleanup(() => clearInterval(timer));
   *   return root;
   * }
   * ```
   */
  renderWelcome?: (
    context: AgentWidgetRenderWelcomeContext
  ) => HTMLElement | null;

  /**
   * Custom renderer for panel header
   * Return null to use default renderer
   */
  renderHeader?: (context: {
    config: AgentWidgetConfig;
    defaultRenderer: () => HTMLElement;
    onClose?: () => void;
  }) => HTMLElement | null;

  /**
   * Custom renderer for composer/input area
   * Return null to use default renderer
   */
  renderComposer?: (context: {
    config: AgentWidgetConfig;
    defaultRenderer: () => HTMLElement;
    onSubmit: (text: string) => void;
    /**
     * When true, the assistant stream is active: same moment `session.isStreaming()` becomes true.
     * Prefer wiring controls to `data-persona-composer-disable-when-streaming` plus `setComposerDisabled`
     * in the host, or react to `footer.dataset.personaComposerStreaming === "true"`.
     */
    streaming: boolean;
    /**
     * Legacy alias: host disables the primary submit control while `streaming` is true.
     * @deprecated Use `streaming` for new plugins.
     */
    disabled: boolean;
    /** Opens the hidden file input when `config.attachments.enabled` is true (no-op otherwise). */
    openAttachmentPicker: () => void;
    /** From `config.composer.models` */
    models?: Array<{ id: string; label: string }>;
    /** From `config.composer.selectedModelId` */
    selectedModelId?: string;
    /** Updates `config.composer.selectedModelId` for the running widget instance. */
    onModelChange?: (modelId: string) => void;
    /**
     * Same behavior as the built-in mic when voice is enabled.
     * Omitted when `config.voiceRecognition.enabled` is not true.
     */
    onVoiceToggle?: () => void;
    /**
     * Re-run composer arbitration and swap the footer in place. The hook runs
     * once at panel construction, so this is how a composer plugin unlocks
     * (returns null) or re-renders later. Pending attachments, the mention
     * affordances, and the composer listener registry are re-wired by the core.
     */
    requestRender: () => void;
    /** Same sync store as the `renderWelcome` ctx, namespaced per plugin id. */
    storage: AgentWidgetPluginStorage;
  }) => HTMLElement | null;

  /**
   * Custom renderer for reasoning bubbles
   * Return null to use default renderer
   */
  renderReasoning?: (context: {
    message: AgentWidgetMessage;
    defaultRenderer: () => HTMLElement;
    config: AgentWidgetConfig;
  }) => HTMLElement | null;

  /**
   * Custom renderer for tool call bubbles
   * Return null to use default renderer
   */
  renderToolCall?: (context: {
    message: AgentWidgetMessage;
    defaultRenderer: () => HTMLElement;
    config: AgentWidgetConfig;
  }) => HTMLElement | null;

  /**
   * Custom renderer for `ask_user_question` tool calls.
   *
   * When a plugin returns an `HTMLElement`, it is inserted into the transcript
   * in place of the default (which is no transcript bubble: the built-in
   * renders a sheet over the composer). The built-in composer-overlay sheet
   * is suppressed so the plugin's UI fully owns the interaction.
   *
   * Return `null` to fall through to the built-in overlay sheet.
   *
   * The context gives you a pre-parsed `payload` (may be partial while the
   * tool call is still streaming: check `complete`) and two callbacks:
   * `resolve(answer)` resumes the paused LOCAL tool with the user's answer,
   * and `dismiss()` cancels with the sentinel `"(dismissed)"`.
   *
   * @example
   * ```typescript
   * renderAskUserQuestion: ({ payload, resolve, dismiss }) => {
   *   const prompt = payload.questions?.[0];
   *   if (!prompt) return null;
   *   const root = document.createElement("div");
   *   root.textContent = prompt.question ?? "";
   *   (prompt.options ?? []).forEach((option) => {
   *     const btn = document.createElement("button");
   *     btn.textContent = option.label;
   *     btn.addEventListener("click", () => resolve(option.label));
   *     root.appendChild(btn);
   *   });
   *   return root;
   * }
   * ```
   */
  renderAskUserQuestion?: (context: {
    message: AgentWidgetMessage;
    /**
     * Parsed `{ questions: [...] }` payload. May be partial while the tool
     * call is still streaming; see `complete`. `null` when no payload has
     * arrived yet.
     */
    payload: Partial<AskUserQuestionPayload> | null;
    /** `true` once the tool-call args have fully streamed in. */
    complete: boolean;
    /**
     * Resume the paused LOCAL tool with the user's answer. Posts to the
     * resume endpoint, pipes the SSE stream back into the session, and
     * appends a user-visible answer bubble to the transcript.
     */
    resolve: (answer: string) => void;
    /**
     * Cancel the question. Resumes with the sentinel `"(dismissed)"` so the
     * server doesn't sit in `waiting_for_local` forever. Idempotent.
     */
    dismiss: () => void;
    config: AgentWidgetConfig;
  }) => HTMLElement | null;

  /**
   * Custom renderer for approval bubbles.
   *
   * Return an `HTMLElement` to fully own the approval UI, `defaultRenderer()`
   * to render (or wrap) the built-in bubble, or `null` to fall through to the
   * default. Unlike the built-in bubble: whose Approve/Deny buttons are wired
   * via delegation: a fully custom element resolves the approval by calling
   * the `approve`/`deny` callbacks. Both route through the same path the
   * built-in buttons use (optimistic update, `onDecision`, in-place anchoring).
   *
   * An approval is a single binary gate, so there are exactly two outcomes.
   * Pass `{ remember: true }` to flag a "remember this" affordance (e.g. an
   * "Always allow" button); the current approval resolves identically, but the
   * flag is forwarded to `config.approval.onDecision` so you can persist a
   * don't-ask-again policy for future approvals.
   *
   * `renderApproval` is called again whenever the approval's status changes, so
   * branch on `message.approval?.status` to render the resolved state (and tear
   * down any global listeners you added while pending).
   *
   * @example
   * ```typescript
   * // An alternative prompt: "Always allow" / "Allow once" / "Deny".
   * renderApproval: ({ message, approve, deny }) => {
   *   const approval = message.approval;
   *   if (!approval || approval.status !== "pending") return null; // default renders resolved state
   *   const root = document.createElement("div");
   *   root.textContent = `${approval.toolName} requires approval`;
   *
   *   const always = document.createElement("button");
   *   always.textContent = "Always allow";
   *   always.addEventListener("click", () => approve({ remember: true }));
   *
   *   const once = document.createElement("button");
   *   once.textContent = "Allow once";
   *   once.addEventListener("click", () => approve());
   *
   *   const no = document.createElement("button");
   *   no.textContent = "Deny";
   *   no.addEventListener("click", () => deny());
   *
   *   root.append(always, once, no);
   *   return root;
   * }
   * ```
   */
  renderApproval?: (context: {
    message: AgentWidgetMessage;
    defaultRenderer: () => HTMLElement;
    config: AgentWidgetConfig;
    /** Resolve this approval as approved. Pass `{ remember: true }` for an "Always allow" affordance. */
    approve: (options?: AgentWidgetApprovalDecisionOptions) => void;
    /** Resolve this approval as denied. Pass `{ remember: true }` for an "Always deny" affordance. */
    deny: (options?: AgentWidgetApprovalDecisionOptions) => void;
  }) => HTMLElement | null;

  /**
   * Custom renderer for loading indicator
   * Return null to use default renderer (or config-based renderer)
   *
   * @example
   * ```typescript
   * renderLoadingIndicator: ({ location, defaultRenderer }) => {
   *   if (location === 'standalone') {
   *     const el = document.createElement('div');
   *     el.textContent = 'Thinking...';
   *     return el;
   *   }
   *   return defaultRenderer();
   * }
   * ```
   */
  renderLoadingIndicator?: (context: LoadingIndicatorRenderContext) => HTMLElement | null;

  /**
   * Custom renderer for idle state indicator.
   * Called when the widget is idle (not streaming) and has at least one message.
   * Return an HTMLElement to display, or null to hide (default).
   *
   * @example
   * ```typescript
   * renderIdleIndicator: ({ lastMessage, messageCount }) => {
   *   if (messageCount === 0) return null;
   *   if (lastMessage?.role !== 'assistant') return null;
   *   const el = document.createElement('div');
   *   el.className = 'idle-pulse';
   *   el.setAttribute('data-preserve-animation', 'true');
   *   return el;
   * }
   * ```
   */
  renderIdleIndicator?: (context: IdleIndicatorRenderContext) => HTMLElement | null;

  /**
   * Custom renderer for the entire event stream view.
   * Return null to use default renderer.
   */
  renderEventStreamView?: (context: EventStreamViewRenderContext) => HTMLElement | null;

  /**
   * Custom renderer for individual event stream rows.
   * Return null to use default renderer.
   */
  renderEventStreamRow?: (context: EventStreamRowRenderContext) => HTMLElement | null;

  /**
   * Custom renderer for the event stream toolbar/header bar.
   * Return null to use default renderer.
   */
  renderEventStreamToolbar?: (context: EventStreamToolbarRenderContext) => HTMLElement | null;

  /**
   * Custom renderer for the expanded event payload display.
   * Return null to use default renderer.
   */
  renderEventStreamPayload?: (context: EventStreamPayloadRenderContext) => HTMLElement | null;

  /**
   * Replace the complete history ("Messages") navigation contents in either
   * host. Plugins run by priority and the first non-null element wins; null
   * falls through to the default full view, which then applies the first
   * non-null header/row/state hook at each slot.
   *
   * Calling `defaultRenderer()` bypasses this hook only: the default view is
   * built and its lower-level slots still arbitrate, including this plugin's.
   * Return it (or an element containing it) to compose rather than replace.
   *
   * The hook replaces contents, not orchestration. Persona keeps placement,
   * open/close, responsive rail <-> panel movement, inertness, Escape, the
   * confirmation dialogs, live announcements, and focus fallback. Fetch nothing
   * directly: `actions.refresh()` is the only way to reload the list.
   *
   * @example
   * ```typescript
   * renderHistoryView: ({ conversations, actions, presentation, onCleanup }) => {
   *   const rail = document.createElement("nav");
   *   rail.dataset.presentation = presentation;
   *   for (const conversation of conversations) {
   *     const row = document.createElement("button");
   *     row.textContent = conversation.title;
   *     row.addEventListener("click", () => void actions.openConversation(conversation.id));
   *     rail.appendChild(row);
   *   }
   *   const timer = setInterval(() => void actions.refresh(), 60_000);
   *   onCleanup(() => clearInterval(timer));
   *   return rail;
   * }
   * ```
   */
  renderHistoryView?: (
    context: AgentWidgetRenderHistoryViewContext
  ) => HTMLElement | null;

  /**
   * Replace the standard Messages header while retaining its list/state UI.
   * Return null to use the default top bar. A custom header may not remove the
   * keyboard close path or falsify the resolved open state.
   */
  renderHistoryHeader?: (
    context: AgentWidgetRenderHistoryHeaderContext
  ) => HTMLElement | null;

  /**
   * Replace one conversation row while retaining standard paging/grouping.
   * Return null to use the default row.
   */
  renderHistoryConversation?: (
    context: AgentWidgetRenderHistoryConversationContext
  ) => HTMLElement | null;

  /**
   * Replace loading, empty, error, authentication, rate-limit, or recovery
   * content in the list region. Return null to use the default block.
   */
  renderHistoryState?: (
    context: AgentWidgetRenderHistoryStateContext
  ) => HTMLElement | null;

  /**
   * Contribute navigation sections to the history rail, stacked around the
   * conversation list in `placement` order. Rail only: the panel presentation
   * renders none of them, and `features.history.rail.sections` (config) comes
   * first inside each bucket, then plugins in plugin order.
   *
   * `render` is re-invoked with the new `collapsed` value whenever the rail
   * collapses or expands, and its return replaces the previous content;
   * returning null renders nothing for that state. A throwing `render` warns
   * once and drops that section only, leaving the rest of the rail alone. An id
   * a config section already owns is dropped with a warning.
   *
   * Keep heavy UI in the host bundle: `render` may return a skeleton and
   * hydrate it after the host's own dynamic import resolves.
   *
   * @example
   * ```typescript
   * railSections: [
   *   {
   *     id: "pinned",
   *     title: "Pinned",
   *     render: ({ collapsed, actions }) => {
   *       if (collapsed) return null;
   *       const list = document.createElement("div");
   *       const row = document.createElement("button");
   *       row.textContent = "Weekly report";
   *       row.addEventListener("click", () => void actions.openConversation("c1"));
   *       list.appendChild(row);
   *       return list;
   *     }
   *   }
   * ]
   * ```
   */
  railSections?: AgentWidgetRailSection[];

  /**
   * Called when plugin is registered
   */
  onRegister?: () => void;

  /**
   * Called when plugin is unregistered
   */
  onUnregister?: () => void;
}






