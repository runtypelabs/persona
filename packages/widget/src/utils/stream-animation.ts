import type {
  AgentWidgetMessage,
  AgentWidgetStreamAnimationBuffer,
  AgentWidgetStreamAnimationBuiltinType,
  AgentWidgetStreamAnimationFeature,
  AgentWidgetStreamAnimationPlaceholder,
  AgentWidgetStreamAnimationType,
  StreamAnimationPlugin,
} from "../types";

export type ResolvedStreamAnimation = {
  type: AgentWidgetStreamAnimationType;
  placeholder: AgentWidgetStreamAnimationPlaceholder;
  speed: number;
  duration: number;
  buffer: AgentWidgetStreamAnimationBuffer;
};

const DEFAULT_STREAM_ANIMATION: ResolvedStreamAnimation = {
  type: "none",
  placeholder: "none",
  speed: 120,
  duration: 1800,
  buffer: "none",
};

/** Default tags whose text descendants are not wrapped. Plugins can override. */
const DEFAULT_SKIP_TAGS = ["pre", "code", "a", "script", "style"];

export const resolveStreamAnimation = (
  feature: AgentWidgetStreamAnimationFeature | undefined
): ResolvedStreamAnimation => ({
  type: feature?.type ?? DEFAULT_STREAM_ANIMATION.type,
  placeholder: feature?.placeholder ?? DEFAULT_STREAM_ANIMATION.placeholder,
  speed: feature?.speed ?? DEFAULT_STREAM_ANIMATION.speed,
  duration: feature?.duration ?? DEFAULT_STREAM_ANIMATION.duration,
  buffer: feature?.buffer ?? DEFAULT_STREAM_ANIMATION.buffer,
});

/* ============================================================
   Plugin registry
   ============================================================ */

/**
 * Built-in animations ship with the core widget — CSS lives in widget.css
 * and no subpath import is required. They register automatically.
 *
 * Other animations (`letter-rise`, `word-fade`, `wipe`, `glyph-cycle`) are
 * tree-shakeable subpath plugins — consumers import them from
 * `@runtypelabs/persona/animations/<name>` and they auto-register on load.
 */
const BUILTIN_PLUGINS: StreamAnimationPlugin[] = [
  {
    name: "typewriter",
    containerClass: "persona-stream-typewriter",
    wrap: "char",
    useCaret: true,
  },
  {
    name: "pop-bubble",
    bubbleClass: "persona-stream-pop",
    wrap: "none",
  },
  {
    name: "letter-rise",
    containerClass: "persona-stream-letter-rise",
    wrap: "char",
  },
  {
    name: "word-fade",
    containerClass: "persona-stream-word-fade",
    wrap: "word",
  },
];

/**
 * Global registry populated by:
 * - the core built-ins below (always available)
 * - `registerStreamAnimationPlugin()` calls from subpath animation modules
 *   (invoked automatically when consumers `import` them)
 * - IIFE bundle's bootstrap code (pre-registers all built-ins for script-tag
 *   consumers)
 */
const globalRegistry = new Map<string, StreamAnimationPlugin>();
for (const plugin of BUILTIN_PLUGINS) globalRegistry.set(plugin.name, plugin);

/**
 * Register a custom stream animation plugin globally. Subsequent widget
 * instances can reference the plugin by `name` in `features.streamAnimation.type`.
 * Per-widget plugin overrides via `features.streamAnimation.plugins` take
 * precedence over the global registry.
 */
export const registerStreamAnimationPlugin = (plugin: StreamAnimationPlugin): void => {
  globalRegistry.set(plugin.name, plugin);
};

export const unregisterStreamAnimationPlugin = (name: string): void => {
  // Built-ins are preserved; only external plugins can be unregistered.
  if (BUILTIN_PLUGINS.some((p) => p.name === name)) return;
  globalRegistry.delete(name);
};

