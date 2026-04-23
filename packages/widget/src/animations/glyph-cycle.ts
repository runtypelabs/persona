import type { StreamAnimationPlugin } from "../types";
import { registerStreamAnimationPlugin } from "../utils/stream-animation";

/**
 * Glyph-cycle animation — "hacker-settling" reveal.
 *
 * Each arriving char briefly cycles through a sequence of random glyphs
 * before locking in to its final character. Unlike a pure CSS effect, this
 * needs JS because it mutates `textContent` per tick. To keep idiomorph from
 * clobbering mid-cycle work, each cycling span carries
 * `data-preserve-runtime="stream-glyph-cycle"` until its cycle completes —
 * morph honors that attribute as an absolute skip marker.
 *
 * A short buffer (`BUFFER_THRESHOLD`) holds the bubble empty (with the
 * typing indicator) until enough text has arrived to run a visible reveal.
 * Once released, every char starts as a random glyph and settles in order
 * from the start, staggered by one `--persona-stream-step` between chars.
 * Live tokens arriving after release queue behind the stagger slot, so the
 * settling wave flows through the full message.
 *
 * Ships as a subpath module so consumers who don't want it pay zero cost.
 * Importing this module auto-registers the plugin globally — just add the
 * import and set `features.streamAnimation.type = "glyph-cycle"`.
 *
 * ```ts
 * import "@runtypelabs/persona/animations/glyph-cycle";
 * createAgentExperience(el, {
 *   features: { streamAnimation: { type: "glyph-cycle" } },
 * });
 * ```
 */

const STYLES = `
[data-persona-root] .persona-stream-glyph-cycle .persona-stream-char {
  animation: persona-stream-glyph-cycle-fade
    calc(var(--persona-stream-step, 120ms) * 1.5) ease-out both;
}
[data-persona-root] .persona-stream-glyph-cycle .persona-stream-char[data-glyph-cycle-final] {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
@keyframes persona-stream-glyph-cycle-fade {
  from { opacity: 0.35; }
  to   { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  [data-persona-root] .persona-stream-glyph-cycle .persona-stream-char {
    animation: none !important;
    opacity: 1 !important;
  }
}
`.trim();

// Matches the source design: alphanumerics + a small set of symbols.
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@";
const TICK_COUNT = 10;
// Base interval between glyph swaps (ms). Scaled by the widget's configured
// `speed` so the cycle feels coherent with the rest of the stream animation —
// faster speed → snappier cycling, slower speed → more deliberate flicker.
const BASE_TICK_MS = 120;
const DEFAULT_STEP_MS = 120;
// Probability that each later still-cycling sibling gets re-randomized on
// every tick. Matches the source prototype's cross-glyph jitter feel.
const CROSS_FLICKER_PROBABILITY = 0.4;
// Hold the stream back until at least this many chars have arrived. Once
// released, every char is rendered as a random glyph and settles in order
// from the start — so the visible animation carries through the full text.
const BUFFER_THRESHOLD = 50;

const getStepMs = (container: HTMLElement | null): number => {
  if (!container) return DEFAULT_STEP_MS;
  const raw = container.style.getPropertyValue("--persona-stream-step")?.trim();
  const match = raw.match(/([\d.]+)\s*ms/);
  return match ? parseFloat(match[1]) : DEFAULT_STEP_MS;
};

const getTickMs = (span: HTMLElement): number => {
  const container = span.closest(".persona-stream-glyph-cycle") as HTMLElement | null;
  const step = getStepMs(container);
  return (BASE_TICK_MS * step) / DEFAULT_STEP_MS;
};

const randomGlyph = (avoid?: string): string => {
  let ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
  // Don't settle on the same random glyph twice in a row (small visual cue
  // that something is actually cycling).
  if (avoid && ch === avoid) {
    ch = GLYPHS[(GLYPHS.indexOf(ch) + 1) % GLYPHS.length];
  }
  return ch;
};

// Mirrors the source prototype's "lightly randomize later glyphs" step: while
// a char is cycling, every not-yet-settled char after it in DOM order has a
// chance to flicker too. Keeps the un-settled tail feeling alive.
const flickerLaterSiblings = (span: HTMLElement): void => {
  const container = span.closest(".persona-stream-glyph-cycle") as HTMLElement | null;
  if (!container) return;
  // Any scheduled char that still has its final char stashed is "pending
  // or cycling" — both kinds are valid flicker targets. Settled chars have
  // `data-glyph-cycle-final` deleted and are excluded.
  const unsettled = container.querySelectorAll<HTMLElement>(
    ".persona-stream-char[data-glyph-cycle-final]"
  );
  let seenSelf = false;
  for (const other of Array.from(unsettled)) {
    if (other === span) {
      seenSelf = true;
      continue;
    }
    if (!seenSelf) continue;
    if (Math.random() < CROSS_FLICKER_PROBABILITY) {
      other.textContent = randomGlyph();
    }
  }
};

