import { createElement } from "../utils/dom";
import { createSpinner } from "../utils/spinner";
import type {
  AgentWidgetConfig,
  AgentWidgetMessage,
  PersonaArtifactRecord,
} from "../types";
import { extractFileSource, fileKindOf, fileTypeLabel } from "../utils/artifact-file";
import { applyArtifactLoadingStatus } from "../utils/artifact-loading-status";
import { highlightCode } from "../utils/code-highlight";
import { escapeHtml, createMarkdownProcessorFromConfig } from "../postprocessors";
import { getMarkdownParsersSync, onMarkdownParsersReady } from "../markdown-parsers-loader";
import { resolveSanitizer } from "../utils/sanitize";
import {
  componentRegistry,
  type ComponentContext,
  type ComponentRenderer,
} from "./registry";

/**
 * Shared artifact preview body renderer.
 *
 * Renders the *body* of an artifact — rendered markdown, sandboxed file
 * preview iframe, or registry-resolved component — without any surrounding
 * chrome. The artifact pane delegates its content area here, and the inline
 * transcript block (display: "inline") consumes the same renderer, so both
 * surfaces stay pixel- and behavior-identical.
 */

export type ArtifactPreviewViewMode = "rendered" | "source";

/**
 * Clipboard payload for an artifact, shared by the pane copy control and the
 * inline chrome copy button so both derive the same text:
 * - plain markdown artifacts → the raw markdown
 * - previewable file artifacts → the raw unfenced file source
 * - component artifacts → pretty-printed `{ component, props }` JSON
 */
export function artifactCopyText(
  record: PersonaArtifactRecord | undefined
): string {
  if (!record) return "";
  if (record.artifactType === "markdown") {
    const raw = record.markdown ?? "";
    return record.file ? extractFileSource(raw) : raw;
  }
  return JSON.stringify(
    { component: record.component, props: record.props },
    null,
    2
  );
}

/**
 * Resolved body-layout options for the inline block. Threaded through
 * {@link ArtifactPreviewContext.bodyLayout} by `artifact-inline.ts` (resolved
 * from `features.artifacts.inlineBody`). When absent — the pane path — the body
 * renders content-sized exactly as before; none of the fixed-window / follow /
 * fade / status / transition behavior below engages.
 */
export type ArtifactBodyLayout = {
  /** Streaming body: `"source"` shows the source window, `"status"` a placeholder. */
  streamingView: "source" | "status";
  /**
   * Complete-state view: `"source"` always shows raw highlighted source (no
   * iframe, no rendered markdown). `ctx.resolveViewMode` still wins when set.
   */
  viewMode: "rendered" | "source";
  /** Reserved streaming height (px) or `"auto"` (grow with content). */
  streamingHeight: number | "auto";
  /** Complete-state height cap (px) or `"auto"` (content-sized). */
  completeHeight: number | "auto";
  /** Tail-follow the newest lines while a numeric-height source window streams. */
  followOutput: boolean;
  /**
   * Overflow handling for a fixed-height source window. `"scroll"` (default) is
   * an internally scrollable, tail-following window; `"clip"` is a fixed-height
   * window showing the TOP of the document with `overflow: hidden`, no internal
   * scroll listeners, and no tail-follow (`resolveInlineBody` forces
   * `followOutput` off and the bottom-only fade default in this mode).
   */
  overflow: "scroll" | "clip";
  /** Show a top edge fade on the fixed window when content is clipped above. */
  fadeTop: boolean;
  /** Show a bottom edge fade on the fixed window when content is clipped below. */
  fadeBottom: boolean;
  /** Wrap the streaming→complete swap in a View Transition when supported. */
  transition: "auto" | "none";
  /**
   * What the inline block becomes once the artifact completes. `"inline"`
   * (default) keeps the streamed body in place; `"card"` collapses the block to
   * the compact reference card. Consumed only by the inline block component
   * (`artifact-inline.ts`) — the shared preview renderer ignores it.
   */
  completeDisplay: "inline" | "card";
};

export type ArtifactPreviewContext = {
  config: AgentWidgetConfig;
  /**
   * Component registry used to resolve component artifacts. Defaults to the
   * global `componentRegistry`.
   */
  registry?: { get(name: string): ComponentRenderer | undefined };
  /**
   * Host hook for the pane's rendered/source toolbar toggle. Re-read on every
   * `update()`; return `"source"` to show raw source instead of the preview
   * for the given record. Only affects markdown and file records — component
   * records always render through the registry. Defaults to `"rendered"`.
   */
  resolveViewMode?: (record: PersonaArtifactRecord) => ArtifactPreviewViewMode;
  /**
   * Inline-block body layout (fixed streaming window, tail-follow, fade,
   * status view). Set only on the inline path; when omitted the body is
   * content-sized as before (pane path).
   */
  bodyLayout?: ArtifactBodyLayout;
};

