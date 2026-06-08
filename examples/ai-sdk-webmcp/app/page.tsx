"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createAgentExperience } from "@runtypelabs/persona";
import { CATALOG, COLOR_HEX, type CatalogProduct } from "./lib/catalog";
import {
  cartSummary,
  money,
  shopStore,
  type ShopState,
} from "./lib/store";
import { registerStorefrontTools } from "./lib/webmcp-tools";
import { buildWidgetConfig } from "./lib/widget";

const EMPTY_STATE: ShopState = {
  cart: [],
  promo: null,
  hits: [],
  flash: null,
  cartFlashNonce: 0,
  wire: [],
};

function useShop(): ShopState {
  return useSyncExternalStore(
    shopStore.subscribe,
    shopStore.getSnapshot,
    () => EMPTY_STATE, // server snapshot (storefront is client-driven)
  );
}

// Restart a CSS flash animation each time `nonce` changes.
function useFlash(nonce: number): boolean {
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (!nonce) return;
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), 900);
    return () => clearTimeout(t);
  }, [nonce]);
  return flashing;
}

function ProductCard({
  product,
  isHit,
  quantity,
  flashNonce,
}: {
  product: CatalogProduct;
  isHit: boolean;
  quantity: number;
  flashNonce: number;
}) {
  const flashing = useFlash(flashNonce);
  const swatch = COLOR_HEX[product.color.toLowerCase()] ?? "#9ca3af";
  const classes = [
    "shop-product",
    isHit ? "is-hit" : "",
    quantity > 0 ? "in-cart" : "",
    flashing ? "just-changed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <article className={classes} data-sku={product.sku}>
      <span className="shop-incart-badge">{quantity > 0 ? quantity : ""}</span>
      <div className="shop-product-top">
        <span className="shop-swatch" style={{ background: swatch }} />
        <span className="shop-product-cat">{product.category}</span>
      </div>
      <div className="shop-product-title">{product.title}</div>
      <div className="shop-product-sub">
        {product.brand} · {product.color}
      </div>
      <div className="shop-product-foot">
        <span className="shop-product-price">{money(product.price)}</span>
        <span className="shop-product-sku">{product.sku}</span>
      </div>
    </article>
  );
}

