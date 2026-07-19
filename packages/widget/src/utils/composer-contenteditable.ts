/**
 * Contenteditable adapter — a `ComposerInputCapability` backed by a
 * `contenteditable` surface with atomic inline mention tokens (inline mode,
 * `display: "inline"`). This is the HEAVY, DOM-bearing half of the inline
 * composer; it lives in the separate `context-mentions-inline.js` chunk and is
 * the only place `composer-document.ts` is used at runtime on the widget path.
 *
 * Sync strategy (decided in docs/context-mentions-inline-plan.md — do not
 * re-litigate): the DOM is the editing surface and the document is DERIVED by
 * re-parsing, never the other way around.
 *
 *  1. Plain typing is handled natively inside text nodes — no `beforeinput`
 *     interception for text (fighting the caret/undo/IME machinery is where
 *     contenteditable projects die).
 *  2. Reads (`getDocument`/`getLogicalText`/`getValue`/`getSelection`) re-parse
 *     the DOM live: `data-mention-id` spans → mention blocks (ref looked up from
 *     `refs`, never parsed from DOM text); everything else → text. Cheap at
 *     composer size, and it removes any chance of stale state after native edits.
 *  3. `beforeinput` is intercepted ONLY to make token deletion atomic when the
 *     caret is adjacent to a token; `contenteditable="false"` on the span handles
 *     arrow/selection atomicity natively.
 *  4. IME: never mutate between `compositionstart`/`compositionend`.
 *  5. Programmatic edits render the document, restore the caret from a logical
 *     offset, then dispatch `input`.
 *  6. Paste inserts `text/plain` only (rich token paste across composers is a
 *     non-goal — a pasted `@App.tsx` is just text).
 *
 * Token removal (by backspace, cut, or select-all-delete) is detected uniformly
 * by reconciling `refs` against the DOM on `input` and firing `onMentionRemoved`
 * for each id that vanished — so the manager aborts that mention's resolve.
 */

import {
  emptyDocument,
  documentFromTextarea,
  toDisplayText,
  toLogicalText,
  logicalLength,
  insertMention,
  removeMention,
  spliceDocument,
  MENTION_PLACEHOLDER,
  type ComposerDocument,
  type ComposerMentionId
} from "./composer-document";
import type { MentionTriggerMatch } from "./mention-trigger";
import { requestFormSubmit, type ComposerInputCapability } from "./composer-input";
import type { AgentWidgetContextMentionRef } from "../types";

export const MENTION_TOKEN_CLASS = "persona-mention-token";
const MENTION_TOKEN_ERROR_CLASS = "persona-mention-token-error";
const MENTION_ID_ATTR = "data-mention-id";
// Pre-error aria-label/title stash, so error recovery can restore host-rendered
// tokens (renderMentionToken) exactly as they were (see setMentionStatus).
const ERROR_PREV_LABEL_ATTR = "data-mention-prev-label";
const ERROR_PREV_TITLE_ATTR = "data-mention-prev-title";
const NEWLINE = "\n";

export interface ContentEditableComposerInputOptions {
  /** Generate a stable id for a newly inserted mention (manager/uuid-backed). */
  generateId: () => ComposerMentionId;
  /**
   * Build a token's full element. Supplied by the core orchestrator (which owns
   * the shared pill + icon renderer). The adapter marks the returned element
   * `contenteditable="false"` and stamps `data-mention-id`.
   */
  renderToken: (ref: AgentWidgetContextMentionRef) => HTMLElement;
  /** Fired when a token is inserted — the manager starts resolve keyed by id. */
  onMentionInserted?: (
    id: ComposerMentionId,
    ref: AgentWidgetContextMentionRef
  ) => void;
  /** Fired when a token disappears from the DOM — the manager aborts its resolve. */
  onMentionRemoved?: (id: ComposerMentionId) => void;
  /** Placeholder text shown while the surface is empty. */
  placeholder?: string;
  /** Existing element to upgrade in place; otherwise a fresh `<div>` is created. */
  element?: HTMLElement;
}

