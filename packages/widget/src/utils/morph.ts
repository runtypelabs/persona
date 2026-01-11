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
        if (preserveTypingAnimation) {
          if (oldNode.classList.contains("tvw-animate-typing")) {
            return false;
          }
        }
      },
    },
  });
};
