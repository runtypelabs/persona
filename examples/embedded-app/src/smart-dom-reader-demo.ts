import "@runtypelabs/persona/widget.css";
import { renderDemoScaffold } from "./demo-scaffold";

import {
  initAgentWidget,
  createLocalStorageAdapter,
  createFlexibleJsonStreamParser,
  defaultActionHandlers,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  collectEnrichedPageContext,
  formatEnrichedContext,
  type AgentWidgetConfig,
  type AgentWidgetActionHandler,
} from "@runtypelabs/persona";
// Optional entry — bundled with a vendored @mcp-b/smart-dom-reader. Not part of the
// main bundle; importing this subpath is opt-in. Used by the "Compare readers" panel
// below to demonstrate the library piercing the shadow root the default reader misses.
import { collectSmartDomContext } from "@runtypelabs/persona/smart-dom-reader";
import {
  createDemoConfigInspector,
  reportDemoConfig,
} from "./demo-config-inspector";

renderDemoScaffold({ slug: "smart-dom-reader-demo" });

const configInspector = createDemoConfigInspector({
  title: "Shadow-aware Page Context",
  root: "[data-config-inspector]",
});

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
// Read-only, markdown page-context flow (PAGE_CONTEXT_FLOW) — its prompt injects
// {{pageContext}}. Unlike the JSON-action demos, this one only answers about the page.
const proxyUrl = import.meta.env.VITE_PROXY_URL
  ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-page-context`
  : `http://localhost:${proxyPort}/api/chat/dispatch-page-context`;

const STORAGE_KEY = "persona-state-smart-dom-reader";

// Scope every read to the shop pane only — not the demo nav/rail/chrome. This keeps the
// element counts meaningful and prevents the rail (which prints product names in the
// compare cards) from contaminating the readers.
const shopPane = document.querySelector<HTMLElement>(".shop-pane");

// --- Lightweight shop cart (host-page behavior, not the widget) -----------------

let cartCount = 0;
const cartCountEl = document.getElementById("cart-count");

function showToast(message: string): void {
  const toast = document.createElement("div");
  toast.className = "shop-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 1800);
}

function addToCart(name: string): void {
  cartCount += 1;
  if (cartCountEl) cartCountEl.textContent = String(cartCount);
  showToast(`${name} added to cart!`);
}

// Light-DOM "Add to cart" buttons.
document.querySelectorAll<HTMLButtonElement>(".add-to-cart").forEach((btn) => {
  btn.addEventListener("click", () => addToCart(btn.dataset.name ?? "Item"));
});

// --- Featured drop: render products inside a shadow root ------------------------
// The default TreeWalker reader cannot see inside an open shadow root; smart-dom-reader
// (full mode) can. These products are the proof: they only appear with the smart reader,
// and the assistant only knows about them because the provider pierces the shadow DOM.

const FEATURED_PRODUCTS = [
  { id: "headphones", emoji: "🎧", name: "Studio Headphones", price: "$129.00" },
  { id: "watch", emoji: "⌚", name: "Minimal Watch", price: "$89.00" },
];

function setupFeaturedDropShadow(): void {
  const host = document.getElementById("featured-drop");
  if (!host || host.shadowRoot) return;
  const shadow = host.attachShadow({ mode: "open" });
  // Each card is a DIRECT child of the shadow root (no wrapping grid element). The smart
  // reader extracts each card as its own element with its own short text — if they were
  // wrapped in one grid div, the library would surface only that wrapper and
  // formatEnrichedContext would truncate its combined text, dropping the second product.
  // Layout lives on :host so there is no extra element to collapse the cards into.
  shadow.innerHTML = `
    <style>
      :host {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 1rem;
      }
      .card {
        display: flex;
        flex-direction: column;
        background: #fff;
        border: 1px solid #ddd6fe;
        border-radius: 10px;
        padding: 1rem;
      }
      .thumb {
        height: 110px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 3rem;
        background: #f5f3ff;
        border-radius: 8px;
        margin-bottom: 0.75rem;
      }
      .name { font-size: 0.95rem; font-weight: 600; color: #0f172a; }
      .price { margin: 0.15rem 0 0.75rem; font-size: 0.9rem; font-weight: 600; color: #6d28d9; }
      button {
        margin-top: auto;
        padding: 0.5rem 0.75rem;
        border: 1px solid #6d28d9;
        background: #6d28d9;
        color: #fff;
        border-radius: 6px;
        font-size: 0.85rem;
        font-weight: 500;
        cursor: pointer;
      }
      button:hover { background: #5b21b6; }
    </style>
    ${FEATURED_PRODUCTS.map(
      (p) => `
      <article class="card card-${p.id}" data-product="${p.id}">
        <div class="thumb">${p.emoji}</div>
        <span class="name name-${p.id}">${p.name}</span>
        <span class="price price-${p.id}">${p.price}</span>
        <button class="buy-${p.id}" data-product="${p.id}" data-name="${p.name}">Add to cart</button>
      </article>`,
    ).join("")}
  `;
  shadow.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => {
    btn.addEventListener("click", () => addToCart(btn.dataset.name ?? "Item"));
  });
}
setupFeaturedDropShadow();

