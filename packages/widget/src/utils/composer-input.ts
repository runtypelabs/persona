/**
 * The composer input surface the mention controller drives, abstracted over the
 * two editing modes:
 *
 *  - **chip mode** (`display: "chip"`, default): a plain `<textarea>`. Logical
 *    text is the raw value and logical caret is `selectionStart`.
 *  - **inline mode** (`display: "inline"`, Phase 4): a contenteditable surface
 *    whose atomic mention tokens collapse to a single `￼` in the logical text
 *    (see `composer-document.ts`). Its adapter additionally implements the
 *    optional document/token methods below.
 *
 * The controller only ever touches the composer through this capability, so the
 * same menu/keyboard/search engine serves both surfaces. `ComposerInputCapability`
 * is a superset of the public `AgentWidgetContextMentionComposerCapability`
 * (`getValue`/`setValue`/`submit`) — the single source of truth for composer
 * access — so a client `command:"action"` handler receives the same object.
 *
 * IMPORTANT (bundle guard): this module imports the document model TYPE-ONLY, so
 * the chip chunk (`context-mentions.js`) never pulls `composer-document.ts`
 * runtime. The contenteditable adapter, which does need it, lives in the separate
 * inline chunk. Keep it that way — see `context-mentions-bundle.test.ts`.
 */

import type { MentionTriggerMatch } from "./mention-trigger";
import type {
  ComposerDocument,
  ComposerMentionId
} from "./composer-document";
import type {
  AgentWidgetContextMentionComposerCapability,
  AgentWidgetContextMentionRef
} from "../types";

export interface ComposerInputCapability
  extends AgentWidgetContextMentionComposerCapability {
  /** The editable element — ARIA target for the menu, and focus receiver. */
  readonly element: HTMLElement;
  /** Text used for trigger parsing. Chip: `=== getValue()`; inline: text + `￼`. */
  getLogicalText: () => string;
  /** Caret/selection in LOGICAL coordinates. */
  getSelection: () => { start: number; end: number };
  /** Move the caret/selection (logical coordinates). */
  setSelection: (start: number, end?: number) => void;
  /** Replace the plain text and place the caret. No input event, no focus. */
  setValueWithCaret: (value: string, caret: number) => void;
  /** Fire input listeners after a programmatic edit. */
  dispatchInput: () => void;
  focus: () => void;

  /**
   * INLINE ONLY (contenteditable). Bounding rect (VIEWPORT coordinates) of the
   * LOGICAL character range `[start, end)`, or `null` when unmeasurable (invalid
   * range or a zero-size/degenerate rect). Used to trigger-anchor the mention menu
   * horizontally to the `@` glyph. Chip (textarea) adapters omit it — no cheap
   * per-glyph rect without a mirror-div hack, so the menu stays composer-anchored
   * (graceful degradation). Callers treat a missing method exactly like a `null`
   * result.
   */
  getLogicalRangeRect?: (start: number, end: number) => DOMRect | null;

  // ---- inline-only (contenteditable adapter); chip adapters omit these ----

  /** Canonical document (inline mode). */
  getDocument?: () => ComposerDocument;
  /** Render a document to the surface, optionally placing the logical caret. */
  setDocument?: (doc: ComposerDocument, caret?: number) => void;
  /**
   * INLINE ONLY. Replace the active trigger range (`match`, logical coordinates)
   * with an atomic mention token and place the caret after it. Returns the new
   * mention's id (resolve-tracking key), or `null` if the range no longer matches
   * the document (stale menu). Chip adapters leave this undefined — the controller
   * then falls back to `stripMentionQuery`.
   */
  insertMentionAtTrigger?: (
    ref: AgentWidgetContextMentionRef,
    match: MentionTriggerMatch
  ) => ComposerMentionId | null;
  /**
   * INLINE ONLY. Insert an atomic mention token at the current caret/selection
   * (picker path — the affordance button opens with no trigger char to replace).
   * Returns the new mention's id. Chip adapters leave this undefined.
   */
  insertMentionAtSelection?: (
    ref: AgentWidgetContextMentionRef
  ) => ComposerMentionId;
  /**
   * INLINE ONLY. Reflect a mention's resolve status on its live token element —
   * used to surface resolve errors inline. Toggles the error styling for `"error"`
   * and clears it otherwise. No-op for an unknown id. Chip adapters omit this.
   */
  setMentionStatus?: (
    id: ComposerMentionId,
    status: "pending" | "resolved" | "error"
  ) => void;
  /**
   * INLINE ONLY. Replace the LOGICAL range `[start, end)` with plain `text`,
   * preserving every mention token that lies outside the range, and place the
   * caret after the inserted text. This is the token-safe edit the controller
   * uses for query-strip / slash-completion / prompt-macro rewrites, since a plain
   * `getValue()` string-slice would misalign against DISPLAY text (`@Label`
   * expands a token to many chars) and re-rendering as one text block would
   * destroy every token. Chip adapters omit it — there DISPLAY === LOGICAL, so the
   * controller string-slices `getValue()` + `setValueWithCaret` instead.
   */
  replaceLogicalRange?: (start: number, end: number, text: string) => void;
}

/**
 * Submit the form that owns a composer element: prefer `requestSubmit()` (fires
 * native validation + a cancelable `submit`), falling back to a dispatched
 * cancelable `submit` event where `requestSubmit` is unavailable. Shared by both
 * composer adapters so submission behaves identically across editing modes.
 */
export function requestFormSubmit(form: HTMLFormElement | null | undefined): void {
  if (!form) return;
  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
  } else {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }
}

/**
 * Chip-mode adapter: a `ComposerInputCapability` backed by a raw `<textarea>`.
 * Logical text === value, logical caret === `selectionStart`. `submit()` derives
 * the composer form from `textarea.form` (falling back to a dispatched `submit`
 * event where `requestSubmit` is unavailable), matching the widget's own behavior
 * — so the composer surface owns submission, no separate capability needed.
 */
export function createTextareaComposerInput(
  textarea: HTMLTextAreaElement
): ComposerInputCapability {
  const dispatchInput = (): void => {
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return {
    element: textarea,
    getValue: () => textarea.value,
    getLogicalText: () => textarea.value,
    getSelection: () => ({
      start: textarea.selectionStart ?? 0,
      end: textarea.selectionEnd ?? 0
    }),
    setSelection: (start, end = start) => {
      textarea.setSelectionRange(start, end);
    },
    setValueWithCaret: (value, caret) => {
      textarea.value = value;
      textarea.setSelectionRange(caret, caret);
    },
    setValue: (value: string) => {
      textarea.value = value;
      textarea.setSelectionRange(value.length, value.length);
      dispatchInput();
      textarea.focus();
    },
    submit: () => requestFormSubmit(textarea.form),
    dispatchInput,
    focus: () => textarea.focus()
  };
}