/**
 * Module-level guard so only one inline body swap animates at a time — a burst
 * of artifacts completing together must not stack overlapping View Transitions
 * (each captures the whole document).
 */
let bodyTransitionInFlight = false;

/**
 * `view-transition-name` must be a valid CSS custom-ident; artifact ids may
 * carry characters that aren't, so map anything outside `[A-Za-z0-9_-]` to `-`
 * and prefix a stable namespace (idents also can't start with a digit).
 */
function sanitizeViewTransitionName(id: string): string {
  const base = (id || "artifact").replace(/[^A-Za-z0-9_-]/g, "-").replace(/^-+/, "");
  return "persona-artifact-vt-" + (base || "artifact");
}

/**
 * Run the streaming→complete body swap, animated via the View Transitions API
 * when `transition` is `"auto"`, the API exists, `prefers-reduced-motion` is
 * off, and no other body swap is mid-flight; otherwise swap instantly. The swap
 * callback performs the actual DOM mutation either way, so callers always see
 * the new DOM (synchronously on the fallback path).
 */
export function runArtifactBodyTransition(
  target: HTMLElement | null,
  transition: "auto" | "none",
  id: string,
  swap: () => void
): void {
  const start =
    typeof document !== "undefined"
      ? (
          document as unknown as {
            startViewTransition?: (cb: () => void) => { finished: Promise<void> };
          }
        ).startViewTransition
      : undefined;
  let reduceMotion = false;
  try {
    reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    reduceMotion = false;
  }
  if (
    transition !== "auto" ||
    !target ||
    typeof start !== "function" ||
    bodyTransitionInFlight ||
    reduceMotion
  ) {
    swap();
    return;
  }
  bodyTransitionInFlight = true;
  const name = sanitizeViewTransitionName(id);
  target.style.setProperty("view-transition-name", name);
  const done = () => {
    bodyTransitionInFlight = false;
    target.style.removeProperty("view-transition-name");
  };
  try {
    const vt = start.call(document, () => {
      swap();
    });
    vt.finished.then(done, done);
  } catch {
    done();
    swap();
  }
}

export type ArtifactPreviewBodyHandle = {
  /**
   * Stable wrapper element (styled `display: contents`, so children lay out
   * as if they were direct children of the host container). Keep it attached
   * across `update()` calls: re-attaching would reload a live file-preview
   * iframe.
   */
  el: HTMLElement;
  /** Apply streaming deltas / status changes (may be a different record). */
  update(record: PersonaArtifactRecord): void;
};

const PRE_CLASS =
  "persona-font-mono persona-text-xs persona-whitespace-pre-wrap persona-break-words persona-text-persona-primary";
const MARKDOWN_WRAP_CLASS =
  "persona-text-sm persona-leading-relaxed persona-markdown-bubble";

/** Inspector card shown when a component artifact has no registered renderer. */
function fallbackComponentCard(record: PersonaArtifactRecord): HTMLElement {
  const card = createElement(
    "div",
    "persona-rounded-lg persona-border persona-border-persona-border persona-p-3 persona-text-persona-primary"
  );
  const title = createElement("div", "persona-font-semibold persona-text-sm persona-mb-2");
  title.textContent = record.component ? `Component: ${record.component}` : "Component";
  const pre = createElement(
    "pre",
    "persona-font-mono persona-text-xs persona-whitespace-pre-wrap persona-overflow-x-auto"
  );
  pre.textContent = JSON.stringify(record.props ?? {}, null, 2);
  card.appendChild(title);
  card.appendChild(pre);
  return card;
}

/** Render context handed to a custom `filePreview.loading.renderIndicator`. */
type PreviewIndicatorContext = {
  artifactId: string;
  config: AgentWidgetConfig;
};

type PreviewLoadingObject = {
  delayMs?: number;
  minVisibleMs?: number;
  timeoutMs?: number;
  injectReadySignal?: boolean;
  label?: string | false;
  labelDelayMs?: number;
  renderIndicator?: (ctx: PreviewIndicatorContext) => HTMLElement | null;
};

