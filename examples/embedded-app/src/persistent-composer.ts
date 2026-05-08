import "@runtypelabs/persona/widget.css";

import {
  DEFAULT_WIDGET_CONFIG,
  initAgentWidget,
  markdownPostprocessor,
  createFlexibleJsonStreamParser,
  createLocalStorageAdapter,
  defaultActionHandlers,
  componentRegistry,
} from "@runtypelabs/persona";
import type {
  AgentWidgetConfig,
  AgentWidgetInitHandle,
  AgentWidgetStreamParser,
  AgentWidgetActionHandler,
  AgentWidgetRequestPayload,
  ComponentRenderer,
  SlotRenderer,
} from "@runtypelabs/persona";

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const apiUrl = import.meta.env.VITE_PROXY_URL
  ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-storefront`
  : `http://localhost:${proxyPort}/api/chat/dispatch-storefront`;
const checkoutUrl = import.meta.env.VITE_PROXY_URL
  ? `${import.meta.env.VITE_PROXY_URL}/api/checkout/storefront`
  : `http://localhost:${proxyPort}/api/checkout/storefront`;

const CART_STORAGE_KEY = "everspun-cart";
const CHAT_STORAGE_KEY = "everspun-demo-chat";

// Hero product on the page itself — clicking the static "Add to bag" button
// adds this to the cart. The agent sees it in {{cart}} context next turn.
const HERO_PRODUCT = {
  id: "mongolian-cashmere-button-down",
  title: "Mongolian Cashmere Button Down Sweater",
  price: 24800,
  color: "Camel",
  size: "S",
} as const;

// ============================================================================
// Cart
// ============================================================================

interface CartItem {
  id: string;
  title: string;
  price: number; // cents
  quantity: number;
}

const getCart = (): CartItem[] => {
  try {
    return JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
};

const saveCart = (cart: CartItem[]) => {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  syncBagUI();
};

const addToCart = (item: { id: string; title: string; price: number }) => {
  const cart = getCart();
  const existing = cart.find((i) => i.id === item.id);
  if (existing) existing.quantity += 1;
  else cart.push({ ...item, quantity: 1 });
  saveCart(cart);
};

const removeFromCart = (id: string) => {
  saveCart(getCart().filter((i) => i.id !== id));
};

const getCartCount = () => getCart().reduce((sum, i) => sum + i.quantity, 0);
const getCartTotal = () => getCart().reduce((sum, i) => sum + i.price * i.quantity, 0);

const clearCart = () => {
  localStorage.removeItem(CART_STORAGE_KEY);
  syncBagUI();
};

// ============================================================================
// UI sync
// ============================================================================

const syncBagUI = () => {
  const countEl = document.getElementById("bag-count");
  if (countEl) countEl.textContent = String(getCartCount());
  // Re-render drawer if it's open
  const drawer = document.getElementById("storefront-drawer");
  if (drawer && drawer.dataset.open === "true") renderDrawerBody(drawer);
};

const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// ============================================================================
// Toast
// ============================================================================

let toastTimer: number | null = null;
const showToast = (message: string) => {
  let toast = document.getElementById("storefront-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "storefront-toast";
    toast.className = "storefront-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  void toast.offsetWidth;
  toast.classList.add("is-visible");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast?.classList.remove("is-visible");
  }, 2600);
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);

// ============================================================================
// ProductGrid component — renders inline in the chat as cards
// ============================================================================

interface StorefrontProduct {
  id: string;
  title: string;
  price: number;
  image: string;
  description?: string;
}

