/**
 * Composer input configuration: submit keys, mobile Enter behavior, editor sizing, and the safe
 * attribute allowlist.
 *
 * Pure helpers over one element. Both composer builders and the live
 * `controller.update()` path call the same functions, so config read at build
 * time re-syncs instead of freezing at mount.
 */

import type {
  ComposerInputAttributes,
  ComposerSubmitKey,
} from "../types";

/** Full composer default. */
export const DEFAULT_COMPOSER_MAX_LINES = 3;
/** Composer-bar pill default: taller than the full composer's collapsed row. */
export const PILL_COMPOSER_MAX_LINES = 5;
/** Used when the rendered line height is unresolvable (detached node, jsdom). */
export const FALLBACK_LINE_HEIGHT = 20;

/** Rendered line height in px; only px values are multipliable. */
export function readLineHeightPx(element: HTMLElement): number {
  const view = element.ownerDocument?.defaultView;
  if (!view?.getComputedStyle) return FALLBACK_LINE_HEIGHT;
  const computed = view.getComputedStyle(element).lineHeight;
  if (!computed || !computed.trim().endsWith("px")) return FALLBACK_LINE_HEIGHT;
  const parsed = parseFloat(computed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : FALLBACK_LINE_HEIGHT;
}

/** Normalize a configured `maxLines`; non-positive and non-finite fall back. */
export function resolveMaxLines(
  configured: number | undefined,
  fallback: number
): number {
  if (typeof configured !== "number" || !Number.isFinite(configured)) {
    return fallback;
  }
  return configured > 0 ? configured : fallback;
}

/**
 * Cap the editor at `maxLines` rendered lines. Works for the textarea and the
 * inline contenteditable surface, both of which grow by content height.
 */
export function applyComposerMaxLines(
  element: HTMLElement,
  maxLines: number
): void {
  element.style.maxHeight = `${maxLines * readLineHeightPx(element)}px`;
  element.style.overflowY = "auto";
}

/** Coarse primary pointer: phones and tablets. Same query as the CSS guards. */
export function isCoarsePointer(element?: HTMLElement | null): boolean {
  const view =
    element?.ownerDocument?.defaultView ??
    (typeof window !== "undefined" ? window : null);
  if (!view || typeof view.matchMedia !== "function") return false;
  try {
    return view.matchMedia("(pointer: coarse)").matches === true;
  } catch {
    return false;
  }
}

export interface ComposerSubmitKeyOptions {
  submitKey?: ComposerSubmitKey;
  insertNewlineOnTouchEnter?: boolean;
  /** Resolved coarse-pointer state; the caller owns the media query. */
  coarsePointer?: boolean;
}

/** True when Enter inserts a newline because the pointer is coarse. */
export function touchNewlineApplies(
  options: ComposerSubmitKeyOptions
): boolean {
  return (
    options.insertNewlineOnTouchEnter === true && options.coarsePointer === true
  );
}

/**
 * Does this keydown submit? Enter under `"enter"`, Ctrl/Command+Enter under
 * `"mod-enter"`, never under `"none"`. Shift+Enter and IME composition always
 * insert/commit instead.
 */
export function isSubmitKeydown(
  event: Pick<
    KeyboardEvent,
    "key" | "shiftKey" | "metaKey" | "ctrlKey" | "isComposing"
  >,
  options: ComposerSubmitKeyOptions
): boolean {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return false;
  const mod = event.metaKey === true || event.ctrlKey === true;
  const submitKey = options.submitKey ?? "enter";
  if (submitKey === "none") return false;
  if (submitKey === "mod-enter") return mod;
  // "enter": a held Ctrl/Command still submits, as it always has. The touch
  // override only reassigns a bare Enter.
  return mod || !touchNewlineApplies(options);
}

/** `"send"` only while a bare Enter submits. */
export function deriveEnterKeyHint(
  options: ComposerSubmitKeyOptions
): "send" | "enter" {
  const submitKey = options.submitKey ?? "enter";
  if (submitKey !== "enter") return "enter";
  return touchNewlineApplies(options) ? "enter" : "send";
}

export function applyComposerEnterKeyHint(
  element: HTMLElement,
  options: ComposerSubmitKeyOptions
): void {
  element.setAttribute("enterkeyhint", deriveEnterKeyHint(options));
}

/**
 * Apply the `inputAttributes` allowlist. Only these five attribute names are
 * ever written, so persona data attributes, `disabled`, `class`, `style`, and
 * `value` are structurally out of reach. Omitting a key on a later update
 * restores the built-in default.
 */
export function applyComposerInputAttributes(
  element: HTMLElement,
  attributes?: ComposerInputAttributes
): void {
  const autocomplete = attributes?.autocomplete;
  // Browser autofill has no meaningful value for a chat draft.
  element.setAttribute(
    "autocomplete",
    typeof autocomplete === "string" && autocomplete ? autocomplete : "off"
  );

  const set = (name: string, value: string | undefined): void => {
    if (value === undefined) element.removeAttribute(name);
    else element.setAttribute(name, value);
  };

  set(
    "autocapitalize",
    typeof attributes?.autocapitalize === "string"
      ? attributes.autocapitalize
      : undefined
  );
  set(
    "spellcheck",
    typeof attributes?.spellcheck === "boolean"
      ? String(attributes.spellcheck)
      : undefined
  );
  set(
    "inputmode",
    typeof attributes?.inputmode === "string" && attributes.inputmode
      ? attributes.inputmode
      : undefined
  );
  set(
    "aria-label",
    typeof attributes?.ariaLabel === "string" && attributes.ariaLabel
      ? attributes.ariaLabel
      : undefined
  );
}

export interface ResolvedComposerLock {
  disabled: boolean;
  reason?: string;
}

/** Normalize `inputDisabled` / `sendDisabled` into a flag plus a reason. */
export function resolveComposerLock(
  option: boolean | { reason?: string } | undefined
): ResolvedComposerLock {
  if (option === true) return { disabled: true };
  if (!option || typeof option !== "object") return { disabled: false };
  const reason =
    typeof option.reason === "string" && option.reason ? option.reason : undefined;
  return { disabled: true, reason };
}
