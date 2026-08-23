/**
 * WebMCP bridge runtime — the lazily-loaded implementation of `WebMcpBridge`.
 *
 * Ships in the `webmcp-runtime.js` sibling chunk (CDN) / the
 * `@runtypelabs/persona/webmcp-runtime` subpath (npm), fetched by `client.ts`
 * only when `config.webmcp.enabled === true`. NEVER statically imported on the
 * core path (npm's synchronous `WebMcpBridge` export lives in
 * `webmcp-bridge-public.ts`, which wires the default deps).
 *
 * This module must not VALUE-import `./webmcp-bridge`: the chunk is bundled
 * `noExternal`, so it would get its own dead copies of the title map and the
 * polyfill-loader slot, and would inline the whole `@mcp-b/webmcp-polyfill`
 * via the bare-specifier fallback. Everything stateful is injected through
 * `WebMcpBridgeDeps`; the few pure helpers it shares are duplicated locally.
 */
import type {
  AgentWidgetWebMcpConfig,
  ClientToolDefinition,
  WebMcpConfirmHandler,
  WebMcpConfirmInfo,
  WebMcpToolResult,
} from "./types";
import type {
  ModelContextCoreLike,
  ModelContextToolInfo,
  WebMcpPolyfillModule,
} from "./webmcp-bridge";

/** Core-owned state and loaders the runtime must reach through injection. */
export interface WebMcpBridgeDeps {
  /** Core's `recordWebMcpToolDisplayTitles` (page-global title map). */
  recordToolDisplayTitles: (infos: ModelContextToolInfo[]) => void;
  /** Core's `getWebMcpToolDisplayTitle`. */
  getToolDisplayTitle: (toolName: string) => string | undefined;
  /** Core's `loadWebMcpPolyfillModule` (slot-aware polyfill resolution). */
  loadPolyfill: () => Promise<WebMcpPolyfillModule>;
}

const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

// Local copies of the wire-prefix helpers: pure, and duplicating them keeps
// this chunk free of any value edge into core webmcp-bridge state.
const WEBMCP_TOOL_PREFIX = "webmcp:";
const stripWebMcpPrefix = (name: string): string =>
  name.startsWith(WEBMCP_TOOL_PREFIX)
    ? name.slice(WEBMCP_TOOL_PREFIX.length)
    : name;

const log = {
  warn(message: string, ...rest: unknown[]): void {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      // eslint-disable-next-line no-console
      console.warn(`[Persona/WebMCP] ${message}`, ...rest);
    }
  },
};

export class WebMcpBridge {
  private confirmHandler: WebMcpConfirmHandler | null;
  private readonly timeoutMs: number;

  /** `true` once the polyfill has been (idempotently) installed. */
  private installed = false;
  /** Memoizes the one-shot async install so concurrent callers share it. */
  private readyPromise: Promise<void> | null = null;
  /**
   * Warn-once latch for a present-but-incompatible `document.modelContext`
   * (some other / older WebMCP polyfill squatting the global). `getModelContext`
   * is hit on every snapshot + execute, so we log the diagnostic only once.
   */
  private incompatibleContextWarned = false;

  constructor(
    private readonly config: AgentWidgetWebMcpConfig,
    private readonly deps: WebMcpBridgeDeps,
  ) {
    this.confirmHandler = config.onConfirm ?? null;
    this.timeoutMs = DEFAULT_TOOL_TIMEOUT_MS;
  }

  /**
   * Override the confirm handler post-construction. Used by `ui.ts` to wire
   * the in-panel approval bubble after the client has been built (the widget
   * lifecycle constructs the client before the panel renders).
   */
  public setConfirmHandler(handler: WebMcpConfirmHandler | null): void {
    this.confirmHandler = handler;
  }

  /**
   * `true` when the bridge can both snapshot the registry AND execute returned
   * tool calls: i.e. the polyfill is installed and `document.modelContext`
   * exposes the consumer surface (`getTools` / `executeTool`). Native browsers
   * that ship `document.modelContext` satisfy this too.
   *
   * Synchronous and best-effort: returns `false` until the lazy install has
   * resolved (see `ensureReady`). The snapshot/execute paths await readiness
   * themselves, so this is purely an advisory check for callers.
   */
  public isOperational(): boolean {
    if (this.config.enabled !== true) return false;
    if (!this.installed) return false;
    return this.getModelContext() !== null;
  }

