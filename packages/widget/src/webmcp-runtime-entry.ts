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
  VoiceClientToolOutcome,
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

/**
 * One run of a page tool, before it is shaped for `/resume` (`executeToolCall`)
 * or for a voice `client_tool_result` (`executeVoiceToolCall`). `message` is
 * the exact text the `/resume` error result has always carried.
 */
type ToolRunFailureReason = "stale" | "denied" | "failed" | "timeout" | "aborted";
type ToolRunOutcome =
  | { ok: true; raw: string | null }
  | { ok: false; reason: ToolRunFailureReason; message: string };

const runFailure = (reason: ToolRunFailureReason, message: string): ToolRunOutcome => ({
  ok: false,
  reason,
  message,
});

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
  #confirmHandler: WebMcpConfirmHandler | null;
  readonly #timeoutMs: number;

  /** `true` once the polyfill has been (idempotently) installed. */
  #installed = false;
  /** Memoizes the one-shot async install so concurrent callers share it. */
  #readyPromise: Promise<void> | null = null;
  /**
   * Warn-once latch for a present-but-incompatible `document.modelContext`
   * (some other / older WebMCP polyfill squatting the global). `getModelContext`
   * is hit on every snapshot + execute, so we log the diagnostic only once.
   */
  #incompatibleContextWarned = false;

  readonly #deps: WebMcpBridgeDeps;
  constructor(
    private readonly config: AgentWidgetWebMcpConfig,
    deps: WebMcpBridgeDeps,
  ) {
    this.#deps = deps;
    this.#confirmHandler = config.onConfirm ?? null;
    this.#timeoutMs = DEFAULT_TOOL_TIMEOUT_MS;
  }

  /**
   * Override the confirm handler post-construction. Used by `ui.ts` to wire
   * the in-panel approval bubble after the client has been built (the widget
   * lifecycle constructs the client before the panel renders).
   */
  public setConfirmHandler(handler: WebMcpConfirmHandler | null): void {
    this.#confirmHandler = handler;
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
    if (!this.#installed) return false;
    return this.#getModelContext() !== null;
  }

  /**
   * Per-turn snapshot for `dispatch.clientTools[]`. Returns the JSON-only
   * surface: `execute` stays client-side, reached later via `executeToolCall`.
   *
   * Async because the strict polyfill's `getTools()` is async. Both payload
   * builders in `client.ts` already `await`, so this adds no new ceremony.
   */
  public async snapshotForDispatch(): Promise<ClientToolDefinition[]> {
    await this.#ensureReady();
    if (this.config.enabled !== true) return [];

    const mc = this.#getModelContext();
    if (!mc) return [];

    let infos: ModelContextToolInfo[];
    try {
      infos = (await mc.getTools()).filter(isLocalTool);
    } catch (err) {
      log.warn("getTools() threw: shipping an empty WebMCP snapshot.", err);
      return [];
    }
    this.#deps.recordToolDisplayTitles(infos);

    const pageOrigin = typeof location !== "undefined" ? location.origin : "";

    return infos
      .filter((info) => this.#passesClientAllowlist(info.name))
      .map<ClientToolDefinition>((info) => {
        const annotations = pickAnnotations(info.annotations);
        const def: ClientToolDefinition = {
          name: info.name,
          description: info.description,
          parametersSchema: normalizeInputSchema(info.inputSchema),
          origin: "webmcp",
          ...(pageOrigin ? { pageOrigin } : {}),
          ...(annotations ? { annotations } : {}),
          // Hoisted because the server acts on the TOP-LEVEL field
          // (`InlineClientToolSchema.untrustedContentHint` gates output
          // spotlighting); the nested `annotations` object is metadata only.
          ...(annotations?.untrustedContentHint === true
            ? { untrustedContentHint: true }
            : {}),
        };
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
   *   - `execute()` threw or returned a non-serializable result
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
    const outcome = await this.#run(wireToolName, args, signal, false);
    return outcome.ok
      ? normalizeSerializedResult(outcome.raw)
      : errorResult(outcome.message);
  }

  /**
   * Execute a page tool the voice server picked for a delegation
   * (`client_tool_call`) and return its `client_tool_result` outcome.
   *
   * Same registry lookup, allowlist, abort points and timeout as
   * `executeToolCall`, with one difference: when `autoConfirmReadOnly` is set,
   * a tool whose LIVE registry entry declares `annotations.readOnlyHint ===
   * true` skips the confirm gate. Every other tool still shows it, and a
   * decline answers `denied`. A tool missing from the registry or excluded by
   * the allowlist answers `stale` (the server's snapshot is out of date).
   * `signal` aborting (the caller's deadline, a hang-up) answers `failed`;
   * the caller decides whether that was its timeout.
   */
  public async executeVoiceToolCall(
    wireToolName: string,
    args: unknown,
    options: { signal?: AbortSignal; autoConfirmReadOnly?: boolean } = {},
  ): Promise<VoiceClientToolOutcome> {
    const outcome = await this.#run(
      wireToolName,
      args,
      options.signal,
      options.autoConfirmReadOnly === true,
    );
    if (!outcome.ok) {
      return {
        status: outcome.reason === "aborted" ? "failed" : outcome.reason,
        error: { message: outcome.message },
      };
    }
    return voiceOutcomeFromRaw(outcome.raw);
  }

  /**
   * Call `listener` whenever the page's tool registry changes (the WebMCP
   * `toolchange` event on `document.modelContext`). Returns an unsubscribe.
   * A registry without the event never calls it: callers then keep the
   * snapshot they took first.
   */
  public watchToolChanges(listener: () => void): () => void {
    let stopped = false;
    let target: EventTarget | null = null;
    void this.#ensureReady().then(() => {
      if (stopped || this.config.enabled !== true) return;
      const mc = this.#getModelContext() as unknown as Partial<EventTarget> | null;
      if (!mc || typeof mc.addEventListener !== "function") return;
      target = mc as EventTarget;
      target.addEventListener("toolchange", listener);
    });
    return () => {
      stopped = true;
      target?.removeEventListener("toolchange", listener);
      target = null;
    };
  }

  async #run(
    wireToolName: string,
    args: unknown,
    signal: AbortSignal | undefined,
    autoConfirmReadOnly: boolean,
  ): Promise<ToolRunOutcome> {
    await this.#ensureReady();
    if (this.config.enabled !== true) {
      return runFailure("failed", "WebMCP is not enabled on this widget.");
    }

    const mc = this.#getModelContext();
    if (!mc) {
      // Distinguish "no modelContext at all" from "present but incompatible"
      // (a foreign/older polyfill squatting document.modelContext) so the
      // resumed error is actionable. getModelContext has already warned once
      // for the incompatible case.
      const present =
        typeof document !== "undefined" &&
        Boolean((document as Document & { modelContext?: unknown }).modelContext);
      return runFailure(
        "failed",
        present
          ? "WebMCP is not operational: document.modelContext is present but does not expose the strict getTools()/executeTool() surface (likely a different or older WebMCP polyfill)."
          : "WebMCP bridge is not operational on this page (document.modelContext not available).",
      );
    }

    const bareName = stripWebMcpPrefix(wireToolName);

    let infos: ModelContextToolInfo[];
    try {
      infos = (await mc.getTools()).filter(isLocalTool);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return runFailure("failed", `Failed to read WebMCP registry: ${message}`);
    }
    this.#deps.recordToolDisplayTitles(infos);
    const info = infos.find((candidate) => candidate.name === bareName);

    if (!info) {
      return runFailure(
        "stale",
        `WebMCP tool not registered on this page: ${bareName}`,
      );
    }

    // Re-apply the client-side allowlist at execute time. `snapshotForDispatch`
    // already filters it for `clientTools[]`, but the agent could request a
    // tool that the integrator excluded: e.g. a `webmcp:` call replayed from
    // history, a server bug, or a page that re-registered a previously-hidden
    // tool. The server is the trust boundary; this is a defense-in-depth
    // convenience check to keep us symmetric with the snapshot.
    if (!this.#passesClientAllowlist(bareName)) {
      return runFailure(
        "stale",
        `WebMCP tool not allowed by client allowlist: ${bareName}`,
      );
    }

    // Bail before the confirm renders: a late approval after cancel() would
    // otherwise fire a host-page side effect with no matching /resume.
    if (signal?.aborted) {
      return runFailure("aborted", "Aborted by cancel()");
    }

    // Confirm-by-default gate. Every chat-path `webmcp:*` call routes through
    // here regardless of `annotations.readOnlyHint`; only a voice fast-tier
    // call (`autoConfirmReadOnly`) of a tool the registry marks read-only skips it.
    const displayTitle = this.#deps.getToolDisplayTitle(bareName);
    const annotations = pickAnnotations(info.annotations);
    const gateInfo: WebMcpConfirmInfo = {
      toolName: bareName,
      args,
      description: info.description,
      ...(annotations ? { annotations } : {}),
      ...(displayTitle ? { title: displayTitle } : {}),
      ...(signal ? { signal } : {}),
      reason: "gate",
    };
    const skipGate = autoConfirmReadOnly && annotations?.readOnlyHint === true;
    if (!skipGate && !(await this.#requestConfirm(gateInfo))) {
      return runFailure("denied", "User declined the tool call.");
    }

    // The await above may have parked us long enough for cancel() to fire.
    // Bail before invoking `execute()` so we don't fire a side effect that
    // the server can no longer accept a `/resume` for.
    if (signal?.aborted) {
      return runFailure("aborted", "Aborted by cancel()");
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
    }, this.#timeoutMs);
    const onAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      const raw = await mc.executeTool(info, createCompatibleToolInput(args), {
        signal: controller.signal,
      });
      return { ok: true, raw };
    } catch (err) {
      if (timedOut) {
        return runFailure(
          "timeout",
          `WebMCP tool '${bareName}' timed out after ${this.#timeoutMs}ms`,
        );
      }
      if (signal?.aborted) {
        return runFailure("aborted", "Aborted by cancel()");
      }
      const message = err instanceof Error ? err.message : String(err);
      return runFailure("failed", message);
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
  #ensureReady(): Promise<void> {
    if (this.config.enabled !== true) return Promise.resolve();
    if (!this.#readyPromise) {
      this.#readyPromise = this.#install();
    }
    return this.#readyPromise;
  }

  async #install(): Promise<void> {
    try {
      // A compatible registry is already on the page (the host installed the
      // polyfill, or a native impl): initialize would no-op against it, so
      // skip loading the module entirely. Pages that register tools before
      // Persona's first dispatch always land here, because registering
      // requires `document.modelContext` to exist.
      if (this.#getModelContext()) {
        this.#installed = true;
        return;
      }
      const mod = await this.#deps.loadPolyfill();
      // Idempotent: no-ops if `document.modelContext` already exists (native or
      // a prior install by the host page).
      if ("installWebMCP" in mod) mod.installWebMCP();
      else mod.initializeWebMCPPolyfill();
      if (!this.#getModelContext()) {
        // v6 deliberately no-ops instead of half-installing: insecure page,
        // or an engine without the APIs its core needs.
        log.warn(
          "WebMCP polyfill did not install document.modelContext: WebMCP consumption disabled. " +
            "It requires a secure context (HTTPS or localhost) and Chrome/Firefox 126+ or Safari 18+.",
        );
        this.#installed = false;
        return;
      }
      this.#installed = true;
    } catch (err) {
      log.warn(
        "Failed to load @mcp-b/webmcp-polyfill: WebMCP consumption disabled.",
        err,
      );
      this.#installed = false;
    }
  }

  /**
   * Read the consumer surface off `document.modelContext`, returning `null`
   * when it is absent or doesn't expose the producer-preview API we rely on.
   */
  #getModelContext(): ModelContextCoreLike | null {
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
      if (!this.#incompatibleContextWarned) {
        this.#incompatibleContextWarned = true;
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

  async #requestConfirm(info: WebMcpConfirmInfo): Promise<boolean> {
    const handler = this.#confirmHandler ?? defaultBrowserConfirmHandler;
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

  #passesClientAllowlist(toolName: string): boolean {
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
 * A tool that declared no usable schema. Sent rather than omitted: see below.
 */
const EMPTY_INPUT_SCHEMA = { type: "object", properties: {} } as const;

/**
 * `getTools()`'s `inputSchema`, in either generation, as the JSON Schema object
 * `dispatch.clientTools[].parametersSchema` carries.
 *
 * TWO shapes are live in the field. `webmcp#241` replaced the serialized JSON
 * string with a JSON Schema object; `@mcp-b/webmcp-polyfill` adopted that in v5
 * and Chrome ships it from 154.0.8013 (cross-document tools first), while
 * Chrome 149-153 -- most of the Origin Trial population -- and 154's
 * same-document tools still emit the string. So: branch on `typeof`, and guard
 * the parse of the string arm. Assuming one shape is a silent failure here and
 * a loud one at dispatch, which is how the object generation shipped past us
 * (`JSON.parse(object)` throws, every schema was dropped, every turn 400'd).
 *
 * ALWAYS returns an object. `parametersSchema` is required by the server's
 * `InlineClientToolSchema`, and one entry missing it fails the whole top-level
 * `DispatchRequestSchema` union -- 400-ing the entire turn rather than dropping
 * the one tool, with an `INVALID_UNION` at path `""` that names nothing. A tool
 * with no schema, or an unparseable one, degrades to "takes no arguments"
 * instead of taking the conversation down with it.
 */
/**
 * Copy the WebMCP annotation hints onto the wire, dropping anything else.
 *
 * `getTools()` returns `annotations` since `@mcp-b/webmcp-polyfill` v5 (absent
 * on v4 and when the tool declared none). Only supported boolean hints are
 * forwarded -- annotations are page-authored, so an explicit copy keeps
 * functions/junk off the dispatch payload. Returns `undefined` when nothing
 * usable remains so the member is omitted, matching the spec's own
 * omit-when-empty behavior.
 */
const pickAnnotations = (
  raw: ModelContextToolInfo["annotations"],
): ClientToolDefinition["annotations"] | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const picked: NonNullable<ClientToolDefinition["annotations"]> = {};
  for (const key of [
    "readOnlyHint", "destructiveHint", "consequentialHint", "untrustedContentHint",
    "idempotentHint", "openWorldHint", "debugging",
  ] as const) {
    const value = raw[key];
    if (typeof value === "boolean") picked[key] = value;
  }
  return Object.keys(picked).length > 0 ? picked : undefined;
};

