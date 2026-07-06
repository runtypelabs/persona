/**
 * Reusable ARIA live-region helper for screen-reader announcements.
 *
 * Politeness maps to a matching role so assistive tech treats each region
 * correctly: `"polite"` → `role="status"` (queued behind current speech),
 * `"assertive"` → `role="alert"` (interrupts). `aria-atomic="true"` makes the
 * whole message re-read on every update rather than just the changed text node.
 *
 * Shadow-DOM hosting (per the mention-a11y decision): a visually-hidden live
 * region nested inside a shadow root is inconsistently surfaced by assistive
 * technologies, so when the resolved host lives inside a Shadow DOM we host the
 * region in the LIGHT DOM (`document.body`) instead and apply the sr-only styles
 * inline (the widget's prefixed `widget.css` may not reach `document.body`).
 * Outside a shadow root the region stays in the given host and relies on the
 * `persona-sr-only` class.
 *
 * NOTE (pre-existing limitation): this helper is currently only wired for the
 * context-mention live regions. The widget's GENERAL live region (`ui.ts`,
 * `data-persona-live-region`) still renders inside the shadow root under
 * `useShadowDom` and is intentionally left untouched here — narrowing the fix to
 * the mention regions keeps the change surface small.
 */

/** Visually-hidden styling applied inline when hosting on `document.body`. */
const SR_ONLY_STYLE: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  width: "1px",
  height: "1px",
  margin: "-1px",
  padding: "0",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: "0",
};

export type LiveRegionPoliteness = "polite" | "assertive";

export interface LiveRegion {
  /** Re-announce `message`; clears first so identical repeats still speak. */
  announce: (message: string) => void;
  /** Remove the region node from the DOM. */
  destroy: () => void;
}

/**
 * Create an ARIA live region hosted per the Shadow-DOM decision above.
 * `host` is the element (or shadow root) the widget renders into; the helper
 * inspects its root node to decide between light-DOM and in-host placement.
 */
export function createLiveRegion(
  politeness: LiveRegionPoliteness,
  host: HTMLElement | ShadowRoot
): LiveRegion {
  const el = document.createElement("div");
  el.className = "persona-sr-only";
  el.setAttribute("aria-live", politeness);
  el.setAttribute("aria-atomic", "true");
  el.setAttribute("role", politeness === "assertive" ? "alert" : "status");
  el.setAttribute("data-persona-mention-live-region", "");

  const root = host.getRootNode();
  const inShadow =
    typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot;
  if (inShadow) {
    // Host in the light DOM with inline sr-only styles (widget.css may not reach
    // document.body).
    Object.assign(el.style, SR_ONLY_STYLE);
    document.body.appendChild(el);
  } else {
    host.appendChild(el);
  }

  return {
    announce: (message: string) => {
      el.textContent = "";
      el.textContent = message;
    },
    destroy: () => {
      el.remove();
    },
  };
}
