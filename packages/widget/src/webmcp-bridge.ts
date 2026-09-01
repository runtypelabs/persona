/**
 * WebMCP consumption bridge.
 *
 * Owns the per-widget lifecycle of `@mcp-b/webmcp-polyfill`:
 *   - installs the polyfill (lazily, only when enabled) so `document.modelContext`
 *     is present;
 *   - snapshots the host page's tool registry per dispatch turn for
 *     `dispatch.clientTools[]`;
 *   - executes `webmcp:*` tool calls returned by the agent, mediating a single
 *     confirm-bubble gate before invoking the page's `execute()`.
 *
 * Spec reference: WebMCP (https://webmachinelearning.github.io/webmcp/).
 * Wire-level merging, namespace prefixing, and server-side allowlist
 * enforcement live on the Runtype API; this bridge mirrors those checks
 * client-side as a usability convenience, not a security boundary.
 *
 * About `@mcp-b/webmcp-polyfill`: it polyfills the *strict standard surface*
 * only (`registerTool` / `getTools` / `executeTool` on `document.modelContext`),
 * with no MCP-B-only extensions. The spec standardizes the *producer* side;
 * Persona is an in-page *consumer*, so it reads the registry via the
 * producer-facing preview API:
 *   - `getTools()`: async; returns `{ name, description, inputSchema }` where
 *     `inputSchema` is a JSON *string*. Annotations are not exposed here.
 *   - `executeTool(toolInfo, inputArgsJson, { signal })`: async; validates args
 *     against the tool's schema, runs `execute()`, and returns the raw result as
 *     a JSON *string* (or `null` for `undefined`). Honors `signal` for abort.
 *
 * The polyfill auto-installs `document.modelContext` at module-evaluation time,
 * so it is imported *dynamically* and only when `config.webmcp.enabled === true`
 *: a static import would install the global for every widget consumer,
 * including those that never opted into WebMCP.
 *
 * Confirm model: every `webmcp:*` call goes through one confirm gate before
 * `execute()` runs, regardless of `annotations.readOnlyHint`. (The polyfill owns
 * the spec's `client.requestUserInteraction` callback internally; Persona cannot
 * inject a nested confirm there, so the single outer gate is the whole story.)
 */

import type { ClientToolDefinition } from "./types";

/** Server-applied wire prefix; strip when looking up registry entries. */
export const WEBMCP_TOOL_PREFIX = "webmcp:";

/**
 * Minimal structural view of the `@mcp-b/webmcp-polyfill` strict-core surface
 * that Persona consumes. We declare only what we use rather than depending on
 * `@mcp-b/webmcp-types` so the widget's type surface stays self-contained.
 */
export interface ModelContextToolInfo {
  name: string;
  description: string;
  /**
   * JSON Schema for the tool's input, in EITHER generation of the WebMCP
   * contract. Never read it raw: `normalizeInputSchema` in
   * `webmcp-runtime-entry.ts` collapses both shapes to the object the wire
   * needs.
   *
   * `webmcp#241` changed this from a JSON-encoded string to a JSON Schema
   * object. `@mcp-b/webmcp-polyfill` made the switch in v5, and Chrome ships it
   * from 154.0.8013 (cross-document tools first) -- but Chrome 149-153, most of
   * the Origin Trial population, and 154's same-document tools still emit the
   * string. Both are live in the field, so we accept both.
   *
   * Absent when the tool registered no schema: v5 omits the member, where v4
   * always emitted a `{"type":"object"}` string.
   */
  inputSchema?: object | string;
  /**
   * Display title declared on the tool (`ToolDescriptor.title` in the WebMCP
   * spec). The polyfill returns `""` when the tool didn't declare one. Note:
   * `annotations` (incl. the legacy `annotations.title`) are NOT exposed on
   * this strict consumer surface: top-level `title` is the only display-name
   * channel available to us.
   */
  title?: string;
  /**
   * WebMCP `Tool.annotations`. Returned by `getTools()` since
   * `@mcp-b/webmcp-polyfill` v5 (and by Chrome's native implementation);
   * absent on v4 and whenever the tool declared none -- the spec omits the
   * member rather than emitting an empty object.
   */
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
}

export interface ModelContextCoreLike {
  getTools(): Promise<ModelContextToolInfo[]>;
  executeTool(
    tool: ModelContextToolInfo,
    inputArgsJson: string,
    options?: { signal?: AbortSignal },
  ): Promise<string | null>;
}

/**
 * Page-global map of bare tool name → declared display title
 * (`ToolDescriptor.title`). `document.modelContext` is page-global, so a
 * single map shared across widget/bridge instances is semantically correct.
 * Refreshed on every registry read (`snapshotForDispatch` / `executeToolCall`)
 * and consumed by the approval bubble's summary line via
 * `getWebMcpToolDisplayTitle`.
 */
const webMcpToolDisplayTitles = new Map<string, string>();

