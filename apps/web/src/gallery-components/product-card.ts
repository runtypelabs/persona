import type { ComponentRenderer } from "@runtypelabs/persona";

import { getUserAction, setUserAction } from "../user-action-store";
import type { GalleryComponent } from "./types";

/**
 * ProductCard — displays product information with an interactive "Add to Cart"
 * button. Shows the two things that make a component feel real:
 *
 *   1. It handles a click (adds to cart, swaps the button to "Added").
 *   2. It persists that action via the demo's `userAction` store, keyed by the
 *      assistant message id, so the "Added" state survives transcript re-renders
 *      and page reloads. It also emits a `persona:demo-cart:add` DOM event the
 *      host page can listen to.
 */
export const ProductCard: ComponentRenderer = (props, context) => {
  const card = document.createElement("div");
  card.className = "product-card";
  card.style.cssText = `
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 1.5rem;
    background: white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    max-width: 400px;
    margin: 1rem 0;
  `;

  const title = String(props.title || "Product Name");
  const price = typeof props.price === "number" ? props.price : 0;
  const id = String(props.id || title.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  const image = String(props.image || "");
  const description = String(props.description || "");
  const messageId = context.message?.id || `product-card-${id}`;
  const previousAction = getUserAction<{ id: string; title: string; price: number }>(messageId);
  const isAdded = previousAction?.type === "add_to_cart";

  card.innerHTML = `
    ${image ? `<img src="${image}" alt="${title}" style="width: 100%; height: 200px; object-fit: cover; border-radius: 4px; margin-bottom: 1rem;" />` : ""}
    <h3 style="margin: 0 0 0.5rem 0; color: #333; font-size: 1.25rem;">${title}</h3>
    ${description ? `<p style="margin: 0 0 1rem 0; color: #666; font-size: 0.9rem;">${description}</p>` : ""}
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span style="font-size: 1.5rem; font-weight: bold; color: #2196f3;">$${price.toFixed(2)}</span>
      <button style="
        background: ${isAdded ? "#4caf50" : "#2196f3"};
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.9rem;
      " aria-pressed="${isAdded ? "true" : "false"}">${isAdded ? "Added" : "Add to Cart"}</button>
    </div>
  `;

  const button = card.querySelector<HTMLButtonElement>("button");
  button?.addEventListener("click", () => {
    const item = { id, title, price };
    setUserAction(messageId, {
      type: "add_to_cart",
      data: item,
    });
    button.textContent = "Added";
    button.setAttribute("aria-pressed", "true");
    button.style.background = "#4caf50";
    window.dispatchEvent(
      new CustomEvent("persona:demo-cart:add", {
        detail: item,
      }),
    );
  });

  return card;
};

const productCard: GalleryComponent = {
  name: "ProductCard",
  label: "Product card",
  renderer: ProductCard,
  sample: {
    text: "Preview: a streamed ProductCard component.",
    props: {
      id: "cashmere-crewneck",
      title: "Mongolian Cashmere Crewneck",
      price: 248,
      description: "A soft product card rendered from a JSON component directive.",
      image: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=600&h=750&fit=crop",
    },
  },
};

export default productCard;
