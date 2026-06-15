// Register the storefront's page tools on `document.modelContext` via WebMCP.
//
// `@mcp-b/webmcp-polyfill` polyfills the strict standard surface
// (registerTool / getTools / executeTool). We install it explicitly so the
// global exists before the Persona widget's first dispatch. The widget also
// lazily installs it from its WebMCP bridge, but the *producer* page should
// install first so the tools are registered by the time the widget snapshots
// them.
//
// Each tool's execute() mutates the shared observable store (store.ts); the
// React storefront re-renders off that store. This is the only structural
// change from the vanilla embedded-app demo: the tool surface and behavior are
// identical.

import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";
import { findBySku, searchCatalog } from "./catalog";
import {
  addToCart,
  applyPromo,
  cartSummary,
  deleteCartLine,
  esc,
  flashCard,
  flashCart,
  getCartLine,
  highlightHits,
  logWire,
  setCartLineQuantity,
} from "./store";

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

let registered = false;

/** Idempotent: safe to call from a React effect (StrictMode double-invoke). */
export function registerStorefrontTools(): void {
  if (registered || typeof document === "undefined") return;
  registered = true;

  initializeWebMCPPolyfill();

  const modelContext = (
    document as Document & { modelContext?: RegisterableModelContext }
  ).modelContext;

  if (!modelContext) {
    logWire("reg", "register", "document.modelContext unavailable: tools NOT registered");
    return;
  }

  const ac = new AbortController();

  // -- search_products (read-only) --
  modelContext.registerTool(
    {
      name: "search_products",
      description:
        "Search the product catalog by free-text query (e.g. 'waterproof trail shoe', 'blue running', 'jacket'). Returns matching products with SKU, title, brand, color, price, imageUrl, and imageAlt.",
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
      description:
        "Look at one product in detail by SKU (from search_products results). Highlights it on the page and returns its full description plus imageUrl/imageAlt. Read-only.",
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
        logWire("exec", "view_product", `<b>${esc(product.sku)}</b>: ${esc(product.title)}`);
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
        // Resolve the SKU canonically (the cart is keyed by product.sku), then
        // only a positive partial quantity decrements; anything else removes the
        // whole line, so a negative quantity can't subtract-a-negative.
        const product = findBySku(sku);
        if (!product) {
          logWire("exec", "remove_from_cart", `<b>${esc(sku)}</b> → not found`);
          return {
            removed: false,
            error: `No product with SKU "${sku}". Call search_products first to get valid SKUs.`,
            cart: cartSummary(),
          };
        }
        const line = getCartLine(product.sku);
        if (!line) {
          logWire("exec", "remove_from_cart", `<b>${esc(product.sku)}</b> → not in cart`);
          return {
            removed: false,
            error: `"${product.sku}" is not in the cart.`,
            cart: cartSummary(),
          };
        }
        const partial =
          typeof quantity === "number" && quantity >= 1 && quantity < line.quantity;
        if (partial) {
          setCartLineQuantity(product.sku, line.quantity - (quantity as number));
        } else {
          deleteCartLine(product.sku);
        }
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
        const match = applyPromo(code ?? "");
        if (!match) {
          logWire("exec", "apply_promo", `<b>${esc(code)}</b> → rejected`);
          return {
            applied: false,
            error: `"${code}" is not a valid promo code. Try TRAIL10, TRAILVIP, or SUMMIT20.`,
            cart: cartSummary(),
          };
        }
        const key = (code ?? "").trim().toUpperCase();
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

/** Tools the storefront treats as read-only (safe to auto-approve). */
export const READ_ONLY_TOOLS = new Set(["search_products", "view_product"]);