const normalizeInputSchema = (raw: object | string | undefined): object => {
  if (raw === undefined || raw === "") return { ...EMPTY_INPUT_SCHEMA };

  // Object generation (webmcp#241): pass through as-is. Arrays are `typeof
  // "object"` but are not JSON Schema objects, so they fall through.
  if (typeof raw === "object") {
    return raw !== null && !Array.isArray(raw) ? raw : { ...EMPTY_INPUT_SCHEMA };
  }

  // String generation: guarded parse.
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as object)
      : { ...EMPTY_INPUT_SCHEMA };
  } catch {
    return { ...EMPTY_INPUT_SCHEMA };
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

/**
 * One invocation works with both contracts: v5/native previews coerce input to
 * JSON text, whereas v6 serializes the object. Keep the coercion hook off the
 * JSON payload and clone first so we never mutate caller-owned arguments.
 * Do not probe by executing/retrying: page tools may have irreversible effects.
 */
const createCompatibleToolInput = (args: unknown): object => {
  let json: string;
  try {
    json = JSON.stringify(args) ?? "{}";
  } catch {
    // Preserve the historical fallback for non-serializable arguments.
    json = "{}";
  }
  const input: unknown = JSON.parse(json);
  if (input === null || typeof input !== "object") {
    throw new TypeError("WebMCP tool arguments must be an object or array.");
  }
  Object.defineProperty(input, Symbol.toPrimitive, { value: () => json });
  return input;
};

const errorResult = (message: string): WebMcpToolResult => ({
  isError: true,
  content: [{ type: "text", text: message }],
});

const textOfContent = (content: unknown): string =>
  Array.isArray(content)
    ? content
        .map((block: unknown) =>
          block && typeof block === "object" && typeof (block as { text?: unknown }).text === "string"
            ? (block as { text: string }).text
            : "",
        )
        .filter(Boolean)
        .join("\n")
    : "";

/**
 * A page tool's serialized return as a voice `client_tool_result`: the tool's
 * own JSON value (not the MCP content wrapper `/resume` gets), so the server
 * can template a readout from its fields. A tool that returned an MCP error
 * (`isError: true`) is `failed`, with its text as the message.
 */
const voiceOutcomeFromRaw = (raw: string | null): VoiceClientToolOutcome => {
  if (raw === null || raw === undefined) return { status: "completed" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "completed", result: raw };
  }
  if (parsed !== null && typeof parsed === "object" && (parsed as { isError?: unknown }).isError === true) {
    const message = textOfContent((parsed as { content?: unknown }).content);
    return { status: "failed", error: { message: message || "The page tool reported an error." } };
  }
  return parsed === undefined ? { status: "completed" } : { status: "completed", result: parsed };
};

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

/** Keep name-only dispatch scoped to this document, not related frames. */
const isLocalTool = (info: ModelContextToolInfo): boolean =>
  (info.window === undefined ||
    (typeof window !== "undefined" && info.window === window)) &&
  (info.origin === undefined ||
    (typeof location !== "undefined" && info.origin === location.origin));

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

