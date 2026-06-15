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
import type { AgentWidgetContextProvider } from "./types";

export { smartDomResultToEnriched };
export type { SmartDomAdapterOptions } from "./utils/smart-dom-adapter";

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
