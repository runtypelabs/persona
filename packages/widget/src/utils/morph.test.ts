// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { morphMessages } from "./morph";

function makeContainer(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

function makeNewContent(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

describe("morphMessages", () => {
  describe("data-preserve-animation", () => {
    it("preserves animated element when old and new both have data-preserve-animation with same text", () => {
      const container = makeContainer(
        '<span data-preserve-animation="true">Calling tool... 0.1s</span>'
      );
      const oldSpan = container.querySelector("span")!;

      morphMessages(
        container,
        makeNewContent(
          '<span data-preserve-animation="true">Calling tool... 0.1s</span>'
        )
      );

      expect(container.querySelector("span")).toBe(oldSpan);
    });

    it("allows morph when new node drops data-preserve-animation (tool completed)", () => {
      const container = makeContainer(
        '<span data-preserve-animation="true">Calling tool... 0.5s</span>'
      );

      morphMessages(
        container,
        makeNewContent("<span>Finished tool 0.5s</span>")
      );

      expect(container.querySelector("span")!.textContent).toBe(
        "Finished tool 0.5s"
      );
      expect(
        container.querySelector("span")!.hasAttribute("data-preserve-animation")
      ).toBe(false);
    });

    it("allows morph when text content changes despite both having data-preserve-animation", () => {
      const container = makeContainer(
        '<span data-preserve-animation="true">Calling tool... 0.1s</span>'
      );

      morphMessages(
        container,
        makeNewContent(
          '<span data-preserve-animation="true">Calling UCP Search Catalog... 0.2s</span>'
        )
      );

      expect(container.querySelector("span")!.textContent).toBe(
        "Calling UCP Search Catalog... 0.2s"
      );
    });

    it("does not preserve when preserveTypingAnimation is false", () => {
      const container = makeContainer(
        '<span data-preserve-animation="true">Old text</span>'
      );

      morphMessages(
        container,
        makeNewContent(
          '<span data-preserve-animation="true">New text</span>'
        ),
        { preserveTypingAnimation: false }
      );

      expect(container.querySelector("span")!.textContent).toBe("New text");
    });
  });
});
