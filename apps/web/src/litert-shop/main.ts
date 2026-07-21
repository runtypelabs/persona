// On-device Shop: "Trail Supply Co." — a faceted-filter storefront copilot
// driven by Gemma 4 running ENTIRELY in the browser via LiteRT-LM over WebGPU.
// No server, no API key. The user types natural language ("waterproof hiking
// boots under $100 in size 10") into the docked Persona panel; the model calls
// the page's WebMCP tools to set filters; the product grid re-filters live.
//
// This is a "small-model recipe" demo: every tool argument is an enum or a
// number pulled from the catalog, and every tool result is tiny, so a 2B model
// almost cannot fail. Current filter state reaches the model via the page's
// contextProvider (shop_context) — it never needs a read call to know state.
//
// The engine (fetch-patching, WebMCP tool loop, durable resume) is shared with
// the other litert demos; see ../litert-shared/litert-engine.ts.
import "@runtypelabs/persona/widget.css";
// litert-chrome.css supplies the shared toolbar + eval-HUD styles (.lr-*);
// shop.css is the light storefront shell.
import "../litert-shared/litert-chrome.css";
import "./shop.css";

import {
  DEFAULT_WIDGET_CONFIG,
  createLocalStorageAdapter,
  initAgentWidget,
  markdownPostprocessor,
} from "@runtypelabs/persona";
// `@mcp-b/webmcp-polyfill` polyfills the strict standard surface on
// `document.modelContext`; it must be initialized before tools register.
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";

import { createEvalHud } from "../litert-shared/eval-hud";
import {
  type LiteRtPersonaEngine,
  createLiteRtPersonaEngine,
} from "../litert-shared/litert-engine";
import { wireModelLoader } from "../litert-shared/model-loader";
import {
  CATEGORY_LABEL,
  PRODUCTS,
  SORT_LABEL,
  swatchGradient,
  type Product,
} from "./catalog";
import { ShopStore, type FacetKey } from "./store";
import { setupShopTools } from "./tools";

initializeWebMCPPolyfill();

// Fake dispatch URL: the engine patches window.fetch to answer this path (and
// `${API_PATH}/resume`) from the in-browser model. Kept off `/api/...` so the
// Vite dev proxy never tries to forward it.
const API_PATH = "/litert/shop/dispatch";
const MODEL_NOT_READY_CHAT_ERROR =
  "The on-device model is not ready yet. Pick a model in the toolbar, press Load model, and wait for the ready status before asking the shop copilot to filter.";

const chipsHost = document.querySelector<HTMLElement>("#shop-chips");
const gridHost = document.querySelector<HTMLElement>("#shop-grid");
const dockTarget = document.querySelector<HTMLElement>("#shop-dock-target");

if (!chipsHost || !gridHost || !dockTarget) {
  throw new Error("[LiteRT Shop] Missing mount points in litert-shop.html");
}

// ---- Store -----------------------------------------------------------------

const store = new ShopStore();

/** Compact active filters — mirrored to the model via shop_context. */
function compactFilters(): Record<string, unknown> {
  const s = store.state;
  const out: Record<string, unknown> = {};
  if (s.category) out.category = s.category;
  if (s.brands.length) out.brands = s.brands;
  if (s.colors.length) out.colors = s.colors;
  if (s.size) out.size = s.size;
  if (s.priceMin != null) out.priceMin = s.priceMin;
  if (s.priceMax != null) out.priceMax = s.priceMax;
  if (s.waterproof != null) out.waterproof = s.waterproof;
  if (s.minRating != null) out.minRating = s.minRating;
  if (s.inStockOnly) out.inStockOnly = true;
  if (s.sort !== "popularity") out.sort = s.sort;
  return out;
}

// ---- On-device engine + eval HUD ------------------------------------------

const hudMount = document.querySelector<HTMLElement>("#lr-hud");
const hud = hudMount ? createEvalHud(hudMount) : { onMetric: () => {} };