// Per-container timestamp tracking: when the next char's cycle should settle.
// Each char starts cycling immediately on schedule — no static placeholder
// wait — and finishes when `Date.now() >= settleAt`. This slot advances by
// one stagger step per schedule, so the burst settles left-to-right while
// every char is visibly flickering from the moment it enters the DOM.
const containerNextSettleAt = new WeakMap<Element, number>();

// Adaptive stagger state. We measure the real interval between scheduleCycle
// calls (= the stream's arrival cadence) and pace the glyph wave to it, a
// touch faster (DRAIN_FACTOR < 1) so any initial burst queue drains down to
// live-tracking instead of permanently lagging behind the live cursor.
const DEFAULT_ARRIVAL_MS = 25;
const STAGGER_DRAIN_FACTOR = 0.5;
const MIN_STAGGER_MS = 6;
const EMA_ALPHA = 0.25;
const containerLastScheduleAt = new WeakMap<Element, number>();
const containerArrivalMs = new WeakMap<Element, number>();

const observeStagger = (container: Element | null, now: number): number => {
  if (!container) return DEFAULT_ARRIVAL_MS * STAGGER_DRAIN_FACTOR;
  const last = containerLastScheduleAt.get(container);
  containerLastScheduleAt.set(container, now);
  let observed = containerArrivalMs.get(container) ?? DEFAULT_ARRIVAL_MS;
  if (last !== undefined) {
    const interval = now - last;
    // Skip near-zero intervals (burst within one MutationObserver batch) —
    // they don't reflect the real stream cadence.
    if (interval > 1) {
      observed = observed * (1 - EMA_ALPHA) + interval * EMA_ALPHA;
      containerArrivalMs.set(container, observed);
    }
  }
  return Math.max(MIN_STAGGER_MS, observed * STAGGER_DRAIN_FACTOR);
};

// Per-message count of in-flight cycles (scheduled or actively ticking).
// Used by `isAnimating()` so message-bubble keeps rendering in animated
// mode until the cycle wave finishes, even after `message.streaming` is
// false.
const activeCyclesByMessage = new Map<string, number>();

const getMessageId = (span: HTMLElement): string | null => {
  const bubble = span.closest<HTMLElement>("[data-message-id]");
  return bubble?.dataset.messageId ?? null;
};

const incrementActive = (messageId: string | null): void => {
  if (!messageId) return;
  activeCyclesByMessage.set(messageId, (activeCyclesByMessage.get(messageId) ?? 0) + 1);
};

const decrementActive = (messageId: string | null): void => {
  if (!messageId) return;
  const count = activeCyclesByMessage.get(messageId) ?? 0;
  if (count <= 1) activeCyclesByMessage.delete(messageId);
  else activeCyclesByMessage.set(messageId, count - 1);
};

const scheduleCycle = (span: HTMLElement): void => {
  if (span.dataset.glyphCycleScheduled === "true") return;
  const finalChar = span.textContent ?? "";
  if (!finalChar || /\s/.test(finalChar)) return;

  span.dataset.glyphCycleScheduled = "true";
  // Stash the target char and immediately paint a random glyph so the span
  // reads as "cycling" even before its staggered kickoff. Also opt out of
  // morph — without this, streamed token re-renders would overwrite our
  // placeholder glyph with the final char.
  span.dataset.glyphCycleFinal = finalChar;
  span.setAttribute("data-preserve-runtime", "stream-glyph-cycle");
  span.textContent = randomGlyph();
  // Record the owning message so `isAnimating()` can report in-flight work
  // even after streaming has ended.
  const messageId = getMessageId(span);
  if (messageId) span.dataset.glyphCycleMessageId = messageId;
  incrementActive(messageId);

  const container = span.closest(".persona-stream-glyph-cycle") as HTMLElement | null;
  const now = Date.now();
  const staggerMs = observeStagger(container, now);
  const tickMs = getTickMs(span);
  const baseDurationMs = TICK_COUNT * tickMs;

  // Settle time = later of (this char's own cycle ends) or (previous settle
  // slot + one stagger step). The `max()` keeps left-to-right order during
  // bursts, while post-drain live chars just get the base cycle.
  let settleAt = now + baseDurationMs;
  if (container) {
    const prev = containerNextSettleAt.get(container);
    if (prev !== undefined) settleAt = Math.max(settleAt, prev);
    containerNextSettleAt.set(container, settleAt + staggerMs);
  }

  startCycle(span, finalChar, settleAt);
};

