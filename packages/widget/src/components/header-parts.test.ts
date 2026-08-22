// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  createCloseButton,
  createClearChatButton,
  createHeaderIconButton,
  HEADER_CONTROL_CLASS,
  HEADER_CONTROL_GLYPH_CLASS,
  HEADER_CONTROL_SPARSE_CLASS,
} from "./header-parts";
import { HEADER_THEME_CSS } from "./header-builder";
import type { AgentWidgetConfig } from "../types";

const baseConfig: AgentWidgetConfig = { apiUrl: "/api" };

describe("createHeaderIconButton", () => {
  it("leaves the box and glyph to the tokens when nothing is configured", () => {
    const { button } = createHeaderIconButton({
      ariaLabel: "Do it",
      iconName: "refresh-cw",
    });
    expect(button.classList.contains(HEADER_CONTROL_CLASS)).toBe(true);
    expect(button.classList.contains(HEADER_CONTROL_GLYPH_CLASS)).toBe(true);
    expect(button.classList.contains(HEADER_CONTROL_SPARSE_CLASS)).toBe(false);
    expect(button.style.width).toBe("");
    expect(button.style.height).toBe("");
    expect(button.style.minWidth).toBe("");
    expect(button.type).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("Do it");
    expect(button.style.color).toBe(HEADER_THEME_CSS.actionIconColor);
  });

  it("writes an inline box and drops the glyph class for explicit sizes", () => {
    const { button } = createHeaderIconButton({
      ariaLabel: "Do it",
      iconName: "refresh-cw",
      size: "16px",
      iconSize: "14px",
    });
    expect(button.classList.contains(HEADER_CONTROL_CLASS)).toBe(true);
    expect(button.classList.contains(HEADER_CONTROL_GLYPH_CLASS)).toBe(false);
    expect(button.style.width).toBe("16px");
    expect(button.style.minHeight).toBe("16px");
    const svg = button.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("14px");
    expect(svg.getAttribute("stroke-width")).toBe("1.5");
    expect(svg.style.strokeWidth).toBe(
      "calc(var(--persona-components-header-controlStrokeWidth, 1.5) * 1)"
    );
  });

  it("routes the stroke token inline for explicitly sized glyphs", () => {
    const { button } = createHeaderIconButton({
      ariaLabel: "Close",
      iconName: "x",
      iconSize: "12px",
    });
    // No class hooks, so the stylesheet rules can't reach this control: the
    // inline style carries the stroke token, with the attribute as the
    // no-token fallback and the sparse 0.7 factor preserved.
    expect(button.classList.contains(HEADER_CONTROL_GLYPH_CLASS)).toBe(false);
    expect(button.classList.contains(HEADER_CONTROL_SPARSE_CLASS)).toBe(false);
    const svg = button.querySelector("svg")!;
    expect(svg.getAttribute("stroke-width")).toBe("1.05");
    expect(svg.style.strokeWidth).toBe(
      "calc(var(--persona-components-header-controlStrokeWidth, 1.5) * 0.7)"
    );
  });

  it("compensates the sparse X glyph in both the class hook and the attributes", () => {
    const token = createHeaderIconButton({ ariaLabel: "Close", iconName: "x" });
    expect(token.button.classList.contains(HEADER_CONTROL_SPARSE_CLASS)).toBe(true);

    const explicit = createHeaderIconButton({
      ariaLabel: "Close",
      iconName: "x",
      iconSize: "10px",
    });
    // Nominal 10px scaled by 1.4, stroke thinned by the same factor so the
    // rendered weight still matches a dense sibling glyph.
    const svg = explicit.button.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("14px");
    expect(svg.getAttribute("stroke-width")).toBe("1.05");
    expect(explicit.button.classList.contains(HEADER_CONTROL_SPARSE_CLASS)).toBe(false);
  });

  it("swaps the transparent default classes for an explicit background", () => {
    const { button } = createHeaderIconButton({
      ariaLabel: "Do it",
      iconName: "refresh-cw",
      backgroundColor: "rgb(1, 2, 3)",
      color: "rgb(9, 9, 9)",
    });
    expect(button.className).not.toContain("persona-bg-transparent");
    expect(button.className).not.toContain("hover:persona-bg-gray-100");
    expect(button.style.backgroundColor).toBe("rgb(1, 2, 3)");
    expect(button.style.color).toBe("rgb(9, 9, 9)");
  });

  it("falls back to the text glyph when the icon is not in the registry", () => {
    const { button } = createHeaderIconButton({
      ariaLabel: "Close",
      iconName: "not-a-real-icon",
      iconText: "×",
    });
    expect(button.querySelector("svg")).toBeNull();
    expect(button.textContent).toBe("×");
  });

  it("wraps the button in a flex box so it can never ride off-center", () => {
    const { button, wrapper } = createHeaderIconButton({
      ariaLabel: "Do it",
      iconName: "refresh-cw",
    });
    expect(button.parentElement).toBe(wrapper);
    expect(wrapper.className).toContain("persona-inline-flex");
    expect(wrapper.className).toContain("persona-items-center");
    expect(wrapper.className).toContain("persona-justify-center");
  });

  it("attaches the styled tooltip by default, reading the live aria-label", () => {
    const { button, wrapper } = createHeaderIconButton({
      ariaLabel: "Messages",
      iconName: "history",
    });
    document.body.appendChild(wrapper);
    button.setAttribute("aria-label", "Opening conversation");
    wrapper.dispatchEvent(new MouseEvent("mouseenter"));
    const tooltip = document.body.querySelector(".persona-control-tooltip");
    expect(tooltip).not.toBeNull();
    expect(tooltip!.textContent).toContain("Opening conversation");
    wrapper.remove();
    tooltip!.remove();
  });

  it("attaches no tooltip when tooltip is false", () => {
    const { wrapper } = createHeaderIconButton({
      ariaLabel: "Silent",
      iconName: "x",
      tooltip: false,
    });
    document.body.appendChild(wrapper);
    wrapper.dispatchEvent(new MouseEvent("mouseenter"));
    expect(document.body.querySelector(".persona-control-tooltip")).toBeNull();
    wrapper.remove();
  });
});

