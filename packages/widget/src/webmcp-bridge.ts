/**
 * WebMCP consumption bridge.
 *
 * Owns the per-widget lifecycle of `@runtypelabs/webmcp-polyfill`:
 *   - installs the polyfill once at construction (if enabled);
 *   - snapshots the host page's tool registry per dispatch turn for
 *     `dispatch.clientTools[]`;
 *   - executes `webmcp:*` tool calls returned by the agent, mediating the
 *     confirm-bubble gate and the spec's `client.requestUserInteraction`
 *     callback shim.
 *
 * Spec reference: WebML Community Group Draft Report, 20 May 2026
 * (https://webmcp.github.io / proposal.md). Wire-level merging,
 * namespace prefixing, and server-side allowlist enforcement live on the
 * Runtype API; this bridge mirrors those checks client-side as a usability
 * convenience, not a security boundary.
 *
 * Phase 3: every `webmcp:*` call goes through the confirm gate, regardless
 * of `annotations.readOnlyHint`. Phase 4 will introduce silent auto-run
 * for `readOnlyHint: true` tools and `requireConfirmFor` overrides.
 */

import {
  installPolyfill,
  type InstallResult,
  type ModelContextClient,
} from "@runtypelabs/webmcp-polyfill";
import type {
  AgentWidgetWebMcpConfig,
  ClientToolDefinition,
  WebMcpConfirmHandler,
  WebMcpConfirmInfo,
  WebMcpToolResult,
} from "./types";

/**
 * Default per-call timeout for a WebMCP tool's `execute()` function. Mirrors
 * the spec guidance to bound execution and keeps a misbehaving tool from
 * pinning the agent indefinitely.
 */
const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

/** Server-applied wire prefix; strip when looking up registry entries. */
export const WEBMCP_TOOL_PREFIX = "webmcp:";

const log = {
  warn(message: string, ...rest: unknown[]): void {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      // eslint-disable-next-line no-console
      console.warn(`[Persona/WebMCP] ${message}`, ...rest);
    }
  },
};

export class WebMcpBridge {
  private readonly install: InstallResult | null;
  private confirmHandler: WebMcpConfirmHandler | null;
  private readonly timeoutMs: number;

  constructor(private readonly config: AgentWidgetWebMcpConfig) {
    this.confirmHandler = config.onConfirm ?? null;
    this.timeoutMs = DEFAULT_TOOL_TIMEOUT_MS;

    if (this.config.enabled !== true) {
      this.install = null;
      return;
    }

    try {
      this.install = installPolyfill();
    } catch (err) {
      log.warn("installPolyfill() threw — WebMCP consumption disabled.", err);
      this.install = null;
    }
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
   * `true` when the bridge can both snapshot the registry AND execute
   * returned tool calls. `false` for any guard miss — including a native
   * `navigator.modelContext` that arrived without the polyfill's read API
   * (Phase 3 degrades gracefully; Phase 7 stretch may swap in a native
   * read API once one exists).
   */
  public isOperational(): boolean {
    if (this.config.enabled !== true) return false;
    if (!this.install) return false;
    if (this.install.modelContext === null) return false;

    if (this.install.status === "deferred-native") {
      // Native browser shipped, polyfill skipped install. Until the spec
      // exposes a public read API for in-page agents, we can't enumerate
      // page-registered tools — quietly disable snapshotting.
      return false;
    }

    return true;
  }

  /**
   * Per-turn snapshot for `dispatch.clientTools[]`. Returns the JSON-only
   * surface — `execute`, `annotations` mutations, and the polyfill's
   * AbortSignal stay client-side.
   */
  public snapshotForDispatch(): ClientToolDefinition[] {
    if (!this.isOperational()) return [];

    const mc = this.install!.modelContext!;
    const entries = mc.__getRegisteredTools();
    const pageOrigin = typeof location !== "undefined" ? location.origin : "";

    return entries
      .filter((entry) => this.passesClientAllowlist(entry.tool.name))
      .map<ClientToolDefinition>((entry) => {
        const def: ClientToolDefinition = {
          name: entry.tool.name,
          description: entry.tool.description,
          origin: "webmcp",
          ...(pageOrigin ? { pageOrigin } : {}),
        };
        if (entry.tool.inputSchema !== undefined) {
          def.parametersSchema = entry.tool.inputSchema;
        }
        if (entry.tool.annotations !== undefined) {
          // Copy only spec fields — guards against forward-compat surprises.
          const ann: ClientToolDefinition["annotations"] = {};
          if (entry.tool.annotations.readOnlyHint !== undefined) {
            ann.readOnlyHint = entry.tool.annotations.readOnlyHint;
          }
          if (entry.tool.annotations.untrustedContentHint !== undefined) {
            ann.untrustedContentHint =
              entry.tool.annotations.untrustedContentHint;
          }
          if (Object.keys(ann).length > 0) def.annotations = ann;
        }
        return def;
      });
  }

  /**
   * Execute a `webmcp:<name>` tool call returned by the agent and return the
   * normalized MCP-shaped result for `/resume`.
   *
   * Failure modes — all return `{ isError: true, content: [...] }` rather
   * than throwing, so the dispatch can resume cleanly:
   *   - bridge not operational
   *   - tool not in registry (e.g. unmounted between snapshot and call)
   *   - user declined the confirm gate
   *   - `execute()` threw
   *   - `execute()` exceeded the 30s timeout
   */
  public async executeToolCall(
    wireToolName: string,
    args: unknown,
  ): Promise<WebMcpToolResult> {
    if (!this.isOperational()) {
      return errorResult(
        "WebMCP bridge is not operational on this page (polyfill not installed).",
      );
    }

    const bareName = stripWebMcpPrefix(wireToolName);
    const mc = this.install!.modelContext!;
    const entry = mc
      .__getRegisteredTools()
      .find((candidate) => candidate.tool.name === bareName);

    if (!entry) {
      return errorResult(
        `WebMCP tool not registered on this page: ${bareName}`,
      );
    }

    // Phase 3 confirm-by-default gate. Phase 4 will branch on
    // `annotations.readOnlyHint` and `requireConfirmFor` here.
    const gateInfo: WebMcpConfirmInfo = {
      toolName: bareName,
      args,
      description: entry.tool.description,
      annotations: entry.tool.annotations,
      reason: "gate",
    };
    if (!(await this.requestConfirm(gateInfo))) {
      return errorResult("User declined the tool call.");
    }

    const modelContextClient: ModelContextClient = {
      requestUserInteraction: async <T>(
        callback: () => Promise<T> | T,
      ): Promise<T> => {
        // Tool itself asked for an explicit user confirmation step (e.g. an
        // in-tool "Are you sure?"). Render Persona's bubble in addition to
        // the gate above; only invoke the callback on approve.
        const approved = await this.requestConfirm({
          toolName: bareName,
          args,
          description: entry.tool.description,
          annotations: entry.tool.annotations,
          reason: "requestUserInteraction",
        });
        if (!approved) {
          throw new Error("User declined interaction.");
        }
        return Promise.resolve(callback());
      },
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const raw = await Promise.race<unknown>([
        Promise.resolve(entry.tool.execute(args, modelContextClient)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `WebMCP tool '${bareName}' timed out after ${this.timeoutMs}ms`,
                ),
              ),
            this.timeoutMs,
          );
        }),
      ]);
      return normalizeResult(raw, entry.tool.annotations);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(message);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
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
 * Strip the server-applied `webmcp:` prefix from a wire-format tool name.
 * Exported for tests; widget code should always go through the bridge.
 */
