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

  describe("data-tool-elapsed (live duration counter)", () => {
    it("preserves the live span's timer-owned text while the same tool is active", () => {
      // The 100ms global timer wrote "0.3s"; a re-render arrives carrying the
      // render-time value "<0.1s". Morphing it in would make the boundary
      // flicker, so the still-live span (same startedAt) must be left alone.
      const container = makeContainer(
        '<span data-tool-elapsed="1000">0.3s</span>'
      );
      const oldSpan = container.querySelector("span")!;

      morphMessages(
        container,
        makeNewContent('<span data-tool-elapsed="1000">&lt;0.1s</span>')
      );

      expect(container.querySelector("span")).toBe(oldSpan);
      expect(container.querySelector("span")!.textContent).toBe("0.3s");
    });

    it("allows morph to the final static duration once the tool completes", () => {
      const container = makeContainer(
        '<span data-tool-elapsed="1000">0.7s</span>'
      );

      morphMessages(container, makeNewContent("<span>0.8s</span>"));

      const span = container.querySelector("span")!;
      expect(span.textContent).toBe("0.8s");
      expect(span.hasAttribute("data-tool-elapsed")).toBe(false);
    });

    it("allows morph when the slot is reused by a different tool (startedAt changed)", () => {
      const container = makeContainer(
        '<span data-tool-elapsed="1000">0.5s</span>'
      );

      morphMessages(
        container,
        makeNewContent('<span data-tool-elapsed="2000">&lt;0.1s</span>')
      );

      const span = container.querySelector("span")!;
      expect(span.getAttribute("data-tool-elapsed")).toBe("2000");
      expect(span.textContent).toBe("<0.1s");
    });
  });
});