function isMentionSpan(node: Node): node is HTMLElement {
  return (
    node.nodeType === 1 &&
    (node as HTMLElement).hasAttribute(MENTION_ID_ATTR)
  );
}

/** A `<br>` the browser inserts on Shift+Enter / line-break input. */
function isLineBreak(node: Node): boolean {
  return node.nodeType === 1 && (node as HTMLElement).tagName === "BR";
}

/**
 * Logical length one DOM child contributes: text nodes count their chars, a
 * mention token is one `￼`, and a `<br>` is one `\n` (native line breaks read back
 * as newlines). Any other wrapper counts its `textContent`.
 */
function childLogicalLength(node: Node): number {
  if (node.nodeType === 3) return (node as Text).data.length;
  if (isMentionSpan(node)) return 1;
  if (isLineBreak(node)) return 1;
  return node.textContent?.length ?? 0;
}

/**
 * Map a DOM position (node + offset within it) to a logical-text offset. Exported
 * for unit tests — it's the load-bearing caret math and jsdom's Selection is too
 * thin to exercise it end-to-end.
 */
export function domPositionToLogical(
  root: HTMLElement,
  node: Node,
  offset: number
): number {
  let logical = 0;
  for (const child of Array.from(root.childNodes)) {
    if (child === node) {
      if (child.nodeType === 3) return logical + offset;
      // The caret is on the root's child list at this element: offset 0 = before.
      return logical + (offset > 0 ? childLogicalLength(child) : 0);
    }
    if (child.contains(node)) {
      // Caret nested inside this child. A token is atomic — clamp to its edges;
      // any other wrapper (foreign paste) counts its text up to the target.
      if (isMentionSpan(child)) return logical + 1;
      return logical + nestedTextOffset(child, node, offset);
    }
    logical += childLogicalLength(child);
  }
  // `node` is the root itself: offset counts child slots.
  if (node === root) {
    let logicalAt = 0;
    const kids = Array.from(root.childNodes);
    for (let i = 0; i < Math.min(offset, kids.length); i++) {
      logicalAt += childLogicalLength(kids[i]);
    }
    return logicalAt;
  }
  return logical;
}

/** Text length inside `container` up to (`target`, `offset`). */
function nestedTextOffset(container: Node, target: Node, offset: number): number {
  let count = 0;
  const walk = (node: Node): boolean => {
    if (node === target) {
      count += node.nodeType === 3 ? offset : 0;
      return true;
    }
    if (node.nodeType === 3) {
      count += (node as Text).data.length;
      return false;
    }
    for (const child of Array.from(node.childNodes)) {
      if (walk(child)) return true;
    }
    return false;
  };
  walk(container);
  return count;
}

/**
 * Map a logical-text offset to a DOM position (node + offset) for caret
 * restoration. Exported for unit tests. Tokens are atomic, so an offset landing
 * on a token resolves to a root-level position immediately before or after it.
 */
export function logicalToDomPosition(
  root: HTMLElement,
  offset: number
): { node: Node; offset: number } {
  let acc = 0;
  const kids = Array.from(root.childNodes);
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    const len = childLogicalLength(child);
    if (offset <= acc + len) {
      if (child.nodeType === 3) return { node: child, offset: offset - acc };
      // Element (token / wrapper): before it when at its start, else after it.
      return { node: root, offset: offset <= acc ? i : i + 1 };
    }
    acc += len;
  }
  return { node: root, offset: kids.length };
}

/**
 * Read the DOM subtree into a `ComposerDocument`. `data-mention-id` spans become
 * mention blocks (ref from `refs`); text nodes become text blocks; any other node
 * contributes its `textContent` as text. Unknown ids are dropped (a token whose
 * ref we lost is treated as gone).
 */
