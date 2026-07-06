/**
 * Inline-mention chunk entry — the HEAVY, DOM-bearing half of inline mode. Loaded
 * on composer mount when `contextMentions.display === "inline"` and NEVER
 * statically imported on the core path (the IIFE build marks
 * `@runtypelabs/persona/context-mentions-inline` external; ESM/CJS mark the same
 * subpath external via `build:client`). This is the only place the
 * contenteditable engine + `composer-document` enter the widget at runtime.
 *
 * `mountInlineComposer` builds a contenteditable `ComposerInputCapability` that
 * visually mirrors the live `<textarea>` and migrates its current value + caret.
 * It does NOT touch the DOM tree or rebind listeners — the caller (`ui.ts`) swaps
 * the element in place and re-points the composer's event handlers, because those
 * live in the core and the chunk must stay free of that wiring.
 */

import {
  createContentEditableComposerInput,
  type ContentEditableComposerInputOptions,
} from "./utils/composer-contenteditable";
import { documentToMessageFields } from "./utils/composer-document";
import type { ComposerInputCapability } from "./utils/composer-input";
import type {
  AgentWidgetContentSegment,
  AgentWidgetContextMentionRef,
} from "./types";

/**
 * Display/transcript fields a sent inline-mode message carries, derived from the
 * live composer document. Computed in THIS chunk (it owns `composer-document.ts`
 * at runtime) and read by the core `ui.ts` submit path via `getInlineMessageFields`
 * below, so the core never imports the document model.
 */
export interface InlineComposerMessageFields {
  content: string;
  contextMentions: AgentWidgetContextMentionRef[];
  contentSegments: AgentWidgetContentSegment[];
}

/**
 * The `<textarea>`-shaped element the inline composer swaps in. Beyond the
 * textarea API shims it also exposes `getInlineMessageFields()` so the core
 * submit path can read the ordered document segments without importing the
 * document model. `ui.ts` references this via a structural (type-only) shape.
 */
export type InlineComposerElement = HTMLElement & {
  getInlineMessageFields: () => InlineComposerMessageFields;
};

export interface InlineComposerMountContext {
  /** The live composer textarea to migrate from (value + caret + look). */
  textarea: HTMLTextAreaElement;
  /**
   * Build a token's full element. Supplied by the CORE orchestrator (which owns
   * `createMentionTokenElement` + the shared icon renderer) so this lazy chunk
   * never bundles the icon set — it already ships in core. The adapter marks the
   * returned element `contenteditable="false"` and stamps `data-mention-id`.
   */
  renderToken: (ref: AgentWidgetContextMentionRef) => HTMLElement;
  /**
   * Fired when a token is deleted from the composer (backspace/cut). The caller
   * routes this to `engine.untrackMention(id)` so the manager aborts its resolve.
   */
  onMentionRemoved?: (id: string) => void;
}

export interface InlineComposerHandle {
  /** The contenteditable input surface; hand this to `mountContextMentions`. */
  input: ComposerInputCapability;
  /** The contenteditable root element to swap in for the textarea. */
  element: HTMLElement;
  /** Detach the adapter's listeners on unmount. */
  destroy: () => void;
}

let idSeq = 0;
/** Page-unique mention id (composer-scoped; only needs uniqueness within a doc). */
const generateId = (): string => `pmention-${++idSeq}`;

/**
 * Copy the visual hooks that make the contenteditable read like the textarea it
 * replaces. The composer sets most of its look via INLINE styles at runtime (font
 * vars from config, the `maxHeight`/`overflowY` auto-resize cap, border/outline
 * stripping — see `composer-parts.ts` and `ui.ts` `updateCopy`), not just utility
 * classes, so copy every inline style property across as well; otherwise the
 * contenteditable falls back to its CSS defaults (a taller max-height, a different
 * font) and visibly pops on swap. Also mirror the classes, the placeholder, and
 * the accessible name.
 */
