import "@runtypelabs/persona/widget.css";

import {
  createAgentExperience,
  createLocalStorageAdapter,
  initAgentWidget,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  type AgentWidgetConfig,
  type WebMcpConfirmInfo,
} from "@runtypelabs/persona";
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";
import { setupMountMode, renderInlineMount, renderLauncherScene } from "./mount-mode";
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

// Named colors → swatch hex for the catalog grid.
const COLOR_HEX: Record<string, string> = {
  blue: "#2563eb",
  black: "#1f2937",
  white: "#f3f4f6",
  red: "#dc2626",
  green: "#16a34a",
  grey: "#9ca3af",
  gray: "#9ca3af",
  navy: "#1e3a8a",
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
}

const cart = new Map<string, CartLine>();
let promo: { code: string; rate: number; label: string } | null = null;

const cartSummary = (): {
  items: Array<{ sku: string; title: string; quantity: number; lineTotal: number }>;
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
      description:
        "Search the product catalog by free-text query (e.g. 'waterproof trail shoe', 'blue running', 'jacket'). Returns matching products with SKU, title, brand, color, and price.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "Free-text search query." } },
        required: ["query"],
      },
      annotations: { readOnlyHint: true },
      execute(input): unknown {
        const { query } = input as { query: string };
        const hits = searchCatalog(query ?? "");
        highlightHits(hits.map((p) => p.sku));
        logWire(
          "exec",
          "search_products",
          `query <b>${esc(query)}</b> → ${hits.length} hit${hits.length === 1 ? "" : "s"}`,
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
      description:
        "Look at one product in detail by SKU (from search_products results). Highlights it on the page and returns its full description. Read-only.",
      inputSchema: {
        type: "object",
        properties: { sku: { type: "string" } },
        required: ["sku"],
      },
      annotations: { readOnlyHint: true },
      execute(input): unknown {
        const { sku } = input as { sku: string };
        const product = findBySku(sku);
        if (!product) {
          logWire("exec", "view_product", `<b>${esc(sku)}</b> → not found`);
          return { found: false, error: `No product with SKU "${sku}".` };
        }
        highlightHits([product.sku]);
        flashCard(product.sku);
        logWire("exec", "view_product", `<b>${esc(product.sku)}</b> — ${esc(product.title)}`);
        return {
          found: true,
          sku: product.sku,
          title: product.title,
          brand: product.brand,
          category: product.category,
          color: product.color,
          price: product.price,
          description: product.description,
        };
      },
    },
    { signal: ac.signal },
  );

  // -- add_to_cart (mutating) --
  modelContext.registerTool(
    {
      name: "add_to_cart",
      description:
        "Add a product to the shopper's cart by SKU (from search_products results). Returns the updated cart so you can confirm the running total.",
      inputSchema: {
        type: "object",
        properties: { sku: { type: "string" }, quantity: { type: "integer", minimum: 1 } },
        required: ["sku"],
      },
      annotations: { readOnlyHint: false },
      execute(input): unknown {
        const { sku, quantity = 1 } = input as { sku: string; quantity?: number };
        const product = findBySku(sku);
        if (!product) {
          logWire("exec", "add_to_cart", `<b>${esc(sku)}</b> → not found`);
          return {
            added: false,
            error: `No product with SKU "${sku}". Call search_products first to get valid SKUs.`,
          };
        }
        addToCart(product, quantity);
        logWire("exec", "add_to_cart", `<b>${esc(product.sku)}</b> ×${esc(quantity)} → ${esc(product.title)}`);
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

  // -- remove_from_cart (mutating) --
  modelContext.registerTool(
    {
      name: "remove_from_cart",
      description:
        "Remove a product from the cart by SKU, or reduce its quantity. Omit quantity to remove the line entirely. Returns the updated cart.",
      inputSchema: {
        type: "object",
        properties: { sku: { type: "string" }, quantity: { type: "integer", minimum: 1 } },
        required: ["sku"],
      },
      annotations: { readOnlyHint: false },
      execute(input): unknown {
        const { sku, quantity } = input as { sku: string; quantity?: number };
        // Resolve the SKU the same way add_to_cart/view_product do (trimmed,
        // case-insensitive) — the cart is keyed by the canonical product.sku, so
        // a raw `cart.get(sku)` would miss on different casing/spacing.
        const product = findBySku(sku);
        if (!product) {
          logWire("exec", "remove_from_cart", `<b>${esc(sku)}</b> → not found`);
          return {
            removed: false,
            error: `No product with SKU "${sku}". Call search_products first to get valid SKUs.`,
            cart: cartSummary(),
          };
        }
        const line = cart.get(product.sku);
        if (!line) {
          logWire("exec", "remove_from_cart", `<b>${esc(product.sku)}</b> → not in cart`);
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
          `<b>${esc(product.sku)}</b>${partial ? ` ×${esc(quantity)}` : ""} → removed`,
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
      description:
        "Apply a promo code to the cart (e.g. TRAIL10, TRAILVIP, SUMMIT20). Returns whether it was accepted and the updated cart with the discount applied.",
      inputSchema: {
        type: "object",
        properties: { code: { type: "string" } },
        required: ["code"],
      },
      annotations: { readOnlyHint: false },
      execute(input): unknown {
        const { code } = input as { code: string };
        const key = (code ?? "").trim().toUpperCase();
        const match = PROMOS[key];
        if (!match) {
          logWire("exec", "apply_promo", `<b>${esc(code)}</b> → rejected`);
          return {
            applied: false,
            error: `"${code}" is not a valid promo code. Try TRAIL10, TRAILVIP, or SUMMIT20.`,
            cart: cartSummary(),
          };
        }
        promo = { code: key, rate: match.rate, label: match.label };
        renderCart();
        flashCart();
        logWire("exec", "apply_promo", `<b>${esc(key)}</b> → ${esc(match.label)}`);
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

// Two wiring modes (see README → "WebMCP Demo"):
//   1. Client-token mode (used by the live persona-chat.dev deploy and for
//      staging end-to-end tests): set VITE_PERSONA_CLIENT_TOKEN +
//      VITE_PERSONA_API_URL (the API *base*, e.g. https://api.runtype.com).
//      WebMCP requires the token's surface to have `behavior.webmcp.enabled`.
//   2. Proxy mode (fallback when no client token): routes through the local
//      proxy on VITE_PROXY_PORT.
const clientToken = import.meta.env.VITE_PERSONA_CLIENT_TOKEN as string | undefined;
const clientApiBase = import.meta.env.VITE_PERSONA_API_URL as string | undefined;

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyApiUrl = import.meta.env.VITE_PROXY_URL
  ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch`
  : `http://localhost:${proxyPort}/api/chat/dispatch`;

// Tools the storefront treats as read-only (safe to run without approval). We
// gate by name rather than by the registered `readOnlyHint` annotation because
// @mcp-b/webmcp-polyfill@3.0.0's `getTools()` does NOT echo annotations back to
// consumers, so the widget can't populate `WebMcpConfirmInfo.annotations` — the
// page is the authority on which of *its own* tools mutate state. (The tools
// still carry `readOnlyHint` for spec-correctness and the server snapshot.)
const READ_ONLY_TOOLS = new Set(["search_products", "view_product"]);

const usingClientToken = Boolean(clientToken);
logWire(
  "send",
  "mode",
  usingClientToken
    ? `client-token → ${esc(clientApiBase ?? "https://api.runtype.com")}`
    : `proxy → ${esc(proxyApiUrl)}`,
);

// --- Switchback brand theme (mirrors webmcp-shop.css; both follow the OS
//     light/dark preference via colorScheme:'auto'). Warm artisan palette
//     inspired by the bakery demo: espresso primary + caramel accent on cream.
//     White-on-espresso send button ≈ 16:1; on dark, caramel becomes the
//     interactive primary with espresso text (≈8:1). ---
const shopTheme: NonNullable<AgentWidgetConfig["theme"]> = {
  palette: {
    colors: {
      primary: { 500: "#1c1917", 600: "#292524", 700: "#44403c" },
      accent: { 500: "#b8814b", 600: "#8a5a2b" },
      gray: {
        50: "#ffffff",
        100: "#f6f4f0",
        200: "#e7e5e4",
        500: "#78716c",
        900: "#1c1917",
      },
    },
    radius: { md: "0.5rem", lg: "0.75rem", xl: "1rem" },
  },
  semantic: {
    colors: {
      primary: "#1c1917",
      accent: "#b8814b",
      surface: "#ffffff",
      background: "#ffffff",
      container: "#f6f4f0",
      text: "#1c1917",
      textMuted: "#78716c",
      border: "#e7e5e4",
      divider: "#e7e5e4",
      interactive: {
        default: "#1c1917",
        hover: "#292524",
        focus: "#44403c",
        active: "#0c0a09",
      },
      feedback: { info: "#1c1917" },
    },
  },
  components: {
    // Keep the header a dark espresso bar with a caramel icon in BOTH schemes
    // (decoupled from `primary`, which flips to caramel in dark mode and would
    // otherwise leave light header text on a light caramel bar).
    header: {
      background: "#1c1917",
      titleForeground: "#fafaf9",
      subtitleForeground: "#d6d3d1",
      iconBackground: "#b8814b",
      iconForeground: "#1c1917",
      actionIconForeground: "#e7e5e4",
    },
  },
};

const shopDarkTheme: NonNullable<AgentWidgetConfig["darkTheme"]> = {
  palette: {
    colors: {
      primary: { 500: "#d4a574", 600: "#e0b787", 700: "#ecd3b0" },
      accent: { 500: "#d4a574", 600: "#e0b787" },
      gray: {
        50: "#f5f5f4",
        100: "#292524",
        200: "#44403c",
        500: "#a8a29e",
        900: "#1c1917",
        950: "#141110",
      },
    },
  },
  semantic: {
    colors: {
      primary: "#d4a574",
      accent: "#d4a574",
      surface: "#292524",
      background: "#1c1917",
      container: "#2c2724",
      text: "#f5f5f4",
      textMuted: "#a8a29e",
      textInverse: "#1c1917",
      border: "#44403c",
      divider: "#44403c",
      interactive: {
        default: "#d4a574",
        hover: "#e0b787",
        focus: "#ecd3b0",
        active: "#f0e0c8",
        disabled: "#57534e",
      },
      feedback: { info: "#d4a574" },
    },
  },
  components: {
    header: {
      background: "#292524",
      titleForeground: "#f5f5f4",
      subtitleForeground: "#a8a29e",
      iconBackground: "#d4a574",
      iconForeground: "#1c1917",
      actionIconForeground: "#d6d3d1",
    },
  },
};

const buildConfig = (mode: Mode): AgentWidgetConfig => {
  const showLauncherChrome = mode === "launcher";
  return {
    ...DEFAULT_WIDGET_CONFIG,
    ...(usingClientToken
      ? { clientToken, ...(clientApiBase ? { apiUrl: clientApiBase } : {}) }
      : { apiUrl: proxyApiUrl }),
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
      ...(showLauncherChrome
        ? { enabled: true, autoExpand: false, width: "420px", fullHeight: true }
        : { enabled: false, autoExpand: true, width: "100%", fullHeight: true }),
    },
  };
};

setupMountMode({
  slug: "webmcp-demo",
  modes: ["inline", "launcher", "fullscreen"],
  mount: (mode, { stage }) => {
    if (mode === "launcher") {
      const { mountEl } = renderLauncherScene(stage);
      const handle = initAgentWidget({ target: mountEl, config: buildConfig("launcher") });
      return () => handle.destroy();
    }

    const mount = renderInlineMount(stage);
    mount.style.height = "100%";
    const controller = createAgentExperience(mount, buildConfig(mode));
    return () => controller.destroy();
  },
});
