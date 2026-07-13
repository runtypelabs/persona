import { createElement } from "../utils/dom";
import type {
  AgentWidgetConfig,
  AgentWidgetMessage,
  PersonaArtifactRecord,
} from "../types";
import { extractFileSource, fileKindOf, fileTypeLabel } from "../utils/artifact-file";
import { applyArtifactLoadingStatus } from "../utils/artifact-loading-status";
import { highlightCode } from "../utils/code-highlight";
import { escapeHtml, createMarkdownProcessorFromConfig } from "../postprocessors";
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
  /** Show a top edge fade on the fixed window when content is clipped above. */
  fadeTop: boolean;
  /** Show a bottom edge fade on the fixed window when content is clipped below. */
  fadeBottom: boolean;
  /** Wrap the streaming→complete swap in a View Transition when supported. */
  transition: "auto" | "none";
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
  const toHtml = (text: string) => {
    const raw = md ? md(text) : escapeHtml(text);
    return sanitize ? sanitize(raw) : raw;
  };

  const el = createElement("div", "persona-artifact-preview-body");

  // File-preview iframe reuse: re-appending a detached iframe reloads its
  // srcdoc, so keep the node and skip rebuilding when the artifact + source
  // are unchanged.
  let filePreviewIframe: HTMLIFrameElement | null = null;
  let filePreviewKey: string | null = null;
  const resetFilePreview = () => {
    filePreviewIframe = null;
    filePreviewKey = null;
  };

  // Source-window reuse: the top node appended to `el` for the source path —
  // the scroll window on the inline path (bodyLayout set) or the bare <pre> on
  // the pane path. Kept stable across deltas so `sourceCode`'s content can be
  // swapped in place without resetting scroll position or reserved height.
  let sourceRoot: HTMLElement | null = null;
  let sourceCode: HTMLElement | null = null;
  let sourceKey: string | null = null;
  const resetSource = () => {
    sourceRoot = null;
    sourceCode = null;
    sourceKey = null;
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
        if (typeof scroll.addEventListener === "function") {
          scroll.addEventListener("scroll", () => updateFadeClasses(scroll), {
            passive: true,
          });
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
      // position the window ended on.
      const streaming = rec.status !== "complete";
      if (fixed && streaming && layout?.followOutput && wasNearBottom) {
        stickToBottom(scroll);
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
        // Reuse the existing iframe when nothing changed so idle re-renders
        // don't reload it (re-appending a detached iframe reloads its srcdoc).
        if (
          filePreviewIframe &&
          filePreviewKey === key &&
          filePreviewIframe.parentElement === el
        ) {
          return;
        }
        resetSource();
        resetStatus();
        el.replaceChildren();
        const sandbox =
          config.features?.artifacts?.filePreview?.iframeSandbox ?? "allow-scripts";
        const iframe = createElement("iframe", "persona-artifact-iframe");
        iframe.setAttribute("sandbox", sandbox);
        iframe.setAttribute("data-artifact-id", rec.id);
        // Assign srcdoc as a property (never innerHTML / marked / DOMPurify):
        // the sandbox (no allow-same-origin → opaque origin) is the isolation
        // boundary.
        iframe.srcdoc = source;
        filePreviewIframe = iframe;
        filePreviewKey = key;
        el.appendChild(iframe);
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
