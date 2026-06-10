import "@runtypelabs/persona/widget.css";

import {
  createAgentExperience,
  createLocalStorageAdapter,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type WebMcpConfirmInfo,
} from "@runtypelabs/persona";
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";
import { setupMountMode, renderInlineMount } from "./mount-mode";
import type { Mode } from "./examples-nav";
import { CATALOG, searchCatalog, findBySku, type CatalogProduct } from "./webmcp-catalog";

// ===========================================================================
// "Switchback" — a tiny trail/road running storefront that exposes its own
// page tools via WebMCP. The page renders a live catalog + cart + a wire log;
// Persona drives the tools and every round-trip is visible on the page.
//
// 1. Install the polyfill and register the page tools.
//
// `@mcp-b/webmcp-polyfill` polyfills the strict standard surface on
// `document.modelContext` (registerTool / getTools / executeTool). We call
// `initializeWebMCPPolyfill()` explicitly so the order is obvious — it is
// idempotent and no-ops if a native `document.modelContext` is already present.
// The widget also lazily installs it from its WebMCP bridge, but the *producer*
// page should install it first so the global exists by the time we register.
// ===========================================================================

/**
 * Minimal structural view of the producer surface we use here. The full type
 * lives in `@mcp-b/webmcp-types`; declaring just `registerTool` keeps this demo
 * self-contained.
 */
interface RegisterableModelContext {
  registerTool(
    tool: {
      name: string;
      /** User-facing label (WebMCP `ToolDescriptor.title`) — shown in Persona's approval bubble. */
      title?: string;
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

// ---------------------------------------------------------------------------
// Tiny escaping helper — everything we render with innerHTML below mixes static
// catalog data with agent-supplied args (query, sku, promo code), so escape any
// dynamic value before it lands in the DOM.
// ---------------------------------------------------------------------------
const esc = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string,
  );

const money = (n: number): string => `$${n.toFixed(2)}`;

const DEMO_TOOL_LATENCY_MS = {
  search_products: [450, 700],
  view_product: [325, 550],
  add_to_cart: [550, 900],
  remove_from_cart: [400, 650],
  apply_promo: [375, 600],
} as const;

type DemoToolName = keyof typeof DEMO_TOOL_LATENCY_MS;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

const simulateToolLatency = async (toolName: DemoToolName): Promise<number> => {
  const [min, max] = DEMO_TOOL_LATENCY_MS[toolName];
  const delay = Math.round(min + Math.random() * (max - min));
  await wait(delay);
  return delay;
};

const formatLatency = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

// ===========================================================================
// 2. Wire log — make the round-trip legible.
//
// Two honest sources feed it:
//   • page-side events we own directly (tool registration, the approval-gate
//     decision, and each page-tool execution), and
//   • the *actual outgoing request bodies*, captured by a thin fetch wrapper:
//     the dispatch turn carries `clientTools[]`, and the resume turn carries
//     `toolOutputs` keyed by per-call id — which is exactly where parallel calls
//     show up batched into ONE /resume.
// ===========================================================================

type WireKind = "reg" | "send" | "gate" | "exec" | "resume";

const wireBody = document.getElementById("webmcp-wire");
const wireCount = document.getElementById("shop-wire-count");
let wireEvents = 0;

const logWire = (kind: WireKind, tag: string, detailHtml: string): void => {
  if (!wireBody) return;
  const ts = new Date().toLocaleTimeString();
  const row = document.createElement("div");
  row.className = `wire-row ${kind}`;
  row.innerHTML =
    `<span class="wire-time">${esc(ts)}</span>` +
    `<span class="wire-detail"><span class="wire-tag">${esc(tag)}</span> ${detailHtml}</span>`;
  wireBody.prepend(row);
  wireEvents += 1;
  if (wireCount) wireCount.textContent = `${wireEvents} event${wireEvents === 1 ? "" : "s"}`;
};

const shortId = (id: string): string =>
  id.length > 16 ? `${id.slice(0, 10)}…${id.slice(-4)}` : id;

/**
 * Wrap `window.fetch` once so we can read the request bodies Persona sends for
 * dispatch/resume/init. We never touch the response — just observe the body and
 * pass the call straight through.
 */
const installWireTap = (): void => {
  const w = window as Window & { __webmcpFetchPatched?: boolean };
  if (w.__webmcpFetchPatched) return;
  w.__webmcpFetchPatched = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const body = init?.body;
      if (url && typeof body === "string") {
        if (/\/resume(\b|$)/.test(url)) {
          const parsed = JSON.parse(body) as {
            executionId?: string;
            toolOutputs?: Record<string, unknown>;
          };
          const ids = Object.keys(parsed.toolOutputs ?? {});
          logWire(
            "resume",
            "batched /resume",
            `<b>${ids.length}</b> tool output${ids.length === 1 ? "" : "s"} → ` +
              `${ids.map((id) => `<b>${esc(shortId(id))}</b>`).join(", ") || "—"}` +
              (parsed.executionId ? ` · exec ${esc(shortId(parsed.executionId))}` : ""),
          );
        } else if (/\/(chat|dispatch)(\b|$)/.test(url)) {
          const parsed = JSON.parse(body) as {
            clientTools?: Array<{ name?: string; origin?: string }>;
          };
          const tools = parsed.clientTools ?? [];
          if (tools.length > 0) {
            const names = tools.map((t) => esc(t.name ?? "?")).join(", ");
            const origin = tools.find((t) => t.origin)?.origin;
            logWire(
              "send",
              "dispatch",
              `ships <b>clientTools[${tools.length}]</b>: ${names}` +
                (origin ? ` <span style="opacity:.7">(origin: ${esc(origin)})</span>` : ""),
            );
          }
        } else if (/\/init(\b|$)/.test(url)) {
          logWire("send", "session", `bootstrapping client session`);
        }
      }
    } catch {
      /* never let observation break the request */
    }
    return originalFetch(input, init);
  };
};