  /**
   * Per-turn snapshot for `dispatch.clientTools[]`. Returns the JSON-only
   * surface: `execute` stays client-side, reached later via `executeToolCall`.
   *
   * Async because the strict polyfill's `getTools()` is async. Both payload
   * builders in `client.ts` already `await`, so this adds no new ceremony.
   */
  public async snapshotForDispatch(): Promise<ClientToolDefinition[]> {
    await this.ensureReady();
    if (this.config.enabled !== true) return [];

    const mc = this.getModelContext();
    if (!mc) return [];

    let infos: ModelContextToolInfo[];
    try {
      infos = await mc.getTools();
    } catch (err) {
      log.warn("getTools() threw: shipping an empty WebMCP snapshot.", err);
      return [];
    }
    this.deps.recordToolDisplayTitles(infos);

    const pageOrigin = typeof location !== "undefined" ? location.origin : "";

    return infos
      .filter((info) => this.passesClientAllowlist(info.name))
      .map<ClientToolDefinition>((info) => {
        const def: ClientToolDefinition = {
          name: info.name,
          description: info.description,
          origin: "webmcp",
          ...(pageOrigin ? { pageOrigin } : {}),
        };
        const schema = parseSchema(info.inputSchema);
        if (schema) def.parametersSchema = schema;
        return def;
      });
  }

  /**
   * Execute a `webmcp:<name>` tool call returned by the agent and return the
   * normalized MCP-shaped result for `/resume`.
   *
   * Failure modes: all return `{ isError: true, content: [...] }` rather than
   * throwing, so the dispatch can resume cleanly:
   *   - bridge not operational
   *   - tool not in registry (e.g. unmounted between snapshot and call)
   *   - tool excluded by the client allowlist
   *   - user declined the confirm gate
   *   - `execute()` threw or failed schema validation
   *   - `execute()` exceeded the 30s timeout
   *   - `signal` fired (session-level `cancel()`)
   *
   * When `signal` is provided, abort is honored at three points: before the
   * confirm bubble renders, after the user approves but before `execute()`
   * runs, and (via a combined `AbortController`) during `execute()` itself.
   * Honoring abort BEFORE the confirm prevents a late approval after `cancel()`
   * from firing a host-page side effect with no matching `/resume`.
   */
  public async executeToolCall(
    wireToolName: string,
    args: unknown,
    signal?: AbortSignal,
  ): Promise<WebMcpToolResult> {
    await this.ensureReady();
    if (this.config.enabled !== true) {
      return errorResult(
        "WebMCP is not enabled on this widget.",
      );
    }

    const mc = this.getModelContext();
    if (!mc) {
      // Distinguish "no modelContext at all" from "present but incompatible"
      // (a foreign/older polyfill squatting document.modelContext) so the
      // resumed error is actionable. getModelContext has already warned once
      // for the incompatible case.
      const present =
        typeof document !== "undefined" &&
        Boolean((document as Document & { modelContext?: unknown }).modelContext);
      return errorResult(
        present
          ? "WebMCP is not operational: document.modelContext is present but does not expose the strict getTools()/executeTool() surface (likely a different or older WebMCP polyfill)."
          : "WebMCP bridge is not operational on this page (document.modelContext not available).",
      );
    }

    const bareName = stripWebMcpPrefix(wireToolName);

    let infos: ModelContextToolInfo[];
    try {
      infos = await mc.getTools();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`Failed to read WebMCP registry: ${message}`);
    }
    this.deps.recordToolDisplayTitles(infos);
    const info = infos.find((candidate) => candidate.name === bareName);

    if (!info) {
      return errorResult(
        `WebMCP tool not registered on this page: ${bareName}`,
      );
    }

    // Re-apply the client-side allowlist at execute time. `snapshotForDispatch`
    // already filters it for `clientTools[]`, but the agent could request a
    // tool that the integrator excluded: e.g. a `webmcp:` call replayed from
    // history, a server bug, or a page that re-registered a previously-hidden
    // tool. The server is the trust boundary; this is a defense-in-depth
    // convenience check to keep us symmetric with the snapshot.
    if (!this.passesClientAllowlist(bareName)) {
      return errorResult(
        `WebMCP tool not allowed by client allowlist: ${bareName}`,
      );
    }

    // Bail before the confirm renders: a late approval after cancel() would
    // otherwise fire a host-page side effect with no matching /resume.
    if (signal?.aborted) {
      return errorResult("Aborted by cancel()");
    }