const startCycle = (
  span: HTMLElement,
  finalChar: string,
  settleAt: number
): void => {
  if (span.dataset.glyphCycleStarted === "true") return;
  span.dataset.glyphCycleStarted = "true";

  const tickMs = getTickMs(span);
  // Seed `lastGlyph` from the placeholder scheduleCycle painted, so the
  // first real tick guarantees a different glyph.
  let lastGlyph: string | undefined = span.textContent ?? undefined;
  const step = () => {
    if (!span.isConnected) return;
    if (Date.now() >= settleAt) {
      span.textContent = finalChar;
      span.removeAttribute("data-preserve-runtime");
      delete span.dataset.glyphCycleStarted;
      delete span.dataset.glyphCycleFinal;
      decrementActive(span.dataset.glyphCycleMessageId ?? null);
      delete span.dataset.glyphCycleMessageId;
      // Keep `data-glyph-cycle-scheduled` set so the MutationObserver and
      // processCharSpans selectors skip settled chars on future re-morphs.
      return;
    }
    const glyph = randomGlyph(lastGlyph);
    span.textContent = glyph;
    lastGlyph = glyph;
    flickerLaterSiblings(span);
    setTimeout(step, tickMs);
  };
  setTimeout(step, tickMs);
};

const processCharSpans = (root: Element | Document | ShadowRoot): void => {
  const spans = root.querySelectorAll?.(
    ".persona-stream-glyph-cycle .persona-stream-char:not([data-glyph-cycle-scheduled])"
  );
  if (!spans) return;
  for (const span of Array.from(spans)) {
    scheduleCycle(span as HTMLElement);
  }
};

const isElement = (node: Node): node is HTMLElement => node.nodeType === 1;

export const glyphCycle: StreamAnimationPlugin = {
  name: "glyph-cycle",
  containerClass: "persona-stream-glyph-cycle",
  wrap: "char",
  // Narrow the default skip list so inline `<code>` and fenced `<pre>`
  // code blocks both render as cycling glyphs along with everything else.
  // Links stay clickable; <script>/<style> stay untouched.
  skipTags: ["a", "script", "style"],
  styles: STYLES,
  bufferContent(content) {
    // Hold the bubble empty until we've accumulated enough text to run a
    // visible cycle from the start.
    if (content.length < BUFFER_THRESHOLD) return "";
    // Then trim to the last "safe" whitespace: one that sits outside any
    // unclosed `**bold**` pair. Without this, whitespace INSIDE a partial
    // bold pair (e.g. the space between `template` and `literal` in
    // `**template literal**`) would trigger a render of the partial
    // `**template`, which markdown emits as literal asterisks, gets
    // wrapped + marked `data-preserve-runtime`, and leaks through later
    // morphs — the final structure can't reconcile.
    let boldPairs = 0;
    let lastSafe = -1;
    let i = 0;
    while (i < content.length) {
      if (content[i] === "*" && content[i + 1] === "*") {
        boldPairs += 1;
        i += 2;
        continue;
      }
      if (/\s/.test(content[i]) && boldPairs % 2 === 0) {
        lastSafe = i;
      }
      i += 1;
    }
    if (lastSafe < 0) return "";
    return content.slice(0, lastSafe);
  },
  isAnimating(message) {
    return (activeCyclesByMessage.get(message.id) ?? 0) > 0;
  },
  onAttach(root) {
    // Process any chars already in the DOM when the plugin activates.
    processCharSpans(root as Element | Document | ShadowRoot);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!isElement(node)) continue;
          // Either the added node is a char span inside a glyph-cycle
          // container, or it contains char spans (a word-group, paragraph,
          // or whole bubble that was just morphed in).
          if (
            node.classList.contains("persona-stream-char") &&
            node.closest(".persona-stream-glyph-cycle")
          ) {
            scheduleCycle(node);
          } else {
            processCharSpans(node);
          }
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true });

    return () => observer.disconnect();
  },
};

// Auto-register on import. ESM consumers get zero cost if they don't import;
// once imported, the plugin is available globally by name without requiring
// an explicit `plugins: { "glyph-cycle": glyphCycle }` config.
registerStreamAnimationPlugin(glyphCycle);

export default glyphCycle;
