/**
 * `@runtypelabs/persona/webmcp-tool` — producer-side helpers for pages that
 * register WebMCP tools via `document.modelContext.registerTool()`.
 *
 * Everything else Persona ships for WebMCP is *consumer*-side (see
 * `webmcp-bridge.ts`: snapshot the registry, execute returned `webmcp:*` calls).
 * This entry exists because `execute()`'s second argument is not portable, and
 * every page that registers a tool has to deal with that:
 *
 *   | runtime                        | execute()'s 2nd argument       |
 *   | ------------------------------ | ------------------------------ |
 *   | native Chrome >= 153.0.8009.0  | `{ signal }`                   |
 *   | `@mcp-b/webmcp-polyfill` 4.x   | `{ requestUserInteraction }`   |
 *   | native Chrome < 153            | (absent)                       |
 *
 * `signal` comes from webmachinelearning/webmcp#247, which is still an OPEN
 * spec PR: Chrome shipped ahead of the spec text, whose IDL declares `execute`
 * single-argument. `requestUserInteraction` is the mirror image, a polyfill-only
 * extension in neither the spec nor Chrome. So a tool written naively against
 * either shape breaks on the other, and the failure is a `TypeError` deep inside
 * a tool call rather than anything a build catches.
 *
 * `defineWebMcpTool()` normalizes the difference away: `execute` always receives
 * both members, so tool bodies are runtime-agnostic. Normalizing the *shape* is
 * safe (the polyfill's `requestUserInteraction` is a pass-through, so the shim
 * for native is faithful), but cancellation cannot be conjured where the runtime
 * doesn't deliver it — see `capabilities.cancellation`.
 *
 * This module deliberately imports nothing: it is a few hundred bytes and must
 * be usable from a page that never loads the widget.
 */

/** MCP text content block. */
export interface WebMcpTextContent {
  type: 'text';
  text: string;
}

/** MCP image content block: raw base64 (no `data:` prefix) plus its MIME type. */
export interface WebMcpImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

export type WebMcpContent = WebMcpTextContent | WebMcpImageContent;

/** The MCP tool-result envelope a WebMCP `execute()` should resolve to. */
export interface WebMcpToolExecuteResult {
  content: WebMcpContent[];
  /** Optional machine-readable mirror of the text content. */
  structuredContent?: unknown;
  isError?: boolean;
}

/**
 * Spec `ToolAnnotations`. Note that `title` is NOT one: use the top-level field,
 * which is the only display-name channel the strict consumer surface exposes.
 *
 * WebMCP defines just these two, a subset of MCP's set — pages routinely carry
 * MCP-style extras like `destructiveHint` or `idempotentHint`, so unknown keys
 * are allowed through rather than rejected. Don't expect a runtime to act on
 * anything beyond the two named here.
 */
export interface WebMcpToolAnnotations {
  /** The tool has no side effects (pure read). */
  readOnlyHint?: boolean;
  /** The tool's output may contain text not to be trusted as instructions. */
  untrustedContentHint?: boolean;
  [annotation: string]: unknown;
}

/**
 * What runtimes actually deliver as `execute()`'s second argument. Every member
 * is optional because no single runtime provides them all — this is the *input*
 * to normalization, not what your tool body sees.
 */
export interface RawWebMcpToolContext {
  /** Native Chrome >= 153 only. */
  signal?: AbortSignal;
  /**
   * `@mcp-b/webmcp-polyfill` only.
   *
   * @deprecated Not in the WebMCP spec and not implemented by Chrome. Present
   * for compatibility with pages already using it; don't reach for it in new
   * tools.
   */
  requestUserInteraction?: (callback: () => unknown) => Promise<unknown>;
}