    // Confirm-by-default gate. Every `webmcp:*` call routes through here,
    // regardless of `annotations.readOnlyHint`.
    const displayTitle = this.deps.getToolDisplayTitle(bareName);
    const gateInfo: WebMcpConfirmInfo = {
      toolName: bareName,
      args,
      description: info.description,
      ...(displayTitle ? { title: displayTitle } : {}),
      reason: "gate",
    };
    if (!(await this.requestConfirm(gateInfo))) {
      return errorResult("User declined the tool call.");
    }

    // The await above may have parked us long enough for cancel() to fire.
    // Bail before invoking `execute()` so we don't fire a side effect that
    // the server can no longer accept a `/resume` for.
    if (signal?.aborted) {
      return errorResult("Aborted by cancel()");
    }

    // Drive both the 30s timeout and the caller's `signal` through a single
    // AbortController passed to `executeTool`. The polyfill races the page's
    // `execute()` against this signal, so abort is cooperative: a tool that
    // ignores the signal may still complete on the page after the agent gets
    // an `isError` result. Side-effectful tools should bound their own work.
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const onAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      const raw = await mc.executeTool(info, safeStringifyArgs(args), {
        signal: controller.signal,
      });
      return normalizeSerializedResult(raw);
    } catch (err) {
      if (timedOut) {
        return errorResult(
          `WebMCP tool '${bareName}' timed out after ${this.timeoutMs}ms`,
        );
      }
      if (signal?.aborted) {
        return errorResult("Aborted by cancel()");
      }
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(message);
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    }
  }

  /**
   * Lazily install `@mcp-b/webmcp-polyfill` the first time the bridge needs the
   * registry. Idempotent and memoized. Dynamic import keeps the polyfill out of
   * the main bundle and prevents it from installing `document.modelContext` for
   * widget consumers that never enable WebMCP.
   *
   * Producer pages should still install the polyfill themselves (or import it)
   * before registering tools: Persona's install is a fallback, and a page that
   * registers tools at load before Persona's first dispatch needs the global to
   * already exist.
   */
  private ensureReady(): Promise<void> {
    if (this.config.enabled !== true) return Promise.resolve();
    if (!this.readyPromise) {
      this.readyPromise = this.install();
    }
    return this.readyPromise;
  }

  private async install(): Promise<void> {
    try {
      // A compatible registry is already on the page (the host installed the
      // polyfill, or a native impl): initialize would no-op against it, so
      // skip loading the module entirely. Pages that register tools before
      // Persona's first dispatch always land here, because registering
      // requires `document.modelContext` to exist.
      if (this.getModelContext()) {
        this.installed = true;
        return;
      }
      const mod = await this.deps.loadPolyfill();
      // Idempotent: no-ops if `document.modelContext` already exists (native or
      // a prior install by the host page).
      mod.initializeWebMCPPolyfill();
      this.installed = true;
    } catch (err) {
      log.warn(
        "Failed to load @mcp-b/webmcp-polyfill: WebMCP consumption disabled.",
        err,
      );
      this.installed = false;
    }
  }

  /**
   * Read the consumer surface off `document.modelContext`, returning `null`
   * when it is absent or doesn't expose the producer-preview API we rely on.
   */
  private getModelContext(): ModelContextCoreLike | null {
    if (typeof document === "undefined") return null;
    const mc = (document as Document & { modelContext?: unknown }).modelContext;
    if (!mc || typeof mc !== "object") {
      // Absent (not yet installed, or no WebMCP on this page): not an error,
      // and not worth warning about; the snapshot/execute paths fall back to a
      // clean "not operational" result.
      return null;
    }
    const core = mc as Partial<ModelContextCoreLike>;
    if (
      typeof core.getTools !== "function" ||
      typeof core.executeTool !== "function"
    ) {
      // A `document.modelContext` IS present but doesn't expose the strict-core
      // surface we consume (`getTools` / `executeTool`). This usually means a
      // different or older WebMCP polyfill (or a native impl on a divergent
      // draft) installed the global first: which `@mcp-b/webmcp-polyfill`
      // correctly declines to overwrite. Warn once so integrators understand
      // why WebMCP is inert instead of seeing a silent no-op.
      if (!this.incompatibleContextWarned) {
        this.incompatibleContextWarned = true;
        log.warn(
          "document.modelContext is present but does not expose getTools()/executeTool(): " +
            "WebMCP consumption is disabled. Another (incompatible or older) WebMCP polyfill " +
            "likely installed document.modelContext before Persona. Remove it, or use a polyfill " +
            "implementing the strict standard surface (e.g. @mcp-b/webmcp-polyfill).",
        );
      }
      return null;
    }
    return mc as ModelContextCoreLike;
  }

  private async requestConfirm(info: WebMcpConfirmInfo): Promise<boolean> {
    const handler = this.confirmHandler ?? defaultBrowserConfirmHandler;
    try {
      return await handler(info);
    } catch (err) {
      log.warn(
        `Confirm handler threw for WebMCP tool '${info.toolName}'; declining.`,
        err,
      );
      return false;
    }
  }

  private passesClientAllowlist(toolName: string): boolean {
    const list = this.config.allowlist;
    if (!list || list.length === 0) return true;
    return list.some((pattern) => matchesGlob(toolName, pattern));
  }
}