/** Resolved preview-loading options (see `filePreview.loading`). */
type ResolvedPreviewLoading = {
  enabled: boolean;
  delayMs: number;
  minVisibleMs: number;
  timeoutMs: number;
  injectReadySignal: boolean;
  /** Escalation label text, or `false` for an icon-only indicator forever. */
  label: string | false;
  /** Delay before the escalation label fades in, from when the overlay shows. */
  labelDelayMs: number;
  /** Host override for the whole indicator; `undefined` uses the spinner+label. */
  renderIndicator?: (ctx: PreviewIndicatorContext) => HTMLElement | null;
};

/**
 * Resolve `filePreview.loading` to concrete values. `false` disables the overlay
 * and injected reporter entirely; `true` / `undefined` / an object with holes
 * fall back to the documented defaults.
 */
function resolvePreviewLoading(
  loading: boolean | PreviewLoadingObject | undefined
): ResolvedPreviewLoading {
  if (loading === false) {
    return {
      enabled: false,
      delayMs: 0,
      minVisibleMs: 0,
      timeoutMs: 0,
      injectReadySignal: false,
      label: "Starting preview...",
      labelDelayMs: 2000,
    };
  }
  const o = loading && typeof loading === "object" ? loading : undefined;
  return {
    enabled: true,
    delayMs: o?.delayMs ?? 200,
    minVisibleMs: o?.minVisibleMs ?? 300,
    timeoutMs: o?.timeoutMs ?? 8000,
    injectReadySignal: o?.injectReadySignal !== false,
    // `label: false` disables the escalation text; a string overrides the default.
    label: o?.label === false ? false : (o?.label ?? "Starting preview..."),
    labelDelayMs: o?.labelDelayMs ?? 2000,
    renderIndicator: o?.renderIndicator,
  };
}

/** How long the overlay fade-out runs before removal; matches the CSS transition. */
const PREVIEW_FADE_MS = 220;

/**
 * Random token tying a ready `postMessage` to the exact iframe build that
 * injected it. Collision is harmless — worst case an early overlay dismiss, not
 * a security issue — so `Math.random` is an acceptable fallback for `crypto`.
 */
function makePreviewToken(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const a = new Uint32Array(2);
      crypto.getRandomValues(a);
      return a[0].toString(36) + a[1].toString(36);
    }
  } catch {
    /* fall through */
  }
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

/**
 * Inline reporter APPENDED (never prepended — a script before `<!doctype html>`
 * would trip quirks mode) to the srcdoc. On `window` load it waits a double
 * `requestAnimationFrame` (a cheap "content has painted" heuristic) then posts
 * the ready signal to the parent. The `token` is JSON-quoted so it can't break
 * out of the string literal.
 */
function buildReadyReporter(token: string): string {
  return (
    "\n<script>(function(){var d=false;var t=" +
    JSON.stringify(token) +
    ";function r(){if(d)return;d=true;try{parent.postMessage({persona:'artifact-preview-ready',token:t},'*');}catch(e){}}" +
    // Race a double-rAF (paint heuristic) against a short timeout: the parent's
    // opaque loading overlay can make the browser treat this (process-isolated)
    // iframe as occluded and throttle its rendering, in which case rAF callbacks
    // stall indefinitely — the overlay would delay its own dismissal signal. The
    // timeout keeps the signal bounded; the rAF path stays paint-accurate when
    // frames are being produced.
    "function s(){if(typeof requestAnimationFrame==='function'){requestAnimationFrame(function(){requestAnimationFrame(r);});}setTimeout(r,150);}" +
    // Split the closing tag so this JS string can't prematurely close a host
    // <script> if the bundle is ever inlined; the srcdoc still receives </script>.
    "if(document.readyState==='complete'){s();}else{window.addEventListener('load',s);}})();</scr" +
    "ipt>"
  );
}

/** Overlay handle: the element plus a callback that fades the escalation label in. */
type PreviewOverlayHandle = {
  el: HTMLElement;
  /**
   * Reveal the escalation label. No-op when the label is disabled
   * (`label: false`) or a custom `renderIndicator` owns the content.
   */
  revealLabel: () => void;
};

/**
 * Build the preview-loading overlay content.
 *
 * Default indicator: an icon spinner with NO text (icon-first per HIG/Geist/
 * Sandpack — text-only "loading" is used by no reputable preview surface). The
 * optional escalation label is rendered hidden and only faded in later, from
 * `setupPreviewLoading`, once the wait crosses `labelDelayMs`.
 *
 * `renderIndicator` (host override): called once with `{ artifactId, config }`.
 * A returned element replaces the spinner + label entirely (the escalation
 * logic is skipped — the host owns the content); `null`/`undefined` or a thrown
 * error falls back to the default, mirroring the inlineActions null-falls-back
 * pattern.
 */