// Short and imperative, sized for a 2B model that re-reads this every turn. The
// enum-mapping lines are the difference between a clean tool call and a guess.
const SYSTEM_PROMPT = `You are the shop copilot for Trail Supply Co., an outdoor-gear store.
You change the product filters ONLY by calling the page tools — never say you filtered without calling a tool.
Use set_filters to set facets. It MERGES: include ONLY the facets the user asked about; other filters stay as they are. To clear one facet, pass null for it. To reset everything, call clear_filters.
Map the user's words to facet values (use ONLY the exact enum values from the tool schema):
- category: boots, jackets, tents, backpacks, sleeping-bags, accessories. Vague words: "warm" or "cold weather" → jackets or sleeping-bags; "shelter" → tents; "carry" or "pack" → backpacks.
- "under $100" → priceMax 100; "over $50" → priceMin 50; "$50 to $100" → priceMin 50 and priceMax 100.
- "waterproof" → waterproof true; "in stock" or "available" → inStockOnly true; "highly rated" or "best" → minRating 4; "cheapest" → sort price-asc; "most expensive" → sort price-desc.
The result returns matchCount — how many products match. If matchCount is 0, say so and ASK the user whether to raise the price limit or drop a filter — never change filters the user didn't ask for, and never claim you changed something without calling a tool.
Do NOT call the same tool with the same arguments twice.
After filtering, reply in plain text with ONE short sentence that mentions the matchCount. Use get_top_results only when the user asks what or which products match.`;

const CORE_TOOL_NAMES: readonly string[] = ["set_filters", "clear_filters", "get_top_results"];

const engine = createLiteRtPersonaEngine({
  apiPath: API_PATH,
  onMetric: hud.onMetric,
  // Single consolidated system turn: instructions + the live filter state the
  // widget rode along (see contextProviders below), so the model never needs a
  // read call to know what's currently applied.
  buildSystemContent: (ctx) => {
    const shopContext = ctx.shop_context;
    return typeof shopContext === "string" && shopContext
      ? `${SYSTEM_PROMPT}\n\nCurrent filters (JSON): ${shopContext}`
      : SYSTEM_PROMPT;
  },
  toolScope: "core",
  coreToolNames: CORE_TOOL_NAMES,
});
window.personaLiteRtEngine = engine;

// ---- Model picker (shared wiring; E2B default) -----------------------------

wireModelLoader({ engine, readyHint: "ask the shop copilot to filter." });

// ---- Storefront render -----------------------------------------------------

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

interface ChipSpec {
  key: FacetKey;
  value?: string;
  label: string;
}

function chipSpecs(): ChipSpec[] {
  const s = store.state;
  const chips: ChipSpec[] = [];
  if (s.category) chips.push({ key: "category", label: CATEGORY_LABEL[s.category] });
  for (const brand of s.brands) chips.push({ key: "brands", value: brand, label: brand });
  for (const color of s.colors) chips.push({ key: "colors", value: color, label: cap(color) });
  if (s.size) chips.push({ key: "size", label: `Size ${s.size}` });
  if (s.priceMin != null || s.priceMax != null) {
    let label: string;
    if (s.priceMin != null && s.priceMax != null) label = `$${s.priceMin}–$${s.priceMax}`;
    else if (s.priceMax != null) label = `Under $${s.priceMax}`;
    else label = `Over $${s.priceMin}`;
    chips.push({ key: "price", label });
  }
  if (s.waterproof != null)
    chips.push({ key: "waterproof", label: s.waterproof ? "Waterproof" : "Not waterproof" });
  if (s.minRating != null) chips.push({ key: "minRating", label: `${s.minRating}★ & up` });
  if (s.inStockOnly) chips.push({ key: "inStockOnly", label: "In stock" });
  if (s.sort !== "popularity") chips.push({ key: "sort", label: SORT_LABEL[s.sort] });
  return chips;
}

