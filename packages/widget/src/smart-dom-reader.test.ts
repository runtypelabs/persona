// @vitest-environment jsdom
//
// End-to-end smoke test for the optional smart-dom-reader entry, exercising the
// vendored library under jsdom. The pure-mapper correctness guarantee lives in
// utils/smart-dom-adapter.test.ts (no DOM, no library); this test confirms the
// vendored runtime loads and the provider wires up against a real document.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  collectSmartDomContext,
  createSmartDomReaderContextProvider
} from "./smart-dom-reader";

// jsdom implements no layout, so getBoundingClientRect()/offsetParent report the
// element as zero-size and the library's visibility filter would drop everything.
// includeHidden bypasses that filter so we can exercise real extraction under jsdom.
const JSDOM_OPTS = { extractionOptions: { includeHidden: true } } as const;

// This vitest jsdom environment doesn't expose CSS.escape (real browsers do). The
// vendored library calls it unguarded during selector generation, so shim it with the
// same fallback dom-context.ts uses.
function ensureCssEscape(): void {
  const g = globalThis as unknown as { CSS?: { escape?: (s: string) => string } };
  if (!g.CSS) g.CSS = {};
  if (typeof g.CSS.escape !== "function") {
    g.CSS.escape = (str: string) => str.replace(/([^\w-])/g, "\\$1");
  }
}

describe("smart-dom-reader entry (jsdom)", () => {
  beforeEach(() => {
    ensureCssEscape();
    document.body.innerHTML = "";
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("collects interactive elements from the light DOM", () => {
    document.body.innerHTML = `
      <main>
        <button id="checkout">Checkout</button>
        <a href="/cart">View cart</a>
        <input type="text" name="q" />
      </main>
    `;

    const elements = collectSmartDomContext(JSDOM_OPTS);
    const selectors = elements.map((e) => e.selector).join(" ");
    // At minimum the button and link should be discovered and actionable.
    expect(elements.length).toBeGreaterThan(0);
    expect(selectors).toMatch(/checkout|Checkout/i);
  });

  it("pierces shadow DOM (full mode), surfacing elements the default TreeWalker reader misses", () => {
    // The library pierces shadow roots in full mode, attaching shadow descendants as
    // children of a semantic-container host; the adapter flattens those children. The
    // default dom-context.ts TreeWalker cannot reach into shadow trees at all.
    const host = document.createElement("article");
    host.id = "wc-host";
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<button id="shadow-btn">Shadow action</button>`;

    const elements = collectSmartDomContext({
      mode: "full",
      extractionOptions: { includeHidden: true }
    });
    const texts = elements.map((e) => e.text).join(" | ");
    expect(texts).toContain("Shadow action");
  });

  it("excludes the widget host (.persona-host) from results", () => {
    document.body.innerHTML = `
      <div class="persona-host"><button id="widget-internal">Send</button></div>
      <main><button id="page-cta">Buy now</button></main>
    `;

    const elements = collectSmartDomContext(JSDOM_OPTS);
    const selectors = elements.map((e) => e.selector);
    expect(selectors.some((s) => s.includes("persona-host"))).toBe(false);
    expect(elements.some((e) => e.text === "Buy now")).toBe(true);
    expect(elements.some((e) => e.text === "Send")).toBe(false);
  });

  it("scopes extraction to `root`, ignoring elements outside the subtree", () => {
    document.body.innerHTML = `
      <nav><button id="chrome-cta">Sign up</button></nav>
      <main id="content"><button id="page-cta">Buy now</button></main>
    `;
    const root = document.getElementById("content")!;

    const elements = collectSmartDomContext({
      root,
      extractionOptions: { includeHidden: true }
    });
    expect(elements.some((e) => e.text === "Buy now")).toBe(true);
    expect(elements.some((e) => e.text === "Sign up")).toBe(false);
  });

  it("pierces shadow DOM within a scoped `root`", () => {
    const host = document.createElement("article");
    host.id = "scoped-host";
    const main = document.createElement("main");
    main.id = "scoped-content";
    main.appendChild(host);
    document.body.appendChild(main);
    host.attachShadow({ mode: "open" }).innerHTML =
      `<button id="scoped-shadow-btn">Scoped shadow action</button>`;

    const elements = collectSmartDomContext({
      root: main,
      mode: "full",
      extractionOptions: { includeHidden: true }
    });
    const texts = elements.map((e) => e.text).join(" | ");
    expect(texts).toContain("Scoped shadow action");
  });

  it("provider returns formatted context under the configured key", async () => {
    document.body.innerHTML = `<main><button id="go">Continue</button></main>`;
    const provider = createSmartDomReaderContextProvider({
      contextKey: "pageContext",
      ...JSDOM_OPTS
    });
    const result = await provider({ messages: [], config: {} as never });
    expect(result).toBeTruthy();
    expect(typeof (result as Record<string, unknown>).pageContext).toBe("string");
    expect((result as Record<string, string>).pageContext).toContain("Continue");
  });

  it("returns [] for an empty document", () => {
    document.body.innerHTML = "";
    expect(collectSmartDomContext(JSDOM_OPTS)).toEqual([]);
  });
});
