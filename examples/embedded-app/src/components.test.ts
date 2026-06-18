// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";

import { ProductCard } from "./components";
import { getUserAction } from "./user-action-store";

const renderProductCard = () =>
  ProductCard(
    {
      id: "cashmere-crewneck",
      title: "Cashmere Crewneck",
      price: 248,
      description: "Soft cashmere sweater",
    },
    {
      message: { id: "message-product-card" },
      config: {},
      updateProps: vi.fn(),
    } as never,
  );

describe("ProductCard", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  test("records an add-to-cart action and shows the added state", () => {
    const events: unknown[] = [];
    window.addEventListener("persona:demo-cart:add", (event) => {
      events.push((event as CustomEvent).detail);
    });

    const card = renderProductCard();
    const button = card.querySelector("button");

    expect(button?.textContent).toBe("Add to Cart");

    button?.click();

    expect(button?.textContent).toBe("Added");
    expect(button?.getAttribute("aria-pressed")).toBe("true");
    expect(getUserAction("message-product-card")).toMatchObject({
      type: "add_to_cart",
      data: {
        id: "cashmere-crewneck",
        title: "Cashmere Crewneck",
        price: 248,
      },
    });
    expect(events).toEqual([
      {
        id: "cashmere-crewneck",
        title: "Cashmere Crewneck",
        price: 248,
      },
    ]);
  });

  test("restores the added state after the component rerenders", () => {
    renderProductCard().querySelector("button")?.click();

    const rerendered = renderProductCard();
    const button = rerendered.querySelector("button");

    expect(button?.textContent).toBe("Added");
    expect(button?.getAttribute("aria-pressed")).toBe("true");
  });
});