function mirrorTextareaLook(
  textarea: HTMLTextAreaElement,
  el: HTMLElement
): void {
  el.className = `${textarea.className} persona-composer-contenteditable`.trim();
  // Copy every inline style property (font*, lineHeight, maxHeight, overflowY,
  // border, outline, background, padding, color, …) so the box model + typography
  // match exactly. Iterating keeps this in sync as the composer's inline styles
  // evolve, without re-enumerating a fixed property list here. Skip `height`: the
  // textarea's auto-resize sets it to a fixed px on input, but the contenteditable
  // grows with its content (capped by the copied `maxHeight`/`overflowY`), so a
  // frozen height would clip it.
  for (let i = 0; i < textarea.style.length; i++) {
    const prop = textarea.style.item(i);
    if (prop === "height") continue;
    el.style.setProperty(
      prop,
      textarea.style.getPropertyValue(prop),
      textarea.style.getPropertyPriority(prop)
    );
  }
  const placeholder = textarea.getAttribute("placeholder");
  if (placeholder) el.setAttribute("data-placeholder", placeholder);
  // The textarea's accessible name is its placeholder (it carries no explicit
  // aria-label), so give the contenteditable the same name when none was set.
  const label = textarea.getAttribute("aria-label") ?? placeholder;
  if (label) el.setAttribute("aria-label", label);
}

/**
 * Make the contenteditable element quack like a `<textarea>` for the specific API
 * surface the host composer code touches (`value`, `selectionStart/End`,
 * `setSelectionRange`). This lets `ui.ts` keep reading/writing the composer the
 * same way after the swap without threading the capability through every call
 * site (doSubmit clears `value`; history sets `value` + caret; the send gate
 * reads `value`). Everything is delegated to the capability so the document stays
 * the source of truth. NOTE: `value` writes render PLAIN TEXT (no tokens) — inline
 * history recall is plain-text in v1; tokens survive only within a live session.
 */
function shimTextareaApi(
  el: HTMLElement,
  input: ComposerInputCapability
): void {
  Object.defineProperty(el, "value", {
    configurable: true,
    get: () => input.getValue(),
    set: (v: string) => {
      input.setValueWithCaret(v, v.length);
      // `setValueWithCaret` rebuilds the DOM as plain text (dropping any token
      // spans) but does NOT itself run the adapter's removal reconcile. Fire an
      // input event so vanished tokens untrack (the manager aborts their resolve)
      // — otherwise a programmatic `value =` (voice transcript, clear, history
      // recall) leaves stale resolved context tracked against the next send.
      input.dispatchInput();
    },
  });
  // The contenteditable reads its placeholder from `data-placeholder`, so a plain
  // `.placeholder =` (e.g. `ui.ts` `updateCopy` after the swap) would no-op. Map
  // the textarea `placeholder` property onto the attribute (and the accessible
  // name) so post-swap copy updates land.
  Object.defineProperty(el, "placeholder", {
    configurable: true,
    get: () => el.getAttribute("data-placeholder") ?? "",
    set: (v: string) => {
      if (v) {
        el.setAttribute("data-placeholder", v);
        el.setAttribute("aria-label", v);
      } else {
        el.removeAttribute("data-placeholder");
      }
    },
  });
  Object.defineProperty(el, "selectionStart", {
    configurable: true,
    get: () => input.getSelection().start,
  });
  Object.defineProperty(el, "selectionEnd", {
    configurable: true,
    get: () => input.getSelection().end,
  });
  (el as unknown as HTMLTextAreaElement).setSelectionRange = (
    start: number,
    end: number
  ) => input.setSelection(start ?? 0, end ?? start ?? 0);
}

export function mountInlineComposer(
  ctx: InlineComposerMountContext
): InlineComposerHandle {
  const { textarea } = ctx;
  const options: ContentEditableComposerInputOptions = {
    generateId,
    // Token DOM (incl. icon + any host `renderMentionToken`) is built in core and
    // passed in, so this chunk stays free of the icon renderer.
    renderToken: ctx.renderToken,
    onMentionRemoved: ctx.onMentionRemoved,
    placeholder: textarea.getAttribute("placeholder") ?? undefined,
  };
  const capability = createContentEditableComposerInput(options);
  const el = capability.element;
  mirrorTextareaLook(textarea, el);
  shimTextareaApi(el, capability);

  // Expose the ordered document as sent-message fields for the core submit path.
  // Computed here (this chunk owns `composer-document.ts`) so `ui.ts` can attach
  // `contentSegments` to the user message without importing the document model.
  (el as InlineComposerElement).getInlineMessageFields = () =>
    documentToMessageFields(capability.getDocument?.() ?? { blocks: [] });

  // Migrate current text + caret. Anything typed before the swap is plain text
  // (tokens can't exist yet — the menu chunk gates selection), so this is lossless.
  const caret = textarea.selectionStart ?? textarea.value.length;
  capability.setValueWithCaret(textarea.value, caret);

  return {
    input: capability,
    element: el,
    destroy: capability.destroy,
  };
}