function buildPreviewOverlay(
  artifactId: string,
  config: AgentWidgetConfig,
  opts: ResolvedPreviewLoading
): PreviewOverlayHandle {
  const overlay = createElement("div", "persona-artifact-frame-loading");

  if (opts.renderIndicator) {
    try {
      const custom = opts.renderIndicator({ artifactId, config });
      if (custom) {
        overlay.appendChild(custom);
        return { el: overlay, revealLabel: () => {} };
      }
    } catch {
      /* fall through to the default spinner + label */
    }
  }

  const indicator = createElement("div", "persona-artifact-frame-loading-indicator");
  indicator.appendChild(createSpinner());

  let labelEl: HTMLElement | null = null;
  if (opts.label !== false) {
    // Plain, calm text — no shimmer (deliberate escalation, per the research).
    // Hidden until revealLabel() adds the --visible modifier (opacity transition).
    labelEl = createElement("div", "persona-artifact-frame-loading-text");
    labelEl.textContent = opts.label;
    indicator.appendChild(labelEl);
  }
  overlay.appendChild(indicator);

  return {
    el: overlay,
    revealLabel: () => {
      if (labelEl) {
        labelEl.classList.add("persona-artifact-frame-loading-text--visible");
      }
    },
  };
}

/**
 * Drive the preview-loading overlay for one built iframe. Plain DOM + timers, no
 * deps. Returns a teardown that removes the window/message + iframe/load
 * listeners, clears every timer, and drops the overlay immediately — called when
 * the iframe is replaced/rebuilt so the reuse path never stacks listeners.
 *
 * Dismiss rules:
 * - injection on (`token` set): dismiss on the matched `postMessage`, or on the
 *   hard timeout. The iframe `load` event is intentionally ignored — the message
 *   is strictly later and more accurate (post-DOMContentLoaded rendering).
 * - injection off (`token` null): dismiss on `load` + a double rAF, or the timeout.
 * The iframe itself is never hidden; the opaque themed overlay covers pre-paint.
 */
function setupPreviewLoading(
  frame: HTMLElement,
  iframe: HTMLIFrameElement,
  token: string | null,
  opts: ResolvedPreviewLoading,
  artifactId: string,
  config: AgentWidgetConfig
): () => void {
  let overlay: HTMLElement | null = null;
  let shownAt = 0;
  let settled = false;
  const timers = new Set<number>();
  const clearTimers = () => {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
  };
  const addTimer = (fn: () => void, ms: number): void => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms) as unknown as number;
    timers.add(id);
  };

  const removeOverlay = () => {
    if (overlay && overlay.parentElement) overlay.remove();
    overlay = null;
  };
  const showOverlay = () => {
    if (overlay || settled) return;
    const built = buildPreviewOverlay(artifactId, config, opts);
    overlay = built.el;
    frame.appendChild(overlay);
    shownAt = Date.now();
    // Escalation label timer starts NOW (overlay-visible), not from iframe
    // creation, and lives in the same timer Set so teardown/settle clear it —
    // no post-teardown DOM mutation. No-op when label is disabled / a custom
    // indicator owns the content.
    if (opts.label !== false) addTimer(built.revealLabel, opts.labelDelayMs);
  };
  const fadeOut = () => {
    if (!overlay) return;
    overlay.classList.add("persona-artifact-frame-loading--out");
    addTimer(removeOverlay, PREVIEW_FADE_MS);
  };

  const detachListeners = () => {
    if (token !== null) {
      if (typeof window !== "undefined") {
        window.removeEventListener("message", onMessage);
      }
    } else {
      iframe.removeEventListener("load", onLoad);
    }
  };

  // Ready: stop listening + the delay/timeout timers, then either drop a
  // never-shown overlay's timers or enforce minVisibleMs before fading.
  const settle = () => {
    if (settled) return;
    settled = true;
    detachListeners();
    clearTimers();
    if (!overlay) return;
    const remaining = Math.max(0, opts.minVisibleMs - (Date.now() - shownAt));
    if (remaining > 0) addTimer(fadeOut, remaining);
    else fadeOut();
  };

  function onMessage(e: MessageEvent) {
    if (token === null) return;
    const d = e.data as { persona?: unknown; token?: unknown } | null;
    if (!d || d.persona !== "artifact-preview-ready" || d.token !== token) return;
    // An opaque-origin srcdoc reports its origin as the string "null", so origin
    // alone is worthless — match the source window identity instead.
    if (e.source !== iframe.contentWindow) return;
    settle();
  }
  function onLoad() {
    const raf = (cb: () => void) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => cb());
      } else {
        setTimeout(cb, 0);
      }
    };
    raf(() => raf(() => settle()));
  }

  addTimer(showOverlay, opts.delayMs);
  addTimer(settle, opts.timeoutMs);
  if (token !== null) {
    if (typeof window !== "undefined") {
      window.addEventListener("message", onMessage);
    }
  } else {
    iframe.addEventListener("load", onLoad);
  }

  return () => {
    settled = true;
    clearTimers();
    detachListeners();
    removeOverlay();
  };
}