const ensureProductGridStyles = () => {
  if (document.getElementById("persona-product-grid-styles")) return;
  const style = document.createElement("style");
  style.id = "persona-product-grid-styles";
  style.textContent = `
    /* Bubbles that contain a ProductGrid escape the default 85% bubble cap so
       the grid can stretch the full chat-panel width. The widget sets the
       bubble class to "persona-max-w-[85%] persona-p-4" — override the cap
       with higher specificity, and supply explicit padding because
       "persona-p-4" isn't shipped in the widget's Tailwind build. */
    .persona-message-bubble:has(.persona-product-grid) {
      max-width: 100% !important;
      width: 100%;
      padding: 16px 18px;
    }
    .persona-product-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 24px 20px;
      margin: 8px 0 0;
    }
    @media (max-width: 640px) {
      .persona-product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px 16px; }
    }
    @media (max-width: 420px) {
      .persona-product-grid { grid-template-columns: 1fr; gap: 20px; }
    }
    .persona-product-card {
      display: flex;
      flex-direction: column;
      min-width: 0;
      background: transparent;
      opacity: 0;
      transform: translateY(6px);
      animation: personaProductCardIn 320ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
    }
    @keyframes personaProductCardIn {
      to { opacity: 1; transform: translateY(0); }
    }
    .persona-product-card__image {
      width: 100%;
      aspect-ratio: 4 / 5;
      border-radius: 6px;
      background: linear-gradient(160deg, #efe9df 0%, #d8cdb6 100%);
      background-size: cover;
      background-position: center;
      margin-bottom: 8px;
    }
    .persona-product-card__title {
      font-size: 13px;
      font-weight: 500;
      letter-spacing: -0.005em;
      color: #1a1a1a;
      margin: 0 0 2px;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .persona-product-card__price {
      font-size: 12px;
      color: #666;
      margin: 0 0 10px;
    }
    .persona-product-card__add {
      width: 100%;
      padding: 8px 12px;
      background: #1a1a1a;
      color: #fff;
      border: none;
      border-radius: 999px;
      font: inherit;
      font-size: 12.5px;
      font-weight: 500;
      letter-spacing: 0.01em;
      margin-top: 0.3rem;
      cursor: pointer;
      transition: background 150ms ease, transform 100ms ease;
    }
    .persona-product-card__add:hover { background: #000; }
    .persona-product-card__add:active { transform: scale(0.98); }
    .persona-product-card__add.is-added { background: #5b8a4d; }
  `;
  document.head.appendChild(style);
};

// Tracks message IDs whose ProductGrid has already played its stagger-in
// animation. The widget re-runs this renderer on every fingerprint change
// (each streaming chunk + a final stabilization render once `streaming`
// flips to false), and a fresh DOM tree on each pass means cards would
// re-fire the `personaProductCardIn` animation every time — visible as a
// "flash" when the assistant's reply finishes. Animate only on first sight
// of a given message id; subsequent renders mount cards in their final
// state with no animation.
const animatedProductGridMessageIds = new Set<string>();

const ProductGrid: ComponentRenderer = (props, context) => {
  ensureProductGridStyles();

  const productsRaw = Array.isArray(props.products) ? props.products : [];
  const products: StorefrontProduct[] = productsRaw
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
    .filter((p) =>
      typeof p.id === "string"
      && typeof p.title === "string"
      && typeof p.price === "number"
      && typeof p.image === "string",
    )
    .map((p) => ({
      id: p.id as string,
      title: p.title as string,
      price: p.price as number,
      image: p.image as string,
      description: typeof p.description === "string" ? p.description : undefined,
    }));

  const messageId = context.message?.id ?? "";
  const shouldAnimate = messageId.length > 0 && !animatedProductGridMessageIds.has(messageId);
  if (messageId) animatedProductGridMessageIds.add(messageId);

  const grid = document.createElement("div");
  grid.className = "persona-product-grid";

  products.forEach((product, index) => {
    const card = document.createElement("article");
    card.className = "persona-product-card";
    card.dataset.productId = product.id;
    if (shouldAnimate) {
      card.style.animationDelay = `${index * 50}ms`;
    } else {
      card.style.animation = "none";
      card.style.opacity = "1";
      card.style.transform = "translateY(0)";
    }

    const image = document.createElement("div");
    image.className = "persona-product-card__image";
    if (product.image) {
      const probe = new Image();
      probe.onload = () => {
        image.style.backgroundImage = `url("${product.image.replace(/"/g, '%22')}")`;
      };
      probe.src = product.image;
    }

    const title = document.createElement("h4");
    title.className = "persona-product-card__title";
    title.textContent = product.title;

    const price = document.createElement("p");
    price.className = "persona-product-card__price";
    price.textContent = formatPrice(product.price);

    const button = document.createElement("button");
    button.className = "persona-product-card__add";
    button.type = "button";
    button.textContent = "Add to bag";
    button.addEventListener("click", () => {
      addToCart({ id: product.id, title: product.title, price: product.price });
      button.classList.add("is-added");
      button.textContent = "Added";
      window.setTimeout(() => {
        button.classList.remove("is-added");
        button.textContent = "Add to bag";
      }, 1400);
    });

    card.append(image, title, price, button);
    grid.appendChild(card);
  });

  return grid;
};

