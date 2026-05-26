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
import {
  installPolyfill,
  type ModelContextClient,
} from "@runtypelabs/webmcp-polyfill";
import { setupMountMode, renderInlineMount, renderLauncherScene } from "./mount-mode";
import type { Mode } from "./examples-nav";

// ---------------------------------------------------------------------------
// 1. Install the polyfill and register two page tools.
//
// The polyfill is idempotent — Persona also calls `installPolyfill()` from
// inside the widget bridge. Either order works (native deferral & late-install
// are spec-faithful in @runtypelabs/webmcp-polyfill).
// ---------------------------------------------------------------------------

const log = document.getElementById("webmcp-log");
const writeLog = (msg: string): void => {
  if (!log) return;
  const ts = new Date().toLocaleTimeString();
  log.textContent = `[${ts}] ${msg}\n${log.textContent ?? ""}`;
};

const polyfillResult = installPolyfill();
writeLog(`installPolyfill → ${polyfillResult.status} (v${polyfillResult.version})`);

if (polyfillResult.modelContext) {
  const ac = new AbortController();

  polyfillResult.modelContext.registerTool(
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
      async execute(input: unknown): Promise<unknown> {
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

  polyfillResult.modelContext.registerTool(
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
      async execute(
        input: unknown,
        client: ModelContextClient,
      ): Promise<unknown> {
        const { sku, quantity = 1 } = input as {
          sku: string;
          quantity?: number;
        };
        writeLog(`add_to_cart({ sku: "${sku}", quantity: ${quantity} })`);
        const ok = await client.requestUserInteraction(async () =>
          window.confirm(`Add ${quantity} × ${sku} to cart?`),
        );
        if (!ok) {
          throw new Error("Shopper declined add_to_cart");
        }
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

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const apiUrl = import.meta.env.VITE_PROXY_URL
  ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch`
  : `http://localhost:${proxyPort}/api/chat/dispatch`;

let activeController: AgentWidgetController | null = null;

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const showLauncherChrome = mode === "launcher";
  return {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl,
    storageAdapter: createLocalStorageAdapter(`persona-state-webmcp-${mode}`),
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
    webmcp: {
      enabled: true,
      onConfirm: async (info: WebMcpConfirmInfo): Promise<boolean> => {
        writeLog(`confirm(${info.reason}): ${info.toolName}`);
        const argsLine = info.args
          ? `\n\nargs: ${JSON.stringify(info.args)}`
          : "";
        return window.confirm(
          `Allow ${info.toolName}? (${info.reason})${argsLine}`,
        );
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