// --- Section-grouped, action-annotated page context -----------------------------
// A demo-specific context provider. Instead of the default reader's flat,
// interactivity-bucketed string — which scatters a section's heading and its products
// into separate "Content"/"Interactive" lists and loses the visual hierarchy — this
// walks the shop's two <h2> sections and lists each product *under its heading*. The
// "Featured drop" section lives inside a shadow root, so the provider crosses that
// boundary explicitly via host.shadowRoot (the Compare-readers panel below shows
// smart-dom-reader doing the same thing as a general-purpose library).
//
// Every product line carries a stable `product=<id>` handle, so the model can both
// DESCRIBE products and emit an `add_to_cart` action — the same id then resolves to a
// light-DOM or shadow-DOM button in addToCartHandler.

type ShopProduct = { id: string; name: string; price: string };
type ShopSection = { heading: string; zone: string; products: ShopProduct[] };

// Light-DOM products: each Add-to-cart button carries data-product/name/price.
function readLightProducts(): ShopProduct[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(".products-grid .add-to-cart"),
  ).map((btn) => ({
    id: btn.dataset.product ?? "",
    name: btn.dataset.name ?? "",
    price: btn.dataset.price ?? "",
  }));
}

// Featured-drop products: rendered inside the #featured-drop shadow root, so a plain
// document query can't see them — we read through host.shadowRoot directly.
function readFeaturedProducts(): ShopProduct[] {
  const shadow = document.getElementById("featured-drop")?.shadowRoot;
  if (!shadow) return [];
  return Array.from(shadow.querySelectorAll<HTMLElement>(".card")).map((card) => ({
    id: card.getAttribute("data-product") ?? "",
    name: card.querySelector(".name")?.textContent?.trim() ?? "",
    price: card.querySelector(".price")?.textContent?.trim() ?? "",
  }));
}

function buildSectionedPageContext(): string {
  const sections: ShopSection[] = [
    { heading: "Everyday picks", zone: "light DOM", products: readLightProducts() },
    { heading: "Featured drop", zone: "shadow DOM", products: readFeaturedProducts() },
  ];
  const blocks = sections
    .filter((s) => s.products.length > 0)
    .map((s) => {
      const items = s.products
        .map((p) => `- ${p.name} — ${p.price} (to add to cart: product=${p.id})`)
        .join("\n");
      return `## ${s.heading} (${s.zone})\n${items}`;
    });
  return [
    "Shop: 🛍️ Agentic Shop",
    `Cart items: ${cartCount}`,
    "",
    ...blocks,
  ].join("\n");
}

// --- Switchable page-context methods --------------------------------------------
// The rail's "Assistant's page reader" toggle picks which of these the live widget
// sends on each turn, so you can feel the difference: the default reader goes blind to
// the shadow-DOM Featured drop and offers no add-to-cart handles; smart-dom-reader sees
// the shadow products but flattens the sections; the section-grouped provider keeps the
// hierarchy and the handles. The provider reads `activeMethod` fresh on every request,
// so flipping the toggle changes the very next message with no re-init.

type ReaderMethod = "default" | "smart" | "sectioned";

const READER_METHODS: Record<
  ReaderMethod,
  { label: string; desc: string; build: () => string }
