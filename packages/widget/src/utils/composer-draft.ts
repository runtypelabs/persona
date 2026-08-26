/**
 * Draft persistence.
 *
 * The draft rides the conversation storage payload, so the host-owned
 * `storageAdapter` keeps owning conversation scoping. Pure helpers only: the
 * debounce timer and the adapter live in ui.ts.
 *
 * No `File` objects and no upload credentials in v1: attachments are never part
 * of a persisted draft.
 */

import type {
  AgentWidgetContentSegment,
  AgentWidgetContextMentionRef,
  AgentWidgetStoredDraft,
  ComposerMode,
  ComposerQuote,
} from "../types";

export type DraftSource = {
  text: string;
  mentionRefs?: readonly AgentWidgetContextMentionRef[];
  contentSegments?: readonly AgentWidgetContentSegment[];
  selectedModelId?: string;
  activeModeIds?: readonly string[];
  quote?: ComposerQuote;
};

/**
 * Build the stored payload, or undefined when nothing is worth writing. A
 * whitespace-only text with no other state is not a draft.
 */
export function buildStoredDraft(
  source: DraftSource
): AgentWidgetStoredDraft | undefined {
  const text = source.text ?? "";
  const hasState =
    text.trim().length > 0 ||
    (source.mentionRefs?.length ?? 0) > 0 ||
    (source.activeModeIds?.length ?? 0) > 0 ||
    !!source.quote ||
    !!source.selectedModelId;
  if (!hasState) return undefined;
  return {
    text,
    ...(source.mentionRefs?.length ? { mentionRefs: [...source.mentionRefs] } : {}),
    ...(source.contentSegments?.length
      ? { contentSegments: [...source.contentSegments] }
      : {}),
    ...(source.selectedModelId ? { selectedModelId: source.selectedModelId } : {}),
    ...(source.activeModeIds?.length
      ? { activeModeIds: [...source.activeModeIds] }
      : {}),
    ...(source.quote ? { quote: { ...source.quote } } : {}),
  };
}

export type DraftRehydrateConfig = {
  /** Configured mention source ids; a ref whose source is gone degrades. */
  mentionSourceIds: readonly string[];
  /** Ids in `composer.models`; anything else is dropped. */
  modelIds: readonly string[];
  modes: readonly ComposerMode[];
};

/**
 * Filter a stored draft against the CURRENT config. Text always survives.
 * Mention tokens re-render only while their source id still exists; otherwise
 * the tokens degrade to the plain text already in `text` and the unresolved
 * structured context is omitted. A stale model id or mode id is dropped.
 */
export function rehydrateStoredDraft(
  draft: AgentWidgetStoredDraft | undefined,
  config: DraftRehydrateConfig
): AgentWidgetStoredDraft | undefined {
  if (!draft || typeof draft.text !== "string") return undefined;
  const sources = new Set(config.mentionSourceIds);
  const refs = (draft.mentionRefs ?? []).filter((ref) => sources.has(ref.sourceId));
  // Partial mention survival would re-render tokens against segments that no
  // longer line up, so mentions restore all-or-nothing.
  const mentionsIntact =
    refs.length === (draft.mentionRefs?.length ?? 0) && refs.length > 0;
  const modeIds = new Set(config.modes.map((mode) => mode.id));
  const activeModeIds = (draft.activeModeIds ?? []).filter((id) => modeIds.has(id));
  const selectedModelId =
    draft.selectedModelId && config.modelIds.includes(draft.selectedModelId)
      ? draft.selectedModelId
      : undefined;
  return {
    text: draft.text,
    ...(mentionsIntact ? { mentionRefs: refs } : {}),
    ...(mentionsIntact && draft.contentSegments?.length
      ? { contentSegments: draft.contentSegments }
      : {}),
    ...(selectedModelId ? { selectedModelId } : {}),
    ...(activeModeIds.length ? { activeModeIds } : {}),
    ...(draft.quote?.text ? { quote: draft.quote } : {}),
  };
}

export type DraftWriter = {
  /** Queue a write; repeated calls inside the window collapse into one. */
  schedule: () => void;
  /** Write now if one is queued (destroy, pagehide, send acceptance). */
  flush: () => void;
  /** Drop a queued write without performing it. */
  cancel: () => void;
  destroy: () => void;
};

/** Debounced writer around a host-supplied persist callback. */
export function createDraftWriter(options: {
  write: () => void;
  delay?: number;
}): DraftWriter {
  const delay = options.delay ?? 500;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  const cancel = (): void => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  return {
    schedule: () => {
      if (destroyed) return;
      cancel();
      timer = setTimeout(() => {
        timer = null;
        options.write();
      }, delay);
    },
    flush: () => {
      if (destroyed || timer === null) return;
      cancel();
      options.write();
    },
    cancel,
    destroy: () => {
      destroyed = true;
      cancel();
    },
  };
}