function parseDomToDocument(
  root: HTMLElement,
  refs: Map<ComposerMentionId, AgentWidgetContextMentionRef>
): ComposerDocument {
  const blocks: ComposerDocument["blocks"] = [];
  for (const child of Array.from(root.childNodes)) {
    if (isMentionSpan(child)) {
      const id = child.getAttribute(MENTION_ID_ATTR)!;
      const ref = refs.get(id);
      if (ref) blocks.push({ kind: "mention", id, ref });
    } else if (isLineBreak(child)) {
      // A native line break (Shift+Enter) reads back as a newline so caret math,
      // getValue(), and line-start `/command` detection all stay aligned.
      blocks.push({ kind: "text", value: NEWLINE });
    } else if (child.nodeType === 3) {
      blocks.push({ kind: "text", value: (child as Text).data });
    } else {
      const text = child.textContent ?? "";
      if (text) blocks.push({ kind: "text", value: text });
    }
  }
  if (blocks.length === 0) blocks.push({ kind: "text", value: "" });
  return { blocks };
}

/**
 * Create a contenteditable-backed `ComposerInputCapability`. The returned object
 * additionally carries `destroy()` to detach listeners on unmount.
 */
export function createContentEditableComposerInput(
  options: ContentEditableComposerInputOptions
): ComposerInputCapability & { destroy: () => void } {
  const renderToken = options.renderToken;
  const refs = new Map<ComposerMentionId, AgentWidgetContextMentionRef>();

  const root = options.element ?? document.createElement("div");
  root.setAttribute("contenteditable", "true");
  root.setAttribute("data-persona-composer-input", "");
  root.setAttribute("role", "textbox");
  root.setAttribute("aria-multiline", "true");
  root.classList.add("persona-composer-contenteditable");
  if (options.placeholder != null) {
    root.setAttribute("data-placeholder", options.placeholder);
  }

  let isComposing = false;
  // Last logical caret we intended. Mirrors a textarea's `selectionStart` after a
  // `.value =` write: it survives even when the composer is unfocused (so we don't
  // touch the host-page selection) and backs `getSelection()` when no live range
  // sits inside the surface.
  let logicalCaret = 0;

  const getDocument = (): ComposerDocument => parseDomToDocument(root, refs);

  /** Re-render the document; empty text blocks are skipped (caret sits at the
   *  root child boundary), so an empty document leaves the root `:empty` for the
   *  placeholder. Refs are (re)registered as tokens are painted. */
  const render = (doc: ComposerDocument): void => {
    root.replaceChildren();
    for (const block of doc.blocks) {
      if (block.kind === "text") {
        if (block.value.length > 0) {
          root.appendChild(document.createTextNode(block.value));
        }
      } else {
        refs.set(block.id, block.ref);
        // The token element is the atomic node: mark it non-editable and stamp its
        // id (used by re-parse + removal reconcile), regardless of who rendered it.
        const el = renderToken(block.ref);
        el.setAttribute("contenteditable", "false");
        el.setAttribute(MENTION_ID_ATTR, block.id);
        root.appendChild(el);
      }
    }
  };

  /** Does the composer currently own the document/shadow-root selection focus? */
  const ownsFocus = (): boolean => {
    const activeRoot = root.getRootNode() as Document | ShadowRoot;
    const active = activeRoot.activeElement;
    return active === root || (active != null && root.contains(active));
  };

  /**
   * Place the collapsed caret at a logical offset. By default this only touches
   * the document selection when the composer OWNS focus — a programmatic write
   * (mount migration, `.value` shim) must never wipe a selection the user is
   * making elsewhere on the host page. Pass `{ focus: true }` for flows that
   * intentionally drive the caret while focused (mention insertion, paste).
   */
  const setCaret = (offset: number, opts?: { focus?: boolean }): void => {
    logicalCaret = offset; // remember intent even when we don't touch the DOM
    if (!opts?.focus && !ownsFocus()) return;
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (!sel) return;
    const pos = logicalToDomPosition(root, offset);
    try {
      const range = document.createRange();
      range.setStart(pos.node, pos.offset);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      /* selection unavailable (SSR/jsdom edge) — ignore */
    }
  };

  const dispatchInput = (): void => {
    root.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const getSelection = (): { start: number; end: number } => {
    // No live range inside the surface (unfocused / focus elsewhere): fall back to
    // the last intended caret, mirroring a textarea's persisted `selectionStart`.
    const fallback = { start: logicalCaret, end: logicalCaret };
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (!sel || sel.rangeCount === 0) return fallback;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer)) return fallback;
    const start = domPositionToLogical(
      root,
      range.startContainer,
      range.startOffset
    );
    const end = range.collapsed
      ? start
      : domPositionToLogical(root, range.endContainer, range.endOffset);
    return { start: Math.min(start, end), end: Math.max(start, end) };
  };

  /** Fire `onMentionRemoved` for any tracked token no longer present in the DOM. */
  const reconcileRemovedMentions = (): void => {
    const present = new Set<string>();
    for (const child of Array.from(root.childNodes)) {
      if (isMentionSpan(child)) present.add(child.getAttribute(MENTION_ID_ATTR)!);
    }
    for (const id of Array.from(refs.keys())) {
      if (!present.has(id)) {
        refs.delete(id);
        options.onMentionRemoved?.(id);
      }
    }
  };

  const onInput = (): void => {
    if (isComposing) return;
    if (refs.size === 0) return; // no tracked tokens → nothing to reconcile
    reconcileRemovedMentions();
  };

  const onCompositionStart = (): void => {
    isComposing = true;
  };
  const onCompositionEnd = (): void => {
    isComposing = false;
    reconcileRemovedMentions();
  };

  const onPaste = (event: ClipboardEvent): void => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (typeof document.execCommand === "function") {
      document.execCommand("insertText", false, text);
    } else {
      // Fallback: splice at the DOCUMENT-MODEL level so tokens outside the pasted
      // range survive (a plain-text splice would turn every `￼` into a literal
      // character and orphan its mention). Paste runs focused → keep the caret.
      const { start, end } = getSelection();
      const result = spliceDocument(getDocument(), start, end, text);
      render(result.doc);
      setCaret(result.caret, { focus: true });
      reconcileRemovedMentions();
    }
    dispatchInput();
  };

  /**
   * Intercept ONLY the deletion cases browsers can get wrong around an atomic
   * token: a collapsed caret adjacent to a token (delete the whole token) — the
   * common `contenteditable="false"` handling already covers most of this, so
   * this is a defensive backstop. Everything else falls through to native editing.
   */
  const onBeforeInput = (event: Event): void => {
    if (isComposing) return;
    const type = (event as InputEvent).inputType;
    // Normalize a paragraph split to a plain newline so the flat document model
    // never has to unwind browser `<div>`/`<p>` wrapping. (A bare line break —
    // Shift+Enter's `insertLineBreak` — inserts a native `<br>`, which the parser
    // already reads back as `\n`, so we leave it to native editing to keep the
    // caret/undo machinery intact.)
    if (type === "insertParagraph") {
      event.preventDefault();
      const { start, end } = getSelection();
      const result = spliceDocument(getDocument(), start, end, NEWLINE);
      render(result.doc);
      setCaret(result.caret, { focus: true });
      if (refs.size > 0) reconcileRemovedMentions();
      dispatchInput();
      return;
    }
    if (type !== "deleteContentBackward" && type !== "deleteContentForward") {
      return;
    }
    if (refs.size === 0) return; // no tokens to protect → let native delete run
    const { start, end } = getSelection();
    if (start !== end) return; // range deletes: let native handle, reconcile after
    const doc = getDocument();
    const logical = toLogicalText(doc);
    const probe = type === "deleteContentBackward" ? start - 1 : start;
    if (probe < 0 || probe >= logical.length) return;
    if (logical[probe] !== MENTION_PLACEHOLDER) return; // not adjacent to a token
    // Find which mention sits at `probe` and remove it atomically.
    let offset = 0;
    let targetId: ComposerMentionId | null = null;
    for (const block of doc.blocks) {
      const len = block.kind === "text" ? block.value.length : 1;
      if (block.kind === "mention" && probe >= offset && probe < offset + len) {
        targetId = block.id;
        break;
      }
      offset += len;
    }
    if (!targetId) return;
    event.preventDefault();
    const result = removeMention(doc, targetId);
    render(result.doc);
    setCaret(result.caret, { focus: true });
    reconcileRemovedMentions();
    dispatchInput();
  };

  const setValueWithCaret = (value: string, caret: number): void => {
    render(documentFromTextarea(value));
    setCaret(caret);
  };

  /**
   * Viewport-coordinate rect of the LOGICAL range `[start, end)`. Builds a
   * NON-collapsed DOM Range around a real glyph (the whole trick — collapsed
   * ranges at a node boundary measure empty in most engines) and returns its
   * bounding rect. Returns `null` for an empty/invalid range or a degenerate
   * (zero-size) rect so callers fall back to composer anchoring. Cheap: one Range
   * + one `getBoundingClientRect`, only invoked on measure (not per keystroke).
   */
  const getLogicalRangeRect = (
    start: number,
    end: number
  ): DOMRect | null => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return null;
    }
    try {
      const s = logicalToDomPosition(root, start);
      const e = logicalToDomPosition(root, end);
      const range = document.createRange();
      range.setStart(s.node, s.offset);
      range.setEnd(e.node, e.offset);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return null;
      return rect;
    } catch {
      return null;
    }
  };

  /**
   * Token-preserving logical-range replace (the controller's query-strip /
   * slash-completion / prompt-macro rewrites). Splices at the DOCUMENT level so
   * every token outside `[start, end)` survives; the dispatched `input` reconciles
   * any token the range covered. Does not itself fire `input` — the caller does,
   * matching `setValueWithCaret`.
   */
  const replaceLogicalRange = (
    start: number,
    end: number,
    text: string
  ): void => {
    const result = spliceDocument(getDocument(), start, end, text);
    render(result.doc);
    setCaret(result.caret, { focus: true });
  };

  const insertMentionAtTrigger = (
    ref: AgentWidgetContextMentionRef,
    match: MentionTriggerMatch
  ): ComposerMentionId | null => {
    const doc = getDocument();
    const logical = toLogicalText(doc);
    const start = match.triggerIndex;
    const end = match.triggerIndex + 1 + match.query.length;
    // Staleness guard: the typed query region must still be intact.
    if (
      start < 0 ||
      end > logical.length ||
      logical.slice(start + 1, end) !== match.query
    ) {
      return null;
    }
    const id = options.generateId();
    const result = insertMention(doc, { start, end }, ref, id);
    render(result.doc);
    setCaret(result.caret, { focus: true });
    options.onMentionInserted?.(id, ref);
    dispatchInput();
    return id;
  };

  const insertMentionAtSelection = (
    ref: AgentWidgetContextMentionRef
  ): ComposerMentionId => {
    const doc = getDocument();
    const sel = getSelection();
    // Picker path: no live caret in the composer (focus was in the menu search) →
    // append at the end of the document.
    const hasCaret =
      typeof window !== "undefined" &&
      !!window.getSelection()?.rangeCount &&
      root.contains(window.getSelection()!.getRangeAt(0).startContainer);
    const range = hasCaret
      ? { start: sel.start, end: sel.end }
      : { start: logicalLength(doc), end: logicalLength(doc) };
    const id = options.generateId();
    const result = insertMention(doc, range, ref, id);
    render(result.doc);
    setCaret(result.caret, { focus: true });
    options.onMentionInserted?.(id, ref);
    dispatchInput();
    return id;
  };

  /** Toggle the inline error affordance on the token element for `id` (no-op for
   *  unknown ids); any non-error status clears it. On error, also surface the
   *  failure to assistive tech via both the `title` tooltip AND the token's
   *  `aria-label` (the red styling alone is visual-only, so a screen-reader user
   *  would otherwise never learn the context failed to attach). The token's own
   *  name/tooltip are stashed before the error override and restored verbatim on
   *  recovery — tokens can come from the host's `renderMentionToken` hook, which
   *  carries none of the default builder's markup to re-derive them from, so
   *  non-error statuses must never rewrite attributes on a token that was never
   *  in the error state. */
  const setMentionStatus = (
    id: ComposerMentionId,
    status: "pending" | "resolved" | "error"
  ): void => {
    for (const child of Array.from(root.childNodes)) {
      if (isMentionSpan(child) && child.getAttribute(MENTION_ID_ATTR) === id) {
        const isError = status === "error";
        child.classList.toggle(MENTION_TOKEN_ERROR_CLASS, isError);
        if (isError) {
          if (!child.hasAttribute(ERROR_PREV_LABEL_ATTR)) {
            child.setAttribute(
              ERROR_PREV_LABEL_ATTR,
              child.getAttribute("aria-label") ?? ""
            );
            child.setAttribute(
              ERROR_PREV_TITLE_ATTR,
              child.getAttribute("title") ?? ""
            );
          }
          const label = refs.get(id)?.label ?? "";
          child.setAttribute("title", `${label}: failed to attach context`);
          child.setAttribute("aria-label", `${label}, failed to attach context`);
        } else if (child.hasAttribute(ERROR_PREV_LABEL_ATTR)) {
          // A stashed empty string means the attribute was absent pre-error.
          const prevLabel = child.getAttribute(ERROR_PREV_LABEL_ATTR);
          const prevTitle = child.getAttribute(ERROR_PREV_TITLE_ATTR);
          if (prevLabel) child.setAttribute("aria-label", prevLabel);
          else child.removeAttribute("aria-label");
          if (prevTitle) child.setAttribute("title", prevTitle);
          else child.removeAttribute("title");
          child.removeAttribute(ERROR_PREV_LABEL_ATTR);
          child.removeAttribute(ERROR_PREV_TITLE_ATTR);
        }
        return;
      }
    }
  };

  root.addEventListener("input", onInput);
  root.addEventListener("compositionstart", onCompositionStart);
  root.addEventListener("compositionend", onCompositionEnd);
  root.addEventListener("paste", onPaste);
  root.addEventListener("beforeinput", onBeforeInput);

  // Start empty (placeholder visible).
  render(emptyDocument());

  return {
    element: root,
    getValue: () => toDisplayText(getDocument()),
    getLogicalText: () => toLogicalText(getDocument()),
    getDocument,
    getSelection,
    setSelection: (start, end = start) => {
      const sel = typeof window !== "undefined" ? window.getSelection() : null;
      if (!sel) return;
      try {
        const s = logicalToDomPosition(root, start);
        const e = logicalToDomPosition(root, end);
        const range = document.createRange();
        range.setStart(s.node, s.offset);
        range.setEnd(e.node, e.offset);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch {
        /* ignore */
      }
    },
    setValueWithCaret,
    getLogicalRangeRect,
    setValue: (value: string) => {
      // The `.value` shim setter: focus FIRST so the subsequent caret placement
      // owns the selection (setCaret is a no-op when unfocused, by design).
      render(documentFromTextarea(value));
      root.focus();
      setCaret(value.length, { focus: true });
      dispatchInput();
    },
    replaceLogicalRange,
    insertMentionAtTrigger,
    insertMentionAtSelection,
    setMentionStatus,
    submit: () => requestFormSubmit(root.closest("form")),
    dispatchInput,
    focus: () => root.focus(),
    destroy: () => {
      root.removeEventListener("input", onInput);
      root.removeEventListener("compositionstart", onCompositionStart);
      root.removeEventListener("compositionend", onCompositionEnd);
      root.removeEventListener("paste", onPaste);
      root.removeEventListener("beforeinput", onBeforeInput);
    }
  };
}
