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
import { searchCatalog, findBySku, type CatalogProduct } from "./webmcp-catalog";

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

// ---------------------------------------------------------------------------
// Simulated cart — the visible side effect of the `add_to_cart` page tool.
// Mutating the cart re-renders the on-page panel so you can watch the agent's
// tool calls take effect, and add_to_cart echoes the cart state back to the
// agent so it can summarize the running total.
// ---------------------------------------------------------------------------

interface CartLine {
  sku: string;
  title: string;
  price: number;
  quantity: number;
}

const cart = new Map<string, CartLine>();
const money = (n: number): string => `$${n.toFixed(2)}`;

const cartSummary = (): {
  items: Array<{ sku: string; title: string; quantity: number; lineTotal: number }>;
  itemCount: number;
  total: number;
} => {
  const items = [...cart.values()].map((line) => ({
    sku: line.sku,
    title: line.title,
    quantity: line.quantity,
    lineTotal: Number((line.price * line.quantity).toFixed(2)),
  }));
  return {
    items,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    total: Number(items.reduce((sum, i) => sum + i.lineTotal, 0).toFixed(2)),
  };
};

const renderCart = (): void => {
  const root = document.getElementById("webmcp-cart");
  if (!root) return;
  const summary = cartSummary();
  if (summary.items.length === 0) {
    root.innerHTML = `<p class="webmcp-cart-empty">Your cart is empty.</p>`;
    return;
  }
  const rows = [...cart.values()]
    .map(
      (line) => `
      <li class="webmcp-cart-line">
        <span class="webmcp-cart-qty">${line.quantity}×</span>
        <span class="webmcp-cart-title">${line.title}</span>
        <span class="webmcp-cart-sku">${line.sku}</span>
        <span class="webmcp-cart-price">${money(line.price * line.quantity)}</span>
      </li>`,
    )
    .join("");
  root.innerHTML = `
    <ul class="webmcp-cart-lines">${rows}</ul>
    <div class="webmcp-cart-total">
      <span>${summary.itemCount} item${summary.itemCount === 1 ? "" : "s"}</span>
      <strong>${money(summary.total)}</strong>
    </div>`;
};

const addToCart = (product: CatalogProduct, quantity: number): void => {
  const existing = cart.get(product.sku);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.set(product.sku, {
      sku: product.sku,
      title: `${product.title} (${product.color})`,
      price: product.price,
      quantity,
    });
  }
  renderCart();
};

renderCart();

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
      description:
        "Search the product catalog by free-text query (e.g. 'blue running shoes', 'trail', 'jacket'). Returns matching products with SKU, title, color, and price.",
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
        const hits = searchCatalog(query ?? "");
        writeLog(`search_products("${query}") → ${hits.length} hit(s)`);
        return {
          query,
          count: hits.length,
          hits: hits.map((p) => ({
            sku: p.sku,
            title: p.title,
            color: p.color,
            brand: p.brand,
            category: p.category,
            price: p.price,
            description: p.description,
          })),
        };
      },
    },
    { signal: ac.signal },
  );

  modelContext.registerTool(
    {
      name: "add_to_cart",
      description:
        "Add a product to the shopper's cart by SKU (from search_products results). Returns the updated cart so you can confirm the running total.",
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
        const product = findBySku(sku);
        if (!product) {
          writeLog(`add_to_cart("${sku}") → not found`);
          return {
            added: false,
            error: `No product with SKU "${sku}". Call search_products first to get valid SKUs.`,
          };
        }
        // Approval is handled by Persona's confirm gate before this runs — the
        // page tool just performs the action and updates the visible cart.
        addToCart(product, quantity);
        writeLog(`add_to_cart("${sku}" ×${quantity}) → ${product.title}`);
        return {
          added: true,
          sku: product.sku,
          title: product.title,
          quantity,
          unitPrice: product.price,
          cart: cartSummary(),
        };
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
    // Demo starter pills, ordered to show off escalating tool-call shapes:
    //   1. single read-only call (auto-approved, no bubble)
    //   2. single mutating call (native approval bubble → cart update)
    //   3. multi-step continuation — the agent searches, then runs a SECOND
    //      turn to add the cheapest hit, proving the loop continues after a
    //      tool result.
    //   4. PARALLEL same-tool calls — adding two SKUs "at once" makes the model
    //      emit two add_to_cart calls in one turn. The widget batches their
    //      outputs into ONE /resume keyed by per-call id (runtypelabs/core#3878);
    //      each call still renders its own approval bubble.
    suggestionChips: [
      "Search for blue running shoes",
      "Add SHOE-001 to my cart",
      "Find the cheapest blue running shoe and add it to my cart",
      "Add SHOE-001 and SHOE-007 to my cart",
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