/** Truthful description of what the host runtime can actually do. */
export interface WebMcpToolCapabilities {
  /**
   * `true` when `signal` is a real signal that can fire. When `false`, the
   * runtime never reports cancellation to the tool, so `signal` is inert: it is
   * still safe to forward to `fetch()`, but polling `signal.aborted` in a loop
   * will never exit early. Check this before *relying* on cancellation.
   *
   * `false` under `@mcp-b/webmcp-polyfill` (which races `execute()` against its
   * own signal, but never hands that signal to the tool) and on Chrome < 153.
   */
  cancellation: boolean;
}

/**
 * The normalized context a `defineWebMcpTool()` tool body receives. Both
 * capability members are always present, so no feature-detection is needed at
 * the call site.
 */
export interface WebMcpToolContext extends WebMcpToolCapabilities {
  /**
   * Always an `AbortSignal`. Real on runtimes that support cancellation, an
   * inert never-aborting signal elsewhere — see `capabilities.cancellation`.
   */
  signal: AbortSignal;
  /**
   * Always callable. Where the runtime provides no such callback, this is a
   * faithful pass-through (`callback()`), which is exactly what the polyfill's
   * own implementation does.
   *
   * @deprecated See {@link RawWebMcpToolContext.requestUserInteraction}.
   */
  requestUserInteraction: (callback: () => unknown) => Promise<unknown>;
  /** What the host runtime can actually do. */
  capabilities: WebMcpToolCapabilities;
}

/**
 * A tool descriptor as passed to `document.modelContext.registerTool()`.
 *
 * `TContext` is the shape `execute` receives: {@link RawWebMcpToolContext} for a
 * hand-written descriptor, {@link WebMcpToolContext} once wrapped.
 */
export interface WebMcpToolDescriptor<
  TContext = RawWebMcpToolContext,
  TArgs = Record<string, unknown>,
> {
  name: string;
  /**
   * User-facing label (spec `ToolDescriptor.title`). This top-level field is the
   * only display-name channel Persona's approval bubble reads; `annotations.title`
   * is a legacy alias that the strict consumer surface does not expose.
   */
  title?: string;
  description: string;
  /** JSON Schema for the tool's input. */
  inputSchema?: object;
  annotations?: WebMcpToolAnnotations;
  execute: (
    args: TArgs,
    context: TContext,
  ) => WebMcpToolExecuteResult | Promise<WebMcpToolExecuteResult> | unknown;
}

/**
 * The `registerTool` surface, typed to match reality on both runtimes.
 *
 * Note the `Promise` return: `registerTool` is async in the spec
 * (`Promise<undefined>`) and in the polyfill, and REJECTS when `options.signal`
 * is already aborted. A synchronous `try`/`catch` will not catch that — use
 * {@link registerWebMcpTools}, or attach your own `.catch()`.
 */