componentRegistry.register("ProductGrid", ProductGrid);

// ============================================================================
// Storefront chat header — custom body-top slot that replaces the default
// "Hi 👋" welcome card with an ecommerce-style header (brand wordmark,
// concierge badge, welcome hero, category chips). The chips submit real
// queries through the widget handle below.
// ============================================================================

// Filled in after `initAgentWidget(...)` returns. The slot renderer is
// invoked during widget init (before the handle exists), so we capture
// it via closure and read it lazily inside the chip click handler.
let widgetHandle: AgentWidgetInitHandle | null = null;

const STOREFRONT_HEADER_CATEGORIES: Array<{ label: string; query: string }> = [
  { label: "Cashmere", query: "Show me cashmere essentials" },
  { label: "Outerwear", query: "What outerwear do you carry?" },
  { label: "Under $200", query: "Show me everything under $200" },
  { label: "Sale", query: "What's on sale right now?" },
];

const ensureStorefrontHeaderStyles = () => {
  if (document.getElementById("persona-storefront-header-styles")) return;
  const style = document.createElement("style");
  style.id = "persona-storefront-header-styles";
  style.textContent = `
    /* Full-bleed banner: negative margins cancel out the chat body's padding
       (24px sides + 48px top in composer-bar mode) so the header runs edge-to-
       edge of the chat panel chrome and sits flush against the top. The
       container's overflow:hidden + border-radius clip the top corners cleanly. */
    .persona-storefront-header {
      display: flex;
      flex-direction: column;
      background: linear-gradient(180deg, #fafaf7 0%, #f1ebde 100%);
      margin: -48px -24px 0;
      border: none;
      border-bottom: 1px solid #e5e3dd;
      border-radius: 0;
      padding: 18px 24px 14px;
      color: #1a1a1a;
      box-shadow: none;
    }
    .persona-storefront-header__top {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
      /* Reserve clearance on the right so the brand wordmark doesn't sit
         underneath the absolute clear (⟲) and close (×) buttons at top: 8px /
         right: 8px / right: 32px in panel chrome. */
      padding-right: 56px;
    }
    .persona-storefront-header__brand {
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.16em;
      color: #1a1a1a;
    }
    .persona-storefront-header__hero {
      margin-bottom: 10px;
    }
    .persona-storefront-header__title {
      margin: 0 0 4px;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.015em;
      color: #1a1a1a;
    }
    .persona-storefront-header__lede {
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
      color: #5d5a52;
    }
    .persona-storefront-header__shopby {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .persona-storefront-header__shopby-label {
      font-size: 10.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: #888;
      flex-shrink: 0;
    }
    .persona-storefront-header__chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      flex: 1;
      min-width: 0;
    }
    .persona-storefront-header__chip {
      font: inherit;
      font-size: 12px;
      font-weight: 500;
      padding: 6px 12px;
      background: #ffffff;
      color: #1a1a1a;
      border: 1px solid #d4d2cc;
      border-radius: 999px;
      cursor: pointer;
      transition: background 150ms ease, color 150ms ease, border-color 150ms ease, transform 100ms ease;
    }
    .persona-storefront-header__chip:hover {
      background: #1a1a1a;
      color: #fff;
      border-color: #1a1a1a;
    }
    .persona-storefront-header__chip:active {
      transform: scale(0.97);
    }
    .persona-storefront-header__chip:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    @media (max-width: 540px) {
      .persona-storefront-header { padding: 22px 18px 16px; }
      .persona-storefront-header__title { font-size: 20px; }
      .persona-storefront-header__shopby { gap: 8px; }
    }
  `;
  document.head.appendChild(style);
};

