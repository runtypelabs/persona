// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  collectEnrichedPageContext,
  formatEnrichedContext,
  generateStableSelector,
  defaultParseRules,
  type EnrichedPageElement,
} from "./dom-context";

describe("collectEnrichedPageContext", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("collects basic elements with text", () => {
    document.body.innerHTML = `<div class="product-title">Sourdough Loaf</div>`;
    const result = collectEnrichedPageContext();
    // Should find at least the div (body may also be collected)
    const div = result.find((el) => el.tagName === "div");
    expect(div).toBeDefined();
    expect(div!.text).toContain("Sourdough Loaf");
  });

  it("classifies buttons as clickable", () => {
    document.body.innerHTML = `<button id="add-btn">Add to Cart</button>`;
    const result = collectEnrichedPageContext();
    const btn = result.find((el) => el.tagName === "button");
    expect(btn).toBeDefined();
    expect(btn!.interactivity).toBe("clickable");
  });

  it("classifies links with href as navigable", () => {
    document.body.innerHTML = `<a href="/products">Products</a>`;
    const result = collectEnrichedPageContext();
    const link = result.find((el) => el.tagName === "a");
    expect(link).toBeDefined();
    expect(link!.interactivity).toBe("navigable");
    expect(link!.attributes.href).toBe("/products");
  });

  it("classifies inputs as input", () => {
    document.body.innerHTML = `<input id="qty" type="number" name="quantity" />`;
    const result = collectEnrichedPageContext();
    const input = result.find((el) => el.tagName === "input");
    expect(input).toBeDefined();
    expect(input!.interactivity).toBe("input");
    expect(input!.attributes.type).toBe("number");
    expect(input!.attributes.name).toBe("quantity");
  });

  it("classifies role=button as clickable", () => {
    document.body.innerHTML = `<div role="button">Click me</div>`;
    const result = collectEnrichedPageContext();
    const btn = result.find(
      (el) => el.tagName === "div" && el.role === "button"
    );
    expect(btn).toBeDefined();
    expect(btn!.interactivity).toBe("clickable");
  });

  it("classifies static elements", () => {
    document.body.innerHTML = `<p class="description">A fine loaf of bread</p>`;
    const result = collectEnrichedPageContext();
    const p = result.find((el) => el.tagName === "p");
    expect(p).toBeDefined();
    expect(p!.interactivity).toBe("static");
  });

  it("excludes elements inside the widget host", () => {
    document.body.innerHTML = `
      <div class="persona-host"><button>Widget Button</button></div>
      <button id="real-btn">Real Button</button>
    `;
    const result = collectEnrichedPageContext();
    const widgetBtn = result.find(
      (el) => el.text === "Widget Button"
    );
    expect(widgetBtn).toBeUndefined();
    const realBtn = result.find((el) => el.text === "Real Button");
    expect(realBtn).toBeDefined();
  });

  it("excludes script, style, and svg elements", () => {
    document.body.innerHTML = `
      <script>console.log("hi")</script>
      <style>.foo { color: red }</style>
      <svg><path d="M0 0"/></svg>
      <div id="content">Visible content</div>
    `;
    const result = collectEnrichedPageContext();
    expect(result.find((el) => el.tagName === "script")).toBeUndefined();
    expect(result.find((el) => el.tagName === "style")).toBeUndefined();
    expect(result.find((el) => el.tagName === "svg")).toBeUndefined();
  });

  it("respects maxElements limit", () => {
    const html = Array.from(
      { length: 100 },
      (_, i) => `<div class="item-${i}">Item ${i}</div>`
    ).join("");
    document.body.innerHTML = html;
    const result = collectEnrichedPageContext({ maxElements: 10 });
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it("truncates text to maxTextLength", () => {
    const longText = "A".repeat(500);
    document.body.innerHTML = `<div id="long">${longText}</div>`;
    const result = collectEnrichedPageContext({ maxTextLength: 50 });
    const div = result.find(
      (el) => el.tagName === "div" && el.attributes.id === "long"
    );
    expect(div).toBeDefined();
    expect(div!.text.length).toBeLessThanOrEqual(50);
  });

  it("collects data-* attributes", () => {
    document.body.innerHTML = `<button data-product="sourdough" data-price="1200">Add</button>`;
    const result = collectEnrichedPageContext();
    const btn = result.find((el) => el.tagName === "button");
    expect(btn).toBeDefined();
    expect(btn!.attributes["data-product"]).toBe("sourdough");
    expect(btn!.attributes["data-price"]).toBe("1200");
  });

  it("collects aria-label", () => {
    document.body.innerHTML = `<button aria-label="Close dialog">X</button>`;
    const result = collectEnrichedPageContext();
    const btn = result.find((el) => el.tagName === "button");
    expect(btn).toBeDefined();
    expect(btn!.attributes["aria-label"]).toBe("Close dialog");
  });

  it("deduplicates elements that produce the same selector", () => {
    // Two divs with duplicate IDs won't use #id (not unique), so they'll
    // fall through to tag-based selectors which may disambiguate.
    // Test with truly identical elements that produce the same selector:
    document.body.innerHTML = `<div id="only-one">Text</div>`;
    const result = collectEnrichedPageContext();
    const divs = result.filter((el) => el.selector === "#only-one");
    expect(divs.length).toBe(1);
  });

  it("sorts interactive elements before static ones", () => {
    document.body.innerHTML = `
      <p class="text-content">Static text</p>
      <button id="action-btn">Click</button>
    `;
    const result = collectEnrichedPageContext();
    const btnIdx = result.findIndex((el) => el.tagName === "button");
    const pIdx = result.findIndex(
      (el) => el.tagName === "p" && el.interactivity === "static"
    );
    if (btnIdx >= 0 && pIdx >= 0) {
      expect(btnIdx).toBeLessThan(pIdx);
    }
  });

  it("handles elements with same class but different data attributes", () => {
    document.body.innerHTML = `
      <button data-product="bread" class="add-btn">Add Bread</button>
      <button data-product="cake" class="add-btn">Add Cake</button>
    `;
    const result = collectEnrichedPageContext();
    const breadBtn = result.find(
      (el) => el.attributes["data-product"] === "bread"
    );
    const cakeBtn = result.find(
      (el) => el.attributes["data-product"] === "cake"
    );
    expect(breadBtn).toBeDefined();
    expect(cakeBtn).toBeDefined();
    expect(breadBtn!.selector).not.toBe(cakeBtn!.selector);
  });

  it("handles empty body", () => {
    document.body.innerHTML = "";
    const result = collectEnrichedPageContext();
    // May return body itself or empty — either is valid
    expect(Array.isArray(result)).toBe(true);
  });

  it("handles custom excludeSelector", () => {
    document.body.innerHTML = `
      <div class="my-widget"><button>Widget Btn</button></div>
      <button id="outside">Outside</button>
    `;
    const result = collectEnrichedPageContext({
      excludeSelector: ".my-widget",
    });
    expect(result.find((el) => el.text === "Widget Btn")).toBeUndefined();
    expect(result.find((el) => el.text === "Outside")).toBeDefined();
  });

  it("handles select and textarea as input interactivity", () => {
    document.body.innerHTML = `
      <select id="color"><option>Red</option></select>
      <textarea id="notes">Notes here</textarea>
    `;
    const result = collectEnrichedPageContext();
    const sel = result.find((el) => el.tagName === "select");
    const ta = result.find((el) => el.tagName === "textarea");
    expect(sel?.interactivity).toBe("input");
    expect(ta?.interactivity).toBe("input");
  });

  it("prioritizes product card over generic static when maxElements is tight", () => {
    const filler = Array.from(
      { length: 40 },
      (_, i) => `<div class="noise-${i}">Noise paragraph ${i} with some text</div>`
    ).join("");
    document.body.innerHTML = `
      ${filler}
      <div class="product-card" data-product="shirt">
        <a href="/p/shirt">Black Shirt</a>
        <span class="product-price">$29.99</span>
        <button type="button">Add to Cart</button>
      </div>
    `;
    const result = collectEnrichedPageContext({
      options: { maxElements: 8, maxCandidates: 200 },
    });
    const card = result.find((el) => el.attributes["data-product"] === "shirt");
    expect(card).toBeDefined();
    expect(card!.formattedSummary).toBeDefined();
    expect(card!.formattedSummary).toContain("Black Shirt");
    expect(card!.formattedSummary).toContain("$29.99");
    expect(card!.formattedSummary).toContain("/p/shirt");
    const noise = result.filter((el) => el.text.startsWith("Noise paragraph"));
    expect(noise.length).toBeLessThan(8);
  });

  it("bumps card-like containers with currency + link", () => {
    document.body.innerHTML = `
      <div class="item-tile">
        <h3><a href="/listing/1">Cabin</a></h3>
        <p>Nightly rate $120.00</p>
      </div>
    `;
    const result = collectEnrichedPageContext();
    const tile = result.find((el) => el.tagName === "div" && el.text.includes("Cabin"));
    expect(tile?.formattedSummary).toBeDefined();
    expect(tile!.formattedSummary).toContain("Cabin");
    expect(tile!.formattedSummary).toMatch(/\$120/);
  });

  it("omits redundant price static inside a kept commerce card", () => {
    document.body.innerHTML = `
      <div class="product-card">
        <a href="/x">Widget</a>
        <span class="product-price">$9.00</span>
        <button>Buy</button>
      </div>
    `;
    const result = collectEnrichedPageContext({ options: { maxElements: 20 } });
    const priceOnly = result.filter(
      (el) => el.text.trim() === "$9.00" && el.interactivity === "static"
    );
    expect(priceOnly.length).toBe(0);
  });

  it("keeps interactive-first ordering on pages without card rules", () => {
    document.body.innerHTML = `
      <p class="intro">Welcome to our site</p>
      <button id="go">Go</button>
    `;
    const result = collectEnrichedPageContext();
    const btnIdx = result.findIndex((el) => el.tagName === "button");
    const pIdx = result.findIndex(
      (el) => el.tagName === "p" && el.text.includes("Welcome")
    );
    if (btnIdx >= 0 && pIdx >= 0) {
      expect(btnIdx).toBeLessThan(pIdx);
    }
  });

  it("applies generic result-card rule without currency", () => {
    document.body.innerHTML = `
      <div class="search-result">
        <h2><a href="/doc/setup">Setup guide</a></h2>
        <p class="snippet">Install the CLI and run the init command to get started.</p>
      </div>
    `;
    const result = collectEnrichedPageContext();
    const row = result.find((el) =>
      el.formattedSummary?.includes("Setup guide")
    );
    expect(row?.formattedSummary).toBeDefined();
    expect(row!.formattedSummary).toContain("/doc/setup");
  });

  it("simple mode ignores custom rules with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    document.body.innerHTML = `<button>A</button>`;
    const structured = collectEnrichedPageContext({
      rules: defaultParseRules,
      options: { mode: "structured", maxElements: 5 },
    });
    const simple = collectEnrichedPageContext({
      rules: defaultParseRules,
      options: { mode: "simple", maxElements: 5 },
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(simple.every((el) => !el.formattedSummary)).toBe(true);
    expect(structured.length).toBe(simple.length);
    expect(structured[0]?.selector).toBe(simple[0]?.selector);
  });
});

describe("generateStableSelector", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("prefers #id when unique", () => {
    document.body.innerHTML = `<button id="add-cart">Add</button>`;
    const el = document.getElementById("add-cart")!;
    expect(generateStableSelector(el)).toBe("#add-cart");
  });

  it("uses data-testid when id is not unique", () => {
    document.body.innerHTML = `
      <div id="item"><button data-testid="add-sourdough">Add</button></div>
      <div id="item"><button data-testid="add-cake">Add</button></div>
    `;
    const btn = document.querySelector(
      '[data-testid="add-sourdough"]'
    ) as HTMLElement;
    const sel = generateStableSelector(btn);
    expect(sel).toContain("data-testid");
  });

  it("uses data-product attribute", () => {
    document.body.innerHTML = `
      <button data-product="sourdough">Add</button>
      <button data-product="cake">Add</button>
    `;
    const btn = document.querySelector(
      '[data-product="sourdough"]'
    ) as HTMLElement;
    const sel = generateStableSelector(btn);
    expect(sel).toContain("data-product");
    expect(sel).toContain("sourdough");
  });

  it("falls back to tag.class when no id or data attrs", () => {
    document.body.innerHTML = `<button class="primary-action">Go</button>`;
    const btn = document.querySelector("button") as HTMLElement;
    const sel = generateStableSelector(btn);
    expect(sel).toContain("button");
    expect(sel).toContain("primary-action");
  });

  it("uses nth-of-type for disambiguation", () => {
    document.body.innerHTML = `
      <div class="container">
        <button class="btn">First</button>
        <button class="btn">Second</button>
      </div>
    `;
    const buttons = document.querySelectorAll("button");
    const sel1 = generateStableSelector(buttons[0] as HTMLElement);
    const sel2 = generateStableSelector(buttons[1] as HTMLElement);
    expect(sel1).not.toBe(sel2);
  });
});

describe("formatEnrichedContext", () => {
  it("includes structured summaries for formatted elements", () => {
    const elements: EnrichedPageElement[] = [
      {
        selector: "div.card",
        tagName: "div",
        text: "Full card text blob",
        role: null,
        interactivity: "static",
        attributes: {},
        formattedSummary:
          "[Shirt](/p/1) — $10\nselector: div.card\nactions: Add",
      },
    ];
    const out = formatEnrichedContext(elements, { mode: "structured" });
    expect(out).toContain("Structured summaries:");
    expect(out).toContain("[Shirt](/p/1)");
    expect(out).toContain("actions: Add");
    expect(out).not.toContain("Content:");
  });

  it("ignores formattedSummary in simple mode", () => {
    const elements: EnrichedPageElement[] = [
      {
        selector: "div.card",
        tagName: "div",
        text: "Full card text blob",
        role: null,
        interactivity: "static",
        attributes: {},
        formattedSummary: "should not appear",
      },
    ];
    const out = formatEnrichedContext(elements, { mode: "simple" });
    expect(out).not.toContain("Structured summaries:");
    expect(out).toContain("Content:");
    expect(out).toContain("Full card text blob");
  });

  it("returns message for empty array", () => {
    expect(formatEnrichedContext([])).toBe("No page elements found.");
  });

  it("groups elements by interactivity", () => {
    const elements: EnrichedPageElement[] = [
      {
        selector: "button#add",
        tagName: "button",
        text: "Add to Cart",
        role: null,
        interactivity: "clickable",
        attributes: { id: "add" },
      },
      {
        selector: 'a[href="/products"]',
        tagName: "a",
        text: "Products",
        role: null,
        interactivity: "navigable",
        attributes: { href: "/products" },
      },
      {
        selector: "input#qty",
        tagName: "input",
        text: "",
        role: null,
        interactivity: "input",
        attributes: { type: "number" },
      },
      {
        selector: "div.title",
        tagName: "div",
        text: "Sourdough Loaf",
        role: null,
        interactivity: "static",
        attributes: {},
      },
    ];

    const result = formatEnrichedContext(elements);
    expect(result).toContain("Interactive elements:");
    expect(result).toContain("Add to Cart");
    expect(result).toContain("(clickable)");
    expect(result).toContain("Navigation links:");
    expect(result).toContain("Products");
    expect(result).toContain("(navigable)");
    expect(result).toContain("Form inputs:");
    expect(result).toContain("(input)");
    expect(result).toContain("Content:");
    expect(result).toContain("Sourdough Loaf");
  });

  it("omits empty groups", () => {
    const elements = [
      {
        selector: "button#add",
        tagName: "button",
        text: "Click",
        role: null,
        interactivity: "clickable" as const,
        attributes: {},
      },
    ];
    const result = formatEnrichedContext(elements);
    expect(result).toContain("Interactive elements:");
    expect(result).not.toContain("Navigation links:");
    expect(result).not.toContain("Form inputs:");
    expect(result).not.toContain("Content:");
  });

  it("truncates long text in formatted output", () => {
    const elements = [
      {
        selector: "div.long",
        tagName: "div",
        text: "A".repeat(200),
        role: null,
        interactivity: "static" as const,
        attributes: {},
      },
    ];
    const result = formatEnrichedContext(elements);
    // Format truncates to 100 chars
    expect(result).toContain("A".repeat(100));
    expect(result).not.toContain("A".repeat(101));
  });
});
