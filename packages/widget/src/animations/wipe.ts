import type { StreamAnimationPlugin } from "../types";
import { registerStreamAnimationPlugin } from "../utils/stream-animation";

/**
 * Wipe animation — per-word left-to-right mask reveal.
 *
 * Each arriving word is revealed via a soft feathered mask that sweeps from
 * right to left. Uses `mask-image` (not `background-clip: text`) so the
 * text's normal color is preserved and nested markdown formatting works.
 *
 * ```ts
 * import "@runtypelabs/persona/animations/wipe";
 * createAgentExperience(el, {
 *   features: { streamAnimation: { type: "wipe" } },
 * });
 * ```
 */

const STYLES = `
@keyframes persona-stream-wipe {
  from { -webkit-mask-position: 100% 0; mask-position: 100% 0; }
  to   { -webkit-mask-position: 0% 0;   mask-position: 0% 0;   }
}
[data-persona-root] .persona-stream-wipe .persona-stream-word {
  -webkit-mask-image: linear-gradient(
    90deg,
    black 0%,
    black 45%,
    transparent 55%,
    transparent 100%
  );
          mask-image: linear-gradient(
    90deg,
    black 0%,
    black 45%,
    transparent 55%,
    transparent 100%
  );
  -webkit-mask-size: 200% 100%;
          mask-size: 200% 100%;
  -webkit-mask-position: 100% 0;
          mask-position: 100% 0;
  -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
  animation: persona-stream-wipe calc(var(--persona-stream-step, 120ms) * 3)
    ease-out forwards;
}
@media (prefers-reduced-motion: reduce) {
  [data-persona-root] .persona-stream-wipe .persona-stream-word {
    animation: none !important;
    -webkit-mask-image: none !important;
            mask-image: none !important;
  }
}
`.trim();

export const wipe: StreamAnimationPlugin = {
  name: "wipe",
  containerClass: "persona-stream-wipe",
  wrap: "word",
  styles: STYLES,
};

registerStreamAnimationPlugin(wipe);

export default wipe;
