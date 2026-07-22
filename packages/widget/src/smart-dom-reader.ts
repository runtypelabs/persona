/**
 * Optional entry point: `@runtypelabs/persona/smart-dom-reader`.
 *
 * Adapts `@mcp-b/smart-dom-reader` into Persona's enriched page-context pipeline and
 * exposes a ready-made {@link AgentWidgetContextProvider} you can drop into
 * `config.contextProviders`. This is the ONLY module that imports the smart-dom-reader
 * runtime value, so the library never reaches the main bundle or the IIFE/CDN build: * importing this subpath is opt-in.
 *
 * The library is **vendored** under `src/vendor/smart-dom-reader/` (it is mis-published
 * on npm and cannot be imported by name: see that directory's README). Vendoring it
 * here means consumers need no extra install: the code is bundled into this entry, and
 * consumers who never import this subpath pay nothing.
 *
 * What it adds over the default `collectEnrichedPageContext`: Shadow-DOM piercing
 * (on by default), form grouping, and page landmarks/state.
 *
 * ## Actionability caveat
 *
 * Persona's click loop (`utils/actions.ts`) drives `document.querySelector`, which
 * cannot pierce shadow roots or evaluate XPath. The adapter therefore prefers plain-CSS
 * selectors; elements reachable only via shadow-piercing / XPath selectors are surfaced
 * to the model as context but are not clickable through the current action handlers.
 *
 * @example
 * ```ts
 * import initAgentWidget from "@runtypelabs/persona";
 * import { createSmartDomReaderContextProvider } from "@runtypelabs/persona/smart-dom-reader";
 *
 * initAgentWidget({
 *   // ...config
 *   contextProviders: [createSmartDomReaderContextProvider()]
 * });
 * ```
 */

import { SmartDOMReader } from "./vendor/smart-dom-reader";
import type { ExtractionOptions } from "./vendor/smart-dom-reader";
import {
  smartDomResultToEnriched,
  type SmartDomAdapterOptions
} from "./utils/smart-dom-adapter";
import { formatEnrichedContext, type EnrichedPageElement } from "./utils/dom-context";
import { defaultMentionFilter } from "./utils/mention-matcher";
import type {
  AgentWidgetContextProvider,
  AgentWidgetContextMentionItem,
  AgentWidgetContextMentionSource,
} from "./types";

export { smartDomResultToEnriched };
export type { SmartDomAdapterOptions } from "./utils/smart-dom-adapter";
export type { EnrichedPageElement } from "./utils/dom-context";

/** Options for {@link collectSmartDomContext} and {@link createSmartDomReaderContextProvider}. */
export interface SmartDomContextOptions extends SmartDomAdapterOptions {
  /**
   * `interactive` (default) extracts UI elements only; `full` additionally extracts
   * semantic content (headings, images, tables, lists, articles).
   */
  mode?: "interactive" | "full";
  /**
   * Extraction options passed through to smart-dom-reader (e.g. `includeShadowDOM`,
   * `maxDepth`, `viewportOnly`). `includeShadowDOM` defaults to true in the library;
   * the `.persona-host` exclusion guards against the widget reading its own shadow UI.
   *
   * Note: the vendored library exposes an `includeIframes` flag but does not actually
   * traverse iframe content, so iframe piercing is not supported.
   */
  extractionOptions?: Partial<ExtractionOptions>;
  /** Document to extract from. Default: the global `document`. Ignored when `root` is set. */
  document?: Document;
  /**
   * Scope extraction to this element's subtree instead of the whole document: parity
   * with `collectEnrichedPageContext`'s `root`. Useful to read only a main-content region
   * and skip site chrome (nav, sidebars). Shadow DOM inside the subtree is still pierced.
   * When set, `document` is ignored.
   */
  root?: Element;
}

/**
 * Collect enriched page context using smart-dom-reader, mapped into Persona's
 * {@link EnrichedPageElement}[] shape (parity with `collectEnrichedPageContext`).
 *
 * Pass `root` to scope extraction to an element subtree (skipping site chrome);
 * otherwise the whole `document` (or `opts.document`) is read. Returns an empty array
 * when neither `root` nor a document is available (e.g. SSR).
 */
export function collectSmartDomContext(
  opts: SmartDomContextOptions = {}
): EnrichedPageElement[] {
  const mode = opts.mode ?? "interactive";

  let result;
  if (opts.root) {
    result = SmartDOMReader.extractFromElement(
      opts.root,
      mode,
      opts.extractionOptions
    );
  } else {
    const doc =
      opts.document ?? (typeof document !== "undefined" ? document : undefined);
    if (!doc) return [];
    result =
      mode === "full"
        ? SmartDOMReader.extractFull(doc, opts.extractionOptions)
        : SmartDOMReader.extractInteractive(doc, opts.extractionOptions);
  }

  return smartDomResultToEnriched(result, {
    includeSemantic: opts.includeSemantic ?? mode === "full",
    excludeSelector: opts.excludeSelector,
    maxTextLength: opts.maxTextLength,
    maxElements: opts.maxElements
  });
}

/** Options for {@link createSmartDomReaderContextProvider}. */
export interface SmartDomReaderProviderOptions extends SmartDomContextOptions {
  /** Key under which the formatted context is placed in `payload.context`. Default: "pageContext". */
  contextKey?: string;
}