installWireTap();

// ===========================================================================
// 3. Storefront state — catalog grid + cart, the visible side effects.
// ===========================================================================

// Named colors → swatch hex for the catalog grid. Curated outdoor-gear tones
// (lake, clay, fern, granite…) rather than stock framework hexes, so the
// swatches sit inside the storefront's pine + blaze palette.
const COLOR_HEX: Record<string, string> = {
  blue: "#3e6e91", // lake
  black: "#23272a", // charcoal
  white: "#eceae2", // chalk
  red: "#b94a36", // clay
  green: "#4a7c59", // fern
  grey: "#8c9189", // granite
  gray: "#8c9189",
  navy: "#2e4257", // midnight
};

// Promo codes the storefront honors (apply_promo validates against this).
const PROMOS: Record<string, { rate: number; label: string }> = {
  TRAIL10: { rate: 0.1, label: "10% off — TRAIL10" },
  TRAILVIP: { rate: 0.15, label: "15% off — TRAILVIP" },
  SUMMIT20: { rate: 0.2, label: "20% off — SUMMIT20" },
};

interface CartLine {
  sku: string;
  title: string;
  price: number;
  quantity: number;
  imageUrl: string;
  imageAlt: string;
}

const cart = new Map<string, CartLine>();
let promo: { code: string; rate: number; label: string } | null = null;

const cartSummary = (): {
  items: Array<{
    sku: string;
    title: string;
    quantity: number;
    lineTotal: number;
    imageUrl: string;
    imageAlt: string;
  }>;
  itemCount: number;
  subtotal: number;
  discount: number;
  total: number;
  promoCode: string | null;
} => {
  const items = [...cart.values()].map((line) => ({
    sku: line.sku,
    title: line.title,
    quantity: line.quantity,
    lineTotal: Number((line.price * line.quantity).toFixed(2)),
    imageUrl: line.imageUrl,
    imageAlt: line.imageAlt,
  }));
  const subtotal = Number(items.reduce((sum, i) => sum + i.lineTotal, 0).toFixed(2));
  const discount = promo ? Number((subtotal * promo.rate).toFixed(2)) : 0;
  return {
    items,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    subtotal,
    discount,
    total: Number((subtotal - discount).toFixed(2)),
    promoCode: promo?.code ?? null,
  };
};

// ---- Catalog grid -----------------------------------------------------------

const catalogRoot = document.getElementById("shop-catalog");
const catalogMeta = document.getElementById("shop-catalog-meta");

const renderCatalog = (): void => {
  if (!catalogRoot) return;
  catalogRoot.innerHTML = CATALOG.map((p) => {
    const swatch = COLOR_HEX[p.color.toLowerCase()] ?? "#9ca3af";
    return `
      <article class="shop-product" data-sku="${esc(p.sku)}">
        <span class="shop-incart-badge" data-incart-badge></span>
        <div class="shop-product-media">
          <img src="${esc(p.imageUrl)}" alt="${esc(p.imageAlt)}" loading="lazy" />
        </div>
        <div class="shop-product-top">
          <span class="shop-swatch" style="background:${esc(swatch)}"></span>
          <span class="shop-product-cat">${esc(p.category)}</span>
        </div>
        <div class="shop-product-title">${esc(p.title)}</div>
        <div class="shop-product-sub">${esc(p.brand)} · ${esc(p.color)}</div>
        <div class="shop-product-foot">
          <span class="shop-product-price">${esc(money(p.price))}</span>
          <span class="shop-product-sku">${esc(p.sku)}</span>
        </div>
      </article>`;
  }).join("");
  if (catalogMeta) catalogMeta.textContent = `${CATALOG.length} products`;
  syncCatalogCartState();
};

