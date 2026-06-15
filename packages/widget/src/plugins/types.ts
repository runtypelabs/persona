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
  EventStreamPayloadRenderContext
} from "../types";

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
   * Called when plugin is registered
   */
  onRegister?: () => void;

  /**
   * Called when plugin is unregistered
   */
  onUnregister?: () => void;
}