function renderChips(): void {
  const host = chipsHost as HTMLElement;
  host.replaceChildren();
  const specs = chipSpecs();

  if (specs.length === 0) {
    const empty = document.createElement("span");
    empty.className = "shop-chips-empty";
    empty.textContent = "No filters — showing the full catalog. Ask the copilot to narrow it down.";
    host.append(empty);
    appendCount(host);
    return;
  }

  const label = document.createElement("span");
  label.className = "shop-chips-label";
  label.textContent = "Filters:";
  host.append(label);

  for (const spec of specs) {
    const chip = document.createElement("span");
    chip.className = "shop-chip";
    if (store.sourceOf(spec.key) === "agent") chip.classList.add("is-agent");

    const text = document.createElement("span");
    text.textContent = spec.label;
    chip.append(text);

    const x = document.createElement("button");
    x.type = "button";
    x.className = "shop-chip-x";
    x.setAttribute("aria-label", `Remove ${spec.label}`);
    x.textContent = "×";
    x.addEventListener("click", () => store.dismiss(spec.key, spec.value));
    chip.append(x);

    host.append(chip);
  }

  const clearAll = document.createElement("button");
  clearAll.type = "button";
  clearAll.className = "shop-chips-clear";
  clearAll.textContent = "Clear all";
  clearAll.addEventListener("click", () => store.clear("user"));
  host.append(clearAll);

  appendCount(host);
}

function appendCount(host: HTMLElement): void {
  const count = document.createElement("span");
  count.className = "shop-count";
  const n = store.matchCount;
  count.textContent = `${n} of ${PRODUCTS.length} products`;
  host.append(count);
}

function stars(rating: number): string {
  const full = Math.round(rating);
  return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
}

function renderCard(product: Product): HTMLElement {
  const card = document.createElement("article");
  card.className = "shop-card";
  if (!product.inStock) card.classList.add("is-out");

  const visual = document.createElement("div");
  visual.className = "shop-card-visual";
  visual.style.background = swatchGradient(product.colors);
  const emoji = document.createElement("span");
  emoji.textContent = product.emoji;
  visual.append(emoji);

  const swatches = document.createElement("div");
  swatches.className = "shop-card-swatches";
  for (const color of product.colors) {
    const dot = document.createElement("span");
    dot.className = "shop-swatch";
    dot.style.background = swatchGradient([color]);
    dot.title = color;
    swatches.append(dot);
  }
  visual.append(swatches);

  if (product.waterproof) {
    const wp = document.createElement("span");
    wp.className = "shop-card-wp";
    wp.textContent = "Waterproof";
    visual.append(wp);
  }
  card.append(visual);

  const body = document.createElement("div");
  body.className = "shop-card-body";

  const brand = document.createElement("span");
  brand.className = "shop-card-brand";
  brand.textContent = product.brand;
  body.append(brand);

  const name = document.createElement("span");
  name.className = "shop-card-name";
  name.textContent = product.name;
  body.append(name);

  const rating = document.createElement("span");
  rating.className = "shop-card-rating";
  const starEl = document.createElement("span");
  starEl.className = "shop-stars";
  starEl.textContent = stars(product.rating);
  rating.append(starEl, document.createTextNode(product.rating.toFixed(1)));
  body.append(rating);

  const meta = document.createElement("div");
  meta.className = "shop-card-meta";
  const price = document.createElement("span");
  price.className = "shop-card-price";
  price.textContent = `$${product.price}`;
  const stock = document.createElement("span");
  stock.className = `shop-card-stock ${product.inStock ? "in" : "out"}`;
  stock.textContent = product.inStock ? "In stock" : "Out of stock";
  meta.append(price, stock);
  body.append(meta);

  card.append(body);
  return card;
}

function renderGrid(): void {
  const host = gridHost as HTMLElement;
  host.replaceChildren();
  const products = store.apply();
  if (products.length === 0) {
    const empty = document.createElement("div");
    empty.className = "shop-empty";
    empty.textContent = "No products match these filters. Try relaxing price or color.";
    host.append(empty);
    return;
  }
  for (const product of products) host.append(renderCard(product));
}

store.subscribe(() => {
  renderChips();
  renderGrid();
});
renderChips();
renderGrid();

// ---- Persona widget --------------------------------------------------------