const cardForSku = (sku: string): HTMLElement | null =>
  catalogRoot?.querySelector<HTMLElement>(`.shop-product[data-sku="${CSS.escape(sku)}"]`) ?? null;

const flashCard = (sku: string): void => {
  const card = cardForSku(sku);
  if (!card) return;
  card.classList.remove("just-changed");
  // reflow so the animation restarts even on a rapid second call
  void card.offsetWidth;
  card.classList.add("just-changed");
  card.scrollIntoView({ block: "nearest", inline: "nearest" });
};

const highlightHits = (skus: string[]): void => {
  catalogRoot
    ?.querySelectorAll<HTMLElement>(".shop-product.is-hit")
    .forEach((el) => el.classList.remove("is-hit"));
  skus.forEach((sku) => cardForSku(sku)?.classList.add("is-hit"));
};

// Reflect cart quantities onto the catalog cards (in-cart ring + qty badge).
const syncCatalogCartState = (): void => {
  catalogRoot?.querySelectorAll<HTMLElement>(".shop-product").forEach((card) => {
    const sku = card.dataset.sku ?? "";
    const line = cart.get(sku);
    const badge = card.querySelector<HTMLElement>("[data-incart-badge]");
    if (line) {
      card.classList.add("in-cart");
      if (badge) badge.textContent = `${line.quantity}`;
    } else {
      card.classList.remove("in-cart");
      if (badge) badge.textContent = "";
    }
  });
};

// ---- Cart -------------------------------------------------------------------

const cartRoot = document.getElementById("shop-cart");
const cartMeta = document.getElementById("shop-cart-meta");

const renderCart = (): void => {
  if (!cartRoot) return;
  const summary = cartSummary();
  if (summary.items.length === 0) {
    cartRoot.innerHTML = `<p class="shop-cart-empty">Your cart is empty — ask the assistant to add something.</p>`;
    if (cartMeta) cartMeta.textContent = "";
    syncCatalogCartState();
    return;
  }
  const rows = [...cart.values()]
    .map(
      (line) => `
      <li class="shop-cart-line">
        <span class="shop-cart-qty">${line.quantity}×</span>
        <span class="shop-cart-title">${esc(line.title)}</span>
        <span class="shop-cart-sku">${esc(line.sku)}</span>
        <span class="shop-cart-price">${esc(money(line.price * line.quantity))}</span>
      </li>`,
    )
    .join("");
  const promoRow = promo
    ? `<div class="shop-cart-row promo">
         <span><span class="shop-cart-chip">${esc(promo.code)}</span> ${esc(promo.label)}</span>
         <span>−${esc(money(summary.discount))}</span>
       </div>`
    : "";
  cartRoot.innerHTML = `
    <ul class="shop-cart-lines">${rows}</ul>
    <div class="shop-cart-foot">
      <div class="shop-cart-row muted">
        <span>Subtotal</span><span>${esc(money(summary.subtotal))}</span>
      </div>
      ${promoRow}
      <div class="shop-cart-row total">
        <span>${summary.itemCount} item${summary.itemCount === 1 ? "" : "s"}</span>
        <strong>${esc(money(summary.total))}</strong>
      </div>
    </div>`;
  if (cartMeta) cartMeta.textContent = `${summary.itemCount} item${summary.itemCount === 1 ? "" : "s"}`;
  syncCatalogCartState();
};

const flashCart = (): void => {
  if (!cartRoot) return;
  cartRoot.classList.remove("just-changed");
  void cartRoot.offsetWidth;
  cartRoot.classList.add("just-changed");
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
      imageUrl: product.imageUrl,
      imageAlt: product.imageAlt,
    });
  }
  renderCart();
  flashCard(product.sku);
  flashCart();
};

renderCatalog();
renderCart();

// ===========================================================================
// 4. Register the page tools.
// ===========================================================================

initializeWebMCPPolyfill();

const modelContext = (
  document as Document & { modelContext?: RegisterableModelContext }
).modelContext;