> = {
  default: {
    label: "Default reader",
    desc: "Flat TreeWalker list — can't see the shadow-DOM Featured drop, and gives the assistant no handles to add to cart.",
    build: () =>
      formatEnrichedContext(
        collectEnrichedPageContext({
          root: shopPane ?? undefined,
          options: { excludeSelector: ".persona-host" },
        }),
      ),
  },
  smart: {
    label: "smart-dom-reader (full)",
    desc: "Pierces the shadow root, so the assistant can describe the Featured drop — but the list is flat (sections scattered) with no add-to-cart handles.",
    build: () =>
      formatEnrichedContext(
        collectSmartDomContext({
          mode: "full",
          root: shopPane ?? undefined,
          excludeSelector: ".persona-host",
        }),
      ),
  },
  sectioned: {
    label: "Section-grouped",
    desc: "Products grouped under their section heading (shadow drop included), each with a product=<id> handle — the assistant can describe AND add to cart.",
    build: buildSectionedPageContext,
  },
};

let activeMethod: ReaderMethod = "sectioned";

// Single context provider; branches on the live toggle selection each request.
const pageContextProvider = () => ({
  pageContext: READER_METHODS[activeMethod].build(),
});

// Resolve a product id to its Add-to-cart button and click it. Light-DOM buttons are
// reachable via document.querySelector; the Featured-drop buttons are not (they live in
// a shadow root) so we pierce host.shadowRoot — the move the default click loop cannot
// make. This is why the assistant can add the shadow-DOM products to the cart.
const addToCartHandler: AgentWidgetActionHandler = (action) => {
  if (action.type !== "add_to_cart") return;
  const payload = action.payload as Record<string, unknown>;
  const id = typeof payload.product === "string" ? payload.product : "";
  const text = typeof payload.text === "string" ? payload.text : "";
  const button =
    document.querySelector<HTMLElement>(`.add-to-cart[data-product="${id}"]`) ??
    document
      .getElementById("featured-drop")
      ?.shadowRoot?.querySelector<HTMLElement>(`.buy-${id}`) ??
    null;
  if (button) {
    window.setTimeout(() => button.click(), 200);
  } else {
    console.warn("[smart-dom demo] add_to_cart: no button for product", id);
  }
  return { handled: true, displayText: text };
};

// --- Widget config: section-grouped page-context provider + cart actions ---------

const config: AgentWidgetConfig = {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: proxyUrl,
  storageAdapter: createLocalStorageAdapter(STORAGE_KEY),
  clearChatHistoryStorageKey: STORAGE_KEY,
  // Shadow-aware page context. Which method builds it is chosen live by the rail's
  // "Assistant's page reader" toggle (default / smart-dom-reader / section-grouped) —
  // see READER_METHODS and pageContextProvider above.
  contextProviders: [pageContextProvider],
  // The model replies with a small JSON envelope ({"text": ...} or {"action":
  // "add_to_cart", "product": ..., "text": ...}). The flexible parser renders `text`
  // as the chat bubble; the action manager parses the envelope's `rawContent` and
  // dispatches add_to_cart to the handler below.
  streamParser: () => createFlexibleJsonStreamParser(),
  actionHandlers: [defaultActionHandlers.message, addToCartHandler],
  // The provider's output lands in `payload.context`, but the proxy only forwards
  // `inputs`/`metadata` to the flow. Move it into `inputs` so {{pageContext}} resolves
  // in PAGE_CONTEXT_FLOW's prompt.
  requestMiddleware: ({ payload }) => {
    const ctx = payload.context;
    if (!ctx) return payload;
    return {
      ...payload,
      inputs: { ...payload.inputs, ...ctx },
      context: undefined,
    };
  },
  launcher: {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    enabled: true,
    width: "min(420px, 95vw)",
    title: "Shopping Assistant",
    subtitle:
      "I can see this whole shop — including the shadow-DOM featured drop — and add things to your cart",
    agentIconText: "🛍️",
  },
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    welcomeTitle: "Shadow-aware page context + actions",
    welcomeSubtitle:
      "This assistant reads the whole shop grouped by section — including the shadow-DOM \"Featured drop\" the default reader misses — and can add any product to the cart, even the shadow-DOM ones. Ask what's here, or to add something.",
    inputPlaceholder: "Ask about products, or say \"add the headphones\"…",
  },
  suggestionChips: [
    "What's in the featured drop?",
    "Add the Studio Headphones to my cart",
    "Add the Canvas Tote to my cart",
  ],
  postprocessMessage: ({ text }) => markdownPostprocessor(text),
};