/**
 * Build an {@link AgentWidgetContextProvider} that collects page context with
 * smart-dom-reader and returns it under `contextKey` (default `"pageContext"`).
 * Drop into `config.contextProviders`; `buildAgentPayload` merges the result into
 * `payload.context` on every agent request.
 */
export function createSmartDomReaderContextProvider(
  opts: SmartDomReaderProviderOptions = {}
): AgentWidgetContextProvider {
  const contextKey = opts.contextKey ?? "pageContext";
  return () => {
    const elements = collectSmartDomContext(opts);
    if (elements.length === 0) return {};
    return { [contextKey]: formatEnrichedContext(elements) };
  };
}

/** Options for {@link createSmartDomMentionSource}. */
export interface SmartDomMentionSourceOptions extends SmartDomContextOptions {
  /** Source id. Default: "page". */
  id?: string;
  /** Group header shown in the menu. Default: "Page". */
  label?: string;
  /**
   * Reshape each surfaced element into a mention item. Receives the raw
   * {@link EnrichedPageElement} and the default-mapped item, so you can tweak
   * one field (`{ ...defaultItem, iconName: "star" }`) or build from scratch.
   * The returned item's `id` MUST stay a selector `resolve()` can read at submit
   * (default: `el.selector`) unless you also override resolution. @default built-in mapping
   */
  mapItem?: (
    el: EnrichedPageElement,
    defaultItem: AgentWidgetContextMentionItem
  ) => AgentWidgetContextMentionItem;
}

// Empty-query snapshot reuse window: the full Shadow-DOM-piercing scan is
// synchronous and runs inside the keystroke handler, so rescanning on every `@`
// / backspace-to-empty stalls the input. Reuse a snapshot this fresh; rescan
// past it so a menu opened after page changes still sees current content.
const SNAPSHOT_TTL_MS = 2000;

const iconForInteractivity = (kind: EnrichedPageElement["interactivity"]): string => {
  switch (kind) {
    case "clickable":
      return "mouse-pointer-click";
    case "input":
      return "text-cursor-input";
    case "navigable":
      return "link";
    default:
      return "text";
  }
};

const elementToMentionItem = (
  el: EnrichedPageElement
): AgentWidgetContextMentionItem => {
  const ariaLabel = el.attributes["aria-label"];
  const raw = (ariaLabel || el.text || el.tagName).trim();
  const label = raw.length > 48 ? `${raw.slice(0, 47)}…` : raw || el.tagName;
  const descParts = [el.role ?? el.tagName, el.interactivity].filter(Boolean);
  return {
    id: el.selector, // stable key + the selector resolve() reads at submit
    label,
    description: descParts.join(" · "),
    iconName: iconForInteractivity(el.interactivity),
    group: undefined,
  };
};

/**
 * First-class **supported** mention source backed by smart-dom-reader: surfaces
 * visible page elements (Shadow-DOM-piercing) as mentionable items, resolving a
 * fresh snapshot of the chosen element's text at SUBMIT (`resolveOn: "submit"`),
 * since the page is time-sensitive. The element list is snapshotted when the
 * menu opens (empty query) and filtered client-side with `defaultMentionFilter`
 * as the user types.
 *
 * @example
 * ```ts
 * import { createSmartDomMentionSource } from "@runtypelabs/persona/smart-dom-reader";
 *
 * initAgentWidget({
 *   contextMentions: { enabled: true, sources: [createSmartDomMentionSource()] },
 * });
 * ```
 */
export function createSmartDomMentionSource(
  opts: SmartDomMentionSourceOptions = {}
): AgentWidgetContextMentionSource {
  const id = opts.id ?? "page";
  const label = opts.label ?? "Page";
  let snapshot: AgentWidgetContextMentionItem[] | null = null;
  let capturedAt = 0;

  const rescan = (): AgentWidgetContextMentionItem[] => {
    const items = collectSmartDomContext(opts).map((el) => {
      const defaultItem = elementToMentionItem(el);
      return opts.mapItem ? opts.mapItem(el, defaultItem) : defaultItem;
    });
    capturedAt = Date.now();
    return items;
  };

  return {
    id,
    label,
    resolveOn: "submit",
    search: (query) => {
      // Rescan on empty query only when there's no snapshot or it's staler than
      // the TTL; reopening the menu quickly reuses the snapshot, keystrokes always
      // filter the existing one, so we never re-scan mid-typing.
      const stale = !snapshot || Date.now() - capturedAt > SNAPSHOT_TTL_MS;
      if (!snapshot || (query === "" && stale)) {
        snapshot = rescan();
      }
      return defaultMentionFilter(snapshot, query);
    },
    resolve: (item) => {
      const doc =
        opts.document ?? (typeof document !== "undefined" ? document : undefined);
      let text = "";
      try {
        const el = doc?.querySelector(item.id);
        text = el?.textContent?.trim() ?? "";
      } catch {
        /* invalid selector at resolve time — fall through to label only */
      }
      return {
        llmAppend: `Page element "${item.label}" (${item.id}):\n${text || "(no text)"}`,
        context: { selector: item.id },
      };
    },
  };
}