function Cart({ state }: { state: ShopState }) {
  const flashing = useFlash(state.cartFlashNonce);
  const summary = cartSummary();
  const className = `shop-cart${flashing ? " just-changed" : ""}`;

  if (summary.items.length === 0) {
    return (
      <div className={className}>
        <p className="shop-cart-empty">
          Your cart is empty — ask the assistant to add something.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <ul className="shop-cart-lines">
        {state.cart.map((line) => (
          <li className="shop-cart-line" key={line.sku}>
            <span className="shop-cart-qty">{line.quantity}×</span>
            <span className="shop-cart-title">{line.title}</span>
            <span className="shop-cart-sku">{line.sku}</span>
            <span className="shop-cart-price">
              {money(line.price * line.quantity)}
            </span>
          </li>
        ))}
      </ul>
      <div className="shop-cart-foot">
        <div className="shop-cart-row muted">
          <span>Subtotal</span>
          <span>{money(summary.subtotal)}</span>
        </div>
        {state.promo && (
          <div className="shop-cart-row promo">
            <span>
              <span className="shop-cart-chip">{state.promo.code}</span>{" "}
              {state.promo.label}
            </span>
            <span>−{money(summary.discount)}</span>
          </div>
        )}
        <div className="shop-cart-row total">
          <span>
            {summary.itemCount} item{summary.itemCount === 1 ? "" : "s"}
          </span>
          <strong>{money(summary.total)}</strong>
        </div>
      </div>
    </div>
  );
}

const WIRE_LEGEND: Array<{ varName: string; label: string }> = [
  { varName: "--wire-reg", label: "register" },
  { varName: "--wire-send", label: "dispatch · clientTools[]" },
  { varName: "--wire-gate", label: "approval gate" },
  { varName: "--wire-exec", label: "page exec" },
  { varName: "--wire-resume", label: "batched /resume" },
];

export default function Home() {
  const state = useShop();
  const cartQty = new Map(state.cart.map((l) => [l.sku, l.quantity]));
  const widgetRef = useRef<HTMLDivElement | null>(null);

  // Register page tools + mount the Persona widget once on the client.
  useEffect(() => {
    registerStorefrontTools();
    if (!widgetRef.current) return;
    const controller = createAgentExperience(widgetRef.current, buildWidgetConfig());
    return () => controller.destroy();
  }, []);

  return (
    <main className="stage">
      <aside className="stage-controls">
        <header className="shop-hero">
          <h1 className="shop-wordmark">
            <span className="shop-mark" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 17l5-9 4 6 2-3 5 6" />
              </svg>
            </span>
            Switchback
          </h1>
          <p className="shop-tagline">Trail &amp; road running, outfitted.</p>
          <p className="shop-explainer">
            This storefront publishes its own page tools through{" "}
            <code>document.modelContext.registerTool()</code>. Persona snapshots
            them on every turn, ships them as <code>clientTools[]</code> to a{" "}
            <strong>direct Vercel AI SDK backend</strong> (no Runtype), and when
            the agent calls one the widget runs it <em>here on the page</em> and
            posts the result back via <code>/resume</code>. Ask the assistant →
            and watch the catalog, cart, and wire log react.
          </p>
        </header>

        <section className="shop-section">
          <div className="shop-section-head">
            <h2 className="shop-section-title">Catalog</h2>
            <span className="shop-section-meta">{CATALOG.length} products</span>
          </div>
          <div className="shop-catalog">
            {CATALOG.map((product) => (
              <ProductCard
                key={product.sku}
                product={product}
                isHit={state.hits.includes(product.sku)}
                quantity={cartQty.get(product.sku) ?? 0}
                flashNonce={
                  state.flash?.sku === product.sku ? state.flash.nonce : 0
                }
              />
            ))}
          </div>
        </section>

        <section className="shop-section">
          <div className="shop-section-head">
            <h2 className="shop-section-title">Cart</h2>
            <span className="shop-section-meta">
              {(() => {
                const s = cartSummary();
                return s.itemCount > 0
                  ? `${s.itemCount} item${s.itemCount === 1 ? "" : "s"}`
                  : "";
              })()}
            </span>
          </div>
          <Cart state={state} />
        </section>

        <section className="shop-section">
          <details className="shop-wire" open>
            <summary className="shop-wire-head">
              WebMCP wire log
              <span className="shop-wire-count">
                {state.wire.length} event{state.wire.length === 1 ? "" : "s"}
              </span>
            </summary>
            <div className="shop-wire-body">
              {state.wire.length === 0 ? (
                <div className="shop-wire-empty">
                  No events yet — ask the assistant something.
                </div>
              ) : (
                state.wire.map((ev) => (
                  <div className={`wire-row ${ev.kind}`} key={ev.id}>
                    <span className="wire-time">{ev.time}</span>
                    <span className="wire-detail">
                      <span className="wire-tag">{ev.tag}</span>{" "}
                      <span
                        dangerouslySetInnerHTML={{ __html: ev.detailHtml }}
                      />
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="shop-wire-legend" aria-hidden="true">
              {WIRE_LEGEND.map((l) => (
                <span key={l.label}>
                  <i style={{ background: `var(${l.varName})` }} />
                  {l.label}
                </span>
              ))}
            </div>
          </details>
        </section>

        <section className="shop-section shop-notes">
          <div className="shop-section-head">
            <h2 className="shop-section-title">Try it</h2>
          </div>
          <ol>
            <li>
              <strong>Browse (read-only):</strong>{" "}
              <em>“find a waterproof trail shoe under $170”</em> →{" "}
              <code>search_products</code> auto-approves; matching cards light up.
            </li>
            <li>
              <strong>Inspect (read-only):</strong>{" "}
              <em>“tell me about SHOE-005”</em> → <code>view_product</code>; the
              card flashes.
            </li>
            <li>
              <strong>Parallel (the headline):</strong>{" "}
              <em>“add SHOE-001 and SHOE-007 at the same time”</em> → two{" "}
              <code>add_to_cart</code> calls, each with its own approval bubble,
              batched into a single <code>/resume</code>.
            </li>
            <li>
              <strong>Promo:</strong>{" "}
              <em>“apply code TRAIL10 and show my cart total”</em> →{" "}
              <code>apply_promo</code>, gated; the discount line appears.
            </li>
          </ol>
        </section>
      </aside>

      <div className="stage-widget">
        <div ref={widgetRef} />
      </div>
    </main>
  );
}