initAgentWidget({
  target: "#launcher-root",
  useShadowDom: false,
  config,
});

reportDemoConfig(configInspector, { config, mode: "launcher" });

// --- Reader comparison controls -------------------------------------------------
// Render a scannable result per reader: a ✓/✗ row for each shop section, so the
// shadow-DOM "Featured drop" visibly flips from missed (default) to found (smart).
// The raw LLM-formatted context is tucked into an expandable <details>.
//
// Detection runs against the formatted context string, by section — NOT by product
// name. The two readers represent products differently (the default reader keys light
// products by `data-product` + price; the smart reader keys them by css-path + the
// "Add to cart" label), so a per-name probe is unreliable. What IS reliable: every
// reader emits "Add to cart" for the light grid, and only the shadow-piercing reader
// emits the Featured-drop product names/prices.

type Section = {
  label: string;
  zone: "light DOM" | "shadow DOM";
  test: (formatted: string) => boolean;
};
const SECTIONS: Section[] = [
  {
    label: "Everyday picks",
    zone: "light DOM",
    test: (f) => f.includes("Add to cart"),
  },
  {
    label: "Featured drop",
    zone: "shadow DOM",
    test: (f) => /Studio Headphones|Minimal Watch|\$129\.00|\$89\.00/.test(f),
  },
];

const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );

function renderResult(
  cardId: string,
  elements: ReturnType<typeof collectEnrichedPageContext>,
): void {
  const card = document.getElementById(cardId);
  if (!card) return;
  const label = card.querySelector(".reader-result-name")?.textContent ?? "";
  const formatted = formatEnrichedContext(elements);

  const rowsHtml = SECTIONS.map((s) => {
    const found = s.test(formatted);
    const zoneClass = s.zone === "shadow DOM" ? "probe-zone shadow" : "probe-zone";
    return `
      <li class="${found ? "ok" : "miss"}">
        <span class="probe-icon">${found ? "✓" : "✗"}</span>
        <span>${escapeHtml(s.label)}</span>
        <span class="${zoneClass}">${s.zone}</span>
      </li>`;
  }).join("");

  card.removeAttribute("data-empty");
  card.innerHTML = `
    <div class="reader-result-head">
      <span class="reader-result-name">${escapeHtml(label)}</span>
    </div>
    <ul class="reader-result-probes">${rowsHtml}</ul>
    <details class="reader-result-raw">
      <summary>Show raw page context</summary>
      <pre>${escapeHtml(formatted)}</pre>
    </details>
  `;
}

document.getElementById("run-default")?.addEventListener("click", () => {
  renderResult(
    "result-default",
    collectEnrichedPageContext({
      root: shopPane ?? undefined,
      options: { excludeSelector: ".persona-host" },
    }),
  );
});

document.getElementById("run-smart")?.addEventListener("click", () => {
  renderResult(
    "result-smart",
    collectSmartDomContext({
      mode: "full",
      root: shopPane ?? undefined,
      excludeSelector: ".persona-host",
    }),
  );
});

// --- "Assistant's page reader" toggle -------------------------------------------
// Flip which method pageContextProvider uses on the next message.

const methodDescEl = document.getElementById("reader-method-desc");
const methodButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>(".reader-toggle-opt"),
);

function selectReaderMethod(method: ReaderMethod, announce = false): void {
  activeMethod = method;
  methodButtons.forEach((btn) => {
    const on = btn.dataset.method === method;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-checked", String(on));
  });
  if (methodDescEl) methodDescEl.textContent = READER_METHODS[method].desc;
  if (announce) {
    showToast(
      `Page reader: ${READER_METHODS[method].label} — used on your next message`,
    );
  }
}

methodButtons.forEach((btn) => {
  btn.addEventListener("click", () =>
    selectReaderMethod(btn.dataset.method as ReaderMethod, true),
  );
});
selectReaderMethod(activeMethod); // sync initial aria-checked + description

// --- Clear chat history ---------------------------------------------------------

document.getElementById("clear-storage-btn")?.addEventListener("click", () => {
  if (
    !window.confirm(
      "Clear all chat history and reset? This will reload the page.",
    )
  ) {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
  showToast("Chat history cleared! Reloading…");
  window.setTimeout(() => window.location.reload(), 400);
});