export interface RegisterableModelContext {
  registerTool: (
    tool: WebMcpToolDescriptor<never>,
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
}

/**
 * Read the WebMCP producer surface, preferring the spec's `document.modelContext`
 * and falling back to the older `navigator.modelContext` that some polyfill
 * versions installed. Returns `undefined` when WebMCP is unavailable.
 */
export const getModelContext = (): RegisterableModelContext | undefined => {
  if (typeof document !== 'undefined') {
    const fromDocument = (
      document as Document & { modelContext?: RegisterableModelContext }
    ).modelContext;
    if (fromDocument) return fromDocument;
  }
  if (typeof navigator !== 'undefined') {
    return (navigator as Navigator & { modelContext?: RegisterableModelContext })
      .modelContext;
  }
  return undefined;
};

/**
 * Fresh per call rather than a shared module-level constant: a tool that does
 * `signal.addEventListener('abort', …)` would otherwise pile listeners onto one
 * long-lived signal that never fires them, leaking for the life of the page.
 */
const neverAbortedSignal = (): AbortSignal => new AbortController().signal;

const passThroughUserInteraction = async (
  callback: () => unknown,
): Promise<unknown> => {
  if (typeof callback !== 'function') {
    throw new TypeError(
      'requestUserInteraction(callback) requires a function callback',
    );
  }
  return callback();
};

/**
 * Fill in whatever the host runtime didn't provide. Exported for tests and for
 * pages that register tools by hand but still want a portable context.
 */
export const normalizeWebMcpToolContext = (
  raw?: RawWebMcpToolContext,
): WebMcpToolContext => {
  // A non-AbortSignal `signal` means some runtime handed us something we can't
  // use; treat it as absent rather than passing it on to `fetch()`.
  const hasRealSignal =
    typeof AbortSignal !== 'undefined' && raw?.signal instanceof AbortSignal;
  const capabilities: WebMcpToolCapabilities = { cancellation: hasRealSignal };
  return {
    ...capabilities,
    signal: hasRealSignal ? raw!.signal! : neverAbortedSignal(),
    requestUserInteraction:
      raw?.requestUserInteraction ?? passThroughUserInteraction,
    capabilities,
  };
};

/**
 * Wrap a tool descriptor so its `execute` always receives a normalized
 * {@link WebMcpToolContext}, regardless of host runtime.
 *
 * ```ts
 * const tool = defineWebMcpTool({
 *   name: 'fetch_url',
 *   description: 'Fetch a URL.',
 *   inputSchema: { type: 'object', properties: { url: { type: 'string' } } },
 *   // `signal` is always present: real cancellation on Chrome >= 153,
 *   // an inert signal elsewhere. No feature-detection needed.
 *   execute: async ({ url }, { signal }) => {
 *     const response = await fetch(String(url), { signal });
 *     return { content: [{ type: 'text', text: await response.text() }] };
 *   },
 * });
 * ```
 */
export const defineWebMcpTool = <TArgs = Record<string, unknown>>(
  tool: WebMcpToolDescriptor<WebMcpToolContext, TArgs>,
): WebMcpToolDescriptor<RawWebMcpToolContext, TArgs> => ({
  ...tool,
  execute: (args, raw) => tool.execute(args, normalizeWebMcpToolContext(raw)),
});

/** Options for {@link registerWebMcpTools}. */
export interface RegisterWebMcpToolsOptions {
  /** Unregisters every tool in the batch when aborted (spec tool lifetime). */
  signal?: AbortSignal;
  /**
   * Where to register. Defaults to {@link getModelContext}'s result; pass this
   * to target a specific context or to inject a fake in tests.
   */
  modelContext?: RegisterableModelContext;
  /** Called per failed registration. Defaults to `console.warn`. */
  onError?: (toolName: string, error: unknown) => void;
}

/**
 * Register a batch of tools, normalizing each via {@link defineWebMcpTool} and
 * routing both synchronous throws and promise rejections to `onError`.
 *
 * Resolves to the tools that registered successfully. A no-op returning `[]`
 * when WebMCP is unavailable, so callers don't need their own guard.
 */
export const registerWebMcpTools = async <TArgs = Record<string, unknown>>(
  tools: Array<WebMcpToolDescriptor<WebMcpToolContext, TArgs>>,
  options: RegisterWebMcpToolsOptions = {},
): Promise<Array<WebMcpToolDescriptor<WebMcpToolContext, TArgs>>> => {
  const modelContext = options.modelContext ?? getModelContext();
  if (!modelContext) return [];

  const onError =
    options.onError ??
    ((toolName: string, error: unknown) => {
      console.warn(`[webmcp] Failed to register tool '${toolName}'`, error);
    });

  const registered: Array<WebMcpToolDescriptor<WebMcpToolContext, TArgs>> = [];
  for (const tool of tools) {
    try {
      // `registerTool` both throws synchronously (bad descriptor) and rejects
      // (already-aborted signal), so cover both paths.
      await modelContext.registerTool(
        defineWebMcpTool(tool) as unknown as WebMcpToolDescriptor<never>,
        options.signal ? { signal: options.signal } : undefined,
      );
      registered.push(tool);
    } catch (error) {
      onError(tool.name, error);
    }
  }
  return registered;
};