/**
 * Render an artifact's preview body into a stable wrapper element.
 *
 * Covers every body kind the artifact pane renders:
 * - markdown artifacts → sanitized rendered markdown (or raw source when the
 *   host resolves `"source"` view mode)
 * - previewable file artifacts (markdown records carrying `file` meta) →
 *   sandboxed `iframe srcdoc` once complete, raw source while streaming or
 *   when `features.artifacts.filePreview` disables the preview
 * - component artifacts → registry-resolved renderer, falling back to the
 *   inspector card for unknown components or renderer failures
 *
 * `update()` re-renders in place. Two nodes are reused across updates rather
 * than rebuilt: the file-preview iframe (reused while the artifact id + source
 * are unchanged, so idle re-renders don't reload it) and the source window's
 * `<pre>`/`<code>` (only the highlighted content is replaced per streaming
 * delta, so a fixed window's scroll position and reserved height survive).
 *
 * When `ctx.bodyLayout` is set (inline path) the streaming source renders into
 * a fixed-height scroll window with optional tail-follow and edge fades, or —
 * with `streamingView: "status"` — a centered placeholder; the pane path
 * (no `bodyLayout`) renders content-sized exactly as before.
 */
export function renderArtifactPreviewBody(
  record: PersonaArtifactRecord,
  ctx: ArtifactPreviewContext
): ArtifactPreviewBodyHandle {
  const { config } = ctx;
  const registry = ctx.registry ?? componentRegistry;
  const layout = ctx.bodyLayout;

  const md = config.markdown ? createMarkdownProcessorFromConfig(config.markdown) : null;
  const sanitize = resolveSanitizer(config.sanitize);
  // Degraded path (IIFE/CDN build before the `markdown-parsers.js` chunk
  // resolves): the markdown processor falls back to escapeHtml, and the default
  // sanitizer's own fallback is escapeHtml too, so sanitizing that output would
  // escape a SECOND time and display literal entities (mirrors
  // `buildPostprocessor` in ui.ts). Chat messages self-heal via the
  // parser-ready re-render at the end of createAgentExperience, but this body
  // only re-renders on update() — so an artifact upserted right after init
  // would stay escaped until the next update. When a render takes the fallback,
  // self-heal through the shared `onMarkdownParsersReady` registry — the single
  // self-heal path every markdown surface shares — instead of an ad-hoc
  // `loadMarkdownParsers().then(...)`. The `parserRerenderScheduled` flag keeps
  // repeated renders from stacking subscriptions. The returned unsubscribe is
  // intentionally ignored: the subscription is fire-once and the preview handle
  // exposes no teardown hook to call it from.
  let current = record;
  let parserRerenderScheduled = false;
  const toHtml = (text: string) => {
    const parsersReady = getMarkdownParsersSync() !== null;
    if (md && !parsersReady && !parserRerenderScheduled) {
      parserRerenderScheduled = true;
      onMarkdownParsersReady(() => render(current));
    }
    const raw = md ? md(text) : escapeHtml(text);
    // escapeHtml output is already inert — only real markdown HTML is sanitized.
    return md && parsersReady && sanitize ? sanitize(raw) : raw;
  };

  const el = createElement("div", "persona-artifact-preview-body");

  // File-preview reuse: re-appending a detached iframe reloads its srcdoc, so
  // keep the positioned frame (wrapper + iframe + overlay) and skip rebuilding
  // when the artifact + source are unchanged. `filePreviewLoadingCleanup` tears
  // down the current frame's overlay state machine (listeners + timers) before a
  // rebuild so the reuse path never stacks listeners.
  let filePreviewFrame: HTMLElement | null = null;
  let filePreviewKey: string | null = null;
  let filePreviewLoadingCleanup: (() => void) | null = null;
  const resetFilePreview = () => {
    if (filePreviewLoadingCleanup) {
      filePreviewLoadingCleanup();
      filePreviewLoadingCleanup = null;
    }
    filePreviewFrame = null;
    filePreviewKey = null;
  };

  // Source-window reuse: the top node appended to `el` for the source path —
  // the scroll window on the inline path (bodyLayout set) or the bare <pre> on
  // the pane path. Kept stable across deltas so `sourceCode`'s content can be
  // swapped in place without resetting scroll position or reserved height.
  let sourceRoot: HTMLElement | null = null;
  let sourceCode: HTMLElement | null = null;
  let sourceKey: string | null = null;
  // Per-window "the reader deliberately scrolled away from the tail" latch.
  // Set by an upward wheel / a touch drag (real intent), NEVER by a `scroll`
  // event — growth-induced scroll is the industry-wide freeze bug we avoid.
  // Cleared when the reader lands back near the bottom or the stream completes.
  // Lives in this closure so it resets with the window (resetSource).
  let escaped = false;
  const resetSource = () => {
    sourceRoot = null;
    sourceCode = null;
    sourceKey = null;
    escaped = false;
  };

  // Status-view reuse: kept stable across streaming deltas so the "Generating …"
  // animation doesn't restart on every delta.
  let statusView: HTMLElement | null = null;
  let statusKey: string | null = null;
  const resetStatus = () => {
    statusView = null;
    statusKey = null;
  };

  const NEAR_BOTTOM_PX = 40;
  let followRaf = 0;
  const scheduleFrame = (cb: () => void): number => {
    if (typeof requestAnimationFrame === "function") {
      return requestAnimationFrame(() => cb());
    }
    return setTimeout(cb, 0) as unknown as number;
  };
  const isNearBottom = (sc: HTMLElement): boolean =>
    sc.scrollHeight - sc.clientHeight - sc.scrollTop <= NEAR_BOTTOM_PX;
  const updateFadeClasses = (sc: HTMLElement) => {
    if (!layout) return;
    const overflow = sc.scrollHeight - sc.clientHeight > 1;
    const distToBottom = sc.scrollHeight - sc.clientHeight - sc.scrollTop;
    sc.classList.toggle(
      "persona-artifact-fade-top",
      layout.fadeTop && overflow && sc.scrollTop > 1
    );
    sc.classList.toggle(
      "persona-artifact-fade-bottom",
      layout.fadeBottom && overflow && distToBottom > 1
    );
  };
  const stickToBottom = (sc: HTMLElement) => {
    if (followRaf) return;
    followRaf = scheduleFrame(() => {
      followRaf = 0;
      sc.scrollTop = sc.scrollHeight;
      updateFadeClasses(sc);
    });
  };

  // Render the syntax-highlighted source. On the inline path the <pre> lives in
  // a scroll window (`fixed` → reserved height + internal scroll + follow/fade);
  // on the pane path it is a bare child of `el`, byte-identical to before.
  const renderSource = (
    text: string,
    opts: { language?: string; path?: string } | undefined,
    rec: PersonaArtifactRecord,
    fixed: boolean
  ) => {
    const useWindow = !!layout;
    const key = rec.id + "|" + (useWindow ? "w" : "p");
    if (!sourceRoot || sourceKey !== key || sourceRoot.parentElement !== el) {
      resetFilePreview();
      resetStatus();
      el.replaceChildren();
      const pre = createElement("pre", PRE_CLASS + " persona-code-pre");
      const code = createElement("code", "persona-code");
      pre.appendChild(code);
      if (useWindow) {
        const scroll = createElement("div", "persona-artifact-source-window");
        scroll.appendChild(pre);
        el.appendChild(scroll);
        // Clip mode (overflow: "clip") is a static top-of-document window:
        // `overflow: hidden`, no internal scroll, no tail-follow — so it wires
        // none of the scroll/wheel/touch intent listeners below (there is
        // nothing to scroll and nothing to unstick).
        const clip = layout?.overflow === "clip";
        if (!clip && typeof scroll.addEventListener === "function") {
          // Does the window actually clip content? Gesture intent only counts
          // while there is somewhere to scroll to.
          const overflows = () => scroll.scrollHeight - scroll.clientHeight > 1;
          // `scroll` fires for BOTH user scrolling and growth-induced reflow, so
          // it never SETS the escaped latch (that misread is the freeze bug).
          // It only clears the latch when the reader has returned to the bottom.
          scroll.addEventListener(
            "scroll",
            () => {
              if (isNearBottom(scroll)) escaped = false;
              updateFadeClasses(scroll);
            },
            { passive: true }
          );
          // An upward wheel over an overflowing window is deliberate: the reader
          // wants to look back, so stop pinning the tail (matches
          // use-stick-to-bottom's `deltaY < 0` unstick).
          scroll.addEventListener(
            "wheel",
            (e) => {
              if (overflows() && e.deltaY < 0) escaped = true;
            },
            { passive: true }
          );
          // Touch drags carry no reliable direction here, so any touch move over
          // an overflowing window is treated as taking manual control; the scroll
          // listener re-engages follow once they flick back to the bottom.
          scroll.addEventListener(
            "touchmove",
            () => {
              if (overflows()) escaped = true;
            },
            { passive: true }
          );
        }
        sourceRoot = scroll;
      } else {
        el.appendChild(pre);
        sourceRoot = pre;
      }
      sourceCode = code;
      sourceKey = key;
    }

    const scroll = useWindow ? sourceRoot : null;
    if (scroll) {
      scroll.classList.toggle("persona-artifact-source-window--fixed", fixed);
      // Clip windows carry both classes: --fixed supplies the reserved height +
      // fill-capable detection (artifact-inline.ts), and --clip overrides its
      // overflow-y: auto with overflow: hidden (declared later in widget.css).
      scroll.classList.toggle(
        "persona-artifact-source-window--clip",
        fixed && layout?.overflow === "clip"
      );
    }
    // Measure before the swap: tail-follow only when the reader was already at
    // the bottom (don't fight a reader who scrolled up).
    const wasNearBottom = scroll ? isNearBottom(scroll) : true;
    // Syntax highlighting + line-number gutter. The built fragment's
    // textContent equals `text` verbatim; the DOM is span/#text only (no
    // innerHTML) so it stays safe regardless of `sanitize` config.
    sourceCode!.replaceChildren(highlightCode(text, opts?.language, opts?.path));
    if (scroll) {
      // Follow only while streaming; the complete render keeps whatever scroll
      // position the window ended on. Two gates stop the pin: the `escaped`
      // latch (an explicit wheel-up / touch gesture — sharp intent detection)
      // and the positional `wasNearBottom` fallback (covers programmatic and
      // keyboard scrolling, which fire neither wheel nor touch). Completion
      // clears the latch so a reused window follows the next stream from scratch.
      const streaming = rec.status !== "complete";
      if (fixed && streaming && layout?.followOutput && !escaped && wasNearBottom) {
        stickToBottom(scroll);
      } else if (!streaming) {
        escaped = false;
      }
      updateFadeClasses(scroll);
    }
  };

  const renderMarkdown = (text: string) => {
    resetFilePreview();
    resetSource();
    resetStatus();
    el.replaceChildren();
    const wrap = createElement("div", MARKDOWN_WRAP_CLASS);
    wrap.innerHTML = toHtml(text);
    el.appendChild(wrap);
  };

  // A quiet, reserved-height placeholder shown while streaming when
  // `streamingView: "status"`. Reuses the same animated status the chrome uses.
  const renderStatusView = (rec: PersonaArtifactRecord) => {
    const key = rec.id;
    if (statusView && statusKey === key && statusView.parentElement === el) {
      return;
    }
    resetFilePreview();
    resetSource();
    el.replaceChildren();
    const fileMeta = rec.artifactType === "markdown" ? rec.file : undefined;
    const label = fileMeta
      ? fileTypeLabel(fileMeta).toLowerCase()
      : rec.artifactType === "component"
        ? "component"
        : "document";
    const wrap = createElement("div", "persona-artifact-status-view");
    const textEl = createElement("div", "persona-artifact-status-view-text");
    applyArtifactLoadingStatus(textEl, `Generating ${label}...`, config.features?.artifacts);
    wrap.appendChild(textEl);
    el.appendChild(wrap);
    statusView = wrap;
    statusKey = key;
  };

  const render = (rec: PersonaArtifactRecord) => {
    current = rec;
    const viewMode = ctx.resolveViewMode?.(rec) ?? layout?.viewMode ?? "rendered";
    const fileMeta = rec.artifactType === "markdown" ? rec.file : undefined;
    const isStreaming = rec.status !== "complete";
    // Numeric height for the current state → fixed window (source view only).
    // The complete state sizes the same inner window the streaming state does
    // (never the padded body wrapper), so a source→source completion is
    // geometry-identical and shifts nothing.
    const stateHeight = isStreaming
      ? layout?.streamingHeight
      : layout?.completeHeight;
    const fixed = !!layout && typeof stateHeight === "number";

    // Streaming status placeholder (inline only; gated by bodyLayout).
    if (layout?.streamingView === "status" && isStreaming) {
      renderStatusView(rec);
      return;
    }

    // Previewable file artifact branch (markdown artifact carrying `file` meta).
    if (fileMeta) {
      const source = extractFileSource(rec.markdown ?? "");
      const kind = fileKindOf(fileMeta);
      const previewEnabled = config.features?.artifacts?.filePreview?.enabled !== false;
      const wantIframe =
        !isStreaming &&
        viewMode === "rendered" &&
        previewEnabled &&
        (kind === "html" || kind === "svg");

      if (wantIframe) {
        // NUL separator: cannot appear in an id, so ids and sources never
        // collide across the boundary.
        const key = rec.id + "\u0000" + source;
        // Reuse the existing frame when nothing changed so idle re-renders don't
        // reload the iframe (re-appending a detached iframe reloads its srcdoc)
        // or restart its loading overlay / stack a second message listener.
        if (
          filePreviewFrame &&
          filePreviewKey === key &&
          filePreviewFrame.parentElement === el
        ) {
          return;
        }
        resetSource();
        resetStatus();
        // Tear down any prior frame's overlay state machine before rebuilding.
        resetFilePreview();
        el.replaceChildren();

        const fp = config.features?.artifacts?.filePreview;
        const sandbox = fp?.iframeSandbox ?? "allow-scripts";
        const loadingOpts = resolvePreviewLoading(fp?.loading);

        // Positioned wrapper hosts the iframe + the (absolute) loading overlay;
        // `el` is display: contents, so the iframe needs its own positioning
        // context. Geometry (frame owns the height, iframe is 100% of it) lives
        // in widget.css.
        const frame = createElement("div", "persona-artifact-frame");
        const iframe = createElement("iframe", "persona-artifact-iframe");
        iframe.setAttribute("sandbox", sandbox);
        iframe.setAttribute("data-artifact-id", rec.id);

        // Assign srcdoc as a property (never innerHTML / marked / DOMPurify):
        // the sandbox (no allow-same-origin → opaque origin) is the isolation
        // boundary. The ready reporter is appended (never prepended) so the
        // document's doctype stays first.
        let token: string | null = null;
        if (loadingOpts.enabled && loadingOpts.injectReadySignal) {
          token = makePreviewToken();
          iframe.srcdoc = source + buildReadyReporter(token);
        } else {
          iframe.srcdoc = source;
        }

        frame.appendChild(iframe);
        el.appendChild(frame);

        if (loadingOpts.enabled) {
          filePreviewLoadingCleanup = setupPreviewLoading(
            frame,
            iframe,
            token,
            loadingOpts,
            rec.id,
            config
          );
        }

        filePreviewFrame = frame;
        filePreviewKey = key;
        return;
      }

      // Not rendering an iframe: drop the cached one.
      resetFilePreview();

      // Complete markdown file → existing markdown pipeline (sanitized).
      if (!isStreaming && kind === "markdown" && viewMode === "rendered") {
        renderMarkdown(source);
        return;
      }

      // Streaming, source view, or non-previewable kind → raw source in a <pre>,
      // syntax-highlighted by the file's language / path.
      renderSource(source, { language: fileMeta.language, path: fileMeta.path }, rec, fixed);
      return;
    }

    // Non-file markdown.
    if (rec.artifactType === "markdown") {
      if (viewMode === "source") {
        resetFilePreview();
        renderSource(rec.markdown ?? "", undefined, rec, fixed);
        return;
      }
      renderMarkdown(rec.markdown ?? "");
      return;
    }

    // Component artifact.
    resetFilePreview();
    resetSource();
    resetStatus();
    el.replaceChildren();
    const renderer = rec.component ? registry.get(rec.component) : undefined;
    if (renderer) {
      const stubMessage: AgentWidgetMessage = {
        id: rec.id,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      };
      const componentCtx: ComponentContext = {
        message: stubMessage,
        config,
        updateProps: () => {},
      };
      try {
        const node = renderer(rec.props ?? {}, componentCtx);
        if (node) {
          el.appendChild(node);
          return;
        }
      } catch {
        /* fall through to the inspector card */
      }
    }
    el.appendChild(fallbackComponentCard(rec));
  };

  render(record);

  return {
    el,
    update(rec: PersonaArtifactRecord) {
      render(rec);
    },
  };
}