export const listRegisteredStreamAnimations = (): string[] =>
  Array.from(globalRegistry.keys());

/**
 * Resolve the plugin for a given type. Per-instance overrides take precedence
 * over the global registry. Returns null for `"none"` or unknown types.
 */
export const resolveStreamAnimationPlugin = (
  type: AgentWidgetStreamAnimationType,
  overrides?: Record<string, StreamAnimationPlugin>
): StreamAnimationPlugin | null => {
  if (type === "none") return null;
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, type)) {
    return overrides[type] ?? null;
  }
  return globalRegistry.get(type) ?? null;
};

/* ============================================================
   Buffering
   ============================================================ */

/**
 * Apply content buffering to hide in-progress words or lines during streaming.
 * Custom strategies via `plugin.bufferContent` take precedence over `buffer`.
 */
export const applyStreamBuffer = (
  content: string,
  buffer: AgentWidgetStreamAnimationBuffer,
  plugin: StreamAnimationPlugin | null,
  message: AgentWidgetMessage,
  streaming: boolean
): string => {
  if (!streaming) return content;
  if (plugin?.bufferContent) return plugin.bufferContent(content, message);
  if (!content) return content;
  if (buffer === "word") {
    const lastSpace = content.search(/\s(?=\S*$)/);
    if (lastSpace < 0) return "";
    return content.slice(0, lastSpace);
  }
  if (buffer === "line") {
    const lastNewline = content.lastIndexOf("\n");
    if (lastNewline < 0) return "";
    return content.slice(0, lastNewline);
  }
  return content;
};

/* ============================================================
   Wrapping
   ============================================================ */

const makeCharSpan = (
  doc: Document,
  ch: string,
  messageId: string,
  index: number
): HTMLElement => {
  const span = doc.createElement("span");
  span.className = "persona-stream-char";
  span.id = `stream-c-${messageId}-${index}`;
  span.style.setProperty("--char-index", String(index));
  span.textContent = ch;
  return span;
};

const makeWordSpan = (
  doc: Document,
  word: string,
  messageId: string,
  index: number
): HTMLElement => {
  const span = doc.createElement("span");
  span.className = "persona-stream-word";
  span.id = `stream-w-${messageId}-${index}`;
  span.style.setProperty("--word-index", String(index));
  span.textContent = word;
  return span;
};

const WHITESPACE_RE = /\s/;

const shouldSkipSubtree = (node: Node, skipTags: Set<string>): boolean => {
  let current: Node | null = node.parentNode;
  while (current) {
    if (current.nodeType === 1) {
      const el = current as Element;
      if (skipTags.has(el.tagName.toLowerCase())) return true;
    }
    current = current.parentNode;
  }
  return false;
};

const wrapTextNodeChars = (
  textNode: Text,
  messageId: string,
  counterRef: { value: number }
): void => {
  const doc = textNode.ownerDocument;
  const parent = textNode.parentNode;
  if (!doc || !parent) return;
  const text = textNode.nodeValue ?? "";
  if (!text) return;
  const fragment = doc.createDocumentFragment();
  let i = 0;
  while (i < text.length) {
    if (WHITESPACE_RE.test(text[i])) {
      // Keep whitespace as a plain text node so the browser preserves natural
      // word-break opportunities between words. `display: inline-block` spans
      // swallow single-space content, so wrapping whitespace would collapse
      // the spaces and break line wrapping.
      let j = i;
      while (j < text.length && WHITESPACE_RE.test(text[j])) j += 1;
      fragment.appendChild(doc.createTextNode(text.slice(i, j)));
      i = j;
    } else {
      // Wrap each run of non-whitespace chars in a `white-space: nowrap`
      // group so the browser doesn't break lines between individual char
      // spans mid-word. Word boundaries (whitespace) stay as plain text
      // nodes between groups, preserving natural line-break opportunities.
      const group = doc.createElement("span");
      group.className = "persona-stream-word-group";
      let j = i;
      while (j < text.length && !WHITESPACE_RE.test(text[j])) {
        group.appendChild(makeCharSpan(doc, text[j], messageId, counterRef.value));
        counterRef.value += 1;
        j += 1;
      }
      fragment.appendChild(group);
      i = j;
    }
  }
  parent.replaceChild(fragment, textNode);
};