export const stripWebMcpPrefix = (name: string): string =>
  name.startsWith(WEBMCP_TOOL_PREFIX)
    ? name.slice(WEBMCP_TOOL_PREFIX.length)
    : name;

/**
 * `true` when `wireToolName` carries the `webmcp:` prefix. Used by `client.ts`
 * to route `step_await` events.
 */
export const isWebMcpToolName = (name: string): boolean =>
  name.startsWith(WEBMCP_TOOL_PREFIX);

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
 * Wrap an arbitrary `execute()` return value into MCP `CallToolResult` shape.
 * Already-shaped returns (with `content: [...]`) pass through; everything
 * else becomes a single text block. Tools that intentionally return MCP
 * errors should set `isError: true` themselves.
 */
const normalizeResult = (
  raw: unknown,
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean },
): WebMcpToolResult => {
  if (
    raw !== null &&
    typeof raw === "object" &&
    Array.isArray((raw as { content?: unknown }).content)
  ) {
    const shaped = raw as WebMcpToolResult;
    if (annotations?.untrustedContentHint && !shaped.annotations) {
      return { ...shaped, annotations: { untrustedContentHint: true } };
    }
    return shaped;
  }

  const text =
    typeof raw === "string"
      ? raw
      : raw === undefined
        ? ""
        : safeStringify(raw);

  const result: WebMcpToolResult = {
    content: [{ type: "text", text }],
  };
  if (annotations?.untrustedContentHint) {
    result.annotations = { untrustedContentHint: true };
  }
  return result;
};

const errorResult = (message: string): WebMcpToolResult => ({
  isError: true,
  content: [{ type: "text", text: message }],
});

/**
 * Phase 3 fallback confirm UI: `window.confirm()`. Phase 4 replaces this
 * with an inline approval bubble rendered through Persona's `ui.ts` —
 * consumers will then pick up the polished UX automatically. Until then,
 * production deployments should wire `config.webmcp.onConfirm` to a custom
 * handler matched to their UX.
 *
 * Declines silently in non-browser environments (SSR, tests without a DOM).
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
 * `JSON.stringify` that tolerates circular references and non-serializable
 * values. A misbehaving tool shouldn't break the resume path.
 */
const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};