const renderStorefrontHeader: SlotRenderer = () => {
  ensureStorefrontHeaderStyles();

  const header = document.createElement("section");
  header.className = "persona-storefront-header";
  header.setAttribute("aria-label", "Everspun storefront");
  // Intentionally NOT setting `data-persona-intro-card` — the widget's
  // `updateCopy()` queries that attribute and toggles `display: none` based
  // on `copy.showWelcomeCard`. Since we set `showWelcomeCard: false` to
  // suppress the default card, the slot replacement (this element) must not
  // carry that marker or it will be hidden along with the original card.

  header.innerHTML = `
    <div class="persona-storefront-header__top">
      <span class="persona-storefront-header__brand">EVERSPUN.</span>
    </div>
    <div class="persona-storefront-header__hero">
      <h2 class="persona-storefront-header__title">Welcome.</h2>
      <p class="persona-storefront-header__lede">
        Your private fitting room. Ask about fit, fabric, or pairings — or shop by category below.
      </p>
    </div>
    <div class="persona-storefront-header__shopby">
      <span class="persona-storefront-header__shopby-label">Shop by</span>
      <div class="persona-storefront-header__chips" role="list"></div>
    </div>
  `;

  const chipsContainer = header.querySelector<HTMLElement>(".persona-storefront-header__chips");
  if (chipsContainer) {
    STOREFRONT_HEADER_CATEGORIES.forEach((category) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "persona-storefront-header__chip";
      chip.setAttribute("role", "listitem");
      chip.textContent = category.label;
      chip.addEventListener("click", () => {
        if (!widgetHandle) return;
        const submitted = widgetHandle.submitMessage(category.query);
        if (submitted) {
          chip.disabled = true;
          window.setTimeout(() => {
            chip.disabled = false;
          }, 600);
        }
      });
      chipsContainer.appendChild(chip);
    });
  }

  return header;
};

// ============================================================================
// Cart drawer (slides in from the right)
// ============================================================================