if (!modelContext) {
  logWire("reg", "register", "document.modelContext unavailable — tools NOT registered");
} else {
  const ac = new AbortController();

  // -- search_products (read-only) --
  modelContext.registerTool(
    {
      name: "search_products",
      title: "Search the catalog",
      description:
        "Search the product catalog by free-text query (e.g. 'waterproof trail shoe', 'blue running', 'jacket'). Returns matching products with SKU, title, brand, color, price, imageUrl, and imageAlt.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "Free-text search query." } },
        required: ["query"],
      },
      annotations: { readOnlyHint: true },
      async execute(input): Promise<unknown> {
        const latency = await simulateToolLatency("search_products");
        const { query } = input as { query: string };
        const hits = searchCatalog(query ?? "");
        highlightHits(hits.map((p) => p.sku));
        logWire(
          "exec",
          "search_products",
          `query <b>${esc(query)}</b> → ${hits.length} hit${hits.length === 1 ? "" : "s"} <span class="wire-time">(+${esc(formatLatency(latency))})</span>`,
        );
        return {
          query,
          count: hits.length,
          hits: hits.map((p) => ({
            sku: p.sku,
            title: p.title,
            brand: p.brand,
            category: p.category,
            color: p.color,
            price: p.price,
            description: p.description,
            imageUrl: p.imageUrl,
            imageAlt: p.imageAlt,
          })),
        };
      },
    },
    { signal: ac.signal },
  );

  // -- view_product (read-only) --
  modelContext.registerTool(
    {
      name: "view_product",
      title: "View product details",
      description:
        "Look at one product in detail by SKU (from search_products results). Highlights it on the page and returns its full description plus imageUrl/imageAlt. Read-only.",
      inputSchema: {
        type: "object",
        properties: { sku: { type: "string" } },
        required: ["sku"],
      },
      annotations: { readOnlyHint: true },
      async execute(input): Promise<unknown> {
        const latency = await simulateToolLatency("view_product");
        const { sku } = input as { sku: string };
        const product = findBySku(sku);
        if (!product) {
          logWire(
            "exec",
            "view_product",
            `<b>${esc(sku)}</b> → not found <span class="wire-time">(+${esc(formatLatency(latency))})</span>`,
          );
          return { found: false, error: `No product with SKU "${sku}".` };
        }
        highlightHits([product.sku]);
        flashCard(product.sku);
        logWire(
          "exec",
          "view_product",
          `<b>${esc(product.sku)}</b> — ${esc(product.title)} <span class="wire-time">(+${esc(formatLatency(latency))})</span>`,
        );
        return {
          found: true,
          sku: product.sku,
          title: product.title,
          brand: product.brand,
          category: product.category,
          color: product.color,
          price: product.price,
          description: product.description,
          imageUrl: product.imageUrl,
          imageAlt: product.imageAlt,
        };
      },
    },
    { signal: ac.signal },
  );

  // -- add_to_cart (mutating) --
  modelContext.registerTool(
    {
      name: "add_to_cart",
      title: "Add to your cart",
      description:
        "Add a product to the shopper's cart by SKU (from search_products results). Returns the updated cart so you can confirm the running total.",
      inputSchema: {
        type: "object",
        properties: { sku: { type: "string" }, quantity: { type: "integer", minimum: 1 } },
        required: ["sku"],
      },
      annotations: { readOnlyHint: false },
      async execute(input): Promise<unknown> {
        const latency = await simulateToolLatency("add_to_cart");
        const { sku, quantity = 1 } = input as { sku: string; quantity?: number };
        const product = findBySku(sku);
        if (!product) {
          logWire(
            "exec",
            "add_to_cart",
            `<b>${esc(sku)}</b> → not found <span class="wire-time">(+${esc(formatLatency(latency))})</span>`,
          );
          return {
            added: false,
            error: `No product with SKU "${sku}". Call search_products first to get valid SKUs.`,
          };
        }
        addToCart(product, quantity);
        logWire(
          "exec",
          "add_to_cart",
          `<b>${esc(product.sku)}</b> ×${esc(quantity)} → ${esc(product.title)} <span class="wire-time">(+${esc(formatLatency(latency))})</span>`,
        );
        return {
          added: true,
          sku: product.sku,
          title: product.title,
          quantity,
          unitPrice: product.price,
          imageUrl: product.imageUrl,
          imageAlt: product.imageAlt,
          cart: cartSummary(),
        };
      },
    },
    { signal: ac.signal },
  );

  // -- remove_from_cart (mutating) --
  modelContext.registerTool(
    {
      name: "remove_from_cart",
      title: "Remove from your cart",
      description:
        "Remove a product from the cart by SKU, or reduce its quantity. Omit quantity to remove the line entirely. Returns the updated cart.",
      inputSchema: {
        type: "object",
        properties: { sku: { type: "string" }, quantity: { type: "integer", minimum: 1 } },
        required: ["sku"],
      },
      annotations: { readOnlyHint: false },
      async execute(input): Promise<unknown> {
        const latency = await simulateToolLatency("remove_from_cart");
        const { sku, quantity } = input as { sku: string; quantity?: number };
        // Resolve the SKU the same way add_to_cart/view_product do (trimmed,
        // case-insensitive) — the cart is keyed by the canonical product.sku, so
        // a raw `cart.get(sku)` would miss on different casing/spacing.
        const product = findBySku(sku);
        if (!product) {
          logWire(
            "exec",
            "remove_from_cart",
            `<b>${esc(sku)}</b> → not found <span class="wire-time">(+${esc(formatLatency(latency))})</span>`,
          );
          return {
            removed: false,
            error: `No product with SKU "${sku}". Call search_products first to get valid SKUs.`,
            cart: cartSummary(),
          };
        }
        const line = cart.get(product.sku);
        if (!line) {
          logWire(
            "exec",
            "remove_from_cart",
            `<b>${esc(product.sku)}</b> → not in cart <span class="wire-time">(+${esc(formatLatency(latency))})</span>`,
          );
          return {
            removed: false,
            error: `"${product.sku}" is not in the cart.`,
            cart: cartSummary(),
          };
        }
        // Only a positive partial quantity decrements; anything else (omitted,
        // ≤0, or ≥ the line qty) removes the whole line — so a negative quantity
        // can't subtract-a-negative and inflate the cart.
        const partial =
          typeof quantity === "number" && quantity >= 1 && quantity < line.quantity;
        if (partial) {
          line.quantity -= quantity as number;
        } else {
          cart.delete(product.sku);
        }
        renderCart();
        flashCart();
        logWire(
          "exec",
          "remove_from_cart",
          `<b>${esc(product.sku)}</b>${partial ? ` ×${esc(quantity)}` : ""} → removed <span class="wire-time">(+${esc(formatLatency(latency))})</span>`,
        );
        return { removed: true, sku: product.sku, cart: cartSummary() };
      },
    },
    { signal: ac.signal },
  );

  // -- apply_promo (mutating) --
  modelContext.registerTool(
    {
      name: "apply_promo",
      title: "Apply a promo code",
      description:
        "Apply a promo code to the cart (e.g. TRAIL10, TRAILVIP, SUMMIT20). Returns whether it was accepted and the updated cart with the discount applied.",
      inputSchema: {
        type: "object",
        properties: { code: { type: "string" } },
        required: ["code"],
      },
      annotations: { readOnlyHint: false },
      async execute(input): Promise<unknown> {
        const latency = await simulateToolLatency("apply_promo");
        const { code } = input as { code: string };
        const key = (code ?? "").trim().toUpperCase();
        const match = PROMOS[key];
        if (!match) {
          logWire(
            "exec",
            "apply_promo",
            `<b>${esc(code)}</b> → rejected <span class="wire-time">(+${esc(formatLatency(latency))})</span>`,
          );
          return {
            applied: false,
            error: `"${code}" is not a valid promo code. Try TRAIL10, TRAILVIP, or SUMMIT20.`,
            cart: cartSummary(),
          };
        }
        promo = { code: key, rate: match.rate, label: match.label };
        renderCart();
        flashCart();
        logWire(
          "exec",
          "apply_promo",
          `<b>${esc(key)}</b> → ${esc(match.label)} <span class="wire-time">(+${esc(formatLatency(latency))})</span>`,
        );
        return { applied: true, code: key, discountRate: match.rate, cart: cartSummary() };
      },
    },
    { signal: ac.signal },
  );

  logWire(
    "reg",
    "register",
    "5 page tools on <b>document.modelContext</b>: " +
      "search_products, view_product, add_to_cart, remove_from_cart, apply_promo",
  );
}