/**
 * Glob match with `*` as the only wildcard. Matches any sequence of any
 * characters. Sufficient for the spec's prefix-style allowlists like
 * `search_*` or `list_*`. Tool names themselves cannot contain `:`
 * (see polyfill validation), so we don't need to special-case it.
 */
const matchesGlob = (name: string, pattern: string): boolean => {
  if (pattern === "*") return true;
  // Escape regex metachars except `*`, then convert `*` to `.*`.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp("^" + escaped.replace(/\*/g, ".*") + "$");
  return regex.test(name);
};

/**
 * Parse the JSON-string `inputSchema` from `getTools()` back into an object for
 * `parametersSchema`. Returns `undefined` for a missing or unparseable schema
 * (the server can still accept a tool with no declared parameters).
 */
const parseSchema = (raw: string | undefined): object | undefined => {
  if (raw === undefined || raw === "") return undefined;
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object"
      ? (parsed as object)
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Normalize the JSON-string result from `executeTool` into MCP `CallToolResult`
 * shape. The polyfill returns `JSON.stringify(rawResult)` (the tool's raw
 * `execute()` return, NOT pre-normalized) or `null` for an `undefined` return.
 * Already-shaped returns (with `content: [...]`) pass through; everything else
 * becomes a single text block. Tools that intentionally return MCP errors
 * should set `isError: true` themselves.
 */
const normalizeSerializedResult = (raw: string | null): WebMcpToolResult => {
  if (raw === null || raw === undefined) {
    return { content: [{ type: "text", text: "" }] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not valid JSON (shouldn't happen, the polyfill stringifies), surface
    // the raw string as text rather than dropping it.
    return { content: [{ type: "text", text: raw }] };
  }

  if (
    parsed !== null &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { content?: unknown }).content)
  ) {
    return parsed as WebMcpToolResult;
  }

  const text = typeof parsed === "string" ? parsed : safeStringify(parsed);
  return { content: [{ type: "text", text }] };
};

const errorResult = (message: string): WebMcpToolResult => ({
  isError: true,
  content: [{ type: "text", text: message }],
});

/**
 * Fallback confirm UI: `window.confirm()`. Production deployments should wire
 * `config.webmcp.onConfirm` to a handler matched to their UX (e.g. an inline
 * approval bubble). Declines silently in non-browser environments (SSR, tests
 * without a DOM).
 */
const defaultBrowserConfirmHandler: WebMcpConfirmHandler = async (info) => {
  if (typeof window === "undefined" || typeof window.confirm !== "function") {
    return false;
  }
  const argsPreview = previewArgs(info.args);
  const prompt =
    `Allow the AI to call ${info.toolName}` +
    (argsPreview ? `\n\nArguments:\n${argsPreview}` : "") +
    (info.description ? `\n\n${info.description}` : "");
  return window.confirm(prompt);
};

const previewArgs = (args: unknown): string => {
  if (args === undefined || args === null) return "";
  try {
    const json = JSON.stringify(args, null, 2);
    return json.length > 500 ? json.slice(0, 500) + "…" : json;
  } catch {
    return String(args);
  }
};

/**
 * Stringify tool args for `executeTool(toolInfo, inputArgsJson)`. Falls back to
 * `{}` for `undefined`/non-serializable args so the polyfill always receives a
 * valid JSON object string to validate against the tool schema.
 */
const safeStringifyArgs = (args: unknown): string => {
  if (args === undefined) return "{}";
  try {
    const json = JSON.stringify(args);
    return json === undefined ? "{}" : json;
  } catch {
    return "{}";
  }
};

/**
 * `JSON.stringify` that tolerates circular references and non-serializable
 * values. A misbehaving tool result shouldn't break the resume path.
 */
const safeStringify = (value: unknown): string => {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