const ensureDrawerStyles = () => {
  if (document.getElementById("storefront-drawer-styles")) return;
  const style = document.createElement("style");
  style.id = "storefront-drawer-styles";
  style.textContent = `
    .storefront-drawer-scrim {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.32);
      opacity: 0; pointer-events: none;
      transition: opacity 200ms ease;
      z-index: 100000;
    }
    .storefront-drawer-scrim.is-open { opacity: 1; pointer-events: auto; }
    .storefront-drawer {
      position: fixed; top: 0; right: 0; bottom: 0;
      width: min(380px, 92vw);
      background: #fafaf7;
      box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
      transform: translateX(100%);
      transition: transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
      z-index: 100001;
      display: flex; flex-direction: column;
      font-family: inherit;
    }
    .storefront-drawer.is-open { transform: translateX(0); }
    .storefront-drawer__header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid #e5e3dd;
    }
    .storefront-drawer__title {
      margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -0.01em;
    }
    .storefront-drawer__close {
      background: transparent; border: none; cursor: pointer;
      padding: 6px; color: #555; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
    }
    .storefront-drawer__close:hover { background: #efe9df; color: #1a1a1a; }
    .storefront-drawer__body {
      flex: 1; overflow-y: auto;
      padding: 16px 24px;
      display: flex; flex-direction: column; gap: 12px;
    }
    .storefront-drawer__empty {
      text-align: center; color: #888; padding: 40px 0;
      font-size: 14px;
    }
    .storefront-drawer-line {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 14px; background: #fff;
      border: 1px solid #e5e3dd; border-radius: 8px;
    }
    .storefront-drawer-line__title { font-size: 14px; color: #1a1a1a; font-weight: 500; }
    .storefront-drawer-line__qty { font-size: 12px; color: #777; margin-top: 2px; }
    .storefront-drawer-line__price { font-size: 14px; color: #1a1a1a; font-weight: 600; }
    .storefront-drawer-line__remove {
      background: transparent; border: none; cursor: pointer;
      padding: 4px; color: #aaa; display: flex;
    }
    .storefront-drawer-line__remove:hover { color: #b04545; }
    .storefront-drawer__footer {
      border-top: 1px solid #e5e3dd;
      padding: 16px 24px 24px;
    }
    .storefront-drawer__total {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: 14px;
    }
    .storefront-drawer__total-label { font-size: 14px; color: #555; }
    .storefront-drawer__total-value { font-size: 18px; font-weight: 600; color: #1a1a1a; }
    .storefront-drawer__checkout {
      width: 100%; padding: 14px 20px;
      background: #1a1a1a; color: #fff;
      border: none; border-radius: 999px;
      font: inherit; font-size: 14px; font-weight: 500;
      letter-spacing: 0.02em; cursor: pointer;
    }
    .storefront-drawer__checkout:hover { background: #000; }
    .storefront-drawer__checkout:disabled { opacity: 0.5; cursor: not-allowed; }
  `;
  document.head.appendChild(style);
};

const renderDrawerBody = (drawer: HTMLElement) => {
  const cart = getCart();
  const total = getCartTotal();
  const body = drawer.querySelector(".storefront-drawer__body");
  const footer = drawer.querySelector(".storefront-drawer__footer");
  if (!body || !footer) return;

  if (cart.length === 0) {
    body.innerHTML = `<p class="storefront-drawer__empty">Your bag is empty.</p>`;
    (footer as HTMLElement).style.display = "none";
    return;
  }

  body.innerHTML = cart.map((item) => `
    <div class="storefront-drawer-line">
      <div>
        <div class="storefront-drawer-line__title">${escapeHtml(item.title)}</div>
        <div class="storefront-drawer-line__qty">Qty ${item.quantity} · ${formatPrice(item.price)}</div>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <div class="storefront-drawer-line__price">${formatPrice(item.price * item.quantity)}</div>
        <button class="storefront-drawer-line__remove" data-remove-id="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.title)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
  `).join("");

  (footer as HTMLElement).style.display = "block";
  footer.innerHTML = `
    <div class="storefront-drawer__total">
      <span class="storefront-drawer__total-label">Total</span>
      <span class="storefront-drawer__total-value">${formatPrice(total)}</span>
    </div>
    <button class="storefront-drawer__checkout" id="storefront-checkout-btn">Proceed to checkout</button>
  `;

  body.querySelectorAll<HTMLElement>("[data-remove-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.removeId;
      if (id) removeFromCart(id);
    });
  });

  footer.querySelector<HTMLButtonElement>("#storefront-checkout-btn")?.addEventListener("click", () => {
    void startCheckout();
  });
};