// ===========================================================================
// 5. Mount Persona with WebMCP enabled, themed as the Switchback storefront.
// ===========================================================================

// Wiring: proxy mode only — like the other example demos. The agent that
// drives this storefront is defined entirely in code as WEBMCP_STOREFRONT_FLOW
// (packages/proxy/src/flows/webmcp-storefront.ts); the local proxy forwards the
// page's clientTools[] upstream and proxies the /resume round-trip. No hosted
// Runtype agent or client token is involved. The proxy's `/api/chat/dispatch-
// webmcp` route mounts that flow (see examples/vercel-edge/src/server.ts).
const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyApiUrl = import.meta.env.VITE_PROXY_URL
  ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-webmcp`
  : `http://localhost:${proxyPort}/api/chat/dispatch-webmcp`;

// Tools the storefront treats as read-only (safe to run without approval). We
// gate by name rather than by the registered `readOnlyHint` annotation because
// @mcp-b/webmcp-polyfill@3.0.0's `getTools()` does NOT echo annotations back to
// consumers, so the widget can't populate `WebMcpConfirmInfo.annotations` — the
// page is the authority on which of *its own* tools mutate state. (The tools
// still carry `readOnlyHint` for spec-correctness and the server snapshot.)
const READ_ONLY_TOOLS = new Set(["search_products", "view_product"]);