describe("createCloseButton", () => {
  it("keeps the default utility classes when no style overrides are set", () => {
    const { button } = createCloseButton(baseConfig, {});
    expect(button.tagName).toBe("BUTTON");
    expect(button.type).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("Close chat");
    expect(button.classList.contains("persona-rounded-full")).toBe(true);
    expect(button.classList.contains("persona-border-none")).toBe(true);
    expect(button.classList.contains("hover:persona-bg-gray-100")).toBe(true);
    // Unset `launcher.closeButtonSize` leaves the control-size token in charge.
    expect(button.classList.contains(HEADER_CONTROL_CLASS)).toBe(true);
    expect(button.style.width).toBe("");
  });

  it("still lets launcher.closeButtonSize pin the box past the token", () => {
    const { button } = createCloseButton(
      { ...baseConfig, launcher: { closeButtonSize: "28px" } },
      {}
    );
    expect(button.style.width).toBe("28px");
    expect(button.style.minWidth).toBe("28px");
  });

  it("hides the button when showClose is false", () => {
    const { button } = createCloseButton(baseConfig, { showClose: false });
    expect(button.style.display).toBe("none");
  });

  it("drops each default class and sets the inline style for the matching override", () => {
    const { button } = createCloseButton(
      {
        ...baseConfig,
        launcher: {
          closeButtonBackgroundColor: "rgb(1, 2, 3)",
          closeButtonBorderRadius: "4px",
          closeButtonBorderWidth: "2px",
          closeButtonBorderColor: "rgb(4, 5, 6)",
        },
      },
      {}
    );
    expect(button.classList.contains("hover:persona-bg-gray-100")).toBe(false);
    expect(button.style.backgroundColor).toBe("rgb(1, 2, 3)");
    expect(button.classList.contains("persona-rounded-full")).toBe(false);
    expect(button.style.borderRadius).toBe("4px");
    expect(button.classList.contains("persona-border-none")).toBe(false);
    expect(button.style.borderWidth).toBe("2px");
    expect(button.style.borderStyle).toBe("solid");
  });

  it("defaults border width to 0px when only border color is provided", () => {
    const { button } = createCloseButton(
      { ...baseConfig, launcher: { closeButtonBorderColor: "rgb(7, 8, 9)" } },
      {}
    );
    expect(button.classList.contains("persona-border-none")).toBe(false);
    expect(button.style.borderWidth).toBe("0px");
    expect(button.style.borderStyle).toBe("solid");
  });
});

describe("createClearChatButton", () => {
  it("keeps the default utility classes when no style overrides are set", () => {
    const { button } = createClearChatButton(baseConfig, {});
    expect(button.type).toBe("button");
    expect(button.classList.contains("persona-rounded-full")).toBe(true);
    expect(button.classList.contains("persona-border-none")).toBe(true);
    expect(button.classList.contains("hover:persona-bg-gray-100")).toBe(true);
  });

  it("drops each default class and sets the inline style for the matching override", () => {
    const { button } = createClearChatButton(
      {
        ...baseConfig,
        launcher: {
          clearChat: {
            backgroundColor: "rgb(1, 2, 3)",
            borderRadius: "4px",
            borderWidth: "2px",
            borderColor: "rgb(4, 5, 6)",
          },
        },
      },
      {}
    );
    expect(button.classList.contains("hover:persona-bg-gray-100")).toBe(false);
    expect(button.style.backgroundColor).toBe("rgb(1, 2, 3)");
    expect(button.classList.contains("persona-rounded-full")).toBe(false);
    expect(button.style.borderRadius).toBe("4px");
    expect(button.classList.contains("persona-border-none")).toBe(false);
    expect(button.style.borderWidth).toBe("2px");
    expect(button.style.borderStyle).toBe("solid");
  });
});
