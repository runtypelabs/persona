/**
 * Compact composer state.
 *
 * Pure predicate plus its hysteresis latch. Action-width fit is measured
 * separately, so only text wrapping latches an expanded draft.
 */

export type ComposerCompactInput = {
  text: string;
  /** The editor grew past one line. Measured by the caller, latched here. */
  wrapped: boolean;
  hasAttachments: boolean;
  /**
   * Any chip in the shared header chip row: mode chips, mention chips, or both.
   * One input, because the row is one rail.
   */
  hasChips: boolean;
  hasQuote: boolean;
  hasPendingSubmission: boolean;
};

/**
 * Compact when the draft is empty or a single line and nothing else occupies
 * the composer. Text alone is not enough: any chip, attachment, quote, pending
 * submission expands it. Recording state alone does not affect layout.
 */
export function isComposerCompact(input: ComposerCompactInput): boolean {
  if (input.wrapped) return false;
  if (input.text.includes("\n")) return false;
  return !(
    input.hasAttachments ||
    input.hasChips ||
    input.hasQuote ||
    input.hasPendingSubmission
  );
}

/**
 * Avoids oscillation at the wrapping boundary: once the editor expanded because
 * the text wrapped, it stays expanded until the draft is cleared or sent.
 */
export function createComposerCompactLatch(): {
  /** Feed the measured wrap state; returns the latched value. */
  observe: (wrapped: boolean, text: string) => boolean;
  /** Send or clear: the next single-line draft may collapse again. */
  release: () => void;
} {
  let latched = false;
  return {
    observe: (wrapped, text) => {
      if (!text) {
        latched = false;
        return false;
      }
      if (wrapped) latched = true;
      return latched;
    },
    release: () => {
      latched = false;
    },
  };
}

/** True when the editor renders more than one line of text. */
export function isEditorWrapped(element: HTMLElement | null): boolean {
  if (!element) return false;
  const view = element.ownerDocument?.defaultView;
  if (!view?.getComputedStyle) return false;
  const style = view.getComputedStyle(element);
  const lineHeight = Number.parseFloat(style.lineHeight);
  const fontSize = Number.parseFloat(style.fontSize);
  const line =
    Number.isFinite(lineHeight) && lineHeight > 0
      ? lineHeight
      : Number.isFinite(fontSize) && fontSize > 0
        ? fontSize * 1.4
        : 0;
  if (!line) return false;
  const inset =
    (Number.parseFloat(style.paddingTop) || 0) +
    (Number.parseFloat(style.paddingBottom) || 0);
  // A textarea's scrollHeight includes its previously auto-sized height. Read
  // its natural height so widening a host cannot mistake that old height for
  // a fresh wrap. The temporary style is restored before observers run.
  const height = element.style.height;
  const heightPriority = element.style.getPropertyPriority("height");
  const textarea = element.tagName === "TEXTAREA";
  if (textarea) element.style.height = "auto";
  const content = element.scrollHeight - inset;
  if (textarea) element.style.setProperty("height", height, heightPriority);
  // Half a line of slack: rounding and border-box math must not read as a wrap.
  return content > line * 1.5;
}