const wrapTextNodeWords = (
  textNode: Text,
  messageId: string,
  counterRef: { value: number }
): void => {
  const doc = textNode.ownerDocument;
  const parent = textNode.parentNode;
  if (!doc || !parent) return;
  const text = textNode.nodeValue ?? "";
  if (!text) return;
  const fragment = doc.createDocumentFragment();
  const tokens = text.split(/(\s+)/);
  for (const token of tokens) {
    if (!token) continue;
    if (/^\s+$/.test(token)) {
      fragment.appendChild(doc.createTextNode(token));
    } else {
      fragment.appendChild(makeWordSpan(doc, token, messageId, counterRef.value));
      counterRef.value += 1;
    }
  }
  parent.replaceChild(fragment, textNode);
};

/**
 * Wrap plain-text nodes in the sanitized markdown HTML with per-char or per-word
 * spans suitable for staggered CSS animations. Skips descendants of `<pre>`,
 * `<code>`, and `<a>` so code blocks stay legible and link click targets stay intact.
 *
 * Each wrapped span carries a stable `id` (`stream-c-{messageId}-{N}` or
 * `stream-w-{messageId}-{N}`) so idiomorph preserves existing spans across
 * token-by-token re-renders — animations on already-streamed characters never
 * restart.
 */
export const wrapStreamAnimation = (
  html: string,
  mode: "char" | "word",
  messageId: string,
  options?: { skipTags?: string[] }
): string => {
  if (!html) return html;
  if (typeof document === "undefined") return html;

  const scratch = document.createElement("div");
  scratch.innerHTML = html;

  const skipTags = new Set((options?.skipTags ?? DEFAULT_SKIP_TAGS).map((t) => t.toLowerCase()));
  const walker = document.createTreeWalker(scratch, NodeFilter.SHOW_TEXT, null);
  const textNodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    if (!shouldSkipSubtree(node, skipTags)) {
      textNodes.push(node as Text);
    }
    node = walker.nextNode();
  }

  const counterRef = { value: 0 };
  const wrap = mode === "char" ? wrapTextNodeChars : wrapTextNodeWords;
  for (const textNode of textNodes) {
    wrap(textNode, messageId, counterRef);
  }

  return scratch.innerHTML;
};

/* ============================================================
   Supporting helpers
   ============================================================ */

/**
 * Build the caret element for `typewriter` mode. Carries
 * `data-preserve-animation` so idiomorph keeps the blink running across
 * token re-renders.
 */
export const createStreamCaret = (doc: Document = document): HTMLElement => {
  const caret = doc.createElement("span");
  caret.className = "persona-stream-caret";
  caret.setAttribute("aria-hidden", "true");
  caret.setAttribute("data-preserve-animation", "stream-caret");
  return caret;
};

/**
 * Shimmer placeholder shown before the first token arrives — and, when the
 * `"line"` buffer strategy is active, reshown between lines. A single
 * full-width bar; we don't know ahead of time how wide the next line will be,
 * so committing to one width avoids implying structure the stream won't match.
 */
export const createSkeletonPlaceholder = (doc: Document = document): HTMLElement => {
  const wrapper = doc.createElement("div");
  wrapper.className = "persona-stream-skeleton";
  wrapper.setAttribute("data-preserve-animation", "stream-skeleton");
  wrapper.setAttribute("aria-hidden", "true");
  const line = doc.createElement("div");
  line.className = "persona-stream-skeleton-line";
  wrapper.appendChild(line);
  return wrapper;
};