logWire("send", "mode", `proxy → ${esc(proxyApiUrl)}`);

// --- Switchback brand theme (mirrors webmcp-shop.css; both follow the OS
//     light/dark preference via colorScheme:'auto').
//
//     "Pine & Blaze" — deep pine green primary + trail-blaze orange accent on
//     warm granite paper; dark mode is a night forest where lichen green takes
//     over as the interactive primary and the blaze glows brighter.
//
//     This block is intentionally a tour of Persona's three theming layers:
//       1. palette   — raw brand scales + the fonts the page already loads
//       2. semantic  — role colors (surface/text/interactive/feedback) derived
//                      from the palette
//       3. components — per-surface overrides where the brand needs a specific
//                       read (header bar, bubbles, the approval gate, markdown)
//     Everything below is plain config — no custom CSS, no plugins.
//
//     Contrast anchors: paper on pine #1f3d2b ≈ 11:1; blaze #d9531e fails AA
//     for small text on white, so text-safe #a63a14 (~6:1) carries links and
//     #d9531e is reserved for fills (header icon chip). In dark mode the pine
//     ink #15291d on lichen #7fb594 ≈ 7:1. ---
const shopTheme: NonNullable<AgentWidgetConfig["theme"]> = {
  palette: {
    colors: {
      // Pine ladder: 500 is the brand fill; 600/700 step lighter for
      // hover/focus (the widget's interactive states walk up the scale).
      primary: {
        50: "#eef4ef",
        100: "#d8e6dc",
        500: "#1f3d2b",
        600: "#2a5240",
        700: "#35654e",
        900: "#0f2015",
      },
      // Blaze: 500 for fills, 600 is the text-safe deep blaze.
      accent: { 500: "#d9531e", 600: "#a63a14" },
      // Warm granite neutrals (greens hiding in the grays).
      gray: {
        50: "#ffffff",
        100: "#f4f3ee",
        200: "#e2e1d6",
        300: "#d2d2c4",
        500: "#5f675e",
        700: "#3a463b",
        900: "#1d211c",
      },
      // Feedback anchors so success/warn/error chrome stays on-brand.
      success: { 500: "#2f7d4f" },
      warning: { 500: "#8a6508" },
      error: { 500: "#c0392b" },
      info: { 500: "#31708f" },
    },
    typography: {
      // Reuse the fonts the gallery already loads (gallery-fonts Vite plugin
      // injects the <link> in <head>) — the widget needs no extra requests.
      fontFamily: {
        sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        serif: "'Newsreader', Georgia, 'Times New Roman', serif",
        mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
      },
    },
    radius: { md: "0.5rem", lg: "0.75rem", xl: "1rem" },
  },
  semantic: {
    colors: {
      primary: "#1f3d2b",
      accent: "#d9531e",
      surface: "#ffffff",
      background: "#ffffff",
      container: "#efeee7",
      text: "#1d211c",
      textMuted: "#5f675e",
      textInverse: "#f4f3ee",
      border: "#e2e1d6",
      divider: "#e2e1d6",
      interactive: {
        default: "#1f3d2b",
        hover: "#2a5240",
        focus: "#35654e",
        active: "#15291d",
        disabled: "#aab3a8",
      },
      feedback: {
        success: "#2f7d4f",
        warning: "#8a6508",
        error: "#c0392b",
        info: "#31708f",
      },
    },
  },
  components: {
    // Square the panel's outer edges so it sits flush in the inline/fullscreen
    // stage instead of letting the page show through rounded corners.
    panel: { borderRadius: "0" },
    // Keep the header a deep pine bar with a blaze icon chip in BOTH schemes
    // (decoupled from `primary`, which flips to lichen green in dark mode and
    // would otherwise leave light header text on a light green bar).
    header: {
      borderRadius: "0",
      background: "#1f3d2b",
      titleForeground: "#f4f3ee",
      subtitleForeground: "#b9c8bc",
      iconBackground: "#d9531e",
      iconForeground: "#ffffff",
      actionIconForeground: "#cfd8cc",
    },
    // User turns are pine; assistant turns are paper cards on the thread.
    message: {
      user: { background: "#1f3d2b", text: "#f4f3ee" },
      assistant: {
        background: "#ffffff",
        text: "#1d211c",
        border: "#e2e1d6",
        shadow: "0 1px 2px rgba(29, 33, 28, 0.06)",
      },
    },
    // Welcome card: a quiet granite-tint slab, no drop shadow.
    introCard: { background: "#efeee7", borderRadius: "0.75rem", shadow: "none" },
    input: {
      background: "#ffffff",
      placeholder: "#8b9286",
      focus: { border: "#1f3d2b", ring: "rgba(31, 61, 43, 0.25)" },
    },
    // The approval gate is this demo's headline surface — every mutating
    // page-tool call (add_to_cart, apply_promo, …) lands here. Parchment
    // bubble with a blaze-tinted frame; approve is a solid pine button, deny
    // stays a neutral ghost.
    approval: {
      requested: {
        background: "#faf9f3",
        border: "#e9c4a8",
        text: "#1d211c",
        shadow: "0 1px 3px rgba(29, 33, 28, 0.08)",
      },
      approve: { background: "#1f3d2b", foreground: "#f4f3ee", border: "#1f3d2b" },
      deny: { background: "transparent", foreground: "#5f675e", border: "#d2d2c4" },
    },
    markdown: {
      link: { foreground: "#a63a14" }, // text-safe blaze
      inlineCode: { background: "#edece3", foreground: "#1d211c" },
      // Fenced code renders as a deep-pine terminal panel, echoing the
      // page's wire-log instrument look.
      codeBlock: { background: "#15291d", borderColor: "#2a5240", textColor: "#d8e6dc" },
      blockquote: { borderColor: "#1f3d2b" },
    },
    // Tool / reasoning / approval bubble chrome: parchment container with a
    // matching parchment inset for streamed args.
    collapsibleWidget: { container: "#faf9f3", surface: "#f1f0e6", border: "#e2e1d6" },
    toolBubble: { shadow: "0 1px 2px rgba(29, 33, 28, 0.05)" },
    reasoningBubble: { shadow: "0 1px 2px rgba(29, 33, 28, 0.05)" },
    composer: { shadow: "0 2px 8px rgba(29, 33, 28, 0.06)" },
    scrollToBottom: { background: "#1f3d2b", foreground: "#f4f3ee", border: "#1f3d2b" },
  },
};

