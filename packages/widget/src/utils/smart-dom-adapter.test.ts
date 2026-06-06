// Pure mapper test — no DOM, no installed/vendored library at runtime (types only).
import { describe, it, expect } from "vitest";
import { smartDomResultToEnriched } from "./smart-dom-adapter";
import { formatEnrichedContext } from "./dom-context";
import type {
  SmartDOMResult,
  ExtractedElement,
  ElementSelector
} from "../vendor/smart-dom-reader";

function makeSelector(partial: Partial<ElementSelector> = {}): ElementSelector {
  return { css: "div", xpath: "/html/body/div", ...partial };
}

function makeEl(partial: Partial<ExtractedElement> = {}): ExtractedElement {
  return {
    tag: partial.tag ?? "div",
    text: partial.text ?? "",
    selector: partial.selector ?? makeSelector(),
    attributes: partial.attributes ?? {},
    context: {
      parentChain: [],
      ...(partial.context ?? {})
    },
    interaction: partial.interaction ?? {},
    children: partial.children
  };
}

function makeResult(
  interactive: Partial<SmartDOMResult["interactive"]> = {},
  semantic?: SmartDOMResult["semantic"]
): SmartDOMResult {
  return {
    mode: semantic ? "full" : "interactive",
    timestamp: 0,
    page: {
      url: "https://example.com",
      title: "Example",
      hasErrors: false,
      isLoading: false,
      hasModals: false
    },
    landmarks: {
      navigation: [],
      main: [],
      forms: [],
      headers: [],
      footers: [],
      articles: [],
      sections: []
    },
    interactive: {
      buttons: [],
      links: [],
      inputs: [],
      forms: [],
      clickable: [],
      ...interactive
    },
    semantic
  };
}

describe("smartDomResultToEnriched", () => {
  it("prefers the highest-scoring plain-CSS candidate and skips XPath/text", () => {
    const result = makeResult({
      buttons: [
        makeEl({
          tag: "button",
          text: "Add to cart",
          interaction: { click: true },
          selector: makeSelector({
            css: "button.add",
            xpath: "/html/body/button[1]",
            candidates: [
              { type: "xpath", value: "/html/body/button[1]", score: 100 },
              { type: "text", value: "text=Add to cart", score: 90 },
              { type: "data-testid", value: '[data-testid="add"]', score: 80 },
              { type: "class-path", value: "button.add", score: 50 }
            ]
          })
        })
      ]
    });

    const enriched = smartDomResultToEnriched(result);
    expect(enriched).toHaveLength(1);
    // best plain-CSS candidate by score (data-testid:80 > class-path:50; xpath/text skipped)
    expect(enriched[0].selector).toBe('[data-testid="add"]');
    expect(enriched[0].interactivity).toBe("clickable");
  });

  it("falls back to selector.css when no candidates qualify", () => {
    const result = makeResult({
      buttons: [
        makeEl({
          tag: "button",
          text: "Go",
          interaction: { click: true },
          selector: makeSelector({ css: "button.go", candidates: [] })
        })
      ]
    });
    const enriched = smartDomResultToEnriched(result);
    expect(enriched[0].selector).toBe("button.go");
  });

  it("classifies interactivity from tag/role/interaction", () => {
    const result = makeResult({
      buttons: [
        makeEl({
          tag: "button",
          text: "Buy",
          interaction: { click: true },
          selector: makeSelector({ css: "button.buy" })
        })
      ],
      links: [
        makeEl({
          tag: "a",
          text: "Home",
          attributes: { href: "/home" },
          interaction: { nav: true },
          selector: makeSelector({ css: "a.home" })
        })
      ],
      inputs: [
        makeEl({
          tag: "input",
          attributes: { type: "text", name: "q" },
          interaction: { change: true },
          selector: makeSelector({ css: "input.q" })
        })
      ]
    });

    const enriched = smartDomResultToEnriched(result);
    const bySel = Object.fromEntries(enriched.map((e) => [e.selector, e]));
    expect(bySel["button.buy"].interactivity).toBe("clickable");
    expect(bySel["a.home"].interactivity).toBe("navigable");
    expect(bySel["input.q"].interactivity).toBe("input");
  });

  it("excludes elements under the host (.persona-host) via parentChain", () => {
    const result = makeResult({
      buttons: [
        makeEl({
          tag: "button",
          text: "Widget send",
          interaction: { click: true },
          selector: makeSelector({ css: "button.send" }),
          context: { parentChain: ["div.persona-host", "div.panel"] }
        }),
        makeEl({
          tag: "button",
          text: "Page button",
          interaction: { click: true },
          selector: makeSelector({ css: "button.page" }),
          context: { parentChain: ["main", "section"] }
        })
      ]
    });

    const enriched = smartDomResultToEnriched(result);
    expect(enriched.map((e) => e.selector)).toEqual(["button.page"]);
  });

  it("includes semantic elements only when present and not disabled", () => {
    const semantic: SmartDOMResult["semantic"] = {
      headings: [
        makeEl({
          tag: "h1",
          text: "Title",
          selector: makeSelector({ css: "h1.title" })
        })
      ],
      images: [],
      tables: [],
      lists: [],
      articles: []
    };
    const result = makeResult(
      {
        buttons: [
          makeEl({
            tag: "button",
            text: "Go",
            interaction: { click: true },
            selector: makeSelector({ css: "button.go" })
          })
        ]
      },
      semantic
    );

    const withSemantic = smartDomResultToEnriched(result);
    expect(withSemantic.map((e) => e.selector)).toContain("h1.title");
    const heading = withSemantic.find((e) => e.selector === "h1.title");
    expect(heading?.interactivity).toBe("static");

    const withoutSemantic = smartDomResultToEnriched(result, {
      includeSemantic: false
    });
    expect(withoutSemantic.map((e) => e.selector)).not.toContain("h1.title");
  });

  it("deduplicates by selector and honors maxElements", () => {
    const dup = makeEl({
      tag: "button",
      text: "Dup",
      interaction: { click: true },
      selector: makeSelector({ css: "button.dup" })
    });
    const result = makeResult({
      buttons: [dup, dup],
      clickable: [dup]
    });
    expect(smartDomResultToEnriched(result)).toHaveLength(1);

    const many = makeResult({
      buttons: [
        makeEl({ tag: "button", text: "1", interaction: { click: true }, selector: makeSelector({ css: "button.a" }) }),
        makeEl({ tag: "button", text: "2", interaction: { click: true }, selector: makeSelector({ css: "button.b" }) }),
        makeEl({ tag: "button", text: "3", interaction: { click: true }, selector: makeSelector({ css: "button.c" }) })
      ]
    });
    expect(smartDomResultToEnriched(many, { maxElements: 2 })).toHaveLength(2);
  });

  it("produces output that feeds formatEnrichedContext", () => {
    const result = makeResult({
      buttons: [
        makeEl({
          tag: "button",
          text: "Checkout",
          interaction: { click: true },
          selector: makeSelector({ css: "button.checkout" })
        })
      ],
      links: [
        makeEl({
          tag: "a",
          text: "Cart",
          attributes: { href: "/cart" },
          interaction: { nav: true },
          selector: makeSelector({ css: "a.cart" })
        })
      ]
    });

    const formatted = formatEnrichedContext(smartDomResultToEnriched(result));
    expect(formatted).toContain("button.checkout");
    expect(formatted).toContain("a.cart");
    expect(formatted).toContain("Checkout");
  });
});
