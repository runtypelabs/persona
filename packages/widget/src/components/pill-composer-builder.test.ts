// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { buildPillComposer } from "./pill-composer-builder";
import type { AgentWidgetConfig } from "../types";

describe("buildPillComposer (single-row pill composer)", () => {
  it("returns a footer wrapping the pill form, with stable selectors preserved", () => {
    const config: AgentWidgetConfig = {
      apiUrl: "/api",
      attachments: { enabled: true },
      voiceRecognition: { enabled: true, provider: { type: "runtype" } },
    };
    const elements = buildPillComposer({ config });

    expect(elements.footer.classList.contains("persona-widget-footer--pill")).toBe(true);
    expect(elements.composerForm.classList.contains("persona-pill-composer")).toBe(true);
    expect(elements.composerForm.classList.contains("persona-widget-composer")).toBe(true);
    // Crucial: the pill form does NOT carry the column-stack utility classes
    // that fight CSS layout rules.
    expect(elements.composerForm.classList.contains("persona-flex-col")).toBe(false);
    expect(elements.composerForm.classList.contains("persona-rounded-2xl")).toBe(false);

    expect(elements.composerForm.getAttribute("data-persona-composer-form")).toBe("");
    expect(elements.textarea.getAttribute("data-persona-composer-input")).toBe("");
    expect(elements.sendButton.getAttribute("data-persona-composer-submit")).toBe("");
  });

  it("keeps suggestions available above the pill and hides status text", () => {
    const elements = buildPillComposer({ config: { apiUrl: "/api" } });
    const footerChildren = Array.from(elements.footer.children);
    expect(elements.suggestions.style.display).toBe("");
    expect(footerChildren.indexOf(elements.suggestions)).toBeLessThan(
      footerChildren.indexOf(elements.composerForm)
    );
    expect(elements.statusText.style.display).toBe("none");
  });

  it("renders the paperclip in the leftActions cell when attachments are enabled", () => {
    const elements = buildPillComposer({
      config: { apiUrl: "/api", attachments: { enabled: true } },
    });
    expect(elements.attachmentButton).not.toBeNull();
    expect(elements.leftActions.contains(elements.attachmentButtonWrapper!)).toBe(true);
  });

  it("renders the mic in the rightActions cell when voice is enabled", () => {
    const elements = buildPillComposer({
      config: {
        apiUrl: "/api",
        voiceRecognition: { enabled: true, provider: { type: "runtype" } },
      },
    });
    expect(elements.micButton).not.toBeNull();
    expect(elements.rightActions.contains(elements.micButtonWrapper!)).toBe(true);
  });

  it("places the previews container ABOVE the pill, inside the header region", () => {
    const elements = buildPillComposer({
      config: { apiUrl: "/api", attachments: { enabled: true } },
    });
    const footerChildren = Array.from(elements.footer.children);
    expect(footerChildren.indexOf(elements.header)).toBeLessThan(
      footerChildren.indexOf(elements.composerForm)
    );
    expect(elements.header.contains(elements.attachmentPreviewsContainer!)).toBe(
      true
    );
    // `display: contents`, so an empty header adds no row to the footer stack.
    expect(elements.header.style.display).toBe("contents");
    expect(elements.attachmentPreviewsContainer!.classList.contains("persona-pill-composer__previews")).toBe(true);
  });

  it("forms a 3-cell layout: leftActions · textarea · rightActions inside the form", () => {
    const elements = buildPillComposer({
      config: { apiUrl: "/api", attachments: { enabled: true } },
    });
    // After the (hidden) file input, the next three children are the grid cells.
    const formChildren = Array.from(elements.composerForm.children).filter(
      (c) => (c as HTMLElement).tagName !== "INPUT"
    );
    expect(formChildren[0]).toBe(elements.leftActions);
    expect(formChildren[1]).toBe(elements.textarea);
    expect(formChildren[2]).toBe(elements.rightActions);
  });

  it("caps growth at 5 lines, re-derived from the themed line height", () => {
    const elements = buildPillComposer({ config: { apiUrl: "/api" } });
    // 5 lines at the 20px fallback, before the element can be measured.
    expect(elements.textarea.style.maxHeight).toBe("100px");

    // A themed line height re-derives the cap: the pill is line-based now, not
    // a hardcoded 100px.
    elements.textarea.style.lineHeight = "24px";
    document.body.appendChild(elements.textarea);
    Object.defineProperty(elements.textarea, "scrollHeight", {
      configurable: true,
      value: 10000,
    });
    elements.textarea.dispatchEvent(new Event("input"));
    expect(elements.textarea.style.maxHeight).toBe("120px");
    expect(elements.textarea.style.height).toBe("120px");
    document.body.removeChild(elements.textarea);
  });

  it("honors composer.maxLines in the pill", () => {
    const elements = buildPillComposer({
      config: { apiUrl: "/api", composer: { maxLines: 2 } },
    });
    expect(elements.textarea.style.maxHeight).toBe("40px");
  });

  it("returns null for optional controls when disabled (matching ComposerElements contract)", () => {
    const elements = buildPillComposer({ config: { apiUrl: "/api" } });
    expect(elements.attachmentButton).toBeNull();
    expect(elements.attachmentInput).toBeNull();
    expect(elements.attachmentPreviewsContainer).toBeNull();
    expect(elements.micButton).toBeNull();
  });
});
