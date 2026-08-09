/**
 * Composer state store.
 *
 * One internal mutable record behind a frozen public `ComposerState` view.
 * Text, attachments, mentions, and
 * phase live here instead of being re-read from the DOM at each call site, so
 * submission, rebuilds, and future contributions all observe one source of
 * truth.
 *
 * Notifications coalesce on a microtask: keystroke-rate `setText` calls collapse
 * into a single subscriber/DOM-event fan-out.
 */

import type {
  AgentWidgetContextMentionRef,
  ComposerAttachmentState,
  ComposerPhase,
  ComposerQuote,
  ComposerState,
  ComposerSubmissionSnapshot,
} from "../types";

export type ComposerStateListener = (state: Readonly<ComposerState>) => void;

export interface ComposerStore {
  /** Frozen snapshot; mutating it can never reach the store. */
  getState: () => Readonly<ComposerState>;
  subscribe: (listener: ComposerStateListener) => () => void;
  setText: (text: string) => void;
  setAttachments: (attachments: readonly ComposerAttachmentState[]) => void;
  setMentionRefs: (refs: readonly AgentWidgetContextMentionRef[]) => void;
  /** `composer.models` selection. Config is never written back. */
  setSelectedModelId: (modelId: string | undefined) => void;
  /** Ids of the toggled `composer.modes`, in configuration order. */
  setActiveModeIds: (ids: readonly string[]) => void;
  /** Quote/reply-to banner state. */
  setQuote: (quote: ComposerQuote | undefined) => void;
  /** The single `defer-one` pending submission; frozen before it lands here. */
  setPendingSubmission: (
    snapshot: Readonly<ComposerSubmissionSnapshot> | undefined
  ) => void;
  /** Phase is derived: preparing wins over streaming, both win over idle. */
  setPreparing: (preparing: boolean) => void;
  setStreaming: (streaming: boolean) => void;
  setInputDisabled: (disabled: boolean) => void;
  /** Config-level send lock. The reported state also folds in phase. */
  setSendDisabled: (disabled: boolean) => void;
  /** Emit any coalesced change immediately (destroy, tests). */
  flush: () => void;
  destroy: () => void;
}

type InternalState = {
  text: string;
  attachments: ComposerAttachmentState[];
  mentionRefs: AgentWidgetContextMentionRef[];
  selectedModelId?: string;
  activeModeIds: string[];
  quote?: ComposerQuote;
  pendingSubmission?: Readonly<ComposerSubmissionSnapshot>;
  preparing: boolean;
  streaming: boolean;
  inputDisabled: boolean;
  sendDisabled: boolean;
};

const sameRefs = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index]);

const sameAttachments = (
  a: readonly ComposerAttachmentState[],
  b: readonly ComposerAttachmentState[]
): boolean =>
  a.length === b.length &&
  a.every((item, index) => {
    const other = b[index];
    return (
      item.id === other.id &&
      item.name === other.name &&
      item.mimeType === other.mimeType &&
      item.size === other.size &&
      item.status === other.status &&
      item.progress === other.progress &&
      item.error === other.error
    );
  });

export function createComposerStore(): ComposerStore {
  const state: InternalState = {
    text: "",
    attachments: [],
    mentionRefs: [],
    selectedModelId: undefined,
    activeModeIds: [],
    quote: undefined,
    pendingSubmission: undefined,
    preparing: false,
    streaming: false,
    inputDisabled: false,
    sendDisabled: false,
  };

  const listeners = new Set<ComposerStateListener>();
  let view: Readonly<ComposerState> | null = null;
  let notifyScheduled = false;
  let destroyed = false;

  const phase = (): ComposerPhase => {
    if (state.preparing) return "preparing";
    if (state.streaming) return "streaming";
    return "idle";
  };

  const buildView = (): Readonly<ComposerState> => {
    const current = phase();
    return Object.freeze({
      text: state.text,
      attachments: Object.freeze(
        state.attachments.map((item) => Object.freeze({ ...item }))
      ),
      mentionRefs: Object.freeze([...state.mentionRefs]),
      selectedModelId: state.selectedModelId,
      activeModeIds: Object.freeze([...state.activeModeIds]),
      quote: state.quote ? Object.freeze({ ...state.quote }) : undefined,
      // Already frozen by the capture path; never re-copied, so identity is a
      // valid "same pending item" check for the header card.
      pendingSubmission: state.pendingSubmission,
      phase: current,
      inputDisabled: state.inputDisabled,
      // Effective state, not just the config flag: the input stays editable
      // while streaming or preparing, but submission does not.
      sendDisabled:
        current !== "idle" || state.sendDisabled || state.inputDisabled,
    }) as Readonly<ComposerState>;
  };

  const getState = (): Readonly<ComposerState> => {
    if (!view) view = buildView();
    return view;
  };

  const emit = (): void => {
    notifyScheduled = false;
    if (destroyed || listeners.size === 0) return;
    const snapshot = getState();
    for (const listener of [...listeners]) {
      try {
        listener(snapshot);
      } catch (error) {
        if (typeof console !== "undefined") {
          // eslint-disable-next-line no-console
          console.error("[AgentWidget] composer state listener failed:", error);
        }
      }
    }
  };

  const changed = (): void => {
    view = null;
    if (destroyed || notifyScheduled) return;
    notifyScheduled = true;
    queueMicrotask(emit);
  };

  return {
    getState,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setText: (text) => {
      if (state.text === text) return;
      state.text = text;
      changed();
    },
    setAttachments: (attachments) => {
      if (sameAttachments(state.attachments, attachments)) return;
      state.attachments = [...attachments];
      changed();
    },
    setMentionRefs: (refs) => {
      if (sameRefs(state.mentionRefs, refs)) return;
      state.mentionRefs = [...refs];
      changed();
    },
    setSelectedModelId: (modelId) => {
      if (state.selectedModelId === modelId) return;
      state.selectedModelId = modelId;
      changed();
    },
    setActiveModeIds: (ids) => {
      if (sameRefs(state.activeModeIds, ids)) return;
      state.activeModeIds = [...ids];
      changed();
    },
    setQuote: (quote) => {
      const current = state.quote;
      if (
        current?.text === quote?.text &&
        current?.messageId === quote?.messageId &&
        current?.sourceLabel === quote?.sourceLabel
      ) {
        return;
      }
      state.quote = quote ? { ...quote } : undefined;
      changed();
    },
    setPendingSubmission: (snapshot) => {
      if (state.pendingSubmission === snapshot) return;
      state.pendingSubmission = snapshot;
      changed();
    },
    setPreparing: (preparing) => {
      if (state.preparing === preparing) return;
      state.preparing = preparing;
      changed();
    },
    setStreaming: (streaming) => {
      if (state.streaming === streaming) return;
      state.streaming = streaming;
      changed();
    },
    setInputDisabled: (disabled) => {
      if (state.inputDisabled === disabled) return;
      state.inputDisabled = disabled;
      changed();
    },
    setSendDisabled: (disabled) => {
      if (state.sendDisabled === disabled) return;
      state.sendDisabled = disabled;
      changed();
    },
    flush: () => {
      if (notifyScheduled) emit();
    },
    destroy: () => {
      destroyed = true;
      notifyScheduled = false;
      listeners.clear();
    },
  };
}