const openDrawer = () => {
  ensureDrawerStyles();
  let scrim = document.getElementById("storefront-drawer-scrim");
  let drawer = document.getElementById("storefront-drawer");
  if (!scrim) {
    scrim = document.createElement("div");
    scrim.id = "storefront-drawer-scrim";
    scrim.className = "storefront-drawer-scrim";
    scrim.addEventListener("click", closeDrawer);
    document.body.appendChild(scrim);
  }
  if (!drawer) {
    drawer = document.createElement("aside");
    drawer.id = "storefront-drawer";
    drawer.className = "storefront-drawer";
    drawer.setAttribute("aria-label", "Shopping bag");
    drawer.innerHTML = `
      <div class="storefront-drawer__header">
        <h2 class="storefront-drawer__title">Your bag</h2>
        <button class="storefront-drawer__close" id="storefront-drawer-close" aria-label="Close bag">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="storefront-drawer__body"></div>
      <div class="storefront-drawer__footer"></div>
    `;
    document.body.appendChild(drawer);
    drawer.querySelector("#storefront-drawer-close")?.addEventListener("click", closeDrawer);
  }
  drawer.dataset.open = "true";
  renderDrawerBody(drawer);
  void drawer.offsetWidth;
  scrim.classList.add("is-open");
  drawer.classList.add("is-open");
};

const closeDrawer = () => {
  const drawer = document.getElementById("storefront-drawer");
  const scrim = document.getElementById("storefront-drawer-scrim");
  if (drawer) {
    drawer.dataset.open = "false";
    drawer.classList.remove("is-open");
  }
  if (scrim) scrim.classList.remove("is-open");
};

// ============================================================================
// Checkout
// ============================================================================

const startCheckout = async () => {
  const cart = getCart();
  if (cart.length === 0) return;
  const items = cart.map((item) => ({
    name: item.title,
    price: item.price,
    quantity: item.quantity,
  }));
  try {
    const response = await fetch(checkoutUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const data = await response.json();
    if (data.success && data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
      return;
    }
    showToast("Demo: configure STRIPE_SECRET_KEY to enable checkout.");
  } catch (error) {
    console.error("[Storefront] Checkout error:", error);
    showToast("Checkout unavailable in this demo.");
  }
};

// Handle return from Stripe (success/cancelled query params)
const handleCheckoutReturn = () => {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("checkout");
  if (!status) return;
  if (status === "success") {
    clearCart();
    showToast("Thank you for your order!");
  } else if (status === "cancelled") {
    showToast("Checkout cancelled — your bag is saved.");
  }
  params.delete("checkout");
  params.delete("session_id");
  const cleanQuery = params.toString();
  const url = `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}${window.location.hash}`;
  window.history.replaceState({}, "", url);
};

handleCheckoutReturn();

// ============================================================================
// Stream parser — extracts the displayable `text` field from agent JSON
// ============================================================================

const createStorefrontParser = (): AgentWidgetStreamParser => {
  return createFlexibleJsonStreamParser((parsed) => {
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    return null;
  });
};

// ============================================================================
// Action handler — agent-driven add-to-cart
// ============================================================================

const agentAddToCartHandler: AgentWidgetActionHandler = (action) => {
  if (action.type !== "add_to_cart") return;
  const payload = action.payload as Record<string, unknown>;
  const text = typeof payload.text === "string" ? payload.text : "";
  const item = payload.item as { id?: string; title?: string; price?: number } | undefined;
  if (item && item.id && item.title && typeof item.price === "number") {
    addToCart({ id: item.id, title: item.title, price: item.price });
    showToast(`Added ${item.title} to your bag.`);
  }
  return { handled: true, displayText: text };
};

// ============================================================================
// Page context provider — what the agent sees each turn
// ============================================================================

const pageContextProvider = () => {
  const cart = getCart();
  return {
    current_product: HERO_PRODUCT,
    cart:
      cart.length > 0
        ? {
            items: cart.map((i) => ({
              id: i.id,
              title: i.title,
              price: i.price,
              quantity: i.quantity,
            })),
            total: formatPrice(getCartTotal()),
            item_count: getCartCount(),
          }
        : null,
  };
};

// ============================================================================
// Static page wiring (hero "Add to bag" button + topbar bag link)
// ============================================================================

const wireStaticPage = () => {
  const heroAdd = document.querySelector<HTMLButtonElement>(".add-to-bag");
  heroAdd?.addEventListener("click", () => {
    addToCart(HERO_PRODUCT);
    heroAdd.textContent = "Added to bag";
    window.setTimeout(() => {
      heroAdd.textContent = "Add to bag";
    }, 1400);
  });

  document.querySelectorAll<HTMLAnchorElement>(".topbar__nav a").forEach((link) => {
    if (link.textContent?.startsWith("Bag")) {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        openDrawer();
      });
    }
  });

  syncBagUI();
};

