// Shared storefront state for the Switchback demo.
//
// In the vanilla embedded-app demo the WebMCP tools mutated the DOM directly.
// Here the tools live outside React (registered on `document.modelContext`), so
// they instead mutate this tiny observable store and the React storefront
// subscribes via `useSyncExternalStore`. This is the only structural change
// from the original demo — the cart math, promo logic, and search highlighting
// behave identically.

import {
  type CatalogProduct,
  PROMOS,
} from "./catalog";

export interface CartLine {
  sku: string;
  title: string;
  price: number;
  quantity: number;
}

export type WireKind = "reg" | "send" | "gate" | "exec" | "resume";

export interface WireEvent {
  id: number;
  kind: WireKind;
  tag: string;
  /** Pre-escaped HTML fragment (callers escape dynamic values). */
  detailHtml: string;
  time: string;
}

export interface ShopState {
  cart: CartLine[];
  promo: { code: string; rate: number; label: string } | null;
  /** SKUs highlighted by the last search_products / view_product call. */
  hits: string[];
  /** Last single card to change — `nonce` restarts the flash animation. */
  flash: { sku: string; nonce: number } | null;
  /** Bumped whenever the cart card should flash. */
  cartFlashNonce: number;
  /** Wire-log events, newest first. */
  wire: WireEvent[];
}

export interface CartSummary {
  items: Array<{ sku: string; title: string; quantity: number; lineTotal: number }>;
  itemCount: number;
  subtotal: number;
  discount: number;
  total: number;
  promoCode: string | null;
}

// ---------------------------------------------------------------------------
// Store internals
// ---------------------------------------------------------------------------

const cart = new Map<string, CartLine>();
let promo: ShopState["promo"] = null;
let hits: string[] = [];
let flash: ShopState["flash"] = null;
let cartFlashNonce = 0;
let wire: WireEvent[] = [];

let nonceSeq = 0;
let wireSeq = 0;

let snapshot: ShopState = buildSnapshot();
const listeners = new Set<() => void>();

function buildSnapshot(): ShopState {
  return {
    cart: [...cart.values()],
    promo,
    hits,
    flash,
    cartFlashNonce,
    wire,
  };
}

function emit(): void {
  snapshot = buildSnapshot();
  listeners.forEach((l) => l());
}

export const shopStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): ShopState {
    return snapshot;
  },
};

// ---------------------------------------------------------------------------
// Mutations — called by the WebMCP tool execute()s in webmcp-tools.ts
// ---------------------------------------------------------------------------

export function cartSummary(): CartSummary {
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
}

export function highlightHits(skus: string[]): void {
  hits = skus;
  emit();
}

export function flashCard(sku: string): void {
  flash = { sku, nonce: ++nonceSeq };
  emit();
}

export function flashCart(): void {
  cartFlashNonce += 1;
  emit();
}

export function addToCart(product: CatalogProduct, quantity: number): void {
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
  flashCard(product.sku);
  flashCart();
}

export function getCartLine(sku: string): CartLine | undefined {
  return cart.get(sku);
}

export function setCartLineQuantity(sku: string, quantity: number): void {
  const line = cart.get(sku);
  if (line) line.quantity = quantity;
  emit();
}

export function deleteCartLine(sku: string): void {
  cart.delete(sku);
  emit();
}

export function applyPromo(code: string): { rate: number; label: string } | null {
  const key = code.trim().toUpperCase();
  const match = PROMOS[key];
  if (!match) return null;
  promo = { code: key, rate: match.rate, label: match.label };
  flashCart();
  return match;
}

export function logWire(kind: WireKind, tag: string, detailHtml: string): void {
  const event: WireEvent = {
    id: ++wireSeq,
    kind,
    tag,
    detailHtml,
    time: new Date().toLocaleTimeString(),
  };
  // newest first, cap to a sane length
  wire = [event, ...wire].slice(0, 100);
  emit();
}

/** Minimal HTML escaper — wire-log details mix static + agent-supplied text. */
export const esc = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string,
  );

export const money = (n: number): string => `$${n.toFixed(2)}`;
