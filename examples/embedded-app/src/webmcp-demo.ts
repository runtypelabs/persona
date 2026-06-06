import "@runtypelabs/persona/widget.css";

import {
  createAgentExperience,
  createLocalStorageAdapter,
  initAgentWidget,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type AgentWidgetController,
  type WebMcpConfirmInfo,
} from "@runtypelabs/persona";
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";
import { setupMountMode, renderInlineMount, renderLauncherScene } from "./mount-mode";
import type { Mode } from "./examples-nav";

// ---------------------------------------------------------------------------
// 1. Install the polyfill and register two page tools.
//
// `@mcp-b/webmcp-polyfill` polyfills the strict standard surface on
// `document.modelContext` (registerTool / getTools / executeTool). It also
// auto-initializes on import, but we call `initializeWebMCPPolyfill()`
// explicitly so the order is obvious — it is idempotent and no-ops if a native
// `document.modelContext` is already present.
//
// Persona (the widget) also lazily installs the polyfill from inside its WebMCP
// bridge, but the *producer* page should install it itself before registering
// tools so the global exists by the time `registerTool` runs.
// ---------------------------------------------------------------------------

/**
 * Minimal structural view of the producer surface we use here. The full type
 * lives in `@mcp-b/webmcp-types`; declaring just `registerTool` keeps this demo
 * self-contained.
 */
interface RegisterableModelContext {
  registerTool(
    tool: {
      name: string;
      description: string;
      inputSchema?: object;
      annotations?: Record<string, unknown>;
      execute: (
        args: Record<string, unknown>,
        client: { requestUserInteraction: (cb: () => unknown) => Promise<unknown> },
      ) => unknown;
    },
    options?: { signal?: AbortSignal },
  ): void;
}

const log = document.getElementById("webmcp-log");
const writeLog = (msg: string): void => {
  if (!log) return;
  const ts = new Date().toLocaleTimeString();
  log.textContent = `[${ts}] ${msg}\n${log.textContent ?? ""}`;
};

initializeWebMCPPolyfill();

const modelContext = (
  document as Document & { modelContext?: RegisterableModelContext }
).modelContext;

if (!modelContext) {
  writeLog("document.modelContext unavailable — WebMCP tools not registered.");
} else {
  writeLog("document.modelContext ready (@mcp-b/webmcp-polyfill)");

  const ac = new AbortController();

  modelContext.registerTool(
    {
      name: "search_products",
      description: "Search the mock product catalog by free-text query.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Free-text search query." },
        },
        required: ["query"],
      },
      annotations: { readOnlyHint: true },
      execute(input): unknown {
        const { query } = input as { query: string };
        writeLog(`search_products({ query: "${query}" })`);
        return {
          query,
          hits: [
            { sku: "SHOE-001", title: "Running Shoes (Blue)", price: 89.0 },
            { sku: "SHOE-002", title: "Running Shoes (Black)", price: 89.0 },
            { sku: "SHOE-007", title: "Trail Runners", price: 119.0 },
          ],
        };
      },
    },
    { signal: ac.signal },
  );

  modelContext.registerTool(
    {
      name: "add_to_cart",
      description: "Add a product to the shopper's cart by SKU.",
      inputSchema: {
        type: "object",
        properties: {
          sku: { type: "string" },
          quantity: { type: "integer", minimum: 1 },
        },
        required: ["sku"],
      },
      annotations: { readOnlyHint: false },
      execute(input): unknown {
        const { sku, quantity = 1 } = input as {
          sku: string;
          quantity?: number;
        };
        writeLog(`add_to_cart({ sku: "${sku}", quantity: ${quantity} })`);
        // Approval is handled by Persona's single outer confirm gate before
        // this runs — the page tool just performs the action.
        return { added: true, sku, quantity };
      },
    },
    { signal: ac.signal },
  );

  writeLog("registered: search_products, add_to_cart");
}

// ---------------------------------------------------------------------------
// 2. Mount Persona with WebMCP enabled.
// ---------------------------------------------------------------------------

// Two wiring modes (see README → "WebMCP Demo"):
//   1. Client-token mode (used by the live persona-chat.dev deploy and for
//      staging end-to-end tests): set VITE_PERSONA_CLIENT_TOKEN +
//      VITE_PERSONA_API_URL (the API *base*, e.g. https://api.runtype.com).
//      The widget talks to the Runtype API directly. WebMCP requires the
//      token's surface to have `behavior.webmcp.enabled`. Set the token via
//      .env.local locally, or Vercel env on the deploy — never commit it.
//   2. Proxy mode (fallback when no client token): routes through the local
//      proxy on VITE_PROXY_PORT.
const clientToken = import.meta.env.VITE_PERSONA_CLIENT_TOKEN as
  | string
  | undefined;
const clientApiBase = import.meta.env.VITE_PERSONA_API_URL as
  | string
  | undefined;

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyApiUrl = import.meta.env.VITE_PROXY_URL
  ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch`
  : `http://localhost:${proxyPort}/api/chat/dispatch`;

const usingClientToken = Boolean(clientToken);
writeLog(
  usingClientToken
    ? `mode: client-token → ${clientApiBase ?? "https://api.runtype.com"}`
    : `mode: proxy → ${proxyApiUrl}`,
);

let activeController: AgentWidgetController | null = null;

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const showLauncherChrome = mode === "launcher";
  return {
    ...DEFAULT_WIDGET_CONFIG,
    ...(usingClientToken
      ? { clientToken, ...(clientApiBase ? { apiUrl: clientApiBase } : {}) }
      : { apiUrl: proxyApiUrl }),
    storageAdapter: createLocalStorageAdapter(`persona-state-webmcp-${mode}`),
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
    // Demo starter pills that exercise the page's WebMCP tools. Kept
    // single-intent (one tool per prompt) — chained "search and add" still
    // depends on core #3870 (parallel local tool calls). SKUs match the
    // mock catalog returned by the page-side search_products tool above.
    suggestionChips: [
      "Search for blue running shoes",
      "Show me trail running shoes",
      "Add SHOE-001 to my cart",
    ],
    webmcp: {
      enabled: true,
      // Per-tool gate policy: auto-allow the read-only search so it runs
      // frictionlessly, and let the mutating add_to_cart fall through to
      // Persona's native in-panel approval bubble (no custom onConfirm — the
      // widget renders the approval chrome and waits for Approve/Deny).
      autoApprove: (info: WebMcpConfirmInfo): boolean => {
        writeLog(`gate: ${info.toolName}`);
        return info.toolName !== "add_to_cart";
      },
    },
    launcher: showLauncherChrome
      ? { enabled: true, autoExpand: false, width: "420px", fullHeight: true }
      : { enabled: false, autoExpand: true, width: "100%", fullHeight: true },
  };
};

setupMountMode({
  slug: "webmcp-demo",
  modes: ["inline", "launcher", "fullscreen"],
  mount: (mode, { stage }) => {
    if (mode === "launcher") {
      const { mountEl } = renderLauncherScene(stage);
      const handle = initAgentWidget({
        target: mountEl,
        config: buildConfig("launcher"),
      });
      activeController = handle as unknown as AgentWidgetController;
      return () => {
        handle.destroy();
        activeController = null;
      };
    }

    const mount = renderInlineMount(stage);
    mount.style.height = "100%";
    const controller = createAgentExperience(mount, buildConfig(mode));
    activeController = controller;
    return () => {
      controller.destroy();
      activeController = null;
    };
  },
});