wireStaticPage();

// ============================================================================
// Widget config
// ============================================================================

const config: AgentWidgetConfig = {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl,
  persistState: true,
  clearChatHistoryStorageKey: CHAT_STORAGE_KEY,
  storageAdapter: createLocalStorageAdapter(CHAT_STORAGE_KEY),
  streamParser: createStorefrontParser,
  actionHandlers: [
    defaultActionHandlers.message,
    agentAddToCartHandler,
  ],
  contextProviders: [pageContextProvider],
  // Storefront flow expects context as `inputs` (matches bakery convention)
  requestMiddleware: ({ payload }) => {
    if (!payload.context) return payload;
    return {
      ...payload,
      inputs: payload.context,
      context: undefined,
    } as AgentWidgetRequestPayload & { inputs?: Record<string, unknown> };
  },
  // Rounds the composer send/mic controls (`--persona-button-radius`).
  theme: {
    components: {
      button: {
        primary: {
          borderRadius: "palette.radius.full",
        },
      },
    },
  },
  launcher: {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    mountMode: "composer-bar",
    composerBar: {
      expandOnSubmit: true,
      expandedSize: "anchored",
      bottomOffset: "16px",
      // The peek banner (collapsed-state preview above the pill) accepts the
      // same `streamAnimation` shape as `features.streamAnimation`. Omit
      // `peek` entirely to inherit; uncomment below to give the peek its own
      // animation tuning that differs from the main bubble.
      //
      // peek: {
      //   streamAnimation: {
      //     type: "letter-rise",
      //     speed: 60,
      //   },
      // },
    },
    title: "Everspun Concierge",
    subtitle: "Ask anything about this product",
    closeButtonTooltipText: "Minimize",
    clearChat: {
      ...DEFAULT_WIDGET_CONFIG.launcher?.clearChat,
      tooltipText: "Start over",
    },
  },
  features: {
    ...DEFAULT_WIDGET_CONFIG.features,
    // word-fade on the main bubble — and, by inheritance, on the peek
    // ticker above the collapsed pill. Devs configure animations in one
    // place and both surfaces render with matching cadence. `buffer: "line"`
    // holds back each line until its trailing newline arrives, then the
    // line's words fade up together; `placeholder: "skeleton"` shows a
    // shimmer between line completions so the peek doesn't go visibly
    // empty mid-stream.
    streamAnimation: {
      type: "word-fade",
      speed: 80,
      buffer: "line",
      placeholder: "skeleton",
    },
  },
  voiceRecognition: { enabled: true },
  attachments: { enabled: true },
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    // The default welcome card is replaced by the storefront header rendered
    // via `layout.slots["body-top"]` below. Hide the built-in card so it
    // doesn't briefly flash before the slot renderer runs.
    showWelcomeCard: false,
    welcomeTitle: "Hi 👋",
    welcomeSubtitle:
      "Ask about fit, fabric, or care — or browse the catalog (\"show me cashmere essentials\", \"what pants would go with this?\").",
    inputPlaceholder: "Ask about this product or browse the catalog...",
  },
  layout: {
    ...DEFAULT_WIDGET_CONFIG.layout,
    slots: {
      ...DEFAULT_WIDGET_CONFIG.layout?.slots,
      "body-top": renderStorefrontHeader,
    },
  },
  suggestionChips: [
    "Show me cashmere essentials",
    "What pants would go with this?",
    "Show me everything under $200",
    "I need a gift under $300",
  ],
  postprocessMessage: ({ text }) => markdownPostprocessor(text),
};

widgetHandle = initAgentWidget({
  target: "#persona-host",
  config,
});
