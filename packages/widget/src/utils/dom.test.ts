// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createNode, cx } from "./dom";

describe("createNode", () => {
  it("applies className, text, attributes, and inline styles", () => {
    const el = createNode("button", {
      className: "persona-foo persona-bar",
      text: "Send",
      attrs: { type: "submit", "data-persona-composer-submit": "" },
      style: { display: "none", zIndex: "5" },
    });

    expect(el.tagName).toBe("BUTTON");
    expect(el.className).toBe("persona-foo persona-bar");
    expect(el.textContent).toBe("Send");
    expect(el.getAttribute("type")).toBe("submit");
    expect(el.getAttribute("data-persona-composer-submit")).toBe("");
    expect(el.style.display).toBe("none");
    expect(el.style.zIndex).toBe("5");
  });

  it("appends node and string children in order, skipping nullish values", () => {
    const child = createNode("span", { text: "child" });
    const parent = createNode("div", {}, child, "tail", null, undefined);

    expect(parent.childNodes.length).toBe(2);
    expect(parent.firstChild).toBe(child);
    expect(parent.lastChild?.textContent).toBe("tail");
  });

  it("defaults to a bare element when no options are provided", () => {
    const el = createNode("div");
    expect(el.tagName).toBe("DIV");
    expect(el.className).toBe("");
    expect(el.childNodes.length).toBe(0);
  });

  it("skips nullish style values so conditionals can be inlined", () => {
    const el = createNode("div", {
      style: { display: "none", color: undefined, width: "10px" },
    });
    expect(el.style.display).toBe("none");
    expect(el.style.width).toBe("10px");
    // An undefined value must not be written (no literal "undefined").
    expect(el.style.color).toBe("");
  });
});

describe("cx", () => {
  it("joins truthy fragments and drops falsy ones", () => {
    expect(cx("a", false, "b", null, undefined, "", "c")).toBe("a b c");
  });

  it("supports inline conditional classes", () => {
    const active = true;
    const disabled = false;
    expect(cx("base", active && "is-active", disabled && "is-disabled")).toBe(
      "base is-active"
    );
  });

  it("returns an empty string when every fragment is falsy", () => {
    expect(cx(false, null, undefined, "")).toBe("");
  });
});
