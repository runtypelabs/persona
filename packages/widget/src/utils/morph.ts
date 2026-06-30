import { Idiomorph } from "idiomorph";

export type MorphOptions = {
  preserveTypingAnimation?: boolean;
};

/**
 * Morph a container's contents using idiomorph with chat-widget-specific
 * preservation rules for typing indicators.
 *
 * Action buttons are matched by their `id` attribute (set to `actions-{messageId}`)
 * so idiomorph updates them in place rather than recreating them.
 */
export const morphMessages = (
  container: HTMLElement,
  newContent: HTMLElement,
  options: MorphOptions = {}
): void => {
  const { preserveTypingAnimation = true } = options;

  Idiomorph.morph(container, newContent.innerHTML, {
    morphStyle: "innerHTML",
    callbacks: {
      beforeNodeMorphed(oldNode: Node, newNode: Node): boolean | void {
        if (!(oldNode instanceof HTMLElement)) return;

        // Preserve typing indicator dots to maintain animation continuity
        // Also preserve elements with data-preserve-animation attribute for custom loading indicators
        if (preserveTypingAnimation) {
          if (oldNode.classList.contains("persona-animate-typing")) {
            return false;
          }
          // Plugins actively mutating a node (e.g. glyph-cycle's tick loop)
          // opt out of morph entirely via this attribute. Unlike
          // `data-preserve-animation`, this is honored regardless of whether
          // the new DOM carries the attribute: it's a runtime-only marker.
          if (oldNode.hasAttribute("data-preserve-runtime")) {
            return false;
          }
          // The live tool-elapsed span's text is owned by the 100ms global
          // timer in ui.ts (it rewrites `now - startedAt` on a fixed cadence).
          // Re-morphing it to the render-time value fights that timer, so while
          // a tool stays active across frequent re-renders the "<0.1s" boundary
          // flickers. Preserve it while the SAME tool is still live (matching
          // `data-tool-elapsed`, i.e. startedAt); allow the morph once the tool
          // completes (new node drops the marker → final static duration) or the
          // slot is reused by another tool (marker value changed).
          if (oldNode.hasAttribute("data-tool-elapsed")) {
            const sameLiveTool =
              newNode instanceof HTMLElement &&
              newNode.getAttribute("data-tool-elapsed") ===
                oldNode.getAttribute("data-tool-elapsed");
            if (sameLiveTool) {
              return false;
            }
            return;
          }
          if (oldNode.hasAttribute("data-preserve-animation")) {
            // Allow morph when the new node drops the attribute (e.g. tool completed)
            if (newNode instanceof HTMLElement && !newNode.hasAttribute("data-preserve-animation")) {
              return;
            }
            // Allow morph when content has meaningfully changed (e.g. tool name arrived)
            if (newNode instanceof HTMLElement && newNode.hasAttribute("data-preserve-animation")) {
              const oldText = oldNode.textContent ?? "";
              const newText = newNode.textContent ?? "";
              if (oldText !== newText) {
                return;
              }
            }
            return false;
          }
        }
      },
    },
  });
};