/* ============================================================
   Plugin style + attach lifecycle
   ============================================================ */

/**
 * Track which plugins have injected their CSS into a given root already.
 * Prevents duplicate <style> tags across widget instances or re-renders.
 */
const injectedStyleRoots = new WeakMap<HTMLElement | ShadowRoot, Set<string>>();

export const injectPluginStyles = (
  plugin: StreamAnimationPlugin,
  root: HTMLElement | ShadowRoot
): void => {
  if (!plugin.styles) return;
  let names = injectedStyleRoots.get(root);
  if (!names) {
    names = new Set();
    injectedStyleRoots.set(root, names);
  }
  if (names.has(plugin.name)) {
    // The tracking Set says we injected this plugin's styles, but the actual
    // <style> node may have been removed (e.g. host cleared via `innerHTML = ""`
    // during widget re-init). Fall through and re-inject if the tag is gone.
    const escaped = plugin.name.replace(/["\\]/g, "\\$&");
    const existing = root.querySelector(
      `style[data-persona-animation="${escaped}"]`
    );
    if (existing) return;
    names.delete(plugin.name);
  }
  names.add(plugin.name);
  const doc = root instanceof ShadowRoot ? root.ownerDocument : root.ownerDocument ?? document;
  const style = doc.createElement("style");
  style.setAttribute("data-persona-animation", plugin.name);
  style.textContent = plugin.styles;
  root.appendChild(style);
};

/**
 * Attach detach-tracking state for plugins registered to a widget root.
 */
const attachedCleanups = new WeakMap<
  HTMLElement | ShadowRoot,
  Map<string, (() => void) | void>
>();

export const attachPlugin = (
  plugin: StreamAnimationPlugin,
  root: HTMLElement | ShadowRoot
): void => {
  if (!plugin.onAttach) return;
  let cleanups = attachedCleanups.get(root);
  if (!cleanups) {
    cleanups = new Map();
    attachedCleanups.set(root, cleanups);
  }
  if (cleanups.has(plugin.name)) return;
  const cleanup = plugin.onAttach(root);
  cleanups.set(plugin.name, cleanup);
};

export const detachAllPlugins = (root: HTMLElement | ShadowRoot): void => {
  const cleanups = attachedCleanups.get(root);
  if (!cleanups) return;
  for (const cleanup of cleanups.values()) {
    if (typeof cleanup === "function") cleanup();
  }
  cleanups.clear();
};

/**
 * Ensure the plugin's one-time side effects (style injection, onAttach) have
 * run for this widget root. Idempotent — safe to call on every render.
 */
export const ensurePluginActive = (
  plugin: StreamAnimationPlugin,
  root: HTMLElement | ShadowRoot
): void => {
  injectPluginStyles(plugin, root);
  attachPlugin(plugin, root);
};

/* ============================================================
   Back-compat helpers (used by existing tests)
   ============================================================ */

export const isPerCharAnimation = (type: AgentWidgetStreamAnimationType): boolean => {
  const plugin = resolveStreamAnimationPlugin(type);
  return plugin?.wrap === "char";
};

export const isPerWordAnimation = (type: AgentWidgetStreamAnimationType): boolean => {
  const plugin = resolveStreamAnimationPlugin(type);
  return plugin?.wrap === "word";
};

export const isWrappingAnimation = (type: AgentWidgetStreamAnimationType): boolean =>
  isPerCharAnimation(type) || isPerWordAnimation(type);

export const streamAnimationContainerClass = (
  type: AgentWidgetStreamAnimationType
): string | null => resolveStreamAnimationPlugin(type)?.containerClass ?? null;

export const streamAnimationBubbleClass = (
  type: AgentWidgetStreamAnimationType
): string | null => resolveStreamAnimationPlugin(type)?.bubbleClass ?? null;

// Re-export the builtin type literal so tests and consumers can reference it.
export type { AgentWidgetStreamAnimationBuiltinType };
