// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { buildComposer } from "./composer-builder";
import type { AgentWidgetConfig } from "../types";

describe("buildComposer (full column-stacked composer)", () => {
  it("returns the full ComposerElements shape with stable selectors", () => {
    const config: AgentWidgetConfig = {
      apiUrl: "/api",
      voiceRecognition: { enabled: true, provider: { type: "runtype" } },
      attachments: { enabled: true },
    };
    const elements = buildComposer({ config });

    expect(elements.footer.classList.contains("persona-widget-footer")).toBe(true);
    expect(elements.composerForm.tagName).toBe("FORM");
    expect(elements.composerForm.getAttribute("data-persona-composer-form")).toBe("");
    expect(elements.composerForm.classList.contains("persona-flex-col")).toBe(true);

    expect(elements.textarea.getAttribute("data-persona-composer-input")).toBe("");
    expect(elements.sendButton.getAttribute("data-persona-composer-submit")).toBe("");
    expect(elements.statusText.getAttribute("data-persona-composer-status")).toBe("");

    expect(elements.attachmentButton).not.toBeNull();
    expect(elements.attachmentInput).not.toBeNull();
    expect(elements.attachmentPreviewsContainer).not.toBeNull();
    expect(elements.micButton).not.toBeNull();

    expect(elements.actionsRow.classList.contains("persona-widget-composer__actions")).toBe(true);
    expect(elements.leftActions.classList.contains("persona-widget-composer__left-actions")).toBe(true);
    expect(elements.rightActions.classList.contains("persona-widget-composer__right-actions")).toBe(true);

    expect(typeof elements.setSendButtonMode).toBe("function");
  });

  it("returns null for optional controls when their features are disabled", () => {
    const elements = buildComposer({ config: { apiUrl: "/api" } });
    expect(elements.micButton).toBeNull();
    expect(elements.micButtonWrapper).toBeNull();
    expect(elements.attachmentButton).toBeNull();
    expect(elements.attachmentInput).toBeNull();
    expect(elements.attachmentPreviewsContainer).toBeNull();
  });

  it("attaches the suggestions row, composer form, and status text to the footer in order", () => {
    const elements = buildComposer({ config: { apiUrl: "/api" } });
    expect(elements.footer.children[0]).toBe(elements.suggestions);
    expect(elements.footer.children[1]).toBe(elements.composerForm);
    expect(elements.footer.children[2]).toBe(elements.statusText);
  });
});