const shopDarkTheme: NonNullable<AgentWidgetConfig["darkTheme"]> = {
  palette: {
    colors: {
      // Night forest: lichen green is the interactive primary; the ladder
      // steps lighter for hover/focus, same convention as the light theme.
      primary: {
        50: "#15291d",
        100: "#1d3527",
        500: "#7fb594",
        600: "#94c7a8",
        700: "#a9d4ba",
        900: "#d8e6dc",
      },
      accent: { 500: "#ff7a3d", 600: "#ff9a62" },
      gray: {
        50: "#e8eee7",
        100: "#1d2420",
        200: "#3a463b",
        500: "#9fab9d",
        900: "#141915",
        950: "#0e120f",
      },
      success: { 500: "#7fd4a0" },
      warning: { 500: "#e3b341" },
      error: { 500: "#e07856" },
      info: { 500: "#7dd3fc" },
    },
    typography: {
      // Keep custom gallery fonts in dark mode too; darkTheme does not inherit
      // shopTheme.palette.typography when colorScheme:'auto' rebuilds tokens.
      fontFamily: {
        sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        serif: "'Newsreader', Georgia, 'Times New Roman', serif",
        mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
      },
    },
  },
  semantic: {
    colors: {
      primary: "#7fb594",
      accent: "#ff7a3d",
      surface: "#1d2420",
      background: "#141915",
      container: "#212a24",
      text: "#e8eee7",
      textMuted: "#9fab9d",
      textInverse: "#15291d",
      border: "#3a463b",
      divider: "#3a463b",
      interactive: {
        default: "#7fb594",
        hover: "#94c7a8",
        focus: "#a9d4ba",
        active: "#c0e2cd",
        disabled: "#4a564b",
      },
      feedback: {
        success: "#7fd4a0",
        warning: "#e3b341",
        error: "#e07856",
        info: "#7dd3fc",
      },
    },
  },
  components: {
    panel: { borderRadius: "0" },
    // Header stays a pine bar at night too — deepest pine instead of flipping
    // to lichen, with the blaze chip glowing against it.
    header: {
      borderRadius: "0",
      background: "#15291d",
      titleForeground: "#e8eee7",
      subtitleForeground: "#9fab9d",
      iconBackground: "#ff7a3d",
      iconForeground: "#15291d",
      actionIconForeground: "#b9c8bc",
    },
    // The widget's component defaults back these surfaces with `gray.50`, which
    // this dark palette keeps light (#e8eee7) — so without explicit overrides
    // the assistant bubbles, composer input, tool-call chrome, and inline code
    // would render as bright chalk cards on the night-forest panel. Pin them to
    // the dark surface set (and flip their default dark `gray.900` text to light).
    message: {
      user: { background: "#2a5240", text: "#e8eee7" },
      assistant: { background: "#1d2420", text: "#e8eee7", border: "#2c352d" },
    },
    introCard: { background: "#1d2420", borderRadius: "0.75rem", shadow: "none" },
    input: {
      background: "#212a24",
      placeholder: "#9fab9d",
      focus: { border: "#7fb594", ring: "rgba(127, 181, 148, 0.3)" },
    },
    approval: {
      requested: {
        background: "#1d2420",
        border: "#7a4426", // blaze-tinted frame, dimmed for the dark panel
        text: "#e8eee7",
        shadow: "none",
      },
      approve: { background: "#7fb594", foreground: "#15291d", border: "#7fb594" },
      deny: { background: "transparent", foreground: "#9fab9d", border: "#3a463b" },
    },
    markdown: {
      link: { foreground: "#ff9a62" },
      inlineCode: { background: "#2c352d", foreground: "#e8eee7" },
      codeBlock: { background: "#0e120f", borderColor: "#2c352d", textColor: "#d8e6dc" },
      blockquote: { borderColor: "#7fb594" },
    },
    collapsibleWidget: {
      container: "#1d2420", // tool/reasoning bubble chrome
      surface: "#0e120f", // inset args/code box — reads as a dark terminal panel
      border: "#2c352d",
    },
    toolBubble: { shadow: "none" },
    reasoningBubble: { shadow: "none" },
    composer: { shadow: "none" },
    scrollToBottom: { background: "#7fb594", foreground: "#15291d", border: "#7fb594" },
  },
};

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  return {
    ...DEFAULT_WIDGET_CONFIG,
    apiUrl: proxyApiUrl,
    // Surface the widget's Events diagnostics screen (header toggle) so the new
    // "Output throughput" (tok/s) row is visible for live testing.
    features: {
      ...DEFAULT_WIDGET_CONFIG.features,
      showEventStreamToggle: true,
    },
    storageAdapter: createLocalStorageAdapter(`persona-state-webmcp-${mode}`),
    postprocessMessage: ({ text }) => markdownPostprocessor(text),
    theme: shopTheme,
    darkTheme: shopDarkTheme,
    colorScheme: "auto",
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: "Switchback Assistant",
      welcomeSubtitle:
        "I can search the catalog, pull up a product, and manage your cart — using this page's own tools. Try one of the prompts below.",
      inputPlaceholder: "Find me a trail shoe…",
    },
    // Starter pills, ordered to walk through the gate policy and tool surface:
    //   1. read-only search (auto-approved, cards light up)
    //   2. read-only detail view (auto-approved, card flashes)
    //   3. PARALLEL mutating add — two add_to_cart calls in one turn, each with
    //      its own approval bubble, batched into ONE /resume (core#3878)
    //   4. mutating promo (approval bubble → discount line in the cart)
    suggestionChips: [
      "Find a waterproof trail shoe under $170",
      "Tell me about SHOE-005",
      "Add SHOE-001 and SHOE-007 at the same time",
      "Apply code TRAIL10 and show my cart total",
    ],
    webmcp: {
      enabled: true,
      // Gate policy: auto-approve the storefront's read-only tools so they run
      // frictionlessly, and route every mutating call to Persona's native
      // in-panel approval bubble. (See READ_ONLY_TOOLS above for why this is
      // name-based rather than annotation-based.)
      autoApprove: (info: WebMcpConfirmInfo): boolean => {
        const readOnly = READ_ONLY_TOOLS.has(info.toolName);
        logWire(
          "gate",
          "gate",
          `${esc(info.toolName)} — ${readOnly ? "read-only → <b>auto-approve</b>" : "mutating → <b>approval bubble</b>"}`,
        );
        return readOnly;
      },
    },
    launcher: {
      title: "Switchback",
      subtitle: "Trail & road running assistant",
      enabled: false,
      autoExpand: true,
      width: "100%",
      fullHeight: true,
    },
  };
};

// Inline-only: the widget mounts flush in the storefront's right-hand stage.
// A single mode means setupMountMode renders no "View as" toggle.
setupMountMode({
  slug: "webmcp-demo",
  modes: ["inline"],
  mount: (mode, { stage }) => {
    const mount = renderInlineMount(stage);
    mount.style.height = "100%";
    const controller = createAgentExperience(mount, buildConfig(mode));
    return () => controller.destroy();
  },
});
