import { createElement } from "../utils/dom";
import type {
  AgentWidgetConfig,
  AgentWidgetMessage,
  PersonaArtifactRecord,
} from "../types";
import { extractFileSource, fileKindOf } from "../utils/artifact-file";
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
};

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
 * `update()` re-renders in place; the file-preview iframe is reused when the
 * artifact id + source are unchanged so idle re-renders don't reload it.
 */
export function renderArtifactPreviewBody(
  record: PersonaArtifactRecord,
  ctx: ArtifactPreviewContext
): ArtifactPreviewBodyHandle {
  const { config } = ctx;
  const registry = ctx.registry ?? componentRegistry;

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

  const renderPre = (
    text: string,
    opts?: { language?: string; path?: string }
  ) => {
    const pre = createElement("pre", PRE_CLASS + " persona-code-pre");
    const code = createElement("code", "persona-code");
    // Syntax highlighting + line-number gutter. The built fragment's
    // textContent equals `text` verbatim; the DOM is span/#text only (no
    // innerHTML) so it stays safe regardless of `sanitize` config.
    code.appendChild(highlightCode(text, opts?.language, opts?.path));
    pre.appendChild(code);
    el.appendChild(pre);
  };

  const renderMarkdown = (text: string) => {
    const wrap = createElement("div", MARKDOWN_WRAP_CLASS);
    wrap.innerHTML = toHtml(text);
    el.appendChild(wrap);
  };

  const render = (rec: PersonaArtifactRecord) => {
    const viewMode = ctx.resolveViewMode?.(rec) ?? "rendered";
    const fileMeta = rec.artifactType === "markdown" ? rec.file : undefined;

    // Previewable file artifact branch (markdown artifact carrying `file` meta).
    if (fileMeta) {
      const source = extractFileSource(rec.markdown ?? "");
      const kind = fileKindOf(fileMeta);
      const previewEnabled = config.features?.artifacts?.filePreview?.enabled !== false;
      const isStreaming = rec.status !== "complete";
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

      // Not rendering an iframe: drop the cached one and rebuild.
      resetFilePreview();
      el.replaceChildren();

      // Complete markdown file → existing markdown pipeline (sanitized).
      if (!isStreaming && kind === "markdown" && viewMode === "rendered") {
        renderMarkdown(source);
        return;
      }

      // Streaming, source view, or non-previewable kind → raw source in a <pre>,
      // syntax-highlighted by the file's language / path.
      renderPre(source, { language: fileMeta.language, path: fileMeta.path });
      return;
    }

    // Non-file artifact: clear any cached iframe and rebuild.
    resetFilePreview();
    el.replaceChildren();

    if (rec.artifactType === "markdown") {
      if (viewMode === "source") {
        renderPre(rec.markdown ?? "");
        return;
      }
      renderMarkdown(rec.markdown ?? "");
      return;
    }

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