function mountWidget(): void {
  window.personaShopWidget = initAgentWidget({
    target: dockTarget as HTMLElement,
    useShadowDom: false,
    config: {
      ...DEFAULT_WIDGET_CONFIG,
      // The engine answers this path from the in-browser model (no network).
      apiUrl: API_PATH,
      // The fetch patch in ../litert-shared/litert-engine handles the fake
      // dispatch/resume routes. This early dispatch guard is demo UX: fail fast
      // when the user chats before loading Gemma. (Same pattern as litert-paint.)
      customFetch: async (url, init) => {
        if (!engine.isLoaded()) {
          throw new Error(MODEL_NOT_READY_CHAT_ERROR);
        }
        return fetch(url, init);
      },
      errorMessage: (error) =>
        error.message === MODEL_NOT_READY_CHAT_ERROR
          ? MODEL_NOT_READY_CHAT_ERROR
          : `Sorry — the on-device shop copilot hit an error.\n\n_Details: ${error.message}_`,
      storageAdapter: createLocalStorageAdapter("persona-state-litert-shop"),
      postprocessMessage: ({ text }) => markdownPostprocessor(text),
      colorScheme: "light",
      // Square the panel's outer edges (no radius, border, or shadow) so the
      // docked copilot sits flush against the toolbar and viewport edge like a
      // built-in pane — the Switchback storefront's treatment. Everything else
      // stays on the default theme.
      theme: {
        components: {
          panel: { borderRadius: "0", border: "none", shadow: "none" },
          header: { borderRadius: "0" },
        },
      },
      suggestionChipsConfig: {
        fontFamily: "sans-serif",
      },
      copy: {
        ...DEFAULT_WIDGET_CONFIG.copy,
        welcomeTitle: "Ask the shop copilot",
        welcomeSubtitle:
          "Gemma 4 runs in your browser and filters this storefront with the page's tools. Load a model from the toolbar first.",
        inputPlaceholder: "Describe what you're looking for…",
      },
      suggestionChips: [
        "Waterproof hiking boots under $100",
        "Something warm for camping in March",
        "Show me the highest-rated tent",
        "Only what's in stock, cheapest first",
        "Clear all filters",
      ],
      launcher: {
        ...DEFAULT_WIDGET_CONFIG.launcher,
        mountMode: "docked",
        dock: {
          side: "right",
          width: "400px",
          reveal: "emerge",
          animate: true,
        },
        autoExpand: true,
        mobileBreakpoint: 1080,
        title: "Shop copilot",
        subtitle: "Gemma 4 · on-device",
        headerIconName: "search",
      },
      webmcp: {
        enabled: true,
        // Filter changes are cheap and reversible (chips have an ×, and there's
        // a Clear all), so every tool auto-approves — the user watches the grid
        // update live instead of clicking through approvals.
        autoApprove: () => true,
      },
      // Fresh filter state rides along with every message; the engine folds
      // `shop_context` into the system turn so the model never needs a read call.
      contextProviders: [
        () => ({
          shop_context: JSON.stringify({
            appliedFilters: compactFilters(),
            matchCount: store.matchCount,
            totalProducts: PRODUCTS.length,
          }),
        }),
      ],
      statusIndicator: {
        ...DEFAULT_WIDGET_CONFIG.statusIndicator,
        visible: true,
        idleText: "Gemma 4 filters on-device — the grid updates as it works.",
        connectedText: "Gemma 4 is filtering on-device…",
        connectingText: "Spinning up Gemma 4…",
        errorText: "On-device engine error",
      },
    },
  });
}

// Mount the Persona panel IMMEDIATELY, like litert-paint — never gated on
// anything. Tools register right after the polyfill is up; the widget snapshots
// WebMCP tools at dispatch time, and the model-not-ready guard fronts the first
// turn anyway. (No top-level await: Vite's default build target predates it.)
mountWidget();
setupShopTools(store);

declare global {
  interface Window {
    personaShopWidget?: unknown;
    personaLiteRtEngine?: LiteRtPersonaEngine;
  }
}