/**
 * Record declared display titles from a fresh `getTools()` read. The map is
 * rebuilt from scratch, callers always pass the FULL registry snapshot, so
 * a tool that unregistered or dropped its title can't leave a stale label
 * behind. Exported for tests; production callers are the bridge's registry
 * reads.
 */
export const recordWebMcpToolDisplayTitles = (
  infos: ModelContextToolInfo[],
): void => {
  webMcpToolDisplayTitles.clear();
  for (const info of infos) {
    const title = info.title?.trim();
    if (title) webMcpToolDisplayTitles.set(info.name, title);
  }
};

/**
 * Look up the display title a page tool declared via the WebMCP spec's
 * `ToolDescriptor.title`. Accepts wire (`webmcp:add_to_cart`) or bare
 * (`add_to_cart`) names. Returns `undefined` when the tool didn't declare
 * one (callers fall back to humanizing the tool name).
 */
export const getWebMcpToolDisplayTitle = (
  toolName: string,
): string | undefined => webMcpToolDisplayTitles.get(stripWebMcpPrefix(toolName));

/** The slice of `@mcp-b/webmcp-polyfill` the bridge consumes on install. */
export type WebMcpPolyfillModule = {
  initializeWebMCPPolyfill: () => void;
};

/**
 * Override how the polyfill module is obtained. By default the bridge does
 * `import("@mcp-b/webmcp-polyfill")`, which bundlers resolve for npm
 * consumers. The IIFE/CDN build can't resolve a bare specifier at runtime, so
 * its entry (`index-global.ts`) registers a loader that imports the
 * self-contained `webmcp-polyfill.js` chunk from a URL derived from the
 * widget script's own `src`. Page-global, like `document.modelContext`
 * itself. Pass `null` to restore the default (used by tests).
 */
let polyfillLoader: (() => Promise<WebMcpPolyfillModule>) | null = null;

export const setWebMcpPolyfillLoader = (
  loader: (() => Promise<WebMcpPolyfillModule>) | null,
): void => {
  polyfillLoader = loader;
};

/**
 * Compute a stable, order-independent fingerprint of a `ClientToolDefinition[]`
 * snapshot, for the diff-only / send-once dispatch path (client-token mode).
 *
 * The widget caches "the fingerprint of the tool set last sent in full" for the
 * current session; an unchanged set on a follow-up turn lets it ship only the
 * fingerprint instead of the whole array. Per-tool strings are sorted so tool
 * ordering does not affect the result. `pageOrigin` is deliberately excluded: * it is audit metadata, not part of the tool contract.
 *
 * This is a fast, non-cryptographic content key. The canonical per-tool content
 * is hashed down to a short, fixed-length digest so the result fits the server's
 * `clientToolsFingerprint` wire field (`z.string().max(128)`) regardless of how
 * many tools the page registers: sending the raw concatenated content would
 * overflow that bound and be rejected with a 400. The server stores and compares
 * the widget's fingerprint verbatim, so cross-implementation byte-equality is NOT
 * required: only self-consistency across this widget's turns.
 */
export function computeClientToolsFingerprint(
  tools: ClientToolDefinition[],
): string {
  if (tools.length === 0) return "0:empty";
  const parts = tools
    .map((t) =>
      [
        t.name,
        t.description ?? "",
        t.parametersSchema ? JSON.stringify(t.parametersSchema) : "",
        t.origin ?? "",
        t.annotations ? JSON.stringify(t.annotations) : "",
      ].join("\x1f"),
    )
    .sort();
  return `${tools.length}:${hashFingerprintContent(parts.join("\x1e"))}`;
}

/**
 * cyrb53: a fast, well-distributed non-cryptographic string hash. Returns a
 * 53-bit value (safe-integer range). Two independent seeds are combined by the
 * caller for a ~106-bit digest, which makes accidental collisions across a
 * single conversation's handful of tool-set variants infeasible.
 */
function cyrb53(str: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Compress the canonical tool-set content string into a short, fixed-length
 * fingerprint (≤ ~24 chars) that fits the server's 128-char wire bound. Uses two
 * seeded cyrb53 passes, base-36 encoded.
 */
function hashFingerprintContent(content: string): string {
  const a = cyrb53(content, 0).toString(36);
  const b = cyrb53(content, 0x9e3779b1).toString(36);
  return `${a}.${b}`;
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
 * Resolve the polyfill module through the registered loader (IIFE/CDN) or the
 * bare-specifier dynamic import (npm bundlers). Captured here — where the
 * `polyfillLoader` slot lives — and INJECTED into the lazily-loaded
 * `WebMcpBridge` runtime (see webmcp-runtime-entry.ts): the runtime chunk is
 * bundled `noExternal` and must not reference this module's state (it would
 * get its own dead copy of the slot) nor the bare specifier (it would inline
 * the whole polyfill into the chunk).
 */
export const loadWebMcpPolyfillModule = (): Promise<WebMcpPolyfillModule> =>
  polyfillLoader ? polyfillLoader() : import("@mcp-b/webmcp-polyfill");
